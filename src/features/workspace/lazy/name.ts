/**
 * 行内の入力欄で受け取る名前の検査（03.ux-spec/06-panes.md §1.4）。
 *
 * 判定の最終的な基準は Rust 側（`src-tauri/src/fsops.rs` の `validate_name`）にある。
 * ここで同じ規則を持つのは、確定を押す前に理由を入力欄の下へ出すためである。
 * 食い違っても安全側に倒れる（ここを通っても Rust が拒めば、失敗として通知される）。
 */

/** 名前を確定できない理由。`ja.tree.nameProblem` のキーと対応する。 */
export type NameProblem = 'empty' | 'chars' | 'reserved' | 'trailing' | 'dots' | 'tooLong' | 'exists';

const FORBIDDEN = /[\\/:*?"<>|]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 制御文字（U+0000〜U+001F）を含むか。 */
function hasControl(name: string): boolean {
  return [...name].some((char) => (char.codePointAt(0) ?? 0) < 0x20);
}

/**
 * 名前の問題を返す。問題が無ければ `null`。
 *
 * `siblings` は同じ階層にある名前で、`self` はリネーム中の項目の元の名前である。
 * 大文字と小文字だけを変えるリネームは、同じ名前が既にあるとは見なさない（Windows では同じ項目を指すため）。
 * Windows の規則はすべての OS で適用する。配布の対象は Windows であり、規則が OS ごとに変わると説明の文言も分かれる。
 */
export function nameProblem(name: string, siblings: readonly string[], self: string | null = null): NameProblem | null {
  if (name === '') return 'empty';
  if (name === '.' || name === '..') return 'dots';
  if (FORBIDDEN.test(name) || hasControl(name)) return 'chars';
  if (name.endsWith('.') || name.endsWith(' ')) return 'trailing';
  if (RESERVED.test(name.split('.', 1)[0]?.trimEnd() ?? '')) return 'reserved';
  if (name.length > 255) return 'tooLong';

  const lower = name.toLowerCase();
  const clash = siblings.some((sibling) => sibling.toLowerCase() === lower && sibling !== self);
  return clash ? 'exists' : null;
}

/**
 * 新規ファイルの名前に拡張子が無ければ `.md` を補う（Markdown First）。
 *
 * `.` で始まる名前（`.env`）は、それ自体が名前であり拡張子を持たないものとして扱い、補わない。
 */
export function withDefaultExtension(name: string): string {
  return name.lastIndexOf('.') > 0 || name.startsWith('.') ? name : `${name}.md`;
}

/**
 * リネームを始めるときに選択しておく範囲（拡張子を除いた部分）。
 *
 * VS Code と同じく、名前だけを書き換えたい場合がほとんどである。
 * フォルダと `.` で始まる名前は全体を選ぶ。
 */
export function stemRange(name: string, dir: boolean): [number, number] {
  const dot = name.lastIndexOf('.');
  return dir || dot <= 0 ? [0, name.length] : [0, dot];
}
