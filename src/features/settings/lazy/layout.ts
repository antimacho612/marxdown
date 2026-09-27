/**
 * 設定 UI の並べ方（F-CONF-05 / ADR-0011）。
 *
 * キーの定義は持たない。`platform/settings-schema.ts` の `SETTINGS_SCHEMA` を参照するだけである。
 * 定義とグループ分けを同じ構造にまとめると「同じキーが 2 つのカテゴリに出ていないか」を検査する義務が生まれるが、それは定義の問題ではなく並べ方の問題なので分けてある。
 *
 * 部品の種類はスキーマの `kind` と型で結ばれている。
 * 真偽値の項目に `<select>` を割り当てたり、選択肢のラベルを 1 つ書き忘れたりすると型が通らない。
 * 網羅と重複は `layout.test.ts` が実行時に検証する（型で表現するとエラーの内容が読み取りにくくなる）。
 *
 * このファイルは遅延チャンク（`lazy/` の中）にあり、`ja` を引き込むためクリティカルパスからは参照しない。
 */
import { ja } from '@/i18n/ja';
import type { SettingKey, SettingKind, Settings } from '@/platform';

/** 選択肢のラベル表。キーはスキーマの `values` と過不足なく一致する必要がある。 */
type Labels<K extends SettingKey> = Readonly<Record<Settings[K] & string, string>>;

/**
 * キーに割り当てられる部品。スキーマの `kind` から決まる。
 *
 * 並び（`ruler[]` / `string[]`）は入力欄の文字列と値が 1:1 でないため `list` になる。
 * 打っている途中の文字列を保持するのは `ListField.svelte` で、値としての解釈はダイアログ側が持つ。
 *
 * 文字列だけ 2 択にしてある。
 * 配色（ADR-0014）は値としては文字列だが、選択肢は組み込みと `themes/` の合成であり、`values` を持たないため `select` では扱えない（`theme`）。
 */
type WidgetFor<K extends SettingKey> =
  SettingKind<K> extends 'enum'
    ? { widget: 'radio' | 'select'; labels: Labels<K> }
    : SettingKind<K> extends 'number'
      ? { widget: 'number'; step: number }
      : SettingKind<K> extends 'boolean'
        ? { widget: 'toggle' }
        : SettingKind<K> extends 'string'
          ? { widget: 'text'; placeholder?: string } | { widget: 'theme' }
          : { widget: 'list'; placeholder: string };

type FieldOf<K extends SettingKey> = {
  kind: 'field';
  key: K;
  label: string;
  description?: string;
  /** 表示する条件。通常は省略し、他の項目の値に依存するものだけが指定する。 */
  visibleWhen?: (values: Settings) => boolean;
} & WidgetFor<K>;

/** 設定 1 項目の並べ方。キーごとに割り当てられる部品が型で決まる。 */
export type FieldEntry = { [K in SettingKey]: FieldOf<K> }[SettingKey];

/** エディターの中の節。項目が多いため、見出し無しでは探せない。 */
interface SectionEntry {
  kind: 'section';
  label: string;
}

/**
 * 見本（ADR-0011）。モーダルにしたことで背後の本文が見えないため、その場で確認できるようにする。
 * 表示できるのはフォントまわりだけで、本文幅や折り返しは再現しない。
 */
interface SampleEntry {
  kind: 'sample';
  sample: 'content' | 'editor';
}

/** カテゴリの中に並ぶ要素。項目・節の見出し・見本の 3 種類がある。 */
export type Entry = FieldEntry | SectionEntry | SampleEntry;

/** 左に並べるカテゴリ 1 つ。 */
export interface Category {
  id: string;
  label: string;
  entries: readonly Entry[];
}

/** 左のカテゴリの ID。`LAYOUT` に書いた綴りがそのまま型になる。 */
export type CategoryId = (typeof LAYOUT)[number]['id'];

