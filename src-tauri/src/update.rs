//! 自動更新（F-OS-06 / ADR-0024）。
//!
//! 確認の契機は起動（主ウィンドウの `ready` の後）・ウィンドウのフォーカス・コマンドパレットの 3 つで、タイマーは使わない（ADR-0024 §3.4）。
//! 自動の確認は前回から 24 時間以上たっているときだけ行い、失敗しても何も知らせない。
//!
//! 確認も適用も Rust 側で完結させる。
//! フロントが持つのは、通知バーの表示と 2 つのコマンドの呼び出しだけである。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::state::AppState;

/// 新しい版が見つかったことをフロントへ知らせるイベント（ペイロードは [`UpdateInfo`]）。
pub const EVENT_UPDATE_AVAILABLE: &str = "marxdown://update-available";

/// 自動で確認する間隔の下限（ADR-0024 §3.4）。
const CHECK_INTERVAL_SECS: u64 = 24 * 60 * 60;

const RELEASES_URL: &str = "https://github.com/antimacho612/marxdown/releases/tag";

/// フロントへ渡す、見つかった版の情報。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    /// 変更内容を読める Release のページ。
    pub notes_url: String,
}

/// `install_update` が更新を始めなかった理由。
///
/// 始めた場合は Windows ではプロセスが終わるため、値は返らない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstallRefusal {
    /// 未保存の変更がある（ADR-0024 §3.6）。
    Dirty,
    /// 確認し直したら新しい版が無かった。
    UpToDate,
}

/// 更新の状態。`manage` して使う。
#[derive(Default)]
pub struct Updates {
    /// 起動時の確認を済ませたか。
    /// これより前のフォーカスでは確認しない。
    /// ウィンドウの生成直後にもフォーカスが来るため、見ないと `ready` より前に通信が始まる。
    started: AtomicBool,
    /// 確認の途中か。フォーカスが続いたときに通信を重ねない。
    checking: AtomicBool,
    /// 見つけた更新。適用するときに確認をやり直さずに使う。
    pending: Mutex<Option<Update>>,
}

impl Updates {
    fn take_pending(&self) -> Option<Update> {
        self.pending.lock().ok().and_then(|mut p| p.take())
    }

    fn set_pending(&self, update: Option<Update>) {
        if let Ok(mut p) = self.pending.lock() {
            *p = update;
        }
    }
}

/// 自動で確認してよい時刻か（ADR-0024 §3.4）。
///
/// 時計が戻っている（前回が未来にある）場合も確認する。
/// 確認しないと、戻った分だけ確認が止まる。
pub fn is_due(last: Option<u64>, now: u64) -> bool {
    match last {
        None => true,
        Some(last) if last > now => true,
        Some(last) => now - last >= CHECK_INTERVAL_SECS,
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 起動時の確認。主ウィンドウの `ready` の後に 1 回だけ呼ぶ。
pub fn on_startup<R: Runtime>(app: &AppHandle<R>) {
    let Some(updates) = app.try_state::<Updates>() else {
        return;
    };
    if updates.started.swap(true, Ordering::SeqCst) {
        return;
    }
    check_if_due(app);
}

/// ウィンドウがフォーカスを得たときの確認。
///
/// 行うのは時刻の比較だけで、通信は 24 時間に 1 回である。
/// トレイからの復帰も argv の転送もフォーカスを伴うため、常駐したまま何日も使われる場合もここで拾える。
pub fn on_focus<R: Runtime>(app: &AppHandle<R>) {
    let started = app
        .try_state::<Updates>()
        .is_some_and(|u| u.started.load(Ordering::SeqCst));
    if started {
        check_if_due(app);
    }
}

fn check_if_due<R: Runtime>(app: &AppHandle<R>) {
    // 開発ビルドは自分より新しい公開版を毎回見つけてしまい、通知が作業の邪魔になる。
    // 手動の確認（`check_update`）は開発ビルドでも使える。
    if cfg!(debug_assertions) {
        return;
    }
    let (Some(state), Some(updates)) = (app.try_state::<AppState>(), app.try_state::<Updates>())
    else {
        return;
    };
    if !state.auto_checks_updates() {
        return;
    }
    let now = now_secs();
    if !is_due(state.last_update_check(), now) {
        return;
    }
    if updates.checking.swap(true, Ordering::SeqCst) {
        return;
    }

    // 通信の前に記録する。
    // 失敗しても記録するのは、オフラインの環境でフォーカスのたびに失敗し続けないためである。
    state.mark_update_checked(now);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 自動の確認では失敗を知らせない（ADR-0024 §3.4）。
        if let Ok(Some(info)) = check(&app).await {
            let _ = app.emit_to(
                crate::target_window(&app).as_str(),
                EVENT_UPDATE_AVAILABLE,
                &info,
            );
        }
        if let Some(updates) = app.try_state::<Updates>() {
            updates.checking.store(false, Ordering::SeqCst);
        }
    });
}

