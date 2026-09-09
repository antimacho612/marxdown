/**
 * Markdown のパース窓口。
 *
 * かつては Worker で実行していたが、実測でその根拠（Split の入力レスポンス）が成り立たなかったため撤去した（ADR-0010 / measurements/11-input-response.md）。
 *
 * `parse` は同期的に返せるが `Promise` を保っている。
 * 呼び出し側はパースを投げてから結果を待つ間にシェルを描く構造になっており（02.architecture/05-startup-sequence.md §1）、同期にするとこの並行処理が成立しなくなる。
 *
 * `pipeline` を動的 import にしているのは遅延のためではなく、`main` チャンクの予算計測を実態に合わせるためである（size-limit のクリティカルパスに名指しで入っている）。
 */
import { DEFAULT_CHUNK_BLOCKS, DEFAULT_FIRST_CHUNK_BLOCKS, type ParseResult } from './protocol';

/** チャンク分割の指定。省略時は `protocol.ts` の既定値を使う。 */
export interface ParseOptions {
  firstChunkBlocks?: number;
  chunkBlocks?: number;
  /** 単独の改行を `<br>` にするか（`preview.softBreak` / #45）。省略時は false。 */
  breaks?: boolean;
  /**
   * 有効にする追加記法（`markdown.*` / 04.tech-stack/04-markdown.md §3）。省略時は無し。
   *
   * 描画の前にここで読み込みを待つ。既定（空）では読み込むものが無く、往復も発生しない。
   */
  syntax?: readonly string[];
}

/** パースの窓口。実体は `createParser` が返す。 */
export interface MarkdownParser {
  parse(text: string, options?: ParseOptions): Promise<ParseResult>;
  /** M3 でタブを閉じるときに呼ぶ（N-PERF-06）。いまは解放するものが無い。 */
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
      const { renderChunks, resetMarkdownIt, loadSyntax } = await pipeline;
      const { measure } = await textStats;

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
        outline: result.outline,
        frontMatter: result.frontMatter,
        parseMs,
        textStats: measure(text),
      };
    },
    dispose() {},
  };
}
