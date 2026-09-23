/**
 * ファイルツリーの表示フィルター（F-NAV-03 / 03.ux-spec/06-panes.md §1）。
 *
 * 絞り込むのはファイルだけで、ディレクトリは常に残す。
 * 遅延展開なので中に一致するファイルがあるかは開くまで分からず、閉じたまま隠すと到達する手段ごと失われる。
 *
 * 永続化しない（`features/view/store.svelte.ts` の `scrollSync` と同じ扱い）。
 * 次の起動時も絞り込まれたままだと、ファイルが一覧に無い理由を判断できない。
 *
 * ツールバーもツリーも遅延チャンク側にあるため、このモジュールも `lazy/` に置く。
 * `features/workspace/index.ts` からは公開しない。公開すると `main` から参照できてしまう。
 */
import { MARKDOWN_EXTENSIONS } from '@/lib/path';
import type { DirEntry } from '@/platform';

/**
 * 入力欄の文字列を拡張子の並びに直す。
 *
 * 区切りはカンマ・読点・空白のいずれでもよい。
 * 先頭の `.` と `*` は取り除くため、`.md` や `*.md` と書いても `md` として扱う。
 * 大文字は小文字に揃え、重複は取り除く。
 */
export function parseExtensions(input: string): string[] {
  const parts = input
    .split(/[\s,、]+/)
    .map((part) => part.replace(/^[*.]+/, '').toLowerCase())
    .filter((part) => part !== '');
  return parts.filter((part, index) => parts.indexOf(part) === index);
}

/**
 * 拡張子（ドットを含まない小文字）。持たなければ空文字。
 *
 * `.gitignore` のような先頭のドットは拡張子として扱わない。
 */
function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

class FilterStore {
  /**
   * Markdown だけを表示する。
   *
   * 拡張子フィルターが有効な間は効果がない。
   * 2 つを足し合わせる形にすると、「Markdown だけ表示」を押したまま他の拡張子が並ぶことになる。
   */
  markdownOnly = $state(false);

  /** 拡張子の入力欄の中身。入力欄の表示も絞り込みもこの 1 つから導く。 */
  extensionsInput = $state('');

  /**
   * 入力欄を開いているか。
   *
   * ボタンで閉じたときは絞り込みも解除する。
   * `Esc` で閉じたときは残す（`ExplorerToolbar.svelte`）。
   */
  extensionsOpen = $state(false);

  /** 表示する拡張子。空なら拡張子では絞り込まない。 */
  extensions = $derived(parseExtensions(this.extensionsInput));

  /**
   * 表示する拡張子。`null` は「絞り込まない」。
   *
   * 拡張子フィルターが優先で、有効な間は `markdownOnly` を見ない。
   * 数件しか入らないため `Set` にはしない。
   */
  allowed = $derived<readonly string[] | null>(
    this.extensions.length > 0 ? this.extensions : this.markdownOnly ? MARKDOWN_EXTENSIONS : null,
  );
}

/** ファイルツリーの表示フィルター。モジュールの singleton として共有する。 */
export const filterStore = new FilterStore();

/**
 * ディレクトリの中身から、いま表示するものだけを取り出す。
 *
 * ディレクトリは絞り込みの対象にしない。
 * 絞り込んでいないときは受け取った配列をそのまま返す。
 */
export function visibleEntries(entries: readonly DirEntry[]): readonly DirEntry[] {
  const allowed = filterStore.allowed;
  if (allowed === null) return entries;
  return entries.filter((entry) => entry.dir || allowed.includes(extensionOf(entry.name)));
}

/** テスト用。絞り込みを解除し、入力欄も閉じる。 */
export function resetFilter(): void {
  filterStore.markdownOnly = false;
  filterStore.extensionsInput = '';
  filterStore.extensionsOpen = false;
}
