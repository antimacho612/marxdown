/**
 * 紹介ページの小さな演出。どれも画面に入ったときに動き始める。
 */
import { play, prefersReducedMotion, Timeline, whileVisible } from '../motion';

/** 段落の語を、スクロールに合わせて前から順に明るくする。 */
function initStatement(): void {
  const text = document.querySelector<HTMLElement>('[data-statement]');
  if (!text || prefersReducedMotion()) return;
  const chunks = [...text.querySelectorAll<HTMLElement>('.statement__chunk')];

  let frame = 0;
  const update = () => {
    frame = 0;
    const rect = text.getBoundingClientRect();
    const start = window.innerHeight * 0.85;
    const end = window.innerHeight * 0.35;
    const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end + rect.height * 0.6)));
    const lit = Math.round(progress * chunks.length);
    for (const [index, chunk] of chunks.entries()) chunk.toggleAttribute('data-lit', index < lit);
  };
  update();
  window.addEventListener('scroll', () => (frame ||= requestAnimationFrame(update)), { passive: true });
  new ResizeObserver(update).observe(text);
}

/** 数値を 0 から数え上げる。 */
function countUp(element: HTMLElement, duration = 1400): void {
  const target = Number(element.dataset['count']);
  if (!Number.isFinite(target)) return;
  const began = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - began) / duration);
    element.textContent = String(Math.round(target * (1 - (1 - progress) ** 4)));
    if (progress < 1) requestAnimationFrame(step);
  };
  element.textContent = '0';
  requestAnimationFrame(step);
}

/** 3 つのターミナルから、同じウィンドウへタブが開いていく図。 */
function initSpeed(): void {
  const diagram = document.querySelector<HTMLElement>('[data-speed-diagram]');
  const stats = document.querySelector<HTMLElement>('.speed__stats');
  if (!diagram || !stats) return;

  const motion = !prefersReducedMotion();
  let counted = false;
  whileVisible(stats, () => {
    if (counted || !motion) return;
    counted = true;
    for (const value of stats.querySelectorAll<HTMLElement>('[data-count]')) countUp(value);
  });

  const terms = [...diagram.querySelectorAll<HTMLElement>('.speed__term')];
  const packets = [...diagram.querySelectorAll<HTMLElement>('.speed__packet')];
  const tabs = [...diagram.querySelectorAll<HTMLElement>('.speed__tab')];

  const show = (count: number) => {
    for (const [index, tab] of tabs.entries()) {
      tab.toggleAttribute('data-shown', index < count);
      tab.toggleAttribute('data-current', index === count - 1);
    }
  };

  if (!motion) {
    show(tabs.length);
    return;
  }
  show(0);

  whileVisible(diagram, () => {
    const t = new Timeline();
    play(async () => {
      for (;;) {
        show(0);
        await t.wait(700);
        for (const [index, term] of terms.entries()) {
          term.setAttribute('data-active', '');
          await t.wait(350);
          packets[index]?.animate(
            [
              { offsetDistance: '0%', opacity: 0 },
              { opacity: 1, offset: 0.15 },
              { opacity: 1, offset: 0.85 },
              { offsetDistance: '100%', opacity: 0 },
            ],
            { duration: 620, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
          );
          await t.wait(560);
          show(index + 1);
          tabs[index]?.animate(
            [
              { opacity: 0, transform: 'translateY(-4px)' },
              { opacity: 1, transform: 'none' },
            ],
            {
              duration: 260,
              easing: 'ease-out',
            },
          );
          term.removeAttribute('data-active');
          await t.wait(700);
        }
        await t.wait(2200);
      }
    });
    return () => t.cancel();
  });
}

/** 1 文字だけ書き換えて保存し、変わるのがその 1 バイトだけであることを見せる。 */
function initBytes(): void {
  const panel = document.querySelector<HTMLElement>('[data-bytes]');
  const char = panel?.querySelector<HTMLElement>('[data-bytes-char]');
  const save = panel?.querySelector<HTMLElement>('[data-bytes-save]');
  const counter = panel?.querySelector<HTMLElement>('[data-bytes-changed]');
  const target = panel?.querySelector<HTMLElement>('[data-bytes-cell="target"]');
  if (!panel || !char || !save || !counter || !target) return;

  const cells = [...panel.querySelectorAll<HTMLElement>('[data-bytes-cell]')].filter((cell) => cell !== target);
  const face = target.querySelector<HTMLElement>('.bytes__cell-face');
  const before = { char: char.textContent, hex: face?.textContent ?? '' };
  const after = { char: panel.dataset['targetChar'] ?? '', hex: panel.dataset['targetHex'] ?? '' };

  const finish = () => {
    char.textContent = after.char;
    if (face) face.textContent = after.hex;
    target.setAttribute('data-changed', '');
    counter.textContent = '1';
  };

  if (prefersReducedMotion()) {
    finish();
    return;
  }

  whileVisible(
    panel,
    () => {
      const t = new Timeline();
      play(async () => {
        char.textContent = before.char;
        if (face) face.textContent = before.hex;
        target.removeAttribute('data-changed');
        for (const cell of cells) cell.removeAttribute('data-kept');
        counter.textContent = '0';

        await t.wait(900);
        char.setAttribute('data-editing', '');
        await t.wait(700);
        char.textContent = after.char;
        await t.wait(700);
        save.setAttribute('data-pressed', '');
        await t.wait(180);
        save.removeAttribute('data-pressed');
        char.removeAttribute('data-editing');
        finish();
        for (const cell of cells) cell.setAttribute('data-kept', '');
      });
      return () => t.cancel();
    },
    { threshold: 0.5 },
  );
}

/** 信頼できない行を、防御の層ごとに 1 行ずつ止める。 */
function initSecurity(): void {
  const demo = document.querySelector<HTMLElement>('[data-security]');
  if (!demo) return;
  const threats = [...demo.querySelectorAll<HTMLElement>('[data-threat]')];

  if (prefersReducedMotion()) {
    for (const threat of threats) threat.setAttribute('data-blocked', '');
    return;
  }

  let done = false;
  whileVisible(
    demo,
    () => {
      if (done) return;
      done = true;
      const t = new Timeline();
      play(async () => {
        await t.wait(400);
        for (const threat of threats) {
          threat.setAttribute('data-scanning', '');
          await t.wait(520);
          threat.setAttribute('data-blocked', '');
          await t.wait(420);
          threat.removeAttribute('data-scanning');
        }
      });
    },
    { threshold: 0.4 },
  );
}

/** 機能の一覧で、ポインタの位置に光を置く。 */
function initSpotlight(): void {
  const grid = document.querySelector<HTMLElement>('[data-spotlight]');
  grid?.addEventListener('pointermove', (event) => {
    const card = (event.target as Element).closest<HTMLElement>('.feature');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  });
}

/** 最後のロゴは、画面に入ったときに描き直す。 */
function initReplayMarks(): void {
  for (const holder of document.querySelectorAll<HTMLElement>('[data-replay-on-view]')) {
    const svg = holder.querySelector('svg');
    if (!svg) continue;
    svg.setAttribute('data-paused', '');
    whileVisible(holder, () => {
      svg.removeAttribute('data-paused');
    });
  }
}

export function initScenes(): void {
  initStatement();
  initSpeed();
  initBytes();
  initSecurity();
  initSpotlight();
  initReplayMarks();
}
