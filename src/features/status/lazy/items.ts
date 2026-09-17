/**
 * ステータスバーのメニューに並べる項目（03.ux-spec/07-status-and-notifications.md §3 / `status` チャンク）。
 * 文言と選択肢は押されるまで不要なので遅延チャンクに置く（`features/menu/lazy/items.ts` と同じ分け方）。
 * いずれのメニューも選ばれている行に印を付ける。
 * 押す前に「いまどれか」が分からないと 5 つ並んだエンコーディングの意味が読めないためである（Principle 3）。
 */
import { documentStore, ENCODINGS, reinterpret } from '@/features/document';
import { setMode } from '@/features/mode';
import { applyZoom, formatZoom, ZOOM_STEPS } from '@/features/preview';
import { viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import type { Encoding, ViewMode } from '@/platform';

import type { StatusMenuKind } from '../props';

/** メニューに並ぶ 1 行。項目を組み立てる側だけが使うため `props.ts` には置かない。 */
export interface StatusMenuItem {
  /** エンコーディング・表示モード・倍率のいずれか。`{#each}` のキーになる。 */
  id: Encoding | ViewMode | number;
  label: string;
  /** いま選ばれているか。`aria-checked` と印に使う。 */
  checked: boolean;
  run: () => void;
}

/**
 * 表示モードの選択肢（03.ux-spec/02-view-modes.md §1）。
 *
 * WYSIWYG は並べない。
 * 実装は M5 であり、操作しても何も起きない項目を作らない（`cycleMode` が順送りの並びから外しているのと同じ判断）。
 */
const MODES: readonly ViewMode[] = ['preview', 'edit', 'split'];

/**
 * 倍率が刻みと一致するとみなす誤差。
 * 設定ファイルの値や浮動小数の丸めで `0.67` が厳密に一致しないことがあり、印が 1 つも付かない状態を避ける。
 */
const ZOOM_EPSILON = 1e-6;

/** 種別に応じた選択肢を組み立てる。現在の選択もここで判定する。 */
export function statusMenuItems(kind: StatusMenuKind): StatusMenuItem[] {
  switch (kind) {
    case 'encoding': {
      return encodingItems();
    }
    case 'zoom': {
      return zoomItems();
    }
    default: {
      return modeItems();
    }
  }
}

function encodingItems(): StatusMenuItem[] {
  const current = documentStore.meta?.encoding;
  return ENCODINGS.map((encoding) => ({
    id: encoding,
    label: ja.status.encoding[encoding],
    checked: encoding === current,
    run: () => void reinterpret(encoding),
  }));
}

function modeItems(): StatusMenuItem[] {
  return MODES.map((mode) => ({
    id: mode,
    label: ja.status.mode[mode],
    checked: mode === viewStore.mode,
    run: () => void setMode(mode),
  }));
}

/**
 * 表示倍率の選択肢（F-VIEW-11）。並びは `Ctrl+=` / `Ctrl+-` の刻みと同じである（`features/preview/zoom.ts`）。
 *
 * 現在値が刻みと一致しないときは、どの行にも印が付かない。
 * 一致しない値になるのは設定ファイルを手で編集した場合に限られ、印を近い値へ寄せると実際の倍率と表示がずれる。
 */
function zoomItems(): StatusMenuItem[] {
  return ZOOM_STEPS.map((zoom) => ({
    id: zoom,
    label: formatZoom(zoom),
    checked: Math.abs(zoom - viewStore.zoom) < ZOOM_EPSILON,
    run: () => void applyZoom(zoom),
  }));
}
