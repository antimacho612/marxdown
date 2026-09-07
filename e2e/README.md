# E2E（WebdriverIO + tauri-driver）

**保存経路のためだけにある。**
[OQ-29](../docs/07.open-questions/oq-29-dx-investment.md) の推奨 A の範囲で、
[02.architecture > testing-strategy](../docs/02.architecture/12-testing-strategy.md) の「本数を絞る」に従う。

M2 で編集と保存が入ると、壊れたときの被害が「表示が崩れる」から
**「ユーザーのファイルが壊れる」**に変わる（N-REL-01）。
原子的書き込み・衝突検知・EOL/BOM の復元は、単体テストでは通しで検証できない。

| 層 | 見るもの |
| --- | --- |
| `cargo test`（`src-tauri/src/document/`） | `document::write` の正しさ。**バイト列の往復はここで固めてある** |
| **E2E（ここ）** | エディターの内容 → `WriteRequest` の組み立て → IPC → ディスクのバイト列 |

M2 Phase 3 で**キーの経路**が加わった。アプリのグローバルキーとエディターの
キーバインドが同じキーを取り合っていないことは、本物のキーイベントを流さないと確かめられない
（[03.ux-spec > keybindings §4](../docs/03.ux-spec/04-keybindings.md)）。

| spec | 見るもの |
| --- | --- |
| `smoke.e2e.ts` | 起動して本文が読める。開いただけでバイト列が変わらない |
| `mode.e2e.ts` | Preview ⇄ Edit（F-MODE-01, 02, 06, 07） |
| `save.e2e.ts` | 保存・CRLF/BOM の保持・衝突（F-EDIT-02, 14 / N-REL-01, 02） |
| `quit.e2e.ts` | 未保存のまま終了しようとしたとき（F-EDIT-03） |
| `edit.e2e.ts` | 行操作・検索・置換・キーの衝突・Markdown 書式（F-EDIT-04〜10） |
| `split.e2e.ts` | Split・スクロール同期・双方向ジャンプ・検索の振り分け（F-MODE-03, 05, 06） |
| `tabs.e2e.ts` | タブ（F-NAV-01, 02）。**argv 転送がタブを増やすこと**と、`Ctrl+W` / `Ctrl+Tab` の取り合い |

## メモリ計測だけは別（`pnpm e2e:memory`）

`memory.e2e.ts` は `pnpm e2e` では走らない（`wdio.conf.ts` の `exclude`）。
`wdio.memory.conf.ts` から `pnpm e2e:memory` で明示的に呼ぶ。

`huge.md` を描き切ってから `tiny.md` へ戻す往復を繰り返し、各点のメモリを記録する
（[OQ-18](../docs/07.open-questions/oq-18-memory-not-released.md) / M3 Phase 0）。
往復の回数は `MX_MEMORY_CYCLES`、CDP の利用有無は `MX_MEMORY_CDP` で変えられる。
結果は `docs/measurements/memory-oq18.json` に出る。

分けてあるのは、1 本で数分かかることと、WebView2 に `--enable-precise-memory-info` を渡した状態を
他の 43 本に持ち込まないためである。

> ⚠️ **合否は判定しない。この spec が固定するのは「同じ手順で測り直せること」だけである。**
> **数値の判定は手計測で行う**（[measurements > memory §2.3](../docs/measurements/06-memory.md)）。
> WebDriver を介した値は絶対値も増分も手計測と比較できない。

## エンジンの名前は 1 ファイルにしか書かない

エディターが吐く DOM を指すセレクタは `helpers/app.ts` の `EDITOR_DOM` に集めてある。
**spec からはエンジンの名前が読めない。**

[ADR-0009](../docs/adr/0009-editor-engine-monaco.md) で CodeMirror を Monaco へ
差し替えたとき、書き換えたのは `EDITOR_DOM` と、その下の薄い関数群だけで、
**spec の期待値は 1 つも動いていない。** 張り替えで分かった非自明な点は 3 つ。

| | |
| --- | --- |
| `.monaco-editor` は 2 つある | はみ出すウィジェットの受け皿が `document.body` 直下にも居る。**セレクタは `#mx-editor` の内側に閉じる** |
| 行の DOM の順は行の順ではない | Monaco は行の要素を使い回す。**`style.top` で並べ直す**（`editorText`） |
| エディターは `scrollTop` で動かない | 器は `overflow: hidden` で、スクロールは中身を上へずらして表す。**読むのは `.lines-content` の `top`、動かすのはキー** |

