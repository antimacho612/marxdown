//! glob パターンの照合（`explorer.exclude` / F-NAV-03）。
//!
//! I/O を持たない。パスの文字列を受け取って一致を返すだけである。
//!
//! 依存は増やさない。
//! `globset` は `regex` を引き込み、配布物のサイズ予算（05.performance-budget/04-targets.md §4.6）に対して割に合わない。
//! 扱う対象は設定に書かれた数本のパターンであり、必要なのは `*` / `?` / `**` の 3 つだけである。
//!
//! 対応しない記法は `[abc]` と `{a,b}` である。
//! 後者は「除外したいものを 1 行ずつ足す」で代替でき、前者は使う場面がほぼない。

use std::path::Path;

/// パターン 1 本あたりのセグメント数の上限。
///
/// `**` はセグメント数に対して分岐するため、手で書いた極端に深いパターンで時間を使わないための保険である。
const MAX_SEGMENTS: usize = 32;

/// 受け付けるパターンの本数の上限。
///
/// 1 エントリごとに全パターンを試すため、件数の多いディレクトリでは本数がそのまま走査コストになる。
const MAX_PATTERNS: usize = 64;

/// パターン 1 本あたりの長さの上限。
const MAX_PATTERN_LEN: usize = 256;

/// パターンを構成する 1 セグメント。
#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    /// `**`。0 個以上のセグメントに一致する。
    AnyDepth,
    /// 1 セグメントに一致する並び。`*` と `?` を含みうる。
    Name(String),
}

/// 照合できる形に直したパターン 1 本。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pattern {
    segments: Vec<Segment>,
}

impl Pattern {
    /// 1 本を読み取る。空になるもの・長すぎるものは `None`。
    ///
    /// `/` を含まないパターンは `**/<pattern>` として扱う。
    /// `dist` と書いたときにどの階層の `dist` にも一致するほうが、書いた側の意図に近い（`.gitignore` と同じ規則）。
    /// 階層を指定したいときは `docs/generated` のように `/` を書く。
    ///
    /// 区切りは `/` と `\` の両方を受ける。Windows の表記でそのまま貼れるようにするためである。
    /// 先頭の `./` と `/`、末尾の `/` は落とす。いずれも基点からの相対という意味を変えない。
    ///
    /// 名前を 1 つも含まないもの（`**` や `.` だけ）は読み取らない。
    /// 木のすべてを隠すパターンであり、そう書きたかった場面より書き損じである場面のほうが多い。
    pub fn parse(source: &str) -> Option<Self> {
        let source = source.trim();
        if source.is_empty() || source.len() > MAX_PATTERN_LEN {
            return None;
        }

        let normalized = source.replace('\\', "/");
        let mut body = normalized.as_str();
        while let Some(rest) = body.strip_prefix("./") {
            body = rest;
        }
        let body = body.trim_matches('/');
        if body.is_empty() {
            return None;
        }

        let anchored = body.contains('/');
        let mut segments = Vec::new();
        if !anchored {
            segments.push(Segment::AnyDepth);
        }
        for part in body.split('/') {
            // `a//b` の空のセグメントと `a/./b` の `.` は、無いものとして扱う。
            if part.is_empty() || part == "." {
                continue;
            }
            let segment = if part == "**" {
                Segment::AnyDepth
            } else {
                Segment::Name(fold_case(part))
            };
            // `**/**` は `**` と同じ意味である。畳んでおくと照合の分岐が減る。
            if segment == Segment::AnyDepth && segments.last() == Some(&Segment::AnyDepth) {
                continue;
            }
            segments.push(segment);
        }

        if segments.len() > MAX_SEGMENTS || !segments.iter().any(|s| matches!(s, Segment::Name(_)))
        {
            return None;
        }
        Some(Self { segments })
    }

    /// 基点からの相対パスに一致するか。
    ///
    /// `relative` は基点からの相対パスで、区切りは OS の表記のままでよい。
    /// 絶対パスを渡してはいけない。パターンは基点からの相対として書かれている。
    pub fn matches(&self, relative: &Path) -> bool {
        let parts: Vec<String> = relative
            .components()
            .map(|c| fold_case(&c.as_os_str().to_string_lossy()))
            .collect();
        match_segments(&self.segments, &parts)
    }
}

/// 設定に書かれたパターンの並び。読み取れなかったものは落ちている。
///
/// 空かどうかを呼び出し側が確かめられるようにしてあるのは、
/// 1 件も無いときに相対パスの計算そのものを省くためである。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PatternSet {
    patterns: Vec<Pattern>,
}

