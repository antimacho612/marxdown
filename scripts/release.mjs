#!/usr/bin/env node
/**
 * 版の番号と変更履歴を扱うリリース用のスクリプト。
 *
 * 版の番号は `package.json` を唯一の情報源とする。
 * `tauri.conf.json` は `"../package.json"` を参照するため書き換えない。
 * `Cargo.toml` / `Cargo.lock` は `--version` の出力に使われるため、ここで同期する。
 *
 * ```bash
 * pnpm release bump 0.2.0                              # 版を上げ、CHANGELOG の Unreleased を 0.2.0 の節にする
 * node scripts/release.mjs check v0.2.0                # タグと版・CHANGELOG・公開鍵が揃っているか（CI 用）
 * node scripts/release.mjs notes 0.2.0                 # CHANGELOG の 0.2.0 の節と release-notes/0.2.0.md から Release の本文を作り、標準出力へ
 * node scripts/release.mjs notes 0.2.0 --preview v0.2.0-beta.1  # macOS / Linux のプレビューの pre-release へ誘導する（CI 用）
 * node scripts/release.mjs title 0.2.0                 # Release のタイトルを標準出力へ（CI 用）
 * node scripts/release.mjs manifest 0.2.0 <dir> <out>  # updater が読む latest.json を書く（CI 用）
 * ```
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildManifest,
  buildReleaseNotes,
  finalizeChangelog,
  isPrerelease,
  latestVersion,
  parseHighlights,
  previousVersion,
  releaseNotesTemplate,
  releaseTitle,
  sectionBody,
  SEMVER,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
} from './release-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  changelog: join(ROOT, 'CHANGELOG.md'),
  packageJson: join(ROOT, 'package.json'),
  cargoToml: join(ROOT, 'src-tauri', 'Cargo.toml'),
  cargoLock: join(ROOT, 'src-tauri', 'Cargo.lock'),
  tauriConf: join(ROOT, 'src-tauri', 'tauri.conf.json'),
  releaseNotes: (version) => join(ROOT, 'release-notes', `${version}.md`),
};

function read(path) {
  return readFileSync(path, 'utf8');
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * `release-notes/<版>.md` を読む。pre-release とファイルの無い版は `null`。
 *
 * NOTE: pre-release の本文は Unreleased から作るため、版ごとのファイルを持たない。
 */
function readHighlights(version) {
  if (isPrerelease(version)) return null;
  const path = PATHS.releaseNotes(version);
  if (!existsSync(path)) return null;
  try {
    return parseHighlights(read(path));
  } catch (error) {
    throw new Error(`release-notes/${version}.md: ${error instanceof Error ? error.message : error}`, { cause: error });
  }
}

function requireVersion(version) {
  if (!version || !SEMVER.test(version)) throw new Error(`版の番号として読めない: ${version ?? '(なし)'}`);
  return version;
}

function bump(version) {
  requireVersion(version);

  // pre-release では Unreleased を確定させない（`isPrerelease`）。
  if (!isPrerelease(version)) {
    writeFileSync(PATHS.changelog, finalizeChangelog(read(PATHS.changelog), version, today()));
    if (!existsSync(PATHS.releaseNotes(version))) {
      mkdirSync(dirname(PATHS.releaseNotes(version)), { recursive: true });
      writeFileSync(PATHS.releaseNotes(version), releaseNotesTemplate(version));
      console.log(`release-notes/${version}.md を作った。Release の英語の本文を書くこと。`);
    }
  }
  writeFileSync(PATHS.packageJson, setPackageJsonVersion(read(PATHS.packageJson), version));
  writeFileSync(PATHS.cargoToml, setCargoTomlVersion(read(PATHS.cargoToml), version));
  writeFileSync(PATHS.cargoLock, setCargoLockVersion(read(PATHS.cargoLock), version));

  console.log(`${version} にした。差分を確かめてから、次を実行する。`);
  console.log('');
  if (!isPrerelease(version)) console.log(`  git add release-notes/${version}.md`);
  console.log(`  git commit -am "chore(release): v${version}"`);
  console.log(`  git tag v${version}`);
  console.log(`  git push origin HEAD v${version}`);
}

