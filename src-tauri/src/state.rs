//! アプリケーション全体で共有する状態。
//!
//! 02.architecture/README.md 原則 C に従い、ここに置くのは
//! 「Rust 側が速くやる仕事のために必要なもの」だけ。
//! タブ・カーソル・設定などの UI 状態は TypeScript 側にある。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use crate::bootstrap::Bootstrap;
use crate::cli::CliArgs;
use crate::error::{CoreError, CoreResult};
use crate::settings::{Settings, SettingsLoad};
use crate::store::{RecentEntry, StoreData};
use crate::trace::Trace;

/// アプリデータ領域に置く 3 ファイルの場所（02.architecture/04-rust-responsibilities.md §5 / 02.architecture/10-theming.md §3）。
///
/// ```text
/// %APPDATA%\com.antimacho612.marxdown\
///   ├─ state.json    ← アプリが自動的に書く
///   ├─ settings.json ← 人が書く
///   └─ custom.css    ← 人が書く（F-CONF-07）
/// ```
///
/// **1 つの構造体にまとめてある。** どれも `identifier` から同じ規則で決まり、
/// `AppState::new` に個別の `Option<PathBuf>` を並べると引数が際限なく増える。
/// `None` は「置き場所が決まらなかった」で、その機能を諦める合図。
#[derive(Debug, Clone, Default)]
pub struct ConfigPaths {
    pub store: Option<PathBuf>,
    pub settings: Option<PathBuf>,
    pub custom_css: Option<PathBuf>,
}

pub struct AppState {
    pub args: CliArgs,
    pub trace: Trace,
    /// 永続化ストア（最近開いたファイル / 表示倍率 / ウィンドウ状態）。
    /// 起動時に 1 回読み、変更のたびに書き戻す。
    store: Mutex<StoreData>,
    /// 設定ファイルたちの置き場所。
    paths: ConfigPaths,
    /// ユーザー設定（02.architecture/04-rust-responsibilities.md §5）。
    /// **「壊れている」という事実も一緒に保持する。** 書き戻しの可否がこれで決まる。
    settings: Mutex<SettingsLoad>,
    /// アセット参照を許可するディレクトリ（N-SEC-05）。
    /// 開いたドキュメントの親ディレクトリを追加していく。
    asset_roots: Mutex<Vec<PathBuf>>,
    /// ウォーム起動（S6）の計測。argv 転送を受けた時刻を要求 ID ごとに保持する。
    warm: Mutex<HashMap<u64, Instant>>,
    warm_counter: AtomicU64,
    /// 最後にフロントへ知らせた「最大化されているか」。
    ///
    /// `Resized` はドラッグ中に毎フレーム飛んでくる。**変化したときだけ**
    /// イベントを出すために、直前の値をここに置く。
    maximized: AtomicBool,
    /// 未保存の変更があるか（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。
    ///
    /// **本当の持ち主はフロントである。** ここに複製があるのは、終了の 3 経路
    /// （トレイメニュー / ハンバーガーメニュー / `Ctrl+Q`）が Rust 側で合流していて
    /// （`close.rs`）、**トレイメニューからの終了はフロントを経由しない**ため。
    /// 確認をフロントに置くと、その経路だけ確認せずに終わる。
    ///
    /// 更新は `false ⇄ true` の変わり目だけで、打鍵ごとの IPC にはならない
    /// （`features/document/save.ts`）。
    dirty: AtomicBool,
}

impl AppState {
    pub fn new(
        args: CliArgs,
        trace: Trace,
        bootstrap: &Bootstrap,
        store: StoreData,
        settings: SettingsLoad,
        paths: ConfigPaths,
    ) -> Self {
        let mut roots = Vec::new();
        if let Some(doc) = bootstrap.document.as_ref() {
            if let Some(parent) = PathBuf::from(&doc.meta.path).parent() {
                roots.push(parent.to_path_buf());
            }
        }
        Self {
            args,
            trace,
            store: Mutex::new(store),
            paths,
            settings: Mutex::new(settings),
            asset_roots: Mutex::new(roots),
            warm: Mutex::new(HashMap::new()),
            warm_counter: AtomicU64::new(1),
            maximized: AtomicBool::new(false),
            dirty: AtomicBool::new(false),
        }
    }

