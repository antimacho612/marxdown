/**
 * ユーザー設定のスキーマ（02.architecture/04-rust-responsibilities.md §5 / F-CONF-03）。
 *
 * `src-tauri/src/settings/schema.rs` と 1:1 で対応する唯一の対応表であり、Rust 側を変えたらここも必ず変える。
 * キー・既定値・列挙の綴り・数値の許容範囲がここ 1 か所に集まっているため、`Settings` 型と `DEFAULT_SETTINGS` と範囲の表は全部ここから導出される。
 * 以前は 3 つが別々に書かれていて、キーを足すときに片方だけ直すと型は通るのに既定値が欠ける状態になっていた。
 *
 * ここに置くのは Rust 側と対応が取れるものだけである。
 * 部品の種類（ラジオか `<select>` か）・入力欄の刻み幅・ラベル・カテゴリは UI の都合なので `features/settings/lazy/layout.ts` に置く。
 *
 * キーはフラットなドット区切りで、ネストしたオブジェクトにしない（F-CONF-06）。
 * `editor.guides.indentation` のように 3 階層に見えるキーも、JSON の上では 1 本の文字列キーである。
 */

/** 選択肢を持つ項目。綴りは VS Code と Rust 側の serde に合わせる。 */
interface EnumEntry {
  kind: 'enum';
  values: readonly string[];
  default: string;
}

/**
 * 数値の項目。`min` / `max` は `src-tauri/src/settings/schema.rs` の `*_RANGE` と揃える。
 *
 * Rust 側は読んだ時点で潰しているので、こちらが効くのは設定 UI から直接入力された値に対してだけである。
 */
interface NumberEntry {
  kind: 'number';
  default: number;
  min: number;
  max: number;
}

interface BooleanEntry {
  kind: 'boolean';
  default: boolean;
}

interface StringEntry {
  kind: 'string';
  default: string;
}

/** 数値の並び。`min` / `max` は要素 1 つあたりの範囲で、`maxLength` は本数の上限。 */
interface NumberListEntry {
  kind: 'number[]';
  default: readonly number[];
  min: number;
  max: number;
  maxLength: number;
}

/** スキーマ 1 項目。種別ごとに持つ情報が違うため判別可能なユニオンにしてある。 */
export type SettingSchemaEntry = EnumEntry | NumberEntry | BooleanEntry | StringEntry | NumberListEntry;

/**
 * 既定値が選択肢の中にあることを型で縛る。
 *
 * 外れているときに `never` ではなく選択肢そのものを返すのは、エラーが「`'foo'` は `'a' | 'b'` に代入できない」の形で該当キーの位置に出るため。
 * `never` を返すとオブジェクト全体が赤くなり、どのキーが悪いのか分からなくなる。
 */
type ValidateEntry<E> = E extends { kind: 'enum'; values: readonly string[]; default: infer D }
  ? D extends E['values'][number]
    ? E
    : { default: E['values'][number] }
  : E;

type ValidateSchema<T> = { [K in keyof T]: ValidateEntry<T[K]> };

function defineSettingsSchema<const T extends Record<string, SettingSchemaEntry>>(schema: T & ValidateSchema<T>): T {
  return schema;
}

/**
 * 配色のカタログ（ADR-0013 / `src/styles/themes.css`）。
 *
 * 明暗は含まない。明暗を決めるのは `theme` だけで、各パレットはライトとダークの両方を持つ。
 * プレビューとエディターは同じカタログから独立に選ぶため、値の並びをここで 1 本にしておく。
 */
const PALETTES = ['default', 'github', 'solarized', 'nord', 'gruvbox'] as const;

/**
 * `settings.json` の中身。
 *
 * 並びは `src-tauri/src/settings/schema.rs` の `Settings` と同じで、`theme` を先頭に置き以降はドット区切りのグループごとに辞書順とする。
 * ここに現れないキーもファイルには入りうる（未知のキーは保持される）。
 */
