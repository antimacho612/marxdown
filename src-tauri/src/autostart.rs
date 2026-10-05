//! ログイン時の自動起動（ADR-0022）。
//!
//! `settings.json` の `window.launchAtLogin` を真実とし、OS の登録をそれに合わせる。
//! 登録先は Windows が `HKCU\...\CurrentVersion\Run`、macOS が LaunchAgent、Linux が XDG autostart である（M10 §4.4）。
//! 合わせるのは設定を読むたび（起動時・設定 UI からの保存・外部編集の読み直し）で、タイマーは持たない。
//! トレイに格納できない設定（`window.closeToTray = false`）と、トレイを出せない Linux では登録しない。
//! `--background` で起動しても何もせずに終了するためである。

use crate::settings::Settings;

/// `Run` に書く値の名前。
#[cfg(windows)]
const VALUE_NAME: &str = "Marxdown";

/// 設定に合わせて OS の登録を書く、または消す。
/// 失敗しても続ける。
///
/// `residency` は `✕` で隠したウィンドウを戻す手段があるか（`AppState::has_residency`）。
/// 開発ビルドでは何もしない。
/// `pnpm dev` の実行ファイルが登録されるのを防ぐためである。
pub fn sync(settings: &Settings, residency: bool) {
    let enabled = settings.window_launch_at_login && settings.window_close_to_tray && residency;
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

/// LaunchAgent（`~/Library/LaunchAgents/com.antimacho612.marxdown.plist`）を書く、または消す。
///
/// `launchctl` で読み込まない。
/// 次のログインで launchd が読み込むため、登録した直後に起動させる必要は無い。
#[cfg(target_os = "macos")]
fn apply(enabled: bool) -> std::io::Result<()> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(());
    };
    let path = std::path::Path::new(&home)
        .join("Library/LaunchAgents")
        .join(format!("{IDENTIFIER}.plist"));
    if !enabled {
        return remove(&path);
    }
    let exe = dunce::canonicalize(std::env::current_exe()?)?;
    write_if_changed(&path, &launch_agent(&exe.display().to_string()))
}

/// XDG autostart（`~/.config/autostart/com.antimacho612.marxdown.desktop`）を書く、または消す。
///
/// AppImage では、マウントした中身ではなく AppImage 自身のパスを書く（`detach.rs` と同じ理由）。
#[cfg(all(unix, not(target_os = "macos")))]
fn apply(enabled: bool) -> std::io::Result<()> {
    let Some(config) = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))
    else {
        return Ok(());
    };
    let path = config
        .join("autostart")
        .join(format!("{IDENTIFIER}.desktop"));
    if !enabled {
        return remove(&path);
    }
    let exe = match std::env::var_os("APPIMAGE").filter(|v| !v.is_empty()) {
        Some(image) => std::path::PathBuf::from(image),
        None => std::env::current_exe()?,
    };
    write_if_changed(&path, &desktop_entry(&exe.display().to_string()))
}

/// 登録の名前。
/// `tauri.conf.json` の `identifier` と同じである。
#[cfg(not(windows))]
const IDENTIFIER: &str = "com.antimacho612.marxdown";

/// 同じ内容なら書かない。
/// 起動のたびにファイルを書き換えないためである。
#[cfg(not(windows))]
fn write_if_changed(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).is_ok_and(|current| current == content) {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, content)
}

#[cfg(not(windows))]
fn remove(path: &std::path::Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// `Run` に書く値。パスに空白を含むことがあるため引用符で囲む。
#[cfg_attr(not(windows), allow(dead_code))]
fn command_line(exe: &str) -> String {
    format!("\"{exe}\" --background")
}

/// LaunchAgent の内容。
/// `ProgramArguments` は配列なので、パスの空白を引用符で囲まなくてよい。
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn launch_agent(exe: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\">\n\
         <dict>\n\
         \t<key>Label</key>\n\
         \t<string>com.antimacho612.marxdown</string>\n\
         \t<key>ProgramArguments</key>\n\
         \t<array>\n\
         \t\t<string>{}</string>\n\
         \t\t<string>--background</string>\n\
         \t</array>\n\
         \t<key>RunAtLoad</key>\n\
         \t<true/>\n\
         </dict>\n\
         </plist>\n",
        xml_escape(exe)
    )
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// XDG autostart の内容。
/// `Exec` の引数は空白と引用符をエスケープした上で引用符で囲む（Desktop Entry 仕様）。
#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
fn desktop_entry(exe: &str) -> String {
    let quoted = exe
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$");
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Marxdown\n\
         Exec=\"{quoted}\" --background\n\
         NoDisplay=true\n\
         X-GNOME-Autostart-enabled=true\n"
    )
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

    #[test]
    fn the_launch_agent_runs_at_load_in_the_background() {
        let plist = launch_agent("/Applications/A & B.app/Contents/MacOS/marxdown");
        assert!(
            plist.contains("<string>/Applications/A &amp; B.app/Contents/MacOS/marxdown</string>")
        );
        assert!(plist.contains("<string>--background</string>"));
        assert!(plist.contains("<key>RunAtLoad</key>\n\t<true/>"));
    }

    /// `Exec` の値は Desktop Entry の規則で解釈される。
    /// 空白と引用符を含むパスが 1 つの引数のまま渡ること。
    #[test]
    fn the_desktop_entry_quotes_the_path() {
        let entry = desktop_entry("/home/a b/Marx\"down$.AppImage");
        assert!(entry.contains(r#"Exec="/home/a b/Marx\"down\$.AppImage" --background"#));
        assert!(entry.starts_with("[Desktop Entry]\n"));
    }
}
