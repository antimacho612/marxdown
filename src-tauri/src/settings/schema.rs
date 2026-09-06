//! 設定の形（02.architecture/04-rust-responsibilities.md §5 / F-CONF-03）。
//!
//! I/O は持たない。
//! ファイルの読み書きと「壊れているときの振る舞い」は親モジュール（`settings/mod.rs`）の担当で、ここにあるのはキーの名前・型・既定値・許容範囲だけである。
//! キーの形は VS Code と同じフラットなドット区切りで（F-CONF-06）、ネストしたオブジェクトにしない。
//! `editor.guides.indentation` のように 3 階層に見えるキーも、JSON の上では 1 本の文字列キーであり、VS Code の `settings.json` からそのまま転記できる。
//!
//! 既定値は 3 か所で一致させる必要がある。
//! ここ（ファイルを読み込むときの既定）、`src/platform/settings-schema.ts` の `SETTINGS_SCHEMA`（bootstrap を経由しない経路の既定）、`src/styles/tokens.css`（プレビューの見た目の既定）の 3 か所である。
//! 前 2 者の一致は `the_defaults_match_the_frontend_table` が `tests/settings-default.json` 越しに固定している。
//! プレビューの 3 項目（文字サイズ・行間・本文幅）だけはトークン層にも既定があり、ここがずれると設定ファイルが無いときと「既定値を明示的に書いたとき」で見た目が変わる。
//! エディターの既定値はトークン層に無い。
//! M2 まではプレビューのトークンをそのまま使用していたが、読む面と書く面でタイポグラフィを分けた（ADR-0012）。

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// `settings.json` のキー名。
/// 綴りは VS Code と一致させる（F-CONF-06）。
/// 文字列リテラルを直接書かず、読み書きの両側からこの定数を参照する。
pub const KEY_THEME: &str = "theme";

pub const KEY_EDITOR_BRACKET_PAIR_COLORIZATION_ENABLED: &str =
    "editor.bracketPairColorization.enabled";
pub const KEY_EDITOR_CURSOR_BLINKING: &str = "editor.cursorBlinking";
pub const KEY_EDITOR_CURSOR_STYLE: &str = "editor.cursorStyle";
pub const KEY_EDITOR_CURSOR_SURROUNDING_LINES: &str = "editor.cursorSurroundingLines";
pub const KEY_EDITOR_FONT_FAMILY: &str = "editor.fontFamily";
pub const KEY_EDITOR_FONT_LIGATURES: &str = "editor.fontLigatures";
pub const KEY_EDITOR_FONT_SIZE: &str = "editor.fontSize";
pub const KEY_EDITOR_GUIDES_INDENTATION: &str = "editor.guides.indentation";
pub const KEY_EDITOR_INSERT_SPACES: &str = "editor.insertSpaces";
pub const KEY_EDITOR_LETTER_SPACING: &str = "editor.letterSpacing";
pub const KEY_EDITOR_LINE_HEIGHT: &str = "editor.lineHeight";
pub const KEY_EDITOR_LINE_NUMBERS: &str = "editor.lineNumbers";
pub const KEY_EDITOR_MINIMAP_ENABLED: &str = "editor.minimap.enabled";
pub const KEY_EDITOR_PADDING_TOP: &str = "editor.padding.top";
pub const KEY_EDITOR_RENDER_CONTROL_CHARACTERS: &str = "editor.renderControlCharacters";
pub const KEY_EDITOR_RENDER_LINE_HIGHLIGHT: &str = "editor.renderLineHighlight";
pub const KEY_EDITOR_RENDER_WHITESPACE: &str = "editor.renderWhitespace";
pub const KEY_EDITOR_RULERS: &str = "editor.rulers";
pub const KEY_EDITOR_SCROLL_BEYOND_LAST_LINE: &str = "editor.scrollBeyondLastLine";
pub const KEY_EDITOR_THEME: &str = "editor.theme";
pub const KEY_EDITOR_TAB_SIZE: &str = "editor.tabSize";
pub const KEY_EDITOR_WORD_WRAP: &str = "editor.wordWrap";
pub const KEY_EDITOR_WORD_WRAP_COLUMN: &str = "editor.wordWrapColumn";

