'use strict';
const { precheck } = require('./precheck.js');
const { bumpManifest, stubChangelogEntry, RELEASE_FILES } = require('./compose.js');
const { mirrorRelease } = require('./mirror.js');

function runRelease(deps, { part, summary, date, dryRun, log }) {
  const branch = deps.git(['branch', '--show-current']).trim();
  if (branch !== 'main') throw new Error(`releases run from main; current branch is "${branch}"`);
  if (deps.git(['status', '--porcelain']).trim() !== '') throw new Error('working tree is not clean');

  const { candidate: version, result } = precheck(deps, part);
  if (!result.ok) {
    const lines = result.conflicts.map((c) => `  - ${c.source}: ${c.detail} claims v${c.version}`);
    throw new Error(`version collision on v${version}:\n${lines.join('\n')}\nSuggested renumber: v${result.suggested}. Resolve and re-run.`);
  }

  const [manifestPath, changelogPath, shippedPath] = RELEASE_FILES;
  const newManifest = bumpManifest(deps.readFile(manifestPath), version);
  const newChangelog = stubChangelogEntry(deps.readFile(changelogPath), version, summary);

  if (dryRun) {
    log(`[dry-run] would bump ${manifestPath} to v${version}`);
    log(`[dry-run] would stub CHANGELOG heading "## v${version} — ${summary}"`);
    log(`[dry-run] would append "${version}\t${date}\trelease" to ${shippedPath}`);
    log('[dry-run] would commit the trio, verify ancestry, push origin main, and mirror the marketplace');
    return { version, pushed: false, mirrored: false };
  }

  deps.writeFile(manifestPath, newManifest);
  deps.writeFile(changelogPath, newChangelog);
  deps.appendShipped(deps.repoRoot, version, date);

  deps.git(['add', ...RELEASE_FILES]);
  const staged = deps.git(['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean).sort();
  const expected = [...RELEASE_FILES].sort();
  if (JSON.stringify(staged) !== JSON.stringify(expected)) {
    throw new Error(`staged set is not exactly the release trio: ${staged.join(', ')}`);
  }
  deps.git(['commit', '-m', `Release v${version} — ${summary}`]);

  deps.git(['fetch', 'origin', 'main']);
  try {
    deps.git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  } catch {
    throw new Error('origin/main diverged between pre-check and push — rebase and re-run; never force');
  }
  deps.git(['push', 'origin', 'main']);
  log(`pushed v${version} to origin/main`);

  const description = JSON.parse(newManifest).description;
  const { changed } = mirrorRelease(deps, { version, description, dryRun: false });
  log(changed ? 'marketplace mirrored' : 'marketplace already current');
  return { version, pushed: true, mirrored: changed };
}

module.exports = { runRelease };
