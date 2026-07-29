'use strict';

// The stderr signal every health CLI emits when durable-state.js's writeState
// could not persist the health-state branch itself (no `gh` on PATH), so the
// calling skill has to finish the write through GitHub MCP tools on its own
// turn. Contract: skills/_shared/health-state.md's "MCP write path" section.
//
// stderr, never stdout: every command that can emit this ALSO writes its own
// normal output (validate-findings' payloads array, retry-queue update's
// escalated array) to stdout unconditionally, and the calling skills redirect
// that stdout into a file they later parse as JSON. A second JSON document on
// the same stream corrupts that file outright — which is exactly what the
// original stdout-based signal did.
//
// One module rather than a copy per CLI so the prefix, the payload shape, and
// the choice of stream can never drift between the five call sites (four
// *-health.js validate-findings commands plus retry-cli.js's update) and the
// procedure text in _shared/health-state.md that greps for them.

const PENDING_WRITE_PREFIX = 'HEALTH_STATE_MCP_PENDING_WRITE';
const RETRY_INPUT_PREFIX = 'HEALTH_STATE_MCP_RETRY_INPUT';

// result: writeState's `{ needsMcpWrite: true, branch, files }` return value.
// `write` is injectable for tests; the default is resolved per call (not once
// at module load) so a test that swaps process.stderr.write still sees it.
function emitPendingWrite(result, write = (s) => process.stderr.write(s)) {
  write(`${PENDING_WRITE_PREFIX}: ${JSON.stringify({ branch: result.branch, files: result.files })}\n`);
}

// input: the already-computed mutator input of the command that hit a pending
// write (validate-findings only). Lets the calling skill retry the durable
// write alone — via the `retry-durable-write` subcommand — instead of
// re-invoking validate-findings, which would silently re-run finding discovery
// against an already-staged cache and emit an empty payloads array.
function emitRetryInput(input, write = (s) => process.stderr.write(s)) {
  write(`${RETRY_INPUT_PREFIX}: ${JSON.stringify(input)}\n`);
}

module.exports = { PENDING_WRITE_PREFIX, RETRY_INPUT_PREFIX, emitPendingWrite, emitRetryInput };
