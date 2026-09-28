/** jsdom は型定義を同梱していない。サイトのビルドで使う範囲だけを宣言する。 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
