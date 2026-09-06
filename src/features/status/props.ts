/**
 * ステータスバーのポップアップメニューの props。
 *
 * 型だけを持つモジュールである。
 * 中身（`StatusMenu.svelte` と項目の表）は遅延チャンクにあり、ボタン側（`app/StatusMenuButton.svelte`）は操作されるまで読み込まない。
 * 型は `import type` でビルド時に除去されるため、ここを参照してもチャンクは含まれない（`features/menu/props.ts` と同じ形）。
 */
import type { Component } from 'svelte';

/**
 * どの項目のメニューか。
 *
 * 渡すのは `kind` だけで、項目の内容は遅延チャンク側に置く。
 * ラベルの一覧を props で渡すと、その配列を組み立てる側（ステータスバー、つまり `main`）にすべての文言が含まれる。
 * クリティカルパスに載せてよいのは、押せるボタンが 1 つあるという情報だけである。
 */
export type StatusMenuKind = 'encoding' | 'mode';

/**
 * パネルを置く位置（ビューポート基準の CSS ピクセル）。
 *
 * ステータスバーが `overflow: hidden` であるため、パネルは `position: fixed` で配置する。
 * 位置を測るのはボタン側（`app/StatusMenuButton.svelte`）で、押した時点の値を渡す。
 */
export interface StatusMenuAnchor {
  /** パネルの左端。 */
  left: number;
  /** パネルの下端（ビューポート下端からの距離）。ボタンの上端に合わせる。 */
  bottom: number;
}

/** ステータスバーのポップアップメニューに渡す props。 */
export interface StatusMenuProps {
  kind: StatusMenuKind;
  anchor: StatusMenuAnchor;
  /**
   * 閉じる。`refocus` が false のときはボタンにフォーカスを戻さない
   * （項目を実行した直後は、関心が実行先へ移っているため）。
   */
  onclose: (refocus?: boolean) => void;
}

/** メニュー本体のコンポーネント型。ボタン側は動的 import した実体をこの型で受ける。 */
export type StatusMenu = Component<StatusMenuProps>;
