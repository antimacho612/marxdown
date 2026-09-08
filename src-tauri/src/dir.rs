//! ディレクトリの一覧（F-NAV-03 / ファイルツリー）。
//!
//! 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことであり、
//! 開いたファイルの隣に何があるかを見せるのがファイルツリーである。
//!
//! **除外はここで行う。** 隠しファイル・`node_modules`・`.git` はフロントへ渡さない
//! （03.ux-spec/06-panes.md §1）。フロント側で隠す形にすると、
//! 「画面には出ないが IPC には載っている」状態になり、件数の多いディレクトリで
//! 転送量だけが増える。
//!
//! **遅延展開の単位もここである。** 1 階層ぶんしか返さない。
//! 再帰的に返すと、リポジトリの直上で開いたときに数万件を 1 回の IPC で運ぶことになる。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};
use crate::scope;

/// 一覧に出さない名前。
///
/// `.git` と `.` 始まりは隠しファイルとして扱う。
/// `node_modules` は隠しファイルではないが、件数が桁違いで、開いて読むものが入っていない。
const EXCLUDED: [&str; 1] = ["node_modules"];

/// ディレクトリの中の 1 件。
///
/// 種別は「ディレクトリか否か」しか持たない。
/// Markdown かどうかの判断は拡張子で決まり、フロント側で同じ結論になる（`splitPath`）。
/// ここで渡すと、判断の根拠が 2 か所に分かれる。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    /// 正規化済み絶対パス。そのまま `read_document` へ渡せる。
    pub path: String,
    pub dir: bool,
}

/// 一覧に出すか。
///
/// シンボリックリンクは辿らない（`is_dir` は解決後を見るため、ここでは種別だけを見る）。
fn is_visible(name: &str) -> bool {
    !name.starts_with('.') && !EXCLUDED.contains(&name)
}

/// 並び順。ディレクトリが先、その中は名前順（大文字小文字を区別しない）。
///
/// エクスプローラーとしての見え方を揃えるためであり、`read_dir` の順序は OS 依存で安定しない。
fn sort_entries(entries: &mut [DirEntry]) {
    entries.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

/// `root` の配下であることを検証したうえで、`path` の中身を 1 階層ぶん返す。
///
/// 存在しない・ディレクトリでない場合は [`CoreError::NotFound`]。
/// スコープ外は [`CoreError::OutOfScope`]（N-SEC-05 / ADR-0006）。
pub fn list(roots: &[PathBuf], path: &Path) -> CoreResult<Vec<DirEntry>> {
    let resolved = scope::resolve_within(roots, path)?;
    if !resolved.is_dir() {
        return Err(CoreError::NotFound(resolved.display().to_string()));
    }

    let read = std::fs::read_dir(&resolved).map_err(CoreError::from)?;

    let mut entries = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if !is_visible(&name) {
            continue;
        }
        // 種別が取れないものは飛ばす（削除された直後など）。一覧の 1 件のために失敗させない。
        let Ok(kind) = item.file_type() else {
            continue;
        };
        entries.push(DirEntry {
            name,
            path: item.path().display().to_string(),
            dir: kind.is_dir(),
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, dir: bool) -> DirEntry {
        DirEntry {
            name: name.into(),
            path: name.into(),
            dir,
        }
    }

    #[test]
    fn hidden_and_noisy_directories_are_excluded() {
        assert!(is_visible("README.md"));
        assert!(!is_visible(".git"));
        assert!(!is_visible(".env"));
        assert!(!is_visible("node_modules"));
    }

    #[test]
    fn directories_come_first_then_names_ignoring_case() {
        let mut entries = vec![
            entry("readme.md", false),
            entry("Zebra", true),
            entry("api.md", false),
            entry("docs", true),
        ];
        sort_entries(&mut entries);

        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["docs", "Zebra", "api.md", "readme.md"]);
    }

    #[test]
    fn listing_outside_the_roots_is_rejected() {
        let dir = std::env::temp_dir();
        let roots = vec![dir.join("marxdown-scope-test-root")];
        let error = list(&roots, &dir).unwrap_err();

        assert!(matches!(error, CoreError::OutOfScope(_)));
    }

    #[test]
    fn listing_returns_the_entries_of_one_level() {
        let base = std::env::temp_dir().join("marxdown-dir-test");
        let nested = base.join("docs");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(base.join("a.md"), "# a").unwrap();
        std::fs::write(nested.join("b.md"), "# b").unwrap();

        let entries = list(std::slice::from_ref(&base), &base).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        // 1 階層ぶんだけ。`docs/b.md` は入らない。
        assert_eq!(names, vec!["docs", "a.md"]);

        std::fs::remove_dir_all(&base).unwrap();
    }
}
