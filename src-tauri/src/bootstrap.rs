//! 起動時の先読みと初期ペイロード生成（02.architecture/05-startup-sequence.md §1）。
//!
//! ファイル読み込みと WebView 起動を並行させる。
//! WebView2 の初期化には数百 ms かかるため、その待ち時間をファイル I/O に充てられる。
//! 初期コンテンツは IPC 往復ではなく初期化スクリプトで渡す。
//! `invoke()` の往復を待つと、WebView の準備完了後にリクエストとレスポンスの往復が発生し、本文の表示が遅れるためである。
//! ただし 256KB を超える本文は埋め込まない。
//! 初期化スクリプトは文字列として WebView に渡されるため、巨大な本文を JSON 文字列化するコストが往復のコストを上回る場合がある。

use std::path::Path;

use serde::Serialize;

use crate::cli::{CliArgs, ViewMode};
use crate::document::{self, DocumentMeta, INLINE_CONTENT_LIMIT};
use crate::error::CoreResult;
use crate::settings::{Settings, SettingsLoad, SettingsProblem};
use crate::store::{Panes, RecentEntry, StoreData};
use crate::themes::UserTheme;

/// フロントエンドが `window.__MARXDOWN_BOOTSTRAP__` として同期的に読む値。
/// 対応するフロント側の型は `src/platform/types.ts` の `Bootstrap`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub version: u32,
    /// このウィンドウの役割（F-OPEN-06）。フロントはこれでシェルの描き分けを決める。
    pub role: WindowRole,
    /// 引き取るべき本文の ID（F-OPEN-06 / 決定 1）。
    ///
    /// 未保存のタブをサテライトへ移したときだけ入る。
    /// フロントは `take_transfer` で 1 回だけ取りに行き、その内容で文書を開く。
    ///
    /// **本文そのものは載せない。**
    /// 初期化スクリプトは文字列として WebView へ渡されるため、編集中の大きな文書を丸ごと書き出すと、本文を埋め込まない 256KB の閾値を設けた意味が無くなる。
    pub transfer: Option<u64>,
    /// 初期ドキュメント。引数なし起動（Welcome 画面）では `None`。
    pub document: Option<BootstrapDocument>,
    /// 読み込みに失敗した場合の理由。UI が通知バーに出す。
    pub document_error: Option<BootstrapError>,
    pub mode: Option<ViewMode>,
    /// 入力レスポンスの計測を走らせるか（`--bench-input` / 計測専用）。
    ///
    /// 書き出し先はフロントへ渡さない。
    /// 任意のパスへ書き込める経路を作らないよう、フロントは結果を `bench_input_done` へ渡すだけにし、置き場所は Rust が持つ（`open_settings_file` と同じ形）。
    pub bench_input: bool,
    pub trace: Option<TraceConfig>,
    /// 引数として渡されたが 1 枚目にならなかったパス。フロントが残りのタブとして開く。
    pub pending_paths: Vec<String>,
    /// ファイルツリーの基点（F-OPEN-02 / `marxdown <dir>`）。
    ///
    /// ディレクトリを指定して起動したときだけ入る。
    /// 指定が無ければフロントが「開いているファイルの親ディレクトリ」を基点にする。
    pub workspace_root: Option<String>,
    pub unknown_args: Vec<String>,
    /// 復元するタブ。タブの並び順である。
    ///
    /// 入るのは引数なしで起動したときだけである。
    /// `document` には `session_active` が指すファイルが入っているので、フロントはそれ以外を元の位置へ開き直す。
    pub session: Vec<String>,
    /// `session` の中で表示していたタブの位置。
    pub session_active: usize,
    /// 最近開いたファイル（F-OPEN-09）。
    /// Welcome 画面が起動直後に描画するため、IPC 往復ではなくここに載せる（03.ux-spec/08-empty-states.md §1）。
    pub recent: Vec<RecentEntry>,
    /// 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描画するために必要になる。
    /// 後から適用すると、本文が一度既定倍率で描画された後に別の倍率へ変化して見える。
    pub zoom: f64,
    /// ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
    ///
    /// 倍率と同じ理由でここに載る。
    /// 後から適用すると、本文が一度全幅で描画された後に幅が縮小して見える（02.architecture/04-rust-responsibilities.md §5「`panes` と `zoom` は bootstrap に載せる」）。
    pub panes: Panes,
    /// Split の分割比（03.ux-spec/03-split-mode.md §1）。
    /// 倍率・ペインと同じ理由でここに載る。
    /// 後から適用すると、Split で開いたときに 50:50 の状態が一度描画された後に分割比が変化して見える。
    pub split: f64,
    /// ユーザー設定の全体（F-CONF-03 / 02.architecture/04-rust-responsibilities.md §5）。
    ///
    /// どの設定が初回フレームに間に合う必要があるかを都度判断せずに済むよう、選別せずすべて載せる。
    /// 想定サイズは 1KB 未満で、本文の 256KB 閾値に比べれば無視できる。
    /// フロントから取得する経路は作らない。
    pub settings: Settings,
    /// `settings.json` を読めなかった事実。UI が通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。
    /// これが `Some` の間、`write_settings` は書き戻しを拒否する。
    pub settings_error: Option<SettingsProblem>,
    /// プレビューで選ばれている `themes/` の 1 枚（02.architecture/10-theming.md §3.3）。
    ///
    /// 選択中の id に一致するファイルがあるときだけ入る。
    /// 組み込みの配色を選んでいる場合と、存在しない綴りの場合は `None` になり、フロントが `theme` チャンクの取得を待って適用する。
    ///
    /// ここに載せるのは、暗い配色を選んでいるときに既定の配色で初回フレームが描かれるのを防ぐためである。
    /// 載せるのは 1 枚だけである。全件を載せると、起動のたびに 100 枚ぶんの CSS を初期化スクリプトへ書き出すことになる。
    pub preview_theme: Option<UserTheme>,
}

