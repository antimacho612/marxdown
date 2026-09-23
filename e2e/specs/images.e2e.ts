/**
 * スコープ外の画像を許可する導線（N-SEC-05 / ADR-0006 / 02.architecture/09-security.md §3）。
 *
 * ここでしか確かめられないのは、防御が実際に機能していることである。
 * Vitest 側はプラットフォームをモックしており、`scope.rs` の検証も Tauri の asset プロトコルスコープも通っていない。
 *
 * 検証するのは 3 つである。拒否された画像が解決後のパスで示されること、ボタン 1 つでそのディレクトリが読めるようになること、そしてその 1 段下は読めないままであること。
 * 最後の 1 つが「再帰しない」という決定の実体である。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { openViaForward } from '../helpers/app';
import { WORK_DIR } from '../helpers/fixtures';

/** 1x1 の PNG。中身は問わない。読めたかどうかだけを見る。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * ドキュメントは `.work/sub` に置く。
 *
 * 許可されるのは開いたファイルの親ディレクトリだけなので（`read_document`）、隣の `.work/assets` はスコープ外になる。
 */
const DOC_DIR = path.join(WORK_DIR, 'sub');
const ASSET_DIR = path.join(WORK_DIR, 'assets');
const IMAGE_DOC = path.join(DOC_DIR, 'image.md');

/** プレースホルダに出ているパス。 */
async function blockedPaths(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('.mx-image-blocked__path')].map((element) => element.textContent ?? ''),
  );
}

describe('スコープ外の画像', () => {
  before(async () => {
    mkdirSync(DOC_DIR, { recursive: true });
    mkdirSync(path.join(ASSET_DIR, 'deep'), { recursive: true });
    writeFileSync(path.join(ASSET_DIR, 'logo.png'), PNG);
    writeFileSync(path.join(ASSET_DIR, 'deep', 'inner.png'), PNG);
    writeFileSync(IMAGE_DOC, '# 画像\n\n![ロゴ](../assets/logo.png)\n\n![奥](../assets/deep/inner.png)\n', 'utf8');

    await openViaForward(IMAGE_DOC, '画像');
  });

  it('拒まれた画像は、解決後のパスとともにプレースホルダになる', async () => {
    await browser.waitUntil(
      async () => {
        const paths = await blockedPaths();
        return paths.length === 2;
      },
      {
        timeout: 20_000,
        timeoutMsg: 'プレースホルダが出なかった',
      },
    );

    // ドキュメントに書かれた `../assets/logo.png` ではなく、解決後の絶対パスが出る。
    const paths = await blockedPaths();
    expect(paths.every((p) => p.includes('assets'))).toBe(true);
    expect(paths.some((p) => p.startsWith('..'))).toBe(false);
  });

  it('許可すると、そのディレクトリの画像が表示される', async () => {
    await browser.execute(() => {
      const button = document.querySelector('.mx-image-blocked__allow');
      if (button instanceof HTMLElement) button.click();
    });

    await browser.waitUntil(
      async () => {
        const count = await browser.execute(() => document.querySelectorAll('#mx-preview img').length);
        return count === 1;
      },
      { timeout: 20_000, timeoutMsg: '許可しても画像が出なかった' },
    );
  });

  it('1 段下のディレクトリは許可されない', async () => {
    // 再帰しないことが防御の要である。
    // `assets` を許可しても `assets/deep` は開かない。
    const remaining = await blockedPaths();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain('inner.png');
  });
});
