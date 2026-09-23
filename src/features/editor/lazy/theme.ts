/**
 * エディターの見た目（`editor` チャンク）。
 *
 * Monaco の `IStandaloneThemeData.colors` は実際の色（hex）しか受け付けないため、トークンを読み出して反映する層が要る（ADR-0009 の受け入れコスト 2）。
 * 同じ理由で `<html>` の属性（`data-theme` / `style`）と `prefers-color-scheme` をイベント駆動で監視し、変化のたびに反映し直す。
 * エディターの配色は面（`#mx-editor`）そのものに適用されるため `:root` からは読めない（`tokenRoot()` / ADR-0013）。
 *
 * ライト/ダークの判定は `data-theme` ではなく解決後の背景色の明度で行う。
 * `system` や配色によるトークンの上書きがあると、テーマ名だけで判定する方法では誤るためである。
 */
import { monaco } from './monaco';

/** Marxdown のトークンから組んだテーマ。名前は 1 つだけ。 */
const THEME_NAME = 'marxdown';

/**
 * トークンを読み出す起点（ADR-0013）。
 *
 * 読み出しは `#mx-editor` から行い、`documentElement` からは行わない。
 *
 * エディターの配色（`editor.theme`）は、面そのものにカスタムプロパティを上書きする形で適用されている。
 * `:root` から読むとそれらが存在しないため、テーマを選んでも Monaco に反映されない。
 *
 * `--mx-zoom` や `--mx-font-code` は `:root` にあるが、カスタムプロパティは継承されるため、読み出し位置を下げても値は変わらない。
 * 読み出し位置を下げることで失う値は無く、取得できる値だけが増える。
 *
 * 面がまだ無い（テストの一部）ときは `documentElement` を使う。
 */
function tokenRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('#mx-editor') ?? document.documentElement;
}

/**
 * `var()` を解決するための補助要素。
 *
 * トークンの起点の子要素でなければならない。
 * カスタムプロパティは継承されるため、DOM から切り離した要素では解決できない。
 *
 * Preview モードの間は `#mx-editor` が非表示であるため `display: none` の内側に置かれるが、計算値としての色は解決されるため読み出せる。
 */
let probe: HTMLElement | null = null;

function probeElement(): HTMLElement {
  if (probe?.isConnected) return probe;

  const element = document.createElement('div');
  element.style.display = 'none';
  tokenRoot().append(element);
  probe = element;
  return element;
}

/**
 * トークンの生の値（`16px` / `1.75` / フォント名の並びなど）。
 *
 * `options.ts` からも使う。
 * テーマの色と同じく、トークン層を JS 側へ読み出せる場所はこのファイルだけである。
 */
export function readValue(name: string): string {
  return getComputedStyle(tokenRoot()).getPropertyValue(name).trim();
}

