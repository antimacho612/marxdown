//! ファイルツリーからのファイル操作（F-NAV-11〜13 / ADR-0020）。
//!
//! 作成・リネーム・移動・コピー・ゴミ箱への移動を扱う。
//! 書き込み範囲の検証は、すべての入口でここを通す。
//!
//! Tauri に依存しない。
//! 許可ディレクトリ（`asset_roots`）は呼び出し側から受け取り、検証の結果をユニットテストで確かめられるようにしてある。
//!
//! 既存の項目は親ディレクトリだけを正規化し、名前はそのまま連結して指す（[`resolve_entry`]）。
//! 項目そのものを `canonicalize` すると symlink が解決され、リンクではなくリンク先をリネーム・削除することになる。

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};
use crate::scope;

/// 移動・リネームの結果。フロントはこれを見てタブと最近開いたファイルのパスを付け替える。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Moved {
    pub from: String,
    pub to: String,
}

/// Windows で名前に使えない文字。
const WINDOWS_FORBIDDEN: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Windows の予約名。拡張子を付けても使えない（`CON.md` も不可）。
const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// 1 要素の名前として使えるかを検証する。
///
/// パスの区切りを含む名前を通すと、フロントが指定した任意の階層へ書き込めることになる。
/// 使えない理由はフロントでも入力中に示すが、判定の最終的な基準はここである。
///
/// Windows の規則は全 OS で適用する（M10 §4.7）。
/// Windows の利用者とファイルを交換したときに名前で困らないためで、フロントの規則とも揃う。
pub fn validate_name(name: &str) -> CoreResult<()> {
    let invalid = |reason: &str| Err(CoreError::InvalidArgument(format!("{reason}: {name}")));

    if name.is_empty() || name == "." || name == ".." {
        return invalid("使えない名前");
    }
    if name.encode_utf16().count() > 255 {
        return invalid("名前が長すぎる");
    }
    if name
        .chars()
        .any(|c| c == '/' || c == '\0' || c.is_control())
    {
        return invalid("使えない文字を含む");
    }
    if name.chars().any(|c| WINDOWS_FORBIDDEN.contains(&c)) {
        return invalid("使えない文字を含む");
    }
    // 末尾の `.` と空白は Windows が黙って落とすため、指定した名前と違うファイルができる。
    if name.ends_with('.') || name.ends_with(' ') {
        return invalid("末尾に . または空白がある");
    }
    let stem = name.split('.').next().unwrap_or(name).trim_end();
    if WINDOWS_RESERVED
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
    {
        return invalid("予約された名前");
    }
    Ok(())
}

/// `path` が許可ディレクトリそのもの（ツリーの基点など）か。
fn is_root(roots: &[PathBuf], path: &Path) -> bool {
    roots.iter().any(|root| {
        dunce::canonicalize(root)
            .is_ok_and(|root| scope::is_within(&root, path) && scope::is_within(path, &root))
    })
}

/// 既存の 1 件を指すパスを検証して返す。
///
/// 親ディレクトリだけを正規化し、スコープの内側であることを確かめる。
/// 許可ディレクトリそのものは操作の対象にできない。
pub fn resolve_entry(roots: &[PathBuf], path: &Path) -> CoreResult<PathBuf> {
    let not_found = || CoreError::NotFound(path.display().to_string());
    let Some(Component::Normal(name)) = path.components().next_back() else {
        return Err(CoreError::InvalidArgument(path.display().to_string()));
    };
    let parent = path.parent().ok_or_else(not_found)?;
    let parent = scope::resolve_within(roots, parent)?;
    let full = parent.join(name);

    if std::fs::symlink_metadata(&full).is_err() {
        return Err(not_found());
    }
    if is_root(roots, &full) {
        return Err(CoreError::InvalidArgument(format!(
            "基点は操作できない: {}",
            full.display()
        )));
    }
    Ok(full)
}

