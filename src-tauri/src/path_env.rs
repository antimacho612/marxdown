//! ユーザーの PATH への `bin` ディレクトリの登録と解除（F-OS-02 / OQ-32）。
//!
//! インストーラ（`windows/installer-hooks.nsh`）が `--add-to-path` / `--remove-from-path` で呼ぶ。
//! NSIS の文字列は 1024 文字で切り詰められ、長い PATH を壊すため、NSIS では書き換えない。
//! Tauri が同梱する NSIS は 1024 文字を超える値を切り詰めるため、書き戻すと利用者の PATH が壊れる。
//!
//! 触るのは `HKCU\Environment` の `Path` だけである。
//! 値の型（`REG_SZ` / `REG_EXPAND_SZ`）と、Marxdown 以外のエントリのバイト列は変えない。

use std::io;

use crate::cli::PathOp;

/// `--add-to-path` / `--remove-from-path` を実行し、プロセスの終了コードを返す。
///
/// 対象は、実行中の `marxdown.exe` と同じディレクトリにある `bin` である。
/// 追加は、そこに CLI シム（`marxdown.cmd`）があるときに限る。
/// 開発ビルドなど、シムの無い場所を PATH に入れないためである。
/// Windows 以外では何もせず失敗を返す。
pub fn run(op: PathOp) -> i32 {
    match apply(op) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("[marxdown] PATH を更新できなかった: {e}");
            1
        }
    }
}

#[cfg(windows)]
fn apply(op: PathOp) -> io::Result<()> {
    let dir = bin_dir()?;
    if op == PathOp::Add && !dir.join("marxdown.cmd").is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("CLI シムが無い: {}", dir.display()),
        ));
    }
    let dir = dir.to_string_lossy();

    let current = registry::read_user_path()?;
    let (list, expand) = match &current {
        Some(value) => (value.list.as_str(), value.expand),
        None => ("", true),
    };

    let next = match op {
        PathOp::Add => with_entry(list, &dir),
        PathOp::Remove => without_entry(list, &dir),
    };
    let Some(next) = next else {
        return Ok(());
    };

    // 自分のエントリしか無かった値は、値ごと消して登録前の状態に戻す。
    if next.is_empty() {
        registry::delete_user_path()?;
    } else {
        registry::write_user_path(&next, expand)?;
    }
    registry::broadcast_environment_change();
    Ok(())
}

#[cfg(not(windows))]
fn apply(_op: PathOp) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows 以外では PATH を変更しない",
    ))
}

#[cfg(windows)]
fn bin_dir() -> io::Result<std::path::PathBuf> {
    let exe = dunce::canonicalize(std::env::current_exe()?)?;
    let parent = exe
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "実行ファイルの親が無い"))?;
    Ok(parent.join("bin"))
}

/// `list` の末尾に `dir` を足した値を返す。同じディレクトリが既にあれば `None`。
///
/// 末尾が `;` でも区切りを 1 つ足す。
/// [`without_entry`] で外したときに、元の値へバイト単位で戻すためである。
pub fn with_entry(list: &str, dir: &str) -> Option<String> {
    if list.split(';').any(|entry| same_dir(entry, dir)) {
        return None;
    }
    if list.is_empty() {
        Some(dir.to_string())
    } else {
        Some(format!("{list};{dir}"))
    }
}

/// `list` から `dir` と同じディレクトリのエントリをすべて除いた値を返す。無ければ `None`。
///
/// 他のエントリは空のエントリも含めて、順序もバイト列もそのまま残す。
pub fn without_entry(list: &str, dir: &str) -> Option<String> {
    let entries: Vec<&str> = list.split(';').collect();
    let kept: Vec<&str> = entries
        .iter()
        .copied()
        .filter(|entry| !same_dir(entry, dir))
        .collect();
    if kept.len() == entries.len() {
        return None;
    }
    Some(kept.join(";"))
}

/// Windows のパスとして同じディレクトリを指すか。
///
/// 大文字小文字、区切り文字（`/` と `\`）、末尾の区切り、前後の空白と引用符の違いを無視する。
/// 環境変数（`%LOCALAPPDATA%` など）は展開しない。
/// インストーラが書くのは展開済みのパスであり、それと比べられれば足りる。
fn same_dir(entry: &str, dir: &str) -> bool {
    fn normalize(path: &str) -> String {
        path.trim()
            .trim_matches('"')
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    }
    let entry = normalize(entry);
    !entry.is_empty() && entry == normalize(dir)
}

#[cfg(windows)]
mod registry {
    use std::io;

    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{
        ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS, LPARAM, WIN32_ERROR, WPARAM,
    };
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_EXPAND_SZ, REG_SZ, REG_VALUE_TYPE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    const SUBKEY: PCWSTR = w!("Environment");
    const VALUE: PCWSTR = w!("Path");

    pub struct UserPath {
        pub list: String,
        /// `REG_EXPAND_SZ` なら `true`。書き戻すときに同じ型を使う。
        pub expand: bool,
    }

    struct Key(HKEY);

    impl Drop for Key {
        fn drop(&mut self) {
            let _ = unsafe { RegCloseKey(self.0) };
        }
    }

