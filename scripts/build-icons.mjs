#!/usr/bin/env node
/**
 * アプリアイコンを 2 枚のマスター SVG から組み立てる。
 *
 * `tauri icon` は 1 枚のソースを縮小して全サイズを吐くので、
 * 「小さいときは透過 / 大きいときは墨の円」を 1 コマンドでは作れない。
 * このスクリプトは 2 回走らせて、サイズごとにどちらを採るか振り分ける。
 *
 *   64px 以下  → src-tauri/icons/source.svg（透過）
 *   128px 以上 → src-tauri/icons/source-disc.svg（墨の円）
 *
 * 境界を 64 / 128 の間に置いたのは ICO の標準サイズに合わせたため。
 * 円を敷くとマークの実効サイズが 74% に落ちるので、小さい側では割に合わない。
 *
 * `icon.ico` は Windows が実際に参照する唯一のアイコンで、
 * 中に複数解像度を抱える。混在させるにはコンテナを自前で組む必要があるため、
 * ここで PNG を並べて書き出している（PNG 埋め込み ICO。Vista 以降が対応）。
 *
 * 使い方:
 *   pnpm icons
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'src-tauri', 'icons');
const CLI = join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

const FLAT = join(ICONS, 'source.svg');
const DISC = join(ICONS, 'source-disc.svg');

/** `icon.ico` に詰める解像度と、それぞれどちらのマスターから採るか。 */
const ICO_SIZES = [
  { size: 16, disc: false },
  { size: 24, disc: false },
  { size: 32, disc: false },
  { size: 48, disc: false },
  { size: 64, disc: false },
  { size: 128, disc: true },
  { size: 256, disc: true },
];

/**
 * `tauri icon` の既定セットのうち、円版で上書きするもの。
 * ここに無いものは透過版のまま残る。
 * Square*Logo は MSIX 用のタイル画像で、107 以下は透過側に倒している。
 */
const DISC_FILES = [
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.icns',
  'Square142x142Logo.png',
  'Square150x150Logo.png',
  'Square284x284Logo.png',
  'Square310x310Logo.png',
];

/** `tauri icon` の既定セットのうち、そのまま採用する透過側のもの。 */
const FLAT_FILES = [
  '32x32.png',
  '64x64.png',
  'StoreLogo.png',
  'Square30x30Logo.png',
  'Square44x44Logo.png',
  'Square71x71Logo.png',
  'Square89x89Logo.png',
  'Square107x107Logo.png',
];

function run(source, out, sizes) {
  const args = ['icon', source, '-o', out];
  for (const s of sizes ?? []) args.push('-p', String(s));
  execFileSync(process.execPath, [CLI, ...args], { stdio: 'pipe' });
}

/**
 * PNG のバイト列を ICO コンテナに詰める。
 *
 * 各エントリのサイズは PNG の IHDR から読む。引数と食い違ったら止める。
 * ここが黙ってずれると、Windows が間違った解像度を選んで
 * エクスプローラだけぼやける、という追いにくい壊れ方をする。
 */
function buildIco(entries) {
  const DIR = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(DIR + ENTRY * entries.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = header.length;
  for (const [i, { size, png }] of entries.entries()) {
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
      throw new Error(`${size}px のはずの PNG が ${png.readUInt32BE(16)}x${png.readUInt32BE(20)} だった`);
    }
    const at = DIR + ENTRY * i;
    header.writeUInt8(size >= 256 ? 0 : size, at); // 256 は 0 で表す
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2); // パレット無し
    header.writeUInt8(0, at + 3); // reserved
    header.writeUInt16LE(1, at + 4); // planes
    header.writeUInt16LE(32, at + 6); // bpp
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

const flatDir = mkdtempSync(join(tmpdir(), 'mx-icon-flat-'));
const discDir = mkdtempSync(join(tmpdir(), 'mx-icon-disc-'));
const flatExtra = mkdtempSync(join(tmpdir(), 'mx-icon-flat-p-'));
const discExtra = mkdtempSync(join(tmpdir(), 'mx-icon-disc-p-'));

try {
  // 既定セット（png 各サイズ / ico / icns / Square*）
  run(FLAT, flatDir);
  run(DISC, discDir);

  // ICO に要るが既定セットに無い解像度
  run(FLAT, flatExtra, [16, 24, 48]);
  run(DISC, discExtra, [256]);

  for (const name of FLAT_FILES) copyFileSync(join(flatDir, name), join(ICONS, name));
  for (const name of DISC_FILES) copyFileSync(join(discDir, name), join(ICONS, name));

  const pick = ({ size, disc }) => {
    const dirs = disc ? [discDir, discExtra] : [flatDir, flatExtra];
    for (const d of dirs) {
      try {
        return readFileSync(join(d, `${size}x${size}.png`));
      } catch {
        /* 次の候補へ */
      }
    }
    throw new Error(`${size}px の PNG がどちらの出力にも無い`);
  };

  const ico = buildIco(ICO_SIZES.map((e) => ({ size: e.size, png: pick(e) })));
  writeFileSync(join(ICONS, 'icon.ico'), ico);

  const flat = ICO_SIZES.filter((e) => !e.disc).map((e) => e.size);
  const disc = ICO_SIZES.filter((e) => e.disc).map((e) => e.size);
  console.log(`icon.ico: 透過 ${flat.join('/')} + 円 ${disc.join('/')} (${ico.length} bytes)`);
  console.log(`png/icns: 透過 ${FLAT_FILES.length} 件 / 円 ${DISC_FILES.length} 件`);
} finally {
  for (const d of [flatDir, discDir, flatExtra, discExtra]) rmSync(d, { recursive: true, force: true });
}
