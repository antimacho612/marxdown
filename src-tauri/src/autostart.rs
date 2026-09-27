//! ログイン時の自動起動（ADR-0022）。
//!
//! `settings.json` の `window.launchAtLogin` を真実とし、`HKCU\...\CurrentVersion\Run` の値をそれに合わせる。
//! 合わせるのは設定を読むたび（起動時・設定 UI からの保存・外部編集の読み直し）で、タイマーは持たない。
//! トレイに格納できない設定（`window.closeToTray = false`）では登録しない。`--background` で起動しても何もせずに終了するためである。

use crate::settings::Settings;

/// `Run` に書く値の名前。
#[cfg(windows)]
const VALUE_NAME: &str = "Marxdown";

/// 設定に合わせて `Run` の値を書く、または消す。失敗しても続ける。
///
/// 開発ビルドでは何もしない。`pnpm dev` の exe が登録されるのを防ぐためである。
/// Windows 以外でも何もしない。
pub fn sync(settings: &Settings) {
    let enabled = settings.window_launch_at_login && settings.window_close_to_tray;
    if cfg!(debug_assertions) {
        return;
    }
    if let Err(e) = apply(enabled) {
        eprintln!("[marxdown] ログイン時の自動起動を更新できなかった: {e}");
    }
}

#[cfg(windows)]
fn apply(enabled: bool) -> std::io::Result<()> {
    if !enabled {
        return registry::delete(VALUE_NAME);
    }
    let exe = dunce::canonicalize(std::env::current_exe()?)?;
    let command = command_line(&exe.display().to_string());
    // 同じ値なら書かない。起動のたびにレジストリへ書き込まないためである。
    if registry::read(VALUE_NAME)?.as_deref() == Some(command.as_str()) {
        return Ok(());
    }
    registry::write(VALUE_NAME, &command)
}

#[cfg(not(windows))]
fn apply(_enabled: bool) -> std::io::Result<()> {
    Ok(())
}

/// `Run` に書く値。パスに空白を含むことがあるため引用符で囲む。
#[cfg_attr(not(windows), allow(dead_code))]
fn command_line(exe: &str) -> String {
    format!("\"{exe}\" --background")
}

#[cfg(windows)]
mod registry {
    use std::io;

    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{
        ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS, WIN32_ERROR,
    };
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ, REG_VALUE_TYPE,
    };

    const SUBKEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Run");

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

    /// 値を読む。無い場合と文字列でない場合は `None`。
    pub fn read(name: &str) -> io::Result<Option<String>> {
        let key = open()?;
        let name = HSTRING::from(name);
        let mut kind = REG_VALUE_TYPE::default();
        let mut size = 0u32;

        for _ in 0..3 {
            let status = unsafe {
                RegQueryValueExW(key.0, &name, None, Some(&mut kind), None, Some(&mut size))
            };
            if status == ERROR_FILE_NOT_FOUND {
                return Ok(None);
            }
            check(status)?;

            let mut buffer = vec![0u16; (size as usize).div_ceil(2)];
            let status = unsafe {
                RegQueryValueExW(
                    key.0,
                    &name,
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

            if kind != REG_SZ {
                return Ok(None);
            }
            buffer.truncate((size as usize) / 2);
            while buffer.last() == Some(&0) {
                buffer.pop();
            }
            return Ok(String::from_utf16(&buffer).ok());
        }
        Ok(None)
    }

    pub fn write(name: &str, value: &str) -> io::Result<()> {
        let key = open()?;
        let bytes: Vec<u8> = value
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        check(unsafe { RegSetValueExW(key.0, &HSTRING::from(name), None, REG_SZ, Some(&bytes)) })
    }

    pub fn delete(name: &str) -> io::Result<()> {
        let key = open()?;
        let status = unsafe { RegDeleteValueW(key.0, &HSTRING::from(name)) };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(());
        }
        check(status)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_command_quotes_the_path_and_asks_for_background() {
        assert_eq!(
            command_line(r"C:\Program Files\Marxdown\marxdown.exe"),
            r#""C:\Program Files\Marxdown\marxdown.exe" --background"#
        );
    }
}
