/**
 * ファイルツリーの項目に対するキー（03.ux-spec/04-keybindings.md §3「ファイルツリー」）。
 *
 * ツリーの項目にフォーカスがあるときだけ有効である（§4 のキーの持ち主の 3 つ目）。
 * `app/commands.ts` の `KEY_BINDINGS` とは 1 つも重ならない。
 * ここで処理しなかったキーはそのまま `KEY_BINDINGS` へ届く。
 *
 * 矢印キーでの移動と開閉は `FileTree.svelte` が持つ（WAI-ARIA の tree の既定の動き）。
 */
import { comboOf } from '@/lib/shortcuts';

import { copyPaths, paste, revealEntry, setClipboard, startRename, trashTargets } from './actions';
import { selection, selectOnly, targetsFor } from './selection.svelte';

/** キーで開くコンテキストメニューの位置（項目の左下）。 */
function menuAt(item: HTMLElement, path: string): void {
  const box = item.getBoundingClientRect();
  selection.menu = { path, x: box.left + 16, y: box.bottom };
}

/** 同じ階層（同じリスト）に見えている項目。`Ctrl+A` の範囲である。 */
function siblingsOf(item: HTMLElement): string[] {
  const list = item.closest('ul');
  if (list === null) return [];
  return [...list.children]
    .map((child) => child.querySelector<HTMLElement>(':scope > .mx-tree__item')?.dataset['mxPath'])
    .filter((path): path is string => path !== undefined);
}

/**
 * 文字キーで、その文字から始まる次の項目を探す（VS Code の型ナビゲーションの単純な形）。
 *
 * 同じ文字を続けて押すと、同じ文字で始まる項目を順に巡る。
 */
function nextByLetter(letter: string, from: string): string | null {
  const items = [...document.querySelectorAll<HTMLElement>('.mx-tree__item[data-mx-path]')];
  const start = items.findIndex((item) => item.dataset['mxPath'] === from);
  const lower = letter.toLowerCase();
  for (let step = 1; step <= items.length; step += 1) {
    const item = items[(start + step) % items.length];
    const name = item?.querySelector('.mx-tree__name')?.textContent ?? '';
    if (name.toLowerCase().startsWith(lower)) return item?.dataset['mxPath'] ?? null;
  }
  return null;
}

/**
 * キーを処理する。処理したら `true` を返す（呼び出し側が `preventDefault` する）。
 *
 * `item` はフォーカスのある項目の要素、`path` はそのパスである。
 * フォーカスを別の項目へ移す必要があるときは `moveFocus` を呼ぶ。
 */
export function handleTreeKey(
  event: KeyboardEvent,
  item: HTMLElement,
  path: string,
  moveFocus: (path: string) => void,
): boolean {
  switch (comboOf(event)) {
    case 'F2': {
      startRename(path);
      return true;
    }
    case 'Delete': {
      void trashTargets(targetsFor(path));
      return true;
    }
    case 'Ctrl+C': {
      setClipboard(targetsFor(path), 'copy');
      return true;
    }
    case 'Ctrl+X': {
      setClipboard(targetsFor(path), 'cut');
      return true;
    }
    case 'Ctrl+V': {
      void paste(path);
      return true;
    }
    case 'Shift+Alt+C': {
      void copyPaths(targetsFor(path), false);
      return true;
    }
    case 'Ctrl+Shift+Alt+C': {
      void copyPaths(targetsFor(path), true);
      return true;
    }
    case 'Shift+Alt+R': {
      void revealEntry(path);
      return true;
    }
    case 'Ctrl+A': {
      selection.selected = siblingsOf(item);
      return true;
    }
    case 'Shift+F10':
    case 'ContextMenu': {
      menuAt(item, path);
      return true;
    }
    case 'Escape': {
      // 何も取り消すものが無ければ処理しない。検索パネルなど、他の `Escape` の持ち主へ渡す。
      if (selection.clipboard?.mode === 'cut') {
        selection.clipboard = null;
        return true;
      }
      if (selection.selected.length > 1) {
        selectOnly(path);
        return true;
      }
      return false;
    }
    default: {
      break;
    }
  }

  // 修飾キーの無い 1 文字だけを型ナビゲーションに使う。`Ctrl+P` などはアプリのキーへ渡す。
  if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const next = nextByLetter(event.key, path);
  if (next === null) return false;
  moveFocus(next);
  selectOnly(next);
  return true;
}
