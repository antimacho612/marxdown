/**
 * 型定義を同梱していない markdown-it プラグインの宣言。
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

/*
 * 設定で有効化する追加記法（`plugins/syntax.ts`）。
 * どれも既定 OFF で、ON になったときだけ動的 import される。
 */

declare module 'markdown-it-abbr' {
  import type { MarkdownIt } from 'markdown-it';

  /** 略語（`*[HTML]: HyperText Markup Language`）。 */
  const abbr: (md: MarkdownIt) => void;
  export default abbr;
}

declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it';

  /** 定義リスト（`用語` の次行に `: 説明`）。 */
  const deflist: (md: MarkdownIt) => void;
  export default deflist;
}

declare module 'markdown-it-ins' {
  import type { MarkdownIt } from 'markdown-it';

  /** 挿入（`++文字++` を `<ins>` にする）。 */
  const ins: (md: MarkdownIt) => void;
  export default ins;
}

declare module 'markdown-it-mark' {
  import type { MarkdownIt } from 'markdown-it';

  /** マーカー（`==文字==` を `<mark>` にする）。 */
  const mark: (md: MarkdownIt) => void;
  export default mark;
}

declare module 'markdown-it-sub' {
  import type { MarkdownIt } from 'markdown-it';

  /** 下付き（`H~2~O`）。 */
  const sub: (md: MarkdownIt) => void;
  export default sub;
}

declare module 'markdown-it-sup' {
  import type { MarkdownIt } from 'markdown-it';

  /** 上付き（`x^2^`）。 */
  const sup: (md: MarkdownIt) => void;
  export default sup;
}
