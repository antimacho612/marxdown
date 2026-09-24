//! 永続化ストア（`state.json`: 最近開いたファイル / 表示倍率 / ウィンドウ / ペイン / 分割比 / セッション）。
//!
//! `tauri-plugin-window-state` は使わない（04.tech-stack/06-rust.md §5。`tauri-plugin-fs` を使わないのと同じ構図）。
//! ウィンドウをコードで生成しているため（`window.rs`）、位置とサイズを `WebviewWindowBuilder` に直接渡せる。
//! これにより、生成後に復元するプラグイン方式と違って「既定位置に表示されてから移動する」ちらつきが原理的に発生せず、`visible: false` から本文ごと表示する設計（04.tech-stack/09-tauri-config.md §1）と整合する。
//! また、最近開いたファイルと表示倍率でどのみち JSON ストアが必要になる。
//! Welcome 画面（F-OPEN-09 / 03.ux-spec/08-empty-states.md §1）は起動直後に最近使ったファイルを表示するため、bootstrap に同梱できないと IPC 往復が 1 回増える。
//! 同じ用途のストアが 2 つある状態のほうが、依存が 1 つ増えるコストより大きい。
//!
//! このファイルはユーザーの成果物ではなく、いつでも破棄してよいキャッシュである。
//! 読めない / 壊れている / 版が違うときは既定値に戻し、起動を失敗させない。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::document::atomic;

/// ストアの構造版。互換性のない変更をしたら上げる。
/// 版が違うストアは内容を使わずに既定値に戻す。
pub const STORE_VERSION: u32 = 1;

/// 最近開いたファイルの保持数。
/// 03.ux-spec/08-empty-states.md §1 が表示するのは数件だが、存在しなくなったファイルを除外した後でも埋まるよう多めに保持する。
pub const RECENT_LIMIT: usize = 20;

/// セッションとして覚えるタブの上限。
///
/// 引数なしで起動したときに開き直す枚数である。
/// 起動直後に読み込むファイル数がそのまま増えるため、際限なく覚えない。
pub const SESSION_LIMIT: usize = 20;

/// 表示倍率の範囲（F-VIEW-11）。ここを外れる値は読み込み時に丸める。
pub const ZOOM_MIN: f64 = 0.5;
pub const ZOOM_MAX: f64 = 3.0;
pub const ZOOM_DEFAULT: f64 = 1.0;

/// ペインの幅（03.ux-spec/06-panes.md §3）。既定 240px、最小 180px。
pub const PANE_WIDTH_DEFAULT: f64 = 240.0;
pub const PANE_WIDTH_MIN: f64 = 180.0;
/// 上限は 03.ux-spec/06-panes.md §3 には無い。
/// 本文の領域を優先するため（Principle 2）の制限であり、手で書いた `state.json` や解像度の異なる環境から極端な幅が渡っても本文の領域が失われないようにする。
pub const PANE_WIDTH_MAX: f64 = 640.0;

/// Split の分割比（エディター側の取り分 / 03.ux-spec/03-split-mode.md §1）。
///
/// 比率で保持する。
/// ピクセルで記録すると、解像度やペインの開閉によって左右の配分が変わってしまう。
/// 既定は 50:50。
pub const SPLIT_DEFAULT: f64 = 0.5;
/// 端まで動かして片方の領域を失わないようにする。
/// 片方が失われると Split である意味が無くなり、元に戻すための操作対象も同時に消える。
pub const SPLIT_MIN: f64 = 0.2;
pub const SPLIT_MAX: f64 = 0.8;

const FILE_NAME: &str = "state.json";

/// `#[serde(default)]` は `f64` に 0.0 を設定する。
/// 0 は片側の領域が失われた状態を意味するため、既定値を明示する。
fn default_split() -> f64 {
    SPLIT_DEFAULT
}

/// 最近開いたファイルの 1 件（F-OPEN-09）。新しいものほど先頭に並ぶ。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    /// 正規化済み絶対パス。表示用の分割はフロント側（`splitPath`）で行う。
    pub path: String,
    pub opened_at_ms: i64,
}

/// ウィンドウの位置とサイズ。論理ピクセルで保持する。
///
/// 物理ピクセルで保存すると、DPI の異なるディスプレイ間で移動したときに復元後のサイズが変わる。
/// `to_logical` を通してから保存する。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

