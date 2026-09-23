/**
 * Split の分割比（F-MODE-03 / 03.ux-spec/03-split-mode.md §1）。
 *
 * ピクセルではなく比で持つ（ウィンドウ幅やペイン開閉で左右比が変わらないように）。
 * 20%〜80% に制限するのは、片方を極端に狭めると Split の意味が無くなり、戻すための分割線も操作しにくくなるためである。
 * 永続化は `panes.ts` と同じ形である（ドラッグ中は書かず離した時点で 1 回）。
 * 数値 1 つをリアクティブな状態に置くのは ADR-0005 の禁止（本文を置くこと）には該当しない。
 */
import { getPlatform, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN, type Bootstrap } from '@/platform';

import { viewStore } from './store.svelte';

/**
 * CSS 側が読む変数（`styles/shell.css` の Split の列幅）。
 *
 * 単位まで含んだ値を設定する。
 * `calc(var(--x) * 1fr)` とは書けないためである（`<flex>` に `calc()` は使えず、宣言ごと無効になって列が `auto` になる）。
 */
const EDITOR_VARIABLE = '--mx-split-editor';
const PREVIEW_VARIABLE = '--mx-split-preview';

/** 永続化を待つ時間。`panes.ts` と揃えてある。 */
const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * bootstrap から同期的に適用する。シェルを描画するより前に呼ぶこと。
 *
 * 倍率やペインと同じ理由による（02.architecture/05-startup-sequence.md §1）。
 * 後から適用すると、`--mode split` で開いたときに 50:50 の状態が一度描画された後に分割比が変化して見える。
 */
export function initSplit(bootstrap: Bootstrap | null): void {
  applySplit(clampSplit(bootstrap?.split ?? SPLIT_DEFAULT));
}

/**
 * 分割比を変える。`persist` を false にすると保存しない（ドラッグ中）。
 *
 * CSS 変数へは毎回書き込む。
 * リアクティブな値の変化で列幅が決まる形にすると、ドラッグ中に Svelte の更新がレイアウトのたびに挟まる。
 */
export function setSplit(split: number, persist = true): number {
  const next = clampSplit(split);
  applySplit(next);
  if (persist) schedulePersist();
  return next;
}

/** 50:50 に戻す（分割線のダブルクリック / §1）。 */
export function resetSplit(): void {
  setSplit(SPLIT_DEFAULT);
}

/** 分割比を許容範囲へ丸める。有限でない値は既定値に戻す。 */
export function clampSplit(split: number): number {
  if (!Number.isFinite(split)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, split));
}

function applySplit(split: number): void {
  viewStore.split = split;
  const style = document.documentElement.style;
  style.setProperty(EDITOR_VARIABLE, `${split}fr`);
  style.setProperty(PREVIEW_VARIABLE, `${1 - split}fr`);
}

function schedulePersist(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void getPlatform().setSplit(viewStore.split);
  }, PERSIST_DEBOUNCE_MS);
}

/** テスト用。予約中の保存を取り消し、分割比を既定へ戻す。 */
export function resetSplitState(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = null;
  applySplit(SPLIT_DEFAULT);
}
