//! Rust 側で表示する文言（ADR-0026）。
//!
//! 画面の文言はフロントエンド（`src/i18n/`）が持つ。
//! ここにあるのは、フロントエンドを経由しないもの（ネイティブダイアログ・トレイのメニュー・ファイル選択の絞り込み・`themes/README.css`・`marxdown -` の標準エラー出力）だけである。
//! 言語は起動時に 1 回だけ決め、フロントエンドと同じく再起動まで変えない。

use std::sync::OnceLock;

use crate::settings::UiLanguage;

/// Rust 側の文言の言語。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ja,
    En,
}

static LANG: OnceLock<Lang> = OnceLock::new();

/// 設定 `ui.language` から言語を決める。起動時に設定を読んだ直後に 1 回だけ呼ぶ。
///
/// 呼ぶ前（`--help` や `marxdown -` の経路）は OS の表示言語に従う。
pub fn init(setting: UiLanguage) {
    let _ = LANG.set(resolve(setting, os_is_japanese()));
}

/// 設定と OS の表示言語から言語を決める。`auto` は OS が日本語なら日本語、それ以外は英語にする（フロントエンドの `resolveLocale` と同じ規則）。
pub fn resolve(setting: UiLanguage, os_japanese: bool) -> Lang {
    match setting {
        UiLanguage::Ja => Lang::Ja,
        UiLanguage::En => Lang::En,
        UiLanguage::Auto if os_japanese => Lang::Ja,
        UiLanguage::Auto => Lang::En,
    }
}

/// 現在の言語の文言。
pub fn text() -> &'static Text {
    match *LANG.get_or_init(|| resolve(UiLanguage::Auto, os_is_japanese())) {
        Lang::Ja => &JA,
        Lang::En => &EN,
    }
}

/// OS の表示言語が日本語か。
#[cfg(windows)]
pub fn os_is_japanese() -> bool {
    // 下位 10 ビットが主言語で、0x11 は LANG_JAPANESE である。
    // SAFETY: 引数を取らず、呼び出し元の状態に依存しない。
    let lang = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() };
    lang & 0x3ff == 0x11
}

/// OS の表示言語が日本語か。
#[cfg(target_os = "macos")]
pub fn os_is_japanese() -> bool {
    crate::macos::prefers_japanese()
}

/// OS の表示言語が日本語か。
#[cfg(all(unix, not(target_os = "macos")))]
pub fn os_is_japanese() -> bool {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|key| std::env::var(key).ok().filter(|v| !v.is_empty()))
        .is_some_and(|v| v.starts_with("ja"))
}

/// Rust 側の文言。
///
/// ダイアログのボタンは、押された結果がラベルの文字列で返る（tauri-plugin-dialog の仕様）。
/// 判定もこの値で行うため、同じダイアログの中でラベルを重複させない。
pub struct Text {
    /// 未保存の変更があることを伝える文面。終了・ウィンドウを閉じる・別の文書へ移るの 3 つの確認で共有する。
    pub dirty_message: &'static str,
    pub save_and_quit: &'static str,
    pub quit_without_saving: &'static str,
    pub save_and_close: &'static str,
    pub close_without_saving: &'static str,
    pub save: &'static str,
    pub discard: &'static str,
    pub cancel: &'static str,
    /// 初めて `✕` を押したときの説明。
    pub tray_intro: &'static str,
    pub tray_intro_stash: &'static str,
    pub tray_intro_quit: &'static str,
    pub tray_open: &'static str,
    pub tray_quit: &'static str,
    pub tray_recent: &'static str,
    /// macOS のアプリのメニュー（`macos.rs`）。
    /// 項目の名前は macOS の標準の訳語に合わせる。
    pub menu_quit: &'static str,
    pub menu_hide: &'static str,
    pub menu_hide_others: &'static str,
    pub menu_show_all: &'static str,
    pub menu_edit: &'static str,
    pub menu_undo: &'static str,
    pub menu_redo: &'static str,
    pub menu_cut: &'static str,
    pub menu_copy: &'static str,
    pub menu_paste: &'static str,
    pub menu_select_all: &'static str,
    pub menu_window: &'static str,
    pub menu_minimize: &'static str,
    pub menu_zoom: &'static str,
    pub menu_fullscreen: &'static str,
    /// ファイル選択ダイアログの絞り込み。
    pub all_files: &'static str,
    /// `themes/README.css` の雛形。全体を 1 つのコメントにする（`themes.rs`）。
    pub themes_template: &'static str,
    pub stdin_needs_pipe: &'static str,
    pub stdin_read_failed: &'static str,
    pub launch_failed: &'static str,
    pub help: &'static str,
}

