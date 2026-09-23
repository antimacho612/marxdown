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

/// 配色を選んでいない状態。属性を付けず `tokens.css` のトークンをそのまま使う（F-CONF-02）。
pub const DEFAULT_THEME_ID: &str = "default";

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
pub const KEY_EDITOR_WORD_SEPARATORS: &str = "editor.wordSeparators";
pub const KEY_EDITOR_WORD_WRAP: &str = "editor.wordWrap";
pub const KEY_EDITOR_WORD_WRAP_COLUMN: &str = "editor.wordWrapColumn";

/// エクスプローラーから常に除外するパスの glob（`src/glob.rs` / #146）。
pub const KEY_EXPLORER_EXCLUDE: &str = "explorer.exclude";

/// 追加記法（`src/markdown/plugins/syntax.ts` の `SYNTAX_NAMES` と 1:1）。どれも既定 OFF。
pub const KEY_MARKDOWN_ABBREVIATIONS: &str = "markdown.abbreviations";
pub const KEY_MARKDOWN_DEFINITION_LISTS: &str = "markdown.definitionLists";
pub const KEY_MARKDOWN_INSERTIONS: &str = "markdown.insertions";
pub const KEY_MARKDOWN_MARKS: &str = "markdown.marks";
pub const KEY_MARKDOWN_MULTILINE_TABLES: &str = "markdown.multilineTables";
pub const KEY_MARKDOWN_SUBSCRIPT: &str = "markdown.subscript";
pub const KEY_MARKDOWN_SUPERSCRIPT: &str = "markdown.superscript";

pub const KEY_OUTLINE_MAX_DEPTH: &str = "outline.maxDepth";

pub const KEY_PREVIEW_CODE_FONT_FAMILY: &str = "preview.codeFontFamily";
pub const KEY_PREVIEW_FONT_FAMILY: &str = "preview.fontFamily";
pub const KEY_PREVIEW_FONT_SIZE: &str = "preview.fontSize";
pub const KEY_PREVIEW_LINE_HEIGHT: &str = "preview.lineHeight";
pub const KEY_PREVIEW_MAX_WIDTH: &str = "preview.maxWidth";
pub const KEY_PREVIEW_SOFT_BREAK: &str = "preview.softBreak";
pub const KEY_PREVIEW_TABLE_STYLE: &str = "preview.tableStyle";
pub const KEY_PREVIEW_THEME: &str = "preview.theme";

pub const KEY_WINDOW_CLOSE_TO_TRAY: &str = "window.closeToTray";

/// プレビューの既定。`src/styles/tokens.css` と揃える。
pub const DEFAULT_FONT_SIZE: f64 = 16.0;
pub const DEFAULT_LINE_HEIGHT: f64 = 1.75;
pub const DEFAULT_MAX_WIDTH: f64 = 72.0;

/// エディターの既定（ADR-0012）。プレビューとは別の値を使う。
///
/// 16px / 1.75 は読むためのタイポグラフィであり、書く面では行間が広すぎて視線の移動量が増える。
/// VS Code の既定（14px）に寄せ、行間だけ日本語のために少し広げている。
pub const DEFAULT_EDITOR_FONT_SIZE: f64 = 14.0;
pub const DEFAULT_EDITOR_LINE_HEIGHT: f64 = 1.6;
/// 1 行目がウィンドウの縁に貼り付かないだけの余白。
pub const DEFAULT_EDITOR_PADDING_TOP: f64 = 12.0;
pub const DEFAULT_EDITOR_TAB_SIZE: f64 = 2.0;
/// VS Code の `editor.wordSeparators` の既定値と同じ（Monaco も同じ値を使う）。
pub const DEFAULT_EDITOR_WORD_SEPARATORS: &str = r#"`~!@#$%^&*()-=+[{]}\|;:'",.<>/?"#;
pub const DEFAULT_EDITOR_WORD_WRAP_COLUMN: f64 = 80.0;

/// アウトラインの既定。6（`h6`）は見出しの最大階層であり、実質「制限なし」を意味する。
pub const DEFAULT_OUTLINE_MAX_DEPTH: f64 = 6.0;

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
/// 見出しの階層（`h1`〜`h6`）に対応する範囲。
const OUTLINE_MAX_DEPTH_RANGE: (f64, f64) = (1.0, 6.0);

/// 縦罫線の本数の上限。
/// 上限を置かないと、手で書いた `[1,2,3,...]` がそのまま描画コストになる。
const RULERS_MAX: usize = 8;

