// @vitest-environment jsdom
/**
 * 表示モードの決定と切り替え（F-MODE-06, 07 / 03.ux-spec/02-view-modes.md）。
 *
 * **エディターの実体はモックする。** ここで見たいのはモードの筋道であって
 * CodeMirror ではない。実体まで載せると `editor` チャンク（178KB）の評価が
 * テストの度に走り、落ちたときにどちらの問題か切り分けられなくなる。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { viewStore } from '@/features/view';
import type { Bootstrap, DocumentMeta } from '@/platform';

const mountEditorLazily = vi.fn(() => Promise.resolve());
const setSplitSyncLazily = vi.fn((_on: boolean) => Promise.resolve());
const relayoutEditorLazily = vi.fn(() => Promise.resolve());

vi.mock('@/features/editor', () => ({
  mountEditorLazily: () => mountEditorLazily(),
  preloadEditor: () => Promise.resolve(),
  relayoutEditorLazily: () => relayoutEditorLazily(),
  setSplitSyncLazily: (on: boolean) => setSplitSyncLazily(on),
}));

const { cycleMode, decideInitialMode, initMode, resetMode, setMode, togglePreview, toggleSplit } =
  await import('./mode');

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
  relayoutEditorLazily.mockClear();
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

  it('エディターが要るモードでだけチャンクを取りに行く', async () => {
    await setMode('edit');
    expect(mountEditorLazily).toHaveBeenCalledTimes(1);

    await setMode('preview');
    expect(mountEditorLazily).toHaveBeenCalledTimes(1);
  });

  it('同じモードへの切り替えは何もしない', async () => {
    await setMode('preview');
    expect(mountEditorLazily).not.toHaveBeenCalled();
  });

  /**
   * **Monaco は `display: none` のあいだ寸法を失う**（ADR-0009 の受け入れコスト 3）。
   * 面が出るモードに入ったら測り直させる。**Preview へ抜けるときは呼ばない**
   * （見えない面のために仕事をしない / N-PERF-05）。
   */
  it('エディターが見えるモードに入ったら器を測り直させる', async () => {
    await setMode('edit');
    expect(relayoutEditorLazily).toHaveBeenCalledTimes(1);

    await setMode('split');
    expect(relayoutEditorLazily).toHaveBeenCalledTimes(2);

    await setMode('preview');
    expect(relayoutEditorLazily).toHaveBeenCalledTimes(2);
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
    // **「直前の編集モード」であって「Edit」ではない。**
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

describe('Split (F-MODE-03 / 03.ux-spec/03-split-mode.md)', () => {
  /** Preview へ戻すと「分割を解いた」ではなく「読む側へ移った」ことになる。 */
  it('Ctrl+\\ は Edit との間で切り替える', async () => {
    await setMode('edit');

    await toggleSplit();
    expect(viewStore.mode).toBe('split');

    await toggleSplit();
    expect(viewStore.mode).toBe('edit');
  });

  it('Preview から押すと Split に入る', async () => {
    await toggleSplit();
    expect(viewStore.mode).toBe('split');
  });

  it('Ctrl+Shift+M は順送りする', async () => {
    expect(viewStore.mode).toBe('preview');

    await cycleMode();
    expect(viewStore.mode).toBe('edit');
    await cycleMode();
    expect(viewStore.mode).toBe('split');
    await cycleMode();
    expect(viewStore.mode).toBe('preview');
  });

  /** 片面しか見えていないときに購読を残さない（N-PERF-05）。 */
  it('同期は Split のときだけ動かす', async () => {
    setSplitSyncLazily.mockClear();

    await setMode('split');
    expect(setSplitSyncLazily).toHaveBeenLastCalledWith(true);

    await setMode('edit');
    expect(setSplitSyncLazily).toHaveBeenLastCalledWith(false);
  });

  /**
   * **Split でもプレビューは見えている。**
   * 「Preview モードか」で判定すると、Split へ移るたびに位置が控えられてしまう。
   */
  it('Preview → Split ではスクロール位置を控えない', async () => {
    const preview = document.querySelector<HTMLElement>('#mx-preview');
    if (!preview) throw new Error('受け皿が無い');

    preview.scrollTop = 200;
    await setMode('split');
    // 控えていないので、戻す処理も走らない（実機では位置がそのまま残る）
    expect(preview.scrollTop).toBe(200);

    preview.scrollTop = 640;
    await setMode('edit');
    preview.scrollTop = 0;

    // Edit で初めて隠れる。そこで控えた 640 が Split へ戻ったときに当たる。
    await setMode('split');
    expect(preview.scrollTop).toBe(640);
  });
});
