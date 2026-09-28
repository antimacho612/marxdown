/**
 * 複数行の表（追加記法 `multilineTables`）。
 *
 * `markdown-it-multimd-table` を、オプションを固定した `(md) => void` の形に包む。
 * `plugins/syntax.ts` が、設定で ON になったときだけ動的 import する。
 */
import type { MarkdownIt } from 'markdown-it';
import multimdTable from 'markdown-it-multimd-table';

/**
 * 有効にする書き方。
 *
 * 設定の説明（セルの中で改行できる）に必要な `multiline` と、`^^` でセルを縦に結合する `rowspan` を有効にする。
 * `multibody` は既定の true から false にする。true のままだと空行を挟んだ次の表が前の表の本文として解釈され、表が続く GFM の文書の表示が変わる。
 * `headerless` は既定の false のままにする。見出し行の無い `|` 区切りの行まで表になるためである。
 */
const OPTIONS = { multiline: true, rowspan: true, multibody: false, headerless: false };

/**
 * プラグインが受け取る `md` の型。
 *
 * NOTE: パッケージ同梱の型は `@types/markdown-it`（14）の型を参照しており、markdown-it 15 の `MarkdownIt` をそのまま渡せない。
 */
type PluginMarkdownIt = Parameters<typeof multimdTable>[0];

/**
 * 複数行の表を有効にする markdown-it プラグイン。
 *
 * HACK: `markdown-it-multimd-table` 4.2.3 は markdown-it 15 で削除された `md.utils.assign` を呼び、`use` の時点で例外になる（upstream の issue #82。修正の PR #83 は未リリース）。
 * `md.utils` は全インスタンスで共有されるオブジェクトなので書き換えず、`utils` だけを差し替えた `md` を渡す。
 * プラグインが `md.utils` を使うのはオプションの合成の 1 か所だけで、ルールの登録はプロトタイプの先にある元の `md` に対して行われる。
 */
export default function multilineTables(md: MarkdownIt): void {
  const compat = Object.create(md, { utils: { value: { ...md.utils, assign: Object.assign } } }) as PluginMarkdownIt;
  multimdTable(compat, OPTIONS);
}