/// 除外パターンの本数の上限。
/// 1 エントリごとに全パターンを試すため、本数がそのまま一覧の走査コストになる。
/// `src/glob.rs` の `MAX_PATTERNS` と揃える。
const EXCLUDE_MAX: usize = 64;

/// 明暗の指定（F-CONF-01）。配色そのものは `preview.theme` / `editor.theme` が持つ。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// OS のライト / ダーク設定に追従する（F-CONF-01）。
    #[default]
    System,
    Light,
    Dark,
}

/// 表の罫線の引き方（F-VIEW-01）。
/// 既定の `Lines` は横罫線だけを引く。全セルを囲むと、数行の表でも格子が本文の中で最も強い図形になる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TableStyle {
    #[default]
    Lines,
    Grid,
    Zebra,
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
    /// エディターの配色（[ADR-0014](../../docs/adr/0014-editor-theme-catalog.md)）。
    ///
    /// 列挙ではなく文字列である。
    /// 選択肢は組み込みの 50 枚と `themes/` に置かれたファイルの合成であり、Rust 側で数え上げられない。
    /// 知らない綴りを既定へ落とさないのもそのためで、`themes/` の読み込みが済むまでは選択中の配色が存在するかどうかを判定できない。
    #[serde(rename = "editor.theme")]
    pub editor_theme: String,
    #[serde(rename = "editor.tabSize")]
    pub editor_tab_size: f64,
    /// 単語単位のカーソル移動（`Ctrl+←` / `Ctrl+→`）で区切りとして扱う文字（#126）。
    #[serde(rename = "editor.wordSeparators")]
    pub editor_word_separators: String,
    #[serde(rename = "editor.wordWrap")]
    pub editor_word_wrap: WordWrap,
    #[serde(rename = "editor.wordWrapColumn")]
    pub editor_word_wrap_column: f64,

    /// エクスプローラーとクイックオープンから常に除外するパスの glob（#146）。
    /// 空なら追加の除外はしない。隠しファイルと `node_modules` は設定に関わらず除外される（`dir.rs`）。
    #[serde(rename = "explorer.exclude")]
    pub explorer_exclude: Vec<String>,

    /// 設定で有効化する追加記法（04.tech-stack/04-markdown.md §3）。
    /// **どれも既定 OFF である。** 標準的でない記法が意図せず発火して本文が壊れるほうが、認知負荷が高い。
    #[serde(rename = "markdown.abbreviations")]
    pub markdown_abbreviations: bool,
    #[serde(rename = "markdown.definitionLists")]
    pub markdown_definition_lists: bool,
    #[serde(rename = "markdown.insertions")]
    pub markdown_insertions: bool,
    #[serde(rename = "markdown.marks")]
    pub markdown_marks: bool,
    #[serde(rename = "markdown.multilineTables")]
    pub markdown_multiline_tables: bool,
    #[serde(rename = "markdown.subscript")]
    pub markdown_subscript: bool,
    #[serde(rename = "markdown.superscript")]
    pub markdown_superscript: bool,

    /// アウトラインに表示する見出しの最大階層（`h1`〜`h6`）。それより深い見出しは一覧から外れる。
    #[serde(rename = "outline.maxDepth")]
    pub outline_max_depth: f64,

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
    /// 段落内の単独の改行を `<br>` として描画するか（`markdown-it` の `breaks` / #45）。
    #[serde(rename = "preview.softBreak")]
    pub preview_soft_break: bool,
    /// 表の罫線の引き方（F-VIEW-01）。
    #[serde(rename = "preview.tableStyle")]
    pub preview_table_style: TableStyle,
    /// 本文の配色（[ADR-0014](../../docs/adr/0014-editor-theme-catalog.md)）。
    ///
    /// `editor.theme` と同じくカタログを共有する文字列である。
    /// 選択肢は組み込みの 50 枚と `themes/` に置かれたファイルの合成であり、Rust 側で数え上げられない。
    /// 知らない綴りを既定へ落とさないのもそのためで、`themes/` の読み込みが済むまでは選択中の配色が存在するかどうかを判定できない。
    #[serde(rename = "preview.theme")]
    pub preview_theme: String,

    /// `✕` で閉じたときにトレイへ格納するか（F-WIN-* / ADR-0007）。
    /// 既定を `true` にしているのは、常駐してウォーム起動を利用することがプロダクトの中心価値だからである（ADR-0004）。
    #[serde(rename = "window.closeToTray")]
    pub window_close_to_tray: bool,

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
            editor_theme: DEFAULT_THEME_ID.to_owned(),
            editor_tab_size: DEFAULT_EDITOR_TAB_SIZE,
            editor_word_separators: DEFAULT_EDITOR_WORD_SEPARATORS.to_owned(),
            editor_word_wrap: WordWrap::default(),
            editor_word_wrap_column: DEFAULT_EDITOR_WORD_WRAP_COLUMN,

            // 既定では追加の除外をしない。
            // 隠しファイルと `node_modules` は設定に関わらず落ちるため（`dir.rs`）、ここに書き出すと同じ判断が 2 か所に分かれる。
            explorer_exclude: Vec::new(),

            markdown_abbreviations: false,
            markdown_definition_lists: false,
            markdown_insertions: false,
            markdown_marks: false,
            markdown_multiline_tables: false,
            markdown_subscript: false,
            markdown_superscript: false,

            outline_max_depth: DEFAULT_OUTLINE_MAX_DEPTH,

            // 具体的なフォント名を既定に書くと、そのフォントが存在しない環境で `tokens.css` の混植スタックがすべて無効になる（F-CONF-04）。
            preview_code_font_family: String::new(),
            preview_font_family: String::new(),
            preview_font_size: DEFAULT_FONT_SIZE,
            preview_line_height: DEFAULT_LINE_HEIGHT,
            preview_max_width: DEFAULT_MAX_WIDTH,
            // CommonMark 準拠。改行を <br> にしない（#45）。
            preview_soft_break: false,
            preview_table_style: TableStyle::default(),
            preview_theme: DEFAULT_THEME_ID.to_owned(),

            window_close_to_tray: true,

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
            editor_theme: take_theme_id(&mut map, KEY_EDITOR_THEME).unwrap_or(d.editor_theme),
            editor_tab_size: take_int(&mut map, KEY_EDITOR_TAB_SIZE, TAB_SIZE_RANGE)
                .unwrap_or(d.editor_tab_size),
            editor_word_separators: take(&mut map, KEY_EDITOR_WORD_SEPARATORS)
                .unwrap_or(d.editor_word_separators),
            editor_word_wrap: take(&mut map, KEY_EDITOR_WORD_WRAP).unwrap_or(d.editor_word_wrap),
            editor_word_wrap_column: take_int(
                &mut map,
                KEY_EDITOR_WORD_WRAP_COLUMN,
                WORD_WRAP_COLUMN_RANGE,
            )
            .unwrap_or(d.editor_word_wrap_column),

            explorer_exclude: take_exclude(&mut map).unwrap_or(d.explorer_exclude),

            markdown_abbreviations: take(&mut map, KEY_MARKDOWN_ABBREVIATIONS)
                .unwrap_or(d.markdown_abbreviations),
            markdown_definition_lists: take(&mut map, KEY_MARKDOWN_DEFINITION_LISTS)
                .unwrap_or(d.markdown_definition_lists),
            markdown_insertions: take(&mut map, KEY_MARKDOWN_INSERTIONS)
                .unwrap_or(d.markdown_insertions),
            markdown_marks: take(&mut map, KEY_MARKDOWN_MARKS).unwrap_or(d.markdown_marks),
            markdown_multiline_tables: take(&mut map, KEY_MARKDOWN_MULTILINE_TABLES)
                .unwrap_or(d.markdown_multiline_tables),
            markdown_subscript: take(&mut map, KEY_MARKDOWN_SUBSCRIPT)
                .unwrap_or(d.markdown_subscript),
            markdown_superscript: take(&mut map, KEY_MARKDOWN_SUPERSCRIPT)
                .unwrap_or(d.markdown_superscript),

            outline_max_depth: take_int(&mut map, KEY_OUTLINE_MAX_DEPTH, OUTLINE_MAX_DEPTH_RANGE)
                .unwrap_or(d.outline_max_depth),

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
            preview_soft_break: take(&mut map, KEY_PREVIEW_SOFT_BREAK)
                .unwrap_or(d.preview_soft_break),
            preview_table_style: take(&mut map, KEY_PREVIEW_TABLE_STYLE)
                .unwrap_or(d.preview_table_style),
            preview_theme: take_theme_id(&mut map, KEY_PREVIEW_THEME).unwrap_or(d.preview_theme),

            window_close_to_tray: take(&mut map, KEY_WINDOW_CLOSE_TO_TRAY)
                .unwrap_or(d.window_close_to_tray),

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

