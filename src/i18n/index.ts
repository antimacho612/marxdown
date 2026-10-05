/**
 * UI の文言（ADR-0026）。表示言語の文言だけを別のチャンクから読み込む。
 *
 * NOTE: 文言のオブジェクトは読み込みが完了するまで空であり、モジュールの評価時に参照してはいけない。
 * `t` は起動処理（`main.ts`）が読み込みを待ってから始めるため、起動後はどこからでも参照できる。
 * 遅延チャンクだけが使う文言（`explorer.ts` など）は、その遅延チャンクの入口が読み込みを待つ。
 * top-level await で待つ形は使わない。文言を参照するモジュールがすべて非同期モジュールになり、rolldown が `main` と遅延チャンクの共有部分を細かいチャンクに分けるためである（critical path が 5.8KB 増えた）。
 */
import { getLocale, type Locale } from './locale';
import type { Messages } from './types';

export type { LanguageSetting, Locale } from './locale';
export { getLocale, resolveLocale, setLocale } from './locale';
export type { Messages } from './types';

/** 読み込みが完了するまで空の文言と、その読み込み。 */
export interface LazyMessages<T> {
  readonly messages: T;
  /** 表示言語の文言を読み込んで `messages` に入れる。2 回目以降は最初の読み込みを待つだけである。 */
  readonly load: () => Promise<void>;
}

let rewrite: ((messages: object) => void) | undefined;

/**
 * OS で変わる語（「エクスプローラーで表示」→ Finder など）の差し替えを登録する（ADR-0028 §3.3）。
 *
 * OS 別のチャンクが起動時に 1 回だけ呼び、読み込み済みの文言にもその場で適用する。
 * 以後に読み込まれる遅延チャンクの文言には、読み込んだ時点で適用される。
 */
export function setMessageRewrite(next: (messages: object) => void): void {
  rewrite = next;
}

/** 言語ごとの読み込み関数から、表示言語の文言を 1 回だけ読み込む `LazyMessages` を作る。 */
export function lazyMessages<T extends object>(loaders: Record<Locale, () => Promise<T>>): LazyMessages<T> {
  const messages = {} as T;
  let loading: Promise<void> | undefined;
  async function load(): Promise<void> {
    Object.assign(messages, await loaders[getLocale()]());
    rewrite?.(messages);
  }
  return { messages, load: () => (loading ??= load()) };
}

const core = lazyMessages<Messages>({
  ja: async () => {
    const { ja } = await import('./ja/core');
    return ja;
  },
  en: async () => {
    const { en } = await import('./en/core');
    return en;
  },
});

/** 表示言語の UI 文言。 */
export const t = core.messages;

/** `t` を読み込む。起動処理（`main.ts`）はこれの完了を待ってから始める。 */
export const loadMessages = core.load;
