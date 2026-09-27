/**
 * workspace feature の公開面。
 *
 * 遅延チャンクを持たない。Welcome 画面は引数なし起動の最初のフレームに要る。
 */
export { default as Welcome } from './Welcome.svelte';
export { workspaceOpenerHooks } from './opened';
export { copyTreeLazily } from './copy-tree';
export { openFolderViaDialog } from './open-folder';
export { collapseAll, reloadTree, setTreeRoot, setTreeRootFromFile, treeStore, workspaceRoot } from './tree.svelte';
export { installEntryWatch } from './relocate';
export { forgetRecent, recentStore, rememberRecent } from './recent.svelte';
export { default as Explorer } from './Explorer.svelte';
export {
  createInExplorer,
  registerExplorerCreate,
  registerExplorerFocus,
  registerTreeDrop,
  showExplorer,
  treeDropHandler,
} from './show-explorer';
export { resetSessionWatch, restoreSession, watchSession } from './session.svelte';
export { default as TabStrip } from './TabStrip.svelte';
export { moveCurrentTabToMainLazily, receiveTabLazily } from './join-window';
export {
  moveCurrentTabToSatellite,
  moveTabToSatellite,
  openPathInSatellite,
  restoreTransferredState,
  takeTabTransfer,
  type TabTransfer,
} from './new-window';
export {
  activateTab,
  adoptOpened,
  closeTab,
  cycleTab,
  isTabDirty,
  moveTab,
  openInNewTab,
  openPathInNewTab,
  openPathsInTabs,
  openUntitledTab,
  reopenClosedTab,
  resetTabs,
  selectTabAt,
  tabMeta,
  targetTabKey,
  tabsStore,
  type Tab,
} from './tabs.svelte';
