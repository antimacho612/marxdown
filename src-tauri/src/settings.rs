//! ユーザー設定の永続化（02.architecture.md §4.5 / F-CONF-03）。
//!
//! # `state.json` と分ける理由
//!
//! 分割の基準は「誰が書くか」であって、内容の意味ではない。
//! `state.json`（`store.rs`）はアプリが自動的に書き続けるキャッシュであり、
//! 読めなければ捨てて既定値に戻してよい。
//! **`settings.json` はユーザーが手で書いたものなので、同じ扱いをしてはいけない。**
//!
//! パースに失敗したときの挙動は §4.5 が 3 つ挙げている。
//!
//! 1. 既定値で起動する（起動は止めない）
//! 2. 通知バーに知らせる（`broken` を bootstrap に載せてフロントが出す）
//! 3. **書き戻しを拒否する**（`AppState::patch_settings`）
//!
//! 3 を忘れると、ユーザーが直そうとしている最中に設定 UI がファイルごと吹き飛ばす。
//!
//! # キーの形
//!
//! VS Code と同じフラットなドット区切り（F-CONF-06）。素の JSON で、`version` は持たない。
//! 捨てられないファイルに版管理は成立しないため、互換性は**キー単位**で保つ。
//!
//! - 欠けているキーは既定値
//! - **未知のキーは保持して書き戻す。** 旧バージョンで開いて保存したときに
//!   新しいキーが消えないようにする。手書きの実験的なキーも消さない

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::document::atomic;
use crate::error::CoreResult;

const FILE_NAME: &str = "settings.json";

pub const KEY_THEME: &str = "theme";
pub const KEY_PREVIEW_FONT_FAMILY: &str = "preview.fontFamily";
pub const KEY_PREVIEW_FONT_SIZE: &str = "preview.fontSize";
pub const KEY_PREVIEW_LINE_HEIGHT: &str = "preview.lineHeight";
pub const KEY_PREVIEW_MAX_WIDTH: &str = "preview.maxWidth";
pub const KEY_WINDOW_CLOSE_BEHAVIOR: &str = "window.closeBehavior";

/// 既定値。`src/platform/types.ts` の `DEFAULT_SETTINGS` と 1:1 で対応する。
///
/// 本文のフォントサイズ・行間・幅は `src/styles/tokens.css` の既定と揃える。
/// ここがずれると、設定ファイルが無いときと「既定値を明示的に書いたとき」で
/// 見た目が変わる。
pub const DEFAULT_FONT_SIZE: f64 = 16.0;
pub const DEFAULT_LINE_HEIGHT: f64 = 1.75;
pub const DEFAULT_MAX_WIDTH: f64 = 100.0;

/// 数値の許容範囲。**丸めるのはメモリ上の値だけで、ファイルには書き戻さない。**
/// 0 や負数がそのまま CSS に流れるとレイアウトが壊れるため、読んだ時点で潰す。
const FONT_SIZE_RANGE: (f64, f64) = (8.0, 72.0);
const LINE_HEIGHT_RANGE: (f64, f64) = (1.0, 3.0);
const MAX_WIDTH_RANGE: (f64, f64) = (20.0, 200.0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// OS のライト / ダーク設定に追従する（F-CONF-01）。
    #[default]
    System,
    Light,
    Dark,
}

/// ウィンドウを閉じたときの挙動（F-WIN-*)。**M1.5 Phase 7 まで実際には効かない。**
/// 既定を `Tray` にしているのは、常駐してウォーム起動を活かすのが
/// プロダクトの中心価値だから（ADR-0004）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    #[default]
    Tray,
    Exit,
}

