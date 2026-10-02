# 計測と成果指標

目標は「100 人に知ってもらう」ではなく、「Marxdown を必要とする 100 人に届く」こと。
star の数だけを見ない。

## 導線

```text
紹介サイトの訪問 → GitHub へのクリック → Release のページ → インストーラーのダウンロード
```

| 段階 | 測る場所 | 状態 |
| --- | --- | --- |
| 紹介サイトの訪問 | GoatCounter（Cookie を使わない集計） | 導入済み（`site/src/render.ts`） |
| ダウンロードのクリック | GoatCounter のクリックイベント `download-hero` / `download-install` | 導入済み |
| GitHub へのクリック | GoatCounter のクリックイベント `github-hero` / `github-cta` / `github-header` | この変更で追加 |
| GitHub の訪問 | GitHub の Insights → Traffic（Views・Unique visitors・Referring sites） | 14 日分しか残らないため、週に 1 回記録する |
| Release のダウンロード | Release の各ファイルのダウンロード数（`download_count`） | 下のコマンドで取得する |

### ダウンロード数を取る

```bash
gh api repos/antimacho612/marxdown/releases \
  --jq '.[] | {tag: .tag_name, downloads: [.assets[] | select(.name | endswith("-setup.exe")) | .download_count] | add}'
```

`latest.json` と `.sig` はアプリの更新確認でも取得されるため、数えない。
インストーラー（`-setup.exe`）だけを数える。
ただし、アプリ内の「更新して再起動」もインストーラーをダウンロードするため、新規の利用者と更新の両方が含まれる。

## 見る指標

| 区分 | 指標 | 取り方 |
| --- | --- | --- |
| 認知 | 紹介サイトの訪問者数 | GoatCounter |
| 認知 | GitHub の Unique visitors | Insights → Traffic |
| 認知 | SNS の表示回数 | 各 SNS の分析画面 |
| 関心 | GitHub の star | リポジトリ |
| 関心 | Release のページの訪問 | GoatCounter のクリックと Traffic の Popular content |
| 転換 | インストーラーのダウンロード数 | 上のコマンド |
| 継続 | Issue・Discussions の数 | リポジトリ |
| 継続 | 再訪問・フィードバック | GoatCounter・Issue |

## 記録の習慣

- 週に 1 回、Traffic（14 日で消える）とダウンロード数を表に書き写す
- 投稿したら、その日付と場所を記録する。Referring sites と照らし合わせて、どの投稿が「必要としている人」に届いたかを見る
- 投稿の直後に増えて元に戻る数字より、Issue やフィードバックの質を重く見る
