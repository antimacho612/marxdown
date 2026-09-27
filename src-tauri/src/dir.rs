//! ディレクトリの一覧（F-NAV-03 / ファイルツリー）。
//!
//! 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」ことであり、開いたファイルの隣に何があるかを見せるのがファイルツリーである。
//!
//! 除外はここで行う。
//! 隠しファイル・`node_modules`・`.git` はフロントへ渡さない。
//! フロント側で隠す形にすると、「画面には出ないが IPC には載っている」状態になり、件数の多いディレクトリで転送量だけが増える。
//!
//! 利用者が足す除外（`explorer.exclude`）も同じ場所で適用する。
//! こちらは基点からの相対パスに対する glob であり、判定そのものは `crate::glob` にある。
//!
//! 遅延展開の単位もここである。
//! 1 階層ぶんしか返さない。
//! 再帰的に返すと、リポジトリの直上で開いたときに数万件を 1 回の IPC で運ぶことになる。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};
use crate::glob::PatternSet;
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

/// 利用者が設定した除外（`explorer.exclude`）。
///
/// [`EXCLUDED`] とは別に持つ。
/// 常に外すもの（隠しファイル・`node_modules`）は設定を空にしても戻らないという違いがある。
///
/// 一致の基準は基点からの相対パスであり、基点はエクスプローラーの木の根（クイックオープンでは検索の基点）である。
/// 基点を決められなかった場合は名前だけで判定する。
/// パターンのうち `/` を含まないものは元から名前に対する指定なので、その範囲では同じ結果になる。
#[derive(Debug, Clone, Default)]
pub struct Exclude {
    patterns: PatternSet,
    /// 基点。正規化済み絶対パス。決められなければ `None`。
    base: Option<PathBuf>,
}

impl Exclude {
    /// 設定のパターンと基点から作る。基点は正規化済みであることを前提とする。
    pub fn new(patterns: &[String], base: Option<&Path>) -> Self {
        Self {
            patterns: PatternSet::new(patterns),
            base: base.map(Path::to_path_buf),
        }
    }

