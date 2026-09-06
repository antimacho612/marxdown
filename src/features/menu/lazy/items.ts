/**
 * ハンバーガーメニューに並べるもの（03.ux-spec/01-screen-layout.md §3）。
 * 遅延チャンクでメニューが開かれるまでロードされない。
 *
 * 並べるのは `CommandId` とラベルの対応だけで、実行内容は知らない（実体の表は `app/commands.ts`）。
 * 以前は 8 つの feature を名指しで import していたが、この形なら M3 のコマンドパレットが同じ表を別の見せ方で並べるだけで済む。
 * `AppMenu.svelte` はこの配列を描くだけで項目を知らないため、項目を足すのは `MENU` への 1 行で終わる。
 *
 * 押せない項目（例: ファイル未オープン時の再読み込み・倍率・検索）は存在ごと消す（Principle 3）。
 * 判定は `app/commands.ts` の `isListed` が唯一の根拠で、メニューとパレットで結論がずれない。
 */
import { viewStore } from '@/features/view';
import { recentStore } from '@/features/workspace';
import { ja } from '@/i18n/ja';
import { isCommandListed, runCommand, type CommandId } from '@/lib/commands';
import { splitPath } from '@/lib/path';

/**
 * 一覧に出す最近開いたファイルの件数。
 *
 * Welcome 画面（`RECENT_SHOWN`）と同じ 6 件。**同じ意味のものは同じ数にする。**
 * ここだけ長くすると、メニューが「履歴ビューア」に化けて縦に伸びる。
 */
export const MENU_RECENT_SHOWN = 6;

export interface MenuAction {
  /** `{#each}` のキー。 */
  id: string;
  label: string;
  /** 右端に添えるキー。**併記が唯一の教育**という Welcome と同じ方針。 */
  shortcut?: string;
  /** ラベルの右に薄く出す補足。最近開いたファイルのディレクトリに使う。 */
  detail?: string;
  /** ツールチップ。省略されて読めない情報（長いパス）を補う。 */
  title?: string;
  run: () => void;
}

export interface MenuGroup {
  id: string;
  /** 見出し。無いグループは区切り線だけで隣と分かれる。 */
  label?: string;
  items: MenuAction[];
  /** 項目が 0 件のときに出す文。**押せない項目の代わり**であって、項目ではない。 */
  empty?: string;
}

/** 表に書く 1 行。`command` が押せる状態のときだけ `MenuAction` になる。 */
interface MenuEntry {
  /** `{#each}` のキー。`CommandId` をそのまま使わないのは、短いほうが読めるため。 */
  id: string;
  command: CommandId;
  /** ラベル。状態で変わるものだけ関数で渡す。 */
  label: string | (() => string);
  shortcut?: string;
}

interface MenuSection {
  id: string;
  label?: string;
  entries: MenuEntry[];
}

/**
 * 並べる順。**この配列が「メニューに何があるか」の全体**である。
 *
 * グループの意味は 03.ux-spec/01-screen-layout.md §3。
 * - `document` … いま開いている文書に対する操作。再読み込みと検索は同じ対象を指すので隣に置く
 * - `zoom` … 3 つで 1 組。見出しを付けないと「拡大」が単独の機能に見える
 * - `app` … アプリに対する操作。**ファイルを開いていなくても押せる**
 */
