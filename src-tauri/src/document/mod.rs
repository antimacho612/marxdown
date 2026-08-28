//! ドキュメントの読み書き。
//!
//! 02.architecture/04-rust-responsibilities.md §2 / §4.3。`tauri-plugin-fs` を使わず自作しているのは、
//! EOL / BOM / mtime / 原子性の制御が要件（F-EDIT-14 / N-REL-01 / N-CMP-03）だから
//! （04.tech-stack/06-rust.md §3）。

pub mod atomic;
pub mod encoding;
pub mod eol;

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use encoding::{Detected, Encoding};
use eol::Eol;

/// 開けるファイルの上限。05.performance-budget/07-not-optimized.md は
/// 「10MB を超えるファイルの快適な編集」を対象外としているが、
/// 開くこと自体は許して「クラッシュしない」を保証する。
/// ここを超えるものはメタ情報だけ返し、本文は読まない。
pub const MAX_READ_BYTES: u64 = 64 * 1024 * 1024;

/// 初期化スクリプトへ本文ごと埋め込む上限（02.architecture/05-startup-sequence.md §1）。
/// これを超える場合はメタ情報のみ注入し、本文は非同期で受け取る。
pub const INLINE_CONTENT_LIMIT: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    /// 正規化済み絶対パス
    pub path: String,
    pub eol: Eol,
    pub bom: bool,
    pub encoding: Encoding,
    pub mtime_ms: i64,
    pub size: u64,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    #[serde(flatten)]
    pub meta: DocumentMeta,
    /// EOL を LF に正規化した本文。
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
    pub path: String,
    /// LF 正規化された本文。保存時に `eol` へ戻す。
    pub content: String,
    pub eol: Eol,
    pub bom: bool,
    pub encoding: Encoding,
    /// 読み込み時（または前回保存時）の mtime。`None` は新規ファイル。
    pub expected_mtime_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SaveResult {
    /// 保存に成功した。新しい mtime を返す。
    Saved { mtime_ms: i64, size: u64 },
    /// ディスク上の mtime が `expected_mtime_ms` と一致しない。
    /// UI が「上書き / 再読込 / 差分を見る」を提示する（02.architecture/04-rust-responsibilities.md §3）。
    Conflict { disk_mtime_ms: i64 },
}

/// パスを正規化する。symlink も解決する。
///
/// Windows の `std::fs::canonicalize` は `\\?\C:\...` を返し、表示にも比較にも使えない。
/// `dunce` で通常形式に戻す（04.tech-stack/06-rust.md §2）。
///
/// 存在しないパスは canonicalize できないため、親ディレクトリだけ解決して結合する。
pub fn canonicalize(path: &Path) -> CoreResult<PathBuf> {
    if let Ok(p) = dunce::canonicalize(path) {
        return Ok(p);
    }
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::NotFound(path.display().to_string()))?;
    let name = path
        .file_name()
        .ok_or_else(|| CoreError::NotFound(path.display().to_string()))?;
    let parent =
        dunce::canonicalize(parent).map_err(|_| CoreError::NotFound(path.display().to_string()))?;
    Ok(parent.join(name))
}

