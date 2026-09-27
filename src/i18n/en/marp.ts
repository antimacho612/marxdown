/** Marp のスライドの表示だけが使う英語の文言。キーの構成は `ja/marp.ts` に合わせる。 */
import type { MarpMessages } from '../types';

export const enMarp = {
  themeFailed: (reason: string, path: string, more: number) =>
    `Could not load a Marp theme. ${reason}: ${path}${more > 0 ? ` (and ${more} more)` : ''}`,
  themeProblem: {
    'not-absolute': 'Specify an absolute path',
    missing: 'File not found',
    'not-css': 'Not a .css file',
    'too-large': 'Larger than 256KB',
    'too-many': 'Up to 64 themes can be loaded',
    unreadable: 'Cannot read the file',
    'no-theme-name': 'Missing /* @theme name */',
  },
  styleRejected: 'Cannot apply the Marp style because its { and } do not match',
} satisfies MarpMessages;
