/**
 * セッション復元の spec が使う前提（F-NAV-01）。
 *
 * 準備は `wdio.conf.ts` の `beforeSession` から呼ぶ。spec の中では間に合わない。
 * 復元はアプリの起動時にしか行われず、そのアプリはセッションを張った時点で立ち上がっている。
 */
import path from 'node:path';

import { WORK_DIR, writeFile } from './fixtures';
import { seedSession } from './store';

/** 復元されるはずの 2 枚。並び順もこのとおりになる。 */
export const RESTORED_FIRST = path.join(WORK_DIR, 'restored-a.md');
export const RESTORED_SECOND = path.join(WORK_DIR, 'restored-b.md');

/** 表示していたタブの位置。先頭ではないので、並びと選択の両方を確かめられる。 */
export const RESTORED_ACTIVE = 1;

/** 前回のタブを用意する。`resetWorkspace()` の後に呼ぶこと。 */
export function seedRestoredSession(): void {
  writeFile(RESTORED_FIRST, { content: '# restored-a\n\n1 枚目\n' });
  writeFile(RESTORED_SECOND, { content: '# restored-b\n\n2 枚目\n' });
  seedSession([RESTORED_FIRST, RESTORED_SECOND], RESTORED_ACTIVE);
}
