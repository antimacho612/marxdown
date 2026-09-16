/**
 * settings feature の公開面（02.architecture/03-layers.md §2）。
 *
 * feature の外から参照してよいのはこのファイルが挙げたものだけで、残りは feature 内の都合である。
 * `eslint.config.js` の `FEATURE_BARREL_ENFORCED` が `@/features/settings/*` の直接参照を禁止して機械的に守る。
 *
 * ここに載せてよいのは `main` に常駐するものだけである。
 * 設定 UI（`lazy/`）を再輸出すると `bootstrap.ts` の import から静的に辿れてしまい、クリティカルパスの分割が崩れる。
 * 遅延側の入口は `lazy/panel.ts` であり、動的 import で参照する。
 * 見本（`lazy/samples/Sample.svelte`）は更にその先で切ってあり、参照するのは `SettingsDialog` である（OQ-38）。
 */
export { formatFontFamily } from './format';
export { openSettingsLazily } from './open-settings';
export { initSettings, installSettingsWatch, reportSettingsProblem, settingsStore } from './store.svelte';
export { enabledSyntax } from './syntax';
