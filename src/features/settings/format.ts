/**
 * 設定値を CSS へ渡す形に整える（F-CONF-04 / F-CONF-08 / ADR-0013）。
 *
 * DOM には触らない。適用するのは `appearance.ts` と見本（`lazy/samples/`）である。
 * `@/platform` から値を取らないのは、見本のチャンクからこのモジュールを参照するためである。
 * 実行時の依存を持たせると `platform` の共有チャンクが分割し直され、クリティカルパスが太る（OQ-38）。
 */
import type { Palette } from '@/platform';

/**
 * 見本に着せる配色（`data-mx-theme` の値）。
 *
 * `default` のときは `undefined` を返し、属性を付けない（`appearance.ts` の `applyPalette` と同じ判断）。
 */
export function paletteAttr(palette: Palette): string | undefined {
  return palette === 'default' ? undefined : palette;
}

/**
 * フォント名を CSS の `font-family` に入れられる形にする。
 *
 * ウェブフォントは読み込めない（CSP の `font-src 'self'` / 02.architecture/10-theming.md §3）。
 * ここに指定できるのは OS にインストールされているフォントのファミリ名だけで、見つからなければ後続のスタックにフォールバックする。
 *
 * すべて引用符で囲うのは、`Meiryo UI` のような空白を含む名前と `MS UI Gothic` のような数字で始まる名前を同じ扱いにするためである。
 * 囲えない文字（引用符・バックスラッシュ・`;` `{` `}` `(` `)`）を含むものは除外する。
 * 設定ファイルは手で編集できるため、ここに渡る文字列は検証されていない。
 * 影響が宣言 1 つに留まるとしても、通す理由がない。
 */
export function formatFontFamily(input: string): string | null {
  const families = input
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^["'](.*)["']$/u, '$1')
        .trim(),
    )
    .filter((name) => name.length > 0 && !/["'\\;{}()]/u.test(name));

  if (families.length === 0) return null;
  return families.map((name) => JSON.stringify(name)).join(', ');
}
