//! WebView2 に直接触る処理。いずれも `with_webview` 経由の COM 呼び出しであり、Windows 以外では何もしない。
//!
//! 扱うのは 2 つである。
//! 既定のコンテキストメニューの抑止（[`disable_default_context_menu`]）と、トレイ格納中のサスペンド（[`suspend`] / [`resume`] / ADR-0007 論点 7）である。
//! 前者の背景は関数側に書いてある。後者は以下のとおり。
//!
//! ウィンドウを破棄してはいけない。
//! WebView2 の再初期化が発生し、常駐している意味がほぼ失われる。
//! トレイ常駐は Cold Start を 1 日 1 回に減らすための仕組みであり、初期化コストをユーザーに見えない形で繰り返し発生させるためのものではない。
//! 一方、`hide()` だけでは WebView2 のメモリがそのまま残る。
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

/// WebView2 既定のコンテキストメニューを無効にする。ウィンドウを生成した直後に呼ぶ。
///
/// 本文の上で右クリックすると「戻る」「最新の情報に更新」「名前を付けて保存」「印刷」といった Chromium 由来の項目が並ぶ。
/// いずれも Reader として意味を持たず、「最新の情報に更新」に至っては本文の再読み込み（`F5`）とは別物である。
/// 独自のコンテキストメニューを用意する計画は無いため、ここでは既定のメニューを出さないことだけを行う。
///
/// DOM の `contextmenu` イベントは通常どおり発火する。
/// この設定が抑止するのはネイティブのメニューだけであり、Monaco が自前の DOM で描くメニューは影響を受けない。
///
/// デバッグビルドでは何もしない。「開発者ツールで調査する」を残すためである（開発者ツールの扱いそのものは未決）。
#[cfg(windows)]
pub fn disable_default_context_menu<R: Runtime>(window: &WebviewWindow<R>) {
    if cfg!(debug_assertions) {
        return;
    }

    // 失敗しても起動は続ける。既定のメニューが出るだけで、本文の表示も編集も成立する。
    let _ = window.with_webview(|webview| {
        let controller = webview.controller();
        unsafe {
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let Ok(settings) = core.Settings() else {
                return;
            };
            let _ = settings.SetAreDefaultContextMenusEnabled(false);
        }
    });
}

/// Windows 以外では何もしない。WebView2 固有の設定であり、同等の窓口が無い。
#[cfg(not(windows))]
pub fn disable_default_context_menu<R: Runtime>(_window: &WebviewWindow<R>) {}

/// トレイへ格納する直前に呼ぶ。`hide()` の後に呼ぶこと。
///
/// Windows 以外では何もしない。
/// macOS / Linux（F-OS-07 / COULD）に同等の仕組みは無いため `hide()` だけになる。
/// プラットフォーム分岐を Platform 層ではなくここに閉じるのは、これが「速いことだけを担当する」Rust 側の仕事だからである（原則 C）。
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
                // WebView2 ランタイムが古い。サスペンドしないだけで、格納自体は成立する。
                return;
            };
            let handler = TrySuspendCompletedHandler::create(Box::new(|result, succeeded| {
                // 失敗しても何もしない。メモリが解放されないだけで、格納自体は成立している。
                // ここで復帰させると、閉じたはずのウィンドウが残ることになる。
                if result.is_err() || !succeeded {
                    eprintln!("[marxdown] WebView2 のサスペンドに失敗（格納は継続）");
                }
                Ok(())
            }));
            let _ = core3.TrySuspend(&handler);
        }
    });
}

/// トレイから復帰する直前に呼ぶ。`show()` の前に呼ぶこと。
///
/// Resume 自体は自動だが、`suspend` で false にした `IsVisible` は戻す必要がある。
/// 戻さないと、ウィンドウは表示されるが内容が描画されない。
#[cfg(windows)]
pub fn resume<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| {
        let controller = webview.controller();
        unsafe {
            let _ = controller.SetIsVisible(true);
        }
    });
}

/// Windows 以外では何もしない。同等の仕組みが無いため、`hide()` だけで済ませる。
#[cfg(not(windows))]
pub fn suspend<R: Runtime>(_window: &WebviewWindow<R>) {}

/// Windows 以外では何もしない。[`suspend`] と対になる。
#[cfg(not(windows))]
pub fn resume<R: Runtime>(_window: &WebviewWindow<R>) {}
