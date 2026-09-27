/**
 * ファイルツリーの「パスのコピー」と「Markdown リンクとしてコピー」が使う文字列の組み立て。
 *
 * 遅延チャンクに置く。`lib/path.ts` は `main` にあり、ツリーを開かない人の分まで重くしない。
 * どれも文字列の加工だけで、パスの正規化は行わない（`lib/path.ts` の冒頭と同じ理由）。
 */
import { splitPath } from '@/lib/path';

const IMAGE = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const MARKDOWN = /\.(?:md|markdown|mdown|mkd)$/i;

function segments(path: string): string[] {
  return path.split(/[\\/]/).filter((segment, index) => index === 0 || segment !== '');
}

/** Windows のパス（ドライブレター / UNC）か。大文字と小文字を区別しない比較に切り替える。 */
function isWindowsPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\');
}

/**
 * `fromDir` から見た `target` の相対パス。区切りは `/` にする（Markdown のリンクと同じ）。
 *
 * ドライブが違うなど共通の祖先が無いときは、`target` をそのまま `/` 区切りで返す。
 */
export function relativeTo(fromDir: string, target: string): string {
  const from = segments(fromDir);
  const to = segments(target);
  const fold = isWindowsPath(target) ? (s: string): string => s.toLowerCase() : (s: string): string => s;

  let common = 0;
  while (common < from.length && common < to.length && fold(from[common] ?? '') === fold(to[common] ?? '')) {
    common += 1;
  }
  if (common === 0) return to.join('/');

  const parts = [...Array.from({ length: from.length - common }, () => '..'), ...to.slice(common)];
  return parts.length === 0 ? '.' : parts.join('/');
}

/** 基点から見た相対パス（「相対パスのコピー」）。区切りは OS の表記のまま残す。 */
export function relativeToRoot(path: string, root: string): string {
  const base = root.replace(/[\\/]+$/, '');
  if (path.length <= base.length) return '.';
  return path.slice(base.length + 1);
}

/**
 * `fromDir` にある文書から `target` を指す Markdown のリンク。
 *
 * 画像は `![名前](...)`、Markdown は拡張子を除いた名前をリンクの文字にする。
 * 空白や括弧を含むパスは `<...>` で囲む。そのままでは CommonMark のリンクの終わりと区別できない。
 */
export function markdownLink(target: string, fromDir: string): string {
  const relative = relativeTo(fromDir, target);
  const href = /[\s()<>]/.test(relative) ? `<${relative}>` : relative;
  const { name } = splitPath(target);
  const stem = name.replace(/\.[^.]+$/, '') || name;
  const label = (IMAGE.test(name) || MARKDOWN.test(name) ? stem : name).replaceAll(/[[\]]/g, '\\$&');
  return IMAGE.test(name) ? `![${label}](${href})` : `[${label}](${href})`;
}
