# マーケティング資料

製品のコード以外で、利用者が Marxdown に触れる場所（GitHub・README・紹介サイト・Release・SNS・記事）の方針と素材。
アプリには含まれない。

## 一文

すべての素材を、この一文に収束させる。

| | |
| --- | --- |
| English | **Don't open VS Code just to read a Markdown file.**<br />Marxdown is a fast, reading-first Markdown viewer for Windows. Edit when you need to. |
| 日本語 | **Markdown を読むために、VS Code を開きたくない。**<br />Marxdown は、Markdown を読むことを中心に設計した Windows 向けビューアー／エディター。必要になったら、そのまま編集できる。 |

訴求の順番は、読む → すぐ開く → 必要なら書く → AI が生成した Markdown → 読みやすさの調整。
「高機能な Markdown エディター」を主語にしない。

## 資料

| ファイル | 内容 |
| --- | --- |
| [github-settings.md](github-settings.md) | Description・Topics・Social Preview・About の設定値と手順 |
| [release-v0.3.0.md](release-v0.3.0.md) | 公開済みの v0.3.0 の Release を書き換える本文 |
| [competitors.md](competitors.md) | 競合の調査と、訴求に反映したこと |
| [distribution.md](distribution.md) | コード署名と配布方法の調査 |
| [posts-en.md](posts-en.md) | 海外向けの投稿 3 本・X のスレッド・Reddit・Show HN |
| [posts-ja.md](posts-ja.md) | 日本向けの投稿 3 本・X のスレッド |
| [article-ja.md](article-ja.md) | Qiita / Zenn の記事の案 |
| [analytics.md](analytics.md) | 計測の導線と成果指標 |
| [screenshots/](screenshots/README.md) | 画像の一覧、撮り直す手順、実機で撮るもの |

## 投稿で守ること

- 「世界最高」「最強」「革命的」を使わない
- 「VS Code より優れている」「Obsidian を超えた」と言わない。競合を下げない
- 測っていない性能を比べない。起動時間は目標値であることを添える
- star やダウンロードを頼まない
- AI を使って作ったことを売りにしない
- 「リリースしました」だけの投稿をしない。投稿そのものに読む価値を持たせる
- Reddit は各コミュニティのセルフプロモーションの規則を読んでから、1 つずつ投稿する。同じ文を複数の場所に同時に出さない

## 完了条件の状況

### GitHub

- [ ] Description の改善 — 値は [github-settings.md](github-settings.md)。GitHub の画面か `gh repo edit` で設定する
- [ ] Topics の整理 — 同上
- [x] README の改善
- [x] README.en の改善
- [ ] Social Preview の改善 — 画像（`assets/social-preview.png`）は作成済み。Settings からアップロードする
- [ ] About の整理 — [github-settings.md](github-settings.md)
- [x] ダウンロードの導線の改善 — README の先頭と各節からダウンロードへ
- [x] Release のページの改善 — 次の版から本文の構成を自動で作る。v0.3.0 の差し替え案は [release-v0.3.0.md](release-v0.3.0.md)

### Web

- [x] Hero の改善
- [x] 価値の明確化
- [x] スクリーンショットの改善 — ヒーローの見本を設計書と調査メモに差し替えた
- [x] デモの改善 — 機能の紹介を「使う場面」の流れに変えた
- [x] AI が生成した Markdown の用途を追加
- [x] VS Code との関係の説明
- [x] 機能の階層の見直し
- [x] 配色の一覧（既存の、実際の配色を当てられる一覧を残した）
- [x] CLI の紹介
- [x] インストールの改善
- [x] よくある質問
- [x] SEO の metadata
- [x] OGP — 言語ごとの画像と大きさを指定した
- [x] favicon / SNS 用の画像の確認

### コンテンツ

- [x] 海外向けの投稿 3 本
- [x] 日本向けの投稿 3 本
- [x] Qiita / Zenn の記事の案
- [x] Reddit の投稿の案
- [x] X の投稿の案

### 画像

- [x] Hero のスクリーンショット
- [x] 長い文書のスクリーンショット
- [x] 配色のスクリーンショット
- [x] CLI の図
- [ ] CLI の GIF — 実機での録画が必要（[screenshots/README.md](screenshots/README.md#gif15-秒以内)）
- [x] 編集中のスクリーンショット
- [ ] フォルダーの一覧のスクリーンショット — 実機での撮影が必要
- [x] Social Preview

## 初めて知った人の目で見たとき

「Marxdown を今日初めて知った Windows の利用者」として、GitHub の README を上から読んだときの確認。

| 時間 | 問い | README のどこで答えているか |
| --- | --- | --- |
| 5 秒 | Marxdown とは何か | ロゴの下の見出し「Markdown を読むために、VS Code を開きたくない。」と、その下の 1 文 |
| 10 秒 | なぜ VS Code ではなく Marxdown なのか | 「なぜ Marxdown？」と「VS Code は素晴らしい。Marxdown は役割が違う。」 |
| 30 秒 | どんな見た目か | 先頭の大きな画面と「使ったときの見た目」の 4 枚 |
| 1 分 | どうインストールするか | 先頭の「Windows 版をダウンロード」と「インストール」の 3 ステップ |

紹介サイトも同じ順番で答える（見出し → 問題 → VS Code との関係 → 使う場面 → … → インストール → よくある質問）。

## SEO で対応していないもの

- `robots.txt`: GitHub Pages のプロジェクトサイト（`/marxdown/`）からはホストのルートに置けない。`sitemap.xml` は Search Console から送る（`site/src/render.ts` の `renderSitemap`）
