//! アプリケーション全体で共有する状態。
//!
//! 02.architecture/01-principles.md 原則 C に従い、ここに置くのは Rust 側の処理に必要なものだけである。
//! タブ・カーソル・設定などの UI 状態は TypeScript 側にある。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use crate::bootstrap::Bootstrap;
use crate::cli::CliArgs;
use crate::error::{CoreError, CoreResult};
use crate::settings::{Settings, SettingsLoad};
use crate::store::{RecentEntry, StoreData};
use crate::trace::Trace;

/// アプリデータ領域（`%APPDATA%\com.antimacho612.marxdown\`）に置くものの場所（02.architecture/04-rust-responsibilities.md §5）。
///
/// `state.json` はアプリが自動的に書き、`settings.json` と `themes/` は人が書く。
///
/// 1 つの構造体にまとめてある。
/// どれも `identifier` から同じ規則で決まり、`AppState::new` に個別の `Option<PathBuf>` を並べると引数が際限なく増える。
/// `None` は「置き場所が決まらなかった」ことを示し、その機能を使わないという意味になる。
#[derive(Debug, Clone, Default)]
pub struct ConfigPaths {
    pub store: Option<PathBuf>,
    pub settings: Option<PathBuf>,
    /// ユーザーが追加した配色の置き場所（`themes/`）。
    pub themes: Option<PathBuf>,
}

/// このプロセスが単一インスタンスの所有者かどうか（F-OPEN-06 / `instance.rs`）。
///
/// 所有者は `tauri-plugin-single-instance` を登録したプロセスで、argv 転送の受け先になる。
/// `--new-window` で起動し、既に所有者が居た場合だけ `Standalone` になる。
///
/// 3 か所で意味を持つ。
/// トレイに常駐するのは所有者だけであり（ADR-0007 / トレイアイコンがプロセスの数だけ並ばないようにする）、
/// `state.json` のウィンドウ矩形とセッションを書くのも所有者だけであり（後勝ちで消えるのを防ぐ）、
/// それ以外の書き込みは読み直してから行う。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstanceRole {
    Owner,
    Standalone,
}

