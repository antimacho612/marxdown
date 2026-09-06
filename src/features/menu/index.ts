/**
 * menu feature の公開面（02.architecture/03-layers.md §2）。
 *
 * **型しか出さない。** 中身（`lazy/`）は押されるまでロードしないもので、値を再輸出すると
 * ボタン側（`app/MenuButton.svelte`）から静的に辿れてしまう（`features/status` と同じ形）。
 * 本体は `lazy/AppMenu.svelte` を動的 import で名指しする。
 */
export type { AppMenu } from './props';