/// ウィンドウの役割（F-OPEN-06）。対応するフロント側の型は `src/platform/types.ts` の `WindowRole`。
///
/// 1 つのプロセスの中で、`main` は 1 枚だけである。
/// `--new-window` で開くのは別プロセスの `main` であり、同じプロセスに 2 枚目の `main` は生まれない。
///
/// `satellite` はタブと本文だけを持つウィンドウで、VS Code の切り離したエディターに相当する。
/// ファイルツリー・アウトライン・ハンバーガーメニューを持たず、トレイにも常駐せず、前回のタブとしても覚えない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowRole {
    Main,
    Satellite,
}

/// 起動時に開く 1 枚目のドキュメント。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapDocument {
    #[serde(flatten)]
    pub meta: DocumentMeta,
    /// 256KB 以下のときだけ本文が入る。超える場合は `None` になり、フロントが `read_document` で取得する。
    pub content: Option<String>,
}

/// 初期ドキュメントを読めなかった理由。`kind` は [`crate::error::CoreError::kind`] と同じ識別子。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapError {
    pub path: String,
    pub kind: String,
    pub message: String,
}

/// フロント側の計測設定。無効なときも渡し、フロントは `enabled` を見て判断する。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceConfig {
    pub enabled: bool,
    /// フロント側が `performance.timeOrigin` を T0 起点に変換するための基準。
    pub t0_epoch_ms: f64,
}

