//! ウィンドウ生成。
//!
//! ウィンドウを `tauri.conf.json` の宣言ではなく**コードで生成する**のは、
//! `initialization_script` に CLI 引数から作った bootstrap を載せる必要があるため
//! （02.architecture.md §5.1）。宣言的なウィンドウでは注入するタイミングがない。

use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::bootstrap::Bootstrap;
use crate::cli::BootstrapChannel;

pub const MAIN_LABEL: &str = "main";

/// ウィンドウが見えないままになる上限（04.tech-stack.md §9.1）。
/// これを超えたら本文が未完成でも表示する。「起動失敗に見える」ほうが害が大きい。
pub const SHOW_FALLBACK_MS: u64 = 400;

pub fn create(
    app: &tauri::AppHandle,
    label: &str,
    bootstrap: &Bootstrap,
    channel: BootstrapChannel,
) -> tauri::Result<WebviewWindow> {
    let script = crate::bootstrap::to_init_script(bootstrap, channel);

    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("Marxdown")
        .inner_size(1000.0, 720.0)
        .min_inner_size(480.0, 360.0)
        .visible(false) // 描画準備が整うまで見せない
        .decorations(true)
        .disable_drag_drop_handler() // ドラッグ＆ドロップは JS 側で扱う（F-OPEN-08）
        .initialization_script(&script)
        .build()?;

    spawn_show_fallback(app.clone(), label.to_string());
    Ok(window)
}

/// 一定時間経っても `ready` が来なければ、こちらから表示する。
///
/// `setInterval` によるポーリングではなく 1 回きりのタイマーであることが重要
/// （05.performance-budget.md §4.5「アイドル時のタイマーを増やさない」）。
fn spawn_show_fallback(app: tauri::AppHandle, label: String) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(SHOW_FALLBACK_MS));
        if let Some(w) = app.get_webview_window(&label) {
            if w.is_visible().unwrap_or(false) {
                return;
            }
            let _ = w.show();
            let _ = w.set_focus();
        }
    });
}
