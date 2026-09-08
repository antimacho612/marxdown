/**
 * 前回のタブの記録と復元（OQ-04 / F-NAV-01 / M3 Phase 7）。
 *
 * **引数なしで起動したときだけ復元する。** `marxdown foo.md` には「foo.md を見たい」という
 * 意図があり、そこへ前回の 8 枚を混ぜない。判断は Rust 側にあり（`src-tauri/src/bootstrap.rs`）、
 * ここに届く `session` は復元してよいものだけである。
 *
 * 覚えるのはパスと並び順だけである。
 * 未保存の本文は持たない。`state.json` がドキュメントの複製を抱えることになり、
 * 触っていないバイト列を保持しないという方針（N-CMP-03）とも噛み合わない。
 */
import { getPlatform } from '@/platform';

import { openPathInNewTab, selectTabAt, tabMeta, tabsStore } from './tabs.svelte';

/** 最後に書いた内容。同じ状態を何度も書かないための照合に使う。 */
let written = '';

/**
 * 表示していた 1 枚以外を、元の位置へ開き直す。
 *
 * 表示していた 1 枚は bootstrap に載って既に開かれている（`document`）。
 * 添字の順に挿入するので、最後には元の並びに戻る。
 *
 * 最近開いたファイルには積み直さない。
 * 起動しただけで一覧が前回のタブで埋まると、「最後に開いた順」の意味が失われる。
 */
export async function restoreSession(paths: readonly string[], active: number): Promise<void> {
  for (const [index, path] of paths.entries()) {
    if (index === active) continue;
    // eslint-disable-next-line no-await-in-loop -- 添字の挿入が前の 1 枚の完了に依存する（並行にすると並びが崩れる）
    await openPathInNewTab(path, { index, remember: false });
  }
  // 開き直した分だけ表示が移っている。元のタブへ戻す。
  await selectTabAt(active + 1);
}

/**
 * タブの変化を `state.json` へ書き続ける。解除する関数を返す。
 *
 * コンポーネントではないので `$effect.root` で効果を張る器を自作する
 * （`features/editor/lazy/watch-settings.svelte.ts` と同じ形）。
 *
 * デバウンスしない。ペインの幅と違い、ドラッグ中に毎フレーム変わる値ではない。
 * 並べ替えも掴んでいる間ではなく、離した時点で 1 回だけ動く（`moveTab`）。
 */
export function watchSession(): () => void {
  return $effect.root(() => {
    $effect(() => {
      const kept = tabsStore.tabs
        .map((tab) => ({ id: tab.id, path: tabMeta(tab).path }))
        // パスを持たないタブ（`Ctrl+N`）は覚えない。開き直せないものを載せても意味がない。
        .filter((entry): entry is { id: number; path: string } => entry.path !== null);

      const paths = kept.map((entry) => entry.path);
      // 表示中のタブがパスを持たない場合は先頭に落とす。
      const active = Math.max(
        0,
        kept.findIndex((entry) => entry.id === tabsStore.activeId),
      );

      const next = JSON.stringify({ paths, active });
      if (next === written) return;
      written = next;

      // 失敗しても伝えない。タブを操作するたびに呼ばれる経路で通知を出さない。
      void getPlatform().setSession(paths, active).catch(noop);
    });
  });
}

function noop(): void {}

/** テスト用。最後に書いた内容を忘れる。 */
export function resetSessionWatch(): void {
  written = '';
}