/// 宛先のディレクトリを検証して返す。基点そのものは宛先にしてよい。
pub fn resolve_dir(roots: &[PathBuf], path: &Path) -> CoreResult<PathBuf> {
    let resolved = scope::resolve_within(roots, path)?;
    if !resolved.is_dir() {
        return Err(CoreError::InvalidArgument(format!(
            "フォルダではない: {}",
            resolved.display()
        )));
    }
    Ok(resolved)
}

/// 同じ名前の項目が既にあるか。symlink はリンク先を見ずにリンクの有無で判定する。
fn exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn already_exists(path: &Path) -> CoreError {
    CoreError::AlreadyExists(path.display().to_string())
}

/// 入出力のエラーを変換する。「既にある」だけは他と対処が違うため種別を分ける。
fn io_error(e: std::io::Error, path: &Path) -> CoreError {
    if e.kind() == std::io::ErrorKind::AlreadyExists {
        return already_exists(path);
    }
    CoreError::from(e)
}

/// 選択に親子が混ざっているとき、子を外す（親を移せば子も移る）。
///
/// 外さないと、親を移した後に子を移そうとして「見つからない」で失敗する。
fn prune_nested(mut paths: Vec<PathBuf>) -> Vec<PathBuf> {
    paths.sort();
    paths.dedup();
    let snapshot = paths.clone();
    paths.retain(|path| {
        !snapshot
            .iter()
            .any(|other| other != path && scope::is_within(other, path))
    });
    paths
}

/// 新しいファイルかフォルダを作る。作ったパスを返す。
///
/// 既にある名前には作らない（`create_new`）。
/// 確認と作成の間に他のプロセスが同じ名前を作っても、上書きせずに [`CoreError::AlreadyExists`] になる。
pub fn create(roots: &[PathBuf], parent: &Path, name: &str, dir: bool) -> CoreResult<PathBuf> {
    validate_name(name)?;
    let parent = resolve_dir(roots, parent)?;
    let target = parent.join(name);
    if exists(&target) {
        return Err(already_exists(&target));
    }

    let result = if dir {
        std::fs::create_dir(&target)
    } else {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map(|_| ())
    };
    result.map_err(|e| io_error(e, &target))?;
    Ok(target)
}

/// 同じディレクトリの中で名前を変える。
///
/// `std::fs::rename` は Windows で既存のファイルを置き換えるため、先に存在を確かめる。
/// 大文字と小文字だけを変えるリネームは、Windows では同じ名前として存在するので例外として通す。
pub fn rename(roots: &[PathBuf], path: &Path, new_name: &str) -> CoreResult<Moved> {
    validate_name(new_name)?;
    let source = resolve_entry(roots, path)?;
    let parent = source
        .parent()
        .ok_or_else(|| CoreError::InvalidArgument(source.display().to_string()))?;
    let target = parent.join(new_name);

    let moved = Moved {
        from: source.display().to_string(),
        to: target.display().to_string(),
    };
    if source == target {
        return Ok(moved);
    }

    // Windows と macOS（既定の APFS）は大文字小文字を区別しないため、変更後の名前が「既にある」と判定される（M10 §4.7）。
    let case_only = cfg!(any(windows, target_os = "macos"))
        && source
            .file_name()
            .is_some_and(|old| old.to_string_lossy().eq_ignore_ascii_case(new_name));
    if exists(&target) && !case_only {
        return Err(already_exists(&target));
    }

    std::fs::rename(&source, &target).map_err(|e| io_error(e, &target))?;
    Ok(moved)
}

/// ボリュームを跨いだ移動か（`rename` では移せない）。
///
/// `ErrorKind::CrossesDevices` は MSRV（1.80）より新しいため、OS のエラー番号で判定する。
fn crosses_devices(e: &std::io::Error) -> bool {
    // Windows: ERROR_NOT_SAME_DEVICE / Unix: EXDEV
    let code = if cfg!(windows) { 17 } else { 18 };
    e.raw_os_error() == Some(code)
}

