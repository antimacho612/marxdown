/**
 * ヒーローの演出。ターミナルに `marxdown README.md` を打ち込むと、その瞬間にウィンドウが現れる。
 * 2 つ目のコマンドは、同じウィンドウにタブとして開く。
 */
import { play, prefersReducedMotion, Timeline, typeInto, whileVisible } from '../motion';
import { MockWindow } from '../window';

function tilt(stage: HTMLElement): void {
  // スクロールに連動するアニメーションを持たないブラウザだけ、スクリプトで同じ動きを作る。
  if (CSS.supports('animation-timeline: view()')) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const rect = stage.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight * 0.75)));
    stage.style.setProperty('--stage-tilt', `${(1 - progress) * 16}deg`);
    stage.style.setProperty('--stage-scale', String(0.94 + progress * 0.06));
  };
  update();
  window.addEventListener(
    'scroll',
    () => {
      frame ||= requestAnimationFrame(update);
    },
    { passive: true },
  );
}

export function initHero(): void {
  const stage = document.querySelector<HTMLElement>('[data-hero-stage]');
  const root = stage?.querySelector<HTMLElement>('.mw');
  const terminal = stage?.querySelector<HTMLElement>('[data-terminal]');
  const slot = stage?.querySelector<HTMLElement>('.hero__window-slot');
  const replay = stage?.querySelector<HTMLButtonElement>('[data-hero-replay]');
  if (!stage || !root || !terminal || !slot || !replay) return;
  if (prefersReducedMotion()) return;

  tilt(stage);

  const win = new MockWindow(root);
  const commands = JSON.parse(stage.dataset['commands'] ?? '[]') as string[];
  const prompt = terminal.dataset['prompt'] ?? '>';
  const body = terminal.querySelector<HTMLElement>('[data-term-body]');
  const current = terminal.querySelector<HTMLElement>('[data-term-current]');
  const input = terminal.querySelector<HTMLElement>('[data-term-input]');
  if (!body || !current || !input) return;

  const reset = () => {
    for (const line of body.querySelectorAll('.term__line:not([data-term-current])')) line.remove();
    input.textContent = '';
    slot.setAttribute('data-waiting', '');
    slot.removeAttribute('data-launched');
    win.only(['readme'], 'readme');
    replay.hidden = true;
    stage.setAttribute('data-ready', '');
  };

  /** 入力を確定し、実行済みの行として残す。プロンプトはすぐに戻る。 */
  const enter = () => {
    const done = document.createElement('div');
    done.className = 'term__line';
    const promptEl = document.createElement('span');
    promptEl.className = 'term__prompt';
    promptEl.textContent = prompt;
    const cmd = document.createElement('span');
    cmd.className = 'term__cmd';
    cmd.textContent = input.textContent;
    done.append(promptEl, ' ', cmd);
    current.before(done);
    input.textContent = '';
  };

  let timeline: Timeline | undefined;

  const run = () => {
    timeline?.cancel();
    const t = new Timeline();
    timeline = t;
    reset();
    play(async () => {
      await t.wait(900);
      await typeInto(t, input, commands[0] ?? '');
      await t.wait(380);
      enter();
      slot.removeAttribute('data-waiting');
      slot.setAttribute('data-launched', '');

      await t.wait(1800);
      await typeInto(t, input, commands[1] ?? '');
      await t.wait(320);
      enter();
      win.open('changelog', { flash: true });

      await t.wait(1400);
      replay.hidden = false;
    });
  };

  replay.addEventListener('click', run);

  let started = false;
  whileVisible(
    stage,
    () => {
      if (started) return;
      started = true;
      run();
    },
    { threshold: 0.15 },
  );
}
