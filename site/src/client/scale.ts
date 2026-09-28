/**
 * 見本のウィンドウを、置き場所の幅に合わせる。
 *
 * 論理上の幅（`--mw-width`）より狭い場所では、`data-scale-min` までは幅を詰めて中身を折り返させ、それより狭ければ `zoom` で縮める。
 * 縮めるだけにすると、スマートフォンの幅では文字が読めない大きさになる。
 */

interface Target {
  element: HTMLElement;
  width: number;
  min: number;
}

const targets = new Map<Element, Target>();

function fit(box: Element): void {
  const target = targets.get(box);
  if (!target) return;
  const available = box.clientWidth;
  if (available === 0) return;

  const width = Math.max(target.min, Math.min(target.width, available));
  target.element.style.setProperty('--mw-width', `${width}px`);
  target.element.style.zoom = String(Math.min(1, available / width));
}

export function initScale(): void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) fit(entry.target);
  });

  for (const element of document.querySelectorAll<HTMLElement>('[data-scale]')) {
    const box = element.closest('[data-scale-box]') ?? element.parentElement;
    if (!box) continue;
    const declared = getComputedStyle(element).getPropertyValue('--mw-width').trim().replace(/px$/, '');
    const width = Number(declared) || element.offsetWidth;
    const min = Number(element.dataset['scaleMin'] ?? width);
    targets.set(box, { element, width, min: Math.min(min, width) });
    observer.observe(box);
    fit(box);
  }
}
