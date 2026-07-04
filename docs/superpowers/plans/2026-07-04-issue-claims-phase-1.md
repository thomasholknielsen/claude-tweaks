# Issue Claims Phase 1 (Claiming Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give issue-consuming pipelines an atomic, cross-machine claim mechanism (`refs/claims/issue-<n>`) so concurrent agents never double-build the same GitHub issue.

**Architecture:** A pure emit-only Node module (`bin/lib/issues/claims.js`, mirroring `bin/lib/recon/`) builds claim/release payloads and folds claim-comment markers into status; skills execute the `gh` commands. A shared contract (`skills/_shared/issue-claims.md`) defines the protocol; `/flow --from-recon` claims before deriving specs, `/wrap-up` releases on closure, `/tidy` sweeps stale claims.

**Tech Stack:** Node 18+ (CommonJS, `'use strict'`), `node --test` + `node:assert`, GitHub CLI (`gh api`), markdown skill files.

**Spec:** `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md` (Phase 1 sections).

## Global Constraints

- `bin/lib/` modules never call the network — they build payloads and parse results; skills run `gh`. (Recon precedent, spec "Architecture".)
- Time-dependent functions take `now` (epoch ms) as a parameter — no `Date.now()` inside module logic. `Date.now()` is fine in skill-side `node -e` snippets.
- No emojis in skill files; use `**(Recommended)**` bold text.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes).
- Default TTL: 72 hours. Staleness rule: stale iff `now >= claimedAt + ttlHours`. Unreadable `claimedAt` → never stale (fail-closed: don't break a claim you can't read).
- The ref is authoritative; the comment is the human-facing mirror. Comment failure after ref success = claim stands (retry once, warn, proceed).
- Failure posture: fail-closed on claiming (ambiguity → don't work the issue), never block the session (a `gh` outage during release just logs; TTL is the backstop).
- `gh api` paths use the literal `{owner}/{repo}` placeholders — gh fills them from the current repo.
- Run `npm test` from the repo root; it must pass at every commit.
- Version bump for this phase: `.claude-plugin/plugin.json` `5.2.0` → `5.3.0` (Task 7 only).

---

### Task 1: Claims module — payload builders + marker parsing

**Files:**
- Create: `bin/lib/issues/claims.js`
- Create: `bin/lib/issues/tests/claims.test.js`
- Modify: `package.json` (test script glob)

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces (later tasks and skills rely on these exact names):
  - `claimRef(issueNumber) → 'refs/claims/issue-<n>'`
  - `claimPayload({issueNumber, sha, runId, sessionId, ttlHours?, host?, owner?, repo?, now}) → {ref, refArgs, commentBody}`
  - `releasePayload({issueNumber, runId, reason, owner?, repo?, now}) → {ref, refDeleteArgs, commentBody}`
  - `parseClaimMarker(body) → {kind: 'claim'|'release', ...fields} | null` — never throws
  - `DEFAULT_TTL_HOURS = 72`

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/claims.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TTL_HOURS,
  claimRef,
  claimPayload,
  releasePayload,
  parseClaimMarker,
} = require('../claims');

const T0 = 1720000000000; // fixed epoch ms for deterministic tests

test('claimRef formats the claims-namespace ref', () => {
  assert.strictEqual(claimRef(123), 'refs/claims/issue-123');
});

