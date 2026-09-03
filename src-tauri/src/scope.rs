//! パスのスコープ検証（N-SEC-05 / ADR-0006）。
//!
//! 中心ユースケースは「LLM が生成した、自分が書いていないファイルを開く」こと。
//! そのファイルに `![](../../../../Users/me/.ssh/id_rsa)` が書かれていても、
//! 許可ディレクトリの外へは絶対に出さない。
//!
//! prefix 比較ではいけない。
//! 許可ディレクトリが `C:\work\docs` のとき、要求パス `C:\work\docs-secret\x.png` は文字列の prefix 比較だと `C:\work\docs` で始まるため通ってしまう。
//! パスコンポーネント単位で比較する必要がある。
//!
//! また `..` と symlink による脱出を防ぐため、比較の前に必ず
//! `dunce::canonicalize`（symlink 解決を含む）を通す。

use std::path::{Component, Path, PathBuf};

use crate::error::{CoreError, CoreResult};

/// `child` が `root` の配下（または root 自身）かどうか。
///
/// 両者とも **canonicalize 済み**であることを前提とする。
pub fn is_within(root: &Path, child: &Path) -> bool {
    let root_components: Vec<Component> = root.components().collect();
    let child_components: Vec<Component> = child.components().collect();

    if child_components.len() < root_components.len() {
        return false;
    }

    root_components
        .iter()
        .zip(child_components.iter())
        .all(|(a, b)| component_eq(a, b))
}

/// Windows のパスは大文字小文字を区別しない。それ以外は区別する。
fn component_eq(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
    } else {
        a == b
    }
}

/// `candidate` を正規化し、いずれかの `roots` の配下にあることを検証する。
///
/// 正規化に失敗した場合（存在しないパス）は拒否する。
/// アセット解決は既存ファイルを指すはずであり、存在しないものを通す理由がない。
pub fn resolve_within(roots: &[PathBuf], candidate: &Path) -> CoreResult<PathBuf> {
    let resolved = dunce::canonicalize(candidate)
        .map_err(|_| CoreError::NotFound(candidate.display().to_string()))?;

    for root in roots {
        // root 自身も symlink である可能性があるため、毎回解決する
        let Ok(root) = dunce::canonicalize(root) else {
            continue;
        };
        if is_within(&root, &resolved) {
            return Ok(resolved);
        }
    }

    Err(CoreError::OutOfScope(resolved.display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[cfg(windows)]
    mod windows {
        use super::*;

        #[test]
        fn a_child_is_within_its_root() {
            assert!(is_within(
                &p(r"C:\work\docs"),
                &p(r"C:\work\docs\img\a.png")
            ));
        }

        #[test]
        fn the_root_itself_is_within() {
            assert!(is_within(&p(r"C:\work\docs"), &p(r"C:\work\docs")));
        }

        /// prefix 比較で通ってしまう典型例。コンポーネント比較なら弾ける。
        #[test]
        fn a_sibling_with_a_shared_prefix_is_rejected() {
            assert!(!is_within(
                &p(r"C:\work\docs"),
                &p(r"C:\work\docs-secret\x.png")
            ));
        }

        #[test]
        fn a_parent_is_not_within() {
            assert!(!is_within(&p(r"C:\work\docs"), &p(r"C:\work")));
        }

        #[test]
        fn another_drive_is_rejected() {
            assert!(!is_within(&p(r"C:\work\docs"), &p(r"D:\work\docs\a.png")));
        }

        #[test]
        fn comparison_is_case_insensitive_on_windows() {
            assert!(is_within(&p(r"C:\Work\Docs"), &p(r"c:\work\docs\a.png")));
        }
    }

    #[cfg(not(windows))]
    mod unix {
        use super::*;

        #[test]
        fn a_child_is_within_its_root() {
            assert!(is_within(&p("/work/docs"), &p("/work/docs/img/a.png")));
        }

        #[test]
        fn a_sibling_with_a_shared_prefix_is_rejected() {
            assert!(!is_within(&p("/work/docs"), &p("/work/docs-secret/x.png")));
        }

        #[test]
        fn comparison_is_case_sensitive_on_unix() {
            assert!(!is_within(&p("/work/Docs"), &p("/work/docs/a.png")));
        }
    }

    /// `..` による脱出は canonicalize 済みのパスを比較する限り成立しない。
    #[test]
    fn dot_dot_escape_is_rejected_after_resolution() {
        let dir = std::env::temp_dir().join(format!("marxdown-scope-{}", std::process::id()));
        let inside = dir.join("docs");
        std::fs::create_dir_all(&inside).unwrap();
        let secret = dir.join("secret.txt");
        std::fs::write(&secret, "s").unwrap();

        let roots = vec![inside.clone()];
        // docs/../secret.txt を要求する
        let err = resolve_within(&roots, &inside.join("..").join("secret.txt")).unwrap_err();
        assert_eq!(err.kind(), "out-of-scope");

        // 配下のファイルは通る
        let ok_file = inside.join("a.png");
        std::fs::write(&ok_file, "x").unwrap();
        assert!(resolve_within(&roots, &inside.join(".").join("a.png")).is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_missing_file_is_rejected() {
        let dir = std::env::temp_dir();
        let err = resolve_within(
            std::slice::from_ref(&dir),
            &dir.join("definitely-missing-9f8a.png"),
        )
        .unwrap_err();
        assert_eq!(err.kind(), "not-found");
    }
}
