'use strict';

const MARKETPLACE_REPO = 'thomasholknielsen/claude-tweaks-marketplace';
const CATALOG_PATH = '.claude-plugin/marketplace.json';

// The catalog entry after the #418 cutover: a `git-subdir` source naming the
// payload subdirectory, pinned at the release commit. Field spellings are the ones
// Probe 1 read out of the shipped CLI's own schema and then verified end-to-end
// (`source` / `url` / `path` / `sha`) — the sha pin was proven discriminating
// against a moving default branch, so an install resolves the exact commit released
// rather than whatever `main` holds when the user installs.
const PLUGIN_REPO_URL = 'https://github.com/thomasholknielsen/claude-tweaks';
const PAYLOAD_SUBDIR = 'plugin';

function composeMirroredCatalog(catalogText, { version, description, sha }) {
  const catalog = JSON.parse(catalogText);
  const entry = (catalog.plugins || []).find((p) => p.name === 'claude-tweaks');
  if (!entry) throw new Error(`no "claude-tweaks" entry in ${CATALOG_PATH}`);
  if (!sha || !String(sha).trim()) {
    throw new Error('a git-subdir mirror must be pinned: no release commit sha was supplied');
  }
  const source = { source: 'git-subdir', url: PLUGIN_REPO_URL, path: PAYLOAD_SUBDIR, sha: String(sha).trim() };

  // The pin, not the version, is what a release changes here. `version` is deleted
  // outright: the installed plugin's version comes from the payload's own
  // plugin.json (Probe 1 §7), so a duplicate in the catalog can only drift — and a
  // leftover one is itself a reason to rewrite, even when the pin already matches.
  const changed =
    'version' in entry ||
    JSON.stringify(entry.source) !== JSON.stringify(source) ||
    (description != null && entry.description !== description);
  delete entry.version;
  entry.source = source;
  if (description != null) entry.description = description;
  return { text: JSON.stringify(catalog, null, 2) + '\n', changed };
}

function mirrorRelease(deps, { version, description, sha, dryRun }) {
  const raw = deps.gh(['api', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`]);
  // `blobSha` is GitHub's contents-API concurrency token for the catalog file — a
  // different thing entirely from `sha`, the claude-tweaks release commit being pinned.
  const { content, sha: blobSha } = JSON.parse(raw);
  const current = Buffer.from(content, 'base64').toString('utf8');
  const { text, changed } = composeMirroredCatalog(current, { version, description, sha });
  if (!changed || dryRun) return { changed, sha: blobSha };
  deps.gh([
    'api', '-X', 'PUT', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`,
    '-f', `message=Mirror claude-tweaks v${version}`,
    '-f', `content=${Buffer.from(text).toString('base64')}`,
    '-f', `sha=${blobSha}`,
    '-f', 'branch=main',
  ]);
  return { changed, sha: blobSha };
}

module.exports = { composeMirroredCatalog, mirrorRelease, MARKETPLACE_REPO };
