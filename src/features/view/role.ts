/**
 * このウィンドウの役割（F-OPEN-06）。
 *
 * `main` はフルシェル、`satellite` はタブと本文だけを持つウィンドウである。
 * bootstrap で 1 回決まり、以後変わらない。
 *
 * ルーンにしていないのは、値が変化しないためである。
 * 変化しないものをリアクティブな状態に置くと、購読する側に「変わりうる」という誤った前提を与える。
 */
import type { Bootstrap, WindowRole } from '@/platform';

let role: WindowRole = 'main';

/**
 * bootstrap から役割を決める。シェルを描画するより前に 1 回だけ呼ぶ。
 *
 * 後から呼ぶとシェルが一度フルシェルとして描画されてから差し替わる（倍率・ペインと同じ理由）。
 */
export function initWindowRole(bootstrap: Pick<Bootstrap, 'role'> | null): void {
  role = bootstrap?.role ?? 'main';
}

/** このウィンドウの役割。 */
export function windowRole(): WindowRole {
  return role;
}

/**
 * タブと本文だけを持つウィンドウか。
 *
 * これが true の間は、ファイルツリー・アウトライン・ハンバーガーメニューが存在せず、前回のタブとしても覚えない（`features/workspace/session.svelte.ts`）。
 */
export function isSatellite(): boolean {
  return role === 'satellite';
}