pub const KEY_PREVIEW_CODE_FONT_FAMILY: &str = "preview.codeFontFamily";
pub const KEY_PREVIEW_FONT_FAMILY: &str = "preview.fontFamily";
pub const KEY_PREVIEW_FONT_SIZE: &str = "preview.fontSize";
pub const KEY_PREVIEW_LINE_HEIGHT: &str = "preview.lineHeight";
pub const KEY_PREVIEW_MAX_WIDTH: &str = "preview.maxWidth";
pub const KEY_PREVIEW_THEME: &str = "preview.theme";

pub const KEY_WINDOW_CLOSE_BEHAVIOR: &str = "window.closeBehavior";

/// プレビューの既定。`src/styles/tokens.css` と揃える。
pub const DEFAULT_FONT_SIZE: f64 = 16.0;
pub const DEFAULT_LINE_HEIGHT: f64 = 1.75;
pub const DEFAULT_MAX_WIDTH: f64 = 100.0;

/// エディターの既定（ADR-0012）。プレビューとは別の値を使う。
///
/// 16px / 1.75 は読むためのタイポグラフィであり、書く面では行間が広すぎて視線の移動量が増える。
/// VS Code の既定（14px）に寄せ、行間だけ日本語のために少し広げている。
pub const DEFAULT_EDITOR_FONT_SIZE: f64 = 14.0;
pub const DEFAULT_EDITOR_LINE_HEIGHT: f64 = 1.6;
/// 1 行目がウィンドウの縁に貼り付かないだけの余白。
pub const DEFAULT_EDITOR_PADDING_TOP: f64 = 12.0;
pub const DEFAULT_EDITOR_TAB_SIZE: f64 = 2.0;
pub const DEFAULT_EDITOR_WORD_WRAP_COLUMN: f64 = 80.0;

/// 数値の許容範囲。
/// 0 や負数がそのまま CSS / Monaco に渡るとレイアウトが壊れるため、読んだ時点で範囲内に丸める。
/// `src/platform/settings-schema.ts` の `min` / `max` と一致させる。
///
/// 読むだけならファイルは変わらない。
/// ただし設定 UI から保存すると、丸めた後の値が書き戻る（`patched` はメモリ上の値を土台にするため）。
/// ユーザー操作を起点にしてしか書かないため、これは許容する。
const FONT_SIZE_RANGE: (f64, f64) = (8.0, 72.0);
const LINE_HEIGHT_RANGE: (f64, f64) = (1.0, 3.0);
const MAX_WIDTH_RANGE: (f64, f64) = (20.0, 200.0);
const LETTER_SPACING_RANGE: (f64, f64) = (-2.0, 10.0);
const TAB_SIZE_RANGE: (f64, f64) = (1.0, 8.0);
const WORD_WRAP_COLUMN_RANGE: (f64, f64) = (20.0, 500.0);
const CURSOR_SURROUNDING_LINES_RANGE: (f64, f64) = (0.0, 30.0);
const PADDING_TOP_RANGE: (f64, f64) = (0.0, 100.0);
const RULER_RANGE: (f64, f64) = (1.0, 500.0);

/// 縦罫線の本数の上限。
/// 上限を置かないと、手で書いた `[1,2,3,...]` がそのまま描画コストになる。
const RULERS_MAX: usize = 8;

/// 明暗の指定（F-CONF-01）。配色そのものは [`Palette`] が持つ。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// OS のライト / ダーク設定に追従する（F-CONF-01）。
    #[default]
    System,
    Light,
    Dark,
}

/// ウィンドウを閉じたときの挙動（F-WIN-* / ADR-0007）。
/// 既定を `Tray` にしているのは、常駐してウォーム起動を利用することがプロダクトの中心価値だからである（ADR-0004）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    #[default]
    Tray,
    Exit,
}

