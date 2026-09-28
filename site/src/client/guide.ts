import '@/styles/tokens.css';
import '@/styles/preview/preview.css';
import '@/styles/preview/math.css';
import 'katex/dist/katex.min.css';
import '../styles/base.css';
import '../styles/guide.css';

import { initCommon } from './common';
import { observeMermaid } from './mermaid';

/** 一覧の絞り込み。空白で区切った語をすべて含む項目だけを残す。 */
function initFilter(): void {
  const input = document.querySelector<HTMLInputElement>('[data-filter]');
  if (!input) return;
  const items = [...document.querySelectorAll<HTMLElement>('[data-filter-item]')];
  const groups = [...document.querySelectorAll<HTMLElement>('[data-filter-group]')];
  const count = document.querySelector('[data-filter-count]');
  const empty = document.querySelector<HTMLElement>('[data-filter-empty]');
  // `Ctrl + P` と `Ctrl+P` のどちらで打っても一致させる。
  const normalize = (text: string) =>
    text
      .normalize('NFKC')
      .toLowerCase()
      .replaceAll(/\s*\+\s*/g, '+');

  const texts = new Map(items.map((item) => [item, normalize(item.dataset['filterText'] ?? item.textContent ?? '')]));

  const apply = () => {
    const terms = normalize(input.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const item of items) {
      const text = texts.get(item) ?? '';
      const match = terms.every((term) => text.includes(term));
      item.hidden = !match;
      if (match) visible += 1;
    }
    for (const group of groups) {
      group.hidden = !group.querySelector('[data-filter-item]:not([hidden])');
    }
    if (count) count.textContent = terms.length > 0 ? `${visible} / ${items.length}` : '';
    if (empty) empty.hidden = visible > 0;
  };

  input.addEventListener('input', apply);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    input.value = '';
    apply();
  });
}

/** 「このページの内容」で、いま読んでいる節に印を付ける。 */
function initToc(): void {
  const links = new Map(
    [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')].map((link) => [
      link.dataset['tocLink'] ?? '',
      link,
    ]),
  );
  const targets = Array.from(links.keys(), (id) => document.getElementById(id)).filter(
    (element): element is HTMLElement => element !== null,
  );
  if (targets.length === 0) return;

  const visible = new Set<Element>();
  const update = () => {
    const current = targets.find((target) => visible.has(target)) ?? null;
    for (const [id, link] of links) link.setAttribute('aria-current', String(current?.id === id));
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      update();
    },
    { rootMargin: '-15% 0px -70% 0px' },
  );
  for (const target of targets) observer.observe(target);
}

initCommon();
initFilter();
initToc();
observeMermaid();
