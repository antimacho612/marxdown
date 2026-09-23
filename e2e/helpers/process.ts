/**
 * プロセスの生死を外から見る。
 *
 * 画面を見に行かない手段が要る場面がある。終了の確認ダイアログはネイティブのモーダルで、出ている間 WebView は応答しない（`specs/quit.e2e.ts`）。
 */
import { execFileSync } from 'node:child_process';

const IMAGE = 'marxdown.exe';

/** Marxdown が動いているか。`tasklist` が無い環境では常に true を返す。 */
export function isAppRunning(): boolean {
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${IMAGE}`, '/NH'], { encoding: 'utf8' });
    return out.toLowerCase().includes(IMAGE);
  } catch {
    return true;
  }
}
