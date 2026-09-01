//! IPC コマンド境界（02.architecture/04-rust-responsibilities.md §1）。
//!
//! ここに置くのは**薄いアダプタだけ**。実際の処理は `document` / `scope` にある。
//! フロントからの呼び出しは Platform 層（`src/platform/`）に閉じ込められている。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{Manager, State, Window};

use crate::custom_css;
use crate::document::{self, DocumentPayload, SaveResult, WriteRequest};
use crate::error::{CoreError, CoreResult};
use crate::scope;
use crate::settings;
use crate::state::AppState;
use crate::store::{self, RecentEntry};
use crate::trace::Mark;
use crate::watch::FileWatcher;

#[tauri::command]
pub fn read_document(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CoreResult<DocumentPayload> {
    let payload = document::read(Path::new(&path))?;
    // 開いたファイルの親ディレクトリをアセットの許可スコープに加える。
    // 自前の検証（scope.rs）だけでなく、Tauri 本体の asset プロトコルスコープにも
    // 反映しないと、resolve_asset の検証を通っても実際の asset:// 配信が 403 になる。
    if let Some(parent) = Path::new(&payload.meta.path).parent() {
        state.allow_asset_root(parent.to_path_buf());
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
    Ok(payload)
}

#[tauri::command]
pub fn write_document(
    watcher: State<'_, FileWatcher>,
    req: WriteRequest,
) -> CoreResult<SaveResult> {
    let result = document::write(&req)?;
    // 保存した直後のイベントは自分のもの（02.architecture/04-rust-responsibilities.md §4）。
    // **編集機能が入るまでここは通らない**が、監視を入れた時点で
    // 対にしておかないと、M2 で保存するたびに再読み込みが走る。
    if matches!(result, SaveResult::Saved { .. }) {
        watcher.note_self_write(Path::new(&req.path));
    }
    Ok(result)
}

/// 相対パスの画像を、許可ディレクトリ配下であることを検証してから解決する（N-SEC-05）。
///
/// 返すのは絶対パス。フロントは `convertFileSrc` で asset URL に変換する。
#[tauri::command]
pub fn resolve_asset(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    href: String,
    base_dir: String,
) -> CoreResult<String> {
    if href.contains('\0') {
        return Err(CoreError::InvalidArgument("パスに NUL が含まれる".into()));
    }
    let base = PathBuf::from(&base_dir);
    let candidate = if Path::new(&href).is_absolute() {
        PathBuf::from(&href)
    } else {
        base.join(&href)
    };

    let mut roots = state.asset_roots();
    // base_dir 自体も許可スコープとして扱う（開いているファイルの親）
    if let Ok(b) = dunce::canonicalize(&base) {
        if !roots.contains(&b) {
            roots.push(b);
        }
    }

    let resolved = scope::resolve_within(&roots, &candidate)?;
    // 自前の検証を通っただけでは asset:// は配信されない。Tauri 本体の
    // asset プロトコルスコープにも解決先のディレクトリを許可しておく。
    if let Some(parent) = resolved.parent() {
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
    Ok(resolved.display().to_string())
}

/// ファイル選択ダイアログを開く（F-OPEN-07）。選ばれなければ `None`。
///
/// `@tauri-apps/plugin-dialog` を入れず Rust 側で包んでいるのは、`open_external` と同じ理由。
/// フロントの依存が増えず、クリティカルパスの重さにも響かない（04.tech-stack/06-rust.md §1）。
///
/// 返すのは**正規化済み絶対パス**。ここで揃えておかないと、
/// 最近開いたファイル（F-OPEN-09）に表記の違う同じファイルが二重に積もる。
#[tauri::command]
pub async fn pick_file(window: Window) -> CoreResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    // 容量 1 の一度きりの受け口。ダイアログのコールバックは UI スレッドで走るので、
    // ここで待つ側をブロックしない `try_send` を使う。
    let (tx, mut rx) = tauri::async_runtime::channel(1);

    window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("すべてのファイル", &["*"])
        .pick_file(move |picked| {
            let _ = tx.try_send(picked);
        });

    let Some(Some(picked)) = rx.recv().await else {
        return Ok(None);
    };

    let path = picked
        .into_path()
        .map_err(|e| CoreError::InvalidArgument(e.to_string()))?;
    Ok(Some(document::canonicalize(&path)?.display().to_string()))
}

/// 保存先を選ばせる（F-EDIT-02「名前を付けて保存」）。
///
/// `pick_file` と対になる。`@tauri-apps/plugin-dialog` を入れず Rust 側で包む理由も同じ
/// （04.tech-stack/06-rust.md §2）。
///
/// # 返すパスを正規化しない
///
/// **`pick_file` との違いはここ。** 保存先はまだ存在しないことがあり、
/// `canonicalize` は存在しないパスに対して失敗する。正規化されるのは
/// 保存が済んで実体ができた後で、`write_document` の中で行われる。
///
/// # 親ディレクトリを asset のスコープに入れる
///
/// 保存した先が新しい場所なら、そこが相対パス画像の基準になる（N-SEC-05）。
/// `read_document` と同じ扱いにしておかないと、名前を付けて保存した直後だけ
/// 画像が出なくなる。
#[tauri::command]
pub async fn pick_save_path(
    window: Window,
    state: State<'_, AppState>,
    suggested: Option<String>,
) -> CoreResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, mut rx) = tauri::async_runtime::channel(1);

    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("すべてのファイル", &["*"]);

    // 開いているファイルの場所と名前を初期値にする。何も開いていなければ OS の既定。
    if let Some(hint) = suggested.as_deref() {
        let path = Path::new(hint);
        if let Some(dir) = path.parent() {
            dialog = dialog.set_directory(dir);
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            dialog = dialog.set_file_name(name);
        }
    }

    dialog.save_file(move |picked| {
        let _ = tx.try_send(picked);
    });

    let Some(Some(picked)) = rx.recv().await else {
        return Ok(None);
    };

    let path = picked
        .into_path()
        .map_err(|e| CoreError::InvalidArgument(e.to_string()))?;

    if let Some(parent) = path.parent() {
        state.allow_asset_root(parent.to_path_buf());
    }

    Ok(Some(path.display().to_string()))
}

