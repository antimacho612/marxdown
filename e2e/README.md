# E2E（WebdriverIO + tauri-driver）

**実機のプロセス・キー配送・IPC を通さないと確かめられないものだけを置く。**
[02.architecture > testing-strategy](../docs/02.architecture/12-testing-strategy.md) の「本数を絞る」に従う。

中心は保存経路である。
編集と保存があるため、壊れたときの被害は「表示が崩れる」では済まず
**「ユーザーのファイルが壊れる」**になる（N-REL-01）。
原子的書き込み・衝突検知・EOL/BOM の復元は、単体テストでは通しで検証できない。

| 層 | 検証するもの |
| --- | --- |
| `cargo test`（`src-tauri/src/document/`） | `document::write` の正しさ。**バイト列の往復はここで検証する** |
| **E2E（ここ）** | エディターの内容 → `WriteRequest` の組み立て → IPC → ディスクのバイト列 |

もう 1 つは**キーの経路**である。
アプリのグローバルキーとエディターのキーバインドが同じキーを奪い合っていないことは、
実際のキーイベントを流さないと確かめられない
（[03.ux-spec > keybindings §4](../docs/03.ux-spec/04-keybindings.md)）。

| spec | 検証するもの |
| --- | --- |
| `smoke.e2e.ts` | 起動して本文が読める。開いただけでバイト列が変わらない |
| `mode.e2e.ts` | Preview ⇄ Edit（F-MODE-01, 02, 06, 07） |
| `save.e2e.ts` | 保存・CRLF/BOM の保持・衝突（F-EDIT-02, 14 / N-REL-01, 02） |
| `quit.e2e.ts` | 未保存のまま終了しようとしたとき（F-EDIT-03） |
| `edit.e2e.ts` | 行操作・検索・置換・キーの衝突・Markdown 書式（F-EDIT-04〜10） |
| `split.e2e.ts` | Split・スクロール同期・双方向ジャンプ・検索の振り分け（F-MODE-03, 05, 06） |
| `tabs.e2e.ts` | タブ（F-NAV-01, 02）。**argv 転送がタブを増やすこと**と、`Ctrl+W` / `Ctrl+Tab` の競合 |
| `satellite.e2e.ts` | タブをサテライトへ移しても、元のウィンドウの IPC と遅延チャンクの読み込みが止まらないこと（F-OPEN-06） |
| `session.e2e.ts` | 引数なしの起動で前回のタブが開き直されること（F-NAV-01） |
| `images.e2e.ts` | スコープ外の画像を許可する導線（N-SEC-05） |

## メモリ計測だけは別（`pnpm e2e:memory`）

`memory.e2e.ts` と `memory-tabs.e2e.ts` は `pnpm e2e` では実行されない（`wdio.conf.ts` の `exclude`）。
`wdio.memory.conf.ts` から `pnpm e2e:memory` で明示的に呼ぶ。

`huge.md` を描き切ってから `tiny.md` へ戻す往復を繰り返し、各点のメモリを記録する
（[measurements > memory](../docs/measurements/06-memory.md)）。
往復の回数は `MX_MEMORY_CYCLES`、CDP の利用有無は `MX_MEMORY_CDP` で変えられる。
結果は `design/measurements/memory-oq18.json` に出る。

分けてあるのは、1 本で数分かかることと、WebView2 に `--enable-precise-memory-info` を渡した状態を
他の spec に持ち込まないためである。

> ⚠️ **合否は判定しない。この spec が固定するのは「同じ手順で測り直せること」だけである。**
> **数値の判定は手計測で行う**（[measurements > memory §2.3](../docs/measurements/06-memory.md)）。
> WebDriver を介した値は絶対値も増分も手計測と比較できない。

## エンジンの名前は 1 ファイルにしか書かない

エディターが出力する DOM を指すセレクタは `helpers/app.ts` の `EDITOR_DOM` に集めてある。
**spec からはエンジンの名前が読めない。**

エンジンを差し替えるときに書き換えるのは `EDITOR_DOM` と、その下の薄い関数群だけで済む
（[ADR-0009](../docs/adr/0009-editor-engine-monaco.md)）。
Monaco の DOM で注意すべき点は 3 つある。

| | |
| --- | --- |
| `.monaco-editor` は 2 つある | はみ出すウィジェットの受け皿が `document.body` 直下にもある。**セレクタは `#mx-editor` の内側に閉じる** |
| 行の DOM の順は行の順ではない | Monaco は行の要素を使い回す。**`style.top` で並べ直す**（`editorText`） |
| エディターは `scrollTop` で動かない | コンテナは `overflow: hidden` で、スクロールは中身を上へずらして表す。**読むのは `.lines-content` の `top`、動かすのはキー** |

> **ネイティブのモーダルは WebDriver から押せない。**
> 未保存時の終了確認（`ask_then_quit`）と、別の文書へ移るときの確認
> （`confirm_discard`）はどちらもネイティブダイアログなので、
> **表示されるところまでしか検証できない。** 押した先の分岐は単体テストで検証する
> （`src/features/document/discard.dom.test.ts`）。

**CI では実行しない。** 実機が要り、環境ノイズも大きい
（[05.performance-budget > operations §5](../docs/05.performance-budget/05-operations.md) の起動時間・メモリと同じ扱い）。
`pnpm e2e` の手動実行と、マイルストーン完了時の実行にとどめる。

## 実行する前に

