/**
 * Worker のスレッドを**先に立てる**（OQ-30）。
 *
 * # なぜ独立したモジュールなのか
 *
 * `new Worker()` から Worker のグローバルスコープが出来上がるまでに **32〜35ms** かかる。
 * これはチャンクのバイト数とは無関係で（取得 6ms / markdown-it 一式の評価 1ms に対し、
 * スレッドとスコープの生成だけで 35ms）、**呼ぶのが早いほど早く終わる**種類のコストである。
 *
 * `client.ts` の中で呼ぶと、bootstrap を読んで設定を当てた後まで始まらない。
 * これを `main.ts` の**最初の import** にすることで、`main` チャンクの評価が始まった
 * 直後にスレッドが立ち、以降（bootstrap の読み取り・設定の適用・シェルの描画）が
 * まるごとスレッドの起動に重なる。実測で T3→T8 が 112ms から 87〜95ms になる。
 *
 * **`main.ts` の import の並びを変えないこと。** ここが先頭にあることが仕様である。
 *
 * このファイルは `md-worker` の URL を解決して `new Worker()` を呼ぶ以外に何もしない。
 * 足した仕事は、そのまま「本文が読める」より前に評価されるコードになる。
 *
 * # 立てたものは 1 度しか渡さない
 *
 * `takeBootedWorker()` は 2 回目以降 `null` を返す。`dispose()`（M3 のタブを閉じる /
 * N-PERF-06）で `terminate()` された後に、死んだインスタンスを配らないため。
 * 2 つ目以降が要るときは `client.ts` が普通に `new Worker()` する。
 */
let booted: Worker | null = new Worker(new URL('./md-worker.ts', import.meta.url), {
  type: 'module',
  name: 'md-worker',
});

/** 立てておいた Worker を 1 度だけ引き渡す。2 回目以降は `null`。 */
export function takeBootedWorker(): Worker | null {
  const current = booted;
  booted = null;
  return current;
}
