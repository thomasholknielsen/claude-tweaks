'use strict';

const MARKETPLACE_REPO = 'thomasholknielsen/claude-tweaks-marketplace';
const CATALOG_PATH = '.claude-plugin/marketplace.json';

function composeMirroredCatalog(catalogText, { version, description }) {
  const catalog = JSON.parse(catalogText);
  const entry = (catalog.plugins || []).find((p) => p.name === 'claude-tweaks');
  if (!entry) throw new Error(`no "claude-tweaks" entry in ${CATALOG_PATH}`);
  const changed = entry.version !== version || (description != null && entry.description !== description);
  entry.version = version;
  if (description != null) entry.description = description;
  return { text: JSON.stringify(catalog, null, 2) + '\n', changed };
}

function mirrorRelease(deps, { version, description, dryRun }) {
  const raw = deps.gh(['api', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`]);
  const { content, sha } = JSON.parse(raw);
  const current = Buffer.from(content, 'base64').toString('utf8');
  const { text, changed } = composeMirroredCatalog(current, { version, description });
  if (!changed || dryRun) return { changed, sha };
  deps.gh([
    'api', '-X', 'PUT', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`,
    '-f', `message=Mirror claude-tweaks v${version}`,
    '-f', `content=${Buffer.from(text).toString('base64')}`,
    '-f', `sha=${sha}`,
    '-f', 'branch=main',
  ]);
  return { changed, sha };
}

module.exports = { composeMirroredCatalog, mirrorRelease };
