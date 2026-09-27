import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentStore } from '@/features/document';
import { ja } from '@/i18n/ja';
import { getPlatform, setPlatform, type InstallRefusal, type Platform, type UpdateInfo } from '@/platform';

import { checkForUpdates, installUpdateNotice } from './update';

const original = getPlatform();
const INFO: UpdateInfo = { version: '0.2.0', notesUrl: 'https://example.com/v0.2.0' };

function usePlatform(patch: Partial<Platform>): void {
  setPlatform({ ...original, ...patch });
}

afterEach(() => {
  setPlatform(original);
  documentStore.notice = null;
  documentStore.statusMessage = null;
});

describe('自動の確認', () => {
  it('見つかった版を通知バーに出す', () => {
    let deliver: (info: UpdateInfo) => void = () => {};
    usePlatform({
      onUpdateAvailable: (handler) => {
        deliver = handler;
        return () => {};
      },
    });

    installUpdateNotice();
    deliver(INFO);

    expect(documentStore.notice?.message).toBe(ja.update.available('0.2.0'));
    expect(documentStore.notice?.actions?.map((a) => a.label)).toEqual([ja.update.install, ja.update.notes]);
  });

  it('既に出ている通知を上書きしない', () => {
    let deliver: (info: UpdateInfo) => void = () => {};
    usePlatform({
      onUpdateAvailable: (handler) => {
        deliver = handler;
        return () => {};
      },
    });
    const existing = { level: 'warning' as const, message: '外部で変更されました' };
    documentStore.notice = existing;

    installUpdateNotice();
    deliver(INFO);

    expect(documentStore.notice).toStrictEqual(existing);
  });
});

describe('手動の確認', () => {
  it('新しい版が無ければステータスバーで伝える', async () => {
    usePlatform({ checkUpdate: () => Promise.resolve(null) });

    await checkForUpdates();

    expect(documentStore.statusMessage).toBe(ja.update.upToDate);
    expect(documentStore.notice).toBeNull();
  });

  it('失敗は通知バーに出す', async () => {
    usePlatform({ checkUpdate: () => Promise.reject(new Error('offline')) });

    await checkForUpdates();

    expect(documentStore.notice).toMatchObject({ level: 'error', message: ja.update.checkFailed('offline') });
  });
});

describe('適用', () => {
  async function pressInstall(refusal: () => Promise<InstallRefusal>): Promise<void> {
    const installUpdate = vi.fn(refusal);
    usePlatform({ checkUpdate: () => Promise.resolve(INFO), installUpdate });
    await checkForUpdates();
    documentStore.notice?.actions?.[0]?.run();
    await vi.waitFor(() => expect(installUpdate).toHaveBeenCalled());
  }

  it('未保存の変更があれば、同じ操作を残して保存を促す', async () => {
    await pressInstall(() => Promise.resolve('dirty'));

    await vi.waitFor(() => expect(documentStore.notice?.level).toBe('warning'));
    expect(documentStore.notice?.message).toBe(ja.update.dirty);
    expect(documentStore.notice?.actions?.map((a) => a.label)).toEqual([ja.update.install]);
  });

  it('失敗は通知バーに出す', async () => {
    await pressInstall(() => Promise.reject(new Error('signature')));

    await vi.waitFor(() => expect(documentStore.notice?.level).toBe('error'));
    expect(documentStore.notice?.message).toBe(ja.update.installFailed('signature'));
  });
});
