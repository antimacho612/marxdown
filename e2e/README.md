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
| **E2E（ここ）** | エディタの内容 → `WriteRequest` の組み立て → IPC → ディスクのバイト列 |

**CI では走らせない。** 実機が要り、環境ノイズも大きい
（[05.performance-budget > operations §5](../docs/05.performance-budget/05-operations.md) の起動時間・メモリと同じ扱い）。
`pnpm e2e` の手動実行と、マイルストーン完了時の実行にとどめる。

## 走らせる前に

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
