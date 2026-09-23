//! ウィンドウ生成と、位置・サイズの復元（F-CONF-10）。
//!
//! ウィンドウを `tauri.conf.json` の宣言ではなくコードで生成するのは、`initialization_script` に CLI 引数から作った bootstrap を載せる必要があるためである（02.architecture/05-startup-sequence.md §1）。
//! 宣言的なウィンドウでは注入するタイミングがない。
//!
//! この構造は復元にも有効である。
//! 位置とサイズを `WebviewWindowBuilder` に直接渡せるため、既定位置に表示してから復元先へ移動する際のちらつきが発生しない。
//! `visible: false` から本文ごと表示する設計（04.tech-stack/09-tauri-config.md §1）とも整合する。
//!
//! タイトルバーは自前で描く（03.ux-spec/01-screen-layout.md §1）。
//! `decorations(false)` にして、`─ □ ✕` もファイル名も Svelte 側が描く。
//! OS 標準のタイトルバーとタブが二段になることを避け、縦 30px を本文に割り当てるためである。
//!
//! Windows で何が失われるかは、tao の実装を読んで確認してある（tao 0.35.3）。
//! リサイズ縁は失われない（`to_window_styles()` は装飾の有無に関わらず `WS_SIZEBOX` を付け、縁の当たり判定は tao が `WM_NCHITTEST` で自前に返す）。
//! `Win+←` / Aero Snap も失われない（同上。`WS_MAXIMIZEBOX` も残るため、シェルから見ると通常のウィンドウと同じ扱いになる）。
//! 最大化時の矩形も壊れない（tao が `WM_NCCALCSIZE` でモニタの作業領域に切り詰めるため、borderless でよくある「タスクバーを覆う / 画面からはみ出す」という問題が起きない）。
//! 影と角丸だけは `shadow(true)` が必要になる（下で明示している。これが無いと影も Windows 11 の角丸も表示されなくなる）。
//!
//! 自分たちで実装しなおす必要があるのは、ドラッグ・ダブルクリック・ウィンドウ操作ボタン・Snap Layouts の 4 つだけである。
//! 前の 2 つは Tauri 本体が注入する `data-tauri-drag-region` の処理が担い、残りはフロントと `snap_layouts.rs` が担う。

use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::bootstrap::Bootstrap;
use crate::store::WindowState;

/// メインウィンドウのラベル。イベントの宛先指定とウィンドウの取得に使う。
pub const MAIN_LABEL: &str = "main";

/// ウィンドウが見えないままになる上限（04.tech-stack/09-tauri-config.md §1）。
/// これを超えたら本文が未完成でも表示する。「起動失敗に見える」ほうが害が大きい。
pub const SHOW_FALLBACK_MS: u64 = 400;

/// 復元する状態が無いときのウィンドウサイズ（論理 px）。
pub const DEFAULT_WIDTH: f64 = 1000.0;
pub const DEFAULT_HEIGHT: f64 = 720.0;

/// 復元位置を採用するために、いずれかのモニタと重なっていてほしい最小の面積（論理 px）。
///
/// タイトルバーをドラッグできない位置に復元されると、ユーザーはウィンドウを動かせなくなる。
/// ディスプレイ構成が変わった後の起動で最も起きやすい。
const MIN_VISIBLE: f64 = 80.0;

