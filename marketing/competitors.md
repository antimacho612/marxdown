# 競合の調査

2026-10-02 時点。
目的は文章を真似ることではなく、「利用者が何を見た瞬間に製品を理解するか」を調べることである。

> [!NOTE]
> 調査した環境から typora.io・obsidian.md・tinta.cc には接続できなかった。
> これらの製品サイトの最初の画面は、検索結果と GitHub の README から分かる範囲で書いている。「未確認」とした項目は、公開前に実物を見て確かめる。

## 一覧

| 製品 | 一言でいうと | 主な利用者 | 価格 | 配布 | 対応 OS |
| --- | --- | --- | --- | --- | --- |
| VS Code | コードエディター / 開発環境 | 開発者全般 | 無料 | 公式サイト・winget・Microsoft Store | Windows・macOS・Linux |
| Typora | WYSIWYG の Markdown エディター | 文章を書く人・技術ライター | 有料（買い切り。約 15 ドル、3 台まで。15 日の試用あり） | 公式サイト | Windows・macOS・Linux |
| Obsidian | 保管庫（Vault）で管理するノートの知識ベース | ノートを蓄積する人 | 無料（2025-02 から商用ライセンスは任意） | 公式サイト・各ストア | Windows・macOS・Linux・iOS・Android |
| MarkText | オープンソースの WYSIWYG エディター | Typora の無料の代替を探す人 | 無料（MIT） | GitHub Releases ほか | Windows・macOS・Linux |
| Tinta | Windows 向けの軽量な Markdown / Mermaid ビューアー | Windows で Markdown を読む人 | 無料（MIT） | Microsoft Store（推奨・署名済み）・GitHub・Scoop・winget | Windows（macOS 版は別製品） |
| mdview 系 | 「開いて表示するだけ」の小さなビューアー | 最小限で十分な人 | 無料 | GitHub | 製品による |

## 製品ごとの観察

### VS Code

- 位置づけ: Marxdown が最も比較される相手。ただし競合ではなく、併用の相手として扱う
- Markdown の扱い: `.md` はソースとして開き、プレビューは `Ctrl+Shift+V`（別タブ）か `Ctrl+K V`（横に並べる）で開く
- CLI: `code README.md`。ワークスペースや拡張機能の読み込みが伴う
- Marxdown の差別化: 「開くと読む表示になる」「トレイで待機していて次のファイルはタブで開く」「エディターは同じ Monaco」。VS Code を否定しない言い方ができる

### Typora

- 最初の画面（検索結果からの推定。未確認）: 製品名と「Markdown を見えないようにする」系のメッセージ、編集中の画面の大きな画像、ダウンロードと購入の CTA
- 学べること: 画面の美しさを 1 枚の大きな画像で伝えている。機能の一覧より先に「書いている瞬間」を見せる
- Marxdown との違い: Typora は「書く」ための WYSIWYG。Marxdown は「読む」ための表示とソースの編集。有料か無料か

### Obsidian

- 最初の画面（未確認）: 「思考を整理する」系のメッセージと、グラフやノートの画面。無料・ローカル・プライバシーを強く打ち出す
- 単体のファイル: 保管庫の外にある `.md` を開く操作は標準ではなく、フォーラムで長く要望が出ている。外部のスクリプトや拡張で補う方法がある
- 学べること: 「ローカルに保存」「アカウント不要」「追跡しない」をはっきり書くと、信頼につながる
- Marxdown との違い: 知識ベースを作る道具ではない。目の前のファイルを開いて読む道具である

### MarkText

- GitHub: 約 6.2 万 star、MIT
- README の構成: ロゴ → タグライン（「Next generation markdown editor」と速さ・使いやすさ）→ バッジ → 言語の切り替え → 機能 → 画面 → インストール
- 学べること: 先頭の 1 文で「何か」と「何を重視しているか」を言い切っている
- Marxdown との違い: WYSIWYG で書くことが中心。Marxdown は読むことが中心

### Tinta（最も近い競合）

