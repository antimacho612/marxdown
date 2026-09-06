/**
 * ドキュメントの派生状態（02.architecture/08-state-management.md §1 / ADR-0005）。
 *
 * 本文（CodeMirror の `EditorState` / Preview の HTML 文字列）はここに複製しない。
 * UI が購読するのはダーティ・カーソル位置・アウトライン・メタ情報などの派生値だけである。
 * `.svelte.ts` にしてあるのは、ルーンの対象判定が拡張子ベースのためであり、これにより UI の外（`open.ts` / `bootstrap.ts` など）からも同じオブジェクトを素の代入で読み書きできる（ADR-0005 D2）。
 */
import type { OutlineItem } from '@/markdown/plugins/line-map';
import type { TextStats } from '@/markdown/text-stats';
import type { DocumentMeta, DocumentPayload, Eol } from '@/platform';

/**
 * ストアが持つメタ情報。
 *
 * `path` が `null` なのは、まだ一度も保存していない文書だけである（`Ctrl+N` / `document/new.ts`）。
 * Rust から届く `DocumentMeta` は必ずパスを持つため、`null` を作れるのはフロント側の 1 か所のみである。
 * パスの有無で振る舞いが変わる場所（監視・履歴・相対パスの画像・保存先など）は「対応を忘れると静かに壊れる」側なので、`string | null` にすることで使う場所をコンパイル時に全部洗い出せるようにしてある。
 */
export type StoredMeta = Omit<DocumentMeta, 'path'> & { path: string | null };

/** 本文つき。無題の文書（`Ctrl+N`）も同じ形で開く経路に渡せる。 */
export type StoredPayload = Omit<DocumentPayload, 'path'> & { path: string | null };

/** 通知バーの選択肢（03.ux-spec/07-status-and-notifications.md §2 の「再読み込み / 無視」など）。 */
export interface NoticeAction {
  label: string;
  run: () => void;
}

/**
 * 通知バー（03.ux-spec/07-status-and-notifications.md §2）。本文の上に薄く重ねる。
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
   * 03.ux-spec/07-status-and-notifications.md §2 が自動消滅を認めているのは情報通知だけなので、
   * 警告・エラーには付けないこと。
   */
  autoDismissMs?: number;
}

/** 情報通知の既定寿命（03.ux-spec/07-status-and-notifications.md §2「3 秒で自動消滅」）。 */
export const INFO_NOTICE_MS = 3000;

/**
 * カーソル位置（03.ux-spec/07-status-and-notifications.md §3）。**1 始まり**（Monaco と同じ）。
 *
 * 列は**桁**であってバイト数でも文字数でもない。Monaco の `column` をそのまま出す。
 */
export interface CursorPosition {
  line: number;
  column: number;
}

/** 描画の計測結果。開発ビルドのステータスバーに出す。 */
export interface RenderStats {
  parseMs: number;
  paintMs: number;
  chunks: number;
}

class DocumentStore {
  meta = $state<StoredMeta | null>(null);
  isDirty = $state(false);
  outline = $state<OutlineItem[]>([]);
  frontMatter = $state<string | null>(null);
  stats = $state<RenderStats | null>(null);
  /** 文字数と読了時間（03.ux-spec/07-status-and-notifications.md §3）。パイプラインが数えた派生値。 */
  textStats = $state<TextStats | null>(null);
  /**
   * カーソル位置（03.ux-spec/07-status-and-notifications.md §3）。
   *
   * **エディターが載っていないあいだは `null`。** Preview だけで読んでいるときに
   * カーソルは存在しない（§3 の但し書き「Preview では非表示」の実体はこれ）。
   *
   * 更新は **rAF で間引く**（ADR-0005 / 02.architecture/08-state-management.md §1）。
   * 押しっぱなしの矢印キーは 1 フレームに何度も位置を動かすが、
   * 画面に出るのはフレームに 1 回でよい。間引きは `features/editor/lazy/cursor.ts`。
   */
  cursor = $state<CursorPosition | null>(null);
  /**
   * 保存するときに書き戻す EOL の希望（F-EDIT-14 / 03.ux-spec/07-status-and-notifications.md §3 の「クリックで EOL 変換」）。
   * `null` はディスクのまま。
   *
   * `meta` はディスクの姿そのもの（`mtimeMs` で衝突を検知し、`readonly` で書き込み可否を判断する）であり、これから変えたい値を混ぜると意味が場所ごとに変わるため分けてある。
   * 分けておくことで戻したことも表現できる。
   * `LF → CRLF → LF` と押すとここが `null` に戻り、ダーティも自然に外れる（`document/eol.ts`）。
   */
  eolOverride = $state<Eol | null>(null);

  #notice = $state<Notice | null>(null);

  /**
   * 自動消滅タイマー。
   *
   * 通知を出す側（`open.ts` など）は UI の外にいるため、タイマーはストアが持つ。
   * **1 回きりの `setTimeout` であって、ポーリングではない**
   * （05.performance-budget/04-targets.md §5「アイドル時のタイマーを増やさない」）。
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

/** 情報通知を出す。3 秒で自動的に消える（03.ux-spec/07-status-and-notifications.md §2）。 */
export function notifyInfo(message: string): void {
  documentStore.notice = {
    level: 'info',
    message,
    autoDismissMs: INFO_NOTICE_MS,
  };
}
