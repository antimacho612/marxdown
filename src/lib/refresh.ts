/**
 * 本文が再描画されたことを知りたい側が登録する仕組み。
 *
 * 通知する側（`document/open.ts` / `document/live.ts`）と受け取る側（`preview/lazy/search.ts` / `outline/Outline.svelte`）が別の feature にあるため、
 * どちらかに置くと feature 同士が互いを直接参照することになる。
 * そのため、どの feature にも依存しない登録簿として `lib/` に置く。
 *
 * 動的 import で呼び出さないのは、一度も使っていない機能のチャンク（`search` など）を取得しないためであり、受け取る側から登録する形にしている。
 */

/** 検索（F-VIEW-10）。開いたまま新しい本文で引き直す。 */
let searchRefresher: (() => void) | null = null;

/** 検索の引き直しを登録する。`null` を渡すと解除される。 */
export function registerSearchRefresher(refresh: (() => void) | null): void {
  searchRefresher = refresh;
}

/** 本文の描画が終わった直後に呼ぶ。検索が開いていなければ何も起きない。 */
export function refreshSearch(): void {
  searchRefresher?.();
}

/**
 * アウトライン（F-VIEW-02 / 03.ux-spec/06-panes.md §2）。
 *
 * 段階的描画（02.architecture/06-markdown-rendering-pipeline.md §4）では、本文は idle 時に後から追加される。
 * 追加が完了したことを知っているのは開く経路だけであるため、そちらが通知する側になる。
 *
 * ペインを閉じると `null` が渡り、以降は呼ばれない。
 * 表示していないアウトラインのために本文の描画経路が動作することはない（N-PERF-05）。
 */
let outlineRefresher: (() => void) | null = null;

/** アウトラインの作り直しを登録する。`null` を渡すと解除される。 */
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
 * Edit ではプレビューの面が表示されていないため、本文の DOM は作り直さない。
 * それでもアウトラインは表示されていることがあり、見出しだけは打鍵のたびに古くなる。
 * そのぶんのパースを実行するかどうかをこの値で判断する（`document/live.ts`）。
 *
 * 上の 2 つと同じく、受け取る側が登録する形にしている。
 * `live.ts` から `viewStore.panes.right.open` を参照すると、アウトラインを左ペインへ移した時点で `live.ts` が動作しなくなる
 * （ペインは中身を知らない / `features/panes/panes.ts`）。
 */
let outlineOnScreen = false;

/** アウトラインが画面に出ているかを記録する。`Outline.svelte` から呼ぶ。 */
export function setOutlineOnScreen(on: boolean): void {
  outlineOnScreen = on;
}

/** アウトラインが画面に出ているか。打鍵ごとのパースを実行するかの判断に使う。 */
export function isOutlineOnScreen(): boolean {
  return outlineOnScreen;
}