impl PatternSet {
    /// 設定の文字列から作る。読み取れない 1 本は黙って落とす。
    ///
    /// 1 本の書き損じで残り全部を無効にはしない。
    /// 除外は「見せない」方向の設定であり、部分的に効かないほうが、丸ごと効かないより気づきやすい。
    pub fn new(sources: &[String]) -> Self {
        Self {
            patterns: sources
                .iter()
                .filter_map(|source| Pattern::parse(source))
                .take(MAX_PATTERNS)
                .collect(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.patterns.is_empty()
    }

    /// いずれかのパターンに一致するか。
    pub fn matches(&self, relative: &Path) -> bool {
        self.patterns.iter().any(|p| p.matches(relative))
    }
}

/// 比較用に揃えた形。Windows では大文字小文字を区別しない（`scope::component_eq` と同じ基準）。
fn fold_case(value: &str) -> String {
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value.to_owned()
    }
}

/// セグメントの並びどうしを照合する。`**` のところだけ後戻りする。
fn match_segments(segments: &[Segment], parts: &[String]) -> bool {
    match segments.split_first() {
        None => parts.is_empty(),
        Some((Segment::AnyDepth, rest)) => {
            // 0 個から順に伸ばす。末尾が `**` なら残り全部に一致する。
            (0..=parts.len()).any(|skip| match_segments(rest, &parts[skip..]))
        }
        Some((Segment::Name(name), rest)) => match parts.split_first() {
            Some((part, tail)) => match_name(name, part) && match_segments(rest, tail),
            None => false,
        },
    }
}

/// 1 セグメントぶんの照合。`*` は 0 文字以上、`?` は 1 文字に一致する。
///
/// `*` を見つけた位置を覚えておき、行き詰まったらそこへ戻って 1 文字ぶん伸ばす。
/// 再帰にすると `***` のような並びで深さが読めなくなるため、明示的な後戻りにしてある。
fn match_name(pattern: &str, name: &str) -> bool {
    let pattern: Vec<char> = pattern.chars().collect();
    let name: Vec<char> = name.chars().collect();

    let mut p = 0;
    let mut n = 0;
    // 直前に見た `*` の位置と、そのとき消費していた文字数。
    let mut star: Option<(usize, usize)> = None;

    while n < name.len() {
        match pattern.get(p) {
            Some('*') => {
                star = Some((p, n));
                p += 1;
            }
            Some('?') => {
                p += 1;
                n += 1;
            }
            Some(c) if *c == name[n] => {
                p += 1;
                n += 1;
            }
            _ => {
                let Some((star_p, star_n)) = star else {
                    return false;
                };
                p = star_p + 1;
                n = star_n + 1;
                star = Some((star_p, n));
            }
        }
    }

    pattern[p..].iter().all(|c| *c == '*')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(pattern: &str, path: &str) -> bool {
        Pattern::parse(pattern)
            .unwrap_or_else(|| panic!("読み取れないパターン: {pattern}"))
            .matches(Path::new(path))
    }

    /// `/` を含まないパターンは、どの階層の名前にも一致する（`.gitignore` と同じ規則）。
    #[test]
    fn a_pattern_without_a_slash_matches_the_name_at_any_depth() {
        assert!(matches("dist", "dist"));
        assert!(matches("dist", "a/b/dist"));
        assert!(matches("dist", "a/dist"));
        assert!(!matches("dist", "a/dist/b"), "一致するのは名前そのものだけ");
        assert!(!matches("dist", "distribution"));
    }

    /// `/` を含むパターンは基点からの相対パスに一致する。
    #[test]
    fn a_pattern_with_a_slash_is_anchored_at_the_base() {
        assert!(matches("docs/generated", "docs/generated"));
        assert!(!matches("docs/generated", "a/docs/generated"));
        assert!(matches("**/build", "a/b/build"));
        assert!(matches("**/build", "build"), "`**` は 0 個にも一致する");
    }

    #[test]
    fn star_does_not_cross_a_separator() {
        assert!(matches("*.tmp", "a.tmp"));
        assert!(matches("*.tmp", "docs/a.tmp"));
        assert!(!matches("docs/*", "docs/a/b"));
        assert!(matches("docs/*", "docs/a"));
    }

    #[test]
    fn question_mark_matches_exactly_one_character() {
        assert!(matches("a?c", "abc"));
        assert!(!matches("a?c", "ac"));
        assert!(!matches("a?c", "abbc"));
    }

    /// 後戻りが要る並び。`*` を見つけた位置へ戻れないと取りこぼす。
    #[test]
    fn backtracking_finds_a_match_after_a_failed_attempt() {
        assert!(matches("*.md", "a.b.md"));
        assert!(matches("*a*b*", "xxayybzz"));
        assert!(!matches("*a*b*c", "xxayyb"));
    }

    #[test]
    fn separators_may_be_written_either_way() {
        assert!(matches("docs\\generated", "docs/generated"));
        assert!(matches("./docs/generated", "docs/generated"));
        assert!(matches("/docs/generated/", "docs/generated"));
    }

    /// 空になるものは読み取らない。設定に空行が混ざっても全件除外にならない。
    #[test]
    fn empty_patterns_are_rejected() {
        assert_eq!(Pattern::parse(""), None);
        assert_eq!(Pattern::parse("   "), None);
        assert_eq!(Pattern::parse("/"), None);
        assert_eq!(Pattern::parse("./"), None);
        assert_eq!(Pattern::parse("."), None);
        assert_eq!(Pattern::parse("**"), None, "木ごと隠すパターンは受けない");
        assert_eq!(Pattern::parse(&"a/".repeat(MAX_SEGMENTS + 1)), None);
        assert_eq!(Pattern::parse(&"a".repeat(MAX_PATTERN_LEN + 1)), None);
    }

    #[test]
    fn a_set_drops_the_unreadable_ones_and_keeps_the_rest() {
        let set = PatternSet::new(&[String::new(), "dist".into(), "   ".into()]);

        assert!(!set.is_empty());
        assert!(set.matches(Path::new("a/dist")));
        assert!(!set.matches(Path::new("a/src")));
    }

    #[test]
    fn an_empty_set_matches_nothing() {
        let set = PatternSet::new(&[]);

        assert!(set.is_empty());
        assert!(!set.matches(Path::new("dist")));
    }

    /// Windows では大文字小文字を区別しない（`scope::component_eq` と同じ基準）。
    #[test]
    fn case_sensitivity_follows_the_platform() {
        assert_eq!(matches("dist", "DIST"), cfg!(windows));
    }

    /// `**` が連続しても分岐が増えないこと。畳んでいないと深いパスで時間を使う。
    #[test]
    fn consecutive_any_depth_segments_are_folded() {
        let pattern = Pattern::parse("**/**/a").unwrap();

        assert_eq!(pattern.segments.len(), 2);
        assert!(pattern.matches(Path::new("x/y/a")));
    }
}
