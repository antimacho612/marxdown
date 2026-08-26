/**
 * UI 文言。
 *
 * i18n ライブラリは導入しない（04.tech-stack.md §5.1 / OQ-11）。
 * 当面は日本語のみだが、**文言を定数に集約しておく**ことで
 * 将来の抽出をコード変更なしに行えるようにしておく。
 */

export const ja = {
  app: {
    name: 'Marxdown',
  },
  /**
   * Welcome 画面（03.ux-spec.md §9.1）。
   *
   * チュートリアルもツアーも出さない。**ショートカットを併記することが唯一の教育**。
   * 「フォルダを開く」（M3）「新規ファイル」（M2）は、まだ動かないので並べない。
   * 押せない項目を並べるのは Principle 3「Simple Means Low Cognitive Load」に反する。
   */
  welcome: {
    title: 'Marxdown',
    openFile: 'ファイルを開く',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    dropHint: 'ここに Markdown ファイルをドロップ',
    cliHint: 'ターミナルからは marxdown <file.md>',
  },
  /**
   * カスタムタイトルバー（03.ux-spec.md §2.1 / OQ-02 = B）。
   *
   * ウィンドウ操作ボタンには**文字を出さない**（絵だけ）。ここにあるのは
   * すべてスクリーンリーダー向けの名前とツールチップで、Windows の
   * 標準タイトルバーが読み上げる文言に合わせてある。
   */
  titlebar: {
    menu: 'メニュー',
    minimize: '最小化',
    maximize: '最大化',
    restore: '元のサイズに戻す',
    close: '閉じる',
  },
  /**
   * ハンバーガーメニュー（03.ux-spec.md §2.3「初学者の逃げ道」）。
   *
   * **メニューバーは置かない**という決定の代わりに、タイトルバー左端に 1 つだけ置く。
   * 並べるのは**いま押せるものだけ**。「終了」は Phase 7 で増える。
   */
  menu: {
    open: 'ファイルを開く',
    settings: '設定',
    recent: '最近開いたファイル',
    noRecent: 'まだ何も開いていません',
    reload: '再読み込み',
    zoom: '表示倍率',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: '等倍',
    search: 'プレビュー内を検索',
  },
  /**
   * ペイン（03.ux-spec.md §7）。
   *
   * ペインそのものに見出しは出さない（中身が自分の見出しを持つ）。
   * ここにあるのは、掴む場所とメニュー項目の名前だけ。
   */
  pane: {
    resizeRight: 'ライトペインの幅を変更',
    showOutline: 'アウトラインを表示',
    hideOutline: 'アウトラインを隠す',
  },
  /**
   * アウトライン（F-VIEW-02 / 03.ux-spec.md §7.2）。
   *
   * **空であることを明示する**のが §7.2 の要求。「まだ読み込んでいる」と
   * 読めないよう、何が無いのかを言い切って、書けば出ることを添える。
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
    droppedExtra: (n: number) => `${n} 件は開いていません（複数タブは M3 で対応）`,
    reloaded: '再読み込みしました',
    /**
     * 外部変更を自動で読み込んだとき（03.ux-spec.md §8.2 の 1 行目）。
     * 自分では何もしていないので、**何が起きたか**を先に言う。
     */
    reloadedExternal: '外部の変更を読み込みました',
  },
  preview: {
    copy: 'コピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできません',
    copyLabel: 'コードブロックをコピー',
    imageOutOfScope: 'この画像は参照が許可されていない場所にあります',
    imageMissing: '画像が見つかりません',
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
  /** リンククリックの分岐（02.architecture.md §9.2）。 */
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
   * ユーザー設定（02.architecture.md §4.5 / 03.ux-spec.md §8.2）。
   *
   * 「読めませんでした」で止めるのは、**既定値で動いていること**と
   * **ファイルは上書きしていないこと**の両方を、短い 1 行に収めるため。
   * 原因（何行目が壊れているか）はエディタが教えてくれる。
   */
  settings: {
    broken: 'settings.json を読めませんでした。既定の設定で表示しています',
    openFile: 'ファイルを開く',

    /*
     * 設定 UI（F-CONF-05）。
     *
     * **「セットアップ」ではなく「調整」の画面**（03.ux-spec.md §1「Defaults Matter」）。
     * 説明文を項目ごとに付けず、既定値のままで完成していることを前提に、
     * 触ったときだけ意味が要る 2 か所（フォントと本文幅）にだけ補足を置く。
     */
    title: '設定',
    close: '設定を閉じる',
    /** 壊れている間は保存を**試みない**。理由をここに出して入力欄を止める（§4.5）。 */
    readOnly: 'settings.json を読めないため、変更を保存できません。ファイルを直してから開き直してください',
    theme: 'テーマ',
    themeSystem: 'OS に合わせる',
    themeLight: 'ライト',
    themeDark: 'ダーク',
    fontFamily: '本文のフォント',
    /** ウェブフォントは CSP（`font-src 'self'`）で読み込めない（02.architecture.md §10.3）。 */
    fontFamilyHint: 'OS に入っているフォント名。無いフォントを書いても既定のフォントに落ちる',
    fontFamilyPlaceholder: '既定のフォント',
    fontSize: '文字サイズ',
    lineHeight: '行間',
    maxWidth: '本文幅',
    maxWidthHint: '1 行に収まる半角文字の数',
    unitPx: 'px',
    unitCh: 'ch',
    reset: '既定に戻す',
    resetOf: (label: string) => `${label}を既定に戻す`,
    edit: 'settings.json を開く',
    editHint: 'ここに無い項目は settings.json に直接書ける',
  },
  /**
   * カスタム CSS（F-CONF-07 / 02.architecture.md §10.3）。
   *
   * **設定 UI に置くのはボタン 1 つだけ。** 有効化のスイッチもパスの設定も無い
   * （ファイルが存在すれば効く）ので、説明すべきことは
   * 「どこに書くか」と「どこまで効くか」の 2 つに絞られる。
   *
   * 通知の 3 行はいずれも**適用しなかったこと**を伝える。本文は読めているので、
   * 「読み込めませんでした」で止めず、**当たっていない**と言い切る。
   */
  customCss: {
    open: 'custom.css を開く',
    hint: '本文にだけ当たる CSS。ファイルが無ければ雛形を作って開く',
    tooLarge: 'カスタム CSS が大きすぎるため適用していません（1MB まで）',
    unreadable: 'カスタム CSS を読み込めなかったため適用していません',
    rejected: 'カスタム CSS を本文の中に収められないため適用していません。} の対応を確認してください',
  },
  /** ステータスバー（03.ux-spec.md §8.3）。 */
  status: {
    /** モード切り替え（M2）が入るまでは Preview 固定。 */
    mode: 'Preview',
    lines: (n: number) => `${n} 行`,
    bytes: (n: number) => `${formatBytes(n)}`,
    chars: (n: number) => `${n.toLocaleString('ja-JP')} 文字`,
    readingTime: (minutes: number) => `約 ${minutes} 分`,
    readonly: '読み取り専用',
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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
