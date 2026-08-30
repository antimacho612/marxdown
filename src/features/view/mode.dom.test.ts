// @vitest-environment jsdom
/**
 * 表示モードの決定と切り替え（F-MODE-06, 07 / 03.ux-spec/02-view-modes.md）。
 *
 * **エディタの実体はモックする。** ここで見たいのはモードの筋道であって
 * CodeMirror ではない。実体まで載せると `editor` チャンク（178KB）の評価が
 * テストの度に走り、落ちたときにどちらの問題か切り分けられなくなる。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view/store.svelte';
import type { Bootstrap, DocumentMeta } from '@/platform';

const mountEditorLazily = vi.fn(() => Promise.resolve());

vi.mock('@/features/editor/open-editor', () => ({
  mountEditorLazily: () => mountEditorLazily(),
  preloadEditor: () => Promise.resolve(),
}));

const { decideInitialMode, initMode, resetMode, setMode, togglePreview } = await import('./mode');

function meta(overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    path: 'C:/a.md',
    eol: 'lf',
    bom: false,
    encoding: 'utf8',
    mtimeMs: 0,
    size: 0,
    readonly: false,
    ...overrides,
  };
}

function bootstrap(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return { mode: null, ...overrides } as Bootstrap;
}

beforeEach(() => {
  mountEditorLazily.mockClear();
  resetMode();
  document.body.innerHTML = '<div id="mx-preview"></div>';
  initMode('preview');
});

describe('起動時のモード (F-MODE-07)', () => {
  it('CLI の --mode が最優先', () => {
    expect(decideInitialMode(bootstrap({ mode: 'edit' }), meta())).toBe('edit');
  });

  it('読み取り専用なら Preview', () => {
    expect(decideInitialMode(bootstrap(), meta({ readonly: true }))).toBe('preview');
  });

  it('--mode は読み取り専用より優先する', () => {
    // 明示された指定を、属性で黙って覆さない。読めないファイルではなく、
    // 書き込めないファイルを開いているだけである。
    expect(decideInitialMode(bootstrap({ mode: 'edit' }), meta({ readonly: true }))).toBe('edit');
  });

  it('何も無ければ Preview（既定）', () => {
    expect(decideInitialMode(null, null)).toBe('preview');
  });
});

describe('モードの適用', () => {
  it('<html> に data-mx-mode を立てる', async () => {
    await setMode('edit');
    expect(document.documentElement.dataset['mxMode']).toBe('edit');
    expect(viewStore.mode).toBe('edit');
  });

  it('エディタが要るモードでだけチャンクを取りに行く', async () => {
    await setMode('edit');
    expect(mountEditorLazily).toHaveBeenCalledTimes(1);

    await setMode('preview');
    expect(mountEditorLazily).toHaveBeenCalledTimes(1);
  });

  it('同じモードへの切り替えは何もしない', async () => {
    await setMode('preview');
    expect(mountEditorLazily).not.toHaveBeenCalled();
  });
});

describe('Preview とのトグル (Ctrl+Shift+V)', () => {
  it('Preview から直前の編集モードへ、また戻る', async () => {
    await togglePreview();
    expect(viewStore.mode).toBe('edit');

    await togglePreview();
    expect(viewStore.mode).toBe('preview');
  });

  it('直前の編集モードを覚えている', async () => {
    // Split（Phase 5）が入ると、ここが 'split' にもなる。
    await setMode('split');
    await setMode('preview');
    await togglePreview();
    expect(viewStore.mode).toBe('split');
  });
});

describe('スクロール位置の保持 (03.ux-spec/02-view-modes.md §4)', () => {
  it('Preview へ戻ると位置が復元される', async () => {
    const preview = document.querySelector<HTMLElement>('#mx-preview');
    if (!preview) throw new Error('受け皿が無い');

    // jsdom はレイアウトを持たないので scrollTop を素直に受ける。
    // ここで見たいのは「離れる前に控えて、戻すときに当てる」筋道そのもの。
    preview.scrollTop = 320;

    await setMode('edit');
    preview.scrollTop = 0; // display:none 相当（実機では代入せずとも 0 になる）

    await setMode('preview');
    expect(preview.scrollTop).toBe(320);
  });
});
