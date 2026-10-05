/**
 * Linux の差分（ADR-0028 §3.3 / M10 §4.5・§4.13）。
 * 起動時に Linux でだけ読み込む。
 *
 * 文言・`─ □ ✕` を描かないこと・フォント・既定のコンテキストメニューの抑止を持つ。
 * キーは Windows と同じである。
 */
import './linux.css';

import { getLocale, setMessageRewrite, t } from '@/i18n';

import { rewriter, suppressNativeContextMenu, type Rewrites } from './shared';

/** OS で変わる語（M10 §4.13）。 */
const REWRITES: Readonly<Record<'ja' | 'en', Rewrites>> = {
  ja: [
    ['エクスプローラーで表示', 'ファイルマネージャーで表示'],
    ['タスクトレイ', 'システムトレイ'],
  ],
  en: [['Reveal in File Explorer', 'Open Containing Folder']],
};

/** 起動時に 1 回だけ呼ぶ。文言の読み込み（`loadMessages`）の後に呼ぶこと。 */
export function install(): void {
  const rewrite = rewriter(REWRITES[getLocale()]);
  rewrite(t);
  setMessageRewrite(rewrite);
  suppressNativeContextMenu();
}
