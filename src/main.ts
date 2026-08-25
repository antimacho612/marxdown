/**
 * エントリポイント。`main` チャンクのルート。
 *
 * ここに import を足すと、そのままクリティカルパスに載る。
 * 追加の前に 05.performance-budget.md §6 の判定手順を通すこと。
 *
 * # なぜ Svelte を動的 import しないか
 *
 * 動的 import にすると Svelte のランタイムが `main` チャンクから外れ、
 * 150KB の予算計測（size-limit の `main-*.js`）が実態を映さなくなる。
 * **予算を守るためには、予算の計測対象に載っている必要がある。**
 */
import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/shell.css';
import '@/styles/preview/preview.css';

import { mount } from 'svelte';

import App from '@/app/App.svelte';
import { startup } from '@/app/bootstrap';

const root = document.getElementById('root');

function renderShell(): void {
  if (!root) return;
  mount(App, { target: root });
}

/**
 * CodeMirror の参照実装画面への分岐（`?spike=editor`）。
 *
 * 動的 import なので `editor` チャンクは通常の起動では一切ロードされない。
 * これ自体が「既定モードが Preview であることがバンドル分割の境界になる」
 * （02.architecture.md §5.1 の要点 3）の実証になっている。
 */
function spikeRoute(): string | null {
  return new URLSearchParams(globalThis.location.search).get('spike');
}

if (spikeRoute() === 'editor') {
  const host = document.getElementById('mx-preview');
  if (host) {
    void import('@/spike/spike-editor').then(({ mountEditorSpike }) => mountEditorSpike(host));
  }
} else {
  void startup(renderShell);
}
