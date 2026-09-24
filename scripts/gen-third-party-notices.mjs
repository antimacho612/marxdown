#!/usr/bin/env node
/**
 * 同梱している第三者のソフトウェアのライセンス表示（THIRD_PARTY_NOTICES.txt）を生成する（docs/06.roadmap/m6-ship.md Phase 4.5）。
 *
 * 依存の MIT / BSD / Apache-2.0 は、バイナリで配るときにも著作権表示とライセンス文の同梱を求める。
 * 対象は、実際に配布物へ入るものだけである。
 *
 * - npm: `vite build` がバンドルに入れたパッケージ（vite.config.ts の `recordBundledPackages` が記録する）
 * - Rust: Windows 向けの `marxdown.exe` にリンクされるクレート。proc-macro とビルド時だけの依存は除く
 * - Rust の標準ライブラリ
 *
 * パッケージにライセンス文が入っていないときは、`scripts/license-texts/` の本文に `package.json` / `Cargo.toml` の作者を当てはめる。
 * 本文を用意していないライセンスに当たったら失敗する。黙って表示を欠かさないため。
 *
 * ```bash
 * pnpm notices                                     # vite build をしてから生成する
 * node scripts/gen-third-party-notices.mjs --check # 生成結果とコミット済みのファイルが一致しなければ失敗する（CI 用）
 * ```
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_NOTICES.txt');
const BUNDLED_PACKAGES = join(ROOT, 'node_modules', '.tmp', 'bundled-packages.json');
const LICENSE_TEXTS = join(ROOT, 'scripts', 'license-texts');

/** 配布しているのは Windows 版だけである（`bundle.targets: ["nsis"]`）。 */
const TARGET = 'x86_64-pc-windows-msvc';

const LICENSE_FILE = /^(?:licen[cs]e|copying|notice|unlicense|third[-_]?party[-_]?notices)(?:[-_.].*)?$/i;
/** `license.js` のようなソースは本文ではない。 */
const SOURCE_FILE = /\.(?:[cm]?[jt]s|json|rs|html?)$/i;
const SEPARATOR = '='.repeat(80);

/**
 * @typedef {{ name: string, version: string, license: string, authors: string[], repository: string, texts: string[] }} Component
 */

function main() {
  const check = process.argv.includes('--check');
  const components = [...npmComponents(), ...rustComponents(), rustStd()];
  const output = render(components);

  if (check) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
    if (current !== output) {
      console.error('THIRD_PARTY_NOTICES.txt が依存と一致していない。`pnpm notices` で作り直してコミットすること。');
      process.exit(1);
    }
    console.log(`THIRD_PARTY_NOTICES.txt は最新である（${components.length} 件）。`);
    return;
  }

  writeFileSync(OUTPUT, output);
  console.log(
    `THIRD_PARTY_NOTICES.txt を書き出した（${components.length} 件 / ${output.length.toLocaleString()} 文字）。`,
  );
}

/** @returns {Component[]} */
function npmComponents() {
  if (!existsSync(BUNDLED_PACKAGES)) {
    throw new Error(`${BUNDLED_PACKAGES} が無い。先に vite build を実行すること。`);
  }
  /** @type {string[]} */
  const dirs = JSON.parse(readFileSync(BUNDLED_PACKAGES, 'utf8'));
  return dirs.map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    const repository = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? pkg.homepage);
    return {
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? ''),
      authors: author ? [author] : [],
      repository: repository ?? '',
      texts: licenseTexts(dir),
    };
  });
}

