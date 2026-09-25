# 開発ガイド

Marxdown をソースからビルド・開発するための手順。
使い方は [README](README.md) を、設計の全体は [`docs/`](docs/README.md)（Git Submodule）を参照。

## 必要なもの

- Node 24
- pnpm 12（npm / yarn ではない）
- Rust stable 1.80+

```bash
pnpm install
pnpm dev              # Tauri アプリを起動
```

## UI だけを速く回す

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

## コンポーネントの状態を並べて見る

```bash
pnpm storybook        # http://localhost:6006
```

通知バーの 3 段階も、履歴が空の Welcome も、実アプリでは特定の失敗を再現しないと見られない。
Storybook はそれを並べるためだけに入っている。

## 検査

```bash
pnpm check            # eslint + prettier --check + tsc --noEmit + svelte-check
pnpm fix              # eslint --fix + prettier --write
pnpm test             # Vitest
pnpm size             # バンドル予算のチェック
```

`tsc` は `.svelte` を読まないので、型チェックは `svelte-check` と 2 本立てになっている。

Rust 側は `src-tauri/` で `cargo fmt` / `cargo clippy --all-targets -- -D warnings` / `cargo test`。

## 計測

性能目標は [`docs/05.performance-budget/`](docs/05.performance-budget/README.md) にある。

```bash
pnpm fixtures                                  # bench/fixtures/ の基準ファイルを生成
pnpm bench                                     # Markdown パイプライン単体
pnpm build                                     # release ビルド（計測には必須）
pnpm bench:boot                                # Cold Start（T0〜T9 の中央値）
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

## ビルドしたものを自分で使う

```bash
pnpm build
```

`src-tauri/target/release/marxdown.exe` と、CLI シム（`src-tauri/target/release/bin/`）が出来る。
インストーラは `src-tauri/target/release/bundle/nsis/` に出来る。
**PATH に通すのは `bin` のほうである。**

```powershell
# PowerShell（ユーザー環境変数に追記。1 回だけ）
$bin = Resolve-Path .\src-tauri\target\release\bin
[Environment]::SetEnvironmentVariable(
  'Path',
  [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $bin,
  'User'
)
```

新しいターミナルを開くと `marxdown README.md` が通る。

> [!WARNING]
> `target\release` を直接通さないこと。
> そこにあるのは GUI の exe そのもので、cmd.exe と Git Bash は Marxdown を終了するまでプロンプトを返さない。
> `bin` のシムは起動を切り離してすぐに戻る。

> [!NOTE]
> release ビルドの出力を直接指しているのは意図的。
> インストーラを入れると、ビルドのたびに再インストールが要る。
> `pnpm build` の出力をそのまま指しておけば、ビルドし直すだけで次の起動から新しい版になる。
> インストール版と両方を PATH に入れると、先に書かれているほうが使われる。

2 回目以降の `marxdown foo.md` は新しいプロセスを立てず、常駐しているプロセスにパスを転送する（単一インスタンス / ADR-0004）。
ここが速さの中心なので、ドッグフーディングではウィンドウを閉じずに置いておくのが本来の使い方。

## 構成

```text
src/
  app/            起動シーケンス・アプリシェル・計測
  features/       document / preview / editor / …
  markdown/       markdown-it パイプライン・サニタイズ
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

1. **クリティカルパスを太らせない** — `main` + `shared` + `pipeline` + アプリの CSS の合計を 150KB (gzip) 以内に保つ。エディター・Mermaid・KaTeX・ハイライタはすべて遅延チャンク。
2. **Markdown テキストが唯一の真実** — AST も DOM も派生物で、テキストへ書き戻す経路を作らない。編集・保存で、触っていない箇所のバイト列を変えない。
3. **ドキュメント本体をリアクティブな状態に置かない** — 本文の DOM はコンポーネントツリーの外にある。
4. **Rust は速いことだけを担当する** — UI ロジックと Markdown の意味解釈は TypeScript 側。
