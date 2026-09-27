/** 更新の通知だけが使う日本語の文言。`core.ts` と分けてある理由は `../update.ts` にある。 */
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
