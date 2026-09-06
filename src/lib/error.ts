/**
 * 例外を 1 行の文字列に落とす。
 *
 * Rust の `CoreError` は `{ kind, path, message }` のプレーンなオブジェクトで届く。
 * `Error` にはならないため、`e.message` を直接読めない経路がある。
 *
 * 種別ごとの日本語（「ファイルが見つかりません」など）への変換は `describeOpenError`（`features/document/open.ts`）が担当する。
 * ここはどの分岐にも該当しなかった場合の受け皿である。
 */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
