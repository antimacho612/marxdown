/**
 * カスタム CSS の、**起動が終わってからやること**（02.architecture.md §10.3 / §5.1）。
 *
 * # なぜ分かれているか
 *
 * `custom-css.ts`（適用そのもの）は `main` に載る。bootstrap 同梱の CSS を
 * 本文より前に当てないと FOUC になるため、そこだけは遅延できない。
 *
 * **残りはすべてここ。** このモジュールは `ready()` の後に動的 import され、
 * `settings` チャンクに入る（06.roadmap.md §5.3 の完了条件）。
 * ここでやることは 3 つで、どれも IPC を伴い、数十 ms 遅れても実害がない。
 *
 * 1. 64KB を超えて bootstrap に載らなかった CSS を取りに行く
 * 2. 読めなかった / 大きすぎた / 包めなかったことを通知バーに出す
 * 3. 外部エディタでの編集を購読して当て直す（**設定を試行錯誤できることが目的**）
 */
import { documentStore } from '@/features/document/store.svelte';
import { ja } from '@/i18n/ja';
import { getPlatform, type CustomCss } from '@/platform';

import { applyCustomCss, type CustomCssResult } from './custom-css';

/**
 * 起動時の後始末と購読の登録。**`ready()` の後に 1 回だけ呼ぶ。**
 *
 * `initial` は bootstrap に載っていた値、`applied` はそれを
 * `bootstrap.ts` が当てた結果。**当てた側から結果を受け取る**ことで、
 * 「適用できたか」をモジュール間の暗黙の状態にせずに済む。
 */
export function installCustomCss(initial: CustomCss | null, applied: CustomCssResult): void {
  if (initial?.deferred) {
    // 64KB 超。ここで初めて IPC が 1 往復する（§10.3 の表の 3 行目）。
    void refreshCustomCss();
  } else {
    report(problemOf(initial, applied));
  }

  // 外部エディタで書き換えられたら当て直す。**ファイルが後から作られた場合も届く**
  // （Rust 側が親ディレクトリを見ている / §4.4）。
  getPlatform().onCustomCssChanged(() => void refreshCustomCss());
}

/**
 * 読み直して当て直す。**差分は取らない**（`refreshSettings` と同じ判断）。
 *
 * 消えていたら当てていたものを外す。`custom.css` を消す / 名前を変えるのが
 * 「カスタム CSS をやめる」操作であり、再起動を待たせる理由がない。
 */
export async function refreshCustomCss(): Promise<void> {
  let loaded: CustomCss;
  try {
    loaded = await getPlatform().readCustomCss();
  } catch {
    // 読み直せなかったこと自体は伝えない（`refreshSettings` と同じ）。
    // 直前に当てた CSS のまま動き続ける。
    return;
  }

  // 大きすぎて読めなかったときは `css` が `null` で来るが、**当てているものは外さない**。
  // 編集の途中で一時的に膨らんだだけかもしれず、そのたびに見た目が戻るのは煩わしい。
  const applied = loaded.problem ? 'empty' : applyCustomCss(loaded.css);

  const problem = problemOf(loaded, applied);
  if (problem) {
    report(problem);
    return;
  }
  // 直っていたら、自分が出した消えない通知を自分で下げる（`refreshSettings` と同じ）。
  if (isOwnNotice(documentStore.notice?.message)) documentStore.notice = null;
}

/** 通知に出すべき理由。無ければ `null`（ファイルが無いのは正常な状態）。 */
function problemOf(loaded: CustomCss | null, applied: CustomCssResult): string | null {
  if (loaded?.problem?.kind === 'too-large') return ja.customCss.tooLarge;
  if (loaded?.problem?.kind === 'unreadable') return ja.customCss.unreadable;
  if (applied === 'rejected') return ja.customCss.rejected;
  return null;
}

/** 自分が出した通知だけを下げる。他の通知（本文の失敗など）を巻き込まないため。 */
const OWN_NOTICES = new Set<string>([ja.customCss.tooLarge, ja.customCss.unreadable, ja.customCss.rejected]);

function isOwnNotice(message: string | undefined): boolean {
  return message !== undefined && OWN_NOTICES.has(message);
}

/**
 * 通知バーに出す（03.ux-spec.md §8.2）。
 *
 * **level は warning。** 本文は読めているし、設定も効いている。
 * 失敗したのは「見た目の好み」の適用だけで、`settings.json` が読めない
 * （＝保存できない）のとは重さが違う。
 *
 * **既に何か出ているときは譲る。** 起動直後にここが呼ばれる時点では、
 * 「ファイルを開けなかった」通知が出ていることがある。ユーザーがやろうとした
 * こと自体の失敗のほうが、カスタム CSS が当たらないことより重い
 * （`reportStartupProblems` の「弱いものから順に出す」と同じ理由）。
 */
function report(message: string | null): void {
  if (message === null || documentStore.notice !== null) return;

  documentStore.notice = {
    level: 'warning',
    message,
    actions: [
      {
        label: ja.customCss.open,
        run: () => void getPlatform().openCustomCssFile(),
      },
    ],
  };
}
