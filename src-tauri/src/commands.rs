//! IPC コマンド境界（02.architecture/04-rust-responsibilities.md §1）。
//!
//! ここに置くのは薄いアダプタだけで、実際の処理は `document` / `scope` にある。
//! フロントからの呼び出しは Platform 層（`src/platform/`）に閉じ込められている。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{Manager, State, Window};

use crate::custom_css;
use crate::document::encoding::Encoding;
use crate::document::{self, DocumentPayload, SaveResult, WriteRequest};
use crate::error::{CoreError, CoreResult};
use crate::scope;
use crate::settings;
use crate::state::AppState;
use crate::store::{self, RecentEntry};
use crate::trace::Mark;
use crate::watch::FileWatcher;

/// ファイルを読む。
///
/// `encoding` はエンコーディングの指定（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
/// 省略が通常の経路であり、そのときだけ推定を実行する。
#[tauri::command]
pub fn read_document(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    encoding: Option<Encoding>,
) -> CoreResult<DocumentPayload> {
    let payload = document::read(Path::new(&path), encoding)?;
    // 開いたファイルの親ディレクトリをアセットの許可スコープに加える。
    // 自前の検証（scope.rs）だけでなく Tauri 本体の asset プロトコルスコープにも反映しないと、
    // resolve_asset の検証を通っても実際の asset:// 配信が 403 になる。
    if let Some(parent) = Path::new(&payload.meta.path).parent() {
        state.allow_asset_root(parent.to_path_buf());
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
    Ok(payload)
}

/// ファイルを保存する（F-EDIT-14 / N-REL-01）。
///
/// `req.expected_mtime_ms` がディスク上の mtime と一致しないときは書き込まず `Conflict` を返す。
#[tauri::command]
pub fn write_document(
    watcher: State<'_, FileWatcher>,
    req: WriteRequest,
) -> CoreResult<SaveResult> {
    let result = document::write(&req)?;
    // 保存した直後のイベントは自分が発生させたものである（02.architecture/04-rust-responsibilities.md §4）。
    // 監視を入れた時点で対にしておかないと、保存するたびに再読み込みが発生する。
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
    // base_dir 自体も許可スコープとして扱う（開いているファイルの親ディレクトリ）
    if let Ok(b) = dunce::canonicalize(&base) {
        if !roots.contains(&b) {
            roots.push(b);
        }
    }

    let resolved = scope::resolve_within(&roots, &candidate)?;
    // 自前の検証を通っただけでは asset:// は配信されない。
    // Tauri 本体の asset プロトコルスコープにも解決先のディレクトリを許可しておく。
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
/// 返すのは正規化済み絶対パスである。
/// ここで揃えておかないと、最近開いたファイル（F-OPEN-09）に表記の違う同じファイルが重複して蓄積する。
#[tauri::command]
pub async fn pick_file(window: Window) -> CoreResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    // 容量 1 の一度きりのチャネル。
    // ダイアログのコールバックは UI スレッドで実行されるため、待つ側をブロックしない `try_send` を使う。
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
/// 返すパスは正規化しない。
/// ここが `pick_file` との違いで、保存先はまだ存在しないことがあり、`canonicalize` は存在しないパスに対して失敗する。
/// 正規化されるのは保存が済んで実体ができた後で、`write_document` の中で行われる。
///
/// 親ディレクトリを asset のスコープに入れる。
/// 保存した先が新しい場所なら、そこが相対パス画像の基準になる（N-SEC-05）。
/// `read_document` と同じ扱いにしておかないと、名前を付けて保存した直後だけ画像が表示されなくなる。
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

    // 開いているファイルの場所と名前を初期値にする。何も開いていなければ OS の既定に従う。
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

// `decorations(false)` にしたので、`─ □ ✕` はフロントが描いた `<button>` である。
// 押されたときの実体をここに置く。
//
// JS の `@tauri-apps/api/window` は使わない。
// `pick_file` / `open_external` と同じ判断であり（04.tech-stack/06-rust.md §2）、フロントの依存とクリティカルパスのコストを増やさないためである。
// capabilities に window プラグインの権限を追加せずに済むため、タイトルバーのために任意のウィンドウ操作を JS へ開放することにもならない。
//
// ドラッグとダブルクリックだけは例外で、Tauri 本体が注入する `data-tauri-drag-region` の処理に任せている（`capabilities/default.json`）。
// マウスの押し下げからネイティブのドラッグへ引き継ぐ部分は、自前で実装すると二重クリックの取りこぼしまで作り直すことになる。

/// 最小化する。タイトルバーの `─` から呼ぶ。
#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

/// 最大化と復元を切り替える。タイトルバーの `□` / `❐` から呼ぶ。
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
/// `close()` は `CloseRequested` を経由するため、ウィンドウ位置の保存（F-CONF-10）はネイティブの `✕` と同じ経路を通る。
/// トレイ格納へ分岐するのもここであり（`window.closeBehavior`）、フロントから直接 `exit` を呼ばせない。
#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

/// 最大化中か。ウィンドウ操作ボタンの表示（□ / ❐）を決めるためだけに使う。
///
/// 以降の変化は `marxdown://window-maximized` が通知するため、フロントがこれを呼ぶのは購読を始める 1 回だけである。
#[tauri::command]
pub fn window_is_maximized(window: Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

/// 最大化ボタンの矩形（論理 px）を Windows へ答えられるようにする。
///
/// `decorations: false` にすると Windows はボタンの位置を把握できず、Snap Layouts のフライアウトが表示されない（`snap_layouts.rs`）。
/// 位置を知っているのはフロントだけであるため、レイアウトが変わるたびに通知してもらう。
/// Windows 以外では何もしない。
#[tauri::command]
pub fn set_snap_layouts_target(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    #[cfg(windows)]
    crate::snap_layouts::set_target(&app, x, y, width, height);

    #[cfg(not(windows))]
    let _ = (app, x, y, width, height);
}

/// 最近開いたファイルに 1 件積む（F-OPEN-09）。更新後の一覧を返す。
///
/// 一覧を返り値にしているのは、追加のたびにフロントが読み直す往復を省くためである。
/// 追加するのは正規化済みの絶対パスに限る。
/// 相対パスのまま保持すると、cwd の異なる 2 回目の起動で同じファイルが別のエントリとして増える。
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
    // トレイメニューは生成した時点の内容で固定される。
    // 開くたびに作り直すフックが無いため、ストアを更新した側から組み直す（`tray.rs` の `refresh`）。
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
/// 反映自体はフロントが即座に行い、ここは永続化だけを担当する。
/// `Ctrl+=` の連打で毎回書き込まないよう、フロント側でデバウンスしてから呼ぶこと。
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
/// 倍率と同じ扱いである。反映はフロントが即座に行い、ここは永続化だけを担当する。
/// ドラッグ中に毎フレーム呼ばないよう、フロント側でデバウンスしてから呼ぶこと。
///
/// 左右をまとめて受け取るのは、`state.json` に載る形（`Panes`）と呼び出しの単位を一致させるためである。
/// 左（Explorer / M3）が入ってもコマンドは増えない。
#[tauri::command]
pub fn store_set_panes(state: State<'_, AppState>, panes: store::Panes) {
    let sane = panes.sanitized();
    state.update_store(|s| s.panes = sane);
}

/// Split の分割比を保存する（03.ux-spec/03-split-mode.md §1）。
///
/// `store_set_panes` と同じくドラッグ中は呼ばれず、離した時点で 1 回だけ呼ばれる（`features/view/split.ts`）。
/// 丸めは Rust 側でも行う（手で書いた `state.json` への対策）。
#[tauri::command]
pub fn store_set_split(state: State<'_, AppState>, split: f64) {
    let sane = if split.is_finite() {
        split.clamp(store::SPLIT_MIN, store::SPLIT_MAX)
    } else {
        store::SPLIT_DEFAULT
    };
    state.update_store(|s| s.split = sane);
}

/// 設定を読み直す。
///
/// 起動時の読み込みはここを通らない。
/// 設定は bootstrap にすべて載っており、フロントが取得する経路は無い（02.architecture/04-rust-responsibilities.md §5）。
/// このコマンドが必要なのは、外部エディターで編集された後の読み直し（ファイル監視）と設定 UI の再表示である。
#[tauri::command]
pub fn read_settings(state: State<'_, AppState>) -> settings::SettingsLoad {
    state.reload_settings()
}

/// 変更したキーだけを書き戻す。更新後の設定全体を返す。
///
/// `null` を渡したキーは削除する（既定値に戻る）。未知のキーは保持される。
/// `settings.json` が読めない状態では拒否する（02.architecture/04-rust-responsibilities.md §5）。
#[tauri::command]
pub fn write_settings(
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
    patch: serde_json::Map<String, serde_json::Value>,
) -> CoreResult<settings::Settings> {
    let next = state.patch_settings(patch)?;
    // 自分で書いた直後のイベントを除外する（02.architecture/04-rust-responsibilities.md §4）。
    // これが無いと、設定 UI から保存するたびに「外部で変更された」通知が発生する。
    if let Some(path) = state.settings_path() {
        watcher.note_self_write(path);
    }
    Ok(next)
}

/// `settings.json` を OS の既定アプリで開く（F-CONF-06 / 03.ux-spec/07-status-and-notifications.md §2）。
///
/// パスを引数に取らない。
/// 開く先は Rust 側が知っている 1 か所だけであり、任意のパスを受け取る `open_local_file` と違って許可範囲の判断が不要である。
/// 壊れた設定を通知バーの「ファイルを開く」から修正できるようにするためのコマンドである。
#[tauri::command]
pub fn open_settings_file(app: tauri::AppHandle, state: State<'_, AppState>) -> CoreResult<()> {
    let path = state
        .settings_path()
        .ok_or_else(|| CoreError::Io("設定の保存先が決まらない".into()))?;
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// カスタム CSS を読む。
///
/// 起動時の 64KB 以下はここを通らない。
/// bootstrap に同梱されており（02.architecture/10-theming.md §3 / FOUC を防ぐため）、このコマンドが必要なのは次の 2 つの場合だけである。
///
/// 1. 64KB を超えていて bootstrap に載らなかった（`deferred`）
/// 2. 外部エディターで編集された後の読み直し（`marxdown://custom-css-changed`）
///
/// パスを引数に取らない。
/// `open_settings_file` と同じ理由で、読む先は Rust 側が知っている 1 か所しかない。
#[tauri::command]
pub fn read_custom_css(state: State<'_, AppState>) -> custom_css::CustomCss {
    // 明示的に取得を要求された経路であるため、読める上限（1MB）まで読む。
    custom_css::load(state.custom_css_path(), custom_css::MAX_BYTES)
}

/// エディター用カスタム CSS を読む。本文用の `read_custom_css` と対になる。
#[tauri::command]
pub fn read_editor_css(state: State<'_, AppState>) -> custom_css::CustomCss {
    custom_css::load(state.editor_css_path(), custom_css::MAX_BYTES)
}

/// `custom.css` を OS の既定アプリで開く（F-CONF-07 / 設定 UI のボタン）。
///
/// 無ければ雛形を作ってから開く。
/// 仕様（02.architecture/10-theming.md §3）は「ファイルが存在すれば適用される」としか定めておらず、存在しないときの挙動は決まっていない。
/// ここで「ファイルがありません」と応答すると、ユーザーはどこに何という名前で作ればよいかを自分で調べることになる。
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

    custom_css::ensure_exists(path, custom_css::Surface::Preview)?;
    // 雛形を作成したのは自分であるため、続くイベントは外部変更ではない（02.architecture/04-rust-responsibilities.md §4）。
    watcher.note_self_write(path);

    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// `editor.css` を OS の既定アプリで開く。`open_custom_css_file` と対になる。
///
/// 雛形の中身だけが違う（どちらに何を書くかをファイル自身が説明する）。
#[tauri::command]
pub fn open_editor_css_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
) -> CoreResult<()> {
    let path = state
        .editor_css_path()
        .ok_or_else(|| CoreError::Io("カスタム CSS の置き場所が決まらない".into()))?;

    custom_css::ensure_exists(path, custom_css::Surface::Editor)?;
    watcher.note_self_write(path);

    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// 開いているファイルの監視を始める。
///
/// 監視の対象を決めるのはフロント側である。
/// どのファイルを開いていると見なすかは UI の状態であり、Rust 側は関知しない。
/// M3 でタブが入ったら、開いた枚数だけここが呼ばれる形になる。
///
/// 現在は開いているドキュメントが 1 つしかないため、呼ぶたびに前のファイルの監視が解除される。
/// 解除を忘れても積算しないのは、この段階に限った性質である。
///
/// `settings.json` はここを通らない。
/// パスを知っているのは Rust 側であり、起動時に自分で登録する（02.architecture/04-rust-responsibilities.md §5）。
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
/// 最初に表示されるフレームが既に本文である状態を作るための唯一の入口である。
#[tauri::command]
pub fn ready(window: Window, state: State<'_, AppState>) {
    state.trace.mark("T9", None);
    let _ = window.show();
    let _ = window.set_focus();

    // Snap Layouts（最大化ボタンのホバーメニュー / `snap_layouts.rs`）。
    //
    // ここより前では実行できない。
    // ウィンドウのサブクラス化には HWND が必要だが、`hwnd()` はイベントループへの問い合わせであり `setup()` の中では結果が返らない。
    // 失敗しても内部で処理する。
    // 付与できなかった場合に起きるのはホバーしてもフライアウトが表示されないことだけで、ボタン自体は押せる。
    //
    // 矩形の受け皿は `setup()` の中で先に用意してある（`snap_layouts.rs` の `prepare`）。
    // フロントの矩形通知はこの直後に届く（`src/app/window.ts` の `reportSnapLayoutsTarget`）。
    #[cfg(windows)]
    crate::snap_layouts::install(window.app_handle());

    // トレイアイコン（F-OS-08 / ADR-0007）。
    //
    // `ready()` の後で作る（02.architecture/05-startup-sequence.md §1 の表）。
    // OS 側の UI であり、本文表示には関与しない。
    // ここでアイコンを構築するぶんだけ T3→T8 が伸びるが、それによる利点はない。
    // 失敗しても常駐しなくなるだけで、アプリは通常どおり使える。
    if let Err(e) = crate::tray::install(window.app_handle()) {
        eprintln!("[marxdown] トレイアイコンを作れなかった: {e}");
    }

    state.trace.flush("cold");
    if state.trace.exit_after() {
        let app = window.app_handle().clone();
        // 書き出しを終えてから終了する。即座に exit すると WebView 側の後処理が実行されない。
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            app.exit(0);
        });
    }
}

/// 外部 URL を既定のブラウザで開く（F-VIEW-06 / 02.architecture/09-security.md §2）。
///
/// 許可するのは `https` / `http` / `mailto` だけで、未知のスキームは拒否する。
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
/// 確認だけでは足りない。
/// フロントはユーザーに確認してからここを呼ぶが、それでも許可ディレクトリの外は開かない。
/// 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことである（ADR-0006）。
/// `[実行](../../../Windows/System32/cmd.exe)` と書かれたリンクを、確認ダイアログ 1 枚で既定アプリに渡してよい理由がない。
///
/// 許可範囲は `read_document` が積んだアセットルート（＝開いたファイルの親）と同じである。
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

/// ファイルマネージャーで対象を選択した状態で開く。
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
/// `✕` とは別に必要である。
/// トレイ常駐では `✕` が格納の意味になるため、明示的に終了する経路が無くなる。
/// フロント側の `Ctrl+Q` とハンバーガーメニューの「終了」がここへ来る（3 経路のうちの 2 つ）。
///
/// 未保存の変更があれば確認する（F-EDIT-03 / `close::request_quit`）。
/// ウィンドウ位置の保存は `close::quit` が行う（論点 11）。
#[tauri::command]
pub fn app_quit(app: tauri::AppHandle) {
    crate::close::request_quit(&app);
}

/// 未保存の変更があるかを知らせる（F-EDIT-03）。
///
/// 変わり目だけ呼ばれ、打鍵ごとには呼ばれない（`features/document/save.ts`）。
/// Rust 側が持つ理由は `state.rs` の `dirty` を参照。
#[tauri::command]
pub fn set_dirty(state: State<'_, AppState>, dirty: bool) {
    state.set_dirty(dirty);
}

/// 未保存のまま別の文書へ移ってよいか尋ねる（F-EDIT-03 / N-REL-01）。
///
/// F-EDIT-03 の文面は「閉じる際の確認」だが、単一文書のアプリでは「別のファイルを開く」が「閉じる」そのものである。
/// `open.ts` の 5 つの入口（argv 転送 / ダイアログ / D&D / 相対リンク / 再読み込み）はどれもいま開いている文書を置き換える。
/// そのため、確認を通さないと編集内容が黙って消える。
///
/// 確認だけを担当する。
/// `close::request_quit` と違い、ここはダーティかどうかを見ない。
/// 判断材料（`documentStore.isDirty`）を持っているのはフロントで、呼ぶかどうかもフロントが決める。
/// Rust 側が持っているのは「ネイティブの 3 択ダイアログを出す手段」だけである。
/// 終了の確認が Rust 側にあるのは、トレイメニューがフロントを経由しないためだが（`close.rs`）、その事情はこちらには無い。
///
/// 「開く」とは言わない。
/// ボタンは「保存する / 保存しない / キャンセル」である。
/// 同じ確認を再読み込み（`F5`）と、この先の新規ファイル（`Ctrl+N`）でも通すため、行き先を名乗ると経路ごとに文言が必要になる。
/// 危険なのは行き先ではなく、保存していない変更のほうである。
///
/// 既定は「移らない」側で、`✕` で閉じられた場合も `Cancel` を返す。
/// 開き直すことはできるが、消えた編集内容は復元できない（N-REL-01）。
#[tauri::command]
pub async fn confirm_discard(window: Window) -> DiscardChoice {
    use tauri_plugin_dialog::{
        DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
    };

    // `YesNoCancelCustom` はラベルをカスタムした時点で、結果が `Yes` / `No` ではなく常に `Custom(ラベル文字列)` で返る
    // （tauri-plugin-dialog の仕様。`close.rs` の `ask_then_quit` と同じ）。
    // ラベルで判定しないと、どちらのボタンを押しても `_` に該当し、「保存しない」が常にキャンセル扱いになる。
    const SAVE: &str = "保存する";
    const DISCARD: &str = "保存しない";

    let (tx, mut rx) = tauri::async_runtime::channel(1);

    window
        .dialog()
        .message(crate::close::DIRTY_MESSAGE)
        .title("Marxdown")
        .kind(MessageDialogKind::Warning)
        .parent(&window)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            SAVE.to_string(),
            DISCARD.to_string(),
            "キャンセル".to_string(),
        ))
        .show_with_result(move |result| {
            let choice = match result {
                MessageDialogResult::Custom(label) if label == SAVE => DiscardChoice::Save,
                MessageDialogResult::Custom(label) if label == DISCARD => DiscardChoice::Discard,
                _ => DiscardChoice::Cancel,
            };
            let _ = tx.try_send(choice);
        });

    rx.recv().await.unwrap_or(DiscardChoice::Cancel)
}

