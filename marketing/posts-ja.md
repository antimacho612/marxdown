# 日本向けの投稿

すべての投稿は次のメッセージに収束させる。

> Markdown を読むために、VS Code を開きたくない。
> Marxdown は、Markdown を読むことを中心に設計した Windows 向けビューアー／エディター。必要になったら、そのまま編集できる。

守ること（[README.md](README.md#投稿で守ること)）: 最上級の表現（「最強」「世界最高」「革命的」）を使わない。VS Code や Obsidian より優れていると言わない。測っていない速さを比べない。star やダウンロードを頼まない。AI を使って作ったことを売りにしない。

- Web サイト: <https://antimacho612.github.io/marxdown/>
- GitHub: <https://github.com/antimacho612/marxdown>

---

## 投稿 1 — VS Code を Markdown のビューアーにしている

**場所:** X、Bluesky、Misskey
**画像:** `assets/screenshots/cli.ja.png`

```text
Markdown を読むためだけに、VS Code を起動していませんか。

VS Code は好きです。でも README や設計書を 1 つ読むだけなら、IDE はちょっと大げさだと思っていました。

なので、読むことを中心にした Windows 向けの Markdown アプリ「Marxdown」を作っています。

marxdown README.md

で開いて、直したいときだけキー 1 つでエディターに切り替えます。無料・オープンソースです。
https://antimacho612.github.io/marxdown/
```

---

## 投稿 2 — AI が Markdown を大量に返してくる

**場所:** X、Bluesky
**画像:** `assets/screenshots/reading.ja.png`

```text
AI に設計や調査を頼むと、だいたい Markdown が返ってきます。

設計書、調査メモ、議事録、実装計画。
気づけば、Markdown を書く時間より読む時間のほうが長くなっていました。

それを快適に読む場所がほしくて、Windows 向けの Markdown ビューアー「Marxdown」を作っています。表・コード・数式・Mermaid の図も、そのまま表示します。

llm "設計案を出して" | marxdown -

https://github.com/antimacho612/marxdown
```

---

## 投稿 3 — 文字組みへのこだわり

**場所:** X、Bluesky
**画像:** `assets/screenshots/typography.ja.png` と `assets/screenshots/themes/` から 2〜3 枚

```text
Markdown は、一瞬見るだけではなく、何十分も読むことがあります。

だから Marxdown では、本文のフォント、文字サイズ、行間、本文幅を、読む人が調整できるようにしました。配色は組み込みで 50 種類、CSS ファイルを置けば自分の配色も足せます。

長い設計書を読む時間が、少しでも楽になればうれしいです。
https://antimacho612.github.io/marxdown/
```

---

## X のスレッド（投稿 1 に反応があったときの続き）

```text
2/ コードを書くのは VS Code、それについて書かれたものを読むのは Marxdown、という併用を想定しています。一度起動するとタスクトレイで待機するので、2 つ目以降のファイルはすぐにタブで開きます。
```

```text
3/ 自分で書いていない Markdown（AI の出力など）を開く前提で作っています。文書に埋め込まれたスクリプトは実行せず、フォルダーの外のファイルは許可しない限り読み込みません。アカウント登録もテレメトリもありません。
```

```text
4/ 毎日 Markdown を読む方の「ここが引っかかる」を聞きたいです。Issue でも、この投稿への返信でも。
https://github.com/antimacho612/marxdown/issues
```

---

## Qiita / Zenn

記事の案は [article-ja.md](article-ja.md) にある。
Qiita と Zenn の両方に同じ本文を出さない。どちらか一方に出し、もう一方には別の切り口（例: Tauri で単一インスタンスと CLI のシムを作った話）を書く。
