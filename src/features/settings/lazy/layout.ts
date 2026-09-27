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
 * このファイルは遅延チャンク（`lazy/` の中）にあるため、クリティカルパスからは参照しない。
 */
import { tSettings } from '@/i18n/settings';
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

/** 左のカテゴリの ID。`buildLayout` に書いた綴りがそのまま型になる。 */
export type CategoryId = ReturnType<typeof buildLayout>[number]['id'];

/**
 * 追加記法の項目。
 *
 * 7 つとも同じ形（トグル 1 つ）なので、名前を書き下さずに文言の側から作る。
 * 書き下すと、キーと文言の組み合わせを取り違えても型では気づけない。
 *
 * ここで作る `key` は `markdown.<名前>` であり、`SettingKey` に無い名前があれば `buildLayout` の `satisfies` が型エラーにする。
 * `markdown/plugins/syntax.ts` の `SYNTAX_NAMES` との一致は `features/settings/syntax.test.ts` が検証する。
 */
function syntaxFields() {
  return (Object.keys(tSettings.markdown) as (keyof typeof tSettings.markdown)[]).map((name) => ({
    kind: 'field' as const,
    key: `markdown.${name}` as const,
    widget: 'toggle' as const,
    label: tSettings.markdown[name].label,
    description: tSettings.markdown[name].description,
  }));
}

/** 折り返し桁は、折り返しの設定が桁を見る 2 つの値のときだけ意味を持つ。 */
function wrapsByColumn(values: Settings): boolean {
  const wrap = values['editor.wordWrap'];
  return wrap === 'wordWrapColumn' || wrap === 'bounded';
}

/**
 * 左のカテゴリ（ADR-0011）。並び順は使用頻度ではなく、設定が影響する範囲の大きさに従う。
 *
 * NOTE: 定数ではなく関数にしてあるのは、モジュールの評価時点では文言（`tSettings`）がまだ空であるためである（ADR-0026）。
 */
