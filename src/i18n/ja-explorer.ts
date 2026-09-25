/**
 * ファイルツリーのファイル操作だけが使う文言（ADR-0020）。
 *
 * `ja.ts` から分けてあるのは、使う側がすべて遅延チャンク（`features/workspace/lazy/`）にあるためである。
 * `ja.ts` は 1 つのオブジェクトとして `main` に入り、ツリーを開かない人の起動にも読み込まれる（05.performance-budget/05-operations.md §1）。
 * 置き場所は変えず、`src/i18n/` に集約する方針（OQ-11）は保つ。
 */
export const jaExplorer = {
  newFile: '新しいファイル',
  newFolder: '新しいフォルダー',
  refresh: '最新の情報に更新',
  collapseAll: 'すべて折りたたむ',
  nameInput: '名前',
  /** 行内の入力欄に出す、名前を確定できない理由（03.ux-spec/06-panes.md §1.4）。 */
  nameProblem: {
    empty: '名前を入力してください',
    chars: '使えない文字が含まれています（\\ / : * ? " < > |）',
    reserved: 'この名前は Windows で予約されています',
    trailing: '末尾に . や空白は使えません',
    dots: 'この名前は使えません',
    tooLong: '名前が長すぎます',
    exists: 'この場所に同じ名前があります',
  },
  menu: {
    label: (name: string) => `${name} の操作`,
    open: '開く',
    openSatellite: '別ウィンドウで開く',
    newFile: '新しいファイル…',
    newFolder: '新しいフォルダー…',
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
    copyPath: 'パスのコピー',
    copyRelativePath: '相対パスのコピー',
    copyLink: 'Markdown リンクとしてコピー',
    reveal: 'エクスプローラーで表示',
    rename: '名前の変更…',
    delete: '削除',
  },
  /** 削除の確認。件数と名前を出し、未保存のタブが含まれればそれも書く（§1.4）。 */
  confirmTrash: (names: string[], dirty: boolean) =>
    `${names.length === 1 ? `「${names[0] ?? ''}」` : `${names.length} 件の項目`}をゴミ箱へ移動しますか？` +
    (dirty ? '\n未保存の変更があるタブが含まれています。タブは開いたまま残ります。' : ''),
  confirmTrashButton: 'ゴミ箱へ移動',
  confirmMove: (names: string[], dest: string) =>
    `${names.length === 1 ? `「${names[0] ?? ''}」` : `${names.length} 件の項目`}を「${dest}」へ移動しますか？`,
  confirmMoveButton: '移動',
  trashed: (count: number) => `${count} 件をゴミ箱へ移動しました`,
  copied: (count: number) => `${count} 件を複製しました`,
  moved: (count: number) => `${count} 件を移動しました`,
  hiddenCreated: (name: string) => `「${name}」を作成しました。. で始まる名前はエクスプローラーに表示されません`,
  linkCopied: 'Markdown リンクをコピーしました',
  operationFailed: (detail: string) => `ファイル操作に失敗しました: ${detail}`,
} as const;
