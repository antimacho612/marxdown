//! `✕` を押したときに何が起きるか（[ADR-0007] 論点 1・2・4・7・9・11）。
//!
//! 「閉じる」には見た目が似ていて意味が違う 3 つがある。
//! `stash` はトレイへ格納する動作で、プロセスは生きたままウィンドウ状態を保存する。
//! `quit` はプロセスを終える動作で、こちらもウィンドウ状態を保存する（論点 11）。
//! `restore` は格納から戻す動作である。
//! 別々の場所に書くと必ずずれるため、1 か所に集めてある（`open.ts` が 5 つの「開く」を 1 か所に集めているのと同じ理由）。
//!
//! 論点 11: ウィンドウ位置の保存は `CloseRequested` でのみ行っていた（F-CONF-10）。
//! `✕` を横取りしても同じイベントは来るため、格納時は問題ない。
//! しかし、トレイメニューや `Ctrl+Q` からの終了ではこのイベントが発火しない。
//! 常駐アプリになると、最後に `✕` を押した時点の位置から更新されないままになる。
//!
//! [ADR-0007]: ../../docs.local/adr/0007-tray-residency.md

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::state::AppState;
use crate::window::MAIN_LABEL;

/// 未保存の変更があることを伝える文面。
///
/// 終了の確認（`ask_then_quit`）と、別の文書へ移るときの確認（`commands::confirm_discard`）で共有する。
/// 同じ状態を指す言葉が経路ごとに違うと、同じ危険が別のことのように見える。
pub const DIRTY_MESSAGE: &str = "保存していない変更があります。";

/// いま `✕` がどちらの意味か（設定 `window.closeToTray`）。
///
/// ディスクではなくメモリ上の設定を見る。
/// 外部エディターで `settings.json` を書き換えた場合はファイル監視が読み直しているため、ここで読みに行く必要はない。
pub fn stashes_on_close<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<AppState>()
        .map(|s| s.closes_to_tray())
        .unwrap_or(false)
}

/// 現在のウィンドウ位置・サイズを `state.json` に書く。
///
/// 最小化中など、保存すると次回の復元に失敗する状態では `capture` が `None` を返す。
/// そのときは前回の値を残し、上書きしない。
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
/// 順序が重要である。
/// `hide()` より先にサスペンドしようとすると `ERROR_INVALID_STATE` で必ず失敗する（`webview.rs` の制約 1）。
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
/// `unminimize` を挟むのは、最小化した状態でトレイから復帰させたときにタスクバーで最小化されたままになるためである。
pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };

    // 既に表示されているなら復帰ではない。
    // トレイメニューの「開く」はウィンドウが表示されたままでも押せるため、
    // ここで除外しないと Tray Resume に 0ms 近い値が混ざって中央値が壊れる。
    let was_hidden = !window.is_visible().unwrap_or(true);

    // `show()` の前に呼ぶ。
    // サスペンド時に false にした `IsVisible` を戻さないと、ウィンドウは表示されるが内容が描画されない（`webview.rs` の制約 2）。
    crate::webview::resume(&window);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    // Tray Resume の計測（ADR-0007「計測項目」/ 目標 120ms）。
    //
    // ウォーム起動と同じ仕組み（`begin_warm` / `end_warm`）に載せる。
    // どちらも「外から起こされてから本文が読めるまで」を測っており、違うのは起点だけである。
    // 記録側で `kind` を分けてあるため、混ざらずに別々の中央値が取れる。
    if was_hidden {
        if let Some(state) = app.try_state::<AppState>() {
            let id = state.begin_warm();
            let _ = app.emit_to(MAIN_LABEL, crate::EVENT_TRAY_RESUME, id);
        }
    }
}

/// プロセスを終える（論点 3 の 3 経路が全部ここへ来る）。
///
/// 保存してから終える（論点 11）。
/// `exit` はイベントループを終了させるため、後ろに書いた処理は実行されない。
///
/// ここでは確認しない。
/// 未保存の変更があるかを見るのは `request_quit` の担当であり、この関数は終了してよいと決まったあとにだけ呼ばれる。
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    save_window_state(app);
    app.exit(0);
}

