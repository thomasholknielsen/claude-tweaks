'use strict';
const fs = require('fs');
const { enqueueRetry, dequeueRetry, shouldEscalate } = require('./durable-state');

// Shared retry-queue CLI command bodies for code-health, harness-health, and
// journey-health — each CLI calls makeRetryQueueCommands bound to its own
// readDurableState/writeDurableState (from its own cache.js) and wires the
// two returned functions to its `retry-queue drain`/`retry-queue update`
// subcommands. One implementation instead of three near-identical copies.
function makeRetryQueueCommands({ readDurableState, writeDurableState }) {
  function drain(args) {
    const root = args.root || process.cwd();
    const { retryQueue } = readDurableState(root);
    process.stdout.write(JSON.stringify(retryQueue.map((e) => e.payload), null, 2) + '\n');
  }

  // results: [{ fingerprint, payload, ok: true }] or
  // [{ fingerprint, payload, ok: false, error }] — one entry per payload this
  // firing just attempted to file (retry-queue drain results and/or brand-new
  // findings that failed this firing's own filing step). Prints the entries
  // that just crossed the 3-strikes escalation threshold, for the calling
  // skill to file a {skill}:filing-failed issue for each.
  function update(args) {
    const root = args.root || process.cwd();
    const resultsPath = args._[1];
    if (!resultsPath) {
      process.stderr.write('usage: <cli>.js retry-queue update <results.json> [--root <dir>]\n');
      process.exit(2);
    }
    let results;
    try {
      results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`retry-queue update: could not read or parse ${resultsPath}: ${err.message}\n`);
      process.exit(1);
    }
    const escalated = [];
    const result = writeDurableState(root, (current) => {
      let queue = current.retryQueue;
      for (const r of results) {
        if (r.ok) {
          queue = dequeueRetry(queue, r.fingerprint);
        } else {
          queue = enqueueRetry(queue, { fingerprint: r.fingerprint, payload: r.payload, lastError: r.error });
          const entry = queue.find((e) => e.fingerprint === r.fingerprint);
          if (shouldEscalate(entry)) escalated.push(entry);
        }
      }
      return { ...current, retryQueue: queue };
    });
    if (!result.ok) {
      process.stderr.write(`retry-queue update: health-state persistence failed after retries: ${result.error}\n`);
    }
    process.stdout.write(JSON.stringify(escalated, null, 2) + '\n');
  }

  return { drain, update };
}

module.exports = { makeRetryQueueCommands };
