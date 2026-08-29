<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
  <img src="assets/logo-light.svg" alt="Marxdown" width="256" height="72" />
</picture>

速く開く Markdown ビューア / エディタ。

`marxdown README.md` と打ってから本文が読めるまでの時間を、**常に満たす前提条件** として設計している。
常駐した 2 回目以降は WebView の初期化を払わずに開く。

速さは目標ではなく予算である。
その内側で、読む・書く体験の質に投資する（[ADR-0008](docs/adr/0008-value-priority.md)）。

> **状態: M1.5（Shell & Settings）実装完了 / 動作検証中**
> 「読む」体験と、それを調整する手段は揃っている。
> 開く・描く・探す・拡大する・アウトラインで辿る・テーマとタイポグラフィを変える・トレイに常駐する。
> 編集・タブ・コマンドパレット・Mermaid は M2 以降。

## 何を解こうとしているか

LLM が Markdown を生成し、それをすぐ確認する。
この往復が 1 日に何十回も起きる。

VS Code は 2〜4 秒かかる。
1 ファイルを読むためだけに、ワークスペースと拡張機能が立ち上がる。
Marxdown はこのループのためだけに作る。

- **速く開く** — Cold Start ≤ 600ms、常駐中の Warm Start ≤ 120ms。**目標ではなく予算** として守る
- **Markdown が主役** — 見た目の既定値に投資する。読めることが機能である
- **調整できる** — 既定のまま完成しているが、テーマ・フォント・本文幅・カスタム CSS で自分に合わせられる
- **信頼できない入力を前提にする** — 自分が書いていないファイルを開くのが中心ユースケース

## 開発

Node 24 / pnpm 11 / Rust stable 1.80+ が要る。
パッケージマネージャは **pnpm**。

```bash
pnpm install
pnpm dev              # Tauri アプリを起動
```

### UI だけを速く回す

```bash
pnpm dev:web          # Vite のみ。Tauri を起動しない
```

Platform 層（`src/platform/`）がブラウザ用のモック実装を持っているため、UI の大部分は Tauri のビルドサイクルを待たずに開発できる。
起動時間・単一インスタンス・EOL/BOM の保持はこの経路では確認できない。

URL パラメータで挙動を切り替えられる。

| パラメータ | 効果 |
| --- | --- |
| `?welcome` | 引数なし起動（Welcome 画面）を再現する |
| `?file=<path>` | 仮想 FS 上のファイルを開く |
| `?spike=editor` | CodeMirror の参照実装画面（編集体験の確認用） |
| `?parse=main` | Worker を使わずメインスレッドでパース |

### コンポーネントの状態を並べて見る

```bash
pnpm storybook        # http://localhost:6006
```

通知バーの 3 段階も、履歴が空の Welcome も、実アプリでは特定の失敗を再現しないと見られない。
Storybook はそれを並べるためだけに入っている。

### 検査

```bash
pnpm check            # eslint + prettier --check + tsc --noEmit + svelte-check
pnpm fix              # eslint --fix + prettier --write
pnpm test             # Vitest
pnpm size             # バンドル予算のチェック
```

`tsc` は `.svelte` を読まないので、型チェックは `svelte-check` と 2 本立てになっている。

Rust 側は `src-tauri/` で `cargo fmt` / `cargo clippy --all-targets -- -D warnings` / `cargo test`。

### 計測

性能目標は [`docs/05.performance-budget/`](docs/05.performance-budget/README.md) にある。

```bash
pnpm fixtures                                  # bench/fixtures/ の基準ファイルを生成
pnpm bench                                     # Markdown パイプライン単体
pnpm build:app                                 # release ビルド（計測には必須）
pnpm bench:boot                                # Cold Start（T0〜T9 の中央値）
node scripts/bench-startup.mjs --sweep         # A/B（Worker / メインスレッド、描画方法）
node scripts/bench-startup.mjs --warm          # Warm Start（単一インスタンス）
pnpm analyze && node scripts/analyze-chunks.mjs  # バンドルの内訳
```

基準ファイルは Git に入れていない（`huge.md` 2MB / `extreme.md` 10MB）。
`scripts/gen-fixtures.mjs` がシード固定で生成するので、誰の環境でも同じ内容になる。

アプリ自身にも計測が仕込んである。

```bash
marxdown --trace-startup out.json README.md    # T0〜T9 を JSON に書き出す
marxdown --trace-startup nul README.md         # 計測はするが書き出さない
```

### 自分で使う

Marxdown の最初の目標は「作っている本人が毎日使う」こと。
そのためには **ターミナルから `marxdown foo.md` と打てる** 必要がある。

```bash
pnpm build:app
```

`src-tauri/target/release/marxdown.exe` が出来る。これを PATH に通す。

```powershell
# PowerShell（ユーザー環境変数に追記。1 回だけ）
$exe = Resolve-Path .\src-tauri\target\release
[Environment]::SetEnvironmentVariable(
  'Path',
  [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $exe,
  'User'
)
```

新しいターミナルを開くと `marxdown README.md` が通る。

> **release ビルドのパスを直接通している** のは意図的。
> インストーラ（`src-tauri/target/release/bundle/nsis/`）を入れると、ビルドのたびに再インストールが要る。
> `pnpm build:app` の出力をそのまま指しておけば、ビルドし直すだけで次の起動から新しい版になる。

2 回目以降の `marxdown foo.md` は新しいプロセスを立てず、常駐しているプロセスにパスを転送する（単一インスタンス / ADR-0004）。
ここが速さの中心なので、**ドッグフーディングではウィンドウを閉じずに置いておく** のが本来の使い方。

---

## 構成

```text
src/
  app/            起動シーケンス・アプリシェル・計測
  features/       document / preview / editor / …
  markdown/       markdown-it パイプライン・Worker・サニタイズ
  platform/       Tauri API の唯一の呼び出し口（テスト時は差し替え）
  styles/         デザイントークンとプレビューのタイポグラフィ
                  （コンポーネント固有の CSS は各 .svelte の <style> に同居）
src-tauri/src/
  cli.rs          CLI 引数解析
  bootstrap.rs    起動時の先読みと初期ペイロード
  document/       読み書き（エンコーディング / EOL / 原子的書き込み）
  scope.rs        パスのスコープ検証
  trace.rs        起動計測
```

守っている不変条件は 4 つ。

1. **クリティカルパスを太らせない。** `main` + `md-worker` の合計を 150KB (gzip) 以内に保つ。
   エディタ・Mermaid・KaTeX・ハイライタはすべて遅延チャンク。
2. **Markdown テキストが唯一の真実。** AST も DOM も派生物で、テキストへ書き戻す経路を作らない。
   編集・保存で、触っていない箇所のバイト列を変えない。
3. **ドキュメント本体をリアクティブな状態に置かない。** 本文の DOM はコンポーネントツリーの外にある。
4. **Rust は速いことだけを担当する。** UI ロジックと Markdown の意味解釈は TypeScript 側。

設計の全体は [`docs/`](docs/README.md) にある（Git Submodule）。

## ライセンス

未定。
