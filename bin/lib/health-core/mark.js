'use strict';

const MARK_STATUSES = new Set(['declined']);

// Shared `mark <fingerprint> <status>` command — byte-identical across
// harness-health.js, journey-health.js, and docs-health.js before this
// extraction (code-health.js has no mark command, so it doesn't consume
// this). toolName parameterizes the usage message's script name.
function makeCmdMark({ readCache, writeCache, toolName }) {
  return function cmdMark(args) {
    const root = args.root || process.cwd();
    const fp = args._[1];
    const status = args._[2];
    if (!fp || !MARK_STATUSES.has(status)) {
      process.stderr.write(`usage: ${toolName}.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
      process.exit(2);
    }
    const cache = readCache(root);
    cache[fp] = { status, lastSeenMs: Date.now() };
    writeCache(root, cache);
    process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
  };
}

module.exports = { makeCmdMark, MARK_STATUSES };
