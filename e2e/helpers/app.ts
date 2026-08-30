/**
 * アプリの場所と、**開いているインスタンスにファイルを開かせる手段**。
 *
 * # なぜ argv で渡さないのか
 *
 * `tauri:options.args` は `ms:edgeOptions.args` へそのまま流れ、
 * msedgedriver が **Chromium のスイッチとして**解釈する。実測（2026-08-30）:
 *
 * ```text
 * args: ['C:\work\doc.md']  → argv に "--c:\work\doc.md"（`--` 前置 + 小文字化）
 * args: ['--']                → セッション生成が "argument is empty" で失敗
 * ```
 *
 * つまり**この経路でファイルパスは渡せない**。ドライバ側の制約であり、
 * `cli.rs` を変えても解決しない。
 *
 * # 代わりに argv 転送を使う
 *
 * Marxdown は単一インスタンス（[ADR-0004](../../docs/adr/0004-process-model-and-cli.md)）で、
 * 2 回目以降の `marxdown foo.md` は**新規プロセスを立てずに既存プロセスへ argv を転送する**。
 * ドライバが起動した 1 つ目に対して、テストから 2 つ目を叩けばよい。
 *
 * テスト専用の裏口を製品コードに開けずに済むうえ、
 * **中心価値そのもの（Warm Start の経路）を毎回通ることになる。**
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * テスト対象の実行ファイル。
 *
 * **`pnpm build:app` で作ったものを使う。** `cargo build --release` 単独だと
 * `dist/` が古いまま埋め込まれ、起動が固まる（measurements/09-caveats.md）。
 */
export const APP = path.resolve(here, '..', '..', 'src-tauri', 'target', 'release', 'marxdown.exe');

/**
 * 起動中のインスタンスに `target` を開かせる。**低レベル。** 普段は `openViaForward` を使う。
 *
 * **待たない。** 転送側のプロセスがシェルを掴んだまま終わらない既知の問題があり
 * （[OQ-32](../../docs/07.open-questions/oq-32-cli-holds-shell.md)）、
 * 終了を待つと E2E ごと止まる。開けたかどうかは画面側で確かめる。
 */
export function forwardOpen(target: string): void {
  const child = spawn(APP, [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

/** シェル（ステータスバー）が描かれるまで待つ。転送を投げてよい最低条件。 */
async function waitForShell(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => document.querySelector('.mx-statusbar') !== null), {
    timeout: 30_000,
    interval: 100,
    timeoutMsg: 'シェルが描かれなかった',
  });
}

/** 本文に `expected` が現れたか。現れなければ false を返す（投げない）。 */
async function documentAppeared(expected: string, timeout: number): Promise<boolean> {
  try {
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.querySelector('#mx-preview .mx-content')?.textContent ?? '');
        return text.includes(expected);
      },
      { timeout, interval: 200 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * argv 転送でファイルを開き、本文が描かれるまで待つ。
 *
 * # 再送する理由
 *
 * **転送は取りこぼされうる。** `bootstrap.ts` が `onOpenRequest` を購読するのは
 * `ready()` の**後**で、それより前に届いた転送は聞く相手が居ないまま捨てられる。
 * シェルの描画（`waitForShell`）は `ready()` の手前なので、待っても十分ではない。
 *
 * 製品としては問題にならない。人が 2 つ目を叩くのは 1 つ目が画面に出た後だからで、
 * ここだけが**起動から数十 ms のうちに転送を投げる**特殊な使い方になる。
 * 製品側に順序の保証を足すより、テスト側で再送するほうが釣り合う。
 */
export async function openViaForward(target: string, expected: string): Promise<void> {
  await waitForShell();

  for (let attempt = 1; attempt <= 3; attempt++) {
    forwardOpen(target);
    if (await documentAppeared(expected, 10_000)) return;
  }

  throw new Error(`argv 転送で "${target}" が開かなかった（3 回試行）`);
}
