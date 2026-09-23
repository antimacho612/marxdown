/**
 * `srcset` 属性（WHATWG の srcset 構文）の候補を 1 つずつ扱うための道具。
 *
 * 値は URL 1 個ではなく `URL 記述子, URL 記述子, ...` のリストであるため、href/src と同じ 1 属性 1 URL の処理には乗らない。
 * `markdown/sanitize.ts`（許可判定）と `features/preview/enhance.ts`（パス解決）の両方が同じパースを必要とするため、ここへ共通化してある。
 */

export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

export function parseSrcset(value: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  const len = value.length;
  let pos = 0;

  while (pos < len) {
    while (pos < len && /[\s,]/.test(value[pos] ?? '')) pos++;
    if (pos >= len) break;

    const urlStart = pos;
    while (pos < len && !/\s/.test(value[pos] ?? '')) pos++;
    let url = value.slice(urlStart, pos);

    // 記述子なしの候補は URL の直後がカンマになる（末尾のカンマは区切りであって URL の一部ではない）
    let noDescriptor = false;
    while (url.endsWith(',')) {
      url = url.slice(0, -1);
      noDescriptor = true;
    }

    let descriptor = '';
    if (!noDescriptor) {
      while (pos < len && /\s/.test(value[pos] ?? '')) pos++;
      const descStart = pos;
      while (pos < len && value[pos] !== ',') pos++;
      descriptor = value.slice(descStart, pos).trim();
      if (pos < len) pos++; // カンマを読み飛ばす
    }

    if (url !== '') candidates.push({ url, descriptor });
  }

  return candidates;
}

export function formatSrcset(candidates: readonly SrcsetCandidate[]): string {
  return candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(', ');
}
