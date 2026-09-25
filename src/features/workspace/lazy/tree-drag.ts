/**
 * ファイルツリーの中のドラッグ＆ドロップ（F-NAV-12 / 03.ux-spec/06-panes.md §1.4）。
 *
 * HTML5 の DnD は使えない。
 * 外部からのドロップで絶対パスを受け取るため Tauri のドラッグ＆ドロップハンドラを有効にしており、その間 Windows の WebView では `dragover` / `drop` が発火しない（06.roadmap/m7-explorer.md §5）。
 * タブの並べ替え（`TabStrip.svelte`）と同じく Pointer Events で組む。
 *
 * 押しただけではドラッグにしない。一定の距離を動いてから始める。
 * 始まったドラッグの直後に来る `click` は、項目を開く操作として扱わない（`consumeDragClick`）。
 */
import { dirOf, relocatePath, splitPath } from '@/lib/path';

import { expandDir, treeStore } from '../tree.svelte';
import { dropEntries } from './actions';
import { selection, targetsFor } from './selection.svelte';

/** ドラッグと見なすまでの移動量（px）。クリックの手ぶれをドラッグにしない。 */
const THRESHOLD = 5;
/** 閉じたフォルダの上で止めてから開くまでの時間（ms）。VS Code と同じ程度にする。 */
const EXPAND_DELAY = 600;
/** 上端・下端からこの距離（px）に入るとスクロールする。 */
const EDGE = 24;
/** 1 フレームあたりのスクロール量（px）。 */
const SCROLL_STEP = 8;

interface Drag {
  targets: string[];
  ghost: HTMLElement;
  /** 自動スクロールの対象。ツリーのスクロール領域。 */
  scroller: HTMLElement;
  pointerY: number;
  frame: number;
  hover: { path: string; timer: ReturnType<typeof setTimeout> } | null;
}

let drag: Drag | null = null;
/** 直前にドラッグを終えたか。続く `click` を 1 回だけ無視する。 */
let justDragged = false;

/** ドラッグを終えた直後の `click` なら `true` を返し、記録を消す。項目を開く前に呼ぶ。 */
export function consumeDragClick(): boolean {
  const was = justDragged;
  justDragged = false;
  return was;
}

/** ドラッグ中の表示。カーソルの右下に件数か名前を出す。 */
function createGhost(targets: readonly string[]): HTMLElement {
  const ghost = document.createElement('div');
  ghost.textContent = targets.length === 1 ? splitPath(targets[0] ?? '').name : `${targets.length}`;
  ghost.setAttribute('aria-hidden', 'true');
  // 本体のスタイルは Svelte のスコープの外に作るため、ここで直接当てる。
  Object.assign(ghost.style, {
    position: 'fixed',
    zIndex: '50',
    pointerEvents: 'none',
    padding: '2px 8px',
    border: '1px solid var(--mx-color-border)',
    borderRadius: 'var(--mx-radius-sm)',
    background: 'var(--mx-color-bg-subtle)',
    color: 'var(--mx-color-fg)',
    fontSize: 'var(--mx-font-size-ui-sm)',
    boxShadow: 'var(--mx-shadow-1)',
    whiteSpace: 'nowrap',
  });
  document.body.append(ghost);
  return ghost;
}

/**
 * 落とす先のフォルダ。落とせない場所なら `null`。
 *
 * ファイルの上ではその親、ツリーの余白では基点になる。
 * 対象自身とその子孫、全員が既にいるフォルダへは落とせない。
 */
function destinationAt(
  x: number,
  y: number,
  targets: readonly string[],
): { dest: string; closedDir: string | null } | null {
  const root = treeStore.root;
  if (root === null) return null;
  const element = document.elementFromPoint(x, y);
  if (!(element instanceof Element) || element.closest('.mx-explorer__tree') === null) return null;

  const item = element.closest<HTMLElement>('.mx-tree__item[data-mx-path]');
  const path = item?.dataset['mxPath'] ?? null;
  const isDir = item?.dataset['mxDir'] === 'true';
  const dest = path === null ? root : isDir ? path : dirOf(path);

  const inside = targets.some((target) => relocatePath(dest, target, target) !== null);
  const stays = targets.every((target) => dirOf(target) === dest);
  if (inside || stays) return null;

  const closedDir = isDir && path !== null && !treeStore.expanded.includes(path) ? path : null;
  return { dest, closedDir };
}

