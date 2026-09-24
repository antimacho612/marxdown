/**
 * NOTE: 当面は日本語のみのため、i18n ライブラリは導入しない。
 * 将来的に必要になった時のために定数に集約しておく。
 */

export const ja = {
  app: {
    name: 'Marxdown',
  },

  welcome: {
    title: 'Marxdown',
    newFile: '新規ファイル',
    openFile: 'ファイルを開く',
    openFolder: 'フォルダを開く',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    dropHint: 'ここに Markdown ファイルをドロップ',
    cliHint: 'ターミナルからは marxdown <file.md>',
  },

  tree: {
    title: 'エクスプローラー',
    loading: '読み込み中…',
    empty: 'このフォルダには何もありません',
    noRoot: 'まだフォルダを開いていません',
    openFolder: 'フォルダを開く',
    openCurrentFolder: '表示中のファイルがあるフォルダを開く',
    failed: 'ファイルツリーを読み込めませんでした',
    noMatch: '条件に一致するファイルがありません',
    toolbar: 'エクスプローラーの操作',
    /**
     * 文字ラベルを持たないトグルのツールチップ。
     * 読み上げ側は `aria-pressed` が伝えるため、状態を添えるのはツールチップだけにする。
     */
    toggleState: (label: string, on: boolean) => `${label}: ${on ? 'オン' : 'オフ'}`,
    markdownOnly: 'Markdown だけ表示',
    markdownOnlyOverridden: 'Markdown だけ表示: 拡張子フィルターが有効な間は適用されません',
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
    title: 'クイックオープン',
    placeholder: 'ファイル名で検索',
    noMatch: '一致するファイルがありません',
    empty: 'ファイルを開くと、その場所から検索できます',
    recent: '最近',
    /**
     * 上限で打ち切ったとき。全体を検索できていないことを伝える。\
     * `ファイルが多いため、先頭 ${count} 件だけを検索します`
     */
    truncated: (count: number) => `ファイルが多いため、先頭 ${count} 件だけを検索します`,
  },

  tab: {
    /** タブ全体の読み上げ名（`role="tablist"`）。 */
    list: '開いているファイル',
    /** パレットに並べるときの名前。キーだけでは何が起きるか分からない。 */
    next: '次のタブ',
    previous: '前のタブ',
    closeCurrent: 'タブを閉じる',
    reopen: '閉じたタブを開き直す',
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
    new: '新規ファイル',
    open: 'ファイルを開く',
    openFolder: 'フォルダを開く',
    /** 空の新しいウィンドウ（`Ctrl+Alt+N` / F-OPEN-06）。 */
    newWindow: '新しいウィンドウ',
    /** いま見ているタブを別ウィンドウへ移す（F-OPEN-06）。 */
    moveToNewWindow: '別ウィンドウで開く',
    /** サテライトのタブをメインウィンドウへ戻す（OQ-43）。 */
    moveToMainWindow: 'メインウィンドウに戻す',
    save: '保存',
    saveAs: '名前を付けて保存',
    toEdit: '編集する',
    toPreview: 'プレビューに戻る',
    toSplit: '左右に並べる',
    fromSplit: '分割をやめる',
    settings: '設定',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    reload: '再読み込み',
    toggleEol: '改行コードを切り替える',
    cycleMode: '表示モードを順に切り替える',
    gotoLine: '指定行へ移動',
    formatTable: '表の列幅を揃える',
    toggleScrollSync: 'スクロール同期を切り替える',
    showOutline: 'アウトラインへ移動',
    showExplorer: 'エクスプローラーへ移動',
    quickOpen: 'ファイルへ移動',
    zoom: '表示倍率',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: '等倍',
    search: 'プレビュー内を検索',
    find: '検索',
    replace: '置換',
    quit: '終了',
  },

  pane: {
    resizeRight: 'ライトペインの幅を変更',
    resizeLeft: 'レフトペインの幅を変更',
    showExplorer: 'エクスプローラーを表示',
    hideExplorer: 'エクスプローラーを隠す',
    showOutline: 'アウトラインを表示',
    hideOutline: 'アウトラインを隠す',
  },

  outline: {
    title: 'アウトライン',
    empty: '見出しがありません',
    emptyHint: '# で始まる行が見出しになります',
    filtered: 'この深さまでの見出しがありません',
    collapse: 'アウトラインを折りたたむ',
    expand: 'アウトラインを展開する',
    jump: '見出しへジャンプ',
    jumpPlaceholder: '見出しを検索',
    jumpNoMatch: '一致する見出しがありません',
  },

  history: {
    back: '戻る',
    forward: '進む',
  },

  /** 別ウィンドウで開く（F-OPEN-06）。 */
  window: {
    /** 本文を取り出せなかったタブ。保存済みならパスだけで移せるため、保存を促す（N-REL-01）。 */
    textUnavailable: '本文を取り出せませんでした。保存してから別ウィンドウで開いてください。',
    failed: '新しいウィンドウを開けませんでした',
    /** 移す先のウィンドウが見つからなかった（閉じた直後など）。タブは元のウィンドウに残る。 */
    moveFailed: 'タブを移せませんでした',
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
    conflict: '保存できませんでした: 別のプロセスが変更しています',
    overwrite: '上書き',
    reloadInstead: '再読み込み',
    dirtyLabel: '未保存の変更があります',
  },

  preview: {
    copy: 'コピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできません',
    copyLabel: 'コードブロックをコピー',
    imageOutOfScope: 'この画像は参照が許可されていない場所にあります',
    imageMissing: '画像が見つかりません',
    imageAllow: 'このフォルダの画像を許可',
    imageAllowHint: (dir: string) => `${dir} の直下だけを、アプリを終了するまで許可します`,
    imageAllowFailed: '許可できませんでした',
  },

  search: {
    label: 'プレビュー内を検索',
    placeholder: '検索',
    previous: '前を検索',
    next: '次を検索',
    close: '検索を閉じる',
    noMatch: '見つかりません',
    position: (index: number, total: number, truncated: boolean) =>
      `${index} / ${total.toLocaleString('ja-JP')}${truncated ? '+' : ''}`,
  },

  split: {
    resize: '分割の幅を変える',
    ratio: (percent: number) => `エディター ${percent}%`,
    syncOn: 'スクロール同期: ON',
    syncOff: 'スクロール同期: OFF',
    toggleSync: 'クリックでスクロール同期を切り替える',
  },

  link: {
    confirmOpen: (path: string) => `既定のアプリで開きますか: ${path}`,
    open: '開く',
    reveal: 'フォルダで表示',
    outOfScope: (path: string) => `参照が許可されていない場所です: ${path}`,
  },

  notice: {
    dismiss: '通知を閉じる',
  },

  editor: {
    pasteImageUntitled: '無題の文書には画像を貼り付けられません。先にファイルを保存してください。',
    pasteImageFailed: '画像を保存できませんでした',
  },

  settings: {
    broken: 'settings.json を読めませんでした。既定の設定で表示しています',
    openFile: 'ファイルを開く',
    title: '設定',
    close: '設定を閉じる',
    readOnly: 'settings.json を読めないため、変更を保存できません。ファイルを直してから開き直してください',

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

    theme: 'テーマ',
    themeSystem: 'システム',
    themeLight: 'ライト',
    themeDark: 'ダーク',
    themeHint: 'ライトとダークの切り替え。配色はプレビューとエディターで別々に選べる',

    palette: '配色',
    paletteHint: '組み込みの 50 種類と、themes フォルダーに置いた CSS から選ぶ',
    paletteDefault: 'Marxdown',
    paletteGroups: {
      user: '追加したもの',
      both: 'ライト / ダーク両対応',
      light: 'ライト',
      dark: 'ダーク',
    },
    paletteMissing: (id: string) => `${id}（見つかりません）`,
    openThemes: 'themes フォルダーを開く',

    fontFamily: '本文のフォント',
    codeFontFamily: 'コードのフォント',
    fontFamilyHint: 'OS に入っているフォント名。無いフォントを書いても既定のフォントに落ちる',
    fontFamilyPlaceholder: '既定のフォント',
    fontSize: { label: '文字サイズ', description: '文字サイズを制御します（単位: px）。' },
    lineHeight: {
      label: '行間',
      description: '行の高さを制御します（単位: px）。フォントサイズから行の高さを計算するには 0 を使用します。',
    },
    maxWidth: { label: '本文幅', description: '1 行に収まる半角文字の数を制御します（単位: ch）。' },
    softBreak: {
      label: 'ソフトブレーク',
      description: '段落内の単独の改行をそのまま <br> として描画するかどうかを制御します。',
    },
    tableStyle: {
      label: '表の罫線',
      description: '表の区切りの引き方を制御します。列が多い表では、格子や交互の塗りのほうが行を追いやすくなります。',
      options: {
        lines: '横罫線のみ',
        grid: '格子',
        zebra: '交互に塗る',
      },
    },

    markdown: {
      abbreviations: {
        label: '略語',
        description: '`*[HTML]: HyperText Markup Language` と定義した語に説明を付けます。',
      },
      definitionLists: {
        label: '定義リスト',
        description: '用語の次の行を `: 説明` で始めると定義リストになります。',
      },
      insertions: { label: '挿入', description: '`++文字++` を挿入（下線）として描画します。' },
      marks: { label: 'マーカー', description: '`==文字==` を蛍光ペンで引いたように描画します。' },
      multilineTables: {
        label: '複数行のテーブル',
        description: '1 つのセルの中で改行できるテーブル記法を有効にします。',
      },
      subscript: { label: '下付き文字', description: '`H~2~O` の `2` を下付きで描画します。' },
      superscript: { label: '上付き文字', description: '`x^2^` の `2` を上付きで描画します。' },
    },

    editor: {
      fontFamily: 'フォント名',
      fontSize: { label: '文字サイズ', description: '文字サイズを制御します（単位: px）。' },
      lineHeight: {
        label: '行間',
        description: '行の高さを制御します（単位: px）。フォントサイズから行の高さを計算するには 0 を使用します。',
      },
      letterSpacing: { label: '字間', description: '文字間隔を制御します（単位: px）' },
      fontLigatures: { label: 'リガチャ（合字）', description: 'フォント合字を有効にするかどうかを制御します。' },
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
      renderControlCharacters: { label: '制御文字の表示', description: '制御文字を表示するかどうかを制御します。' },
      renderLineHighlight: 'カーソル行の強調',
      renderLineHighlightOptions: {
        none: 'しない',
        gutter: '行番号だけ',
        line: '行全体',
        all: '両方',
      },
      guidesIndentation: { label: 'インデントガイド', description: 'インデントガイドを表示するかどうかを制御します。' },
      bracketPairColorization: {
        label: 'ブラケットペアの色付け',
        description: '対応する括弧を色分けするかどうかを制御します。',
      },
      minimap: { label: 'ミニマップ', description: 'ミニマップを表示するかどうかを制御します。' },
      rulers: {
        label: '縦罫線',
        description:
          '特定の等幅文字数の後に垂直ルーラーを表示します。複数のルーラーを引く場合は数値をカンマ区切りで指定します。ルーラーごとの色は settings.json で指定します。',
        placeholder: '例: 80, 100',
      },
      paddingTop: {
        label: '上の余白',
        description: 'エディターの上端と最初の行の間の余白の大きさを制御します（単位: px）。',
      },

      wordWrap: '折り返し',
      wordWrapOptions: {
        off: '折り返さない',
        on: 'ウィンドウの幅で折り返す',
        wordWrapColumn: '指定した桁で折り返す',
        bounded: 'ウィンドウの幅と桁の狭いほう',
      },
      wordWrapColumn: { label: '折り返す桁', description: '折り返し行を制御します。' },
      tabSize: { label: 'タブ幅', description: '1 つのタブに相当するスペースの数を制御します。' },
      insertSpaces: {
        label: 'タブをスペースで挿入',
        description: 'Tab キーを押したときにタブではなくスペースを挿入するかどうかを制御します。',
      },
      wordSeparators: {
        label: '単語の区切り文字',
        description: '「Ctrl+←」「Ctrl+→」などの単語単位のカーソル移動で、区切りとして扱う文字を指定します。',
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
        description: 'カーソル前後の表示可能な先頭の行 (最小 0) と末尾の行 (最小 1) の最小数を制御します（単位: 行）。',
      },
      scrollBeyondLastLine: {
        label: '最終行より下へのスクロール',
        description: '最後の行を超えてスクロールするかどうかを制御します。',
      },
    },

    explorer: {
      exclude: {
        label: '除外するパス',
        description:
          'エクスプローラーとクイックオープンに表示しないパスを glob パターンで指定します。カンマ区切りで複数指定できます。スラッシュを含まないパターンは、どの階層にある同じ名前にも一致します。隠しファイルと node_modules は、この設定に関わらず表示されません。',
        placeholder: '例: dist, *.tmp, docs/generated',
      },
    },

    outline: {
      maxDepth: {
        label: '表示する見出しの階層',
        description: 'アウトラインに表示する見出しの深さを制御します（h1〜h6）。それより深い見出しは一覧から外れます。',
      },
    },

    window: {
      closeToTray: {
        label: '✕ で閉じたときにタスクトレイに格納する',
        description: 'ウィンドウを閉じても終了せず、タスクトレイに常駐します。次に開くときの表示が速くなります。',
      },
    },

    sampleHeading: '見出し',
    sampleBody: '本文のサンプル。強調とコードが混ざる。',
    sampleList: 'リストの項目',

    unitPx: 'px',
    unitCh: 'ch',
    unitLines: '行',
    reset: '既定に戻す',
    resetOf: (label: string) => `${label}を既定に戻す`,
    edit: '設定（JSON）を開く',
    editHint: 'ここに無い項目は settings.json に直接書ける',
  },

  themes: {
    open: 'themes フォルダーを開く',
    unknown: '選ばれている配色が見つからないため適用していません',
    rejected: '配色を面の中に収められないため適用していません。} の対応を確認してください',
  },

  status: {
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' } as const,
    lines: (n: number) => `${n} 行`,
    bytes: (n: number) => `${formatBytes(n)}`,
    chars: (n: number) => `${n.toLocaleString('ja-JP')} 文字`,
    readingTime: (minutes: number) => `約 ${minutes} 分`,
    cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
    readonly: '読み取り専用',
    eolConvert: (next: string) => `クリックで ${next.toUpperCase()} に変換（保存時に書き戻す）`,
    encoding: {
      // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 画面に出す通り名であって、識別子ではない
      utf8: 'UTF-8',
      'utf16-le': 'UTF-16 LE',
      'utf16-be': 'UTF-16 BE',
      'shift-jis': 'Shift_JIS',
      'euc-jp': 'EUC-JP',
    } as const,
    encodingReinterpret: 'クリックでエンコーディングを選び直す（読み直す）',
    reinterpreted: (name: string) => `${name} として読み直しました`,
    modeSwitch: 'クリックで表示モードを切り替える',
    pathCopy: 'クリックでフルパスをコピーする',
    pathCopied: 'フルパスをコピーしました',
    pathCopyFailed: 'フルパスをコピーできませんでした',
    zoomSelect: 'クリックで表示倍率を変更する',
    parsedIn: (ms: number) => `パース ${ms.toFixed(1)}ms`,
    paintedIn: (ms: number) => `描画 ${ms.toFixed(1)}ms`,
  },

  error: {
    'not-found': (path: string) => `ファイルが見つかりません: ${path}`,
    removedFromRecent: '（最近開いたファイルの一覧から外しました）',
    'permission-denied': (path: string) => `アクセスが拒否されました: ${path}`,
    'out-of-scope': (path: string) => `許可されていない場所を参照しています: ${path}`,
    'too-large': (path: string) => `ファイルが大きすぎます: ${path}`,
    binary: (path: string) => `テキストではないため開けません: ${path}`,
    conflict: 'ファイルが外部で変更されています',
    'invalid-argument': (detail: string) => `引数を解釈できません: ${detail}`,
    'settings-broken': 'settings.json を読めないため、設定を保存できません',
    io: (detail: string) => `入出力エラー: ${detail}`,
    unknownArgs: (args: string[]) => `解釈できない引数: ${args.join(', ')}`,
    renderFailed: 'このファイルの表示に失敗しました。F5 で読み直せます',
  },
} as const;

/** バイト数を表示用の文字列にする。単位は B / KB / MB。 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