export const SETTINGS_SCHEMA = defineSettingsSchema({
  theme: { kind: 'enum', values: ['system', 'light', 'dark'], default: 'system' },

  'editor.bracketPairColorization.enabled': { kind: 'boolean', default: false },
  'editor.cursorBlinking': {
    kind: 'enum',
    values: ['blink', 'smooth', 'phase', 'expand', 'solid'],
    default: 'blink',
  },
  'editor.cursorStyle': {
    kind: 'enum',
    values: ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'],
    default: 'line',
  },
  'editor.cursorSurroundingLines': { kind: 'number', default: 0, min: 0, max: 30 },
  /** 空文字は「トークン層のコードスタックを使う」。 */
  'editor.fontFamily': { kind: 'string', default: '' },
  'editor.fontLigatures': { kind: 'boolean', default: true },
  'editor.fontSize': { kind: 'number', default: 14, min: 8, max: 72 },
  'editor.guides.indentation': { kind: 'boolean', default: true },
  'editor.insertSpaces': { kind: 'boolean', default: true },
  'editor.letterSpacing': { kind: 'number', default: 0, min: -2, max: 10 },
  /** 行の高さ。倍率で指定する（Monaco は 0 より大きく 8 未満なら倍率として解釈する）。 */
  'editor.lineHeight': { kind: 'number', default: 1.6, min: 1, max: 3 },
  'editor.lineNumbers': { kind: 'enum', values: ['off', 'on', 'relative', 'interval'], default: 'on' },
  'editor.minimap.enabled': { kind: 'boolean', default: false },
  'editor.padding.top': { kind: 'number', default: 12, min: 0, max: 100 },
  'editor.renderControlCharacters': { kind: 'boolean', default: true },
  'editor.renderLineHighlight': { kind: 'enum', values: ['none', 'gutter', 'line', 'all'], default: 'line' },
  'editor.renderWhitespace': {
    kind: 'enum',
    values: ['none', 'boundary', 'selection', 'trailing', 'all'],
    default: 'none',
  },
  /**
   * 縦罫線を引く桁。空なら引かない。`preview.maxWidth` と対で使う。
   * 本数に上限があるのは、手書きの長い配列がそのまま描画コストになるため。
   */
  'editor.rulers': { kind: 'number[]', default: [], min: 1, max: 500, maxLength: 8 },
  'editor.scrollBeyondLastLine': { kind: 'boolean', default: true },
  /** エディターの配色。`preview.theme` とは独立に選べる。 */
  'editor.theme': { kind: 'enum', values: PALETTES, default: 'default' },
  'editor.tabSize': { kind: 'number', default: 2, min: 1, max: 8 },
  'editor.wordWrap': {
    kind: 'enum',
    values: ['off', 'on', 'wordWrapColumn', 'bounded'],
    default: 'on',
  },
  'editor.wordWrapColumn': { kind: 'number', default: 80, min: 20, max: 500 },

  /** 空文字は「トークン層の既定スタックを使う」。 */
  'preview.codeFontFamily': { kind: 'string', default: '' },
  'preview.fontFamily': { kind: 'string', default: '' },
  /**
   * エディターのタイポグラフィはプレビューとは別の値である（ADR-0012）。
   * 16px / 1.75 は読むための値で、書く面では行が離れすぎる。
   */
  'preview.fontSize': { kind: 'number', default: 16, min: 8, max: 72 },
  'preview.lineHeight': { kind: 'number', default: 1.75, min: 1, max: 3 },
  /** 本文幅。単位は `ch`（02.architecture/10-theming.md §2）。 */
  'preview.maxWidth': { kind: 'number', default: 100, min: 20, max: 200 },
  /** 段落内の単独の改行を `<br>` として描画するか（`markdown-it` の `breaks` / #45）。既定は CommonMark 準拠で false。 */
  'preview.softBreak': { kind: 'boolean', default: false },
  /** 本文の配色。 */
  'preview.theme': { kind: 'enum', values: PALETTES, default: 'default' },

  /** ウィンドウを閉じたときの挙動（ADR-0007）。 */
  'window.closeBehavior': { kind: 'enum', values: ['tray', 'exit'], default: 'tray' },
});

type Schema = typeof SETTINGS_SCHEMA;

type ValueOf<E> = E extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : E extends { kind: 'number' }
    ? number
    : E extends { kind: 'boolean' }
      ? boolean
      : E extends { kind: 'string' }
        ? string
        : E extends { kind: 'number[]' }
          ? number[]
          : never;

