/**
 * 紹介ページのウィンドウに表示する文書。
 *
 * どれもビルド時にアプリの Markdown パイプラインで表示用の HTML にする。
 */
import type { Locale } from '../routes';

export interface Samples {
  /** ヒーローで最初に開く設計書。対応している記法を 1 画面に収める。 */
  architecture: string;
  /** ヒーローで 2 つ目のタブに開く、AI がまとめた調査メモ。 */
  research: string;
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
  architecture: `# 設計書: オフラインファーストの同期

> [!TIP]
> 決定: CRDT による複製を採用する。オフライン中の編集を失わない。

## 構成

\`\`\`mermaid
flowchart LR
  A[エディター] --> B[(ローカルの複製)]
  B -- push --> C{{同期リレー}}
  C -- pull --> B
  C --> D[(Postgres)]
\`\`\`

## 方式の比較

| 方式 | オフライン編集 | 統合の品質 | 工数 |
| --- | :---: | --- | ---: |
| 後勝ち | 一部 | 同時編集が失われる | 1 週間 |
| サーバー側 OT | 不可 | 常時接続が必要 | 6 週間 |
| CRDT の複製 | 可 | **テキストとリストは自動** | 4 週間 |

## データモデル

\`\`\`ts
export function apply(state: DocState, change: Change): DocState {
  if (state.seen.has(change.id)) return state; // 冪等
  return change.ops.reduce(applyOp, state);
}
\`\`\`

## 展開

- [x] ローカルの複製をフラグ付きで配る
- [ ] 1 チームで push / pull を有効にする
- [ ] 同期時間と競合率を 2 週間計測する
`,

  research: `# 調査: ローカルファーストのアーキテクチャ

> [!NOTE]
> AI アシスタントが 12 本の資料をもとにまとめた要約です。

## 要点

1. 書き込みを先にローカルへ保存すると、通信の状態に関係なく操作が即座に終わる
2. 競合の解決は、データ型ごとに選ぶのが現実的である
3. 同期サーバーは「中継」に徹すると、障害時の影響が小さい

## 比較

| 方式 | 遅延 | オフライン | 実装の難しさ |
| --- | ---: | :---: | --- |
| サーバー中心 | 120ms | 不可 | 低 |
| キャッシュ併用 | 40ms | 読み取りのみ | 中 |
| ローカルファースト | **5ms** | 可 | 高 |

## 推奨

まずは **メモと TODO** だけをローカルファーストにし、効果を計測してから範囲を広げる。
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
  architecture: `# Architecture: Offline-first Sync

> [!TIP]
> Decision: adopt CRDT replicas. Edits made offline are never lost.

## Overview

\`\`\`mermaid
flowchart LR
  A[Editor] --> B[(Local replica)]
  B -- push --> C{{Sync relay}}
  C -- pull --> B
  C --> D[(Postgres)]
\`\`\`

## Options compared

| Approach | Offline edits | Merge quality | Effort |
| --- | :---: | --- | ---: |
| Last write wins | Partial | Loses concurrent edits | 1 week |
| Server-side OT | No | Needs a live connection | 6 weeks |
| CRDT replicas | Yes | **Automatic for text and lists** | 4 weeks |

## Data model

\`\`\`ts
export function apply(state: DocState, change: Change): DocState {
  if (state.seen.has(change.id)) return state; // idempotent
  return change.ops.reduce(applyOp, state);
}
\`\`\`

## Rollout

- [x] Ship local replicas behind a flag
- [ ] Enable push and pull for one team
- [ ] Measure sync time and conflict rate for two weeks
`,

  research: `# Research: Local-first Architecture

> [!NOTE]
> Summary prepared by an AI assistant from 12 sources.

## Key findings

1. Writing locally first makes every action finish instantly, whatever the network does
2. Conflict resolution is best chosen per data type
3. A sync server that only relays changes limits the impact of outages

## Comparison

| Approach | Latency | Offline | Difficulty |
| --- | ---: | :---: | --- |
| Server-centric | 120ms | No | Low |
| With a cache | 40ms | Read only | Medium |
| Local-first | **5ms** | Yes | High |

## Recommendation

Start with **notes and to-dos** only, measure the effect, then widen the scope.
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
