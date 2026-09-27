/**
 * 見出し単位の折りたたみ（`editor` チャンク）。
 *
 * Monaco の Markdown 定義は折りたたみの provider を持たず、字下げと `<!-- #region -->` でしか折りたためない。
 * 範囲はアウトラインと同じ見出し（markdown-it のパース結果）から作る。
 * 行を自前で走査しないのは、コードブロック内の `#` やフロントマターの扱いをアウトラインと食い違わせないためである。
 * 見出しを上端に固定する表示（`stickyScroll`）も、この範囲から決まる（`options.ts`）。
 *
 * provider を登録すると、Monaco は字下げによる折りたたみを併用しない。
 * 字下げと `<!-- #region -->` の範囲は折りたためなくなる。
 */
import { latestOutline } from '@/features/document';

import { headingRanges } from './heading-ranges';
import { MARKDOWN_LANGUAGE_ID, monaco } from './monaco';
import { watchOutline } from './watch-outline.svelte';

/**
 * 見出しの折りたたみを登録する。`mountEditor` から 1 回だけ呼ぶ。
 *
 * 見出しが入れ替わったとき（開く・読み直し・パースのやり直し）は `onDidChange` で範囲を作り直させる。
 * タブを切り替えた直後は、開く経路が見出しを入れ直すまで前の文書の見出しが残っている。
 * その間の範囲は誤っているが、見出しが入れ替わった時点で作り直される。
 * 畳んでいた状態は `restoreViewState` が本文の内容と照合して戻すため、この間の誤りには影響されない。
 */
export function installHeadingFolding(editor: monaco.editor.IStandaloneCodeEditor): void {
  const changed = new monaco.Emitter<monaco.languages.FoldingRangeProvider>();

  const provider: monaco.languages.FoldingRangeProvider = {
    onDidChange: changed.event,
    async provideFoldingRanges(model, _context, token) {
      // 見出しは表示している文書のものしか持っていない。
      if (model !== editor.getModel()) return [];
      const outline = await latestOutline();
      if (token.isCancellationRequested || model.isDisposed()) return [];
      return headingRanges(outline, model.getLineCount(), (line) => model.getLineFirstNonWhitespaceColumn(line) === 0);
    },
  };

  monaco.languages.registerFoldingRangeProvider(MARKDOWN_LANGUAGE_ID, provider);
  watchOutline(() => {
    changed.fire(provider);
  });
}
