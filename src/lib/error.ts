/**
 * 例外を 1 行の文字列にする。
 *
 * Rust の `CoreError` は `{ kind, path, message }` のプレーンなオブジェクトで届く。
 * `Error` にはならないため、`e.message` を直接読めない経路がある。
 *
 * 開発者向けの記録（`debug.lastError` など）に使う。
 * 画面に出す文言は `describeOpenError`（`features/document/open.ts`）が `kind` から作る。
 */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
