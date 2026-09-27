/**
 * プレビュー内の全文検索（F-VIEW-10）。
 * 遅延チャンクで `Ctrl+F` を押すまでロードされない。
 *
 * 一致箇所を `<mark>` で包む実装にはしない（段階的描画で増える DOM と混ざる／`huge.md` で本文の DOM が作り直され続ける／`data-line` の行マッピングが壊れる）。
 * 代わりに CSS Custom Highlight API で `Range` を登録するだけにし、DOM には触れない（WebView2 Evergreen / WKWebView のみが対象のため前提にしてよい）。
 */
import { ja } from '@/i18n/ja';
import { registerSearchRefresher } from '@/lib/refresh';
import { bindKeys } from '@/lib/shortcuts';

/**
 * 一度に登録する一致の上限。
 *
 * `huge.md`（2MB）で `e` を検索すると数十万件になる。
 * Range をその数だけ生成すると応答が停止するため、上限で打ち切り、打ち切ったことを件数表示に明示する（表示しないと、すべての一致を検出したものと受け取られる）。
 */
const MAX_MATCHES = 2000;

const HIGHLIGHT_ALL = 'mx-search';
const HIGHLIGHT_CURRENT = 'mx-search-current';

interface SearchState {
  container: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  counter: HTMLElement;
  ranges: Range[];
  index: number;
  truncated: boolean;
  /** 開いている間だけ有効なキーバインドの解除関数。 */
  unbind: () => void;
}

let state: SearchState | null = null;

/** CSS Custom Highlight API が使えるか。 */
function supported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
}

/**
 * 検索を開く。既に開いていれば入力欄を選択し直す。
 *
 * `Ctrl+F` を続けて押したときに現在の語を選択し直して入力できるのは、ブラウザや VS Code と同じ挙動である（Familiar）。
 */
export function openSearch(container: HTMLElement): void {
  if (state) {
    state.input.select();
    state.input.focus();
    return;
  }
  state = mount(container);
  state.input.focus();
}

/** 検索を閉じる。ハイライトとキーバインドも解除する。 */
export function closeSearch(): void {
  if (!state) return;
  state.unbind();
  clearHighlights();
  state.panel.remove();
  state = null;
}

/** 検索パネルが開いているか。 */
export function isOpen(): boolean {
  return state !== null;
}

/**
 * 本文が差し替わったときに呼ぶ。
 *
 * 開いたまま再検索する。
 * 別のファイルを開いても検索語は変わらないことが多く、閉じると操作が増える。
 */
export function refresh(): void {
  if (state) run(state, 0);
}

// このチャンクが読み込まれた時点で、本文の差し替えに追従できるようにしておく。
// 読み込まれていない場合は一度も検索していない状態であり、何も起きない。
registerSearchRefresher(refresh);

function mount(container: HTMLElement): SearchState {
  const panel = document.createElement('div');
  panel.className = 'mx-search';
  panel.setAttribute('role', 'search');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mx-search__input';
  input.setAttribute('aria-label', ja.search.label);
  input.placeholder = ja.search.placeholder;

  const counter = document.createElement('span');
  counter.className = 'mx-search__counter';
  counter.setAttribute('aria-live', 'polite');

  const prev = button('mx-search__nav', '‹', ja.search.previous, () => step(-1));
  const next = button('mx-search__nav', '›', ja.search.next, () => step(1));
  const close = button('mx-search__close', '✕', ja.search.close, closeSearch);

  panel.append(input, counter, prev, next, close);
  document.body.append(panel);

  // 開いている間だけ有効なキー。
  // 閉じたら解除する。使用していない機能のキーをグローバルに残さない。
  const unbind = bindKeys([
    { key: 'F3', run: () => step(1) },
    { key: 'Shift+F3', run: () => step(-1) },
    { key: 'Escape', run: () => closeSearch() },
  ]);

  const created: SearchState = {
    container,
    panel,
    input,
    counter,
    ranges: [],
    index: 0,
    truncated: false,
    unbind,
  };

  input.addEventListener('input', () => run(created, 0));
  // Enter は入力欄に限定する。グローバルに登録すると、他の場所の Enter まで処理してしまう。
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  });

  return created;
}