/// 設定の全体。**既定値で埋めた後の姿**であり、ファイルの中身そのものではない。
///
/// `flatten` した `extra` に未知のキーが入る。シリアライズすると
/// 既知のキーと同じ階層に並ぶので、書き戻しても消えない（§4.5）。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Settings {
    #[serde(rename = "theme")]
    pub theme: Theme,
    #[serde(rename = "preview.fontFamily")]
    pub preview_font_family: String,
    #[serde(rename = "preview.fontSize")]
    pub preview_font_size: f64,
    #[serde(rename = "preview.lineHeight")]
    pub preview_line_height: f64,
    /// 本文幅。単位は `ch`（02.architecture.md §10.2）。
    /// px ではないのは、フォントサイズを変えても列幅が揺れないようにするため。
    #[serde(rename = "preview.maxWidth")]
    pub preview_max_width: f64,
    #[serde(rename = "window.closeBehavior")]
    pub window_close_behavior: CloseBehavior,
    /// Marxdown が解釈しないキー。**捨てずに持ち回る**のが唯一の役目。
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            // 空文字は「トークン層の既定スタックを使う」の意味。
            // 具体的なフォント名を既定に書くと、そのフォントが入っていない環境で
            // `tokens.css` の混植スタックが丸ごと外れる（F-CONF-04）。
            preview_font_family: String::new(),
            preview_font_size: DEFAULT_FONT_SIZE,
            preview_line_height: DEFAULT_LINE_HEIGHT,
            preview_max_width: DEFAULT_MAX_WIDTH,
            window_close_behavior: CloseBehavior::default(),
            extra: Map::new(),
        }
    }
}

impl Settings {
    /// JSON オブジェクトから読む。**既知のキーを取り除いた残りが `extra` になる。**
    ///
    /// 値の型が違うキーは既定値に落とす。ファイル全体を「壊れている」とは見なさない。
    /// `version` を持たない以上、互換性はキー単位で保つしかない（§4.5）。
    fn from_map(mut map: Map<String, Value>) -> Self {
        let d = Self::default();
        Self {
            theme: take(&mut map, KEY_THEME).unwrap_or(d.theme),
            preview_font_family: take(&mut map, KEY_PREVIEW_FONT_FAMILY)
                .unwrap_or(d.preview_font_family),
            preview_font_size: take_number(&mut map, KEY_PREVIEW_FONT_SIZE, FONT_SIZE_RANGE)
                .unwrap_or(d.preview_font_size),
            preview_line_height: take_number(&mut map, KEY_PREVIEW_LINE_HEIGHT, LINE_HEIGHT_RANGE)
                .unwrap_or(d.preview_line_height),
            preview_max_width: take_number(&mut map, KEY_PREVIEW_MAX_WIDTH, MAX_WIDTH_RANGE)
                .unwrap_or(d.preview_max_width),
            window_close_behavior: take(&mut map, KEY_WINDOW_CLOSE_BEHAVIOR)
                .unwrap_or(d.window_close_behavior),
            extra: map,
        }
    }

    /// 書き戻す形。既知のキーと `extra` が同じ階層に並ぶ。
    fn to_map(&self) -> Map<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(map)) => map,
            // `Settings` の Serialize は必ずオブジェクトになるので到達しない。
            _ => Map::new(),
        }
    }

    /// 変更したキーだけを当てる（§4.1 `write_settings`）。
    ///
    /// **値が `null` のキーは削除する。** 設定 UI の「既定に戻す」がこれにあたる。
    /// 既定値を書き込むのではなく行ごと消すことで、既定値が変わったときに追従する。
    pub fn patched(&self, patch: Map<String, Value>) -> Self {
        let mut map = self.to_map();
        for (key, value) in patch {
            if value.is_null() {
                map.remove(&key);
            } else {
                map.insert(key, value);
            }
        }
        Self::from_map(map)
    }
}

fn take<T: serde::de::DeserializeOwned>(map: &mut Map<String, Value>, key: &str) -> Option<T> {
    serde_json::from_value(map.remove(key)?).ok()
}

fn take_number(map: &mut Map<String, Value>, key: &str, range: (f64, f64)) -> Option<f64> {
    let value: f64 = take(map, key)?;
    value.is_finite().then(|| value.clamp(range.0, range.1))
}

