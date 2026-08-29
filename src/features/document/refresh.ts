/**
 * 本文が描き変わったことを知りたい側が名乗り出る口。
 *
 * # なぜ `open.ts` から出したのか
 *
 * 知らせる側（`open.ts`）と聞く側（`preview/search.ts` / `outline/Outline.svelte`）が
 * 同じモジュールを見る形にしないと、**登録口を持つ側が聞く側から import される**。
 * `open.ts` に置いていたときは `open.ts → preview/paint` と
 * `preview/search.ts → open.ts` でファイル単位の循環になっていた。
 *
 * 置き場所が `features/document/` なのは、知らせる側の都合だから。
 * 「本文が差し替わった」を知っているのは開く経路だけで、
 * 聞く側は増えても減っても、この口の形を変えない。
 *
 * # なぜ `import()` で呼びに行かないのか
 *
 * `open.ts` から `import('@/features/preview/search')` を呼べば、検索を一度も
 * 使っていないユーザーのためにも `search` チャンクを落とすことになる。
 * **読み込まれたモジュールのほうから名乗り出る**形にすれば、
 * 読み込まれていない＝一度も使っていない、で何も起きない。
 */

/** 検索（F-VIEW-10）。開いたまま新しい本文で引き直す。 */
let searchRefresher: (() => void) | null = null;

export function registerSearchRefresher(refresh: (() => void) | null): void {
  searchRefresher = refresh;
}

/** 本文を描き終えた直後に呼ぶ。開いていなければ誰も居ない。 */
export function refreshSearch(): void {
  searchRefresher?.();
}

/**
 * アウトライン（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
 *
 * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では、本文は idle 時に後から増える。
 * 増え終わったことを知っているのは開く経路だけなので、**知らせる側**になる。
 *
 * ペインを閉じると `null` が渡り、以降は誰も呼ばれない。
 * 開いていないアウトラインのために本文の描画経路が働くことは無い（N-PERF-05）。
 */
let outlineRefresher: (() => void) | null = null;

export function registerOutlineRefresher(refresh: (() => void) | null): void {
  outlineRefresher = refresh;
}

/** 残りのチャンクが入り終わったときに呼ぶ。 */
export function refreshOutline(): void {
  outlineRefresher?.();
}
