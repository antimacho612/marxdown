import { describe, expect, it } from 'vitest';

import { rewriter } from './shared';

describe('rewriter', () => {
  it('入れ子の文字列を表の順に置き換え、関数は残す', () => {
    const build = (name: string) => `${name} を作りました`;
    const messages = {
      reveal: 'エクスプローラーで表示',
      window: { closeToTray: { label: '閉じるときにタスクトレイに格納する' } },
      build,
    };

    rewriter([
      ['エクスプローラーで表示', 'Finder で表示'],
      ['タスクトレイ', 'システムトレイ'],
    ])(messages);

    expect(messages.reveal).toBe('Finder で表示');
    expect(messages.window.closeToTray.label).toBe('閉じるときにシステムトレイに格納する');
    expect(messages.build).toBe(build);
  });
});
