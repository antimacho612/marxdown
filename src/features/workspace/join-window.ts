/**
 * 既にあるウィンドウへタブを移す・受け取る処理の入口（OQ-43）。
 *
 * 動的 import だけを持つモジュールとして切り出してある（`palette/open-palette.ts` と同じ形）。
 * 実体（`lazy/handoff.ts`）は `new-window.ts` を import するため、入口を `new-window.ts` に置くと循環する。
 */
import { MAIN_WINDOW, type TabArrival } from '@/platform';

import type * as HandoffModule from './lazy/handoff';
import { tabsStore } from './tabs.svelte';

let loaded: Promise<typeof HandoffModule> | null = null;

/**
 * 実体を 1 度だけ読み込む。
 *
 * 毎回同じ `Promise` を返すため、呼んだ順に `then` が処理される。
 * タブのドラッグ（`TabStrip.svelte`）はこの順序に頼っている。
 */
export function loadHandoff(): Promise<typeof HandoffModule> {
  loaded ??= import('./lazy/handoff');
  return loaded;
}

/** いま表示しているタブをメインウィンドウへ戻す。サテライトのコマンド表から呼ぶ。 */
export async function moveCurrentTabToMainLazily(): Promise<boolean> {
  const id = tabsStore.activeId;
  if (id === null) return false;
  const { moveTabToWindow } = await loadHandoff();
  return moveTabToWindow(id, MAIN_WINDOW);
}

/** 別のウィンドウから移されてきたタブを受け取る。実体は初めて届いたときに読み込む。 */
export async function receiveTabLazily(arrival: TabArrival): Promise<boolean> {
  const { receiveTab } = await loadHandoff();
  return receiveTab(arrival);
}
