# repair-claim.js CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `plugin/bin/repair-claim.js` CLI (plus `plugin/bin/lib/repair-claim/repair.js` module) that mechanizes `_shared/issue-claims.md`'s "Repairing an unreadable claim blob" manual procedure.

**Architecture:** Mirror `release-claim.js`'s two-layer structure exactly: a thin argv-parsing CLI over a single-responsibility module, both on the injectable `run(argv, deps)` / `runner(args)` seam. The module reuses `bin/lib/release-claim/release.js`'s exported `readClaimBlob` and `writeTombstone` (the content-agnostic conditional-PUT wrapper) and `bin/lib/issues/claims.js`'s `classifyClaimBlob`/`releasePayload`/`claimPayload` — no duplicated mechanics. **Build-time decision (record in the PR): standalone CLI, not a mode on `release-claim.js`** — the spec's gotcha 3 warns the two gates are exact inverses (`release-claim.js` exit 5 refuses `'unreadable'`; this CLI *only* proceeds on `'unreadable'`), so keeping them in separate code paths structurally prevents either gate inverting the other.

**Tech Stack:** Node 18+ built-ins only (no runtime npm deps), `node --test` for tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1608/work/1608-spec.md`

## Global Constraints

- No runtime npm dependencies anywhere under `plugin/bin/` (repo-wide constraint, see `bin/lib/policy.js` header convention).
- Follow the CLI wrapper contract (`gh-api-module-pattern` skill): injectable `run(argv, deps)` seam, explicit exit-code vocabulary in the header comment, run-dir anchoring guard via `bin/lib/log-decision/append`'s `resolveTarget`, `module.exports` including `run`, and `if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps)`.
- Exit-code vocabulary (fixed for both tasks): `0` repaired; `3` CAS rejection (sha changed between read and write — re-read and reassess, never retried blind); `4` refused (blob does not classify `'unreadable'` on the fresh read — covers `absent`/`live`/`stale`/`tombstone`); `1` failed (read failure or any other error); `2` malformed invocation or `gh` absent.
- Logging is bookkeeping, never a gate: exit code reflects the repair outcome, never whether `decisions.md` was written (matches `release-claim.js`).
- Comment style: match `release.js`/`release-claim.js` header-comment density and phrasing conventions.

---

### Task 1: `bin/lib/repair-claim/repair.js` module

**Files:**
- Create: `plugin/bin/lib/repair-claim/repair.js`
- Test: `tests/bin-lib/repair-claim/repair.test.js`

**Interfaces:**
- Consumes: `require('../release-claim/release')` → `readClaimBlob({owner, repo, issueNumber, runner, gitRunner})` (returns `{content, sha}` or `{content:null, sha:null, absent:true}`, throws on read failure), `writeTombstone({owner, repo, issueNumber, sha, tombstoneContent, expectedContent, message, runner, gitRunner})` (content-agnostic conditional PUT; throws with `.conflict === true` on a CAS rejection), `errorText(err)`, `defaultRunner`. `require('../issues/claims')` → `classifyClaimBlob(content, now)`, `releasePayload({issueNumber, runId, reason, link, now})` → `{tombstoneContent, commentBody}`, `claimPayload({issueNumber, runId, sessionId, host, now})` → `{fileContent, commentBody}`.
- Produces: `repairClaim({owner, repo, issueNumber, runId, mode, reason, link, sessionId, host, runner, gitRunner, now})` → `{outcome: 'repaired'|'refused'|'cas-rejected'|'failed', state: <classify state or null>, calls: [...], commentPosted: boolean, note: string|null, error: string|null}`. Exported: `{repairClaim, postRepairComment, defaultRunner}` (re-export `defaultRunner` from release.js for CLI wiring symmetry).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/repair-claim/repair.test.js`. Model the fake-runner style on `tests/bin-lib/release-claim/release.test.js` (read it first; reuse its fake `runner`/`gitRunner` idioms rather than inventing new ones). Test cases (use a fake runner that serves canned blob reads — never real `gh`):

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { repairClaim } = require('../../../plugin/bin/lib/repair-claim/repair');

