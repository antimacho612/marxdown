/**
 * `release.mjs` の純粋な部分。テスト（`tests/release.test.ts`）から読むために分けてある。
 */
export const REPOSITORY = 'https://github.com/antimacho612/marxdown';

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * pre-release の版か（`1.5.0-beta.1`）。
 *
 * macOS / Linux のプレビューは pre-release にだけ載せる（ADR-0028 §3.8）。
 * pre-release では CHANGELOG の Unreleased を確定させない。
 * 確定させると、その項目が次の安定版の本文から抜ける。
 */
export function isPrerelease(version) {
  return version.includes('-');
}
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
    latest ? `[Unreleased]: ${REPOSITORY}/compare/v${latest}...HEAD` : `[Unreleased]: ${REPOSITORY}/commits/develop`,
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

/** CHANGELOG で最後に確定した版。無ければ `null`。pre-release の比較の起点になる。 */
export function latestVersion(text) {
  return (
    text
      .matchAll(SECTION)
      .map((m) => m[1])
      .find((v) => v !== 'Unreleased') ?? null
  );
}

/** CHANGELOG で `version` の 1 つ前に確定した版。無ければ `null`。 */
export function previousVersion(text, version) {
  const versions = text
    .matchAll(SECTION)
    .map((m) => m[1])
    .filter((v) => v !== 'Unreleased')
    .toArray();
  const index = versions.indexOf(version);
  return index === -1 ? null : (versions[index + 1] ?? null);
}

/**
 * GitHub の Release の本文。CHANGELOG の節を「What's new」に置き、ダウンロードと比較のリンクを足す。
 *
 * NOTE: 「Why it matters」は自動では書けないため、HTML コメントの雛形だけを置く。
 * 書かずに公開しても、コメントは表示されない。
 */
export function buildReleaseNotes({ version, body, previous }) {
  const fileName = `Marxdown_${version}_x64-setup.exe`;
  const compare = previous
    ? `[v${previous}...v${version}](${REPOSITORY}/compare/v${previous}...v${version})`
    : `[v${version}](${REPOSITORY}/releases/tag/v${version})`;
  if (isPrerelease(version)) return buildPreviewNotes({ version, body, compare });
  return `<!--
公開する前に、タイトルを「Marxdown v${version} — <この版で良くなったこと>」に変え、下の Why it matters を書く（CONTRIBUTING.md「リリース」）。
-->

## What's new

${body}

<!--
## Why it matters

利用者から見て何が良くなったのかを 1〜3 文で書く。
-->

## Download

**Windows 10 / 11 (x64):** [${fileName}](${REPOSITORY}/releases/download/v${version}/${fileName})

Already installed? Marxdown shows an update notification. Choose "Update and Restart".<br />
インストール済みの場合は、アプリ内の通知から「更新して再起動」で更新できます。

> [!NOTE]
> Windows may show a SmartScreen warning because the installer is currently unsigned. Choose "More info" and then "Run anyway".<br />
> インストーラーには現在コード署名をしていないため、SmartScreen の警告が表示されることがあります。「詳細情報」→「実行」で続けられます。

## Full changelog

[CHANGELOG.md](${REPOSITORY}/blob/main/CHANGELOG.md) · ${compare}
`;
}

/**
 * pre-release の本文。
 * macOS / Linux のプレビュー（ADR-0028 §3.8）の配布物を並べる。
 *
 * 既知の制約は README の節へ誘導する。
 * 設計ドキュメントは公開していない。
 */
function buildPreviewNotes({ version, body, compare }) {
  const asset = (name) => `[${name}](${REPOSITORY}/releases/download/v${version}/${name})`;
  return `<!--
公開する前に、タイトルを「Marxdown v${version} — <この版で試してほしいこと>」に変える（CONTRIBUTING.md「リリース」）。
-->

> [!IMPORTANT]
> This is a pre-release. macOS and Linux builds are previews. They do not update automatically; download new versions from Releases.<br />
> これはプレリリースです。macOS と Linux はプレビュー版で、自動では更新されません。新しい版は Releases から入れてください。<br />
> Known limitations / 既知の制約: [README](${REPOSITORY}#macos--linux-preview)

## What's new

${body}

## Download

| OS | File |
| --- | --- |
| Windows 10 / 11 (x64) | ${asset(`Marxdown_${version}_x64-setup.exe`)} |
| macOS 14+ (Apple silicon) | ${asset(`Marxdown_${version}_aarch64.dmg`)} |
| macOS 14+ (Intel) | ${asset(`Marxdown_${version}_x64.dmg`)} |
| Linux (x86_64, .deb) | ${asset(`Marxdown_${version}_amd64.deb`)} |
| Linux (x86_64, AppImage) | ${asset(`Marxdown_${version}_amd64.AppImage`)} |

> [!NOTE]
> The builds are unsigned. On macOS, Gatekeeper blocks the first launch; see the README for how to open it. The AppImage needs \`libfuse2\`.<br />
> 署名していないため、macOS では初回の起動を Gatekeeper が止めます。開き方は README にあります。AppImage には \`libfuse2\` が要ります。

## Full changelog

[CHANGELOG.md](${REPOSITORY}/blob/develop/CHANGELOG.md) · ${compare}
`;
}