/// 項目を `dest` の中へ移す。移した分は `done` に積む。
///
/// 途中で失敗しても、それまでに移した分は `done` に残る。
/// 呼び出し側はエラーの有無にかかわらず `done` をフロントへ知らせること（タブの付け替えに要る）。
///
/// 先にすべてを検証してから移す。
/// 名前の衝突や自分の子孫への移動が後ろの 1 件にあったために、前の数件だけが移った状態にしないためである。
pub fn move_into(
    roots: &[PathBuf],
    sources: &[PathBuf],
    dest: &Path,
    done: &mut Vec<Moved>,
) -> CoreResult<()> {
    let dest = resolve_dir(roots, dest)?;
    let sources = sources
        .iter()
        .map(|path| resolve_entry(roots, path))
        .collect::<CoreResult<Vec<_>>>()?;

    let mut plan = Vec::new();
    for source in prune_nested(sources) {
        // 今いるフォルダへの移動は何もしない。
        if source.parent() == Some(dest.as_path()) {
            continue;
        }
        if scope::is_within(&source, &dest) {
            return Err(CoreError::InvalidArgument(format!(
                "自分自身の中へは移せない: {}",
                source.display()
            )));
        }
        let Some(name) = source.file_name() else {
            continue;
        };
        let target = dest.join(name);
        if exists(&target) {
            return Err(already_exists(&target));
        }
        plan.push((source, target));
    }

    for (source, target) in plan {
        match std::fs::rename(&source, &target) {
            Ok(()) => {}
            Err(e) if crosses_devices(&e) => {
                copy_recursive(&source, &target)?;
                remove(&source)?;
            }
            Err(e) => return Err(io_error(e, &target)),
        }
        done.push(Moved {
            from: source.display().to_string(),
            to: target.display().to_string(),
        });
    }
    Ok(())
}

/// ボリュームを跨いだ移動の後始末として元を消す。移動の一部であり、ゴミ箱は通さない。
fn remove(path: &Path) -> CoreResult<()> {
    let meta = std::fs::symlink_metadata(path).map_err(CoreError::from)?;
    let result = if meta.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    result.map_err(CoreError::from)
}

/// コピー先の名前を決める。空いていればそのまま、埋まっていれば `名前 copy.md` / `名前 copy 2.md`。
///
/// VS Code と同じ規則である。
/// `.` で始まる名前（`.env`）は全体を名前として扱い、拡張子と見なさない（`Path::extension` の規則）。
fn unique_target(dest: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let first = dest.join(name);
    if !exists(&first) {
        return first;
    }

    let as_path = Path::new(name);
    let stem = as_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = as_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    (1..)
        .map(|n| {
            let suffix = if n == 1 {
                " copy".to_owned()
            } else {
                format!(" copy {n}")
            };
            dest.join(format!("{stem}{suffix}{extension}"))
        })
        .find(|candidate| !exists(candidate))
        .unwrap_or(first)
}

/// 再帰的に複製する。symlink は辿らず、複製もしない。
///
/// 辿ると、配下に置かれた 1 本のリンクから許可範囲の外の木を丸ごと複製できる。
fn copy_recursive(source: &Path, target: &Path) -> CoreResult<()> {
    let meta = std::fs::symlink_metadata(source).map_err(CoreError::from)?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_file() {
        std::fs::copy(source, target).map_err(|e| io_error(e, target))?;
        return Ok(());
    }

    std::fs::create_dir(target).map_err(|e| io_error(e, target))?;
    for item in std::fs::read_dir(source)
        .map_err(CoreError::from)?
        .flatten()
    {
        copy_recursive(&item.path(), &target.join(item.file_name()))?;
    }
    Ok(())
}

