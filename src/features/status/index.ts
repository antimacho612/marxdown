/**
 * status feature の公開面（02.architecture/03-layers.md §2）。
 *
 * **型しか出さない。** 中身（`lazy/`）は押されるまでロードしないもので、値を再輸出すると
 * ボタン側（`app/StatusMenuButton.svelte`）から静的に辿れてしまう。
 * 型は `import type` で消えるので、ここを参照してもチャンクは引きずられない。
 * パネル本体は `lazy/StatusMenu.svelte` を動的 import で名指しする。
 */
export type { StatusMenu, StatusMenuAnchor, StatusMenuKind } from './props';