/// 折り返し（VS Code `editor.wordWrap`）。
/// 既定は `On`。Markdown の段落は 1 行が長く、折り返さないと読めない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WordWrap {
    Off,
    #[default]
    On,
    /// `editor.wordWrapColumn` の桁で折り返す。
    WordWrapColumn,
    /// ビューポート幅と `editor.wordWrapColumn` の狭いほうで折り返す。
    Bounded,
}

/// 行番号の表示（VS Code `editor.lineNumbers`）。既定は `On`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineNumbers {
    Off,
    #[default]
    On,
    Relative,
    Interval,
}

/// 空白文字の可視化（VS Code `editor.renderWhitespace`）。
/// 既定を `None` にしているのは、Markdown の構造に対して意味を持たない情報で画面を埋めないためである。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderWhitespace {
    #[default]
    None,
    Boundary,
    Selection,
    Trailing,
    All,
}

/// カーソル行の強調（VS Code `editor.renderLineHighlight`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderLineHighlight {
    None,
    Gutter,
    #[default]
    Line,
    All,
}

/// カーソルの形（VS Code `editor.cursorStyle`）。
/// 値はハイフン区切り（`line-thin`）で、VS Code と同じ綴りを使う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CursorStyle {
    #[default]
    Line,
    Block,
    Underline,
    LineThin,
    BlockOutline,
    UnderlineThin,
}

/// 配色（[ADR-0013](../../docs/adr/0013-surface-themes.md)）。
///
/// 明暗は含まない。
/// 明暗を決めるのは `theme`（`system` / `light` / `dark`）だけで、各パレットはライトとダークの両方を持つ（CSS 側の `light-dark()`）。
/// パレット自身に明暗を持たせると、明暗を決める箇所が 3 か所に増える。
///
/// プレビューとエディターで同じカタログを使う。
/// どちらも同じトークン（`--mx-color-*` / `--mx-color-code-*`）の上書きでしかなく、面ごとにカタログを分ける理由がない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Palette {
    /// `tokens.css` のトークンをそのまま使う。`data-mx-theme` を付けない状態にあたる。
    #[default]
    Default,
    Github,
    Solarized,
    Nord,
    Gruvbox,
}

/// カーソルの点滅（VS Code `editor.cursorBlinking`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorBlinking {
    #[default]
    Blink,
    Smooth,
    Phase,
    Expand,
    Solid,
}

