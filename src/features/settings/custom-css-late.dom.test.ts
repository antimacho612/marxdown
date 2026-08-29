// @vitest-environment jsdom
// 適用の結果（注入された `<style>`）まで見るので DOM が要る。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document/store.svelte';
import { ja } from '@/i18n/ja';
import { getPlatform, NO_CUSTOM_CSS, setPlatform, type CustomCss, type Platform } from '@/platform';

import { installCustomCss, refreshCustomCss } from './custom-css-late';

const original = getPlatform();

/** `custom.css` を読ませずに済ませる（bootstrap 同梱の経路）。 */
function stub(patch: Partial<Platform>): void {
  setPlatform({ ...original, ...patch } as Platform);
}

function injectedCss(): string {
  return document.querySelector<HTMLStyleElement>('style#mx-custom-css')?.textContent ?? '';
}

beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  const preview = document.createElement('div');
  preview.id = 'mx-preview';
  document.body.append(preview);
  documentStore.notice = null;
});

afterEach(() => {
  setPlatform(original);
});

describe('起動後のカスタム CSS (02.architecture/10-theming.md §3)', () => {
  /** 表の 1 行目。**初回起動が常にこれ**なので、ここで IPC も通知も出してはいけない。 */
  it('ファイルが無ければ、読みにも行かないし通知も出さない', () => {
    const readCustomCss = vi.fn();
    stub({ readCustomCss, onCustomCssChanged: () => () => {} });

    installCustomCss(NO_CUSTOM_CSS, 'empty');

    expect(readCustomCss).not.toHaveBeenCalled();
    expect(documentStore.notice).toBeNull();
  });

  /** 表の 3 行目。64KB 超は bootstrap に載らないので、ここで初めて取りに行く。 */
  it('64KB を超えていたら、ready() の後に取りに行って当てる', async () => {
    const loaded: CustomCss = { ...NO_CUSTOM_CSS, css: 'h1 { color: red }' };
    stub({ readCustomCss: () => Promise.resolve(loaded), onCustomCssChanged: () => () => {} });

    installCustomCss({ ...NO_CUSTOM_CSS, deferred: true }, 'empty');
    await vi.waitFor(() => expect(injectedCss()).toContain('color: red'));

    expect(injectedCss()).toContain('@scope (#mx-preview)');
  });

  /** 表の 4 行目。読まない代わりに、黙って無視せず理由を出す。 */
  it('1MB を超えていたら、通知バーで知らせる', () => {
    stub({ onCustomCssChanged: () => () => {} });

    installCustomCss(
      { ...NO_CUSTOM_CSS, problem: { kind: 'too-large', path: 'C:\\conf\\custom.css', message: '' } },
      'empty',
    );

    expect(documentStore.notice?.message).toBe(ja.customCss.tooLarge);
    expect(documentStore.notice?.level).toBe('warning');
    expect(documentStore.notice?.actions?.[0]?.label).toBe(ja.customCss.open);
  });

  /**
   * 包めなかったとき（`}` で閉じ過ぎた CSS）も**黙って落とさない**。
   * 効かない理由がユーザーに見えないと、「カスタム CSS が動かない」で終わる。
   */
  it('本文に閉じ込められなかったことを通知バーで知らせる', () => {
    stub({ onCustomCssChanged: () => () => {} });

    installCustomCss({ ...NO_CUSTOM_CSS, css: 'h1{}\n}\n.mx-titlebar{display:none}' }, 'rejected');

    expect(documentStore.notice?.message).toBe(ja.customCss.rejected);
  });

  /**
   * 起動直後は「ファイルを開けなかった」通知が出ていることがある。
   * ユーザーがやろうとしたこと自体の失敗のほうが重い（**弱いものは譲る**）。
   */
  it('既に通知が出ているときは、上書きしない', () => {
    documentStore.notice = { level: 'error', message: 'ファイルが見つかりません' };
    stub({ onCustomCssChanged: () => () => {} });

    installCustomCss({ ...NO_CUSTOM_CSS, css: '}\n' }, 'rejected');

    expect(documentStore.notice?.message).toBe('ファイルが見つかりません');
  });

  /** 02.architecture/10-theming.md §3「外部エディタで編集されたら即反映」。監視は Rust 側、当て直しはここ。 */
  it('外部変更の通知を受けたら、読み直して当て直す', async () => {
    let current: CustomCss = { ...NO_CUSTOM_CSS, css: 'h1 { color: red }' };
    let notify = (): void => {};
    stub({
      readCustomCss: () => Promise.resolve(current),
      onCustomCssChanged: (handler) => {
        notify = handler;
        return () => {};
      },
    });

    installCustomCss(NO_CUSTOM_CSS, 'empty');
    current = { ...NO_CUSTOM_CSS, css: 'h1 { color: blue }' };
    notify();

    await vi.waitFor(() => expect(injectedCss()).toContain('color: blue'));
  });

  /** `custom.css` を消すのが「カスタム CSS をやめる」操作。再起動を待たせない。 */
  it('ファイルが消えたら、当てていたものを外す', async () => {
    stub({ readCustomCss: () => Promise.resolve(NO_CUSTOM_CSS) });

    await refreshCustomCss();

    expect(injectedCss()).toBe('');
  });

  /**
   * 直したら通知が消える。**自分が出したものだけ**を下げる
   * （`refreshSettings` と同じ扱い）。
   */
  it('直したら、自分が出した通知を自分で下げる', async () => {
    stub({ readCustomCss: () => Promise.resolve({ ...NO_CUSTOM_CSS, css: 'h1 { color: red }' }) });
    documentStore.notice = { level: 'warning', message: ja.customCss.rejected };

    await refreshCustomCss();

    expect(documentStore.notice).toBeNull();
  });

  /** 読めないままなら、当てていたものは**外さない**（編集の途中かもしれない）。 */
  it('読み直しに失敗しても、当てていた CSS は残る', async () => {
    stub({ readCustomCss: () => Promise.resolve({ ...NO_CUSTOM_CSS, css: 'h1 { color: red }' }) });
    await refreshCustomCss();

    stub({ readCustomCss: () => Promise.reject(new Error('IPC が落ちた')) });
    await refreshCustomCss();

    expect(injectedCss()).toContain('color: red');
  });
});