const MENU: MenuSection[] = [
  {
    id: 'file',
    entries: [
      { id: 'open', command: 'document.open', label: ja.menu.open, shortcut: 'Ctrl+O' },
      // 新規ファイル（`Ctrl+N`）。**開いていなくても押せる。**
      // 並びは Welcome 画面と揃える（03.ux-spec/08-empty-states.md §1 は開く → 新規）。
      // 同じ 2 つが場所によって違う順で並ぶと、位置で覚えられない。
      { id: 'new', command: 'document.new', label: ja.menu.new, shortcut: 'Ctrl+N' },
      // 保存（F-EDIT-02）。**キーを知る場所が他に無い**（パレットは M3）。
      { id: 'save', command: 'document.save', label: ja.menu.save, shortcut: 'Ctrl+S' },
      { id: 'save-as', command: 'document.saveAs', label: ja.menu.saveAs, shortcut: 'Ctrl+Shift+S' },
    ],
  },
  {
    id: 'history',
    // 戻る / 進む（F-NAV-07）。**辿れるときにしか出ない**（`isListed`）。
    // ここに置くのは、`Alt+←` というキーの存在を知る場所が他に無いため
    // （コマンドパレットは M3 / 06.roadmap/m1.5-shell-and-settings.md §5）。
    entries: [
      { id: 'back', command: 'history.back', label: ja.history.back, shortcut: 'Alt+←' },
      { id: 'forward', command: 'history.forward', label: ja.history.forward, shortcut: 'Alt+→' },
    ],
  },
  {
    id: 'document',
    entries: [
      // モードの切り替え（F-MODE-06）。ラベルは行き先を言う（`ja.menu`）。
      {
        id: 'mode',
        command: 'view.togglePreview',
        label: () => (viewStore.mode === 'preview' ? ja.menu.toEdit : ja.menu.toPreview),
        shortcut: 'Ctrl+Shift+V',
      },
      // Split（F-MODE-03）。ラベルは行き先を言う（モードのトグルと同じ）。
      {
        id: 'split',
        command: 'view.toggleSplit',
        label: () => (viewStore.mode === 'split' ? ja.menu.fromSplit : ja.menu.toSplit),
        shortcut: 'Ctrl+\\',
      },
      { id: 'reload', command: 'document.reload', label: ja.menu.reload, shortcut: 'F5' },
      // 検索は面によって実体が変わる（`features/mode/find.ts`）。ラベルも変える。
      {
        id: 'search',
        command: 'find.open',
        label: () => (viewStore.mode === 'preview' ? ja.menu.search : ja.menu.find),
        shortcut: 'Ctrl+F',
      },
      // 置換は Edit のときだけ出る（`isListed`）。
      { id: 'replace', command: 'find.replace', label: ja.menu.replace, shortcut: 'Ctrl+H' },
      // ペインの開閉（03.ux-spec/06-panes.md §4 の「ペイン」系）。
      // ラベルが状態で変わるのは、押した結果を先に言うため。
      {
        id: 'outline',
        command: 'pane.toggleRight',
        label: () => (viewStore.panes.right.open ? ja.pane.hideOutline : ja.pane.showOutline),
        shortcut: 'Ctrl+Alt+B',
      },
      { id: 'jump', command: 'outline.jump', label: ja.outline.jump, shortcut: 'Ctrl+Shift+O' },
    ],
  },
  {
    id: 'zoom',
    label: ja.menu.zoom,
    entries: [
      { id: 'zoom-in', command: 'preview.zoomIn', label: ja.menu.zoomIn, shortcut: 'Ctrl+=' },
      { id: 'zoom-out', command: 'preview.zoomOut', label: ja.menu.zoomOut, shortcut: 'Ctrl+-' },
      { id: 'zoom-reset', command: 'preview.zoomReset', label: ja.menu.zoomReset, shortcut: 'Ctrl+0' },
    ],
  },
  {
    id: 'app',
    entries: [
      { id: 'settings', command: 'settings.open', label: ja.menu.settings, shortcut: 'Ctrl+,' },
      // 終了（ADR-0007 論点 3 の 3 経路のうちの 1 つ）。
      //
      // **`✕` がトレイ格納の意味になったので、ここが必要になった。**
      // ウィンドウの中から確実に終われる場所が 1 つも無いと、
      // 「閉じたのに終わっていない」に気づいた人の逃げ場が
      // トレイアイコンだけになる。ハンバーガーメニューは §3 が言う
      // 「初学者の逃げ道」であり、まさにその役割。
      { id: 'quit', command: 'app.quit', label: ja.menu.quit, shortcut: 'Ctrl+Q' },
    ],
  },
];

/**
 * いま並べるべきものを組み立てる。
 *
 * ストア（`viewStore` / `recentStore`）を直接読む。呼び出し側で `$derived`
 * すれば、ファイルを開いた / 履歴が増えたときに自動で組み直される。
 */
export function buildMenu(): MenuGroup[] {
  const groups: MenuGroup[] = [];

  for (const section of MENU) {
    // 「最近開いたファイル」は**コマンドの一覧ではなくデータの一覧**なので、
    // `file` グループの直後に別枠で差し込む。
    if (section.id === 'history') groups.push(recentGroup());

    const items = section.entries.filter((entry) => isCommandListed(entry.command)).map(toAction);
    // 空になったグループは区切り線ごと消す（`recent` だけは `empty` の文で埋める）。
    if (items.length === 0) continue;

    groups.push(
      section.label === undefined ? { id: section.id, items } : { id: section.id, label: section.label, items },
    );
  }

  return groups;
}

function toAction(entry: MenuEntry): MenuAction {
  const action: MenuAction = {
    id: entry.id,
    label: typeof entry.label === 'function' ? entry.label() : entry.label,
    run: () => {
      runCommand(entry.command);
    },
  };
  return entry.shortcut === undefined ? action : { ...action, shortcut: entry.shortcut };
}

/**
 * 最近開いたファイル（F-OPEN-09）。
 *
 * 開けなかった場合の通知と履歴からの除去は `openPath` の担当（Welcome と同じ）。
 * **履歴が空でも見出しは出す。** 押せない項目の代わりに 1 行の文で埋める。
 */
function recentGroup(): MenuGroup {
  return {
    id: 'recent',
    label: ja.menu.recent,
    empty: ja.menu.noRecent,
    items: recentStore.entries.slice(0, MENU_RECENT_SHOWN).map((entry) => {
      const split = splitPath(entry.path);
      return {
        id: entry.path,
        label: split.name,
        detail: split.dir,
        title: entry.path,
        run: () => {
          runCommand('document.openPath', entry.path);
        },
      };
    }),
  };
}
