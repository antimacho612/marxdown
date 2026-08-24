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
import { create } from 'zustand';

import type { OutlineItem } from '@/markdown/plugins/line-map';
import type { TextStats } from '@/markdown/text-stats';
import type { DocumentMeta } from '@/platform';

/** 通知バーの選択肢（03.ux-spec.md §8.2 の「再読み込み / 無視」など）。 */
export interface NoticeAction {
  label: string;
  run: () => void;
}

/**
 * 通知バー（03.ux-spec.md §8.2）。本文の上に薄く重ねる。
 *
 * **モーダルダイアログはデータ消失の可能性がある場面だけに限定する**という
 * 方針の受け皿。読み込み失敗も外部変更もここに出る。
 */
export interface Notice {
  level: 'info' | 'warning' | 'error';
  message: string;
  /** 操作が必要な通知の選択肢。空なら情報通知。 */
  actions?: NoticeAction[];
  /**
   * この ms 後に自動で消える。`undefined` は消えない。
   * §8.2 が自動消滅を認めているのは情報通知だけなので、
   * 警告・エラーには付けないこと。
   */
  autoDismissMs?: number;
}

/** 情報通知の既定寿命（03.ux-spec.md §8.2「3 秒で自動消滅」）。 */
export const INFO_NOTICE_MS = 3000;

/** 描画の計測結果。開発ビルドのステータスバーに出す。 */
export interface RenderStats {
  parseMs: number;
  paintMs: number;
  chunks: number;
  site: 'worker' | 'main';
}

interface DocumentState {
  meta: DocumentMeta | null;
  isDirty: boolean;
  outline: OutlineItem[];
  frontMatter: string | null;
  notice: Notice | null;
  stats: RenderStats | null;
  /** 文字数と読了時間（03.ux-spec.md §8.3）。Worker が数えた派生値。 */
  textStats: TextStats | null;

  setMeta(meta: DocumentMeta | null): void;
  setDirty(dirty: boolean): void;
  setOutline(outline: OutlineItem[]): void;
  setFrontMatter(frontMatter: string | null): void;
  setNotice(notice: Notice | null): void;
  setStats(stats: RenderStats | null): void;
  setTextStats(textStats: TextStats | null): void;
}

/**
 * 自動消滅タイマー。
 *
 * React の effect ではなくストア側に置いているのは、通知を出す側（`open.ts` など）が
 * React の外にいるため。**1 回きりの `setTimeout` であって、ポーリングではない**
 * （05.performance-budget.md §4.5「アイドル時のタイマーを増やさない」）。
 */
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDismiss(notice: Notice | null, dismiss: () => void): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (notice?.autoDismissMs === undefined) return;
  const target = notice;
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    // 表示中の通知が差し替わっていたら何もしない
    if (useDocumentStore.getState().notice === target) dismiss();
  }, notice.autoDismissMs);
}

export const useDocumentStore = create<DocumentState>((set) => ({
  meta: null,
  isDirty: false,
  outline: [],
  frontMatter: null,
  notice: null,
  stats: null,
  textStats: null,

  setMeta: (meta) => set({ meta }),
  setDirty: (isDirty) => set({ isDirty }),
  setOutline: (outline) => set({ outline }),
  setFrontMatter: (frontMatter) => set({ frontMatter }),
  setNotice: (notice) => {
    set({ notice });
    scheduleDismiss(notice, () => set({ notice: null }));
  },
  setStats: (stats) => set({ stats }),
  setTextStats: (textStats) => set({ textStats }),
}));

/** 情報通知を出す。3 秒で自動的に消える（03.ux-spec.md §8.2）。 */
export function notifyInfo(message: string): void {
  useDocumentStore.getState().setNotice({
    level: 'info',
    message,
    autoDismissMs: INFO_NOTICE_MS,
  });
}