/// 項目を `dest` の中へ複製する。複製したパスを `done` に積む。
///
/// `sources` はここでは検証しない。
/// ツリーの中からのコピーは呼び出し側が [`resolve_entry`] を通し、外部からのドロップは Rust が受け取ったパスとの照合を通す。
/// 同じ名前があれば `名前 copy` として置き、上書きはしない。
pub fn copy_into(
    roots: &[PathBuf],
    sources: &[PathBuf],
    dest: &Path,
    done: &mut Vec<String>,
) -> CoreResult<()> {
    let dest = resolve_dir(roots, dest)?;

    for source in prune_nested(sources.to_vec()) {
        let meta = std::fs::symlink_metadata(&source)
            .map_err(|_| CoreError::NotFound(source.display().to_string()))?;
        if meta.file_type().is_symlink() {
            continue;
        }
        // 自分自身の中へ複製すると、複製したものをまた複製し続ける。
        if meta.is_dir() && scope::is_within(&source, &dest) {
            return Err(CoreError::InvalidArgument(format!(
                "自分自身の中へは複製できない: {}",
                source.display()
            )));
        }
        let Some(name) = source.file_name() else {
            continue;
        };
        let target = unique_target(&dest, name);
        copy_recursive(&source, &target)?;
        done.push(target.display().to_string());
    }
    Ok(())
}

/// ゴミ箱へ移す（ADR-0020 §3.3）。消えた分のパスを `done` に積む。
///
/// `owner` は OS の確認ダイアログの親にするウィンドウである。
/// ゴミ箱に入らない項目（容量超過・ネットワークドライブなど）は、OS が完全に削除してよいかを尋ねる。
/// 利用者が断れば、その項目は残る（`done` に入らない）。
pub fn trash(
    roots: &[PathBuf],
    paths: &[PathBuf],
    owner: Option<isize>,
    done: &mut Vec<String>,
) -> CoreResult<()> {
    let targets = paths
        .iter()
        .map(|path| resolve_entry(roots, path))
        .collect::<CoreResult<Vec<_>>>()?;
    let targets = prune_nested(targets);
    if targets.is_empty() {
        return Ok(());
    }

    let result = move_to_trash(&targets, owner);
    done.extend(
        targets
            .iter()
            .filter(|path| !exists(path))
            .map(|path| path.display().to_string()),
    );
    result
}

#[cfg(windows)]
fn move_to_trash(targets: &[PathBuf], owner: Option<isize>) -> CoreResult<()> {
    use std::os::windows::ffi::OsStrExt;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FOF_WANTNUKEWARNING, FO_DELETE, SHFILEOPSTRUCTW,
    };

    // `pFrom` は NUL 区切りの並びで、最後を NUL 2 つで終える。
    let mut from: Vec<u16> = Vec::new();
    for target in targets {
        from.extend(target.as_os_str().encode_wide());
        from.push(0);
    }
    from.push(0);

    // `FOF_NOCONFIRMATION` は「ゴミ箱へ移してよいか」の確認を省く（アプリ側で確認済み）。
    // `FOF_WANTNUKEWARNING` はその省略を部分的に打ち消し、完全に削除される場合だけ OS に確認させる。
    let flags = FOF_ALLOWUNDO.0
        | FOF_NOCONFIRMATION.0
        | FOF_WANTNUKEWARNING.0
        | FOF_NOERRORUI.0
        | FOF_SILENT.0;
    let mut operation = SHFILEOPSTRUCTW {
        hwnd: HWND(owner.unwrap_or(0) as *mut core::ffi::c_void),
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        // 下位 16 ビットだけが意味を持つ（`fFlags` は WORD）。
        fFlags: flags as u16,
        ..Default::default()
    };

    // SAFETY: `from` は呼び出しの間生きており、NUL 2 つで終わっている。
    let code = unsafe { SHFileOperationW(&mut operation) };
    if code != 0 {
        return Err(CoreError::Io(format!("SHFileOperationW: 0x{code:x}")));
    }
    Ok(())
}

