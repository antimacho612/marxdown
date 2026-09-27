/**
 * Marp のスライドの表示（F-VIEW-17 / ADR-0023）だけが使う文言。
 *
 * `ja.ts` から分けてあるのは、使う側が遅延チャンク（`features/preview/lazy/marp.ts`）にあるためである（`ja-explorer.ts` と同じ理由）。
 */
import type { MarpThemeProblem } from '@/markdown/protocol';

export const jaMarp = {
  /** 自作テーマ（`marp.themes`）を読み込めなかったとき。2 件目以降は件数だけを添える。 */
  themeFailed: (reason: string, path: string, more: number) =>
    `Marp のテーマを読み込めませんでした。${reason}: ${path}${more > 0 ? `（ほか ${more} 件）` : ''}`,
  themeProblem: {
    'not-absolute': '絶対パスで指定してください',
    missing: 'ファイルが見つかりません',
    'not-css': '.css ファイルではありません',
    'too-large': '256KB を超えています',
    'too-many': '読み込めるのは 64 個までです',
    unreadable: 'ファイルを読み取れません',
    'no-theme-name': '/* @theme 名前 */ がありません',
  } satisfies Record<MarpThemeProblem['kind'], string>,
  styleRejected: 'Marp のスタイルの { と } が対応していないため、適用できません',
};