/** トークンを数値として読む。単位は無視する。読めなければ `fallback` を返す。 */
export function readNumber(name: string, fallback: number): number {
  // `Number()` では変換できない。トークンには単位が付く（`16px` / `100ch`）。
  // eslint-disable-next-line unicorn/prefer-number-coercion -- 単位を除くために必要
  const value = Number.parseFloat(readValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 色トークンを `#rrggbb` / `#rrggbbaa` にする。
 *
 * トークンは hex とは限らない。
 * `--mx-color-selection` は `rgb(59 91 219 / 32%)` で書かれている。
 * 判定用の要素に `color` として適用し `getComputedStyle` から読み戻すと、ブラウザが正規化した rgb() が返る。
 * 自前で色関数を解釈するより確実であり、トークンの記法に制約を設けずに済む。
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
    // eslint-disable-next-line unicorn/prefer-number-coercion -- `32%` の `%` を除く
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

/**
 * 記法の色。プレビューのコードブロックと同じトークンを使う（`--mx-color-code-*` / 02.architecture/10-theming.md）。
 *
 * トークン名は Monarch の Markdown 定義が出力するものである（`monaco-editor/languages/definitions/markdown`）。
 *
 * 見出しとリストの記号は、どちらも `keyword` として出力される。
 * Monarch は行頭の記法をまとめて 1 つのトークンにするため、色を 2 つに分けられない。
 * そのため、構造を表す 1 色に統一している。
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
    // 継承する。ここで指定していない色 ID は数百あり、指定しなければ Monaco 側の既定（ライト / ダークそれぞれ）が使われる。
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
      'editor.selectionBackground': readColor('--mx-color-selection', '#3b5bdb52'),
      // 選択した語と一致する箇所。検索の一致より弱く表示する。
      // 検索の対象ではなく、同じ語が存在するという情報でしかない。
      'editor.selectionHighlightBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editor.wordHighlightBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editor.wordHighlightStrongBackground': readColor('--mx-color-bg-hover', '#e3e6ea'),
      // 検索の一致（F-EDIT-05）。プレビュー内検索と同じトークンを使う。
      // 同じ `Ctrl+F` で開く機能が、面ごとに異なる色で表示されないようにする。
      'editor.findMatchBackground': readColor('--mx-color-search-current', '#3b5bdb'),
      'editor.findMatchHighlightBackground': readColor('--mx-color-search-match', '#ffc40073'),
      // スクロールバー（`options.ts` の `SCROLLBAR_SIZE` と対になる）。
      // アプリ側は `scrollbar-color: var(--mx-color-border) transparent` の 1 色だけを指定しており、状態ごとに色を分けていない。編集面もそれに合わせて 3 状態とも同じ色にする。
      'scrollbarSlider.background': readColor('--mx-color-border', '#d9dbe0'),
      'scrollbarSlider.hoverBackground': readColor('--mx-color-border', '#d9dbe0'),
      'scrollbarSlider.activeBackground': readColor('--mx-color-border', '#d9dbe0'),
      'scrollbar.shadow': '#00000000',
      'editorBracketMatch.background': readColor('--mx-color-bg-hover', '#e3e6ea'),
      'editorBracketMatch.border': '#00000000',
      'editorIndentGuide.background1': readColor('--mx-color-border-subtle', '#e8eaee'),
      'editorIndentGuide.activeBackground1': readColor('--mx-color-border', '#d9dbe0'),
      // 検索・置換パネル。Monaco の既定はテーマ内蔵の色なので、トークン層の色で上書きする。
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

/**
 * いまのトークンからテーマを組み直して適用する。
 *
 * フォントはここでは扱わない。
 * 文字サイズ・行間・フォント名は読む面と書く面で別々に持ち（ADR-0012）、`options.ts` が設定から組み立てる。
 *
 * エディターの実体を引数に取らないのは、`defineTheme` / `setTheme` が Monaco 全体に対する操作だからである。
 */
export function applyEditorTheme(): void {
  monaco.editor.defineTheme(THEME_NAME, buildTheme());
  monaco.editor.setTheme(THEME_NAME);
}

/**
 * トークンの変化に追従する。解除する関数を返す。
 *
 * `<html>` の `data-theme`（テーマの切り替え、F-CONF-01）と `style`（プレビューのフォント・文字サイズ・行の高さと表示倍率、F-VIEW-11）の 2 つの属性で変化をすべて検出できる。
 * `applyAppearance` も `applyZoom` も `documentElement.style` を書き換えるため、アプリ側に通知の仕組みを追加する必要が無い。
 * `main` チャンクはエディターの存在を知らないままでいられる。
 *
 * エディターの設定（`editor.*`）はここを通らない。
 * 折り返しやタブ幅は CSS に現れないため、属性を見ていても変化に気づけない。
 * そちらは `watchEditorSettings`（`watch-settings.svelte.ts`）がストアを直接購読する。
 */
export function watchEditorTokens(reapply: () => void): () => void {
  const observer = new MutationObserver(reapply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  // `theme` が `system` のとき、`data-theme` は付かない。OS 側の切り替えは CSS のメディアクエリでは反映されるが、JS 側には通知が来ないため明示的に購読する。
  const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', reapply);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', reapply);
    probe?.remove();
    probe = null;
  };
}
