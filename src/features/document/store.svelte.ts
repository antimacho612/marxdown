/**
 * ドキュメントの派生状態（02.architecture.md §8.1 / ADR-0005 / ADR-0007）。
 *
 * # ここに本文を置いてはいけない
 *
 * CodeMirror の `EditorState` と Preview の HTML 文字列は、このストアに複製しない。
 * 1 打鍵ごとに巨大な文字列がリアクティビティを通過すると、入力レスポンス 16ms を満たせない。
 *
 * UI が購読するのは以下の**派生値だけ**。
 * - ダーティかどうか（boolean）
 * - カーソル位置（rAF スロットル）
 * - アウトライン（デバウンス）
 * - メタ情報（パス / EOL / エンコーディング / サイズ）
 *
 * # なぜ `.svelte.ts` なのか
 *
 * ルーン（`$state`）はコンパイラが変換する構文であり、拡張子で対象を判別する。
 * ストアを `.svelte.ts` に置くことで、**UI の外**（`open.ts` / `bootstrap.ts` /
 * リンクハンドラ）からも同じオブジェクトを素の代入で読み書きできる。
 * これは ADR-0005 が Zustand に求めていた性質そのもので、Svelte では依存なしで満たせる。
 */
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

class DocumentStore {
  meta = $state<DocumentMeta | null>(null);
  isDirty = $state(false);
  outline = $state<OutlineItem[]>([]);
  frontMatter = $state<string | null>(null);
  stats = $state<RenderStats | null>(null);
  /** 文字数と読了時間（03.ux-spec.md §8.3）。Worker が数えた派生値。 */
  textStats = $state<TextStats | null>(null);

  #notice = $state<Notice | null>(null);

  /**
   * 自動消滅タイマー。
   *
   * 通知を出す側（`open.ts` など）は UI の外にいるため、タイマーはストアが持つ。
   * **1 回きりの `setTimeout` であって、ポーリングではない**
   * （05.performance-budget.md §4.5「アイドル時のタイマーを増やさない」）。
   */
  #dismissTimer: ReturnType<typeof setTimeout> | null = null;

  get notice(): Notice | null {
    return this.#notice;
  }

  /**
   * 代入するだけで自動消滅のタイマーが張り替わる。
   *
   * 個別の setter メソッドを置かずにアクセサにしているのは、
   * **通知の設定経路を 1 本にするため**。`store.notice = x` 以外の入口を作ると、
   * タイマーを張り忘れた経路がいつか生まれる。
   */
  set notice(notice: Notice | null) {
    this.#notice = notice;
    this.#scheduleDismiss(notice);
  }

  #scheduleDismiss(notice: Notice | null): void {
    if (this.#dismissTimer !== null) {
      clearTimeout(this.#dismissTimer);
      this.#dismissTimer = null;
    }
    if (notice?.autoDismissMs === undefined) return;

    this.#dismissTimer = setTimeout(() => {
      this.#dismissTimer = null;
      // 表示中の通知が差し替わっていたら何もしない
      if (this.#notice === notice) this.#notice = null;
    }, notice.autoDismissMs);
  }
}

export const documentStore = new DocumentStore();

/** 情報通知を出す。3 秒で自動的に消える（03.ux-spec.md §8.2）。 */
export function notifyInfo(message: string): void {
  documentStore.notice = {
    level: 'info',
    message,
    autoDismissMs: INFO_NOTICE_MS,
  };
}
