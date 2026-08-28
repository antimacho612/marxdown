/**
 * コードブロックのシンタックスハイライト（F-VIEW-03）。
 *
 * **このモジュールは遅延チャンク `highlight` の入口**（02.architecture/05-startup-sequence.md §3）。
 * コードブロックを含むドキュメントを描いたときにだけロードされる。
 * `preview` から静的に import してはいけない。クリティカルパスに載る。
 *
 * # なぜ highlight.js か（04.tech-stack/04-markdown.md §5）
 *
 * Shiki は VS Code と同一の見た目になるが ~1MB の WASM を伴う。
 * **コードブロックのハイライトは読みやすさの問題であって、正確さの問題ではない。**
 * Principle 8 に照らして 1MB は正当化できない。
 *
 * # なぜ言語を絞るのか
 *
 * `highlight.js/lib/common` は 40 言語弱を積んでいる。中心ユースケースは
 * 「LLM が生成した Markdown を読む」ことなので、そこに現れる言語だけを登録する。
 * 未登録の言語はハイライトされないだけで、コードは普通に読める。
 * **登録しないことの害は小さく、積むことの害はバンドル予算に直接来る。**
 */
import hljs from 'highlight.js/lib/core';

import { sanitize } from '@/markdown/sanitize';

/**
 * 登録する言語。増やすときは 05.performance-budget/06-decision-flow.md の判定手順を通すこと。
 *
 * 選定の基準は「LLM の出力と、このプロジェクト自身のドキュメントに出てくるか」。
 * 各言語の別名（`ts` → `typescript` など）は highlight.js 側が持っている。
 */
const LANGUAGES = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  go: () => import('highlight.js/lib/languages/go'),
  ini: () => import('highlight.js/lib/languages/ini'), // toml もこれ
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  sql: () => import('highlight.js/lib/languages/sql'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'), // html もこれ
  yaml: () => import('highlight.js/lib/languages/yaml'),
} as const;

type LanguageName = keyof typeof LANGUAGES;

/** `markdown-it` が付ける言語クラスから言語名を取り出す。 */
const LANGUAGE_CLASS = /(?:^|\s)language-([\w+#-]+)/;

/**
 * 別名の解決。highlight.js の `registerAliases` を使わず自前で持つのは、
 * **その言語を登録するかどうかを決める前に**別名を潰しておきたいため。
 */
const ALIASES: Record<string, LanguageName> = {
  bash: 'bash',
  c: 'c',
  'c++': 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  css: 'css',
  diff: 'diff',
  go: 'go',
  golang: 'go',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  patch: 'diff',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

const registered = new Set<LanguageName>();

/** 対応している言語か。呼び出し側がロードを諦める判断に使う。 */
export function resolveLanguage(raw: string): LanguageName | null {
  return ALIASES[raw.toLowerCase()] ?? null;
}

/** `<code class="language-ts">` から言語を取り出す。 */
export function languageOf(code: Element): LanguageName | null {
  const matched = LANGUAGE_CLASS.exec(code.className);
  const raw = matched?.[1];
  return raw === undefined ? null : resolveLanguage(raw);
}

/**
 * 1 つのコードブロックをハイライトする。
 *
 * 言語の定義自体もさらに動的 import する。TypeScript のドキュメントを開いたときに
 * Java と SQL の文法まで読み込む理由がない。
 */
export async function highlightElement(code: HTMLElement): Promise<void> {
  const language = languageOf(code);
  if (language === null) return;

  await ensureRegistered(language);

  const source = code.textContent ?? '';
  if (source === '') return;

  const { value } = hljs.highlight(source, { language, ignoreIllegals: true });

  // hljs の出力は入力テキストからしか作られないが、**innerHTML に入る HTML 文字列**である
  // ことに変わりはない。ADR-0006 の「DOM に入る HTML は必ず Layer 3 を通る」を
  // 例外なしに保つ（Mermaid の SVG を同じサニタイザに通すのと同じ理由）。
  code.innerHTML = sanitize(value);
}

async function ensureRegistered(language: LanguageName): Promise<void> {
  if (registered.has(language)) return;
  const module = await LANGUAGES[language]();
  hljs.registerLanguage(language, module.default);
  registered.add(language);
}
