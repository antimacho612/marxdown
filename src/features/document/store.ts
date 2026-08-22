/**
 * ドキュメントの派生状態（02.architecture.md §8.1 / ADR-0005）。
 *
 * # ここに本文を置いてはいけない
 *
 * CodeMirror の `EditorState` と Preview の HTML 文字列は React の state に複製しない。
 * 1 打鍵ごとに巨大な文字列が React を通過すると、入力レスポンス 16ms を満たせない。
 *
 * React が購読するのは以下の**派生値だけ**。
 * - ダーティかどうか（boolean）
 * - カーソル位置（rAF スロットル）
 * - アウトライン（デバウンス）
 * - メタ情報（パス / EOL / エンコーディング / サイズ）
 */
import { create } from 'zustand'

import type { OutlineItem } from '@/markdown/plugins/line-map'
import type { DocumentMeta } from '@/platform'

export interface Notice {
  level: 'info' | 'warning' | 'error'
  message: string
}

/** M0 の計測結果。ステータスバーに出して、開発中に常に目に入るようにする。 */
export interface RenderStats {
  parseMs: number
  paintMs: number
  chunks: number
  site: 'worker' | 'main'
  strategy: 'progressive' | 'bulk'
}

interface DocumentState {
  meta: DocumentMeta | null
  isDirty: boolean
  outline: OutlineItem[]
  frontMatter: string | null
  notice: Notice | null
  stats: RenderStats | null

  setMeta(meta: DocumentMeta | null): void
  setDirty(dirty: boolean): void
  setOutline(outline: OutlineItem[]): void
  setFrontMatter(frontMatter: string | null): void
  setNotice(notice: Notice | null): void
  setStats(stats: RenderStats | null): void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  meta: null,
  isDirty: false,
  outline: [],
  frontMatter: null,
  notice: null,
  stats: null,

  setMeta: (meta) => set({ meta }),
  setDirty: (isDirty) => set({ isDirty }),
  setOutline: (outline) => set({ outline }),
  setFrontMatter: (frontMatter) => set({ frontMatter }),
  setNotice: (notice) => set({ notice }),
  setStats: (stats) => set({ stats }),
}))
