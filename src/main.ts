// WARNING: ここに import を足すとそのままクリティカルパスに載るため、追加の前に性能予算の判定手順を通すこと。

import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/shell.css';
import '@/styles/preview/preview.css';

// size-limit の `main-*.js` 予算計測が実態を反映しなくなるため Svelte を動的 import しない
import { mount } from 'svelte';

import App from '@/app/App.svelte';
import { startup } from '@/app/bootstrap';
import { loadMessages, resolveLocale, setLocale } from '@/i18n';
import { getPlatform } from '@/platform';

const root = document.getElementById('root');

function renderShell(): void {
  if (!root) return;
  mount(App, { target: root });
}

const bootstrap = getPlatform().getBootstrap();

// 表示言語は起動時に 1 回だけ決める（ADR-0026）。
// NOTE: 本文の面（`#mx-preview` / `#mx-editor`）は `index.html` で `lang="ja"` に固定してある。
// `<html lang>` を継承させると、英語の UI で日本語の本文の漢字が中国語の字形で描かれうる（OQ-49）。
const locale = resolveLocale(bootstrap?.settings['ui.language'] ?? 'auto', navigator.languages);
setLocale(locale);
document.documentElement.lang = locale;

// OS 別の差分（ADR-0028 §3.3）。
// Windows では何も読まない。
const os = bootstrap?.platform;
const osSupport =
  os === 'macos' ? import('@/platform-ui/macos') : os === 'linux' ? import('@/platform-ui/linux') : undefined;

// NOTE: 起動処理は通知やシェルの描画で文言を使うため、文言の読み込みを待ってから始める。
void Promise.all([loadMessages(), osSupport]).then(([, support]) => {
  support?.install();
  return startup(renderShell);
});
