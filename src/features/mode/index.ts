/**
 * mode feature の公開面。
 *
 * モード間の移動だけを担当する。
 * モードの値そのものは `viewStore` が持つ（`features/panes` が `viewStore.panes` へ書くのと同じ形）。
 * 移動のたびに必要な処理（エディターのマウント、ライブ描画の停止、検索の開き直し）を呼ぶため、この feature だけが document / editor / preview を参照する。
 *
 * 遅延チャンクは持たない。`--mode edit` での起動が最初のフレームからここを通る。
 */
export { openFind, openReplace } from './find';
export { cycleMode, decideInitialMode, initMode, setMode, togglePreview, toggleSplit } from './mode';
