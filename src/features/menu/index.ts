/**
 * menu feature の公開面（02.architecture/03-layers.md §2）。
 *
 * 公開するのは型だけである。
 * 中身（`lazy/`）は操作されるまで読み込まないものであり、値を再エクスポートするとボタン側（`app/MenuButton.svelte`）から静的に参照できてしまう（`features/status` と同じ形）。
 * 本体は `lazy/AppMenu.svelte` を動的 import で参照する。
 */
export type { AppMenu } from './props';
