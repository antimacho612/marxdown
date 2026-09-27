import '@testing-library/jest-dom/vitest';

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
