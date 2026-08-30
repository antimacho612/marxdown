//! IPC コマンド境界（02.architecture/04-rust-responsibilities.md §1）。
//!
//! ここに置くのは**薄いアダプタだけ**。実際の処理は `document` / `scope` にある。
//! フロントからの呼び出しは Platform 層（`src/platform/`）に閉じ込められている。

use std::path::{Path, PathBuf};

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
    // フロントの矩形通知はここへ来るより前に届くため。
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

    state.trace.flush("cold", state.args.spike);
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
    state.trace.report("cold", state.args.spike)
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
/// Marxdown を終了する（ADR-0007 論点 3）。
///
/// **`✕` とは別に必要**である。トレイ常駐では `✕` が「格納」の意味になるため、
/// 「本当に終わらせたい」を表す経路が無くなる。フロント側の `Ctrl+Q` と
/// ハンバーガーメニューの「終了」がここへ来る（3 経路のうちの 2 つ）。
///
/// ウィンドウ位置の保存は `close::quit` が行う（論点 11）。
#[tauri::command]
pub fn app_quit(app: tauri::AppHandle) {
    crate::close::quit(&app);
}

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
            "spike": state.args.spike,
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