/* ------------------------------------------------------------------ */
/* ウィンドウ操作（カスタムタイトルバー / 03.ux-spec/01-screen-layout.md §1）             */
/* ------------------------------------------------------------------ */

// `decorations(false)` にしたので、`─ □ ✕` はフロントが描いた `<button>` である。
// 押されたときの実体をここに置く。
//
// **JS の `@tauri-apps/api/window` は使わない。** `pick_file` / `open_external` と
// 同じ判断で（04.tech-stack/06-rust.md §2）、フロントの依存とクリティカルパスの重さを
// 増やさないため。capabilities に window プラグインの権限を足さずに済むのも利点で、
// 「タイトルバーのために任意のウィンドウ操作を JS へ開放する」ことにならない。
//
// ドラッグとダブルクリックだけは例外で、Tauri 本体が注入する
// `data-tauri-drag-region` の処理に任せている（`capabilities/default.json`）。
// マウスの押し下げからネイティブのドラッグへ引き継ぐ部分は、
// 自前で書くと二重クリックの取りこぼしまで作り直すことになる。

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) {
    let _ = if window.is_maximized().unwrap_or(false) {
        window.unmaximize()
    } else {
        window.maximize()
    };
}

/// 閉じる。
///
/// `close()` は `CloseRequested` を経由するので、ウィンドウ位置の保存（F-CONF-10）は
/// ネイティブの `✕` と同じ経路を通る。**トレイ格納に化けるのもここ**
/// （`window.closeBehavior`）なので、フロントから直接 `exit` を呼ばせない。
#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