/// 設定の全体。既定値で埋めた後の状態であり、ファイルの中身そのものではない。
///
/// `flatten` した `extra` に未知のキーが入る。
/// シリアライズすると既知のキーと同じ階層に並ぶため、書き戻しても失われない（02.architecture/04-rust-responsibilities.md §5）。
///
/// フィールドの並びがそのまま書き出したときのキーの並びになる。
/// `theme` を先頭に置き、以降はドット区切りのグループごとに辞書順で並べる。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Settings {
    #[serde(rename = "theme")]
    pub theme: Theme,

    #[serde(rename = "editor.bracketPairColorization.enabled")]
    pub editor_bracket_pair_colorization_enabled: bool,
    #[serde(rename = "editor.cursorBlinking")]
    pub editor_cursor_blinking: CursorBlinking,
    #[serde(rename = "editor.cursorStyle")]
    pub editor_cursor_style: CursorStyle,
    #[serde(rename = "editor.cursorSurroundingLines")]
    pub editor_cursor_surrounding_lines: f64,
    #[serde(rename = "editor.fontFamily")]
    pub editor_font_family: String,
    #[serde(rename = "editor.fontLigatures")]
    pub editor_font_ligatures: bool,
    #[serde(rename = "editor.fontSize")]
    pub editor_font_size: f64,
    #[serde(rename = "editor.guides.indentation")]
    pub editor_guides_indentation: bool,
    #[serde(rename = "editor.insertSpaces")]
    pub editor_insert_spaces: bool,
    #[serde(rename = "editor.letterSpacing")]
    pub editor_letter_spacing: f64,
    /// 行の高さ。倍率で指定する（Monaco は 0 より大きく 8 未満なら倍率として解釈する）。
    #[serde(rename = "editor.lineHeight")]
    pub editor_line_height: f64,
    #[serde(rename = "editor.lineNumbers")]
    pub editor_line_numbers: LineNumbers,
    #[serde(rename = "editor.minimap.enabled")]
    pub editor_minimap_enabled: bool,
    #[serde(rename = "editor.padding.top")]
    pub editor_padding_top: f64,
    #[serde(rename = "editor.renderControlCharacters")]
    pub editor_render_control_characters: bool,
    #[serde(rename = "editor.renderLineHighlight")]
    pub editor_render_line_highlight: RenderLineHighlight,
    #[serde(rename = "editor.renderWhitespace")]
    pub editor_render_whitespace: RenderWhitespace,
    /// 縦罫線を引く桁。空なら引かない。`preview.maxWidth` と対で使う。
    #[serde(rename = "editor.rulers")]
    pub editor_rulers: Vec<f64>,
    #[serde(rename = "editor.scrollBeyondLastLine")]
    pub editor_scroll_beyond_last_line: bool,
    /// エディターの配色。`preview.theme` とは独立に選べる。
    #[serde(rename = "editor.theme")]
    pub editor_theme: Palette,
    #[serde(rename = "editor.tabSize")]
    pub editor_tab_size: f64,
    #[serde(rename = "editor.wordWrap")]
    pub editor_word_wrap: WordWrap,
    #[serde(rename = "editor.wordWrapColumn")]
    pub editor_word_wrap_column: f64,

    /// 空文字は「トークン層の既定スタックを使う」。
    #[serde(rename = "preview.codeFontFamily")]
    pub preview_code_font_family: String,
    #[serde(rename = "preview.fontFamily")]
    pub preview_font_family: String,
    #[serde(rename = "preview.fontSize")]
    pub preview_font_size: f64,
    #[serde(rename = "preview.lineHeight")]
    pub preview_line_height: f64,
    /// 本文幅。単位は `ch`（02.architecture/10-theming.md §2）。
    /// px ではないのは、フォントサイズを変えても 1 行あたりの文字数が変わらないようにするためである。
    #[serde(rename = "preview.maxWidth")]
    pub preview_max_width: f64,
    /// 本文の配色。
    #[serde(rename = "preview.theme")]
    pub preview_theme: Palette,

    #[serde(rename = "window.closeBehavior")]
    pub window_close_behavior: CloseBehavior,

    /// Marxdown が解釈しないキー。破棄せず保持することだけが役目である。
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),

            // Monaco の既定と変えている 3 つ（記号の色分け・ミニマップ・空白の可視化）は、
            // いずれも Markdown の構造に対して意味を持たない情報で画面を埋めるものである。
            // 既定では無効にし、必要な人だけが有効にする（ADR-0001 から引き継ぐ判断）。
            editor_bracket_pair_colorization_enabled: false,
            editor_cursor_blinking: CursorBlinking::default(),
            editor_cursor_style: CursorStyle::default(),
            editor_cursor_surrounding_lines: 0.0,
            // 空文字は「トークン層のコードスタックを使う」の意味。
            editor_font_family: String::new(),
            editor_font_ligatures: true,
            editor_font_size: DEFAULT_EDITOR_FONT_SIZE,
            editor_guides_indentation: true,
            editor_insert_spaces: true,
            editor_letter_spacing: 0.0,
            editor_line_height: DEFAULT_EDITOR_LINE_HEIGHT,
            editor_line_numbers: LineNumbers::default(),
            editor_minimap_enabled: false,
            editor_padding_top: DEFAULT_EDITOR_PADDING_TOP,
            editor_render_control_characters: true,
            editor_render_line_highlight: RenderLineHighlight::default(),
            editor_render_whitespace: RenderWhitespace::default(),
            editor_rulers: Vec::new(),
            editor_scroll_beyond_last_line: true,
            editor_theme: Palette::default(),
            editor_tab_size: DEFAULT_EDITOR_TAB_SIZE,
            editor_word_wrap: WordWrap::default(),
            editor_word_wrap_column: DEFAULT_EDITOR_WORD_WRAP_COLUMN,

            // 具体的なフォント名を既定に書くと、そのフォントが存在しない環境で `tokens.css` の混植スタックがすべて無効になる（F-CONF-04）。
            preview_code_font_family: String::new(),
            preview_font_family: String::new(),
            preview_font_size: DEFAULT_FONT_SIZE,
            preview_line_height: DEFAULT_LINE_HEIGHT,
            preview_max_width: DEFAULT_MAX_WIDTH,
            preview_theme: Palette::default(),

            window_close_behavior: CloseBehavior::default(),

            extra: Map::new(),
        }
    }
}

