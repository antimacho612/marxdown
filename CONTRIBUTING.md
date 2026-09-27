# 開発ガイド

Marxdown をソースからビルド・開発するための手順。
使い方は [README](README.md) を参照。

## 設計ドキュメント

要件・アーキテクチャ・ADR・実測値などの設計ドキュメントは、別の非公開リポジトリで管理している。
コードやコメントに出てくる `ADR-0009` / `OQ-36` / `F-EDIT-11` のような ID は、その中の文書を指す。
読めなくてもビルドと開発には支障がない。

`docs/` は利用者向けのドキュメントである。

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
| `?update` | 新しい版がある状態を再現する（更新の通知バー） |

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

バンドルの予算は [`.size-limit.json`](.size-limit.json) にあり、CI の `size-limit` が超過を検出する。
超えたときに上限を引き上げてはいけない。遅延チャンクへ追い出すか、依存を減らすか、機能を諦める。

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

## 変更履歴

利用者に見える変更は、PR の中で [`CHANGELOG.md`](CHANGELOG.md) の `## [Unreleased]` に書く。
Release の本文と、アプリの更新通知から開く「変更内容」はここから作られる。

- 見出しは `### 追加` / `### 変更` / `### 非推奨` / `### 削除` / `### 修正` / `### セキュリティ` を使う（[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)）
- 書くのは利用者から見た変化だけで、コミットの一覧ではない。`docs` / `refactor` / `test` / `chore` だけの変更は書かない
- 1 項目 1 行で、何ができるようになったか・何が直ったかを書く。設定のキーやショートカットは `` ` `` で囲む

## リリース

版の番号は `package.json` だけが持つ（`tauri.conf.json` はそれを参照し、`Cargo.toml` はスクリプトが合わせる）。
設計は ADR-0024 にある。

```bash
pnpm release bump 0.2.0      # 版を上げ、CHANGELOG の Unreleased を 0.2.0 の節にする
git diff                     # package.json / Cargo.toml / Cargo.lock / CHANGELOG.md を確かめる
git commit -am "chore(release): v0.2.0"
git tag v0.2.0
git push origin HEAD v0.2.0
```

タグを push すると [`release.yml`](.github/workflows/release.yml) がビルドし、**下書きの Release** を作る。
下書きのインストーラを手元で入れて確かめてから、GitHub で公開する。
公開した時点で `releases/latest/download/latest.json` が新しい版を指し、インストール済みのアプリに更新の通知が出る。

> [!WARNING]
> 公開した Release を後から差し替えない。
> 直すときは版を上げて出し直す。
> 同じ版の中身が変わると、既に更新した利用者と、これから更新する利用者で中身が食い違う。

### 署名鍵

updater の署名鍵（Tauri 独自の minisign 鍵。コード署名ではない）は 1 組だけで、次の場所にだけ置く。

| | 場所 |
| --- | --- |
| 公開鍵 | `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` |
| 秘密鍵とパスワード | GitHub の Secrets（`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）と、リポジトリの外のバックアップ |

**秘密鍵を失うと、既存の利用者に更新を届けられなくなる。**
公開鍵を差し替えた版は、利用者に手動で入れ直してもらうしかない。

手元のビルド（`pnpm build`）は updater の成果物を作らないため、秘密鍵は要らない。
リリースの CI だけが `src-tauri/tauri.release.conf.json` を重ねて署名する。

### 手元で更新を試す

自動の確認は release ビルドでだけ動く（開発ビルドでは公開版を毎回見つけてしまうため）。
コマンドパレットの「更新を確認」は開発ビルドでも動く。
ブラウザだけで通知バーを見るときは `pnpm dev:web` の URL に `?update` を付ける。

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
