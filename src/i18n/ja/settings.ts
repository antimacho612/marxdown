/** 設定画面だけが使う日本語の文言。`core.ts` と分けてある理由は `../settings.ts` にある。 */
export const jaSettings = {
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
      description: '「->」や「!=」などの文字の並びを、1 つの記号にまとめて表示します。対応するフォントでのみ有効です。',
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

  marp: {
    themes: {
      label: 'Marp のテーマ',
      description:
        'スライドの theme: で選べるテーマを、CSS ファイルかフォルダーの絶対パスで指定します。カンマで区切って複数指定できます。',
      placeholder: '例: C:\\slides\\themes',
    },
  },

  explorer: {
    exclude: {
      label: '除外するパス',
      description:
        'エクスプローラーと「ファイルへ移動」に表示しないパスを、glob パターン（* などのワイルドカード）で指定します。カンマで区切って複数指定できます。/ を含まないパターンは、どの階層にある同じ名前にも一致します。隠しファイルと node_modules は、この設定に関係なく表示しません。',
      placeholder: '例: dist, *.tmp, docs/generated',
    },
    temporaryTab: {
      label: 'クリックしたファイルを仮タブで開く',
      description:
        '仮タブは名前が斜体で表示され、別のファイルをクリックすると置き換わります。編集するか、ダブルクリックすると通常のタブになります。',
    },
  },

  outline: {
    maxDepth: {
      label: '表示する見出しの階層',
      description:
        'アウトラインに表示する見出しの深さを、1〜6 で指定します。指定した階層より深い見出しは表示しません。',
    },
  },

  update: {
    autoCheck: {
      label: '新しいバージョンを自動で確認する',
      description: '起動時とウィンドウを前面に出したときに、1 日 1 回まで確認します。',
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
} as const;
