// @vitest-environment jsdom
// 注入した `<style>` をブラウザの CSS パーサに解釈させた結果まで見るので DOM が要る。
import { beforeEach, describe, expect, it } from 'vitest';

import { documentStore } from '@/features/document';
import { t } from '@/i18n';

import { applyPreviewTheme, awaitPreviewTheme, enableThemeNotices, primePreviewTheme } from './index';

function style(): HTMLStyleElement | null {
  return document.querySelector<HTMLStyleElement>('style#mx-preview-theme');
}

beforeEach(() => {
  documentStore.notice = null;
});

/**
 * プレビューの配色の適用経路（ADR-0014）。
 *
 * エディター側と違い、プレビューは起動直後から見えている。
 * 検証するのは、`themes/` の 1 枚が bootstrap から届いたときにカタログを待たずに同期的に適用されることである。
 * 待つ形になっていると、暗い配色を選んでいる人の初回フレームが既定の配色で描かれる。
 */
describe('bootstrap 由来の配色 (ADR-0014)', () => {
  it('同期的に当たり、カタログを待たない', async () => {
    primePreviewTheme({ id: 'mine', declarations: '--mx-color-bg: #010203;' });
    applyPreviewTheme('mine');

    // `await` を挟まずに確認する。ここが非同期になっていたら初回フレームに間に合わない。
    expect(style()?.textContent).toContain("[data-mx-theme='mine']");
    expect(style()?.textContent).toContain('--mx-color-bg: #010203;');

    await expect(awaitPreviewTheme()).resolves.toBeUndefined();
  });

  /** 宣言の後ろにセレクタを書ける。包まれた後は CSS のネスト規則になり、面の中にだけ適用される。 */
  it('セレクタを含む規則も面の中に収まる', () => {
    primePreviewTheme({ id: 'mine', declarations: '--mx-color-bg: #010203;\nh1 { color: red }' });
    applyPreviewTheme('mine');

    const rules = [...(style()?.sheet?.cssRules ?? [])];
    expect(rules, '外へ出た規則が無い').toHaveLength(1);
    expect((rules[0] as CSSStyleRule).cssText).toContain('h1');
  });

  it('既定に戻すと注入したものが残らない', () => {
    primePreviewTheme({ id: 'mine', declarations: '--mx-color-bg: #010203;' });
    applyPreviewTheme('mine');
    applyPreviewTheme('default');

    expect(style()?.textContent).toBe('');
  });

  /**
   * 封じ込めが破れないこと。
   * 波かっこを閉じて後ろに書いた規則は、面の外（クローム）へ届いてはいけない（ADR-0006）。
   * 通知を出すのは本文を描いた後である（`enableThemeNotices`）。それまでは結果を持っておくだけにする。
   */
  it('面の外へ出る宣言は丸ごと拒否し、本文を描いた後に通知する', () => {
    primePreviewTheme({ id: 'escaping', declarations: '--mx-color-bg: #000000; } .mx-titlebar { display: none; ' });
    applyPreviewTheme('escaping');

    expect(style()?.textContent).toBe('');
    expect(documentStore.notice, '起動中は出さない').toBeNull();

    enableThemeNotices();

    expect(documentStore.notice?.message).toBe(t.themes.rejected);
    expect(documentStore.notice?.level).toBe('warning');
  });
});
