import type { ja } from './ja/core';
import type { jaExplorer } from './ja/explorer';
import type { jaHelp } from './ja/help';
import type { jaMarp } from './ja/marp';
import type { jaSettings } from './ja/settings';
import type { jaUpdate } from './ja/update';

/** 日本語の文言から文字列のリテラル型を外したもの。他の言語は日本語と同じキーを持ち、値だけが異なる。 */
type Widen<T> = T extends string
  ? string
  : T extends (...args: never[]) => unknown
    ? T
    : { readonly [K in keyof T]: Widen<T[K]> };

/** `t`（`@/i18n`）の型。キーの構成は `ja/core.ts` が正である。 */
export type Messages = Widen<typeof ja>;
/** `tExplorer`（`@/i18n/explorer`）の型。 */
export type ExplorerMessages = Widen<typeof jaExplorer>;
/** `tHelp`（`@/i18n/help`）の型。 */
export type HelpMessages = Widen<typeof jaHelp>;
/** `tMarp`（`@/i18n/marp`）の型。 */
export type MarpMessages = Widen<typeof jaMarp>;
/** `tSettings`（`@/i18n/settings`）の型。 */
export type SettingsMessages = Widen<typeof jaSettings>;
/** `tUpdate`（`@/i18n/update`）の型。 */
export type UpdateMessages = Widen<typeof jaUpdate>;
