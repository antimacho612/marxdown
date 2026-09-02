/**
 * エディタの見た目（`editor` チャンク）。
 *
 * # CSS 変数を JS 側へ読み出す層が要る
 *
 * トークン層（`styles/tokens.css` / 02.architecture/10-theming.md）は CSS カスタムプロパティで、
 * テーマは実行中に変わる（OS 追従 / F-CONF-01）。**CodeMirror ではテーマの値に
 * `var(--mx-*)` をそのまま書けたので、CSS 側が切り替わるだけで追従していた。**
 *
 * **Monaco では書けない。** `IStandaloneThemeData.colors` は
 * `{[colorId: string]: string}` で、受け付けるのは実際の色（hex）だけ。
 * したがって「トークンを読み出して流し込む」層がここに要る
 * （[ADR-0009](../../../docs/adr/0009-editor-engine-monaco.md) の受け入れコスト 2）。
 *
 * # 変わったことに気づく手段も要る
 *
 * 同じ理由で、**変化を検知して流し込み直す**必要がある。見張るのは 2 つだけ。
 *
 * ```text
 * <html> の属性        data-theme（F-CONF-01）と style（設定・倍率）の両方がここに乗る
 * prefers-color-scheme  theme が system のとき、OS 側の切り替えを拾う
 * ```
 *
 * **どちらもイベント駆動で、ポーリングではない**（05.performance-budget/04-targets.md §5）。
 * 購読が生きるのはエディタが載っているあいだだけで、Preview だけで読んでいる起動では
 * このファイル自体がロードされない。
 *
 * # ライトかダークかを、テーマ名から判定しない
 *
 * `data-theme` を見て分岐すると、`system` のときに OS の設定をもう一度解決することになり、
 * カスタム CSS（F-CONF-07）でトークンを上書きされた場合にも外れる。
 * **解決後の背景色の明度で決める。** 実際に描かれる色が唯一の真実になる。
 */
import { monaco } from './monaco';

/** Marxdown のトークンから組んだテーマ。名前は 1 つだけ。 */
const THEME_NAME = 'marxdown';

/* ------------------------------------------------------------------ */
/* トークンの読み出し                                                   */
/* ------------------------------------------------------------------ */

/**
 * `var()` を解決するための当て板。
 *
 * **`document.documentElement` の子でなければならない。** カスタムプロパティは
 * 継承で降りてくるので、切り離した要素では解決できない。
 */
let probe: HTMLElement | null = null;

function probeElement(): HTMLElement {
  if (probe) return probe;

  const element = document.createElement('div');
  element.style.display = 'none';
  document.documentElement.append(element);
  probe = element;
  return element;
}

/**
 * トークンの生の値（`16px` / `1.75` / フォント名の並びなど）。
 *
 * **`options.ts` からも使う。** テーマの色と同じで、
 * トークン層を JS 側へ読み出せる場所はこのファイルにしかない。
 */
