// @vitest-environment jsdom
/**
 * Mermaid の描画まわり（F-VIEW-12 / 04.tech-stack/04-markdown.md §4）。
 *
 * Mermaid 本体は差し替える。jsdom には `getBBox` が無く、実物は図を描けない。
 * ここで確かめたいのは §4 が課す 4 つ（遅延ロード / 監視と解放 / キャッシュ / 失敗時のフォールバック）であり、
 * どれも Mermaid が何を返すかには依存しない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderDiagram = vi.fn();
const initialize = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initialize(...args),
    render: (id: string, text: string) => renderDiagram(id, text) as Promise<{ svg: string }>,
  },
}));

/** 観測した要素を覚えるだけの `IntersectionObserver`。jsdom は実装を持たない。 */
class FakeObserver {
  static instances: FakeObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
    this.disconnected = true;
  }

  /** ビューポートに入ったことにする。 */
  enter(element: Element): void {
    this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never);
  }
}

function container(...sources: string[]): HTMLElement {
  const root = document.createElement('div');
  root.id = 'mx-preview';
  for (const source of sources) {
    const element = document.createElement('div');
    element.className = 'mx-mermaid';
    element.textContent = source;
    root.append(element);
  }
  document.body.append(root);
  return root;
}

function diagrams(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.mx-mermaid')];
}

/** 監視と描画を進めて、非同期の描画が終わるまで待つ。 */
async function enterAll(root: HTMLElement): Promise<void> {
  const observer = FakeObserver.instances.at(-1);
  for (const element of diagrams(root)) observer?.enter(element);
  await vi.waitFor(() => {
    expect(diagrams(root).every((element) => element.dataset['mxMermaidState'] !== 'pending')).toBe(true);
  });
}

beforeEach(() => {
  document.body.replaceChildren();
  FakeObserver.instances = [];
  renderDiagram.mockReset();
  initialize.mockReset();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

describe('遅延ロードと監視', () => {
  it('ビューポートに入るまで Mermaid を呼ばない', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();

    const root = container('graph TD;');
    observeMermaid(root);

    expect(renderDiagram).not.toHaveBeenCalled();
    expect(FakeObserver.instances.at(-1)?.observed.size).toBe(1);
  });

  it('描画したものは監視から外す', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();
    renderDiagram.mockResolvedValue({ svg: '<svg><g></g></svg>' });

    const root = container('graph TD;');
    observeMermaid(root);
    await enterAll(root);

    expect(FakeObserver.instances.at(-1)?.observed.size).toBe(0);
  });

  it('呼び直すと前の監視を捨てる（`paint` が本文を差し替えるため / OQ-18）', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();

    const first = container('graph TD;');
    observeMermaid(first);
    first.remove();

    const second = container('graph LR;');
    observeMermaid(second);

    const observer = FakeObserver.instances.at(-1);
    expect(observer?.observed.size).toBe(1);
    expect([...(observer?.observed ?? [])][0]?.textContent).toBe('graph LR;');
  });

  it('解放すると監視もキャッシュも残らない（N-PERF-06）', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();
    renderDiagram.mockResolvedValue({ svg: '<svg><g></g></svg>' });

    const root = container('graph TD;');
    observeMermaid(root);
    await enterAll(root);

    disposeMermaid();
    expect(FakeObserver.instances.at(-1)?.disconnected).toBe(true);

    // キャッシュが残っていれば 2 回目の描画で Mermaid は呼ばれない。
    const again = container('graph TD;');
    observeMermaid(again);
    await enterAll(again);
    expect(renderDiagram).toHaveBeenCalledTimes(2);
  });
});

describe('キャッシュ', () => {
  it('同じ記述は描き直さない（Split の打鍵ごとの再描画）', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();
    renderDiagram.mockResolvedValue({ svg: '<svg><g></g></svg>' });

    const first = container('graph TD;');
    observeMermaid(first);
    await enterAll(first);
    first.remove();

    const second = container('graph TD;');
    observeMermaid(second);
    await enterAll(second);

    expect(renderDiagram).toHaveBeenCalledTimes(1);
    expect(second.querySelector('svg')).not.toBeNull();
  });
});

describe('描けなかったとき', () => {
  it('コードブロックとして記述を残す（N-REL-04）', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();
    renderDiagram.mockRejectedValue(new Error('Syntax error in text'));

    const root = container('これは Mermaid の記法ではない');
    observeMermaid(root);
    await enterAll(root);

    const element = diagrams(root)[0];
    expect(element?.dataset['mxMermaidState']).toBe('error');
    expect(element?.querySelector('code')?.textContent).toBe('これは Mermaid の記法ではない');
  });

  it('Mermaid が body に残した図を片付ける', async () => {
    const { observeMermaid, disposeMermaid } = await import('./mermaid');
    disposeMermaid();

    // 失敗時、Mermaid は測定用の要素に「Syntax error」の図を描いたまま残す。
    renderDiagram.mockImplementation((id: string) => {
      const scratch = document.createElement('div');
      scratch.id = id;
      document.body.append(scratch);
      return Promise.reject(new Error('Syntax error in text'));
    });

    const root = container('壊れた記述');
    observeMermaid(root);
    await enterAll(root);

    expect([...document.body.children].some((child) => child.id.startsWith('mx-mermaid-'))).toBe(false);
  });
});
