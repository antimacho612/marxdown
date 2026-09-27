/**
 * ヘルプだけが使う文言（F-OS-09）。
 *
 * `ja.ts` から分けてあるのは、使う側が遅延チャンク（`features/help/lazy/`）にだけあるためである（`ja-update.ts` と同じ理由）。
 * メニューとコマンドパレットに並ぶ項目名は `ja.menu` にある。
 */
export const jaHelp = {
  version: 'バージョン',
  /** 情報を取得できなかった欄。 */
  unknown: '不明',
  license: 'MIT ライセンスで公開しています。',
  copyInfo: '情報をコピー',
  infoCopied: 'バージョン情報をコピーしました',
  infoCopyFailed: 'バージョン情報をコピーできませんでした',
  openPageFailed: 'ページを開けませんでした',
  openLicenseFailed: 'ライセンスのファイルを開けませんでした',
};
