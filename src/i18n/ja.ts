/**
 * NOTE: 当面は日本語のみのため、i18n ライブラリは導入しない。
 * 将来的に必要になった時のために定数に集約しておく。
 * 表記の規則は `docs/conventions/02-ui-wording.md` にある。
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
    broken: 'settings.json を読み込めなかったため、既定の設定を使用しています',
    openFile: 'ファイルを開く',
    title: '設定',
    close: '設定を閉じる',
    readOnly: 'settings.json を読み込めないため、変更を保存できません。ファイルを修正してから設定を開き直してください',

    categories: {
      application: 'アプリケーション',
      preview: 'プレビュー',
      editor: 'エディター',
      markdown: '記法',
      explorer: 'エクスプローラー',
      outline: 'アウトライン',
    },

    sections: {
      font: 'フォント',
      display: '表示',
      input: '入力と移動',
    },

    theme: '外観',
    themeSystem: 'システム',
    themeLight: 'ライト',
    themeDark: 'ダーク',
    themeHint: 'ライトとダークを切り替えます。色の組み合わせは「配色」で、プレビューとエディターそれぞれに選べます。',

    palette: '配色',
    paletteHint: '組み込みの 50 種類と、themes フォルダーに置いた CSS ファイルから選べます。',
    paletteDefault: 'Marxdown',
    paletteGroups: {
      user: '追加した配色',
      both: 'ライト / ダーク両対応',
      light: 'ライト',
      dark: 'ダーク',
    },
    paletteMissing: (id: string) => `${id}（見つかりません）`,
    openThemes: 'themes フォルダーを開く',

    fontFamily: '本文のフォント',
    codeFontFamily: 'コードのフォント',
    fontFamilyHint: 'インストールされているフォントの名前を指定します。見つからない場合は既定のフォントで表示します。',
    fontFamilyPlaceholder: '既定のフォント',
    fontSize: { label: '文字サイズ', description: '文字の大きさを px で指定します。' },
    lineHeight: {
      label: '行間',
      description: '行の高さを、文字サイズに対する倍率で指定します。',
    },
    maxWidth: { label: '本文幅', description: '1 行に並ぶ文字数の上限を、半角文字の数で指定します。' },
    softBreak: {
      label: '段落内の改行を反映',
      description:
        '段落の中の改行を、そのまま改行として表示します。オフにすると、空行で区切るまでは 1 行につながります。',
    },
    tableStyle: {
      label: '表の罫線',
      description: '表の罫線の引き方を選びます。列が多い表は、格子や縞模様にすると行を目で追いやすくなります。',
      options: {
        lines: '横罫線のみ',
        grid: '格子',
        zebra: '縞模様',
      },
    },

    markdown: {
      abbreviations: {
        label: '略語',
        description: '「*[HTML]: HyperText Markup Language」の形で定義した語に、説明を表示します。',
      },
      definitionLists: {
        label: '定義リスト',
        description: '用語の次の行を「: 説明」で始めると、定義リストとして表示します。',
      },
      insertions: { label: '挿入', description: '「++文字++」を、挿入した文字として下線付きで表示します。' },
      marks: { label: 'マーカー', description: '「==文字==」を、蛍光ペンで塗ったように表示します。' },
      multilineTables: {
        label: '複数行の表',
        description: 'セルの中で改行できる表の書き方を使えるようにします。',
      },
      subscript: { label: '下付き文字', description: '「H~2~O」の「2」を下付きで表示します。' },
      superscript: { label: '上付き文字', description: '「x^2^」の「2」を上付きで表示します。' },
    },

    editor: {
      fontFamily: 'フォント名',
      fontSize: { label: '文字サイズ', description: '文字の大きさを px で指定します。' },
      lineHeight: {
        label: '行間',
        description: '行の高さを、文字サイズに対する倍率で指定します。',
      },
      letterSpacing: { label: '字間', description: '文字の間隔を px で指定します。' },
      fontLigatures: {
        label: '合字（リガチャ）',
        description:
          '「->」や「!=」などの文字の並びを、1 つの記号にまとめて表示します。対応するフォントでのみ有効です。',
      },
      lineNumbers: '行番号',
      lineNumbersOptions: {
        off: '表示しない',
        on: '表示する',
        relative: 'カーソルからの相対',
        interval: '10 行ごと',
      },
      renderWhitespace: '空白文字',
      renderWhitespaceOptions: {
        none: '表示しない',
        boundary: '単語の間以外',
        selection: '選択範囲だけ',
        trailing: '行末だけ',
        all: 'すべて',
      },
      renderControlCharacters: { label: '制御文字の表示', description: '制御文字を記号で表示します。' },
      renderLineHighlight: 'カーソル行の強調',
      renderLineHighlightOptions: {
        none: 'しない',
        gutter: '行番号だけ',
        line: '行全体',
        all: '両方',
      },
      guidesIndentation: { label: 'インデントガイド', description: 'インデントの位置に縦線を表示します。' },
      bracketPairColorization: {
        label: '括弧の色分け',
        description: '対応する括弧を、組ごとに色分けして表示します。',
      },
      minimap: { label: 'ミニマップ', description: 'エディターの右端に、文書全体の縮小図を表示します。' },
      stickyScroll: {
        label: '見出しの固定表示',
        description: 'スクロールしている間、いま読んでいる箇所の見出しをエディターの上端に表示し続けます。',
      },
      rulers: {
        label: '縦罫線',
        description:
          '指定した桁の位置に縦線を表示します。複数引くときはカンマで区切ります。線ごとの色は settings.json で指定できます。',
        placeholder: '例: 80, 100',
      },
      paddingTop: {
        label: '上の余白',
        description: 'エディターの上端と 1 行目の間の余白を px で指定します。',
      },

      wordWrap: '折り返し',
      wordWrapOptions: {
        off: '折り返さない',
        on: 'ウィンドウの幅で折り返す',
        wordWrapColumn: '指定した桁で折り返す',
        bounded: 'ウィンドウの幅と桁の狭いほう',
      },
      wordWrapColumn: { label: '折り返す桁', description: '折り返す位置を、半角文字の数で指定します。' },
      tabSize: { label: 'タブ幅', description: 'タブ 1 つの幅を、スペースの数で指定します。' },
      insertSpaces: {
        label: 'タブをスペースで入力',
        description: 'Tab キーを押したときに、タブ文字の代わりにスペースを入力します。',
      },
      wordSeparators: {
        label: '単語の区切り文字',
        description: '「Ctrl+←」「Ctrl+→」などで単語単位に移動するとき、区切りとして扱う文字を指定します。',
      },
      wordSegmenterLocales: {
        label: '単語分割の言語',
        description:
          '日本語のように単語の間に空白を入れない言語で、単語の区切りを判定するための言語を指定します。単語単位の移動と、ダブルクリックでの選択に使います。カンマで区切って複数指定できます。空欄にすると、区切り文字だけで判定します。',
        placeholder: '例: ja, zh-CN',
      },
      cursorStyle: 'カーソルの形',
      cursorStyleOptions: {
        line: '縦線',
        block: 'ブロック',
        underline: '下線',
        'line-thin': '細い縦線',
        'block-outline': 'ブロック（枠だけ）',
        'underline-thin': '細い下線',
      },
      cursorBlinking: 'カーソルの点滅',
      cursorBlinkingOptions: {
        blink: '点滅する',
        smooth: 'なめらかに点滅する',
        phase: 'フェードする',
        expand: '伸び縮みする',
        solid: '点滅しない',
      },
      cursorSurroundingLines: {
        label: 'カーソルの上下に残す行数',
        description: 'スクロールしたときに、カーソルの上下に最低限表示しておく行数を指定します。',
      },
      scrollBeyondLastLine: {
        label: '最終行より下へのスクロール',
        description: '最終行が画面の上端に来るまでスクロールできるようにします。',
      },
    },

    explorer: {
      exclude: {
        label: '除外するパス',
        description:
          'エクスプローラーと「ファイルへ移動」に表示しないパスを、glob パターン（* などのワイルドカード）で指定します。カンマで区切って複数指定できます。/ を含まないパターンは、どの階層にある同じ名前にも一致します。隠しファイルと node_modules は、この設定に関係なく表示しません。',
        placeholder: '例: dist, *.tmp, docs/generated',
      },
    },

    outline: {
      maxDepth: {
        label: '表示する見出しの階層',
        description:
          'アウトラインに表示する見出しの深さを、1〜6 で指定します。指定した階層より深い見出しは表示しません。',
      },
    },

    window: {
      closeToTray: {
        label: '閉じるときにタスクトレイに格納する',
        description: 'ウィンドウを閉じても終了せず、タスクトレイで動作し続けます。次に開くときにすぐ表示されます。',
      },
      launchAtLogin: {
        label: 'ログイン時にタスクトレイで起動する',
        description:
          'その日最初に開くときも、すぐに表示されます。「閉じるときにタスクトレイに格納する」がオンのときだけ有効です。',
      },
    },

    sampleHeading: '見出し',
    sampleBody: '本文とコードの見本',
    sampleList: 'リストの項目',

    defaultValue: (value: boolean) => `既定: ${value ? 'オン' : 'オフ'}`,
    reset: '既定に戻す',
    resetOf: (label: string) => `${label}を既定に戻す`,
    edit: 'settings.json を開く',
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
