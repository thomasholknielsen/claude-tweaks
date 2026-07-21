'use strict';

const MARK_STATUSES = new Set(['declined']);

// Shared `mark <fingerprint> <status>` command — byte-identical across
// harness-health.js, journey-health.js, and docs-health.js before this
// extraction (code-health.js has no mark command, so it doesn't consume
// this). toolName parameterizes the usage message's script name.
//
// The 'declined' mark is always written to the local gitignored cache (the
// pre-existing behavior — every caller must keep working unmodified with no
// other params supplied). Two capabilities are additive and OPTIONAL,
// activated only when the caller supplies them:
//   - `updateCache` (from health-core/cache.js's createCache): if supplied,
//     the local write goes through an atomic read-modify-write instead of a
//     bare readCache-then-writeCache pair, closing the race where two
//     near-simultaneous `mark` invocations against the same cache.json
//     silently clobber one another.
//   - `readDurableState`/`writeDurableState` (from a skill's own cache.js,
//     wrapping health-core/durable-state.js's createDurableState with
//     includeDeclined: true): if BOTH are supplied, the declined mark is
//     ALSO persisted to the health-state git branch — durable across a
//     scheduled Routine firing's fresh, stateless container, unlike the
//     local cache, which does not survive that. Without this, a 'declined'
//     finding (by definition never filed as a GitHub issue, so nothing for
//     dedup to reconstruct from) would silently reappear on the next
//     Routine firing despite the skill's own documented "suppressed
//     forever" promise.
function makeCmdMark({ readCache, writeCache, updateCache, readDurableState, writeDurableState, toolName }) {
  return function cmdMark(args) {
    const root = args.root || process.cwd();
    const fp = args._[1];
    const status = args._[2];
    if (!fp || !MARK_STATUSES.has(status)) {
      process.stderr.write(`usage: ${toolName}.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
      process.exit(2);
    }
    const entry = { status, lastSeenMs: Date.now() };
    let cache;
    if (updateCache) {
      cache = updateCache(root, (current) => ({ ...current, [fp]: entry }));
    } else {
      cache = readCache(root);
      cache[fp] = entry;
      writeCache(root, cache);
    }
    if (readDurableState && writeDurableState) {
      const result = writeDurableState(root, (current) => ({
        ...current,
        declined: { ...(current.declined || {}), [fp]: { lastSeenMs: entry.lastSeenMs } },
      }));
      if (!result.ok) {
        process.stderr.write(`mark: durable health-state persistence failed (declined mark is still saved locally): ${result.error}\n`);
      }
    }
    process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
  };
}

module.exports = { makeCmdMark, MARK_STATUSES };
