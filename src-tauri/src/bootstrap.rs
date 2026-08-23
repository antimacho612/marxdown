//! 起動時の先読みと初期ペイロード生成（02.architecture.md §5.1）。
//!
//! # 設計の要点
//!
//! 1. **ファイル読み込みと WebView 起動を並行させる。**
//!    WebView2 の初期化には数百 ms かかる。その待ち時間はファイル I/O にとって無料の時間。
//!
//! 2. **初期コンテンツを IPC 往復ではなく初期化スクリプトで渡す。**
//!    `invoke()` の往復を待つと、WebView 準備完了 → リクエスト → レスポンスという
//!    最低 1 ラウンドトリップが本文表示前に挟まる。
//!
//! 3. **256KB を超える本文は埋め込まない。**
//!    初期化スクリプトは文字列として WebView に渡されるため、
//!    巨大な本文を JSON 文字列化するコストが往復コストを上回る点がある。

use serde::Serialize;

use crate::cli::{CliArgs, SpikeFlags, ViewMode};
use crate::document::{self, DocumentMeta, INLINE_CONTENT_LIMIT};

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
    pub spike: SpikeFlags,
    pub trace: Option<TraceConfig>,
    /// 引数として渡されたが 1 枚目にならなかったパス（M3 のタブで開く）。
    pub pending_paths: Vec<String>,
    pub unknown_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapDocument {
    #[serde(flatten)]
    pub meta: DocumentMeta,
    /// 256KB 以下のときだけ本文が入る。超える場合は `None` で、
    /// フロントが `read_document` で取りに行く。
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapError {
    pub path: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceConfig {
    pub enabled: bool,
    /// フロント側が `performance.timeOrigin` を T0 起点に変換するための基準。
    pub t0_epoch_ms: f64,
}

/// CLI 引数から初期ペイロードを組み立てる。
///
/// **この関数はウィンドウ生成の前に呼ばれ、ファイル I/O を含む。**
/// 呼び出し側は WebView の初期化と並行になるよう配置すること。
pub fn build(args: &CliArgs, trace: &crate::trace::Trace) -> Bootstrap {
    let mut document = None;
    let mut document_error = None;

    if let Some(first) = args.paths.first() {
        match document::read(first) {
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
        spike: args.spike,
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
    }
}

/// `initialization_script` に渡す JS ソースを組み立てる。
///
/// CSP が `script-src 'self'` でインラインスクリプトを禁じているが、
/// `initialization_script` は WebView のフックとして注入されるため CSP の対象外。
///
/// S2 の `--spike-bootstrap=invoke` のときは本文を落として注入し、
/// フロントに `take_bootstrap` で取りに行かせる（IPC 往復のコストを測るため）。
pub fn to_init_script(bootstrap: &Bootstrap, channel: crate::cli::BootstrapChannel) -> String {
    let payload = match channel {
        crate::cli::BootstrapChannel::Script => std::borrow::Cow::Borrowed(bootstrap),
        crate::cli::BootstrapChannel::Invoke => {
            let mut stripped = bootstrap.clone();
            if let Some(doc) = stripped.document.as_mut() {
                doc.content = None;
            }
            std::borrow::Cow::Owned(stripped)
        }
    };

    let json = serde_json::to_string(payload.as_ref()).unwrap_or_else(|_| "null".to_string());

    // `Object.freeze` しておくことで、本文 Markdown 由来のスクリプトに
    // bootstrap を書き換えられる経路を潰す（多層防御の一部）。
    format!(
        "globalThis.__MARXDOWN_BOOTSTRAP__ = Object.freeze({json});\
         globalThis.__MARXDOWN_T4__ = performance.now();"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::BootstrapChannel;
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
        let b = build(&args_with(p), &trace);
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
        let b = build(&args_with(p), &trace);
        let doc = b.document.expect("document");
        assert!(doc.content.is_none(), "256KB 超は埋め込まない");
        assert!(doc.meta.size > INLINE_CONTENT_LIMIT);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_missing_file_becomes_an_error_not_a_panic() {
        let dir = temp_dir("missing");
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(&args_with(dir.join("nope.md")), &trace);
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
        let b = build(&args, &trace);
        assert_eq!(b.pending_paths.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_invoke_channel_strips_content_from_the_script() {
        let dir = temp_dir("invoke");
        let p = dir.join("a.md");
        std::fs::write(&p, "# secret-marker\n").unwrap();
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(&args_with(p), &trace);

        let script = to_init_script(&b, BootstrapChannel::Script);
        assert!(script.contains("secret-marker"));

        let invoke = to_init_script(&b, BootstrapChannel::Invoke);
        assert!(
            !invoke.contains("secret-marker"),
            "invoke 経路では本文を注入しない"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_script_is_valid_javascript_shaped_output() {
        let trace = crate::trace::Trace::start(Instant::now());
        let b = build(&CliArgs::default(), &trace);
        let script = to_init_script(&b, BootstrapChannel::Script);
        assert!(script.starts_with("globalThis.__MARXDOWN_BOOTSTRAP__ = Object.freeze({"));
        assert!(script.contains("__MARXDOWN_T4__"));
    }
}
