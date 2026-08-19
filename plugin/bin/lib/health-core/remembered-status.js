'use strict';

// Minimal `status` command for a health-sweep CLI that writes the durable
// `remembered` cache tier (sub-threshold findings held back rather than
// filed — see each domain's cache.js `includeRemembered` flag) but, unlike
// code-health, has no existing `status` subcommand of its own. #239 found
// harness-health and docs-health writing `remembered` every firing with
// zero readers anywhere — not even the narrow informational count
// code-health's own `status` command already exposes. This gives them the
// same narrow-but-real consumer rather than leaving the write orphaned.
//
// Deliberately does not replicate code-health's full `status` (open/
// regressed/closed counts, the `--fail-on` CI gate) — that machinery reads
// the *local* gitignored cache's per-fingerprint `status` field, which is a
// code-health-specific vocabulary this module has no business assuming.
// This command only ever reports the durable `remembered` count.
function makeCmdStatus({ readDurableState }) {
  return function cmdStatus(args) {
    const root = (args && args.root) || process.cwd();
    const remembered = Object.keys(readDurableState(root).remembered).length;
    process.stdout.write(`remembered:${remembered}\n`);
  };
}

module.exports = { makeCmdStatus };
