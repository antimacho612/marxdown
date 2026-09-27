/**
 * 日本語の UI 文言。キーの構成はこのファイルが正であり、他の言語は `Messages` 型（`../types.ts`）でこれに合わせる。
 * 表記の規則は `design/conventions/02-ui-wording.md` にある。
 */

/** 対象（パスや名前）が分かっていれば `本文: 対象` の形にし、空なら本文だけを返す。 */
function withSubject(message: string, subject: string): string {
  return subject === '' ? message : `${message}: ${subject}`;
}

export const ja = {
  app: {
    name: 'Marxdown',
  },

  welcome: {
    title: 'Marxdown',
    newFile: '新しいファイル',
    openFile: 'ファイルを開く',
    openFolder: 'フォルダーを開く',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    dropHint: 'ここに Markdown ファイルをドロップしても開けます',
    cliHint: 'ターミナルから開く:',
  },

  tree: {
    title: 'エクスプローラー',
    loading: '読み込み中…',
    empty: 'このフォルダーは空です',
    noRoot: 'フォルダーが開かれていません',
    openFolder: 'フォルダーを開く',
    openCurrentFolder: '表示中のファイルがあるフォルダーを開く',
    failed: 'フォルダーの内容を読み込めませんでした',
    noMatch: '条件に一致するファイルがありません',
    toolbar: 'エクスプローラーの操作',
    /**
     * 文字ラベルを持たないトグルのツールチップ。
     * 読み上げ側は `aria-pressed` が伝えるため、状態を添えるのはツールチップだけにする。
     */
    toggleState: (label: string, on: boolean) => `${label}: ${on ? 'オン' : 'オフ'}`,
    markdownOnly: 'Markdown ファイルだけ表示',
    markdownOnlyOverridden: 'Markdown ファイルだけ表示: 拡張子で絞り込んでいる間は無効です',
    extensions: '拡張子で絞り込む',
    extensionsInput: '表示する拡張子',
    extensionsPlaceholder: 'md, txt, png',
  },

  palette: {
    title: 'コマンドパレット',
    placeholder: 'コマンドを検索',
    noMatch: '一致するコマンドがありません',
  },

  quickOpen: {
    title: 'ファイルへ移動',
    placeholder: 'ファイル名で検索',
    noMatch: '一致するファイルがありません',
    empty: 'ファイルかフォルダーを開くと、その中のファイルを検索できます',
    recent: '最近開いたファイル',
    /** 上限で打ち切ったとき。全体を検索できていないことを伝える。 */
    truncated: (count: number) => `ファイルが多いため、最初の ${count.toLocaleString('ja-JP')} 件だけを検索しています`,
  },

  tab: {
    /** タブ全体の読み上げ名（`role="tablist"`）。 */
    list: '開いているファイル',
    /** パレットに並べるときの名前。キーだけでは何が起きるか分からない。 */
    next: '次のタブ',
    previous: '前のタブ',
    closeCurrent: 'タブを閉じる',
    reopen: '閉じたタブを再度開く',
    /** タブを閉じる `✕`。読み上げと `title` に使う。 */
    close: (name: string) => `${name} を閉じる`,
    /** タブの右クリックメニュー。読み上げ名に使う。 */
    menu: (name: string) => `${name} の操作`,
  },

  titlebar: {
    menu: 'メニュー',
    untitled: '無題',
    minimize: '最小化',
    maximize: '最大化',
    restore: '元のサイズに戻す',
    close: '閉じる',
  },

  menu: {
    new: '新しいファイル',
    open: 'ファイルを開く',
    openFolder: 'フォルダーを開く',
    /** いま見ているタブを別ウィンドウへ移す（F-OPEN-06）。 */
    moveToNewWindow: '別ウィンドウで開く',
    /** サテライトのタブをメインウィンドウへ戻す（OQ-43）。 */
    moveToMainWindow: 'メインウィンドウに戻す',
    save: '保存',
    saveAs: '名前を付けて保存',
    /** 書き出し形式を並べるサブメニューの見出し（F-VIEW-18）。 */
    export: '書き出す',
    exportHtml: 'HTML として書き出す',
    exportPdf: 'PDF として書き出す',
    toEdit: '編集する',
    toPreview: 'プレビューに戻る',
    toSplit: '左右に並べる',
    fromSplit: '左右に並べるのをやめる',
    settings: '設定',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    reload: '再読み込み',
    toggleEol: '改行コードを切り替える',
    cycleMode: '表示モードを順に切り替える',
    gotoLine: '指定した行へ移動',
    formatTable: '表の列幅を揃える',
    toggleScrollSync: 'スクロール同期を切り替える',
    showOutline: 'アウトラインへ移動',
    showExplorer: 'エクスプローラーへ移動',
    explorerNewFile: 'エクスプローラー: 新しいファイル',
    explorerNewFolder: 'エクスプローラー: 新しいフォルダー',
    explorerRefresh: 'エクスプローラー: 最新の情報に更新',
    explorerCollapseAll: 'エクスプローラー: すべて折りたたむ',
    quickOpen: 'ファイルへ移動',
    zoom: '表示倍率',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: '100% に戻す',
    search: 'プレビュー内を検索',
    find: '検索',
    replace: '置換',
    quit: '終了',
    checkUpdate: '更新を確認',
  },

  pane: {
    resizeRight: 'アウトラインの幅を変更',
    resizeLeft: 'エクスプローラーの幅を変更',
    showExplorer: 'エクスプローラーを表示',
    hideExplorer: 'エクスプローラーを隠す',
    showOutline: 'アウトラインを表示',
    hideOutline: 'アウトラインを隠す',
  },

  outline: {
    title: 'アウトライン',
    empty: '見出しがありません',
    emptyHint: '# で始まる行が見出しになります',
    filtered: '表示する階層の見出しがありません',
    collapse: 'アウトラインを折りたたむ',
    expand: 'アウトラインを展開する',
    jump: '見出しへ移動',
    jumpPlaceholder: '見出しを検索',
    jumpNoMatch: '一致する見出しがありません',
  },

  history: {
    back: '戻る',
    forward: '進む',
  },

  /** 別ウィンドウで開く（F-OPEN-06）。 */
  window: {
    /** 本文を受け渡せなかったタブ。保存済みならパスだけで移せるため、保存を促す（N-REL-01）。 */
    textUnavailable: 'このタブは別ウィンドウに移せませんでした。保存してからもう一度お試しください',
    failed: '新しいウィンドウを開けませんでした',
    /** 移す先のウィンドウが見つからなかった（閉じた直後など）。タブは元のウィンドウに残る。 */
    moveFailed: 'タブを移動できませんでした',
  },

  open: {
    reloaded: '再読み込みしました',
    reloadedExternal: '外部の変更を読み込みました',
    changedExternally: 'ファイルが外部で変更されました',
    reloadAction: '再読み込み',
    ignoreAction: '無視',
  },

  save: {
    failed: '保存できませんでした',
    conflict: '保存できませんでした。ファイルが外部で変更されています',
    overwrite: '上書き保存',
    reloadInstead: '再読み込み',
    dirtyLabel: '未保存の変更があります',
  },

  preview: {
    copy: 'コピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできませんでした',
    copyLabel: 'コードをコピー',
    imageOutOfScope: '開いているフォルダーの外にある画像のため、表示していません',
    imageMissing: '画像が見つかりません',
    imageAllow: 'このフォルダーの画像を表示',
    imageAllowHint: (dir: string) =>
      `アプリを終了するまで、${dir} にある画像の表示を許可します（サブフォルダーは含みません）`,
    imageAllowFailed: '表示を許可できませんでした',
  },

  search: {
    label: 'プレビュー内を検索',
    placeholder: '検索',
    previous: '前を検索',
    next: '次を検索',
    close: '検索を閉じる',
    noMatch: '一致なし',
    position: (index: number, total: number, truncated: boolean) =>
      `${index} / ${total.toLocaleString('ja-JP')}${truncated ? '+' : ''}`,
  },

  split: {
    resize: 'エディターとプレビューの幅を変更',
    ratio: (percent: number) => `エディター ${percent}%`,
    syncOn: 'スクロール同期: オン',
    syncOff: 'スクロール同期: オフ',
    toggleSync: 'クリックでスクロール同期を切り替える',
  },

  link: {
    confirmOpen: (path: string) => `${path} を既定のアプリで開きますか？`,
    open: '開く',
    reveal: 'エクスプローラーで表示',
    outOfScope: (path: string) => `開いているフォルダーの外にあるため、開けません: ${path}`,
  },

  notice: {
    dismiss: '通知を閉じる',
  },

  editor: {
    pasteImageUntitled: '画像を貼り付けるには、先に文書を保存してください',
    pasteImageFailed: '画像を保存できませんでした',
  },

  settings: {
    /** 起動時の通知に使う。設定画面の文言は `settings.ts` にある。 */
    broken: 'settings.json を読み込めなかったため、既定の設定を使用しています',
    openFile: 'ファイルを開く',
  },

  themes: {
    open: 'themes フォルダーを開く',
    unknown: '選択中の配色が見つからないため、適用できません',
    rejected: '配色の CSS の { と } が対応していないため、適用できません',
  },

  export: {
    done: (path: string) => `書き出しました: ${path}`,
    reveal: 'エクスプローラーで表示',
    failed: (reason: string) => `書き出せませんでした: ${reason}`,
    marpUnsupported: 'Marp のスライドは書き出せません',
  },

  status: {
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' } as const,
    chars: (n: number) => `${n.toLocaleString('ja-JP')} 文字`,
    readingTime: (minutes: number) => `読了 約 ${minutes} 分`,
    cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
    readonly: '読み取り専用',
    eolConvert: (next: string) => `クリックで改行コードを ${next.toUpperCase()} に変更（保存時に反映）`,
    encoding: {
      // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 画面に出す通り名であって、識別子ではない
      utf8: 'UTF-8',
      'utf16-le': 'UTF-16 LE',
      'utf16-be': 'UTF-16 BE',
      'shift-jis': 'Shift_JIS',
      'euc-jp': 'EUC-JP',
    } as const,
    encodingReinterpret: 'クリックで文字コードを指定して開き直す',
    reinterpreted: (name: string) => `${name} で開き直しました`,
    modeSwitch: 'クリックで表示モードを切り替える',
    pathCopy: 'クリックでフルパスをコピー',
    pathCopied: 'フルパスをコピーしました',
    pathCopyFailed: 'フルパスをコピーできませんでした',
    zoomSelect: 'クリックで表示倍率を変更',
    parsedIn: (ms: number) => `パース ${ms.toFixed(1)}ms`,
    paintedIn: (ms: number) => `描画 ${ms.toFixed(1)}ms`,
  },

  /**
   * Rust の `CoreError` の `kind` ごとの文言（`describeOpenError` が引く）。
   * 対象のパスが分からない呼び出し元もあるため、空文字を渡されたら本文だけにする。
   */
  error: {
    'not-found': (path: string) => withSubject('ファイルが見つかりません', path),
    removedFromRecent: '（最近開いたファイルから削除しました）',
    'permission-denied': (path: string) => withSubject('アクセスが拒否されました', path),
    'out-of-scope': (path: string) => withSubject('開いているフォルダーの外にあるため、開けません', path),
    'too-large': (path: string) => withSubject('ファイルが大きすぎるため、開けません', path),
    binary: (path: string) => withSubject('テキストファイルではないため、開けません', path),
    conflict: 'ファイルが外部で変更されています',
    'already-exists': (path: string) => withSubject('同じ名前のファイルまたはフォルダーが既にあります', path),
    'invalid-argument': (path: string) => withSubject('この操作は実行できません', path),
    'settings-broken': 'settings.json を読み込めないため、設定を保存できません',
    io: (path: string) => withSubject('ファイルの読み書きに失敗しました', path),
    /** `kind` を持たない例外。内部の詳細（例外のメッセージ）は画面に出さない。 */
    unexpected: '予期しないエラーが発生しました',
    unknownArgs: (args: string[]) => `無効な引数を無視しました: ${args.join(', ')}`,
    renderFailed: 'このファイルを表示できませんでした。F5 キーで再読み込みできます',
  },
} as const;