const JA: Text = Text {
    dirty_message: "未保存の変更があります。保存しますか？",
    save_and_quit: "保存して終了",
    quit_without_saving: "保存せず終了",
    save_and_close: "保存して閉じる",
    close_without_saving: "保存せず閉じる",
    save: "保存する",
    discard: "保存しない",
    cancel: "キャンセル",
    tray_intro: TRAY_INTRO_JA,
    tray_intro_stash: TRAY_INTRO_STASH_JA,
    tray_intro_quit: "終了",
    tray_open: "Marxdown を開く",
    tray_quit: "終了",
    tray_recent: "最近開いたファイル",
    menu_quit: "Marxdown を終了",
    menu_hide: "Marxdown を隠す",
    menu_hide_others: "ほかを隠す",
    menu_show_all: "すべてを表示",
    menu_edit: "編集",
    menu_undo: "取り消す",
    menu_redo: "やり直す",
    menu_cut: "カット",
    menu_copy: "コピー",
    menu_paste: "ペースト",
    menu_select_all: "すべてを選択",
    menu_window: "ウインドウ",
    menu_minimize: "しまう",
    menu_zoom: "拡大／縮小",
    menu_fullscreen: "フルスクリーンにする",
    all_files: "すべてのファイル",
    themes_template: THEMES_TEMPLATE_JA,
    stdin_needs_pipe:
        "- を指定したときは、パイプで内容を渡してください（例: cat a.md | marxdown -）",
    stdin_read_failed: "標準入力を読み込めませんでした",
    launch_failed: "Marxdown を起動できませんでした",
    help: crate::cli::HELP_JA,
};

const EN: Text = Text {
    dirty_message: "You have unsaved changes. Do you want to save them?",
    save_and_quit: "Save and Quit",
    quit_without_saving: "Quit Without Saving",
    save_and_close: "Save and Close",
    close_without_saving: "Close Without Saving",
    save: "Save",
    discard: "Don't Save",
    cancel: "Cancel",
    tray_intro: "Closing the window keeps Marxdown running in the system tray, so it opens instantly the next time.\n\n\
                 You can change this with \"Keep Running in the Tray on Close\" in Settings.",
    tray_intro_stash: "Keep in Tray",
    tray_intro_quit: "Quit",
    tray_open: "Open Marxdown",
    tray_quit: "Quit",
    tray_recent: "Recent Files",
    menu_quit: "Quit Marxdown",
    menu_hide: "Hide Marxdown",
    menu_hide_others: "Hide Others",
    menu_show_all: "Show All",
    menu_edit: "Edit",
    menu_undo: "Undo",
    menu_redo: "Redo",
    menu_cut: "Cut",
    menu_copy: "Copy",
    menu_paste: "Paste",
    menu_select_all: "Select All",
    menu_window: "Window",
    menu_minimize: "Minimize",
    menu_zoom: "Zoom",
    menu_fullscreen: "Enter Full Screen",
    all_files: "All Files",
    themes_template: THEMES_TEMPLATE_EN,
    stdin_needs_pipe: "when using -, pipe the content in (e.g. cat a.md | marxdown -)",
    stdin_read_failed: "could not read standard input",
    launch_failed: "could not start Marxdown",
    help: crate::cli::HELP_EN,
};

/// 初めて `✕` を押したときの説明（日本語）。
/// Linux ではトレイを「システムトレイ」と呼ぶ（M10 §4.13）。
#[cfg(not(all(unix, not(target_os = "macos"))))]
const TRAY_INTRO_JA: &str = "ウィンドウを閉じても、Marxdown はタスクトレイで動作し続けます。次に開くときにすぐ表示されます。\n\n\
                             この動作は、設定の「閉じるときにタスクトレイに格納する」で変更できます。";
