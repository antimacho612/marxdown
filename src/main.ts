// WARNING: ここに import を足すとそのままクリティカルパスに載るため、追加の前に 05.performance-budget/06-decision-flow.md の判定手順を通すこと。

import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/shell.css';
import '@/styles/preview/preview.css';

// size-limit の `main-*.js` 予算計測が実態を反映しなくなるため Svelte を動的 import しない
import { mount } from 'svelte';

import App from '@/app/App.svelte';
import { startup } from '@/app/bootstrap';

const root = document.getElementById('root');

function renderShell(): void {
  if (!root) return;
  mount(App, { target: root });
}

void startup(renderShell);
