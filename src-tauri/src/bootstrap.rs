//! 起動時の先読みと初期ペイロード生成（02.architecture/05-startup-sequence.md §1）。
//!
//! ファイル読み込みと WebView 起動を並行させる。
//! WebView2 の初期化には数百 ms かかるため、その待ち時間をファイル I/O に充てられる。
//! 初期コンテンツは IPC 往復ではなく初期化スクリプトで渡す。
//! `invoke()` の往復を待つと、WebView の準備完了後にリクエストとレスポンスの往復が発生し、本文の表示が遅れるためである。
//! ただし 256KB を超える本文は埋め込まない。
//! 初期化スクリプトは文字列として WebView に渡されるため、巨大な本文を JSON 文字列化するコストが往復のコストを上回る場合がある。

use serde::Serialize;

use crate::cli::{CliArgs, ViewMode};
use crate::custom_css::CustomCss;
use crate::document::{self, DocumentMeta, INLINE_CONTENT_LIMIT};
use crate::settings::{Settings, SettingsLoad, SettingsProblem};
use crate::store::{Panes, RecentEntry, StoreData};

/// フロントエンドが `window.__MARXDOWN_BOOTSTRAP__` として同期的に読む値。
/// 対応するフロント側の型は `src/platform/types.ts` の `Bootstrap`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub version: u32,
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
    /// 引数として渡されたが 1 枚目にならなかったパス（M3 のタブで開く）。
    pub pending_paths: Vec<String>,
    pub unknown_args: Vec<String>,
    /// 最近開いたファイル（F-OPEN-09）。
    /// Welcome 画面が起動直後に描画するため、IPC 往復ではなくここに載せる（03.ux-spec/08-empty-states.md §1）。
    pub recent: Vec<RecentEntry>,
    /// 表示倍率（F-VIEW-11）。最初のフレームから正しい倍率で描画するために必要になる。
    /// 後から適用すると、本文が一度既定倍率で描画された後に別の倍率へ変化して見える。
    pub zoom: f64,
    /// ペインの開閉と幅（F-NAV-04 / 03.ux-spec/06-panes.md §3）。
    ///
    /// 倍率と同じ理由でここに載る。
    /// 後から当てると、本文が一度全幅で描かれた後に幅が縮小して見える（02.architecture/04-rust-responsibilities.md §5「`panes` と `zoom` は bootstrap に載せる」）。
    pub panes: Panes,
    /// Split の分割比（03.ux-spec/03-split-mode.md §1）。
    /// 倍率・ペインと同じ理由でここに載る。
    /// 後から当てると、Split で開いたときに 50:50 の状態が一度描かれた後に分割比が変化して見える。
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
    /// カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3）。
    ///
    /// 64KB 以下のときだけ中身が入る。
    /// 小さいうちにここへ載せるのは、暗い背景を指定しているときに白い初期画面が一瞬表示されるのを防ぐためである。
    /// 超える場合は `deferred` が立ち、フロントが `read_custom_css` で取得する。
    pub custom_css: CustomCss,
    /// エディター用のカスタム CSS（`editor.css`）。本文用と同じ扱いである。
    /// 別のフィールドにしているのは、適用先（`@scope` の起点）が違うためである。
    pub editor_css: CustomCss,
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
    custom_css: CustomCss,
    editor_css: CustomCss,
) -> Bootstrap {
    let mut document = None;
    let mut document_error = None;

    if let Some(first) = args.paths.first() {
        match document::read(first, None) {
            Ok(payload) => {
                let inline = payload.meta.size <= INLINE_CONTENT_LIMIT;
                trace.set_document(crate::trace::TraceDocument {
                    path: payload.meta.path.clone(),
                    size: payload.meta.size,
                    inlined: inline,
                });
                document = Some(BootstrapDocument {
                    content: inline.then_some(payload.content),
                    meta: payload.meta,
                });
            }
            Err(e) => {
                document_error = Some(BootstrapError {
                    path: first.display().to_string(),
                    kind: e.kind().to_string(),
                    message: e.to_string(),
                });
            }
        }
    }

    Bootstrap {
        version: 1,
        document,
        document_error,
        mode: args.mode,
        bench_input: args.bench_input.is_some(),
        trace: Some(TraceConfig {
            enabled: trace.enabled(),
            t0_epoch_ms: trace.t0_epoch_ms(),
        }),
        pending_paths: args
            .paths
            .iter()
            .skip(1)
            .map(|p| p.display().to_string())
            .collect(),
        unknown_args: args.unknown.clone(),
        recent: store.recent.clone(),
        zoom: store.zoom,
        panes: store.panes,
        split: store.split,
        settings: settings.values.clone(),
        settings_error: settings.broken.clone(),
        custom_css,
        editor_css,
    }
}

/// `initialization_script` に渡す JS ソースを組み立てる。
///
/// CSP が `script-src 'self'` でインラインスクリプトを禁じているが、
/// `initialization_script` は WebView のフックとして注入されるため CSP の対象外。
///
/// 本文をここで注入するのは、IPC 往復（実測 約 17ms）をクリティカルパスから外すためである（02.architecture/05-startup-sequence.md §1）。
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
            CustomCss::default(),
            CustomCss::default(),
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
            CustomCss::default(),
            CustomCss::default(),
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
            CustomCss::default(),
            CustomCss::default(),
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
            CustomCss::default(),
            CustomCss::default(),
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
            CustomCss::default(),
            CustomCss::default(),
        );

        // 本文は初期化スクリプトに載る。ここが IPC 往復を 1 回省いている（02.architecture/05-startup-sequence.md §1）
        assert!(to_init_script(&b).contains("secret-marker"));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// 02.architecture/04-rust-responsibilities.md §5「bootstrap には設定全体を載せる」。
    /// **フロントから取りに行く経路を作らない**ので、ここに全部載っている必要がある。
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
            CustomCss::default(),
            CustomCss::default(),
        );

        let script = to_init_script(&b);
        assert!(script.contains(r#""theme":"dark""#), "{script}");
        assert!(script.contains(r#""preview.maxWidth""#), "{script}");
        assert!(
            script.contains(r#""window.closeBehavior":"tray""#),
            "{script}"
        );
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
            CustomCss::default(),
            CustomCss::default(),
        );

        assert!(b.settings_error.is_some());
        assert_eq!(b.settings, crate::settings::Settings::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// 02.architecture/10-theming.md §3「64KB 以下は bootstrap に同梱する」。
    ///
    /// **ここが空だと FOUC になる。** ダークな背景を当てているカスタム CSS を
    /// `ready()` の後に適用すると、白い初期画面が一瞬見える。
    #[test]
    fn the_script_carries_the_custom_css() {
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &SettingsLoad::default(),
            CustomCss {
                css: Some(":scope { --mx-content-width: 90ch }".into()),
                ..CustomCss::default()
            },
            CustomCss {
                css: Some(":scope { --mx-color-bg: #1a1b26 }".into()),
                ..CustomCss::default()
            },
        );

        let script = to_init_script(&b);
        assert!(script.contains("--mx-content-width: 90ch"), "{script}");
    }

    /// 03.ux-spec/06-panes.md §3 /02.architecture/04-rust-responsibilities.md §5「`panes` と `zoom` は bootstrap に載せる」。
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
            CustomCss::default(),
            CustomCss::default(),
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
            CustomCss::default(),
            CustomCss::default(),
        );
        let script = to_init_script(&b);
        assert!(script.starts_with("globalThis.__MARXDOWN_BOOTSTRAP__ = Object.freeze({"));
        assert!(script.contains("__MARXDOWN_T4__"));
    }
}