/// 終了してよいか確かめてから終える（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。
///
/// Rust 側で確認するのは、終了の導線が 3 つあり（論点 3）、トレイメニューからの終了はフロントを経由しないためである。
/// 確認をフロントに置くと、その経路だけ未保存の内容を黙って捨てることになる。
/// 3 経路が合流しているのはここであるため、確認もここに置く。
/// ダーティかどうかはフロントが `set_dirty` で知らせてくる（`state.rs`）。
///
/// 03.ux-spec/07-status-and-notifications.md §2 は、モーダルはデータ消失の可能性がある場面だけに使うと定めている。
/// ここはその筆頭であり、通知バーでは足りない（押さずに終了できてしまうため）。
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let dirty = app
        .try_state::<AppState>()
        .map(|s| s.is_dirty())
        .unwrap_or(false);

    if !dirty {
        quit(app);
        return;
    }

    ask_then_quit(app.clone());
}

/// 「保存して終了 / 保存せず終了 / キャンセル」の 3 択（§1）。
///
/// 「保存して終了」はここでは保存しない。
/// 本文は Monaco の `ITextModel` にあり（ADR-0005）、保存できるのはフロントだけであるため、保存を依頼して戻る。
/// フロントは保存に成功したら `set_dirty(false)` してからもう一度終了を要求し、そのときは上の `!dirty` を通って終了する。
///
/// 保存に失敗したらダーティのままなので終了しない。
/// これは N-REL-01（ユーザーが書いた内容を失わない）そのものであり、失敗を無視して終了する経路は用意しない。
fn ask_then_quit<R: Runtime>(app: AppHandle<R>) {
    use tauri_plugin_dialog::{
        DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
    };

    // `YesNoCancelCustom` はラベルをカスタムした時点で、結果は `Yes` / `No` ではなく
    // 常に `Custom(ラベル文字列)` で返ってくる（tauri-plugin-dialog の仕様）。
    // ラベルで判定しないと、どちらのボタンを押しても `_` に落ちて無反応になる。
    const SAVE_AND_QUIT: &str = "保存して終了";
    const QUIT_WITHOUT_SAVING: &str = "保存せず終了";

    let handle = app.clone();
    app.dialog()
        .message(DIRTY_MESSAGE)
        .title("Marxdown")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            SAVE_AND_QUIT.to_string(),
            QUIT_WITHOUT_SAVING.to_string(),
            "キャンセル".to_string(),
        ))
        .show_with_result(move |result| match result {
            MessageDialogResult::Custom(label) if label == SAVE_AND_QUIT => {
                let _ = handle.emit_to(MAIN_LABEL, crate::EVENT_SAVE_AND_QUIT, ());
            }
            MessageDialogResult::Custom(label) if label == QUIT_WITHOUT_SAVING => quit(&handle),
            // キャンセル / ダイアログを閉じた場合は何もしない。既定は終了しない側にする（N-REL-01）。
            _ => {}
        });
}

/// `✕` が押されたときの分岐。`CloseRequested` から呼ぶ。
///
/// `true` を返したら呼び出し側が `prevent_close()` する。
/// ここで直接止めないのは、`CloseRequested` の `api` を持ち回すとこの関数がイベント型に依存し、テストから呼べなくなるためである。
pub fn on_close_requested<R: Runtime>(app: &AppHandle<R>) -> bool {
    if !stashes_on_close(app) {
        // `"exit"` 設定。保存だけしてそのまま閉じさせる（従来の挙動）。
        save_window_state(app);
        return false;
    }

    // 初回だけ、`✕` の意味が変わることを説明する（論点 4）。
    //
    // 03.ux-spec/07-status-and-notifications.md §2 は「モーダルはデータ消失の可能性がある場面だけ」としており、これはその例外にあたる。
    // 生涯 1 回であることが許容の条件そのものなので、フラグは `state.json` に永続化する。
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

/// 初回の確認ダイアログ（03.ux-spec/07-status-and-notifications.md §4 の文面）。
///
/// 非同期で表示する。
/// `CloseRequested` のハンドラの中で同期的にダイアログを表示すると、イベントループを塞いだまま入力を待つことになる。
fn ask_then_stash<R: Runtime>(app: AppHandle<R>) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    // 答える前にもう一度 `✕` を押されても、ダイアログが重複して表示されないようにする。
    if let Some(state) = app.try_state::<AppState>() {
        state.mark_tray_intro_shown();
    }

    let handle = app.clone();
    app.dialog()
        .message(
            "Marxdown はトレイに常駐します。閉じても次に開くときが速くなります。\n\
             この動作は設定で変更できます（window.closeToTray）。",
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
