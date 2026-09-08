/**
 * UI 文言。
 *
 * i18n ライブラリは導入しない（04.tech-stack/05-frontend.md §1 / OQ-11）。
 * 当面は日本語のみだが、文言を定数に集約しておくことで、将来の抽出をコード変更なしに行えるようにしておく。
 */

/** UI 文言の全体。 */
export const ja = {
  app: {
    name: 'Marxdown',
  },
  /**
   * Welcome 画面（03.ux-spec/08-empty-states.md §1）。
   *
   * チュートリアルもツアーも表示しない。ショートカットの併記だけで操作を伝える。
   * 「フォルダを開く」（M3）は未実装であるため並べない。
   * 押せない項目を並べるのは Principle 3「Simple Means Low Cognitive Load」に反する。
   */
  welcome: {
    title: 'Marxdown',
    newFile: '新規ファイル',
    openFile: 'ファイルを開く',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    dropHint: 'ここに Markdown ファイルをドロップ',
    cliHint: 'ターミナルからは marxdown <file.md>',
  },
  /**
   * カスタムタイトルバー（03.ux-spec/01-screen-layout.md §1）。
   *
   * ウィンドウ操作ボタンには文字を表示せず、アイコンだけを表示する。
   * ここにあるのはすべてスクリーンリーダー向けの名前とツールチップであり、Windows の標準タイトルバーが読み上げる文言に合わせてある。
   */
  /** ファイルツリー（F-NAV-03 / レフトペイン）。 */
  tree: {
    loading: '読み込み中…',
    empty: 'このフォルダには何もありません',
    /** 何も開いていないとき。基点が決まらない。 */
    noRoot: 'ファイルを開くと、その場所が表示されます',
    failed: 'ファイルツリーを読み込めませんでした',
  },
  /**
   * コマンドパレット（`Ctrl+Shift+P` / F-NAV-06）。
   *
   * すべての機能への到達手段であり、ここの文言がそのまま機能の名前になる。
   */
  palette: {
    title: 'コマンドパレット',
    placeholder: 'コマンドを検索',
    noMatch: '一致するコマンドがありません',
  },
  /**
   * クイックオープン（`Ctrl+P` / F-NAV-05）。
   *
   * 並びは「最近開いたファイル → フォルダ内 Markdown」である（03.ux-spec/05-command-palette.md）。
   */
  quickOpen: {
    title: 'クイックオープン',
    placeholder: 'ファイル名で検索',
    noMatch: '一致するファイルがありません',
    /** 基点が無く、最近開いたファイルも無い。 */
    empty: 'ファイルを開くと、その場所から検索できます',
    /** 最近開いたファイルであることの目印。右端に出す。 */
    recent: '最近',
    /** 上限で打ち切ったとき。全体を検索できていないことを伝える。 */
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
  },
  titlebar: {
    menu: 'メニュー',
    /**
     * まだ一度も保存していない文書の名前（`Ctrl+N` / `features/document/new.ts`）。
     *
     * ファイル名の位置に表示する。
     * 「無題」は名前であって状態の説明ではないため、未保存の印（`●`）とは別のものであり、両方が同時に表示される。
     */
    untitled: '無題',
    minimize: '最小化',
    maximize: '最大化',
    restore: '元のサイズに戻す',
    close: '閉じる',
  },
  /**
   * ハンバーガーメニュー（03.ux-spec/01-screen-layout.md §3「初学者の逃げ道」）。
   *
   * メニューバーを置かないという決定の代わりに、タイトルバー左端に 1 つだけ配置する。
   * 並べるのは、その時点で実行できる項目だけである。
   */
  menu: {
    new: '新規ファイル',
    open: 'ファイルを開く',
    save: '保存',
    saveAs: '名前を付けて保存',
    /**
     * モードの切り替え（F-MODE-06）。ラベルには切り替え先を表示する。
     * 現在が Preview なら「編集」、Edit なら「プレビュー」となり、操作の結果を事前に判断できる。
     */
    toEdit: '編集する',
    toPreview: 'プレビューに戻る',
    /** Split（F-MODE-03 / 03.ux-spec/03-split-mode.md）。ラベルは行き先を言う。 */
    toSplit: '左右に並べる',
    fromSplit: '分割をやめる',
    settings: '設定',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    reload: '再読み込み',
    /** ステータスバーの `LF` / `CRLF` と同じ操作（F-EDIT-14）。 */
    toggleEol: '改行コードを切り替える',
    /** 表示モードの順送り（`Ctrl+Shift+M`）。トグル 2 つとは別の操作である。 */
    cycleMode: '表示モードを順に切り替える',
    /** 指定行へ移動（`Ctrl+G`）。**編集面があるときだけ**（Preview には行番号が無い）。 */
    gotoLine: '指定行へ移動',
    /** スクロール同期（Split のときだけ意味を持つ）。 */
    toggleScrollSync: 'スクロール同期を切り替える',
    /** アウトラインを表示してフォーカスする（閉じない）。 */
    showOutline: 'アウトラインへ移動',
    /** ファイルツリーを表示してフォーカスする（閉じない）。 */
    showExplorer: 'エクスプローラーへ移動',
    /** クイックオープン（`Ctrl+P`）。「ファイルを開く」はダイアログのほうが使っている。 */
    quickOpen: 'ファイルへ移動',
    zoom: '表示倍率',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: '等倍',
    /**
     * 検索（F-VIEW-10 / F-EDIT-05）。ラベルには検索対象を表示する。
     * Preview では本文の DOM を、Edit ではエディターのテキストを検索する（`features/mode/find.ts`）。
     * 同じ `Ctrl+F` でも対象が異なるため、名前を分ける。
     */
    search: 'プレビュー内を検索',
    find: '検索',
    replace: '置換',
    /**
     * 終了（ADR-0007 論点 3）。
     *
     * `✕` はトレイ格納の意味になったため、「閉じる」とは別の語が必要になる。
     * 「Marxdown を終了」ではなく「終了」としているのは、トレイメニュー（OS 側）と違い、ここが既にアプリの内部であるためである。
     */
    quit: '終了',
  },
  /**
   * ペイン（03.ux-spec/06-panes.md）。
   *
   * ペインそのものには見出しを表示しない（中身が自身の見出しを持つ）。
   * ここにあるのは、ドラッグ領域とメニュー項目の名前だけである。
   */
  pane: {
    resizeRight: 'ライトペインの幅を変更',
    resizeLeft: 'レフトペインの幅を変更',
    /** レフトペイン（Explorer / F-NAV-03）。中身は Phase 5b。 */
    showExplorer: 'エクスプローラーを表示',
    hideExplorer: 'エクスプローラーを隠す',
    showOutline: 'アウトラインを表示',
    hideOutline: 'アウトラインを隠す',
  },
  /**
   * アウトライン（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
   *
   * 空であることを明示するのが 03.ux-spec/06-panes.md §2 の要求である。
   * 読み込み中と受け取られないよう、何が無いのかを明示し、見出しを書けば表示されることを添える。
   */
  outline: {
    title: 'アウトライン',
    empty: '見出しがありません',
    emptyHint: '# で始まる行が見出しになります',
    collapse: 'アウトラインを折りたたむ',
    expand: 'アウトラインを展開する',
    jump: '見出しへジャンプ',
    jumpPlaceholder: '見出しを検索',
    jumpNoMatch: '一致する見出しがありません',
  },
  /** 戻る / 進む（F-NAV-07）。 */
  history: {
    back: '戻る',
    forward: '進む',
  },
  open: {
    reloaded: '再読み込みしました',
    /**
     * 外部変更を自動で読み込んだとき（03.ux-spec/07-status-and-notifications.md §2 の 1 行目）。
     * 自分では何もしていないので、何が起きたかを先に言う。
     */
    reloadedExternal: '外部の変更を読み込みました',
    /**
     * 編集中に外部で変更されたとき（03.ux-spec/07-status-and-notifications.md §2 の「選択」）。
     *
     * ダーティなら確認せずに読み直さない（02.architecture/08-state-management.md §3）。
     * 読み直すと未保存の編集が失われるため、ユーザーに選択させる。
     */
    changedExternally: 'ファイルが外部で変更されました',
    reloadAction: '再読み込み',
    ignoreAction: '無視',
  },
  /** 保存（F-EDIT-02, 03 / 03.ux-spec/07-status-and-notifications.md §2）。 */
  save: {
    failed: '保存できませんでした',
    /** §2 の「警告」の文面。消えない通知として出す。*/
    conflict: '保存できませんでした: 別のプロセスが変更しています',
    overwrite: '上書き',
    /** 押すと編集内容が失われる。押すまでは何も起きない。*/
    reloadInstead: '再読み込み',
    /** タイトルバーの `●`（§1）。読み上げのために文言を持たせる。 */
    dirtyLabel: '未保存の変更があります',
  },
  preview: {
    copy: 'コピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできません',
    copyLabel: 'コードブロックをコピー',
    imageOutOfScope: 'この画像は参照が許可されていない場所にあります',
    imageMissing: '画像が見つかりません',
    /**
     * スコープ外の画像を許可するボタン（OQ-17）。
     *
     * 何が起きるかを文言で言い切る。「許可する」だけだと、どこまで開くのかが読み取れない。
     */
    imageAllow: 'このフォルダの画像を許可',
    imageAllowHint: (dir: string) => `${dir} の直下だけを、アプリを終了するまで許可します`,
    imageAllowFailed: '許可できませんでした',
  },
  /** プレビュー内検索（F-VIEW-10）。 */
  search: {
    label: 'プレビュー内を検索',
    placeholder: '検索',
    previous: '前を検索',
    next: '次を検索',
    close: '検索を閉じる',
    noMatch: '見つかりません',
    /** `truncated` は上限で打ち切った場合。黙って切らずに `+` を付けて示す。 */
    position: (index: number, total: number, truncated: boolean) =>
      `${index} / ${total.toLocaleString('ja-JP')}${truncated ? '+' : ''}`,
  },
  /*
   * エディター自身が出力する文言（検索・置換パネルなど）は Monaco が日本語を同梱しているため、ここには置かない
   * （`features/editor/lazy/monaco.ts` が `nls/lang/ja.js` を読み込む）。
   *
   * CodeMirror では `EditorState.phrases` に原文と日本語の対応表を自前で持っていたが、[ADR-0009](../../docs/adr/0009-editor-engine-monaco.md) により不要になった。
   */
  /** Split（F-MODE-03, 05 / 03.ux-spec/03-split-mode.md）。 */
  split: {
    resize: '分割の幅を変える',
    ratio: (percent: number) => `エディター ${percent}%`,
    /**
     * スクロール同期（§2）。ラベルは現在の状態を、ツールチップは操作の結果を示す。
     * アイコンだけでは、現在有効なのか押すと有効になるのかを判別できない。
     */
    syncOn: 'スクロール同期: ON',
    syncOff: 'スクロール同期: OFF',
    toggleSync: 'クリックでスクロール同期を切り替える',
  },
  /** リンククリックの分岐（02.architecture/09-security.md §2）。 */
  link: {
    confirmOpen: (path: string) => `既定のアプリで開きますか: ${path}`,
    open: '開く',
    reveal: 'フォルダで表示',
    outOfScope: (path: string) => `参照が許可されていない場所です: ${path}`,
  },
  notice: {
    dismiss: '通知を閉じる',
  },
  /**
   * ユーザー設定（02.architecture/04-rust-responsibilities.md §5 / 03.ux-spec/07-status-and-notifications.md §2）。
   *
   * 「読めませんでした」に留めるのは、既定値で動作していることと、ファイルを上書きしていないことの両方を 1 行に収めるためである。
   * 原因（何行目が壊れているか）はエディター側で確認できる。
   */
  settings: {
    broken: 'settings.json を読めませんでした。既定の設定で表示しています',
    openFile: 'ファイルを開く',

    /*
     * 設定 UI（F-CONF-05 / ADR-0011）。
     *
     * セットアップではなく調整のための画面である（03.ux-spec/README.md §1「Defaults Matter」）。
     * 説明文は項目ごとには付けない。
     * 既定値のままで完成していることが前提であり、補足が必要なのは、指定しても反映されない場合があるものと、単位が自明でないものだけである。
     *
     * ラベルは VS Code のキー名の直訳にしない。
     * `settings.json` を読み書きする場合はキー名がそのまま見えているため（F-CONF-06）、GUI 側は日本語として読める語を選ぶ。
     */
    title: '設定',
    close: '設定を閉じる',
    /** 壊れている間は保存を試みない。理由をここに出して入力欄を止める（02.architecture/04-rust-responsibilities.md §5）。*/
    readOnly: 'settings.json を読めないため、変更を保存できません。ファイルを直してから開き直してください',

    /** 左のカテゴリ（ADR-0011）。並びは「触る頻度」ではなく「対象の大きさ」順。*/
    categories: {
      appearance: '外観',
      preview: 'プレビュー',
      editor: 'エディター',
      window: 'ウィンドウ',
    },
    /** エディターの中の節。項目が 22 個あるので、見出し無しでは探せない。 */
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

    /**
     * 配色（F-CONF-08 / ADR-0013）。プレビューとエディターで同じカタログ。
     *
     * 名前は元の配色の綴りをそのまま使う。
     * 「GitHub 風」のような言い換えをすると、選択前にどの配色になるか判断できなくなる。
     * 明暗を名前に含めない（`Dark` を付けない）のは、どのパレットもライトとダークの両方を持つためである。
     */
    palette: '配色',
    paletteOptions: {
      default: 'Marxdown',
      github: 'GitHub',
      solarized: 'Solarized',
      nord: 'Nord',
      gruvbox: 'Gruvbox',
    },
    paletteHint: 'ライト / ダークは上の「テーマ」に従う',

    fontFamily: '本文のフォント',
    codeFontFamily: 'コードのフォント',
    /** ウェブフォントは CSP（`font-src 'self'`）で読み込めない（02.architecture/10-theming.md §3）。 */
    fontFamilyHint: 'OS に入っているフォント名。無いフォントを書いても既定のフォントに落ちる',
    fontFamilyPlaceholder: '既定のフォント',
    fontSize: { label: '文字サイズ', description: '文字サイズを制御します（単位: px）。' },
    lineHeight: {
      label: '行間',
      description: '行の高さを制御します（単位: px）。フォントサイズから行の高さを計算するには 0 を使用します。',
    },
    maxWidth: { label: '本文幅', description: '1 行に収まる半角文字の数を制御します（単位: ch）。' },

    /**
     * エディター（ADR-0012）。プレビューと同じ語を使う（文字サイズ / 行間）。
     * 同じ項目を別の名前にすると、設定が 2 か所にあることを読み取れなくなる。
     */
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
          '特定の等幅文字数の後に垂直ルーラーを表示します。複数のルーラーを引く場合は数値をカンマ区切りで指定します。',
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

    /** ウィンドウ（ADR-0007）。`✕` の意味が既定と違うので、選べることを見せる。*/
    window: {
      closeBehavior: '✕ を押したとき',
      closeBehaviorTray: 'タスクトレイに格納する',
      closeBehaviorExit: 'Marxdown を終了する',
      closeBehaviorHint: '格納しておくと、次に開くときが速い',
    },

    /**
     * 見本（ADR-0011）。
     * モーダルにしたことで背後の本文が見えないため、フォントに関する項目だけはこの画面で確認できるようにする。
     *
     * 本文幅（`ch`）と、折り返しやタブ幅などの挙動は見本には反映されない。
     * 再現できない範囲まで似せると、実際の表示と異なるものを示すことになる。
     */
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
  /**
   * カスタム CSS（F-CONF-07 / 02.architecture/10-theming.md §3 / ADR-0013）。
   *
   * 設定 UI に置くのは面ごとにボタン 1 つだけである。
   * 有効化のスイッチもパスの設定も無く、ファイルが存在すれば適用されるため、説明すべきことは記述場所と適用範囲の 2 つに絞られる。
   *
   * 通知の 3 行はいずれも適用しなかったことを伝える。
   * 本文は表示できているため、読み込みの失敗ではなく適用していないことを明示する。
   * 対象のファイルは、添えるボタンのラベルで示す（`report`）。
   */
  customCss: {
    open: 'preview.css を開く',
    openEditor: 'editor.css を開く',
    hint: '本文にだけ当たる CSS。ファイルが無ければ雛形を作って開く',
    hintEditor: 'エディターにだけ当たる CSS。配色は変数（--mx-color-*）で上書きする',
    tooLarge: 'カスタム CSS が大きすぎるため適用していません（1MB まで）',
    unreadable: 'カスタム CSS を読み込めなかったため適用していません',
    rejected: 'カスタム CSS を面の中に収められないため適用していません。} の対応を確認してください',
  },
  /** ステータスバー（03.ux-spec/07-status-and-notifications.md §3）。 */
  status: {
    /**
     * 表示モードの名前（03.ux-spec/02-view-modes.md §1）。
     *
     * 英語のままにする。
     * モード名は VS Code の Preview / Edit と同じ語であり、画面上は 1 語のラベルとして機能する（OQ-11 の i18n とは別の判断）。
     */
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' } as const,
    lines: (n: number) => `${n} 行`,
    bytes: (n: number) => `${formatBytes(n)}`,
    chars: (n: number) => `${n.toLocaleString('ja-JP')} 文字`,
    readingTime: (minutes: number) => `約 ${minutes} 分`,
    /**
     * カーソル位置（§3 の図）。英語のままとし、モード名と同じ扱いにする（OQ-11 とは別）。
     * VS Code や Sublime と同じ綴りであることが、そのまま読み方の説明になる。
     *
     * 桁区切りは入れない。
     * 行番号は位置を表す値であり量ではないため、`12,345 行目` のような表記にしない。
     */
    cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
    readonly: '読み取り専用',
    /**
     * EOL の変換（§3「クリックで EOL 変換」/ `features/document/eol.ts`）。
     *
     * 変換先を表示する。
     * ラベル（`LF`）が現在の状態を示しているため、ツールチップでも状態を繰り返すと、操作後の結果を示す箇所が無くなる。
     */
    eolConvert: (next: string) => `クリックで ${next.toUpperCase()} に変換（保存時に書き戻す）`,
    /**
     * エンコーディングの表示名（`src-tauri/src/document/encoding.rs` の `Encoding`）。
     *
     * 綴りは各エンコーディングの一般的な表記に合わせる。
     * 値をそのまま大文字にすると `SHIFT-JIS` / `UTF16-LE` になり、どちらも本来の表記ではない。
     * 選択する UI に並ぶ以上、一般的な表記でないと判別しにくい。
     */
    encoding: {
      // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 画面に出す通り名であって、識別子ではない
      utf8: 'UTF-8',
      'utf16-le': 'UTF-16 LE',
      'utf16-be': 'UTF-16 BE',
      'shift-jis': 'Shift_JIS',
      'euc-jp': 'EUC-JP',
    } as const,
    /** エンコーディングの再解釈（§3 / `features/document/encoding.ts`）。読み直しを伴う。*/
    encodingReinterpret: 'クリックでエンコーディングを選び直す（読み直す）',
    reinterpreted: (name: string) => `${name} として読み直しました`,
    /** モードの切り替え（§3「クリックでモード切替メニュー」）。 */
    modeSwitch: 'クリックで表示モードを切り替える',
    zoomReset: 'クリックで等倍に戻す',
    parsedIn: (ms: number) => `パース ${ms.toFixed(1)}ms`,
    paintedIn: (ms: number) => `描画 ${ms.toFixed(1)}ms`,
  },
  error: {
    'not-found': (path: string) => `ファイルが見つかりません: ${path}`,
    'permission-denied': (path: string) => `アクセスが拒否されました: ${path}`,
    'out-of-scope': (path: string) => `許可されていない場所を参照しています: ${path}`,
    'too-large': (path: string) => `ファイルが大きすぎます: ${path}`,
    conflict: 'ファイルが外部で変更されています',
    'invalid-argument': (detail: string) => `引数が不正です: ${detail}`,
    'settings-broken': 'settings.json を読めないため、設定を保存できません',
    io: (detail: string) => `入出力エラー: ${detail}`,
    unknownArgs: (args: string[]) => `解釈できない引数: ${args.join(', ')}`,
    renderFailed: 'このファイルの表示に失敗しました',
  },
} as const;

/** バイト数を表示用の文字列にする。単位は B / KB / MB。 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
