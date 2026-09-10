//! ユーザーが追加したエディターの配色（[ADR-0014](../../docs/adr/0014-editor-theme-catalog.md)）。
//!
//! `%APPDATA%\com.antimacho612.marxdown\themes\<id>.css` を列挙して読む。
//! 組み込みの 50 枚はフロント側の遅延チャンクにあり、ここには一切現れない。
//! Rust が担当するのはディスク上のファイルだけである。
//!
//! ファイルの中身は宣言の並び（`--mx-color-bg: #101010;` など）であり、セレクタを含まない。
//! セレクタで包むのも、包んだ結果が面の外へ出ていないことを検査するのもフロント側の担当で、CSS のパーサを持っているのはあちらしかない（`src/features/theme/lazy/catalog.ts`）。
//! `custom_css.rs` と同じ理由で、ここでも中身は検証しない。見るのは名前とサイズだけである。
//!
//! 設定項目は無い。ファイルを置けば選択肢に現れる。
//! したがって「ディレクトリが無い」は正常な状態であり、初回起動が常にそれにあたる。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::CoreResult;

/// 配色を置くディレクトリ。`settings.json` と同じ階層に作る。
const DIR_NAME: &str = "themes";

/// 1 枚の上限。
///
/// 配色は 18 個の宣言であり、実寸は 1KB に満たない。
/// `custom_css.rs` の 64KB より小さくしてあるのは、こちらが任意の CSS ではなく宣言の並びだけを受け取る場所だからである。
/// これを超えるファイルは配色ではない。
pub const MAX_THEME_BYTES: u64 = 16 * 1024;

/// 読み込む枚数の上限。
///
/// 選択肢として現実的な数を超えたら、それはディレクトリの取り違えである。
/// 上限を設けないと、無関係なディレクトリを指したときに全ファイルを開くことになる。
pub const MAX_THEMES: usize = 100;

/// `editor.css` を移行した先の id（ADR-0014 §3.5）。
///
/// `editor.css` は常時適用される 1 枚だったため、移行しただけでは見た目が変わってしまう。
/// 呼び出し側は、移行が起きてなお `editor.theme` が既定のままであれば、この id を選んだ状態にする。
pub const MIGRATED_ID: &str = "editor-custom";

/// ユーザーが置いた配色 1 枚。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTheme {
    /// 拡張子を除いたファイル名。そのまま `editor.theme` に保存される。
    pub id: String,
    /// ファイルの中身。宣言の並びであることは前提にしない（検証はフロント側が行う）。
    pub declarations: String,
}

/// 配色の置き場所。`None` は置き場所が決まらなかったことを表す。
pub fn themes_dir(identifier: &str) -> Option<PathBuf> {
    Some(crate::store::config_dir(identifier)?.join(DIR_NAME))
}

