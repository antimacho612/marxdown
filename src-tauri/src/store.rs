//! 永続化ストア（最近開いたファイル / 表示倍率 / ウィンドウ状態）。
//!
//! # なぜ `tauri-plugin-window-state` を使わないか
//!
//! 04.tech-stack.md §6.5。`tauri-plugin-fs` を自作コマンドに倒したのと同じ構図である。
//!
//! 1. **ウィンドウをコードで生成している**（`window.rs`）。位置とサイズを
//!    `WebviewWindowBuilder` に直接渡せるため、生成後に復元するプラグイン方式と違って
//!    「既定位置に出てから動く」ちらつきが原理的に起きない。
//!    `visible: false` から本文ごと見せる設計（04.tech-stack.md §9.1）と噛み合う。
//! 2. **最近開いたファイルと表示倍率で、どのみち JSON ストアが要る。**
//!    Welcome 画面（F-OPEN-09 / 03.ux-spec.md §9.1）は起動直後に最近使ったファイルを
//!    出すため、bootstrap に同梱できないと IPC 往復が 1 回増える。
//!    同じ用途のストアが 2 つある状態のほうが、依存 1 つより高くつく。
//!
//! # 壊れたストアで起動を止めない
//!
//! このファイルはユーザーの成果物ではなく、いつでも捨ててよいキャッシュである。
//! 読めない / 壊れている / 版が違うときは既定値に戻す。**起動を失敗させない。**

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::document::atomic;

/// ストアの構造版。互換性のない変更をしたら上げる。
/// 版が違うストアは読み捨てて既定値に戻す。
pub const STORE_VERSION: u32 = 1;

/// 最近開いたファイルの保持数。03.ux-spec.md §9.1 が並べるのは数件だが、
/// 存在しなくなったファイルを間引いた後でも埋まるように多めに持つ。
pub const RECENT_LIMIT: usize = 20;

/// 表示倍率の範囲（F-VIEW-11）。ここを外れる値は読み込み時に丸める。
pub const ZOOM_MIN: f64 = 0.5;
pub const ZOOM_MAX: f64 = 3.0;
pub const ZOOM_DEFAULT: f64 = 1.0;

/// ペインの幅（03.ux-spec.md §7.3）。既定 240px、最小 180px。
pub const PANE_WIDTH_DEFAULT: f64 = 240.0;
pub const PANE_WIDTH_MIN: f64 = 180.0;
/// 上限は §7.3 に無い。**本文が主役である**（Principle 2）ことを守るための歯止めで、
/// 手で書いた `state.json` や解像度の違う環境から巨大な幅が来ても本文が潰れないようにする。
pub const PANE_WIDTH_MAX: f64 = 640.0;

const FILE_NAME: &str = "state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    /// 正規化済み絶対パス。表示用の分割はフロント側（`splitPath`）で行う。
    pub path: String,
    pub opened_at_ms: i64,
}

/// ウィンドウの位置とサイズ。**論理ピクセルで保持する。**
///
/// 物理ピクセルで保存すると、DPI の違うディスプレイ間で移動したときに
/// 復元後の大きさが変わる。`to_logical` を通してから保存する。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

/// ペイン 1 枚の状態（03.ux-spec.md §7.3 / 02.architecture.md §4.5）。
///
/// **記録が無いときは閉じている。** F-NAV-04 の「既定は非表示」は初回起動の話であり、
/// 一度開いた人がそれを維持できることと両立する（§7.3 の引用ブロック）。
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

/// 左右のペイン（03.ux-spec.md §7.3）。
///
/// **幅は左右で別々に記憶する。** 左（Explorer）は M3 だが、後から足すと
/// 「どちらの幅か」が曖昧な 1 つの値が先に永続化されてしまうので、器は今作る。
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panes {
    /// Explorer（M3）。M1.5 では誰も書き換えない。
    #[serde(default)]
    pub left: PaneState,
    /// Outline（M1.5）。
    #[serde(default)]
    pub right: PaneState,
}

