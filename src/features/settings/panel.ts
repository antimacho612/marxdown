/**
 * 設定 UI の出し入れ（F-CONF-05 / ADR-0011）。
 *
 * **このモジュールから先が遅延チャンク**（`assets/settings-*.js`）。
 * 起動時には存在せず、`Ctrl+,` かハンバーガーメニューの「設定」で初めてロードされる
 * （06.roadmap/m1.5-shell-and-settings.md §3 の完了条件）。
 *
 * # App.svelte に置かない
 *
 * `{#if open}` でシェルに埋め込むと、開閉のフラグとロード済みのコンポーネントを
 * `App.svelte` が持つことになり、**クロームのコンポーネントが設定を知っている**
 * 状態になる。ここで自分をマウントすれば、シェル側は何も知らないままでいられる。
 * `search.ts` が検索パネルを自分で組み立てているのと同じ形（ADR-0005）。
 */
import { mount, unmount } from 'svelte';

import SettingsDialog from './SettingsDialog.svelte';

let host: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;

/** 開く前にフォーカスがあった場所。閉じたらここへ戻す。 */
let opener: HTMLElement | null = null;

/**
 * 開く。既に開いていればフォーカスを戻すだけ（`openSearch` と同じ）。
 *
 * `Ctrl+,` を続けて押したときに 2 枚出ないことと、
 * 押した人の関心がパネルにあることを両方満たす。
 */
export function openSettings(): void {
  if (host) {
    focusPanel();
    return;
  }

  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  host = document.createElement('div');
  // body は 3 行の grid（`shell.css`）。**空の要素でも行が増えない**よう
  // `#root` と同じく contents にしておく。ダイアログ自身はトップレイヤに乗る。
  host.style.display = 'contents';
  document.body.append(host);

  instance = mount(SettingsDialog, { target: host, props: { onclose: closeSettings } });
}

export function closeSettings(): void {
  if (!instance || !host) return;

  void unmount(instance);
  host.remove();
  instance = null;
  host = null;

  // フォーカスを戻さないと `<body>` へ落ちる。キーボードだけで操作している人が
  // 現在地を見失う（`MenuButton` の `hide` と同じ理由）。
  if (opener?.isConnected) opener.focus();
  opener = null;
}

export function isSettingsOpen(): boolean {
  return host !== null;
}

function focusPanel(): void {
  host?.querySelector('dialog')?.focus();
}
