/**
 * クイックオープンに並べる候補（`Ctrl+P` / F-NAV-05）。
 *
 * 並びは「最近開いたファイル → フォルダ内 Markdown」である
 * （[03.ux-spec > command-palette](../../../../docs/03.ux-spec/05-command-palette.md)）。
 * 最近開いたファイルを先に置くのは、何も入力せずに開いたときに最も選ばれやすいためで、
 * あいまい検索が働き始めるとスコア順に並び替わる。
 *
 * 純粋関数として切り出してある。IPC も状態も持たないので、並びと重複の扱いだけを試験できる。
 */
import { splitPath } from '@/lib/path';
import type { RecentEntry } from '@/platform';

/** 並べる 1 件。 */
export interface FileCandidate {
  /** 正規化済み絶対パス。そのまま開ける。 */
  path: string;
  /** ファイル名。照合の対象になる。 */
  name: string;
  /** 右端に出す補足。基点からの相対ディレクトリ、または「最近」。 */
  detail: string;
}

/**
 * 候補を組み立てる。最近開いたファイルが先、続いて基点配下の Markdown。
 *
 * 同じパスが両方に現れたときは最近開いたファイル側だけを残す。
 * `recentLabel` は最近開いたファイルの目印で、基点の外にあるものも並ぶため、
 * ディレクトリの代わりにこれを出す。
 */
export function buildCandidates(
  root: string | null,
  files: readonly string[],
  recent: readonly RecentEntry[],
  recentLabel: string,
): FileCandidate[] {
  const seen = new Set<string>();
  const candidates: FileCandidate[] = [];

  for (const entry of recent) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    candidates.push({ path: entry.path, name: splitPath(entry.path).name, detail: recentLabel });
  }

  for (const path of files) {
    if (seen.has(path)) continue;
    seen.add(path);
    candidates.push({ path, name: splitPath(path).name, detail: relativeDir(root, path) });
  }

  return candidates;
}

/**
 * 基点からの相対ディレクトリ。基点の直下なら空文字。
 *
 * 表示のためだけの文字列であり、開くときに使うのは絶対パスのほうである。
 * 基点の外にあるものは絶対パスのディレクトリをそのまま出す。
 */
function relativeDir(root: string | null, path: string): string {
  const { dir } = splitPath(path);
  if (root === null || !dir.startsWith(root)) return dir;
  return dir.slice(root.length).replace(/^[\\/]+/, '');
}