impl Settings {
    /// JSON オブジェクトから読む。既知のキーを取り除いた残りが `extra` になる。
    ///
    /// 値の型が違うキーは既定値に戻す。ファイル全体を壊れているとは見なさない。
    /// `version` を持たない以上、互換性はキー単位で保つ（02.architecture/04-rust-responsibilities.md §5）。
    pub(super) fn from_map(mut map: Map<String, Value>) -> Self {
        let d = Self::default();
        Self {
            theme: take(&mut map, KEY_THEME).unwrap_or(d.theme),

            editor_bracket_pair_colorization_enabled: take(
                &mut map,
                KEY_EDITOR_BRACKET_PAIR_COLORIZATION_ENABLED,
            )
            .unwrap_or(d.editor_bracket_pair_colorization_enabled),
            editor_cursor_blinking: take(&mut map, KEY_EDITOR_CURSOR_BLINKING)
                .unwrap_or(d.editor_cursor_blinking),
            editor_cursor_style: take(&mut map, KEY_EDITOR_CURSOR_STYLE)
                .unwrap_or(d.editor_cursor_style),
            editor_cursor_surrounding_lines: take_int(
                &mut map,
                KEY_EDITOR_CURSOR_SURROUNDING_LINES,
                CURSOR_SURROUNDING_LINES_RANGE,
            )
            .unwrap_or(d.editor_cursor_surrounding_lines),
            editor_font_family: take(&mut map, KEY_EDITOR_FONT_FAMILY)
                .unwrap_or(d.editor_font_family),
            editor_font_ligatures: take(&mut map, KEY_EDITOR_FONT_LIGATURES)
                .unwrap_or(d.editor_font_ligatures),
            editor_font_size: take_number(&mut map, KEY_EDITOR_FONT_SIZE, FONT_SIZE_RANGE)
                .unwrap_or(d.editor_font_size),
            editor_guides_indentation: take(&mut map, KEY_EDITOR_GUIDES_INDENTATION)
                .unwrap_or(d.editor_guides_indentation),
            editor_insert_spaces: take(&mut map, KEY_EDITOR_INSERT_SPACES)
                .unwrap_or(d.editor_insert_spaces),
            editor_letter_spacing: take_number(
                &mut map,
                KEY_EDITOR_LETTER_SPACING,
                LETTER_SPACING_RANGE,
            )
            .unwrap_or(d.editor_letter_spacing),
            editor_line_height: take_number(&mut map, KEY_EDITOR_LINE_HEIGHT, LINE_HEIGHT_RANGE)
                .unwrap_or(d.editor_line_height),
            editor_line_numbers: take(&mut map, KEY_EDITOR_LINE_NUMBERS)
                .unwrap_or(d.editor_line_numbers),
            editor_minimap_enabled: take(&mut map, KEY_EDITOR_MINIMAP_ENABLED)
                .unwrap_or(d.editor_minimap_enabled),
            editor_padding_top: take_int(&mut map, KEY_EDITOR_PADDING_TOP, PADDING_TOP_RANGE)
                .unwrap_or(d.editor_padding_top),
            editor_render_control_characters: take(&mut map, KEY_EDITOR_RENDER_CONTROL_CHARACTERS)
                .unwrap_or(d.editor_render_control_characters),
            editor_render_line_highlight: take(&mut map, KEY_EDITOR_RENDER_LINE_HIGHLIGHT)
                .unwrap_or(d.editor_render_line_highlight),
            editor_render_whitespace: take(&mut map, KEY_EDITOR_RENDER_WHITESPACE)
                .unwrap_or(d.editor_render_whitespace),
            editor_rulers: take_rulers(&mut map).unwrap_or(d.editor_rulers),
            editor_scroll_beyond_last_line: take(&mut map, KEY_EDITOR_SCROLL_BEYOND_LAST_LINE)
                .unwrap_or(d.editor_scroll_beyond_last_line),
            editor_theme: take(&mut map, KEY_EDITOR_THEME).unwrap_or(d.editor_theme),
            editor_tab_size: take_int(&mut map, KEY_EDITOR_TAB_SIZE, TAB_SIZE_RANGE)
                .unwrap_or(d.editor_tab_size),
            editor_word_wrap: take(&mut map, KEY_EDITOR_WORD_WRAP).unwrap_or(d.editor_word_wrap),
            editor_word_wrap_column: take_int(
                &mut map,
                KEY_EDITOR_WORD_WRAP_COLUMN,
                WORD_WRAP_COLUMN_RANGE,
            )
            .unwrap_or(d.editor_word_wrap_column),

            preview_code_font_family: take(&mut map, KEY_PREVIEW_CODE_FONT_FAMILY)
                .unwrap_or(d.preview_code_font_family),
            preview_font_family: take(&mut map, KEY_PREVIEW_FONT_FAMILY)
                .unwrap_or(d.preview_font_family),
            preview_font_size: take_number(&mut map, KEY_PREVIEW_FONT_SIZE, FONT_SIZE_RANGE)
                .unwrap_or(d.preview_font_size),
            preview_line_height: take_number(&mut map, KEY_PREVIEW_LINE_HEIGHT, LINE_HEIGHT_RANGE)
                .unwrap_or(d.preview_line_height),
            preview_max_width: take_number(&mut map, KEY_PREVIEW_MAX_WIDTH, MAX_WIDTH_RANGE)
                .unwrap_or(d.preview_max_width),
            preview_theme: take(&mut map, KEY_PREVIEW_THEME).unwrap_or(d.preview_theme),

            window_close_behavior: take(&mut map, KEY_WINDOW_CLOSE_BEHAVIOR)
                .unwrap_or(d.window_close_behavior),

            extra: map,
        }
    }

