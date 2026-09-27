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

/// 並び順の比較。ディレクトリが先、その中は名前順（大文字小文字を区別しない）。
///
/// エクスプローラーとしての見え方を揃えるためであり、`read_dir` の順序は OS 依存で安定しない。
/// 一覧（[`list`]）とツリー（[`tree`]）で同じ順序になる必要があるため、比較だけを切り出してある。
fn by_kind_then_name(a: (bool, &str), b: (bool, &str)) -> std::cmp::Ordering {
    b.0.cmp(&a.0)
        .then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase()))
}

/// 一覧の並び順。
fn sort_entries(entries: &mut [DirEntry]) {
    entries.sort_by(|a, b| by_kind_then_name((a.dir, a.name.as_str()), (b.dir, b.name.as_str())));
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

/// ツリーの深さの上限（`list_tree`）。
///
/// 本文へ貼り付けて読める範囲に収めるための値であり、[`MAX_DEPTH`] より浅い。
/// 上限で展開しなかった枝に中身があれば `truncated` を立てる。
const MAX_TREE_DEPTH: usize = 8;

/// ツリーに載せる件数の上限。
///
/// あいまい検索の候補（[`MAX_FILES`]）と違い、そのまま本文へ貼り付ける前提の値である。
const MAX_TREE_ENTRIES: usize = 1000;

/// ツリーの 1 件（`list_tree`）。
///
/// 入れ子のまま返す。
/// アスキーアートへの整形はフロント側が行うため（`features/workspace/lazy/ascii-tree.ts`）、ここで平坦化すると罫線を組み直せない。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub dir: bool,
    /// ディレクトリ以外では常に空。
    pub children: Vec<TreeNode>,
}

/// 基点とその配下（`list_tree`）。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirTree {
    /// 基点の表示名。ドライブ直下のように名前を取れない場合はパスをそのまま入れる。
    pub name: String,
    pub nodes: Vec<TreeNode>,
    /// 上限で打ち切ったか。フロントはこれを見て、一部であることを通知に添える。
    pub truncated: bool,
}

/// `root` の配下を再帰的に辿り、木の形で返す。
///
/// 除外は [`list`] と同じ（隠しファイル・`node_modules`・`explorer.exclude`）。
/// エクスプローラーに出ないものは、コピーした木にも出ない。
/// ディレクトリへのシンボリックリンクは辿らず、名前だけを出す。
/// 上限は深さ [`MAX_TREE_DEPTH`]・[`MAX_TREE_ENTRIES`] 件で、超えたら `truncated` を立てて打ち切る。
///
/// 存在しない・ディレクトリでない場合は [`CoreError::NotFound`]。
/// スコープ外は [`CoreError::OutOfScope`]（N-SEC-05 / ADR-0006）。
pub fn tree(roots: &[PathBuf], root: &Path, exclude: &Exclude) -> CoreResult<DirTree> {
    let resolved = scope::resolve_within(roots, root)?;
    if !resolved.is_dir() {
        return Err(CoreError::NotFound(resolved.display().to_string()));
    }

    let name = resolved
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| resolved.display().to_string());

    let mut count = 0;
    let mut truncated = false;
    let nodes = walk(&resolved, exclude, 0, &mut count, &mut truncated);

    Ok(DirTree {
        name,
        nodes,
        truncated,
    })
}

/// 1 階層ぶんを木にして、ディレクトリへ潜る。
///
/// 読めないディレクトリ（権限が無い / 消えた）はその枝ごと対象外にする。
/// [`collect`] と同じく、一部が読めないことで全体を失敗させない。
fn walk(
    dir: &Path,
    exclude: &Exclude,
    depth: usize,
    count: &mut usize,
    truncated: &mut bool,
) -> Vec<TreeNode> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut items = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if !is_visible(&name) || exclude.hides(dir, &name) {
            continue;
        }
        let Ok(kind) = item.file_type() else {
            continue;
        };
        // `file_type` はリンク自体の種別を返すため、ディレクトリへのリンクはここで dir=false になる。
        // 辿らないのは、リンク先が親を指していると終わらないためである（[`collect`] と同じ判断）。
        items.push((name, kind.is_dir(), item.path()));
    }
    items.sort_by(|a, b| by_kind_then_name((a.1, a.0.as_str()), (b.1, b.0.as_str())));

    let mut nodes = Vec::new();
    for (name, dir, path) in items {
        if *count >= MAX_TREE_ENTRIES {
            *truncated = true;
            break;
        }
        *count += 1;

        let children = if !dir {
            Vec::new()
        } else if depth + 1 < MAX_TREE_DEPTH {
            walk(&path, exclude, depth + 1, count, truncated)
        } else {
            // 展開しなかった枝に中身があれば、見せていないものがあることになる。
            if has_visible_child(&path, exclude) {
                *truncated = true;
            }
            Vec::new()
        };

        nodes.push(TreeNode {
            name,
            dir,
            children,
        });
    }

    nodes
}

