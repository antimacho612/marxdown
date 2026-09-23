//! タスクトレイ常駐（F-OS-08 / [ADR-0007]）。
//!
//! Cold Start の大半は WebView2 の初期化であり、アプリ側では削減できない。
//! 中心ユースケース（LLM が生成した Markdown を開いて読む）の反復を速くする唯一の方法は、その初期化コストを 1 日 1 回だけに抑えることである（ADR-0004）。
//! `✕` でプロセスが終わると、次に開くたびに Cold Start のコストが再度発生する。
//! トレイに残しておけば Warm Start で済む。
//!
//! 「閉じたのに終わっていない」ことで、ユーザーの理解が OS の慣習から外れる。
//! ADR-0007 はこれを次の 3 つで補うと決めた。
//! トレイアイコンを常に表示する（OS 側の affordance であり、ウィンドウ内のクロームは 1 つも増えない、Principle 3）。
//! 初回の `✕` だけ確認ダイアログを出す（`close.rs`）。
//! 終了導線を 3 つ用意する（トレイメニュー / ハンバーガーメニュー / `Ctrl+Q`）。
//!
//! メニューは 03.ux-spec/07-status-and-notifications.md §4 が定める 3 項目だけに保ち、「設定」「新規ウィンドウ」は置かない。
//! ウィンドウを開けば到達できるものをトレイに複製すると、複製したほうの内容だけが更新されず古くなる。
//!
//! [ADR-0007]: ../../docs/adr/0007-tray-residency.md

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::state::AppState;

/// トレイアイコンの識別子。`tray_by_id` で引くときに使う。
pub const TRAY_ID: &str = "marxdown-tray";

/// メニュー項目の ID。文字列で照合するため、この定数以外を書かない。
const ID_OPEN: &str = "tray:open";
const ID_QUIT: &str = "tray:quit";
/// 最近開いたファイルは `tray:recent:<path>` の形。パスをそのまま後ろに付ける。
const PREFIX_RECENT: &str = "tray:recent:";

/// トレイメニューに並べる「最近開いたファイル」の件数（03.ux-spec/07-status-and-notifications.md §4 は 5 件）。
///
/// Welcome とハンバーガーメニューは 6 件だが、トレイは 5 件のままにする。
/// マウスで開く小さなメニューであり、縦に伸びると OS のメニューが画面端で折り返して読みにくくなる。
const TRAY_RECENT_SHOWN: usize = 5;

/// トレイアイコンを作る。
///
/// `ready()` の後に呼ぶ（02.architecture/05-startup-sequence.md §2）。
/// OS 側の UI であり、本文表示には関与しない。
/// ここでアイコンを構築するぶんだけ T3→T8 が伸びるが、それによる利点はない。
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // 既に存在するなら作り直さない。`ready` は再読み込みで 2 回発火することがある。
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Marxdown")
        .menu(&build_menu(app)?)
        // 左クリックでウィンドウを復帰（ADR-0007 論点 6）。
        // `show_menu_on_left_click(false)` にしないと、左クリックでもメニューが表示され、「アイコンを押したら復帰する」という最も使用頻度の高い操作が実行できなくなる。
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            else {
                return;
            };
            crate::close::restore(tray.app_handle());
        })
        .on_menu_event(on_menu_event)
        .build(app)?;

    // アイコンはウィンドウと同じものを使う。トレイだけ別のアイコンにする理由がない。
    if let Some(icon) = app.default_window_icon().cloned() {
        let _ = tray.set_icon(Some(icon));
    }
    Ok(())
}

/// 最近開いたファイルが変わったらメニューを組み直す。
///
/// トレイメニューは生成した時点の内容で固定される。
/// 開くたびに作り直すフックが無いため、ストアを更新した側（`store_push_recent` / `store_remove_recent`）から呼ぶ。
/// 呼ばれるのはファイルを開いたときだけで、アイドル時のコストはない。
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open = MenuItem::with_id(app, ID_OPEN, "Marxdown を開く", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "終了", true, None::<&str>)?;

    let recent = app
        .try_state::<AppState>()
        .map(|s| s.recent())
        .unwrap_or_default();

    let menu = Menu::new(app)?;
    menu.append(&open)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // 最近開いたファイルが 1 件も無いなら、submenu ごと出さない。
    // 空のサブメニューは「壊れている」ように見える（Welcome が空欄を並べないのと同じ）。
    if !recent.is_empty() {
        let sub = Submenu::new(app, "最近開いたファイル", true)?;
        for entry in recent.iter().take(TRAY_RECENT_SHOWN) {
            // ラベルはファイル名だけにする。
            // トレイのメニューは幅が取れず、絶対パスを入れると画面外まで伸びる。
            let label = std::path::Path::new(&entry.path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| entry.path.clone());
            let id = format!("{PREFIX_RECENT}{}", entry.path);
            sub.append(&MenuItem::with_id(app, id, label, true, None::<&str>)?)?;
        }
        menu.append(&sub)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    menu.append(&quit)?;
    Ok(menu)
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();

    if id == ID_QUIT {
        // ADR-0007 論点 3 の 3 経路のうちの 1 つで、論点 11 の保存もここを通る。
        //
        // この経路はフロントを通らない。
        // 未保存の変更の確認を Rust 側に置いてあるのは、この経路でも確認を通すためである（F-EDIT-03 / `close.rs`）。
        crate::close::request_quit(app);
        return;
    }

    if id == ID_OPEN {
        // ウィンドウを先に復帰させてから、フロントの「開く」経路に載せる。
        // ダイアログの親になるウィンドウが隠れたままだと、ダイアログがタスクバーにも表示されず操作できなくなる。
        crate::close::restore(app);
        let _ = app.emit_to(crate::window::MAIN_LABEL, crate::EVENT_TRAY_OPEN, ());
        return;
    }

    if let Some(path) = id.strip_prefix(PREFIX_RECENT) {
        // argv 転送と同じ経路に載せる。
        // 「外から 1 枚開かせる」という意味が同じであり、別の入口を作ると片方だけ修正する漏れが発生する（`open.ts` が 5 つの入口を 1 か所に集めているのと同じ理由）。
        crate::close::restore(app);
        crate::forward_open(app, vec![path.to_string()]);
    }
}
