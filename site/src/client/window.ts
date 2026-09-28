/**
 * ウィンドウの見本（`components/AppWindow.svelte`）を操作する。
 *
 * 表示モード・タブ・エクスプローラーの切り替えは、アプリと同じく即座に行う。
 * 動きを付けるのは、押したキーの表示と本文のスクロールだけである。
 */
import type { Timeline } from './motion';

export type Mode = 'preview' | 'edit' | 'split';

const MODE_LABELS: Record<Mode, string> = { preview: 'Preview', edit: 'Edit', split: 'Split' };

export class MockWindow {
  readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get mode(): Mode {
    return (this.root.dataset['mode'] ?? 'preview') as Mode;
  }

  setMode(mode: Mode): void {
    this.root.dataset['mode'] = mode;
    const label = this.root.querySelector('[data-status-mode]');
    if (label) label.textContent = MODE_LABELS[mode];
  }

  tab(id: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-tab="${id}"]`);
  }

  preview(id: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`.mw__preview[data-doc="${id}"]`);
  }

  code(id: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`.mw__code[data-doc="${id}"]`);
  }

  /** タブを開いて前面にする。`flash` を付けると、開いたタブの位置を一瞬示す。 */
  open(id: string, { flash = false }: { flash?: boolean } = {}): void {
    const tab = this.tab(id);
    if (!tab) return;
    tab.hidden = false;
    if (flash) {
      tab.removeAttribute('data-new');
      void tab.offsetWidth;
      tab.setAttribute('data-new', '');
    }
    this.activate(id);
  }

  /** 指定したタブだけを開いた状態にする。 */
  only(ids: readonly string[], active: string): void {
    for (const tab of this.root.querySelectorAll<HTMLElement>('[data-tab]')) {
      tab.hidden = !ids.includes(tab.dataset['tab'] ?? '');
      tab.removeAttribute('data-new');
    }
    this.activate(active);
  }

  activate(id: string): void {
    this.root.dataset['active'] = id;
    for (const tab of this.root.querySelectorAll<HTMLElement>('[data-tab]')) {
      tab.toggleAttribute('data-current', tab.dataset['tab'] === id);
    }
    for (const pane of this.root.querySelectorAll<HTMLElement>('.mw__preview, .mw__code')) {
      pane.hidden = pane.dataset['doc'] !== id;
    }
    const preview = this.preview(id);
    const chars = this.root.querySelector('[data-status-chars]');
    const minutes = this.root.querySelector('[data-status-minutes]');
    if (preview && chars) chars.textContent = preview.dataset['charsLabel'] ?? '';
    if (preview && minutes) minutes.textContent = preview.dataset['minutesLabel'] ?? '';
  }

  showExplorer(show: boolean): void {
    this.root.dataset['explorer'] = show ? 'shown' : 'hidden';
  }

  /** 押したキーを表示する。`Ctrl+Shift+P` の形で渡す。 */
  keys(combo: string, label = ''): void {
    const overlay = this.root.querySelector<HTMLElement>('[data-keys]');
    if (!overlay) return;
    const parts = combo.split(/\+(?=.)/).map((key) => `<kbd>${key}</kbd>`);
    overlay.innerHTML = parts.join('<span>+</span>') + (label ? `<span class="mw__keys-label">${label}</span>` : '');
    overlay.removeAttribute('data-show');
    void overlay.offsetWidth;
    overlay.setAttribute('data-show', '');
  }

  hideKeys(): void {
    this.root.querySelector('[data-keys]')?.removeAttribute('data-show');
  }
}

/** 要素の中を、指定した位置までなめらかにスクロールする。 */
export async function scrollWithin(
  timeline: Timeline,
  container: HTMLElement,
  top: number,
  duration = 900,
): Promise<void> {
  const start = container.scrollTop;
  const target = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
  const distance = target - start;
  if (Math.abs(distance) < 1) return;

  const began = performance.now();
  // 中断されたら、その位置で止める。止めた後の `wait` が中断を呼び出し側へ伝える。
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      if (timeline.cancelled) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - began) / duration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      container.scrollTop = start + distance * eased;
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  await timeline.wait(0);
}

/** `container` の中で、`element` の上端が `offset` の位置に来るスクロール量。 */
export function offsetWithin(container: HTMLElement, element: Element, offset = 24): number {
  const zoom = Number(getComputedStyle(container.closest('.mw') ?? container).zoom) || 1;
  const delta = (element.getBoundingClientRect().top - container.getBoundingClientRect().top) / zoom;
  return container.scrollTop + delta - offset;
}