export function readValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readNumber(name: string, fallback: number): number {
  // **`Number()` では読めない。** トークンには単位が付く（`16px` / `100ch`）。
  // eslint-disable-next-line unicorn/prefer-number-coercion -- 単位を落とすために必要
  const value = Number.parseFloat(readValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 色トークンを `#rrggbb` / `#rrggbbaa` にする。
 *
 * **トークンは hex とは限らない。** `--mx-color-selection` は
 * `rgb(59 91 219 / 18%)` で書かれている。当て板に `color` として当てて
 * `getComputedStyle` から読み戻すと、**ブラウザが正規化した rgb() が返る。**
 * 自前で色関数を解釈するより確かで、トークンの書き方に縛りを作らずに済む。
 */
function readColor(name: string, fallback: string): string {
  const element = probeElement();
  element.style.color = '';
  element.style.color = `var(${name})`;

  const computed = getComputedStyle(element).color;
  const parts = /\(([^)]+)\)/u.exec(computed)?.[1];
  if (parts === undefined) return fallback;

  const numbers = parts
    .split(/[\s,/]+/u)
    // eslint-disable-next-line unicorn/prefer-number-coercion -- `18%` の `%` を落とす
    .map((part) => Number.parseFloat(part))
    .filter((value) => Number.isFinite(value));

  const [red, green, blue, alpha] = numbers;
  if (red === undefined || green === undefined || blue === undefined) return fallback;

  const hex = [red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');
  // アルファは省略できるときは省く。Monaco はどちらも受け取る。
  if (alpha === undefined || alpha >= 1) return `#${hex}`;
  return `#${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** `#rrggbb` の相対輝度（おおよそ）。ライト / ダークの判定にだけ使う。 */
function isDark(background: string): boolean {
  const value = Number.parseInt(background.slice(1, 7), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
}

/* ------------------------------------------------------------------ */
/* テーマの組み立て                                                     */
/* ------------------------------------------------------------------ */

/**
 * 記法の色。**プレビューのコードブロックと同じトークンを使う**
 * （`--mx-color-code-*` / 02.architecture/10-theming.md）。
 *
 * トークン名は Monarch の Markdown 定義が出すもの
 * （`monaco-editor/languages/definitions/markdown`）。
 *
 * > **見出しとリストの記号は、どちらも `keyword` で出てくる。**
 * > CodeMirror では Lezer の構文木から `tags.heading` と `tags.list` を
 * > 別々に取れていたが、Monarch は行頭の記法をまとめて 1 つのトークンにする。
 * > **色を 2 つに分けられないので、構造を表す 1 色に寄せている。**
 */
function tokenRules(): monaco.editor.ITokenThemeRule[] {
  const structure = readColor('--mx-color-code-function', '#1d4ed8');
  const subtle = readColor('--mx-color-fg-subtle', '#8b8d98');

  return [
    // 見出し / リストの記号 / 表の区切り
    { token: 'keyword.md', foreground: structure, fontStyle: 'bold' },
    // 引用（`>`）と HTML コメント
    { token: 'comment.md', foreground: readColor('--mx-color-fg-muted', '#60646c') },
    { token: 'strong.md', fontStyle: 'bold' },
    { token: 'emphasis.md', fontStyle: 'italic' },
    // インラインコード
    { token: 'variable.md', foreground: readColor('--mx-color-code-builtin', '#0e7490') },
    // フェンスの中身
    { token: 'variable.source.md', foreground: readColor('--mx-color-code-comment', '#6b7280') },
    // フェンス記号 / 4 字下げのコード
    { token: 'string.md', foreground: readColor('--mx-color-code-string', '#0f766e') },
    { token: 'string.link.md', foreground: readColor('--mx-color-accent', '#3b5bdb') },
    { token: 'string.target.md', foreground: readColor('--mx-color-code-variable', '#b91c1c') },
    { token: 'string.escape.md', foreground: subtle },
    { token: 'escape.md', foreground: subtle },
    // 水平線
    { token: 'meta.separator.md', foreground: subtle },
    // 本文中の HTML
    { token: 'tag.md', foreground: readColor('--mx-color-code-keyword', '#7c3aed') },
    { token: 'attribute.name.html.md', foreground: readColor('--mx-color-code-variable', '#b91c1c') },
    { token: 'string.html.md', foreground: readColor('--mx-color-code-string', '#0f766e') },
    { token: 'delimiter.html.md', foreground: subtle },
  ];
}

function buildTheme(): monaco.editor.IStandaloneThemeData {
  const background = readColor('--mx-color-bg', '#ffffff');
  const foreground = readColor('--mx-color-fg', '#1c2024');

  return {
    base: isDark(background) ? 'vs-dark' : 'vs',
    // **継承する。** ここで名指ししていない色 ID は数百あり、
    // 埋めずに残すと Monaco 側の既定（ライト / ダークそれぞれ）に落ちる。
    inherit: true,
    rules: tokenRules(),
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editorCursor.foreground': foreground,
      'editorLineNumber.foreground': readColor('--mx-color-fg-subtle', '#8b8d98'),
      'editorLineNumber.activeForeground': readColor('--mx-color-fg-muted', '#60646c'),
      'editor.lineHighlightBackground': readColor('--mx-color-bg-subtle', '#f6f7f9'),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': readColor('--mx-color-selection', '#3b5bdb2e'),
      // 選択した語と同じもの。**一致より弱く**塗る。探しているのではなく、
      // たまたま同じ語がそこにある、という情報でしかない。
      'editor.selectionHighlightBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editor.wordHighlightBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editor.wordHighlightStrongBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      // 検索の一致（F-EDIT-05）。**プレビュー内検索と同じトークンを使う。**
      // 同じ `Ctrl+F` で開くものが、面ごとに違う色で光ってはいけない。
      'editor.findMatchBackground': readColor('--mx-color-search-current', '#3b5bdb'),
      'editor.findMatchHighlightBackground': readColor('--mx-color-search-match', '#ffc40073'),
      'editorBracketMatch.background': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editorBracketMatch.border': '#00000000',
      'editorIndentGuide.background1': readColor('--mx-color-border-subtle', '#e8eaee'),
      'editorIndentGuide.activeBackground1': readColor('--mx-color-border', '#d9dbe0'),
      // 検索・置換パネル。Monaco の既定はテーマ内蔵の色なので、トークン層で塗り直す。
      'editorWidget.background': readColor('--mx-color-bg-subtle', '#f6f7f9'),
      'editorWidget.foreground': foreground,
      'editorWidget.border': readColor('--mx-color-border', '#d9dbe0'),
      'input.background': background,
      'input.foreground': foreground,
      'input.border': readColor('--mx-color-border', '#d9dbe0'),
      'inputOption.activeBorder': readColor('--mx-color-accent', '#3b5bdb'),
      focusBorder: readColor('--mx-color-accent', '#3b5bdb'),
      'menu.background': readColor('--mx-color-bg-subtle', '#f6f7f9'),
      'menu.foreground': foreground,
      'menu.border': readColor('--mx-color-border', '#d9dbe0'),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 適用と追従                                                          */
/* ------------------------------------------------------------------ */

/**
 * いまのトークンからテーマを組み直して当てる。
 *
 * **フォントはここにない。** 文字サイズ・行間・フォント名は M2 まで
 * プレビューのトークンをそのまま着ていたが、読む面と書く面で別々に持つようにした
 * （ADR-0012）。いまは `options.ts` が設定から組む。
 *
 * エディタの実体を取らないのは、`defineTheme` / `setTheme` が
 * **Monaco 全体に対する操作**だから。インスタンスを渡す形にすると、
 * タブが増えたときに枚数ぶん呼ばれることになる（M3）。
 */
export function applyEditorTheme(): void {
  monaco.editor.defineTheme(THEME_NAME, buildTheme());
  monaco.editor.setTheme(THEME_NAME);
}

/**
 * トークンの変化に追従する。**解除する関数を返す。**
 *
 * `<html>` の属性 1 本で 3 つとも拾える。
 *
 * ```text
 * data-theme  テーマの切り替え（F-CONF-01）
 * style       プレビューの設定（フォント・文字サイズ・行の高さ）と表示倍率（F-VIEW-11）
 * ```
 *
 * `applyAppearance` も `applyZoom` も `documentElement.style` を書き換えるので、
 * **アプリ側に通知の口を足す必要が無い。** `main` チャンクはエディタの存在を
 * 知らないままでいられる。
 *
 * > **エディタの設定（`editor.*`）はここを通らない。** 折り返しやタブ幅は CSS に
 * > 現れないので、属性を見ていても変化に気づけない。そちらは
 * > `watchEditorSettings`（`watch-settings.svelte.ts`）がストアを直接購読する。
 */
export function watchEditorTokens(reapply: () => void): () => void {
  const observer = new MutationObserver(reapply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  // `theme` が `system` のとき、`data-theme` は付かない。OS 側の切り替えは
  // CSS のメディアクエリが拾うが、**JS 側には何も飛んでこない**ので明示的に聞く。
  const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', reapply);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', reapply);
    probe?.remove();
    probe = null;
  };
}
