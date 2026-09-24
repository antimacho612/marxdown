//! `✕` を押したときに何が起きるか（[ADR-0007] 論点 1・2・4・7・9・11）。
//!
//! 「閉じる」には見た目が似ていて意味が違う 4 つがある。
//! `close_one` はウィンドウを 1 枚だけ閉じる動作で、他のウィンドウが残っている場合はこれになる（F-OPEN-06）。
//! `stash` はトレイへ格納する動作で、プロセスは生きたままウィンドウ状態を保存する。
//! `quit` はプロセスを終える動作で、こちらもウィンドウ状態を保存する（論点 11）。
//! `restore` は格納から戻す動作である。
//! 別々の場所に書くと必ずずれるため、1 か所に集めてある（`open.ts` が 5 つの「開く」を 1 か所に集めているのと同じ理由）。
//!
//! 最後の 1 枚かどうかが分岐の起点である。
//! 2 枚目以降の `✕` はそのウィンドウを閉じるだけで、トレイ格納にも終了にもならない。
//!
//! ウィンドウ位置の保存（F-CONF-10）を `CloseRequested` だけに置くと、トレイメニューや `Ctrl+Q` からの終了では保存されない（論点 11）。
//! これらの経路ではこのイベントが発火しないためである。
//! 常駐アプリでは、最後に `✕` を押した時点の位置から更新されないままになる。
//!
//! [ADR-0007]: ../../docs/adr/0007-tray-residency.md

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
///
/// 格納するのは最後に残った 1 枚である。
/// 主ウィンドウを先に閉じていれば、それが追加ウィンドウであることもある（F-OPEN-06）。
pub fn stash<R: Runtime>(app: &AppHandle<R>, label: &str) {
    save_window_state(app);

    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let _ = window.hide();
    crate::webview::suspend(&window);
}

/// 格納から戻す（論点 6・10）。
///
/// `unminimize` を挟むのは、最小化した状態でトレイから復帰させたときにタスクバーで最小化されたままになるためである。
///
/// 戻す先は「外から 1 枚開かせる」経路の宛先と同じウィンドウである（`crate::target_window`）。
/// 転送されたファイルが現れるウィンドウと、前面に出るウィンドウが違ってはいけない。
pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let label = crate::target_window(app);

    // 既に表示されているなら復帰ではない。
    // トレイメニューの「開く」はウィンドウが表示されたままでも押せるため、ここで除外しないと Tray Resume に 0ms 近い値が混ざって中央値が意味を失う。
    let was_hidden = bring_forward(app, &label);

    // Tray Resume の計測（ADR-0007「計測項目」/ 目標 120ms）。
    //
    // ウォーム起動と同じ仕組み（`begin_warm` / `end_warm`）に載せる。
    // どちらも「外から起こされてから本文が読めるまで」を測っており、違うのは起点だけである。
    // 記録側で `kind` を分けてあるため、混ざらずに別々の中央値が取れる。
    if was_hidden {
        if let Some(state) = app.try_state::<AppState>() {
            let id = state.begin_warm();
            let _ = app.emit_to(label.as_str(), crate::EVENT_TRAY_RESUME, id);
        }
    }
}

