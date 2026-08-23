/**
 * パス文字列のちいさな道具。
 *
 * **依存を持たない純粋関数だけ**を置く。UI からも Domain からも使うため、
 * どちらかの下に置くと参照の向きが濁る（`features/` が `app/` を見に行く、など）。
 *
 * パスの解決・正規化そのものは Rust 側の仕事（02.architecture.md 原則 C）。
 * ここでやるのは、既に正規化されたパスを**表示のために割る**ことだけ。
 */

/** パスをディレクトリとファイル名に割る。Windows と POSIX の両方を受ける。 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (index < 0) return { dir: '', name: path }
  return { dir: path.slice(0, index), name: path.slice(index + 1) }
}
