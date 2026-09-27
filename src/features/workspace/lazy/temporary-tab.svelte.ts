/**
 * 仮タブ（ADR-0025）。ファイルツリーの単一クリックで開き、次の単一クリックで置き換わるタブ。
 *
 * タブのモデル（`tabs.svelte.ts`）には `Tab.temporary` の印だけを置き、開く・置き換える・固定する処理はここに置く。
 * 使うのはファイルツリーとタブの右クリックメニューだけで、どちらも遅延チャンクにあるためである。
 */
import { documentStore } from '@/features/document';

import { closeTab, openPathInNewTab, tabMeta, tabsStore } from '../tabs.svelte';

/** 実行中の `openPathInTemporaryTab`。ダブルクリックでの固定は、直前の単一クリックで開き終わるのを待ってから行う。 */
let pending: Promise<boolean> = Promise.resolve(true);

let watching = false;

/**
 * パスを仮タブで開く。
 *
 * 既に開いているファイルなら、そのタブへ切り替えるだけで仮タブにはしない。
 * 仮タブがあれば、その位置に新しいタブを開いてから古い仮タブを閉じる。
 * 置き換えた仮タブは「閉じたタブを再度開く」の対象にしない。閉じる操作をしていないためである。
 */
export function openPathInTemporaryTab(path: string): Promise<boolean> {
  pending = replace(path);
  return pending;
}

/** そのタブを通常のタブにする（タブのダブルクリック / 右クリックメニューの「保持」）。 */
export function keepTab(id: number): void {
  const tab = tabsStore.tabs.find((entry) => entry.id === id);
  if (tab?.temporary) tab.temporary = false;
}

/**
 * そのパスのタブを通常のタブにする（ファイルツリーのダブルクリック）。
 *
 * ダブルクリックの前に届く 2 回の `click` で仮タブを開き始めているため、開き終わるのを待つ。
 */
export async function keepTabOf(path: string): Promise<void> {
  await pending;
  const tab = tabsStore.tabs.find((entry) => tabMeta(entry).path === path);
  if (tab !== undefined) keepTab(tab.id);
}

async function replace(path: string): Promise<boolean> {
  if (tabsStore.tabs.some((tab) => tabMeta(tab).path === path)) return openPathInNewTab(path);

  watchEdits();
  const index = tabsStore.tabs.findIndex((tab) => tab.temporary);
  if (!(await openPathInNewTab(path, index === -1 ? {} : { index }))) return false;

  const opened = tabsStore.active;
  if (opened === null) return true;
  opened.temporary = true;
  // 続けてクリックされると、開き終わる前に次の置き換えが始まる。1 件に限らず、自分以外の仮タブをすべて閉じる。
  const stale = tabsStore.tabs.filter((tab) => tab.temporary && tab.id !== opened.id);
  await Promise.all(stale.map((tab) => closeTab(tab.id, { remember: false })));
  return true;
}

/**
 * 表示中の仮タブが編集されたら通常のタブにする。
 *
 * 判定はダーティになったかで行う。改行コードの変更も編集に含める。
 * 仮タブが無い間は監視しないよう、最初に仮タブを開くときに登録する。登録はウィンドウの寿命と同じだけ残す。
 */
function watchEdits(): void {
  if (watching) return;
  watching = true;
  $effect.root(() => {
    $effect(() => {
      if (!documentStore.isDirty) return;
      const active = tabsStore.active;
      // 切り替えの途中は、`documentStore` がまだ前のタブの状態を持っている（`tabsStore.loadedId`）。
      if (active?.temporary && active.id === tabsStore.loadedId) active.temporary = false;
    });
  });
}
