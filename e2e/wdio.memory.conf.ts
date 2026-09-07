/**
 * メモリ計測だけを走らせる設定（[OQ-18](../docs/07.open-questions/oq-18-memory-not-released.md) / M3 Phase 0）。
 *
 * `wdio.conf.ts` を継承し、対象の spec と WebView2 のスイッチだけを差し替える。
 * 分けているのは 2 つの理由による。
 * `gc()` を露出させた状態を他の 43 本に持ち込みたくないこと、および 1 本で数分かかるため `pnpm e2e` の所要時間に混ぜたくないこと。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MEMORY_PROBE_BROWSER_ARGUMENTS } from './helpers/memory';
import { config as base } from './wdio.conf';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `onPrepare` はフックの配列も取れるため、関数の側だけを取り出す。 */
type PrepareHook = Exclude<NonNullable<WebdriverIO.Config['onPrepare']>, unknown[]>;

export const config: WebdriverIO.Config = {
  ...base,
  specs: [path.join(here, 'specs', 'memory.e2e.ts')],
  exclude: [],

  mochaOpts: {
    ...base.mochaOpts,
    // `huge.md` の描画 + 60 秒のアイドル + プロセス計測の往復。
    timeout: 600_000,
  },

  /**
   * WebView2 のスイッチを環境変数で渡す。
   *
   * ここで置いた環境変数は wdio → tauri-driver → アプリと継承される。
   * WebView2 は初期化時に `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` を直接読むため、`--gc-probe` を付けて起動したのと同じ状態になる（`helpers/memory.ts`）。
   */
  onPrepare(...args: Parameters<PrepareHook>) {
    process.env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = MEMORY_PROBE_BROWSER_ARGUMENTS;
    const prepare = base.onPrepare;
    return typeof prepare === 'function' ? prepare(...args) : undefined;
  },
};
