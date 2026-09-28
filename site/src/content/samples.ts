/**
 * 紹介ページのウィンドウに表示する文書。
 *
 * どれもビルド時にアプリの Markdown パイプラインで表示用の HTML にする。
 */
import type { Locale } from '../routes';

export interface Samples {
  readme: string;
  changelog: string;
  /** 読む・書く・探すの紹介と、配色の見本に使う設計メモ。 */
  design: string;
  /** Split で打ち込む 1 行。`design` の末尾のタスクリストに足す。 */
  typed: string;
  /** 書式の紹介で太字にする語。`design` の本文に含まれていること。 */
  boldTarget: string;
  /** 列幅を揃える前の表。等幅で揃って見えるよう ASCII だけで書く。 */
  messyTable: string;
  alignedTable: string;
  /** 本文幅と行間の見本。 */
  typography: string;
  /** バイト列の見本。CRLF で保存されている想定の 4 行。`bytes.edit.from` を含む行が 1 つある。 */
  bytes: string[];
  /** エクスプローラーに並べるファイル。`/` で終わるものはフォルダー。 */
  tree: string[];
  /** ファイルへ移動で一致させるファイル。 */
  quickOpen: { name: string; folder: string }[];
}

const TABLE_MESSY = [
  '| cache | p95 | hit |',
  '|---|--:|---|',
  '| none | 240ms | 0% |',
  '| ttl | 22ms | 91% |',
  '| swr | 18ms | 94% |',
];

const TABLE_ALIGNED = [
  '| cache |   p95 | hit |',
  '| ----- | ----: | --- |',
  '| none  | 240ms | 0%  |',
  '| ttl   |  22ms | 91% |',
  '| swr   |  18ms | 94% |',
];

const JA: Samples = {
  readme: `# search-api

全文検索のインデックスを、書き込みから 1 秒以内に更新する検索 API です。

> [!NOTE]
> v2 から、インデックスの更新は非同期になりました。

## 構成

| コンポーネント | 役割 | 言語 |
| --- | --- | --- |
| \`indexer\` | 差分の取り込み | Rust |
| \`query\` | 検索とランキング | Go |
| \`console\` | 管理画面 | TypeScript |

## 使い方

\`\`\`bash
curl "http://localhost:8080/search?q=markdown"
\`\`\`
`,

  changelog: `# 変更履歴

## [2.1.0] - 2026-09-20

### 追加

- 検索結果の該当箇所をハイライトする
- \`lang=ja\` で日本語の形態素解析を使えるようにした

### 修正

- 空のクエリで 500 を返していた問題
- インデックスの再構築中に、古い結果が混ざる問題

## [2.0.0] - 2026-08-02

### 変更

- インデックスの更新を非同期にした
`,

  design: `# API レスポンスのキャッシュ戦略

検索 API の p95 を下げるため、レスポンスをキャッシュする方式を比較した。

> [!TIP]
> 結論: Stale-While-Revalidate を採用する。

## 比較

| 方式 | p95 | 実装コスト | 一貫性 |
| --- | ---: | :---: | --- |
| キャッシュなし | 240ms | 低 | 常に最新 |
| TTL | 22ms | 低 | 最大 5 分古い |
| Stale-While-Revalidate | **18ms** | 中 | 裏で更新される |

## 実装例

\`\`\`ts
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < STALE_MS) {
    // 古くなりかけていれば、応答は返したまま裏で取り直す
    if (Date.now() - hit.at > FRESH_MS) void refresh(key, load);
    return hit.value as T;
  }
  return refresh(key, load);
}
\`\`\`

ヒット率を $h$、ミス時の遅延を $t_m$ とすると、平均遅延はおおよそ $\\bar{t} = h \\cdot t_c + (1 - h) \\cdot t_m$ です。

## 処理の流れ

\`\`\`mermaid
flowchart LR
  A[リクエスト] --> B{キャッシュ}
  B -- 新鮮 --> C[そのまま返す]
  B -- 古い --> D[返してから裏で更新]
  B -- なし --> E[取得して保存]
\`\`\`

## 次にやること

- [x] 方式の比較
- [ ] 失効のメトリクスを追加する[^1]
- [ ] 負荷試験

[^1]: ヒット率とあわせて、ダッシュボードに出す。
`,

  typed: 'キャッシュの容量を見積もる',
  boldTarget: 'Stale-While-Revalidate',
  messyTable: TABLE_MESSY.join('\n'),
  alignedTable: TABLE_ALIGNED.join('\n'),

  typography: `## 読みやすさは、設定できる

長い文書を読むときに効くのは、1 行の長さと行間です。1 行が長すぎると次の行頭を追いにくくなり、行間が詰まりすぎると行を取り違えやすくなります。

既定の本文幅は 72ch で、全角ならおよそ 39 字にあたります。

| 項目 | 既定 | 範囲 |
| --- | ---: | ---: |
| 文字サイズ | 16px | 8〜72 |
| 行間 | 1.75 | 1〜3 |
| 本文幅 | 72ch | 20〜200 |
`,

  bytes: ['# メモ', '', 'キャッシュの有効期限は 5 分です。', ''],

  tree: [
    'docs/',
    'docs/adr/',
    'docs/adr/0001-cache-invalidation.md',
    'docs/design/',
    'docs/design/cache-strategy.md',
    'docs/design/search-ranking.md',
    'docs/runbook.md',
    'CHANGELOG.md',
    'README.md',
  ],
  quickOpen: [
    { name: 'cache-strategy.md', folder: 'docs/design' },
    { name: '0001-cache-invalidation.md', folder: 'docs/adr' },
  ],
};

