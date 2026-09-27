/**
 * エクスポートの入口（F-VIEW-18）。
 *
 * 実体は `export` チャンクにあり、コマンドが実行されるまで読み込まない。
 */

/** 書き出す形式。 */
export type ExportFormat = 'html' | 'pdf';

/** 表示中の文書を書き出す。結果と失敗は通知バーで知らせる。 */
export async function exportLazily(format: ExportFormat): Promise<void> {
  const { exportDocument } = await import('./lazy/export');
  await exportDocument(format);
}
