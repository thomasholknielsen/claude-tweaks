# Record #723 — claim-targets.js + preflight-records.js CLIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the claim-side CLIs: `bin/claim-targets.js` (group claim, all-or-abort) and `bin/preflight-records.js` (facets/blockedBy/keyFiles/overlapGroups JSON), on a shared claim-blob store also consumed by `bin/lib/reconcile/release-merged.js` — one contents-API implementation, not three — with the skill prose citing one command instead of per-target snippets.

**Architecture:** Follow `.claude/skills/gh-api-module-pattern/SKILL.md` (in-repo — READ IT FIRST in every task): injectable runner/deps, `run(argv, deps)` CLI wrapper, documented exit codes, fake-runner tests. New shared store `bin/lib/issues/claim-store.js` takes a `ghApi`-shaped dep (`(args) => ({stdout, failure})` — the exact shape `release-merged.js`'s own `ghApi` already returns) so `release-merged.js` delegates its claim reads/writes/list with zero behavior change. New module dirs `bin/lib/claim-targets/` and `bin/lib/preflight-records/` (flat sibling dirs per CLAUDE.md's bin/lib convention).

**Tech Stack:** Node 18+ (no deps), `node --test` with fake runners; markdown skill citations.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044553-spec-720-721-722-723-724/spec-723/work/723-spec.md`

## Global Constraints

- `gh` path only — the MCP path stays prose per `_shared/github-write-transport.md`; the skill edits must keep the MCP prose fallback intact (spec Gotcha 1).
- Exit codes distinguish *contested* from *transient* (spec Gotcha 2): `0` = all targets claimed (or `--keep-going` partial success), `2` = malformed invocation / missing dependency, `3` = contested (holder JSON on stdout), `4` = transient `gh` failure. Both 3 and 4 perform the all-or-abort release of targets claimed so far unless `--keep-going`.
- ONE contents-API write path: `claim-store.js` owns the read/PUT/list call shapes; `release-merged.js` delegates to it; the CLI consumes it (spec Gotcha 3). `decideRelease` and all of `release-merged.js`'s decision logic are untouched — only its three I/O helpers delegate.
- `preflight-records.js` branches on `work-links` exactly as `materialize.md` describes: `native` → one batched GraphQL via `buildNativeDependencyQuery`; `body-text` → `parseDependencies` (spec Gotcha 4). Resolve `work-links` via `resolvePolicyKeys` (`bin/lib/policy-schema.js`) through deps, overridable with a `--work-links` flag.
- Existing conformance pins on `skills/flow/claim-targets.md` MUST survive: `__ABSENT__`, `@base64d`, no `base64 -d` (#720's tests); `remove the minted directory immediately`, `PIPELINE_RUN_DIR` was unset on entry` (#721); the three liveness verdict phrases + three `Next:` steps + `No \`AskUserQuestion\`` (#722). Run `node --test tests/flow-claim-preflight.test.js tests/run-dir-timestamp-utc.test.js` after every prose edit.
- npm test discovers `tests/bin-lib/{module}/` automatically — place suites there.
- Work from the run worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-720-721-722-723-724`.
- Commits reference `refs #723` — never closes/fixes.

---

### Task 1: `bin/lib/issues/claim-store.js` + delegate `release-merged.js`'s claim I/O to it

**Files:**
- Create: `bin/lib/issues/claim-store.js`
- Modify: `bin/lib/reconcile/release-merged.js` (replace the bodies of `listClaims`, `readClaim`, `writeTombstone` with delegation; keep their signatures and their `ghApi`)
- Test: `tests/bin-lib/issues/claim-store.test.js` (new)

**Interfaces:**
- Consumes: `CLAIMS_BRANCH` from `bin/lib/issues/claims.js`.
- Produces (exact exports, consumed by Task 2 and by release-merged.js):
  - `listClaimNames(ghApi, repoSlug)` → `{ names: string[], failure: null | 'gh-absent' | 'network-failure' }`
  - `readClaimBlob(ghApi, repoSlug, issueNumber)` → `{ content: string|null, sha: string|null, failure: null|'gh-absent'|'network-failure', absent: boolean }` — a 404 (ghApi failure on the read of a specific blob) is NOT distinguishable from network failure at the ghApi seam, so the read uses `gh api ... 2>&1`-free argv and treats a failed read as `failure` EXCEPT when the caller passes a probe distinguishing 404; to keep the seam honest, `readClaimBlob` takes the raw path: on `failure: 'network-failure'`, it re-probes with `gh api repos/{slug}/contents/claims?ref=... -q '.[].name'` is NOT done here — instead the ghApi dep for this module returns `{stdout, failure, status}` where `status: 404` is set by the default runner when gh exits with a 404 message (`gh: Not Found (HTTP 404)` on stderr). `absent: true` + `failure: null` when status is 404. (release-merged's existing ghApi lacks `status`; its delegation treats any failure as before — no behavior change there, see Step 3.)
  - `writeClaimBlob(ghApi, repoSlug, issueNumber, { content, sha, message })` → `{ ok: boolean, failure }` — PUT `repos/{slug}/contents/claims/issue-{n}.json` with base64-encoded content; `sha` included only when provided (create-only vs conditional, per `_shared/issue-claims.md` steps 3-4).
  - `defaultGhApi(args)` — `execFileSync('gh', ['api', ...args])` wrapper returning `{stdout, failure, status}`: ENOENT → `gh-absent`; a thrown error whose stderr/stdout contains `HTTP 404` or `Not Found` → `{stdout: null, failure: null, status: 404}`; other throw → `network-failure`. 5s timeout like release-merged's.
- Note: keep this simpler than the prose above if a cleaner seam emerges, but the three behaviors are fixed: absent(404) distinguishable, create-only vs conditional writes, gh-absent vs network-failure distinguishable.

- [ ] **Step 1: Write the failing tests** — `tests/bin-lib/issues/claim-store.test.js` with fake `ghApi` functions (per the pattern skill: branch on args shape, throw on unexpected). Cases: (a) `readClaimBlob` absent (status 404) → `{absent: true, failure: null}`; (b) live blob read → content+sha parsed from the `-q '{content: (.content | @base64d), sha: .sha}'` output; (c) network failure → failure propagated, absent false; (d) `writeClaimBlob` create-only (no sha in args) vs conditional (sha present in args) — assert the argv the fake received; (e) `listClaimNames` happy + failure; (f) `defaultGhApi` is exported (existence only — no real gh call).
- [ ] **Step 2: Run to verify failure** — `node --test tests/bin-lib/issues/claim-store.test.js` → module not found.
- [ ] **Step 3: Implement `claim-store.js`; delegate release-merged.js.** In release-merged.js: `listClaims(repoSlug)` → `claimStore.listClaimNames(ghApi, repoSlug)`; `readClaim` → wrap `claimStore.readClaimBlob(ghApi, ...)` mapping `absent: true` to the existing `{content: null, sha: null, failure: 'network-failure'}`? NO — mapping `absent` to a skip is wrong; preserve current behavior exactly: release-merged's ghApi has no `status`, so absent never fires there and every failure stays `'network-failure'`/`'gh-absent'` exactly as today (it iterates listed blobs, so 404s are races). `writeTombstone` → `claimStore.writeClaimBlob` with sha (conditional). Verify no test change needed: `node --test tests/reconcile.test.js` must stay green untouched.
- [ ] **Step 4: Run to verify pass** — `node --test tests/bin-lib/issues/claim-store.test.js tests/reconcile.test.js` → all green.
- [ ] **Step 5: Commit** — `git add bin/lib/issues/claim-store.js bin/lib/reconcile/release-merged.js tests/bin-lib/issues/claim-store.test.js` ; commit `"Extract shared claim-blob store; delegate release-merged claim I/O — refs #723"`

### Task 2: `bin/lib/claim-targets/claim-targets.js` + `bin/claim-targets.js` CLI

**Files:**
- Create: `bin/lib/claim-targets/claim-targets.js`, `bin/claim-targets.js`
- Test: `tests/bin-lib/claim-targets/claim-targets.test.js` (new)

**Interfaces:**
- Consumes: `claim-store.js` (Task 1), `claims.js` (`classifyClaimBlob`, `claimPayload`, `releasePayload`, `CLAIMS_BRANCH`), `labels.js` (`ensureLabelPayload` for `bot:in-progress` bootstrap).
- Produces: `run(argv, deps)` where deps = `{ ghApi, gh, now, stdout, stderr, hostname, sessionId }` (`gh` = generic runner for non-api calls: `gh issue edit/comment`; `now` injectable for classify). CLI: `node bin/claim-targets.js --run-id <id> --targets 720,721[,…] [--keep-going]`.
- Behavior per target, in order (mirrors `skills/flow/claim-targets.md`'s loop): read (claim-store) → classify → self-owned skip (`claim.runId === runId` → `{issue, state: 'already-owned'}`) → absent: create-only write; tombstone/stale: conditional write (sha) → on success: `bot:in-progress` label add (best-effort, bootstrap-then-add via ensureLabelPayload; failures recorded, never abort) → claim comment (`claimPayload.commentBody`, best-effort, retry once) → claimed.
- Contest (`live`/`unreadable`, or a write rejection): without `--keep-going` → release every target claimed THIS run-invocation (tombstone write, reason `never-started: file-overlap group partial claim`), remove their labels best-effort, print JSON `{contested: [{issue, holder}], released: [...]}` to stdout, exit 3. With `--keep-going` → record the contested target, continue; exit 0 at end with the skip in the JSON.
- Transient (ghApi failure during read/write): identical all-or-abort mechanics, exit 4, JSON `{transient: [{issue, error}], released: [...]}` — no holder in the payload.
- Success: JSON `{claimed: [n,...], alreadyOwned: [...], skipped: [...], labelFailures: [...] }`, exit 0.
- Malformed (`--run-id` missing/empty, `--targets` missing/empty/non-positive-integers) or repo slug unresolvable → usage to stderr, exit 2. `--help` short-circuits. `require.main` guard sets `process.exitCode` (never `process.exit`).

- [ ] **Step 1: Write the failing tests** (fake ghApi + fake gh runner; per pattern skill, record argv inside, assert after): (a) two absent targets → both claimed, create-only PUTs (no sha in argv), label+comment calls made, exit 0; (b) tombstone target → conditional PUT with sha; (c) stale target → conditional PUT (re-claim); (d) second target live → first released (tombstone PUT with reason `never-started: file-overlap group partial claim`), exit 3, holder JSON on stdout; (e) same with `--keep-going` → no release, contested recorded, exit 0; (f) transient ghApi failure on second read → first released, exit 4, error named (not holder); (g) self-owned (blob runId == --run-id) → skipped as already-owned, no write; (h) unreadable blob → contested (fail-closed); (i) malformed: no --targets → exit 2; `--targets 0,abc` → exit 2; (j) label add failure → claim still stands, recorded in labelFailures, exit 0.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement module + CLI wrapper.** Wrap every deps call that can throw into the exit-code contract (pattern skill: the un-wrapped deps call is where a prior bug landed). Repo slug from `deps.gh(['repo','view','--json','nameWithOwner','-q','.nameWithOwner'])` or reuse `repoSlugOf`-style git remote parse via a deps seam — pick one, test it.
- [ ] **Step 4: Run to verify pass** — `node --test tests/bin-lib/claim-targets/claim-targets.test.js` green; also `node bin/claim-targets.js --help` prints usage, exit 0.
- [ ] **Step 5: Commit** — `"Ship bin/claim-targets.js — group claim CLI on the shared claim store — refs #723"`

### Task 3: `bin/lib/preflight-records/preflight-records.js` + `bin/preflight-records.js` CLI

**Files:**
- Create: `bin/lib/preflight-records/preflight-records.js`, `bin/preflight-records.js`
- Test: `tests/bin-lib/preflight-records/preflight-records.test.js` (new)

**Interfaces:**
- Consumes: `record.js` (`parseRecordFacets`, `parseDependencies`, `buildNativeDependencyQuery`, `hasOpenNativeBlocker`, `extractFingerprint`), `grouping.js` (`extractKeyFiles`, `groupByFileOverlap`), `policy-schema.js` (`resolvePolicyKeys` for `work-links` — through deps).
- Produces: `run(argv, deps)`; CLI `node bin/preflight-records.js 720 721 … [--work-links native|body-text]`. Output JSON: `{ records: { "<n>": { title, facets, blockedBy: [n,...], openBlocker: bool, keyFiles: [...], fingerprint } }, overlapGroups: [[n,...], ...], workLinks: "native"|"body-text" }`, exit 0. Per-record fetch: `gh issue view <n> --json number,title,body,labels` via deps runner. `native` → ONE batched GraphQL (`buildNativeDependencyQuery`, aliased per number, variables owner/repo via `-f` per the pattern skill's flag table — already-resolved String! values). `body-text` → `parseDependencies(body)`, no extra call. A record fetch that fails → exit 1 with every failing record named (all-at-once reporting, matching `materialize.md`'s Record-not-found posture). No numbers / non-positive → exit 2.

- [ ] **Step 1: Write the failing tests** (fake runner): (a) two records body-text mode → facets/keyFiles/blockedBy from body, one `gh issue view` per record, NO graphql call; (b) native mode → one graphql call with `-f owner=` `-f repo=` `-f query=` argv shape, blockedBy + openBlocker mapped per alias; (c) overlapGroups from shared keyFiles ({id, keyFiles} shape into groupByFileOverlap — note it keys on `item.id`); (d) fetch failure on one of three records → exit 1, all failures named; (e) no args → exit 2; (f) `--work-links` flag overrides the deps-resolved policy value.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** groupByFileOverlap takes `[{id, keyFiles}]` (verified: it unions on `item.id`).
- [ ] **Step 4: Run to verify pass**; `node bin/preflight-records.js --help` usage.
- [ ] **Step 5: Commit** — `"Ship bin/preflight-records.js — record pre-flight JSON CLI — refs #723"`

### Task 4: Cite the CLIs from the three skill files + plugin-structure; conformance test

**Files:**
- Modify: `skills/flow/claim-targets.md` (the "Claim every named target, all-or-abort" section: replace the per-target read-classify-write prose + success-path `gh issue edit`/`gh issue comment` snippet with one CLI invocation + exit-code branching; keep the MCP prose path, the #720 citation tokens, and the contest/liveness/card material intact)
- Modify: `skills/flow/multi-spec.md` (Validation step 3 "Pre-flight" cites `bin/preflight-records.js` as the mechanical collector)
- Modify: `skills/dispatch/SKILL.md` (Step 4's file-overlap/mint context cites `bin/preflight-records.js` where it derives groups; do not alter Step 4's mint-only semantics)
- Modify: `docs/plugin-structure.md` (add both CLIs to the standalone-CLI list line and command reference; add the two `bin/lib/{name}/` dirs + `issues/claim-store.js` to the directory notes)
- Test: `tests/flow-claim-preflight.test.js` (append AC-1 conformance test)

**Interfaces:** consumes Tasks 1-3's shipped CLIs (cite by exact path and flags).

- [ ] **Step 1: Write the failing conformance test** — append to `tests/flow-claim-preflight.test.js`:

```js
test('claim step invokes bin/claim-targets.js — no per-target gh api snippet remains (#723)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /bin\/claim-targets\.js/);
  const claimSection = content.split('## Claim every named target')[1];
  assert.ok(claimSection, 'claim section heading must exist');
  assert.doesNotMatch(claimSection, /gh api "repos/);
  assert.doesNotMatch(claimSection, /gh issue edit "\$ISSUE"/);
  // the canonical-read citation tokens survive (pinned by the #720 tests too)
  assert.match(content, /__ABSENT__/);
  assert.match(content, /@base64d/);
});

test('multi-spec pre-flight and dispatch cite bin/preflight-records.js (#723)', () => {
  assert.match(read('skills/flow/multi-spec.md'), /bin\/preflight-records\.js/);
  assert.match(read('skills/dispatch/SKILL.md'), /bin\/preflight-records\.js/);
});
```

- [ ] **Step 2: Run to verify the new tests fail** (and the existing 720/721/722 pins pass).
- [ ] **Step 3: Edit the four files.** In `claim-targets.md`, the claim step becomes: one fenced invocation — `node "${CLAUDE_PLUGIN_ROOT}/bin/claim-targets.js" --run-id "$(basename "$PIPELINE_RUN_DIR")" --targets {n}[,{m}…] [--keep-going]` — followed by exit-code branching prose (0 → proceed to Step 3; 3 → contested: render the liveness card per the evidence procedure below using the holder JSON; 4 → transient: render the transient card; the CLI already performed the all-or-abort release). State that the CLI implements `_shared/issue-claims.md` steps 1-6 via `bin/lib/issues/claim-store.js` — the `__ABSENT__`-sentinel absent branch and the `@base64d`+sha single-read are inside it, one canonical implementation. Keep: the per-target self-owned note (now a CLI behavior statement), the MCP-transport prose path for `gh`-absent environments (unchanged — the CLI is the gh transport only), the contest cards, the liveness evidence procedure, and the transient-failure section (adjust its lead-in to reference the CLI's exit 4 rather than manual loop failure). Preserve every pinned phrase named in Global Constraints.
- [ ] **Step 4: Run the full pin set** — `node --test tests/flow-claim-preflight.test.js tests/run-dir-timestamp-utc.test.js tests/dispatch-flow-rundir-handoff.test.js` → all green.
- [ ] **Step 5: Commit** — `"Cite the claim/preflight CLIs from flow and dispatch; document in plugin-structure — refs #723"`