// Helper: a fake gh runner serving a contents-API read of claims/issue-77.json.
// Content b64-encoded like the real API; sha carried alongside.
function fakeReadRunner(content, sha) {
  return (args) => {
    if (args[0] === 'api' && String(args[1]).includes('contents/claims')) {
      return JSON.stringify({ content: Buffer.from(content).toString('base64'), sha });
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
}
```

Required cases (exact behaviors, each its own `test(...)`):
1. **Refusal on every non-`'unreadable'` state, nothing written:** for content variants — valid live claim JSON (`{"runId":"other-run","claimedAt":"<now ISO>","ttlHours":12}`), a tombstone (`{"released":true,"runId":"x"}`), stale claim JSON (`claimedAt` 100h old, `ttlHours: 12`), and an absent blob (runner whose read yields the 404/absent path) — `repairClaim` returns `outcome: 'refused'` with the matching `state` (`'live'`/`'tombstone'`/`'stale'`/`'absent'`), and the fake runner received **no** write (PUT) call.
2. **Repaired, `release` mode:** content `"not json {{{"` (classifies `'unreadable'`), sha `"abc123"`. The write call must carry the captured sha and `releasePayload`-shaped content (assert the written content parses as JSON with `released: true` and the given `runId`/`reason`). `outcome: 'repaired'`, `state: 'unreadable'`.
3. **Repaired, `reclaim` mode:** same unreadable read; written content parses as claim JSON carrying `runId`, `sessionId`, `claimedAt`, `ttlHours` (i.e. `claimPayload().fileContent` shape, `released` absent). `outcome: 'repaired'`.
4. **CAS rejection:** fake write throws an error with `.conflict = true` (simulate via a `gitRunner`/runner that makes `writeTombstone` reject as a sha mismatch — inject by having the write call throw `Object.assign(new Error('HTTP 409/422 sha mismatch'), {conflict: true})` through a stub write path; if stubbing `writeTombstone` directly is simpler, refactor `repair.js` to accept `deps.writeTombstone` injection). `outcome: 'cas-rejected'`, and **exactly one** write attempt was made (no blind retry).
5. **Read failure:** runner throws a network-ish error on read → `outcome: 'failed'`, `error` non-empty.
6. **Comment is best-effort:** in a repaired run whose comment post throws, `outcome` stays `'repaired'`, `commentPosted: false`, `note` carries the error text.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/repair-claim/repair.test.js`
Expected: FAIL with "Cannot find module" for `repair.js`

- [ ] **Step 3: Implement `plugin/bin/lib/repair-claim/repair.js`**

```js
// bin/lib/repair-claim/repair.js
// The one unreadable-claim repair write path: read the claim blob, confirm it
// classifies 'unreadable' on that same fresh read, conditionally overwrite it
// (sha = the read's blob sha) with releasePayload tombstone content (`release`
// mode) or claimPayload content (`reclaim` mode), and post the mirror comment —
// the mechanics _shared/issue-claims.md's "Repairing an unreadable claim blob"
// steps 1-4 describe, in one call. bin/repair-claim.js is the thin CLI. The
// gate here is the exact INVERSE of release.js's ('unreadable' -> proceed;
// anything else -> refuse) — kept in its own module so neither gate can invert
// the other (spec #1608 gotcha). Reuses release.js's readClaimBlob /
// writeTombstone (content-agnostic conditional PUT) rather than composing its
// own gh calls. Injectable runner(args) per gh-api-module-pattern.
'use strict';

const releaseLib = require('../release-claim/release');
const { classifyClaimBlob, releasePayload, claimPayload } = require('../issues/claims');

// -> { outcome: 'repaired'|'refused'|'cas-rejected'|'failed', state, calls,
//      commentPosted, note?, error? }
// 'refused' carries the classify state that blocked the repair — a live,
// stale, tombstone, or absent blob is never overwritten by this tool.
// 'cas-rejected' means the sha changed between read and write: re-read and
// reassess, never retried blind (the subsection's own instruction).
function repairClaim({
  owner, repo, issueNumber, runId, mode, reason, link, sessionId = '', host = '',
  runner = releaseLib.defaultRunner, gitRunner, now = Date.now(),
  writeTombstone = releaseLib.writeTombstone,
}) {
  const result = { outcome: 'failed', state: null, calls: [], commentPosted: false, note: null, error: null };
  let blob;
  try {
    blob = releaseLib.readClaimBlob({ owner, repo, issueNumber, runner, gitRunner });
  } catch (err) { result.error = releaseLib.errorText(err); return result; }
  result.calls.push('read');
  const classified = classifyClaimBlob(blob.absent ? null : blob.content, now);
  result.state = classified.state;
  if (classified.state !== 'unreadable') { result.outcome = 'refused'; return result; }
  const payload = mode === 'release'
    ? releasePayload({ issueNumber, runId, reason, link: link || undefined, now })
    : claimPayload({ issueNumber, runId, sessionId, host, note: `repair-and-claim: ${reason}`, now });
  const content = mode === 'release' ? payload.tombstoneContent : payload.fileContent;
  try {
    writeTombstone({
      owner, repo, issueNumber, sha: blob.sha, tombstoneContent: content,
      expectedContent: blob.content, message: `Repair unreadable claim on issue #${issueNumber} (${mode})`,
      runner, gitRunner,
    });
    result.calls.push('put');
    result.outcome = 'repaired';
  } catch (err) {
    if (err && err.conflict === true) {
      result.outcome = 'cas-rejected';
      result.error = releaseLib.errorText(err);
    } else {
      result.error = releaseLib.errorText(err);
    }
    return result;
  }
  try {
    postRepairComment({ owner, repo, issueNumber, body: payload.commentBody, runner });
    result.calls.push('comment');
    result.commentPosted = true;
  } catch (err) {
    result.note = releaseLib.errorText(err);
  }
  return result;
}

