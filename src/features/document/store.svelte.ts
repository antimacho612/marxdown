/**
 * ドキュメントの派生状態（02.architecture/08-state-management.md §1 / ADR-0005）。
 *
 * 本文（Monaco の `ITextModel` / Preview の HTML 文字列）はここに複製しない。
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

/**
 * 本文を落としてメタ情報だけにする。
 *
 * `StoredPayload` は `StoredMeta` を構造的に満たすため、そのまま代入しても型は通る。
 * ただし実行時には `content` が残り、ストアが本文を保持し続けることになる（ADR-0005）。
 * `huge.md` では 2MB がここに繋がったままになり、タブが入ると枚数ぶん積算する。
 */
export function toMeta(payload: StoredPayload): StoredMeta {
  const { path, eol, bom, encoding, mtimeMs, size, readonly } = payload;
  return { path, eol, bom, encoding, mtimeMs, size, readonly };
}

/** 通知バーの選択肢（03.ux-spec/07-status-and-notifications.md §2 の「再読み込み / 無視」など）。 */
export interface NoticeAction {
  label: string;
  run: () => void;
}

/**
 * 通知バー（03.ux-spec/07-status-and-notifications.md §2）。本文の上に薄く重ねる。
 *
 * モーダルダイアログはデータ消失の可能性がある場面だけに限定するという方針の受け皿である。
 * 読み込みの失敗も、編集中に外部で変更されたこともここに表示する。
 *
 * ここに出すのは、選択を求めるものと、失敗を伝えるものだけである。
 * 済んだことを伝えるだけのメッセージは本文の上に重ねず、ステータスバー（`DocumentStore.statusMessage`）へ回す。
 * 自動で消える仕組みを持たないのはそのためで、ここに出したものは操作するまで残る。
 */
export interface Notice {
  level: 'info' | 'warning' | 'error';
  message: string;
  /** 操作が必要な通知の選択肢。 */
  actions?: NoticeAction[];
}

/**
 * ステータスバーの一時メッセージが消えるまでの時間（03.ux-spec/07-status-and-notifications.md §2「3 秒で自動消滅」）。
 *
 * NOTE: §2 は情報を通知バーに出す前提で書かれているが、本文の上に重なるのが読書の妨げになるため、
 * 自動で消える情報だけステータスバーへ移した（issue #60）。消える時間は §2 のままである。
 */
export const STATUS_MESSAGE_MS = 3000;

/**
 * カーソル位置（03.ux-spec/07-status-and-notifications.md §3）。行も列も 1 始まりで、Monaco と同じである。
 *
 * 列は桁であり、バイト数でも文字数でもない。Monaco の `column` をそのまま表示する。
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
   * エディターがマウントされていない間は `null` になる。
   * Preview だけで表示しているときはカーソルが存在しない（§3 の但し書き「Preview では非表示」の実体はこれ）。
   *
   * 更新は rAF で間引く（ADR-0005 / 02.architecture/08-state-management.md §1）。
   * 押しっぱなしの矢印キーは 1 フレームに何度も位置を変えるが、画面の更新はフレームに 1 回で足りる。
   * 間引きは `features/editor/lazy/cursor.ts` が行う。
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

  /** 通知バーの内容。操作するまで消えない（`Notice`）。 */
  notice = $state<Notice | null>(null);

  #statusMessage = $state<string | null>(null);

  /**
   * 自動消滅タイマー。
   *
   * メッセージを出す側（`open.ts` など）は UI の外にあるため、タイマーはストアが持つ。
   * 1 回だけの `setTimeout` であり、ポーリングではない（05.performance-budget/04-targets.md §5「アイドル時のタイマーを増やさない」）。
   */
  #dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * ステータスバーに一時表示するメッセージ。
   *
   * 済んだことを伝えるだけの内容はここに出す（「外部の変更を読み込みました」など）。
   * 本文の上に重ねると、読んでいる最中に本文の先頭が隠れる。
   */
  get statusMessage(): string | null {
    return this.#statusMessage;
  }

  /**
   * 代入するだけで自動消滅のタイマーが張り替わる。
   *
   * 個別の setter メソッドを置かずにアクセサにしているのは、メッセージを設定する経路を 1 本にするためである。
   * `store.statusMessage = x` 以外の入口を作ると、タイマーの設定が漏れた経路が生まれる。
   */
  set statusMessage(message: string | null) {
    this.#statusMessage = message;
    this.#scheduleDismiss(message);
  }

  #scheduleDismiss(message: string | null): void {
    if (this.#dismissTimer !== null) {
      clearTimeout(this.#dismissTimer);
      this.#dismissTimer = null;
    }
    if (message === null) return;

    this.#dismissTimer = setTimeout(() => {
      this.#dismissTimer = null;
      // 表示中のメッセージが差し替わっていたら何もしない
      if (this.#statusMessage === message) this.#statusMessage = null;
    }, STATUS_MESSAGE_MS);
  }
}

/** ドキュメントの派生状態。モジュールの singleton として共有する。 */
export const documentStore = new DocumentStore();

/** ステータスバーに一時メッセージを出す。3 秒で自動的に消える（03.ux-spec/07-status-and-notifications.md §2）。 */
export function notifyStatus(message: string): void {
  documentStore.statusMessage = message;
}
