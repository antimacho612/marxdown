//! 貼り付けた画像の保存（F-EDIT-13 / N-SEC-05）。
//!
//! 保存先は開いているファイルの隣に作る `<ファイル名>.assets/` に限る。
//! 場所を選ばせない代わりに、**どこに置かれるかを操作の前に判断できる**（Design Brief Principle 3）。
//!
//! 書き込みを許すディレクトリは 1 つだけであり、フロントから場所を受け取らない。
//! 受け取る形にすると、そこがスコープ検証の対象になる。
//! 検証すべきものを増やさないほうが、防御としては確実である（ADR-0006）。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{CoreError, CoreResult};
use crate::scope;

/// 保存を許す拡張子。
///
/// `svg` を含めない。中身が実行可能なマークアップであり、クリップボードから来る形式としても稀である。
/// 表示の側は DOMPurify を通すが、**ディスクへ書く時点で通さない**ほうが層が 1 つ増える。
const ALLOWED: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// 1 枚あたりの上限。クリップボードの中身は際限なく大きくなりうる。
const MAX_BYTES: usize = 20 * 1024 * 1024;

/// 保存先ディレクトリの接尾辞。`spec.md` なら `spec.md.assets/` になる。
///
/// 拡張子を落として `spec.assets/` にしない。
/// `spec.md` と `spec.txt` を同じディレクトリに置いている場合に、保存先が衝突する。
const SUFFIX: &str = ".assets";

/// 保存した結果。
pub struct SavedAsset {
    /// ドキュメントから見た相対パス。`![](...)` にそのまま書ける形（区切りは `/`）。
    pub relative: String,
    /// 実際に書き込んだ絶対パス。呼び出し側が asset プロトコルのスコープへ足す。
    pub absolute: PathBuf,
}

/// 拡張子を検証して小文字へ揃える。
fn normalize_extension(extension: &str) -> CoreResult<String> {
    let lower = extension.trim_start_matches('.').to_ascii_lowercase();
    if ALLOWED.contains(&lower.as_str()) {
        Ok(lower)
    } else {
        Err(CoreError::InvalidArgument(format!(
            "保存できない拡張子: {extension}"
        )))
    }
}

