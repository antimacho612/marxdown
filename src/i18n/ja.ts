/**
 * UI 文言。
 *
 * i18n ライブラリは導入しない（04.tech-stack.md §5.1 / OQ-14）。
 * 当面は日本語のみだが、**文言を定数に集約しておく**ことで
 * 将来の抽出をコード変更なしに行えるようにしておく。
 */

export const ja = {
  app: {
    name: 'Marxdown',
  },
  welcome: {
    title: 'ファイルが開かれていません',
    hint: 'ターミナルから marxdown <file.md> で開くか、ここにファイルをドロップしてください',
  },
  notice: {
    dismiss: '通知を閉じる',
  },
  status: {
    lines: (n: number) => `${n} 行`,
    bytes: (n: number) => `${formatBytes(n)}`,
    readonly: '読み取り専用',
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
    io: (detail: string) => `入出力エラー: ${detail}`,
    unknownArgs: (args: string[]) => `解釈できない引数: ${args.join(', ')}`,
    renderFailed: 'このファイルの表示に失敗しました',
  },
} as const

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
