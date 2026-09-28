/**
 * 記法のページの見本。
 *
 * 表示側はビルド時にアプリの Markdown パイプラインで作るため、ここには書き方だけを置く。
 * 追加記法（`setting` を持つもの）は、その記法だけを有効にして表示する。
 */
import type { SyntaxName } from '@/markdown/pipeline';

import type { Locale } from '../routes';

type Text = Record<Locale, string>;

export interface SyntaxExample {
  id: string;
  title: Text;
  body: Text;
  /** 言語によって書き方が変わらないものは 1 つだけ持つ。 */
  source: Text | string;
  setting?: SyntaxName;
  /** 表示をパイプラインで作れないもの（Marp）。書き方だけを見せ、表示の欄にはこの説明を出す。 */
  note?: Text;
}

export interface SyntaxSection {
  id: string;
  title: Text;
  intro?: Text;
  examples: SyntaxExample[];
}

export const SYNTAX: SyntaxSection[] = [
  {
    id: 'basics',
    title: { ja: '基本', en: 'Basics' },
    intro: {
      ja: 'CommonMark に従います。GitHub と同じ書き方で、同じように表示されます。',
      en: 'Marxdown follows CommonMark. Write as you would on GitHub, and it looks the same.',
    },
    examples: [
      {
        id: 'headings',
        title: { ja: '見出し', en: 'Headings' },
        body: {
          ja: '行頭の # の数が階層になります。見出しはアウトラインにも並びます。',
          en: 'The number of # at the start of a line sets the level. Headings also appear in the Outline.',
        },
        source: {
          ja: '# 見出し 1\n## 見出し 2\n### 見出し 3',
          en: '# Heading 1\n## Heading 2\n### Heading 3',
        },
      },
      {
        id: 'paragraphs',
        title: { ja: '段落と改行', en: 'Paragraphs and line breaks' },
        body: {
          ja: '空行で段落を分けます。段落の中の改行は、既定ではつながって表示されます。行末に空白 2 つか \\ を置くと改行になります。設定の「段落内の改行を反映」をオンにすると、改行をそのまま表示します。',
          en: 'Separate paragraphs with a blank line. By default, line breaks inside a paragraph are joined. End a line with two spaces or \\ to break it. Turn on “Keep Line Breaks in Paragraphs” in Settings to keep every line break.',
        },
        source: {
          ja: '1 つ目の段落です。\nこの行は前の行につながります。\n\n2 つ目の段落です。\\\nここで改行されます。',
          en: 'This is the first paragraph.\nThis line joins the previous one.\n\nThis is the second paragraph.\\\nThis starts a new line.',
        },
      },
      {
        id: 'emphasis',
        title: { ja: '強調', en: 'Emphasis' },
        body: {
          ja: 'エディターでは Ctrl+B（太字）・Ctrl+I（斜体）・Ctrl+Shift+X（取り消し線）で付け外しできます。',
          en: 'In the editor, toggle them with Ctrl+B (bold), Ctrl+I (italic), and Ctrl+Shift+X (strikethrough).',
        },
        source: {
          ja: '**太字**、*斜体*、~~取り消し線~~、`インラインコード`',
          en: '**Bold**, *italic*, ~~strikethrough~~, `inline code`',
        },
      },
      {
        id: 'lists',
        title: { ja: 'リスト', en: 'Lists' },
        body: {
          ja: '- か数字で始めます。字下げすると入れ子になります。エディターでは Tab / Shift+Tab で字下げ / 字上げできます。',
          en: 'Start a line with - or a number. Indent to nest. In the editor, Tab and Shift+Tab indent and outdent.',
        },
        source: {
          ja: '- りんご\n- みかん\n  - 温州みかん\n  - 伊予柑\n\n1. 読む\n2. 書く\n3. 保存する',
          en: '- Apples\n- Oranges\n  - Mandarin\n  - Navel\n\n1. Read\n2. Write\n3. Save',
        },
      },
      {
        id: 'links',
        title: { ja: 'リンクと画像', en: 'Links and images' },
        body: {
          ja: 'http(s) のリンクは既定のブラウザで開きます。相対パスの .md へのリンクは、Marxdown の中で開きます。画像は、開いたファイルのフォルダーの中にあるものを表示します。',
          en: 'http(s) links open in your default browser. Relative links to .md files open inside Marxdown. Images inside the folder of the opened file are shown.',
        },
        source: {
          ja: '[Marxdown のリポジトリ](https://github.com/antimacho612/marxdown)\n\n[設計メモ](./docs/design.md)\n\n![Marxdown のマーク](mark.svg)',
          en: '[The Marxdown repository](https://github.com/antimacho612/marxdown)\n\n[Design notes](./docs/design.md)\n\n![The Marxdown mark](mark.svg)',
        },
      },
      {
        id: 'blockquotes',
        title: { ja: '引用', en: 'Blockquotes' },
        body: {
          ja: '行頭に > を置きます。エディターでは Ctrl+Shift+. で付け外しできます。',
          en: 'Start a line with >. In the editor, toggle it with Ctrl+Shift+.',
        },
        source: {
          ja: '> 読みやすさは、設定できる。\n>\n> > 入れ子にもできます。',
          en: '> Readability you can adjust.\n>\n> > Quotes can be nested.',
        },
      },
      {
        id: 'code',
        title: { ja: 'コードブロック', en: 'Code blocks' },
        body: {
          ja: '``` で囲み、言語名を添えるとシンタックスハイライトします。対応する言語は Bash・C・C++・C#・CSS・Diff・Go・INI / TOML・Java・JavaScript・JSON・Markdown・Python・Rust・SQL・TypeScript・HTML / XML・YAML です。',
          en: 'Fence code with ``` and add a language name for syntax highlighting. Supported: Bash, C, C++, C#, CSS, Diff, Go, INI / TOML, Java, JavaScript, JSON, Markdown, Python, Rust, SQL, TypeScript, HTML / XML, and YAML.',
        },
        source: '```rust\nfn main() {\n    let name = "Marxdown";\n    println!("Hello, {name}!");\n}\n```',
      },
      {
        id: 'rules',
        title: { ja: '区切り線', en: 'Horizontal rules' },
        body: { ja: '--- だけの行が区切り線になります。', en: 'A line with only --- becomes a horizontal rule.' },
        source: { ja: '前の話題\n\n---\n\n次の話題', en: 'One topic\n\n---\n\nAnother topic' },
      },
      {
        id: 'html',
        title: { ja: 'HTML', en: 'HTML' },
        body: {
          ja: 'HTML も書けます。ただし、スクリプトや onclick などのイベント属性は取り除かれ、実行されません。',
          en: 'You can write HTML. Scripts and event attributes like onclick are removed and never run.',
        },
        source: {
          ja: '<details>\n<summary>クリックで開く</summary>\n\n折りたたまれていた内容です。\n\n</details>\n\n<kbd>Ctrl</kbd>+<kbd>S</kbd> で保存',
          en: '<details>\n<summary>Click to open</summary>\n\nThis was folded.\n\n</details>\n\nSave with <kbd>Ctrl</kbd>+<kbd>S</kbd>',
        },
      },
    ],
  },
  {
    id: 'github',
    title: { ja: 'GitHub の拡張', en: 'GitHub extensions' },
    intro: {
      ja: 'GitHub Flavored Markdown の拡張と、GitHub のアラートに対応しています。',
      en: 'GitHub Flavored Markdown extensions and GitHub alerts are supported.',
    },
    examples: [
      {
        id: 'tables',
        title: { ja: '表', en: 'Tables' },
        body: {
          ja: '2 行目の : の位置で揃えを指定します。エディターでは Tab で次のセルへ移動でき、Shift+Alt+F で列幅を揃えられます。罫線の引き方は設定の「表の罫線」で選べます。',
          en: 'The position of : in the second row sets the alignment. In the editor, Tab moves to the next cell and Shift+Alt+F aligns the columns. Choose how borders are drawn with “Table Borders” in Settings.',
        },
        source: {
          ja: '| 方式 | p95 | 実装コスト |\n| :--- | ---: | :---: |\n| キャッシュなし | 240ms | 低 |\n| TTL | 22ms | 低 |\n| Stale-While-Revalidate | 18ms | 中 |',
          en: '| Strategy | p95 | Cost |\n| :--- | ---: | :---: |\n| No cache | 240ms | Low |\n| TTL | 22ms | Low |\n| Stale-While-Revalidate | 18ms | Medium |',
        },
      },
      {
        id: 'tasks',
        title: { ja: 'タスクリスト', en: 'Task lists' },
        body: {
          ja: 'エディターでは Ctrl+Enter でチェックを切り替えられます。',
          en: 'In the editor, Ctrl+Enter toggles the check.',
        },
        source: {
          ja: '- [x] 方式を比較する\n- [ ] 失効のメトリクスを追加する\n- [ ] 負荷試験',
          en: '- [x] Compare strategies\n- [ ] Add expiry metrics\n- [ ] Load testing',
        },
      },
      {
        id: 'autolinks',
        title: { ja: '自動リンク', en: 'Autolinks' },
        body: {
          ja: 'URL はそのままリンクになります。',
          en: 'URLs become links as they are.',
        },
        source: {
          ja: 'リポジトリ: https://github.com/antimacho612/marxdown',
          en: 'Repository: https://github.com/antimacho612/marxdown',
        },
      },
      {
        id: 'alerts',
        title: { ja: 'アラート', en: 'Alerts' },
        body: {
          ja: 'GitHub と同じ 5 種類です。見出しは GitHub と同じ英語で表示します。',
          en: 'The same five kinds as GitHub.',
        },
        source: {
          ja: '> [!NOTE]\n> 補足です。\n\n> [!TIP]\n> 知っておくと便利なことです。\n\n> [!IMPORTANT]\n> 大事なことです。\n\n> [!WARNING]\n> 注意が必要です。\n\n> [!CAUTION]\n> 危険を伴います。',
          en: '> [!NOTE]\n> Useful information.\n\n> [!TIP]\n> Helpful advice.\n\n> [!IMPORTANT]\n> Key information.\n\n> [!WARNING]\n> Needs attention.\n\n> [!CAUTION]\n> Risky consequences.',
        },
      },
      {
        id: 'footnotes',
        title: { ja: '脚注', en: 'Footnotes' },
        body: {
          ja: '脚注は文書の末尾にまとめて表示します。',
          en: 'Footnotes are collected at the end of the document.',
        },
        source: {
          ja: 'Marxdown は Tauri で作られています[^1]。\n\n[^1]: Rust と WebView で動くアプリの枠組みです。',
          en: 'Marxdown is built with Tauri[^1].\n\n[^1]: A framework for apps running on Rust and a WebView.',
        },
      },
    ],
  },
  {
    id: 'math-diagrams',
    title: { ja: '数式と図', en: 'Math and diagrams' },
    examples: [
      {
        id: 'math',
        title: { ja: '数式', en: 'Math' },
        body: {
          ja: '$ で囲むと文中に、$$ で囲むと独立した行に、KaTeX で表示します。$5 と $10 のような金額は数式になりません。',
          en: 'Wrap with $ for inline math, or $$ for a block, rendered with KaTeX. Amounts like $5 and $10 do not become math.',
        },
        source: {
          ja: '平均遅延はおおよそ $\\bar{t} = h \\cdot t_c + (1 - h) \\cdot t_m$ です。\n\n$$\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}\n$$',
          en: 'The mean latency is about $\\bar{t} = h \\cdot t_c + (1 - h) \\cdot t_m$.\n\n$$\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}\n$$',
        },
      },
      {
        id: 'mermaid',
        title: { ja: '図（Mermaid）', en: 'Diagrams (Mermaid)' },
        body: {
          ja: 'mermaid のコードブロックを図として表示します。フローチャート・シーケンス図・ガントチャートなど、Mermaid の図はすべて使えます。',
          en: 'A mermaid code block is shown as a diagram. Flowcharts, sequence diagrams, Gantt charts, and every other Mermaid diagram work.',
        },
        source: {
          ja: '```mermaid\nsequenceDiagram\n  ターミナル->>Marxdown: marxdown README.md\n  Marxdown-->>ターミナル: すぐにプロンプトへ戻る\n  Marxdown->>Marxdown: タブで開く\n```',
          en: '```mermaid\nsequenceDiagram\n  Terminal->>Marxdown: marxdown README.md\n  Marxdown-->>Terminal: Prompt returns right away\n  Marxdown->>Marxdown: Open as a tab\n```',
        },
      },
    ],
  },
  {
    id: 'document',
    title: { ja: '文書の設定', en: 'Document settings' },
    examples: [
      {
        id: 'front-matter',
        title: { ja: 'Front Matter', en: 'Front matter' },
        body: {
          ja: '先頭の --- で囲んだ YAML は、本文とは分けて表示します。',
          en: 'YAML fenced with --- at the top is shown apart from the body.',
        },
        source: {
          ja: '---\ntitle: 設計メモ\ntags: [cache, api]\n---\n\n# 設計メモ',
          en: '---\ntitle: Design notes\ntags: [cache, api]\n---\n\n# Design notes',
        },
      },
      {
        id: 'marp',
        title: { ja: 'Marp のスライド', en: 'Marp slides' },
        body: {
          ja: 'Front Matter に marp: true を書くと、Marp のスライドとして表示します。--- でスライドを区切ります。自作のテーマは設定の「Marp のテーマ」で読み込めます。',
          en: 'Put marp: true in the front matter to show the document as Marp slides. Separate slides with ---. Load your own themes with “Marp Themes” in Settings.',
        },
        source: {
          ja: '---\nmarp: true\ntheme: default\npaginate: true\n---\n\n# キャッシュ戦略\n\n検索 API の p95 を下げる\n\n---\n\n## 結論\n\nStale-While-Revalidate を採用する',
          en: '---\nmarp: true\ntheme: default\npaginate: true\n---\n\n# Caching strategy\n\nLowering the p95 of the search API\n\n---\n\n## Decision\n\nAdopt Stale-While-Revalidate',
        },
        note: {
          ja: 'スライドとして 1 枚ずつ表示します。',
          en: 'Shown as slides, one at a time.',
        },
      },
    ],
  },
  {
    id: 'extensions',
    title: { ja: '追加記法', en: 'Extra syntax' },
    intro: {
      ja: '標準ではない記法です。意図せず本文の表示が変わらないよう、どれも既定ではオフになっています。設定の「記法」で 1 つずつ有効にできます。',
      en: 'Non-standard syntax. To keep your documents from changing unexpectedly, all of them are off by default. Turn them on one by one in the Syntax section of Settings.',
    },
    examples: [
      {
        id: 'marks',
        setting: 'marks',
        title: { ja: 'マーカー', en: 'Highlights' },
        body: {
          ja: '==文字== を蛍光ペンで塗ったように表示します。',
          en: 'Shows ==text== as if marked with a highlighter.',
        },
        source: { ja: '結論は ==Stale-While-Revalidate== です。', en: 'The answer is ==Stale-While-Revalidate==.' },
      },
      {
        id: 'insertions',
        setting: 'insertions',
        title: { ja: '挿入', en: 'Insertions' },
        body: { ja: '++文字++ を下線付きで表示します。', en: 'Shows ++text++ underlined, as inserted text.' },
        source: { ja: 'p95 は ++18ms++ になりました。', en: 'The p95 is now ++18ms++.' },
      },
      {
        id: 'superscript',
        setting: 'superscript',
        title: { ja: '上付き文字', en: 'Superscript' },
        body: { ja: '^ で囲んだ文字を上付きで表示します。', en: 'Shows text wrapped in ^ as superscript.' },
        source: 'E = mc^2^',
      },
      {
        id: 'subscript',
        setting: 'subscript',
        title: { ja: '下付き文字', en: 'Subscript' },
        body: { ja: '~ で囲んだ文字を下付きで表示します。', en: 'Shows text wrapped in ~ as subscript.' },
        source: 'H~2~O',
      },
      {
        id: 'definition-lists',
        setting: 'definitionLists',
        title: { ja: '定義リスト', en: 'Definition lists' },
        body: {
          ja: '用語の次の行を : で始めると、定義リストとして表示します。',
          en: 'Start the line after a term with : to make a definition list.',
        },
        source: {
          ja: 'TTL\n: 決まった時間が経つと失効させる方式\n\nStale-While-Revalidate\n: 古い応答を返しつつ、裏で更新する方式',
          en: 'TTL\n: Expires entries after a fixed time\n\nStale-While-Revalidate\n: Returns the stale response while refreshing in the background',
        },
      },
      {
        id: 'abbreviations',
        setting: 'abbreviations',
        title: { ja: '略語', en: 'Abbreviations' },
        body: {
          ja: '*[略語]: 説明 の形で定義した語に、マウスを重ねると説明を表示します。',
          en: 'Words defined as *[ABBR]: Description show the description on hover.',
        },
        source: {
          ja: 'CSP で読み込めるものを制限します。\n\n*[CSP]: Content Security Policy',
          en: 'CSP restricts what can be loaded.\n\n*[CSP]: Content Security Policy',
        },
      },
    ],
  },
];

