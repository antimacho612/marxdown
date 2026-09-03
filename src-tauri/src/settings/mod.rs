//! ユーザー設定の永続化（02.architecture/04-rust-responsibilities.md §5 / F-CONF-03）。
//!
//! `state.json`（`store.rs`）と分けているのは「誰が書くか」が違うためである。
//! `state.json` はアプリが自動的に書き続けるキャッシュであり、読めなければ破棄して既定値に戻してよい。
//! 一方 `settings.json` はユーザーが手で書いたものなので、同じ扱いをしてはいけない。
//! パースに失敗したときは 02.architecture/04-rust-responsibilities.md §5 の通り、既定値で起動し（起動は止めない）、通知バーに知らせ（`broken` を bootstrap に載せてフロントが出す）、書き戻しを拒否する（`AppState::patch_settings`）。
//! 書き戻しの拒否を忘れると、ユーザーが直そうとしている最中に設定 UI がファイルの内容を丸ごと消してしまう。
//!
//! このファイルにあるのは I/O とポリシーだけである。
//! キーの名前・型・既定値・許容範囲は [`schema`] にあり、設定項目を足すときに触るのはあちらで、ここは項目数に関わらず同じ規模のままでいる。
//!
//! キーの形は VS Code と同じフラットなドット区切りである（F-CONF-06）。
//! 素の JSON で、`version` は持たない。
//! 破棄できないファイルに版管理は成立しないため、互換性はキー単位で保つ。
//! 欠けているキーは既定値を使い、未知のキーは保持して書き戻す（旧バージョンで開いて保存したときに新しいキーが消えないようにする。手書きの実験的なキーも消さない）。

mod schema;

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::document::atomic;
use crate::error::CoreResult;

pub use schema::*;

const FILE_NAME: &str = "settings.json";

/// 読み込みの結果。**「壊れている」という事実を値と一緒に運ぶ**（02.architecture/04-rust-responsibilities.md §5）。
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

/// 通知バーに出す内容（03.ux-spec/07-status-and-notifications.md §2）。
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

/// 設定を読む。**壊れていても既定値を返し、起動は止めない**（02.architecture/04-rust-responsibilities.md §5）。
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

    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(serde_json::Value::Object(map)) => SettingsLoad {
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

    /// 02.architecture/04-rust-responsibilities.md §5 の中心。壊れたファイルは**読まないだけで、触らない**。
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

    /// 02.architecture/04-rust-responsibilities.md §5「未知のキーは保持して書き戻す」。
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

        let patched = loaded.values.patched(serde_json::Map::from_iter([(
            KEY_THEME.to_string(),
            serde_json::Value::from("light"),
        )]));
        save(&p, &patched).unwrap();

        let back = load(Some(&p));
        assert_eq!(back.values.theme, Theme::Light);
        assert_eq!(
            back.values.extra["editor.futureKey"],
            serde_json::Value::from(42)
        );
        assert_eq!(
            back.values.extra["my.experiment"]["a"][0],
            serde_json::Value::from(1)
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_saved_file_uses_the_dotted_keys() {
        let d = temp_dir("shape");
        let p = d.join(FILE_NAME);
        save(&p, &Settings::default()).unwrap();

        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("\"preview.fontSize\""), "{text}");
        assert!(text.contains("\"editor.guides.indentation\""), "{text}");
        assert!(
            !text.contains("\"version\""),
            "版管理は持たない（02.architecture/04-rust-responsibilities.md §5）"
        );
        assert!(text.ends_with('\n'));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_round_trip_through_the_file_preserves_values() {
        let d = temp_dir("roundtrip");
        let p = d.join(FILE_NAME);
        let settings = Settings {
            theme: Theme::Dark,
            editor_font_family: "Cascadia Code".into(),
            editor_line_height: 1.4,
            editor_rulers: vec![80.0, 100.0],
            editor_word_wrap: WordWrap::Bounded,
            preview_code_font_family: "BIZ UD Gothic".into(),
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
