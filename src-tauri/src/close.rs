//! `✕` を押したときに何が起きるか（[ADR-0007] 論点 1・2・4・7・9・11）。
//!
//! # 3 つの経路を 1 か所に集める
//!
//! 「閉じる」には見た目が似ていて意味が違う 3 つがある。**別々の場所に書くと必ずずれる**
//! （`open.ts` が 5 つの「開く」を 1 か所に集めているのと同じ理由）。
//!
//! | | 何が起きるか | ウィンドウ状態の保存 |
//! | --- | --- | --- |
//! | `stash` | トレイへ格納。プロセスは生きる | する |
//! | `quit` | プロセスを終える | **する**（論点 11） |
//! | `restore` | 格納から戻す | — |
//!
//! # 論点 11 — 終了経路でも保存する
//!
//! ウィンドウ位置の保存は `CloseRequested` でのみ行っていた（F-CONF-10）。
//! `✕` を横取りしても同じイベントは来るので格納時は問題ないが、
//! **トレイメニューや `Ctrl+Q` からの終了では発火しない。**
//! 常駐アプリになると「最後に `✕` を押した日の位置」で固まり続けることになる。
//!
//! [ADR-0007]: ../../docs.local/adr/0007-tray-residency.md

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::settings::CloseBehavior;
use crate::state::AppState;
use crate::window::MAIN_LABEL;

/// いま `✕` がどちらの意味か（設定 `window.closeBehavior`）。
///
/// **ディスクではなくメモリ上の設定を見る。** 外部エディタで `settings.json` を
/// 書き換えたら Phase 2 の監視が読み直しているので、ここで読みに行く必要はない。
pub fn stashes_on_close<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<AppState>()
        .map(|s| s.close_behavior() == CloseBehavior::Tray)
        .unwrap_or(false)
}

/// 現在のウィンドウ位置・サイズを `state.json` に書く。
///
/// 最小化中など、保存すると次回の復元に失敗する状態では `capture` が `None` を返す。
/// そのときは**前回の値を残す**（上書きしない）。
fn save_window_state<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    let Some(captured) = crate::window::capture(&window) else {
        return;
    };
    if let Some(state) = app.try_state::<AppState>() {
        state.update_store(|s| s.window = Some(captured));
    }
}

/// トレイへ格納する（論点 2・7）。
///
/// **順序が重要。** `hide()` より先にサスペンドしようとすると
/// `ERROR_INVALID_STATE` で必ず失敗する（`webview.rs` の制約 1）。
pub fn stash<R: Runtime>(app: &AppHandle<R>) {
    save_window_state(app);

    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    let _ = window.hide();
    crate::webview::suspend(&window);
}

/// 格納から戻す（論点 6・10）。
///
/// `unminimize` を挟むのは、最小化した状態で `Ctrl+Q` を押さずに
/// トレイから復帰させたときに、タスクバーで畳まれたままになるため。
pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };

    // 既に見えているなら復帰ではない。トレイメニューの「開く」は
    // ウィンドウが出たままでも押せるので、ここを抜かないと
    // Tray Resume に 0ms 近い値が混ざって中央値が壊れる。
    let was_hidden = !window.is_visible().unwrap_or(true);

    // **`show()` の前に呼ぶ。** サスペンド時に倒した `IsVisible` を戻さないと、
    // ウィンドウは出るのに中身が真っ白になる（`webview.rs` の制約 2）。
    crate::webview::resume(&window);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    // Tray Resume の計測（ADR-0007「計測項目」/ 目標 120ms）。
    //
    // **ウォーム起動と同じ器（`begin_warm` / `end_warm`）に載せる。** 測っているのは
    // どちらも「外から起こされてから本文が読めるまで」で、違うのは起点だけ。
    // 記録側で `kind` を分けてあるので、混ざらずに別々の中央値が取れる。
    if was_hidden {
        if let Some(state) = app.try_state::<AppState>() {
            let id = state.begin_warm();
            let _ = app.emit_to(MAIN_LABEL, crate::EVENT_TRAY_RESUME, id);
        }
    }
}

/// プロセスを終える（論点 3 の 3 経路が全部ここへ来る）。
///
/// **保存してから終える**（論点 11）。`exit` はイベントループを畳むので、
/// 後ろに書いた処理は走らない。
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    save_window_state(app);
    app.exit(0);
}

/// `✕` が押されたときの分岐。`CloseRequested` から呼ぶ。
///
/// **`true` を返したら呼び出し側が `prevent_close()` する。**
/// ここで直接止めないのは、`CloseRequested` の `api` を持ち回すと
/// この関数がイベント型に縛られ、テストからも呼べなくなるため。
pub fn on_close_requested<R: Runtime>(app: &AppHandle<R>) -> bool {
    if !stashes_on_close(app) {
        // `"exit"` 設定。**保存だけしてそのまま閉じさせる**（従来の挙動）。
        save_window_state(app);
        return false;
    }

    // 初回だけ、`✕` の意味が変わることを説明する（論点 4）。
    //
    // 03.ux-spec.md §8.2 は「モーダルはデータ消失の可能性がある場面だけ」としており、
    // これはその例外。**生涯 1 回であること**が許容の条件そのものなので、
    // フラグは `state.json` に永続化する。
    let first_time = app
        .try_state::<AppState>()
        .map(|s| !s.tray_intro_shown())
        .unwrap_or(false);

    if first_time {
        ask_then_stash(app.clone());
    } else {
        stash(app);
    }
    true
}

/// 初回の確認ダイアログ（03.ux-spec.md §8.4 の文面）。
///
/// **非同期で出す。** `CloseRequested` のハンドラの中で同期的にダイアログを回すと、
/// イベントループを塞いだまま入力を待つことになる。
fn ask_then_stash<R: Runtime>(app: AppHandle<R>) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    // 答える前にもう一度 `✕` を押されても、ダイアログが積み上がらないようにする。
    // 「押したのに閉じない」と感じた人は必ずもう一度押す。
    if let Some(state) = app.try_state::<AppState>() {
        state.mark_tray_intro_shown();
    }

    let handle = app.clone();
    app.dialog()
        .message(
            "Marxdown はトレイに常駐します。閉じても次に開くときが速くなります。\n\
             この動作は設定で変更できます（window.closeBehavior）。",
        )
        .title("Marxdown")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "トレイに格納".to_string(),
            "終了する".to_string(),
        ))
        .show(move |stash_it| {
            if stash_it {
                stash(&handle);
            } else {
                quit(&handle);
            }
        });
}
