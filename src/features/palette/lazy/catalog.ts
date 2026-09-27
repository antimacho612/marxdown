/**
 * コマンドの見せ方（名前とキー）。ラベルの唯一の置き場所。
 *
 * 実体の表（`id → run`）は `app/commands.ts` にあり、こちらは「人に見せる側」だけを持つ。
 * 分けてあるのは、実体がクリティカルパスに含まれる一方で（キーを押した瞬間に必要）、ラベルはパレットかメニューを開くまで不要なためである。
 *
 * コマンドパレットとハンバーガーメニューが同じ表を読む。
 * メニューは並べる順と区切りを決めるだけで、名前はここから取る（`features/menu/lazy/items.ts`）。
 *
 * 状態で変わる名前は関数で持つ。行き先を言うほうが、押した結果を事前に判断できる（「編集する」/「プレビューに戻る」）。
 */
import { viewStore } from '@/features/view';
import { t } from '@/i18n';
import { isCommandListed, type CommandId } from '@/lib/commands';

/** 1 つのコマンドの見せ方。 */
export interface CommandEntry {
  id: CommandId;
  /** 表示名。状態で変わるものだけ関数で渡す。 */
  label: string | (() => string);
  /**
   * 英語で検索するための語。表示はしない。
   *
   * ラベルが日本語しか無いため、`file` や `save` と打つと 1 件も出てこない。
   * id（`document.open`）を照合しても「ファイルを開く」に `file` は含まれず届かないので、呼び名として使われる語をここに並べる。
   *
   * 表示しないため `i18n/` には置かない。あちらは人に見せる文言の置き場所である。
   * 省略できない形にしてあり、書き漏らしは `catalog.test.ts` が検出する。
   */
  keywords: string;
  /** 右端に出すキー。割り当てが無いものは省く。 */
  shortcut?: string;
}

/** 表示できる形にしたコマンド 1 つ。`keywords` はパレットの照合にだけ使い、表示しない。 */
export interface ResolvedCommand {
  id: CommandId;
  label: string;
  keywords: string;
  shortcut?: string;
}

/**
 * すべてのコマンド。
 *
 * ここに無いコマンドはパレットに出ない。
 * パレットは「すべての機能への到達手段」であり、抜けているとキーを知っている人にしか使えない機能になる。
 *
 * 並びは `app/commands.ts` の実体の表に合わせてある。突き合わせるときに目で追える。
 */
