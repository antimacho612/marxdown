/**
 * エントリポイント。`main` チャンクのルート。
 *
 * ここに import を足すと、そのままクリティカルパスに載る。
 * 追加の前に 05.performance-budget/06-decision-flow.md の判定手順を通すこと。
 *
 * # なぜ Svelte を動的 import しないか
 *
 * 動的 import にすると Svelte のランタイムが `main` チャンクから外れ、
 * 150KB の予算計測（size-limit の `main-*.js`）が実態を映さなくなる。
 * **予算を守るためには、予算の計測対象に載っている必要がある。**
 */
/*
 * **この import が最初にあることが仕様である**（OQ-30 / `markdown/worker/boot.ts`）。
 *
 * Worker のスレッドとグローバルスコープの生成に 32〜35ms かかる。ここで立てておくと、
 * bootstrap の読み取りからシェルの描画までが、まるごとその 35ms に重なる。
 * 下に動かすと、重ならなかったぶんがそのまま「本文が読める」までに乗る。
 */
import '@/markdown/worker/boot';
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

void startup(renderShell);
