/** ウィンドウの見本（`components/AppWindow.svelte`）に渡す中身の形。 */

export interface WindowDoc {
  id: string;
  name: string;
  html: string;
  /** 色付けしたソースの行。Edit / Split で使う。 */
  lines?: string[];
  /** ステータスバーの文字数と読了時間。 */
  chars: number;
  minutes: number;
}

export interface TreeItem {
  path: string;
  name: string;
  depth: number;
  folder: boolean;
}

export type WindowMode = 'preview' | 'edit' | 'split';
