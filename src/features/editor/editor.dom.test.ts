// @vitest-environment jsdom
/**
 * Undo で保存済みの内容まで戻ったら dirty を解除する回帰テスト（#43）。
 *
 * それまでは `docChanged` の真偽だけで dirty を立てていたため、Undo で
 * 編集前 / 保存直後の内容まで戻っても dirty が残ったままだった。
 * `mountEditor` を実際に通し、CodeMirror の `history()` を使って確かめる。
 */
import { redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it } from 'vitest';

import { markClean } from '@/features/document/dirty';
import { documentStore } from '@/features/document/store.svelte';
import { resetDocumentText, setDocumentText } from '@/features/document/text';

import { mountEditor } from './editor';

function type(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

beforeEach(() => {
  resetDocumentText();
  documentStore.isDirty = false;
  document.body.innerHTML = '<div id="mx-editor"></div>';

  // CodeMirror はレイアウトを測ってスクロール位置などを決める。jsdom に無いので、
  // 空の矩形を返すだけの最小限のものを立てる（`preview/search.dom.test.ts` と同じ手当て）。
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
});

describe('Undo でダーティが戻る (#43)', () => {
  it('編集前・保存直後まで戻ると dirty が外れる', () => {
    setDocumentText('# hello\n');
    const host = document.querySelector<HTMLElement>('#mx-editor');
    if (!host) throw new Error('受け皿が無い');
    const view = mountEditor(host);

    type(view, '追記1');
    expect(documentStore.isDirty).toBe(true);

    undo(view);
    expect(view.state.doc.toString()).toBe('# hello\n');
    expect(documentStore.isDirty).toBe(false);

    redo(view);
    expect(documentStore.isDirty).toBe(true);

    // 保存した体にする（save.ts はここで markClean() を呼ぶ）。
    markClean();
    expect(documentStore.isDirty).toBe(false);

    type(view, '追記2');
    expect(documentStore.isDirty).toBe(true);

    undo(view); // 保存直後の内容まで戻る
    expect(documentStore.isDirty).toBe(false);

    redo(view);
    expect(documentStore.isDirty).toBe(true);
  });
});
