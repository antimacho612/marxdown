// WARNING: ここに import を足すとそのままクリティカルパスに載るため、追加の前に性能予算の判定手順を通すこと。

import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/shell.css';
import '@/styles/preview/preview.css';

// size-limit の `main-*.js` 予算計測が実態を反映しなくなるため Svelte を動的 import しない
import { mount } from 'svelte';

import App from '@/app/App.svelte';
import { startup } from '@/app/bootstrap';
import { loadMessages } from '@/i18n';

const root = document.getElementById('root');

function renderShell(): void {
  if (!root) return;
  mount(App, { target: root });
}

// NOTE: 起動処理は通知やシェルの描画で文言を使うため、文言の読み込みを待ってから始める。
void loadMessages().then(() => startup(renderShell));