/// id として許す綴り。
///
/// 属性セレクタ（`[data-mx-editor-theme='<id>']`）へそのまま埋め込まれるため、引用符やバックスラッシュを含む名前を通すと文字列を抜け出せる。
/// フロント側もブラウザのパーサで封じ込めを検査しているが、ここで弾いておけばその判定に頼らずに済む。
///
/// 大文字を許すのは、`Tokyo Night.css` のような名前を付けたときに選択肢から消える理由が分からないためである。
/// 空白は許さない。CSS の識別子としてではなく文字列として埋め込むため動作はするが、`themes/` の一覧と設定の値が視覚的に一致しない綴りを増やす利点がない。
fn valid_id(stem: &str) -> bool {
    !stem.is_empty()
        && stem.len() <= 64
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `themes/` の中身をすべて読む。無ければ空を返す。
///
/// 1 枚ずつ取りに来る形にしていない。
/// 呼び出し側（設定ダイアログの選択肢）は常に全件を必要とし、実寸の合計は数十 KB に収まる。
/// 読めなかった 1 枚は黙って飛ばす。ディレクトリ全体を失敗させると、無関係なファイルが 1 つ紛れただけで配色が全部消える。
///
/// 並びはファイル名の昇順にする。読み取り順のままだと OS とファイルシステムで選択肢の並びが変わる。
pub fn load_all(dir: Option<&Path>) -> Vec<UserTheme> {
    let Some(dir) = dir else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        // ディレクトリが無いのは正常な状態である（初回起動）。
        return Vec::new();
    };

    let mut themes = Vec::new();
    for entry in entries.flatten() {
        if themes.len() >= MAX_THEMES {
            break;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("css") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !valid_id(stem) {
            continue;
        }
        match std::fs::metadata(&path) {
            Ok(meta) if meta.len() <= MAX_THEME_BYTES => {}
            _ => continue,
        }
        let Ok(declarations) = std::fs::read_to_string(&path) else {
            continue;
        };
        themes.push(UserTheme {
            id: stem.to_owned(),
            declarations,
        });
    }

    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
}

/// ディレクトリと雛形を用意する。既にあるファイルには書き込まない。
///
/// 設定 UI の「配色フォルダーを開く」から呼ぶ。
/// 空のディレクトリを開かせないのは `custom_css::ensure_exists` と同じ理由で、書き方を伝えられる場所がファイルの中しかないためである。
pub fn ensure_dir(dir: &Path) -> CoreResult<()> {
    std::fs::create_dir_all(dir)?;

    let sample = dir.join("README.css");
    if !sample.exists() {
        crate::document::atomic::write(sample.as_path(), TEMPLATE.as_bytes())?;
    }
    Ok(())
}

/// `editor.css` を `themes/<MIGRATED_ID>.css` へ移す。移したときだけ `true` を返す。
///
/// `editor.css`（ADR-0013 §3.5）は配色のカタログに置き換わって廃止された。
/// 中身は `:scope { --mx-color-*: … }` の形だが、配色として `[data-mx-editor-theme='…'] { … }` に包むと CSS のネスト規則として解釈され、`:scope` は外側のセレクタに一致する。
/// つまりファイルを移すだけで、書かれていた内容はそのまま効く。
///
/// コピーではなく `rename` なのは `custom_css::migrate_legacy` と同じ理由で、2 枚残るとどちらを編集すべきかユーザーが判断できなくなるためである。
/// 失敗しても起動は止めない。`editor.css` が残って適用されないだけで、書いた内容は失われない。
pub fn migrate_editor_css(identifier: &str) -> bool {
    let Some(config) = crate::store::config_dir(identifier) else {
        return false;
    };
    migrate_editor_css_in(&config)
}

/// [`migrate_editor_css`] の本体。置き場所を引数に取り、テストから temp ディレクトリを渡せるようにしてある。
fn migrate_editor_css_in(config: &Path) -> bool {
    let legacy = config.join("editor.css");
    if !legacy.exists() {
        return false;
    }

    let dir = config.join(DIR_NAME);
    let target = dir.join(format!("{MIGRATED_ID}.css"));
    if target.exists() {
        return false;
    }
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    std::fs::rename(&legacy, &target).is_ok()
}

/// 雛形。説明だけで、有効な宣言を 1 つも含めない。
///
/// 有効な形で例を書くと、`README` という名前の配色が選択肢に現れてしまう。
/// 全体が 1 つのコメントであれば、読み込まれても宣言は 0 個であり、選んでも何も起きない。
const TEMPLATE: &str = "\
/*
 * Marxdown のエディター配色。
 *
 * このフォルダーに置いた .css が 1 枚 1 配色になり、設定の「配色」に現れます。
 * 選択肢に出る名前は拡張子を除いたファイル名です（英数字と - _ だけが使えます）。
 *
 * 中身はセレクタを書かず、宣言だけを並べます。
 *
 *   --mx-color-bg: #101010;
 *   --mx-color-fg: #ffffff;
 *   --mx-color-code-string: #99ffe4;
 *
 * ライトとダークで色を変えるときは light-dark() を使います。
 *
 *   --mx-color-bg: light-dark(#ffffff, #101010);
 *
 * どちらか一方しか持たない配色は、明暗を固定できます。
 *
 *   color-scheme: dark;
 *
 * 組み込みと同じ名前を付けると、そちらを置き換えます。
 * 保存すると、アプリを再起動しなくてもすぐ反映されます。
 */
";

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("marxdown-themes-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// ディレクトリが無いのは正常な状態である。**初回起動が常にこれ**にあたる。
    #[test]
    fn a_missing_directory_is_a_normal_state() {
        let d = temp_dir("missing");
        assert!(load_all(Some(&d.join("themes"))).is_empty());
        assert!(load_all(None).is_empty());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn css_files_become_themes_named_after_the_file() {
        let d = temp_dir("load");
        std::fs::write(d.join("vesper.css"), "--mx-color-bg: #101010;").unwrap();
        std::fs::write(d.join("notes.txt"), "無関係なファイル").unwrap();

        let loaded = load_all(Some(&d));

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "vesper");
        assert_eq!(loaded[0].declarations, "--mx-color-bg: #101010;");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 並びは読み取り順ではなくファイル名順にする。選択肢の並びが環境で変わらないようにするため。
    #[test]
    fn themes_are_sorted_by_name() {
        let d = temp_dir("sort");
        for id in ["zeta", "alpha", "mid"] {
            std::fs::write(d.join(format!("{id}.css")), "--mx-color-bg: #000000;").unwrap();
        }

        let ids: Vec<_> = load_all(Some(&d)).into_iter().map(|t| t.id).collect();

        assert_eq!(ids, vec!["alpha", "mid", "zeta"]);
        std::fs::remove_dir_all(&d).ok();
    }

    /// 属性セレクタへ埋め込む値であるため、引用符を含む名前は読み込まない。
    #[test]
    fn a_name_that_could_escape_the_selector_is_skipped() {
        let d = temp_dir("escape");
        std::fs::write(d.join("ok_name-1.css"), "--mx-color-bg: #000000;").unwrap();
        std::fs::write(d.join("bad'name.css"), "--mx-color-bg: #000000;").unwrap();
        std::fs::write(d.join("bad name.css"), "--mx-color-bg: #000000;").unwrap();

        let ids: Vec<_> = load_all(Some(&d)).into_iter().map(|t| t.id).collect();

        assert_eq!(ids, vec!["ok_name-1"]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_file_over_the_limit_is_skipped() {
        let d = temp_dir("large");
        std::fs::write(d.join("small.css"), "--mx-color-bg: #000000;").unwrap();
        std::fs::write(d.join("huge.css"), "a".repeat(MAX_THEME_BYTES as usize + 1)).unwrap();

        let ids: Vec<_> = load_all(Some(&d)).into_iter().map(|t| t.id).collect();

        assert_eq!(ids, vec!["small"]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn the_count_is_capped() {
        let d = temp_dir("many");
        for i in 0..(MAX_THEMES + 10) {
            std::fs::write(d.join(format!("t{i:04}.css")), "--mx-color-bg: #000000;").unwrap();
        }

        assert_eq!(load_all(Some(&d)).len(), MAX_THEMES);
        std::fs::remove_dir_all(&d).ok();
    }

    /// ADR-0014 §3.5。`editor.css` は移すだけでよい。
    /// 中身の `:scope { … }` は配色として包まれると CSS のネスト規則になり、`:scope` は外側のセレクタに一致する。
    #[test]
    fn the_legacy_editor_css_moves_into_the_themes_directory() {
        let d = temp_dir("migrate");
        let legacy = d.join("editor.css");
        std::fs::write(&legacy, ":scope { --mx-color-bg: #1a1b26 }").unwrap();

        assert!(migrate_editor_css_in(&d));

        assert!(!legacy.exists(), "2 枚残さない");
        let moved = d.join(DIR_NAME).join(format!("{MIGRATED_ID}.css"));
        assert_eq!(
            std::fs::read_to_string(&moved).unwrap(),
            ":scope { --mx-color-bg: #1a1b26 }"
        );
        // 移った先は配色として読める。
        assert_eq!(load_all(Some(&d.join(DIR_NAME)))[0].id, MIGRATED_ID);

        // 2 回目は何もしない。
        assert!(!migrate_editor_css_in(&d));
        std::fs::remove_dir_all(&d).ok();
    }

    /// `editor.css` が無いのは正常な状態である（M4 以降に始めた人が常にこれ）。
    #[test]
    fn nothing_happens_without_a_legacy_file() {
        let d = temp_dir("migrate-none");
        assert!(!migrate_editor_css_in(&d));
        assert!(!d.join(DIR_NAME).exists(), "空のディレクトリも作らない");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 雛形は**読み込まれても何も起きない**（全体が 1 つのコメント）。
    /// 有効な宣言を含めると、`README` という配色が選択肢に現れる。
    #[test]
    fn the_template_is_one_comment_and_nothing_else() {
        let trimmed = TEMPLATE.trim();
        assert!(trimmed.starts_with("/*"), "{TEMPLATE}");
        assert!(trimmed.ends_with("*/"), "{TEMPLATE}");
        assert_eq!(trimmed.matches("*/").count(), 1, "{TEMPLATE}");
    }

    #[test]
    fn the_template_is_written_only_when_it_is_missing() {
        let d = temp_dir("ensure").join("themes");

        ensure_dir(&d).unwrap();
        assert!(std::fs::read_to_string(d.join("README.css"))
            .unwrap()
            .contains("1 枚 1 配色"));

        std::fs::write(d.join("README.css"), "書き換えた").unwrap();
        ensure_dir(&d).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.join("README.css")).unwrap(),
            "書き換えた"
        );
        std::fs::remove_dir_all(d.parent().unwrap()).ok();
    }
}