/// 読み込みの結果。**「壊れている」という事実を値と一緒に運ぶ**（§4.5）。
///
/// 呼び出し側が `broken` を無視すると、壊れたファイルを既定値で上書きしてしまう。
/// 単に `Settings` を返す形にしないのはそのため。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLoad {
    pub values: Settings,
    /// `Some` の間は書き戻しを拒否する。
    pub broken: Option<SettingsProblem>,
}

/// 通知バーに出す内容（03.ux-spec.md §8.2）。
///
/// パスを `String` にしているのは、`PathBuf` の Serialize が非 UTF-8 で失敗するため。
/// bootstrap のシリアライズが落ちると初期ペイロードごと消えるので、
/// 表示用の文字列に倒しておく。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsProblem {
    pub path: String,
    pub message: String,
}

/// 設定ファイルの置き場所。`state.json` と同じディレクトリに置く。
pub fn settings_path(identifier: &str) -> Option<PathBuf> {
    Some(crate::store::config_dir(identifier)?.join(FILE_NAME))
}

/// 設定を読む。**壊れていても既定値を返し、起動は止めない**（§4.5）。
///
/// ファイルが無いのは壊れているうちに入らない。初回起動がそれであり、
/// このとき書き戻しを拒否してしまうと設定 UI が永久に保存できなくなる。
pub fn load(path: Option<&Path>) -> SettingsLoad {
    let Some(path) = path else {
        return SettingsLoad::default();
    };

    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return SettingsLoad::default(),
        // 読めない理由が「無い」以外なら、書けもしない可能性が高い。
        // 既定値で動かしつつ、上書きは避ける側に倒す。
        Err(e) => return broken(path, e.to_string()),
    };

    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(map)) => SettingsLoad {
            values: Settings::from_map(map),
            broken: None,
        },
        Ok(_) => broken(path, "設定ファイルの最上位がオブジェクトではない".into()),
        Err(e) => broken(path, e.to_string()),
    }
}

fn broken(path: &Path, message: String) -> SettingsLoad {
    SettingsLoad {
        values: Settings::default(),
        broken: Some(SettingsProblem {
            path: path.display().to_string(),
            message,
        }),
    }
}

