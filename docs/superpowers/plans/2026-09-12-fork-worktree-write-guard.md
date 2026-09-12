# Fork/Worktree Write-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every narrow/read-only/research-scoped subagent dispatch (fork or otherwise) a structurally-enforced way to avoid writing into the dispatching session's live shared worktree, replacing the prose-only "please don't write files" instruction that has already failed five recorded times (`docs/incident-log.md`'s IL-07).

**Architecture:** Empirical probing during this build (three throwaway dispatches from inside this exact worktree) established two facts the filed issue's own framing got wrong or left unverified: (1) an ordinary, non-fork Task/Agent dispatch *also* inherits the dispatcher's live worktree cwd by default — the hazard is not fork-specific; (2) passing `isolation: "worktree"` on the Agent tool call *does* root the dispatched agent in a genuinely separate, harness-created worktree (`.claude/worktrees/agent-{id}`), confirmed by direct `pwd`/`git rev-parse --show-toplevel` probes. This is the structural mechanism the issue's Deliverable 1/2 asked for — it already exists in the harness; the gap is that no claude-tweaks guidance told a dispatcher to use it. The fix is therefore a documentation change: extract a new shared contract (`_shared/fork-worktree-isolation.md`) stating the mandate and the empirical evidence, cite it from `_shared/subagent-output-contract.md` (which is already within ~400 bytes of its 40 KB ceiling — the new content cannot live there directly), from `docs/donts.md`'s existing fork rule, and from `docs/incident-log.md`'s IL-07 entry (recording this as the resolution to a hazard that entry previously called unfixable at the plugin level), and register the new file's edge in `docs/skill-graph.md` per the shared-contract-extraction skill's convention for a contract-owned file with no direct skill invoker.

**Tech Stack:** Markdown prose (plugin skill contracts + project docs); `node --test` conformance suite pinning the new citations and the byte ceiling.

**Spec:** GitHub issue #2278 (materialized at `.claude-tweaks/pipelines/2026-09-12T130744-record-2278/work/2278-spec.md`).

## Global Constraints