// Best-effort human-visibility mirror, same posture as release.js's comment.
function postRepairComment({ owner, repo, issueNumber, body, runner = releaseLib.defaultRunner }) {
  return runner(['issue', 'comment', String(issueNumber), '--repo', `${owner}/${repo}`, '--body', body]);
}

module.exports = { repairClaim, postRepairComment, defaultRunner: releaseLib.defaultRunner };
```

Note for the implementer: `readClaimBlob` returns `{content: null, sha: null, absent: true}` for an absent blob — pass `null` to `classifyClaimBlob` in that case (as shown) so it classifies `'absent'`. If the test for CAS rejection can't drive `.conflict` through the real `writeTombstone` with a fake runner, use the `deps`-style `writeTombstone` injection parameter already in the signature above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/repair-claim/repair.test.js`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/repair-claim/repair.js tests/bin-lib/repair-claim/repair.test.js
git commit -m "Add repair-claim module — unreadable-blob conditional overwrite per issue-claims.md (refs #1608)"
```

---

### Task 2: `bin/repair-claim.js` CLI

**Files:**
- Create: `plugin/bin/repair-claim.js`
- Test: `tests/bin-lib/repair-claim/cli.test.js`

**Interfaces:**
- Consumes: Task 1's `repairClaim` (exact signature above); `bin/lib/log-decision/append`'s `{formatEntry, appendEntry, resolveTarget}` (same import + usage shape as `bin/release-claim.js`); `bin/lib/issues/claims-git-cas`'s `defaultRunner` as `gitDefaultRunner`; `bin/lib/repo-resolve`'s `parseRepo`.
- Produces: `module.exports = { run, parseArgs, realDeps }`; invocation `node bin/repair-claim.js <issue> --run <run-dir> --mode <release|reclaim> --reason <reason> [--link <url>] [--repo owner/name] [--section "/<skill>"] [--step <text>] [--help]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/repair-claim/cli.test.js`, modeled on `tests/bin-lib/release-claim/cli.test.js` (read it first and reuse its deps-injection idioms). Required cases:

1. **Malformed invocation → exit 2, nothing run:** missing `<issue>`; non-integer issue; missing `--run`; missing `--reason`; missing `--mode`; `--mode` outside `{release, reclaim}`; unknown flag. Each returns `2` and writes usage to stderr.
2. **`gh` absent → exit 2** with a stderr message pointing at the manual MCP path in `_shared/issue-claims.md` (inject `ghAvailable: () => false`).
3. **Exit map:** stub the repair layer via deps injection (give `realDeps`-shaped test deps whose `repair` field — see Step 3 — returns each outcome) and assert: `repaired` → 0, `cas-rejected` → 3, `refused` → 4, `failed` → 1.
4. **Decision log line:** with a temp run dir anchored under a temp main-root (mirror how `cli.test.js` for release-claim builds `resolveTarget`-compatible fixtures — reuse its tmp-dir setup), a `repaired` outcome appends one `AUTO` line to `<run-dir>/decisions.md` containing `repaired unreadable claim blob on #<issue> (mode release` and the reason; a `refused` outcome logs a line containing `refused` and the state. JSON envelope on stdout carries `{issue, runId, mode, outcome, state, commentPosted, logged}`.
5. **Log failure never changes the exit code:** point `--run` at a nonexistent dir → stderr warning `decisions.md not written`, exit still per outcome.
6. **Wiring test:** `realDeps.gitRunner` is `claims-git-cas`'s `defaultRunner` and `realDeps.repair` is the real `repairClaim` (same rationale as `release-claim.js`'s exported `realDeps` test).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/repair-claim/cli.test.js`
Expected: FAIL with "Cannot find module" for `repair-claim.js`

- [ ] **Step 3: Implement `plugin/bin/repair-claim.js`**

Mirror `bin/release-claim.js`'s structure line-for-line where applicable. Header comment must state the full exit vocabulary verbatim:

```js
#!/usr/bin/env node
// bin/repair-claim.js — repair or force-release an UNREADABLE claims-registry blob.
//   node bin/repair-claim.js <issue> --run <run-dir> --mode <release|reclaim> --reason <reason> \
//     [--link <url>] [--repo owner/name] [--section "/<skill>"] [--step <text>] [--help]
// Mechanizes _shared/issue-claims.md's "Repairing an unreadable claim blob" steps 1-4:
// read the blob and capture its sha (ordinary response metadata, available even when the
// content doesn't parse), confirm the content classifies 'unreadable' on that same fresh
// read, conditionally overwrite with sha set — releasePayload-shaped tombstone (`release`
// mode) or claimPayload-shaped content (`reclaim` mode) — and log the override. The gate
// is the exact inverse of release-claim.js's exit 5: 'unreadable' -> proceed; a live,
// stale, tombstone, or absent blob -> refuse, nothing written (those states belong to
// release-claim.js and the acquire path). Exit 0 repaired; 3 CAS rejection (sha changed
// between read and write — re-read and reassess, never retried blind); 4 refused (blob
// does not classify 'unreadable' on the fresh read); 1 failed — any other error;
// 2 malformed invocation or `gh` absent — the MCP path in _shared/issue-claims.md's
// subsection stays the documented fallback, deliberately not grown into this CLI.
// The overwrite destroys content that may encode a real holder's identity, so the
// override is logged (AUTO line in <run-dir>/decisions.md via resolveTarget — a
// worktree-local shadow is refused, never silently written) and mirrored as an issue
// comment; logging is bookkeeping, never a gate: the exit code always reflects the
// repair outcome, never whether decisions.md was written.
'use strict';
```

Then, following `release-claim.js`'s shape exactly:
- `EXIT = { repaired: 0, 'cas-rejected': 3, refused: 4, failed: 1 }`
- `parseArgs` handling the flags above (`--mode` value validated against `release`/`reclaim` in `run`, not in `parseArgs`).
- `realDeps` = same fields as `release-claim.js`'s plus `repair: repairClaim` (the injection seam case 3 of the tests uses), `sessionId: () => process.env.CLAUDE_CODE_SESSION_ID || ''`, `host: () => require('os').hostname()`.
- `run(argv, deps = realDeps)`: validate; resolve repo via `parseRepo` (same `--repo`/remote fallback); `runId = path.basename(runDir)`; call `deps.repair({owner, repo, issueNumber, runId, mode, reason, link, sessionId: deps.sessionId(), host: deps.host(), runner: deps.runner, gitRunner: deps.gitRunner, now: deps.now()})`.
- `decisionText(issue, r, mode, reason, link)`: `repaired` → `` `repaired unreadable claim blob on #${issue} (mode ${mode}; ${reason})${link ? `; link ${link}` : ''}` ``; `refused` → `` `refused claim repair on #${issue}: blob classifies '${r.state}', not 'unreadable' — nothing written` ``; `cas-rejected` → `` `claim repair on #${issue} rejected by compare-and-swap (sha changed since read) — nothing written; re-read and reassess` ``; `failed` → `` `claim repair of #${issue} FAILED (${reason}): ${r.error}` ``.
- Decision-log block copied from `release-claim.js` (resolveTarget → formatEntry → appendEntry, stderr warnings on not-anchored/missing), with `reversibility` = `'low'` for `repaired` (the original blob content is destroyed; the log line is the only trace) and `'n/a'` otherwise, `step` default `'claim repair'`.
- stdout JSON envelope: `{ issue, runId, mode, reason, link, outcome, state, commentPosted, note, error, logged }`.
- `module.exports = { run, parseArgs, realDeps };` and the `require.main` guard.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/repair-claim/repair.test.js tests/bin-lib/repair-claim/cli.test.js`
Expected: PASS (all cases, both files)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/repair-claim.js tests/bin-lib/repair-claim/cli.test.js
git commit -m "Add repair-claim.js CLI — exit-coded wrapper over the unreadable-blob repair module (refs #1608)"
```