/// 設定を書く。**`store::save` と違い、失敗を握り潰さない。**
///
/// 保存できたかどうかは設定 UI がユーザーに見せる必要がある値であり、
/// 「書けなかったのに書けたように見える」ほうが害が大きい。
pub fn save(path: &Path, settings: &Settings) -> CoreResult<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // 手で開いて読む前提のファイルなので整形して書く（F-CONF-06）。
    let json = serde_json::to_string_pretty(&settings.to_map())
        .map_err(|e| crate::error::CoreError::Io(e.to_string()))?;
    atomic::write(path, format!("{json}\n").as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("marxdown-settings-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn write_settings_file(dir: &Path, body: &str) -> PathBuf {
        let p = dir.join(FILE_NAME);
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn a_missing_file_is_not_broken() {
        let d = temp_dir("missing");
        let loaded = load(Some(&d.join("nope.json")));
        assert!(
            loaded.broken.is_none(),
            "初回起動でファイルが無いのは壊れていない"
        );
        assert_eq!(loaded.values, Settings::default());
        std::fs::remove_dir_all(&d).ok();
    }

    /// §4.5 の中心。壊れたファイルは**読まないだけで、触らない**。
    #[test]
    fn a_corrupt_file_falls_back_to_defaults_without_touching_the_file() {
        let d = temp_dir("corrupt");
        let body = "{ \"theme\": \"dark\",,, 直している途中";
        let p = write_settings_file(&d, body);

        let loaded = load(Some(&p));

        assert_eq!(loaded.values, Settings::default());
        assert!(loaded.broken.is_some(), "壊れている事実を運ぶ");
        assert_eq!(
            std::fs::read_to_string(&p).unwrap(),
            body,
            "ユーザーが手で書いたファイルを 1 バイトも変えない"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_non_object_root_is_broken() {
        let d = temp_dir("array");
        let p = write_settings_file(&d, "[1, 2, 3]");
        assert!(load(Some(&p)).broken.is_some());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn missing_keys_fall_back_to_defaults() {
        let d = temp_dir("partial");
        let p = write_settings_file(&d, r#"{"theme":"dark"}"#);

        let loaded = load(Some(&p));

        assert!(loaded.broken.is_none());
        assert_eq!(loaded.values.theme, Theme::Dark);
        assert_eq!(loaded.values.preview_font_size, DEFAULT_FONT_SIZE);
        assert_eq!(
            loaded.values.window_close_behavior,
            CloseBehavior::Tray,
            "常駐が既定（ADR-0004）"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_key_with_the_wrong_type_falls_back_without_breaking_the_file() {
        let d = temp_dir("type");
        let p = write_settings_file(&d, r#"{"preview.fontSize":"おおきめ","theme":"light"}"#);

        let loaded = load(Some(&p));

        assert!(loaded.broken.is_none(), "キー単位で前方互換に倒す");
        assert_eq!(loaded.values.preview_font_size, DEFAULT_FONT_SIZE);
        assert_eq!(loaded.values.theme, Theme::Light);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn out_of_range_numbers_are_clamped_in_memory() {
        let d = temp_dir("range");
        let p = write_settings_file(&d, r#"{"preview.fontSize":0,"preview.maxWidth":100000}"#);

        let loaded = load(Some(&p));

        assert_eq!(loaded.values.preview_font_size, FONT_SIZE_RANGE.0);
        assert_eq!(loaded.values.preview_max_width, MAX_WIDTH_RANGE.1);
        std::fs::remove_dir_all(&d).ok();
    }

    /// §4.5「未知のキーは保持して書き戻す」。
    /// 旧バージョンで開いて保存したときに、新しいキーが消えないようにする。
    #[test]
    fn unknown_keys_survive_a_write() {
        let d = temp_dir("unknown");
        let p = write_settings_file(
            &d,
            r#"{"theme":"dark","editor.futureKey":42,"my.experiment":{"a":[1]}}"#,
        );

        let loaded = load(Some(&p));
        assert_eq!(loaded.values.extra.len(), 2);

        let patched = loaded.values.patched(Map::from_iter([(
            KEY_THEME.to_string(),
            Value::from("light"),
        )]));
        save(&p, &patched).unwrap();

        let back = load(Some(&p));
        assert_eq!(back.values.theme, Theme::Light);
        assert_eq!(back.values.extra["editor.futureKey"], Value::from(42));
        assert_eq!(back.values.extra["my.experiment"]["a"][0], Value::from(1));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_null_in_the_patch_removes_the_key() {
        let settings = Settings::from_map(
            serde_json::from_str(r#"{"theme":"dark","my.experiment":1}"#).unwrap(),
        );

        let patched = settings.patched(Map::from_iter([
            (KEY_THEME.to_string(), Value::Null),
            ("my.experiment".to_string(), Value::Null),
        ]));

        assert_eq!(patched.theme, Theme::System, "消したキーは既定値に戻る");
        assert!(patched.extra.is_empty());
    }

    #[test]
    fn a_saved_file_uses_the_dotted_keys() {
        let d = temp_dir("shape");
        let p = d.join(FILE_NAME);
        save(&p, &Settings::default()).unwrap();

        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("\"preview.fontSize\""), "{text}");
        assert!(!text.contains("\"version\""), "版管理は持たない（§4.5）");
        assert!(text.ends_with('\n'));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_round_trip_through_the_file_preserves_values() {
        let d = temp_dir("roundtrip");
        let p = d.join(FILE_NAME);
        let settings = Settings {
            theme: Theme::Dark,
            preview_font_family: "Noto Sans JP".into(),
            preview_line_height: 1.9,
            window_close_behavior: CloseBehavior::Exit,
            ..Settings::default()
        };
        save(&p, &settings).unwrap();

        let back = load(Some(&p)).values;

        assert_eq!(back, settings);
        std::fs::remove_dir_all(&d).ok();
    }
}