/// `manage` で 1 つだけ持つ共有状態。コマンドとウィンドウイベントの両方から参照する。
pub struct AppState {
    pub args: CliArgs,
    pub trace: Trace,
    /// 永続化ストア（`state.json`）。
    /// 起動時に 1 回読み、変更のたびに書き戻す。
    store: Mutex<StoreData>,
    /// 設定ファイルたちの置き場所。
    paths: ConfigPaths,
    /// ユーザー設定（02.architecture/04-rust-responsibilities.md §5）。
    /// 「壊れている」という事実も一緒に保持し、書き戻しの可否をこれで決める。
    settings: Mutex<SettingsLoad>,
    /// アセット参照を許可するディレクトリ（N-SEC-05）。
    /// 開いたドキュメントの親ディレクトリを追加していく。
    asset_roots: Mutex<Vec<PathBuf>>,
    /// 利用者が 1 件ずつ許可した画像のディレクトリ（02.architecture/09-security.md §3）。
    ///
    /// `asset_roots` と分けてある。こちらは再帰しない（直下だけ）うえ、ファイルツリー（`list_dir` / `list_files`）からは辿れない。
    /// 画像 1 枚のために押したボタンで、フォルダが閲覧できるようになってはいけない。
    ///
    /// 永続化しない。誤って押した許可を次の起動へ持ち越さない。
    image_dirs: Mutex<Vec<PathBuf>>,
    /// ウォーム起動の計測。argv 転送を受けた時刻を要求 ID ごとに保持する。
    warm: Mutex<HashMap<u64, Instant>>,
    warm_counter: AtomicU64,
    /// 最後にフロントへ知らせた「最大化されているか」。ウィンドウごとに持つ。
    ///
    /// `Resized` はドラッグ中に毎フレーム発火する。
    /// 変化したときだけイベントを出すために、直前の値をここに保持する。
    ///
    /// 1 つの値で共有してはいけない（F-OPEN-06）。
    /// 別のウィンドウを最大化した時点で直前の値が書き換わり、こちらのウィンドウは次に変化しても「変化なし」と判定されてボタンの表示が取り残される。
    maximized: Mutex<HashMap<String, bool>>,
    /// 未保存の変更があるか（F-EDIT-03 / 03.ux-spec/07-status-and-notifications.md §1）。ウィンドウごとに持つ。
    ///
    /// 値の所有者はフロントである。
    /// ここに複製があるのは、終了の 3 経路（トレイメニュー / ハンバーガーメニュー / `Ctrl+Q`）が Rust 側で合流しており（`close.rs`）、トレイメニューからの終了がフロントを経由しないためである。
    /// 確認をフロントに置くと、その経路だけ確認せずに終了することになる。
    ///
    /// 更新は `false` と `true` の変わり目だけで、打鍵ごとの IPC にはならない（`features/document/save.ts`）。
    ///
    /// ウィンドウごとに分けるのは、プロセスの終了（どれか 1 つでもダーティなら確認する）と、
    /// ウィンドウ 1 枚を閉じる操作（そのウィンドウだけを見る）で必要な答えが違うためである。
    dirty: Mutex<HashMap<String, bool>>,
    /// 最後にフォーカスされたウィンドウのラベル。
    ///
    /// 「外から 1 枚開かせる」経路（argv 転送 / トレイの最近開いたファイル）の宛先になる。
    /// ウィンドウが 1 枚しかなかった頃は `MAIN_LABEL` 決め打ちでよかったが、複数あるときに主ウィンドウへ送ると、
    /// ユーザーが見ている手前のウィンドウではない場所にタブが増える。
    focused: Mutex<String>,
    /// 追加ウィンドウのラベルに使う連番（`main-2`, `main-3`, ...）。
    ///
    /// 閉じたラベルは再利用しない。
    /// 同じラベルのウィンドウを作り直すと、破棄の途中で届いたイベントが新しいウィンドウのものとして扱われうる。
    window_counter: AtomicU64,
    /// 単一インスタンスの所有者か（[`InstanceRole`]）。起動時に決まり、以後変わらない。
    role: InstanceRole,
    /// サテライトへ移すタブの本文（F-OPEN-06 / 決定 1）。
    ///
    /// 未保存のタブはパスだけでは渡せない。
    /// 移す側が本文をここへ預け、新しいウィンドウが起動直後に 1 回だけ引き取る。
    ///
    /// **中身は解釈しない。** フロントが組み立てた JSON 文字列をそのまま運ぶだけである
    /// （02.architecture/README.md 原則 C「Markdown の意味解釈は TypeScript 側」）。
    ///
    /// 1 件しか持たない。
    /// 同時に 2 枚飛ばす操作が無いため、新しい転送で上書きし、引き取りで空にすれば取りこぼしも漏れも起きない。
    transfer: Mutex<Option<(u64, String)>>,
    transfer_counter: AtomicU64,
}

impl AppState {
    /// 起動時に 1 回だけ作る。
    /// `bootstrap` に初期ドキュメントがあれば、その親ディレクトリをアセットの許可スコープの初期値にする。
    pub fn new(
        args: CliArgs,
        trace: Trace,
        bootstrap: &Bootstrap,
        store: StoreData,
        settings: SettingsLoad,
        paths: ConfigPaths,
        role: InstanceRole,
    ) -> Self {
        let mut roots = Vec::new();
        if let Some(doc) = bootstrap.document.as_ref() {
            if let Some(parent) = PathBuf::from(&doc.meta.path).parent() {
                roots.push(parent.to_path_buf());
            }
        }
        // `marxdown <dir>` で開いたフォルダも許可範囲に入れる（F-OPEN-02）。
        // ファイルツリーがそこを辿る以上、辿れる範囲と読める範囲は一致していなければならない。
        if let Some(root) = bootstrap.workspace_root.as_ref() {
            roots.push(PathBuf::from(root));
        }
        Self {
            args,
            trace,
            store: Mutex::new(store),
            paths,
            settings: Mutex::new(settings),
            asset_roots: Mutex::new(roots),
            image_dirs: Mutex::new(Vec::new()),
            warm: Mutex::new(HashMap::new()),
            warm_counter: AtomicU64::new(1),
            maximized: Mutex::new(HashMap::new()),
            dirty: Mutex::new(HashMap::new()),
            focused: Mutex::new(crate::window::MAIN_LABEL.to_owned()),
            window_counter: AtomicU64::new(1),
            role,
            transfer: Mutex::new(None),
            transfer_counter: AtomicU64::new(1),
        }
    }

