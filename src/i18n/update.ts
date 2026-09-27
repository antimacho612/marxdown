/**
 * 更新の通知だけが使う文言（ADR-0024）。
 *
 * 使う側は遅延チャンク（`features/update/lazy/`）にあるため、`t` とは分けてある（`explorer.ts` と同じ理由）。
 * 更新が見つかるのは多くても 1 日 1 回であり、起動のたびに読み込む理由が無い。
 */
import { lazyMessages } from './index';
import type { UpdateMessages } from './types';

const update = lazyMessages<UpdateMessages>({
  ja: async () => {
    const { jaUpdate } = await import('./ja/update');
    return jaUpdate;
  },
  en: async () => {
    const { enUpdate } = await import('./en/update');
    return enUpdate;
  },
});

/** 表示言語の更新の文言。`loadUpdateMessages()` が完了するまで空である。 */
export const tUpdate = update.messages;

/** `tUpdate` を読み込む。 */
export const loadUpdateMessages = update.load;
