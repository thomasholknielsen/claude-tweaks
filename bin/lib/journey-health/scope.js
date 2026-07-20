'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS_LIGHT, STALE_DAYS_DEEP } = require('./score');
const { selectByStaleThenChurn } = require('../health-core/rotation');

// ─── parseJourneyFiles ───────────────────────────────────────────────────────
// Extracts a journey file's `files:` frontmatter list, e.g.:
//   ---
//   files:
//     - src/checkout/Cart.tsx
//   ---
// Returns [] if there's no frontmatter, no `files:` key, or no list items —
// an unparseable header means "no declared domain," not an error.
function parseJourneyFiles(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const filesIdx = frontmatter.findIndex((l) => /^files:\s*$/.test(l));
  if (filesIdx === -1) return [];
  const paths = [];
  for (let i = filesIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    paths.push(m[1]);
  }
  return paths;
}

// ─── caches ──────────────────────────────────────────────────────────────────
// selectTarget is called once per slot in a --budget > 1 loop (see
// journey-health.js's cmdNextTarget), and nothing on disk changes between
// slots of the same run. Without caching, every slot redid the full
// docs/journeys readdir+readFile scan (listJourneys) and, once Phase 1
// staleness is exhausted, a fresh `git log` subprocess per remaining
// candidate (domainChurn) — purely wasted I/O that scaled with budget times
// journey count. Both caches below are keyed on inputs that only change when
// the underlying data actually could, so a call repeated with the same
// inputs in the same process reuses the prior result instead of redoing the
// I/O; a call whose inputs genuinely changed (a journey file edited, a
// candidate's cursor bumped to a new sinceMs after being picked) still gets
// a fresh read.
const journeysCache = new Map(); // root -> { fingerprint, journeys }
const churnCache = new Map(); // "root relPaths sinceMs" -> count

// ─── listJourneys ────────────────────────────────────────────────────────────
// Returns [{ kind: 'journey', id, path, filesFrontmatter }] for each
// docs/journeys/*.md file, sorted by id. Empty array if the directory doesn't
// exist — a project with no journeys yet is a valid state, not an error.
// Caches the parsed result per root, validated on each call against a cheap
// name+mtime+size fingerprint (stat only, no content read) — so repeated
// calls in the same process skip the expensive readFileSync+parse work
// unless a journey file was actually added, removed, or modified.
function listJourneys(root) {
  const dir = path.join(root, 'docs', 'journeys');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

  const fingerprint = mdFiles
    .map((e) => {
      try {
        const st = fs.statSync(path.join(dir, e.name));
        return `${e.name}:${st.mtimeMs}:${st.size}`;
      } catch {
        return `${e.name}:?`;
      }
    })
    .sort()
    .join('|');

  const cached = journeysCache.get(root);
  if (cached && cached.fingerprint === fingerprint) return cached.journeys;

  const journeys = mdFiles
    .map((e) => {
      const filePath = path.join(dir, e.name);
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* unreadable -> no files */ }
      return { kind: 'journey', id: e.name.slice(0, -3), path: filePath, filesFrontmatter: parseJourneyFiles(content) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  journeysCache.set(root, { fingerprint, journeys });
  return journeys;
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms). Returns
// 0 (not an error) when git is unavailable, paths don't exist, or there is no
// churn — the caller treats 0 as "nothing changed," not a failure signal.
// Memoized per exact (root, relPaths, sinceMs) triple — see the caches
// comment above listJourneys — so a --budget > 1 loop's repeated Phase 2 pass
// over the same not-yet-picked candidates reuses the prior `git log` result
// instead of re-spawning the subprocess every slot.
function domainChurn(root, relPaths, sinceMs) {
  if (!relPaths || relPaths.length === 0) return 0;
  const key = `${root} ${relPaths.join(' ')} ${sinceMs || 0}`;
  if (churnCache.has(key)) return churnCache.get(key);
  let count;
  try {
    const since = new Date(sinceMs || 0).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...relPaths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    count = out.split('\n').filter(Boolean).length;
  } catch {
    count = 0;
  }
  churnCache.set(key, count);
  return count;
}

// ─── selectTarget ────────────────────────────────────────────────────────────
// opts: { now?: number, tier?: 'light'|'deep', signals?: { [id]: number } }
// Returns { kind: 'journey', id, path, filesFrontmatter, why: 'stale'|'hotspot', ... } or null.
// Light and deep tiers use independent staleness thresholds and independent
// cursor fields (lastLightAuditMs vs lastDeepAuditMs) — a journey force-picked
// as light-stale is not automatically deep-stale too, and vice versa.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const tier = opts.tier === 'deep' ? 'deep' : 'light';
  const signals = opts.signals || null; // test injection hook — churn override by id
  // Within-batch dedup for --budget > 1 callers, Phase 0 only. Phases 1/2
  // already self-exclude a just-picked journey via the cursor bump the
  // --budget loop applies after every pick (daysSince/churn-since-bump both
  // read as ~0) — Phase 0 ignores cursors entirely (it's a raw existence
  // check), so it needs its own exclusion signal or it would return the same
  // deleted-file journey on every remaining slot in the batch.
  const alreadyPicked = opts.alreadyPicked || null;
  const staleDays = tier === 'deep' ? STALE_DAYS_DEEP : STALE_DAYS_LIGHT;
  const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';

  const candidates = listJourneys(root);

  // Phase 0 (light tier only): force-pick any journey with a declared file
  // that no longer exists. This is a stronger, more certain signal than
  // staleness or churn, and requires no LLM judgment to detect — a plain
  // existence check. Deep tier does not get this phase: its own
  // post-selection "skip condition" (SKILL.md Step 3.5) already handles a
  // broken journey without permanently parking the deep-tier rotation on it.
  // Not part of the shared rotation core (health-core/rotation.js) — it has
  // no analogue in the other three engines' Phase 1/2 shape, so it stays
  // here and only calls into the shared core for its own Phase 1/2 once
  // Phase 0 has had its chance to return first.
  if (tier === 'light') {
    for (const candidate of candidates) {
      if (alreadyPicked && alreadyPicked.has(candidate.id)) continue;
      const missing = candidate.filesFrontmatter.filter(
        (relPath) => !fs.existsSync(path.join(root, relPath)),
      );
      if (missing.length > 0) {
        return { ...candidate, why: 'deleted-file', missingFiles: missing };
      }
    }
  }

  return selectByStaleThenChurn(candidates, cursors, {
    now,
    staleDays,
    getCursorKey: (candidate) => candidate.id,
    getLastAuditedMs: (cursor) => (cursor && cursor[auditField] != null ? cursor[auditField] : null),
    // Score by churn on filesFrontmatter since last audit on this tier.
    computeScore: (candidate, cursor, sinceMs) => {
      const churn = signals ? (signals[candidate.id] || 0) : domainChurn(root, candidate.filesFrontmatter, sinceMs);
      return churn > 0 ? churn : null;
    },
    buildHotspotResult: (candidate, score) => ({ ...candidate, why: 'hotspot', churnCount: score }),
  });
}

module.exports = { parseJourneyFiles, listJourneys, domainChurn, selectTarget };
