/**
 * 書き出しに使う CSS を、画面に適用されている規則から集める。
 *
 * CSS ファイルをビルド時に複製して持たない。
 * 配色（`themes/` の外部ファイルを含む）と設定による上書きは実行時にしか決まらず、画面と同じ見た目にするには実行時の規則を読むしかない。
 */

/**
 * 本文の見た目に関わる規則か。
 *
 * クロームの規則を除くためにセレクタで絞る。
 * 本文側の要素はすべて `.mx-` / `.hljs` / `.katex` のクラスか、配色の属性で装飾されている。
 */
const CONTENT_SELECTOR = /:root|(?:^|[\s,(])html\b|\.mx-|#mx-preview|\.hljs|\.katex|\[data-mx-theme/;

/**
 * 規則 1 つを、残すなら CSS 文字列にして返す。
 *
 * 規則の種類は `instanceof` ではなく持っているプロパティで見分ける。
 * jsdom には `CSSGroupingRule` と `CSSFontFaceRule` が無い。
 */
function keep(rule: CSSRule, fonts: boolean): string | null {
  if (isStyleRule(rule)) return CONTENT_SELECTOR.test(rule.selectorText) ? rule.cssText : null;

  // 同梱するフォントは KaTeX だけである。本文のフォントは利用者の環境にあるものを名前で指定している。
  if (isFontFace(rule)) return fonts && /katex/i.test(rule.cssText) ? rule.cssText : null;

  // `@media` / `@supports` / `@container` / `@scope` など。中身を絞ってから包み直す。
  if ('cssRules' in rule) {
    const inner = [...(rule as CSSGroupingRule).cssRules]
      .map((child) => keep(child, fonts))
      .filter((text) => text !== null);
    if (inner.length === 0) return null;
    const prelude = rule.cssText.slice(0, rule.cssText.indexOf('{'));
    return `${prelude}{\n${inner.join('\n')}\n}`;
  }

  return null;
}

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return 'selectorText' in rule && 'style' in rule;
}

function isFontFace(rule: CSSRule): boolean {
  return rule.cssText.startsWith('@font-face');
}

/**
 * 画面に適用されている規則のうち、本文に関わるものを連結して返す。
 *
 * `fonts` が真なら KaTeX のフォントを data URI にして含める（数式を含む文書の HTML 書き出し）。
 * 読めないスタイルシート（別オリジン）は飛ばす。
 */
export async function collectCss(fonts: boolean): Promise<string> {
  const parts: (string | Promise<string>)[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = keep(rule, fonts);
      if (text === null) continue;
      parts.push(isFontFace(rule) ? inlineUrls(text, sheet.href) : text);
    }
  }
  const resolved = await Promise.all(parts);
  return resolved.join('\n');
}

/** `url(...)` の参照先を data URI にする。読めなかった参照は元のまま残す。 */
async function inlineUrls(css: string, base: string | null): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const urls = [...new Set(Array.from(css.matchAll(pattern), (match) => match[2] ?? ''))].filter(
    (url) => url !== '' && !url.startsWith('data:'),
  );

  const inlined = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(new URL(url, base ?? document.baseURI));
        if (response.ok) inlined.set(url, await toDataUri(await response.blob()));
      } catch {
        // 同じオリジンの資産であり通常は失敗しない。失敗しても数式がフォールバックのフォントで描かれるだけである。
      }
    }),
  );

  return css.replace(pattern, (whole, _quote: string, url: string) => {
    const data = inlined.get(url);
    return data === undefined ? whole : `url("${data}")`;
  });
}

function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('読み込めなかった')));
    reader.readAsDataURL(blob);
  });
}

/**
 * 明るい既定配色のトークンを返す（PDF / docs/06.roadmap/m7-cli-os-export.md §4.4）。
 *
 * 対象は暗い配色（`data-theme="dark"`）が上書きしているトークンだけで、値は `:root` の既定値を使う。
 * フォントや本文幅のトークンは含めない。設定による上書きを印刷でも保つためである。
 */
export function lightTokens(): Map<string, string> {
  const themed = new Set<string>();
  const light = new Map<string, string>();

  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (!isStyleRule(rule)) continue;
      const selector = rule.selectorText.replaceAll("'", '"');
      const base = selector === ':root' || selector === ':root[data-theme="light"]';
      const dark = selector.includes('data-theme="dark"');
      if (!base && !dark) continue;

      for (const name of rule.style) {
        if (!name.startsWith('--')) continue;
        if (base) light.set(name, rule.style.getPropertyValue(name).trim());
        if (dark) themed.add(name);
      }
    }
  }

  return new Map([...light].filter(([name]) => themed.has(name)));
}