- GitHub（oipoistar/tinta）: 約 200 star、MIT。同名のフォークが複数ある
- 一言: 「A fast, lightweight Markdown and Mermaid viewer for Windows」。ネイティブ C++ と Direct2D、Electron を使わない
- README の構成: 速さの数値（起動 100ms 未満、バイナリの大きさ）→ インストール → Typora・Obsidian などとの比較表 → 機能
- 配布: Microsoft Store を推奨（署名済み・自動更新）。GitHub の実行ファイルは署名なし。Scoop・winget もある
- CLI: `tinta.exe document.md` など。既定のビューアーへの登録オプションがある
- 機能: 配色 10 種類、目次、検索、フォルダーの一覧、編集モード、数式、Mermaid、多数の形式への書き出し
- 学べること
  - 「Windows」「Markdown viewer」「速い」を 1 文に入れると、検索でも一覧でも一目で分かる
  - Microsoft Store 経由の配布は、SmartScreen の警告を避ける現実的な方法である（[distribution.md](distribution.md)）
  - 速さを数値で示すときは、測定の条件を添えないと比較の根拠にならない
- Marxdown との違い（事実に基づくもの）
  - CLI から開いたファイルが、待機中のウィンドウにタブで集まる（単一インスタンス）
  - エディターが Monaco で、Split で書きながら読める
  - 保存しても、編集していないバイトを変えない（改行コード・BOM を保つ）
  - 配色 50 種類と、CSS ファイルによる自作の配色
  - 自分で書いていない Markdown を前提にした防御（スクリプトを実行しない・フォルダーの外を読まない）
- 注意: 比較表で Tinta を名指しして優劣を書かない。README の比較表は、役割が明確に違う VS Code・Typora・Obsidian に絞った

### mdview 系

- 同じ名前の小さなプロジェクトが多数ある（Rust + WebView2、C#、Total Commander のプラグインなど）
- 共通点: 「ダブルクリックで開いて読むだけ」を売りにしている
- 学べること: 「何をしないか」を書くと、軽さが伝わる

## Marxdown の訴求に反映したこと

| 観察 | 反映した場所 |
| --- | --- |
| 先頭の 1 文で「何か」と「誰のためか」を言い切る製品が理解されやすい | README と紹介サイトの見出しを「Don't open VS Code just to read a Markdown file.」に |
| 画面の大きな画像が、機能の一覧より先に価値を伝える | README の先頭に実際の画面を置き、機能の一覧はその下に移した |
| 比較表は分かりやすいが、優劣の表にすると反感を買う | 「何を中心に作られているか」の表にし、Marxdown が Windows 専用であることも書いた |
| ローカル・アカウント不要・追跡なしの明記は信頼につながる | README と FAQ にプライバシーの節を追加した |
| 速さの数値だけでは利用者に意味が伝わらない | 「フル IDE の初期化を待たずに開ける」と、目標値である旨と測定の条件を併記した |
| Store 経由の配布が SmartScreen を避けている | 配布方法の調査を [distribution.md](distribution.md) にまとめた |

## 出典

- [MarkText（GitHub）](https://github.com/marktext/marktext)
- [Tinta（GitHub）](https://github.com/oipoistar/tinta)
- [Tinta Markdown Viewer（Microsoft Store）](https://apps.microsoft.com/detail/9mz5mz3l9rkf)
- [Obsidian is now free for work（Obsidian Blog）](https://obsidian.md/blog/free-for-work/)
- [保管庫の外のファイルを開く要望（Obsidian Forum）](https://forum.obsidian.md/t/have-obsidian-be-the-handler-of-md-files-add-ability-to-use-obsidian-as-a-markdown-editor-on-files-outside-vault-file-association/314)
- [Typora の価格（Toolradar）](https://toolradar.com/tools/typora/pricing)
- mdview 系: [yowmamasita/mdview](https://github.com/yowmamasita/mdview)・[mdview2026/mdview](https://github.com/mdview2026/mdview)・[c3er/mdview](https://github.com/c3er/mdview)
