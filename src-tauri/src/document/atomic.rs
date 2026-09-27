//! 原子的な書き込み（N-REL-01）。
//!
//! 一時ファイルへ書いてから置き換える手順をそのまま実装する。
//! 同一ディレクトリに一時ファイルを作成して書き込み + fsync し、元ファイルのパーミッション/属性を引き継いだ後、rename で置き換える（同一ボリューム内なので原子的）。
//!
//! 一時ファイルを同じディレクトリに作るのは、`rename` の原子性がボリューム内でしか保証されないためである。
//! `std::env::temp_dir()` を使ってはいけない。

use std::fs;
use std::io::Write;
use std::path::Path;

use crate::error::{CoreError, CoreResult};

/// 一時ファイル経由で `path` を置き換える。
///
/// 失敗した場合、元のファイルは一切変更されていないことが保証される。
pub fn write(path: &Path, bytes: &[u8]) -> CoreResult<()> {
    let dir = path.parent().ok_or_else(|| {
        CoreError::InvalidArgument(format!("親ディレクトリがない: {}", path.display()))
    })?;

    let file_name = path.file_name().and_then(|s| s.to_str()).ok_or_else(|| {
        CoreError::InvalidArgument(format!("ファイル名が不正: {}", path.display()))
    })?;

    let original_permissions = fs::metadata(path).ok().map(|m| m.permissions());

    let tmp = unique_temp_path(dir, file_name);

    // スコープを切って、rename の前に確実にハンドルを閉じる（Windows では必須）
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.flush()?;
        // 電源断でも中途半端なファイルが残らないようにする
        f.sync_all()?;
    }

    if let Some(perms) = original_permissions {
        // 引き継ぎに失敗しても保存自体は続行する（読み取り専用属性の付け替え等）
        let _ = fs::set_permissions(&tmp, perms);
    }

    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(e.into())
        }
    }
}

/// 同一ディレクトリ内で衝突しない一時ファイル名を作る。
///
/// 乱数への依存を避け、プロセス ID と単調増加カウンタで組み立てる。
/// 同一プロセス内の並行保存と、他プロセスとの衝突の両方を避けられる。
fn unique_temp_path(dir: &Path, file_name: &str) -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    dir.join(format!(".{file_name}.marxdown-{pid}-{n}.tmp"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let d =
            std::env::temp_dir().join(format!("marxdown-atomic-{}-{}", tag, std::process::id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn writes_a_new_file() {
        let dir = temp_dir("new");
        let path = dir.join("a.md");
        write(&path, b"hello").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn replaces_an_existing_file() {
        let dir = temp_dir("replace");
        let path = dir.join("b.md");
        fs::write(&path, b"before").unwrap();
        write(&path, b"after").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"after");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn leaves_no_temp_file_behind() {
        let dir = temp_dir("cleanup");
        let path = dir.join("c.md");
        write(&path, b"x").unwrap();
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().contains("marxdown-"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "一時ファイルが残っている: {leftovers:?}"
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn writes_bytes_verbatim_including_crlf_and_bom() {
        // N-CMP-03: バイト列をそのまま書けること
        let dir = temp_dir("verbatim");
        let path = dir.join("d.md");
        let bytes = [0xEFu8, 0xBB, 0xBF, b'a', b'\r', b'\n', b'b'];
        write(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_dir_all(&dir).ok();
    }
}
