/**
 * 更新の通知だけが使う文言（ADR-0024 / 03.ux-spec/07-status-and-notifications.md §2）。
 *
 * `ja.ts` から分けてあるのは、使う側が遅延チャンク（`features/update/lazy/`）にだけあるためである（`ja-explorer.ts` と同じ理由）。
 * 更新が見つかるのは多くても 1 日 1 回であり、起動のたびに読み込む理由が無い。
 */
export const jaUpdate = {
  available: (version: string) => `Marxdown ${version} を利用できます`,
  install: '更新して再起動',
  notes: '変更内容',
  downloading: '更新をダウンロードしています…',
  dirty: '保存していない変更があります。保存してから更新してください',
  upToDate: 'Marxdown は最新です',
  checkFailed: '更新を確認できませんでした。ネットワークの接続を確認してください',
  installFailed: '更新できませんでした。時間をおいてもう一度お試しください',
};