/// macOS / Linux（M10 §4.7）。
///
/// macOS は `NSFileManager` を使う。
/// Finder に頼む方法は「戻す」が使えるが、初回に Finder の操作の許可を求めるダイアログが出る。
/// Linux は freedesktop のゴミ箱の仕様に従う。
/// ゴミ箱に入らない項目を OS に完全削除を確認させる仕組み（`FOF_WANTNUKEWARNING`）は無く、失敗として返す。
#[cfg(not(windows))]
fn move_to_trash(targets: &[PathBuf], _owner: Option<isize>) -> CoreResult<()> {
    #[allow(unused_mut)]
    let mut context = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        context.set_delete_method(DeleteMethod::NsFileManager);
    }
    context
        .delete_all(targets)
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// `path` が `from` かその配下なら、`to` へ付け替えたパスを返す。
///
/// 移動したフォルダの中で開いていたファイルも、同じ規則で付け替える必要がある。
/// 比較はコンポーネント単位で行う（`C:\a\doc` と `C:\a\docs` を取り違えない）。
pub fn relocate(path: &str, from: &str, to: &str) -> Option<String> {
    let path = Path::new(path);
    let from = Path::new(from);
    if !scope::is_within(from, path) {
        return None;
    }
    let rest = path.components().skip(from.components().count());
    let mut relocated = PathBuf::from(to);
    relocated.extend(rest);
    Some(relocated.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-fsops-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        dunce::canonicalize(&d).unwrap()
    }

    #[test]
    fn names_with_separators_are_rejected() {
        assert!(validate_name("a/b.md").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name("").is_err());
        assert!(validate_name("a\0b").is_err());
        assert!(validate_name("note.md").is_ok());
        assert!(validate_name(".env").is_ok());
    }

    /// Windows の規則は全 OS で適用する（M10 §4.7）。
    #[test]
    fn windows_specific_names_are_rejected() {
        assert!(validate_name(r"a\b").is_err());
        assert!(validate_name("a:b").is_err());
        assert!(validate_name("con").is_err());
        assert!(validate_name("CON.md").is_err());
        assert!(validate_name("com1 .txt").is_err());
        assert!(validate_name("trailing.").is_err());
        assert!(validate_name("trailing ").is_err());
        assert!(validate_name("console.md").is_ok());
    }

    #[test]
    fn create_makes_a_file_and_refuses_duplicates() {
        let d = temp_dir("create");
        let roots = vec![d.clone()];

        let file = create(&roots, &d, "a.md", false).unwrap();
        assert!(file.is_file());
        assert!(matches!(
            create(&roots, &d, "a.md", false),
            Err(CoreError::AlreadyExists(_))
        ));

        let dir = create(&roots, &d, "sub", true).unwrap();
        assert!(dir.is_dir());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn create_outside_the_roots_is_rejected() {
        let d = temp_dir("create-out");
        let inside = d.join("inside");
        std::fs::create_dir(&inside).unwrap();
        let roots = vec![inside];

        assert!(matches!(
            create(&roots, &d, "x.md", false),
            Err(CoreError::OutOfScope(_))
        ));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_root_cannot_be_renamed_or_trashed() {
        let d = temp_dir("root");
        let root = d.join("root");
        std::fs::create_dir(&root).unwrap();
        // 基点の親も許可されている場合（開いたファイルの親がそこにあるとき）でも拒む。
        let roots = vec![d.clone(), root.clone()];

        assert!(matches!(
            rename(&roots, &root, "other"),
            Err(CoreError::InvalidArgument(_))
        ));
        let mut done = Vec::new();
        assert!(trash(&roots, std::slice::from_ref(&root), None, &mut done).is_err());
        assert!(root.is_dir());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let d = temp_dir("rename");
        let roots = vec![d.clone()];
        std::fs::write(d.join("a.md"), "a").unwrap();
        std::fs::write(d.join("b.md"), "b").unwrap();

        assert!(matches!(
            rename(&roots, &d.join("a.md"), "b.md"),
            Err(CoreError::AlreadyExists(_))
        ));
        assert_eq!(std::fs::read_to_string(d.join("b.md")).unwrap(), "b");

        let moved = rename(&roots, &d.join("a.md"), "c.md").unwrap();
        assert_eq!(moved.to, d.join("c.md").display().to_string());
        assert!(d.join("c.md").is_file());
        std::fs::remove_dir_all(&d).ok();
    }

    #[cfg(windows)]
    #[test]
    fn a_case_only_rename_is_allowed_on_windows() {
        let d = temp_dir("case");
        let roots = vec![d.clone()];
        std::fs::write(d.join("readme.md"), "a").unwrap();

        rename(&roots, &d.join("readme.md"), "README.md").unwrap();
        let names = std::fs::read_dir(&d)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["README.md".to_owned()]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_folder_cannot_be_moved_into_itself() {
        let d = temp_dir("into-self");
        let roots = vec![d.clone()];
        let parent = d.join("parent");
        let child = parent.join("child");
        std::fs::create_dir_all(&child).unwrap();

        let mut done = Vec::new();
        assert!(matches!(
            move_into(&roots, std::slice::from_ref(&parent), &child, &mut done),
            Err(CoreError::InvalidArgument(_))
        ));
        assert!(done.is_empty());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn move_checks_every_item_before_moving_any() {
        let d = temp_dir("move-plan");
        let roots = vec![d.clone()];
        let dest = d.join("dest");
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(d.join("a.md"), "a").unwrap();
        std::fs::write(d.join("b.md"), "b").unwrap();
        std::fs::write(dest.join("b.md"), "existing").unwrap();

        let mut done = Vec::new();
        let result = move_into(&roots, &[d.join("a.md"), d.join("b.md")], &dest, &mut done);
        assert!(matches!(result, Err(CoreError::AlreadyExists(_))));
        assert!(done.is_empty());
        assert!(d.join("a.md").is_file());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn move_skips_children_of_selected_folders() {
        let d = temp_dir("move-nested");
        let roots = vec![d.clone()];
        let dest = d.join("dest");
        let folder = d.join("folder");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("x.md"), "x").unwrap();

        let mut done = Vec::new();
        move_into(
            &roots,
            &[folder.clone(), folder.join("x.md")],
            &dest,
            &mut done,
        )
        .unwrap();
        assert_eq!(done.len(), 1);
        assert!(dest.join("folder").join("x.md").is_file());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn copies_get_numbered_names() {
        let d = temp_dir("copy");
        let roots = vec![d.clone()];
        std::fs::write(d.join("a.md"), "a").unwrap();

        let mut done = Vec::new();
        copy_into(&roots, &[d.join("a.md")], &d, &mut done).unwrap();
        copy_into(&roots, &[d.join("a.md")], &d, &mut done).unwrap();
        assert!(d.join("a copy.md").is_file());
        assert!(d.join("a copy 2.md").is_file());
        assert_eq!(done.len(), 2);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_folder_is_copied_recursively() {
        let d = temp_dir("copy-dir");
        let roots = vec![d.clone()];
        let src = d.join("src");
        let dest = d.join("dest");
        std::fs::create_dir_all(src.join("nested")).unwrap();
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(src.join("nested").join("n.md"), "n").unwrap();

        let mut done = Vec::new();
        copy_into(&roots, std::slice::from_ref(&src), &dest, &mut done).unwrap();
        assert!(dest.join("src").join("nested").join("n.md").is_file());

        let mut again = Vec::new();
        assert!(copy_into(
            &roots,
            std::slice::from_ref(&src),
            &src.join("nested"),
            &mut again
        )
        .is_err());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn entries_outside_the_roots_are_rejected() {
        let d = temp_dir("entry-out");
        let inside = d.join("inside");
        std::fs::create_dir(&inside).unwrap();
        std::fs::write(d.join("secret.md"), "s").unwrap();
        let roots = vec![inside.clone()];

        assert!(matches!(
            resolve_entry(&roots, &inside.join("..").join("secret.md")),
            Err(CoreError::OutOfScope(_))
        ));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn relocate_follows_moved_folders() {
        let sep = std::path::MAIN_SEPARATOR;
        let from = format!("{sep}w{sep}docs");
        let to = format!("{sep}w{sep}notes");
        assert_eq!(
            relocate(&format!("{from}{sep}a.md"), &from, &to),
            Some(format!("{to}{sep}a.md"))
        );
        assert_eq!(relocate(&from, &from, &to), Some(to.clone()));
        assert_eq!(
            relocate(&format!("{sep}w{sep}docs-old{sep}a.md"), &from, &to),
            None
        );
    }
}