/// 指定したウィンドウを前面へ出す。トレイに格納されていれば復帰させる。
///
/// 格納されていた（非表示だった）かを返す。
/// ウィンドウが無ければ何もせず `false` を返す。
///
/// トレイからの復帰（[`restore`]）と、別のウィンドウからタブが移されてきたとき（`crate::send_tab`）が使う。
/// 後者で前面へ出さないと、元のウィンドウからタブが消えるだけで、移った先が見えない。
pub fn bring_forward<R: Runtime>(app: &AppHandle<R>, label: &str) -> bool {
    let Some(window) = app.get_webview_window(label) else {
        return false;
    };

    let was_hidden = !window.is_visible().unwrap_or(true);

    // `show()` の前に呼ぶ。
    // サスペンド時に false にした `IsVisible` を戻さないと、ウィンドウは表示されるが内容が描画されない（`webview.rs` の制約 2）。
    crate::webview::resume(&window);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    was_hidden
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
/// 確認をフロントに置くと、その経路だけ未保存の内容を通知なく破棄することになる。
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
///
/// 依頼するのは 1 枚ずつである（F-OPEN-06）。
/// 複数のウィンドウがダーティなら、1 枚保存されるたびに `request_quit` へ戻ってきて次の 1 枚を尋ねる。
/// まとめて依頼すると、保存の完了と `app_quit` の呼び出しが交錯し、同じ確認が二重に表示されうる。
fn ask_then_quit<R: Runtime>(app: AppHandle<R>) {
    use tauri_plugin_dialog::{
        DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
    };

    // `YesNoCancelCustom` はラベルをカスタムした時点で、結果は `Yes` / `No` ではなく常に `Custom(ラベル文字列)` で返ってくる（tauri-plugin-dialog の仕様）。
    // ラベルで判定しないと、どちらのボタンを押しても `_` に該当して何も起きない。
    const SAVE_AND_QUIT: &str = "保存して終了";
    const QUIT_WITHOUT_SAVING: &str = "保存せず終了";

    // 保存を依頼する先。ダーティなウィンドウのうちの 1 枚。
    let target = app
        .try_state::<AppState>()
        .and_then(|s| s.dirty_labels().into_iter().next())
        .unwrap_or_else(|| MAIN_LABEL.to_owned());

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
                // ダーティなウィンドウが前面にあるとは限らない。保存の前に見せる。
                if let Some(window) = handle.get_webview_window(&target) {
                    let _ = window.set_focus();
                }
                let _ = handle.emit_to(target.as_str(), crate::EVENT_SAVE_AND_QUIT, ());
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
pub fn on_close_requested<R: Runtime>(app: &AppHandle<R>, label: &str) -> bool {
    let owner = app
        .try_state::<AppState>()
        .map(|s| s.owns_instance())
        .unwrap_or(true);

    // ウィンドウ位置を記録するのは、所有者プロセスの主ウィンドウの分だけである（F-CONF-10 / ADR-0016）。
    // 追加ウィンドウは閉じたら消え、独立プロセスの矩形を書くと所有者側の値を上書きしてしまう。
    if owner && label == MAIN_LABEL {
        save_window_state(app);
    }

    // 他にウィンドウが残っているなら、これは「閉じる」であって格納でも終了でもない（F-OPEN-06）。
    if app.webview_windows().len() > 1 {
        return close_one(app, label);
    }

    // ここから下は「最後の 1 枚」である。閉じた先はトレイ格納か、プロセスの終了しかない。

    // トレイに常駐するのは、所有者プロセスの主ウィンドウだけである（ADR-0016 §3.5）。
    // 独立プロセス（`--new-window`）とサテライトは常駐しない。
    // 常駐させると、閉じたつもりのプロセスが増え続け、トレイから戻したときに出てくる窓も一定しない。
    if owner && label == MAIN_LABEL && stashes_on_close(app) {
        // 初回だけ、`✕` の意味が変わることを説明する（論点 4）。
        //
        // 03.ux-spec/07-status-and-notifications.md §2 は「モーダルはデータ消失の可能性がある場面だけ」としており、これはその例外にあたる。
        // 生涯 1 回であることが許容の条件そのものなので、フラグは `state.json` に永続化する。
        let first_time = app
            .try_state::<AppState>()
            .map(|s| !s.tray_intro_shown())
            .unwrap_or(false);

        if first_time {
            ask_then_stash(app.clone(), label.to_owned());
        } else {
            stash(app, label);
        }
        return true;
    }

    // 閉じたらプロセスが終わる。未保存があるなら必ず確認する（F-EDIT-03 / N-REL-01）。
    //
    // `✕` で閉じる経路にも確認が要る。
    // トレイに常駐しない窓では閉じると本文が失われるため、ここは `Ctrl+Q` と同じ扱いにする（ADR-0016 §3.5）。
    let dirty = app
        .try_state::<AppState>()
        .map(|s| s.is_dirty())
        .unwrap_or(false);

    if dirty {
        ask_then_quit(app.clone());
        return true;
    }
    false
}

/// ウィンドウを 1 枚だけ閉じる（F-OPEN-06）。他のウィンドウが残っているときの `✕`。
///
/// プロセスは終わらないため、ここで見るのはそのウィンドウのダーティだけである。
/// 他のウィンドウの未保存の変更は、そのウィンドウを閉じるときか終了するときに尋ねる。
fn close_one<R: Runtime>(app: &AppHandle<R>, label: &str) -> bool {
    let dirty = app
        .try_state::<AppState>()
        .map(|s| s.is_window_dirty(label))
        .unwrap_or(false);

    if !dirty {
        return false;
    }

    ask_then_close(app.clone(), label.to_owned());
    true
}

/// 「保存して閉じる / 保存せず閉じる / キャンセル」の 3 択。
///
/// 終了の確認（`ask_then_quit`）と同じ構造で、行き先だけが違う。
/// 「保存して閉じる」がここで保存しないのも同じ理由である。
/// 本文は Monaco の `ITextModel` にあり（ADR-0005）、保存できるのはフロントだけであるため、保存を依頼して戻る。
///
/// 「保存せず閉じる」では先にダーティを解除する。
/// 解除せずに `close()` を呼ぶと同じ確認へ戻ってきて、閉じられなくなる。
fn ask_then_close<R: Runtime>(app: AppHandle<R>, label: String) {
    use tauri_plugin_dialog::{
        DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
    };

    const SAVE_AND_CLOSE: &str = "保存して閉じる";
    const CLOSE_WITHOUT_SAVING: &str = "保存せず閉じる";

    let handle = app.clone();
    app.dialog()
        .message(DIRTY_MESSAGE)
        .title("Marxdown")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            SAVE_AND_CLOSE.to_string(),
            CLOSE_WITHOUT_SAVING.to_string(),
            "キャンセル".to_string(),
        ))
        .show_with_result(move |result| match result {
            MessageDialogResult::Custom(text) if text == SAVE_AND_CLOSE => {
                let _ = handle.emit_to(label.as_str(), crate::EVENT_SAVE_AND_CLOSE, ());
            }
            MessageDialogResult::Custom(text) if text == CLOSE_WITHOUT_SAVING => {
                if let Some(state) = handle.try_state::<AppState>() {
                    state.set_dirty(&label, false);
                }
                if let Some(window) = handle.get_webview_window(&label) {
                    let _ = window.close();
                }
            }
            // キャンセル / ダイアログを閉じた場合は何もしない。既定は閉じない側にする（N-REL-01）。
            _ => {}
        });
}

/// 初回の確認ダイアログ（03.ux-spec/07-status-and-notifications.md §4 の文面）。
///
/// 非同期で表示する。
/// `CloseRequested` のハンドラの中で同期的にダイアログを表示すると、イベントループを塞いだまま入力を待つことになる。
fn ask_then_stash<R: Runtime>(app: AppHandle<R>, label: String) {
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
                stash(&handle, &label);
            } else {
                quit(&handle);
            }
        });
}
