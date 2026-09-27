/**
 * パレットの出し入れ（コマンドパレット / 見出しジャンプ）。
 *
 * `App.svelte` に `{#if open}` で埋め込むと、開閉のフラグと読み込み済みのコンポーネントをシェルが持つことになる。
 * ここで自身をマウントすれば、シェルはこの機能を参照せずに済む（`settings/lazy/panel.ts` と同じ形）。
 *
 * 同時に開けるのは 1 つだけである。別のパレットを開くと、先に開いていたほうは閉じる。
 * 2 つ並ぶと、キーもフォーカスもどちらが受け取るのかが決まらない。
 */
import { mount, unmount, type Component } from 'svelte';

import { bindKeys } from '@/lib/shortcuts';

let host: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;
let unbind: (() => void) | null = null;

/** 開く前にフォーカスがあった場所。閉じたらここへ戻す。 */
let opener: HTMLElement | null = null;

/** いま開いているものの識別。同じものをもう一度開いたときは入力欄を選び直すだけにする。 */
let current: string | null = null;

/**
 * パレットを開く。既に同じものが開いていれば、入力欄を選び直す（`openSearch` と同じ / Familiar）。
 *
 * `props` に `onclose` は含めない。閉じる処理はここが渡す。
 */
export function openPalette<P extends Record<string, unknown>>(
  id: string,
  component: Component<P & { onclose: () => void }>,
  props: P,
): void {
  if (current === id) {
    focusInput();
    return;
  }
  closePalette();

  current = id;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  host = document.createElement('div');
  // body は 3 行の grid である（`shell.css`）。空の要素でも行が増えないよう `display: contents` にする。
  host.style.display = 'contents';
  document.body.append(host);

  instance = mount(component, { target: host, props: { ...props, onclose: closePalette } });

  // 開いている間だけ有効なキー。
  // 使用していない機能のキーをグローバルに残さない（`search.ts` と同じ）。
  unbind = bindKeys([{ key: 'Escape', run: () => closePalette() }]);
}

/** 閉じる。キーバインドも解除し、フォーカスを開く前の位置へ戻す。 */
export function closePalette(): void {
  if (!instance || !host) return;

  unbind?.();
  unbind = null;
  void unmount(instance);
  host.remove();
  instance = null;
  host = null;
  current = null;

  // フォーカスを戻さないと `<body>` へ移る（`panel.ts` と同じ理由）。
  if (opener?.isConnected) opener.focus();
  opener = null;
}

function focusInput(): void {
  const input = host?.querySelector('input');
  input?.select();
  input?.focus();
}
