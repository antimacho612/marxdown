//! カスタム CSS の読み込み（F-CONF-07 / 02.architecture/10-theming.md §3）。
//!
//! ```text
//! %APPDATA%\com.antimacho612.marxdown\custom.css
//! ```
//!
//! # 設定項目は無い
//!
//! **ファイルが存在すれば効く。** 有効化のスイッチもパスの設定も置かない
//! （Principle 3）。したがって「ファイルが無い」は正常な状態であり、
//! 通知も警告も出さない。初回起動が常にそれである。
//!
//! # CSP との関係
//!
//! `tauri.conf.json` の CSP は `style-src 'self' 'unsafe-inline'` なので、
//! `file://` や `asset:` のスタイルシートを `<link>` では読めない。
//! **Rust 側で読み、フロントが `<style>` として注入する**のはそのため
//! （ADR-0006 / 02.architecture/10-theming.md §3）。CSP は緩めない。
//!
//! # 中身は検証しない
//!
//! ユーザーが自分でアプリデータ領域に置いたファイルであり、ADR-0006 の
//! サニタイズ層は**ドキュメント由来の HTML** に対する防御である。
//! ここに CSS サニタイザを足すと、壊れるのは正当なテーマのほうになる。
//!
//! Rust 側が見るのは**サイズだけ**。適用範囲を本文に閉じ込める `@scope` は
//! フロント側（`src/features/settings/custom-css.ts`）の担当で、
//! CSS のパーサを持っているのはあちらしかない。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::document::atomic;
use crate::error::CoreResult;

const FILE_NAME: &str = "custom.css";

/// bootstrap へ同梱する上限（02.architecture/10-theming.md §3 の表）。
///
/// **小さいうちに載せる理由は FOUC を防ぐこと。** ダークな背景を当てている
/// カスタム CSS を `ready()` の後に適用すると、白い初期画面が一瞬見える。
/// 読み取りは WebView 初期化と並行するので（02.architecture/05-startup-sequence.md §1）、クリティカルパスの時間は
/// 実質増えない。
pub const INLINE_LIMIT: u64 = 64 * 1024;

/// これを超えるものは読まない（02.architecture/10-theming.md §3）。通知バーで知らせて終わりにする。
///
/// 本文の `MAX_READ_BYTES`（64MB）より 2 桁小さいのは、こちらが
/// **1 打鍵ごとに再パースされるスタイルシート**だからで、
/// 開いて読むだけのドキュメントと同じ上限を与える理由がない。
pub const MAX_BYTES: u64 = 1024 * 1024;

/// カスタム CSS の読み込み結果。
///
/// 「無かった」と「大きすぎた」と「読めなかった」を**呼び出し側が区別できる形**で運ぶ。
/// 混ぜると、初回起動（ファイルが無い）で通知バーが出る実装になる。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomCss {
    /// 読み込んだ CSS。`None` は「無い」か「読まなかった」。
    pub css: Option<String>,
    /// bootstrap には載せなかったが、`read_custom_css` で取りに行けば読める
    /// （64KB 超 1MB 以下）。
    pub deferred: bool,
    /// 適用できなかった理由。通知バーに出す（02.architecture/10-theming.md §3 の表）。
    pub problem: Option<CustomCssProblem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomCssProblem {
    pub kind: ProblemKind,
    /// 表示用の文字列。`settings.rs` と同じ理由で `PathBuf` にしない
    /// （非 UTF-8 のパスで bootstrap のシリアライズごと落とさない）。
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProblemKind {
    /// 1MB 超。読まない。
    TooLarge,
    /// 権限・UTF-8 でない・その他の I/O エラー。
    Unreadable,
}

/// カスタム CSS の置き場所。`settings.json` / `state.json` と同じディレクトリ。
pub fn custom_css_path(identifier: &str) -> Option<PathBuf> {
    Some(crate::store::config_dir(identifier)?.join(FILE_NAME))
}

/// 読む。**「無い」を失敗にしない**（02.architecture/10-theming.md §3）。
///
/// `inline_limit` を超えたときは中身を読まずに `deferred` を立てる。
/// 起動時は `INLINE_LIMIT`、`read_custom_css` からは `MAX_BYTES` を渡す
/// （後者は「取りに来た」経路なので、読める上限まで読む）。
pub fn load(path: Option<&Path>, inline_limit: u64) -> CustomCss {
    let Some(path) = path else {
        return CustomCss::default();
    };

    // 先に大きさを見る。`read_to_string` してから捨てるのでは、
    // 上限を設けている意味がない。
    let size = match std::fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return CustomCss::default(),
        Err(e) => return unreadable(path, e.to_string()),
    };

    if size > MAX_BYTES {
        return CustomCss {
            problem: Some(CustomCssProblem {
                kind: ProblemKind::TooLarge,
                path: path.display().to_string(),
                message: format!("{size} bytes > {MAX_BYTES} bytes"),
            }),
            ..CustomCss::default()
        };
    }

    if size > inline_limit {
        return CustomCss {
            deferred: true,
            ..CustomCss::default()
        };
    }

    match std::fs::read_to_string(path) {
        Ok(css) => CustomCss {
            css: Some(css),
            ..CustomCss::default()
        },
        Err(e) => unreadable(path, e.to_string()),
    }
}

fn unreadable(path: &Path, message: String) -> CustomCss {
    CustomCss {
        problem: Some(CustomCssProblem {
            kind: ProblemKind::Unreadable,
            path: path.display().to_string(),
            message,
        }),
        ..CustomCss::default()
    }
}