export function buildLayout() {
  return [
    {
      id: 'application',
      label: tSettings.categories.application,
      entries: [
        {
          kind: 'field',
          key: 'theme',
          widget: 'radio',
          label: tSettings.theme,
          description: tSettings.themeHint,
          labels: { system: tSettings.themeSystem, light: tSettings.themeLight, dark: tSettings.themeDark },
        },
        {
          kind: 'field',
          key: 'ui.language',
          widget: 'select',
          label: tSettings.language.label,
          description: tSettings.language.description,
          labels: tSettings.language.options,
        },
        {
          kind: 'field',
          key: 'window.closeToTray',
          widget: 'toggle',
          label: tSettings.window.closeToTray.label,
          description: tSettings.window.closeToTray.description,
        },
        {
          kind: 'field',
          key: 'window.launchAtLogin',
          widget: 'toggle',
          label: tSettings.window.launchAtLogin.label,
          description: tSettings.window.launchAtLogin.description,
        },
        {
          kind: 'field',
          key: 'update.autoCheck',
          widget: 'toggle',
          label: tSettings.update.autoCheck.label,
          description: tSettings.update.autoCheck.description,
        },
      ],
    },
    {
      id: 'preview',
      label: tSettings.categories.preview,
      entries: [
        {
          kind: 'field',
          key: 'preview.theme',
          widget: 'theme',
          label: tSettings.palette,
          description: tSettings.paletteHint,
        },
        {
          kind: 'field',
          key: 'preview.fontFamily',
          widget: 'text',
          label: tSettings.fontFamily,
          description: tSettings.fontFamilyHint,
          placeholder: tSettings.fontFamilyPlaceholder,
        },
        {
          kind: 'field',
          key: 'preview.codeFontFamily',
          widget: 'text',
          label: tSettings.codeFontFamily,
          description: tSettings.fontFamilyHint,
          placeholder: tSettings.fontFamilyPlaceholder,
        },
        {
          kind: 'field',
          key: 'preview.fontSize',
          widget: 'number',
          step: 1,
          label: tSettings.fontSize.label,
          description: tSettings.fontSize.description,
        },
        {
          kind: 'field',
          key: 'preview.lineHeight',
          widget: 'number',
          step: 0.05,
          label: tSettings.lineHeight.label,
          description: tSettings.lineHeight.description,
        },
        {
          kind: 'field',
          key: 'preview.maxWidth',
          widget: 'number',
          step: 1,
          label: tSettings.maxWidth.label,
          description: tSettings.maxWidth.description,
        },
        {
          kind: 'field',
          key: 'preview.softBreak',
          widget: 'toggle',
          label: tSettings.softBreak.label,
          description: tSettings.softBreak.description,
        },
        {
          kind: 'field',
          key: 'preview.tableStyle',
          widget: 'select',
          label: tSettings.tableStyle.label,
          description: tSettings.tableStyle.description,
          labels: tSettings.tableStyle.options,
        },
        { kind: 'sample', sample: 'content' },
      ],
    },
    {
      id: 'editor',
      label: tSettings.categories.editor,
      entries: [
        {
          kind: 'field',
          key: 'editor.theme',
          widget: 'theme',
          label: tSettings.palette,
          description: tSettings.paletteHint,
        },
        { kind: 'sample', sample: 'editor' },

        { kind: 'section', label: tSettings.sections.font },
        {
          kind: 'field',
          key: 'editor.fontFamily',
          widget: 'text',
          label: tSettings.editor.fontFamily,
          description: tSettings.fontFamilyHint,
          placeholder: tSettings.fontFamilyPlaceholder,
        },
        {
          kind: 'field',
          key: 'editor.fontSize',
          widget: 'number',
          step: 1,
          label: tSettings.editor.fontSize.label,
          description: tSettings.editor.fontSize.description,
        },
        {
          kind: 'field',
          key: 'editor.lineHeight',
          widget: 'number',
          step: 0.05,
          label: tSettings.editor.lineHeight.label,
          description: tSettings.editor.lineHeight.description,
        },
        {
          kind: 'field',
          key: 'editor.letterSpacing',
          widget: 'number',
          step: 0.1,
          label: tSettings.editor.letterSpacing.label,
          description: tSettings.editor.letterSpacing.description,
        },
        {
          kind: 'field',
          key: 'editor.fontLigatures',
          widget: 'toggle',
          label: tSettings.editor.fontLigatures.label,
          description: tSettings.editor.fontLigatures.description,
        },

        { kind: 'section', label: tSettings.sections.display },
        {
          kind: 'field',
          key: 'editor.lineNumbers',
          widget: 'select',
          label: tSettings.editor.lineNumbers,
          labels: tSettings.editor.lineNumbersOptions,
        },
        {
          kind: 'field',
          key: 'editor.renderWhitespace',
          widget: 'select',
          label: tSettings.editor.renderWhitespace,
          labels: tSettings.editor.renderWhitespaceOptions,
        },
        {
          kind: 'field',
          key: 'editor.renderLineHighlight',
          widget: 'select',
          label: tSettings.editor.renderLineHighlight,
          labels: tSettings.editor.renderLineHighlightOptions,
        },
        {
          kind: 'field',
          key: 'editor.renderControlCharacters',
          widget: 'toggle',
          label: tSettings.editor.renderControlCharacters.label,
          description: tSettings.editor.renderControlCharacters.description,
        },
        {
          kind: 'field',
          key: 'editor.guides.indentation',
          widget: 'toggle',
          label: tSettings.editor.guidesIndentation.label,
          description: tSettings.editor.guidesIndentation.description,
        },
        {
          kind: 'field',
          key: 'editor.bracketPairColorization.enabled',
          widget: 'toggle',
          label: tSettings.editor.bracketPairColorization.label,
          description: tSettings.editor.bracketPairColorization.description,
        },
        {
          kind: 'field',
          key: 'editor.minimap.enabled',
          widget: 'toggle',
          label: tSettings.editor.minimap.label,
          description: tSettings.editor.minimap.description,
        },
        {
          kind: 'field',
          key: 'editor.stickyScroll.enabled',
          widget: 'toggle',
          label: tSettings.editor.stickyScroll.label,
          description: tSettings.editor.stickyScroll.description,
        },
        {
          kind: 'field',
          key: 'editor.rulers',
          widget: 'list',
          placeholder: tSettings.editor.rulers.placeholder,
          label: tSettings.editor.rulers.label,
          description: tSettings.editor.rulers.description,
        },
        {
          kind: 'field',
          key: 'editor.padding.top',
          widget: 'number',
          step: 1,
          label: tSettings.editor.paddingTop.label,
          description: tSettings.editor.paddingTop.description,
        },

        { kind: 'section', label: tSettings.sections.input },
        {
          kind: 'field',
          key: 'editor.wordWrap',
          widget: 'select',
          label: tSettings.editor.wordWrap,
          labels: tSettings.editor.wordWrapOptions,
        },
        {
          kind: 'field',
          key: 'editor.wordWrapColumn',
          widget: 'number',
          step: 1,
          label: tSettings.editor.wordWrapColumn.label,
          description: tSettings.editor.wordWrapColumn.description,
          visibleWhen: wrapsByColumn,
        },
        {
          kind: 'field',
          key: 'editor.tabSize',
          widget: 'number',
          step: 1,
          label: tSettings.editor.tabSize.label,
          description: tSettings.editor.tabSize.description,
        },
        {
          kind: 'field',
          key: 'editor.insertSpaces',
          widget: 'toggle',
          label: tSettings.editor.insertSpaces.label,
          description: tSettings.editor.insertSpaces.description,
        },
        {
          kind: 'field',
          key: 'editor.wordSeparators',
          widget: 'text',
          label: tSettings.editor.wordSeparators.label,
          description: tSettings.editor.wordSeparators.description,
        },
        {
          kind: 'field',
          key: 'editor.wordSegmenterLocales',
          widget: 'list',
          placeholder: tSettings.editor.wordSegmenterLocales.placeholder,
          label: tSettings.editor.wordSegmenterLocales.label,
          description: tSettings.editor.wordSegmenterLocales.description,
        },
        {
          kind: 'field',
          key: 'editor.cursorStyle',
          widget: 'select',
          label: tSettings.editor.cursorStyle,
          labels: tSettings.editor.cursorStyleOptions,
        },
        {
          kind: 'field',
          key: 'editor.cursorBlinking',
          widget: 'select',
          label: tSettings.editor.cursorBlinking,
          labels: tSettings.editor.cursorBlinkingOptions,
        },
        {
          kind: 'field',
          key: 'editor.cursorSurroundingLines',
          widget: 'number',
          step: 1,
          label: tSettings.editor.cursorSurroundingLines.label,
          description: tSettings.editor.cursorSurroundingLines.description,
        },
        {
          kind: 'field',
          key: 'editor.scrollBeyondLastLine',
          widget: 'toggle',
          label: tSettings.editor.scrollBeyondLastLine.label,
          description: tSettings.editor.scrollBeyondLastLine.description,
        },
      ],
    },
    {
      /*
       * 追加記法。どれも既定 OFF である。
       *
       * カテゴリを分けているのは、プレビューの中に混ぜると「見た目の調整」と「本文の解釈が変わる設定」が同じ並びに来るためである。
       * 後者は押した結果が本文そのものに出る。
       */
      id: 'markdown',
      label: tSettings.categories.markdown,
      // 節の見出しは置かない。カテゴリ自体が「記法」であり、7 項目に見出しを足しても分かれ目が増えるだけである。
      entries: [
        ...syntaxFields(),
        {
          kind: 'field',
          key: 'marp.themes',
          widget: 'list',
          placeholder: tSettings.marp.themes.placeholder,
          label: tSettings.marp.themes.label,
          description: tSettings.marp.themes.description,
        },
      ],
    },
    {
      id: 'explorer',
      label: tSettings.categories.explorer,
      entries: [
        {
          kind: 'field',
          key: 'explorer.exclude',
          widget: 'list',
          placeholder: tSettings.explorer.exclude.placeholder,
          label: tSettings.explorer.exclude.label,
          description: tSettings.explorer.exclude.description,
        },
        {
          kind: 'field',
          key: 'explorer.temporaryTab',
          widget: 'toggle',
          label: tSettings.explorer.temporaryTab.label,
          description: tSettings.explorer.temporaryTab.description,
        },
      ],
    },
    {
      id: 'outline',
      label: tSettings.categories.outline,
      entries: [
        {
          kind: 'field',
          key: 'outline.maxDepth',
          widget: 'number',
          step: 1,
          label: tSettings.outline.maxDepth.label,
          description: tSettings.outline.maxDepth.description,
        },
      ],
    },
  ] as const satisfies readonly Category[];
}