/// 可視の中身を 1 件でも持つか。深さの上限で展開しなかった枝について調べる。
fn has_visible_child(dir: &Path, exclude: &Exclude) -> bool {
    let Ok(read) = std::fs::read_dir(dir) else {
        return false;
    };
    read.flatten().any(|item| {
        let name = item.file_name().to_string_lossy().to_string();
        is_visible(&name) && !exclude.hides(dir, &name)
    })
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

    #[test]
    fn tree_returns_children_in_display_order() {
        let base = std::env::temp_dir().join("marxdown-tree-test");
        let _ = std::fs::remove_dir_all(&base);
        let nested = base.join("docs");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::create_dir_all(base.join("node_modules")).unwrap();
        std::fs::create_dir_all(base.join(".git")).unwrap();
        std::fs::write(base.join("README.md"), "").unwrap();
        std::fs::write(nested.join("a.md"), "").unwrap();

        let result = tree(std::slice::from_ref(&base), &base, &Exclude::default()).unwrap();

        assert_eq!(result.name, "marxdown-tree-test");
        assert!(!result.truncated);

        let names: Vec<&str> = result.nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["docs", "README.md"]);
        assert_eq!(result.nodes[0].children.len(), 1);
        assert_eq!(result.nodes[0].children[0].name, "a.md");
        assert!(result.nodes[1].children.is_empty());

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn tree_follows_the_user_exclude() {
        let base = std::env::temp_dir().join("marxdown-tree-exclude-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("dist")).unwrap();
        std::fs::create_dir_all(base.join("docs")).unwrap();
        std::fs::write(base.join("dist").join("a.md"), "").unwrap();
        std::fs::write(base.join("docs").join("b.md"), "").unwrap();
        let resolved = dunce::canonicalize(&base).unwrap();
        let exclude = Exclude::new(&["dist".to_string()], Some(&resolved));

        let result = tree(std::slice::from_ref(&base), &base, &exclude).unwrap();

        // エクスプローラーで隠しているものは、コピーした木にも出さない。
        let names: Vec<&str> = result.nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["docs"]);

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn tree_stops_at_the_depth_limit() {
        let base = std::env::temp_dir().join("marxdown-tree-depth-test");
        let _ = std::fs::remove_dir_all(&base);
        let mut deep = base.clone();
        for _ in 0..=MAX_TREE_DEPTH {
            deep = deep.join("d");
        }
        std::fs::create_dir_all(&deep).unwrap();

        let result = tree(std::slice::from_ref(&base), &base, &Exclude::default()).unwrap();

        // 展開しなかった枝に中身があるため、打ち切りとして伝わる。
        assert!(result.truncated);

        let mut node = &result.nodes[0];
        let mut depth = 1;
        while let Some(child) = node.children.first() {
            node = child;
            depth += 1;
        }
        assert_eq!(depth, MAX_TREE_DEPTH);

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn walking_stops_at_the_entry_limit() {
        let base = std::env::temp_dir().join("marxdown-tree-limit-test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("a.md"), "").unwrap();

        // 上限そのものを作ると 1000 件書くことになる。到達済みの状態から呼んで同じ経路を通す。
        let mut count = MAX_TREE_ENTRIES;
        let mut truncated = false;
        let nodes = walk(&base, &Exclude::default(), 0, &mut count, &mut truncated);

        assert!(nodes.is_empty());
        assert!(truncated);

        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn walking_outside_the_roots_is_rejected() {
        let dir = std::env::temp_dir();
        let roots = vec![dir.join("marxdown-scope-test-root")];
        let error = tree(&roots, &dir, &Exclude::default()).unwrap_err();

        assert!(matches!(error, CoreError::OutOfScope(_)));
    }
}
