// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { documentStore } from '@/features/document';
import { hasCommand, isCommandListed, runCommand } from '@/lib/commands';
import type { DocumentMeta } from '@/platform';

import { installCommands, KEY_BINDINGS } from './commands';

const META: DocumentMeta = {
  path: 'C:\\Users\\me\\repos\\marxdown\\README.md',
  eol: 'lf',
  bom: false,
  encoding: 'utf8',
  mtimeMs: 0,
  size: 1024,
  readonly: false,
};

let uninstall: () => void = () => {};

beforeEach(() => {
  documentStore.meta = null;
  uninstall = installCommands();
});

afterEach(() => {
  uninstall();
});

describe('コマンドレジストリ (06.roadmap/m2-editor.md §1.2)', () => {
  /**
   * **2 つの表がずれていないこと。**
   *
   * `key → id` と `id → run` を分けた以上、id を書き換えたときに片方だけ直す
   * 事故が起きうる。型は `CommandId` までしか守ってくれない（存在しない id を
   * キーに割り当てても、押したときに黙って何も起きないだけになる）。
   */
  it('割り当てたキーの id は、すべて登録されている', () => {
    const unregistered = KEY_BINDINGS.filter((binding) => !hasCommand(binding.id));

    expect(unregistered).toEqual([]);
  });

  it('同じキーを 2 つのコマンドに割り当てていない', () => {
    const keys = KEY_BINDINGS.map((binding) => binding.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * Principle 3「Simple Means Low Cognitive Load」。
   * **判定の唯一の根拠がここにある**（メニューもパレットもこれを引く）。
   */
  it('文書を開いていないと、文書に対するコマンドは一覧に出ない', () => {
    expect(isCommandListed('document.reload')).toBe(false);
    expect(isCommandListed('find.open')).toBe(false);
    expect(isCommandListed('preview.zoomIn')).toBe(false);

    // 文書に依存しないものは、開いていなくても出る。
    expect(isCommandListed('document.open')).toBe(true);
    expect(isCommandListed('settings.open')).toBe(true);
    expect(isCommandListed('app.quit')).toBe(true);
  });

  it('文書を開くと、文書に対するコマンドが一覧に出る', () => {
    documentStore.meta = META;

    expect(isCommandListed('document.reload')).toBe(true);
    expect(isCommandListed('find.open')).toBe(true);
    expect(isCommandListed('preview.zoomIn')).toBe(true);
  });

  /**
   * 一覧に出ていない＝実行できない、ではない（`lib/commands.ts` の `Command`）。
   * `F5` は文書が無くても WebView へ渡さずに飲み込む必要があり、
   * そのためには**押されたときに登録済みのコマンドへ届く**ことが要る。
   */
  it('一覧に出ないコマンドも、実行そのものは妨げられない', () => {
    expect(isCommandListed('document.reload')).toBe(false);
    expect(() => {
      runCommand('document.reload');
    }).not.toThrow();
  });

  it('登録されていない id を実行しても落ちない', () => {
    uninstall();

    expect(() => {
      runCommand('document.open');
    }).not.toThrow();
  });
});
