/**
 * workspace feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 遅延チャンクを持たない。Welcome 画面は引数なし起動の最初のフレームに要る。
 * M3 でタブとファイルツリーが入る場所なので、増えたぶんの出し入れもここで決める。
 */
export { default as Welcome } from './Welcome.svelte';
export { workspaceOpenerHooks } from './opened';
export { forgetRecent, recentStore, rememberRecent } from './recent.svelte';
export {
  activateTab,
  adoptOpened,
  closeTab,
  isTabDirty,
  openInNewTab,
  resetTabs,
  tabsStore,
  type Tab,
} from './tabs.svelte';
