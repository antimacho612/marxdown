/**
 * Marp のスライドの表示（F-VIEW-17 / ADR-0023）だけが使う文言。
 *
 * 使う側は遅延チャンク（`features/preview/lazy/marp.ts`）にあるため、`t` とは分けてある（`explorer.ts` と同じ理由）。
 */
import { lazyMessages } from './index';
import type { MarpMessages } from './types';

const marp = lazyMessages<MarpMessages>({
  ja: async () => {
    const { jaMarp } = await import('./ja/marp');
    return jaMarp;
  },
});

/** 表示言語の Marp の文言。`loadMarpMessages()` が完了するまで空である。 */
export const tMarp = marp.messages;

/** `tMarp` を読み込む。 */
export const loadMarpMessages = marp.load;
