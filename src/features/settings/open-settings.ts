/**
 * 設定 UI を開く入口（F-CONF-05）。
 *
 * 呼ぶ側が 2 つある（`Ctrl+,` のキーバインドと、ハンバーガーメニューの項目）ため、
 * **動的 import の一行だけを持つモジュール**として切り出してある。
 * `open-search.ts` と同じ形で、理由も同じ（`app/` と `features/menu/` の間に
 * 直接の参照を生やさない）。
 *
 * ここに置いても `settings` チャンクは遅延のまま。押されるまで何もロードされない。
 */
export async function openSettingsLazily(): Promise<void> {
  const { openSettings } = await import('./lazy/panel');
  openSettings();
}
