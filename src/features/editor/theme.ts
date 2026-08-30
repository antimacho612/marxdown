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
    fontVariantLigatures: 'var(--mx-font-ligatures-code)',
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
