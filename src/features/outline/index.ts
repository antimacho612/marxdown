/**
 * outline feature の公開面。
 *
 * ペインの中身（`Outline`）はクロームなので `main` に常駐し、見出しジャンプのパレットだけが遅延チャンク（`lazy/`）にある。入口は `openJumpLazily` 1 つで、動的 import はその中にある。
 * 見出しの探索（`jump.ts`）と追従（`follow.ts`）は `Outline` の内側の都合なので出さない。
 */
export { default as Outline } from './Outline.svelte';
export { openJumpLazily } from './open-jump';
export { showOutline } from './show';
