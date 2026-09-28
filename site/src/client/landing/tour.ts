/**
 * 読む・書く・整える・探すの紹介。画面の中央を通過した段落に合わせて、ウィンドウの状態を切り替える。
 *
 * どの段落から見始めても同じ結果になるよう、段落ごとに最初の状態を作り直してから演出を始める。
 * 動きを減らす設定のときは、演出の終わりの状態だけを作る。
 */
import { play, prefersReducedMotion, Timeline, typeInto, whileVisible } from '../motion';
import { MockWindow, offsetWithin, scrollWithin } from '../window';

interface Labels {
  split: string;
  bold: string;
  align: string;
  quickOpen: string;
  explorer: string;
}

type Step = (timeline: Timeline, animate: boolean) => Promise<void>;

/** 演出で足した要素の印。段落を切り替えるときにまとめて取り除く。 */
const ADDED = 'data-demo-added';

function lineOf(code: HTMLElement, predicate: (text: string) => boolean): HTMLElement | undefined {
  return [...code.querySelectorAll<HTMLElement>('.mw__line')].findLast((line) =>
    predicate(line.querySelector('.mw__lc')?.textContent ?? ''),
  );
}

/** `root` の中で `text` を含む最初のテキストノードの、その部分を `wrap` で包む。 */
function wrapText(root: Element, text: string, wrap: (range: Range) => Element): Element | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const position = node.textContent?.indexOf(text) ?? -1;
    if (position < 0) continue;
    const range = document.createRange();
    range.setStart(node, position);
    range.setEnd(node, position + text.length);
    const wrapper = wrap(range);
    range.surroundContents(wrapper);
    return wrapper;
  }
  return undefined;
}

