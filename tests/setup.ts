import '@testing-library/jest-dom/vitest';

import { t } from '@/i18n';
import { tExplorer } from '@/i18n/explorer';
import { ja } from '@/i18n/ja/core';
import { jaExplorer } from '@/i18n/ja/explorer';
import { jaMarp } from '@/i18n/ja/marp';
import { jaSettings } from '@/i18n/ja/settings';
import { jaUpdate } from '@/i18n/ja/update';
import { tMarp } from '@/i18n/marp';
import { tSettings } from '@/i18n/settings';
import { tUpdate } from '@/i18n/update';

// 実アプリでは `main.ts` と各遅延チャンクの入口が非同期に読み込む。テストは日本語の文言を同期的に入れておく。
Object.assign(t, ja);
Object.assign(tExplorer, jaExplorer);
Object.assign(tMarp, jaMarp);
Object.assign(tSettings, jaSettings);
Object.assign(tUpdate, jaUpdate);

/*
 * Monaco が モジュールの評価時に問い合わせるが、jsdom が持っていないもの。
 *
 * テストファイルの中で追加しても間に合わない（`import` は巻き上がるので、`beforeEach` より先に `monaco.ts` が評価される）。
 * setup はテストファイルより前に実行されるため、ここに置く。
 *
 * `environment: 'node'` のテストでは `document` が無い。そちらには何もしない。
 */
if (typeof document !== 'undefined') {
  // `contrib/clipboard` が `supportsPaste` の判定に使う。
  document.queryCommandSupported ??= () => false;

  // `automaticLayout`（ADR-0009 の受け入れコスト 3）が使う。
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

  // `features/editor/lazy/theme.ts` が OS のテーマ追従に使う。
  globalThis.matchMedia ??= ((): MediaQueryList =>
    ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}
