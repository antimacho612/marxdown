/**
 * Markdown Worker のクライアント側。
 *
 * `--spike-parse=main` のときは Worker を作らず、同じパイプラインを
 * メインスレッドで直接呼ぶ。A/B 比較のため、**呼び出し側から見た
 * インタフェースを同一に保つ**ことが重要（OQ-15）。
 */
import { takeBootedWorker } from './boot';
import {
  DEFAULT_CHUNK_BLOCKS,
  DEFAULT_FIRST_CHUNK_BLOCKS,
  type ParseResponse,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

export interface ParseOptions {
  firstChunkBlocks?: number;
  chunkBlocks?: number;
}

export interface MarkdownParser {
  parse(text: string, options?: ParseOptions): Promise<ParseResponse>;
  dispose(): void;
}

/** Worker を使う実装（本命）。 */
function createWorkerParser(): MarkdownParser {
  // `main.ts` の最初の import が立てておいたものを引き取る（`boot.ts`）。
  // **スレッドの起動には 32〜35ms かかる。** ここで初めて `new Worker()` すると、
  // その 35ms がまるごと「本文が読める」までに乗る。
  //
  // 引き取れないのは 2 つ目以降を作るときだけで、そのときは普通に立てる。
  const worker =
    takeBootedWorker() ??
    new Worker(new URL('./md-worker.ts', import.meta.url), {
      type: 'module',
      name: 'md-worker',
    });

  let nextId = 1;
  const pending = new Map<number, { resolve: (r: ParseResponse) => void; reject: (e: Error) => void }>();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const entry = pending.get(res.id);
    if (!entry) return;
    pending.delete(res.id);
    if (res.type === 'parsed') entry.resolve(res);
    else entry.reject(new Error(res.message));
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'md-worker が落ちた');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  });

  return {
    parse(text, options = {}) {
      const id = nextId++;
      const req: WorkerRequest = {
        type: 'parse',
        id,
        text,
        firstChunkBlocks: options.firstChunkBlocks ?? DEFAULT_FIRST_CHUNK_BLOCKS,
        chunkBlocks: options.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS,
      };
      return new Promise<ParseResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(req);
      });
    },
    dispose() {
      // N-PERF-06: タブを閉じたときに確実に解放する
      worker.terminate();
      pending.clear();
    },
  };
}

/**
 * メインスレッドで直接パースする実装（Worker の比較対象 / OQ-15）。
 *
 * # `pipeline` を動的 import にしている理由
 *
 * 静的 import にすると markdown-it 一式（本体 + entities + linkify-it + mdurl +
 * punycode + uc.micro で gzip 約 66KB 相当）が `main` チャンクにも入り、
 * `md-worker` と**二重に**クリティカルパスの予算を食う。
 *
 * **比較のためだけに存在する経路が、本命経路の予算を壊してはいけない。**
 * ここは必ず遅延させる。計測上は、この import の解決時間が
 * `parseMs` の外側に出る点に注意（初回のみ）。
 */
function createInlineParser(): MarkdownParser {
  let nextId = 1;
  const pipeline = import('../pipeline');

  return {
    async parse(text, options = {}) {
      const id = nextId++;
      const { renderChunks } = await pipeline;
      const { measure } = await import('../text-stats');
      const started = performance.now();
      const result = renderChunks(
        text,
        options.firstChunkBlocks ?? DEFAULT_FIRST_CHUNK_BLOCKS,
        options.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS,
      );
      return {
        type: 'parsed',
        id,
        chunks: result.chunks,
        outline: result.outline,
        frontMatter: result.frontMatter,
        parseMs: performance.now() - started,
        textStats: measure(text),
      };
    },
    dispose() {},
  };
}

export function createParser(site: 'worker' | 'main'): MarkdownParser {
  return site === 'worker' ? createWorkerParser() : createInlineParser();
}
