/**
 * 「エディタに効くスタイルが差し替わった」ことだけを伝える数値（ADR-0013）。
 *
 * # なぜ要るのか
 *
 * エディタの配色は Monaco が描いており、`features/editor/theme.ts` が
 * **トークンを読み出して流し込んでいる**（ADR-0009 の受け入れコスト 2）。
 * したがって「トークンの値が変わったら読み直す」必要がある。
 *
 * 変化の出どころは 3 つあり、うち 2 つは既に拾えている。
 *
 * ```text
 * テーマ / 表示倍率 / プレビューの設定  <html> の属性  → theme.ts の MutationObserver
 * editor.theme などの設定              settingsStore  → watch-settings.svelte.ts
 * editor.css の注入                    <style> が増える → どちらにも映らない ← これ
 * ```
 *
 * `<head>` に `<style>` が 1 枚増えても、`<html>` の属性は 1 文字も変わらない。
 * **ここだけが穴**なので、埋めるための最小の信号を 1 つ置く。
 *
 * # 設定ストアに置かない
 *
 * `store.svelte.ts` は「`settings.json` の写し」であり、
 * **設定の値でないものを混ぜない**（あちらの冒頭）。これは値ではなく合図である。
 *
 * # 数える対象は「回数」であって「内容」ではない
 *
 * 何が変わったかは持たない。受け取った側がやることは常に同じ
 * （トークンを読み直して当て直す）で、内容で分岐する余地が無い。
 */
class StyleEpoch {
  /** 差し替わるたびに増える。**値そのものに意味は無い。** */
  value = $state(0);
}

export const styleEpoch = new StyleEpoch();

/** エディタに効くスタイルを差し替えたことを知らせる。 */
export function bumpStyleEpoch(): void {
  styleEpoch.value += 1;
}