/// ペイン 1 枚の状態（03.ux-spec/06-panes.md §3 / 02.architecture/04-rust-responsibilities.md §5）。
///
/// 記録が無いときは閉じた状態にする。
/// F-NAV-04 の「既定は非表示」は初回起動についての規定であり、一度開いた状態を維持できることと両立する（03.ux-spec/06-panes.md §3 の引用ブロック）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaneState {
    pub open: bool,
    pub width: f64,
}

impl Default for PaneState {
    fn default() -> Self {
        Self {
            open: false,
            width: PANE_WIDTH_DEFAULT,
        }
    }
}

impl PaneState {
    fn sanitized(mut self) -> Self {
        if !self.width.is_finite() {
            self.width = PANE_WIDTH_DEFAULT;
        }
        self.width = self.width.clamp(PANE_WIDTH_MIN, PANE_WIDTH_MAX);
        self
    }
}

/// 左右のペイン（03.ux-spec/06-panes.md §3）。
///
/// 幅は左右で別々に記録する。
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panes {
    /// 左ペイン（Explorer）。
    #[serde(default)]
    pub left: PaneState,
    /// 右ペイン（Outline）。
    #[serde(default)]
    pub right: PaneState,
}

impl Panes {
    /// 左右それぞれの幅を許容範囲へ丸める。
    pub fn sanitized(self) -> Self {
        Self {
            left: self.left.sanitized(),
            right: self.right.sanitized(),
        }
    }
}

/// 前回開いていたタブ（F-NAV-01）。
///
/// 引数なしで起動したときだけ復元する（02.architecture/04-rust-responsibilities.md §5）。
/// `marxdown foo.md` には「foo.md を見たい」という意図があり、そこへ前回の 8 枚を混ぜない。
///
/// 未保存の本文は持たない。パスだけである。
/// 本文をここに置くと `state.json` がドキュメントの複製を抱えることになり、触っていないバイト列を保持しないという方針（N-CMP-03）とも整合しない。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// 開いていたファイル。タブの並び順である。
    pub paths: Vec<String>,
    /// 表示していたタブの位置（`paths` の添字）。
    pub active: usize,
}

impl Session {
    /// 覚えている枚数を上限で切り、消えたファイルを除く。
    ///
    /// 存在確認をここで行うのは、起動時に「開けなかった」通知が枚数ぶん出るのを避けるためである。
    /// 前回開いていたファイルが消えていることは、利用者にとって想定内の出来事でしかない。
    pub fn sanitized(mut self) -> Self {
        self.paths.retain(|path| Path::new(path).is_file());
        self.paths.truncate(SESSION_LIMIT);
        if self.active >= self.paths.len() {
            self.active = 0;
        }
        self
    }
}

/// `state.json` の全体。
/// ユーザーの成果物ではなくキャッシュであり、読めなければ既定値へ戻す（[`load`]）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    pub version: u32,
    pub recent: Vec<RecentEntry>,
    pub zoom: f64,
    pub window: Option<WindowState>,
    /// ペインの開閉と幅（02.architecture/04-rust-responsibilities.md §5 の表）。
    ///
    /// `#[serde(default)]` にしてあるため、`panes` を持たない古い `state.json` もそのまま読める。
    /// 版を上げると最近開いたファイルと倍率まで一緒に破棄することになり、キー 1 つの追加に対して代償が大きい。
    #[serde(default)]
    pub panes: Panes,
    /// Split の分割比（03.ux-spec/03-split-mode.md §1）。`panes` と同じく `#[serde(default)]` で、この値を持たない古い `state.json` も読める。
    #[serde(default = "default_split")]
    pub split: f64,
    /// トレイ常駐の説明を一度でも出したか（ADR-0007 論点 4）。
    ///
    /// `✕` の意味が OS の慣習と変わる時点でだけモーダルを表示する。
    /// 03.ux-spec/07-status-and-notifications.md §2 の「モーダルはデータ消失の可能性がある場面だけ」に対する意図的な例外である。
    /// 生涯 1 回であることが許容条件そのものであるため、フラグを永続化する。
    /// `state.json` に置くのは、アプリが自動的に書く値だからである（02.architecture/04-rust-responsibilities.md §5）。
    #[serde(default)]
    pub tray_intro_shown: bool,
    /// 前回開いていたタブ。
    /// `panes` と同じく `#[serde(default)]` で、この値を持たない古い `state.json` も読める。
    #[serde(default)]
    pub session: Session,
}

