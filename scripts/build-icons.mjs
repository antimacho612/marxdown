#!/usr/bin/env node
/**
 * アプリアイコンを 3 枚のマスター SVG から組み立てる。
 *
 * `tauri icon` は 1 枚のソースを縮小して全サイズを吐くので、
 * サイズごとにマスターを使い分けることが 1 コマンドではできない。
 * このスクリプトはマスターごとに走らせて、出力先ごとにどれを採るか振り分ける。
 *
 *   src-tauri/icons/source-plate.svg        円の台座つき（128px 以上）
 *   src-tauri/icons/source-plate-small.svg  円の台座つき（64px 以下）。余白を詰め、効果を落としてある
 *   src-tauri/icons/source.svg              台座なし（Linux の 32 / 64 png のみ）
 *
 * 台座版の境界を 64 / 128 の間に置いたのは ICO の標準サイズに合わせたため。
 *
 * Windows から見えるものは全部台座つきにしてある。実体は `icon.ico` と MSIX のタイル画像で、
 * タスクバー・エクスプローラ・Alt+Tab・トレイはすべて `icon.ico` を引く
 * （トレイは `default_window_icon()` を使い回し、Windows ではそれが .ico になる。
 * tauri-codegen が .ico を優先するため）。
 * 透過のまま残すのは `32x32.png` / `64x64.png` の 2 枚だけで、これは Linux 側の作法。
 *
 * `icon.ico` は中に複数解像度を抱える。マスターを混在させるにはコンテナを自前で組む必要があるため、
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
const PLATE = join(ICONS, 'source-plate.svg');
const PLATE_SMALL = join(ICONS, 'source-plate-small.svg');

/** `icon.ico` に詰める解像度と、それぞれどちらのマスターから採るか。 */
const ICO_SIZES = [
  { size: 16, small: true },
  { size: 24, small: true },
  { size: 32, small: true },
  { size: 48, small: true },
  { size: 64, small: true },
  { size: 128, small: false },
  { size: 256, small: false },
];

/** `tauri icon` の既定セットのうち、大サイズの台座版で上書きするもの。 */
const PLATE_FILES = [
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.icns',
  'Square71x71Logo.png',
  'Square89x89Logo.png',
  'Square107x107Logo.png',
  'Square142x142Logo.png',
  'Square150x150Logo.png',
  'Square284x284Logo.png',
  'Square310x310Logo.png',
];

/**
 * `tauri icon` の既定セットのうち、小サイズの台座版で上書きするもの。
 * どれも実寸が 64px 以下の MSIX タイル画像（StoreLogo は 50px）。
 */
const PLATE_SMALL_FILES = ['StoreLogo.png', 'Square30x30Logo.png', 'Square44x44Logo.png'];

/**
 * 台座を敷かずに残すもの。Linux のパネル / ドックは透過アイコンが作法で、
 * `tauri.conf.json` の `icon` 配列経由で `default_window_icon()` に入るのもこちら。
 */
const FLAT_FILES = ['32x32.png', '64x64.png'];

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
const plateDir = mkdtempSync(join(tmpdir(), 'mx-icon-plate-'));
const smallDir = mkdtempSync(join(tmpdir(), 'mx-icon-small-'));
const smallExtra = mkdtempSync(join(tmpdir(), 'mx-icon-small-p-'));
const plateExtra = mkdtempSync(join(tmpdir(), 'mx-icon-plate-p-'));

try {
  // 既定セット（png 各サイズ / ico / icns / Square*）
  run(FLAT, flatDir);
  run(PLATE, plateDir);
  run(PLATE_SMALL, smallDir);

  // ICO に要るが既定セットに無い解像度
  run(PLATE_SMALL, smallExtra, [16, 24, 48]);
  run(PLATE, plateExtra, [256]);

  for (const name of FLAT_FILES) copyFileSync(join(flatDir, name), join(ICONS, name));
  for (const name of PLATE_FILES) copyFileSync(join(plateDir, name), join(ICONS, name));
  for (const name of PLATE_SMALL_FILES) copyFileSync(join(smallDir, name), join(ICONS, name));

  const pick = ({ size, small }) => {
    const dirs = small ? [smallDir, smallExtra] : [plateDir, plateExtra];
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

  const small = ICO_SIZES.filter((e) => e.small).map((e) => e.size);
  const large = ICO_SIZES.filter((e) => !e.small).map((e) => e.size);
  console.log(`icon.ico: 台座小 ${small.join('/')} + 台座大 ${large.join('/')} (${ico.length} bytes)`);
  console.log(
    `png/icns: 台座大 ${PLATE_FILES.length} 件 / 台座小 ${PLATE_SMALL_FILES.length} 件 / 透過 ${FLAT_FILES.length} 件`,
  );
} finally {
  for (const d of [flatDir, plateDir, smallDir, smallExtra, plateExtra]) {
    rmSync(d, { recursive: true, force: true });
  }
}
