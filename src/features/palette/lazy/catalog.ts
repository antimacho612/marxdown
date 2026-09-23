/**
 * コマンドの見せ方（名前とキー）。**ラベルの唯一の置き場所。**
 *
 * 実体の表（`id → run`）は `app/commands.ts` にあり、こちらは「人に見せる側」だけを持つ。
 * 分けてあるのは、実体がクリティカルパスに載る一方で（キーを押した瞬間に必要）、
 * ラベルはパレットかメニューを開くまで要らないためである（06.roadmap/m2-editor.md §1.2）。
 *
 * **コマンドパレットとハンバーガーメニューが同じ表を読む。**
 * 以前はメニューが自前のラベルを持っており、パレットを足すと同じ文言が 2 か所になっていた。
 * メニューは並べる順と区切りを決めるだけで、名前はここから取る（`features/menu/lazy/items.ts`）。
 *
 * 状態で変わる名前は関数で持つ。行き先を言うほうが、押した結果を事前に判断できる
 * （「編集する」/「プレビューに戻る」）。
 */
import { viewStore } from '@/features/view';
import { ja } from '@/i18n/ja';
import { isCommandListed, type CommandId } from '@/lib/commands';

/** 1 つのコマンドの見せ方。 */
export interface CommandEntry {
  id: CommandId;
  /** 表示名。状態で変わるものだけ関数で渡す。 */
  label: string | (() => string);
  /** 右端に出すキー。割り当てが無いものは省く。 */
  shortcut?: string;
}

/**
 * すべてのコマンド。
 *
 * **ここに無いコマンドはパレットに出ない。** パレットは「すべての機能への到達手段」であり
 * （[03.ux-spec > screen-layout §3](../../../../docs/03.ux-spec/01-screen-layout.md)）、
 * 抜けているとキーを知っている人にしか使えない機能になる。
 *
 * 並びは `app/commands.ts` の実体の表に合わせてある。突き合わせるときに目で追える。
 */
