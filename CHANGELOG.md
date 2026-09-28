# 変更履歴

Marxdown の利用者に見える変更を記録する。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

書き方は [CONTRIBUTING.md](CONTRIBUTING.md#変更履歴) を参照。

## [Unreleased]

## [0.2.0] - 2026-09-28

### 追加

- エディターで折り返した行の端に記号（`↩`）を表示し、本当の改行と区別できるようにする設定 `editor.wordWrapIndicator`（既定は OFF）

### 修正

- 設定 `markdown.multilineTables` を有効にすると文書が描画されなくなる不具合を修正した。行末の `\` でセルの中を改行でき、`^^` で上のセルと縦に結合できる

## [0.1.1] - 2026-09-28

最初の公開版。
0.1.0 は公開の手順を誤ったため欠番とした。

### 追加

- Markdown のプレビュー。表・コードのシンタックスハイライト・数式（KaTeX）・図（Mermaid）・GitHub のアラート・タスクリスト・脚注を描画する
- Preview / Edit / Split の 3 つの表示モード。エディターは Monaco
- 単一インスタンスとタブ。2 回目以降の `marxdown foo.md` は常駐しているウィンドウにタブとして開く
- タスクトレイへの常駐
- フォルダーを開いたときのファイルツリー、クイックオープン（`Ctrl+P`）、コマンドパレット（`Ctrl+Shift+P`）
- アウトラインと見出しへのジャンプ、プレビュー内検索
- ライト / ダーク / システム追従と、50 種類の組み込み配色。CSS を置くと自作の配色を追加できる
- 設定画面（`Ctrl+,`）と `settings.json`
- Windows 向けインストーラ。`.md` / `.markdown` の関連付け、「プログラムから開く」への登録、`marxdown` コマンドの PATH への追加（選択制）
- 英語の UI。設定 `ui.language`（既定は Windows の表示言語に従う）で切り替えられ、アプリを開き直すと反映される。`marxdown --help` とインストーラも Windows の表示言語に合わせる
- 自動更新。起動時とウィンドウを前面に出したときに（1 日 1 回まで）新しい版を確認し、通知バーから更新できる。設定 `update.autoCheck` で止められる
- メニューの「ヘルプ」。不具合の報告（バージョンと OS を入力済みの Issue フォームを開く）・機能の提案・更新の確認・ライセンスの表示・「Marxdown について」

[Unreleased]: https://github.com/antimacho612/marxdown/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/antimacho612/marxdown/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/antimacho612/marxdown/releases/tag/v0.1.1
