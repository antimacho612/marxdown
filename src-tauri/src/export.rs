//! PDF / HTML エクスポート（F-VIEW-18）。
//!
//! 書き出す中身はフロントが組み立てる。
//! ここが担当するのは、保存先を選ばせることと、書き込み・PDF 化・画像の埋め込みだけである。
//! 保存先はダイアログで利用者が選んだパスに限り、フロントからパスを受け取らない。

use std::path::{Path, PathBuf};

use tauri::{State, WebviewWindow};

use crate::error::{CoreError, CoreResult};
use crate::scope;
use crate::state::AppState;

/// 埋め込む画像 1 枚の上限。これを超える画像は元の参照のまま残す。
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

/// 保存先を選ばせる。取り消されたら `None`。
///
/// `suggested` は元の文書のパスで、同じ場所・同じ名前（拡張子だけ差し替える）を初期値にする。
async fn pick(
    window: &WebviewWindow,
    suggested: Option<&str>,
    filter: &str,
    extension: &str,
) -> CoreResult<Option<PathBuf>> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let suggested = suggested.map(Path::new);
    let name = suggested
        .and_then(Path::file_stem)
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled");
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter(filter, &[extension])
        .set_file_name(format!("{name}.{extension}"));
    if let Some(dir) = suggested
        .and_then(Path::parent)
        .filter(|d| !d.as_os_str().is_empty())
    {
        dialog = dialog.set_directory(dir);
    }

    dialog.save_file(move |picked| {
        let _ = tx.try_send(picked);
    });

    let Some(Some(picked)) = rx.recv().await else {
        return Ok(None);
    };
    picked
        .into_path()
        .map(Some)
        .map_err(|e| CoreError::InvalidArgument(e.to_string()))
}

/// HTML を書き出す。保存先のパスを返し、取り消されたら `None`。
#[tauri::command]
pub async fn export_html(
    window: WebviewWindow,
    suggested: Option<String>,
    html: String,
) -> CoreResult<Option<String>> {
    let Some(path) = pick(&window, suggested.as_deref(), "HTML", "html").await? else {
        return Ok(None);
    };
    std::fs::write(&path, html)?;
    Ok(Some(path.display().to_string()))
}

/// 呼び出したウィンドウの表示内容を PDF に書き出す。保存先のパスを返し、取り消されたら `None`。
///
/// 印刷用の CSS（`@media print`）で何を印刷させるかは、呼ぶ前にフロントが整えておく。
/// Windows 以外では `InvalidArgument` を返す。フロントは `window.print()` で代用する。
#[tauri::command]
pub async fn export_pdf(
    window: WebviewWindow,
    suggested: Option<String>,
) -> CoreResult<Option<String>> {
    if !cfg!(windows) {
        return Err(CoreError::InvalidArgument(
            "PDF への直接の書き出しは Windows でのみ使える".into(),
        ));
    }
    let Some(path) = pick(&window, suggested.as_deref(), "PDF", "pdf").await? else {
        return Ok(None);
    };
    print_to_pdf(&window, &path).await?;
    Ok(Some(path.display().to_string()))
}

/// A4（インチ）。WebView2 の既定はレターサイズである。
#[cfg(windows)]
const A4_INCHES: (f64, f64) = (8.27, 11.69);

#[cfg(windows)]
async fn print_to_pdf(window: &WebviewWindow, path: &Path) -> CoreResult<()> {
    let (tx, mut rx) = tauri::async_runtime::channel::<Result<(), String>>(1);
    let target = windows::core::HSTRING::from(path.as_os_str());

    window
        .with_webview(move |webview| {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2Environment6, ICoreWebView2_7,
            };
            use webview2_com::PrintToPdfCompletedHandler;
            use windows::core::Interface;

            let done = tx.clone();
            let started = unsafe {
                (|| -> windows::core::Result<()> {
                    let core = webview.controller().CoreWebView2()?;
                    let core7 = core.cast::<ICoreWebView2_7>()?;
                    let environment = webview.environment().cast::<ICoreWebView2Environment6>()?;
                    let settings = environment.CreatePrintSettings()?;
                    settings.SetPageWidth(A4_INCHES.0)?;
                    settings.SetPageHeight(A4_INCHES.1)?;
                    // 背景を印刷しないと、コードブロックと表の見出しの面が消える。
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    let handler =
                        PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                            let outcome = match result {
                                Ok(()) if ok => Ok(()),
                                Ok(()) => Err("PDF を書き出せなかった".to_owned()),
                                Err(e) => Err(e.to_string()),
                            };
                            let _ = done.try_send(outcome);
                            Ok(())
                        }));
                    core7.PrintToPdf(&target, &settings, &handler)
                })()
            };
            if let Err(e) = started {
                let _ = tx.try_send(Err(e.to_string()));
            }
        })
        .map_err(|e| CoreError::Io(e.to_string()))?;

    match rx.recv().await {
        Some(Ok(())) => Ok(()),
        Some(Err(message)) => Err(CoreError::Io(message)),
        None => Err(CoreError::Io("PDF の書き出しが完了しなかった".into())),
    }
}

#[cfg(not(windows))]
async fn print_to_pdf(_window: &WebviewWindow, _path: &Path) -> CoreResult<()> {
    Ok(())
}

/// 表示中の画像を data URI にする（HTML の書き出しで 1 ファイルに収めるため）。
///
/// 受け付けるのは、プレビューが既に表示を許可している範囲（asset のスコープ）の画像だけである。
/// フロントが `fetch` で asset URL を読むには CSP の `connect-src` を広げる必要があり、それはしない（ADR-0006）。
#[tauri::command]
pub fn inline_image(state: State<'_, AppState>, path: String) -> CoreResult<String> {
    let resolved = scope::resolve_within(&state.asset_roots(), Path::new(&path))?;
    let mime = mime_of(&resolved)
        .ok_or_else(|| CoreError::InvalidArgument(format!("画像ではない: {path}")))?;
    let size = std::fs::metadata(&resolved)?.len();
    if size > MAX_IMAGE_BYTES {
        return Err(CoreError::TooLarge { path, size });
    }
    let bytes = std::fs::read(&resolved)?;
    Ok(format!("data:{mime};base64,{}", base64(&bytes)))
}

/// Base64（RFC 4648 / パディングあり）。
///
/// 使うのはここだけで、クレートを足すほどの量ではない。
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |acc, (i, &b)| acc | u32::from(b) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(char::from(TABLE[(n >> (18 - 6 * i) & 0x3f) as usize]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// 拡張子から画像の MIME 型を決める。画像でなければ `None`。
fn mime_of(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        // `<img>` として読み込まれた SVG はスクリプトを実行しない。
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_rfc4648() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0xff, 0xfe, 0xfd]), "//79");
    }

    #[test]
    fn only_images_have_a_mime_type() {
        assert_eq!(mime_of(Path::new("a.PNG")), Some("image/png"));
        assert_eq!(mime_of(Path::new("a.svg")), Some("image/svg+xml"));
        assert_eq!(mime_of(Path::new("a.md")), None);
        assert_eq!(mime_of(Path::new("id_rsa")), None);
    }
}
