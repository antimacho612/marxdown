// @vitest-environment jsdom
/**
 * 未保存のまま別の文書へ移る前の確認（F-EDIT-03 / N-REL-01）。
 *
 * ダイアログの見た目は Rust 側（`commands::confirm_discard`）で、通しの確認は E2E（`e2e/specs/edit.e2e.ts`）が担当する。
 * この層が担うのは「尋ねたかどうか」と「答えをどう解釈したか」である。
 *
 * とりわけ「保存する」を選んだのに保存が失敗したとき、進んではいけない。
 * ここを取り違えると、確認したうえで編集内容が消えることになる。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setPlatform, type DiscardChoice, type Platform } from '@/platform';

import { confirmDiscard, registerSaver, resetDiscardGuard } from './discard';
import { documentStore } from './store.svelte';

let choice: DiscardChoice = 'cancel';
const confirm = vi.fn(() => Promise.resolve(choice));

beforeEach(() => {
  confirm.mockClear();
  resetDiscardGuard();
  documentStore.isDirty = false;
  setPlatform({ kind: 'web', confirmDiscard: confirm } as unknown as Platform);
});

describe('confirmDiscard', () => {
  it('ダーティでなければ何も尋ねずに進む', async () => {
    expect(await confirmDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('「保存しない」なら、そのまま進む', async () => {
    documentStore.isDirty = true;
    choice = 'discard';

    expect(await confirmDiscard()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('「キャンセル」なら進まない', async () => {
    documentStore.isDirty = true;
    choice = 'cancel';

    expect(await confirmDiscard()).toBe(false);
  });

  it('「保存する」なら保存してから進む', async () => {
    const save = vi.fn(() => Promise.resolve(true));
    registerSaver(save);
    documentStore.isDirty = true;
    choice = 'save';

    expect(await confirmDiscard()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  /** N-REL-01。失敗を無視して進むと、確認した意味が無くなる。 */
  it('「保存する」を選んで保存に失敗したら、進まない', async () => {
    registerSaver(() => Promise.resolve(false));
    documentStore.isDirty = true;
    choice = 'save';

    expect(await confirmDiscard()).toBe(false);
  });

  /** 保存する手段が登録されていない状態でも、進まない。 */
  it('保存の実体が登録されていなければ、進まない', async () => {
    documentStore.isDirty = true;
    choice = 'save';

    expect(await confirmDiscard()).toBe(false);
  });
});