function button(className: string, label: string, aria: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.setAttribute('aria-label', aria);
  el.addEventListener('click', onClick);
  return el;
}

function run(current: SearchState, index: number): void {
  const query = current.input.value;

  clearHighlights();
  current.ranges = [];
  current.truncated = false;
  current.index = 0;

  if (query === '') {
    render(current);
    return;
  }

  const { ranges, truncated } = findRanges(current.container, query);
  current.ranges = ranges;
  current.truncated = truncated;
  current.index = ranges.length === 0 ? 0 : Math.min(index, ranges.length - 1);

  paintHighlights(current);
  render(current);
  reveal(current);
}

function step(delta: number): void {
  if (!state || state.ranges.length === 0) return;
  const count = state.ranges.length;
  state.index = (state.index + delta + count) % count;
  paintHighlights(state);
  render(state);
  reveal(state);
}

/**
 * 本文のテキストノードを 1 本の文字列として見て、一致位置を `Range` に変換する。
 *
 * ノードをまたぐ一致（`<em>` で分割されている語など）も検出できるよう、連結した文字列の上で検索してから、オフセットを各ノードへ割り当て直す。
 */
function findRanges(container: HTMLElement, query: string): { ranges: Range[]; truncated: boolean } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 空のノードと、検索パネル自身の中は対象外にする
      if ((node.textContent ?? '') === '') return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.mx-search')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += node.textContent ?? '';
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: Range[] = [];

  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    if (ranges.length >= MAX_MATCHES) return { ranges, truncated: true };

    const range = toRange(nodes, starts, at, at + needle.length);
    if (range) ranges.push(range);
    // 空文字は手前でも除外しているが、無限ループを避けるためここでも確認する
    from = at + Math.max(1, needle.length);
  }

  return { ranges, truncated: false };
}

/** 連結文字列上の `[start, end)` を DOM の `Range` に変換する。 */
function toRange(nodes: Text[], starts: number[], start: number, end: number): Range | null {
  const startAt = locate(nodes, starts, start);
  const endAt = locate(nodes, starts, end);
  if (!startAt || !endAt) return null;

  const range = document.createRange();
  range.setStart(startAt.node, startAt.offset);
  range.setEnd(endAt.node, endAt.offset);
  return range;
}

function locate(nodes: Text[], starts: number[], position: number): { node: Text; offset: number } | null {
  // `starts` は昇順であるため二分探索できる
  let lo = 0;
  let hi = nodes.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = starts[mid];
    if (at === undefined) break;
    if (at <= position) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const node = nodes[found];
  const base = starts[found];
  if (!node || base === undefined) return null;

  const length = node.textContent?.length ?? 0;
  return { node, offset: Math.min(position - base, length) };
}

function paintHighlights(current: SearchState): void {
  if (!supported()) return;

  const currentRange = current.ranges[current.index];
  const others = current.ranges.filter((r) => r !== currentRange);

  CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...others));
  CSS.highlights.set(HIGHLIGHT_CURRENT, currentRange ? new Highlight(currentRange) : new Highlight());
}

function clearHighlights(): void {
  if (!supported()) return;
  CSS.highlights.delete(HIGHLIGHT_ALL);
  CSS.highlights.delete(HIGHLIGHT_CURRENT);
}

function render(current: SearchState): void {
  const count = current.ranges.length;
  current.counter.textContent =
    current.input.value === ''
      ? ''
      : count === 0
        ? ja.search.noMatch
        : ja.search.position(current.index + 1, count, current.truncated);

  current.panel.dataset['mxEmpty'] = current.input.value !== '' && count === 0 ? 'true' : 'false';
}

/** 現在の一致が表示範囲の外にあればスクロールする。 */
function reveal(current: SearchState): void {
  const range = current.ranges[current.index];
  if (!range) return;

  const rect = range.getBoundingClientRect();
  const view = current.container.getBoundingClientRect();
  if (rect.top >= view.top && rect.bottom <= view.bottom) return;

  current.container.scrollTop += rect.top - view.top - view.height / 3;
}