/// 無ければ雛形を作る。**既にあるファイルには 1 バイトも触らない。**
///
/// 設定 UI の「カスタム CSS を開く」から呼ぶ。空のファイルではなく雛形にしてあるのは、
/// 開いた人が最初に知る必要のあること（**本文にしか当たらない** / 変数は `:scope` に書く）が
/// ファイルの中にしか書けないため。設定 UI に説明を並べる代わりにここへ置く。
pub fn ensure_exists(path: &Path) -> CoreResult<()> {
    if path.exists() {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    atomic::write(path, TEMPLATE.as_bytes())
}

/// 雛形。**説明だけで、有効な宣言を 1 つも含めない。**
/// 既定の見た目は既定のままであるべきで（F-CONF-02）、
/// ここに例を「効く形」で書くと、開いた瞬間に見た目が変わる。
const TEMPLATE: &str = "\
/*
 * Marxdown のカスタム CSS。
 *
 * ここに書いた CSS は **本文（プレビュー）にだけ** 当たります。
 * タイトルバー・ステータスバー・通知バーには効きません。
 *
 * 変数を上書きするときは :scope に書きます。
 *
 *   :scope { --mx-content-width: 90ch }
 *   h1 { border-bottom: 1px solid }
 *
 * 保存すると、アプリを再起動しなくてもすぐ反映されます。
 */
";

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-css-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 02.architecture/10-theming.md §3 の表の 1 行目。**初回起動が常にこれ**であり、通知の材料にしない。
    #[test]
    fn a_missing_file_is_a_normal_state() {
        let d = temp_dir("missing");
        let loaded = load(Some(&d.join("custom.css")), INLINE_LIMIT);

        assert_eq!(loaded, CustomCss::default());
        assert!(loaded.problem.is_none(), "無いことは問題ではない");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_small_file_is_inlined() {
        let d = temp_dir("small");
        let p = d.join("custom.css");
        std::fs::write(&p, "h1 { color: red }").unwrap();

        let loaded = load(Some(&p), INLINE_LIMIT);

        assert_eq!(loaded.css.as_deref(), Some("h1 { color: red }"));
        assert!(!loaded.deferred);
        std::fs::remove_dir_all(&d).ok();
    }

    /// 64KB 超は bootstrap に載せない。`ready()` の後に取りに来てもらう。
    #[test]
    fn a_file_over_the_inline_limit_is_deferred() {
        let d = temp_dir("deferred");
        let p = d.join("custom.css");
        std::fs::write(&p, "a".repeat(INLINE_LIMIT as usize + 1)).unwrap();

        let loaded = load(Some(&p), INLINE_LIMIT);

        assert!(loaded.deferred);
        assert!(loaded.css.is_none(), "中身は読まない（起動を太らせない）");
        assert!(
            loaded.problem.is_none(),
            "取りに来れば読めるので問題ではない"
        );

        // 取りに来た経路（`read_custom_css`）では読める。
        let fetched = load(Some(&p), MAX_BYTES);
        assert!(!fetched.deferred);
        assert_eq!(
            fetched.css.map(|c| c.len()),
            Some(INLINE_LIMIT as usize + 1)
        );
        std::fs::remove_dir_all(&d).ok();
    }

    /// 1MB 超は**どちらの経路でも読まない**。通知バーで知らせて終わり。
    #[test]
    fn a_file_over_the_hard_limit_is_not_read() {
        let d = temp_dir("huge");
        let p = d.join("custom.css");
        std::fs::write(&p, "a".repeat(MAX_BYTES as usize + 1)).unwrap();

        let loaded = load(Some(&p), MAX_BYTES);

        assert!(loaded.css.is_none());
        assert!(!loaded.deferred, "取りに来ても読めない");
        assert_eq!(
            loaded.problem.map(|p| p.kind),
            Some(ProblemKind::TooLarge),
            "黙って無視せず、理由を運ぶ"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    /// UTF-8 として読めないファイル。**適用しないが、起動は止めない。**
    #[test]
    fn a_file_that_is_not_utf8_is_reported_as_unreadable() {
        let d = temp_dir("binary");
        let p = d.join("custom.css");
        std::fs::write(&p, [0xff_u8, 0xfe, 0x00, 0x80]).unwrap();

        let loaded = load(Some(&p), INLINE_LIMIT);

        assert!(loaded.css.is_none());
        assert_eq!(
            loaded.problem.map(|p| p.kind),
            Some(ProblemKind::Unreadable)
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn the_template_is_created_only_when_the_file_is_missing() {
        let d = temp_dir("ensure");
        let p = d.join("custom.css");

        ensure_exists(&p).unwrap();
        let created = std::fs::read_to_string(&p).unwrap();
        assert!(created.contains("本文（プレビュー）にだけ"), "{created}");

        // 既にあるファイルは書き換えない。ユーザーが書いた CSS が消えたら最悪。
        std::fs::write(&p, "h1 { color: red }").unwrap();
        ensure_exists(&p).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "h1 { color: red }");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 雛形は**読み込んでも何も起きない**（全体が 1 つのコメント）。
    /// 開いた瞬間に見た目が変わると、F-CONF-02「既定のままで完成している」に反する。
    #[test]
    fn the_template_is_one_comment_and_nothing_else() {
        let trimmed = TEMPLATE.trim();
        assert!(trimmed.starts_with("/*"), "{TEMPLATE}");
        assert!(trimmed.ends_with("*/"), "{TEMPLATE}");
        // コメントが途中で閉じていれば、その後ろは有効な CSS になる。
        assert_eq!(trimmed.matches("*/").count(), 1, "{TEMPLATE}");
    }
}
