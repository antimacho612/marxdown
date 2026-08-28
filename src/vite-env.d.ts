/// <reference types="vite/client" />

import type { Bootstrap } from '@/platform/types';

declare global {
  /**
   * Rust の `initialization_script` が注入する起動ペイロード。
   * 02.architecture/05-startup-sequence.md §1 の「同期的に手にできる初期ドキュメント」。
   */
  var __MARXDOWN_BOOTSTRAP__: Bootstrap | undefined;
  /** 同スクリプトが打つ T4（初期スクリプト評価開始）。 */
  var __MARXDOWN_T4__: number | undefined;
}

export {};