test('claimPayload builds gh api args for atomic ref creation', () => {
  const p = claimPayload({ issueNumber: 123, sha: 'abc123', runId: 'run-1', sessionId: 'sess-1', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.deepStrictEqual(p.refArgs, [
    'repos/{owner}/{repo}/git/refs',
    '-f', 'ref=refs/claims/issue-123',
    '-f', 'sha=abc123',
  ]);
});

test('claim marker round-trips through parseClaimMarker', () => {
  const p = claimPayload({ issueNumber: 7, sha: 'abc', runId: 'run-1', sessionId: 'sess-1', host: 'mac-1', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'claim');
  assert.strictEqual(m.runId, 'run-1');
  assert.strictEqual(m.sessionId, 'sess-1');
  assert.strictEqual(m.host, 'mac-1');
  assert.strictEqual(m.ttlHours, DEFAULT_TTL_HOURS);
  assert.strictEqual(m.claimedAt, new Date(T0).toISOString());
});

test('claimPayload commentBody has a human-readable line after the marker', () => {
  const p = claimPayload({ issueNumber: 7, sha: 'abc', runId: 'run-1', sessionId: 's', now: T0 });
  const lines = p.commentBody.split('\n');
  assert.ok(lines[0].startsWith('<!-- agent-claim:'));
  assert.ok(lines[1].includes('run-1'));
  assert.ok(lines[1].includes('72h'));
});

test('releasePayload builds DELETE args and a release marker', () => {
  const p = releasePayload({ issueNumber: 123, runId: 'run-1', reason: 'merged: spec 12', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.deepStrictEqual(p.refDeleteArgs, [
    '-X', 'DELETE',
    'repos/{owner}/{repo}/git/refs/claims/issue-123',
  ]);
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'release');
  assert.strictEqual(m.reason, 'merged: spec 12');
  assert.strictEqual(m.releasedAt, new Date(T0).toISOString());
});

test('parseClaimMarker never throws and returns null on garbage', () => {
  const garbage = [
    null,
    undefined,
    42,
    {},
    [],
    '',
    'no marker here',
    '<!-- agent-claim: not-json -->',
    '<!-- agent-claim: [1,2] -->',
    '<!-- agent-claim: "just a string" -->',
    '<!-- agent-claim-release: {broken -->',
    '<!-- some-other-marker: {"a":1} -->',
  ];
  for (const g of garbage) {
    assert.strictEqual(parseClaimMarker(g), null, `expected null for ${String(g).slice(0, 40)}`);
  }
});

test('parseClaimMarker distinguishes claim from release markers', () => {
  const claim = parseClaimMarker('<!-- agent-claim: {"runId":"r1","claimedAt":"2026-07-04T00:00:00.000Z"} -->');
  assert.strictEqual(claim.kind, 'claim');
  const release = parseClaimMarker('<!-- agent-claim-release: {"runId":"r1","reason":"done"} -->');
  assert.strictEqual(release.kind, 'release');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/claims.test.js`
Expected: FAIL with `Cannot find module '../claims'`.

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/claims.js`:

```js
// bin/lib/issues/claims.js
// Pure: build claim/release payloads for refs/claims/* and fold claim-comment
// markers into claim status. The SKILL.md runs gh and passes results back —
// no network here. Time-dependent functions take `now` (epoch ms).
// Contract: skills/_shared/issue-claims.md.
'use strict';

const DEFAULT_TTL_HOURS = 72;
const RELEASE_RE = /<!--\s*agent-claim-release:\s*(\{[\s\S]*?\})\s*-->/;
const CLAIM_RE = /<!--\s*agent-claim:\s*(\{[\s\S]*?\})\s*-->/;

function claimRef(issueNumber) {
  return `refs/claims/issue-${issueNumber}`;
}

// opts: { issueNumber, sha, runId, sessionId, ttlHours?, host?, owner?, repo?, now }
// owner/repo default to gh's {owner}/{repo} placeholders (auto-filled from the current repo).
// Returns { ref, refArgs, commentBody }. refArgs feed `gh api` (201 = claimed, 422 = contested).
function claimPayload({ issueNumber, sha, runId, sessionId, ttlHours = DEFAULT_TTL_HOURS, host = '', owner = '{owner}', repo = '{repo}', now }) {
  const claimedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, sessionId, claimedAt, ttlHours, host };
  return {
    ref,
    refArgs: [`repos/${owner}/${repo}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${sha}`],
    commentBody: `<!-- agent-claim: ${JSON.stringify(marker)} -->\nClaimed by claude-tweaks run ${runId} at ${claimedAt} (TTL ${ttlHours}h).`,
  };
}

// opts: { issueNumber, runId, reason, owner?, repo?, now }
// Returns { ref, refDeleteArgs, commentBody }. DELETE path is /git/refs/claims/issue-<n>
// (the API drops the leading "refs/" segment in the delete path).
function releasePayload({ issueNumber, runId, reason, owner = '{owner}', repo = '{repo}', now }) {
  const releasedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, reason, releasedAt };
  return {
    ref,
    refDeleteArgs: ['-X', 'DELETE', `repos/${owner}/${repo}/git/${ref}`],
    commentBody: `<!-- agent-claim-release: ${JSON.stringify(marker)} -->\nReleased by run ${runId}: ${reason}.`,
  };
}

// Never throws. Returns { kind: 'claim'|'release', ...markerFields } or null.
// Release is checked first; the claim regex cannot match a release marker
// ("agent-claim-release:" has "-" after "agent-claim", not ":").
function parseClaimMarker(body) {
  if (typeof body !== 'string') return null;
  for (const [kind, re] of [['release', RELEASE_RE], ['claim', CLAIM_RE]]) {
    const m = re.exec(body);
    if (!m) continue;
    try {
      const fields = JSON.parse(m[1]);
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return null;
      return { kind, ...fields };
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { DEFAULT_TTL_HOURS, claimRef, claimPayload, releasePayload, parseClaimMarker };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/claims.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the new test directory to the npm test glob**

In `package.json`, change:

```json
"test": "node --test tests/ bin/lib/recon/tests/*.test.js"
```

to:

```json
"test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js"
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all existing tests plus the 8 new ones.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/issues/claims.js bin/lib/issues/tests/claims.test.js package.json
git commit -m "Add issue-claims payload builders — refs/claims atomic lock + comment markers"
```

---

### Task 2: Claims module — status folding + staleness

**Files:**
- Modify: `bin/lib/issues/claims.js`
- Modify: `bin/lib/issues/tests/claims.test.js`

**Interfaces:**
- Consumes: `claimPayload`, `releasePayload`, `parseClaimMarker`, `DEFAULT_TTL_HOURS` from Task 1.
- Produces (skills call these via `node -e`):
  - `isStale(claim, now) → boolean` — stale iff `now >= Date.parse(claim.claimedAt) + ttlHours*3600000`; unparseable `claimedAt` → `false`; missing/non-numeric `ttlHours` → 72.
  - `claimStatus(comments, now) → {claimed: boolean, claim: object|null, stale: boolean}` — `comments` is an array of body strings OR `{body}` objects (raw `gh api .../comments` output works directly), in chronological order.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/claims.test.js`:

```js
const { isStale, claimStatus } = require('../claims');

const H = 3600 * 1000;

function claimBodyAt(now, { runId = 'run-1', ttlHours } = {}) {
  return claimPayload({ issueNumber: 1, sha: 'x', runId, sessionId: 's', ttlHours, now }).commentBody;
}

test('claimStatus: no comments → unclaimed', () => {
  assert.deepStrictEqual(claimStatus([], T0), { claimed: false, claim: null, stale: false });
  assert.deepStrictEqual(claimStatus(undefined, T0), { claimed: false, claim: null, stale: false });
});

test('claimStatus: live claim → claimed, not stale', () => {
  const s = claimStatus([claimBodyAt(T0)], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.stale, false);
  assert.strictEqual(s.claim.runId, 'run-1');
});

test('claimStatus: claim then release → unclaimed', () => {
  const release = releasePayload({ issueNumber: 1, runId: 'run-1', reason: 'merged', now: T0 + 2 * H }).commentBody;
  const s = claimStatus([claimBodyAt(T0), release], T0 + 3 * H);
  assert.strictEqual(s.claimed, false);
});

test('claimStatus: claim, release, re-claim → claimed by the second run', () => {
  const release = releasePayload({ issueNumber: 1, runId: 'run-1', reason: 'abandoned', now: T0 + 1 * H }).commentBody;
  const s = claimStatus([claimBodyAt(T0), release, claimBodyAt(T0 + 2 * H, { runId: 'run-2' })], T0 + 3 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.claim.runId, 'run-2');
});

test('claimStatus ignores non-marker comments', () => {
  const s = claimStatus(['just a human comment', claimBodyAt(T0), 'another comment'], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
});

test('claimStatus accepts gh api comment objects ({body}) directly', () => {
  const s = claimStatus([{ body: claimBodyAt(T0) }, { body: 'noise' }], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.claim.runId, 'run-1');
});

test('staleness boundary: just under TTL not stale, at TTL stale, past TTL stale', () => {
  const claim = parseClaimMarker(claimBodyAt(T0));
  assert.strictEqual(isStale(claim, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 72 * H), true);
  assert.strictEqual(isStale(claim, T0 + 100 * H), true);
});

test('custom ttlHours is honored', () => {
  const claim = parseClaimMarker(claimBodyAt(T0, { ttlHours: 1 }));
  assert.strictEqual(isStale(claim, T0 + 1 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 1 * H), true);
});

test('unparseable claimedAt → claimed but never stale (fail-closed)', () => {
  const body = '<!-- agent-claim: {"runId":"r1","claimedAt":"garbage","ttlHours":1} -->';
  const s = claimStatus([body], T0 + 1000 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.stale, false);
});

test('missing ttlHours defaults to 72', () => {
  const claim = { runId: 'r1', claimedAt: new Date(T0).toISOString() };
  assert.strictEqual(isStale(claim, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 72 * H), true);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test bin/lib/issues/tests/claims.test.js`
Expected: FAIL — `isStale is not a function` (Task 1 tests still pass).

- [ ] **Step 3: Implement `isStale` and `claimStatus`**

Add to `bin/lib/issues/claims.js` (before `module.exports`), and extend the export:

```js
// claim: a parsed claim marker. now: epoch ms.
// Stale iff now >= claimedAt + ttlHours. Unparseable claimedAt → never stale
// (fail-closed: a claim you cannot read is not yours to break; /tidy surfaces it).
function isStale(claim, now) {
  const t = Date.parse(claim && claim.claimedAt);
  if (Number.isNaN(t)) return false;
  const ttl = typeof claim.ttlHours === 'number' ? claim.ttlHours : DEFAULT_TTL_HOURS;
  return now >= t + ttl * 3600 * 1000;
}

// comments: array of body strings or {body} objects, chronological (gh api order).
// Folds markers in order: a claim activates, a release clears. `claimed` is true
// even when stale — staleness signals breakability, not absence.
function claimStatus(comments, now) {
  let active = null;
  for (const item of comments || []) {
    const body = typeof item === 'string' ? item : item && item.body;
    const marker = parseClaimMarker(body);
    if (!marker) continue;
    if (marker.kind === 'claim') active = marker;
    else active = null;
  }
  if (!active) return { claimed: false, claim: null, stale: false };
  return { claimed: true, claim: active, stale: isStale(active, now) };
}

module.exports = { DEFAULT_TTL_HOURS, claimRef, claimPayload, releasePayload, parseClaimMarker, isStale, claimStatus };
```

(Remove the previous `module.exports` line from Task 1.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (Task 1's 7 tests + 10 new tests, plus all pre-existing suites).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/claims.js bin/lib/issues/tests/claims.test.js
git commit -m "Add claim status folding + TTL staleness — fail-closed on unreadable claims"
```

---

### Task 3: Shared contract — `skills/_shared/issue-claims.md`

**Files:**
- Create: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: module function names/shapes from Tasks 1–2 (referenced in snippets).
- Produces: the contract document Tasks 4–6 reference by path. Section names later tasks cite: "The lock", "The mirror", "TTL and staleness", "Release triggers", "Failure posture", "Consumers".

- [ ] **Step 1: Write the contract document**

Create `skills/_shared/issue-claims.md` with exactly this content:

````markdown
# Issue Claims — Cross-Agent Coordination Contract

Prevents concurrent agents — a scheduled cloud routine, a second machine, another
collaborator's agent — from double-building the same GitHub issue. One arbiter (the GitHub
API) covers all topologies: ref creation is an atomic test-and-set.

Helper module: `bin/lib/issues/claims.js` (emit-only, no network — skills run `gh`).
Consumers reference this file; do not restate the protocol inline.

## The lock

`refs/claims/issue-<number>` — a ref in a dedicated namespace (never `refs/heads/`, so
claims are issue-granular regardless of how work batches into branches, and never clutter
the branch list).

```bash
# Resolve a sha once per run (any valid remote sha works; ref existence is the lock):
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)

# Claim (201 = claimed, HTTP 422 = already claimed by someone):
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${N}" -f "sha=${SHA}"

# Release:
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${N}"

# List all claims:
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
```

## The mirror

The ref is authoritative but invisible in the GitHub UI, so every claim/release also posts
an issue comment with a machine-readable marker plus one human-readable line. Generate
bodies with the module — never hand-write markers:

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$N" "$SHA" "$RUN_ID" > "$TMP/claim-$N.md"
gh issue comment "$N" --body-file "$TMP/claim-$N.md"
```

Marker shapes (emitted by `claimPayload` / `releasePayload`):

```
<!-- agent-claim: {"runId":"...","sessionId":"...","claimedAt":"<ISO>","ttlHours":72,"host":"..."} -->
<!-- agent-claim-release: {"runId":"...","reason":"...","releasedAt":"<ISO>"} -->
```

Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`, or the
routine's run id when headless); `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity
`record-worktree` stamps. If the comment post fails after the ref succeeds, the claim stands:
retry once, warn, proceed.

## Reading claim state

Fetch comments and fold them through `claimStatus` (accepts raw `gh` comment objects):

```bash
gh api "repos/{owner}/{repo}/issues/${N}/comments?per_page=100" > "$TMP/comments-$N.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" "$TMP/comments-$N.json"
```

Output: `{claimed, claim, stale}`. `claimed: true` with `stale: true` means the claim is
breakable, not absent.

## TTL and staleness

Default TTL 72h from `claimedAt`; stale iff `now >= claimedAt + ttlHours`. No heartbeat in
v1 (runs last hours, not days; a renewal comment is a reserved future extension).

**Breaking a stale claim:** delete the ref, recreate it (atomicity applies again — of two
racing breakers, exactly one gets 201), post a new claim comment noting the takeover and the
prior run id. **A claim whose comment is unreadable or missing is never stale** — treat as
live, skip the issue, and let `/tidy`'s sweep surface it for human judgment.

## Release triggers

| Trigger | Owner | Reason string |
|---|---|---|
| Spec merged / PR opened / discarded | `/wrap-up` cleanup item 8 | `merged: spec {N}` / `pr-opened: spec {N}` / `abandoned: spec {N}` |
| User declines the brief at the Review Console | `/flow` | `declined at review console` |
| Pipeline stops at a gate, user chooses not to resume | `/flow` failure card (offered, not automatic) | `failed: {gate}` |
| Stale or orphaned claim in hygiene pass | `/tidy` Step 4.7 (after batch approval) | `swept: stale claim` / `swept: issue closed` |
| Interrupted session | nobody — TTL ages it out; `/tidy` sweeps it | — |

Every claim, skip, break, and release is logged to the run's `decisions.md` per
`_shared/auto-decision-log.md` (status `AUTO`, reversible: release deletes the ref).

## Failure posture

Fail-closed on claiming; never block the session.

| Failure | Behavior |
|---|---|
| `gh` missing/unauthenticated | Consumer's existing hard gate (auto never silences a missing dependency) |
| Claim ref 422, live claim | Skip the issue, log `AUTO`, continue |
| Claim ref 422, stale claim | Break: delete ref → recreate → takeover comment |
| Claim ref 422, unreadable claim | Treat as live: skip, log; `/tidy` surfaces it |
| Comment fails after ref succeeds | Ref is the lock — retry once, warn, proceed |
| Release fails | Log; TTL is the backstop |
| Ref listing fails in `/tidy` | Skip the sweep step, note it in the report |
| Any other `gh` failure during claim | Drop that issue, log, continue — partial batch over hung batch |

## Consumers

| Skill | Role |
|---|---|
| `/claude-tweaks:flow` (`from-recon.md` Step 2.5) | Claims each pulled issue before spec derivation; releases on console decline; failure cards offer release |
| `/claude-tweaks:wrap-up` (`cleanup-procedures.md` item 8 / Section E) | Releases claims with the branch outcome as reason |
| `/claude-tweaks:tidy` (`scan-procedures.md` Step 4.7) | Sweeps stale/orphaned claims; releases only after batch approval |

**Non-consumers (deliberate):** `/recon` files issues but never works them — a concurrent-
filing race costs at worst one duplicate issue, caught by dedup next run. Interactive
single-spec `/build` does not claim — the user is present and collision is visible.
````

- [ ] **Step 2: Verify formatting and references**

Run: `grep -c "refs/claims" skills/_shared/issue-claims.md`
Expected: ≥ 4.
Run: `npm test`
Expected: PASS (no code touched; confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "Add issue-claims shared contract — atomic ref lock, comment mirror, TTL, failure posture"
```

---

### Task 4: `/flow` integration — claim before deriving, release on decline, failure-card offer

**Files:**
- Modify: `skills/flow/from-recon.md`
- Modify: `skills/flow/failure-cards.md`

**Interfaces:**
- Consumes: `_shared/issue-claims.md` (Task 3), `claimPayload`/`claimStatus` snippets (Tasks 1–2).
- Produces: from-recon Step 2.5 that Task 7's CLAUDE.md row describes; claims-held console behavior Task 5's defer note relies on.

- [ ] **Step 1: Insert Step 2.5 into `skills/flow/from-recon.md`**

After the Step 2 block (ends with "`## Current State`, `## Deliverables`, `## Acceptance Criteria`.") and before "3. **Derive specs via `/specify`.**", insert:

````markdown
2.5. **Claim each issue (per `_shared/issue-claims.md`).** Before any `/specify` invocation,
   claim every brief's issue so concurrent consumers (a scheduled routine, a second machine,
   another collaborator's agent) never double-build. Resolve the sha once per run:

   ```bash
   DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
   SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
   ```

   For each brief, attempt the atomic ref creation:

   ```bash
   gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${N}" -f "sha=${SHA}"
   ```

   - **201 (claimed):** post the claim comment (generate the body with `claimPayload` — see
     "The mirror" in `_shared/issue-claims.md`), keep the brief, and log:
     `AUTO — claimed issue #{N} (refs/claims/issue-{N}) — reversible (release deletes the ref)`.
     If the comment post fails twice, proceed anyway (the ref is the lock) and log a warning.
   - **422 (contested):** fetch the issue's comments and fold through `claimStatus` (see
     "Reading claim state"). Live claim → drop the brief; log
     `AUTO — skipped issue #{N} — claimed by run {claim.runId}, stale after {claimedAt}+{ttlHours}h`.
     Stale claim → break it (delete ref, recreate — exactly one of two racing breakers gets
     201 — then post a takeover claim comment naming the prior run id) and keep the brief.
     Unreadable claim (no marker found) → treat as live: drop the brief, log; `/tidy` Step 4.7
     surfaces it.
   - **Any other failure:** drop the brief, log, continue — partial batch over hung batch.

   If every brief is dropped, stop and report: "All pulled recon issues are claimed by other
   runs — nothing to build. Stale claims are recoverable via /claude-tweaks:tidy (Step 4.7)."
````

- [ ] **Step 2: Add the claims-held note to Step 5 (Review Console)**

In the same file, after the Step 5 paragraph ending "(closing a GitHub issue is a non-reversible network write; see `_shared/auto-mode-contract.md`, 'Never-reversible')." append a new paragraph inside Step 5:

````markdown
   The console also lists the claims this run holds (`refs/claims/issue-{N}` per brief).
   Completed specs release via `/wrap-up` cleanup item 8. For briefs the user **declines** at
   the console, release immediately (reason `declined at review console`): delete the ref and
   post the release comment generated by `releasePayload` — see "Release triggers" in
   `_shared/issue-claims.md`.
````

- [ ] **Step 3: Add the anti-pattern row**

In `skills/flow/from-recon.md`'s Anti-Patterns table, add this row after the "Filing or closing `recon` issues from inside `/flow`" row:

```markdown
| Deriving specs from pulled issues without claiming them (skipping Step 2.5) | Concurrent consumers — a scheduled routine, a second machine — pull the same open issues and double-build them. The claim ref (`_shared/issue-claims.md`) is the only arbiter. |
```

- [ ] **Step 4: Add the claim-release offer to `skills/flow/failure-cards.md`**

After the intro table (ends with the "Generic gate failure" / "Polish broke verification" template-picker table) and before the `## Generic gate failure` heading, insert:

````markdown
**Claims held by `--from-recon` runs:** when the stopped run holds issue claims
(`refs/claims/issue-{N}`, per `_shared/issue-claims.md`), the card must OFFER release —
never auto-release. Resuming is the recommended next action, and a resumed run needs its
claims intact; an unreleased claim ages out via TTL anyway. Add this option to the card's
Next Actions when claims are held:

```markdown
{N+1}. Release held claims if you will not resume (reason `failed: {gate}`):
   `gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-{N}"` + release comment
   per `_shared/issue-claims.md` — otherwise they expire after the TTL (72h default).
```
````

- [ ] **Step 5: Verify**

Run: `grep -n "2.5" skills/flow/from-recon.md | head -3`
Expected: the new step present between Steps 2 and 3.
Run: `grep -c "issue-claims" skills/flow/from-recon.md skills/flow/failure-cards.md`
Expected: ≥ 2 in from-recon.md, ≥ 2 in failure-cards.md.

- [ ] **Step 6: Commit**

```bash
git add skills/flow/from-recon.md skills/flow/failure-cards.md
git commit -m "Claim recon issues before spec derivation — flow Step 2.5, console release, failure-card offer"
```

---

### Task 5: `/wrap-up` integration — release on closure

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md`

**Interfaces:**
- Consumes: `releasePayload` snippet shape (Task 1), release-trigger table (Task 3), `recon-issue: <n>` spec frontmatter (written by existing from-recon Step 3).
- Produces: cleanup item 8 + Section E that Task 7's CLAUDE.md row and Task 3's Consumers table describe.

- [ ] **Step 1: Add item 8 to the canonical cleanup list**

In `skills/wrap-up/cleanup-procedures.md`, change "Seven cleanup actions" to "Eight cleanup actions" and add this row after row 7:

```markdown
| 8 | Issue claim release | Section E below — release `refs/claims/issue-{n}` for each spec with `recon-issue:` frontmatter | spec frontmatter has `recon-issue:` | **Yes — defer to parent `/flow` console** (release follows the merge decision; releasing before the consolidated console would let another agent grab the issue while the work sits unmerged) |
```

Also update the line "The detailed procedures for items 3–5 and 7 follow" to "items 3–5, 7, and 8", and append to the deferred-under-MULTISPEC list:

```markdown
- Item 8 (Issue claim release) — parent /flow releases all claims once, after the consolidated console and worktree merge decide each spec's outcome
```

- [ ] **Step 2: Add Section E**

Append to the end of `skills/wrap-up/cleanup-procedures.md`:

````markdown
---

## E. Issue claim release (v5.3.0)

If the spec's frontmatter carries `recon-issue: <n>` (stamped by `/flow --from-recon` spec
derivation), the pipeline holds `refs/claims/issue-<n>` per `_shared/issue-claims.md`.
Release it only after the branch outcome is known (item 5 completes first — the execution
order of the canonical list guarantees this):

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1`, skip this section — the parent
   `/flow` releases all claims once after its consolidated Review Console and merge.
2. Map the outcome from `/superpowers:finishing-a-development-branch` to a release reason:
   merged → `merged: spec {N}`; PR opened → `pr-opened: spec {N}`; discarded →
   `abandoned: spec {N}`.
3. Generate the release comment with `releasePayload`, delete the ref, post the comment:

   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
     console.log(c.releasePayload({issueNumber:Number(process.argv[1]),runId:process.argv[2],
     reason:process.argv[3],now:Date.now()}).commentBody)" "$N" "$RUN_ID" "$REASON" \
     > "${RUN_DIR}/release-${N}.md"
   gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${N}"
   gh issue comment "$N" --body-file "${RUN_DIR}/release-${N}.md"
   ```

4. A 404/422 from the ref delete means the claim was already released or swept — log it and
   still post the release comment (the comment trail should record the outcome). Any other
   failure: retry once, then log and continue — TTL is the backstop, never block wrap-up.
5. Log each release to `decisions.md` (status `AUTO`, reason string as detail).

If no spec has `recon-issue:` frontmatter, skip silently.
````

- [ ] **Step 3: Verify**

Run: `grep -n "Eight cleanup" skills/wrap-up/cleanup-procedures.md && grep -c "issue-claims\|recon-issue" skills/wrap-up/cleanup-procedures.md`
Expected: heading updated; count ≥ 3.

- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md
git commit -m "Release issue claims at wrap-up — cleanup item 8 with outcome-mapped reasons"
```

---

### Task 6: `/tidy` integration — stale-claim sweep

**Files:**
- Modify: `skills/tidy/scan-procedures.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: `claimStatus` snippet (Task 2), staleness/orphan rules (Task 3).
- Produces: Step 4.7 + `[claim]` collection prefix that the Step 6 batch table renders.

- [ ] **Step 1: Add Step 4.7 to `skills/tidy/scan-procedures.md`**

Insert after the "## Step 4.6: Audit Doc Registry" section and before "## Step 5: Spec Sizing Review":

````markdown
## Step 4.7: Audit Issue Claims

Skip silently when `gh` is unavailable or the repo has no GitHub remote. See
`_shared/issue-claims.md` for the protocol.

List claim refs; for each, fetch the issue's state and comments, and fold through
`claimStatus`:

```bash
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
# for each refs/claims/issue-<n>:
gh issue view <n> --json state -q .state
gh api "repos/{owner}/{repo}/issues/<n>/comments?per_page=100" > /tmp/tidy-claims-<n>.json
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" /tmp/tidy-claims-<n>.json
```

| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Claim stale (`stale: true`) | Release (crashed or abandoned run) |
| Ref exists, no readable claim marker, issue open | Manual review (never break a claim you cannot read) |
| Claim live, issue open | Keep |

Releasing = delete the ref + post the release comment generated by `releasePayload`
(reason `swept: stale claim` or `swept: issue closed`). Releases execute only after Step 6
batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] refs/claims/issue-{n} — {status} — {recommendation}`
````

- [ ] **Step 2: Route the `[claim]` prefix**

In the "Collection routing" table at the bottom of `scan-procedures.md`, add `[claim]` to the Actions-table row so it reads:

```markdown
| `[inbox]`, `[deferred]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]` | Actions table | Each row gets a pre-filled recommendation. |
```

- [ ] **Step 3: Update `skills/tidy/SKILL.md` step ranges and dispatch table**

Run `grep -n "4\.6" skills/tidy/SKILL.md` and update every range mention:

- Heading `## Steps 1-4.6: Scan Everything` → `## Steps 1-4.7: Scan Everything`
- `Steps 1-4.6 silently collect all findings` → `Steps 1-4.7 silently collect all findings`
- Parallel-execution blockquote: `Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, and 4.6 as parallel Task agents` → `Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, and 4.7 as parallel Task agents`, and extend its source list `(INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry)` → `(INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims)`
- Model-tier blockquote source list: append `issue-claim refs + comments` to the parenthetical list of scanned sources
- Dispatch table: add row `| 4.7 | gh api git/matching-refs/claims/ + issue comments | [claim] |` after the 4.6 row
- `5.5 (sequential, after Steps 2-4.6)` → `5.5 (sequential, after Steps 2-4.7)`
- Relationship-table row for `_shared/subagent-output-contract.md`: `Steps 1-4.6 dispatch` → `Steps 1-4.7 dispatch`

After editing, run `grep -n "1-4\.6\|2-4\.6" skills/tidy/SKILL.md` — Expected: no matches.

- [ ] **Step 4: Verify**

Run: `grep -c "4\.7" skills/tidy/SKILL.md skills/tidy/scan-procedures.md`
Expected: ≥ 3 in SKILL.md, ≥ 1 in scan-procedures.md.

- [ ] **Step 5: Commit**

```bash
git add skills/tidy/scan-procedures.md skills/tidy/SKILL.md
git commit -m "Add stale issue-claim sweep to tidy — Step 4.7 with orphan/stale/unreadable triage"
```

---

### Task 7: Docs ripple + version bump

**Files:**
- Modify: `CLAUDE.md`
- Modify: `skills/flow/SKILL.md`, `skills/tidy/SKILL.md`, `skills/wrap-up/SKILL.md`, `skills/recon/SKILL.md` (relationship tables)
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: everything landed in Tasks 1–6.
- Produces: nothing downstream — this closes the phase.

- [ ] **Step 1: Update CLAUDE.md**

Four edits:

1. Structure block, `bin/lib/` line: `Shared Node helpers (color, deps, coordination)` → `Shared Node helpers (color, deps, coordination, issue claims)`.
2. Structure block, `skills/_shared/*.md` line: append `, issue-claims contract (refs/claims/* atomic lock)` inside the parenthetical list of shared content.
3. Skills-with-sub-files table: in the `flow` row's Purpose cell, extend the `--from-recon` clause with `(Step 2.5 claims each issue per _shared/issue-claims.md before spec derivation)`; in the `tidy` row, extend the steps list with `issue claims (Step 4.7)`; in the `wrap-up` row's cleanup-procedures clause, append `, issue-claim release (item 8)`.
4. Commands section: `npm test  # Runs node --test over tests/ AND bin/lib/recon/tests/` → append `AND bin/lib/issues/tests/`.

- [ ] **Step 2: Add relationship rows (bidirectional per CLAUDE.md cross-reference rule)**

Add one row to each skill's Relationship table (create the row if no `_shared` rows exist; the table format is `| Skill | Relationship |`):

`skills/flow/SKILL.md`:
```markdown
| `_shared/issue-claims.md` | `--from-recon` Step 2.5 claims each pulled issue (`refs/claims/issue-{N}`) before spec derivation; the console releases declined briefs; failure cards offer release on abandon. |
```

`skills/tidy/SKILL.md`:
```markdown
| `_shared/issue-claims.md` | Step 4.7 sweeps `refs/claims/*` for stale and orphaned claims per this contract — release only after batch approval, never autonomous. |
```

`skills/wrap-up/SKILL.md`:
```markdown
| `_shared/issue-claims.md` | Cleanup item 8 (Section E of `cleanup-procedures.md`) releases claims for specs with `recon-issue:` frontmatter, with the branch outcome as the release reason. |
```

`skills/recon/SKILL.md` — extend the existing `/claude-tweaks:flow` row's text with this final sentence:
```
Batch consumers claim each issue per `_shared/issue-claims.md` before deriving specs, so concurrent runs never double-build.
```

- [ ] **Step 3: Update README.md**

Run `grep -n "from-recon" README.md`. In the section describing `/flow --from-recon` (or the recon section if that's where issue consumption is described), append:

```markdown
Pulled issues are claimed via atomic `refs/claims/issue-{N}` ref creation before any spec is derived, so concurrent consumers — a scheduled routine, a second machine, a collaborator's agent — never double-build. Stale claims (crashed runs) are swept by `/tidy`.
```

If README.md has no `from-recon` mention, add the sentence to its recon feature description instead.

- [ ] **Step 4: Bump the version**

In `.claude-plugin/plugin.json`: `"version": "5.2.0"` → `"version": "5.3.0"`.

- [ ] **Step 5: Full verification**

Run: `npm test`
Expected: PASS.
Run: `grep -rn "issue-claims" CLAUDE.md README.md skills/flow/SKILL.md skills/tidy/SKILL.md skills/wrap-up/SKILL.md skills/recon/SKILL.md | wc -l`
Expected: ≥ 6 (every doc references the contract).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md .claude-plugin/plugin.json skills/flow/SKILL.md skills/tidy/SKILL.md skills/wrap-up/SKILL.md skills/recon/SKILL.md
git commit -m "Document issue-claims contract across consumers — bump to 5.3.0"
```

---

## Post-plan notes

- **Marketplace release** (separate repo, `thomasholknielsen/claude-tweaks-marketplace`): mirror `5.3.0` in `plugins[].version` after this lands on `main` — user-driven, not part of this plan.
- **Phase 2 (close the loop)** rewrites from-recon's "Auto-closing the issue" anti-pattern row for close-via-merge — deliberately NOT touched in this phase.
