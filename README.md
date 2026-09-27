<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
  <img src="assets/logo-light.svg" alt="Marxdown" width="320" />
</picture>

### Markdown を見る・書くなら、これ。

ターミナルで `marxdown README.md` と入力した瞬間に読める、軽くて美しい Markdown ビューアー＆エディターです。

[![CI](https://github.com/antimacho612/marxdown/actions/workflows/ci.yml/badge.svg)](https://github.com/antimacho612/marxdown/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/antimacho612/marxdown?include_prereleases&sort=semver)](https://github.com/antimacho612/marxdown/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?logo=windows&logoColor=white)
<br />
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)

[**ダウンロード**](https://github.com/antimacho612/marxdown/releases/latest) ·
[特徴](#-特徴) ·
[インストール](#-インストール) ·
[使い方](#-使い方) ·
[開発に参加する](CONTRIBUTING.md)

日本語 | [English](README.en.md)

</div>

<br />

![Split 表示。左のエディターで Markdown を編集し、右のプレビューに表・コード・数式・Mermaid の図が表示されている](assets/screenshot.png)

## 💡 こんなときに

LLM に書かせた設計書、リポジトリの README、議事録。
Markdown を「ちょっと開いて確認したい」場面は、1 日に何十回もあります。

そのたびに IDE を立ち上げて、ワークスペースや拡張機能の読み込みを待つ必要はありません。
Marxdown は、**開いて・読んで・少し直す** ためのアプリです。

## ✨ 特徴

### ⚡ 一瞬で開く

- 初回の起動は 600ms 以内、2 回目以降は 120ms 以内を目標に作っています
- 起動後はタスクトレイで待機し、2 回目以降の `marxdown foo.md` は既存のウィンドウに**タブ**で開きます
- 待機中は CPU をほとんど使いません

### 📖 読むためのプレビュー

- 余白・行間・本文幅を整えたタイポグラフィで、長い文書も読みやすく表示します
- **表・コード（シンタックスハイライト）・数式（KaTeX）・図（Mermaid）** をそのまま表示します
- GitHub のアラート（`> [!NOTE]`）、タスクリスト、脚注にも対応しています。定義リスト、マーカー、上付き・下付き文字などは設定で有効にできます
- アウトラインから見出しへ移動したり、プレビュー内を検索したりできます
- `marp: true` を書いた文書は、[Marp](https://marp.app/) のスライドとして表示します
- 表示している文書を HTML / PDF として書き出せます

### ✍️ そのまま書ける

- Preview / Edit / **Split**（左右に並べる）をキー 1 つで切り替えられます
- エディターは VS Code と同じ Monaco です
- 保存しても、**編集していない箇所は 1 バイトも変わりません**。改行コード・BOM・末尾の改行も、開いたときのまま保ちます
- ほかのアプリがファイルを書き換えると、自動で再読み込みします

### 🗂️ フォルダーごと開ける

- `marxdown docs/` で、フォルダー内のファイル一覧（エクスプローラー）と一緒に開きます
- ファイル一覧から、新規作成・名前の変更・コピー・ごみ箱への移動ができます
- `Ctrl+P` で、フォルダー内の Markdown ファイルを名前の一部から検索できます
- `Ctrl+Shift+P` のコマンドパレットから、すべての操作を実行できます

### 🎨 自分好みに

- ライトとダークを切り替えられます。Windows の設定に合わせることもできます
- **50 種類の組み込み配色** に加え、CSS ファイルを置くだけで自分の配色を追加できます
- 本文とコードのフォント、文字サイズ、行間、本文幅を設定画面で調整できます
- 画面の表示は日本語と英語に対応しています。既定では Windows の表示言語に合わせます

### 🛡️ 知らないファイルも安心して開ける

自分で書いていない Markdown を開くことを前提に作っています。
文書に埋め込まれたスクリプトは実行せず、リンクを踏んでもアプリ内で別のページへ移動しません。
開いたファイルのフォルダーの外にあるファイルは、許可しない限り読み込みません。

## 📦 インストール

> [!NOTE]
> 現在は **Windows 10 / 11（x64）** 版のみ配布しています。

1. [Releases](https://github.com/antimacho612/marxdown/releases/latest) から `Marxdown_<バージョン>_x64-setup.exe` をダウンロードします
2. ダウンロードしたファイルを実行します。管理者権限は不要です（`%LOCALAPPDATA%\Marxdown` にインストールされます）
3. 最後に「ターミナルから marxdown コマンドを使えるようにしますか？」と表示されたら、**「はい」** を選びます

`.md` / `.markdown` ファイルに関連付けられるため、エクスプローラーからダブルクリックしても開けます。

新しいバージョンが出ると、アプリ内に通知が表示されます。
「更新して再起動」を押すと、そのまま新しいバージョンに入れ替わります（変更内容は [CHANGELOG](CHANGELOG.md)）。

<details>
<summary>「Windows によって PC が保護されました」と表示されたら</summary>

<br />

インストーラーにはコード署名をしていないため、初回の実行時に SmartScreen の警告が表示されます。
「詳細情報」→「実行」の順に選ぶと、インストールを続けられます。

</details>

<details>
<summary>WebView2 ランタイムについて</summary>

<br />

Windows 11 には標準で入っています。
入っていない環境（一部の Windows 10）では、インストール中に自動でダウンロードするため、インターネット接続が必要です。

</details>

<details>
<summary>サイレントインストール</summary>

<br />

`/ADDTOPATH` を付けると、PATH にも追加します。
更新するときは、前回の選択を引き継ぎます。

```powershell
.\Marxdown_0.1.0_x64-setup.exe /S /ADDTOPATH
```

</details>

<details>
<summary>更新の確認について</summary>

<br />

起動時とウィンドウを前面に出したときに、1 日 1 回まで GitHub の Releases に新しいバージョンを問い合わせます。
送られるのは通信そのもの（IP アドレスなど）だけで、開いているファイルの情報は含みません。
設定の「新しいバージョンを自動で確認する」（`update.autoCheck`）で止められます。
止めていても、コマンドパレット（`Ctrl+Shift+P`）の「更新を確認」から確認できます。

</details>

<details>
<summary>アンインストール</summary>

<br />

「設定 > アプリ > インストールされているアプリ」から Marxdown をアンインストールします。
ファイルの関連付けと PATH は元に戻ります。
設定と最近開いたファイルの履歴も削除する場合は、アンインストール画面で「アプリのデータを削除」にチェックを入れてください。

</details>

## 🚀 使い方

```bash
marxdown README.md                 # ファイルを開く
marxdown README.md CHANGELOG.md    # 複数のファイルをまとめて開く
marxdown docs/                     # フォルダーを開く
marxdown -m split notes.md         # 表示モードを指定して開く: preview | edit | split
llm "設計案を出して" | marxdown -   # 標準入力の内容を無題の文書として開く
marxdown --help
```

cmd.exe / PowerShell / Git Bash のどこから実行しても、プロンプトはすぐに戻ります。

標準入力から開いた文書は、まだファイルとして保存されていません。残したいときは <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>（名前を付けて保存）で保存してください。
Windows PowerShell 5.1 からパイプで渡すと、ASCII 以外の文字が `?` に置き換わります（PowerShell の仕様です）。PowerShell 7.4 以降では起きません。

エクスプローラーでフォルダーを右クリックし、「Marxdown で開く」を選んでも開けます（Windows 11 では「その他のオプションを確認」の中にあります）。

> [!TIP]
> `✕` でウィンドウを閉じても、Marxdown はタスクトレイで待機しています。
> 次の `marxdown` がすぐに開くのはこのためです。
> 完全に終了するには、<kbd>Ctrl</kbd>+<kbd>Q</kbd> を押すか、タスクトレイのメニューから「終了」を選んでください。

### ⌨️ 主なショートカット

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Preview と Edit を切り替える |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | Split（エディターとプレビューを左右に並べる） |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | フォルダー内のファイルを検索して開く |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | コマンドパレット |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | 設定 |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> | 終了 |

すべてのショートカットは [キーボードショートカット](docs/keybindings.md) を参照してください。

## 🛠️ 開発に参加する

ビルド手順・検査・計測・コードの構成は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。

## 📄 ライセンス

[MIT](LICENSE)
