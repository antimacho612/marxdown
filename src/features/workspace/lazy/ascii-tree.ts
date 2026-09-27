/**
 * ディレクトリ構造をアスキーアートにする（`explorer.copyTree`）。
 *
 * 罫線は `tree` コマンドと同じ形にしてある。見慣れた形のほうが、貼り付けた先で説明が要らない。
 * 木を組み立てるのは Rust 側（`src-tauri/src/dir.rs`）で、ここは形にするだけである。
 */
import type { DirTree, TreeNode } from '@/platform';

/** 枝の記号。末尾の 1 件だけ形が変わる。 */
const BRANCH = { last: '└── ', middle: '├── ' };

/**
 * 子の行頭に積む字下げ。末尾の枝の下は縦線が続かない。
 * どちらも 4 桁で枝の記号と幅が揃う。空白側だけ `repeat` なのは `unicorn/prefer-string-repeat` による。
 */
const INDENT = { last: ' '.repeat(4), middle: '│   ' };

/**
 * 木を 1 つの文字列にする。末尾に改行は付けない。
 *
 * 1 行目は基点の名前で、パスは含めない。
 * 貼り付ける先はその基点を説明している文書であり、絶対パスは利用者の環境をそのまま持ち出すことになる。
 */
export function toAsciiTree(tree: DirTree): string {
  return [label(tree.name, true), ...lines(tree.nodes, '')].join('\n');
}

function lines(nodes: TreeNode[], prefix: string): string[] {
  return nodes.flatMap((node, index) => {
    const last = index === nodes.length - 1;
    const head = prefix + (last ? BRANCH.last : BRANCH.middle) + label(node.name, node.dir);
    if (node.children.length === 0) return [head];
    return [head, ...lines(node.children, prefix + (last ? INDENT.last : INDENT.middle))];
  });
}

/**
 * 表示名。ディレクトリには末尾の `/` を付ける。
 *
 * 等幅で読むとき、名前だけでは中身の無いディレクトリとファイルを見分けられない。
 * 基点がドライブ直下のときは名前自体が区切り文字で終わるため、そのまま返す。
 */
function label(name: string, dir: boolean): string {
  if (!dir || name.endsWith('/') || name.endsWith('\\')) return name;
  return `${name}/`;
}
