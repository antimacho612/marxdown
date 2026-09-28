## インストール

> [!NOTE]
> 現在は **Windows 10 / 11（x64）** 版のみ配布しています。

1. [Releases](https://github.com/antimacho612/marxdown/releases/latest) から `Marxdown_<バージョン>_x64-setup.exe` をダウンロードします
2. ダウンロードしたファイルを実行します。管理者権限は不要です（`%LOCALAPPDATA%\Marxdown` にインストールされます）
3. 最後に「ターミナルから marxdown コマンドを使えるようにしますか？」と表示されたら、**「はい」** を選びます

`.md` / `.markdown` ファイルに関連付けられるため、エクスプローラーからダブルクリックしても開けます。
フォルダーを右クリックして「Marxdown で開く」を選ぶと、フォルダーごと開けます（Windows 11 では「その他のオプションを確認」の中にあります）。

### SmartScreen の警告が表示されたら

インストーラーにはコード署名をしていないため、初回の実行時に「Windows によって PC が保護されました」と表示されます。
「詳細情報」→「実行」の順に選ぶと、インストールを続けられます。

### WebView2 ランタイム

Windows 11 には標準で入っています。
入っていない環境（一部の Windows 10）では、インストール中に自動でダウンロードするため、インターネット接続が必要です。

### サイレントインストール

`/S` で確認を出さずにインストールします。
`/ADDTOPATH` を付けると、PATH にも追加します。
更新するときは、前回の選択を引き継ぎます。

```powershell
.\Marxdown_<バージョン>_x64-setup.exe /S /ADDTOPATH
```

## コマンドラインから開く

```bash
marxdown README.md                 # ファイルを開く
marxdown README.md CHANGELOG.md    # 複数のファイルをまとめて開く
marxdown docs/                     # フォルダーを開く
marxdown -m split notes.md         # 表示モードを指定して開く: preview | edit | split
llm "設計案を出して" | marxdown -   # 標準入力の内容を無題の文書として開く
```

cmd.exe / PowerShell / Git Bash のどこから実行しても、プロンプトはすぐに戻ります。
2 回目以降は、起動しているウィンドウにタブで開きます。

| オプション | 説明 |
| --- | --- |
| `-m`, `--mode <モード>` | 表示モードを指定して開く: `preview` / `edit` / `split` |
| `--background` | ウィンドウを表示せず、タスクトレイで起動する |
| `-` | 標準入力の内容を無題の文書として開く |
| `-h`, `--help` | ヘルプを表示する |
| `-V`, `--version` | バージョンを表示する |

標準入力から開いた文書は、まだファイルとして保存されていません。
残したいときは <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>（名前を付けて保存）で保存してください。

> [!WARNING]
> Windows PowerShell 5.1 からパイプで渡すと、ASCII 以外の文字が `?` に置き換わります（PowerShell の仕様です）。
> PowerShell 7.4 以降では起きません。

## 表示モード

| モード | 内容 | キー |
| --- | --- | --- |
| Preview | 読むための表示。起動したときはこのモードです | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> で Edit と切り替え |
| Edit | エディターだけを表示します | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> で Preview と切り替え |
| Split | エディターとプレビューを左右に並べます。スクロールは左右で連動します | <kbd>Ctrl</kbd>+<kbd>\\</kbd> |

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> を押すと、3 つのモードを順に切り替えます。

## タスクトレイでの待機

`✕` でウィンドウを閉じても、Marxdown はタスクトレイで待機しています。
次の `marxdown` がすぐに開くのはこのためです。
待機中は CPU をほとんど使いません。

完全に終了するには、<kbd>Ctrl</kbd>+<kbd>Q</kbd> を押すか、タスクトレイのメニューから「終了」を選んでください。
閉じたときに終了させたい場合は、設定の「閉じるときにタスクトレイに格納する」をオフにします。

## 更新

起動時とウィンドウを前面に出したときに、1 日 1 回まで GitHub の Releases に新しいバージョンを問い合わせます。
新しいバージョンがあるとアプリ内に通知が表示され、「更新して再起動」を押すとそのまま入れ替わります。

送られるのは通信そのもの（IP アドレスなど）だけで、開いているファイルの情報は含みません。
設定の「新しいバージョンを自動で確認する」で止められます。
止めていても、コマンドパレット（<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>）の「更新を確認」から確認できます。

## ファイルの場所

| ファイル | 場所 |
| --- | --- |
| 設定（`settings.json`） | `%APPDATA%\com.antimacho612.marxdown\settings.json` |
| 自作の配色 | `%APPDATA%\com.antimacho612.marxdown\themes\<名前>.css` |
| アプリ本体 | `%LOCALAPPDATA%\Marxdown` |

設定画面（<kbd>Ctrl</kbd>+<kbd>,</kbd>）の「settings.json を開く」から、設定ファイルを直接編集できます。
配色の置き場所は、設定画面の「themes フォルダーを開く」から開けます。

## アンインストール

「設定 > アプリ > インストールされているアプリ」から Marxdown をアンインストールします。
ファイルの関連付けと PATH は元に戻ります。
設定と最近開いたファイルの履歴も削除する場合は、アンインストール画面で「アプリのデータを削除」にチェックを入れてください。

## 困ったときは

不具合を見つけたら、メニューの「ヘルプ」→「不具合を報告」から Issue を作成してください。
バージョンと OS があらかじめ入力された状態で開きます。
脆弱性は公開の Issue ではなく、[SECURITY.md](https://github.com/antimacho612/marxdown/blob/main/SECURITY.md) の手順で報告してください。