export function initTour(): void {
  const stage = document.querySelector<HTMLElement>('[data-tour-stage]');
  const root = stage?.querySelector<HTMLElement>('.mw');
  const section = stage?.closest('section');
  const steps = [...document.querySelectorAll<HTMLElement>('.tour__step')];
  if (!stage || !root || !section || steps.length === 0) return;

  const win = new MockWindow(root);
  const labels = JSON.parse(stage.dataset['labels'] ?? '{}') as Labels;
  const typed = stage.dataset['typed'] ?? '';
  const boldTarget = stage.dataset['bold'] ?? '';
  const query = stage.dataset['query'] ?? '';
  const template = stage.querySelector<HTMLTemplateElement>('template[data-aligned-lines]');
  const aligned = JSON.parse(template?.content.textContent || '[]') as string[];

  const designCode = win.code('design');
  const designPreview = win.preview('design');
  const notesCode = win.code('notes');
  const notesPreview = win.preview('notes');
  const palette = root.querySelector<HTMLElement>('[data-quick-open]');
  const paletteInput = root.querySelector<HTMLElement>('[data-quick-open-input]');
  if (!designCode || !designPreview || !notesCode || !notesPreview || !palette || !paletteInput) return;

  // 書式の演出は `notes` の中身を書き換える。戻すために最初の状態を持っておく（Mermaid の図を含まない）。
  const notesOriginal = { code: notesCode.getHTML(), preview: notesPreview.getHTML() };

  const reset = () => {
    for (const element of root.querySelectorAll(`[${ADDED}]`)) element.remove();
    for (const line of designCode.querySelectorAll('[data-current]')) line.removeAttribute('data-current');
    for (const [index, number] of designCode.querySelectorAll('.mw__ln').entries())
      number.textContent = String(index + 1);
    notesCode.innerHTML = notesOriginal.code;
    notesPreview.innerHTML = notesOriginal.preview;
    palette.hidden = true;
    paletteInput.textContent = '';
    for (const item of root.querySelectorAll('[data-path]')) item.removeAttribute('data-current');
    win.showExplorer(false);
    win.hideKeys();
  };

  const toBottom = () => {
    designCode.scrollTop = designCode.scrollHeight;
    designPreview.scrollTop = designPreview.scrollHeight;
  };

  /** Split で打ち込む行を、エディターとプレビューの両方に足す。返り値は文字を足していく先。 */
  const addTask = (): { editor: HTMLElement; preview: Text } | undefined => {
    const last = lineOf(designCode, (text) => text.startsWith('- ['));
    const lastItem = designPreview.querySelector('.contains-task-list > li:last-child');
    if (!last || !lastItem) return undefined;

    const line = last.cloneNode(true) as HTMLElement;
    line.setAttribute(ADDED, '');
    line.setAttribute('data-current', '');
    const content = line.querySelector<HTMLElement>('.mw__lc');
    if (!content) return undefined;
    content.innerHTML =
      '<span class="hljs-bullet">-</span> [ ] <span data-typed></span><span class="mw__caret"></span>';
    last.after(line);
    for (const [index, number] of designCode.querySelectorAll('.mw__ln').entries())
      number.textContent = String(index + 1);

    const item = lastItem.cloneNode(true) as HTMLElement;
    item.setAttribute(ADDED, '');
    const checkbox = item.querySelector('.mx-task');
    const text = document.createTextNode('');
    item.replaceChildren(...(checkbox ? [checkbox, ' '] : []), text);
    lastItem.after(item);

    const editor = content.querySelector<HTMLElement>('[data-typed]');
    return editor ? { editor, preview: text } : undefined;
  };

  const read: Step = async (t, animate) => {
    reset();
    win.setMode('preview');
    win.only(['design'], 'design');
    designPreview.scrollTop = 0;
    if (!animate) return;

    const stops = [...designPreview.querySelectorAll('h2, .mx-math[data-mx-math="inline"]')];
    for (;;) {
      await t.wait(1300);
      for (const stop of stops) {
        await scrollWithin(t, designPreview, offsetWithin(designPreview, stop));
        await t.wait(1500);
      }
      await t.wait(800);
      await scrollWithin(t, designPreview, 0, 1200);
    }
  };

  const write: Step = async (t, animate) => {
    reset();
    win.only(['design'], 'design');
    if (!animate) {
      win.setMode('split');
      const target = addTask();
      if (target) {
        target.editor.textContent = typed;
        target.preview.textContent = typed;
      }
      toBottom();
      return;
    }

    win.setMode('preview');
    designPreview.scrollTop = designPreview.scrollHeight;
    await t.wait(700);
    win.keys('Ctrl+\\', labels.split);
    win.setMode('split');
    toBottom();
    await t.wait(900);

    const target = addTask();
    if (!target) return;
    toBottom();
    for (const char of typed) {
      target.editor.textContent += char;
      target.preview.textContent += char;
      await t.wait(70 + Math.random() * 60);
    }
  };

  const format: Step = async (t, animate) => {
    reset();
    win.setMode('split');
    win.only(['design', 'notes'], 'notes');

    const sentence = lineOf(notesCode, (text) => text.includes(boldTarget));
    const tableLines = [...notesCode.querySelectorAll<HTMLElement>('.mw__line')].filter((line) =>
      (line.querySelector('.mw__lc')?.textContent ?? '').startsWith('|'),
    );

    const bold = () => {
      const selection = sentence?.querySelector('.mw__selection');
      if (selection) selection.outerHTML = `<span class="hljs-strong">**${boldTarget}**</span>`;
      else if (sentence) {
        wrapText(sentence, boldTarget, () => {
          const span = document.createElement('span');
          span.className = 'hljs-strong';
          return span;
        });
        const strong = sentence.querySelector('.hljs-strong');
        if (strong) strong.textContent = `**${boldTarget}**`;
      }
      wrapText(notesPreview, boldTarget, () => document.createElement('strong'));
    };
    const align = () => {
      for (const [index, line] of tableLines.entries()) {
        const content = line.querySelector('.mw__lc');
        const replacement = aligned[index];
        if (content && replacement !== undefined) content.innerHTML = replacement;
        line.animate(
          [
            { backgroundColor: 'color-mix(in srgb, var(--mx-color-accent) 18%, transparent)' },
            { backgroundColor: 'transparent' },
          ],
          { duration: 900, easing: 'ease-out', delay: index * 40 },
        );
      }
    };

    if (!animate) {
      bold();
      align();
      return;
    }

    await t.wait(800);
    if (sentence) {
      sentence.setAttribute('data-current', '');
      wrapText(sentence, boldTarget, () => {
        const span = document.createElement('span');
        span.className = 'mw__selection';
        return span;
      });
    }
    await t.wait(800);
    win.keys('Ctrl+B', labels.bold);
    bold();
    await t.wait(1600);

    sentence?.removeAttribute('data-current');
    tableLines[2]?.setAttribute('data-current', '');
    await t.wait(700);
    win.keys('Shift+Alt+F', labels.align);
    align();
  };

  const find: Step = async (t, animate) => {
    reset();
    win.setMode('preview');
    win.only(['design', 'notes'], 'notes');
    const target = root.querySelector('[data-path="docs/design/cache-strategy.md"]');

    if (!animate) {
      win.showExplorer(true);
      win.activate('design');
      target?.setAttribute('data-current', '');
      return;
    }

    await t.wait(700);
    win.keys('Ctrl+Shift+E', labels.explorer);
    win.showExplorer(true);
    await t.wait(1300);
    win.keys('Ctrl+P', labels.quickOpen);
    palette.hidden = false;
    await t.wait(500);
    await typeInto(t, paletteInput, query, { delay: 110, jitter: 60 });
    await t.wait(900);
    palette.hidden = true;
    win.activate('design');
    target?.setAttribute('data-current', '');
  };

  const STEPS: Record<string, Step> = { read, write, format, find };
  const animate = !prefersReducedMotion();
  let timeline: Timeline | undefined;
  let activeId = '';

  const activate = (id: string) => {
    if (id === activeId) return;
    activeId = id;
    for (const step of steps) step.toggleAttribute('data-active', step.dataset['step'] === id);
    timeline?.cancel();
    const t = new Timeline();
    timeline = t;
    play(async () => STEPS[id]?.(t, animate));
  };

  // 画面の縦の中央を通る段落を、いま読んでいる段落とみなす。
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activate((entry.target as HTMLElement).dataset['step'] ?? '');
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  for (const step of steps) observer.observe(step);

  // セクションから外れたら演出を止め、戻ってきたら今の段落からやり直す。
  whileVisible(
    section,
    () => () => {
      timeline?.cancel();
      activeId = '';
    },
    { threshold: 0 },
  );

  play(async () => read(new Timeline(), false));
}