/// `confirm_discard` の答え。
///
/// フロントが受け取る文字列を型で固定する。
/// `SaveResult` の `rename_all_fields` を落として `mtimeMs` が `undefined` になった件（06.roadmap/m2-editor.md §5 の Phase 2）と同じ不具合を、下のテストが検証している。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscardChoice {
    /// 保存してから移る。保存できるのはフロントだけであるため、保存はフロントが行う。
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
/// 中央値を別々に取るために必要である。
/// 経路が違えば分布も異なり、混ぜると全体としての傾向しか分からなくなる（ADR-0007「Warm Start の計測経路が 2 本になる」）。
/// 省略時は `"warm"`。
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
/// 計測専用。
/// M2 の完了条件「キー入力 → 反映が p95 で 16ms 以内」と [OQ-15](../../docs/07.open-questions/oq-15-markdown-worker.md) の判定は、どちらも実際に入力して実際に描画されるまでを測る必要がある。
///
/// 書き出し先はフロントから渡させない（`state.args` が保持している）。
/// 任意のパスへ書き込める経路を製品に用意しないためで、`open_settings_file` と同じ判断である。
///
/// 終了の手順は `ready()` の `--exit-after-trace` と同じにしてある。
/// 即座に `exit` すると WebView 側の後処理が実行されない。
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
