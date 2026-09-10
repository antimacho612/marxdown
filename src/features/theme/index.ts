/**
 * エディターの配色の入口（ADR-0014 / 02.architecture/03-layers.md §2）。
 *
 * `main` に残るのはこのファイルだけで、中身は動的 import 1 行である。
 * 組み込みの 50 枚（`lazy/presets.ts`）と、それを注入する処理（`lazy/catalog.ts`）は `theme` チャンクにあり、エディターか設定ダイアログを開くまで読み込まれない。
 *
 * 静的 import にしてはいけない。
 * `editor` / `settings` のどちらかに取り込まれると、50 枚ぶんの色が予算の対象外のチャンク（Monaco）に紛れる（`vite.config.ts` の `isThemeOnly`）。
 */
import type * as CatalogModule from './lazy/catalog';

export type { ApplyResult } from './lazy/catalog';
export type { ThemeSummary } from './lazy/preset';

type Catalog = typeof CatalogModule;

/**
 * 1 度だけ読み込む。
 *
 * 呼び出し元はエディター（`features/editor/lazy/palette.ts`）と設定ダイアログの 2 つあり、両方が開かれることは普通に起こる。
 * `import()` 自体もモジュールを二重評価しないが、`Promise` を保持しておくと呼び出し側が解決済みかどうかを気にせずに済む。
 */
let pending: Promise<Catalog> | null = null;

/** 配色のカタログを読み込む。2 回目以降は同じ `Promise` を返す。 */
export function loadThemeCatalog(): Promise<Catalog> {
  pending ??= import('./lazy/catalog');
  return pending;
}
