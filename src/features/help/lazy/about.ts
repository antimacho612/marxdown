/**
 * 「Marxdown について」の出し入れ（F-OS-09 / ADR-0026）。
 *
 * シェル側に `{#if}` を置かず、ここで自分をマウントする（`features/settings/lazy/panel.ts` と同じ形 / ADR-0005）。
 */
import { mount, unmount } from 'svelte';

import AboutDialog from './AboutDialog.svelte';

let host: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;

/** 開く前にフォーカスがあった場所。閉じたらここへ戻す。 */
let opener: HTMLElement | null = null;

/** 開く。既に開いていればフォーカスを戻すだけ（`openSettings` と同じ）。 */
export function openAbout(): void {
  if (host) {
    host.querySelector('dialog')?.focus();
    return;
  }

  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  host = document.createElement('div');
  // body の grid に行を増やさないため（`openSettings` と同じ）。
  host.style.display = 'contents';
  document.body.append(host);

  instance = mount(AboutDialog, { target: host, props: { onclose: closeAbout } });
}

export function closeAbout(): void {
  if (!instance || !host) return;

  void unmount(instance);
  host.remove();
  instance = null;
  host = null;

  if (opener?.isConnected) opener.focus();
  opener = null;
}