> **ネイティブのモーダルは WebDriver から押せない。**
> 未保存時の終了確認（`ask_then_quit`）と、別の文書へ移るときの確認
> （`confirm_discard`）はどちらもネイティブダイアログなので、
> **出るところまでしか見られない。** 押した先の分岐は単体テストの担当
> （`src/features/document/discard.dom.test.ts`）。

**CI では走らせない。** 実機が要り、環境ノイズも大きい
（[05.performance-budget > operations §5](../docs/05.performance-budget/05-operations.md) の起動時間・メモリと同じ扱い）。
`pnpm e2e` の手動実行と、マイルストーン完了時の実行にとどめる。

## 走らせる前に

> **バイナリの更新時刻を先に見ること。**
> `pnpm build:app` は**シェルによっては何もせずに終了コード 0 を返す**
> （[measurements > caveats §1](../docs/measurements/09-caveats.md)）。
> 古いバイナリのまま走らせると、新しく足したキーが「効かない」形で落ちる。
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

まず入っている WebView2 の版を見る。

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

> **`edgedriver` / `geckodriver` npm パッケージの postinstall は切ってある**
> （`pnpm-workspace.yaml` の `allowBuilds`）。
> あれは WebdriverIO が**ブラウザ**を driver する場合のもので、
> ここが操作するのは Tauri の WebView2 である。有効にすると、
> 使いもしないドライバを毎回ダウンロードしに行く。

### 3. アプリのビルド

```bash
pnpm build:app
```

**`cargo build --release` 単独では駄目。** `dist/` が古いまま埋め込まれ、起動が固まる
（[measurements > caveats](../docs/measurements/09-caveats.md)）。

## 走らせる

```bash
pnpm e2e
```

## 単一インスタンスに注意

Marxdown は**単一インスタンス**（[ADR-0004](../docs/adr/0004-process-model-and-cli.md)）で、
`✕` はプロセスを終わらせない（[ADR-0007](../docs/adr/0007-tray-residency.md)）。

つまり **Marxdown を普段使いで起動したままだと E2E は動かない。**
ドライバが立てた 2 つ目のプロセスは argv を転送して即座に終了し、
WebDriver からはセッションが張れなかったようにしか見えない。

`wdio.conf.ts` の `assertNoRunningInstance()` が先に検出して、その旨のエラーを出す。
出たらトレイから終了するか、次を実行する。

```powershell
taskkill /IM marxdown.exe /F
```

## 対象ファイルの渡し方

### `tauri:options.args` ではファイルパスを渡せない

**ドライバ側の制約。実測して確かめた（2026-08-30）。**

`tauri:options.args` は `ms:edgeOptions.args` へそのまま流れ、
msedgedriver が **Chromium のスイッチとして**解釈する。

| 渡したもの | argv に届いたもの |
| --- | --- |
| `['C:\work\doc.md']` | `--c:\work\doc.md`（`--` が前置され、小文字化される） |
| `['--']` | セッション生成が `argument is empty` で失敗 |

`cli.rs` を直しても解決しない。**この経路は使えない。**

### 代わりに argv 転送を使う

Marxdown は単一インスタンスで、2 回目以降の `marxdown foo.md` は
**新規プロセスを立てずに既存プロセスへ argv を転送する**（[ADR-0004](../docs/adr/0004-process-model-and-cli.md)）。
ドライバが起動した 1 つ目に対して、テストから 2 つ目を叩けばよい（`helpers/app.ts` の `forwardOpen`）。

テスト専用の裏口を製品コードに開けずに済むうえ、
**中心価値そのもの（Warm Start の経路）を毎回通ることになる。**

> 転送側のプロセスは**待たない**。シェルを掴んだまま終わらない既知の問題があり
> （[OQ-32](../docs/07.open-questions/oq-32-cli-holds-shell.md)）、終了を待つと E2E ごと止まる。
> 開けたかどうかは画面側で確かめる（`waitForDocument`）。

### 作業ファイル

`e2e/.work/doc.md` の 1 枚を `onPrepare` で作り直し、テストはその中身を入れ替えて使う
（`helpers/fixtures.ts`）。外部変更による保存衝突も、このファイルを
テストの途中で書き換えて起こす。

**照合は必ず `Buffer` で行う**（`readBytes` / `toBytes`）。
文字列で比べると、CRLF が LF に潰れたことも BOM が落ちたことも通ってしまう。
N-CMP-03 はそこを見る要件である。

## 依存の版について

WebdriverIO は **9.31.2 に固定**してある（`^` を付けていない）。
pnpm の `minimumReleaseAge`（供給網の待機ガード）を通る版だからで、
最新を指すと公開直後の版に当たって `minimumReleaseAgeExclude` で穴を開けることになる。

`@wdio/globals` だけ **9.31.3**。9.31.2 が公開されていない。