> **バイナリの更新時刻を先に確認すること。**
> `pnpm build`（= `tauri build`）は**シェルによっては何もせずに終了コード 0 を返す**
> （[measurements > caveats §1](../docs/measurements/09-caveats.md)）。
> 古いバイナリのまま実行すると、新しく追加したキーが「機能しない」形で失敗する。
>
> ```bash
> ls -l --time-style=+%H:%M src-tauri/target/release/marxdown.exe
> ```

### 1. `tauri-driver`

```bash
cargo install tauri-driver --locked
```

### 2. `msedgedriver`（**WebView2 ランタイムと版を揃える**）

ここが唯一の面倒なところ。版が食い違うとセッションが張れない。

まず入っている WebView2 の版を確認する。

```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}').pv
```

その版の driver を `e2e/.drivers/msedgedriver.exe` に置く。

```powershell
$v = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}').pv
New-Item -ItemType Directory -Force e2e\.drivers | Out-Null
Invoke-WebRequest "https://msedgedriver.microsoft.com/$v/edgedriver_win64.zip" -OutFile e2e\.drivers\d.zip
Expand-Archive e2e\.drivers\d.zip -DestinationPath e2e\.drivers -Force
Remove-Item e2e\.drivers\d.zip
```

`e2e/.drivers/` は Git 管理外。11MB あり、版は環境ごとに違う。

> **`edgedriver` / `geckodriver` npm パッケージの postinstall は無効にしてある**
> （`pnpm-workspace.yaml` の `allowBuilds`）。
> これは WebdriverIO が**ブラウザ**を操作する場合のもので、
> ここが操作するのは Tauri の WebView2 である。有効にすると、
> 使わないドライバを毎回ダウンロードする。

### 3. アプリのビルド

```bash
pnpm build
```

**`cargo build --release` 単独では不十分である。** `dist/` が古いまま埋め込まれ、起動が止まる
（[measurements > caveats](../docs/measurements/09-caveats.md)）。

## 実行する

```bash
pnpm e2e
```

## 単一インスタンスに注意

Marxdown は**単一インスタンス**（[ADR-0004](../docs/adr/0004-process-model-and-cli.md)）で、
`✕` はプロセスを終わらせない（[ADR-0007](../docs/adr/0007-tray-residency.md)）。

つまり **Marxdown を普段使いで起動したままだと E2E は動かない。**
ドライバが起動した 2 つ目のプロセスは argv を転送して即座に終了し、
WebDriver からはセッションが張れなかったようにしか見えない。

`wdio.conf.ts` の `assertNoRunningInstance()` が先に検出して、その旨のエラーを出す。
出たらトレイから終了するか、次を実行する。

```powershell
taskkill /IM marxdown.exe /F
```

## 対象ファイルの渡し方

### `tauri:options.args` ではファイルパスを渡せない

**ドライバ側の制約である。**

`tauri:options.args` は `ms:edgeOptions.args` へそのまま流れ、
msedgedriver が **Chromium のスイッチとして**解釈する。

| 渡したもの | argv に届いたもの |
| --- | --- |
| `['C:\work\doc.md']` | `--c:\work\doc.md`（`--` が前置され、小文字化される） |
| `['--']` | セッション生成が `argument is empty` で失敗 |

`cli.rs` を変更しても解決しない。**この経路は使えない。**

### 代わりに argv 転送を使う

Marxdown は単一インスタンスで、2 回目以降の `marxdown foo.md` は
**新規プロセスを起動せずに既存プロセスへ argv を転送する**（[ADR-0004](../docs/adr/0004-process-model-and-cli.md)）。
ドライバが起動した 1 つ目に対して、テストから 2 つ目を起動すればよい（`helpers/app.ts` の `forwardOpen`）。

テスト専用の裏口を製品コードに開けずに済むうえ、
**中心価値そのもの（Warm Start の経路）を毎回通ることになる。**

> 転送側のプロセスは**待たない**。シェルを保持したまま終わらない既知の問題があり
> （[OQ-32](../docs/07.open-questions/oq-32-cli-holds-shell.md)）、終了を待つと E2E ごと止まる。
> 開けたかどうかは画面側で確かめる（`openViaForward`）。

### 作業ファイル

`e2e/.work/doc.md` の 1 枚を spec ファイルごとに `beforeSession` で作り直し、テストはその中身を入れ替えて使う
（`helpers/fixtures.ts`）。外部変更による保存衝突も、このファイルを
テストの途中で書き換えて起こす。

**照合は必ず `Buffer` で行う**（`readBytes` / `toBytes`）。
文字列で比べると、CRLF が LF に変わったことも BOM が失われたことも通ってしまう。
N-CMP-03 はそこを検証する要件である。

### 前回のタブ（`state.json`）

**E2E のアプリは引数なしで立ち上がる。** つまりセッション復元
（[02.architecture > rust-responsibilities §5](../docs/02.architecture/04-rust-responsibilities.md)）が
毎回行われる条件で起動する。前の実行の記録が残っていると、**どの spec も 2 枚目のタブが
ある状態から始まる**。

そのため `beforeSession` で `state.json` の `session` を消し、復元を検証する spec
（`specs/session.e2e.ts`）にだけ用意する（`helpers/store.ts` / `helpers/session.ts`）。

**用意するのは `beforeSession` でなければならない。** 復元はアプリの起動時にしか行われず、
そのアプリはセッションを張った時点で既に立ち上がっている。spec の中では間に合わない。

## 依存の版について

WebdriverIO は **9.31.2 に固定**してある（`^` を付けていない）。
pnpm の `minimumReleaseAge`（供給網の待機ガード）を通る版だからで、
最新を指すと公開直後の版に当たって `minimumReleaseAgeExclude` で例外を追加することになる。

`@wdio/globals` だけ **9.31.3**。9.31.2 が公開されていない。
