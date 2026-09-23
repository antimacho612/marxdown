//! 改行コードの検出と復元。
//!
//! 02.architecture/04-rust-responsibilities.md §2 の「メモリ上は常に LF、ディスク上は元の EOL」を実装する。
//! これは N-CMP-03（触っていない箇所のバイト列を変えない）の中核。

use serde::{Deserialize, Serialize};

/// 改行コード。CR 単独は扱わず、読み込み時に LF へ変換する（[`normalize`]）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    Crlf,
}

impl Eol {
    /// 実際に書き出す文字列。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lf => "\n",
            Self::Crlf => "\r\n",
        }
    }

    /// プラットフォーム既定（新規ファイル用）。
    pub fn platform_default() -> Self {
        if cfg!(windows) {
            Self::Crlf
        } else {
            Self::Lf
        }
    }
}

/// 支配的な改行コードを判定する。
///
/// 混在している場合は多数派を採り、同数なら CRLF を優先する。
/// Windows を第一優先とすること、および CRLF ファイルの一部が LF になっている状況のほうが逆より頻度が高いことによる。
///
/// 改行が 1 つも無いファイルはプラットフォーム既定を返す。
/// 1 行だけのファイルを保存したときに、その環境で自然な改行が入ってほしいため。
pub fn detect(text: &str) -> Eol {
    let bytes = text.as_bytes();
    let mut lf = 0usize;
    let mut crlf = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            if i > 0 && bytes[i - 1] == b'\r' {
                crlf += 1;
            } else {
                lf += 1;
            }
        }
        i += 1;
    }
    if crlf == 0 && lf == 0 {
        return Eol::platform_default();
    }
    if crlf >= lf {
        Eol::Crlf
    } else {
        Eol::Lf
    }
}

/// すべての改行を LF に正規化する。
///
/// CR 単独（古い Mac）も LF に変換する。
/// 復元時は検出した Eol に戻すため、CR 単独のファイルは CRLF か LF のどちらかになる。
/// 対象ユーザー（開発者）の環境では実質的に発生しない。
pub fn normalize(text: &str) -> String {
    if !text.contains('\r') {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            out.push('\n');
        } else {
            out.push(c);
        }
    }
    out
}

/// LF 正規化されたテキストを、保存用に元の改行コードへ戻す。
pub fn restore(text: &str, eol: Eol) -> String {
    match eol {
        Eol::Lf => text.to_string(),
        Eol::Crlf => text.replace('\n', "\r\n"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_lf() {
        assert_eq!(detect("a\nb\nc"), Eol::Lf);
    }

    #[test]
    fn detects_crlf() {
        assert_eq!(detect("a\r\nb\r\nc"), Eol::Crlf);
    }

    #[test]
    fn mixed_takes_the_majority() {
        assert_eq!(detect("a\r\nb\nc\r\nd\r\n"), Eol::Crlf);
        assert_eq!(detect("a\nb\nc\r\n"), Eol::Lf);
    }

    #[test]
    fn no_newline_falls_back_to_platform_default() {
        assert_eq!(detect("single line"), Eol::platform_default());
        assert_eq!(detect(""), Eol::platform_default());
    }

    #[test]
    fn normalize_converts_crlf_and_bare_cr() {
        assert_eq!(normalize("a\r\nb\rc\nd"), "a\nb\nc\nd");
    }

    #[test]
    fn normalize_is_a_noop_without_cr() {
        assert_eq!(normalize("a\nb\n"), "a\nb\n");
    }

    #[test]
    fn round_trip_preserves_bytes() {
        for original in ["a\r\nb\r\nc\r\n", "a\nb\nc\n", "a\r\nb\r\n"] {
            let eol = detect(original);
            let normalized = normalize(original);
            assert_eq!(restore(&normalized, eol), original, "input: {original:?}");
        }
    }

    #[test]
    fn trailing_newline_is_preserved() {
        // 末尾改行の有無はテキストそのものが持つ情報であり、正規化と復元のどちらでも足したり削ったりしない。
        assert_eq!(normalize("a\r\n"), "a\n");
        assert_eq!(normalize("a"), "a");
        assert_eq!(restore("a\n", Eol::Crlf), "a\r\n");
        assert_eq!(restore("a", Eol::Crlf), "a");
    }
}