/// 配色の id（`preview.theme` / `editor.theme`）。
///
/// 綴りが選択肢に存在するかは調べない。
/// 組み込みの一覧はフロント側にあり、`themes/` の中身は読み込むまで分からない（[ADR-0014](../../docs/adr/0014-editor-theme-catalog.md)）。
/// ここで弾くのは、属性セレクタへ埋め込めない文字を含むものだけである（`themes::valid_id` と同じ判定）。
///
/// 存在しない配色を選んだ状態は保持したまま UI へ渡す。
/// 既定へ落とすと、ファイル名の打ち間違いと未適用をユーザーが区別できない。
fn take_theme_id(map: &mut Map<String, Value>, key: &str) -> Option<String> {
    let value: String = take(map, key)?;
    let ok = !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then_some(value)
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

/// 除外パターン。空文字と空白だけのものを落とし、本数を上限で切る。
///
/// 型が違う要素が 1 つでもあれば、配列ごと既定（除外しない）に戻す（`take_rulers` と同じ判断）。
/// 綴りが glob として読めるかはここでは調べない。
/// 判定は `crate::glob` にあり、読めなかった 1 本だけがそこで落ちる。
fn take_exclude(map: &mut Map<String, Value>) -> Option<Vec<String>> {
    let values: Vec<String> = take(map, KEY_EXPLORER_EXCLUDE)?;
    Some(
        values
            .into_iter()
            .filter(|v| !v.trim().is_empty())
            .take(EXCLUDE_MAX)
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
        assert!(s.window_close_to_tray, "常駐が既定（ADR-0004）");
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

    /// ADR-0014。**面ごとに独立して選べること**と、既定が「属性なし」であること。
    /// カタログは共通だが、選択は面ごとに別の値である。
    #[test]
    fn the_two_surfaces_pick_palettes_independently() {
        let d = Settings::default();
        assert_eq!(d.preview_theme, DEFAULT_THEME_ID);
        assert_eq!(d.editor_theme, DEFAULT_THEME_ID);

        let s = Settings::from_map(
            serde_json::from_str(r#"{"preview.theme":"solarized","editor.theme":"dracula"}"#)
                .unwrap(),
        );
        assert_eq!(s.preview_theme, "solarized");
        assert_eq!(s.editor_theme, "dracula");
    }

    /// **知らない綴りも保持する**（ADR-0014）。両面とも同じ扱いである。
    /// 組み込みの一覧はフロント側にあり、`themes/` の中身は読み込むまで分からないため、ここで存在を判定できない。
    #[test]
    fn an_unknown_theme_is_kept() {
        let s = Settings::from_map(
            serde_json::from_str(r#"{"preview.theme":"my-own-theme","editor.theme":"another"}"#)
                .unwrap(),
        );
        assert_eq!(s.preview_theme, "my-own-theme");
        assert_eq!(s.to_map()[KEY_PREVIEW_THEME], Value::from("my-own-theme"));
        assert_eq!(s.editor_theme, "another");
        assert_eq!(s.to_map()[KEY_EDITOR_THEME], Value::from("another"));
    }

    /// 属性セレクタへ埋め込めない綴りだけは既定へ落とす（`themes::valid_id` と同じ判定）。
    /// **ファイル全体は壊さない。**
    #[test]
    fn a_theme_that_could_escape_the_selector_falls_back() {
        for bad in ["dark';}html{display:none}", "", "a b", "../../etc"] {
            for key in [KEY_PREVIEW_THEME, KEY_EDITOR_THEME] {
                let mut map = Map::new();
                map.insert(key.to_owned(), Value::from(bad));
                map.insert(KEY_THEME.to_owned(), Value::from("dark"));

                let s = Settings::from_map(map);
                assert_eq!(s.preview_theme, DEFAULT_THEME_ID, "{key} {bad}");
                assert_eq!(s.editor_theme, DEFAULT_THEME_ID, "{key} {bad}");
                assert_eq!(s.theme, Theme::Dark, "{key} {bad}");
            }
        }
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
    fn exclude_patterns_drop_the_blank_ones_and_are_capped() {
        let mut list: Vec<String> = (0..EXCLUDE_MAX + 4).map(|i| format!("d{i}")).collect();
        list.insert(0, "  ".into());
        let json = serde_json::json!({ KEY_EXPLORER_EXCLUDE: list });

        let s = Settings::from_map(json.as_object().unwrap().clone());

        assert_eq!(s.explorer_exclude.len(), EXCLUDE_MAX);
        assert_eq!(s.explorer_exclude[0], "d0", "空白だけの行は落ちる");
    }

    #[test]
    fn an_exclude_list_with_a_bad_element_falls_back_to_none() {
        let s =
            Settings::from_map(serde_json::from_str(r#"{"explorer.exclude":["dist",3]}"#).unwrap());

        assert!(s.explorer_exclude.is_empty(), "部分的に拾わない");
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