    /// 書き戻す形。既知のキーと `extra` が同じ階層に並ぶ。
    pub(super) fn to_map(&self) -> Map<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(map)) => map,
            // `Settings` の Serialize は必ずオブジェクトになるため到達しない。
            _ => Map::new(),
        }
    }

    /// 変更したキーだけを当てる（02.architecture/04-rust-responsibilities.md §1 `write_settings`）。
    ///
    /// 値が `null` のキーは削除する。設定 UI の「既定に戻す」がこれにあたる。
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

/// 整数でなければ意味を持たない値（タブ幅・桁数・余白）。
///
/// Monaco 側の `tabSize` などは整数を前提に桁を数えるため、境界で整数に丸めてから渡す。
fn take_int(map: &mut Map<String, Value>, key: &str, range: (f64, f64)) -> Option<f64> {
    take_number(map, key, range).map(f64::round)
}

/// 縦罫線。要素ごとに範囲へ丸め、本数も上限で切る。
///
/// 型が違う要素が 1 つでもあれば、配列ごと既定（引かない）に戻す。
/// 部分的に採用すると、指定したのに 1 本足りない状態になり原因が追いにくい。
fn take_rulers(map: &mut Map<String, Value>) -> Option<Vec<f64>> {
    let values: Vec<f64> = take(map, KEY_EDITOR_RULERS)?;
    Some(
        values
            .into_iter()
            .filter(|v| v.is_finite())
            .map(|v| v.clamp(RULER_RANGE.0, RULER_RANGE.1).round())
            .take(RULERS_MAX)
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 既定値がフロント側（`src/platform/settings-schema.ts`）と一致することを、
    /// 突き合わせ用の JSON 1 枚を挟んで固定する。
    /// 反対側から同じファイルを読むのは `src/platform/settings-schema.test.ts` である。
    /// 食い違ったときは、どちらが正しいかを決めてから `UPDATE_SETTINGS_FIXTURE=1 cargo test` で焼き直す。
    #[test]
    fn the_defaults_match_the_frontend_table() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/settings-default.json");
        let actual = serde_json::to_value(Settings::default()).unwrap();

        if std::env::var_os("UPDATE_SETTINGS_FIXTURE").is_some() {
            std::fs::write(
                &path,
                format!("{}\n", serde_json::to_string_pretty(&actual).unwrap()),
            )
            .unwrap();
            return;
        }

        let expected: Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(actual, expected, "{}", path.display());
    }

    #[test]
    fn missing_keys_fall_back_to_defaults() {
        let s = Settings::from_map(serde_json::from_str(r#"{"theme":"dark"}"#).unwrap());

        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.preview_font_size, DEFAULT_FONT_SIZE);
        assert_eq!(s.editor_font_size, DEFAULT_EDITOR_FONT_SIZE);
        assert_eq!(
            s.window_close_behavior,
            CloseBehavior::Tray,
            "常駐が既定（ADR-0004）"
        );
    }

    /// ADR-0012。**読む面と書く面でタイポグラフィが別**であること自体を固定する。
    #[test]
    fn the_editor_does_not_inherit_the_preview_typography() {
        let d = Settings::default();
        assert_ne!(d.editor_font_size, d.preview_font_size);
        assert_ne!(d.editor_line_height, d.preview_line_height);
    }

    #[test]
    fn a_key_with_the_wrong_type_falls_back_without_breaking_the_rest() {
        let s = Settings::from_map(
            serde_json::from_str(r#"{"editor.tabSize":"ふたつ","editor.wordWrap":"off"}"#).unwrap(),
        );

        assert_eq!(s.editor_tab_size, DEFAULT_EDITOR_TAB_SIZE, "キー単位で倒す");
        assert_eq!(s.editor_word_wrap, WordWrap::Off);
    }

    /// VS Code の綴りをそのまま受ける。
    /// ここがずれると「VS Code から写したのに効かない」になる（F-CONF-06）。
    #[test]
    fn vscode_spellings_are_accepted() {
        let s = Settings::from_map(
            serde_json::from_str(
                r#"{
                    "editor.wordWrap":"wordWrapColumn",
                    "editor.cursorStyle":"line-thin",
                    "editor.renderWhitespace":"boundary",
                    "editor.lineNumbers":"relative",
                    "editor.cursorBlinking":"phase",
                    "editor.renderLineHighlight":"gutter",
                    "editor.guides.indentation":false,
                    "editor.minimap.enabled":true,
                    "editor.padding.top":24,
                    "editor.bracketPairColorization.enabled":true
                }"#,
            )
            .unwrap(),
        );

        assert_eq!(s.editor_word_wrap, WordWrap::WordWrapColumn);
        assert_eq!(s.editor_cursor_style, CursorStyle::LineThin);
        assert_eq!(s.editor_render_whitespace, RenderWhitespace::Boundary);
        assert_eq!(s.editor_line_numbers, LineNumbers::Relative);
        assert_eq!(s.editor_cursor_blinking, CursorBlinking::Phase);
        assert_eq!(s.editor_render_line_highlight, RenderLineHighlight::Gutter);
        assert!(!s.editor_guides_indentation);
        assert!(s.editor_minimap_enabled);
        assert_eq!(s.editor_padding_top, 24.0);
        assert!(s.editor_bracket_pair_colorization_enabled);
        assert!(
            s.extra.is_empty(),
            "3 階層に見えるキーも既知のキーとして拾う"
        );
    }

    /// 書き出した綴りが VS Code と一致すること。読めても書けなければ往復で壊れる。
    #[test]
    fn enums_round_trip_through_the_file_shape() {
        let s = Settings {
            editor_cursor_style: CursorStyle::BlockOutline,
            editor_word_wrap: WordWrap::Bounded,
            ..Settings::default()
        };

        let map = s.to_map();
        assert_eq!(map[KEY_EDITOR_CURSOR_STYLE], Value::from("block-outline"));
        assert_eq!(map[KEY_EDITOR_WORD_WRAP], Value::from("bounded"));
        assert_eq!(Settings::from_map(map), s);
    }

    /// ADR-0013。**面ごとに独立して選べること**と、既定が「属性なし」であること。
    #[test]
    fn the_two_surfaces_pick_palettes_independently() {
        let d = Settings::default();
        assert_eq!(d.preview_theme, Palette::Default);
        assert_eq!(d.editor_theme, Palette::Default);

        let s = Settings::from_map(
            serde_json::from_str(r#"{"preview.theme":"solarized","editor.theme":"nord"}"#).unwrap(),
        );
        assert_eq!(s.preview_theme, Palette::Solarized);
        assert_eq!(s.editor_theme, Palette::Nord);
    }

    /// 知らないパレット名は既定に落ちる。**ファイル全体は壊さない。**
    #[test]
    fn an_unknown_palette_falls_back_to_default() {
        let s = Settings::from_map(
            serde_json::from_str(r#"{"preview.theme":"dracula","theme":"dark"}"#).unwrap(),
        );
        assert_eq!(s.preview_theme, Palette::Default);
        assert_eq!(s.theme, Theme::Dark);
    }

    #[test]
    fn out_of_range_numbers_are_clamped_in_memory() {
        let s = Settings::from_map(
            serde_json::from_str(
                r#"{"preview.fontSize":0,"preview.maxWidth":100000,"editor.tabSize":99}"#,
            )
            .unwrap(),
        );

        assert_eq!(s.preview_font_size, FONT_SIZE_RANGE.0);
        assert_eq!(s.preview_max_width, MAX_WIDTH_RANGE.1);
        assert_eq!(s.editor_tab_size, TAB_SIZE_RANGE.1);
    }

    #[test]
    fn integer_only_values_are_rounded() {
        let s = Settings::from_map(
            serde_json::from_str(r#"{"editor.tabSize":2.7,"editor.padding.top":11.4}"#).unwrap(),
        );

        assert_eq!(s.editor_tab_size, 3.0);
        assert_eq!(s.editor_padding_top, 11.0);
    }

    #[test]
    fn rulers_are_clamped_and_capped() {
        let s = Settings::from_map(
            serde_json::from_str(r#"{"editor.rulers":[80,100.6,99999,1,2,3,4,5,6,7]}"#).unwrap(),
        );

        assert_eq!(
            s.editor_rulers,
            [80.0, 101.0, 500.0, 1.0, 2.0, 3.0, 4.0, 5.0]
        );
    }

    #[test]
    fn a_ruler_list_with_a_bad_element_falls_back_to_none() {
        let s =
            Settings::from_map(serde_json::from_str(r#"{"editor.rulers":[80,"ひゃく"]}"#).unwrap());

        assert!(s.editor_rulers.is_empty(), "部分的に拾わない");
    }

    #[test]
    fn a_null_in_the_patch_removes_the_key() {
        let settings = Settings::from_map(
            serde_json::from_str(r#"{"theme":"dark","editor.tabSize":8,"my.experiment":1}"#)
                .unwrap(),
        );

        let patched = settings.patched(Map::from_iter([
            (KEY_THEME.to_string(), Value::Null),
            (KEY_EDITOR_TAB_SIZE.to_string(), Value::Null),
            ("my.experiment".to_string(), Value::Null),
        ]));

        assert_eq!(patched.theme, Theme::System, "消したキーは既定値に戻る");
        assert_eq!(patched.editor_tab_size, DEFAULT_EDITOR_TAB_SIZE);
        assert!(patched.extra.is_empty());
    }
}