/// `pub` なのは、ファイル監視（`watch.rs`）が同じ規則で mtime を見る必要があるため。
/// 自己イベントの照合が読み書きと 1ms でもずれると、弾けなくなる。
pub fn mtime_ms(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// ファイルを読んで `DocumentPayload` を作る。
///
/// この関数は**起動シーケンスのクリティカルパス上で、WebView 初期化と並行に**
/// 呼ばれる（02.architecture/05-startup-sequence.md §1）。余計な仕事をしない。
pub fn read(path: &Path) -> CoreResult<DocumentPayload> {
    let path = canonicalize(path)?;
    let fs_meta = std::fs::metadata(&path)?;

    if fs_meta.is_dir() {
        return Err(CoreError::InvalidArgument(format!(
            "ディレクトリは read できない: {}",
            path.display()
        )));
    }

    let size = fs_meta.len();
    if size > MAX_READ_BYTES {
        return Err(CoreError::TooLarge {
            path: path.display().to_string(),
            size,
        });
    }

    let bytes = std::fs::read(&path)?;
    let detected = encoding::detect(&bytes);
    let raw = encoding::decode(&bytes, detected);
    let detected_eol = eol::detect(&raw);
    let content = eol::normalize(&raw);

    Ok(DocumentPayload {
        meta: DocumentMeta {
            path: path.display().to_string(),
            eol: detected_eol,
            bom: detected.bom,
            encoding: detected.encoding,
            mtime_ms: mtime_ms(&fs_meta),
            size,
            readonly: fs_meta.permissions().readonly(),
        },
        content,
    })
}

/// 衝突を検知したうえで原子的に保存する。
pub fn write(req: &WriteRequest) -> CoreResult<SaveResult> {
    let path = canonicalize(Path::new(&req.path))?;

    // 1. 衝突検知。expected が None（新規）のときは、既存ファイルがあれば衝突とみなす。
    match (std::fs::metadata(&path), req.expected_mtime_ms) {
        (Ok(m), Some(expected)) => {
            let disk = mtime_ms(&m);
            if disk != expected {
                return Ok(SaveResult::Conflict {
                    disk_mtime_ms: disk,
                });
            }
        }
        (Ok(m), None) => {
            return Ok(SaveResult::Conflict {
                disk_mtime_ms: mtime_ms(&m),
            });
        }
        (Err(_), _) => {} // 存在しない。新規作成として続行
    }

    // 2. LF → 元の EOL → 元のエンコーディング（+ BOM）の順で戻す
    let restored = eol::restore(&req.content, req.eol);
    let bytes = encoding::encode(
        &restored,
        Detected {
            encoding: req.encoding,
            bom: req.bom,
        },
    );

    // 3. 一時ファイル経由で置き換える
    atomic::write(&path, &bytes)?;

    let after = std::fs::metadata(&path)?;
    Ok(SaveResult::Saved {
        mtime_ms: mtime_ms(&after),
        size: after.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-doc-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn reads_lf_utf8() {
        let dir = temp_dir("lf");
        let p = dir.join("a.md");
        std::fs::write(&p, "# 見出し\n本文\n").unwrap();
        let doc = read(&p).unwrap();
        assert_eq!(doc.content, "# 見出し\n本文\n");
        assert_eq!(doc.meta.eol, Eol::Lf);
        assert!(!doc.meta.bom);
        assert_eq!(doc.meta.encoding, Encoding::Utf8);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn normalizes_crlf_in_memory_but_records_it() {
        let dir = temp_dir("crlf");
        let p = dir.join("b.md");
        std::fs::write(&p, "a\r\nb\r\n").unwrap();
        let doc = read(&p).unwrap();
        assert_eq!(doc.content, "a\nb\n", "メモリ上は LF");
        assert_eq!(doc.meta.eol, Eol::Crlf, "ディスク上の EOL を覚えている");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// N-CMP-03 の中核。読んで、触らずに保存したらバイト列が一致すること。
    #[test]
    fn read_then_save_untouched_keeps_bytes_identical() {
        let dir = temp_dir("roundtrip");
        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("lf.md", b"# a\nb\n".to_vec()),
            ("crlf.md", b"# a\r\nb\r\n".to_vec()),
            ("no-trailing.md", b"# a\nb".to_vec()),
            ("bom-crlf.md", {
                let mut v = vec![0xEF, 0xBB, 0xBF];
                v.extend_from_slice("# 見出し\r\n本文\r\n".as_bytes());
                v
            }),
        ];
        for (name, original) in cases {
            let p = dir.join(name);
            std::fs::write(&p, &original).unwrap();
            let doc = read(&p).unwrap();
            let result = write(&WriteRequest {
                path: doc.meta.path.clone(),
                content: doc.content.clone(),
                eol: doc.meta.eol,
                bom: doc.meta.bom,
                encoding: doc.meta.encoding,
                expected_mtime_ms: Some(doc.meta.mtime_ms),
            })
            .unwrap();
            assert!(
                matches!(result, SaveResult::Saved { .. }),
                "{name}: {result:?}"
            );
            assert_eq!(
                std::fs::read(&p).unwrap(),
                original,
                "{name} のバイト列が変わった"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_a_save_conflict() {
        let dir = temp_dir("conflict");
        let p = dir.join("c.md");
        std::fs::write(&p, "original\n").unwrap();
        let doc = read(&p).unwrap();

        // 外部から書き換えられたことにする
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&p, "changed by someone else\n").unwrap();

        let result = write(&WriteRequest {
            path: doc.meta.path.clone(),
            content: "my edit\n".to_string(),
            eol: doc.meta.eol,
            bom: doc.meta.bom,
            encoding: doc.meta.encoding,
            expected_mtime_ms: Some(doc.meta.mtime_ms),
        })
        .unwrap();

        assert!(matches!(result, SaveResult::Conflict { .. }));
        assert_eq!(
            std::fs::read_to_string(&p).unwrap(),
            "changed by someone else\n",
            "衝突時にディスクの内容を壊してはいけない"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reading_a_missing_file_is_not_found() {
        let dir = temp_dir("missing");
        let err = read(&dir.join("nope.md")).unwrap_err();
        assert_eq!(err.kind(), "not-found");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reading_a_directory_is_rejected() {
        let dir = temp_dir("isdir");
        let err = read(&dir).unwrap_err();
        assert_eq!(err.kind(), "invalid-argument");
        std::fs::remove_dir_all(&dir).ok();
    }
}