impl Default for StoreData {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            recent: Vec::new(),
            zoom: ZOOM_DEFAULT,
            window: None,
            panes: Panes::default(),
            split: SPLIT_DEFAULT,
            tray_intro_shown: false,
            session: Session::default(),
        }
    }
}

impl StoreData {
    /// 読み込んだ値を信用しない。
    /// ストアはユーザーが手で編集できるファイルであり、別バージョンの Marxdown が書いた可能性もある。
    fn sanitized(mut self) -> Self {
        if self.version != STORE_VERSION {
            return Self::default();
        }
        if !self.zoom.is_finite() {
            self.zoom = ZOOM_DEFAULT;
        }
        self.zoom = self.zoom.clamp(ZOOM_MIN, ZOOM_MAX);
        self.panes = self.panes.sanitized();
        if !self.split.is_finite() {
            self.split = SPLIT_DEFAULT;
        }
        self.split = self.split.clamp(SPLIT_MIN, SPLIT_MAX);
        self.recent.truncate(RECENT_LIMIT);
        self.session = std::mem::take(&mut self.session).sanitized();
        if let Some(w) = self.window {
            let finite =
                w.x.is_finite() && w.y.is_finite() && w.width.is_finite() && w.height.is_finite();
            if !finite || w.width < 1.0 || w.height < 1.0 {
                self.window = None;
            }
        }
        self
    }

    /// 最近開いたファイルの先頭に加える。同じパスは重複させず、先頭へ引き上げる。
    pub fn push_recent(&mut self, path: String, now_ms: i64) {
        self.recent.retain(|e| !same_path(&e.path, &path));
        self.recent.insert(
            0,
            RecentEntry {
                path,
                opened_at_ms: now_ms,
            },
        );
        self.recent.truncate(RECENT_LIMIT);
    }

    /// 最近開いたファイルから 1 件外す。一致の判定は [`same_path`] に従う。
    pub fn remove_recent(&mut self, path: &str) {
        self.recent.retain(|e| !same_path(&e.path, path));
    }
}

/// Windows のパスは大文字小文字を区別しない（`scope.rs` の `component_eq` と同じ方針）。
fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

/// ストアファイルの置き場所。
///
/// `tauri::Manager::path()` は `AppHandle` 構築後にしか使えないが、ウィンドウ状態はウィンドウ生成の前に必要になる。
/// そのため Tauri の app_config_dir と同じ規則を自前で辿る。
/// `identifier` は `tauri::generate_context!()` の config から渡すため、`tauri.conf.json` との二重管理にはならない。
pub fn store_path(identifier: &str) -> Option<PathBuf> {
    Some(config_dir(identifier)?.join(FILE_NAME))
}

/// アプリのデータ置き場。`settings/mod.rs` も同じディレクトリを使う（02.architecture/04-rust-responsibilities.md §5）。
/// 2 か所で辿ると、片方だけ規則が変わったときに設定と状態の保存先が分かれてしまう。
pub fn config_dir(identifier: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);

    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|h| h.join("Library").join("Application Support"));

    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .map(|h| h.join(".config"))
        });

    Some(base?.join(identifier))
}

/// 古いバージョンの identifier。アプリのデータ置き場のフォルダー名がこれだった。
const LEGACY_IDENTIFIER: &str = "com.antimacho612.marxdown";

/// 古い identifier の名前のデータ置き場を、現在の identifier の名前へ移す。
///
/// 起動時に 1 回だけ、ストア・設定・配色のどれを読むよりも前に呼ぶ。
/// 移し先が既にあれば何もしない。
/// どちらの内容を残すべきかを判断する材料が無く、既に使われている側を上書きしないためである。
/// 失敗しても起動は止めない。古いフォルダーが残って既定の設定で起動するだけで、書いた内容は失われない。
///
/// NOTE: `%LOCALAPPDATA%` 側は移さない。
/// 置かれているのは WebView2 のキャッシュだけで、次の起動で作り直される。
/// また、新しい名前のフォルダーは NSIS の既定のインストール先（`%LOCALAPPDATA%\Marxdown`）と大文字小文字だけが違う同じフォルダーであり、常に存在している。
pub fn migrate_legacy_dir(identifier: &str) {
    if let (Some(from), Some(to)) = (config_dir(LEGACY_IDENTIFIER), config_dir(identifier)) {
        move_dir(&from, &to);
    }
}

