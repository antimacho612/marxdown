/**
 * 本文テキストの持ち主が状況で変わることの検証（ADR-0005 / `text.ts`）。
 *
 * ここが壊れると、エディターを載せた瞬間に本文が空になったり、
 * `huge.md` の 2MB を二重に握り続けたりする。**どちらも画面には出ない。**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachEditor,
  detachEditor,
  getDocumentText,
  resetDocumentText,
  setDocumentText,
  type EditorTextPort,
} from './text';

/** テキストを 1 つ持つだけの偽エディター。CodeMirror は要らない。 */
function fakePort(initial: string): EditorTextPort & { text: string; replace: ReturnType<typeof vi.fn> } {
  const port = {
    text: initial,
    read: () => port.text,
    replace: vi.fn((next: string) => {
      port.text = next;
    }),
    sync: vi.fn(),
  };
  return port;
}

beforeEach(() => {
  resetDocumentText();
});

describe('エディターが載っていないあいだ', () => {
  it('渡したテキストをそのまま返す', () => {
    setDocumentText('# a\n');
    expect(getDocumentText()).toBe('# a\n');
  });

  it('何も渡されていなければ空文字', () => {
    expect(getDocumentText()).toBe('');
  });

  it('開き直すと差し替わる', () => {
    setDocumentText('古い');
    setDocumentText('新しい');
    expect(getDocumentText()).toBe('新しい');
  });
});

describe('エディターが載っているあいだ', () => {
  it('エディターの内容が真実になる', () => {
    setDocumentText('読み込んだ内容');
    const port = fakePort(getDocumentText());
    attachEditor(port);

    port.text = '編集した内容';
    expect(getDocumentText()).toBe('編集した内容');
  });

  it('開き直すとエディターの内容も差し替わる', () => {
    setDocumentText('最初');
    const port = fakePort(getDocumentText());
    attachEditor(port);

    setDocumentText('ディスクの最新');
    expect(port.replace).toHaveBeenCalledWith('ディスクの最新');
    expect(getDocumentText()).toBe('ディスクの最新');
  });

  it('二重に持たない', () => {
    // `huge.md`（2MB）で 2MB 余計に握り続けることになる。常駐アプリでは積算する。
    setDocumentText('控えとして持っている内容');
    attachEditor(fakePort('エディターの内容'));

    // 控えが残っていれば、外した後にそれが出てくる。
    detachEditor();
    expect(getDocumentText()).toBe('エディターの内容');
  });
});

describe('エディターを外すとき', () => {
  it('外す前の内容を控えへ戻す', () => {
    setDocumentText('最初');
    const port = fakePort('編集後');
    attachEditor(port);

    detachEditor();
    expect(getDocumentText()).toBe('編集後');
  });

  it('載っていないときに外しても壊れない', () => {
    setDocumentText('そのまま');
    detachEditor();
    expect(getDocumentText()).toBe('そのまま');
  });
});
