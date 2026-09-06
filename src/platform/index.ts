/**
 * Platform 実装の選択と注入。
 *
 * ここより上（Domain / UI）は `platform` だけを見る。
 * テストでは `setPlatform()` でインメモリ実装に差し替える。
 */
import { tauriPlatform } from './tauri';
import type { Platform } from './types';
import { webPlatform } from './web';

export * from './settings-schema';
export * from './types';

/**
 * Tauri の中で動いているか。
 *
 * `@tauri-apps/api` を import しただけでは判定できないため、
 * Tauri が WebView に必ず注入する内部関数の有無で見る。
 */
function isTauri(): boolean {
  return (
    typeof globalThis !== 'undefined' && ('__TAURI_INTERNALS__' in globalThis || '__MARXDOWN_BOOTSTRAP__' in globalThis)
  );
}

let current: Platform = isTauri() ? tauriPlatform : webPlatform;

export function getPlatform(): Platform {
  return current;
}

/** テストと Storybook 用。プロダクションコードから呼ばない。 */
export function setPlatform(next: Platform): void {
  current = next;
}