/// [`migrate_legacy_dir`] の本体。移したときだけ `true` を返す。
fn move_dir(from: &Path, to: &Path) -> bool {
    if !from.is_dir() || to.exists() {
        return false;
    }
    std::fs::rename(from, to).is_ok()
}

/// ストアを読む。失敗しても既定値を返す。
pub fn load(path: Option<&Path>) -> StoreData {
    let Some(path) = path else {
        return StoreData::default();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return StoreData::default();
    };
    serde_json::from_str::<StoreData>(&text)
        .map(StoreData::sanitized)
        .unwrap_or_default()
}

/// ストアを書く。失敗は警告の出力に留める。
///
/// 本文の保存と同じ原子的書き込みを通すのは、書き込み中の電源断で壊れた JSON ではなく前回の JSON が残るようにするためである。
pub fn save(path: Option<&Path>, data: &StoreData) {
    let Some(path) = path else { return };
    if let Some(dir) = path.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    let Ok(json) = serde_json::to_string_pretty(data) else {
        return;
    };
    if let Err(e) = atomic::write(path, json.as_bytes()) {
        eprintln!("[marxdown] 設定の保存に失敗: {e}");
    }
}

/// UNIX epoch ミリ秒。`DocumentMeta::mtime_ms` と同じ軸に揃える。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("marxdown-store-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn the_legacy_dir_is_moved_with_its_contents() {
        let d = temp_dir("legacy-move");
        let from = d.join(LEGACY_IDENTIFIER);
        let to = d.join("marxdown");
        std::fs::create_dir_all(from.join("themes")).unwrap();
        std::fs::write(from.join("settings.json"), "{}").unwrap();
        std::fs::write(from.join("themes").join("mine.css"), "").unwrap();

        assert!(move_dir(&from, &to));
        assert!(!from.exists());
        assert!(to.join("settings.json").is_file());
        assert!(to.join("themes").join("mine.css").is_file());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn the_legacy_dir_does_not_overwrite_the_current_one() {
        let d = temp_dir("legacy-keep");
        let from = d.join(LEGACY_IDENTIFIER);
        let to = d.join("marxdown");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(from.join("settings.json"), "old").unwrap();
        std::fs::write(to.join("settings.json"), "new").unwrap();

        assert!(!move_dir(&from, &to));
        assert_eq!(
            std::fs::read_to_string(to.join("settings.json")).unwrap(),
            "new"
        );
        assert!(from.join("settings.json").is_file(), "古い側も消さない");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_missing_legacy_dir_is_not_an_error() {
        let d = temp_dir("legacy-none");
        let to = d.join("marxdown");
        assert!(!move_dir(&d.join(LEGACY_IDENTIFIER), &to));
        assert!(!to.exists());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_missing_store_is_not_an_error() {
        let d = temp_dir("missing");
        let data = load(Some(&d.join("nope.json")));
        assert!(data.recent.is_empty());
        assert_eq!(data.zoom, ZOOM_DEFAULT);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_corrupt_store_falls_back_to_defaults() {
        let d = temp_dir("corrupt");
        let p = d.join(FILE_NAME);
        std::fs::write(&p, "{ not json at all").unwrap();
        let data = load(Some(&p));
        assert_eq!(data.version, STORE_VERSION);
        assert!(data.recent.is_empty());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_store_from_another_version_is_discarded() {
        let d = temp_dir("version");
        let p = d.join(FILE_NAME);
        let json =
            r#"{"version":999,"recent":[{"path":"a","openedAtMs":1}],"zoom":2.0,"window":null}"#;
        std::fs::write(&p, json).unwrap();
        let data = load(Some(&p));
        assert!(data.recent.is_empty(), "版が違うストアは読み捨てる");
        assert_eq!(data.zoom, ZOOM_DEFAULT);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn out_of_range_zoom_is_clamped() {
        let d = temp_dir("zoom");
        let p = d.join(FILE_NAME);
        std::fs::write(&p, r#"{"version":1,"recent":[],"zoom":99.0,"window":null}"#).unwrap();
        assert_eq!(load(Some(&p)).zoom, ZOOM_MAX);
        std::fs::remove_dir_all(&d).ok();
    }

    /// 03.ux-spec/06-panes.md §3 の引用ブロック。
    /// 記録が無いときは左右とも閉じた状態で出る（F-NAV-04 は初回起動の話）。
    #[test]
    fn panes_start_closed_when_nothing_was_recorded() {
        let data = StoreData::default();
        assert!(!data.panes.right.open);
        assert!(!data.panes.left.open);
        assert_eq!(data.panes.right.width, PANE_WIDTH_DEFAULT);
    }

    /// 古い `state.json` には `panes` が無い。
    /// 版を上げずに読めることが、最近開いたファイルと倍率を守る条件になっている。
    #[test]
    fn a_store_written_before_panes_existed_is_still_readable() {
        let d = temp_dir("panes-missing");
        let p = d.join(FILE_NAME);
        let json =
            r#"{"version":1,"recent":[{"path":"a.md","openedAtMs":1}],"zoom":1.25,"window":null}"#;
        std::fs::write(&p, json).unwrap();

        let data = load(Some(&p));

        assert_eq!(data.recent.len(), 1, "履歴を捨てない");
        assert_eq!(data.zoom, 1.25);
        assert!(!data.panes.right.open);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn out_of_range_pane_widths_are_clamped() {
        let d = temp_dir("panes-width");
        let p = d.join(FILE_NAME);
        let json = r#"{"version":1,"recent":[],"zoom":1.0,"window":null,
            "panes":{"left":{"open":false,"width":10.0},"right":{"open":true,"width":99999.0}}}"#;
        std::fs::write(&p, json).unwrap();

        let panes = load(Some(&p)).panes;

        assert_eq!(panes.left.width, PANE_WIDTH_MIN);
        assert_eq!(panes.right.width, PANE_WIDTH_MAX);
        assert!(panes.right.open, "開閉は幅と独立に保つ");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 03.ux-spec/06-panes.md §3「幅は左右で別々に記憶する」。
    #[test]
    fn pane_widths_are_remembered_per_side() {
        let d = temp_dir("panes-roundtrip");
        let p = d.join(FILE_NAME);
        let mut data = StoreData::default();
        data.panes.left = PaneState {
            open: false,
            width: 300.0,
        };
        data.panes.right = PaneState {
            open: true,
            width: 200.0,
        };
        save(Some(&p), &data);

        let back = load(Some(&p)).panes;

        assert_eq!(back.left.width, 300.0);
        assert_eq!(back.right.width, 200.0);
        assert!(back.right.open);
        std::fs::remove_dir_all(&d).ok();
    }

    /// ADR-0007 論点 4。生涯 1 回であることがモーダルを許容する条件そのものなので、フラグが往復で保たれることを機械的に検証する。
    #[test]
    fn the_tray_intro_is_only_shown_once() {
        let d = temp_dir("tray-intro");
        let p = d.join(FILE_NAME);

        assert!(
            !StoreData::default().tray_intro_shown,
            "初回起動では、まだ説明していない"
        );

        let data = StoreData {
            tray_intro_shown: true,
            ..StoreData::default()
        };
        save(Some(&p), &data);

        assert!(load(Some(&p)).tray_intro_shown);
        std::fs::remove_dir_all(&d).ok();
    }

    /// `trayIntroShown` を持たない古い `state.json` を読んでも、最近開いたファイルと倍率を失わないこと。
    ///
    /// 版を上げるとここが壊れる。
    /// キー 1 つの追加に対して代償が大き過ぎるので、`#[serde(default)]` で受ける判断が正しいままであることを固定する。
    #[test]
    fn a_store_written_before_the_tray_existed_still_loads() {
        let d = temp_dir("tray-compat");
        let p = d.join(FILE_NAME);
        std::fs::write(
            &p,
            r#"{"version":1,"recent":[{"path":"a.md","openedAtMs":1}],"zoom":1.5,"window":null}"#,
        )
        .unwrap();

        let back = load(Some(&p));

        assert_eq!(back.recent.len(), 1, "最近開いたファイルを捨てない");
        assert_eq!(back.zoom, 1.5, "倍率を捨てない");
        assert!(!back.tray_intro_shown, "無いキーは既定値になる");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_degenerate_window_state_is_dropped() {
        let d = temp_dir("window");
        let p = d.join(FILE_NAME);
        let json = r#"{"version":1,"recent":[],"zoom":1.0,"window":{"x":0,"y":0,"width":0,"height":720,"maximized":false}}"#;
        std::fs::write(&p, json).unwrap();
        assert!(load(Some(&p)).window.is_none());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn recent_entries_move_to_the_front_without_duplicating() {
        let mut data = StoreData::default();
        data.push_recent("a.md".into(), 1);
        data.push_recent("b.md".into(), 2);
        data.push_recent("a.md".into(), 3);
        assert_eq!(data.recent.len(), 2);
        assert_eq!(data.recent[0].path, "a.md");
        assert_eq!(data.recent[0].opened_at_ms, 3);
    }

    #[test]
    fn recent_entries_are_capped() {
        let mut data = StoreData::default();
        for i in 0..(RECENT_LIMIT + 10) {
            data.push_recent(format!("{i}.md"), i as i64);
        }
        assert_eq!(data.recent.len(), RECENT_LIMIT);
    }

    #[test]
    fn a_round_trip_through_the_file_preserves_values() {
        let d = temp_dir("roundtrip");
        let p = d.join(FILE_NAME);
        let mut data = StoreData::default();
        data.push_recent("C:/work/a.md".into(), 42);
        data.zoom = 1.25;
        data.window = Some(WindowState {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 600.0,
            maximized: false,
        });
        save(Some(&p), &data);

        let back = load(Some(&p));
        assert_eq!(back.recent[0].path, "C:/work/a.md");
        assert_eq!(back.zoom, 1.25);
        assert_eq!(back.window.map(|w| w.width), Some(800.0));
        std::fs::remove_dir_all(&d).ok();
    }

    /// セッション。
    mod session {
        use super::*;

        #[test]
        fn missing_files_are_dropped_on_load() {
            let d = temp_dir("session-missing");
            let alive = d.join("alive.md");
            std::fs::write(&alive, "# a").unwrap();

            let session = Session {
                paths: vec![
                    d.join("gone.md").display().to_string(),
                    alive.display().to_string(),
                ],
                active: 1,
            }
            .sanitized();

            assert_eq!(session.paths, vec![alive.display().to_string()]);
            // 表示していたタブが繰り上がる。添字が範囲の外に残ると復元そのものが失敗する。
            assert_eq!(session.active, 0);
            std::fs::remove_dir_all(&d).ok();
        }

        #[test]
        fn the_active_index_falls_back_when_out_of_range() {
            let session = Session {
                paths: Vec::new(),
                active: 7,
            }
            .sanitized();
            assert_eq!(session.active, 0);
        }

        #[test]
        fn the_number_of_tabs_is_capped() {
            let d = temp_dir("session-cap");
            let mut paths = Vec::new();
            for i in 0..(SESSION_LIMIT + 5) {
                let path = d.join(format!("{i}.md"));
                std::fs::write(&path, "# x").unwrap();
                paths.push(path.display().to_string());
            }

            let session = Session { paths, active: 0 }.sanitized();
            assert_eq!(session.paths.len(), SESSION_LIMIT);
            std::fs::remove_dir_all(&d).ok();
        }

        /// `session` を持たない `state.json` も読める（`#[serde(default)]`）。
        #[test]
        fn an_older_store_without_a_session_still_loads() {
            let d = temp_dir("session-old");
            let path = d.join("state.json");
            std::fs::write(
                &path,
                r#"{"version":1,"recent":[],"zoom":1.0,"window":null}"#,
            )
            .unwrap();

            let data = load(Some(&path));
            assert!(data.session.paths.is_empty());
            assert_eq!(data.zoom, 1.0);
            std::fs::remove_dir_all(&d).ok();
        }
    }
}