/**
 * `settings.json` の値の形。スキーマから導出されるため、ここに手で追記しない。
 *
 * 項目ごとの補足は `SETTINGS_SCHEMA` の各エントリに付いている。
 */
export type Settings = { -readonly [K in keyof Schema]: ValueOf<Schema[K]> };

/** 設定キーの全体。`Settings` から導出するため、ここに手で追記しない。 */
export type SettingKey = keyof Settings;

/** キー 1 本の種別。UI 側でどの部品を割り当てられるかを型で制限するために使う。 */
export type SettingKind<K extends SettingKey> = Schema[K]['kind'];

/** 変更したキーだけを渡す。`null` はキーの削除を意味する（既定値に戻る）。 */
export type SettingsPatch = { [K in SettingKey]?: Settings[K] | null };

/** 数値の項目。許容範囲を持つのはこれだけで、`clampSetting` の対象もこれだけ。 */
export type NumericKey = { [K in keyof Schema]: Schema[K] extends { kind: 'number' } ? K : never }[keyof Schema];

/** 選択肢を持つ項目。`settingChoices` が空でない配列を返すのはこれだけ。 */
export type EnumKey = { [K in keyof Schema]: Schema[K] extends { kind: 'enum' } ? K : never }[keyof Schema];

/** 真偽の項目。 */
export type BooleanKey = { [K in keyof Schema]: Schema[K] extends { kind: 'boolean' } ? K : never }[keyof Schema];

/** 個々の設定値の型。UI 側が `Settings` のキーを覚えずに済むよう、別名を切ってある。 */
export type Theme = Settings['theme'];
export type WindowCloseBehavior = Settings['window.closeBehavior'];
export type WordWrap = Settings['editor.wordWrap'];
export type LineNumbers = Settings['editor.lineNumbers'];
export type RenderWhitespace = Settings['editor.renderWhitespace'];
export type RenderLineHighlight = Settings['editor.renderLineHighlight'];
export type CursorStyle = Settings['editor.cursorStyle'];
export type CursorBlinking = Settings['editor.cursorBlinking'];
export type Palette = Settings['preview.theme'];

/**
 * 既定値。`src-tauri/src/settings/schema.rs` の `Settings::default()` と 1:1 で対応する。
 *
 * 実際に届く値は Rust 側で既定値を埋めた後のものなので、これが要るのは bootstrap を持たない経路（`dev:web` の初回・テスト）だけ。
 * 一致は `settings-schema.test.ts` が `src-tauri/tests/settings-default.json` 越しに機械的に見張っている。
 */
export const DEFAULT_SETTINGS: Settings = Object.fromEntries(
  // 配列は複製する。共有するとスキーマ側の既定値が書き換わりうる
  Object.entries(SETTINGS_SCHEMA).map(([key, entry]) => [
    key,
    Array.isArray(entry.default) ? [...entry.default] : entry.default,
  ]),
) as Settings;

/** 数値の項目か。`clampSetting` を通す必要があるかの判定に使う。 */
export function isNumericKey(key: SettingKey): key is NumericKey {
  return SETTINGS_SCHEMA[key].kind === 'number';
}

/**
 * 数値を許容範囲に収める。範囲外の値がそのまま CSS / Monaco に流れるとレイアウトが壊れる。
 *
 * 有限でない値（`NaN` / `Infinity`）は既定値に落とす。潰しようがないため。
 */
export function clampSetting(key: NumericKey, value: number): number {
  const { min, max } = SETTINGS_SCHEMA[key];
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, value));
}

/**
 * 選択肢の並び。表示順もこれに従う（i18n のオブジェクトのキー順には依存させない）。
 *
 * 戻り値をキーで狭めておくと、設定 UI が `<select>` の値をストアへ戻すときのキャストが要らなくなる。
 * `ValueOf` が同じ `values` から値の型を作っているので、ここでの絞り込みは実体と一致する。
 */
export function settingChoices<K extends SettingKey>(key: K): readonly (Settings[K] & string)[] {
  const entry: SettingSchemaEntry = SETTINGS_SCHEMA[key];
  return (entry.kind === 'enum' ? entry.values : []) as readonly (Settings[K] & string)[];
}
