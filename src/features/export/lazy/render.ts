/**
 * 書き出す本文を描く。
 *
 * 画面の `#mx-preview` は複製しない。
 * Edit の間は再描画されておらず、段階的描画の途中や画面外の未描画の図も含まれるためである（`features/document/live.ts`）。
 * 本文のテキストをパースし直して切り離した要素に描き、画面では遅延している後処理（ハイライト・数式・図・画像）をすべて済ませる。
 */
import { getDocumentText, getParseOptions, getParser } from '@/features/document';
import { ja } from '@/i18n/ja';
import { sanitize } from '@/markdown/sanitize';
import { getPlatform } from '@/platform';

/** そのまま表示できる URL。`preview/enhance.ts` の判定と同じ。 */
const READY = /^(?:https?:|data:|asset:|blob:)/i;

/** `render` の指定。 */
export interface RenderOptions {
  /** 図を明るい配色で描くか（PDF）。 */
  light: boolean;
  /** 相対パスの画像を解決する基準。無題の文書では空文字で、相対パスの画像は外す。 */
  baseDir: string;
}

/**
 * 表示中の文書の本文を描いた要素を返す。
 *
 * 返すのは `.mx-content`（と Front Matter）を子に持つ `div` で、文書には挿入されていない。
 * パーサがまだ無い（文書を開いていない）ときは `null` を返す。
 */
export async function render(options: RenderOptions): Promise<HTMLElement | null> {
  const parser = getParser();
  if (!parser) return null;

  const parsed = await parser.parse(getDocumentText(), getParseOptions());
  // NOTE: Marp の文書を通常の本文として書き出すと、見ているものと違うものが渡る（docs/06.roadmap/m9-marp.md §4.2 / OQ-47）。
  if (parsed.marp) throw new Error(ja.export.marpUnsupported);
  const root = document.createElement('div');

  // `preview/paint.ts` と同じ構造にする。本文幅の規則が `.mx-content` を基準にしている。
  if (parsed.frontMatter !== null) {
    const pre = document.createElement('pre');
    pre.className = 'mx-front-matter';
    pre.textContent = parsed.frontMatter;
    root.append(pre);
  }
  const content = document.createElement('div');
  content.className = 'mx-content';
  const template = document.createElement('template');
  template.innerHTML = sanitize(parsed.chunks.join(''));
  content.append(template.content);
  root.append(content);

  await Promise.all([highlight(root), math(root), mermaid(root, options.light), images(root, options.baseDir)]);
  return root;
}

async function highlight(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code')];
  if (blocks.length === 0) return;
  const { highlightElement } = await import('@/features/preview/lazy/highlight');
  await Promise.all(blocks.map((code) => highlightElement(code)));
}

async function math(root: HTMLElement): Promise<void> {
  const targets = [...root.querySelectorAll<HTMLElement>('.mx-math')];
  if (targets.length === 0) return;
  const { renderMath } = await import('@/features/preview/lazy/math');
  for (const element of targets) renderMath(element);
}

async function mermaid(root: HTMLElement, light: boolean): Promise<void> {
  if (root.querySelector('.mx-mermaid') === null) return;
  const { renderForExport } = await import('@/features/preview/lazy/mermaid');
  await renderForExport(root, light);
}

/**
 * ローカル画像を asset URL にする。解決できないものは代替テキストに置き換える。
 *
 * 画面のようなプレースホルダ（許可ボタン付き）は書き出さない。書き出した先では操作できないためである。
 * `<picture>` の `<source>` は外し、`<img>` へのフォールバックに任せる。
 */
async function images(root: HTMLElement, baseDir: string): Promise<void> {
  for (const source of root.querySelectorAll('picture > source')) source.remove();

  const platform = getPlatform();
  const local = [...root.querySelectorAll<HTMLImageElement>('img[src]')].filter(
    (img) => !READY.test(img.getAttribute('src') ?? ''),
  );
  await Promise.all(
    local.map(async (img) => {
      img.removeAttribute('srcset');
      try {
        if (baseDir === '') throw new Error('基準のディレクトリが無い');
        img.src = await platform.resolveAsset(img.getAttribute('src') ?? '', baseDir);
      } catch {
        img.replaceWith(document.createTextNode(img.alt));
      }
    }),
  );
}
