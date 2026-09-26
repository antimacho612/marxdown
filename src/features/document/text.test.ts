/**
 * 本文テキストの持ち主が状況で変わることの検証（ADR-0005 / `text.ts`）。
 *
 * ここが壊れると、エディターをマウントした時点で本文が空になったり、`huge.md` の 2MB を二重に保持し続けたりする。
 * どちらも画面には出ない。
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

/** テキストを 1 つ持つだけの偽エディター。Monaco は要らない。 */
function fakePort(initial: string): EditorTextPort & {
  text: string;
  replace: ReturnType<typeof vi.fn>;
  switched: { key: number; documentId: string }[];
} {
  const port = {
    text: initial,
    read: () => port.text,
    replace: vi.fn((next: string) => {
      port.text = next;
    }),
    sync: vi.fn(),
    /** 1 行だけの差し替え（F-VIEW-01）。 */
    replaceLine: vi.fn((line: number, next: string) => {
      const lines = port.text.split('\n');
      lines[line] = next;
      port.text = lines.join('\n');
    }),
    /** 文書の切り替え。どのタブのどの文書で呼ばれたかを覚える。 */
    switchTo: vi.fn((key: number, documentId: string, next: string) => {
      port.text = next;
      port.switched.push({ key, documentId });
    }),
    switched: [] as { key: number; documentId: string }[],
    dispose: vi.fn(),
    relabel: vi.fn(),
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
    // `huge.md`（2MB）で 2MB 余計に保持し続けることになる。常駐アプリでは蓄積する。
    setDocumentText('控えとして持っている内容');
    const port = fakePort('マウント前の内容');
    attachEditor(port);

    // マウントした時点で控えは渡してある。ここから先の真実はエディター側だけにある。
    port.text = 'その後の編集';
    detachEditor();
    expect(getDocumentText()).toBe('その後の編集');
  });

  it('載せた時点で、開いている文書をエディターへ渡す', () => {
    // エディターは自分がどのタブのものかを知らない（`attachEditor`）。
    // 渡さないと、`Ctrl+Shift+V` で入った編集面が空になる。
    setDocumentText('本文', { key: 3, documentId: 'C:/work/a.md' });
    const port = fakePort('');
    attachEditor(port);

    expect(port.text).toBe('本文');
    expect(port.switched).toEqual([{ key: 3, documentId: 'C:/work/a.md' }]);
  });

  it('文書ごとにキーを渡す。同じタブでも別のファイルなら別の文書として渡る', () => {
    // 同じものとして渡すと、Undo で前のファイルの本文が編集面へ入る（N-CMP-03）。
    const port = fakePort('');
    attachEditor(port);

    setDocumentText('a', { key: 1, documentId: 'C:/work/a.md' });
    setDocumentText('b', { key: 1, documentId: 'C:/work/b.md' });

    expect(port.switched).toEqual([
      { key: 0, documentId: '<none>' },
      { key: 1, documentId: 'C:/work/a.md' },
      { key: 1, documentId: 'C:/work/b.md' },
    ]);
  });
});

describe('エディターを外すとき', () => {
  it('外す前の内容を控えへ戻す', () => {
    setDocumentText('最初');
    const port = fakePort('');
    attachEditor(port);
    port.text = '編集後';

    detachEditor();
    expect(getDocumentText()).toBe('編集後');
  });

  it('載っていないときに外しても壊れない', () => {
    setDocumentText('そのまま');
    detachEditor();
    expect(getDocumentText()).toBe('そのまま');
  });
});
