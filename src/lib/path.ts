/**
 * パス文字列のちいさな道具。
 *
 * **依存を持たない純粋関数だけ**を置く。UI からも Domain からも使うため、
 * どちらかの下に置くと参照の向きが濁る（`features/` が `app/` を見に行く、など）。
 *
 * パスの解決・正規化そのものは Rust 側の仕事（02.architecture/README.md 原則 C）。
 * ここでやるのは、既に正規化されたパスを**表示のために割る**ことだけ。
 */

/** パスをディレクトリとファイル名に割る。Windows と POSIX の両方を受ける。 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (index < 0) return { dir: '', name: path };
  return { dir: path.slice(0, index), name: path.slice(index + 1) };
}

/** 親ディレクトリ。相対パスの基準に使う。 */
export function dirOf(path: string): string {
  return splitPath(path).dir;
}

/**
 * ベースと相対パスをつなぐ。
 *
 * **`..` の畳み込みはしない。** 正規化と symlink の解決は Rust 側の仕事であり
 * （`dunce::canonicalize` / `scope.rs`）、こちらで先に畳むと
 * 「JS が思う正規形」と「実際に解決される先」がずれる。
 * ずれた状態でスコープ検証をすると、そこが穴になる（N-SEC-05）。
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
 * `[x](/docs/a.md)` のような先頭 `/` は、Web なら「サイトのルート」だが、
 * ローカルファイルビューアにルートは無い。**文字どおり絶対パスとして扱い**、
 * 実在しなければ Rust 側が not-found を返す。
 * 勝手に「開いているファイルからの相対」と読み替えるほうが驚きが大きい。
 */
export function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\');
}

/**
 * Marxdown が自分で開く拡張子か（F-VIEW-05）。
 *
 * クエリとフラグメント（`./other.md#section`）を落としてから見る。
 */
export function isMarkdownPath(path: string): boolean {
  const bare = path.replace(/[?#].*$/, '');
  return /\.(?:md|markdown|mdown|mkd)$/i.test(bare);
}