/// 最大化中か。ウィンドウ操作ボタンの絵柄（□ / ❐）を決めるためだけに使う。
///
/// 以降の変化は `marxdown://window-maximized` が push するので、
/// フロントがこれを呼ぶのは購読を始める 1 回だけ。
#[tauri::command]
pub fn window_is_maximized(window: Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

/// 最大化ボタンの矩形（論理 px）を Windows へ答えられるようにする。
///
/// `decorations: false` にすると Windows はボタンの位置を知らず、
/// Snap Layouts のフライアウトが出ない（`snap_layouts.rs`）。
/// **どこにあるかを知っているのはフロントだけ**なので、レイアウトが変わるたびに
/// こちらへ知らせてもらう。Windows 以外では何もしない。
#[tauri::command]
pub fn set_snap_layouts_target(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    #[cfg(windows)]
    crate::snap_layouts::set_target(&app, x, y, width, height);

    #[cfg(not(windows))]
    let _ = (app, x, y, width, height);
}

/* ------------------------------------------------------------------ */
/* 永続化ストア（F-OPEN-09 / F-VIEW-11 / F-CONF-10）                     */
/* ------------------------------------------------------------------ */

/// 最近開いたファイルに 1 件積む（F-OPEN-09）。更新後の一覧を返す。
///
/// 一覧を返り値にしているのは、追加のたびにフロントが読み直す往復を省くため。
/// 積むのは**正規化済みの絶対パス**に限る。相対パスのまま貯めると、
/// cwd の違う 2 回目の起動で同じファイルが別エントリとして増える。
#[tauri::command]
pub fn store_push_recent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CoreResult<Vec<RecentEntry>> {
    let resolved = document::canonicalize(Path::new(&path))?;
    let now = store::now_ms();
    let recent = state.update_store(|s| {
        s.push_recent(resolved.display().to_string(), now);
        s.recent.clone()
    });
    // トレイメニューは作った時点の内容で固まる。開くたびに作り直すフックが
    // 無いので、ストアを更新した側から組み直す（`tray.rs` の `refresh`）。
    // 頻度は「ファイルを開いたとき」だけで、アイドル時のコストはゼロ。
    crate::tray::refresh(&app);
    Ok(recent)
}

/// 最近開いたファイルから 1 件外す。
///
/// Welcome 画面から開こうとしたファイルが消えていた場合に、UI が呼ぶ。
/// 存在しないファイルを一覧に残し続けると、次の起動でも同じ失敗を踏む。
#[tauri::command]
pub fn store_remove_recent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Vec<RecentEntry> {
    let recent = state.update_store(|s| {
        s.remove_recent(&path);
        s.recent.clone()
    });
    crate::tray::refresh(&app);
    recent
}

/// 表示倍率を保存する（F-VIEW-11）。
///
/// 反映自体はフロントが即座に行う。ここは永続化だけの担当なので、
/// フロント側でデバウンスしてから呼ぶこと（`Ctrl+=` の連打で毎回書かない）。
#[tauri::command]
pub fn store_set_zoom(state: State<'_, AppState>, zoom: f64) {
    let clamped = if zoom.is_finite() {
        zoom.clamp(store::ZOOM_MIN, store::ZOOM_MAX)
    } else {
        store::ZOOM_DEFAULT
    };
    state.update_store(|s| s.zoom = clamped);
}

/// ペインの開閉と幅を保存する（03.ux-spec/06-panes.md §3 / 02.architecture/04-rust-responsibilities.md §5）。
///
/// **倍率と同じ扱い。** 反映はフロントが即座に行い、ここは永続化だけを担当する。
/// ドラッグ中に毎フレーム呼ばないよう、フロント側でデバウンスしてから呼ぶこと。
///
/// 左右をまとめて受け取るのは、`state.json` に載る形（`Panes`）と
/// 呼び出しの単位を一致させるため。左（Explorer / M3）が入っても口は増えない。
#[tauri::command]
pub fn store_set_panes(state: State<'_, AppState>, panes: store::Panes) {
    let sane = panes.sanitized();
    state.update_store(|s| s.panes = sane);
}

/// Split の分割比を保存する（03.ux-spec/03-split-mode.md §1）。
///
/// `store_set_panes` と同じく**ドラッグ中は呼ばれない**。離した時点で 1 回だけ
/// （`features/view/split.ts`）。丸めは Rust 側でも行う（手で書いた `state.json` 対策）。
#[tauri::command]
pub fn store_set_split(state: State<'_, AppState>, split: f64) {
    let sane = if split.is_finite() {
        split.clamp(store::SPLIT_MIN, store::SPLIT_MAX)
    } else {
        store::SPLIT_DEFAULT
    };
    state.update_store(|s| s.split = sane);
}

/* ------------------------------------------------------------------ */
/* ユーザー設定（F-CONF-03 / 02.architecture/04-rust-responsibilities.md §5）                    */
/* ------------------------------------------------------------------ */

/// 設定を読み直す。
///
/// **起動時の読み込みはここを通らない。** 設定は bootstrap に丸ごと載っており、
/// フロントが取りに行く経路は無い（02.architecture/04-rust-responsibilities.md §5）。ここが要るのは、外部エディタで
/// 編集されたあとの読み直し（ファイル監視）と設定 UI の再表示。
#[tauri::command]
pub fn read_settings(state: State<'_, AppState>) -> settings::SettingsLoad {
    state.reload_settings()
}

/// 変更したキーだけを書き戻す。更新後の設定全体を返す。
///
/// `null` を渡したキーは削除する（既定値に戻る）。未知のキーは保持される。
/// **`settings.json` が読めない状態では拒否する**（02.architecture/04-rust-responsibilities.md §5）。
#[tauri::command]
pub fn write_settings(
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
    patch: serde_json::Map<String, serde_json::Value>,
) -> CoreResult<settings::Settings> {
    let next = state.patch_settings(patch)?;
    // 自分で書いた直後のイベントを弾く（02.architecture/04-rust-responsibilities.md §4）。
    // これが無いと、設定 UI から保存するたびに「外部で変更された」が跳ね返ってくる。
    if let Some(path) = state.settings_path() {
        watcher.note_self_write(path);
    }
    Ok(next)
}

/// `settings.json` を OS の既定アプリで開く（F-CONF-06 / 03.ux-spec/07-status-and-notifications.md §2）。
///
/// **パスを引数に取らない。** 開く先は Rust 側が知っている 1 か所だけであり、
/// 任意のパスを受け取る `open_local_file` と違って許可範囲の判断が要らない。
/// 壊れた設定を通知バーの `ファイルを開く` から直せるようにするための口。
#[tauri::command]
pub fn open_settings_file(app: tauri::AppHandle, state: State<'_, AppState>) -> CoreResult<()> {
    let path = state
        .settings_path()
        .ok_or_else(|| CoreError::Io("設定の保存先が決まらない".into()))?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/* ------------------------------------------------------------------ */
/* カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）                   */
/* ------------------------------------------------------------------ */

/// カスタム CSS を読む。
///
/// **起動時の 64KB 以下はここを通らない。** bootstrap に同梱されており
/// （02.architecture/10-theming.md §3 / FOUC を防ぐため）、ここが要るのは 2 つの場合だけ。
///
/// 1. 64KB を超えていて bootstrap に載らなかった（`deferred`）
/// 2. 外部エディタで編集された後の読み直し（`marxdown://custom-css-changed`）
///
/// **パスを引数に取らない。** `open_settings_file` と同じ理由で、
/// 読む先は Rust 側が知っている 1 か所しかない。
#[tauri::command]
pub fn read_custom_css(state: State<'_, AppState>) -> custom_css::CustomCss {
    // 取りに来た経路なので、読める上限（1MB）まで読む。
    custom_css::load(state.custom_css_path(), custom_css::MAX_BYTES)
}

/// `custom.css` を OS の既定アプリで開く（F-CONF-07 / 設定 UI のボタン）。
///
/// **無ければ雛形を作ってから開く。** 仕様（02.architecture/10-theming.md §3）は「ファイルが存在すれば効く」
/// としか書いておらず、存在しないときの挙動は決まっていない。
/// ここで「ファイルがありません」と答えると、ユーザーは
/// **どこに何という名前で作ればよいか**を自分で調べることになる。
/// 設定項目を置かない（Principle 3）以上、その導線はこのボタンしかない。
#[tauri::command]
pub fn open_custom_css_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
) -> CoreResult<()> {
    let path = state
        .custom_css_path()
        .ok_or_else(|| CoreError::Io("カスタム CSS の置き場所が決まらない".into()))?;

    custom_css::ensure_exists(path)?;
    // 雛形を作ったのは自分なので、続くイベントは外部変更ではない（02.architecture/04-rust-responsibilities.md §4）。
    watcher.note_self_write(path);

    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/* ------------------------------------------------------------------ */
/* ファイル監視（F-EDIT-16 / 02.architecture/04-rust-responsibilities.md §4）                    */
/* ------------------------------------------------------------------ */

/// 開いているファイルの監視を始める。
///
/// **監視の対象を決めるのはフロント側**（どのファイルを「開いている」と見なすかは
/// UI の状態であり、Rust 側は知らない）。M3 でタブが入ったら、
/// 開いた枚数だけここが呼ばれる形になる。
///
/// いまは開いているドキュメントが 1 つしかないので、**呼ぶたびに前のファイルの
/// 監視が外れる**。解除を忘れても積算しないのは、この Phase の間だけの性質。
///
/// `settings.json` はここを通らない。パスを知っているのは Rust 側であり、
/// 起動時に自分で登録する（02.architecture/04-rust-responsibilities.md §5）。
#[tauri::command]
pub fn watch_path(watcher: State<'_, FileWatcher>, path: String) {
    watcher.watch_document(Path::new(&path));
}

/// 監視をやめる。タブを閉じたとき（M3）に呼ぶ。
#[tauri::command]
pub fn unwatch_path(watcher: State<'_, FileWatcher>, path: String) {
    watcher.unwatch(Path::new(&path));
}

/// フロント側の performance.mark を受け取ってトレースに合流させる。
#[tauri::command]
pub fn report_trace(state: State<'_, AppState>, marks: Vec<Mark>) {
    state.trace.extend(marks);
}

/// 描画準備が整ったことをフロントが知らせる。
///
/// 04.tech-stack/09-tauri-config.md §1 の `visible: false` からの表示制御。
/// **最初に見えるフレームが既に本文である**状態を作るための唯一の入口。
#[tauri::command]
pub fn ready(window: Window, state: State<'_, AppState>) {
    state.trace.mark("T9", None);
    let _ = window.show();
    let _ = window.set_focus();

    // Snap Layouts（最大化ボタンのホバーメニュー / `snap_layouts.rs`）。
    //
    // **ここより前では付けられない。** ウィンドウのサブクラス化には HWND が要り、
    // `hwnd()` はイベントループへの問い合わせなので `setup()` の中では答えが返らない。
    // 失敗しても中で握り潰す。付かなかったときに起きるのは
    // 「ホバーしてもフライアウトが出ない」ことだけで、ボタン自体は押せる。
    //
    // 矩形の受け皿は `setup()` の中で先に置いてある（`snap_layouts.rs` の `prepare`）。
    // フロントの矩形通知は**この直後**に届く（`src/app/window.ts` の `reportSnapLayoutsTarget`）。
    #[cfg(windows)]
    crate::snap_layouts::install(window.app_handle());

    // トレイアイコン（F-OS-08 / ADR-0007）。
    //
    // **`ready()` の後で作る**（02.architecture/05-startup-sequence.md §1 の表）。OS 側の UI であり、
    // 本文表示に一切関与しない。ここでアイコンを焼くぶん T3→T8 が伸びるのは
    // 何の得にもならない。失敗しても常駐しないだけで、アプリは普通に使える。
    if let Err(e) = crate::tray::install(window.app_handle()) {
        eprintln!("[marxdown] トレイアイコンを作れなかった: {e}");
    }

    state.trace.flush("cold");
    if state.trace.exit_after() {
        let app = window.app_handle().clone();
        // 書き出しを終えてから落とす。即 exit すると WebView 側の後始末が走らない。
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            app.exit(0);
        });
    }
}

