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
  open: {
    droppedExtra: (n: number) => `${n} 件は開いていません（複数タブは M3 で対応）`,
    reloaded: '再読み込みしました',
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
