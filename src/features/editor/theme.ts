/**
 * エディタの見た目（`editor` チャンク）。
 *
 * # 値を CSS 変数で書く理由
 *
 * テーマは実行中に変わる（OS 追従 / F-CONF-01）。CodeMirror のテーマは
 * JS のオブジェクトなので、色を直接書くと**切り替えのたびに拡張を差し替える**
 * ことになる。`var(--mx-*)` を値に置けば、CSS 側の切り替えにそのまま追従する。
 *
 * エディタテーマの追加（F-CONF-08）は M5。ここが作るのは 1 つだけで、
 * 02.architecture/10-theming.md のトークン層をそのまま借りている。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * 本文の見た目。
 *
 * `--mx-zoom` を font-size に乗せてあるのは、表示倍率（F-VIEW-11）が
 * プレビューと同じように効いてほしいため。倍率は「この人の見え方の好み」であって
 * 「いまプレビューを見ているか」ではない。
 */
const base = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--mx-color-fg)',
    backgroundColor: 'var(--mx-color-bg)',
    fontSize: 'calc(var(--mx-font-size-content) * var(--mx-zoom))',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--mx-font-code)',
    // Preview 側（`--mx-font-ligatures-code`）とは揃えず、常に無効にする。
    // Cascadia Code などのリガチャ付きフォントで `?` `:` `/` `_` 等を連続入力すると、
    // WebView2/Chromium 側のリガチャ形成キャッシュが再描画されず文字が消えて見える
    // （選択操作で強制再描画されるまで戻らない）。Preview は打鍵ごとの再描画が無いため影響しない（#39）。
    fontVariantLigatures: 'none',
    lineHeight: 'var(--mx-line-height)',
  },
  // 本文幅はプレビューと揃える。読む面と書く面で行長が変わると、
  // モードを切り替えたときに同じ文章が違う形に見える。
  '.cm-content': {
    maxWidth: 'var(--mx-content-width)',
    margin: '0 auto',
    padding: 'var(--mx-space-8) 0 40vh',
    caretColor: 'var(--mx-color-fg)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--mx-color-fg-subtle)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--mx-color-bg-subtle)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--mx-color-fg-muted)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--mx-color-selection)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--mx-color-fg)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--mx-color-bg-hover)',
    outline: 'none',
  },

  /*
   * 検索の一致（F-EDIT-05）。**プレビュー内検索と同じトークンを使う**
   * （`--mx-color-search-*` / `styles/tokens.css`）。同じ `Ctrl+F` で開くものが、
   * 面ごとに違う色で光ってはいけない。
   */
  '.cm-searchMatch': { backgroundColor: 'var(--mx-color-search-match)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--mx-color-search-current)',
    color: 'var(--mx-color-accent-fg)',
  },
  // 選択した語と同じもの。**一致より弱く**塗る。探しているのではなく、
  // たまたま同じ語がそこにある、という情報でしかない。
  '.cm-selectionMatch': { backgroundColor: 'var(--mx-color-bg-hover)' },

  /*
   * 検索・置換パネル（F-EDIT-05）。
   *
   * CodeMirror は素の状態でも自前の色を持っているが、**ライト固定**なので
   * ダークテーマで白いパネルが出る。トークン層で塗り直す。
   */
  '.cm-panels': {
    backgroundColor: 'var(--mx-color-bg-subtle)',
    color: 'var(--mx-color-fg)',
    fontFamily: 'var(--mx-font-ui)',
    fontSize: 'var(--mx-font-size-ui)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--mx-color-border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--mx-color-border)' },
  '.cm-panel.cm-search': { padding: 'var(--mx-space-2)' },
  '.cm-panel.cm-search label': { color: 'var(--mx-color-fg-muted)' },
  '.cm-textfield': {
    backgroundColor: 'var(--mx-color-bg)',
    color: 'var(--mx-color-fg)',
    border: '1px solid var(--mx-color-border)',
    borderRadius: 'var(--mx-radius-sm)',
    padding: '2px 6px',
  },
  '.cm-textfield:focus-visible': { outline: '2px solid var(--mx-color-accent)', outlineOffset: '-1px' },
  '.cm-button': {
    backgroundColor: 'var(--mx-color-bg)',
    backgroundImage: 'none',
    color: 'var(--mx-color-fg)',
    border: '1px solid var(--mx-color-border)',
    borderRadius: 'var(--mx-radius-sm)',
  },
  '.cm-button:hover': { backgroundColor: 'var(--mx-color-bg-hover)' },
  '.cm-panel button[name="close"]': { color: 'var(--mx-color-fg-muted)', fontSize: '16px' },
});

/**
 * 記法の色。**プレビューのコードブロックと同じトークンを使う**
 * （`--mx-color-code-*` / 02.architecture/10-theming.md）。
 *
 * Markdown のソースを色分けする目的なので、見出し・強調・リンクといった
 * 「文章の構造」に寄せている。プログラミング言語の色分けとは対象が違う。
 */
const highlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--mx-color-code-function)', fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--mx-color-accent)' },
  { tag: tags.url, color: 'var(--mx-color-code-string)' },
  { tag: tags.monospace, color: 'var(--mx-color-code-builtin)' },
  { tag: tags.quote, color: 'var(--mx-color-fg-muted)' },
  { tag: tags.list, color: 'var(--mx-color-code-keyword)' },
  // 記法そのもの（`#` `**` `-` など）。**本文より薄くする。**
  // Markdown Is the Product（Principle 2）は記号を消すことではないが、
  // 読むときに主役が本文であることは変わらない。
  { tag: tags.processingInstruction, color: 'var(--mx-color-fg-subtle)' },
  { tag: tags.contentSeparator, color: 'var(--mx-color-fg-subtle)' },
  { tag: tags.comment, color: 'var(--mx-color-code-comment)' },
]);

export const editorTheme: Extension = [base, syntaxHighlighting(highlight, { fallback: true })];
