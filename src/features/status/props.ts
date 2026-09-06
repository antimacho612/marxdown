/**
 * ステータスバーのポップアップメニューの props。
 *
 * **型だけのモジュール**。中身（`StatusMenu.svelte` と項目の表）は遅延チャンクにあり、
 * ボタン側（`app/StatusMenuButton.svelte`）は押されるまでロードしない。
 * 型は `import type` で消えるので、ここを参照してもチャンクは引きずられない
 * （`features/menu/props.ts` と同じ形）。
 */
import type { Component } from 'svelte';

/**
 * どの項目のメニューか。
 *
 * **`kind` だけを渡して、中身は向こうに置く。** ラベルの一覧を props で渡すと、
 * その配列を組み立てる側（＝ステータスバー＝`main`）に全部の文言が載る。
 * クリティカルパスに載ってよいのは「押せるボタンが 1 つある」ことだけである。
 */
export type StatusMenuKind = 'encoding' | 'mode';

/**
 * パネルを置く位置（ビューポート基準の CSS ピクセル）。
 *
 * **ステータスバーが `overflow: hidden` なので `position: fixed` で逃がしている。**
 * 測るのはボタン側（`app/StatusMenuButton.svelte`）で、押した瞬間の値を渡す。
 */
export interface StatusMenuAnchor {
  /** パネルの左端。 */
  left: number;
  /** パネルの下端（ビューポート下端からの距離）。ボタンの上端に合わせる。 */
  bottom: number;
}

export interface StatusMenuProps {
  kind: StatusMenuKind;
  anchor: StatusMenuAnchor;
  /**
   * 閉じる。`refocus` が false のときはボタンにフォーカスを戻さない
   * （項目を実行した直後は、関心が実行先へ移っているため）。
   */
  onclose: (refocus?: boolean) => void;
}

export type StatusMenu = Component<StatusMenuProps>;
