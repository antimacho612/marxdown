/**
 * 設定 UI を開く入口（F-CONF-05）。
 *
 * 呼び出し元が 2 つある（`Ctrl+,` のキーバインドと、ハンバーガーメニューの項目）ため、動的 import の 1 行だけを持つモジュールとして切り出してある。
 * `open-search.ts` と同じ形であり、理由も同じである（`app/` と `features/menu/` の間に直接の参照を作らない）。
 *
 * ここに置いても `settings` チャンクは遅延のままであり、操作されるまで読み込まれない。
 */
/** 設定ダイアログを開く。`settings` チャンクはここで初めて読み込まれる。 */
export async function openSettingsLazily(): Promise<void> {
  const { openSettings } = await import('./lazy/panel');
  openSettings();
}
