/**
 * status feature の公開面。
 *
 * 公開するのは型だけである。
 * 中身（`lazy/`）は操作されるまで読み込まないものであり、値を再エクスポートするとボタン側（`app/StatusMenuButton.svelte`）から静的に参照できてしまう。
 * 型は `import type` でビルド時に除去されるため、ここを参照してもチャンクは含まれない。
 * パネル本体は `lazy/StatusMenu.svelte` を動的 import で参照する。
 */
export type { StatusMenu, StatusMenuAnchor, StatusMenuKind } from './props';
