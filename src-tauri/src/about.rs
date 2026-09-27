//! ヘルプメニューが使う、アプリ自身の情報（F-OS-09 / ADR-0026）。
//!
//! バージョン・OS・WebView2 の版を返すことと、インストーラに同梱したライセンス文を既定アプリで開くことだけを持つ。
//! 画面に出す文言と、不具合報告の URL の組み立てはフロントにある。

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{CoreError, CoreResult};

/// フロントへ渡すアプリの情報。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Marxdown のバージョン。`tauri.conf.json` が `package.json` から読む値と同じ。
    pub version: String,
    /// OS の名前と版。取れなかった部分は省く。
    pub os: String,
    /// WebView2 の版。取れなければ `None`。
    pub webview: Option<String>,
}

/// インストーラに同梱したファイルのうち、開いてよいもの。
///
/// フロントからパスを受け取らないための列挙である。
/// 受け取る形にすると、任意のファイルを既定アプリで開く経路になる（ADR-0006）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BundledFile {
    License,
    ThirdPartyNotices,
}

impl BundledFile {
    /// `tauri.conf.json` の `bundle.resources` で決めた配置先の名前。
    fn file_name(self) -> &'static str {
        match self {
            Self::License => "LICENSE.txt",
            Self::ThirdPartyNotices => "THIRD_PARTY_NOTICES.txt",
        }
    }
}

pub fn app_info(app: &tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: os_version(),
        webview: tauri::webview_version().ok(),
    }
}

/// 同梱したファイルを OS の既定アプリで開く。
///
/// 開発ビルドでも `tauri build` と同じ場所（`resource_dir`）にコピーされる。
pub fn open_bundled(app: &tauri::AppHandle, file: BundledFile) -> CoreResult<()> {
    let dir = app
        .path()
        .resource_dir()
        .map_err(|e| CoreError::Io(e.to_string()))?;
    let path = dir.join(file.file_name());
    if !path.is_file() {
        return Err(CoreError::NotFound(path.display().to_string()));
    }
    tauri_plugin_opener::OpenerExt::opener(app)
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| CoreError::Io(e.to_string()))
}

#[cfg(windows)]
fn os_version() -> String {
    windows_version::read().map_or_else(|| "Windows".to_string(), |v| v.describe())
}

#[cfg(not(windows))]
fn os_version() -> String {
    std::env::consts::OS.to_string()
}

#[cfg(any(windows, test))]
mod windows_version {
    /// レジストリから読んだ Windows の版。
    pub struct Version {
        pub build: u32,
        /// `24H2` の形。古い Windows 10 には無い。
        pub display: Option<String>,
        /// 累積更新の番号。
        pub ubr: Option<u32>,
    }

    /// Windows 11 の最初のビルド。
    ///
    /// NOTE: Windows 11 でもレジストリの `ProductName` は `Windows 10` のまま返るため、ビルド番号で判定する。
    const WINDOWS_11_BUILD: u32 = 22000;

    impl Version {
        /// Issue フォームの例（`Windows 11 24H2`）と同じ並びにし、ビルド番号を括弧で添える。
        pub fn describe(&self) -> String {
            let name = if self.build >= WINDOWS_11_BUILD {
                "Windows 11"
            } else {
                "Windows 10"
            };
            let build = match self.ubr {
                Some(ubr) => format!("{}.{ubr}", self.build),
                None => self.build.to_string(),
            };
            match &self.display {
                Some(display) => format!("{name} {display} ({build})"),
                None => format!("{name} ({build})"),
            }
        }
    }

    #[cfg(windows)]
    pub fn read() -> Option<Version> {
        use windows::core::{w, PCWSTR};
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{
            RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
        };

        const SUBKEY: PCWSTR = w!(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");

        fn read_string(name: PCWSTR) -> Option<String> {
            let mut buffer = [0u16; 64];
            let mut size = std::mem::size_of_val(&buffer) as u32;
            let status = unsafe {
                RegGetValueW(
                    HKEY_LOCAL_MACHINE,
                    SUBKEY,
                    name,
                    RRF_RT_REG_SZ,
                    None,
                    Some(buffer.as_mut_ptr().cast()),
                    Some(&mut size),
                )
            };
            if status != ERROR_SUCCESS {
                return None;
            }
            let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
            String::from_utf16(&buffer[..len]).ok()
        }

        fn read_dword(name: PCWSTR) -> Option<u32> {
            let mut value = 0u32;
            let mut size = std::mem::size_of::<u32>() as u32;
            let status = unsafe {
                RegGetValueW(
                    HKEY_LOCAL_MACHINE,
                    SUBKEY,
                    name,
                    RRF_RT_REG_DWORD,
                    None,
                    Some(std::ptr::addr_of_mut!(value).cast()),
                    Some(&mut size),
                )
            };
            (status == ERROR_SUCCESS).then_some(value)
        }

        let build = read_string(w!("CurrentBuildNumber"))?.parse().ok()?;
        Some(Version {
            build,
            display: read_string(w!("DisplayVersion")).filter(|s| !s.is_empty()),
            ubr: read_dword(w!("UBR")),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::windows_version::Version;

    #[test]
    fn names_windows_11_by_build_number() {
        let version = Version {
            build: 26100,
            display: Some("24H2".to_string()),
            ubr: Some(4061),
        };
        assert_eq!(version.describe(), "Windows 11 24H2 (26100.4061)");
    }

    #[test]
    fn names_windows_10_below_the_first_windows_11_build() {
        let version = Version {
            build: 19045,
            display: Some("22H2".to_string()),
            ubr: None,
        };
        assert_eq!(version.describe(), "Windows 10 22H2 (19045)");
    }

    #[test]
    fn omits_the_display_version_when_missing() {
        let version = Version {
            build: 17763,
            display: None,
            ubr: Some(1),
        };
        assert_eq!(version.describe(), "Windows 10 (17763.1)");
    }
}
