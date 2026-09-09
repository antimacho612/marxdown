/**
 * 追加記法の設定を、パイプラインへ渡す一覧に変換する（04.tech-stack/04-markdown.md §3 / F-CONF-03）。
 *
 * 記法の名前は設定キーそのものである（`markdown.subscript` なら `subscript`）。
 * 対応表を書かずに済ませているのは、書くと**設定キーと記法名がずれたときに型では気づけない**ためである。
 * 名前として妥当かどうかは受け取る側（`markdown/plugins/syntax.ts`）が判定し、知らない名前は黙って飛ばす。
 *
 * `@/markdown/pipeline` を import しない。
 * あちらは動的 import で `main` の外に置いてあり（`markdown/parser.ts`）、ここから静的に触るとクリティカルパスへ引き戻される。
 */
import type { Settings } from '@/platform';

/** 設定キーの接頭辞。 */
const PREFIX = 'markdown.';

/**
 * ON になっている追加記法の名前を返す。既定ではすべて OFF なので空になる。
 *
 * 並びは設定キーの辞書順である。呼び出し側はこれをキャッシュの一致判定に使うため、順序が安定している必要がある。
 */
export function enabledSyntax(values: Settings): string[] {
  return Object.entries(values)
    .filter(([key, value]) => key.startsWith(PREFIX) && value === true)
    .map(([key]) => key.slice(PREFIX.length))
    .toSorted();
}
