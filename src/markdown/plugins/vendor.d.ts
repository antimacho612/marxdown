/**
 * 型定義を同梱していない markdown-it プラグインの宣言（04.tech-stack/04-markdown.md §2）。
 *
 * `@types/markdown-it-footnote` は `@types/markdown-it` に依存するが、markdown-it 15 は自前の型を同梱している。
 * そのため入れると `markdown-it` モジュール宣言が二重になり、`pipeline.ts` が import する型と競合する。
 * `md.use()` に渡せれば足りるので最小限を書く。
 */

declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';

  /** 脚注（F-VIEW-16）。生成されるブロックは本文の末尾に追加される。 */
  const footnote: (md: MarkdownIt) => void;
  export default footnote;
}
