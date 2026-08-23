//! IPC コマンド境界（02.architecture.md §4.1）。
//!
//! ここに置くのは**薄いアダプタだけ**。実際の処理は `document` / `scope` にある。
//! フロントからの呼び出しは Platform 層（`src/platform/`）に閉じ込められている。

use std::path::{Path, PathBuf};

use tauri::{Manager, State, Window};

use crate::bootstrap::Bootstrap;
use crate::document::{self, DocumentPayload, SaveResult, WriteRequest};
use crate::error::{CoreError, CoreResult};
use crate::scope;
use crate::state::AppState;
use crate::store::{self, RecentEntry};
use crate::trace::Mark;

/// 起動時ペイロードの取得（1 回のみ有効）。
///
/// 本命の経路では `initialization_script` で注入済みなので、これは
/// S2 の `--spike-bootstrap=invoke` と、256KB 超のファイルでのみ使われる。
#[tauri::command]
pub fn take_bootstrap(state: State<'_, AppState>) -> Option<Bootstrap> {
    state.take_bootstrap()
}

#[tauri::command]
pub fn read_document(state: State<'_, AppState>, path: String) -> CoreResult<DocumentPayload> {
    let payload = document::read(Path::new(&path))?;
    // 開いたファイルの親ディレクトリをアセットの許可スコープに加える
    if let Some(parent) = Path::new(&payload.meta.path).parent() {
        state.allow_asset_root(parent.to_path_buf());
    }
    Ok(payload)
}

#[tauri::command]
pub fn write_document(req: WriteRequest) -> CoreResult<SaveResult> {
    document::write(&req)
}

/// 相対パスの画像を、許可ディレクトリ配下であることを検証してから解決する（N-SEC-05）。
///
/// 返すのは絶対パス。フロントは `convertFileSrc` で asset URL に変換する。
#[tauri::command]
pub fn resolve_asset(
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
    Ok(resolved.display().to_string())
}

/// ファイル選択ダイアログを開く（F-OPEN-07）。選ばれなければ `None`。
///
/// `@tauri-apps/plugin-dialog` を入れず Rust 側で包んでいるのは、`open_external` と同じ理由。
/// フロントの依存が増えず、クリティカルパスの重さにも響かない（04.tech-stack.md §6.1）。
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
/* 永続化ストア（F-OPEN-09 / F-VIEW-11 / F-CONF-10）                     */
/* ------------------------------------------------------------------ */

/// 最近開いたファイルに 1 件積む（F-OPEN-09）。更新後の一覧を返す。
///
/// 一覧を返り値にしているのは、追加のたびにフロントが読み直す往復を省くため。
/// 積むのは**正規化済みの絶対パス**に限る。相対パスのまま貯めると、
/// cwd の違う 2 回目の起動で同じファイルが別エントリとして増える。
#[tauri::command]
pub fn store_push_recent(state: State<'_, AppState>, path: String) -> CoreResult<Vec<RecentEntry>> {
    let resolved = document::canonicalize(Path::new(&path))?;
    let now = store::now_ms();
    Ok(state.update_store(|s| {
        s.push_recent(resolved.display().to_string(), now);
        s.recent.clone()
    }))
}

/// 最近開いたファイルから 1 件外す。
///
/// Welcome 画面から開こうとしたファイルが消えていた場合に、UI が呼ぶ。
/// 存在しないファイルを一覧に残し続けると、次の起動でも同じ失敗を踏む。
#[tauri::command]
pub fn store_remove_recent(state: State<'_, AppState>, path: String) -> Vec<RecentEntry> {
    state.update_store(|s| {
        s.remove_recent(&path);
        s.recent.clone()
    })
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

/// フロント側の performance.mark を受け取ってトレースに合流させる。
#[tauri::command]
pub fn report_trace(state: State<'_, AppState>, marks: Vec<Mark>) {
    state.trace.extend(marks);
}

/// 描画準備が整ったことをフロントが知らせる。
///
/// 04.tech-stack.md §9.1 の `visible: false` からの表示制御。
/// **最初に見えるフレームが既に本文である**状態を作るための唯一の入口。
#[tauri::command]
pub fn ready(window: Window, state: State<'_, AppState>) {
    state.trace.mark("T9", None);
    let _ = window.show();
    let _ = window.set_focus();

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
    // 許可リスト方式。未知のスキームは何もしない（02.architecture.md §9.2）。
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
/// 02.architecture.md §5.2 の経路を、argv 転送を受けた瞬間から測る。
///
/// 1 プロセスで何度も起きるので、1 レコード 1 行の JSONL に追記する。
#[tauri::command]
pub fn warm_done(
    state: State<'_, AppState>,
    request_id: u64,
    path: String,
    detail: String,
) -> Option<f64> {
    let elapsed = state.end_warm(request_id)?;

    if let Some(log) = state.trace.warm_log_path() {
        let record = serde_json::json!({
            "kind": "warm",
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