    fn check(status: WIN32_ERROR) -> io::Result<()> {
        if status == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(io::Error::from_raw_os_error(status.0 as i32))
        }
    }

    fn open() -> io::Result<Key> {
        let mut key = HKEY::default();
        check(unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                SUBKEY,
                None,
                KEY_QUERY_VALUE | KEY_SET_VALUE,
                &mut key,
            )
        })?;
        Ok(Key(key))
    }

    /// `Path` を読む。値が無ければ `None`。
    ///
    /// 文字列以外の型や、UTF-16 として壊れている値は読み取りの失敗として返す。
    /// 解釈できない値を書き戻すと、利用者の PATH を壊すためである。
    pub fn read_user_path() -> io::Result<Option<UserPath>> {
        let key = open()?;
        let mut kind = REG_VALUE_TYPE::default();
        let mut size = 0u32;

        // 読む間に別のプロセスが値を伸ばすと ERROR_MORE_DATA になる。大きさを取り直して読み直す。
        for _ in 0..3 {
            let status = unsafe {
                RegQueryValueExW(key.0, VALUE, None, Some(&mut kind), None, Some(&mut size))
            };
            if status == ERROR_FILE_NOT_FOUND {
                return Ok(None);
            }
            check(status)?;

            let mut buffer = vec![0u16; (size as usize).div_ceil(2)];
            let status = unsafe {
                RegQueryValueExW(
                    key.0,
                    VALUE,
                    None,
                    Some(&mut kind),
                    Some(buffer.as_mut_ptr().cast()),
                    Some(&mut size),
                )
            };
            if status == ERROR_MORE_DATA {
                continue;
            }
            check(status)?;

            if kind != REG_SZ && kind != REG_EXPAND_SZ {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Path が文字列ではない（型 {}）", kind.0),
                ));
            }
            buffer.truncate((size as usize) / 2);
            while buffer.last() == Some(&0) {
                buffer.pop();
            }
            let list = String::from_utf16(&buffer)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
            return Ok(Some(UserPath {
                list,
                expand: kind == REG_EXPAND_SZ,
            }));
        }
        Err(io::Error::new(
            io::ErrorKind::Interrupted,
            "Path の読み取り中に値が変わり続けた",
        ))
    }

    pub fn write_user_path(list: &str, expand: bool) -> io::Result<()> {
        let key = open()?;
        let bytes: Vec<u8> = list
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let kind = if expand { REG_EXPAND_SZ } else { REG_SZ };
        check(unsafe { RegSetValueExW(key.0, VALUE, None, kind, Some(&bytes)) })
    }

    pub fn delete_user_path() -> io::Result<()> {
        let key = open()?;
        let status = unsafe { RegDeleteValueW(key.0, VALUE) };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(());
        }
        check(status)
    }

    /// 環境変数が変わったことを、起動中のプロセス（エクスプローラーなど）へ知らせる。
    ///
    /// これが無いと、次にサインインするまで新しいターミナルに PATH の変更が反映されない。
    /// 応答しないウィンドウで止まらないよう、待つのは 5 秒までにする。
    pub fn broadcast_environment_change() {
        let _ = unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(w!("Environment").as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                5000,
                None,
            )
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIN: &str = r"C:\Users\me\AppData\Local\Marxdown\bin";

    /// 追加して外すと、元の値にバイト単位で戻る。
    fn assert_round_trip(original: &str) {
        let added = with_entry(original, BIN).expect("追加される");
        assert_eq!(
            without_entry(&added, BIN).as_deref(),
            Some(original),
            "元の値: {original:?}"
        );
    }

    #[test]
    fn adds_to_the_end() {
        assert_eq!(
            with_entry(r"C:\a;C:\b", BIN),
            Some(format!(r"C:\a;C:\b;{BIN}"))
        );
    }

    #[test]
    fn adds_without_a_leading_separator_when_empty() {
        assert_eq!(with_entry("", BIN), Some(BIN.to_string()));
    }

    #[test]
    fn does_not_add_twice_even_if_spelled_differently() {
        for existing in [
            BIN.to_string(),
            BIN.to_uppercase(),
            format!(r"{BIN}\"),
            format!("\"{BIN}\""),
            BIN.replace('\\', "/"),
            format!(" {BIN} "),
        ] {
            let list = format!(r"C:\a;{existing};C:\b");
            assert_eq!(with_entry(&list, BIN), None, "{existing:?}");
        }
    }

    #[test]
    fn round_trips_to_the_same_bytes() {
        for original in [
            "",
            r"C:\a",
            r"C:\a;",
            r"C:\a;;C:\b",
            r";C:\a",
            r"%USERPROFILE%\bin;C:\a",
            r"C:\Users\山田\bin;C:\a",
        ] {
            assert_round_trip(original);
        }
    }

    /// NSIS の NSIS_MAX_STRLEN（1024）を超える長さでも、他のエントリは 1 バイトも変わらない。
    #[test]
    fn round_trips_a_path_longer_than_the_nsis_limit() {
        let original = (0..80)
            .map(|i| format!(r"C:\Tools\ツール{i:03}\bin"))
            .collect::<Vec<_>>()
            .join(";");
        assert!(original.len() > 1024);
        assert_round_trip(&original);
    }

    #[test]
    fn removes_every_matching_entry_and_keeps_the_rest_in_order() {
        let list = format!(r"{BIN};C:\a;{}\;C:\b", BIN.to_lowercase());
        assert_eq!(without_entry(&list, BIN), Some(r"C:\a;C:\b".to_string()));
    }

    #[test]
    fn removing_an_absent_entry_changes_nothing() {
        assert_eq!(without_entry(r"C:\a;C:\b", BIN), None);
        assert_eq!(without_entry("", BIN), None);
    }

    #[test]
    fn removing_the_only_entry_leaves_an_empty_value() {
        assert_eq!(without_entry(BIN, BIN), Some(String::new()));
    }

    /// 空のエントリは「同じディレクトリ」とみなさない。消すと他人の値の形が変わる。
    #[test]
    fn empty_entries_never_match() {
        assert_eq!(without_entry(r"C:\a;;C:\b", ""), None);
    }
}
