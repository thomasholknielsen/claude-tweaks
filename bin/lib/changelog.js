'use strict';

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) {
    throw new Error(`Invalid semver version: "${v}"`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a, b) {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

// Declared once and reused via matchAll (not exec/test in a loop) — matchAll operates on an
// internal clone and never mutates this regex's lastIndex, so reuse across calls is safe.
const HEADER_RE = /^## v(\d+\.\d+\.\d+) — (.+)$/gm;

function parseChangelogVersions(changelogText) {
  const matches = [...changelogText.matchAll(HEADER_RE)];
  return matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : changelogText.length;
    return {
      version: match[1],
      title: match[2].trim(),
      body: changelogText.slice(start, end).trim(),
    };
  });
}

function extractChangelogRange(changelogText, oldVersion, newVersion) {
  return parseChangelogVersions(changelogText).filter(
    (entry) =>
      compareVersions(entry.version, oldVersion) > 0 &&
      compareVersions(entry.version, newVersion) <= 0,
  );
}

module.exports = { compareVersions, parseChangelogVersions, extractChangelogRange };
