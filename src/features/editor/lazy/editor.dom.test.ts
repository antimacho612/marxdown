// @vitest-environment jsdom
/**
 * Undo で保存済みの内容まで戻ったら dirty を解除する回帰テスト（#43）。
 *
 * それまでは「内容が変わった」の真偽だけで dirty を立てていたため、Undo で
 * 編集前 / 保存直後の内容まで戻っても dirty が残ったままだった。
 *
 * `mountEditor` を実際に通して Monaco を jsdom で載せる。
 * Monaco はレイアウトと OS のテーマを問い合わせるので、jsdom に無いものを最小限だけ立てる（`preview/search.dom.test.ts` と同じ手当て）。
 * 本物の描画は要らない。ここで見たいのは
 * 「モデルの版が基準に戻ったら dirty が外れるか」だけである。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { documentStore, markClean, resetDocumentText, setDocumentText } from '@/features/document';

import { mountEditor } from './editor';
import { monaco } from './monaco';

function type(editor: monaco.editor.IStandaloneCodeEditor, text: string): void {
  const model = editor.getModel();
  if (!model) throw new Error('モデルが無い');
  const end = model.getFullModelRange().getEndPosition();
  model.pushEditOperations(null, [{ range: monaco.Range.fromPositions(end, end), text }], () => null);
}

beforeEach(() => {
  resetDocumentText();
  documentStore.isDirty = false;
  document.body.innerHTML = '<div id="mx-editor"></div>';

  // Monaco が要求するが jsdom に無いもの（`ResizeObserver` / `matchMedia` /
  // `queryCommandSupported`）は **`tests/setup.ts`** にある。
  // モジュールの評価時に読まれるので、ここでは間に合わない。
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
});

describe('Undo でダーティが戻る (#43)', () => {
  it('編集前・保存直後まで戻ると dirty が外れる', () => {
    setDocumentText('# hello\n');
    const host = document.querySelector<HTMLElement>('#mx-editor');
    if (!host) throw new Error('受け皿が無い');
    const editor = mountEditor(host);
    const model = editor.getModel();
    if (!model) throw new Error('モデルが無い');

    type(editor, '追記1');
    expect(documentStore.isDirty).toBe(true);

    model.undo();
    expect(model.getValue(monaco.editor.EndOfLinePreference.LF)).toBe('# hello\n');
    expect(documentStore.isDirty).toBe(false);

    model.redo();
    expect(documentStore.isDirty).toBe(true);

    // 保存した体にする（save.ts はここで markClean() を呼ぶ）。
    markClean();
    expect(documentStore.isDirty).toBe(false);

    type(editor, '追記2');
    expect(documentStore.isDirty).toBe(true);

    model.undo(); // 保存直後の内容まで戻る
    expect(documentStore.isDirty).toBe(false);

    model.redo();
    expect(documentStore.isDirty).toBe(true);
  });
});
