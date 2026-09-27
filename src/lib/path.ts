/**
 * パス文字列を扱う小さな関数群。
 *
 * 依存を持たない純粋関数だけを置く。
 * UI からも Domain からも使うため、どちらかの下に置くと参照の向きが崩れる（`features/` が `app/` を参照する、など）。
 *
 * パスの解決と正規化そのものは Rust 側が担当する。
 * ここで行うのは、既に正規化されたパスを表示のために分割することだけである。
 */

/** パスをディレクトリとファイル名に分ける。Windows と POSIX の両方を受ける。 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (index < 0) return { dir: '', name: path };
  return { dir: path.slice(0, index), name: path.slice(index + 1) };
}

/**
 * 親ディレクトリ。相対パスの基準やファイルツリーの基点に使う。
 *
 * ルート直下のファイルではルートそのもの（`C:\` / `/`）を返す。
 */
export function dirOf(path: string): string {
  const { dir } = splitPath(path);
  // NOTE: `C:` はドライブのルートではなく C ドライブのカレントディレクトリを指す。
  // Rust 側で正規化するとプロセスの cwd に解決され、無関係なフォルダが基点になる。
  if (/^[a-z]:$/i.test(dir)) return path.slice(0, dir.length + 1);
  if (dir === '' && /^[\\/]/.test(path)) return path.charAt(0);
  return dir;
}

/**
 * ベースと相対パスをつなぐ。
 *
 * `..` の畳み込みは行わない。
 * 正規化と symlink の解決は Rust 側が担当しており（`dunce::canonicalize` / `scope.rs`）、こちらで先に解決すると JS 側の正規形と実際の解決先が食い違う。
 * 食い違った状態でスコープ検証を行うと、検証を通過してしまう経路ができる（N-SEC-05）。
 */
export function joinPath(baseDir: string, relative: string): string {
  if (baseDir === '' || isAbsolutePath(relative)) return relative;

  const separator = baseDir.includes('\\') ? '\\' : '/';
  const trimmed = baseDir.replace(/[\\/]+$/, '');
  return `${trimmed}${separator}${relative.replace(/^[\\/]+/, '')}`;
}

/**
 * ドライブレター（`C:\`）/ UNC（`\\server`）/ 先頭が区切り文字。
 *
 * `[x](/docs/a.md)` のような先頭の `/` は、Web ではサイトのルートを指すが、ローカルファイルビューアに相当するルートは無い。
 * そのため絶対パスとして扱い、実在しなければ Rust 側が not-found を返す。
 * 開いているファイルからの相対パスとして解釈し直すと、指定と結果が一致しなくなる。
 */
export function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\');
}

/**
 * `path` が `from` かその配下なら、`to` へ付け替えたパスを返す。どちらでもなければ `null`。
 *
 * ファイルツリーでリネーム・移動したとき、開いているタブと履歴のパスを付け替えるために使う（ADR-0020）。
 * 比較はパスの区切りの位置で行い、`C:\a\doc` を `C:\a\docs` の配下と取り違えない。
 * Windows のパスは大文字と小文字を区別しない（`src-tauri/src/fsops.rs` の `relocate` と同じ規則）。
 */
export function relocatePath(path: string, from: string, to: string): string | null {
  const insensitive = /^[a-z]:[\\/]/i.test(from) || from.startsWith('\\\\');
  const same = (a: string, b: string): boolean => (insensitive ? a.toLowerCase() === b.toLowerCase() : a === b);

  if (same(path, from)) return to;
  const base = from.replace(/[\\/]+$/, '');
  const separator = path.charAt(base.length);
  if ((separator !== '\\' && separator !== '/') || !same(path.slice(0, base.length), base)) return null;
  return to + path.slice(base.length);
}

/**
 * Marxdown が自分で開く拡張子（F-VIEW-05）。この判断の唯一の置き場所。
 *
 * クイックオープン（F-NAV-05）は候補を集める段で絞り込む必要があるため、この一覧を Rust へ渡す（`platform/tauri.ts` の `listFiles` / `src-tauri/src/dir.rs`）。
 * Rust 側にも一覧を置くと、同じ判断が 2 か所に分かれる。
 */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];

const MARKDOWN_PATTERN = new RegExp(`\\.(?:${MARKDOWN_EXTENSIONS.join('|')})$`, 'i');

/**
 * Marxdown が自分で開く拡張子か（F-VIEW-05）。
 *
 * クエリとフラグメント（`./other.md#section`）を除いてから判定する。
 */
export function isMarkdownPath(path: string): boolean {
  const bare = path.replace(/[?#].*$/, '');
  return MARKDOWN_PATTERN.test(bare);
}
