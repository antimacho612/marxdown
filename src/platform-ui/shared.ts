/**
 * OS 別のチャンク（`macos.ts` / `linux.ts`）が共有する処理（ADR-0028 §3.3）。
 *
 * Windows では読み込まれない。
 */

/** 置き換える語の表。前から順に適用する。 */
export type Rewrites = readonly (readonly [from: string, to: string])[];

/**
 * 文言のオブジェクトの中の文字列を、表に従って置き換える関数を作る（`setMessageRewrite` に渡す）。
 *
 * 文言を組み立てる関数（`hiddenCreated` など）は置き換えない。
 * OS で変わる語は、どれも固定の文字列にしか現れない。
 */
export function rewriter(table: Rewrites): (messages: object) => void {
  return function rewrite(messages: object): void {
    const record = messages as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        let text = value;
        for (const [from, to] of table) text = text.replaceAll(from, to);
        record[key] = text;
      } else if (typeof value === 'object' && value !== null) {
        rewrite(value);
      }
    }
  };
}

/**
 * WebView 既定のコンテキストメニュー（戻る / 再読み込みなど）を出さない（M10 §4.5）。
 *
 * Windows は Rust 側で WebView2 の設定として抑止している（`src-tauri/src/webview.rs`）。
 * WKWebView と WebKitGTK にはその窓口が無いため、`contextmenu` を止める。
 * 入力欄の中は止めない（コピーと貼り付けの項目が要る）。
 * Monaco は自前のメニューを描くため影響しない。
 * 開発ビルドでは止めない。
 * 「要素の調査」を残すためである（Windows と同じ判断）。
 */
export function suppressNativeContextMenu(): void {
  if (import.meta.env.DEV) return;
  document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
  });
}
