/**
 * 配色の見本。押した配色を、アプリと同じ宣言（`features/theme/lazy/preset.ts` の `declarations`）でウィンドウに当てる。
 *
 * 利用者が触るまでは、いくつかの配色を順に切り替えて見せる。
 */
import { whileVisible } from '../motion';

type Scheme = 'light' | 'dark';

/** 自動で切り替える順。存在しないものは飛ばす。 */
const TOUR = ['default', 'github', 'dracula', 'nord', 'solarized', 'catppuccin', 'gruvbox', 'tokyo-night', 'rose-pine'];

/** 組み込みの配色は、初めて押されたときに読み込む（アプリと同じ遅延チャンクの中身）。 */
async function loadPresets() {
  const [{ PRESETS }, { declarations }] = await Promise.all([
    import('@/features/theme/lazy/presets'),
    import('@/features/theme/lazy/preset'),
  ]);
  return { presets: PRESETS as Record<string, Parameters<typeof declarations>[0]>, declarations };
}

let loading: ReturnType<typeof loadPresets> | undefined;

async function declarationsOf(id: string, fallback: string): Promise<string> {
  if (id === 'default') return fallback;
  loading ??= loadPresets();
  const { presets, declarations } = await loading;
  const preset = presets[id];
  return preset ? declarations(preset) : fallback;
}

export function initThemes(): void {
  const gallery = document.querySelector<HTMLElement>('[data-theme-gallery]');
  const surface = document.querySelector<HTMLElement>('.themes__window');
  if (!gallery || !surface) return;

  surface.id ||= 'theme-window';
  const style = document.createElement('style');
  document.head.append(style);

  const name = gallery.querySelector('[data-theme-name]');
  const toggle = gallery.querySelector<HTMLElement>('[data-scheme-toggle]');
  const swatches = [...gallery.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const defaultCss = gallery.dataset['defaultCss'] ?? '';

  const systemDark = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const siteScheme = (): Scheme => {
    const chosen = document.documentElement.dataset['theme'];
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return systemDark.matches ? 'dark' : 'light';
  };

  let scheme: Scheme = siteScheme();
  let current = 'default';
  let touched = false;
  let request = 0;

  const reflect = () => {
    const pinned = swatches.find((swatch) => swatch.dataset['preset'] === current)?.dataset['presetScheme'];
    const effective = pinned === 'light' || pinned === 'dark' ? pinned : scheme;
    gallery.dataset['scheme'] = scheme;
    toggle?.toggleAttribute('data-locked', pinned === 'light' || pinned === 'dark');
    for (const button of toggle?.querySelectorAll<HTMLElement>('[data-scheme]') ?? []) {
      button.setAttribute('aria-checked', String(button.dataset['scheme'] === effective));
    }
    for (const swatch of swatches) swatch.setAttribute('aria-pressed', String(swatch.dataset['preset'] === current));
    const label = swatches.find((swatch) => swatch.dataset['preset'] === current)?.dataset['label'];
    if (name && label) name.textContent = label;
  };

  const apply = async (id: string) => {
    current = id;
    reflect();
    const ticket = ++request;
    const css = await declarationsOf(id, defaultCss);
    // 読み込みを待つ間に別の配色が押されていたら、古いほうは当てない。
    if (ticket !== request) return;
    style.textContent = `#${surface.id}{color-scheme:${scheme};${css}}`;
    document.dispatchEvent(new CustomEvent('site:surfacechange'));
  };

  for (const swatch of swatches) {
    swatch.addEventListener('click', () => {
      touched = true;
      void apply(swatch.dataset['preset'] ?? 'default');
    });
  }

  for (const button of toggle?.querySelectorAll<HTMLElement>('[data-scheme]') ?? []) {
    button.addEventListener('click', () => {
      touched = true;
      scheme = button.dataset['scheme'] === 'dark' ? 'dark' : 'light';
      void apply(current);
    });
  }

  document.addEventListener('site:themechange', () => {
    if (touched) return;
    scheme = siteScheme();
    void apply(current);
  });

  void apply('default');

  const tour = TOUR.filter((id) => swatches.some((swatch) => swatch.dataset['preset'] === id));
  whileVisible(
    surface,
    () => {
      if (touched) return;
      let position = 0;
      const timer = setInterval(() => {
        if (touched) {
          clearInterval(timer);
          return;
        }
        position = (position + 1) % tour.length;
        void apply(tour[position] ?? 'default');
      }, 2600);
      return () => clearInterval(timer);
    },
    { threshold: 0.5 },
  );
}