export const COMMAND_CATALOG: CommandEntry[] = [
  { id: 'document.new', label: t.menu.new, keywords: 'new file document create', shortcut: 'Ctrl+N' },
  { id: 'document.open', label: t.menu.open, keywords: 'open file document', shortcut: 'Ctrl+O' },
  { id: 'folder.open', label: t.menu.openFolder, keywords: 'open folder directory workspace', shortcut: 'Ctrl+Alt+O' },
  { id: 'document.quickOpen', label: t.menu.quickOpen, keywords: 'quick open file goto', shortcut: 'Ctrl+P' },
  { id: 'document.reload', label: t.menu.reload, keywords: 'reload revert file', shortcut: 'F5' },
  { id: 'document.save', label: t.menu.save, keywords: 'save file write', shortcut: 'Ctrl+S' },
  { id: 'document.saveAs', label: t.menu.saveAs, keywords: 'save as file write', shortcut: 'Ctrl+Shift+S' },
  { id: 'document.exportHtml', label: t.menu.exportHtml, keywords: 'export html save write' },
  { id: 'document.exportPdf', label: t.menu.exportPdf, keywords: 'export pdf print save write' },
  { id: 'document.toggleEol', label: t.menu.toggleEol, keywords: 'toggle eol line ending newline crlf lf' },

  { id: 'window.moveTab', label: t.menu.moveToNewWindow, keywords: 'move tab window satellite detach' },
  { id: 'window.moveTabToMain', label: t.menu.moveToMainWindow, keywords: 'move tab main window satellite attach' },

  { id: 'tab.close', label: t.tab.closeCurrent, keywords: 'close tab', shortcut: 'Ctrl+W' },
  { id: 'tab.next', label: t.tab.next, keywords: 'next tab', shortcut: 'Ctrl+Tab' },
  { id: 'tab.previous', label: t.tab.previous, keywords: 'previous prev tab', shortcut: 'Ctrl+Shift+Tab' },
  { id: 'tab.reopen', label: t.tab.reopen, keywords: 'reopen restore closed tab', shortcut: 'Ctrl+Shift+T' },

  { id: 'history.back', label: t.history.back, keywords: 'back history navigate', shortcut: 'Alt+←' },
  { id: 'history.forward', label: t.history.forward, keywords: 'forward history navigate', shortcut: 'Alt+→' },

  // ペインとビューは意味が違う（`app/commands.ts`）。ラベルもそれに合わせる。
  {
    id: 'pane.toggleLeft',
    label: () => (viewStore.panes.left.open ? t.pane.hideExplorer : t.pane.showExplorer),
    keywords: 'toggle left pane sidebar explorer',
    shortcut: 'Ctrl+Shift+B',
  },
  {
    id: 'pane.toggleRight',
    label: () => (viewStore.panes.right.open ? t.pane.hideOutline : t.pane.showOutline),
    keywords: 'toggle right pane sidebar outline',
    shortcut: 'Ctrl+Alt+B',
  },
  {
    id: 'explorer.show',
    label: t.menu.showExplorer,
    keywords: 'explorer show file tree sidebar',
    shortcut: 'Ctrl+Shift+E',
  },
  { id: 'explorer.newFile', label: t.menu.explorerNewFile, keywords: 'explorer new file create add' },
  { id: 'explorer.newFolder', label: t.menu.explorerNewFolder, keywords: 'explorer new folder directory create add' },
  { id: 'explorer.refresh', label: t.menu.explorerRefresh, keywords: 'explorer refresh reload file tree' },
  { id: 'explorer.collapseAll', label: t.menu.explorerCollapseAll, keywords: 'explorer collapse all folders tree' },
  {
    id: 'outline.show',
    label: t.menu.showOutline,
    keywords: 'outline show heading sidebar',
    shortcut: 'Ctrl+Shift+U',
  },
  {
    id: 'outline.jump',
    label: t.outline.jump,
    keywords: 'outline jump goto heading symbol',
    shortcut: 'Ctrl+Shift+O',
  },

  {
    id: 'view.togglePreview',
    label: () => (viewStore.mode === 'preview' ? t.menu.toEdit : t.menu.toPreview),
    keywords: 'toggle preview edit view mode',
    shortcut: 'Ctrl+Shift+V',
  },
  {
    id: 'view.toggleSplit',
    label: () => (viewStore.mode === 'split' ? t.menu.fromSplit : t.menu.toSplit),
    keywords: 'toggle split view mode',
    shortcut: 'Ctrl+\\',
  },
  { id: 'view.cycleMode', label: t.menu.cycleMode, keywords: 'cycle view mode', shortcut: 'Ctrl+Shift+M' },
  { id: 'view.toggleScrollSync', label: t.menu.toggleScrollSync, keywords: 'toggle scroll sync' },

  { id: 'editor.gotoLine', label: t.menu.gotoLine, keywords: 'goto line number', shortcut: 'Ctrl+G' },
  { id: 'editor.formatTable', label: t.menu.formatTable, keywords: 'format table', shortcut: 'Shift+Alt+F' },

  {
    id: 'find.open',
    label: () => (viewStore.mode === 'preview' ? t.menu.search : t.menu.find),
    keywords: 'find search',
    shortcut: 'Ctrl+F',
  },
  { id: 'find.replace', label: t.menu.replace, keywords: 'replace find search', shortcut: 'Ctrl+H' },

  { id: 'preview.zoomIn', label: t.menu.zoomIn, keywords: 'zoom in preview', shortcut: 'Ctrl+=' },
  { id: 'preview.zoomOut', label: t.menu.zoomOut, keywords: 'zoom out preview', shortcut: 'Ctrl+-' },
  { id: 'preview.zoomReset', label: t.menu.zoomReset, keywords: 'zoom reset preview', shortcut: 'Ctrl+0' },

  { id: 'palette.open', label: t.palette.title, keywords: 'command palette', shortcut: 'Ctrl+Shift+P' },
  { id: 'settings.open', label: t.menu.settings, keywords: 'settings preferences config option', shortcut: 'Ctrl+,' },
  { id: 'app.checkUpdate', label: t.menu.checkUpdate, keywords: 'update upgrade version release' },
  { id: 'app.quit', label: t.menu.quit, keywords: 'quit exit close app', shortcut: 'Ctrl+Q' },
];

/**
 * いま実行できるコマンドだけを、表示できる形にして返す。
 *
 * 押しても何も起きない項目は並べない（Principle 3）。判定は `isListed` が唯一の根拠であり、メニューとパレットで結論がずれない（`app/commands.ts`）。
 *
 * 対象を取るコマンド（`document.openPath` / `tab.select`）は `COMMAND_CATALOG` に載せていない。
 * 引数を渡す経路が別にあり（最近開いたファイルの 1 件 / `Ctrl+1`〜`9`）、一覧からは実行できない。
 *
 * パレット自身（`palette.open`）は載せてある。ハンバーガーメニューから辿れる必要があるためで、パレットの中では呼び出し側が外す。
 */
export function listedCommands(): ResolvedCommand[] {
  return COMMAND_CATALOG.filter((entry) => isCommandListed(entry.id)).map(resolve);
}

/** その 1 つを表示できる形にする。メニューが並べる順を決めるときに使う。 */
export function resolve(entry: CommandEntry): ResolvedCommand {
  const label = typeof entry.label === 'function' ? entry.label() : entry.label;
  const shown = { id: entry.id, label, keywords: entry.keywords };
  return entry.shortcut === undefined ? shown : { ...shown, shortcut: entry.shortcut };
}

/** id から引く。メニューが自分の並びでラベルを取るのに使う。 */
export function commandEntry(id: CommandId): CommandEntry | undefined {
  return COMMAND_CATALOG.find((entry) => entry.id === id);
}
