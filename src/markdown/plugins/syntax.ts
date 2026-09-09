/**
 * 設定で有効化する追加記法（04.tech-stack/04-markdown.md §3 / F-CONF-03）。
 *
 * どれも既定 OFF である。
 * 標準的でない記法が意図せず発火して本文が壊れるほうが、ユーザーの認知負荷が高い（Design Brief Principle 3）。
 *
 * **ON になっているものだけを動的 import する。**
 * 静的に import すると、7 つとも既定 OFF のまま pipeline チャンク（クリティカルパス）に載る。
 * 1 つあたりは小さいが、M4 着手時点の残余は 23.64KB しかない（06.roadmap/m4-markdown.md §1.2）。
 *
 * 読み込みは `loadSyntax` が行い、`buildSyntax` は読み込み済みのものを返すだけである。
 * `pipeline.ts` の `render` / `renderChunks` を同期のまま保つための分割で、
 * 呼び出し側（`markdown/parser.ts`）が描画の前に `loadSyntax` を待つ。
 */
import type { MarkdownIt } from 'markdown-it';

/** markdown-it プラグインの形。 */
type Plugin = (md: MarkdownIt) => void;

/**
 * 追加記法の名前。設定キー `markdown.*` と 1:1 で対応する。
 *
 * 名前はパッケージ名ではなく記法の呼び名にしてある。
 * 設定 UI にもファイルにも出るのはこちらであり、`deflist` では何が起きるか読めない。
 */
export const SYNTAX_NAMES = [
  'abbreviations',
  'definitionLists',
  'insertions',
  'marks',
  'multilineTables',
  'subscript',
  'superscript',
] as const;

export type SyntaxName = (typeof SYNTAX_NAMES)[number];

/**
 * 記法ごとの読み込み口。
 *
 * 型を持たないパッケージの宣言は `vendor.d.ts` にある。
 *
 * 戻り値を `unknown` にしてあるのは、`markdown-it-multimd-table` だけが自前の型を同梱しており、
 * そちらが `md` を markdown-it の default export（呼び出し可能なクラス）として宣言しているためである。
 * こちらの `MarkdownIt`（インスタンスの型）と名前が一致せず、渡すものは同じなのに代入できない。
 * 全部を同じ扱いにして、`md.use` に渡すところで 1 度だけ揃える。
 */
const LOADERS: Record<SyntaxName, () => Promise<{ default: unknown }>> = {
  abbreviations: () => import('markdown-it-abbr'),
  definitionLists: () => import('markdown-it-deflist'),
  insertions: () => import('markdown-it-ins'),
  marks: () => import('markdown-it-mark'),
  multilineTables: () => import('markdown-it-multimd-table'),
  subscript: () => import('markdown-it-sub'),
  superscript: () => import('markdown-it-sup'),
};

/** 読み込み済みのもの。1 度読んだら常駐する（記法の ON / OFF は頻繁には変わらない）。 */
const loaded = new Map<SyntaxName, Plugin>();

/** 名前として妥当か。設定ファイルには未知の文字列も入りうる。 */
function isSyntaxName(value: string): value is SyntaxName {
  return (SYNTAX_NAMES as readonly string[]).includes(value);
}

/**
 * ON になっている記法を読み込む。描画の前に待つこと。
 *
 * 既定（1 つも ON でない）ではネットワークもチャンクも発生しない。
 * 読み込み済みのものは再取得しない。
 */
export async function loadSyntax(names: readonly string[]): Promise<void> {
  const missing = names.filter((name) => isSyntaxName(name) && !loaded.has(name));
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (name) => {
      if (!isSyntaxName(name)) return;
      const module = await LOADERS[name]();
      loaded.set(name, module.default as Plugin);
    }),
  );
}

/**
 * 読み込み済みのプラグインを `md.use` する。
 *
 * 読み込みが済んでいないものは黙って飛ばす。
 * 記法が 1 つ効かないことと、本文が描画されないこととでは、後者のほうがはるかに悪い。
 */
export function useSyntax(md: MarkdownIt, names: readonly string[]): void {
  for (const name of names) {
    if (!isSyntaxName(name)) continue;
    const plugin = loaded.get(name);
    if (plugin) md.use(plugin);
  }
}

/** テスト用。読み込み済みの一覧を捨てる。 */
export function resetSyntax(): void {
  loaded.clear();
}
