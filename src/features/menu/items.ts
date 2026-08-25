/**
 * ハンバーガーメニューに並べるもの（03.ux-spec.md §2.3）。
 *
 * **このモジュールは遅延チャンク。** メニューが開かれるまでロードされない
 * （06.roadmap.md §5.3 の完了条件）。
 *
 * # 見た目と切り離す理由
 *
 * 項目を足すのは後続の Phase の仕事である（Phase 4 で「設定」、Phase 7 で「終了」、
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
import { openSearchLazily } from '@/features/preview/open-search';
import { zoomIn, zoomOut, zoomReset } from '@/features/preview/zoom';
import { recentStore } from '@/features/workspace/recent.svelte';
import { ja } from '@/i18n/ja';
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

  if (!hasDocument) return groups;

  groups.push(
    {
      // 「いま開いている文書に対する操作」。再読み込みと検索は同じ対象を指すので隣に置く。
      id: 'document',
      items: [
        { id: 'reload', label: ja.menu.reload, shortcut: 'F5', run: () => void reloadCurrent() },
        { id: 'search', label: ja.menu.search, shortcut: 'Ctrl+F', run: () => void openSearchLazily() },
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

  return groups;
}
