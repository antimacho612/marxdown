/**
 * 型定義を同梱していない markdown-it プラグインの宣言。
 *
 * # `@types/*` を入れない理由
 *
 * `@types/markdown-it-footnote` は存在するが、`@types/markdown-it` に依存している。
 * markdown-it 15 は**自前の型を同梱している**ので、入れると `markdown-it` モジュールの
 * 宣言が 2 つになり、`pipeline.ts` が import している `MarkdownIt` / `Token` と
 * 別物の型が混ざる。必要なのは `md.use()` に渡せることだけなので、ここで最小限を書く。
 *
 * 04.tech-stack/04-markdown.md §2 の採用パッケージに対応する。
 */

declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';

  /** 脚注（F-VIEW-16）。生成されるブロックは本文の末尾に付く。 */
  const footnote: (md: MarkdownIt) => void;
  export default footnote;
}

declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';

  export interface TaskListsOptions {
    /** チェックボックスを操作可能にする。既定 false（OQ-05 が未決着のため）。 */
    enabled?: boolean;
    /** `<label>` で包む。 */
    label?: boolean;
    /** `<label>` をチェックボックスの後ろに置く。 */
    labelAfter?: boolean;
  }

  /** タスクリスト（GFM）。`<input type="checkbox" disabled>` を出す。 */
  const taskLists: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default taskLists;
}
