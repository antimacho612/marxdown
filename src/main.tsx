/**
 * エントリポイント。`main` チャンクのルート。
 *
 * ここに import を足すと、そのままクリティカルパスに載る。
 * 追加の前に 05.performance-budget.md §6 の判定手順を通すこと。
 *
 * # なぜ React を動的 import しないか
 *
 * 動的 import にすると React が `main` チャンクから外れ、
 * 150KB の予算計測（size-limit の `main-*.js`）が実態を映さなくなる。
 * **予算を守るためには、予算の計測対象に載っている必要がある。**
 */
import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/shell.css';
import '@/styles/preview/preview.css';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { startup } from '@/app/bootstrap';

const root = document.getElementById('root');

function renderShell(): void {
  if (!root) return;

  // StrictMode は付けない。開発時に副作用が 2 回走ると、
  // 起動計測と Worker への送信回数が実態と変わってしまう。
  createRoot(root).render(<App />);
}

/**
 * S4 / S5 のスパイク画面への分岐（`?spike=editor`）。
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