/// 衝突しないファイル名を作る。
///
/// 連番だけにすると、別の文書から貼った画像と混ざったときに順序が読めない。
/// 時刻を先に置き、同じ秒に複数枚貼った場合だけ連番で逃がす。
fn unique_name(dir: &Path, stamp: &str, extension: &str) -> CoreResult<PathBuf> {
    let first = dir.join(format!("{stamp}.{extension}"));
    if !first.exists() {
        return Ok(first);
    }
    for n in 2..1000 {
        let candidate = dir.join(format!("{stamp}-{n}.{extension}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(CoreError::Io("保存先の名前を決められない".into()))
}

/// ファイル名の先頭に置く時刻。
///
/// 日付の形（`20260909-2245`）にはしない。カレンダー計算は std に無く、
/// **ファイル名を読みやすくするためだけに依存を 1 つ増やす**ことになる。
/// Unix 秒でも、並べ替えれば貼った順になるという用途は満たす。
fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("paste-{seconds}")
}

/// 画像を `<ファイル名>.assets/` へ保存する（F-EDIT-13）。
///
/// `document_path` は開いているファイルの絶対パスである。
/// 無題の文書には基点が無いため、呼び出し側がここへ来る前に断る（`features/editor/lazy/paste.ts`）。
///
/// 保存先ディレクトリは必要なら作る。
/// 作った後に canonicalize して、**ドキュメントの親ディレクトリの配下にあることを確かめる**。
/// 親が symlink である場合に、解決先が別の木へ出ていないことを見るためである。
pub fn save(document_path: &str, extension: &str, data: &[u8]) -> CoreResult<SavedAsset> {
    if data.is_empty() {
        return Err(CoreError::InvalidArgument("空の画像".into()));
    }
    if data.len() > MAX_BYTES {
        return Err(CoreError::TooLarge {
            path: document_path.to_string(),
            size: data.len() as u64,
        });
    }
    if document_path.contains('\0') {
        return Err(CoreError::InvalidArgument("パスに NUL が含まれる".into()));
    }

    let extension = normalize_extension(extension)?;

    let document = dunce::canonicalize(document_path)
        .map_err(|_| CoreError::NotFound(document_path.to_string()))?;
    let parent = document
        .parent()
        .ok_or_else(|| CoreError::InvalidArgument("親ディレクトリが無い".into()))?;
    let name = document
        .file_name()
        .ok_or_else(|| CoreError::InvalidArgument("ファイル名が無い".into()))?
        .to_string_lossy()
        .to_string();

    let dir_name = format!("{name}{SUFFIX}");
    let dir = parent.join(&dir_name);
    fs::create_dir_all(&dir).map_err(|e| CoreError::Io(e.to_string()))?;

    // 作った後に解決し直す。親が symlink なら、ここで初めて実際の行き先が分かる。
    let resolved_dir =
        dunce::canonicalize(&dir).map_err(|_| CoreError::NotFound(dir.display().to_string()))?;
    if !scope::is_within(parent, &resolved_dir) {
        return Err(CoreError::OutOfScope(resolved_dir.display().to_string()));
    }

    let target = unique_name(&resolved_dir, &timestamp(), &extension)?;
    fs::write(&target, data).map_err(|e| CoreError::Io(e.to_string()))?;

    let file_name = target
        .file_name()
        .ok_or_else(|| CoreError::Io("保存先の名前を取得できない".into()))?
        .to_string_lossy()
        .to_string();

    Ok(SavedAsset {
        // 区切りは `/` に揃える。Markdown のリンクとして書くものであり、Windows の `\` はエスケープと衝突する。
        relative: format!("{dir_name}/{file_name}"),
        absolute: target,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1 件ごとに独立したディレクトリを作る（`bootstrap.rs` と同じ形）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("marxdown-asset-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("一時ディレクトリ");
        dir
    }

    fn temp_document(tag: &str) -> PathBuf {
        let path = temp_dir(tag).join("spec.md");
        fs::write(&path, "# 見出し\n").expect("書き込み");
        path
    }

    #[test]
    fn saves_next_to_the_document() {
        let document = temp_document("next-to");
        let saved = save(&document.to_string_lossy(), "png", &[1, 2, 3]).expect("保存");

        assert!(saved.relative.starts_with("spec.md.assets/"));
        assert!(saved.relative.ends_with(".png"));
        assert_eq!(fs::read(&saved.absolute).expect("読み込み"), vec![1, 2, 3]);
    }

    /// 区切りは `/` に揃える。Windows の `\` は Markdown のエスケープと衝突する。
    #[test]
    fn the_relative_path_uses_forward_slashes() {
        let document = temp_document("slashes");
        let saved = save(&document.to_string_lossy(), "png", &[1]).expect("保存");
        assert!(!saved.relative.contains('\\'));
    }

    /// 同じ秒に 2 枚貼っても上書きしない。
    #[test]
    fn does_not_overwrite_an_existing_file() {
        let document = temp_document("overwrite");
        let first = save(&document.to_string_lossy(), "png", &[1]).expect("1 枚目");
        let second = save(&document.to_string_lossy(), "png", &[2]).expect("2 枚目");

        assert_ne!(first.relative, second.relative);
        assert_eq!(fs::read(&first.absolute).expect("読み込み"), vec![1]);
        assert_eq!(fs::read(&second.absolute).expect("読み込み"), vec![2]);
    }

    #[test]
    fn rejects_an_extension_outside_the_list() {
        let document = temp_document("extension");
        // `svg` は中身が実行可能なマークアップであるため通さない。
        assert!(save(&document.to_string_lossy(), "svg", &[1]).is_err());
        assert!(save(&document.to_string_lossy(), "exe", &[1]).is_err());
    }

    #[test]
    fn accepts_an_extension_with_a_dot_and_uppercase() {
        let document = temp_document("uppercase");
        assert!(save(&document.to_string_lossy(), ".PNG", &[1]).is_ok());
    }

    #[test]
    fn rejects_an_empty_image() {
        let document = temp_document("empty");
        assert!(save(&document.to_string_lossy(), "png", &[]).is_err());
    }

    #[test]
    fn rejects_an_image_over_the_limit() {
        let document = temp_document("too-large");
        let data = vec![0_u8; MAX_BYTES + 1];
        assert!(save(&document.to_string_lossy(), "png", &data).is_err());
    }

    #[test]
    fn rejects_a_document_that_does_not_exist() {
        assert!(save("/does/not/exist.md", "png", &[1]).is_err());
    }

    /// 拡張子を落とさない。`spec.md` と `spec.txt` の保存先が衝突する。
    #[test]
    fn the_directory_keeps_the_full_file_name() {
        let dir = temp_dir("full-name");
        let md = dir.join("spec.md");
        let txt = dir.join("spec.txt");
        fs::write(&md, "a").expect("書き込み");
        fs::write(&txt, "a").expect("書き込み");

        let from_md = save(&md.to_string_lossy(), "png", &[1]).expect("md");
        let from_txt = save(&txt.to_string_lossy(), "png", &[2]).expect("txt");

        assert!(from_md.relative.starts_with("spec.md.assets/"));
        assert!(from_txt.relative.starts_with("spec.txt.assets/"));
    }
}
