# GitHub リポジトリの設定

README やコードでは変えられない、GitHub の画面側の設定。
API とこのリポジトリの権限では Social Preview を設定できないため、ここに手順と値をまとめる。

## About（Description・Website・Topics）

### Description

```text
A fast, reading-first Markdown viewer and editor for Windows.
```

- 現在: `Markdown を見る・書くなら、これ。軽くて美しい Markdown ビューアー＆エディター（Windows）`
- 英語にする理由: GitHub の検索結果・リンクのプレビュー・Topics のページは言語を問わず同じ文が出る。海外の利用者にも一目で伝わる文を優先する。日本語の訴求は README の先頭と紹介サイトが担う
- 第二候補: `A lightweight Markdown viewer for Windows — read first, edit when needed.`

### Website

```text
https://antimacho612.github.io/marxdown/
```

現在の設定のままでよい。

### Topics

| 操作 | Topic | 理由 |
| --- | --- | --- |
| 残す | `markdown` `markdown-viewer` `markdown-editor` `windows` `desktop-app` `tauri` `rust` `svelte` `marp` | 実装と機能に一致している |
| 足す | `markdown-reader` | 「読む」用途で探す人に届く |
| 足す | `windows-app` | `windows` より利用者向けの語で探されることがある |
| 足す | `developer-tools` | 主な利用者が開発者である |
| 足す | `mermaid` | Mermaid の図を表示できることは、選ぶ理由になりやすい |

合計 13 個で、GitHub の上限（20 個）に収まる。
関係の薄い Topic（`notes`、`obsidian`、`vscode` など）は足さない。検索の流入は増えても、Marxdown を必要としない人に届くだけである。

### gh コマンドでまとめて設定する

```bash
gh repo edit antimacho612/marxdown \
  --description "A fast, reading-first Markdown viewer and editor for Windows." \
  --homepage "https://antimacho612.github.io/marxdown/" \
  --add-topic markdown-reader \
  --add-topic windows-app \
  --add-topic developer-tools \
  --add-topic mermaid
```

## Social Preview

1. リポジトリの Settings → General → Social preview の「Edit」→「Upload an image…」
2. [`assets/social-preview.png`](../assets/social-preview.png)（1280 × 640、英語）を選ぶ

日本語版の [`assets/social-preview.ja.png`](../assets/social-preview.ja.png) は、紹介サイトの日本語ページの OGP 画像に使っている。
GitHub の Social Preview は 1 枚しか設定できないため、英語版を使う。

画像は `marketing/screenshots/compose.mjs` で作り直せる。

## Releases

- 下書きの本文は `release.mjs notes` が作る。公開前にタイトルの価値の部分と「Why it matters」を書く（CONTRIBUTING.md「リリース」）
- 公開済みの v0.3.0 は本文だけ書き換えられる。差し替え用の本文は [release-v0.3.0.md](release-v0.3.0.md) にある。Release は immutable だが、本文とタイトルの編集はできる（配布物とタグは変えられない）

## そのほか

| 項目 | 推奨 | 理由 |
| --- | --- | --- |
| Discussions | 有効にする | 不具合ではない感想や使い方の相談を受ける場所が無い。Reddit などから来た人が気軽に書ける |
| Packages / Deployments の表示 | 消す | About の下が配布物と無関係な項目で埋まる |
| Releases の表示 | 残す | ダウンロードへの導線である |
