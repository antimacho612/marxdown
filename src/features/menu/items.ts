/**
 * ハンバーガーメニューに並べるもの（03.ux-spec.md §2.3）。
 *
 * **このモジュールは遅延チャンク。** メニューが開かれるまでロードされない
 * （06.roadmap.md §5.3 の完了条件）。
 *
 * # 見た目と切り離す理由
 *
 * 項目を足すのは後続の Phase の仕事である（Phase 7 で「終了」、
 * M3 でコマンドパレットへの登録）。**足す作業が `buildMenu` に 1 行加えるだけで
 * 終わる**ようにしてある。`AppMenu.svelte` はこの配列を描くだけで、
 * どんな項目があるかを知らない。
 *
 * # 押せないものを並べない
 *
 * Principle 3「Simple Means Low Cognitive Load」。ファイルを開いていないときの
 * 再読み込み・倍率・検索は、押しても何も起きない。**存在ごと消す。**
 * Welcome 画面（§9.1）が「フォルダを開く」を並べないのと同じ判断。
 */
import { openPath, openViaDialog, reloadCurrent } from '@/features/document/open';
import { documentStore } from '@/features/document/store.svelte';
import { canGoBack, canGoForward, goBack, goForward } from '@/features/history/navigate';
import { openJumpLazily } from '@/features/outline/open-jump';
import { toggleRightPane } from '@/features/panes/panes';
import { openSearchLazily } from '@/features/preview/open-search';
import { zoomIn, zoomOut, zoomReset } from '@/features/preview/zoom';
import { openSettingsLazily } from '@/features/settings/open-settings';
import { viewStore } from '@/features/view/store.svelte';
import { recentStore } from '@/features/workspace/recent.svelte';
import { ja } from '@/i18n/ja';
import { splitPath } from '@/lib/path';
import { getPlatform } from '@/platform';

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

/**
 * いま並べるべきものを組み立てる。
 *
 * ストア（`documentStore` / `recentStore`）を直接読む。呼び出し側で `$derived`
 * すれば、ファイルを開いた / 履歴が増えたときに自動で組み直される。
 */
export function buildMenu(): MenuGroup[] {
  const hasDocument = documentStore.meta !== null;

  const groups: MenuGroup[] = [
    {
      id: 'file',
      items: [
        {
          id: 'open',
          label: ja.menu.open,
          shortcut: 'Ctrl+O',
          run: () => void openViaDialog(),
        },
      ],
    },
    {
      id: 'recent',
      label: ja.menu.recent,
      empty: ja.menu.noRecent,
      // 開けなかった場合の通知と履歴からの除去は `openPath` の担当（Welcome と同じ）。
      items: recentStore.entries.slice(0, MENU_RECENT_SHOWN).map((entry) => {
        const split = splitPath(entry.path);
        return {
          id: entry.path,
          label: split.name,
          detail: split.dir,
          title: entry.path,
          run: () => void openPath(entry.path),
        };
      }),
    },
  ];

  // 戻る / 進む（F-NAV-07）。**辿れるときにしか出さない。**
  // 押しても何も起きない項目を並べないのは、再読み込みや倍率と同じ判断。
  // ここに置くのは、`Alt+←` というキーの存在を知る場所が他に無いため
  // （コマンドパレットは M3 / 06.roadmap.md §5.5）。
  const history: MenuAction[] = [];
  if (canGoBack()) history.push({ id: 'back', label: ja.history.back, shortcut: 'Alt+←', run: () => void goBack() });
  if (canGoForward()) {
    history.push({ id: 'forward', label: ja.history.forward, shortcut: 'Alt+→', run: () => void goForward() });
  }
  if (history.length > 0) groups.push({ id: 'history', items: history });

  if (hasDocument) {
    groups.push(
      {
        // 「いま開いている文書に対する操作」。再読み込みと検索は同じ対象を指すので隣に置く。
        id: 'document',
        items: [
          { id: 'reload', label: ja.menu.reload, shortcut: 'F5', run: () => void reloadCurrent() },
          { id: 'search', label: ja.menu.search, shortcut: 'Ctrl+F', run: () => void openSearchLazily() },
          // ペインの開閉（03.ux-spec.md §7.4 の「ペイン」系）。
          // ラベルが状態で変わるのは、押した結果を先に言うため。
          {
            id: 'outline',
            label: viewStore.panes.right.open ? ja.pane.hideOutline : ja.pane.showOutline,
            shortcut: 'Ctrl+Alt+B',
            run: () => toggleRightPane(),
          },
          { id: 'jump', label: ja.outline.jump, shortcut: 'Ctrl+Shift+O', run: () => void openJumpLazily() },
        ],
      },
      {
        // 倍率は 3 つで 1 組。見出しを付けないと「拡大」が単独の機能に見える。
        id: 'zoom',
        label: ja.menu.zoom,
        items: [
          { id: 'zoom-in', label: ja.menu.zoomIn, shortcut: 'Ctrl+=', run: () => void zoomIn() },
          { id: 'zoom-out', label: ja.menu.zoomOut, shortcut: 'Ctrl+-', run: () => void zoomOut() },
          { id: 'zoom-reset', label: ja.menu.zoomReset, shortcut: 'Ctrl+0', run: () => void zoomReset() },
        ],
      },
    );
  }

  // 「アプリに対する操作」。**ファイルを開いていなくても押せる**ので、
  // 文書に対する操作の早期 return より後ろではなく、両方の経路に載せる。
  groups.push({
    id: 'app',
    items: [
      { id: 'settings', label: ja.menu.settings, shortcut: 'Ctrl+,', run: () => void openSettingsLazily() },
      // 終了（ADR-0007 論点 3 の 3 経路のうちの 1 つ）。
      //
      // **`✕` がトレイ格納の意味になったので、ここが必要になった。**
      // ウィンドウの中から確実に終われる場所が 1 つも無いと、
      // 「閉じたのに終わっていない」に気づいた人の逃げ場が
      // トレイアイコンだけになる。ハンバーガーメニューは §2.3 が言う
      // 「初学者の逃げ道」であり、まさにその役割。
      { id: 'quit', label: ja.menu.quit, shortcut: 'Ctrl+Q', run: () => void getPlatform().quitApp() },
    ],
  });

  return groups;
}
