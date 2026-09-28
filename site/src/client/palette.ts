/**
 * ガイドの横断検索。アプリのコマンドパレットと同じく、↑↓ で選んで Enter で移動する。
 *
 * 索引（`search/<言語>.json`）はビルド時に作ったもので、初めて開いたときに 1 回だけ読み込む。
 */

type Kind = 'page' | 'section' | 'shortcut' | 'setting' | 'syntax';

interface Entry {
  k: Kind;
  t: string;
  m: string;
  a: string;
  u: string;
}

interface Scored {
  entry: Entry;
  score: number;
}

const LIMIT = 40;

let index: Promise<Entry[]> | undefined;
let bound = false;
let results: Entry[] = [];
let selected = 0;

async function loadIndex(url: string): Promise<Entry[]> {
  const response = await fetch(url);
  return (await response.json()) as Entry[];
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** 見出しに一致した部分を強調する。一致の判定は NFKC で正規化した文字列で行う。 */
function highlight(title: string, query: string): string {
  if (query === '') return escapeHtml(title);
  const position = normalize(title).indexOf(query);
  if (position < 0) return escapeHtml(title);
  return `${escapeHtml(title.slice(0, position))}<mark>${escapeHtml(title.slice(position, position + query.length))}</mark>${escapeHtml(title.slice(position + query.length))}`;
}

/**
 * 空白で区切った語がすべて含まれるものを残し、見出しへの一致を優先して並べる。
 *
 * 語を空白で区切るのは、`ctrl p` のように修飾キーとキーを分けて打っても見つかるようにするためである。
 */
function search(entries: readonly Entry[], query: string): Entry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries.filter((entry) => entry.k === 'page');

  const compact = (text: string) => normalize(text).replaceAll(/\s*\+\s*/g, '+');
  const scored: Scored[] = [];
  for (const entry of entries) {
    const title = normalize(entry.t);
    const haystack = `${title} ${normalize(entry.m)} ${compact(entry.a)} ${normalize(entry.a)}`;
    if (terms.some((term) => !haystack.includes(term))) continue;

    const whole = terms.join(' ');
    let score = 0;
    if (title === whole) score += 100;
    else if (title.startsWith(whole)) score += 60;
    else if (title.includes(whole)) score += 40;
    if (compact(entry.a) === compact(whole)) score += 80;
    if (entry.k === 'page') score += 10;
    scored.push({ entry, score });
  }
  return scored
    .toSorted((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((item) => item.entry);
}

function render(dialog: HTMLDialogElement, query: string): void {
  const list = dialog.querySelector<HTMLElement>('[data-palette-results]');
  if (!list) return;
  const kinds = JSON.parse(dialog.dataset['kinds'] ?? '{}') as Record<Kind, string>;
  const normalized = normalize(query.trim());

  if (results.length === 0) {
    list.innerHTML = `<li class="palette__empty">${escapeHtml(dialog.dataset['empty'] ?? '')}</li>`;
    return;
  }

  list.innerHTML = results
    .map(
      (entry, position) => `
      <li class="palette__item" role="option" id="palette-option-${position}" aria-selected="${position === selected}">
        <a href="${escapeHtml(entry.u)}" tabindex="-1">
          <span class="palette__title">${highlight(entry.t, normalized)}</span>
          <span class="palette__meta">${escapeHtml(entry.m)}</span>
          <span class="palette__aside">${escapeHtml(entry.a || kinds[entry.k])}</span>
        </a>
      </li>`,
    )
    .join('');
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  dialog.querySelector('[data-palette-input]')?.setAttribute('aria-activedescendant', `palette-option-${selected}`);
}

function move(dialog: HTMLDialogElement, delta: number): void {
  if (results.length === 0) return;
  selected = (selected + delta + results.length) % results.length;
  const items = dialog.querySelectorAll('[role="option"]');
  for (const [position, item] of items.entries()) item.setAttribute('aria-selected', String(position === selected));
  items[selected]?.scrollIntoView({ block: 'nearest' });
  dialog.querySelector('[data-palette-input]')?.setAttribute('aria-activedescendant', `palette-option-${selected}`);
}

function go(dialog: HTMLDialogElement, entry: Entry | undefined): void {
  if (!entry) return;
  dialog.close();
  window.location.assign(entry.u);
}

async function update(dialog: HTMLDialogElement, query: string): Promise<void> {
  if (!index) return;
  results = search(await index, query);
  selected = 0;
  render(dialog, query);
}

function bind(dialog: HTMLDialogElement, input: HTMLInputElement): void {
  input.addEventListener('input', () => void update(dialog, input.value));

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        move(dialog, 1);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        move(dialog, -1);
        break;
      }
      case 'Enter': {
        event.preventDefault();
        go(dialog, results[selected]);
        break;
      }
    }
  });

  // 枠の外（::backdrop）を押したら閉じる。
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export async function openPalette(dialog: HTMLDialogElement): Promise<void> {
  const input = dialog.querySelector<HTMLInputElement>('[data-palette-input]');
  if (!input) return;

  if (!bound) {
    bind(dialog, input);
    bound = true;
  }
  if (!dialog.open) dialog.showModal();
  input.value = '';
  input.focus();

  index ??= loadIndex(dialog.dataset['index'] ?? '');
  await update(dialog, '');
}