    /// 1 件を隠すか。`dir` はその項目が入っているディレクトリ（正規化済み）。
    fn hides(&self, dir: &Path, name: &str) -> bool {
        if self.patterns.is_empty() {
            return false;
        }
        let relative = match self
            .base
            .as_deref()
            .and_then(|base| dir.strip_prefix(base).ok())
        {
            Some(prefix) => prefix.join(name),
            None => PathBuf::from(name),
        };
        self.patterns.matches(&relative)
    }
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
/// `exclude` は利用者が設定した除外（`explorer.exclude`）。
/// 隠しファイルと `node_modules` はこれとは別に常に除外される。
///
/// 存在しない・ディレクトリでない場合は [`CoreError::NotFound`]。
/// スコープ外は [`CoreError::OutOfScope`]（N-SEC-05 / ADR-0006）。
pub fn list(roots: &[PathBuf], path: &Path, exclude: &Exclude) -> CoreResult<Vec<DirEntry>> {
    let resolved = scope::resolve_within(roots, path)?;
    if !resolved.is_dir() {
        return Err(CoreError::NotFound(resolved.display().to_string()));
    }

    let read = std::fs::read_dir(&resolved).map_err(CoreError::from)?;

    let mut entries = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if !is_visible(&name) || exclude.hides(&resolved, &name) {
            continue;
        }
        // 種別が取れないものは対象外にする（削除された直後など）。一覧の 1 件のために失敗させない。
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

/// 再帰で集める上限（クイックオープン / F-NAV-05）。
///
/// 上限に当たったら打ち切って `truncated` を立てる。
/// リポジトリの直上で開いたときに、あいまい検索が扱いきれない件数を運ばないためである。
const MAX_FILES: usize = 5000;

/// 潜る深さの上限。
///
/// シンボリックリンクは辿らないので循環はしないが、生成物の深い入れ子で時間を使わないための措置である。
const MAX_DEPTH: usize = 16;

/// クイックオープンの候補（F-NAV-05）。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileList {
    /// 正規化済み絶対パス。パス順に並んでいる。
    pub files: Vec<String>,
    /// 上限で打ち切ったか。フロントはこれを見て「先頭 N 件」であることを示す。
    pub truncated: bool,
}

/// `root` の配下から、指定された拡張子のファイルを再帰的に集める（F-NAV-05）。
///
/// 除外は [`list`] と同じ（隠しファイル・`node_modules`・`explorer.exclude`）。
/// 除外されたディレクトリには潜らない。中身が候補に出ないだけでなく、走査そのものを行わない。
/// シンボリックリンクは辿らない。
/// 上限は [`MAX_FILES`] 件・深さ [`MAX_DEPTH`] で、超えたら `truncated` を立てて打ち切る。
///
/// 拡張子を引数で受け取るのは、Markdown かどうかの判断をフロント側の 1 か所に残すためである（`lib/path.ts` の `MARKDOWN_EXTENSIONS`）。
/// ここに一覧を置くと同じ判断が 2 か所に分かれる。
/// 比較は大文字小文字を区別しない。先頭の `.` は付けても付けなくてもよい。
///
/// スコープ外は [`CoreError::OutOfScope`]（N-SEC-05 / ADR-0006）。
pub fn list_files(
    roots: &[PathBuf],
    root: &Path,
    extensions: &[String],
    exclude: &Exclude,
) -> CoreResult<FileList> {
    let resolved = scope::resolve_within(roots, root)?;
    if !resolved.is_dir() {
        return Err(CoreError::NotFound(resolved.display().to_string()));
    }

    let wanted: Vec<String> = extensions
        .iter()
        .map(|ext| ext.trim_start_matches('.').to_lowercase())
        .filter(|ext| !ext.is_empty())
        .collect();

    let mut files = Vec::new();
    let mut truncated = false;
    collect(&resolved, &wanted, exclude, 0, &mut files, &mut truncated);

    // 並びを決めておく。あいまい検索が同点にしたときの順序がここで決まる。
    files.sort();
    Ok(FileList { files, truncated })
}

/// 1 階層ぶん集めて、ディレクトリへ潜る。
///
/// 読めないディレクトリ（権限が無い / 消えた）はその枝ごと対象外にする。
/// 一覧の一部が読めないことで全体を失敗させない。
fn collect(
    dir: &Path,
    extensions: &[String],
    exclude: &Exclude,
    depth: usize,
    files: &mut Vec<String>,
    truncated: &mut bool,
) {
    if depth > MAX_DEPTH {
        *truncated = true;
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };

    // ファイルを先に集めてから潜る。浅いところの候補を上限で失わない。
    let mut dirs = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if !is_visible(&name) || exclude.hides(dir, &name) {
            continue;
        }
        let Ok(kind) = item.file_type() else {
            continue;
        };
        // シンボリックリンクは辿らない。リンク先が親を指していると終わらない。
        if kind.is_symlink() {
            continue;
        }

        if kind.is_dir() {
            dirs.push(item.path());
        } else if has_extension(&name, extensions) {
            if files.len() >= MAX_FILES {
                *truncated = true;
                return;
            }
            files.push(item.path().display().to_string());
        }
    }

    for child in dirs {
        if files.len() >= MAX_FILES {
            *truncated = true;
            return;
        }
        collect(&child, extensions, exclude, depth + 1, files, truncated);
    }
}

