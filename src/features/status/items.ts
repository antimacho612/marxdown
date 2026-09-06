/**
 * ステータスバーのメニューに並べる項目（03.ux-spec/07-status-and-notifications.md §3 / `status` チャンク）。
 * 文言と選択肢は押されるまで不要なので遅延チャンクに置く（`features/menu/items.ts` と同じ分け方）。
 * どちらのメニューも選ばれている行に印を付ける。
 * 押す前に「いまどれか」が分からないと 5 つ並んだエンコーディングの意味が読めないためである（Principle 3）。
 */
import { ENCODINGS, reinterpret } from '@/features/document/encoding';
import { documentStore } from '@/features/document/store.svelte';
import { setMode } from '@/features/mode';
import { viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import type { ViewMode } from '@/platform';

import type { StatusMenuItem, StatusMenuKind } from './props';

/**
 * 表示モードの選択肢（03.ux-spec/02-view-modes.md §1）。
 *
 * **WYSIWYG は並べない。** 実装は M5 で、押しても何も起きない位置を作らない
 * （`cycleMode` が順送りの並びから外しているのと同じ判断）。
 */
const MODES: readonly ViewMode[] = ['preview', 'edit', 'split'];

export function statusMenuItems(kind: StatusMenuKind): StatusMenuItem[] {
  return kind === 'encoding' ? encodingItems() : modeItems();
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
