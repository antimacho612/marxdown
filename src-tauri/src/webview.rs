//! トレイ格納中の WebView2 サスペンド（ADR-0007 論点 7）。
//!
//! ウィンドウを破棄してはいけない。
//! WebView2 の再初期化（実測 392.1ms）が発生し、常駐している意味がほぼ失われる。
//! トレイ常駐は Cold Start を 1 日 1 回に減らすための仕組みであり、初期化コストをユーザーに見えない形で繰り返し発生させるためのものではない。
//! 一方、`hide()` だけでは WebView2 のメモリ（起動直後で 161.5MB）がそのまま残る。
//! 数時間で終わるプロセスなら誤差だが、常駐すると解放されないまま残り続ける。
//!
//! そこで [`ICoreWebView2_3::TrySuspend`] を使う。
//! Edge の「スリープ タブ」機能と同じ仕組みで、スクリプトタイマーとアニメーションを止め、OS がレンダラのメモリを再利用できるようにする。
//!
//! 制約は 3 つある。
//! `ICoreWebView2Controller::IsVisible` が false でないと `ERROR_INVALID_STATE` で失敗するため、`hide()` とセットでしか使えない。
//! Tauri の `hide()` はウィンドウを隠すがコントローラの可視性まで変更するとは限らないため、ここで明示的に false にする。
//! 可視にすると自動で Resume される（`Resume` を明示的に呼ぶ必要はない）が、自分で変更した `IsVisible` は自分で戻さなければ本文が表示されない状態になる。
//! best effort であり、実行中のスクリプトがあればその完了後に反映され、失敗する可能性もある。
//! そのため戻り値は破棄し、有効である前提の設計をしない（ADR-0007「計測項目」）。
//!
//! 代替の `MemoryUsageTargetLevel = Low`（`ICoreWebView2_19`）は不可視でなくても使えるが、スクリプトが動き続ける。
//! Microsoft は両者を混在させないことを明記している。
//! Marxdown はトレイ格納中に JS を実行する必要がない（ファイル監視は Rust 側にある）ため、`TrySuspend` を採用する。
//!
//! [`ICoreWebView2_3::TrySuspend`]: https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2_3

use tauri::{Runtime, WebviewWindow};

/// トレイへ格納する直前に呼ぶ。**`hide()` の後に呼ぶこと。**
///
/// Windows 以外では何もしない。macOS / Linux（F-OS-07 / COULD）に同等の仕組みは無く、
/// `hide()` だけになる。**プラットフォーム分岐を Platform 層ではなくここに閉じる**
/// のは、これが「速いことだけを担当する」Rust 側の仕事だから（原則 C）。
#[cfg(windows)]
pub fn suspend<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
        use webview2_com::TrySuspendCompletedHandler;
        use windows::core::Interface;

        let controller = webview.controller();
        unsafe {
            // 制約 1。これを忘れると TrySuspend が ERROR_INVALID_STATE で必ず失敗する。
            if controller.SetIsVisible(false).is_err() {
                return;
            }
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let Ok(core3) = core.cast::<ICoreWebView2_3>() else {
                // WebView2 ランタイムが古い。サスペンドを諦めるだけで、格納自体は成立する。
                return;
            };
            let handler = TrySuspendCompletedHandler::create(Box::new(|result, succeeded| {
                // 失敗しても何もしない。**メモリが減らないだけで、格納は成立している。**
                // ここで復帰させると「閉じたのにウィンドウが残る」ほうの事故になる。
                if result.is_err() || !succeeded {
                    eprintln!("[marxdown] WebView2 のサスペンドに失敗（格納は継続）");
                }
                Ok(())
            }));
            let _ = core3.TrySuspend(&handler);
        }
    });
}

/// トレイから復帰する直前に呼ぶ。**`show()` の前に呼ぶこと。**
///
/// 制約 2 のとおり Resume 自体は自動だが、`suspend` で倒した `IsVisible` は
/// 戻してやる必要がある。ここを忘れると、ウィンドウは出るのに中身が真っ白になる。
#[cfg(windows)]
pub fn resume<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| {
        let controller = webview.controller();
        unsafe {
            let _ = controller.SetIsVisible(true);
        }
    });
}

#[cfg(not(windows))]
pub fn suspend<R: Runtime>(_window: &WebviewWindow<R>) {}

#[cfg(not(windows))]
pub fn resume<R: Runtime>(_window: &WebviewWindow<R>) {}