export const COMMAND_CATALOG: CommandEntry[] = [
  { id: 'document.new', label: ja.menu.new, shortcut: 'Ctrl+N' },
  { id: 'document.open', label: ja.menu.open, shortcut: 'Ctrl+O' },
  { id: 'folder.open', label: ja.menu.openFolder, shortcut: 'Ctrl+Alt+O' },
  { id: 'document.quickOpen', label: ja.menu.quickOpen, shortcut: 'Ctrl+P' },
  { id: 'document.reload', label: ja.menu.reload, shortcut: 'F5' },
  { id: 'document.save', label: ja.menu.save, shortcut: 'Ctrl+S' },
  { id: 'document.saveAs', label: ja.menu.saveAs, shortcut: 'Ctrl+Shift+S' },
  { id: 'document.toggleEol', label: ja.menu.toggleEol },

  { id: 'window.new', label: ja.menu.newWindow, shortcut: 'Ctrl+Alt+N' },
  { id: 'window.moveTab', label: ja.menu.moveToNewWindow },

  { id: 'tab.close', label: ja.tab.closeCurrent, shortcut: 'Ctrl+W' },
  { id: 'tab.next', label: ja.tab.next, shortcut: 'Ctrl+Tab' },
  { id: 'tab.previous', label: ja.tab.previous, shortcut: 'Ctrl+Shift+Tab' },
  { id: 'tab.reopen', label: ja.tab.reopen, shortcut: 'Ctrl+Shift+T' },

  { id: 'history.back', label: ja.history.back, shortcut: 'Alt+←' },
  { id: 'history.forward', label: ja.history.forward, shortcut: 'Alt+→' },

  // ペインとビューは意味が違う（`app/commands.ts`）。ラベルもそれに合わせる。
  {
    id: 'pane.toggleLeft',
    label: () => (viewStore.panes.left.open ? ja.pane.hideExplorer : ja.pane.showExplorer),
    shortcut: 'Ctrl+Shift+B',
  },
  {
    id: 'pane.toggleRight',
    label: () => (viewStore.panes.right.open ? ja.pane.hideOutline : ja.pane.showOutline),
    shortcut: 'Ctrl+Alt+B',
  },
  { id: 'explorer.show', label: ja.menu.showExplorer, shortcut: 'Ctrl+Shift+E' },
  { id: 'outline.show', label: ja.menu.showOutline, shortcut: 'Ctrl+Shift+U' },
  { id: 'outline.jump', label: ja.outline.jump, shortcut: 'Ctrl+Shift+O' },

  {
    id: 'view.togglePreview',
    label: () => (viewStore.mode === 'preview' ? ja.menu.toEdit : ja.menu.toPreview),
    shortcut: 'Ctrl+Shift+V',
  },
  {
    id: 'view.toggleSplit',
    label: () => (viewStore.mode === 'split' ? ja.menu.fromSplit : ja.menu.toSplit),
    shortcut: 'Ctrl+\\',
  },
  { id: 'view.cycleMode', label: ja.menu.cycleMode, shortcut: 'Ctrl+Shift+M' },
  { id: 'view.toggleScrollSync', label: ja.menu.toggleScrollSync },

  { id: 'editor.gotoLine', label: ja.menu.gotoLine, shortcut: 'Ctrl+G' },
  { id: 'editor.formatTable', label: ja.menu.formatTable, shortcut: 'Shift+Alt+F' },

  { id: 'find.open', label: () => (viewStore.mode === 'preview' ? ja.menu.search : ja.menu.find), shortcut: 'Ctrl+F' },
  { id: 'find.replace', label: ja.menu.replace, shortcut: 'Ctrl+H' },

  { id: 'preview.zoomIn', label: ja.menu.zoomIn, shortcut: 'Ctrl+=' },
  { id: 'preview.zoomOut', label: ja.menu.zoomOut, shortcut: 'Ctrl+-' },
  { id: 'preview.zoomReset', label: ja.menu.zoomReset, shortcut: 'Ctrl+0' },

  { id: 'palette.open', label: ja.palette.title, shortcut: 'Ctrl+Shift+P' },
  { id: 'settings.open', label: ja.menu.settings, shortcut: 'Ctrl+,' },
  { id: 'app.quit', label: ja.menu.quit, shortcut: 'Ctrl+Q' },
];

/**
 * いま実行できるコマンドだけを、表示できる形にして返す。
 *
 * 押しても何も起きない項目は並べない（Principle 3）。判定は `isListed` が唯一の根拠であり、
 * メニューとパレットで結論がずれない（`app/commands.ts`）。
 *
 * 対象を取るコマンド（`document.openPath` / `tab.select`）は `COMMAND_CATALOG` に載せていない。
 * 引数を渡す経路が別にあり（最近開いたファイルの 1 件 / `Ctrl+1`〜`9`）、一覧からは実行できない。
 *
 * パレット自身（`palette.open`）は載せてある。ハンバーガーメニューから辿れる必要があるためで
 * （03.ux-spec/01-screen-layout.md §3 の「初学者の逃げ道」）、パレットの中では呼び出し側が外す。
 */
export function listedCommands(): { id: CommandId; label: string; shortcut?: string }[] {
  return COMMAND_CATALOG.filter((entry) => isCommandListed(entry.id)).map(resolve);
}

/** その 1 つを表示できる形にする。メニューが並べる順を決めるときに使う。 */
export function resolve(entry: CommandEntry): { id: CommandId; label: string; shortcut?: string } {
  const label = typeof entry.label === 'function' ? entry.label() : entry.label;
  return entry.shortcut === undefined ? { id: entry.id, label } : { id: entry.id, label, shortcut: entry.shortcut };
}

/** id から引く。メニューが自分の並びでラベルを取るのに使う。 */
export function commandEntry(id: CommandId): CommandEntry | undefined {
  return COMMAND_CATALOG.find((entry) => entry.id === id);
}