/// CLI 引数から初期ペイロードを組み立てる。
///
/// この関数はウィンドウ生成の前に呼ばれ、ファイル I/O を含む。
/// 呼び出し側は WebView の初期化と並行になるよう配置すること。
pub fn build(
    args: &CliArgs,
    trace: &crate::trace::Trace,
    store: &StoreData,
    settings: &SettingsLoad,
    preview_theme: Option<UserTheme>,
) -> Bootstrap {
    let mut document = None;
    let mut document_error = None;

    // ディレクトリを渡された場合は、文書ではなくファイルツリーの基点になる（F-OPEN-02）。
    // 引数の中の最初のディレクトリだけを見る。2 つ以上渡す使い方は決めていない。
    let workspace_root = args
        .paths
        .iter()
        .find(|path| path.is_dir())
        .map(|path| path.display().to_string());

    if let Some(first) = args.paths.iter().find(|path| !path.is_dir()) {
        match read_first(first, trace) {
            Ok(doc) => document = Some(doc),
            Err(e) => {
                document_error = Some(BootstrapError {
                    path: first.display().to_string(),
                    kind: e.kind().to_string(),
                    message: e.to_string(),
                });
            }
        }
    }

    // 前回のタブを復元する（02.architecture/04-rust-responsibilities.md §5）。
    //
    // 引数が 1 つでもあれば復元しない。
    // `marxdown foo.md` には「foo.md を見たい」という意図があり、そこへ前回の 8 枚を混ぜない。ディレクトリ（`marxdown <dir>`）も同じ扱いである。
    //
    // 表示していた 1 枚だけをここで読む。残りは `session` に載せてフロントが開き直す。
    // 1 枚目を bootstrap に載せるのは、復元の最初の描画を `marxdown foo.md` と同じ速さにするためである（02.architecture/05-startup-sequence.md §1）。
    let mut session = Vec::new();
    let mut session_active = 0;
    if args.paths.is_empty() && !store.session.paths.is_empty() {
        let restored = store.session.clone().sanitized();
        if let Some(path) = restored.paths.get(restored.active) {
            // 開けなければ復元しない。通知は出さない（消えていることは想定内である）。
            if let Ok(doc) = read_first(Path::new(path), trace) {
                document = Some(doc);
                session_active = restored.active;
                session = restored.paths;
            }
        }
    }

    Bootstrap {
        version: 1,
        // 起動時の 1 枚目を既定にする。サテライトでは `crate::open_satellite` が置き換える。
        role: WindowRole::Main,
        transfer: None,
        document,
        document_error,
        mode: args.mode,
        bench_input: args.bench_input.is_some(),
        trace: Some(TraceConfig {
            enabled: trace.enabled(),
            t0_epoch_ms: trace.t0_epoch_ms(),
        }),
        // ディレクトリは対象から外す。開く先ではなくファイルツリーの基点である。
        pending_paths: args
            .paths
            .iter()
            .filter(|path| !path.is_dir())
            .skip(1)
            .map(|p| p.display().to_string())
            .collect(),
        workspace_root,
        unknown_args: args.unknown.clone(),
        session,
        session_active,
        recent: store.recent.clone(),
        zoom: store.zoom,
        panes: store.panes,
        split: store.split,
        settings: settings.values.clone(),
        settings_error: settings.broken.clone(),
        preview_theme,
    }
}

/// 1 枚目のドキュメントを読む。256KB 以下なら本文ごと bootstrap に載せる。
///
/// 引数で渡されたファイルと、セッションから復元するファイルの両方がここを通る。
fn read_first(path: &Path, trace: &crate::trace::Trace) -> CoreResult<BootstrapDocument> {
    let payload = document::read(path, None)?;
    let inline = payload.meta.size <= INLINE_CONTENT_LIMIT;
    trace.set_document(crate::trace::TraceDocument {
        path: payload.meta.path.clone(),
        size: payload.meta.size,
        inlined: inline,
    });
    Ok(BootstrapDocument {
        content: inline.then_some(payload.content),
        meta: payload.meta,
    })
}

