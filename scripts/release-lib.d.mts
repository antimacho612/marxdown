// `tests/release.test.ts` から型付きで読むための宣言。実装は `release-lib.mjs`。

export function finalizeChangelog(text: string, version: string, date: string): string;
export function sectionBody(text: string, version: string): string | null;
export function rewriteLinks(text: string): string;
export function setCargoTomlVersion(text: string, version: string): string;
export function setCargoLockVersion(text: string, version: string): string;
export function setPackageJsonVersion(text: string, version: string): string;
export function buildManifest(input: {
  version: string;
  notes: string;
  signature: string;
  fileName: string;
  pubDate: string;
}): {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};
export function previousVersion(text: string, version: string): string | null;
export function buildReleaseNotes(input: { version: string; body: string; previous: string | null }): string;
