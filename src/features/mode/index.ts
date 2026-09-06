/**
 * mode feature の公開面（02.architecture/03-layers.md §2 / 03.ux-spec/02-modes.md）。
 *
 * 4 つのモードの間を移る仕事だけを持つ。**モードの値そのものは `viewStore` にある**
 * （`features/panes` が `viewStore.panes` へ書くのと同じ形）。
 * 移るたびに要るもの（エディターを載せる・ライブ描画を止める・検索を開き直す）を
 * 呼ぶため、この feature だけが document / editor / preview を知っている。
 *
 * 遅延チャンクを持たない。`--mode edit` での起動が最初のフレームからここを通る。
 */
export { openFind, openReplace } from './find';
export { cycleMode, decideInitialMode, initMode, setMode, togglePreview, toggleSplit } from './mode';
