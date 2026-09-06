/**
 * カスタム CSS の、起動が終わってからやること（02.architecture/10-theming.md §3）。
 *
 * `custom-css.ts`（適用そのもの）は FOUC 回避のため `main` に残るが、それ以外（64KB 超で bootstrap に載らなかった CSS の取得・読み込み失敗の通知・外部編集の購読）はすべてここにある。
 * `ready()` の後に動的 import される `settings` チャンクで、どれも IPC を伴い数十 ms 遅れても実害が無い。
 */
import { documentStore } from '@/features/document';
import { ja } from '@/i18n/ja';
import { getPlatform, type CustomCss } from '@/platform';

import { applyCustomCss, type CssSurface, type CustomCssResult } from '../custom-css';

/**
 * 面ごとの差分。異なるのはこの 3 つだけで、残りの処理は共有する（ADR-0013）。
 *
 * 読み直し・監視・通知の手順は同一であるため、面を増やす場合もこの表に 1 行追加するだけで済む形にしてある。
 */
const SURFACE = {
  preview: {
    read: () => getPlatform().readCustomCss(),
    watch: (handler: () => void) => getPlatform().onCustomCssChanged(handler),
    open: () => void getPlatform().openCustomCssFile(),
  },
  editor: {
    read: () => getPlatform().readEditorCss(),
    watch: (handler: () => void) => getPlatform().onEditorCssChanged(handler),
    open: () => void getPlatform().openEditorCssFile(),
  },
} as const satisfies Record<CssSurface, unknown>;

/**
 * 起動後の処理と購読の登録。`ready()` の後に 1 回だけ呼ぶ。
 *
 * `initial` は bootstrap に載っていた値、`applied` はそれを `bootstrap.ts` が適用した結果である。
 * 適用した側から結果を受け取ることで、適用できたかどうかをモジュール間の暗黙の状態にせずに済む。
 */
export function installCustomCss(surface: CssSurface, initial: CustomCss | null, applied: CustomCssResult): void {
  if (initial?.deferred) {
    // 64KB 超。ここで初めて IPC が 1 往復する（§3 の表の 3 行目）。
    void refreshCustomCss(surface);
  } else {
    report(surface, problemOf(initial, applied));
  }

  // 外部エディターで書き換えられたら適用し直す。
  // ファイルが後から作成された場合も通知される（Rust 側が親ディレクトリを監視している / 02.architecture/04-rust-responsibilities.md §4）。
  // 面ごとに別のイベントであるため、片方を書き換えてもう片方が読み直されることはない。
  SURFACE[surface].watch(() => void refreshCustomCss(surface));
}

/**
 * 読み直して適用し直す。差分は計算しない（`refreshSettings` と同じ判断）。
 *
 * ファイルが削除されていれば適用中のものを解除する。
 * `custom.css` の削除や改名がカスタム CSS を無効にする操作であり、再起動を必要とする理由がない。
 */
export async function refreshCustomCss(surface: CssSurface = 'preview'): Promise<void> {
  let loaded: CustomCss;
  try {
    loaded = await SURFACE[surface].read();
  } catch {
    // 読み直しに失敗したこと自体は通知しない（`refreshSettings` と同じ）。
    // 直前に適用した CSS のまま動作を続ける。
    return;
  }

  // サイズ超過で読めなかった場合は `css` が `null` になるが、適用中のものは解除しない。
  // 編集の途中で一時的にサイズが増えただけの可能性があり、そのたびに表示が既定へ戻るのは適切でない。
  const applied = loaded.problem ? 'empty' : applyCustomCss(loaded.css, surface);

  const problem = problemOf(loaded, applied);
  if (problem) {
    report(surface, problem);
    return;
  }
  // 解消していれば、自分が出した自動では消えない通知をここで閉じる（`refreshSettings` と同じ）。
  if (isOwnNotice(documentStore.notice?.message)) documentStore.notice = null;
}

/** 通知に出す理由。該当しなければ `null` を返す（ファイルが無いのは正常な状態）。 */
function problemOf(loaded: CustomCss | null, applied: CustomCssResult): string | null {
  if (loaded?.problem?.kind === 'too-large') return ja.customCss.tooLarge;
  if (loaded?.problem?.kind === 'unreadable') return ja.customCss.unreadable;
  if (applied === 'rejected') return ja.customCss.rejected;
  return null;
}

/** 自分が出した通知だけを閉じる。他の通知（本文の読み込み失敗など）を消さないためである。 */
const OWN_NOTICES = new Set<string>([ja.customCss.tooLarge, ja.customCss.unreadable, ja.customCss.rejected]);

function isOwnNotice(message: string | undefined): boolean {
  return message !== undefined && OWN_NOTICES.has(message);
}

/**
 * 通知バーに出す（03.ux-spec/07-status-and-notifications.md §2）。
 *
 * level は warning にする。
 * 本文は読めており、設定も反映されている。
 * 失敗したのは表示のカスタマイズの適用だけであり、`settings.json` を読めない（保存できない）場合とは重要度が異なる。
 *
 * 既に別の通知が表示されている場合は出さない。
 * 起動直後にこの関数が呼ばれる時点では、ファイルを開けなかった通知が表示されていることがある。
 * ユーザーの操作そのものが失敗した通知のほうが、カスタム CSS が適用されないことより重要である
 * （`reportStartupProblems` の「重要度の低いものから順に出す」と同じ理由）。
 */
function report(surface: CssSurface, message: string | null): void {
  if (message === null || documentStore.notice !== null) return;

  documentStore.notice = {
    level: 'warning',
    message,
    actions: [
      {
        // 修正対象のファイルを開くボタンにする。
        // 面が 2 つあるため、「カスタム CSS を開く」という表記ではどちらを開くのか判別できない。
        label: surface === 'editor' ? ja.customCss.openEditor : ja.customCss.open,
        run: SURFACE[surface].open,
      },
    ],
  };
}