function hoverFolder(current: Drag, folder: string | null): void {
  if (current.hover?.path === folder) return;
  if (current.hover !== null) clearTimeout(current.hover.timer);
  current.hover =
    folder === null ? null : { path: folder, timer: globalThis.setTimeout(() => void expandDir(folder), EXPAND_DELAY) };
}

/** 端に近ければ、指が止まっていてもスクロールし続ける。 */
function autoScroll(): void {
  const current = drag;
  if (current === null) return;
  const box = current.scroller.getBoundingClientRect();
  if (current.pointerY < box.top + EDGE) current.scroller.scrollTop -= SCROLL_STEP;
  else if (current.pointerY > box.bottom - EDGE) current.scroller.scrollTop += SCROLL_STEP;
  current.frame = requestAnimationFrame(autoScroll);
}

function update(event: PointerEvent): void {
  const current = drag;
  if (current === null) return;
  current.pointerY = event.clientY;
  current.ghost.style.left = `${event.clientX + 12}px`;
  current.ghost.style.top = `${event.clientY + 12}px`;

  const found = destinationAt(event.clientX, event.clientY, current.targets);
  selection.dropTarget = found?.dest ?? null;
  hoverFolder(current, found?.closedDir ?? null);
}

function finish(): void {
  const current = drag;
  if (current === null) return;
  drag = null;
  cancelAnimationFrame(current.frame);
  hoverFolder(current, null);
  current.ghost.remove();
  selection.dropTarget = null;
}

/**
 * 項目の上でポインタが押された。動き始めたらドラッグにする。
 *
 * 行内の入力欄の上や、左ボタン以外では何もしない。
 */
export function pressItem(event: PointerEvent, path: string, scroller: HTMLElement | null): void {
  justDragged = false;
  if (event.button !== 0 || scroller === null || selection.editing !== null) return;
  const item = event.currentTarget;
  if (!(item instanceof HTMLElement)) return;

  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;

  const onMove = (move: PointerEvent): void => {
    if (move.pointerId !== pointerId) return;
    if (drag === null) {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) < THRESHOLD) return;
      const targets = targetsFor(path);
      drag = { targets, ghost: createGhost(targets), scroller, pointerY: move.clientY, frame: 0, hover: null };
      item.setPointerCapture(pointerId);
      drag.frame = requestAnimationFrame(autoScroll);
    }
    update(move);
  };

  const cleanup = (): void => {
    globalThis.removeEventListener('pointermove', onMove);
    globalThis.removeEventListener('pointerup', onUp);
    globalThis.removeEventListener('pointercancel', onCancel);
    globalThis.removeEventListener('keydown', onKey, { capture: true });
  };

  const onUp = (up: PointerEvent): void => {
    if (up.pointerId !== pointerId) return;
    cleanup();
    const current = drag;
    if (current === null) return;
    justDragged = true;
    const dest = selection.dropTarget;
    finish();
    if (dest !== null) void dropEntries(current.targets, dest, up.ctrlKey);
  };

  const onCancel = (): void => {
    cleanup();
    finish();
  };

  // `Escape` でドラッグだけを取り消す。検索パネルなど他の持ち主へは渡さない。
  const onKey = (key: KeyboardEvent): void => {
    if (key.key !== 'Escape' || drag === null) return;
    key.stopPropagation();
    key.preventDefault();
    justDragged = true;
    onCancel();
  };

  globalThis.addEventListener('pointermove', onMove);
  globalThis.addEventListener('pointerup', onUp);
  globalThis.addEventListener('pointercancel', onCancel);
  globalThis.addEventListener('keydown', onKey, { capture: true });
}