    /// ストアを書き換えて永続化する。
    ///
    /// ロックを握ったままファイル I/O をしないよう、書き出す値を複製してから解放する。
    /// ストアの更新は「最近開いたファイルに 1 件積む」程度の頻度なので、
    /// 複製のコストより保持時間のほうが問題になる。
    pub fn update_store<T>(&self, f: impl FnOnce(&mut StoreData) -> T) -> T {
        let (result, snapshot) = {
            let Ok(mut store) = self.store.lock() else {
                // 毒されたロックで起動を止めない。永続化を諦めるだけにする。
                return f(&mut StoreData::default());
            };
            let result = f(&mut store);
            (result, store.clone())
        };
        crate::store::save(self.paths.store.as_deref(), &snapshot);
        result
    }

    pub fn recent(&self) -> Vec<RecentEntry> {
        self.store
            .lock()
            .map(|s| s.recent.clone())
            .unwrap_or_default()
    }

    /// 設定を読み直す（02.architecture/04-rust-responsibilities.md §5）。
    ///
    /// **読めない内容に変わったときは既定値に戻さない。** 直前に読めていた値を保持し、
    /// 壊れている事実だけを添えて返す。外部エディタで編集している最中の中間状態で
    /// テーマが飛ぶのを防ぐため（ファイル監視も、この経路を通す）。
    pub fn reload_settings(&self) -> SettingsLoad {
        let fresh = crate::settings::load(self.paths.settings.as_deref());

        let Ok(mut current) = self.settings.lock() else {
            return fresh;
        };
        if fresh.broken.is_some() {
            current.broken = fresh.broken;
        } else {
            *current = fresh;
        }
        current.clone()
    }

    /// 変更したキーだけを当てて書き戻す（02.architecture/04-rust-responsibilities.md §1 `write_settings`）。
    ///
    /// **壊れている間は拒否する**（02.architecture/04-rust-responsibilities.md §5 の 3 番目）。これが無いと、
    /// ユーザーが直そうとしている最中に設定 UI がファイルごと吹き飛ばす。
    pub fn patch_settings(
        &self,
        patch: serde_json::Map<String, serde_json::Value>,
    ) -> CoreResult<Settings> {
        let Some(path) = self.paths.settings.as_deref() else {
            return Err(CoreError::Io("設定の保存先が決まらない".into()));
        };

        // ディスク上の状態を見てから判断する。起動時に読めていても、
        // その後にユーザーが手で壊している可能性がある。
        let latest = self.reload_settings();
        if let Some(problem) = latest.broken {
            return Err(CoreError::SettingsBroken(problem.message));
        }

        let next = latest.values.patched(patch);
        crate::settings::save(path, &next)?;

        if let Ok(mut current) = self.settings.lock() {
            current.values = next.clone();
            current.broken = None;
        }
        Ok(next)
    }

    /// `✕` の意味（ADR-0007 論点 1）。**メモリ上の設定を見る。**
    ///
    /// ディスクを読み直さないのは、外部エディタでの編集をファイル監視が
    /// 既に取り込んでいるため。`✕` を押すたびにファイル I/O をするのは、
    /// 得られるものに対して高い。
    pub fn close_behavior(&self) -> crate::settings::CloseBehavior {
        self.settings
            .lock()
            .map(|s| s.values.window_close_behavior)
            .unwrap_or_default()
    }

    /// トレイ常駐の説明を出したことがあるか（ADR-0007 論点 4）。
    pub fn tray_intro_shown(&self) -> bool {
        self.store
            .lock()
            .map(|s| s.tray_intro_shown)
            .unwrap_or(true) // 読めないなら「出した」側に倒す。二重に出すより害が小さい
    }

    pub fn mark_tray_intro_shown(&self) {
        self.update_store(|s| s.tray_intro_shown = true);
    }

    /// 設定ファイルの場所。壊れたファイルを開いてもらうために UI から使う。
    pub fn settings_path(&self) -> Option<&std::path::Path> {
        self.paths.settings.as_deref()
    }

    /// カスタム CSS の場所（02.architecture/10-theming.md §3）。
    ///
    /// **パスをフロントに渡さない。** 開くのも読むのも Rust 側の 1 か所に閉じており、
    /// `open_settings_file` と同じ理由で、任意のパスを受け取る口を作らずに済む。
    pub fn custom_css_path(&self) -> Option<&std::path::Path> {
        self.paths.custom_css.as_deref()
    }