/// `initialization_script` に渡す JS ソースを組み立てる。
///
/// CSP が `script-src 'self'` でインラインスクリプトを禁じているが、`initialization_script` は WebView のフックとして注入されるため CSP の対象外。
///
/// 本文をここで注入するのは、IPC 往復をクリティカルパスから外すためである（02.architecture/05-startup-sequence.md §1）。
/// フロントから取得する経路は用意しない。
pub fn to_init_script(bootstrap: &Bootstrap) -> String {
    let json = serde_json::to_string(bootstrap).unwrap_or_else(|_| "null".to_string());

    // `Object.freeze` により、本文 Markdown 由来のスクリプトから bootstrap を書き換えられる経路を塞ぐ（多層防御の一部）。
    format!(
        "globalThis.__MARXDOWN_BOOTSTRAP__ = Object.freeze({json});\
         globalThis.__MARXDOWN_T4__ = performance.now();"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn args_with(path: std::path::PathBuf) -> CliArgs {
        CliArgs {
            paths: vec![path],
            ..Default::default()
        }
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-boot-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn small_files_are_inlined() {
        let dir = temp_dir("small");
        let p = dir.join("a.md");
        std::fs::write(&p, "# hello\n").unwrap();
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &args_with(p),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );
        let doc = b.document.expect("document");
        assert_eq!(doc.content.as_deref(), Some("# hello\n"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn large_files_carry_metadata_only() {
        let dir = temp_dir("large");
        let p = dir.join("big.md");
        std::fs::write(&p, "x".repeat((INLINE_CONTENT_LIMIT + 1) as usize)).unwrap();
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &args_with(p),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );
        let doc = b.document.expect("document");
        assert!(doc.content.is_none(), "256KB 超は埋め込まない");
        assert!(doc.meta.size > INLINE_CONTENT_LIMIT);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_missing_file_becomes_an_error_not_a_panic() {
        let dir = temp_dir("missing");
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &args_with(dir.join("nope.md")),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );
        assert!(b.document.is_none());
        assert_eq!(
            b.document_error.map(|e| e.kind),
            Some("not-found".to_string())
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn extra_paths_are_kept_as_pending() {
        let dir = temp_dir("pending");
        let a = dir.join("a.md");
        std::fs::write(&a, "a").unwrap();
        let args = CliArgs {
            paths: vec![a, dir.join("b.md"), dir.join("c.md")],
            ..Default::default()
        };
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &args,
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );
        assert_eq!(b.pending_paths.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_script_carries_the_document_inline() {
        let dir = temp_dir("inline");
        let p = dir.join("a.md");
        std::fs::write(
            &p,
            "# secret-marker
",
        )
        .unwrap();
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &args_with(p),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );

        // 本文は初期化スクリプトに載る。ここが IPC 往復を 1 回省いている（02.architecture/05-startup-sequence.md §1）
        assert!(to_init_script(&b).contains("secret-marker"));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// 02.architecture/04-rust-responsibilities.md §5「bootstrap には設定全体を載せる」。
    /// フロントから取りに行く経路を作らないので、ここに全部載っている必要がある。
    #[test]
    fn the_script_carries_the_whole_settings() {
        let trace = crate::trace::Trace::start(Instant::now());
        let settings = SettingsLoad {
            values: crate::settings::Settings {
                theme: crate::settings::Theme::Dark,
                ..Default::default()
            },
            broken: None,
        };
        let b = build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &settings,
            None,
        );

        let script = to_init_script(&b);
        assert!(script.contains(r#""theme":"dark""#), "{script}");
        assert!(script.contains(r#""preview.maxWidth""#), "{script}");
        assert!(script.contains(r#""window.closeToTray":true"#), "{script}");
    }

    /// 壊れている事実も bootstrap に載る。通知バーは初回フレームで出せる（03.ux-spec/07-status-and-notifications.md §2）。
    #[test]
    fn a_broken_settings_file_is_reported_through_the_bootstrap() {
        let trace = crate::trace::Trace::start(Instant::now());
        let dir = temp_dir("broken-settings");
        let p = dir.join("settings.json");
        std::fs::write(&p, "{ 途中まで").unwrap();

        let b = build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &crate::settings::load(Some(&p)),
            None,
        );

        assert!(b.settings_error.is_some());
        assert_eq!(b.settings, crate::settings::Settings::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// 02.architecture/10-theming.md §3.3「`themes/` の 1 枚は bootstrap に同梱する」。
    ///
    /// ここが空だと、暗い配色を選んでいる人の初回フレームが既定の配色で描かれる。
    #[test]
    fn the_script_carries_the_selected_preview_theme() {
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            Some(UserTheme {
                id: "mine".into(),
                declarations: "--mx-color-bg: #101010;".into(),
            }),
        );

        let script = to_init_script(&b);
        assert!(script.contains("--mx-color-bg: #101010;"), "{script}");
    }

    /// 03.ux-spec/06-panes.md §3 / 02.architecture/04-rust-responsibilities.md §5「`panes` と `zoom` は bootstrap に載せる」。
    ///
    /// ここが空だと本文が一度全幅で描かれた後に幅が縮小して見える。
    /// フロントが `ready()` の後に IPC で聞きに行く経路は作らない。
    #[test]
    fn the_script_carries_the_pane_state() {
        let trace = crate::trace::Trace::start(Instant::now());
        let store = StoreData {
            panes: crate::store::Panes {
                right: crate::store::PaneState {
                    open: true,
                    width: 320.0,
                },
                ..Default::default()
            },
            ..Default::default()
        };

        let b = build(
            &CliArgs::default(),
            &trace,
            &store,
            &SettingsLoad::default(),
            None,
        );

        let script = to_init_script(&b);
        assert!(script.contains(r#""panes":{"#), "{script}");
        assert!(
            script.contains(r#""right":{"open":true,"width":320.0}"#),
            "{script}"
        );
    }

    #[test]
    fn the_script_is_valid_javascript_shaped_output() {
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            None,
        );
        let script = to_init_script(&b);
        assert!(script.starts_with("globalThis.__MARXDOWN_BOOTSTRAP__ = Object.freeze({"));
        assert!(script.contains("__MARXDOWN_T4__"));
    }

    /// セッションの復元。
    mod session {
        use super::*;

        fn store_with(dir: &std::path::Path, names: &[&str], active: usize) -> StoreData {
            let paths = names
                .iter()
                .map(|name| {
                    let path = dir.join(name);
                    std::fs::write(
                        &path,
                        format!(
                            "# {name}
"
                        ),
                    )
                    .unwrap();
                    path.display().to_string()
                })
                .collect();
            StoreData {
                session: crate::store::Session { paths, active },
                ..Default::default()
            }
        }

        fn build_with(args: CliArgs, store: &StoreData) -> Bootstrap {
            let trace = crate::trace::Trace::start(Instant::now());
            build(&args, &trace, store, &SettingsLoad::default(), None)
        }

        #[test]
        fn without_arguments_the_active_tab_is_read_and_the_order_is_carried() {
            let dir = temp_dir("session-restore");
            let store = store_with(&dir, &["a.md", "b.md", "c.md"], 1);

            let b = build_with(CliArgs::default(), &store);

            // 表示していた 1 枚が bootstrap に載る（最初の描画を速くするため）。
            assert_eq!(
                b.document.expect("document").content.as_deref(),
                Some(
                    "# b.md
"
                )
            );
            assert_eq!(b.session.len(), 3);
            assert_eq!(b.session_active, 1);
            std::fs::remove_dir_all(&dir).ok();
        }

        /// 引数が 1 つでもあれば復元しない。
        #[test]
        fn an_argument_suppresses_the_restore() {
            let dir = temp_dir("session-arg");
            let store = store_with(&dir, &["a.md", "b.md"], 0);
            let opened = dir.join("opened.md");
            std::fs::write(
                &opened,
                "# opened
",
            )
            .unwrap();

            let b = build_with(args_with(opened), &store);

            assert_eq!(
                b.document.expect("document").content.as_deref(),
                Some(
                    "# opened
"
                )
            );
            assert!(b.session.is_empty(), "引数があるときは前回のタブを混ぜない");
            std::fs::remove_dir_all(&dir).ok();
        }

        /// `marxdown <dir>` も引数である。ファイルツリーの基点を指定した意図に前回の続きを混ぜない。
        #[test]
        fn a_directory_argument_also_suppresses_the_restore() {
            let dir = temp_dir("session-dir");
            let store = store_with(&dir, &["a.md"], 0);

            let b = build_with(args_with(dir.clone()), &store);

            assert!(b.session.is_empty());
            assert_eq!(b.workspace_root, Some(dir.display().to_string()));
            std::fs::remove_dir_all(&dir).ok();
        }

        /// 消えたファイルが表示中だった場合。復元しないだけで、起動は続く。
        #[test]
        fn a_missing_active_file_gives_up_the_restore() {
            let dir = temp_dir("session-gone");
            let store = StoreData {
                session: crate::store::Session {
                    paths: vec![dir.join("gone.md").display().to_string()],
                    active: 0,
                },
                ..Default::default()
            };

            let b = build_with(CliArgs::default(), &store);

            assert!(b.document.is_none());
            assert!(b.document_error.is_none(), "復元の失敗は通知に出さない");
            assert!(b.session.is_empty());
            std::fs::remove_dir_all(&dir).ok();
        }
    }
}
