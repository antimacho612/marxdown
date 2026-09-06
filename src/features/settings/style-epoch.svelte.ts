/**
 * 「エディターに効くスタイルが差し替わった」ことだけを伝える数値（ADR-0013）。
 *
 * エディターの配色は Monaco がトークンを読み出して流し込む形のため（`theme.ts` / ADR-0009 の受け入れコスト 2）、値が変わったら読み直す必要がある。
 * 変化の出どころは `<html>` の属性（`theme.ts` の MutationObserver）と `settingsStore`（`watch-settings.svelte.ts`）で拾えるが、`editor.css` の注入だけはどちらにも反映されない。
 * そのため、この最小限の通知で対応する。
 * 設定ストアには置かない（設定値ではなく通知のためである）。
 * 何が変わったかは保持せず、受け取った側は常にトークンを読み直すだけでよい。
 */
class StyleEpoch {
  /** 差し替わるたびに増加する。値そのものに意味は無い。 */
  value = $state(0);
}

/** エディターに効くスタイルの差し替えを伝える通知。モジュールの singleton として共有する。 */
export const styleEpoch = new StyleEpoch();

/** エディターに効くスタイルを差し替えたことを知らせる。 */
export function bumpStyleEpoch(): void {
  styleEpoch.value += 1;
}
