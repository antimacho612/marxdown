//! ユーザーが追加した配色（02.architecture/10-theming.md §3.4 / [ADR-0014](../../docs/adr/0014-editor-theme-catalog.md)）。
//!
//! `%APPDATA%\marxdown\themes\<id>.css` を列挙して読む。
//! 組み込みの 50 枚はフロント側の遅延チャンクにあり、ここには一切現れない。
//! Rust が担当するのはディスク上のファイルだけである。
//!
//! カタログはプレビューとエディターで共通であり、面ごとに独立して選べる。
//! 選択中の 1 枚をプレビュー用に取り出す経路（[`find`]）があるのは、プレビューが起動直後から見えている面だからである。
//! 本文を描くより前に適用する必要があるため、bootstrap に宣言を同梱する。
//!
//! ファイルの中身は宣言の並び（`--mx-color-bg: #101010;` など）で始まり、セレクタを含む規則を続けて書くこともできる。
//! 包まれた後は CSS のネスト規則として解釈され、面の中にだけ適用される。
//! セレクタで包むのも、包んだ結果が面の外へ出ていないことを検査するのもフロント側の担当で、CSS のパーサを持っているのはあちらしかない（`src/features/theme/inject.ts`）。
//! ここでは中身を検証しない（[ADR-0006](../../docs/adr/0006-security-model.md)）。見るのは名前とサイズだけである。
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
/// 色の上書きだけなら 18 個の宣言で済み、実寸は 1KB に満たない。
/// 64KB にしてあるのは、プレビュー用の配色が本文向けのセレクタを含みうるためである。
/// 古いバージョンの `preview.css` と同じ上限であり、移したファイルがこの上限で読めなくなることもない。
/// これを超えるファイルは配色ではない。
pub const MAX_THEME_BYTES: u64 = 64 * 1024;

/// 読み込む枚数の上限。
///
/// 選択肢として現実的な数を超えたら、それはディレクトリの取り違えである。
/// 上限を設けないと、無関係なディレクトリを指したときに全ファイルを開くことになる。
pub const MAX_THEMES: usize = 100;

/// 古いバージョンの `editor.css` を移した先の id。
///
/// `editor.css` は常時適用される 1 枚だったため、移すだけでは見た目が変わる。
/// 呼び出し側は、移したうえで `editor.theme` が既定のままであれば、この id を選んだ状態にする。
pub const MIGRATED_EDITOR_ID: &str = "editor-custom";

/// 古いバージョンの `preview.css` を移した先の id。
///
/// 扱いは [`MIGRATED_EDITOR_ID`] と同じである。
/// 配色ファイルは `[data-mx-theme='<id>'] { … }` に包まれるため、`preview.css` に書けた内容はそのまま配色として書ける。
pub const MIGRATED_PREVIEW_ID: &str = "preview-custom";

/// ユーザーが置いた配色 1 枚。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTheme {
    /// 拡張子を除いたファイル名。そのまま `preview.theme` / `editor.theme` に保存される。
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
/// 属性セレクタ（`[data-mx-theme='<id>']` / `[data-mx-editor-theme='<id>']`）へそのまま埋め込まれるため、引用符やバックスラッシュを含む名前を通すと文字列を抜け出せる。
/// フロント側もブラウザのパーサで封じ込めを検査しているが、ここで除外しておけばその判定に頼らずに済む。
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
/// 読めなかった 1 枚は通知せずに対象外にする。ディレクトリ全体を失敗させると、無関係なファイルが 1 つ紛れただけで配色が全部消える。
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
/// 空のディレクトリを開かせないのは、書き方を伝えられる場所がファイルの中しかないためである。
pub fn ensure_dir(dir: &Path) -> CoreResult<()> {
    std::fs::create_dir_all(dir)?;

    let sample = dir.join("README.css");
    if !sample.exists() {
        crate::document::atomic::write(sample.as_path(), TEMPLATE.as_bytes())?;
    }
    Ok(())
}

/// 選択中の 1 枚だけを読む。無ければ `None` を返す。
///
/// プレビューは起動直後から見えている面であり、選ばれている配色を本文の描画より前に適用する必要がある。
/// bootstrap に載せるのはこの 1 枚だけで、全件を載せると起動のたびに 100 枚ぶんの CSS を初期化スクリプトへ書き出すことになる。
///
/// 組み込みの配色を選んでいる場合もここは `None` を返す。
/// 組み込みの一覧を持っているのはフロント側だけであり、Rust から区別できるのは `themes/` にあるかどうかだけである。
pub fn find(dir: Option<&Path>, id: &str) -> Option<UserTheme> {
    if id == crate::settings::DEFAULT_THEME_ID || !valid_id(id) {
        return None;
    }
    let path = dir?.join(format!("{id}.css"));

    match std::fs::metadata(&path) {
        Ok(meta) if meta.len() <= MAX_THEME_BYTES => {}
        _ => return None,
    }
    let declarations = std::fs::read_to_string(&path).ok()?;

    Some(UserTheme {
        id: id.to_owned(),
        declarations,
    })
}

/// ファイルを移した面。移したうえで設定が既定のままであれば、移した先を選んだ状態にする。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Migrated {
    pub preview: bool,
    pub editor: bool,
}

