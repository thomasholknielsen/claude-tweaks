# Multi-Spec Boundary Freshness Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-spec boundary freshness check to multi-spec `/flow` runs (new `plugin/skills/flow/multispec-freshness.md`, cited from the Execution loop) and generalize the batch-curation diff basis from `baseSha..HEAD` to `merge-base..HEAD`.

**Architecture:** Skill prose only — no `bin/` executable. A new sibling file in the `multispec-*.md` family carries the procedure; `multi-spec.md` gains one citation bullet plus a `baseSha` description reword; `multispec-batch-curation.md`'s two diff-base sites switch to `git merge-base`. A new conformance suite pins the contract points.

**Tech Stack:** Markdown skill files; `node --test` conformance suite (`node:test` + `node:assert/strict`, house style per `tests/flow-resume-freshness-citations.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T154419-spec-1076/work/1076-spec.md` (worktree-relative; materialized from GitHub issue #1076)

## Global Constraints

- Never hardcode `origin/main` inside a command span/fence in the new file — resolve via `skills/_shared/integration-branch.md`'s ladder (`{integration-branch}` placeholder in prose commands; the `resolve-policy.js` + `origin/HEAD` fallback idiom in bash fences, mirroring `_shared/worktree-setup.md`'s Pre-flight snippet).
- Cite `_shared/worktree-setup.md` for merge/conflict/fail-open mechanics — never restate its fetch+merge block (its own Anti-patterns table forbids restating).
- The escalation is an instance of `_shared/auto-mode-contract.md`'s existing structural-coupling HARD-GATE class — never phrased as a new mid-flow stop category.
- Commit messages: `{Verb} {what} — {detail}` imperative style, `refs #1076` (never `closes`).
- Skill-reference form: sibling files are cited as "read `multispec-freshness.md` in this skill's directory"; no `docs/skill-graph.md` edge (sibling files are not skill-graph nodes).

---

### Task 1: Conformance suite (written first, red)

**Files:**
- Create: `tests/multispec-boundary-freshness.test.js`

**Interfaces:**
- Produces: the red suite Tasks 2–4 turn green; Task 5 re-reddens it by reverting each pinned edit.

- [ ] **Step 1: Write the failing suite**

```js
// tests/multispec-boundary-freshness.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FLOW_DIR = path.join(__dirname, '..', 'plugin', 'skills', 'flow');
const FRESHNESS = path.join(FLOW_DIR, 'multispec-freshness.md');
const MULTI_SPEC = path.join(FLOW_DIR, 'multi-spec.md');
const CURATION = path.join(FLOW_DIR, 'multispec-batch-curation.md');

// Every backtick-delimited code region — inline spans and fences alike.
function codeRegions(text) {
  const fences = text.match(/```[\s\S]*?```/g) ?? [];
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const spans = stripped.match(/`[^`\n]+`/g) ?? [];
  return [...fences, ...spans];
}

test('multispec-freshness.md exists and cites the canonical fragments', () => {
  const text = fs.readFileSync(FRESHNESS, 'utf8');
  assert.match(text, /integration-branch\.md/, 'must cite the integration-branch ladder');
  assert.match(text, /worktree-setup\.md/, 'must cite worktree-setup.md for merge mechanics');
  assert.match(text, /auto-mode-contract\.md/, 'must anchor the gate in the auto-mode contract');
});

test('multispec-freshness.md never hardcodes origin/main in a code region', () => {
  const text = fs.readFileSync(FRESHNESS, 'utf8');
  const offenders = codeRegions(text).filter((r) => r.includes('origin/main'));
  assert.deepStrictEqual(offenders, [], 'command text must use {integration-branch}, not a hardcoded origin/main');
});

test('multispec-freshness.md states the HARD-GATE auto-mode and keep-going contract', () => {
  const text = fs.readFileSync(FRESHNESS, 'utf8');
  assert.match(text, /HARD-GATE/);
  assert.match(text, /fires even in `auto` mode/);
  assert.match(text, /`MULTISPEC_KEEP_GOING` does not bypass/);
});

