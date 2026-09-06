/**
 * 本文が描き変わったことを知りたい側が名乗り出る口。
 *
 * 知らせる側（`document/open.ts` / `document/live.ts`）と聞く側（`preview/lazy/search.ts` /
 * `outline/Outline.svelte`）が別の feature にあるため、どちらかに置くと feature 同士が
 * 互いを名指しすることになる。**どの feature も知らない登録簿**として `lib/` に置く。
 * 動的 import で呼びに行かないのは、一度も使っていない機能のチャンク（`search` 等）を
 * 無駄に取得しないためで、聞く側から登録させる形にしている。
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

/**
 * アウトラインが画面に出ているか（`Outline.svelte` が名乗る）。
 *
 * Edit ではプレビューの面が見えていないので、本文の DOM は作り直さない。
 * **それでもアウトラインは出ていることがあり**、見出しだけは打鍵のたびに
 * 古くなる。そのぶんのパースを回すかどうかの判断がこれ（`document/live.ts`）。
 *
 * 上の 2 つと同じ「聞く側が名乗り出る」形にしてある。`live.ts` から
 * `viewStore.panes.right.open` を見に行くと、**アウトラインを左ペインへ移した日に
 * `live.ts` が壊れる**（ペインは中身を知らない / `features/panes/panes.ts`）。
 */
let outlineOnScreen = false;

export function setOutlineOnScreen(on: boolean): void {
  outlineOnScreen = on;
}

export function isOutlineOnScreen(): boolean {
  return outlineOnScreen;
}
