/**
 * 見出しジャンプのパレットの出し入れ（`Ctrl+Shift+O`）。
 *
 * **このモジュールから先が遅延チャンク**（`assets/outline-*.js`）。
 * 起動時には存在せず、`Ctrl+Shift+O` を押して初めてロードされる
 * （06.roadmap/m1.5-shell-and-settings.md §3 の完了条件と同じ扱い）。
 *
 * 形は `features/settings/panel.ts` と同じで、理由も同じ。`App.svelte` に
 * `{#if open}` で埋め込むと、開閉のフラグとロード済みのコンポーネントを
 * シェルが持つことになる。**ここで自分をマウントすれば、シェルは何も知らないままでいられる。**
 */
import { mount, unmount } from 'svelte';

import { bindKeys } from '@/lib/shortcuts';

import JumpPalette from './JumpPalette.svelte';

let host: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;
let unbind: (() => void) | null = null;

/** 開く前にフォーカスがあった場所。閉じたらここへ戻す。 */
let opener: HTMLElement | null = null;

/** 開く。既に開いていれば入力欄を選び直すだけ（`openSearch` と同じ / Familiar）。 */
export function openJumpPalette(): void {
  if (host) {
    focusInput();
    return;
  }

  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  host = document.createElement('div');
  // body は 3 行の grid（`shell.css`）。**空の要素でも行が増えない**よう contents にする。
  host.style.display = 'contents';
  document.body.append(host);

  instance = mount(JumpPalette, { target: host, props: { onclose: closeJumpPalette } });

  // 開いている間だけ効くキー。**押されてもいない機能のキーをグローバルに残さない**
  // （`search.ts` と同じ）。`whenEditing` なのは、フォーカスが入力欄にあるため。
  unbind = bindKeys([{ key: 'Escape', run: () => closeJumpPalette(), whenEditing: true }]);
}

export function closeJumpPalette(): void {
  if (!instance || !host) return;

  unbind?.();
  unbind = null;
  void unmount(instance);
  host.remove();
  instance = null;
  host = null;

  // フォーカスを戻さないと `<body>` へ落ちる（`panel.ts` と同じ理由）。
  if (opener?.isConnected) opener.focus();
  opener = null;
}

function focusInput(): void {
  const input = host?.querySelector('input');
  input?.select();
  input?.focus();
}
