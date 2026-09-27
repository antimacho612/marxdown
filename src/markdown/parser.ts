/**
 * Markdown のパースのインタフェース。
 *
 * パースはメインスレッドで実行する（ADR-0010）。
 *
 * `parse` は同期的に返せるが `Promise` を保っている。
 * 呼び出し側はパースを開始してから結果を待つ間にシェルを描く構造になっており、同期にするとこの並行処理が成立しなくなる。
 *
 * `pipeline` を動的 import にしているのは遅延のためではなく、`main` チャンクの予算計測を実態に合わせるためである（size-limit のクリティカルパスに名指しで入っている）。
 */
import { DEFAULT_CHUNK_BLOCKS, DEFAULT_FIRST_CHUNK_BLOCKS, type MarpThemeSet, type ParseResult } from './protocol';

/** チャンク分割の指定。省略時は `protocol.ts` の既定値を使う。 */
export interface ParseOptions {
  firstChunkBlocks?: number;
  chunkBlocks?: number;
  /** 単独の改行を `<br>` にするか（`preview.softBreak`）。省略時は false。 */
  breaks?: boolean;
  /**
   * 有効にする追加記法（`markdown.*`）。省略時は無し。
   *
   * 描画の前にここで読み込みを待つ。既定（空）では読み込むものが無く、往復も発生しない。
   */
  syntax?: readonly string[];
  /**
   * Marp の自作テーマ（`marp.themes`）を読む関数。Marp の文書を描くときだけ呼ぶ。
   *
   * 同じ読み込み結果（同じオブジェクト）を返す限り、テーマは登録し直さない。
   */
  marpThemes?: () => Promise<MarpThemeSet>;
}

const NO_THEMES: MarpThemeSet = { themes: [], problems: [] };

/** パースのインタフェース。実体は `createParser` が返す。 */
export interface MarkdownParser {
  parse(text: string, options?: ParseOptions): Promise<ParseResult>;
  /** 破棄する（N-PERF-06）。パーサは解放するものを持たないため、何もしない。 */
  dispose(): void;
}

/** パーサを作る。起動時に 1 つだけ作り、`configureOpener` で注入する。 */
export function createParser(): MarkdownParser {
  let nextId = 1;
  // モジュールの解決を 1 度だけにする。
  // 呼び出しのたびに `import()` を書くと、解決済みでもマイクロタスクが 1 つ余分に挟まる。
  const pipeline = import('./pipeline');
  const textStats = import('./text-stats');

  /** 読み込み済みの追加記法。ここが変わったときだけ markdown-it を組み立て直す。 */
  let loadedSyntax = '';

  return {
    async parse(text, options = {}) {
      const id = nextId++;
      const { renderChunks, resetMarkdownIt, loadSyntax, marpFrontMatter, mathPlugin, extractOutline } = await pipeline;
      const { measure } = await textStats;

      const frontMatter = marpFrontMatter(text);
      if (frontMatter !== null) {
        // Marp の描画（F-VIEW-17）は `marp: true` の文書を開くまで読み込まない。
        const { renderMarp } = await import('./marp');
        const started = performance.now();
        const rendered = renderMarp(text, { mathPlugin, extractOutline }, (await options.marpThemes?.()) ?? NO_THEMES);
        return {
          id,
          chunks: [],
          blocks: [],
          outline: rendered.outline,
          frontMatter,
          parseMs: performance.now() - started,
          textStats: measure(text),
          marp: rendered,
        };
      }

      // 追加記法は ON のものだけを動的 import する（`plugins/syntax.ts`）。
      // 既定では空であり、`loadSyntax` は何も読み込まずに返る。
      const names = options.syntax ?? [];
      const key = names.toSorted().join(',');
      if (key !== loadedSyntax) {
        await loadSyntax(names);
        // 読み込みが済むまで `useSyntax` は何も返さないため、組み立て済みのインスタンスは古い。
        resetMarkdownIt();
        loadedSyntax = key;
      }

      const started = performance.now();
      const result = renderChunks(
        text,
        options.firstChunkBlocks ?? DEFAULT_FIRST_CHUNK_BLOCKS,
        options.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS,
        { breaks: options.breaks ?? false, syntax: names },
      );
      const parseMs = performance.now() - started;

      return {
        id,
        chunks: result.chunks,
        blocks: result.blocks,
        outline: result.outline,
        frontMatter: result.frontMatter,
        parseMs,
        textStats: measure(text),
      };
    },
    dispose() {},
  };
}
