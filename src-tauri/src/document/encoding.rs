//! エンコーディングの検出とデコード / エンコード。
//!
//! `DocumentPayload` が要求する `bom` / `encoding` を扱う。
//! 保存時に読み込み時と同じバイト列へ戻せることが要件（N-CMP-03）。

use serde::{Deserialize, Serialize};

/// 扱えるエンコーディング。
/// ここに無いものは UTF-8 として読み、不正なバイト列は U+FFFD に置換する（[`decode`]）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Encoding {
    Utf8,
    Utf16Le,
    Utf16Be,
    ShiftJis,
    EucJp,
}

impl Encoding {
    fn codec(self) -> &'static encoding_rs::Encoding {
        match self {
            Self::Utf8 => encoding_rs::UTF_8,
            Self::Utf16Le => encoding_rs::UTF_16LE,
            Self::Utf16Be => encoding_rs::UTF_16BE,
            Self::ShiftJis => encoding_rs::SHIFT_JIS,
            Self::EucJp => encoding_rs::EUC_JP,
        }
    }

    fn from_codec(codec: &'static encoding_rs::Encoding) -> Self {
        match codec.name() {
            "UTF-16LE" => Self::Utf16Le,
            "UTF-16BE" => Self::Utf16Be,
            "Shift_JIS" | "windows-31j" => Self::ShiftJis,
            "EUC-JP" => Self::EucJp,
            _ => Self::Utf8,
        }
    }
}

/// 検出結果。`bom` は「元のファイルに BOM があったか」であり、保存時に復元する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Detected {
    pub encoding: Encoding,
    pub bom: bool,
}

const BOM_UTF8: &[u8] = &[0xEF, 0xBB, 0xBF];
const BOM_UTF16LE: &[u8] = &[0xFF, 0xFE];
const BOM_UTF16BE: &[u8] = &[0xFE, 0xFF];

/// BOM を最優先に、無ければ chardetng で推定する。
///
/// 中心ユースケースは「LLM が生成した UTF-8 のファイル」であるため、UTF-8 として妥当ならそれ以上推定しない。
/// 推定を誤って文字化けさせるよりも確実である。
pub fn detect(bytes: &[u8]) -> Detected {
    if bytes.starts_with(BOM_UTF8) {
        return Detected {
            encoding: Encoding::Utf8,
            bom: true,
        };
    }
    if bytes.starts_with(BOM_UTF16LE) {
        return Detected {
            encoding: Encoding::Utf16Le,
            bom: true,
        };
    }
    if bytes.starts_with(BOM_UTF16BE) {
        return Detected {
            encoding: Encoding::Utf16Be,
            bom: true,
        };
    }

    // BOM 無し。UTF-8 として妥当ならそれを採る。
    if std::str::from_utf8(bytes).is_ok() {
        return Detected {
            encoding: Encoding::Utf8,
            bom: false,
        };
    }

    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let codec = detector.guess(None, true);
    Detected {
        encoding: Encoding::from_codec(codec),
        bom: false,
    }
}

/// バイナリ判定のために先頭を見る長さ。
///
/// 全体を走査しない。判定の材料は先頭に出そろっており、64MB のファイルを最後まで見る理由が無い。
pub const SNIFF_BYTES: u64 = 8 * 1024;

/// テキストとして扱えないバイト列か（N-REL-03）。
///
/// 判定は NUL バイトの有無だけで行う。画像・書庫・実行ファイルはいずれも先頭付近に NUL を含み、テキストは含まない。
/// 制御文字の割合などは見ない。ここで要るのは「Markdown として解釈してよいか」の可否だけであり、種別を推定する必要はない。
///
/// BOM 付きの UTF-16 は本文に NUL を含むため対象から外す。
/// BOM の無い UTF-16 はバイナリとして扱われるが、[`detect`] も UTF-16 とは推定しないため、元から読めない。
pub fn looks_binary(head: &[u8]) -> bool {
    if head.starts_with(BOM_UTF16LE) || head.starts_with(BOM_UTF16BE) {
        return false;
    }
    head.contains(&0)
}

/// エンコーディングを指定して読み直す。
///
/// `detect` を経由しないのは、再解釈を選ぶのが推定の外れたファイルを人が見て指定し直す場面だからである。
/// ここでもう一度推定を挟むと、指定する意味がなくなる。
/// BOM だけは指定に従って判定する。
/// BOM は当該エンコーディングであることを示すと同時に、保存時に付け直すかどうかの記録でもある（`encode`）。
/// 取り除かずに本文へ含めると、先頭に不可視の文字が残る。
pub fn force(bytes: &[u8], encoding: Encoding) -> Detected {
    let bom = match encoding {
        Encoding::Utf8 => bytes.starts_with(BOM_UTF8),
        Encoding::Utf16Le => bytes.starts_with(BOM_UTF16LE),
        Encoding::Utf16Be => bytes.starts_with(BOM_UTF16BE),
        // Shift_JIS / EUC-JP に BOM は無い。
        Encoding::ShiftJis | Encoding::EucJp => false,
    };
    Detected { encoding, bom }
}

/// バイト列を `String` にする。BOM は取り除く。
///
/// 不正なバイト列は U+FFFD に置換する（`N-REL-04`: 壊れた入力でも表示できること）。
pub fn decode(bytes: &[u8], detected: Detected) -> String {
    let body = if detected.bom {
        match detected.encoding {
            Encoding::Utf8 => &bytes[BOM_UTF8.len()..],
            Encoding::Utf16Le | Encoding::Utf16Be => &bytes[BOM_UTF16LE.len()..],
            _ => bytes,
        }
    } else {
        bytes
    };
    let (cow, _, _) = detected.encoding.codec().decode(body);
    cow.into_owned()
}