/// 古いバージョンが使っていたカスタム CSS（`preview.css` / `editor.css`）を `themes/` へ移す。起動時に 1 回だけ呼ぶ。
///
/// 中身は `:scope { … }` や `h1 { … }` の形だが、配色として `[data-mx-theme='…'] { … }` に包むと CSS のネスト規則として解釈され、`:scope` は外側のセレクタに一致する。
/// つまりファイルを移すだけで、書かれていた内容はそのまま適用される。
///
/// コピーではなく `rename` なのは、2 枚残るとどちらを編集すべきかユーザーが判断できなくなるためである。
/// 失敗しても起動は止めない。元のファイルが残って適用されないだけで、書いた内容は失われない。
pub fn migrate_legacy_css(identifier: &str) -> Migrated {
    let Some(config) = crate::store::config_dir(identifier) else {
        return Migrated::default();
    };
    migrate_legacy_css_in(&config)
}

/// [`migrate_legacy_css`] の本体。置き場所を引数に取り、テストから temp ディレクトリを渡せるようにしてある。
fn migrate_legacy_css_in(config: &Path) -> Migrated {
    Migrated {
        preview: move_into_themes(config, "preview.css", MIGRATED_PREVIEW_ID),
        editor: move_into_themes(config, "editor.css", MIGRATED_EDITOR_ID),
    }
}

/// 古いファイル 1 枚を `themes/<id>.css` へ移す。移したときだけ `true` を返す。
fn move_into_themes(config: &Path, legacy_name: &str, id: &str) -> bool {
    let legacy = config.join(legacy_name);
    if !legacy.exists() {
        return false;
    }

    let dir = config.join(DIR_NAME);
    let target = dir.join(format!("{id}.css"));
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
const TEMPLATE: &str = "/*
 * Marxdown の配色。
 *
 * このフォルダーに置いた .css が 1 枚 1 配色になり、設定の「配色」に現れます。
 * プレビューとエディターのどちらからも選べます。
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
 * 宣言のあとにセレクタを書くこともできます。選んだ面の中にだけ当たります。
 * エディターは Monaco が描画しているため、効くのは実質プレビューだけです。
 *
 *   h1 { border-bottom: 1px solid }
 *
 * 組み込みと同じ名前を付けると、そちらを置き換えます。
 * 保存すると、アプリを再起動しなくてもすぐ反映されます。
 */
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::DEFAULT_THEME_ID;

    fn temp_dir(tag: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("marxdown-themes-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// ディレクトリが無いのは正常な状態である。初回起動が常にこれにあたる。
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

    /// 選択中の 1 枚だけを取り出す経路（bootstrap 用）。
    #[test]
    fn the_selected_theme_can_be_read_alone() {
        let d = temp_dir("find");
        std::fs::write(d.join("vesper.css"), "--mx-color-bg: #101010;").unwrap();

        assert_eq!(
            find(Some(&d), "vesper").map(|t| t.declarations),
            Some("--mx-color-bg: #101010;".to_owned())
        );
        // 組み込みの配色も、存在しない綴りも、ここでは区別できない。どちらも `None` になる。
        assert_eq!(find(Some(&d), "dracula"), None);
        assert_eq!(find(Some(&d), DEFAULT_THEME_ID), None);
        // 属性セレクタへ埋め込めない綴りは、ファイルを探しに行く前に除外する。
        assert_eq!(find(Some(&d), "../../etc/passwd"), None);
        assert_eq!(find(None, "vesper"), None);
        std::fs::remove_dir_all(&d).ok();
    }

    /// 古いカスタム CSS は移すだけでよい。
    /// 中身の `:scope { … }` は配色として包まれると CSS のネスト規則になり、`:scope` は外側のセレクタに一致する。
    #[test]
    fn the_legacy_css_files_move_into_the_themes_directory() {
        let d = temp_dir("migrate");
        std::fs::write(d.join("editor.css"), ":scope { --mx-color-bg: #1a1b26 }").unwrap();
        std::fs::write(d.join("preview.css"), "h1 { color: rebeccapurple }").unwrap();

        assert_eq!(
            migrate_legacy_css_in(&d),
            Migrated {
                preview: true,
                editor: true
            }
        );

        assert!(!d.join("editor.css").exists(), "2 枚残さない");
        assert!(!d.join("preview.css").exists(), "2 枚残さない");
        assert_eq!(
            std::fs::read_to_string(d.join(DIR_NAME).join(format!("{MIGRATED_PREVIEW_ID}.css")))
                .unwrap(),
            "h1 { color: rebeccapurple }"
        );
        // 移った先は配色として読める。
        let ids: Vec<_> = load_all(Some(&d.join(DIR_NAME)))
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, vec![MIGRATED_EDITOR_ID, MIGRATED_PREVIEW_ID]);

        // 2 回目は何もしない。
        assert_eq!(migrate_legacy_css_in(&d), Migrated::default());
        std::fs::remove_dir_all(&d).ok();
    }

    /// 古いファイルが無いのは正常な状態である。
    #[test]
    fn nothing_happens_without_a_legacy_file() {
        let d = temp_dir("migrate-none");
        assert_eq!(migrate_legacy_css_in(&d), Migrated::default());
        assert!(!d.join(DIR_NAME).exists(), "空のディレクトリも作らない");
        std::fs::remove_dir_all(&d).ok();
    }

    /// 雛形は読み込まれても何も起きない（全体が 1 つのコメント）。
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
