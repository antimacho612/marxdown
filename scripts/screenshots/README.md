# スクリーンショット

README・紹介サイト・SNS で使う画像（`assets/screenshots/` と `assets/social-preview*.png`）を作るスクリプト。

| ファイル | 役割 |
| --- | --- |
| `capture.mjs` | アプリの画面を撮る。アプリのフロントエンドをブラウザ用の Platform 実装（`src/platform/web.ts`）で動かし、Chromium で撮影する |
| `compose.mjs` | 撮った画面から、Social Preview・CLI の図・影を付けたウィンドウを組み立てる |
| `samples/` | 撮影に使う見本の文書。見出し・アラート・タスクリスト・Mermaid・表・コードを 1 つに入れた設計書 |

## 撮り直す

```bash
pnpm exec vite build
pnpm exec vite preview --port 4300 --strictPort &
PLAYWRIGHT_CORE=<playwright-core の index.mjs> node scripts/screenshots/capture.mjs
PLAYWRIGHT_CORE=<playwright-core の index.mjs> node scripts/screenshots/compose.mjs
```

- playwright-core は依存に入れていない。別の場所に入れ、その `index.mjs` のパスを `PLAYWRIGHT_CORE` で渡す
- `ONLY=themes/ node scripts/screenshots/capture.mjs` のように、名前の先頭で絞り込める
- 開発サーバ（`pnpm dev:web`）ではなく、ビルドしたものを撮る。開発ビルドはステータスバーに計測の値を出す
- Linux で撮るときは、Segoe UI を Inter に、Yu Gothic UI と Meiryo を Noto Sans CJK JP に置き換える fontconfig の設定を入れる。入れないと日本語が表示されない

## 実機との違い

画面はアプリと同じフロントエンドのコードで描画されるが、次の点は Windows の実機と異なる。

- フォント（Segoe UI・Yu Gothic UI の代わりに Inter・Noto Sans CJK JP）
- ウィンドウの枠と影（Windows 11 のものではなく、`compose.mjs` で描いたもの）
- CLI の図のターミナルは HTML で描いた再現である
- フォルダーの一覧は撮れない（ブラウザ用の Platform 実装がフォルダーの中身を返さない）
