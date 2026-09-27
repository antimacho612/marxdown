import { afterEach, describe, expect, it } from 'vitest';

import { getPlatform, setPlatform, type Platform } from './index';

const original = getPlatform();

afterEach(() => {
  setPlatform(original);
});

describe('getPlatform', () => {
  it('Tauri の外では web 実装が選ばれる', () => {
    expect(getPlatform().kind).toBe('web');
  });

  it('差し替えられる（テスト時のインメモリ実装のため）', () => {
    const stub = { ...original, kind: 'web' as const, getBootstrap: () => null };
    setPlatform(stub as Platform);
    expect(getPlatform().getBootstrap()).toBeNull();
  });

  it('web 実装が Platform インタフェースを満たす', () => {
    // メソッドが 1 つでも欠けると、dev:web で実行時に失敗する
    const required: (keyof Platform)[] = [
      'kind',
      'getBootstrap',
      'readDocument',
      'writeDocument',
      'resolveAsset',
      'allowImageDir',
      'listDir',
      'listFiles',
      'setSession',
      'pushRecent',
      'removeRecent',
      'setZoom',
      'setSplit',
      'pickFile',
      'pickFolder',
      'pickSavePath',
      'exportHtml',
      'exportPdf',
      'inlineImage',
      'setDirty',
      'confirmDiscard',
      'readSettings',
      'writeSettings',
      'openSettingsFile',
      'watchPath',
      'unwatchPath',
      'onFileChanged',
      'onSettingsChanged',
      'onDragDrop',
      'minimizeWindow',
      'toggleMaximizeWindow',
      'closeWindow',
      'isWindowMaximized',
      'onWindowMaximizedChanged',
      'setSnapLayoutsTarget',
      'onMaximizeHoverChanged',
      'ready',
      'reportTrace',
      'warmDone',
      'benchInputDone',
      'openExternal',
      'appInfo',
      'openBundledFile',
      'openLocalFile',
      'revealInFileManager',
      'onOpenRequest',
      'onSaveAndQuit',
      'onSaveAndClose',
      'openSatellite',
      'stashTransfer',
      'takeTransfer',
      'sendTabToWindow',
      'onTabArrive',
      'beginTabDrag',
      'moveTabDrag',
      'endTabDrag',
      'onTabDragOver',
    ];
    for (const key of required) {
      expect(original[key], `web 実装に ${key} が無い`).toBeDefined();
    }
  });
});