test('multispec-freshness.md states the fetch-failure skip rule and best-effort oracle', () => {
  const text = fs.readFileSync(FRESHNESS, 'utf8');
  assert.match(text, /skip this boundary's check entirely/i);
  assert.match(text, /best-effort/);
});

test('multi-spec.md Execution section cites multispec-freshness.md exactly once, spec 2 onward, before the scaffold step', () => {
  const text = fs.readFileSync(MULTI_SPEC, 'utf8');
  const start = text.indexOf('## Execution');
  assert.notStrictEqual(start, -1);
  const rest = text.slice(start);
  const nextH2 = rest.slice(2).search(/\n## [^#]/);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 2);
  const mentions = section.match(/multispec-freshness\.md/g) ?? [];
  assert.strictEqual(mentions.length, 1, `expected exactly one citation in Execution, got ${mentions.length}`);
  const citeAt = section.indexOf('multispec-freshness.md');
  const scaffoldAt = section.indexOf('Scaffold the per-spec subdirectory before exporting');
  assert.ok(scaffoldAt !== -1 && citeAt < scaffoldAt, 'boundary check must be ordered before the per-spec scaffold step');
  assert.match(section, /spec 2 onward/i);
});

test('multispec-batch-curation.md derives its batch diff base from git merge-base at both sites', () => {
  const text = fs.readFileSync(CURATION, 'utf8');
  const scopeLine = text.split('\n').find((l) => l.includes('**Scope**'));
  assert.ok(scopeLine, 'Scope bullet must exist');
  assert.match(scopeLine, /merge-base/, 'Scope bullet must derive from merge-base');
  const fence = (text.match(/```[\s\S]*?```/g) ?? []).find((f) => f.includes('wrap-up-engine.js'));
  assert.ok(fence, 'engine-call fence must exist');
  assert.match(fence, /--base "\$\(git merge-base /, '--base must come from git merge-base');
  assert.doesNotMatch(text, /yq '\.multispec\.baseSha'/, 'the baseSha yq read must be gone');
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test tests/multispec-boundary-freshness.test.js`
Expected: FAIL — first test errors with ENOENT on `multispec-freshness.md`; the multi-spec.md and curation tests fail on missing citation / missing merge-base.

- [ ] **Step 3: Commit**

```bash
git add tests/multispec-boundary-freshness.test.js
git commit -m "Add red conformance suite for multispec boundary freshness — refs #1076"
```

---

### Task 2: Create `plugin/skills/flow/multispec-freshness.md`

**Files:**
- Create: `plugin/skills/flow/multispec-freshness.md`

**Interfaces:**
- Produces: the sibling file `multi-spec.md`'s Task-3 bullet cites. Contains the literal sentences Task 1's suite pins: `fires even in \`auto\` mode`, `` `MULTISPEC_KEEP_GOING` does not bypass ``, `skip this boundary's check entirely`, `best-effort`.

- [ ] **Step 1: Write the file with exactly this content**

````markdown
# Multi-Spec Boundary Freshness Check

Loaded by `/claude-tweaks:flow`'s multi-spec Execution loop (`multi-spec.md`'s boundary-freshness bullet) — runs at each spec boundary, spec 2 onward: after spec N-1's pipeline completes, fails, or is skipped under `MULTISPEC_KEEP_GOING`, and before spec N's per-spec scaffold step. Spec 1 is covered by the shared worktree's creation-time catch-up (`skills/build/worktree-setup.md` Step 4), and the end-of-run finish keeps its own re-check (`multi-spec.md`'s Shared-worktree Step 3). This file covers only the gap between those endpoints: a long-running batch during which origin can ship work that invalidates the remaining specs' premises. Two observed incidents motivate it: #856 (the v6.95.0 `plugin/` subtree cutover merged *cleanly* into an in-flight batch, caught only by an improvised KEPT-PROMPT) and batch #967–970 (135 commits of drift resolved only at PR-merge time, commit `9126efb7`).

Resolve `{integration-branch}` via `skills/_shared/integration-branch.md`'s canonical ladder — never hardcode a branch name. Merge mechanics, conflict resolution (`_shared/git-discipline.md`), the fail-open posture, and the `decisions.md` entry format all follow `_shared/worktree-setup.md` — cited, not restated (its own Anti-patterns table forbids restating).

## The check

1. `git fetch origin {integration-branch}`. **On fetch failure, skip this boundary's check entirely** and log the distinct fail-open line per `_shared/worktree-setup.md`'s fail-open note — never compute the behind-count against a stale ref, where a false zero would be indistinguishable from a genuine clean no-op. A reader of the parent `decisions.md` must be able to tell "checked, clean" from "check didn't run."
2. `BEHIND=$(git rev-list --count "HEAD..origin/{integration-branch}")` — `0` → silent no-op. Write nothing (log-only-when-changed, mirroring `worktree-setup.md`'s convention and the Pre-flight Verify Sweep's clean case).
3. `BEHIND > 0` → compute three path sets:
   - **Incoming** — `git diff --name-status "HEAD...origin/{integration-branch}"` (three-dot: the incoming side only). A rename entry (`R{score}`, tab-separated old and new path) contributes **both** paths.
   - **Run-modified** — `git diff --name-only "$(git merge-base HEAD "origin/{integration-branch}")..HEAD"`. The merge-base isolates the run's own side even after an earlier boundary merge landed upstream commits in the branch. `manifest.yml`'s `baseSha` is deliberately not used here: it is only written under `MULTISPEC_CURATION_DEFER=1`, and after the first boundary merge it would count merged-in upstream files as run-modified — false-positive escalations.
   - **Remaining Key Files** — the `### Key Files` paths of specs N..last, from Validation Step 3's pre-flight collection (`bin/preflight-records.js`, whose per-record `keyFiles` arrays are clean paths via `extractKeyFiles`). Completed specs' files are not in this set.
4. **Overlap formula:** `incoming ∩ (run-modified ∪ remaining-Key-Files) ≠ ∅` — exact-path equality after rename expansion, no prefix matching; either intersection alone escalates. This is a plain path-set intersection over git output — not `groupByFileOverlap` (`bin/lib/issues/grouping.js`), which is record-keyed and solves a different problem.
5. **No overlap** → `git merge origin/{integration-branch}`. On success, one `AUTO` entry in the **parent** run directory's `decisions.md` in `worktree-setup.md`'s correction-entry format (before/after short shas, commit count). On conflict → `git merge --abort` to restore the clean tree, then escalate below — git overruled the heuristic, and the gate must open on a clean tree exactly like the overlap path's.
6. **Overlap** → escalate below, *before* merging, so the decision point sees a clean tree.

The Key Files oracle is **best-effort**: a spec's declared Key Files are a proxy for what its build will actually touch, so a false negative is possible — the pre-finish re-check (`multi-spec.md`'s Shared-worktree Step 3) remains the backstop. The behind-count likewise assumes an append-only integration branch (this project's standing git discipline); a rewritten remote history surfaces as divergence or conflict at merge time rather than being silently mis-counted — the count is a screen, not a proof.

## Escalation — run-level HARD-GATE

This gate is an instance of `_shared/auto-mode-contract.md`'s existing structural-coupling HARD-GATE class — not a new mid-flow stop category. It fires even in `auto` mode. `MULTISPEC_KEEP_GOING` does not bypass it: keep-going skips past a *failed spec*, but boundary drift invalidates every remaining spec equally — skipping ahead dodges nothing. (The check itself also runs at every boundary regardless of whether the prior spec completed, failed, or was skipped.)

Call `AskUserQuestion`:

- `question`: `"origin/{integration-branch} moved {BEHIND} commit(s) and the incoming diff overlaps this run's work — how do you want to proceed?"`, `header`: `"Boundary drift"`, `multiSelect`: `false`
- Option 1 — `label`: `"Merge + re-validate premises (Recommended)"`, `description`: `"Merge, then check each remaining spec's Key Files and stated assumptions against the new tip; surface what broke."`
- Option 2 — `label`: `"Merge and continue as-is"`, `description`: `"The drift is benign — merge and proceed without re-validation."`
- Option 3 — `label`: `"Stop the run"`, `description`: `"Stop remaining specs per multispec-failure-handling.md; completed specs' commits stay in the shared branch."`

**On option 1:** merge, then re-read each remaining spec's `### Key Files` and stated assumptions against the new tip, write one verdict line per remaining spec to the parent `decisions.md`, and when anything broke, surface it as a follow-up decision within this same open gate (fix the spec / skip it / stop the run) — no new stop class. **On option 2:** merge and continue. **On option 3:** stop per `multispec-failure-handling.md`.

A merge performed under option 1 or 2 that itself conflicts is resolved per `_shared/git-discipline.md`'s merge-conflict procedure — the human is already present at the gate; never reset or discard.

**Logging is both-entries, not either-or:** any merge that advances the branch writes the `worktree-setup.md`-format `AUTO` entry, and the gate's resolution additionally writes its own entry per `_shared/auto-decision-log.md`'s schema.

## Interplay

- **Merge-then-suite** (`multi-spec.md`'s Shared-worktree Step 3 sequencing rule) is structurally satisfied: the check runs at the boundary, when no spec's build or suite is in flight.
- **Test attribution:** spec N's `/test` failures appearing after a boundary merge may come from merged upstream code — attribute against the drift-merge `decisions.md` entry, not the Pre-flight Verify Sweep's ledger baseline (which predates the merged commits), before re-diagnosing.
- **Batch curation:** boundary merges put upstream commits inside the shared branch's history — `multispec-batch-curation.md`'s batch diff derives from `git merge-base`, not `manifest.yml`'s `baseSha`, for exactly this reason (byte-identical when no boundary merge landed).

## Worked example — the #856 signature

Mid-batch, origin shipped the v6.95.0 restructuring that moved `skills/**` to `plugin/skills/**`. The incoming `--name-status` set is rename-heavy — `R100`-class entries pairing each old `skills/...` path with its new `plugin/skills/...` path. The in-flight specs' Key Files name the **old** paths, so under the rename rule (both paths contribute to the incoming set) `incoming ∩ remaining-Key-Files` is non-empty and the gate fires — even though `git merge` itself would have completed cleanly. A naive incoming set that kept only each rename's *new* path would miss the intersection entirely; the rename rule is what makes this check catch the incident that motivated it.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Skipping the boundary check because `reconcile` ran recently | Reconcile advances the main checkout's ref; the shared worktree's branch and the remaining specs' premises are what drift — the check is about them |
| Computing `BEHIND` after a failed fetch | A stale ref's false zero is indistinguishable from a genuine clean no-op — skip and log distinctly instead |
| Using `manifest.yml`'s `baseSha` for the run-modified set | After the first boundary merge it counts merged-in upstream files as run-modified — false-positive escalations |
| Treating a clean `git merge` as proof the premises hold | #856 merged clean while invalidating every in-flight spec's assumed paths — overlap, not merge success, is the signal |
| Logging a "sweep clean" entry for a zero-behind boundary | Log-only-when-changed — a no-op entry per boundary is noise that buries the real corrections |
````

- [ ] **Step 2: Run the suite**

Run: `node --test tests/multispec-boundary-freshness.test.js`
Expected: the four `multispec-freshness.md` tests PASS; the `multi-spec.md` and curation tests still FAIL.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/flow/multispec-freshness.md
git commit -m "Add multispec-freshness.md — per-spec boundary freshness check with overlap-escalation HARD-GATE — refs #1076"
```

---

### Task 3: Cite the check from `multi-spec.md` + reword the `baseSha` description

**Files:**
- Modify: `plugin/skills/flow/multi-spec.md` (Execution section, after the "Run each spec's full pipeline in order" paragraph and before the "Scaffold the per-spec subdirectory" bullet; and the `manifest.yml` `baseSha` paragraph in "Run directory layout")

**Interfaces:**
- Consumes: Task 2's file name.

- [ ] **Step 1: Insert the boundary-check bullet**

In `plugin/skills/flow/multi-spec.md`, directly after the paragraph `Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins.` and before the `**Scaffold the per-spec subdirectory before exporting its \`PIPELINE_RUN_DIR\`**` paragraph, insert:

```markdown
**Boundary freshness check (spec 2 onward)** — before each spec's per-spec scaffold below, read `multispec-freshness.md` in this skill's directory and run its per-boundary check: trivial drift merges automatically with a parent-`decisions.md` entry; a merge conflict, or a clean merge whose incoming diff overlaps run-modified paths or the remaining specs' Key Files, escalates as a run-level HARD-GATE (fires in `auto`; `MULTISPEC_KEEP_GOING` does not bypass it). Spec 1 needs no check — the creation-time catch-up (Shared-worktree Step 1) just ran.
```

- [ ] **Step 2: Reword the `baseSha` description**

In the same file's "Run directory layout" section, replace the clause describing why `manifest.yml` carries `baseSha` —

```
— so `multispec-batch-curation.md`'s registry pass has a stable pre-batch baseline to read back rather than re-deriving it after N specs' worth of commits have landed:
```

with:

```
— kept as diagnostic provenance (the batch's true starting commit). `multispec-batch-curation.md`'s registry pass no longer reads it as a diff base: its batch diff derives from `git merge-base` so boundary freshness merges (`multispec-freshness.md`) don't pollute the batch scope:
```

- [ ] **Step 3: Run the suite**

Run: `node --test tests/multispec-boundary-freshness.test.js`
Expected: the `multi-spec.md` citation test PASSES (note the exactly-once assertion is scoped to the Execution section — the `baseSha` reword's mention lives in "Run directory layout" and does not count against it); curation test still FAILS.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/flow/multi-spec.md
git commit -m "Cite multispec-freshness.md from the per-spec loop; reword baseSha as diagnostic provenance — refs #1076"
```

---

### Task 4: Generalize the batch-curation diff basis

**Files:**
- Modify: `plugin/skills/flow/multispec-batch-curation.md` (Scope bullet, line ~24; the `wrap-up-engine.js plan` fence, line ~36-40)

- [ ] **Step 1: Replace the Scope bullet**

Replace:

```
1. **Scope** — `git diff --name-only` from `manifest.yml`'s `baseSha` to the current worktree `HEAD` (covers every completed spec's commits on the shared branch — see `multi-spec.md`'s "Shared worktree" section for why one branch accumulates every spec).
```

with:

```
1. **Scope** — `git diff --name-only` from `$(git merge-base HEAD "origin/{integration-branch}")` to the current worktree `HEAD`, `{integration-branch}` per `skills/_shared/integration-branch.md`'s ladder (covers every completed spec's commits on the shared branch — see `multi-spec.md`'s "Shared worktree" section for why one branch accumulates every spec). The merge-base equals `manifest.yml`'s `baseSha` when no boundary freshness merge (`multispec-freshness.md`) landed, and correctly excludes merged-in upstream commits when one did.
```

- [ ] **Step 2: Replace the `--base` value in the engine fence**

Replace the fence:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" plan --run-dir "$MULTISPEC_PARENT_DIR" \
  --base "$(yq '.multispec.baseSha' "$MULTISPEC_PARENT_DIR/manifest.yml")" \
  --ceremony "{ceremony-profile from config.yml}" --signals '{...}'
```

with:

```bash
INTEGRATION_BRANCH=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-branch)
[ -n "$INTEGRATION_BRANCH" ] || INTEGRATION_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's@^origin/@@')
node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" plan --run-dir "$MULTISPEC_PARENT_DIR" \
  --base "$(git merge-base HEAD "origin/${INTEGRATION_BRANCH}")" \
  --ceremony "{ceremony-profile from config.yml}" --signals '{...}'
```

- [ ] **Step 3: Run the suite**

Run: `node --test tests/multispec-boundary-freshness.test.js`
Expected: ALL tests PASS.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/flow/multispec-batch-curation.md
git commit -m "Derive batch-curation diff base from git merge-base, not manifest baseSha — refs #1076"
```

---

### Task 5: Red-proof the new assertions, then the full suite

**Files:**
- Test: `tests/multispec-boundary-freshness.test.js` (no content change — discrimination proof by reverting each pinned edit)

- [ ] **Step 1: Red-proof each pinned contract point (AC4)**

For each of the three reverts below: apply the revert, run `node --test tests/multispec-boundary-freshness.test.js`, confirm FAIL, restore the file (`git checkout -- <file>` restores the committed state; the revert itself is never committed):

1. Delete the `**Boundary freshness check (spec 2 onward)**` paragraph from `plugin/skills/flow/multi-spec.md` → the Execution-citation test must fail.
2. In `plugin/skills/flow/multispec-batch-curation.md`, change the fence's `--base "$(git merge-base HEAD "origin/${INTEGRATION_BRANCH}")"` back to `--base "$(yq '.multispec.baseSha' "$MULTISPEC_PARENT_DIR/manifest.yml")"` → the curation test must fail.
3. Delete the sentence containing `` `MULTISPEC_KEEP_GOING` does not bypass `` from `plugin/skills/flow/multispec-freshness.md` → the HARD-GATE contract test must fail.

Expected after each: FAIL on exactly the named test; after each restore, PASS.

- [ ] **Step 2: Run the full suite centrally (AC5)**

Run: `npm test > /tmp/full-suite-1076.log 2>&1; echo "exit=$?"; tail -8 /tmp/full-suite-1076.log`
Expected: exit=0, `# fail 0`. (Machine-load flake tolerance per CLAUDE.md: a varying failure count on byte-identical code re-runs the affected file in isolation before concluding breakage.)

- [ ] **Step 3: Commit (only if working tree has changes — red-proof restores should leave none)**

```bash
git status --porcelain
```

Expected: empty. Nothing to commit — Task 5 is verification only.
