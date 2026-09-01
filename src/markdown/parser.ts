/**
 * Markdown のパース窓口。
 *
 * # かつては Worker だった
 *
 * [ADR-0003](../../docs/adr/0003-markdown-pipeline.md) D2 は、Split モードの
 * 入力レスポンス（N-PERF-03）を根拠にパースを Worker へ追い出していた。
 * **M2 Phase 6 で実測したところ、その根拠が成り立たなかった**ので畳んだ
 * （[ADR-0010](../../docs/adr/0010-parse-on-main-thread.md) /
 * [measurements > input-response](../../docs/measurements/11-input-response.md)）。
 *
 * ```text
 * 打ち終わり → プレビュー反映 p95   spec.md  Worker 145.7ms / メイン 143.7ms
 *                                  huge.md  Worker 255.5ms / メイン 249.1ms
 * ```
 *
 * **受け渡しの複製がメインスレッドに乗る**ので、Worker は自分が節約したはずの
 * 時間を送り返す側で使い切っていた。詰まりを作っていたのは paint のほうで、
 * そちらは Worker では追い出せない。
 *
 * # 非同期のままにしてある
 *
 * `parse` は同期的に返せるが、`Promise` を返す形を保っている。
 * 呼び出し側（`features/document/open.ts` / `live.ts`）は
 * **パースを投げてから結果を待つまでのあいだにシェルを描く**構造になっており
 * （[02.architecture > startup-sequence §1](../../docs/02.architecture/05-startup-sequence.md)）、
 * ここを同期にするとその重ね合わせが消える。
 *
 * # `pipeline` を動的 import にしている理由
 *
 * markdown-it 一式は起動の直後に必ず要るので、遅延させても得はしない。
 * それでも分けてあるのは、**`main` チャンクの予算計測が実態を映すため**。
 * `pipeline` は size-limit のクリティカルパスに名指しで入っている。
 */
import { DEFAULT_CHUNK_BLOCKS, DEFAULT_FIRST_CHUNK_BLOCKS, type ParseResult } from './protocol';

export interface ParseOptions {
  firstChunkBlocks?: number;
  chunkBlocks?: number;
}

export interface MarkdownParser {
  parse(text: string, options?: ParseOptions): Promise<ParseResult>;
  /** M3 でタブを閉じるときに呼ぶ（N-PERF-06）。いまは解放するものが無い。 */
  dispose(): void;
}

export function createParser(): MarkdownParser {
  let nextId = 1;
  // モジュールの解決を 1 度だけにする。**呼ぶたびに `import()` を書くと、
  // 解決済みでもマイクロタスクが 1 つ余分に挟まる。**
  const pipeline = import('./pipeline');
  const textStats = import('./text-stats');

  return {
    async parse(text, options = {}) {
      const id = nextId++;
      const { renderChunks } = await pipeline;
      const { measure } = await textStats;

      const started = performance.now();
      const result = renderChunks(
        text,
        options.firstChunkBlocks ?? DEFAULT_FIRST_CHUNK_BLOCKS,
        options.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS,
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
