# Record #576 — Exclude bot:in-progress Records from Refine's Grant Worklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:backlog refine`'s Step 1 worklist split partition `bot:in-progress` records out of the grant-check population, with a visible one-line report narration when the count is non-zero.

**Architecture:** One prose/script edit to `skills/backlog/refine-mode.md`: the embedded `node -e` worklist script gains a three-way split (`fresh` / `blocked` / `inProgress`), the sentence describing the split is updated, and Step 3 gains a report-narration rule for the excluded in-flight count. `grant-mode.md:71` already excludes `bot.inProgress` ("not already claimed") — this brings refine's worklist to parity. No library change: `parseRecordFacets` already exposes `facets.bot.inProgress`.

**Tech Stack:** Markdown skill prose with an embedded Node one-liner; `node --test` conformance suites.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T113600-spec-576-575/spec-576/work/576-spec.md`

## Global Constraints

- Scope the exclusion to the grant-check worklist only — the priority/Related fetch, trust table (`--state all`), priority sweep, and dependency-mismatch detection keep reading their wider populations untouched.
- `bot:blocked` handling must be byte-equivalent in behavior: blocked records still bypass the budget and lane as `re-authorize (bot:blocked)` rows.
- The narration line renders only when the excluded count is non-zero — never a "0 in flight" line.
- Skill-reference form: any new instruction text referencing another skill uses the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md Cross-references rule).

---

### Task 1: Three-way worklist split + narration rule in refine-mode.md

**Files:**
- Modify: `skills/backlog/refine-mode.md:52-59` (worklist script + split-description sentence)
- Modify: `skills/backlog/refine-mode.md:127-129` (Step 3 report lines — add the in-flight narration rule)

**Interfaces:**
- Consumes: `parseRecordFacets(labels)` from `bin/lib/issues/record.js` — already returns `facets.bot.inProgress: boolean` (read today by `/claude-tweaks:dispatch`'s skip rule and `grant-mode.md:71`).
- Produces: `/tmp/backlog-refine-worklist.json` shape `{ fresh, blocked, inProgress }` — Step 3's budget script continues to read only `data.fresh` and `data.blocked`; the new `inProgress` key is additive and read only by the narration rule.

- [ ] **Step 1: Edit the worklist script (three-way split)**

In `skills/backlog/refine-mode.md`, replace:

```js
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  console.log(JSON.stringify({ fresh, blocked }));
```

with:

```js
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  const inProgress = worklist.filter((r) => !r.facets.bot.blocked && r.facets.bot.inProgress);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress);
  console.log(JSON.stringify({ fresh, blocked, inProgress }));
```

(`bot:blocked` takes precedence when a record somehow carries both flags — a blocked record stays a re-authorization candidate; the `inProgress` lane holds only actively-claimed, non-blocked records.)

- [ ] **Step 2: Update the split-description sentence**

Immediately below the script (currently line 59), replace:

```markdown
When `--origin <name>` was passed (see `SKILL.md`'s Input), export `BACKLOG_ORIGIN=<name>` before running the script above; omitted, it's unset and the script runs unfiltered. This mirrors the retired `/claude-tweaks:triage` skill's old Step 1 exactly, including the origin-agnostic default and the fresh/blocked split (`blocked` = hit the retry ceiling, `bot:blocked`, a re-authorization candidate).
```

with:

```markdown
When `--origin <name>` was passed (see `SKILL.md`'s Input), export `BACKLOG_ORIGIN=<name>` before running the script above; omitted, it's unset and the script runs unfiltered. The origin-agnostic default and the `blocked` lane mirror the retired `/claude-tweaks:triage` skill's old Step 1; the split is three-way: `blocked` = hit the retry ceiling (`bot:blocked`), a re-authorization candidate; `inProgress` = actively claimed by a live run (`bot:in-progress`) — excluded from grant checks entirely, mirroring `grant-mode.md`'s own not-already-claimed exclusion, because a grant-check dispatch is wasted on a record mid-build and a grant written mid-run changes nothing the executing pipeline reads; `fresh` = neither, the only lane grant checks run over.
```

- [ ] **Step 3: Add the in-flight narration rule to Step 3's report lines**

In the same file, immediately after the paragraph (currently lines 127-129):

```markdown
If `remaining > 0` (from the `fresh` budget slice), state it plainly in the report: "`{remaining}`
more ready records awaiting grant-check exist beyond this run's `--budget {N}` — re-run to
continue."
```

insert this new paragraph:

```markdown
When Step 1's worklist split excluded in-progress records (`inProgress` non-empty in
`/tmp/backlog-refine-worklist.json`), state that once in the report too: "`{n}` in flight —
excluded from grant checks; a grant changes nothing mid-run." Render nothing when the count is
zero — the exclusion line exists so the drop is visible, never as a permanent fixture.
```

- [ ] **Step 4: Mechanically validate the new script shape**

Extract the edited script body into a throwaway run with a synthetic fixture (from the worktree root):

```bash
node -e "
  const rows = [
    { n: 1, facets: { grants: { build: false, merge: false }, bot: { blocked: false, inProgress: false } } },
    { n: 2, facets: { grants: { build: false, merge: false }, bot: { blocked: true,  inProgress: false } } },
    { n: 3, facets: { grants: { build: false, merge: false }, bot: { blocked: false, inProgress: true  } } },
    { n: 4, facets: { grants: { build: true,  merge: false }, bot: { blocked: false, inProgress: true  } } },
  ];
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  const inProgress = worklist.filter((r) => !r.facets.bot.blocked && r.facets.bot.inProgress);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress);
  console.log(JSON.stringify({ fresh: fresh.map(r=>r.n), blocked: blocked.map(r=>r.n), inProgress: inProgress.map(r=>r.n) }));
"
```

Expected output: `{"fresh":[1],"blocked":[2],"inProgress":[3]}` (record 4 is granted, so it never reaches the worklist).

- [ ] **Step 5: Verify the edits landed and nothing else references the two-key shape**

```bash
grep -c "inProgress" skills/backlog/refine-mode.md
```
Expected: 4 or more (script filter line, JSON emit line, split-description sentence, narration paragraph).

```bash
grep -rn "backlog-refine-worklist" skills/ | grep -v refine-mode.md
```
Expected: no output (no other file reads the worklist JSON, so the added key breaks no reader).

```bash
grep -n "fresh/blocked split" skills/backlog/refine-mode.md
```
Expected: no output (the retired two-way description is fully replaced).

- [ ] **Step 6: Commit**

```bash
git add skills/backlog/refine-mode.md
git commit -m "Exclude bot:in-progress records from refine's grant worklist — refs #576"
```
