/**
 * ペインの開閉と幅（03.ux-spec/06-panes.md §3）。
 *
 * §4 はキーの意味を「ペイン（開閉する）」と「ビュー（出してフォーカスする）」の 2 系統に分けることを求めており、このモジュールは前者だけを持ち中身が何かは知らない（ビュー側は `features/outline/show.ts`）。
 * 開閉は倍率と同じく `initPanes` で bootstrap から同期的に当てる（後から当てると本文が一度全幅で描かれた後に幅が縮小して見える）。
 *
 * ADR-0005 が禁じるのは本文をリアクティブな状態に置くことで、数値 1 つは対象外である。
 * ドラッグ中は rAF で間引き、永続化は 400ms デバウンスで受ける。
 */
import { viewStore } from '@/features/view/store.svelte';
import { getPlatform, type Bootstrap, type Panes } from '@/platform';

/** `src-tauri/src/store.rs` の `PANE_WIDTH_*` と揃える（03.ux-spec/06-panes.md §3）。 */
export const PANE_WIDTH_DEFAULT = 240;
export const PANE_WIDTH_MIN = 180;
/**
 * 上限は §3 に無い。**本文が主役である**（Principle 2）ことを守るための歯止め。
 * Rust 側にも同じ値があり、手で書いた `state.json` はそちらで丸められる。
 */
export const PANE_WIDTH_MAX = 640;

/** 永続化を待つ時間。ドラッグ中に毎フレーム `state.json` を書かないため。 */
const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * bootstrap から**同期的に**初期化する。シェルを描くより前に呼ぶこと。
 *
 * **記録が無いときは閉じた状態で出る**（F-NAV-04 / §3 の引用ブロック）。
 * 既定値は Rust 側で埋まっているので、ここに来る `panes` は常に完全な形をしている。
 */
export function initPanes(bootstrap: Bootstrap | null): void {
  const panes = bootstrap?.panes;
  if (!panes) return;

  viewStore.panes = {
    left: { open: panes.left.open, width: clampPaneWidth(panes.left.width) },
    right: { open: panes.right.open, width: clampPaneWidth(panes.right.width) },
  };
}

/** ライトペインを開閉する（`Ctrl+Alt+B` / 03.ux-spec/06-panes.md §4）。中身が何であれ、開閉だけを行う。 */
export function toggleRightPane(): void {
  setRightPaneOpen(!viewStore.panes.right.open);
}

/** ライトペインを開く。既に開いていれば何もしない（**閉じない**。§4）。 */
export function openRightPane(): void {
  setRightPaneOpen(true);
}

export function setRightPaneOpen(open: boolean): void {
  if (viewStore.panes.right.open === open) return;
  viewStore.panes.right.open = open;
  schedulePersist();
}

/**
 * 幅を変える（ドラッグ / キーボード）。
 *
 * `persist` を false にすると保存しない。ドラッグ中の 1 フレームごとの更新が
 * これにあたり、離した時点で 1 回だけ保存する。
 */
export function setRightPaneWidth(width: number, persist = true): number {
  const next = clampPaneWidth(width);
  viewStore.panes.right.width = next;
  if (persist) schedulePersist();
  return next;
}

export function clampPaneWidth(width: number): number {
  if (!Number.isFinite(width)) return PANE_WIDTH_DEFAULT;
  return Math.min(PANE_WIDTH_MAX, Math.max(PANE_WIDTH_MIN, Math.round(width)));
}

/**
 * 保存を遅らせる。**1 回きりの `setTimeout` であって、ポーリングではない**
 * （05.performance-budget/04-targets.md §5）。
 *
 * 左右をまとめて送るのは、`state.json` に載る形と単位を合わせるため。
 * 左（M3）の値は誰も書き換えないので、送り返しても内容は変わらない。
 */
function schedulePersist(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void getPlatform().setPanes(snapshot());
  }, PERSIST_DEBOUNCE_MS);
}

/** ルーンのプロキシを剥がした素のオブジェクト。IPC に渡せる形にする。 */
function snapshot(): Panes {
  const panes = viewStore.panes;
  return { left: { ...panes.left }, right: { ...panes.right } };
}
