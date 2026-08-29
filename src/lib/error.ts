/**
 * 例外を 1 行の文字列に落とす。
 *
 * Rust の `CoreError` は `{ kind, path, message }` の素のオブジェクトで届く。
 * `Error` にはならないので `e.message` を直接読めない経路がある。
 *
 * 種別ごとの日本語（「ファイルが見つかりません」など）に落とすのは
 * `describeOpenError`（`features/document/open.ts`）の担当で、ここは
 * **最後まで落ちてきたときの受け皿**である。
 */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