#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> CoreResult<()> {
    // 許可リスト方式。未知のスキームは何もしない（02.architecture/09-security.md §2）。
    let allowed =
        url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:");
    if !allowed {
        return Err(CoreError::InvalidArgument(format!(
            "許可されないスキーム: {url}"
        )));
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// 本文中のリンクから、Markdown 以外のローカルファイルを既定アプリで開く
/// （F-VIEW-06 / 02.architecture/09-security.md §2）。
///
/// # 確認だけでは足りない
///
/// フロントはユーザーに確認してからここを呼ぶ。それでも**許可ディレクトリの外は開かない**。
/// 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」こと（ADR-0006）。
/// `[実行](../../../Windows/System32/cmd.exe)` と書かれたリンクを、
/// 確認ダイアログ 1 枚で既定アプリに渡してよい理由がない。
///
/// 許可範囲は `read_document` が積んだアセットルート（＝開いたファイルの親）と同じ。
/// 「今読んでいる文書の周りにあるファイル」だけが対象になる。
#[tauri::command]
pub fn open_local_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CoreResult<()> {
    let resolved = scope::resolve_within(&state.asset_roots(), Path::new(&path))?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(resolved.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

#[tauri::command]
pub fn reveal_in_file_manager(app: tauri::AppHandle, path: String) -> CoreResult<()> {
    let resolved = document::canonicalize(Path::new(&path))?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .reveal_item_in_dir(&resolved)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// 開発ビルドでのみ意味を持つ。現在のトレースを読み出す。
#[tauri::command]
pub fn startup_trace(state: State<'_, AppState>) -> crate::trace::TraceReport {
    state.trace.report("cold")
}

/// Marxdown を終了する（ADR-0007 論点 3）。
///
/// **`✕` とは別に必要**である。トレイ常駐では `✕` が「格納」の意味になるため、
/// 「本当に終わらせたい」を表す経路が無くなる。フロント側の `Ctrl+Q` と
/// `Ctrl+Q` とハンバーガーメニューの「終了」がここへ来る（3 経路のうちの 2 つ）。
///
/// **未保存の変更があれば確認する**（F-EDIT-03 / `close::request_quit`）。
/// ウィンドウ位置の保存は `close::quit` が行う（論点 11）。
#[tauri::command]
pub fn app_quit(app: tauri::AppHandle) {
    crate::close::request_quit(&app);
}

/// 未保存の変更があるかを知らせる（F-EDIT-03）。
///
/// **変わり目だけ呼ばれる。** 打鍵ごとではない（`features/document/save.ts`）。
/// Rust 側が持つ理由は `state.rs` の `dirty` を参照。
#[tauri::command]
pub fn set_dirty(state: State<'_, AppState>, dirty: bool) {
    state.set_dirty(dirty);
}

/// 未保存のまま別の文書へ移ってよいか尋ねる（F-EDIT-03 / N-REL-01）。
///
/// # なぜ「閉じるとき」だけでは足りないのか
///
/// F-EDIT-03 の文面は「閉じる際の確認」だが、**単一文書のアプリでは
/// 「別のファイルを開く」が「閉じる」そのもの**である。`open.ts` の 5 つの入口
/// （argv 転送 / ダイアログ / D&D / 相対リンク / 再読み込み）はどれも
/// いま開いている文書を置き換えるので、確認を通さないと編集内容が黙って消える。
///
/// # 確認だけを担当する
///
/// `close::request_quit` と違い、ここは**ダーティかどうかを見ない**。
/// 判断材料（`documentStore.isDirty`）を持っているのはフロントで、
/// 呼ぶかどうかもフロントが決める。Rust 側が持っているのは
/// 「ネイティブの 3 択ダイアログを出す手段」だけ。
///
/// 終了の確認が Rust 側にあるのは、トレイメニューがフロントを経由しないからで
/// （`close.rs`）、その事情はこちらには無い。
///
/// # 「開く」と言わない
///
/// ボタンは「保存する / 保存しない / キャンセル」。同じ確認を再読み込み（`F5`）と、
/// この先の新規ファイル（`Ctrl+N`）でも通すので、**行き先を名乗ると経路ごとに
/// 文言が要る**ことになる。危険なのは行き先ではなく、保存していない変更のほう。
///
/// # 既定は「移らない」側
///
/// `✕` で閉じられた場合も `Cancel` を返す。**開き直すことはできるが、
/// 消えた編集内容は取り返せない**（N-REL-01）。
#[tauri::command]
pub async fn confirm_discard(window: Window) -> DiscardChoice {
    use tauri_plugin_dialog::{
        DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
    };

    let (tx, mut rx) = tauri::async_runtime::channel(1);

    window
        .dialog()
        .message(crate::close::DIRTY_MESSAGE)
        .title("Marxdown")
        .kind(MessageDialogKind::Warning)
        .parent(&window)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            "保存する".to_string(),
            "保存しない".to_string(),
            "キャンセル".to_string(),
        ))
        .show_with_result(move |result| {
            let choice = match result {
                MessageDialogResult::Yes => DiscardChoice::Save,
                MessageDialogResult::No => DiscardChoice::Discard,
                _ => DiscardChoice::Cancel,
            };
            let _ = tx.try_send(choice);
        });

    rx.recv().await.unwrap_or(DiscardChoice::Cancel)
}

/// `confirm_discard` の答え。
///
/// **フロントが受け取る文字列を型で固定する。** `SaveResult` の
/// `rename_all_fields` を落として `mtimeMs` が `undefined` になった件
/// （06.roadmap/m2-editor.md §5 の Phase 2）と同じ事故を、
/// ここでは下のテストが見張る。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscardChoice {
    /// 保存してから移る。**保存できるのはフロントだけ**なので、保存はフロントが行う。
    Save,
    /// 保存せずに移る。編集内容は失われる。
    Discard,
    /// 移らない。
    Cancel,
}

/// ウォーム起動（S6）の完了報告。
///
/// フロントが「本文が読める」状態（paint + 次の rAF）に到達したら呼ぶ。
/// 02.architecture/05-startup-sequence.md §2 の経路を、argv 転送を受けた瞬間から測る。
///
/// 1 プロセスで何度も起きるので、1 レコード 1 行の JSONL に追記する。
///
/// `kind` は `"warm"`（argv 転送）か `"tray-resume"`（トレイからの復帰）。
/// **中央値を別々に取るために要る。** 経路が違えば分布も違い、混ぜると
/// 「どちらも速い / どちらも遅い」しか分からなくなる
/// （ADR-0007「Warm Start の計測経路が 2 本になる」）。省略時は `"warm"`。
#[tauri::command]
pub fn warm_done(
    state: State<'_, AppState>,
    request_id: u64,
    path: String,
    detail: String,
    kind: Option<String>,
) -> Option<f64> {
    let elapsed = state.end_warm(request_id)?;

    if let Some(log) = state.trace.warm_log_path() {
        let record = serde_json::json!({
            "kind": kind.as_deref().unwrap_or("warm"),
            "requestId": request_id,
            "elapsedMs": elapsed,
            "path": path,
            "detail": detail,
        });
        if let Ok(line) = serde_json::to_string(&record) {
            use std::io::Write;
            let appended = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log)
                .and_then(|mut f| writeln!(f, "{line}"));
            if let Err(e) = appended {
                eprintln!("[marxdown] ウォーム起動ログの追記に失敗: {e}");
            }
        }
    }

    Some(elapsed)
}

