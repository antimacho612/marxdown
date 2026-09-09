/**
 * タスクリスト（F-VIEW-01 の GFM 相当 / OQ-05）。
 *
 * `markdown-it-task-lists` を置き換えた自作である。
 * あちらが出力する `<input type="checkbox">` を本文へ入れたくない、というのが理由のすべてである。
 *
 * プレビュー上でのチェックを許可すると決めた（OQ-05）。
 * `<input>` を操作可能な状態で通すと、**生 HTML を書いたドキュメントも本文へ操作可能なフォーム部品を持ち込める。**
 * 中心ユースケースが「LLM が生成した、自分が書いていないファイルを開く」ことである以上、そこは開けない（ADR-0006）。
 *
 * そこで `<input>` を出さず、`role="checkbox"` の `<span>` を出す。
 * `markdown/sanitize.ts` は `input` を全面的に除去する側へ戻してある。
 *
 * チェックの反映はテキストを書き換えることで行う（`features/preview/task.ts`）。
 * DOM の状態を真実にしない（ADR-0002）。
 */
import type { MarkdownIt, StateCore, Token } from 'markdown-it';

/** `[ ] ` / `[x] ` / `[X] ` で始まるか。GFM と同じく記号の直後に空白を要求する。 */
const MARKER = /^\[([\sxX])\] /;

/** 記号の長さ。`[x]` の 3 文字で、直後の空白は本文として残す。 */
const MARKER_LENGTH = 3;

/**
 * チェックボックスの markup。
 *
 * `aria-checked` を持たせるため `role="checkbox"` にしてある。
 * `tabindex` を付けるのは、クリックだけの部品にすると本文からキーボードで到達できなくなるため。
 */
function checkbox(checked: boolean): string {
  return `<span class="mx-task" role="checkbox" tabindex="0" aria-checked="${String(checked)}"></span>`;
}

/** 対象のインライントークンか。リスト項目の中の段落の、最初のインラインだけを見る。 */
function isTaskItem(tokens: Token[], index: number): boolean {
  return (
    tokens[index]?.type === 'inline' &&
    tokens[index - 1]?.type === 'paragraph_open' &&
    tokens[index - 2]?.type === 'list_item_open' &&
    MARKER.test(tokens[index]?.content ?? '')
  );
}

/** 記号をチェックボックスに置き換える。本文からは記号ぶんだけを削る。 */
function todoify(token: Token, TokenConstructor: typeof Token): void {
  const checked = /^\[[xX]\]/.test(token.content);

  const box = new TokenConstructor('html_inline', '', 0);
  box.content = checkbox(checked);
  token.children?.unshift(box);

  // `children[0]` は今入れたチェックボックスなので、本文の先頭は `children[1]` である。
  const text = token.children?.[1];
  if (text) text.content = text.content.slice(MARKER_LENGTH);
  token.content = token.content.slice(MARKER_LENGTH);
}

/** 親のトークンの位置。リスト自身に印を付けるために使う。 */
function parentIndex(tokens: Token[], index: number): number {
  const level = (tokens[index]?.level ?? 0) - 1;
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i]?.level === level) return i;
  }
  return -1;
}

/**
 * タスクリストを描く（F-VIEW-01）。
 *
 * クラス名は GitHub と同じ `task-list-item` / `contains-task-list` にしてある。
 * 本文の見た目に関わる名前であり、ユーザーのカスタム CSS からも同じ名前で指せるほうがよい（Familiar）。
 */
export function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'mx_task_list', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (!isTaskItem(tokens, i)) continue;

      const inline = tokens[i];
      if (!inline) continue;
      todoify(inline, state.Token);

      tokens[i - 2]?.attrJoin('class', 'task-list-item');
      const parent = parentIndex(tokens, i - 2);
      if (parent >= 0) tokens[parent]?.attrJoin('class', 'contains-task-list');
    }
    return true;
  });
}