/// 保存用にバイト列へ戻す。BOM があったファイルには BOM を付け直す。
pub fn encode(text: &str, detected: Detected) -> Vec<u8> {
    let (cow, _, _) = detected.encoding.codec().encode(text);
    let mut out = Vec::with_capacity(cow.len() + 3);
    if detected.bom {
        match detected.encoding {
            Encoding::Utf8 => out.extend_from_slice(BOM_UTF8),
            Encoding::Utf16Le => out.extend_from_slice(BOM_UTF16LE),
            Encoding::Utf16Be => out.extend_from_slice(BOM_UTF16BE),
            _ => {}
        }
    }
    out.extend_from_slice(&cow);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_utf8_without_bom() {
        let d = detect("こんにちは".as_bytes());
        assert_eq!(
            d,
            Detected {
                encoding: Encoding::Utf8,
                bom: false
            }
        );
    }

    #[test]
    fn utf8_with_bom_is_detected_and_stripped() {
        let mut bytes = BOM_UTF8.to_vec();
        bytes.extend_from_slice("# 見出し".as_bytes());
        let d = detect(&bytes);
        assert!(d.bom);
        assert_eq!(d.encoding, Encoding::Utf8);
        assert_eq!(decode(&bytes, d), "# 見出し");
    }

    #[test]
    fn utf16le_with_bom() {
        let mut bytes = BOM_UTF16LE.to_vec();
        for u in "abc".encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let d = detect(&bytes);
        assert_eq!(d.encoding, Encoding::Utf16Le);
        assert_eq!(decode(&bytes, d), "abc");
    }

    #[test]
    fn shift_jis_is_guessed_when_not_valid_utf8() {
        let (bytes, _, _) = encoding_rs::SHIFT_JIS.encode("日本語のテキストです");
        let d = detect(&bytes);
        assert_eq!(d.encoding, Encoding::ShiftJis);
        assert_eq!(decode(&bytes, d), "日本語のテキストです");
    }

    #[test]
    fn round_trip_preserves_bytes() {
        let cases: Vec<Vec<u8>> = vec![
            "plain ascii".as_bytes().to_vec(),
            "日本語 UTF-8".as_bytes().to_vec(),
            {
                let mut v = BOM_UTF8.to_vec();
                v.extend_from_slice("BOM 付き".as_bytes());
                v
            },
        ];
        for original in cases {
            let d = detect(&original);
            let text = decode(&original, d);
            assert_eq!(encode(&text, d), original);
        }
    }

    /// 再解釈。推定を経由しない。
    ///
    /// 推定が外れたファイルを人が見て直すための操作なので、ここでもう一度推定を混ぜてはいけない。
    #[test]
    fn forcing_an_encoding_skips_detection() {
        // UTF-8 として妥当なので、`detect` は必ず UTF-8 と答えるバイト列。
        let bytes = "abc".as_bytes();
        assert_eq!(detect(bytes).encoding, Encoding::Utf8);

        let d = force(bytes, Encoding::ShiftJis);
        assert_eq!(
            d,
            Detected {
                encoding: Encoding::ShiftJis,
                bom: false
            }
        );
    }

    /// BOM だけは指定に従って判定する。
    /// 取り除かないと本文の先頭に不可視の文字が残り、保存時に付け直すかどうかの記録（`encode`）も失われる。
    #[test]
    fn forcing_still_strips_a_matching_bom() {
        let mut bytes = BOM_UTF8.to_vec();
        bytes.extend_from_slice("# 見出し".as_bytes());

        let d = force(&bytes, Encoding::Utf8);

        assert!(d.bom);
        assert_eq!(decode(&bytes, d), "# 見出し");
        // 往復してもバイト列が変わらない（N-CMP-03）。
        assert_eq!(encode(&decode(&bytes, d), d), bytes);
    }

    /// BOM を持たないエンコーディングを指定したときに、BOM を探しに行かない。
    #[test]
    fn forcing_shift_jis_never_reports_a_bom() {
        let mut bytes = BOM_UTF8.to_vec();
        bytes.extend_from_slice("abc".as_bytes());

        let d = force(&bytes, Encoding::ShiftJis);

        assert!(!d.bom);
    }

    #[test]
    fn nul_bytes_mark_a_buffer_as_binary() {
        assert!(looks_binary(&[0x89, 0x50, 0x4E, 0x47, 0x00]));
        assert!(!looks_binary(
            "# 見出し
本文
"
            .as_bytes()
        ));
        // タブ・改行・CR はテキストに現れる。
        assert!(!looks_binary(
            b"a	b
c"
        ));
    }

    /// BOM 付き UTF-16 は本文に NUL を含む。ここで除外すると読めるはずのファイルが読めなくなる。
    #[test]
    fn utf16_with_a_bom_is_not_binary() {
        let mut le = BOM_UTF16LE.to_vec();
        let mut be = BOM_UTF16BE.to_vec();
        for u in "abc".encode_utf16() {
            le.extend_from_slice(&u.to_le_bytes());
            be.extend_from_slice(&u.to_be_bytes());
        }
        assert!(!looks_binary(&le));
        assert!(!looks_binary(&be));
    }

    #[test]
    fn invalid_bytes_do_not_panic() {
        let bytes = [0xFFu8, 0x00, 0x80, 0x41];
        let d = detect(&bytes);
        let _ = decode(&bytes, d); // 置換文字になるだけで落ちないこと
    }
}
