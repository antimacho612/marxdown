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
 * NOTE: ここから静的に import すると、共有部分が別のチャンクへ切り出されて critical path が増える（docs/measurements/07-bundle.md §3）。
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

/**
 * スライドの開始行を `data-line` に付ける。
 *
 * Split のスクロール同期とアウトラインはスライド単位で行う（docs/06.roadmap/m9-marp.md §4.2）。
 * 分割背景では同じスライドの `<section>` が 3 つ出力されるが、どれも同じ行を指す。
 */
function markSlides(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type === 'marpit_slide_open' && token.map) token.attrSet('data-line', String(token.map[0]));
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
