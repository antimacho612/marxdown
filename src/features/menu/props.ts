/**
 * ハンバーガーメニュー本体の props。
 *
 * **型だけのモジュール**。`AppMenu.svelte` は遅延チャンクにあり、
 * ボタン側（`app/MenuButton.svelte`）はそれを押されるまでロードしない。
 * 型は `import type` で消えるので、ここを参照してもチャンクは引きずられない。
 */
import type { Component } from 'svelte';

export interface AppMenuProps {
  /**
   * 閉じる。`refocus` が false のときはボタンにフォーカスを戻さない
   * （項目を実行した直後は、関心が実行先へ移っているため）。
   */
  onclose: (refocus?: boolean) => void;
  /** 開いた直後に末尾の項目へ着地するか（`↑` で開いたとき）。 */
  focusLast: boolean;
}

export type AppMenu = Component<AppMenuProps>;
