//! エンコーディングの検出とデコード / エンコード。
//!
//! 02.architecture/04-rust-responsibilities.md §2 の `DocumentPayload` が要求する `bom` / `encoding` を扱う。
//! 保存時に読み込み時と同じバイト列へ戻せることが要件（N-CMP-03）。

use serde::{Deserialize, Serialize};

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
/// 中心ユースケースは「LLM が生成した UTF-8 のファイル」なので、
/// UTF-8 として妥当ならそれ以上疑わない（推定の誤りで文字化けするより確実）。
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

/// エンコーディングを指定して読み直す（03.ux-spec/07-status-and-notifications.md §3「クリックでエンコーディング再解釈」）。
///
/// # なぜ `detect` を素通りさせるのか
///
/// 再解釈を選ぶのは、**推定が外れたファイルを人が見て直すとき**である。
/// そこでもう一度推定を混ぜると、指定した意味が薄れる。
///
/// **BOM だけは指定に従って見る。** BOM は「そのエンコーディングである」という
/// 印であると同時に、**保存時に付け直すかどうか**の記録でもある
/// （`encode`）。剥がさずに本文へ混ぜると、先頭に見えない文字が出る。
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

    /// 再解釈（03.ux-spec/07-status-and-notifications.md §3）。**推定を素通りする。**
    ///
    /// 推定が外れたファイルを人が見て直すための操作なので、
    /// ここでもう一度推定を混ぜてはいけない。
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

    /// **BOM だけは指定に従って見る。** 剥がさないと本文の先頭に見えない文字が残り、
    /// 保存時に付け直すかどうかの記録（`encode`）も失われる。
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
    fn invalid_bytes_do_not_panic() {
        let bytes = [0xFFu8, 0x00, 0x80, 0x41];
        let d = detect(&bytes);
        let _ = decode(&bytes, d); // 置換文字になるだけで落ちないこと
    }
}
