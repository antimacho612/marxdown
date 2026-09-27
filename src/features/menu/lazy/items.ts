/**
 * ハンバーガーメニューに並べるもの。
 * 遅延チャンクでメニューが開かれるまでロードされない。
 *
 * 並べるのは `CommandId` とラベルの対応だけで、実行内容は知らない（実体の表は `app/commands.ts`）。
 * コマンドパレットも同じ表を別の見せ方で並べている。
 * `AppMenu.svelte` はこの配列を描くだけで項目を知らないため、項目を追加するのは `MENU` への 1 行で終わる。
 *
 * 押せない項目（例: ファイル未オープン時の再読み込み・倍率・検索）は存在ごと消す（Principle 3）。
 * 判定は `app/commands.ts` の `isListed` が唯一の根拠で、メニューとパレットで結論がずれない。
 */
import { commandEntry, resolve } from '@/features/palette/lazy/catalog';
import { formatZoom, ZOOM_MAX, ZOOM_MIN } from '@/features/preview';
import { viewStore } from '@/features/view';
import { recentStore } from '@/features/workspace';
import { ja } from '@/i18n/ja';
import { isCommandListed, runCommand, type CommandId } from '@/lib/commands';
import { splitPath } from '@/lib/path';

/**
 * 一覧に出す最近開いたファイルの件数。
 *
 * Welcome 画面（`RECENT_SHOWN`）と同じ 6 件にする。
 * サブメニューに収めた後も件数は増やさない。増やすとサブメニューが履歴の一覧として縦に伸びる。
 */
export const MENU_RECENT_SHOWN = 6;

/** 押すと実行される 1 行。 */
export interface MenuAction {
  kind: 'action';
  /** `{#each}` のキー。 */
  id: string;
  label: string;
  /** 右端に表示するキー。ショートカットを併記する方針は Welcome と同じ。 */
  shortcut?: string;
  /** ラベルの右に薄く出す補足。最近開いたファイルのディレクトリに使う。 */
  detail?: string;
  /** ツールチップ。省略されて読めない情報（長いパス）を補う。 */
  title?: string;
  run: () => void;
}

/** 横に開く下位のメニュー。親の 1 行を占め、中身は開いたときにだけ表示する。 */
export interface MenuSubmenu {
  kind: 'submenu';
  id: string;
  label: string;
  items: MenuAction[];
  /** 項目が 0 件のときに表示する文。操作できない項目を並べる代わりのものであり、項目そのものではない。 */
  empty?: string;
}

/**
 * `[−] 値 [+]` を 1 行に並べたもの。
 *
 * 押してもメニューを閉じない。値を見ながら続けて押す操作であるため。
 * 中央の値を押すと既定値へ戻す。
 */
export interface MenuStepper {
  kind: 'stepper';
  id: string;
  label: string;
  /** 現在値の表示。 */
  value: string;
  decrease: MenuAction;
  reset: MenuAction;
  increase: MenuAction;
  /** 端に達して押しても変わらない側。消さずに無効表示にするのは、ボタンの位置を動かさないため。 */
  atMin: boolean;
  atMax: boolean;
}

export type MenuItem = MenuAction | MenuSubmenu | MenuStepper;

/** 区切り線で分かれる 1 グループ。 */
export interface MenuGroup {
  id: string;
  items: MenuItem[];
}

/**
 * 表に書く 1 行。`command` が押せる状態のときだけ `MenuAction` になる。
 *
 * ラベルとキーは持たない。
 * どちらも `features/palette/lazy/catalog.ts` にあり、メニューはそこから取る。
 * 同じ文言がメニューとパレットの 2 か所にあると、片方だけが修正される事態が起きる。
 */
interface CommandEntry {
  /** `{#each}` のキー。`CommandId` をそのまま使わないのは、短いほうが読めるため。 */
  id: string;
  command: CommandId;
}

interface SubmenuEntry {
  id: string;
  label: string;
  submenu: CommandEntry[];
}

/** 最近開いたファイル。コマンドの一覧ではなくデータの一覧であるため、中身は `recentSubmenu` が組み立てる。 */
interface RecentEntry {
  id: string;
  recent: true;
}

interface ZoomEntry {
  id: string;
  zoom: true;
}

type MenuEntry = CommandEntry | SubmenuEntry | RecentEntry | ZoomEntry;

