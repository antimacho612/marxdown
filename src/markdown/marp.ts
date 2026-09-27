/**
 * Marp の文書をスライドの HTML とテーマの CSS に変換する（F-VIEW-17 / ADR-0023）。
 *
 * `pipeline.ts` と同じく文字列の変換だけを行い、DOM には触れない。
 * 出力はサニタイズしていない。DOM へ入れる前に `features/preview/lazy/marp.ts` がサニタイズし、SVG の枠を組み直す。
 *
 * `marp: true` の文書でだけ `markdown/parser.ts` から動的 import される。
 */
import { Marp } from '@marp-team/marp-core';
import type { MarkdownIt, StateCore, Token } from 'markdown-it';

import type { OutlineItem } from './plugins/line-map';
import type { MarpRender, MarpThemeProblem, MarpThemeSet } from './protocol';

/**
 * pipeline チャンクから受け取る関数。
 *
 * NOTE: ここから静的に import すると、共有部分が別のチャンクへ切り出されて critical path が増える。
 */
export interface MarpHelpers {
  mathPlugin: (md: MarkdownIt) => void;
  extractOutline: (tokens: Token[]) => OutlineItem[];
}

let marp: Marp | null = null;
/** 登録済みの自作テーマ。読み込み結果が同じオブジェクトであれば登録し直さない。 */
let registered: MarpThemeSet | null = null;

function createMarp({ mathPlugin, extractOutline }: MarpHelpers): Marp {
  const instance = new Marp({
    inlineSVG: true,
    // NOTE: ブラウザ用のスクリプトはサニタイズで除去されるため、最初から出力させない。
    script: false,
    // NOTE: 数式とハイライトは既存の遅延チャンクで描く。marp-core 側の実装は vite.config.ts で空のモジュールに差し替えてある。
    math: false,
    // NOTE: twemoji は CDN から画像を読むため使わない（ADR-0023 §2.2）。
    emoji: { shortcode: true, unicode: false },
  });
  instance.highlighter = () => '';
  instance.use(mathPlugin);
  // NOTE: Marpit のコアルールがすべて済んだ後に置く。スライドの分割と SVG の包みはそちらが行う。
  instance.markdown.core.ruler.push('mx_marp_lines', (state: StateCore) => {
    markSlides(state);
    (state.env as Partial<MarpEnv>).outline = extractOutline(state.tokens);
  });
  return instance;
}

/** `data-line` を付けるトークン。スライドと、属性をそのまま出力するブロック要素である（`plugins/line-map.ts` の `BLOCK_OPEN_RULES` の一部）。 */
const LINE_TOKENS = new Set([
  'marpit_slide_open',
  'heading_open',
  'paragraph_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
  'table_open',
]);

/**
 * スライドとブロック要素の開始行を `data-line` に付ける。
 *
 * Split のスクロール同期、アウトラインからの移動、プレビューからエディターへの移動が使う。
 * 見出しの `id` は marp-core が描画の時点で付けるため、アウトラインの `slug` は空になる。移動は行番号で探す（`features/outline/jump.ts`）。
 * 分割背景では同じスライドの `<section>` が 3 つ出力されるが、どれも同じ行を指す。
 *
 * NOTE: `plugins/line-map.ts` のようにレンダラを包まず、トークンの属性に付ける。marp-core がレンダラを差し替えている記法（コードなど）には付かない。
 */
function markSlides(state: StateCore): void {
  for (const token of state.tokens) {
    if (LINE_TOKENS.has(token.type) && token.map) token.attrSet('data-line', String(token.map[0]));
  }
}

interface MarpEnv {
  htmlAsArray: true;
  outline?: MarpRender['outline'];
}

/**
 * Marp の文書を描く。スライドごとの HTML を返し、出力はサニタイズしていない。
 *
 * `themes` が前回と違うオブジェクトであれば、インスタンスを作り直して自作テーマを登録する。
 * 作り直すのは、組み込みと同じ名前（`default` など）で上書きしたテーマを元に戻すためである。
 */
export function renderMarp(text: string, helpers: MarpHelpers, themes: MarpThemeSet): MarpRender {
  let themeProblems: MarpThemeProblem[] | undefined;
  if (!marp || registered !== themes) {
    marp = createMarp(helpers);
    themeProblems = [...themes.problems, ...register(marp, themes)];
    registered = themes;
  }
  const env: MarpEnv = { htmlAsArray: true };
  const { html, css } = marp.render(text, env);
  return { slides: html, css, outline: env.outline ?? [], ...(themeProblems && { themeProblems }) };
}

/** 自作テーマを登録する。`/* @theme 名前 *\/` が無く marp-core が拒んだものを返す。 */
function register(instance: Marp, themes: MarpThemeSet): MarpThemeProblem[] {
  const problems: MarpThemeProblem[] = [];
  for (const { path, css } of themes.themes) {
    try {
      instance.themeSet.add(css);
    } catch {
      problems.push({ path, kind: 'no-theme-name' });
    }
  }
  return problems;
}