/// 拡張子が一覧のどれかと一致するか。大文字小文字は区別しない。
fn has_extension(name: &str, extensions: &[String]) -> bool {
    let Some((_, ext)) = name.rsplit_once('.') else {
        return false;
    };
    let ext = ext.to_lowercase();
    extensions.contains(&ext)
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
        let error = list(&roots, &dir, &Exclude::default()).unwrap_err();

        assert!(matches!(error, CoreError::OutOfScope(_)));
    }

    #[test]
    fn listing_returns_the_entries_of_one_level() {
        let base = std::env::temp_dir().join("marxdown-dir-test");
        let nested = base.join("docs");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(base.join("a.md"), "# a").unwrap();
        std::fs::write(nested.join("b.md"), "# b").unwrap();

        let entries = list(std::slice::from_ref(&base), &base, &Exclude::default()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        // 1 階層ぶんだけ。`docs/b.md` は入らない。
        assert_eq!(names, vec!["docs", "a.md"]);

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn extensions_are_matched_ignoring_case_and_leading_dot() {
        let wanted = vec!["md".to_string(), "markdown".to_string()];
        assert!(has_extension("README.MD", &wanted));
        assert!(has_extension("a.markdown", &wanted));
        assert!(!has_extension("a.txt", &wanted));
        // 拡張子を持たないもの。`.gitignore` は `is_visible` で先に除外される。
        assert!(!has_extension("Makefile", &wanted));
    }

    #[test]
    fn files_are_collected_recursively_and_filtered_by_extension() {
        let base = std::env::temp_dir().join("marxdown-files-test");
        let _ = std::fs::remove_dir_all(&base);
        let nested = base.join("docs").join("adr");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::create_dir_all(base.join("node_modules")).unwrap();
        std::fs::create_dir_all(base.join(".git")).unwrap();
        std::fs::write(base.join("a.md"), "").unwrap();
        std::fs::write(base.join("notes.txt"), "").unwrap();
        std::fs::write(nested.join("b.MD"), "").unwrap();
        std::fs::write(base.join("node_modules").join("c.md"), "").unwrap();
        std::fs::write(base.join(".git").join("d.md"), "").unwrap();

        let list = list_files(
            std::slice::from_ref(&base),
            &base,
            &["md".to_string()],
            &Exclude::default(),
        )
        .unwrap();
        let names: Vec<String> = list
            .files
            .iter()
            .map(|path| {
                Path::new(path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        assert_eq!(names, vec!["a.md", "b.MD"]);
        assert!(!list.truncated);

        std::fs::remove_dir_all(&base).unwrap();
    }

    /// 設定の除外は基点からの相対パスで判定する。
    /// 深い階層の `dist` も、基点直下の `docs/generated` も 1 つの設定から除外できる。
    #[test]
    fn user_patterns_hide_entries_relative_to_the_base() {
        let base = std::env::temp_dir().join("marxdown-dir-exclude-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("docs").join("generated")).unwrap();
        std::fs::create_dir_all(base.join("docs").join("dist")).unwrap();
        std::fs::create_dir_all(base.join("dist")).unwrap();
        std::fs::write(base.join("a.md"), "").unwrap();
        std::fs::write(base.join("scratch.tmp"), "").unwrap();

        let root = dunce::canonicalize(&base).unwrap();
        let exclude = Exclude::new(
            &["dist".to_string(), "docs/generated".into(), "*.tmp".into()],
            Some(&root),
        );

        let top = list(std::slice::from_ref(&base), &base, &exclude).unwrap();
        let names: Vec<&str> = top.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["docs", "a.md"]);

        let docs = list(std::slice::from_ref(&base), &base.join("docs"), &exclude).unwrap();
        let names: Vec<&str> = docs.iter().map(|e| e.name.as_str()).collect();
        assert!(
            names.is_empty(),
            "`dist` はどの階層でも、`docs/generated` は基点からの位置で落ちる: {names:?}"
        );

        std::fs::remove_dir_all(&base).unwrap();
    }

    /// 除外したディレクトリにはクイックオープンも潜らない（F-NAV-05）。
    #[test]
    fn user_patterns_also_prune_the_recursive_walk() {
        let base = std::env::temp_dir().join("marxdown-files-exclude-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("dist")).unwrap();
        std::fs::create_dir_all(base.join("docs")).unwrap();
        std::fs::write(base.join("a.md"), "").unwrap();
        std::fs::write(base.join("dist").join("b.md"), "").unwrap();
        std::fs::write(base.join("docs").join("c.md"), "").unwrap();

        let root = dunce::canonicalize(&base).unwrap();
        let exclude = Exclude::new(&["dist".to_string()], Some(&root));

        let found = list_files(
            std::slice::from_ref(&base),
            &base,
            &["md".to_string()],
            &exclude,
        )
        .unwrap();
        let names: Vec<String> = found
            .files
            .iter()
            .map(|path| {
                Path::new(path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        assert_eq!(names, vec!["a.md", "c.md"]);

        std::fs::remove_dir_all(&base).unwrap();
    }

    /// 基点が無い場合は名前だけで判定する。`/` を含むパターンはその場では一致しない。
    #[test]
    fn without_a_base_only_the_name_is_matched() {
        let exclude = Exclude::new(&["dist".to_string(), "docs/generated".into()], None);

        assert!(exclude.hides(Path::new("/anywhere"), "dist"));
        assert!(!exclude.hides(Path::new("/anywhere/docs"), "generated"));
    }

    #[test]
    fn collecting_stops_at_the_limit() {
        let base = std::env::temp_dir().join("marxdown-files-limit-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();

        let mut files = Vec::new();
        let mut truncated = false;
        // 上限そのものを作ると 5000 ファイル書くことになる。深さの上限で同じ経路を通す。
        collect(
            &base,
            &["md".to_string()],
            &Exclude::default(),
            MAX_DEPTH + 1,
            &mut files,
            &mut truncated,
        );

        assert!(files.is_empty());
        assert!(truncated);

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn collecting_outside_the_roots_is_rejected() {
        let dir = std::env::temp_dir();
        let roots = vec![dir.join("marxdown-scope-test-root")];
        let error = list_files(&roots, &dir, &["md".to_string()], &Exclude::default()).unwrap_err();

        assert!(matches!(error, CoreError::OutOfScope(_)));
    }
}
