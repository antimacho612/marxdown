/**
 * リンクをホバーしたときに行き先を表示する。
 *
 * 通常のリンク（`[label](url)`）は表示テキストが URL そのものではないため、`title` 属性で行き先を補う。
 * オートリンク（`<https://~>`）と `linkify` による裸の URL は表示テキスト自体が URL であり、同じ内容をもう一度重ねる意味が無いため対象から外す。
 * 両者は markdown-it が `link_open` トークンに付ける `markup`（`autolink` / `linkify`）で見分けられる。
 * 通常のリンクにはこの `markup` が付かない。
 *
 * `[label](url "title")` のように明示的な title が書かれている場合はそちらを優先し、上書きしない。
 */
import type { MarkdownIt, StateCore } from 'markdown-it';

export function linkTitlePlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'mx_link_title', (state: StateCore) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue;

      for (const child of token.children) {
        if (child.type !== 'link_open') continue;
        if (child.markup === 'autolink' || child.markup === 'linkify') continue;
        if (child.attrGet('title') !== null) continue;

        const href = child.attrGet('href');
        if (href) child.attrSet('title', href);
      }
    }

    return true;
  });
}