    /// 移す本文を預かる。引き取りに使う ID を返す（F-OPEN-06 / 決定 1）。
    ///
    /// 前の預かりものは捨てる。
    /// 引き取られないまま残るのは、ウィンドウの生成に失敗した場合だけである。
    /// その 1 件を次の転送まで抱えることになるが、次の転送で必ず置き換わる。
    pub fn stash_transfer(&self, payload: String) -> u64 {
        let id = self.transfer_counter.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut slot) = self.transfer.lock() {
            *slot = Some((id, payload));
        }
        id
    }

    /// 預かった本文を引き取る。**1 回しか取れない。**
    ///
    /// ID が一致しなければ何も返さず、預かりものも消さない。
    /// 起動が前後した場合に、別のウィンドウ宛ての本文を取ってしまわないようにする。
    pub fn take_transfer(&self, id: u64) -> Option<String> {
        let mut slot = self.transfer.lock().ok()?;
        if slot.as_ref().is_some_and(|(stored, _)| *stored == id) {
            return slot.take().map(|(_, payload)| payload);
        }
        None
    }

    /// 単一インスタンスの所有者か（F-OPEN-06）。
    pub fn owns_instance(&self) -> bool {
        self.role == InstanceRole::Owner
    }

    /// ストアを書き換えて永続化する。
    ///
    /// ロックを保持したままファイル I/O をしないよう、書き出す値を複製してから解放する。
    /// ストアの更新は最近開いたファイルに 1 件追加する程度の頻度であり、複製のコストよりロックの保持時間のほうが問題になる。
    ///
    /// 所有者でないプロセスは、書き換える前にディスクから読み直す（F-OPEN-06 / 決定 6）。
    /// `state.json` は 1 枚しかなく、こちらが起動した後に所有者が書いた分はメモリ上の複製に反映されていない。
    /// 読み直さずに書くと、最近開いたファイルを 1 件足すたびに所有者側の更新をまとめて消すことになる。
    pub fn update_store<T>(&self, f: impl FnOnce(&mut StoreData) -> T) -> T {
        let (result, snapshot) = {
            let Ok(mut store) = self.store.lock() else {
                // ロックが poisoned でも起動は止めない。永続化だけを行わない。
                return f(&mut StoreData::default());
            };
            if self.role == InstanceRole::Standalone {
                *store = crate::store::load(self.paths.store.as_deref());
            }
            let result = f(&mut store);
            (result, store.clone())
        };
        crate::store::save(self.paths.store.as_deref(), &snapshot);
        result
    }

    /// ストアの複製。サテライトの bootstrap を組み立てるために使う（`crate::open_satellite`）。
    pub fn store_snapshot(&self) -> StoreData {
        self.store.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// メモリ上の設定の複製。ディスクは読まない。
    ///
    /// 追加ウィンドウの bootstrap に載せるために使う。
    /// 外部エディターでの編集はファイル監視が既に取り込んでいるため、ここで読み直す理由がない（`close_behavior` と同じ判断）。
    pub fn settings_snapshot(&self) -> SettingsLoad {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// 最近開いたファイルの一覧。ロックを取れない場合は空を返す。
    pub fn recent(&self) -> Vec<RecentEntry> {
        self.store
            .lock()
            .map(|s| s.recent.clone())
            .unwrap_or_default()
    }

    /// 設定を読み直す（02.architecture/04-rust-responsibilities.md §5）。
    ///
    /// 読めない内容に変わったときは既定値に戻さない。
    /// 直前に読めていた値を保持し、壊れている事実だけを添えて返す。
    /// 外部エディターで編集している最中の中間状態でテーマが変わるのを防ぐためである（ファイル監視もこの経路を通す）。
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

    /// 変更したキーだけを反映して書き戻す（02.architecture/04-rust-responsibilities.md §1 `write_settings`）。
    ///
    /// 壊れている間は拒否する（02.architecture/04-rust-responsibilities.md §5 の 3 番目）。
    /// これが無いと、ユーザーが修正している最中に設定 UI がファイルの内容を丸ごと消してしまう。
    pub fn patch_settings(
        &self,
        patch: serde_json::Map<String, serde_json::Value>,
    ) -> CoreResult<Settings> {
        let Some(path) = self.paths.settings.as_deref() else {
            return Err(CoreError::Io("設定の保存先が決まらない".into()));
        };

        // ディスク上の状態を見てから判断する。
        // 起動時に読めていても、その後にユーザーが編集して壊している可能性がある。
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

    /// `✕` の意味（ADR-0007 論点 1）。メモリ上の設定を見る。
    ///
    /// ディスクを読み直さないのは、外部エディターでの編集をファイル監視が既に取り込んでいるためである。
    /// `✕` を押すたびにファイル I/O を行うのは、得られる結果に対してコストが高い。
    pub fn closes_to_tray(&self) -> bool {
        self.settings
            .lock()
            .map(|s| s.values.window_close_to_tray)
            .unwrap_or(true)
    }

    /// エクスプローラーから除外する glob（`explorer.exclude`）。メモリ上の設定を見る。
    ///
    /// `closes_to_tray` と同じ理由でディスクを読み直さない。
    /// 外部エディターでの編集はファイル監視が既に取り込んでおり、一覧を開くたびにファイル I/O を挟む理由がない。
    pub fn exclude_patterns(&self) -> Vec<String> {
        self.settings
            .lock()
            .map(|s| s.values.explorer_exclude.clone())
            .unwrap_or_default()
    }

    /// トレイ常駐の説明を出したことがあるか（ADR-0007 論点 4）。
    pub fn tray_intro_shown(&self) -> bool {
        self.store
            .lock()
            .map(|s| s.tray_intro_shown)
            .unwrap_or(true) // 読めない場合は表示済みとして扱う。二重に表示するより害が小さい
    }

    /// トレイ常駐の説明を表示したことを記録する。`state.json` に永続化する。
    pub fn mark_tray_intro_shown(&self) {
        self.update_store(|s| s.tray_intro_shown = true);
    }

    /// 設定ファイルの場所。壊れたファイルを開いてもらうために UI から使う。
    pub fn settings_path(&self) -> Option<&std::path::Path> {
        self.paths.settings.as_deref()
    }

    /// ユーザーが追加した配色の置き場所。
    ///
    /// パスをフロントには渡さない。
    /// 開くのも読むのも Rust 側の 1 か所に閉じており、`open_settings_file` と同じ理由で、任意のパスを受け取る経路を作らずに済む。
    pub fn themes_dir(&self) -> Option<&std::path::Path> {
        self.paths.themes.as_deref()
    }

    /// argv 転送を受けた瞬間に呼ぶ。返した ID をフロントへ渡す。
    ///
    /// これが 02.architecture/05-startup-sequence.md §3 のウォーム起動の起点（W0）。
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

    /// そのウィンドウの最大化状態が変化していれば true を返し、新しい値を保持する。
    ///
    /// `WindowEvent::Resized` はウィンドウをドラッグしている間ずっと発火する。
    /// そのたびにイベントを出すと、フロントに不要な IPC が毎フレーム届く。
    /// 変化したときだけ通知する判定をここに閉じ込める。
    pub fn note_maximized(&self, label: &str, now: bool) -> bool {
        let Ok(mut map) = self.maximized.lock() else {
            // 判定できないなら通知する側に倒す。余分な IPC 1 回のほうが、ボタンの表示がずれたままになるより害が小さい。
            return true;
        };
        map.insert(label.to_owned(), now) != Some(now)
    }

    /// 未保存の変更があるか（F-EDIT-03）。フロントが変わり目だけ知らせてくる。
    pub fn set_dirty(&self, label: &str, dirty: bool) {
        if let Ok(mut map) = self.dirty.lock() {
            map.insert(label.to_owned(), dirty);
        }
    }

    /// そのウィンドウに未保存の変更があるか。ウィンドウ 1 枚を閉じるときの判断材料になる。
    pub fn is_window_dirty(&self, label: &str) -> bool {
        self.dirty
            .lock()
            .map(|m| m.get(label).copied().unwrap_or(false))
            .unwrap_or(false)
    }

    /// どれか 1 つでも未保存の変更があるか。終了の確認（`close::request_quit`）の判断材料になる。
    pub fn is_dirty(&self) -> bool {
        self.dirty
            .lock()
            .map(|m| m.values().any(|d| *d))
            .unwrap_or(false)
    }

    /// 未保存の変更を抱えているウィンドウのラベル。`close.rs` が保存を依頼する宛先になる。
    pub fn dirty_labels(&self) -> Vec<String> {
        self.dirty
            .lock()
            .map(|m| {
                m.iter()
                    .filter(|(_, dirty)| **dirty)
                    .map(|(label, _)| label.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// ウィンドウが閉じたら、そのウィンドウの分の記録を落とす。
    ///
    /// 残すと、閉じたウィンドウのダーティが `is_dirty()` に効き続けて終了できなくなる。
    pub fn forget_window(&self, label: &str) {
        if let Ok(mut map) = self.dirty.lock() {
            map.remove(label);
        }
        if let Ok(mut map) = self.maximized.lock() {
            map.remove(label);
        }
    }

    /// 最後にフォーカスされたウィンドウを記録する。
    pub fn note_focused(&self, label: &str) {
        if let Ok(mut current) = self.focused.lock() {
            *current = label.to_owned();
        }
    }

    /// 「外から 1 枚開かせる」経路の宛先（argv 転送 / トレイ）。
    ///
    /// ここは記録を返すだけである。
    /// そのウィンドウが既に閉じている可能性があるため、存在の確認は呼び出し側で行う（`crate::target_window`）。
    pub fn focused_label(&self) -> String {
        self.focused
            .lock()
            .map(|l| l.clone())
            .unwrap_or_else(|_| crate::window::MAIN_LABEL.to_owned())
    }

    /// 次の追加ウィンドウのラベル（`main-2`, `main-3`, ...）。
    ///
    /// `main-*` は capabilities が許可している形である（`capabilities/default.json`）。
    /// ここから外れたラベルを付けると、そのウィンドウからは IPC が 1 つも通らない。
    pub fn next_window_label(&self) -> String {
        let n = self.window_counter.fetch_add(1, Ordering::Relaxed) + 1;
        format!("{}-{n}", crate::window::MAIN_LABEL)
    }

    /// アセット参照を許可するディレクトリを 1 件加える（N-SEC-05）。同じパスは重複させない。
    pub fn allow_asset_root(&self, dir: PathBuf) {
        if let Ok(mut roots) = self.asset_roots.lock() {
            if !roots.contains(&dir) {
                roots.push(dir);
            }
        }
    }

    /// 利用者が許可した画像のディレクトリを 1 件加える。同じパスは重複させない。
    ///
    /// 効果はそのディレクトリの直下だけで、配下のディレクトリには及ばない（検証は `scope::resolve_in_dirs`）。
    pub fn allow_image_dir(&self, dir: PathBuf) {
        if let Ok(mut dirs) = self.image_dirs.lock() {
            if !dirs.contains(&dir) {
                dirs.push(dir);
            }
        }
    }

    /// 許可済みの画像ディレクトリ一覧。`scope::resolve_in_dirs` に渡す。
    pub fn image_dirs(&self) -> Vec<PathBuf> {
        self.image_dirs
            .lock()
            .map(|d| d.clone())
            .unwrap_or_default()
    }

    /// 現在の許可ディレクトリ一覧。`scope::resolve_within` に渡す。
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
            None,
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
            InstanceRole::Owner,
        )
    }

    /// 02.architecture/04-rust-responsibilities.md §5 の 3 番目。ユーザーが直している最中に設定 UI がファイルの内容を丸ごと消さない。
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
    /// 編集途中の中間状態でテーマが既定値に戻るのを防ぐ。
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

    /// 設定ファイルを見ない検査のための `AppState`。
    fn bare_state() -> AppState {
        let trace = Trace::start(Instant::now());
        let loaded = SettingsLoad::default();
        let bootstrap = crate::bootstrap::build(
            &CliArgs::default(),
            &trace,
            &StoreData::default(),
            &loaded,
            None,
        );
        AppState::new(
            CliArgs::default(),
            trace,
            &bootstrap,
            StoreData::default(),
            loaded,
            ConfigPaths::default(),
            InstanceRole::Owner,
        )
    }

    /// 終了の確認は全ウィンドウを見て、ウィンドウ 1 枚を閉じる判断はそのウィンドウだけを見る（F-OPEN-06 / `close.rs`）。
    #[test]
    fn dirty_is_tracked_per_window() {
        let state = bare_state();

        state.set_dirty("main", true);

        assert!(
            state.is_dirty(),
            "どれか 1 つでもダーティなら終了時に確認する"
        );
        assert!(state.is_window_dirty("main"));
        assert!(
            !state.is_window_dirty("main-2"),
            "別のウィンドウの未保存は、こちらを閉じる判断に影響しない"
        );
        assert_eq!(state.dirty_labels(), vec!["main".to_string()]);
    }

    /// 閉じたウィンドウのダーティが残ると、二度と終了できなくなる。
    #[test]
    fn a_closed_window_stops_blocking_quit() {
        let state = bare_state();
        state.set_dirty("main-2", true);

        state.forget_window("main-2");

        assert!(!state.is_dirty());
        assert!(state.dirty_labels().is_empty());
    }

    /// 最大化の通知は変化したときだけ出す。判定がウィンドウごとに独立していないと、別のウィンドウの操作で取り残される。
    #[test]
    fn the_maximize_notice_is_decided_per_window() {
        let state = bare_state();

        assert!(state.note_maximized("main", true), "初回は変化として扱う");
        assert!(!state.note_maximized("main", true), "同じ値なら通知しない");
        assert!(
            state.note_maximized("main-2", true),
            "別のウィンドウの初回は、こちらの値に影響されない"
        );
    }

    /// 受け渡し箱は 1 回しか取れない（F-OPEN-06 / 決定 1）。
    /// 二度取れると、同じ未保存の本文が 2 つのウィンドウに現れる。
    #[test]
    fn a_transfer_can_only_be_taken_once() {
        let state = bare_state();
        let id = state.stash_transfer("{\"text\":\"hello\"}".to_owned());

        assert_eq!(
            state.take_transfer(id).as_deref(),
            Some("{\"text\":\"hello\"}")
        );
        assert_eq!(state.take_transfer(id), None, "2 回目は空");
    }

    /// 起動が前後したときに、別のウィンドウ宛ての本文を取ってしまわない。
    #[test]
    fn a_transfer_is_not_handed_to_the_wrong_window() {
        let state = bare_state();
        let first = state.stash_transfer("最初".to_owned());
        let second = state.stash_transfer("次".to_owned());

        assert_eq!(state.take_transfer(first), None, "上書きされた分は取れない");
        assert_eq!(state.take_transfer(second).as_deref(), Some("次"));
    }

    /// ラベルは capabilities が許可している `main-*` の形でなければ、そのウィンドウから IPC が 1 つも通らない。
    #[test]
    fn additional_windows_get_capability_matching_labels() {
        let state = bare_state();

        assert_eq!(state.next_window_label(), "main-2");
        assert_eq!(
            state.next_window_label(),
            "main-3",
            "閉じても番号は戻さない"
        );
    }
}
