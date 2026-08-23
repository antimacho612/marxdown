/**
 * ブラウザ用のモック実装（`pnpm dev:web`）。
 *
 * 04.tech-stack.md §7.1: UI の反復を Tauri のビルドサイクルから切り離す。
 * Platform 層があることで、UI の 8 割はブラウザだけで開発できる。
 *
 * ファイルは `localStorage` 上の仮想 FS に置く。EOL/BOM/mtime のセマンティクスは
 * Rust 実装と同じ形で再現するが、**原子性と衝突検知の正しさは保証しない**。
 * そこは Rust 側のユニットテストの担当。
 */
import type {
  Bootstrap,
  DocumentPayload,
  OpenRequest,
  Platform,
  RecentEntry,
  SaveResult,
  WriteRequest,
} from './types'

const STORE_KEY = 'marxdown:web-fs'
const STATE_KEY = 'marxdown:web-state'

interface VirtualFile {
  content: string
  mtimeMs: number
}

function loadFs(): Record<string, VirtualFile> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, VirtualFile>
  } catch {
    return {}
  }
}

function saveFs(fs: Record<string, VirtualFile>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(fs))
  } catch {
    // 容量超過。dev 専用なので黙って諦める
  }
}

/** `src-tauri/src/store.rs` の `StoreData` に対応するモック。 */
interface WebState {
  recent: RecentEntry[]
  zoom: number
}

function loadState(): WebState {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Partial<WebState>
    return { recent: raw.recent ?? [], zoom: raw.zoom ?? 1 }
  } catch {
    return { recent: [], zoom: 1 }
  }
}

function saveState(state: WebState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // 容量超過。dev 専用なので黙って諦める
  }
}

const SAMPLE = `# Marxdown — dev:web

Tauri を起動せずに UI を反復するためのモック環境。ファイル I/O は
\`localStorage\` 上の仮想 FS に置き換わっている。

## 確認できること

- Markdown パイプラインと Worker
- プレビューのタイポグラフィとテーマ
- 段階的描画

## 確認できないこと

- 起動時間（WebView2 の初期化が無い）
- 単一インスタンスの argv 転送
- EOL / BOM の保持

\`\`\`ts
const platform: Platform = import.meta.env.DEV ? webPlatform : tauriPlatform
\`\`\`

> Platform 層があることで、この 2 つは同じ Domain 層から使える。
`

/** URL の `?file=` で内容を差し替えられるようにしておくと、fixture の確認が楽になる。 */
function initialBootstrap(): Bootstrap {
  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const path = params.get('file') ?? '/virtual/welcome.md'
  const fs = loadFs()
  const existing = fs[path]
  const content = existing?.content ?? SAMPLE
  const state = loadState()

  return {
    version: 1,
    document: {
      path,
      content,
      eol: 'lf',
      bom: false,
      encoding: 'utf8',
      mtimeMs: existing?.mtimeMs ?? Date.now(),
      size: new TextEncoder().encode(content).length,
      readonly: false,
    },
    documentError: null,
    mode: (params.get('mode') as Bootstrap['mode']) ?? null,
    spike: {
      bootstrap: 'script',
      parse: (params.get('parse') as 'worker' | 'main') ?? 'worker',
      paint: (params.get('paint') as 'progressive' | 'bulk') ?? 'progressive',
      render: (params.get('render') as 'react' | 'dom') ?? 'react',
    },
    trace: { enabled: params.has('trace'), t0EpochMs: Date.now() },
    pendingPaths: [],
    unknownArgs: [],
    recent: state.recent,
    zoom: state.zoom,
  }
}

let bootstrap: Bootstrap | null = null

export const webPlatform: Platform = {
  kind: 'web',

  getBootstrap() {
    bootstrap ??= initialBootstrap()
    return bootstrap
  },

  async takeBootstrap() {
    return this.getBootstrap()
  },

  async readDocument(path): Promise<DocumentPayload> {
    const fs = loadFs()
    const file = fs[path]
    if (!file) throw { kind: 'not-found', message: path }
    return {
      path,
      content: file.content,
      eol: 'lf',
      bom: false,
      encoding: 'utf8',
      mtimeMs: file.mtimeMs,
      size: new TextEncoder().encode(file.content).length,
      readonly: false,
    }
  },

  async writeDocument(req: WriteRequest): Promise<SaveResult> {
    const fs = loadFs()
    const existing = fs[req.path]
    if (existing && existing.mtimeMs !== req.expectedMtimeMs) {
      return { status: 'conflict', diskMtimeMs: existing.mtimeMs }
    }
    const mtimeMs = Date.now()
    fs[req.path] = { content: req.content, mtimeMs }
    saveFs(fs)
    return { status: 'saved', mtimeMs, size: new TextEncoder().encode(req.content).length }
  },

  async resolveAsset(href) {
    return href
  },

  async pushRecent(path) {
    const state = loadState()
    state.recent = [
      { path, openedAtMs: Date.now() },
      ...state.recent.filter((e) => e.path !== path),
    ].slice(0, 20)
    saveState(state)
    return state.recent
  },

  async removeRecent(path) {
    const state = loadState()
    state.recent = state.recent.filter((e) => e.path !== path)
    saveState(state)
    return state.recent
  },

  async setZoom(zoom) {
    const state = loadState()
    state.zoom = zoom
    saveState(state)
  },

  async ready() {
    // ブラウザにはウィンドウの表示制御が無い
  },

  async reportTrace(marks) {
    console.info('[marxdown] trace', marks)
  },

  async warmDone() {
    // ブラウザには argv 転送が無い
    return null
  },

  async openExternal(url) {
    globalThis.open(url, '_blank', 'noopener,noreferrer')
  },

  async revealInFileManager() {
    // ブラウザでは何もできない
  },

  onOpenRequest(_handler: (req: OpenRequest) => void) {
    return () => {}
  },
}
