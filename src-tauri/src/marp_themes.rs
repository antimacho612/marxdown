//! Marp の自作テーマを読む（`marp.themes` / ADR-0023 §3.4）。
//!
//! 設定に並べた CSS ファイルかディレクトリの絶対パスを読む。
//! ディレクトリは直下の `*.css` だけを読み、再帰しない（Marp CLI の `--theme-set` と同じ）。
//!
//! 読む対象を決めるのは設定だけである。
//! 文書（信頼できない入力）が選べるのは登録済みのテーマの名前だけで、読むファイルを増やす経路は無い。
//! 中身は検証しない。`/* @theme 名前 */` の有無とスライドの外へ出ないことはフロント側が判定する（`src/markdown/marp.ts` / `src/features/preview/lazy/marp.ts`）。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 1 ファイルの上限。marp-core の組み込みテーマで最大の gaia が約 15KB であり、その十数倍を許す。
pub const MAX_THEME_BYTES: u64 = 256 * 1024;

/// 読むファイルの上限。無関係なディレクトリを指したときに全ファイルを開かないためである。
pub const MAX_THEMES: usize = 64;

/// 読めたテーマ 1 つ。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarpTheme {
    /// 正規化した後のパス。通知に出す。
    pub path: String,
    pub css: String,
}

/// 読めなかった理由。文言はフロント側（`src/i18n/`）が作る。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProblemKind {
    /// 絶対パスではない。
    NotAbsolute,
    /// 存在しない。
    Missing,
    /// 拡張子が `.css` ではない。
    NotCss,
    /// [`MAX_THEME_BYTES`] を超える。
    TooLarge,
    /// [`MAX_THEMES`] を超えた分。
    TooMany,
    /// 権限が無い、UTF-8 として読めないなど。
    Unreadable,
}

/// 読めなかったもの 1 つ。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarpThemeProblem {
    /// 設定に書かれたパス、またはディレクトリの中のファイルのパス。
    pub path: String,
    pub kind: ProblemKind,
}

/// 読み込みの結果。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarpThemes {
    pub themes: Vec<MarpTheme>,
    pub problems: Vec<MarpThemeProblem>,
}

/// 設定に並べたパスからテーマを読む。
///
/// 1 つ読めなくても他は読む。読めなかったものは `problems` に入れて返す。
/// 同じファイルを 2 度指していれば 1 度だけ読む。
pub fn load(entries: &[String]) -> MarpThemes {
    let mut out = MarpThemes::default();
    let mut seen = HashSet::new();

    for entry in entries {
        let path = Path::new(entry);
        if !path.is_absolute() {
            out.problem(entry, ProblemKind::NotAbsolute);
            continue;
        }
        let Ok(real) = dunce::canonicalize(path) else {
            out.problem(entry, ProblemKind::Missing);
            continue;
        };

        if real.is_dir() {
            for file in css_files(&real) {
                out.read(&file, &mut seen);
            }
        } else {
            out.read(&real, &mut seen);
        }
    }
    out
}

/// ディレクトリ直下の `*.css`。並びはファイル名の昇順にする（`themes.rs` の `load_all` と同じ理由）。
fn css_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_css(path))
        .collect();
    files.sort();
    files
}

fn is_css(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("css"))
}

impl MarpThemes {
    fn problem(&mut self, path: impl Into<String>, kind: ProblemKind) {
        self.problems.push(MarpThemeProblem {
            path: path.into(),
            kind,
        });
    }

    fn read(&mut self, path: &Path, seen: &mut HashSet<PathBuf>) {
        if !seen.insert(path.to_path_buf()) {
            return;
        }
        let display = path.display().to_string();
        if !is_css(path) {
            self.problem(display, ProblemKind::NotCss);
            return;
        }
        if self.themes.len() >= MAX_THEMES {
            self.problem(display, ProblemKind::TooMany);
            return;
        }
        match std::fs::metadata(path) {
            Ok(meta) if meta.len() > MAX_THEME_BYTES => {
                self.problem(display, ProblemKind::TooLarge);
                return;
            }
            Ok(_) => {}
            Err(_) => {
                self.problem(display, ProblemKind::Unreadable);
                return;
            }
        }
        match std::fs::read_to_string(path) {
            Ok(css) => self.themes.push(MarpTheme { path: display, css }),
            Err(_) => self.problem(display, ProblemKind::Unreadable),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1 件ごとに独立したディレクトリを作る（`asset.rs` と同じ形）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("marxdown-marp-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("一時ディレクトリ");
        dir
    }

    fn kinds(out: &MarpThemes) -> Vec<ProblemKind> {
        out.problems.iter().map(|p| p.kind).collect()
    }

    #[test]
    fn a_directory_is_read_without_recursion_in_name_order() {
        let dir = temp_dir("dir");
        std::fs::write(dir.join("b.css"), "/* @theme b */").unwrap();
        std::fs::write(dir.join("a.CSS"), "/* @theme a */").unwrap();
        std::fs::write(dir.join("note.txt"), "x").unwrap();
        std::fs::create_dir(dir.join("nested")).unwrap();
        std::fs::write(dir.join("nested/c.css"), "/* @theme c */").unwrap();

        let out = load(&[dir.display().to_string()]);

        let css: Vec<&str> = out.themes.iter().map(|t| t.css.as_str()).collect();
        assert_eq!(css, ["/* @theme a */", "/* @theme b */"]);
        assert!(
            out.problems.is_empty(),
            "ディレクトリの中の .css 以外は黙って飛ばす"
        );
    }

    #[test]
    fn relative_missing_and_non_css_entries_are_reported() {
        let dir = temp_dir("report");
        let txt = dir.join("theme.txt");
        std::fs::write(&txt, "x").unwrap();

        let out = load(&[
            "themes/a.css".into(),
            dir.join("missing.css").display().to_string(),
            txt.display().to_string(),
        ]);

        assert!(out.themes.is_empty());
        assert_eq!(
            kinds(&out),
            [
                ProblemKind::NotAbsolute,
                ProblemKind::Missing,
                ProblemKind::NotCss
            ]
        );
    }

    #[test]
    fn a_large_file_is_skipped_and_the_same_file_is_read_once() {
        let dir = temp_dir("large");
        let large = dir.join("large.css");
        std::fs::write(&large, vec![b' '; (MAX_THEME_BYTES + 1) as usize]).unwrap();
        let small = dir.join("small.css");
        std::fs::write(&small, "/* @theme small */").unwrap();

        let out = load(&[
            large.display().to_string(),
            small.display().to_string(),
            dir.display().to_string(),
        ]);

        assert_eq!(
            out.themes.len(),
            1,
            "small.css はディレクトリ経由でも 1 度だけ"
        );
        assert_eq!(kinds(&out), [ProblemKind::TooLarge]);
    }

    #[test]
    fn files_beyond_the_limit_are_reported() {
        let dir = temp_dir("limit");
        for i in 0..=MAX_THEMES {
            std::fs::write(dir.join(format!("{i:03}.css")), "").unwrap();
        }

        let out = load(&[dir.display().to_string()]);

        assert_eq!(out.themes.len(), MAX_THEMES);
        assert_eq!(kinds(&out), [ProblemKind::TooMany]);
    }
}