/**
 * 追加記法の項目（04.tech-stack/04-markdown.md §3）。
 *
 * 7 つとも同じ形（トグル 1 つ）なので、名前を書き下さずに文言の側から作る。
 * 書き下すと、キーと文言の組み合わせを取り違えても型では気づけない。
 *
 * ここで作る `key` は `markdown.<名前>` であり、`SettingKey` に無い名前があれば `LAYOUT` の `satisfies` が型エラーにする。
 * `markdown/plugins/syntax.ts` の `SYNTAX_NAMES` との一致は `features/settings/syntax.test.ts` が検証する。
 */
const SYNTAX_FIELDS = (Object.keys(ja.settings.markdown) as (keyof typeof ja.settings.markdown)[]).map((name) => ({
  kind: 'field' as const,
  key: `markdown.${name}` as const,
  widget: 'toggle' as const,
  label: ja.settings.markdown[name].label,
  description: ja.settings.markdown[name].description,
}));

/** 折り返し桁は、折り返しの設定が桁を見る 2 つの値のときだけ意味を持つ。 */
function wrapsByColumn(values: Settings): boolean {
  const wrap = values['editor.wordWrap'];
  return wrap === 'wordWrapColumn' || wrap === 'bounded';
}

/** 左のカテゴリ（ADR-0011）。並び順は使用頻度ではなく、設定が影響する範囲の大きさに従う。 */
export const LAYOUT = [
  {
    id: 'application',
    label: ja.settings.categories.application,
    entries: [
      {
        kind: 'field',
        key: 'theme',
        widget: 'radio',
        label: ja.settings.theme,
        description: ja.settings.themeHint,
        labels: { system: ja.settings.themeSystem, light: ja.settings.themeLight, dark: ja.settings.themeDark },
      },
      {
        kind: 'field',
        key: 'window.closeToTray',
        widget: 'toggle',
        label: ja.settings.window.closeToTray.label,
        description: ja.settings.window.closeToTray.description,
      },
      {
        kind: 'field',
        key: 'window.launchAtLogin',
        widget: 'toggle',
        label: ja.settings.window.launchAtLogin.label,
        description: ja.settings.window.launchAtLogin.description,
      },
    ],
  },
  {
    id: 'preview',
    label: ja.settings.categories.preview,
    entries: [
      {
        kind: 'field',
        key: 'preview.theme',
        widget: 'theme',
        label: ja.settings.palette,
        description: ja.settings.paletteHint,
      },
      {
        kind: 'field',
        key: 'preview.fontFamily',
        widget: 'text',
        label: ja.settings.fontFamily,
        description: ja.settings.fontFamilyHint,
        placeholder: ja.settings.fontFamilyPlaceholder,
      },
      {
        kind: 'field',
        key: 'preview.codeFontFamily',
        widget: 'text',
        label: ja.settings.codeFontFamily,
        description: ja.settings.fontFamilyHint,
        placeholder: ja.settings.fontFamilyPlaceholder,
      },
      {
        kind: 'field',
        key: 'preview.fontSize',
        widget: 'number',
        step: 1,
        label: ja.settings.fontSize.label,
        description: ja.settings.fontSize.description,
      },
      {
        kind: 'field',
        key: 'preview.lineHeight',
        widget: 'number',
        step: 0.05,
        label: ja.settings.lineHeight.label,
        description: ja.settings.lineHeight.description,
      },
      {
        kind: 'field',
        key: 'preview.maxWidth',
        widget: 'number',
        step: 1,
        label: ja.settings.maxWidth.label,
        description: ja.settings.maxWidth.description,
      },
      {
        kind: 'field',
        key: 'preview.softBreak',
        widget: 'toggle',
        label: ja.settings.softBreak.label,
        description: ja.settings.softBreak.description,
      },
      {
        kind: 'field',
        key: 'preview.tableStyle',
        widget: 'select',
        label: ja.settings.tableStyle.label,
        description: ja.settings.tableStyle.description,
        labels: ja.settings.tableStyle.options,
      },
      { kind: 'sample', sample: 'content' },
    ],
  },
  {
    id: 'editor',
    label: ja.settings.categories.editor,
    entries: [
      {
        kind: 'field',
        key: 'editor.theme',
        widget: 'theme',
        label: ja.settings.palette,
        description: ja.settings.paletteHint,
      },
      { kind: 'sample', sample: 'editor' },

      { kind: 'section', label: ja.settings.sections.font },
      {
        kind: 'field',
        key: 'editor.fontFamily',
        widget: 'text',
        label: ja.settings.editor.fontFamily,
        description: ja.settings.fontFamilyHint,
        placeholder: ja.settings.fontFamilyPlaceholder,
      },
      {
        kind: 'field',
        key: 'editor.fontSize',
        widget: 'number',
        step: 1,
        label: ja.settings.editor.fontSize.label,
        description: ja.settings.editor.fontSize.description,
      },
      {
        kind: 'field',
        key: 'editor.lineHeight',
        widget: 'number',
        step: 0.05,
        label: ja.settings.editor.lineHeight.label,
        description: ja.settings.editor.lineHeight.description,
      },
      {
        kind: 'field',
        key: 'editor.letterSpacing',
        widget: 'number',
        step: 0.1,
        label: ja.settings.editor.letterSpacing.label,
        description: ja.settings.editor.letterSpacing.description,
      },
      {
        kind: 'field',
        key: 'editor.fontLigatures',
        widget: 'toggle',
        label: ja.settings.editor.fontLigatures.label,
        description: ja.settings.editor.fontLigatures.description,
      },

      { kind: 'section', label: ja.settings.sections.display },
      {
        kind: 'field',
        key: 'editor.lineNumbers',
        widget: 'select',
        label: ja.settings.editor.lineNumbers,
        labels: ja.settings.editor.lineNumbersOptions,
      },
      {
        kind: 'field',
        key: 'editor.renderWhitespace',
        widget: 'select',
        label: ja.settings.editor.renderWhitespace,
        labels: ja.settings.editor.renderWhitespaceOptions,
      },
      {
        kind: 'field',
        key: 'editor.renderLineHighlight',
        widget: 'select',
        label: ja.settings.editor.renderLineHighlight,
        labels: ja.settings.editor.renderLineHighlightOptions,
      },
      {
        kind: 'field',
        key: 'editor.renderControlCharacters',
        widget: 'toggle',
        label: ja.settings.editor.renderControlCharacters.label,
        description: ja.settings.editor.renderControlCharacters.description,
      },
      {
        kind: 'field',
        key: 'editor.guides.indentation',
        widget: 'toggle',
        label: ja.settings.editor.guidesIndentation.label,
        description: ja.settings.editor.guidesIndentation.description,
      },
      {
        kind: 'field',
        key: 'editor.bracketPairColorization.enabled',
        widget: 'toggle',
        label: ja.settings.editor.bracketPairColorization.label,
        description: ja.settings.editor.bracketPairColorization.description,
      },
      {
        kind: 'field',
        key: 'editor.minimap.enabled',
        widget: 'toggle',
        label: ja.settings.editor.minimap.label,
        description: ja.settings.editor.minimap.description,
      },
      {
        kind: 'field',
        key: 'editor.stickyScroll.enabled',
        widget: 'toggle',
        label: ja.settings.editor.stickyScroll.label,
        description: ja.settings.editor.stickyScroll.description,
      },
      {
        kind: 'field',
        key: 'editor.rulers',
        widget: 'list',
        placeholder: ja.settings.editor.rulers.placeholder,
        label: ja.settings.editor.rulers.label,
        description: ja.settings.editor.rulers.description,
      },
      {
        kind: 'field',
        key: 'editor.padding.top',
        widget: 'number',
        step: 1,
        label: ja.settings.editor.paddingTop.label,
        description: ja.settings.editor.paddingTop.description,
      },

      { kind: 'section', label: ja.settings.sections.input },
      {
        kind: 'field',
        key: 'editor.wordWrap',
        widget: 'select',
        label: ja.settings.editor.wordWrap,
        labels: ja.settings.editor.wordWrapOptions,
      },
      {
        kind: 'field',
        key: 'editor.wordWrapColumn',
        widget: 'number',
        step: 1,
        label: ja.settings.editor.wordWrapColumn.label,
        description: ja.settings.editor.wordWrapColumn.description,
        visibleWhen: wrapsByColumn,
      },
      {
        kind: 'field',
        key: 'editor.tabSize',
        widget: 'number',
        step: 1,
        label: ja.settings.editor.tabSize.label,
        description: ja.settings.editor.tabSize.description,
      },
      {
        kind: 'field',
        key: 'editor.insertSpaces',
        widget: 'toggle',
        label: ja.settings.editor.insertSpaces.label,
        description: ja.settings.editor.insertSpaces.description,
      },
      {
        kind: 'field',
        key: 'editor.wordSeparators',
        widget: 'text',
        label: ja.settings.editor.wordSeparators.label,
        description: ja.settings.editor.wordSeparators.description,
      },
      {
        kind: 'field',
        key: 'editor.wordSegmenterLocales',
        widget: 'list',
        placeholder: ja.settings.editor.wordSegmenterLocales.placeholder,
        label: ja.settings.editor.wordSegmenterLocales.label,
        description: ja.settings.editor.wordSegmenterLocales.description,
      },
      {
        kind: 'field',
        key: 'editor.cursorStyle',
        widget: 'select',
        label: ja.settings.editor.cursorStyle,
        labels: ja.settings.editor.cursorStyleOptions,
      },
      {
        kind: 'field',
        key: 'editor.cursorBlinking',
        widget: 'select',
        label: ja.settings.editor.cursorBlinking,
        labels: ja.settings.editor.cursorBlinkingOptions,
      },
      {
        kind: 'field',
        key: 'editor.cursorSurroundingLines',
        widget: 'number',
        step: 1,
        label: ja.settings.editor.cursorSurroundingLines.label,
        description: ja.settings.editor.cursorSurroundingLines.description,
      },
      {
        kind: 'field',
        key: 'editor.scrollBeyondLastLine',
        widget: 'toggle',
        label: ja.settings.editor.scrollBeyondLastLine.label,
        description: ja.settings.editor.scrollBeyondLastLine.description,
      },
    ],
  },
  {
    /*
     * 追加記法（04.tech-stack/04-markdown.md §3）。どれも既定 OFF である。
     *
     * カテゴリを分けているのは、プレビューの中に混ぜると「見た目の調整」と「本文の解釈が変わる設定」が同じ並びに来るためである。
     * 後者は押した結果が本文そのものに出る。
     */
    id: 'markdown',
    label: ja.settings.categories.markdown,
    // 節の見出しは置かない。カテゴリ自体が「記法」であり、7 項目に見出しを足しても分かれ目が増えるだけである。
    entries: [
      ...SYNTAX_FIELDS,
      {
        kind: 'field',
        key: 'marp.themes',
        widget: 'list',
        placeholder: ja.settings.marp.themes.placeholder,
        label: ja.settings.marp.themes.label,
        description: ja.settings.marp.themes.description,
      },
    ],
  },
  {
    id: 'explorer',
    label: ja.settings.categories.explorer,
    entries: [
      {
        kind: 'field',
        key: 'explorer.exclude',
        widget: 'list',
        placeholder: ja.settings.explorer.exclude.placeholder,
        label: ja.settings.explorer.exclude.label,
        description: ja.settings.explorer.exclude.description,
      },
    ],
  },
  {
    id: 'outline',
    label: ja.settings.categories.outline,
    entries: [
      {
        kind: 'field',
        key: 'outline.maxDepth',
        widget: 'number',
        step: 1,
        label: ja.settings.outline.maxDepth.label,
        description: ja.settings.outline.maxDepth.description,
      },
    ],
  },
] as const satisfies readonly Category[];
