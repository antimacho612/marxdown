/**
 * 全ページに共通する処理。ヘッダー・外観の切り替え・コピー・表示されたら現れる要素・検索パレット。
 */
import { prefersReducedMotion } from './motion';
import { initScale } from './scale';

const THEME_KEY = 'marxdown-site-theme';

type ThemeChoice = 'system' | 'light' | 'dark';

function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** 外観の切り替え。選んだものはこのブラウザにだけ保存する。 */
function initTheme(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
  const reflect = (choice: ThemeChoice) => {
    for (const button of buttons) button.setAttribute('aria-checked', String(button.dataset['themeChoice'] === choice));
  };

  reflect(readThemeChoice());
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const choice = (button.dataset['themeChoice'] ?? 'system') as ThemeChoice;
      const root = document.documentElement;
      if (choice === 'system') delete root.dataset['theme'];
      else root.dataset['theme'] = choice;
      try {
        if (choice === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, choice);
      } catch {
        // 保存できない環境（プライベートモードなど）では、このページの間だけ切り替える。
      }
      reflect(choice);
      button.closest('details')?.removeAttribute('open');
      document.dispatchEvent(new CustomEvent('site:themechange'));
    });
  }
}

function initHeader(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) return;

  const update = () => header.toggleAttribute('data-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });

  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  toggle?.addEventListener('click', () => {
    const open = !header.hasAttribute('data-menu-open');
    header.toggleAttribute('data-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  header.querySelector('#site-nav')?.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('a')) return;
    header.removeAttribute('data-menu-open');
    toggle?.setAttribute('aria-expanded', 'false');
  });

  // ポップアップは 1 つだけ開き、外を押したら閉じる。
  const popovers = [...document.querySelectorAll<HTMLDetailsElement>('[data-popover]')];
  for (const popover of popovers) {
    popover.addEventListener('toggle', () => {
      if (!popover.open) return;
      for (const other of popovers) if (other !== popover) other.open = false;
    });
  }
  document.addEventListener('click', (event) => {
    for (const popover of popovers) {
      if (popover.open && !popover.contains(event.target as Node)) popover.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const popover of popovers) {
      if (!popover.open) continue;
      popover.open = false;
      popover.querySelector('summary')?.focus();
    }
  });
}

async function copy(button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(button.dataset['copy'] ?? '');
  } catch {
    // クリップボードを使えない環境では何もしない。値は画面上に見えている。
    return;
  }
  button.setAttribute('data-copied', '');
  setTimeout(() => button.removeAttribute('data-copied'), 1600);
}

/** `data-copy` を持つボタンで、その値をクリップボードにコピーする。 */
function initCopy(): void {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-copy]');
    if (button) void copy(button);
  });
}

/** `data-reveal` を持つ要素を、画面に入ったときに現す。 */
function initReveal(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (prefersReducedMotion()) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-revealed', '');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const element of elements) observer.observe(element);
}

/** 検索パレット。索引とパレットの処理は、初めて開くときに読み込む。 */
function initPalette(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-palette]');
  if (!dialog) return;

  const open = async () => {
    const { openPalette } = await import('./palette');
    await openPalette(dialog);
  };

  for (const trigger of document.querySelectorAll('[data-palette-open]')) {
    trigger.addEventListener('click', () => void open());
  }
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof Element && target.closest('input, textarea, select, [contenteditable]') !== null;
    if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      void open();
    }
  });
}

export function initCommon(): void {
  initTheme();
  initHeader();
  initCopy();
  initReveal();
  initPalette();
  initScale();
}
