/** Marp のスライドの表示だけが使う日本語の文言。`core.ts` と分けてある理由は `../marp.ts` にある。 */
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
