//! トレイ格納中の WebView2 サスペンド（ADR-0007 論点 7）。
//!
//! # なぜ破棄でも最小化でもなく「隠す + サスペンド」なのか
//!
//! ウィンドウを**破棄してはいけない**。WebView2 の再初期化（実測 392.1ms）が
//! 発生し、常駐している意味がほぼ消える。トレイ常駐は Cold Start を
//! 1 日 1 回に減らすための仕組みであって、隠れて払い直すためのものではない。
//!
//! 一方 `hide()` だけでは、**WebView2 のメモリ（起動直後で 161.5MB）がそのまま残る。**
//! 数時間で終わるプロセスなら誤差だが、常駐すると居座り続ける。
//!
//! そこで [`ICoreWebView2_3::TrySuspend`] を使う。Edge の「スリープ タブ」と同じ仕組みで、
//! スクリプトタイマーとアニメーションを止め、**OS がレンダラのメモリを再利用できる**
//! ようにする。
//!
//! # 3 つの制約
//!
//! 1. **`ICoreWebView2Controller::IsVisible` が false でないと `ERROR_INVALID_STATE` で失敗する。**
//!    `hide()` とセットでしか使えない。Tauri の `hide()` はウィンドウを隠すが、
//!    コントローラの可視性まで倒すとは限らないので、**ここで明示的に false にする**
//! 2. **可視にすると自動で Resume される。** `Resume` を明示的に呼ぶ必要はない。
//!    ただし 1 で自分で倒した `IsVisible` は、**自分で戻さなければ真っ白なウィンドウになる**
//! 3. **best effort。** 実行中のスクリプトがあればその完了後に効き、失敗もしうる。
//!    だから戻り値を握り潰し、**効いている前提の設計をしない**（ADR-0007「計測項目」）
//!
//! 代替の `MemoryUsageTargetLevel = Low`（`ICoreWebView2_19`）は不可視でなくても使えるが、
//! スクリプトが動き続ける。Microsoft は**両者を混ぜないこと**を明記している。
//! Marxdown はトレイ格納中に JS を走らせる必要がない（ファイル監視は Rust 側にある）ため、
//! `TrySuspend` を採る。
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
