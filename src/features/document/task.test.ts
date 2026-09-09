/**
 * プレビュー上のタスクリスト操作（F-VIEW-01 / OQ-05）。
 *
 * 見張りたいのは「テキストのどこを変えたか」である。
 * 触っていない箇所のバイト列を変えないという要件（N-CMP-03）が、この経路にもそのまま効く。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { documentStore } from './store.svelte';
import { toggleTaskAtLine } from './task';
import { getDocumentText, resetDocumentText, setDocumentText } from './text';

beforeEach(() => {
  resetDocumentText();
  documentStore.isDirty = false;
});

describe('チェックの反転', () => {
  it('未完了を完了にする', () => {
    setDocumentText('- [ ] やること\n');
    expect(toggleTaskAtLine(0)).toBe(true);
    expect(getDocumentText()).toBe('- [x] やること\n');
  });

  it('完了を未完了にする', () => {
    setDocumentText('- [x] やること\n');
    expect(toggleTaskAtLine(0)).toBe(false);
    expect(getDocumentText()).toBe('- [ ] やること\n');
  });

  it('大文字の X も完了として扱う (GFM)', () => {
    setDocumentText('- [X] やること\n');
    expect(toggleTaskAtLine(0)).toBe(false);
    expect(getDocumentText()).toBe('- [ ] やること\n');
  });

  it('その行以外を 1 バイトも変えない (N-CMP-03)', () => {
    setDocumentText('# 見出し\n\n- [ ] a\n- [ ] b\n\n本文\n');
    toggleTaskAtLine(3);
    expect(getDocumentText()).toBe('# 見出し\n\n- [ ] a\n- [x] b\n\n本文\n');
  });

  it('字下げと記号の種類を保つ', () => {
    setDocumentText('  * [ ] ネスト\n');
    toggleTaskAtLine(0);
    expect(getDocumentText()).toBe('  * [x] ネスト\n');
  });

  it('順序付きリストでも反転する (GFM)', () => {
    setDocumentText('1. [ ] a\n');
    toggleTaskAtLine(0);
    expect(getDocumentText()).toBe('1. [x] a\n');
  });

  it('行末の空白を保つ', () => {
    // 触っていない箇所のバイト列を変えない。行末の空白は Markdown では改行の意味を持つ。
    setDocumentText('- [ ] a  \n');
    toggleTaskAtLine(0);
    expect(getDocumentText()).toBe('- [x] a  \n');
  });
});

describe('反転しない行', () => {
  it('タスクの形をしていない行では何もしない', () => {
    setDocumentText('- 普通の項目\n');
    expect(toggleTaskAtLine(0)).toBeNull();
    expect(getDocumentText()).toBe('- 普通の項目\n');
  });

  it('記号の直後に空白が無ければ何もしない', () => {
    setDocumentText('- [x]空白なし\n');
    expect(toggleTaskAtLine(0)).toBeNull();
  });

  it('存在しない行では何もしない', () => {
    setDocumentText('- [ ] a\n');
    expect(toggleTaskAtLine(99)).toBeNull();
  });
});

describe('ダーティ', () => {
  it('反転したらダーティにする（自動保存はしない / OQ-05）', () => {
    setDocumentText('- [ ] a\n');
    toggleTaskAtLine(0);
    expect(documentStore.isDirty).toBe(true);
  });

  it('何も変えなかったときはダーティにしない', () => {
    setDocumentText('- 普通の項目\n');
    toggleTaskAtLine(0);
    expect(documentStore.isDirty).toBe(false);
  });
});