/** @returns {Component[]} */
function rustComponents() {
  const json = execFileSync('cargo', ['metadata', '--format-version', '1', '--locked', '--filter-platform', TARGET], {
    cwd: join(ROOT, 'src-tauri'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const metadata = JSON.parse(json);
  const packages = new Map(metadata.packages.map((p) => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const isProcMacro = (p) => p.targets.some((t) => t.kind.includes('proc-macro'));

  // 通常の依存だけを辿る。ビルドスクリプトと dev の依存、proc-macro の先はバイナリに入らない。
  const linked = new Set();
  const stack = [metadata.resolve.root];
  while (stack.length > 0) {
    const id = stack.pop();
    if (linked.has(id)) continue;
    linked.add(id);
    if (isProcMacro(packages.get(id))) continue;
    for (const dep of nodes.get(id).deps) {
      if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
    }
  }
  linked.delete(metadata.resolve.root);

  return [...linked]
    .map((id) => packages.get(id))
    .filter((p) => !isProcMacro(p))
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: p.license ?? '',
      authors: p.authors.map((a) => a.replace(/\s*<[^>]*>/, '')),
      repository: p.repository ?? '',
      texts: licenseTexts(dirname(p.manifest_path)),
    }));
}

/**
 * 標準ライブラリは静的にリンクされる。Cargo の依存グラフには現れない。
 * バージョンは書かない。CI と手元で rustc が違うと `--check` が一致しなくなる。
 */
function rustStd() {
  return {
    name: 'Rust standard library',
    version: '',
    license: 'MIT OR Apache-2.0',
    authors: ['The Rust Project Developers'],
    repository: 'https://github.com/rust-lang/rust',
    texts: [],
  };
}

/** パッケージ直下のライセンス文。改行を LF にそろえる。 */
function licenseTexts(dir) {
  return readdirSync(dir)
    .filter((name) => LICENSE_FILE.test(name) && !SOURCE_FILE.test(name) && statSync(join(dir, name)).isFile())
    .toSorted()
    .map((name) => normalize(readFileSync(join(dir, name), 'utf8')));
}

function normalize(text) {
  return text.replace(/^﻿/, '').replaceAll('\r\n', '\n').trim();
}

/**
 * ライセンス文を同梱していないパッケージ向けの本文。
 * SPDX 式の選択肢に MIT があれば MIT を選ぶ。
 */
function fallbackText(component) {
  const choices = component.license.split(/\s+OR\s+|\//).map((s) => s.replace(/[()]/g, '').trim());
  const id = choices.includes('MIT') ? 'MIT' : choices[0];
  const file = join(LICENSE_TEXTS, `${id}.txt`);
  if (!existsSync(file)) {
    throw new Error(
      `${component.name} ${component.version} はライセンス文を同梱しておらず、${id} の本文も scripts/license-texts/ に無い。`,
    );
  }
  const holders = component.authors.length > 0 ? component.authors.join(', ') : `The ${component.name} authors`;
  return normalize(readFileSync(file, 'utf8').replace('{{copyright}}', `Copyright (c) ${holders}`));
}

/**
 * 同じ本文を持つパッケージはまとめて 1 回だけ載せる。
 * Apache-2.0 の本文は多くのクレートで同一であり、まとめないとファイルが数倍になる。
 */
function render(components) {
  /** @type {Map<string, Component[]>} */
  const byText = new Map();
  for (const component of components) {
    const texts = component.texts.length > 0 ? component.texts : [fallbackText(component)];
    for (const text of texts) {
      const list = byText.get(text) ?? [];
      list.push(component);
      byText.set(text, list);
    }
  }

  const label = (c) => (c.version ? `${c.name} ${c.version}` : c.name);
  const sections = [];
  for (const [text, list] of byText) {
    const unique = new Map(list.map((c) => [label(c), c]))
      .values()
      .toArray()
      .toSorted((a, b) => label(a).localeCompare(label(b), 'en'));
    const heads = unique.map(
      (c) => `${label(c)} (${c.license || 'ライセンスの記載なし'})${c.repository ? ` ${c.repository}` : ''}`,
    );
    sections.push({ key: label(unique[0]), body: `${heads.join('\n')}\n\n${text}` });
  }
  const ordered = sections.toSorted((a, b) => a.key.localeCompare(b.key, 'en'));

  const header = [
    'Marxdown が同梱している第三者のソフトウェアと、そのライセンス表示',
    '',
    'このファイルは scripts/gen-third-party-notices.mjs が生成する。手で編集しない。',
    '同じライセンス文を持つソフトウェアは、まとめて 1 回だけ載せている。',
  ].join('\n');

  return `${header}\n\n${ordered.map((s) => `${SEPARATOR}\n${s.body}\n`).join('\n')}`;
}

main();
