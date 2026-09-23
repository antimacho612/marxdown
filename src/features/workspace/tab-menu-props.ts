/**
 * タブの右クリックメニューの props。
 *
 * 型だけを持つモジュールである（`features/menu/props.ts` と同じ形）。
 * 本体は遅延チャンクにあり、右クリックされるまで読み込まない。
 */

/** タブの右クリックメニューに渡す props。 */
export interface TabMenuProps {
  /** 対象のタブ。メニューは 1 枚のタブについてのものであり、表示中のタブとは限らない。 */
  tabId: number;
  /** 見出しに出すファイル名。 */
  name: string;
  /** 開く位置（ビューポート座標）。画面からはみ出す場合は本体側で位置を直す。 */
  x: number;
  y: number;
  /**
   * 閉じる。`refocus` が false のときはタブへフォーカスを戻さない（項目を実行した直後は、関心が実行先へ移っているため）。
   */
  onclose: (refocus?: boolean) => void;
}
