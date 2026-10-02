# スクリーンショット

README・紹介サイト・SNS で使う画像の撮り方。

## 撮ったもの

`assets/` に置いてある。

| ファイル | 内容 | 使っている場所 |
| --- | --- | --- |
| `screenshots/window.{en,ja}.png` | 影を付けたウィンドウ。設計書の構成図・比較表・コードとアウトライン | README の先頭 |
| `screenshots/hero.{en,ja}.png` | 上の元になる画面（枠なし） | Social Preview・CLI の図の素材 |
| `screenshots/reading.{en,ja}.png` | ダーク表示の長い文書とアウトライン | README、SNS の投稿 2 |
| `screenshots/split.{en,ja}.png` | Split（左にソース、右にプレビュー）。配色は Tokyo Night | README |
| `screenshots/typography.{en,ja}.png` | 明朝体・18px・行間 2・本文幅 56ch | README、SNS の投稿 3 |
| `screenshots/cli.{en,ja}.png` | PowerShell で `marxdown docs\architecture.md` を実行した図 | README、SNS の投稿 1・3 |
| `screenshots/themes/*.png` | GitHub・Tokyo Night・Rosé Pine・Gruvbox・Flexoki・Nord | README の配色の一覧 |
| `social-preview.png` | GitHub の Social Preview（英語、1280 × 640） | GitHub の設定、紹介サイトの英語ページの OGP |
| `social-preview.ja.png` | 同じ画像の日本語版 | 紹介サイトの日本語ページの OGP |

見本の文書は [`samples/`](samples/) にある。
「Hello World」ではなく、AI と作った設計書という想定で、見出し・アラート・タスクリスト・Mermaid・表・コードを 1 つの文書に入れている。

## 撮り直す

```bash
pnpm exec vite build
pnpm exec vite preview --port 4300 --strictPort &
PLAYWRIGHT_CORE=<playwright-core の index.mjs> node marketing/screenshots/capture.mjs
PLAYWRIGHT_CORE=<playwright-core の index.mjs> node marketing/screenshots/compose.mjs
```

- `ONLY=themes/ node marketing/screenshots/capture.mjs` のように、名前の先頭で絞り込める
- 開発サーバ（`pnpm dev:web`）ではなく、ビルドしたものを撮る。開発ビルドはステータスバーに計測の値を出す
- Linux で撮るときは、Segoe UI を Inter に、Yu Gothic UI と Meiryo を Noto Sans CJK JP に置き換える fontconfig の設定を入れる。入れないと日本語が表示されない

## 限界

ここで撮った画像は、アプリと同じフロントエンドのコードを Chromium で描画したものである。
次の点は Windows の実機と異なる。

- フォント（Segoe UI・Yu Gothic UI の代わりに Inter・Noto Sans CJK JP）
- ウィンドウの枠と影（Windows 11 の角の丸みと影ではなく、`compose.mjs` で描いたもの）
- CLI の図のターミナルは HTML で描いた再現である

## 実機で撮るもの

Windows の実機でないと撮れない、または実機で撮ったほうがよいもの。

### フォルダーの一覧

ブラウザ用の Platform 実装はフォルダーの一覧を返さないため、ここでは撮れない。

1. `marxdown docs/` で、Markdown が 5〜8 個あるフォルダーを開く
2. エクスプローラーを開き、`Ctrl+P` で名前の一部を入力した状態で撮る

### GIF（15 秒以内）

機能を全部見せない。「使う瞬間」だけを見せる。
録画は ScreenToGif などを使い、幅 1280px 程度、10〜15fps に抑える。

**GIF 1: ダブルクリックから保存まで**

1. エクスプローラーで `architecture.md` をダブルクリック（0〜2 秒）
2. Marxdown が開き、文書が表示される。少しスクロールする（2〜7 秒）
3. `Ctrl+\` で Split にし、1 文字直す（7〜12 秒）
4. `Ctrl+S` で保存（12〜14 秒）

**GIF 2: ターミナルから**

1. Windows Terminal で `marxdown README.md` と入力して Enter（0〜3 秒）
2. ウィンドウが開く。プロンプトがすぐ戻っていることが分かるように、ターミナルも画面に入れる（3〜6 秒）
3. 続けて `marxdown docs\architecture.md`。同じウィンドウにタブが増える（6〜10 秒）

録画の前に、トレイで待機している状態にしておく（1 回起動して `✕` で閉じる）。