function check(tag) {
  const version = requireVersion(tag?.replace(/^v/, ''));
  const errors = [];

  const pkg = JSON.parse(read(PATHS.packageJson)).version;
  if (pkg !== version) errors.push(`package.json の version が ${pkg} である`);

  const cargo = /\[package\][^[]*?^version = "(.*)"$/m.exec(read(PATHS.cargoToml))?.[1];
  if (cargo !== version) errors.push(`Cargo.toml の version が ${cargo} である`);

  const lock = /\[\[package\]\]\r?\nname = "marxdown"\r?\nversion = "(.*)"/.exec(read(PATHS.cargoLock))?.[1];
  if (lock !== version) errors.push(`Cargo.lock の marxdown が ${lock} である`);

  const conf = JSON.parse(read(PATHS.tauriConf));
  if (conf.version !== '../package.json') {
    errors.push(`tauri.conf.json の version が "../package.json" ではなく ${conf.version} である`);
  }
  // 公開鍵が空のまま配ると、その版の updater はどの署名も検証できず、以後の更新を受け取れなくなる。
  if (!conf.plugins?.updater?.pubkey) errors.push('tauri.conf.json の plugins.updater.pubkey が空である');

  const section = isPrerelease(version) ? 'Unreleased' : version;
  if (!sectionBody(read(PATHS.changelog), section)) errors.push(`CHANGELOG.md に ${section} の節が無いか、空である`);

  // 安定版の Release は下書きのまま公開できる形で作る。英語の本文は CHANGELOG から作れないため、書いてあることを求める。
  if (!isPrerelease(version)) {
    if (existsSync(PATHS.releaseNotes(version))) {
      try {
        readHighlights(version);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    } else {
      errors.push(`release-notes/${version}.md が無い`);
    }
  }

  if (errors.length > 0) {
    console.error(`タグ ${tag} と一致しない:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    console.error('`pnpm release bump <版>` で版を上げてからタグを打つこと。');
    process.exit(1);
  }
  console.log(`タグ ${tag} と版の番号・CHANGELOG が一致している。`);
}

function notes(version, options) {
  const changelog = read(PATHS.changelog);
  const prerelease = isPrerelease(requireVersion(version));
  const section = prerelease ? 'Unreleased' : version;
  const body = sectionBody(changelog, section);
  if (!body) throw new Error(`CHANGELOG.md に ${section} の節が無い。`);
  const previous = prerelease ? latestVersion(changelog) : previousVersion(changelog, version);
  const preview = prerelease ? null : (options.preview ?? null);
  process.stdout.write(buildReleaseNotes({ version, body, previous, highlights: readHighlights(version), preview }));
}

function title(version) {
  requireVersion(version);
  console.log(releaseTitle(version, readHighlights(version)));
}

function parseNotesArgs(args) {
  const [version, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--preview' && rest[i + 1]) options.preview = rest[++i];
    else throw new Error(`notes の引数として読めない: ${rest[i]}`);
  }
  return { version, options };
}

function manifest(version, bundleDir, out) {
  requireVersion(version);
  if (!bundleDir || !out) throw new Error('使い方: release.mjs manifest <版> <NSIS の出力ディレクトリ> <書き出し先>');

  const fileName = readdirSync(bundleDir).find((f) => f.endsWith(`_${version}_x64-setup.exe`));
  if (!fileName) throw new Error(`${bundleDir} に ${version} のインストーラが無い。`);

  // 署名が無いのは、ビルドに署名鍵が渡っていないときである。
  // 署名の無い latest.json を公開すると、利用者の updater が検証に失敗し続ける。
  const signature = read(join(bundleDir, `${fileName}.sig`)).trim();

  const notesText = sectionBody(read(PATHS.changelog), isPrerelease(version) ? 'Unreleased' : version) ?? '';
  const data = buildManifest({ version, notes: notesText, signature, fileName, pubDate: new Date().toISOString() });
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${out} を書き出した（${fileName}）。`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'bump': {
      bump(args[0]);
      break;
    }
    case 'check': {
      check(args[0]);
      break;
    }
    case 'notes': {
      const { version, options } = parseNotesArgs(args);
      notes(version, options);
      break;
    }
    case 'title': {
      title(args[0]);
      break;
    }
    case 'manifest': {
      manifest(args[0], args[1], args[2]);
      break;
    }
    default: {
      console.error('使い方: release.mjs <bump|check|notes|title|manifest> ...');
      process.exit(1);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
