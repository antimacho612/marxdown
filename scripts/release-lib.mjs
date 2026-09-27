/**
 * `release.mjs` の純粋な部分。テスト（`tests/release.test.ts`）から読むために分けてある。
 */
export const REPOSITORY = 'https://github.com/antimacho612/marxdown';

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const UNRELEASED = '## [Unreleased]';
/** 節の見出し。`## [0.2.0] - 2026-10-01` と `## [Unreleased]` の両方に合う。 */
const SECTION = /^## \[([^\]]+)\]/gm;
/** 末尾のリンク定義。`[0.2.0]: https://...` */
const LINK_DEFINITION = /^\[[^\]]+\]: .*$/gm;

/**
 * CHANGELOG の Unreleased の節を `version` の節に確定させ、空の Unreleased を先頭に残す。
 *
 * Unreleased が空なら失敗する。
 * 利用者に見える変更の無い版は出さない。
 */
export function finalizeChangelog(text, version, date) {
  if (!text.includes(UNRELEASED)) throw new Error('CHANGELOG.md に `## [Unreleased]` が無い。');
  if (sectionBody(text, version) !== null) throw new Error(`CHANGELOG.md には既に ${version} の節がある。`);

  const body = sectionBody(text, 'Unreleased');
  if (!body?.trim())
    throw new Error('CHANGELOG.md の Unreleased が空である。利用者に見える変更を書いてから版を上げること。');

  const released = text.replace(UNRELEASED, `${UNRELEASED}\n\n## [${version}] - ${date}`);
  return rewriteLinks(released);
}

/**
 * 節の本文（見出しの次の行から、次の節の見出しの手前まで）。無ければ `null`。
 *
 * 末尾のリンク定義は本文に含めない。
 */
export function sectionBody(text, version) {
  const headings = text.matchAll(SECTION).toArray();
  const index = headings.findIndex((m) => m[1] === version);
  if (index === -1) return null;

  const heading = headings[index];
  const start = heading.index + heading[0].length;
  const next = headings[index + 1];
  const end = next ? next.index : text.length;
  return text
    .slice(start, end)
    .replace(/^ - \d{4}-\d{2}-\d{2}/, '')
    .replaceAll(LINK_DEFINITION, '')
    .trim();
}

/**
 * 末尾のリンク定義を、節の並びから作り直す。
 *
 * 手で書くと、版を足すたびに比較の起点を 1 つずつずらす作業が要り、必ずどこかがずれる。
 */
export function rewriteLinks(text) {
  const versions = text
    .matchAll(SECTION)
    .map((m) => m[1])
    .filter((v) => v !== 'Unreleased')
    .toArray();
  const [latest] = versions;

  const links = [
    latest ? `[Unreleased]: ${REPOSITORY}/compare/v${latest}...HEAD` : `[Unreleased]: ${REPOSITORY}/commits/main`,
    ...versions.map((version, i) => {
      const previous = versions[i + 1];
      return previous
        ? `[${version}]: ${REPOSITORY}/compare/v${previous}...v${version}`
        : `[${version}]: ${REPOSITORY}/releases/tag/v${version}`;
    }),
  ];

  const withoutLinks = text.replaceAll(LINK_DEFINITION, '').trimEnd();
  return `${withoutLinks}\n\n${links.join('\n')}\n`;
}

/** `Cargo.toml` の `[package]` の `version` を書き換える。依存の `version` には触れない。 */
export function setCargoTomlVersion(text, version) {
  const packageHeader = text.indexOf('[package]');
  const next = text.indexOf('\n[', packageHeader + 1);
  const end = next === -1 ? text.length : next;
  const section = text.slice(packageHeader, end).replace(/^version = ".*"$/m, `version = "${version}"`);
  return text.slice(0, packageHeader) + section + text.slice(end);
}

/** `Cargo.lock` の自分自身のエントリの `version` を書き換える。 */
export function setCargoLockVersion(text, version) {
  return text.replace(/(\[\[package\]\]\r?\nname = "marxdown"\r?\nversion = )".*"/, `$1"${version}"`);
}

/** `package.json` の `version` を書き換える。整形を保つため、JSON として読み直さず文字列で置き換える。 */
export function setPackageJsonVersion(text, version) {
  return text.replace(/^( {2}"version": )".*"/m, `$1"${version}"`);
}

/**
 * updater が読む `latest.json`（Tauri の静的 JSON の形）。
 *
 * `url` は版のタグを直接指す。
 * `releases/latest/download/` を指すと、次の版を公開した瞬間に古い `latest.json` の署名と中身が食い違う。
 */
export function buildManifest({ version, notes, signature, fileName, pubDate }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'windows-x86_64': {
        signature,
        url: `${REPOSITORY}/releases/download/v${version}/${fileName}`,
      },
    },
  };
}
