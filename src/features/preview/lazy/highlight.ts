/**
 * コードブロックのシンタックスハイライト（F-VIEW-03）。
 *
 * 遅延チャンク `highlight` の入口。
 * コードブロックを含む文書を描画したときにだけロードされるため、`preview` から静的に import してはいけない。
 *
 * Shiki は WASM を使わない構成でも文法だけで `highlight` と `total` の予算を超えるため、highlight.js を使う（04.tech-stack/04-markdown.md §5 / OQ-07）。
 * 言語は LLM 生成の Markdown に現れる範囲に絞って登録し、未登録言語はハイライトされないだけで普通に読める（登録する言語を増やすとバンドル予算を直接圧迫する）。
 */
import hljs from 'highlight.js/lib/core';

import { sanitize } from '@/markdown/sanitize';

/**
 * 登録する言語。増やすときは 05.performance-budget/06-decision-flow.md の判定手順を通すこと。
 *
 * 選定の基準は、LLM の出力とこのプロジェクト自身のドキュメントに現れるかどうかである。
 * 各言語の別名（`ts` と `typescript` など）は highlight.js 側が持っている。
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
 * 別名の解決。
 * highlight.js の `registerAliases` を使わず自前で持つのは、その言語を登録するかどうかを判断する前に別名を解決しておく必要があるためである。
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

/** 対応している言語か。呼び出し側が読み込みを行うかどうかの判断に使う。 */
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
 * 言語の定義自体もさらに動的 import する。
 * TypeScript のドキュメントを開いたときに Java や SQL の定義まで読み込む必要はない。
 */
export async function highlightElement(code: HTMLElement): Promise<void> {
  const language = languageOf(code);
  if (language === null) return;

  await ensureRegistered(language);

  const source = code.textContent ?? '';
  if (source === '') return;

  const { value } = hljs.highlight(source, { language, ignoreIllegals: true });

  // hljs の出力は入力テキストからのみ生成されるが、`innerHTML` に渡す HTML 文字列であることに変わりはない。
  // ADR-0006 の「DOM に入る HTML は必ず Layer 3 を通る」を例外なく適用する（Mermaid の SVG を同じサニタイザに通すのと同じ理由）。
  code.innerHTML = sanitize(value);
}

async function ensureRegistered(language: LanguageName): Promise<void> {
  if (registered.has(language)) return;
  const module = await LANGUAGES[language]();
  hljs.registerLanguage(language, module.default);
  registered.add(language);
}
