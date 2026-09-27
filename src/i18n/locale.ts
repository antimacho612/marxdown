/** UI の表示言語。 */
export type Locale = 'ja' | 'en';

/** 設定 `ui.language` の値。`auto` は OS の表示言語に従う。 */
export type LanguageSetting = 'auto' | Locale;

let current: Locale = 'ja';

/**
 * 設定と OS の表示言語から表示言語を決める（ADR-0026）。
 *
 * `auto` のときは OS の第一言語が日本語なら日本語、それ以外は英語にする。
 * 第二言語以降は見ない。日本語を第二言語に置いている人の多くは、UI を第一言語で読みたい人である。
 */
export function resolveLocale(setting: LanguageSetting, languages: readonly string[]): Locale {
  if (setting !== 'auto') return setting;
  return /^ja\b/i.test(languages[0] ?? '') ? 'ja' : 'en';
}

/** 表示言語。`setLocale` を呼ぶまでは日本語である。 */
export function getLocale(): Locale {
  return current;
}

/** 表示言語を決める。起動時に文言を読み込む前に 1 回だけ呼ぶ。起動後に変えても、読み込み済みの文言は変わらない。 */
export function setLocale(locale: Locale): void {
  current = locale;
}