#[cfg(all(unix, not(target_os = "macos")))]
const TRAY_INTRO_JA: &str = "ウィンドウを閉じても、Marxdown はシステムトレイで動作し続けます。次に開くときにすぐ表示されます。\n\n\
                             この動作は、設定の「閉じるときにタスクトレイに格納する」で変更できます。";
#[cfg(not(all(unix, not(target_os = "macos"))))]
const TRAY_INTRO_STASH_JA: &str = "タスクトレイに格納";
#[cfg(all(unix, not(target_os = "macos")))]
const TRAY_INTRO_STASH_JA: &str = "システムトレイに格納";

const THEMES_TEMPLATE_JA: &str = "/*
 * Marxdown の配色ファイル
 *
 * このフォルダーに置いた .css ファイル 1 つが 1 つの配色になり、設定の「配色」に表示されます。
 * プレビューとエディターのどちらでも選べます。
 * 配色の名前は、拡張子を除いたファイル名です（英数字と - _ だけ使えます）。
 *
 * ファイルには、セレクターを付けずに宣言だけを書きます。
 *
 *   --mx-color-bg: #101010;
 *   --mx-color-fg: #ffffff;
 *   --mx-color-code-string: #99ffe4;
 *
 * ライトとダークで色を変えるときは、light-dark() を使います。
 *
 *   --mx-color-bg: light-dark(#ffffff, #101010);
 *
 * ライトかダークの一方にだけ対応する配色は、color-scheme で固定できます。
 *
 *   color-scheme: dark;
 *
 * 宣言の後には、セレクター付きの規則も書けます。
 * 規則は、その配色を選んだ場所の中だけに適用されます。
 * エディターには適用されないため、実際に効果があるのはプレビューだけです。
 *
 *   h1 { border-bottom: 1px solid }
 *
 * 組み込みの配色と同じ名前を付けると、組み込みの配色の代わりに使われます。
 * ファイルを保存すると、すぐに反映されます。
 */
";

const THEMES_TEMPLATE_EN: &str = "/*
 * Marxdown color theme files
 *
 * Each .css file in this folder becomes a color theme and appears in Color Theme in Settings.
 * It can be selected for both the preview and the editor.
 * The theme name is the file name without the extension (only letters, digits, - and _).
 *
 * Write only declarations in the file, without selectors.
 *
 *   --mx-color-bg: #101010;
 *   --mx-color-fg: #ffffff;
 *   --mx-color-code-string: #99ffe4;
 *
 * To use different colors in light and dark, use light-dark().
 *
 *   --mx-color-bg: light-dark(#ffffff, #101010);
 *
 * A theme that supports only light or only dark can fix it with color-scheme.
 *
 *   color-scheme: dark;
 *
 * After the declarations, you can also write rules with selectors.
 * Rules apply only inside the area where the theme is selected.
 * They do not apply to the editor, so they only affect the preview.
 *
 *   h1 { border-bottom: 1px solid }
 *
 * A file with the same name as a built-in theme is used instead of the built-in theme.
 * Changes take effect as soon as you save the file.
 */
";

/// 全言語の `themes/README.css` の雛形（`themes.rs` のテストが検査する）。
#[cfg(test)]
pub(crate) fn all_themes_templates() -> [&'static str; 2] {
    [THEMES_TEMPLATE_JA, THEMES_TEMPLATE_EN]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_setting_wins_over_the_os() {
        assert_eq!(resolve(UiLanguage::Ja, false), Lang::Ja);
        assert_eq!(resolve(UiLanguage::En, true), Lang::En);
    }

    #[test]
    fn auto_follows_the_os() {
        assert_eq!(resolve(UiLanguage::Auto, true), Lang::Ja);
        assert_eq!(resolve(UiLanguage::Auto, false), Lang::En);
    }

    #[test]
    fn dialog_labels_are_distinct() {
        for t in [&JA, &EN] {
            let labels = [
                t.save_and_quit,
                t.quit_without_saving,
                t.save_and_close,
                t.close_without_saving,
                t.save,
                t.discard,
                t.cancel,
            ];
            for (i, a) in labels.iter().enumerate() {
                for b in &labels[i + 1..] {
                    assert_ne!(a, b);
                }
            }
        }
    }
}