/**
 * 並べる順。この配列がメニューの項目の全体を表す。
 *
 * グループの意味は UX 仕様の画面構成にある。
 * - `file` … ファイルを開く・書き出す操作。一覧を伴うもの（履歴・書き出し形式）はサブメニューに収める
 * - `view` … 見え方を変える操作。文書の中身は変わらない
 * - `document` … いま開いている文書に対する操作。再読み込みと検索は同じ対象を指すので隣に置く
 * - `app` … アプリに対する操作。ファイルを開いていなくても実行できる。ヘルプもここに収める
 */
const MENU: { id: string; entries: MenuEntry[] }[] = [
  {
    id: 'file',
    entries: [
      { id: 'open', command: 'document.open' },
      // フォルダを開く（F-NAV-03）。ファイルツリーの基点はここか `marxdown <dir>` でしか決まらない。
      { id: 'open-folder', command: 'folder.open' },
      // 新規ファイル（`Ctrl+N`）。ファイルを開いていなくても実行できる。
      // 並び順は Welcome 画面に揃える（「開く」の次に「新規」）。
      // 同じ 2 つが場所によって異なる順で並ぶと、位置で覚えられなくなる。
      { id: 'new', command: 'document.new' },
      // 最近開いたファイル（F-OPEN-09）。開く手段の並びに置く。
      { id: 'recent', recent: true },
      // 保存（F-EDIT-02）。
      { id: 'save', command: 'document.save' },
      { id: 'save-as', command: 'document.saveAs' },
      // エクスポート（F-VIEW-18）。保存と同じく、いま開いている文書をファイルへ書き出す操作の並びに置く。
      {
        id: 'export',
        label: ja.menu.export,
        submenu: [
          { id: 'export-html', command: 'document.exportHtml' },
          { id: 'export-pdf', command: 'document.exportPdf' },
        ],
      },
      // 別ウィンドウで開く（F-OPEN-06）。ファイルを開く手段の並びに置く。
      { id: 'move-to-new-window', command: 'window.moveTab' },
    ],
  },
  {
    id: 'history',
    // 戻る / 進む（F-NAV-07）。辿れるときにしか表示しない（`isListed`）。
    entries: [
      { id: 'back', command: 'history.back' },
      { id: 'forward', command: 'history.forward' },
    ],
  },
  {
    id: 'view',
    entries: [
      // モードの切り替え（F-MODE-06）。ラベルは行き先を言う（`ja.menu`）。
      { id: 'mode', command: 'view.togglePreview' },
      // Split（F-MODE-03）。ラベルは行き先を言う（モードのトグルと同じ）。
      { id: 'split', command: 'view.toggleSplit' },
      // ペインの開閉（「ペイン」系）。
      // ラベルが状態で変わるのは、押した結果を先に言うため。
      { id: 'outline', command: 'pane.toggleRight' },
      { id: 'jump', command: 'outline.jump' },
      // 表示倍率（F-VIEW-11）。
      { id: 'zoom', zoom: true },
    ],
  },
  {
    id: 'document',
    entries: [
      { id: 'reload', command: 'document.reload' },
      // 検索は面によって実体が変わる（`features/mode/find.ts`）。ラベルも変える。
      { id: 'search', command: 'find.open' },
      // 置換は Edit のときだけ出る（`isListed`）。
      { id: 'replace', command: 'find.replace' },
    ],
  },
  {
    id: 'app',
    entries: [
      // コマンドパレット（F-NAV-06）。ここが初学者の逃げ道である。
      // キーを知らない人がすべての機能へ辿り着ける経路は、メニューからパレットへ入る 2 手だけである。
      { id: 'palette', command: 'palette.open' },
      { id: 'settings', command: 'settings.open' },
      // ヘルプ（F-OS-09 / ADR-0026）。一覧を伴うため、書き出しと同じくサブメニューに収める。
      // 「更新を確認」もここに置く。アプリそのものについての操作であり、使用頻度もほかの項目と同程度に低い。
      {
        id: 'help',
        label: ja.menu.help,
        submenu: [
          { id: 'report-issue', command: 'help.reportIssue' },
          { id: 'suggest-feature', command: 'help.suggestFeature' },
          { id: 'check-update', command: 'app.checkUpdate' },
          { id: 'license', command: 'help.license' },
          { id: 'third-party-notices', command: 'help.thirdPartyNotices' },
          { id: 'about', command: 'help.about' },
        ],
      },
      // 終了（ADR-0007 論点 3 の 3 経路のうちの 1 つ）。
      //
      // `✕` はトレイ格納の意味であるため、この項目が必要である。
      // ウィンドウの中から確実に終了できる場所が無いと、閉じても終了していないことに気づいた場合の操作先がトレイアイコンだけになる。
      // ハンバーガーメニューは「初学者の逃げ道」にあたり、この項目はその役割を担う。
      { id: 'quit', command: 'app.quit' },
    ],
  },
];