---

### Task 3: Repoint `_shared/issue-claims.md`'s repair subsection at the CLI

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md` (the `### Repairing an unreadable claim blob` subsection, currently starting near line 198)

**Interfaces:**
- Consumes: Task 2's CLI invocation string (exact flags above).
- Produces: doc text only.

- [ ] **Step 1: Make the edit**

Insert, immediately after the subsection's opening paragraph (the one ending "…by overwriting it.") and before the "Repair reuses step 4's re-claim mechanics…" paragraph, a primary-path bullet matching the posture the file's Release bullet takes toward `release-claim.js`:

```markdown
**Primary path — the CLI:** `node "${CLAUDE_PLUGIN_ROOT}/bin/repair-claim.js" <issue> --run <run-dir> --mode <release|reclaim> --reason <reason> [--link <url>] [--repo owner/name]` performs steps 1-4 below in one command — fresh read + sha capture, the confirm-`'unreadable'` gate (a live, stale, tombstone, or absent blob refuses with exit `4`, nothing written), the sha-carrying conditional overwrite (`release` writes `releasePayload`-shaped tombstone content, `reclaim` writes `claimPayload`-shaped content), and the override log (AUTO line in `<run-dir>/decisions.md`, plus the mirror comment). Exit `0` repaired / `3` CAS rejection (sha changed since the read — re-read and reassess, never retry blind) / `4` refused / `1` failed / `2` malformed or `gh` absent. The numbered manual steps below remain the transport-detail fallback for a `gh`-absent (MCP) environment — deliberately not grown into the CLI, matching `release-claim.js`'s own posture.
```

Keep the four numbered manual steps untouched.

- [ ] **Step 2: Verify the file's size and the suite's prose pins**

Run: `wc -c plugin/skills/_shared/issue-claims.md`
Expected: under 40960 bytes (the 40 KB shared-file ceiling). If within ~10% of the ceiling, stop and surface rather than trimming unrelated content.

Run: `node --test tests/issue-claims-contract.test.js` (if this exact file doesn't exist, run `ls tests/ | grep -i claim` and run every matching suite)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/issue-claims.md
git commit -m "Repoint issue-claims.md unreadable-blob repair at repair-claim.js as primary path (refs #1608)"
```

---

## Verification (whole plan)

- `node --test tests/bin-lib/repair-claim/repair.test.js tests/bin-lib/repair-claim/cli.test.js` — new suites pass.
- `npm test` — full suite green (run centrally after the last commit, not per-dispatch).
- Acceptance criteria trace: AC1 → Task 1 cases 2-3; AC2 → Task 1 case 1 + Task 2 exit map; AC3 → Task 1 case 4 + Task 2 exit map (`3`); AC4 → Task 2 cases 4-5; AC5 → full suite.