/// ウィンドウを生成する。`visible: false` の状態で返る。
///
/// 表示するのは `ready` コマンド、または [`SHOW_FALLBACK_MS`] 経過後のフォールバックである。
/// `restore` がモニタ外を指している場合は破棄し、中央に既定サイズで生成する。
pub fn create(
    app: &tauri::AppHandle,
    label: &str,
    bootstrap: &Bootstrap,
    restore: Option<WindowState>,
) -> tauri::Result<WebviewWindow> {
    let script = crate::bootstrap::to_init_script(bootstrap);

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("Marxdown")
        .min_inner_size(480.0, 360.0)
        .visible(false) // 描画準備が整うまで見せない
        // カスタムタイトルバー。失われるものと残るものはモジュール冒頭に記載。
        .decorations(false)
        // `decorations(false)` とセットでなければならない。
        // tao はこのフラグがあるときだけ `WM_NCCALCSIZE` で DWM のフレーム分を内側に残し、影と Windows 11 の角丸を有効にする。
        // 付けないと影の無い平らな矩形になり、アプリではなくオーバーレイのように見える。
        .shadow(true)
        // ドラッグ＆ドロップはネイティブのハンドラに任せる（F-OPEN-08）。
        //
        // `disable_drag_drop_handler()` を呼んで HTML5 のドロップイベントで扱うと、WebView の `DataTransfer` がファイルの絶対パスを渡さない。
        // パスが無いと最近開いたファイルにも記録できず、相対パスの画像も解決できない（F-VIEW-08 / N-SEC-05）。
        // Tauri のドラッグ＆ドロップイベントは実パスを渡す。
        .initialization_script(&script)
        // ナビゲーション禁止（N-SEC-04 / ADR-0006 の多層防御 Layer 2）。
        //
        // フロントはリンククリックをすべて `preventDefault()` するが、それは JS が期待どおり動作している場合に限られる。
        // ここで塞いでおくと、ハンドラの登録前・例外で停止した後・想定外の遷移経路のいずれでも、アプリのシェルが差し替わって復帰できなくなることがない。
        // 許可するのはアプリ自身のページだけで、同じオリジンでも別のパスは通さない。
        // `./other.md` のようなリンクを開いたときに、遷移先が 404 のシェルになるのではなく、そもそも遷移が発生しないようにする。
        .on_navigation(|url| {
            let own_host = matches!(
                url.host_str(),
                Some("tauri.localhost") | Some("localhost") | None
            );
            let own_page = matches!(url.path(), "" | "/" | "/index.html");

            if own_host && own_page {
                return true;
            }
            eprintln!("[marxdown] ナビゲーションを拒否: {url}");
            false
        });

    let restore = restore.filter(|s| is_on_some_monitor(app, s));
    // T2c: ウィンドウ状態の復元判定が終わった時点。
    // `available_monitors()` は OS への問い合わせで、環境によっては速くない。
    if let Some(state) = app.try_state::<crate::state::AppState>() {
        state.trace.mark("T2c", None);
    }

    match restore {
        Some(state) => {
            builder = builder
                .inner_size(state.width, state.height)
                .position(state.x, state.y)
                .maximized(state.maximized);
        }
        None => {
            builder = builder.inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT).center();
        }
    }

    let window = builder.build()?;

    // Chromium 既定のコンテキストメニューを抑止する（`webview.rs`）。
    // ウィンドウは `visible: false` で生成されるため、ここで設定しておけば表示されている間は一度も出ない。
    crate::webview::disable_default_context_menu(&window);

    spawn_show_fallback(app.clone(), label.to_string());
    Ok(window)
}

/// 復元しようとしている矩形が、現在つながっているモニタのどれかと十分に重なるか。
///
/// モニタの座標系は物理ピクセルである。
/// 論理ピクセルで保持している `WindowState`（`store.rs`）と比較する前に、モニタ側を論理ピクセルへ変換して揃える。
fn is_on_some_monitor(app: &tauri::AppHandle, state: &WindowState) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        // モニタ情報が取れないなら復元しない。中央に出るほうが安全。
        return false;
    };

    monitors.iter().any(|m| {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);

        let overlap_x = (state.x + state.width).min(pos.x + size.width) - state.x.max(pos.x);
        let overlap_y = (state.y + state.height).min(pos.y + size.height) - state.y.max(pos.y);

        overlap_x >= MIN_VISIBLE && overlap_y >= MIN_VISIBLE
    })
}

/// 現在のウィンドウ位置・サイズを、保存できる形（論理ピクセル）で取り出す。
///
/// 最大化中は最大化後の矩形が返る。
/// Tauri は最大化する前の矩形を公開していないため、復元時も最大化状態ごと再現する形になる。
/// 最大化を解除したときのサイズが前回セッションと変わりうるが、位置を見失うよりは害が小さい。
pub fn capture<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Option<WindowState> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);

    // 最小化中は位置が画面外の番兵値になる環境がある。保存すると次回復元に失敗するので破棄する。
    if window.is_minimized().unwrap_or(false) {
        return None;
    }

    Some(WindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
    })
}

/// 一定時間経っても `ready` が来なければ、こちらから表示する。
///
/// ポーリングではなく 1 回だけのタイマーであることが重要（05.performance-budget/04-targets.md §5「アイドル時のタイマーを増やさない」）。
fn spawn_show_fallback(app: tauri::AppHandle, label: String) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(SHOW_FALLBACK_MS));
        if let Some(w) = app.get_webview_window(&label) {
            if w.is_visible().unwrap_or(false) {
                return;
            }
            let _ = w.show();
            let _ = w.set_focus();
        }
    });
}
