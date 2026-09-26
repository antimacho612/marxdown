<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
  <img src="assets/logo-light.svg" alt="Marxdown" width="320" />
</picture>

### Markdown を見る・書くなら、これ一択。

ターミナルで `marxdown README.md` と打った瞬間に読める、軽くて美しい Markdown ビューア＆エディター。

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

</div>

<br />

![Split 表示。左のエディターで Markdown を編集し、右のプレビューに表・コード・数式・Mermaid の図が描画されている](assets/screenshot.png)

## 💡 こんなときに

LLM に書かせた設計書、リポジトリの README、議事録。
Markdown を「ちょっと開いて確認したい」場面は 1 日に何十回もある。

そのたびに IDE を立ち上げて、ワークスペースと拡張機能の読み込みを待つ必要はない。
Marxdown は、**開いて・読んで・少し直す** ためだけに作られている。

## ✨ 特徴

### ⚡ 一瞬で開く

- 初回起動 **600ms 以内**、2 回目以降は **120ms 以内** を予算として守っている
- 起動後は常駐し、2 回目以降の `marxdown foo.md` は既存のウィンドウに**タブ**として開く
- アイドル時の CPU 使用率はほぼゼロ

### 📖 読むことに全振りしたプレビュー

- 余白・行間・本文幅まで調整済みのタイポグラフィで、開いたままで読みやすい
- **表・コードのシンタックスハイライト・数式（KaTeX）・図（Mermaid）** をそのまま描画
- GitHub のアラート（`> [!NOTE]`）、タスクリスト、脚注、定義リスト、マーカー、上付き・下付き文字にも対応
- アウトラインから見出しへジャンプ、プレビュー内検索

### ✍️ そのまま書ける

- Preview / Edit / **Split** をキー 1 つで切り替え
- エディターは VS Code と同じ Monaco
- 保存しても、**触っていない箇所のバイト列は一切変えない**。改行コード・BOM・末尾改行も読み込み時のまま
- 外部のツールがファイルを書き換えたら、自動で読み込み直す

### 🗂️ フォルダーごと開ける

- `marxdown docs/` でファイルツリー付きで開く
- `Ctrl+P` でフォルダー内の Markdown をあいまい検索
- `Ctrl+Shift+P` のコマンドパレットから、すべての操作に届く

### 🎨 自分好みに

- ライト / ダーク / システム追従
- **50 種類の組み込み配色** に加え、CSS を置くだけで自作テーマを追加できる
- 本文・コードのフォント、文字サイズ、行間、本文幅を設定画面から調整

### 🛡️ 知らないファイルも安心して開ける

自分が書いていない Markdown を開くことを前提に、CSP・HTML のサニタイズ・ナビゲーションの禁止・ファイルアクセス範囲の検証を多層で組み合わせている。
Mermaid が生成した図も同じサニタイザを通す。

## 📦 インストール

> [!NOTE]
> 現在は **Windows 10 / 11（x64）** のみ配布しています。

1. [Releases](https://github.com/antimacho612/marxdown/releases/latest) から `Marxdown_<バージョン>_x64-setup.exe` をダウンロードする
2. 実行する。管理者権限は不要（`%LOCALAPPDATA%\Marxdown` にインストールされる）
3. 最後に「新しいターミナルから marxdown コマンドで開けるようにしますか？」と聞かれたら **「はい」** を選ぶ

`.md` / `.markdown` に関連付けられるので、エクスプローラーからのダブルクリックでも開ける。

<details>
<summary>「Windows によって PC が保護されました」と表示されたら</summary>

<br />

インストーラにコード署名をしていないため、初回実行時に SmartScreen が表示されます（[ADR-0018](docs/adr/0018-no-code-signing.md)）。
「詳細情報」→「実行」で続行できます。

</details>

<details>
<summary>WebView2 ランタイムについて</summary>

<br />

Windows 11 には標準で入っています。
入っていない環境（一部の Windows 10）では、インストール中に自動でダウンロードするため、ネットワーク接続が必要です。

</details>

<details>
<summary>サイレントインストール</summary>

<br />

`/ADDTOPATH` を付けると PATH にも追加します。
更新時は前回の選択を引き継ぎます。

```powershell
.\Marxdown_0.1.0_x64-setup.exe /S /ADDTOPATH
```

</details>

<details>
<summary>アンインストール</summary>

<br />

「設定 > アプリ > インストールされているアプリ」から Marxdown をアンインストールします。
関連付けと PATH のエントリは元に戻ります。
設定と最近開いたファイルの履歴も消したい場合は、アンインストール画面の「アプリのデータを削除」にチェックを入れてください。

</details>

## 🚀 使い方

```bash
marxdown README.md                 # ファイルを開く
marxdown README.md CHANGELOG.md    # 複数まとめて開く
marxdown docs/                     # フォルダーを開く
marxdown -m split notes.md         # 表示モードを指定: preview | edit | split
llm "設計案を出して" | marxdown -   # 標準入力を無題の文書として開く
marxdown --help
```

cmd.exe / PowerShell / Git Bash のどれから実行しても、プロンプトはすぐに戻ります。

標準入力から開いた文書はファイルを持ちません。残したいときは <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>（名前を付けて保存）で保存してください。
Windows PowerShell 5.1 からパイプすると、ASCII 以外の文字が `?` になります（PowerShell の仕様）。PowerShell 7.4 以降では起きません。

エクスプローラーでフォルダーを右クリックし、「Marxdown で開く」を選んでも開けます（Windows 11 では「その他のオプションを確認」の中にあります）。

> [!TIP]
> `✕` でウィンドウを閉じても、Marxdown はタスクトレイで待機しています。
> 次の `marxdown` が一瞬で開くのはこのためです。
> 完全に終了するには `Ctrl+Q` か、トレイメニューの「終了」を使ってください。

### ⌨️ 主なショートカット

| キー | 動作 |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | Preview ⇄ Edit |
| <kbd>Ctrl</kbd>+<kbd>\\</kbd> | Split（編集とプレビューを並べる） |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | フォルダー内のファイルを検索して開く |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | コマンドパレット |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | 設定 |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> | 終了 |

すべてのキーバインドは [キーバインド一覧](docs/03.ux-spec/04-keybindings.md) を参照。

## 🛠️ 開発に参加する

ビルド手順・検査・計測・コード構成は [CONTRIBUTING.md](CONTRIBUTING.md) に、設計の全体は [`docs/`](docs/README.md) にあります。

## 📄 ライセンス

[MIT](LICENSE)