/**
 * 複数行の表の見本。
 *
 * BUG: `markdown-it-multimd-table` が markdown-it 15 で削除された `md.utils.assign` を呼ぶため、この記法を有効にすると描画が例外で失敗する。
 * アプリ側が直るまで、記法のページには載せない。直ったら `extensions` の末尾に戻す。
 */
export const MULTILINE_TABLES: SyntaxExample = {
  id: 'multiline-tables',
  setting: 'multilineTables',
  title: { ja: '複数行の表', en: 'Multiline tables' },
  body: {
    ja: '行末の \\ で、次の行を同じセルの続きとして書けます。見出しを 2 行にしたり、セルを結合したりもできます。',
    en: 'End a row with \\ to continue the same cells on the next line. Multi-row headers and merged cells work too.',
  },
  source: {
    ja: '| 方式 | 説明 |\n| --- | --- |\n| TTL | 決まった時間で失効させる。 \\\n|     | 実装が簡単。 |\n| SWR | 古い応答を返しつつ更新する。 |',
    en: '| Strategy | Notes |\n| --- | --- |\n| TTL | Expires after a fixed time. \\\n|     | Easy to build. |\n| SWR | Returns stale data while refreshing. |',
  },
};

/** 言語ごとに書き方を取り出す。 */
export function sourceOf(example: SyntaxExample, locale: Locale): string {
  return typeof example.source === 'string' ? example.source : example.source[locale];
}