- `plugin/skills/_shared/subagent-output-contract.md` must stay at or under 40,960 bytes (`CEILING_BYTES` in `plugin/bin/lib/skill-audit/context-cost.js`) after edits — it is currently 40,573 bytes (387 bytes of headroom), so any addition there must be net byte-negative or route around it.
- No commit may use `Fixes #2278`/`Closes #2278` — issues close only via merge (`_shared/issue-claims.md`'s Close-via-merge section); use `refs #2278` in intermediate commit messages per this dispatch's own instruction.
- Every new cross-skill relationship is stated once in `docs/skill-graph.md` (CLAUDE.md's Cross-references rule) — never restated inside a `SKILL.md`.
- Follow `shared-contract-extraction`'s convention: the new `_shared/*.md` file gets one `docs/skill-graph.md` row (filed under the section for the reader it addresses), and no `docs/plugin-structure.md` edit (that doc's `_shared/*.md` row is a curated directory pointer, not a per-file table).

---

### Task 1: Create the new shared contract file

**Files:**
- Create: `plugin/skills/_shared/fork-worktree-isolation.md`
- Test: `tests/fork-worktree-isolation-conformance.test.js`

**Interfaces:**
- Consumes: nothing (new standalone contract file).
- Produces: a file other tasks cite by path (`_shared/fork-worktree-isolation.md`) and by two literal strings later tasks and the test assert on: the section heading `## Mandate: isolation: "worktree" for narrow/read-only dispatch` and the literal `isolation: "worktree"` (the Agent-tool parameter name every citer must spell identically).

- [ ] **Step 1: Write the file**

```markdown
# Fork / Worktree Write-Guard — Shared Contract

Canonical home for the write-guard mandate `_shared/subagent-output-contract.md`'s Input
Discipline section points to, and the resolution `docs/incident-log.md`'s IL-07 entry
records for its fifth recurrence (issue #2278). Read by anyone dispatching a subagent
(fork or otherwise) whose scope is narrow, read-only, or research-only and whose scope
must not risk landing a write in the dispatcher's own live worktree.

## The corrected hazard

Issue #2278 (and IL-07's four prior recurrences) framed this as a `fork`-specific hazard:
"forks share the parent's cwd (not just conversation context)." That framing under-states
the problem. Three throwaway diagnostic dispatches run from inside a live pipeline
worktree during #2278's own build (2026-09-12) established:

1. An ordinary, non-fork `Task`/`Agent` dispatch with no `isolation` argument **also**
   resolves `pwd` and `git rev-parse --show-toplevel` to the dispatcher's own live
   worktree — identical to a fork's behavior. The hazard is dispatch-shape-general, not
   fork-specific: any subagent dispatched with no isolation shares the parent's worktree.
2. Passing `isolation: "worktree"` on the same `Agent` tool call roots the dispatched
   agent in a genuinely separate, freshly created worktree
   (`.claude/worktrees/agent-{agent-id}`) — confirmed by the identical `pwd`/
   `git rev-parse --show-toplevel` probe returning a different path with a different
   git toplevel. This is a harness-level filesystem boundary, not a prompt convention:
   nothing the dispatched agent does — malicious, confused, or merely scope-creeping —
   can land a write in the dispatcher's worktree once its own cwd is rooted elsewhere.
3. A `fork` dispatched with `isolation: "worktree"` and an explicit "ignore all prior
   context, this is a one-shot diagnostic probe" instruction still misidentified its own
   role — it echoed back prose resembling the dispatcher's own unrelated in-progress
   narration instead of running the two requested shell commands, burning several tool
   calls in the process. This reproduces IL-07's third and fourth recorded failure modes
   (a fork ignoring an explicit "do NOT apply any changes yourself, read-only analysis"
   instruction) a fifth time, live, during the investigation that produced this file. It
   left the isolation-compatibility question for `fork` specifically **unresolved** —
   whether `isolation: "worktree"` actually redirects a fork's own cwd was not confirmed
   either way, because the fork never executed the probe commands at all.

## Mandate: isolation: "worktree" for narrow/read-only dispatch

Any dispatch — fork or fresh agent — whose scope is narrow, read-only, or research-only,
and which must not risk a write landing in the dispatcher's own live shared worktree,
**must** pass `isolation: "worktree"` on the `Agent` tool call. This is the structural
write-guard Deliverable 1 of issue #2278 asked for: it already exists in the harness as a
documented `Agent`-tool parameter (empirical finding 2 above), and the fix this plugin
owns is requiring its use, not inventing new infrastructure. It also directly delivers
Deliverable 2's "default to a throwaway copy of the worktree" — `isolation: "worktree"`
*is* that throwaway copy, automatically cleaned up by the harness when the dispatched
agent makes no changes (per the `Agent` tool's own documented behavior).

**Never rely on `isolation: "worktree"` alone to make `fork` safe for narrow-scope work.**
Given finding 3 above, prefer a fresh (non-fork) agent type for any narrow/read-only/
research-scoped dispatch regardless of isolation — `fork`'s independent inherited-history
identity-confusion hazard is not addressed by filesystem isolation, since a confused fork
that never runs the intended commands at all is not made safe by rooting it in a private
worktree it never uses correctly in the first place. `_shared/subagent-output-contract.md`'s
existing "prohibited for a clean-room fan-out dispatch" rule already forces a fresh agent
for parallel fan-out work; this file extends the same preference to narrow *solo*
dispatches, which that rule's own scope (fan-out only) did not previously cover.

**Prose alone is not the guard.** "Research only, do not modify files" in a dispatch
prompt is advisory context the agent may ignore (IL-07, five recorded instances now
including finding 3 above) — it is not what makes this mandate structural. What makes it
structural is that `isolation: "worktree"` changes *where the dispatched agent's writes
physically land*, independent of whether the agent complies with anything in its prompt.
Keep the scope-limiting prose too (Input Discipline's existing "Constraints that prevent
overreach" — e.g. "Read-only") as a second layer, but never as the only layer.

## What this does not resolve

Whether `isolation: "worktree"` actually redirects a `fork`'s own cwd (as opposed to a
fresh agent's) is still empirically unconfirmed — finding 3's fork dispatch never reached
the point of running the probe. Given the mandate above already routes narrow-scope work
to a fresh (non-fork) agent regardless, closing this specific question is not required to
land the fix; it is left as an open question for whoever next needs to dispatch a fork
under isolation, rather than blocking this record on a fork-specific probe.

## Consumers

| Skill / file | Role |
|---|---|
| `_shared/subagent-output-contract.md` | Input Discipline section's fork-prohibition clause points here for the full rationale and the isolation mandate — kept as a one-line pointer there for byte-headroom reasons (this file's own byte ceiling is documented in `docs/plugin-structure.md`'s `_shared/*.md` note). |
| `docs/donts.md` | The existing fork Don't rule (`[IL-07]`) cites this file's mandate as the structural remedy, alongside its existing "use a fresh non-fork agent" advice. |
| `docs/incident-log.md` | IL-07's entry records this file as the fifth recurrence's resolution — the first of the five that lands a structural (not purely prose) mitigation. |
```

- [ ] **Step 2: Verify the file exists and stays a reasonable size**

Run: `wc -c plugin/skills/_shared/fork-worktree-isolation.md`
Expected: a byte count under 8000 (well clear of the 40 KB `_shared` ceiling; no near-ceiling risk for a brand-new file).

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/fork-worktree-isolation.md
git commit -m "$(cat <<'EOF'
Add fork/worktree write-guard shared contract

New _shared/fork-worktree-isolation.md documents the empirically-verified
structural mitigation for issue #2278's hazard class: a narrow/read-only
dispatch must pass isolation: "worktree" so its writes cannot land in the
dispatcher's own live shared worktree, regardless of prompt compliance.
Corrects the issue's own framing that this was fork-specific -- an
ordinary non-isolated Task dispatch shares the same hazard.

refs #2278
EOF
)"
```

---

### Task 2: Point the existing contract's fork clause at the new file (byte-neutral-or-negative)

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md:33`
- Test: extend `tests/fork-worktree-isolation-conformance.test.js`

**Interfaces:**
- Consumes: `_shared/fork-worktree-isolation.md` (Task 1) — cited by exact path.
- Produces: nothing new; this task only tightens existing prose.

- [ ] **Step 1: Measure current size**

Run: `wc -c plugin/skills/_shared/subagent-output-contract.md`
Expected: 40573 (the file's size as of this plan's authoring — re-measure if a concurrent merge has changed it, per the shared-contract-extraction skill's "ceiling check is a merge-time check too" gotcha).

- [ ] **Step 2: Replace the fork-prohibition clause with a shorter pointer**

In `plugin/skills/_shared/subagent-output-contract.md`, replace the paragraph at line 33 (starting `**`subagent_type: "fork"` is prohibited for a clean-room fan-out dispatch.**`) with:

```markdown
**`subagent_type: "fork"` is prohibited for a clean-room fan-out dispatch, and should be avoided for any narrow/read-only/research-scoped solo dispatch too** — full rationale, the empirically-verified structural mitigation, and the `isolation: "worktree"` mandate: `_shared/fork-worktree-isolation.md`. See "Session-inherit protection" below for the related, narrower model-override exemption this restriction is not.
```

- [ ] **Step 3: Verify the file dropped in size and stayed under the ceiling**

Run: `wc -c plugin/skills/_shared/subagent-output-contract.md`
Expected: a byte count strictly less than 40573 and strictly less than 40960.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/subagent-output-contract.md
git commit -m "$(cat <<'EOF'
Point subagent-output-contract's fork clause at the new isolation contract

Shrinks the existing fork-prohibition paragraph to a pointer, keeping the
file under its 40 KB ceiling, and widens the prohibition's spirit to any
narrow solo dispatch (not just clean-room fan-out) per the new mandate.

refs #2278
EOF
)"
```

---

### Task 3: Update `docs/donts.md`'s fork rule and `docs/incident-log.md`'s IL-07 entry

**Files:**
- Modify: `docs/donts.md:30`
- Modify: `docs/incident-log.md` (IL-07 entry — append, do not rewrite prior recurrences)
- Test: extend `tests/fork-worktree-isolation-conformance.test.js`

**Interfaces:**
- Consumes: `_shared/fork-worktree-isolation.md` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Read the current IL-07 entry in full**

Run: `grep -n "IL-07" docs/incident-log.md`
Note the line range of the full entry (it spans multiple paragraphs across its four recorded recurrences) before editing, so the append lands after the existing text rather than splitting it.

- [ ] **Step 2: Update `docs/donts.md` line 30**

Replace:
```
- Don't dispatch `subagent_type: "fork"` for a narrow task, and don't trust its own narrative afterward — a fork inherits the whole parent conversation and acts well beyond your instruction, so use a fresh non-fork agent instead; its reports err in both directions, so verify `tool_uses`/duration and real git/`gh` state `[IL-07]`
```
With:
```
- Don't dispatch `subagent_type: "fork"` for a narrow task, and don't trust its own narrative afterward — a fork inherits the whole parent conversation and acts well beyond your instruction, so use a fresh non-fork agent instead; its reports err in both directions, so verify `tool_uses`/duration and real git/`gh` state. For any such dispatch that must not risk writing into the dispatcher's own live worktree, pass `isolation: "worktree"` too — the structural mitigation, not just the "use a fresh agent" advice (`_shared/fork-worktree-isolation.md`) `[IL-07]`
```

- [ ] **Step 3: Append a new paragraph to the IL-07 entry in `docs/incident-log.md`**

Immediately after the existing IL-07 entry's last paragraph (the one this plan's Step 1 located), add:

```markdown

**Fifth recurrence (#2278, 2026-09-12) and resolution.** #2278 asked, again, for a
*structural* (not prose) write-guard, this time as an explicit acceptance-criteria'd
deliverable rather than an incident writeup. Investigating it corrected this entry's own
prior framing: three throwaway diagnostic dispatches from inside a live pipeline worktree
showed the hazard is not fork-specific — an ordinary, non-isolated `Task`/`Agent`
dispatch shares the dispatcher's live worktree cwd identically to a fork — and that
passing `isolation: "worktree"` on the dispatch call *does* root the dispatched agent in
a genuinely separate, harness-created worktree, confirmed by direct `pwd`/
`git rev-parse --show-toplevel` probes returning distinct paths. This is the first of
this entry's five recurrences to land an actual structural mitigation rather than
stronger prose: see `_shared/fork-worktree-isolation.md` for the full mandate. A fourth
throwaway dispatch (a `fork` with `isolation: "worktree"` and an explicit
ignore-prior-context instruction) reproduced this entry's prose-non-compliance hazard a
fifth time — the fork echoed back unrelated narration instead of running the requested
probe — leaving open whether isolation redirects a fork's own cwd specifically; the
mandate sidesteps this by routing narrow-scope work to a fresh (non-fork) agent under
isolation regardless, rather than depending on fork's own compliance.
```

- [ ] **Step 4: Verify both files updated correctly**

Run: `grep -n "fork-worktree-isolation" docs/donts.md docs/incident-log.md`
Expected: at least one match in each file.

- [ ] **Step 5: Commit**

```bash
git add docs/donts.md docs/incident-log.md
git commit -m "$(cat <<'EOF'
Record #2278's fork write-guard resolution in IL-07 and donts.md

IL-07 previously concluded this hazard class had no plugin-level fix.
#2278's investigation found one (isolation: "worktree") and corrected the
entry's fork-specific framing; docs/donts.md's existing rule now points
at the structural mitigation instead of prose-only advice.

refs #2278
EOF
)"
```

---

### Task 4: Register the new file's edge in `docs/skill-graph.md`

**Files:**
- Modify: `docs/skill-graph.md` (add one row under the `dispatch` section, matching the existing `_shared/dispatch-waiting.md` row's precedent for a contract-owned file with no direct skill invoker)

**Interfaces:**
- Consumes: `_shared/fork-worktree-isolation.md` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the row**

In `docs/skill-graph.md`'s `## dispatch` section (immediately after the existing `_shared/dispatch-waiting.md` row), add:

```markdown
| `_shared/fork-worktree-isolation.md` | New contract (#2278) for the structural write-guard on narrow/read-only subagent dispatch: pass `isolation: "worktree"` so a dispatched agent's writes cannot land in the dispatcher's own live worktree. Cited from `_shared/subagent-output-contract.md`'s fork clause, `docs/donts.md`'s fork rule, and `docs/incident-log.md`'s IL-07 entry — no skill invokes this file directly, filed under `dispatch` for the same "no section for contract-owned files" reason as the row above. |
```

- [ ] **Step 2: Verify**

Run: `grep -n "fork-worktree-isolation" docs/skill-graph.md`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add docs/skill-graph.md
git commit -m "$(cat <<'EOF'
Register fork-worktree-isolation.md in skill-graph

refs #2278
EOF
)"
```

---

### Task 5: Conformance test

**Files:**
- Create: `tests/fork-worktree-isolation-conformance.test.js`

**Interfaces:**
- Consumes: every file touched in Tasks 1-4, by path.
- Produces: nothing consumed further.

- [ ] **Step 1: Write the failing test**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NEW_CONTRACT = path.join(ROOT, 'plugin/skills/_shared/fork-worktree-isolation.md');
const SUBAGENT_CONTRACT = path.join(ROOT, 'plugin/skills/_shared/subagent-output-contract.md');
const DONTS = path.join(ROOT, 'docs/donts.md');
const INCIDENT_LOG = path.join(ROOT, 'docs/incident-log.md');
const SKILL_GRAPH = path.join(ROOT, 'docs/skill-graph.md');

// Whitespace-collapsed read, per skill-prose-conformance-tests' control-scan convention --
// a hard-wrapped literal must not silently defeat these assertions.
function collapsed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s+/g, ' ');
}

test('fork-worktree-isolation.md exists and carries the isolation mandate', () => {
  const text = collapsed(NEW_CONTRACT);
  assert.match(text, /Mandate: isolation: "worktree" for narrow\/read-only dispatch/);
  assert.match(text, /isolation: "worktree"/);
});

test('fork-worktree-isolation.md stays well clear of the _shared ceiling', () => {
  const bytes = fs.statSync(NEW_CONTRACT).size;
  assert.ok(bytes < 8000, `expected < 8000 bytes, got ${bytes}`);
});

test('subagent-output-contract.md cites the new file and stays under the 40 KB ceiling', () => {
  const text = collapsed(SUBAGENT_CONTRACT);
  assert.match(text, /_shared\/fork-worktree-isolation\.md/);
  const bytes = fs.statSync(SUBAGENT_CONTRACT).size;
  assert.ok(bytes <= 40960, `expected <= 40960 bytes (CEILING_BYTES), got ${bytes}`);
});

test('subagent-output-contract.md no longer restates the old fork clause verbatim', () => {
  const text = collapsed(SUBAGENT_CONTRACT);
  // The retired clause's own distinguishing sentence -- absence-checked per the
  // shared-contract-extraction skill's "absence assertions, whitespace-collapsed" rule.
  assert.doesNotMatch(
    text,
    /fork is for continuing a single prior agent with its own memory intact/
  );
});

test('docs/donts.md fork rule cites the isolation mandate', () => {
  const text = collapsed(DONTS);
  assert.match(text, /fork-worktree-isolation\.md/);
  assert.match(text, /isolation: "worktree"/);
});

test('docs/incident-log.md IL-07 entry records the fifth recurrence and resolution', () => {
  const text = collapsed(INCIDENT_LOG);
  assert.match(text, /Fifth recurrence \(#2278/);
  assert.match(text, /fork-worktree-isolation\.md/);
});

test('docs/skill-graph.md registers the new file exactly once', () => {
  const text = fs.readFileSync(SKILL_GRAPH, 'utf8');
  const matches = text.match(/_shared\/fork-worktree-isolation\.md/g) || [];
  assert.equal(matches.length, 1, `expected exactly one row, found ${matches.length}`);
});
```

- [ ] **Step 2: Run it to confirm it fails before Tasks 1-4 land (skip if run after)**

Run: `node --test tests/fork-worktree-isolation-conformance.test.js`
Expected: FAIL on every assertion if run against a pre-Task-1 tree; PASS if run after Tasks 1-4 (this task is written last in the plan but its assertions describe the end state — run it now as the final verification, not as a pre-implementation red step, since Tasks 1-4 already landed real content before this test file exists).

- [ ] **Step 3: Run it against the actual post-edit tree and confirm it passes**

Run: `node --test tests/fork-worktree-isolation-conformance.test.js`
Expected: PASS (7 tests, 0 failures).

- [ ] **Step 4: Commit**

```bash
git add tests/fork-worktree-isolation-conformance.test.js
git commit -m "$(cat <<'EOF'
Add conformance test for the fork/worktree write-guard contract

Pins: new file exists with the isolation mandate; subagent-output-contract
cites it and stays under its byte ceiling and no longer restates the
retired fork clause; docs/donts.md and docs/incident-log.md cite the
mandate; docs/skill-graph.md carries exactly one registration row.

refs #2278
EOF
)"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, no new failures relative to the pre-existing baseline (a failure count that varies run-to-run tracks machine load per CLAUDE.md — re-run only the affected file(s) in isolation before concluding anything is broken).

- [ ] **Step 2: Confirm no other test suite already pinned the retired fork-clause wording**

Run: `grep -rln "fork is for continuing a single prior agent with its own memory intact" tests/`
Expected: no output (nothing else pinned the exact retired sentence; if something does, that suite needs its own fix as part of this same change, not deferred).
