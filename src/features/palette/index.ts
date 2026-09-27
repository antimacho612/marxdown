/**
 * palette feature の公開面。
 *
 * `main` に常駐するのは動的 import の入口だけである。
 * 外枠（`Palette.svelte`）も一覧の組み立ても `lazy/` にあり、押されるまで読み込まれない。
 *
 * `lazy/` を名指しする経路が 2 つある。
 * 見出しジャンプ（`features/outline`）が外枠を使い、ハンバーガーメニュー（`features/menu`）がラベルの表を使う。
 * どちらも遅延チャンク側どうしの参照である。
 */
export { openCommandPaletteLazily, openQuickOpenLazily } from './open-palette';