/**
 * いま並べるべきものを組み立てる。
 *
 * ストア（`viewStore` / `recentStore`）を直接読む。呼び出し側で `$derived` すれば、ファイルを開いた / 履歴が増えた / 倍率が変わったときに自動で組み直される。
 */
export function buildMenu(): MenuGroup[] {
  const groups: MenuGroup[] = [];

  for (const section of MENU) {
    const items = section.entries.flatMap((entry) => {
      const item = toItem(entry);
      return item === null ? [] : [item];
    });
    // 空になったグループは区切り線ごと消す。
    if (items.length === 0) continue;
    groups.push({ id: section.id, items });
  }

  return groups;
}

function toItem(entry: MenuEntry): MenuItem | null {
  if ('recent' in entry) return recentSubmenu(entry.id);
  if ('zoom' in entry) return zoomStepper(entry.id);
  if ('submenu' in entry) {
    const items = listed(entry.submenu);
    // 中身が全部消えたサブメニューは、開いても押せるものが無いので親の行ごと消す。
    return items.length === 0 ? null : { kind: 'submenu', id: entry.id, label: entry.label, items };
  }
  return isCommandListed(entry.command) ? toAction(entry) : null;
}

function listed(entries: CommandEntry[]): MenuAction[] {
  return entries.filter((entry) => isCommandListed(entry.command)).map(toAction);
}

/**
 * 表示できる形にする。ラベルとキーはカタログから取る（`features/palette/lazy/catalog.ts`）。
 *
 * カタログに無いコマンドは id をそのまま出す。起こらないはずの事態を黙って通さないためで、追加したコマンドをカタログへ載せ忘れると、メニューにもパレットにも id が並んで気づく。
 */
function toAction(entry: CommandEntry): MenuAction {
  const found = commandEntry(entry.command);
  // メニューが要るのはラベルとキーだけである。英語キーワード（`keywords`）はパレットの照合専用で、ここでは使わない。
  const shown: { label: string; shortcut?: string } = found === undefined ? { label: entry.command } : resolve(found);
  const action: MenuAction = {
    kind: 'action',
    id: entry.id,
    label: shown.label,
    run: () => {
      runCommand(entry.command);
    },
  };
  return shown.shortcut === undefined ? action : { ...action, shortcut: shown.shortcut };
}

/**
 * 最近開いたファイル（F-OPEN-09）。
 *
 * 開けなかった場合の通知と履歴からの除去は `openPath` の担当（Welcome と同じ）。
 * 履歴が空でも親の行は表示する。行の有無で下の項目の位置が変わらないようにするため。
 */
function recentSubmenu(id: string): MenuSubmenu {
  return {
    kind: 'submenu',
    id,
    label: ja.menu.recent,
    empty: ja.menu.noRecent,
    items: recentStore.entries.slice(0, MENU_RECENT_SHOWN).map((entry) => {
      const split = splitPath(entry.path);
      return {
        kind: 'action',
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

/** 表示倍率（F-VIEW-11）。3 つのコマンドのどれかが押せないときは行ごと消す（3 つの `isListed` は同じ条件である）。 */
function zoomStepper(id: string): MenuStepper | null {
  const [decrease, reset, increase] = listed([
    { id: 'zoom-out', command: 'preview.zoomOut' },
    { id: 'zoom-reset', command: 'preview.zoomReset' },
    { id: 'zoom-in', command: 'preview.zoomIn' },
  ]);
  if (decrease === undefined || reset === undefined || increase === undefined) return null;

  const zoom = viewStore.zoom;
  return {
    kind: 'stepper',
    id,
    label: ja.menu.zoom,
    value: formatZoom(zoom),
    decrease,
    reset,
    increase,
    atMin: zoom <= ZOOM_MIN,
    atMax: zoom >= ZOOM_MAX,
  };
}
