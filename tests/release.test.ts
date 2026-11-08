import { describe, expect, it } from 'vitest';

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
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
} from '../scripts/release-lib.mjs';

const REPO = 'https://github.com/antimacho612/marxdown';

const FIRST = `# 変更履歴

前書き。[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従う。

## [Unreleased]

### 追加

- 自動更新

[Unreleased]: ${REPO}/commits/develop
`;

describe('finalizeChangelog', () => {
  it('最初の版は Release のタグを指し、Unreleased は空で残る', () => {
    const out = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');

    expect(out).toContain('## [Unreleased]\n\n## [0.1.0] - 2026-10-01\n\n### 追加');
    expect(out.endsWith(`[Unreleased]: ${REPO}/compare/v0.1.0...HEAD\n[0.1.0]: ${REPO}/releases/tag/v0.1.0\n`)).toBe(
      true,
    );
    expect(sectionBody(out, 'Unreleased')).toBe('');
  });

  it('2 つ目以降の版は、1 つ前の版との比較を指す', () => {
    const first = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    const next = first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### 修正\n\n- 何かを直した\n');
    const out = finalizeChangelog(next, '0.2.0', '2026-11-01');

    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v0.2.0...HEAD`);
    expect(out).toContain(`[0.2.0]: ${REPO}/compare/v0.1.0...v0.2.0`);
    expect(out).toContain(`[0.1.0]: ${REPO}/releases/tag/v0.1.0`);
    expect(sectionBody(out, '0.2.0')).toBe('### 修正\n\n- 何かを直した');
  });

  it('Unreleased が空なら版を上げない', () => {
    const empty = FIRST.replace('### 追加\n\n- 自動更新\n', '');
    expect(() => finalizeChangelog(empty, '0.1.0', '2026-10-01')).toThrow(/空/);
  });

  it('同じ版を二重に確定させない', () => {
    const once = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    const again = once.replace('## [Unreleased]\n', '## [Unreleased]\n\n- 追記\n');
    expect(() => finalizeChangelog(again, '0.1.0', '2026-10-02')).toThrow(/既に/);
  });
});

describe('sectionBody', () => {
  it('日付と末尾のリンク定義を本文に含めない', () => {
    const out = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    expect(sectionBody(out, '0.1.0')).toBe('### 追加\n\n- 自動更新');
  });

  it('無い版は null', () => {
    expect(sectionBody(FIRST, '9.9.9')).toBeNull();
  });
});

describe('版の書き換え', () => {
  it('Cargo.toml は [package] の version だけを変え、依存の version に触れない', () => {
    const toml = [
      '[package]',
      'name = "marxdown"',
      'version = "0.1.0"',
      'authors = ["a"]',
      '',
      "[target.'cfg(windows)'.dependencies.windows]",
      'version = "0.61"',
      '',
    ].join('\n');
    const out = setCargoTomlVersion(toml, '0.2.0');
    expect(out).toContain('name = "marxdown"\nversion = "0.2.0"');
    expect(out).toContain('version = "0.61"');
  });

  it('Cargo.lock は自分自身のエントリだけを変える', () => {
    const lock = [
      '[[package]]',
      'name = "markup5ever"',
      'version = "0.14.1"',
      '',
      '[[package]]',
      'name = "marxdown"',
      'version = "0.1.0"',
      '',
    ].join('\n');
    const out = setCargoLockVersion(lock, '0.2.0');
    expect(out).toContain('name = "markup5ever"\nversion = "0.14.1"');
    expect(out).toContain('name = "marxdown"\nversion = "0.2.0"');
  });

  it('package.json はトップレベルの version だけを変え、整形を保つ', () => {
    const json = '{\n  "name": "marxdown",\n  "version": "0.1.0",\n  "dependencies": {\n    "x": "^1"\n  }\n}\n';
    expect(setPackageJsonVersion(json, '0.2.0')).toBe(json.replace('0.1.0', '0.2.0'));
  });
});

describe('buildManifest', () => {
  it('インストーラの URL は版のタグを直接指す', () => {
    const m = buildManifest({
      version: '0.2.0',
      notes: 'n',
      signature: 'sig',
      fileName: 'Marxdown_0.2.0_x64-setup.exe',
      pubDate: '2026-11-01T00:00:00.000Z',
    });
    expect(m.platforms['windows-x86_64']).toEqual({
      signature: 'sig',
      url: `${REPO}/releases/download/v0.2.0/Marxdown_0.2.0_x64-setup.exe`,
    });
  });
});

describe('buildReleaseNotes', () => {
  it("CHANGELOG の節を What's new に置き、インストーラと 1 つ前の版との比較を指す", () => {
    const first = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    const changelog = finalizeChangelog(
      first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### 修正\n\n- 何かを直した\n'),
      '0.2.0',
      '2026-11-01',
    );
    expect(previousVersion(changelog, '0.2.0')).toBe('0.1.0');

    const body = sectionBody(changelog, '0.2.0') ?? '';
    const out = buildReleaseNotes({ version: '0.2.0', body, previous: previousVersion(changelog, '0.2.0') });

    expect(out).toContain("## What's new\n\n### 修正\n\n- 何かを直した");
    expect(out).toContain(`${REPO}/releases/download/v0.2.0/Marxdown_0.2.0_x64-setup.exe`);
    expect(out).toContain(`${REPO}/compare/v0.1.0...v0.2.0`);
  });

  it('最初の版は比較の代わりにタグを指す', () => {
    const changelog = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    expect(previousVersion(changelog, '0.1.0')).toBeNull();

    const out = buildReleaseNotes({ version: '0.1.0', body: '- 自動更新', previous: null });
    expect(out).toContain(`[v0.1.0](${REPO}/releases/tag/v0.1.0)`);
    expect(out).not.toContain('/compare/');
  });
});

describe('release-notes/<版>.md', () => {
  const HIGHLIGHTS = `---
title: Cleaner tables
---

<!-- 書き方の説明 -->

## What's new

- **Tables are centered.** Wide tables no longer stick to the left.

## Why it matters

Long documents look tidy.
`;

  it('Front Matter の title と、HTML コメントを除いた本文を読む', () => {
    const highlights = parseHighlights(HIGHLIGHTS);

    expect(highlights.title).toBe('Cleaner tables');
    expect(highlights.body.startsWith("## What's new\n\n- **Tables are centered.**")).toBe(true);
    expect(highlights.body).not.toContain('<!--');
    expect(releaseTitle('0.3.0', highlights)).toBe('Marxdown v0.3.0 — Cleaner tables');
    expect(releaseTitle('0.3.0', null)).toBe('Marxdown v0.3.0');
  });

  it('雛形のままでは失敗する', () => {
    expect(() => parseHighlights(releaseNotesTemplate('0.3.0'))).toThrow('title');
    const titled = releaseNotesTemplate('0.3.0').replace('title:', 'title: Cleaner tables');
    expect(() => parseHighlights(titled)).toThrow("What's new");
  });

  it('あれば英語の本文に続けて CHANGELOG の節を日本語の変更内容に置き、雛形のコメントを残さない', () => {
    const out = buildReleaseNotes({
      version: '0.3.0',
      body: '### 修正\n\n- 表を中央に置いた',
      previous: '0.2.0',
      highlights: parseHighlights(HIGHLIGHTS),
    });

    expect(out.indexOf("## What's new")).toBeLessThan(out.indexOf('## Download'));
    expect(out).toContain('## 変更内容（日本語）\n\n### 修正\n\n- 表を中央に置いた');
    expect(out).toContain('Long documents look tidy.');
    expect(out).not.toContain('<!--');
  });

  it('プレビューの pre-release を渡すと、Download からそちらへ誘導する', () => {
    const out = buildReleaseNotes({ version: '0.3.0', body: '- 修正', previous: '0.2.0', preview: 'v0.3.0-beta.1' });
    expect(out).toContain(`[v0.3.0-beta.1](${REPO}/releases/tag/v0.3.0-beta.1)`);
    expect(out.indexOf('v0.3.0-beta.1')).toBeLessThan(out.indexOf('## Full changelog'));
  });
});

describe('pre-release（ADR-0028 §3.8）', () => {
  it('Unreleased を確定させないため、比較の起点は最後に確定した版になる', () => {
    const changelog = finalizeChangelog(FIRST, '0.1.0', '2026-10-01');
    expect(isPrerelease('0.2.0-beta.1')).toBe(true);
    expect(isPrerelease('0.2.0')).toBe(false);
    expect(latestVersion(changelog)).toBe('0.1.0');
  });

  it('macOS / Linux の配布物を並べ、プレビューであることを書く', () => {
    const out = buildReleaseNotes({ version: '0.2.0-beta.1', body: '- macOS', previous: '0.1.0' });

    expect(out).toContain('[!IMPORTANT]');
    expect(out).toContain(`${REPO}/releases/download/v0.2.0-beta.1/Marxdown_0.2.0-beta.1_aarch64.dmg`);
    expect(out).toContain(`${REPO}/releases/download/v0.2.0-beta.1/Marxdown_0.2.0-beta.1_amd64.AppImage`);
    expect(out).toContain(`${REPO}/compare/v0.1.0...v0.2.0-beta.1`);
  });
});
