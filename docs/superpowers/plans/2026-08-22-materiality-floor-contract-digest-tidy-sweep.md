# Materiality Floor Contract, Digest, Tidy Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the materiality floor's shared contract (`_shared/materiality-floor.md`), the two coherence edits it requires (`_shared/deferral-gate.md`, `CLAUDE.md`), the `/tidy` digest sweep that manages the container's lifecycle, and the conformance test suite pinning all of it. No adopter migration — nothing routes to the digest yet (that's sub-issue #1262).

**Architecture:** One new `_shared/*.md` contract file is the single source of truth for the floor definition, entry format, container shape (per `work-backend`), and audit line. `/tidy` gets a new lazy-loaded sub-file (`digest-sweep.md`) implementing the container's only lifecycle management (bootstrap-race repair, cluster promotion, expiry) — the sweep is the first and, until #1262 lands, only consumer. Two existing files get a one-clause amendment each so the new contract doesn't contradict them.

**Tech Stack:** Markdown skill files (no runtime code changes — this is a documentation/contract sub-issue), `node --test` conformance suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T084440-spec-1261-1262-1263-1264/spec-1261/work/1261-spec.md` (record #1261)

## Global Constraints

- `plugin/skills/tidy/SKILL.md` ceiling: ≤ 40,960 bytes (currently 37,354 — ~3.6KB headroom). The sweep's procedure text MUST live in the new `digest-sweep.md` sub-file; `SKILL.md` gets only a short trigger paragraph.
- Every new lazy-loaded `.md` sub-file under `plugin/skills/**` is auto-discovered and ceiling-checked by `tests/bin-lib/skill-audit/context-cost.test.js` (≤ 40,960 bytes) — confirmed via `plugin/bin/lib/skill-audit/context-cost.js`'s `measureSubFiles`, which walks every `.md` file except `SKILL.md` itself. `digest-sweep.md` will be small; no risk here, but never skip the `wc -c` check.
- CLAUDE.md additions stay short — this plan's CLAUDE.md edit is a clause appended to one existing bullet, not a new paragraph.
- `bin/lib/log-decision/append.js`'s `STATUSES` is a closed set — the contract's audit line MUST start with the literal `AUTO` status; never invent a new status word.
- The `digest` label is new — bootstrap it per `_shared/label-bootstrap.md` (add a `["digest", "..."]` row to the canonical `LABELS_JSON` array; the file's own "current value" text for `LABEL_BOOTSTRAP_VERSION` also needs bumping since a label was added).
- `docs/skill-graph.md`'s own rule: "Non-skill targets ... sit with the skill that depends on them." Both new edges (`_shared/materiality-floor.md` ↔ `tidy`, and `_shared/materiality-floor.md` ↔ `_shared/deferral-gate.md`) land as two new rows inside the existing `## tidy` table — tidy's digest sweep is the only skill in this sub-issue that actually touches either fragment.

---

## Task 1: Create the materiality floor contract

**Files:**
- Create: `plugin/skills/_shared/materiality-floor.md`
- Test: `tests/materiality-floor-conformance.test.js` (this task writes the file only; Task 5 writes the test)

**Interfaces:**
- Consumes: `_shared/deferral-gate.md`'s `Defer-reason:` vocabulary (six closed values, cited by name — never restated), `_shared/work-record.md`'s Label taxonomy table (Risk/Size/Priority rows), `_shared/auto-decision-log.md`'s entry schema (the `AUTO` status), `_shared/label-bootstrap.md`'s check-then-create loop, `_shared/github-write-transport.md` (cited, not restated).
- Produces: the floor definition (`size:low` AND `priority:low` AND `risk:low`, fails toward filing on any unscored/ambiguous axis), the `tangential`-always-clears override, the entry-format line `- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}`, the `AUTO {time} — materiality-floor: {item} routed below floor ({defer-reason}) → digest. Reversibility: high (...)` audit-line template, and the container shape per `work-backend` — all of which `tidy/digest-sweep.md` (Task 4) and the future #1262 adopters read by citation.

- [ ] **Step 1: Write the contract file**

```markdown
# Materiality Floor — routing legitimately-deferred, below-floor findings to a digest

Applied strictly **after** `_shared/deferral-gate.md`: an item first attempts fix-now, and only
an item that fails fix-now and carries a valid `Defer-reason:` from that gate's closed vocabulary
reaches this floor. The floor never decides whether to fix — it only decides which container a
*legitimately-deferred* item lands in. Citing this file as a reason to skip a fix, or to defer
without a valid `Defer-reason:`, is a misuse of both contracts; `_shared/deferral-gate.md`'s hard
gate still applies unchanged, and this file repeats that ordering deliberately because it is the
predictable failure mode.

## The floor

Route to the digest only when the item would be filed at **all three**: `size:low` AND
`priority:low` AND `risk:low` (`_shared/work-record.md`'s Label taxonomy table — Risk/Size/Priority
rows). An unscored or ambiguous axis counts as **not low** — the floor fails toward filing an
ordinary issue, never toward the digest.

## Overrides

- `Defer-reason: tangential` always clears the floor and files as an ordinary issue — a tangential
  finding is a new idea the finding suggests, not residue of the current work, and ideas are
  intent, not exhaust (`_shared/deferral-gate.md`'s vocabulary).
- Human-typed `/capture` input is out of this contract's scope entirely — human input is intent,
  never exhaust, and never routes to the digest.

## Entry format

```
- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}
```

`{provenance}` is the pipeline run-id when a run directory resolves (`$PIPELINE_RUN_DIR`'s
basename), else the invoking skill's name. The entry itself is the durable audit trail — a
no-run-dir routing is never unlogged.

## Container

**`work-backend: github-issues`:** one pinned rolling issue labeled `digest`. Before routing, list
open `digest`-labeled issues (`gh issue list --label digest --state open`); create one only when
none exists, bootstrapping the label first (`_shared/label-bootstrap.md`). Route by posting one
comment per run, aggregating that run's below-floor items — one comment URL per run, never one
comment per item. All writes go through `_shared/github-write-transport.md`. Routing appends are
append-only; the one sanctioned exception is the `/tidy` digest sweep's promotion/expiry marker
edits (`tidy/digest-sweep.md`). A creation race that leaves two open `digest` issues is repaired
by that same sweep: merge the newer issue's comments into the older, then close the newer.

**`work-backend: local-files`:** `specs/digest.md`, entries appended in place (single-writer
backend, no rollover needed). Promotion marks the entry line with a trailing `→ {id}`. Expiry
moves entry lines to an `## Archived {YYYY-MM-DD}` section at the bottom of the same file.

## Audit line

When a run directory resolves, routing additionally logs, per `_shared/auto-decision-log.md` — the
existing `AUTO` status, no new status word:

```
AUTO {time} — materiality-floor: {item} routed below floor ({defer-reason}) → digest. Reversibility: high (entry remains promotable or re-filable from the digest at any time).
```

This is bookkeeping, not decision-worthy — no Review Console row per entry.

## Expiry is not skipped work

An expired entry already passed the deferral gate (fix-now was attempted and refused for a stated
reason) and sat un-promoted for 90 days. Archival is a logged retention decision reachable only
through that gate — the distinction that separates it from the silent skipping CLAUDE.md's "No
implicit deferrals" rule forbids. `tidy/digest-sweep.md` performs this archival; see that file for
the exact promotion and expiry procedures.

## Consumers

Nothing routes to this digest yet — the nine exhaust channels (review, wrap-up, the four health
sweeps, visual-review, reflect) adopt this contract in a follow-up sub-issue. `/tidy`'s digest
sweep (`tidy/digest-sweep.md`) is the first and, until that follow-up lands, only consumer — it
manages the container's lifecycle (cluster promotion + expiry) regardless of whether anything has
routed to it yet.
```

- [ ] **Step 2: Measure the file size**

Run: `wc -c plugin/skills/_shared/materiality-floor.md`
Expected: well under 40,960 (this is a new, focused file — no ceiling risk, but always measure per this repo's convention).

- [ ] **Step 3: Grep-check the two AC1 anchors**

Run: `grep -i "size:low" plugin/skills/_shared/materiality-floor.md && grep -i "tangential" plugin/skills/_shared/materiality-floor.md`
Expected: both match.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/materiality-floor.md
git commit -m "Add _shared/materiality-floor.md contract"
```

---

## Task 2: Amend the deferral gate's bundling bullet

**Files:**
- Modify: `plugin/skills/_shared/deferral-gate.md` (the "Bundle of small items" bullet in `## Bad reasons to skip a fix`)
- Modify: `tests/deferral-gate-conformance.test.js` (add one assertion pinning the citation)

**Interfaces:**
- Consumes: Task 1's `_shared/materiality-floor.md` (cited by path).
- Produces: nothing new consumed elsewhere — this is a one-clause amendment to existing prose.

- [ ] **Step 1: Amend the bullet**

In `plugin/skills/_shared/deferral-gate.md`'s `## Bad reasons to skip a fix` section, replace:

```markdown
- *"Bundle of small items"* — items get classified individually, never as a group
```

with:

```markdown
- *"Bundle of small items"* — items get classified individually, never as a group; below-floor **deferred** items are the one exception — they batch into the digest by design, per `_shared/materiality-floor.md`, which is a routing decision made after the gate, never a reason to skip a fix
```

- [ ] **Step 2: Add the pinning test**

In `tests/deferral-gate-conformance.test.js`, immediately after the existing `for (const anchor of BAD_REASON_ANCHORS) { ... }` loop (the block that ends with its closing `}`), add:

```js
test('deferral-gate.md\'s bundling exception cites materiality-floor.md by literal path', () => {
  assert.ok(GATE.includes('_shared/materiality-floor.md'));
});
```

- [ ] **Step 3: Run the test**

Run: `node --test tests/deferral-gate-conformance.test.js`
Expected: all tests pass, including the new one.

- [ ] **Step 4: Verify it actually discriminates**

Temporarily revert the Step 1 edit (`git stash` the deferral-gate.md change only, or manually restore the old bullet), re-run the same test command, confirm the new test fails, then restore the amendment.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/deferral-gate.md tests/deferral-gate-conformance.test.js
git commit -m "Cite materiality-floor.md from deferral-gate's bundling bullet"
```

---

## Task 3: Amend CLAUDE.md's "No implicit deferrals" bullet

**Files:**
- Modify: `CLAUDE.md` (the `## Philosophy` section's "No implicit deferrals" bullet)

**Interfaces:**
- Consumes: Task 1's `_shared/materiality-floor.md` (cited by path).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Read the current bullet**

Run: `grep -n "No implicit deferrals" -A 1 CLAUDE.md`

- [ ] **Step 2: Replace it**

Replace the existing bullet:

```markdown
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record via `/claude-tweaks:capture` — with a spec-shaped body (Current State / Deliverables / Acceptance Criteria) and a `Defer-reason:` from `_shared/deferral-gate.md` when an agent holds the context; a stub is for a human typing an idea. Never silently skip work or leave TODO comments without a corresponding backlog record.
```

with:

```markdown
- **No implicit deferrals.** When something needs doing, either do it now, explicitly file a backlog work record via `/claude-tweaks:capture` — with a spec-shaped body (Current State / Deliverables / Acceptance Criteria) and a `Defer-reason:` from `_shared/deferral-gate.md` when an agent holds the context; a stub is for a human typing an idea — or, below the materiality floor, log it to the digest per `_shared/materiality-floor.md`. Never silently skip work or leave TODO comments without a corresponding backlog record.
```

(Single bullet, same line count — satisfies AC4's "adds at most 2 lines.")

- [ ] **Step 3: Verify the existing conformance test still passes**

Run: `node --test tests/deferral-gate-conformance.test.js`
Expected: `'both CLAUDE.md copies name the spec-shaped body in the no-implicit-deferrals bullet'` still passes (the amended bullet still contains both `spec-shaped body` and `Defer-reason`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Name the materiality-floor digest as a third no-implicit-deferrals outcome"
```

---

## Task 4: Tidy digest sweep — new sub-file + SKILL.md trigger

**Files:**
- Create: `plugin/skills/tidy/digest-sweep.md`
- Modify: `plugin/skills/tidy/SKILL.md` (add the trigger paragraph + one new row in the Steps table; add the digest label to Step 6/7's action vocabulary is NOT needed — the sweep composes and applies its own staged proposals per this file)

**Interfaces:**
- Consumes: Task 1's `_shared/materiality-floor.md` (container shape, entry format), `_shared/label-bootstrap.md` (digest label bootstrap — Task 6 adds the label row), `{run-dir}/staged/` staging convention (`_shared/staged-patch.md`'s sibling convention for a non-code proposal — a plain markdown proposal file, not a patch).
- Produces: the two sweep procedures (`### Cluster promotion`, `### Expiry`) that a later #1262 build will not need to touch — they operate on the container regardless of who wrote into it.

- [ ] **Step 1: Create `plugin/skills/tidy/digest-sweep.md`**

```markdown
# Tidy — Digest Sweep

The digest sweep's procedures, extracted into their own lazy-load unit so `SKILL.md` keeps only a
short trigger paragraph pointing here (`SKILL.md`'s 40,960-byte ceiling has ~3.6KB of headroom —
this sweep's prose does not fit inline).

The dispatcher reads this file **whole** and inlines it into the relevant agent's prompt when this
sweep is in scope (an unscoped run, or `--scope=backlog`/`--scope=github` per the driver the
digest container lives on); subagents cannot read sibling files, so everything the sweep needs is
here or in the `_shared/` fragments this file names for the dispatcher to inline alongside it.

---

## Digest sweep (Step 5.6)

No-ops silently when no open `digest`-labeled issue exists (`work-backend: github-issues`) or
`specs/digest.md` doesn't exist (`work-backend: local-files`) — nothing has routed yet (#1262 has
not landed, or no below-floor finding has fired since it did). Three procedures run in order
against whatever container exists, per `_shared/materiality-floor.md`'s Container section:

### Bootstrap-race repair

When more than one open `digest`-labeled issue exists (a creation race in
`_shared/materiality-floor.md`'s lazy bootstrap), merge the newer issue's comments into the older
(in creation order) and close the newer with a comment pointing at the surviving issue. Runs
before promotion/expiry below, since both need a single container to operate against. No analogous
race exists on `work-backend: local-files` (single-writer backend) — skip this procedure there.

### Cluster promotion

Read every un-promoted entry line (no trailing `→ {id}` marker) across the container's comments
(`github-issues`) or body (`local-files`), per `_shared/materiality-floor.md`'s entry format. Group
by `{area}` (the entry format's first field). When **3 or more** un-promoted entry lines share the
same `{area}`, propose one spec-shaped issue absorbing them — each entry becomes one Deliverables
bullet, the cluster's shared `{area}` becomes the proposal's title subject. Present the proposal
per this project's standard staged-item flow (`{run-dir}/staged/digest-promotion-{n}.md`).

On approval: file the proposed record, then append `→ #{n}` to each promoted entry **line** in the
container — markers and counting are strictly per-line, never per-comment, since one comment can
hold many entries from one run.

Individual entries — including solitary ones that never cluster — remain manually promotable or
re-filable at any time; the ≥3 threshold gates only this sweep's own automatic *proposals*, never a
human's ability to act on a single entry directly.

### Expiry

Un-promoted entry lines older than 90 days (parsed from each entry's `{provenance}` — a run-id's
ISO timestamp, or the comment/edit timestamp when provenance names a skill instead of a run) roll
into one closing summary comment naming every expired entry; those lines then move out of the
active set. On `github-issues`, the summary comment is the durable record (the entries themselves
stay in the closed comment's history — nothing is deleted). On `local-files`, the entry lines
physically move to an `## Archived {YYYY-MM-DD}` section at the bottom of `specs/digest.md`.

When the digest issue reaches 100 comments (`github-issues` only — a file has no analogous limit),
close it with a summary comment, then bootstrap a fresh digest issue: the `digest` label and the
pinned-issue role move to the new issue (unpin the old, pin the new), and the closed issue's
comment history remains the archive for everything it held.
```

- [ ] **Step 2: Add the trigger paragraph + table row to `plugin/skills/tidy/SKILL.md`**

Immediately after the existing paragraph that begins `**Step 4.7's four backstop scans are
likewise a separate file.**` (in the `## Steps 1-4.95 and 5.5: Scan Everything` section), insert:

```markdown

**The digest sweep is likewise a separate file.** Its rules live in `digest-sweep.md`, not in
`scan-procedures.md`. Read `digest-sweep.md` and inline it **whole** into the relevant agent's
prompt whenever this sweep is in scope — see that file's own header for the no-op condition and
the three procedures (bootstrap-race repair, cluster promotion, expiry).
```

Then, in the Scan Steps table (the `| Step | Data source | Output prefix |` table), add a new row
after the existing `5.5` row:

```markdown
| 5.6 (rules in `digest-sweep.md`) | The `digest`-labeled rolling issue (`github-issues`) or `specs/digest.md` (`local-files`) | `[digest]` |
```

- [ ] **Step 3: Measure both files**

Run: `wc -c plugin/skills/tidy/SKILL.md plugin/skills/tidy/digest-sweep.md`
Expected: `SKILL.md` stays ≤ 40,960; `digest-sweep.md` is well under the ceiling.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/tidy/digest-sweep.md plugin/skills/tidy/SKILL.md
git commit -m "Add the /tidy digest sweep (promotion + expiry)"
```

---

## Task 5: Materiality floor conformance test suite

**Files:**
- Create: `tests/materiality-floor-conformance.test.js`

**Interfaces:**
- Consumes: Task 1's `plugin/skills/_shared/materiality-floor.md`, Task 2's amended `plugin/skills/_shared/deferral-gate.md`, Task 4's `plugin/skills/tidy/digest-sweep.md`.
- Produces: nothing consumed elsewhere — this is the terminal pinning suite for this sub-issue.

- [ ] **Step 1: Write the test file**

```js
// tests/materiality-floor-conformance.test.js
// Pins plugin/skills/_shared/materiality-floor.md's contract elements, its citation from
// deferral-gate.md, and the /tidy digest sweep's promotion/expiry procedures. No local-files
// runtime test double exists yet for the container branch — that branch is pinned as prose only
// until a local-files consumer lands.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const FLOOR = read('plugin/skills/_shared/materiality-floor.md');
const GATE = read('plugin/skills/_shared/deferral-gate.md');
const SWEEP = read('plugin/skills/tidy/digest-sweep.md');
const TIDY_SKILL = read('plugin/skills/tidy/SKILL.md');

test('materiality-floor.md states the floor definition (all three low axes, fail-toward-filing)', () => {
  assert.ok(/size:low/i.test(FLOOR));
  assert.ok(/priority:low/i.test(FLOOR));
  assert.ok(/risk:low/i.test(FLOOR));
  assert.ok(FLOOR.includes('fails toward filing'));
});

test('materiality-floor.md states both overrides', () => {
  assert.ok(/tangential/i.test(FLOOR));
  assert.ok(FLOOR.toLowerCase().includes('out of this contract') || FLOOR.toLowerCase().includes('/capture'));
});

test('materiality-floor.md states the entry format line', () => {
  assert.ok(FLOOR.includes('- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}'));
});

test('materiality-floor.md\'s audit line uses the literal AUTO status and no invented status word', () => {
  assert.match(FLOOR, /^AUTO \{time\} — materiality-floor:/m);
  assert.ok(!/^DIGEST /m.test(FLOOR));
});

test('materiality-floor.md states both container shapes', () => {
  assert.ok(FLOOR.includes('work-backend: github-issues'));
  assert.ok(FLOOR.includes('work-backend: local-files'));
  assert.ok(FLOOR.includes('specs/digest.md'));
});

test('materiality-floor.md states expiry is a logged retention decision, not skipped work', () => {
  assert.ok(FLOOR.toLowerCase().includes('not skipped work') || FLOOR.includes('## Expiry is not skipped work'));
});

test('deferral-gate.md\'s bundling bullet cites materiality-floor.md by literal path', () => {
  assert.ok(GATE.includes('_shared/materiality-floor.md'));
});

test('digest-sweep.md states the cluster-promotion threshold, per-line marker, and always-promotable rule', () => {
  assert.ok(SWEEP.includes('3 or more'));
  assert.ok(SWEEP.includes('→ #{n}'));
  assert.ok(SWEEP.toLowerCase().includes('remain manually promotable or re-filable at any time'));
});

test('digest-sweep.md states the expiry age, the 100-comment rollover, and the no-digest/two-digest edges', () => {
  assert.ok(SWEEP.includes('90 days'));
  assert.ok(SWEEP.includes('100 comments'));
  assert.ok(SWEEP.toLowerCase().includes('no-ops silently'));
  assert.ok(SWEEP.toLowerCase().includes('bootstrap-race repair'));
});

test('tidy/SKILL.md cites digest-sweep.md instead of restating its procedures', () => {
  assert.ok(TIDY_SKILL.includes('digest-sweep.md'));
  assert.ok(!TIDY_SKILL.includes('90 days'));
});

test('tidy/SKILL.md stays within its context-cost ceiling', () => {
  const bytes = Buffer.byteLength(TIDY_SKILL, 'utf8');
  assert.ok(bytes <= 40960, `tidy/SKILL.md is ${bytes} bytes, over the 40960 ceiling`);
});
```

- [ ] **Step 2: Run the new suite**

Run: `node --test tests/materiality-floor-conformance.test.js`
Expected: all tests pass.

- [ ] **Step 3: Verify discrimination (TDD)**

Temporarily comment out the `size:low` line in `materiality-floor.md`, re-run the suite, confirm
the "states the floor definition" test fails, then restore the line. Repeat once more for the
`digest-sweep.md`'s `3 or more` cluster-promotion threshold to confirm that assertion also
discriminates.

- [ ] **Step 4: Commit**

```bash
git add tests/materiality-floor-conformance.test.js
git commit -m "Add materiality-floor conformance suite"
```

---

## Task 6: Label bootstrap + skill-graph edges

**Files:**
- Modify: `plugin/skills/_shared/label-bootstrap.md` (add the `digest` label row; bump the stated bootstrap version)
- Modify: `docs/skill-graph.md` (two new rows in the `## tidy` table)

**Interfaces:**
- Consumes: Task 1's `_shared/materiality-floor.md`.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Add the `digest` label row**

In `plugin/skills/_shared/label-bootstrap.md`'s `## Canonical LABELS_JSON` fenced array, after the
last row (`["priority:low", "Priority: dispatch picks last among prioritized records"]`), add a
comma and:

```js
  ["digest",            "Container: rolling digest for below-floor deferred findings (see _shared/materiality-floor.md)"]
```

- [ ] **Step 2: Bump the stated bootstrap version**

In the same file, replace:

```markdown
`{LABEL_BOOTSTRAP_VERSION}` is the literal integer below — **current value: `4`**. Bump it (and
```

with:

```markdown
`{LABEL_BOOTSTRAP_VERSION}` is the literal integer below — **current value: `5`**. Bump it (and
```

- [ ] **Step 3: Verify the JSON still parses and the description fits the cap**

Run: `node -e "const fs=require('fs'); const md=fs.readFileSync('plugin/skills/_shared/label-bootstrap.md','utf8'); const m=md.match(/## Canonical LABELS_JSON[\s\S]*?\`\`\`js\n([\s\S]*?)\n\`\`\`/); const rows=JSON.parse(m[1]); const row=rows.find(([n])=>n==='digest'); if(!row) throw new Error('digest row missing'); if(row[1].length>100) throw new Error('description over 100 chars: '+row[1].length); console.log('OK', row[1].length);"`
Expected: prints `OK <length ≤100>` with no error.

- [ ] **Step 4: Add the two skill-graph.md edges**

In `docs/skill-graph.md`'s `## tidy` table, immediately after the existing
`_shared/reverify-before-write.md` row (the last row in that table, right before the `## visual-review`
heading), add two new rows:

```markdown
| `_shared/materiality-floor.md` | `tidy/digest-sweep.md` (Step 5.6) is the contract's first and, until #1262 lands, only consumer — it manages the digest container's full lifecycle (bootstrap-race repair, cluster promotion, expiry). |
| `_shared/deferral-gate.md` | `_shared/materiality-floor.md` applies strictly after this gate — an item reaching the digest already carries a valid `Defer-reason:` from here; the floor never decides whether to fix. |
```

- [ ] **Step 5: Verify no skill file restates the floor's own definition**

Run: `grep -rn "size:low.*priority:low.*risk:low" plugin/skills/ | grep -v "_shared/materiality-floor.md" | grep -v "tests/"`
Expected: no output (empty) — confirms AC7's "no skill file restates them" requirement extends
correctly to this sub-issue's own new files (the full three-axis phrase appears only in
`materiality-floor.md`).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/_shared/label-bootstrap.md docs/skill-graph.md
git commit -m "Bootstrap the digest label and add materiality-floor skill-graph edges"
```

---

## Final verification (after all 6 tasks)

- [ ] Run the full suite: `npm test`
- [ ] Confirm every Acceptance Criterion in the spec:
  1. `grep -i "size:low" plugin/skills/_shared/materiality-floor.md` and `grep -i "tangential" plugin/skills/_shared/materiality-floor.md` both match (Task 1).
  2. `node --test tests/materiality-floor-conformance.test.js` passes (Task 5); reverting the floor's `size:low` line makes it fail (verified in Task 5 Step 3).
  3. `node --test tests/deferral-gate-conformance.test.js` passes with the amended bullet citing `materiality-floor.md` by path (Task 2).
  4. CLAUDE.md's bullet names the digest as a third outcome, cites `_shared/materiality-floor.md`, adds at most 2 lines (Task 3).
  5. The digest sweep states the ≥3-line threshold, the per-line `→ #N` marker, the always-promotable rule, the 90-day/100-comment/no-digest/two-digest edges; `wc -c plugin/skills/tidy/SKILL.md` ≤ 40,960 (Task 4, Task 5 Step 2 pins the first half, Task 4 Step 3 measures the ceiling).
  6. The audit line uses the literal `AUTO` status; no invented status word at a log-template line start (Task 1, pinned by Task 5).
  7. `docs/skill-graph.md` carries both new edges; no skill file restates them (Task 6).
  8. `npm test` passes (this step).
