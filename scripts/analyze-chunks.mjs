#!/usr/bin/env node
/**
 * `dist/stats.html`（rollup-plugin-visualizer の出力）から
 * チャンクごとの内訳を取り出して表にする。
 *
 * 05.performance-budget.md §5.1 の予算超過時に「何が重いのか」を
 * 目で見るためのもの。判断材料であって、CI の判定は size-limit が行う。
 *
 * 使い方:
 *   pnpm analyze && node scripts/analyze-chunks.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATS = join(ROOT, 'dist', 'stats.html');

const html = readFileSync(STATS, 'utf8');
const match =
  (/const data = (\{.+?\});\s*$/ms.exec(html) ?? /"nodeParts":/.test(html))
    ? /const data = (\{[\s\S]*?\});/.exec(html)
    : null;

if (!match?.[1]) {
  console.error('stats.html からデータを取り出せなかった。visualizer のバージョンを確認する。');
  process.exit(1);
}

const data = JSON.parse(match[1]);
const { tree, nodeParts, nodeMetas } = data;

/** id -> gzip/rendered サイズ */
function sizeOf(uid) {
  const part = nodeParts[uid];
  if (!part) return { rendered: 0, gzip: 0 };
  return { rendered: part.renderedLength ?? 0, gzip: part.gzipLength ?? 0 };
}

/** バンドル（チャンク）ごとに、モジュールを起源で束ねる */
const perChunk = new Map();

for (const [uid, part] of Object.entries(nodeParts)) {
  const meta = nodeMetas[part.metaUid];
  if (!meta) continue;
  for (const [bundleId] of Object.entries(meta.moduleParts ?? {})) {
    if (meta.moduleParts[bundleId] !== uid) continue;
    const bucket = perChunk.get(bundleId) ?? new Map();
    perChunk.set(bundleId, bucket);
    const key = groupOf(meta.id);
    const prev = bucket.get(key) ?? { rendered: 0, gzip: 0 };
    const s = sizeOf(uid);
    bucket.set(key, { rendered: prev.rendered + s.rendered, gzip: prev.gzip + s.gzip });
  }
}

/** node_modules はパッケージ名で、自前コードはトップレベルのディレクトリで束ねる。 */
function groupOf(id) {
  const nm = id.lastIndexOf('node_modules/');
  if (nm >= 0) {
    const rest = id.slice(nm + 'node_modules/'.length);
    const parts = rest.split('/');
    return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const src = id.indexOf('/src/');
  if (src >= 0) {
    const parts = id.slice(src + 5).split('/');
    return parts.length > 1 ? `src/${parts[0]}/` : `src/${parts[0]}`;
  }
  return id;
}

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';

for (const [bundleId, bucket] of [...perChunk].toSorted()) {
  const name = tree?.name ?? bundleId;
  const rows = [...bucket].toSorted((a, b) => b[1].gzip - a[1].gzip);
  const total = rows.reduce((acc, [, s]) => acc + s.gzip, 0);
  console.log(`\n=== ${bundleId} (${name}) — gzip 合計 ${kb(total)} ===`);
  console.log('  gzip      raw       モジュール');
  for (const [key, s] of rows) {
    if (s.gzip < 200) continue;
    console.log(`${kb(s.gzip)}  ${kb(s.rendered)}  ${key}`);
  }
}