/// 入力レスポンス計測の結果を受け取り、書き出して終了する（`--bench-input`）。
///
/// **計測専用。** M2 の完了条件「キー入力 → 反映が p95 で 16ms 以内」と
/// [OQ-15](../../docs/07.open-questions/oq-15-markdown-worker.md) の判定は、
/// どちらも「実際に打って、実際に描かれるまで」でしか測れない。
///
/// 書き出し先はフロントから渡させない（`state.args` が持っている）。
/// 任意のパスへ書ける口を製品に開けないためで、`open_settings_file` と同じ判断。
///
/// 終わり方は `ready()` の `--exit-after-trace` と同じにしてある。
/// **即 `exit` すると WebView 側の後始末が走らない。**
#[tauri::command]
pub fn bench_input_done(window: Window, state: State<'_, AppState>, json: String) {
    let Some(out) = state.args.bench_input.as_ref() else {
        return;
    };

    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(e) = std::fs::write(out, json) {
        eprintln!("[marxdown] 入力レスポンス計測の書き出しに失敗: {e}");
    }

    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(50));
        app.exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// フロントの `DiscardChoice`（`src/platform/types.ts`）と同じ綴りで出ること。
    ///
    /// **enum の `rename_all` はバリアント名を変える。** 構造体のフィールドと
    /// 違う挙動であり、Phase 2 ではそこを取り違えて `mtimeMs` を落とした。
    #[test]
    fn discard_choice_serializes_in_camel_case() {
        assert_eq!(
            serde_json::to_string(&DiscardChoice::Save).unwrap(),
            "\"save\""
        );
        assert_eq!(
            serde_json::to_string(&DiscardChoice::Discard).unwrap(),
            "\"discard\""
        );
        assert_eq!(
            serde_json::to_string(&DiscardChoice::Cancel).unwrap(),
            "\"cancel\""
        );
    }
}
