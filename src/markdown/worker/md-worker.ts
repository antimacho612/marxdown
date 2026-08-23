/**
 * Markdown Worker 本体。
 *
 * これが `md-worker` チャンクのエントリになる（02.architecture.md §5.3）。
 * `main` と合わせて 150KB (gzip) の予算に収める対象。
 *
 * このファイルから DOM API を参照してはいけない。参照した瞬間にビルドは通るが
 * 実行時に落ちる。DOMPurify がここに来られないのもこれが理由（04.tech-stack.md §10）。
 */
import { renderChunks } from '../pipeline'
import { measure } from '../text-stats'
import type { WorkerRequest, WorkerResponse } from './protocol'

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  if (req.type !== 'parse') return

  const started = performance.now()
  try {
    const result = renderChunks(req.text, req.firstChunkBlocks, req.chunkBlocks)

    const response: WorkerResponse = {
      type: 'parsed',
      id: req.id,
      chunks: result.chunks,
      outline: result.outline,
      frontMatter: result.frontMatter,
      parseMs: performance.now() - started,
      textStats: measure(req.text),
    }
    self.postMessage(response)
  } catch (e) {
    const response: WorkerResponse = {
      type: 'error',
      id: req.id,
      message: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(response)
  }
})