/// 公開されている最新の版を問い合わせる。新しい版があれば覚えておき、その情報を返す。
pub async fn check<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<UpdateInfo>, tauri_plugin_updater::Error> {
    // 更新後は引数なしで起動し直す（ADR-0024 §3.6）。
    // updater の既定は、更新前のプロセスが起動したときの引数を `/ARGS` で引き継ぐ。
    // `marxdown foo.md` で起動して常駐していた場合に `foo.md` だけが開き、前回のタブが復元されない。
    // 引き継ぎを止め、NSIS に「完了後に起動する」（`/R`）だけを渡す。
    let update = app
        .updater_builder()
        .restart_after_install(false)
        .installer_arg("/R")
        .build()?
        .check()
        .await?;

    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes_url: format!("{RELEASES_URL}/v{}", u.version),
    });
    if let Some(updates) = app.try_state::<Updates>() {
        updates.set_pending(update);
    }
    Ok(info)
}

/// 見つけた更新をダウンロードして適用する。
///
/// Windows ではインストーラを起動した時点でプロセスが終わり、この関数は戻らない。
/// 戻るのは更新を始めなかったとき（[`InstallRefusal`]）か、失敗したときだけである。
pub async fn install<R: Runtime>(app: &AppHandle<R>) -> Result<InstallRefusal, String> {
    let is_dirty = || app.try_state::<AppState>().is_some_and(|s| s.is_dirty());
    if is_dirty() {
        return Ok(InstallRefusal::Dirty);
    }

    let Some(updates) = app.try_state::<Updates>() else {
        return Err("更新の状態が初期化されていない".to_owned());
    };
    let update = match updates.take_pending() {
        Some(update) => update,
        None => {
            // 通知を出した後に別の経路で確認し直していれば、覚えている更新が無いこともある。
            if check(app).await.map_err(|e| e.to_string())?.is_none() {
                return Ok(InstallRefusal::UpToDate);
            }
            updates.take_pending().ok_or("更新が見つからない")?
        }
    };

    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    // ダウンロードしている間に編集が始まっていることがある。
    if is_dirty() {
        updates.set_pending(Some(update));
        return Ok(InstallRefusal::Dirty);
    }

    // updater は `std::process::exit(0)` で終わり、`close::quit` を通らない（ADR-0007 論点 11）。
    crate::close::save_window_state(app);
    update.install(bytes).map_err(|e| e.to_string())?;

    // ここに来るのは Windows 以外だけである。
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_first_launch_checks() {
        assert!(is_due(None, 1_000));
    }

    #[test]
    fn checks_at_most_once_a_day() {
        let day = CHECK_INTERVAL_SECS;
        assert!(!is_due(Some(1_000), 1_000 + day - 1));
        assert!(is_due(Some(1_000), 1_000 + day));
    }

    #[test]
    fn a_clock_set_back_does_not_stop_checking() {
        assert!(is_due(Some(10_000), 5_000));
    }

    #[test]
    fn refusals_are_named_for_the_frontend() {
        assert_eq!(
            serde_json::to_string(&InstallRefusal::UpToDate).unwrap(),
            r#""up-to-date""#
        );
    }
}