const EN: Samples = {
  readme: `# search-api

A search API that updates its full-text index within a second of every write.

> [!NOTE]
> Since v2, index updates are asynchronous.

## Components

| Component | Role | Language |
| --- | --- | --- |
| \`indexer\` | Ingests changes | Rust |
| \`query\` | Search and ranking | Go |
| \`console\` | Admin console | TypeScript |

## Usage

\`\`\`bash
curl "http://localhost:8080/search?q=markdown"
\`\`\`
`,

  changelog: `# Changelog

## [2.1.0] - 2026-09-20

### Added

- Highlight matches in search results
- Japanese morphological analysis with \`lang=ja\`

### Fixed

- Empty queries returned 500
- Stale results mixed in while rebuilding the index

## [2.0.0] - 2026-08-02

### Changed

- Index updates are now asynchronous
`,

  design: `# Caching API responses

To lower the p95 of the search API, we compared ways to cache responses.

> [!TIP]
> Decision: adopt Stale-While-Revalidate.

## Comparison

| Strategy | p95 | Cost | Consistency |
| --- | ---: | :---: | --- |
| No cache | 240ms | Low | Always fresh |
| TTL | 22ms | Low | Up to 5 min old |
| Stale-While-Revalidate | **18ms** | Medium | Refreshed in background |

## Implementation

\`\`\`ts
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < STALE_MS) {
    // If it is getting stale, answer now and refresh in the background
    if (Date.now() - hit.at > FRESH_MS) void refresh(key, load);
    return hit.value as T;
  }
  return refresh(key, load);
}
\`\`\`

With a hit rate of $h$ and a miss latency of $t_m$, the mean latency is about $\\bar{t} = h \\cdot t_c + (1 - h) \\cdot t_m$.

## Flow

\`\`\`mermaid
flowchart LR
  A[Request] --> B{Cache}
  B -- fresh --> C[Return as is]
  B -- stale --> D[Return, then refresh]
  B -- miss --> E[Fetch and store]
\`\`\`

## Next steps

- [x] Compare strategies
- [ ] Add expiry metrics[^1]
- [ ] Load testing

[^1]: Put them on the dashboard next to the hit rate.
`,

  typed: 'Estimate the cache size',
  boldTarget: 'Stale-While-Revalidate',
  messyTable: TABLE_MESSY.join('\n'),
  alignedTable: TABLE_ALIGNED.join('\n'),

  typography: `## Readability you can adjust

What matters most for long documents is line length and line height. Lines that are too long make it hard to find the start of the next one, and lines packed too tightly are easy to mix up.

The default text width is 72ch, about 78 Latin characters per line.

| Setting | Default | Range |
| --- | ---: | ---: |
| Font size | 16px | 8–72 |
| Line height | 1.75 | 1–3 |
| Text width | 72ch | 20–200 |
`,

  bytes: ['# Notes', '', 'The cache expires after 5 minutes.', ''],

  tree: JA.tree,
  quickOpen: JA.quickOpen,
};

export function samples(locale: Locale): Samples {
  return locale === 'ja' ? JA : EN;
}