    /// argv 転送を受けた瞬間に呼ぶ。返した ID をフロントへ渡す。
    ///
    /// これが 02.architecture/05-startup-sequence.md §2 のウォーム起動の起点（W0）。
    pub fn begin_warm(&self) -> u64 {
        let id = self.warm_counter.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut w) = self.warm.lock() {
            w.insert(id, Instant::now());
        }
        id
    }

    /// フロントが「本文が読める」状態に到達したら呼ぶ。経過ミリ秒を返す。
    pub fn end_warm(&self, id: u64) -> Option<f64> {
        let started = self.warm.lock().ok()?.remove(&id)?;
        Some(started.elapsed().as_secs_f64() * 1000.0)
    }

    /// 最大化状態が**変化していれば** true を返し、新しい値を覚える。
    ///
    /// `WindowEvent::Resized` はウィンドウをドラッグしている間ずっと飛んでくる。
    /// そのたびにイベントを出すと、フロントに意味のない IPC が毎フレーム届く。
    /// 「変わったときだけ知らせる」の判定をここに閉じ込める。
    pub fn note_maximized(&self, now: bool) -> bool {
        self.maximized.swap(now, Ordering::Relaxed) != now
    }

    /// 未保存の変更があるか（F-EDIT-03）。フロントが変わり目だけ知らせてくる。
    pub fn set_dirty(&self, dirty: bool) {
        self.dirty.store(dirty, Ordering::Relaxed);
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty.load(Ordering::Relaxed)
    }

    pub fn allow_asset_root(&self, dir: PathBuf) {
        if let Ok(mut roots) = self.asset_roots.lock() {
            if !roots.contains(&dir) {
                roots.push(dir);
            }
        }
    }

    pub fn asset_roots(&self) -> Vec<PathBuf> {
        self.asset_roots
            .lock()
            .map(|r| r.clone())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-state-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 設定ファイルの場所だけを差し替えた `AppState`。
    /// ここで見たいのは設定の読み書きだけなので、他は既定値でよい。
    fn state_with_settings(path: &std::path::Path) -> AppState {
        let trace = Trace::start(Instant::now());
        let loaded = crate::settings::load(Some(path));
        let bootstrap = crate::bootstrap::build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &loaded,
            crate::custom_css::CustomCss::default(),
        );
        AppState::new(
            CliArgs::default(),
            trace,
            &bootstrap,
            StoreData::default(),
            loaded,
            ConfigPaths {
                settings: Some(path.to_path_buf()),
                ..ConfigPaths::default()
            },
        )
    }

    /// 02.architecture/04-rust-responsibilities.md §5 の 3 番目。ユーザーが直している最中に設定 UI がファイルごと吹き飛ばさない。
    #[test]
    fn writing_is_refused_while_the_settings_file_is_broken() {
        let d = temp_dir("refuse");
        let p = d.join("settings.json");
        let body = "{ \"theme\": \"dark\" 直している途中";
        std::fs::write(&p, body).unwrap();

        let state = state_with_settings(&p);
        let patch =
            serde_json::Map::from_iter([("theme".to_string(), serde_json::Value::from("light"))]);

        let err = state.patch_settings(patch).expect_err("拒否されるべき");

        assert_eq!(err.kind(), "settings-broken");
        assert_eq!(
            std::fs::read_to_string(&p).unwrap(),
            body,
            "拒否したのだからファイルは 1 バイトも変わらない"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn writing_succeeds_once_the_file_is_readable() {
        let d = temp_dir("write");
        let p = d.join("settings.json");
        std::fs::write(&p, r#"{"my.experiment":1}"#).unwrap();

        let state = state_with_settings(&p);
        let patch =
            serde_json::Map::from_iter([("theme".to_string(), serde_json::Value::from("dark"))]);

        let next = state.patch_settings(patch).unwrap();

        assert_eq!(next.theme, crate::settings::Theme::Dark);
        assert_eq!(
            state.reload_settings().values.extra.len(),
            1,
            "未知のキーが残る"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    /// 02.architecture/04-rust-responsibilities.md §5「読めない内容に変わったときは既定値に戻さない」。
    /// 編集途中の中間状態でテーマが飛ぶのを防ぐ。
    #[test]
    fn a_reload_of_a_broken_file_keeps_the_last_readable_values() {
        let d = temp_dir("reload");
        let p = d.join("settings.json");
        std::fs::write(&p, r#"{"theme":"dark"}"#).unwrap();

        let state = state_with_settings(&p);
        std::fs::write(&p, r#"{"theme": "#).unwrap();

        let reloaded = state.reload_settings();

        assert_eq!(reloaded.values.theme, crate::settings::Theme::Dark);
        assert!(reloaded.broken.is_some());
        std::fs::remove_dir_all(&d).ok();
    }
}
