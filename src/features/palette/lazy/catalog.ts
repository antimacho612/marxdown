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
  /**
   * 英語で引くための語（#104）。表示はしない。
   *
   * ラベルが日本語しか無いため、`file` や `save` と打つと 1 件も出てこない。
   * id（`document.open`）を照合しても「ファイルを開く」に `file` は含まれず届かないので、
   * 呼び名として使われる語をここに並べる。
   *
   * 表示しないため `i18n/ja.ts` には置かない。あちらは人に見せる文言の置き場所である。
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
 * **ここに無いコマンドはパレットに出ない。** パレットは「すべての機能への到達手段」であり
 * （[03.ux-spec > screen-layout §3](../../../../docs/03.ux-spec/01-screen-layout.md)）、
 * 抜けているとキーを知っている人にしか使えない機能になる。
 *
 * 並びは `app/commands.ts` の実体の表に合わせてある。突き合わせるときに目で追える。
 */
export const COMMAND_CATALOG: CommandEntry[] = [
  { id: 'document.new', label: ja.menu.new, keywords: 'new file document create', shortcut: 'Ctrl+N' },
  { id: 'document.open', label: ja.menu.open, keywords: 'open file document', shortcut: 'Ctrl+O' },
  { id: 'folder.open', label: ja.menu.openFolder, keywords: 'open folder directory workspace', shortcut: 'Ctrl+Alt+O' },
  { id: 'document.quickOpen', label: ja.menu.quickOpen, keywords: 'quick open file goto', shortcut: 'Ctrl+P' },
  { id: 'document.reload', label: ja.menu.reload, keywords: 'reload revert file', shortcut: 'F5' },
  { id: 'document.save', label: ja.menu.save, keywords: 'save file write', shortcut: 'Ctrl+S' },
  { id: 'document.saveAs', label: ja.menu.saveAs, keywords: 'save as file write', shortcut: 'Ctrl+Shift+S' },
  { id: 'document.toggleEol', label: ja.menu.toggleEol, keywords: 'toggle eol line ending newline crlf lf' },

  { id: 'window.new', label: ja.menu.newWindow, keywords: 'new window instance process', shortcut: 'Ctrl+Alt+N' },
  { id: 'window.moveTab', label: ja.menu.moveToNewWindow, keywords: 'move tab window satellite detach' },

  { id: 'tab.close', label: ja.tab.closeCurrent, keywords: 'close tab', shortcut: 'Ctrl+W' },
  { id: 'tab.next', label: ja.tab.next, keywords: 'next tab', shortcut: 'Ctrl+Tab' },
  { id: 'tab.previous', label: ja.tab.previous, keywords: 'previous prev tab', shortcut: 'Ctrl+Shift+Tab' },
  { id: 'tab.reopen', label: ja.tab.reopen, keywords: 'reopen restore closed tab', shortcut: 'Ctrl+Shift+T' },

  { id: 'history.back', label: ja.history.back, keywords: 'back history navigate', shortcut: 'Alt+←' },
  { id: 'history.forward', label: ja.history.forward, keywords: 'forward history navigate', shortcut: 'Alt+→' },

  // ペインとビューは意味が違う（`app/commands.ts`）。ラベルもそれに合わせる。
  {
    id: 'pane.toggleLeft',
    label: () => (viewStore.panes.left.open ? ja.pane.hideExplorer : ja.pane.showExplorer),
    keywords: 'toggle left pane sidebar explorer',
    shortcut: 'Ctrl+Shift+B',
  },
  {
    id: 'pane.toggleRight',
    label: () => (viewStore.panes.right.open ? ja.pane.hideOutline : ja.pane.showOutline),
    keywords: 'toggle right pane sidebar outline',
    shortcut: 'Ctrl+Alt+B',
  },
  {
    id: 'explorer.show',
    label: ja.menu.showExplorer,
    keywords: 'explorer show file tree sidebar',
    shortcut: 'Ctrl+Shift+E',
  },
  {
    id: 'outline.show',
    label: ja.menu.showOutline,
    keywords: 'outline show heading sidebar',
    shortcut: 'Ctrl+Shift+U',
  },
  {
    id: 'outline.jump',
    label: ja.outline.jump,
    keywords: 'outline jump goto heading symbol',
    shortcut: 'Ctrl+Shift+O',
  },

  {
    id: 'view.togglePreview',
    label: () => (viewStore.mode === 'preview' ? ja.menu.toEdit : ja.menu.toPreview),
    keywords: 'toggle preview edit view mode',
    shortcut: 'Ctrl+Shift+V',
  },
  {
    id: 'view.toggleSplit',
    label: () => (viewStore.mode === 'split' ? ja.menu.fromSplit : ja.menu.toSplit),
    keywords: 'toggle split view mode',
    shortcut: 'Ctrl+\\',
  },
  { id: 'view.cycleMode', label: ja.menu.cycleMode, keywords: 'cycle view mode', shortcut: 'Ctrl+Shift+M' },
  { id: 'view.toggleScrollSync', label: ja.menu.toggleScrollSync, keywords: 'toggle scroll sync' },

  { id: 'editor.gotoLine', label: ja.menu.gotoLine, keywords: 'goto line number', shortcut: 'Ctrl+G' },
  { id: 'editor.formatTable', label: ja.menu.formatTable, keywords: 'format table', shortcut: 'Shift+Alt+F' },

  {
    id: 'find.open',
    label: () => (viewStore.mode === 'preview' ? ja.menu.search : ja.menu.find),
    keywords: 'find search',
    shortcut: 'Ctrl+F',
  },
  { id: 'find.replace', label: ja.menu.replace, keywords: 'replace find search', shortcut: 'Ctrl+H' },

  { id: 'preview.zoomIn', label: ja.menu.zoomIn, keywords: 'zoom in preview', shortcut: 'Ctrl+=' },
  { id: 'preview.zoomOut', label: ja.menu.zoomOut, keywords: 'zoom out preview', shortcut: 'Ctrl+-' },
  { id: 'preview.zoomReset', label: ja.menu.zoomReset, keywords: 'zoom reset preview', shortcut: 'Ctrl+0' },

  { id: 'palette.open', label: ja.palette.title, keywords: 'command palette', shortcut: 'Ctrl+Shift+P' },
  { id: 'settings.open', label: ja.menu.settings, keywords: 'settings preferences config option', shortcut: 'Ctrl+,' },
  { id: 'app.quit', label: ja.menu.quit, keywords: 'quit exit close app', shortcut: 'Ctrl+Q' },
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