impl Panes {
    pub fn sanitized(self) -> Self {
        Self {
            left: self.left.sanitized(),
            right: self.right.sanitized(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    pub version: u32,
    pub recent: Vec<RecentEntry>,
    pub zoom: f64,
    pub window: Option<WindowState>,
    /// ペインの開閉と幅（§4.5 の表）。
    ///
    /// `#[serde(default)]` にしてあるので、**Phase 5 までに書かれた `state.json`
    /// （`panes` が無い）もそのまま読める**。版を上げると最近開いたファイルと倍率まで
    /// 一緒に捨てることになり、キー 1 つの追加に対して代償が大き過ぎる。
    #[serde(default)]
    pub panes: Panes,
    /// トレイ常駐の説明を一度でも出したか（ADR-0007 論点 4）。
    ///
    /// **`✕` の意味が OS の慣習と変わる瞬間**にだけモーダルを出す。
    /// 03.ux-spec.md §8.2 の「モーダルはデータ消失の可能性がある場面だけ」に対する
    /// 意図的な例外であり、**生涯 1 回**であることがその許容条件そのものなので、
    /// フラグを永続化する。`state.json` に置くのは、アプリが自動的に書く値だから（§4.5）。
    #[serde(default)]
    pub tray_intro_shown: bool,
}

impl Default for StoreData {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            recent: Vec::new(),
            zoom: ZOOM_DEFAULT,
            window: None,
            panes: Panes::default(),
            tray_intro_shown: false,
        }
    }
}

impl StoreData {
    /// 読み込んだ値を信用しない。ストアはユーザーが手で編集できるファイルであり、
    /// 別バージョンの Marxdown が書いた可能性もある。
    fn sanitized(mut self) -> Self {
        if self.version != STORE_VERSION {
            return Self::default();
        }
        if !self.zoom.is_finite() {
            self.zoom = ZOOM_DEFAULT;
        }
        self.zoom = self.zoom.clamp(ZOOM_MIN, ZOOM_MAX);
        self.panes = self.panes.sanitized();
        self.recent.truncate(RECENT_LIMIT);
        if let Some(w) = self.window {
            let finite =
                w.x.is_finite() && w.y.is_finite() && w.width.is_finite() && w.height.is_finite();
            if !finite || w.width < 1.0 || w.height < 1.0 {
                self.window = None;
            }
        }
        self
    }

    /// 最近開いたファイルの先頭に積む。同じパスは重複させず、先頭へ引き上げる。
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
/// `tauri::Manager::path()` は `AppHandle` 構築後にしか使えないが、ウィンドウ生成の
/// **前に**ウィンドウ状態が要る。よって Tauri の app_config_dir と同じ規則を自前で辿る。
/// `identifier` は `tauri::generate_context!()` の config から渡すので、
/// `tauri.conf.json` との二重管理にはならない。
pub fn store_path(identifier: &str) -> Option<PathBuf> {
    Some(config_dir(identifier)?.join(FILE_NAME))
}

/// アプリのデータ置き場。`settings.rs` も同じディレクトリを使う（02.architecture.md §4.5）。
/// 2 か所で辿ると、片方だけ規則が変わったときに設定と状態が別の場所に散る。
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

/// ストアを読む。**失敗しても既定値を返す。**
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

/// ストアを書く。失敗は握り潰して警告に留める。
///
/// 本文の保存と同じ原子的書き込みを通すのは、書き込み中の電源断で
/// 「壊れた JSON」ではなく「前回の JSON」が残るようにするため。
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

    /// 03.ux-spec.md §7.3 の引用ブロック。
    /// **記録が無いときは左右とも閉じた状態で出る**（F-NAV-04 は初回起動の話）。
    #[test]
    fn panes_start_closed_when_nothing_was_recorded() {
        let data = StoreData::default();
        assert!(!data.panes.right.open);
        assert!(!data.panes.left.open);
        assert_eq!(data.panes.right.width, PANE_WIDTH_DEFAULT);
    }

    /// Phase 5 までに書かれた `state.json` には `panes` が無い。
    /// **版を上げずに読めること**が、最近開いたファイルと倍率を守る条件になっている。
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

    /// §7.3「幅は左右で別々に記憶する」。
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

    /// ADR-0007 論点 4。**生涯 1 回**であることがモーダルを許容する条件そのものなので、
    /// フラグが往復で保たれることを機械的に見張る。
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

    /// Phase 6 までに書かれた `state.json`（`trayIntroShown` が無い）を読んでも、
    /// 最近開いたファイルと倍率を捨てないこと。
    ///
    /// **版を上げるとここが壊れる。** キー 1 つの追加に対して代償が大き過ぎるので、
    /// `#[serde(default)]` で受ける判断が正しいままであることを固定する。
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
}
