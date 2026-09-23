/**
 * ハンバーガーメニュー本体の props。
 *
 * 型だけを持つモジュールである。
 * `AppMenu.svelte` は遅延チャンクにあり、ボタン側（`app/MenuButton.svelte`）は操作されるまで読み込まない。
 * 型は `import type` でビルド時に除去されるため、ここを参照してもチャンクは含まれない。
 */
import type { Component } from 'svelte';

/** ハンバーガーメニュー本体に渡す props。 */
export interface AppMenuProps {
  /**
   * 閉じる。`refocus` が false のときはボタンにフォーカスを戻さない（項目を実行した直後は、関心が実行先へ移っているため）。
   */
  onclose: (refocus?: boolean) => void;
  /** 開いた直後に末尾の項目へ着地するか（`↑` で開いたとき）。 */
  focusLast: boolean;
}

/** メニュー本体のコンポーネント型。ボタン側は動的 import した実体をこの型で受ける。 */
export type AppMenu = Component<AppMenuProps>;
