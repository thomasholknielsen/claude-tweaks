'use strict';
const fs = require('fs');
const { emitPendingWrite } = require('./mcp-pending');

// Shared `retry-durable-write <retry-input.json>` command for code-health,
// harness-health, journey-health, and docs-health — bound to each CLI's own
// writeDurableState/buildValidateFindingsUpdate, the same way retry-cli.js's
// makeRetryQueueCommands is bound to each CLI's retry-queue commands.
//
// Why it exists: `validate-findings` does two unrelated jobs in one
// invocation — (a) discover findings, dedup them against the local cache.json,
// mark the survivors staged there, and emit them as payloads; and (b) persist
// this firing's cursor/run/remembered update to the durable health-state
// branch. On the MCP path, only (b) can fail with a CAS conflict, and only (b)
// needs retrying — but re-invoking `validate-findings` to retry it also redoes
// (a), whose first invocation already marked those findings staged, so the
// second run dedups them away and emits an empty payloads array. A calling
// skill whose retry loop redirects each attempt into the same payloads file
// therefore destroys the findings it was about to file. (Verified in practice:
// the same invocation run twice produces a real finding, then [].)
//
// This command re-runs (b) alone, from the mutator input the original
// invocation already computed and emitted (mcp-pending.js's
// HEALTH_STATE_MCP_RETRY_INPUT line). writeDurableState still re-fetches the
// branch's current state and re-applies the mutator against it on every call,
// so a genuine concurrent update by another firing still resolves correctly —
// what's reused across attempts is this firing's own input, never the other
// firing's state.
//
// It must never touch cache.json, never run finding discovery/dedup, and never
// write payloads to stdout.
function makeCmdRetryDurableWrite({ writeDurableState, buildValidateFindingsUpdate, toolName }) {
  return function cmdRetryDurableWrite(args) {
    const root = args.root || process.cwd();
    const inputPath = args._[1];
    if (!inputPath) {
      process.stderr.write(`usage: ${toolName}.js retry-durable-write <retry-input.json> [--root <dir>]\n`);
      process.exit(2);
    }
    let input;
    try {
      input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`retry-durable-write: could not read or parse ${inputPath}: ${err.message}\n`);
      process.exit(1);
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      process.stderr.write(
        `retry-durable-write: ${inputPath} must contain the JSON object emitted on the ` +
        'HEALTH_STATE_MCP_RETRY_INPUT line, not an array or scalar\n',
      );
      process.exit(1);
    }

    const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(current, input));
    if (result.needsMcpWrite) {
      // No sibling retry-input line here: the caller already holds the input it
      // just passed in, and re-emitting it would invite a reader to think each
      // attempt produces a fresh one.
      emitPendingWrite(result);
      return;
    }
    if (!result.ok) {
      // Unlike validate-findings — where a failed durable write is non-fatal
      // because the payloads still made it out — persisting the durable update
      // is this command's entire job, so its failure has to be visible to a
      // calling shell checking $?.
      process.stderr.write(
        `[${toolName}] retry-durable-write: health-state persistence failed after retries: ${result.error}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`[${toolName}] retry-durable-write: durable health-state update persisted.\n`);
  };
}

module.exports = { makeCmdRetryDurableWrite };
