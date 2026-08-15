# Move Claim Acquisition Into Flow Pre-flight (Step 2.8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move claim acquisition off `/claude-tweaks:dispatch` Step 4 and into a new `/claude-tweaks:flow` pre-flight substep (Step 2.8), so a direct human `/flow #N` invocation claims the record through the same lock a dispatched run uses, and add a warn-tier file-overlap notice for direct runs that bypass dispatch's grouping.

**Architecture:** New `skills/flow/claim-targets.md` owns the claim procedure (mint-if-unset identity, group-claim-all-or-abort, skip-guard, contest failure output, file-overlap warning) — relocated from `skills/dispatch/claim-outcomes.md`, which is deleted. `flow/SKILL.md` gains one new Step 2.8 paragraph pointing at it, inserted between the existing 2.7 and Step 3. `dispatch/SKILL.md` Step 4 shrinks to mint-only (directory creation, no claim/label/comment); `--claim-only` retires everywhere it's referenced. `dispatch/task-prompt.md`'s two templates lose their "already-claimed" assumption and the first template gains a headless-firing marker so a Step 2.8 contest inside that Task call can self-report via the existing `headless-self-report.md` mechanism when (and only when) the firing was `next`-form.

**Tech Stack:** Markdown skill files (no runtime code changes to `bin/lib/issues/claims.js` or `bin/lib/issues/grouping.js` — both reused as-is), `node --test` for the pinning tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T100114-record-464/work/464-spec.md` — the plan argues from the spec; implementers should read both.

## Global Constraints

- Byte ceiling: every `SKILL.md`/sub-file must stay under 40,960 bytes (`bin/lib/skill-audit/tests/context-cost.test.js`). `dispatch/SKILL.md` is at 40,023B before this plan — Task 3 removes more than it adds, so this is a net shrink, not a risk. `flow/SKILL.md` is at 36,970B with room for one short paragraph.
- Claim identity is `basename($PIPELINE_RUN_DIR)` (per #463, already shipped) — never a separate `CLAIM_RUN_ID`/`RUN_ID` variable. Do not reintroduce one.
- `work-backend: local-files` has no claim infrastructure — Step 2.8 must skip cleanly, never error, on that backend.
- The skip-guard is ONE condition (`claim.runId === basename($PIPELINE_RUN_DIR)`), never three special-cased branches for "second Task call" vs "teardown-only wrap-up call" vs "human resume."
- Bare-mode dispatch selections beyond `dispatch-batch-size` are no longer claimed after this change (a deliberate behavior change per the spec's Gotchas — do not "fix" this back).
- `_shared/issue-claims.md`'s protocol (`classifyClaimBlob`'s five states, `claimPayload`/`releasePayload`, "The lock" procedure) is unchanged — only the call site moves. Do not touch `bin/lib/issues/claims.js` or `bin/lib/issues/grouping.js`.

---

### Task 1: Create `skills/flow/claim-targets.md` — the relocated claim procedure

**Files:**
- Create: `skills/flow/claim-targets.md`
- Read (reference only, no changes yet): `skills/dispatch/claim-outcomes.md`, `skills/_shared/issue-claims.md`, `skills/dispatch/mcp-transport.md` (the "Step 4" sections), `skills/flow/failure-cards.md`

**Interfaces:**
- Consumes: `_shared/issue-claims.md`'s `claimPayload`/`releasePayload`/`classifyClaimBlob` (via `bin/lib/issues/claims.js`, called exactly as the existing `gh` and MCP snippets in `claim-outcomes.md`/`mcp-transport.md` already call them — copy those invocations verbatim, do not redesign the payload shape). `bin/lib/issues/grouping.js`'s `groupByFileOverlap`.
- Produces: a self-contained procedure `flow/SKILL.md` Step 2.8 (Task 2) references by one sentence, the same pattern Step 2's 2.5/2.6/2.7 already reference `validation.md`. Defines the on-contest stop message shape and the `keep-going` downgrade-to-skip behavior that Task 2 renders inline (no separate failure-card template needed — this is a pre-flight stop, before any step has run, so `failure-cards.md`'s heavier "Completed"/"Actions Performed" shape doesn't fit; model the stop message on `validation.md`'s 2.7 design-doc rejection instead — a plain stop block, no worktree, no ledger).

- [ ] **Step 1: Write the file's header and skip-guard section**

Create `skills/flow/claim-targets.md` starting with:

```markdown
# Flow — Claim the Targets (Step 2.8)

Loaded by `/claude-tweaks:flow` Step 2.8, after materialize's shape gate (2.7) and before the
Config Manifesto (Step 3). Relocated from `skills/dispatch/claim-outcomes.md` — the posture
logic below is unchanged from that file; only the call site moved, per #463's identity
unification (claim identity is `basename($PIPELINE_RUN_DIR)`, never a separate variable).

## Skip-guard

Skip this step entirely (log nothing beyond a one-line note, proceed straight to Step 3) when
any of:

- The project's `work-backend` is `local-files` (per `_shared/work-record-config.md`'s config
  key table) — no claim infrastructure exists on that backend.
- The input has not yet resolved to a record reference (topic-name mode, before resolution —
  `SKILL.md`'s Input resolution case 2, still mid-search).
- **Every** named target's claim already shows `claim.runId === basename($PIPELINE_RUN_DIR)` —
  read each target's claim blob (`_shared/issue-claims.md`'s "Reading claim state") and compare.
  This one condition covers three distinct callers without branching on which one it is: a
  dispatched group's *second* Task call (already claimed by the first call's Step 2.8 run under
  the same minted directory), a failure-path `wrap-up`-only teardown call
  (`dispatch/two-call-gate.md` section 5's `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow
  {target} wrap-up`), and a human resuming a parked run
  (`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up` per
  `dispatch/SKILL.md`'s Reporting section). Do not special-case these three separately — they
  collapse to this one check by construction, since all three inherit the same
  `PIPELINE_RUN_DIR` the original claim was written under.

Otherwise, proceed below.
```

- [ ] **Step 2: Write the identity-resolution section (mint-if-unset)**

Append:

```markdown
## Resolve this run's identity

Step 2.8 runs *before* Step 3 (Config Manifesto) would otherwise create or adopt a run
directory, so the claim needs an identity to claim under before one necessarily exists yet:

- **`$PIPELINE_RUN_DIR` already set** (a dispatched run — `dispatch/SKILL.md` Step 4 mints the
  group's directory, mkdir-only, before either Task call) — use it as-is. Do not create
  anything; Step 3 will adopt this same directory per `steps-and-gates.md`'s
  Adopting-an-inherited-run-directory case 1 or 2.
- **`$PIPELINE_RUN_DIR` unset** (a direct human invocation) — mint it now, the same mkdir-only
  operation `dispatch/SKILL.md` Step 4 performs for a dispatched group: derive `$RUN_ROOT` via
  `_shared/pipeline-run-dir.md`'s Anchoring section (`git rev-parse --git-common-dir`, then its
  parent directory), create `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`
  (mkdir only — no `config.yml`, no `decisions.md`; Step 3 writes those when it adopts the now-set
  `PIPELINE_RUN_DIR` per case 2). Export it as `PIPELINE_RUN_DIR` for the rest of this pipeline
  invocation. `{spec-slug}` follows `manifesto.md`'s Path conventions (`spec-{N}` single, dash-joined
  multi, or a topic slug).

Either way, `basename($PIPELINE_RUN_DIR)` is this run's claim identity for every target below.
```

- [ ] **Step 3: Write the file-overlap warning section**

Append (before the claim procedure — the warning is informational and runs first so its note
appears above any contest stop the claim procedure below might produce):

```markdown
## File-overlap warning (never a gate)

Before claiming, check whether any named target file-overlaps an open, unclaimed record via
`groupByFileOverlap` (`bin/lib/issues/grouping.js`) run against the same open-queue read
`dispatch/SKILL.md` Step 2 uses (open + no `bot:*`, not filtered to `auto:build` here — this is
informational, not a selection). On a hit, surface one line per overlapping pair:

```
Note: #{target} overlaps open #{other} (untracked file overlap) — consider
/claude-tweaks:flow #{target},#{other} to claim and build them together.
```

Proceed with only the named target(s) regardless — this is a warning, never a gate, and never
auto-expands the human's explicitly named list. No new grouping computation is added to flow:
this reuses the existing module dispatch and `/help` already call; flow gains no queue-wide
knowledge beyond this one warning check.
```

- [ ] **Step 4: Write the claim procedure (group-claim-all-or-abort)**

Append — this is `claim-outcomes.md`'s posture logic, relocated, plus the group-claim-all
invariant that used to live implicitly in dispatch's group-computation (Step 2) + Step 4
sequencing, now made explicit here since flow claims what it's handed without dispatch's
pre-grouping in the direct-human-invocation case:

```markdown
## Claim every named target, all-or-abort

Per `_shared/issue-claims.md`'s group-claim rule: claim **all** named targets before proceeding
to Step 3 for any of them. For each target, read-classify-write exactly as
`_shared/issue-claims.md`'s "The lock" section describes (`gh` path shown; MCP path is the same
read-then-classify-then-write over the MCP tools — see `_shared/github-write-transport.md`):

\`\`\`bash
gh api "repos/{owner}/{repo}/contents/claims/issue-${ISSUE}.json?ref=claims-registry" -q '.content' | base64 -d > "/tmp/flow-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  const content = require('fs').readFileSync(process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" "/tmp/flow-claim-${ISSUE}.json"
\`\`\`

Branch on the classification, per `_shared/issue-claims.md`'s "Failure posture" table (not
restated here): `'absent'` → create-only write, succeeds. `'tombstone'`/`'stale'` → conditional
write (sha from the read), succeeds — a legitimate re-claim, not a contest. `'live'` → contested.
`'unreadable'` → fails closed to contested (treat as live).

**On success for a target:** bootstrap-then-add `bot:in-progress` (per `_shared/label-bootstrap.md`),
post the claim comment (`claimPayload`'s `commentBody`):

\`\`\`bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$(basename "$PIPELINE_RUN_DIR")" > /tmp/flow-claim-comment-${ISSUE}.md
gh issue edit "$ISSUE" --add-label bot:in-progress
gh issue comment "$ISSUE" --body-file /tmp/flow-claim-comment-${ISSUE}.md
\`\`\`

**On contest for a target** (rejected write, or classification `'live'`/`'unreadable'`):

- **Single-target run** — release nothing (nothing else was claimed), then stop the pipeline
  before Step 3 (no worktree, no run directory left behind beyond the mint from Step above, which
  the reconciler's `isOrphanedMint` sweep reclaims after 24h if it was freshly minted here):

  \`\`\`markdown
  ## Flow: Claim contested

  #{target} is already claimed by run {holder-runId} (host: {holder-host}, claimed
  {holder-claimedAt}, expires {holder-claimedAt + holder-ttlHours}).

  Wait for the claim to expire, or resume once it releases.
  \`\`\`

  No `AskUserQuestion` — there is nothing to choose between here; the pipeline cannot proceed
  with a target it cannot claim.

- **Multi-target run, default (no `keep-going`)** — release every target this run *did* claim so
  far this step (reason `never-started: file-overlap group partial claim`, mirroring
  `claim-outcomes.md`'s original partial-claim rule), then stop with the same message shape as
  above, naming every contested target.

- **Multi-target run with `keep-going`** — downgrade the contested target to a skip (drop it from
  the target list, note it, proceed with the remainder), consistent with `keep-going`'s existing
  meaning elsewhere in flow (`multi-spec.md`) — continue past a per-target failure rather than
  aborting the whole run.

Any other `gh`/MCP failure during claim (not a classification-based contest): skip that target,
log, continue to the next — same as `claim-outcomes.md`'s original "Any other `gh` failure"
handling.
```

- [ ] **Step 5: Verify the file's byte size and no placeholder text**

```bash
wc -c skills/flow/claim-targets.md
grep -n "TBD\|TODO\|implement later\|fill in" skills/flow/claim-targets.md
```

Expected: under 40,960 bytes (it's a new file, well clear); the grep returns nothing.

- [ ] **Step 6: Commit**

```bash
git add skills/flow/claim-targets.md
git commit -m "Add flow/claim-targets.md — relocated claim posture logic for Step 2.8"
```

---

### Task 2: Wire flow/SKILL.md Step 2.8

**Files:**
- Modify: `skills/flow/SKILL.md` (Step 2's bullet list, around line 129-136)

**Interfaces:**
- Consumes: `skills/flow/claim-targets.md` (Task 1) by reference, same pattern as 2.5/2.6/2.7 → `validation.md`.
- Produces: nothing new consumed elsewhere — this is the wiring-in point.

- [ ] **Step 1: Add the Step 2.8 bullet and cross-reference**

In `skills/flow/SKILL.md`, find:

```markdown
### Step 2: Pre-flight Checks

Three checks before pipeline starts. Each can return OK / WARNING / BLOCKED.
- 2.5 — Branch-divergence check (branch ahead/behind)
- 2.6 — Shape check (structural coupling, hard-fail on cross-task deps)
- 2.7 — Design-doc rejection (granularity contract — records only, not design docs). **Path / topic input only** — a record reference is never a file path, so this ambiguity doesn't arise for `#N` input; `materialize.md`'s Step 1 hard gate is the equivalent granularity check there.

Any hard fail or rejection stops the pipeline before the Config Manifesto runs. Read `validation.md` in this skill's directory for the detailed procedure for each substep.
```

Replace with:

```markdown
### Step 2: Pre-flight Checks

Four checks before pipeline starts. Each can return OK / WARNING / BLOCKED.
- 2.5 — Branch-divergence check (branch ahead/behind)
- 2.6 — Shape check (structural coupling, hard-fail on cross-task deps)
- 2.7 — Design-doc rejection (granularity contract — records only, not design docs). **Path / topic input only** — a record reference is never a file path, so this ambiguity doesn't arise for `#N` input; `materialize.md`'s Step 1 hard gate is the equivalent granularity check there.
- 2.8 — Claim the targets. Read `claim-targets.md` in this skill's directory and follow it: a
  skip-guard (local-files backend, topic-name mode, or every target already owned by this run's
  identity), a mint-if-unset resolution of this run's claim identity, a file-overlap warning
  (never a gate), then a group-claim-all-or-abort procedure over `_shared/issue-claims.md`'s lock.
  A contested target stops the pipeline before the Config Manifesto — no worktree, nothing to
  tear down. `keep-going` (multi-target runs) downgrades a contested target to a skip instead of
  aborting the whole run.

Any hard fail, rejection, or claim contest stops the pipeline before the Config Manifesto runs. Read `validation.md` in this skill's directory for 2.5-2.7's detailed procedure; `claim-targets.md` for 2.8's.
```

- [ ] **Step 2: Check the file stays under the byte ceiling**

```bash
wc -c skills/flow/SKILL.md
```

Expected: under 40,960 (was 36,970B; this adds roughly 700 bytes of prose).

- [ ] **Step 3: Commit**

```bash
git add skills/flow/SKILL.md
git commit -m "Wire flow Step 2.8 (claim the targets) into the pre-flight sequence"
```

---

### Task 3: Shrink dispatch/SKILL.md Step 4 to mint-only; retire `--claim-only`

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Step 4 body, the `--claim-only` argument-table row, the Input table's `--claim-only` row, `argument-hint` frontmatter, any other `--claim-only` mention)

**Interfaces:**
- Consumes: nothing new.
- Produces: Step 5's two Task calls, which now dispatch to a group that is *minted but not yet
  claimed* — Task 5 updates `task-prompt.md`'s wording to match.

- [ ] **Step 1: Remove the claim-write block from Step 4, leaving mint-only**

In `skills/dispatch/SKILL.md`, the current Step 4 (from `### Step 4: Claim the selected group
(whole group, or none)` through the paragraph ending `... proceeds straight to Step 5.`) reads:

```
### Step 4: Claim the selected group (whole group, or none)

**Sibling-session check, before any write** — ...

**Mint this group's run directory, before writing anything.** ...

Per `_shared/issue-claims.md`'s group-claim rule: claim **all members of the group before
starting any**. ...

**Both transports write the same `claims/issue-<n>.json` blob on `claims-registry`** — ...

**gh CLI path** (`gh` on PATH):
```bash
...
```

**MCP path** (`gh` unavailable): ...

**On success (claimed, either path):** ...
```bash
...
```

**Anything other than a clean claim on every member** — ... read `claim-outcomes.md` in this
skill's directory and follow it. ... A group claimed cleanly on every member, with no
`--claim-only`, proceeds straight to Step 5.
```

Replace the whole step with:

```markdown
### Step 4: Mint the selected group's run directory

**Sibling-session check, before any write** — run `check-sibling-sessions --record` per group
member and branch on its output; read `sibling-session-check.md` in this skill's directory and
follow it.

**Mint this group's run directory.** Derive `$RUN_ROOT` via `_shared/pipeline-run-dir.md`'s
Anchoring section (`git rev-parse --git-common-dir`, then its parent directory). This group's
**representative record** is its lowest-numbered member (the same rule
`_shared/pr-early-run-lifecycle.md` already uses for a bundle's PR title). Create
`$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-record-{representative}/` (mkdir only — no
`config.yml`, no `decisions.md`, and, as of this change, no claim written here either — the
first Task call's own `/flow` invocation claims the group at its Step 2.8, per
`flow/claim-targets.md`; this step only ensures both of that group's Task calls receive the same
identity to claim under). Call the result `$GROUP_RUN_DIR`; `$GROUP_RUN_ID` is its basename. Log
one line to this firing's own `decisions.md` (Step 1's standalone dir, not this new one): `AUTO
{time} — Step 4: minted {$GROUP_RUN_DIR} for group [{issue list}].` A minted-but-never-claimed
directory is reclaimed by the reconciler's archive sweep
(`bin/lib/reconcile/archive-merged.js`'s `isOrphanedMint` criterion) once its TTL elapses.

Nothing else happens in this step — claiming, the `bot:in-progress` bootstrap, and the claim
comment all moved to `/flow`'s Step 2.8 (`flow/claim-targets.md`). Proceed to Step 5.
```

- [ ] **Step 2: Retire `--claim-only` from the argument table and Input table**

Remove the `--claim-only` row from the Input table (the row reading `| \`--claim-only\`
(modifier) | Suffix any of the four forms above ... |`).

Update `argument-hint` frontmatter (line 4) from:
```
argument-hint: "[next|#N[,#M...]] [--claim-only] [--batch-size <n>] [--priority high|medium|low]"
```
to:
```
argument-hint: "[next|#N[,#M...]] [--batch-size <n>] [--priority high|medium|low]"
```

Grep for any remaining `--claim-only` or `claim-only` mentions elsewhere in the file (Step 3's
explicit-list handling, anywhere else) and remove them — the modifier no longer exists; there is
no claim step in dispatch left for it to stop before.

```bash
grep -n "claim-only" skills/dispatch/SKILL.md
```

Remove every match found (expect matches in the Input table row already removed above, and
possibly one more in prose — read the surrounding paragraph before deleting to avoid leaving a
dangling reference).

- [ ] **Step 3: Verify no `claim-only` references remain and check byte size**

```bash
grep -n "claim-only" skills/dispatch/SKILL.md
wc -c skills/dispatch/SKILL.md
```

Expected: first command returns nothing (this is Acceptance Criterion 4). Second: well under
40,960 — this step removed far more than the mint-only replacement adds back.

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Shrink dispatch Step 4 to mint-only; retire --claim-only"
```

---

### Task 4: Delete skills/dispatch/claim-outcomes.md; update its one remaining reference

**Files:**
- Delete: `skills/dispatch/claim-outcomes.md`
- Search: any file still referencing it by name

**Interfaces:** none — pure deletion, content already relocated in Task 1.

- [ ] **Step 1: Confirm no remaining references before deleting**

```bash
grep -rn "claim-outcomes" skills/ docs/ bin/ 2>/dev/null
```

After Task 3's edit, the only prior reference (`dispatch/SKILL.md` Step 4's "read
`claim-outcomes.md` in this skill's directory and follow it") is already gone (it was inside the
block Task 3 replaced). If this grep still finds a hit outside `claim-outcomes.md` itself, update
that hit to point at `flow/claim-targets.md` instead before proceeding.

- [ ] **Step 2: Delete the file**

```bash
git rm skills/dispatch/claim-outcomes.md
```

- [ ] **Step 3: Commit**

```bash
git commit -m "Delete dispatch/claim-outcomes.md — content relocated to flow/claim-targets.md"
```

---

### Task 5: Update dispatch/mcp-transport.md and task-prompt.md for the new claim call site

**Files:**
- Modify: `skills/dispatch/mcp-transport.md` (remove the three "Step 4 —" claim-related sections)
- Modify: `skills/dispatch/task-prompt.md` (both templates' "already-claimed" wording; add the
  headless-firing marker to the first template)

**Interfaces:**
- Produces: the `DISPATCH_HEADLESS=1`-style marker Task 7 consumes inside
  `settle-and-merge.md`'s Settle procedure.

- [ ] **Step 1: Remove claim-related MCP sections from mcp-transport.md**

In `skills/dispatch/mcp-transport.md`, remove these three sections entirely (their content moved
to `flow/claim-targets.md`'s claim procedure in Task 1, which already documents the MCP path
inline as "the same read-then-classify-then-write over the MCP tools"):

- `## Step 4 — claiming a group`
- `## Step 4 — contested-claim classification (on a rejected write)`
- `## Step 4 — \`--claim-only\` release`

Leave `## Preflight — check 3 on the MCP transport`, `## Preflight — why check 2 no longer gates
on its own`, and `## Step 2 — queue pull and per-dependency open-state check` untouched — those
are dispatch's own Preflight/Step-2 concerns, unaffected by this change.

- [ ] **Step 2: Update task-prompt.md's "already-claimed" wording**

In `skills/dispatch/task-prompt.md`, find the first template's scope line:

```
Task scope: Execute claude-tweaks build+test for this already-claimed file-overlap group of
```

Replace with:

```
Task scope: Execute claude-tweaks build+test for this file-overlap group of
```

(Drop "already-claimed" — the group is minted, not claimed, by the time this Task call starts;
this call's own `/flow` invocation claims it at Step 2.8.)

Find the second template's equivalent line (`Task scope: Execute claude-tweaks
review+polish+wrap-up for this already-claimed file-overlap`) and apply the same edit — by the
second call, the group *is* already claimed (by the first call's Step 2.8), so this one keeps
"already-claimed" unchanged. Read the surrounding paragraph to confirm which of the two templates
each line belongs to before editing — do not swap them.

- [ ] **Step 3: Add the headless-firing marker to the first template**

In the first template's `/claude-tweaks:flow` invocation line, add a marker recognized only when
this firing is dispatch's `next` form — the shape `PIPELINE_RUN_DIR="{minted-run-dir}"
/claude-tweaks:flow {target} build,test` becomes, for a `next`-form firing only:
`PIPELINE_RUN_DIR="{minted-run-dir}" DISPATCH_HEADLESS=1 /claude-tweaks:flow {target} build,test`
— bare/`#N`/explicit-list forms omit `DISPATCH_HEADLESS` entirely (a human is present for those,
per `SKILL.md`'s Input table). Add one sentence to the template's surrounding prose explaining
this: `DISPATCH_HEADLESS=1` is set only when this dispatching session's own firing was `next`-form
— it tells this Task call's Settle procedure (`settle-and-merge.md`) that nobody is present to
read a Step 2.8 claim-contest stop, so a contest there should self-report via
`headless-self-report.md` instead of just failing silently to whoever isn't watching.

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/mcp-transport.md skills/dispatch/task-prompt.md
git commit -m "Update mcp-transport.md and task-prompt.md for the relocated claim call site"
```

---

### Task 6: Contest handling inside a dispatched Task call — Settle's new branch

**Files:**
- Modify: `skills/dispatch/settle-and-merge.md` (Settle Step 6, add a branch before step 1's
  existing ownership check)
- Modify: `skills/dispatch/headless-self-report.md` (the `next`-form trigger list gains one case)

**Interfaces:**
- Consumes: `DISPATCH_HEADLESS` env value (Task 5), `flow/claim-targets.md`'s contest stop
  message shape (Task 1) as the thing being detected.
- Produces: a filed GitHub trace, same shape headless-self-report.md already produces for other
  Preflight-style failures.

- [ ] **Step 1: Add the claim-contest detection branch to Settle**

In `skills/dispatch/settle-and-merge.md`, before the existing Settle Step 6 numbered list (before
"1. Before releasing, read this record's claim blob..."), add:

```markdown
**Claim-contest special case (before the numbered steps below).** When the failure this call is
settling is a Step 2.8 claim contest (`flow/claim-targets.md`'s "Claim contested" stop — no build
or test ever ran, the pipeline stopped before the Config Manifesto), this record was never
claimed by this run at all, so step 1 below's ownership check will correctly find no claim to
release (skip is the right outcome there, not an error). The one thing this case adds: **when
`DISPATCH_HEADLESS=1` was set on this Task call's invocation** (`dispatch/task-prompt.md`'s first
template — set only for a `next`-form firing, where nobody is present to read the contest stop
directly), read `headless-self-report.md` in this skill's directory and follow its dedup-and-file
procedure, using failing-check-name `flow-step-2.8-claim-contest` and the contest stop message as
the diagnostic body. This is the one Settle branch that runs *before* any release/classification
logic, since there is nothing to release or classify — it is a pre-flight stop, not a build/test
failure. When `DISPATCH_HEADLESS` is unset (a human-present dispatch form), skip this — the
contest message the Task call already produced is sufficient; nobody headless needs a durable
trace of it.
```

- [ ] **Step 2: Add the trigger case to headless-self-report.md**

In `skills/dispatch/headless-self-report.md`, find the opening paragraph (`Loaded by
/claude-tweaks:dispatch's Preflight, and only on the next form...`) and its "Ordering" paragraph
(`This procedure runs before the stop it accompanies — both for Preflight's work-backend checks
and for its Detection Ladder.`). Update the "Ordering" paragraph to:

```markdown
**Ordering.** This procedure runs *before* the stop it accompanies — for Preflight's
`work-backend` checks, its Detection Ladder, and (new) a `next`-form firing's first Task call
hitting a Step 2.8 claim contest inside its own `/flow` invocation (`dispatch/settle-and-merge.md`'s
Settle procedure invokes this file directly from inside that Task call when `DISPATCH_HEADLESS=1`
was set — the same file, the same dedup-by-marker mechanism, just a different caller than
dispatch's own Preflight thread). It does not soften or defer any of these stops — the stop still
happens, this just leaves a durable trace first.
```

Everywhere else in the file that says "This form runs Preflight" or similar singular framing
still holds for the two pre-existing trigger types; no other section needs new branching logic —
the dedup-by-marker, Resolved-build, and issue-creation mechanics are identical regardless of
which of the three triggers called this file. Use `{failing-check-name}` =
`flow-step-2.8-claim-contest` and `{the exact diagnostic message...}` = the contest stop message
`flow/claim-targets.md` produced, when this file is invoked from Settle.

- [ ] **Step 3: Check byte sizes**

```bash
wc -c skills/dispatch/settle-and-merge.md skills/dispatch/headless-self-report.md
```

Expected: both comfortably under 40,960 (neither was near the ceiling before this small addition).

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/settle-and-merge.md skills/dispatch/headless-self-report.md
git commit -m "Settle files a headless self-report on a Step 2.8 claim contest during next-form dispatch"
```

---

### Task 7: Update `_shared/issue-claims.md`'s Identity/Release-triggers wording

**Files:**
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:** none — documentation-only alignment; no behavior defined here changes.

- [ ] **Step 1: Confirm the Identity section already describes the new call site**

Read the "Identity" paragraph (currently: `Identity: runId is the pipeline run directory id
({ISO-timestamp}-{spec-slug}) — for a directly-run or human-resumed /flow, the run directory it
creates or adopts itself (basename($PIPELINE_RUN_DIR)); for a /claude-tweaks:dispatch-originated
claim, the per-group run directory dispatch Step 4 mints before claiming...`). This paragraph
already describes the *identity* correctly (unchanged by this plan — #463 already landed this).
The one word that's now stale is "before claiming" in the dispatch clause — dispatch Step 4 no
longer claims, it only mints. Update that clause from:

```
for a `/claude-tweaks:dispatch`-originated claim, the
per-group run directory dispatch Step 4 mints *before* claiming (`{ISO-timestamp}-record-{n}`,
```

to:

```
for a `/claude-tweaks:dispatch`-originated claim, the
per-group run directory dispatch Step 4 mints (`{ISO-timestamp}-record-{n}`,
```

- [ ] **Step 2: Update the "Dispatch's success path" paragraph**

Find: `**Dispatch's success path.** \`/claude-tweaks:dispatch\` claims with the group's own minted
run directory's basename (Step 4, before either Task call), and a successful run's release
happens inside \`/wrap-up\`...`

Update the opening clause to reflect that the *claim* itself now happens inside the first Task
call's `/flow` invocation, not dispatch's own Step 4:

```
**Dispatch's success path.** `/claude-tweaks:dispatch` Step 4 mints the group's run directory;
the first Task call's own `/claude-tweaks:flow` invocation claims it at Step 2.8
(`flow/claim-targets.md`) with the group's minted directory's basename as identity, and a
successful run's release happens inside `/wrap-up` (cleanup Section E) under that same
directory...
```

(Keep the rest of the paragraph — the multi-spec-bundle exception and the failure-path sentence —
unchanged; they already hold regardless of which step performs the claim write.)

- [ ] **Step 3: Add a row to the Release triggers table for a Step 2.8 contest**

The existing table already has a row `| Interactive \`/flow\` run stops at a gate, user chooses
not to resume | \`/flow\` failure card (offered, not automatic) | \`failed: {gate}\` |`. A Step
2.8 contest is a *pre-flight* stop, not a gate failure mid-pipeline, and — critically — nothing
was claimed by this run when it's contested, so there is nothing *this* release-triggers table
entry needs to cover (no release happens on a contest; the target was never this run's to
release). Do not add a row for it — confirm this by re-reading `flow/claim-targets.md`'s contest
handling (Task 1): the single-target and default multi-target paths release only targets *this
run already claimed this step* (the partial-claim case), which is already covered by the
existing group-claim mechanics, not a new trigger. No table change needed here — this step is a
verification, not an edit.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "Align issue-claims.md wording with dispatch Step 4 mint-only (claim moved to flow Step 2.8)"
```

---

### Task 8: Update docs/skill-graph.md and docs/plugin-structure.md

**Files:**
- Modify: `docs/skill-graph.md` (the `/dispatch` ↔ `/flow` edge description; any edge naming
  `claim-outcomes.md`)
- Modify: `docs/plugin-structure.md` (the `/flow` and `/dispatch` sub-file tables — add
  `claim-targets.md`, remove `claim-outcomes.md`)

**Interfaces:** none — documentation sync per CLAUDE.md's Cross-references convention.

- [ ] **Step 1: Update docs/skill-graph.md**

```bash
grep -n "claim-outcomes\|claim.only\|Step 4.*claim" docs/skill-graph.md
```

For each match, update the edge description to reflect: dispatch mints (Step 4), flow claims
(Step 2.8, via `claim-targets.md`) — mirroring the wording style #463's build already used for
the run-identity edges in this same file (search `basename($PIPELINE_RUN_DIR)` in this file for
that precedent phrasing).

- [ ] **Step 2: Update docs/plugin-structure.md's sub-file tables**

In the `/flow` skill's sub-file table row list, add `claim-targets.md` with a one-line
description ("Step 2.8's claim procedure — skip-guard, identity resolution, file-overlap warning,
group-claim-all-or-abort"). In the `/dispatch` skill's sub-file table, remove the
`claim-outcomes.md` row.

- [ ] **Step 3: Commit**

```bash
git add docs/skill-graph.md docs/plugin-structure.md
git commit -m "Update skill-graph and plugin-structure docs for the relocated claim procedure"
```

---

### Task 9: Pinning tests

**Files:**
- Create: `tests/flow-claim-preflight.test.js`
- Read (for the existing pattern to follow): `tests/dispatch-flow-rundir-handoff.test.js`

**Interfaces:**
- Consumes: nothing new — plain text-pinning tests against the skill markdown files, same
  convention `tests/dispatch-flow-rundir-handoff.test.js` already uses (read file content,
  assert regex matches/doesn't-match).

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

test('claim-outcomes.md is deleted', () => {
  assert.strictEqual(
    fs.existsSync(path.join(REPO_ROOT, 'skills/dispatch/claim-outcomes.md')),
    false
  );
});

test('flow/claim-targets.md exists and is referenced by flow/SKILL.md Step 2.8', () => {
  const claimTargetsPath = path.join(REPO_ROOT, 'skills/flow/claim-targets.md');
  assert.strictEqual(fs.existsSync(claimTargetsPath), true);
  const skillMd = fs.readFileSync(path.join(REPO_ROOT, 'skills/flow/SKILL.md'), 'utf8');
  assert.match(skillMd, /2\.8 — Claim the targets/);
  assert.match(skillMd, /claim-targets\.md/);
});

test('claim-targets.md skip-guard is one condition, not three special cases', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/flow/claim-targets.md'), 'utf8');
  assert.match(content, /claim\.runId === basename\(\$PIPELINE_RUN_DIR\)/);
  assert.match(content, /work-backend.*local-files/);
});

test('dispatch/SKILL.md Step 4 is mint-only — no claim-only modifier remains', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/SKILL.md'), 'utf8');
  assert.doesNotMatch(content, /claim-only/);
  assert.match(content, /Mint the selected group's run directory/);
  assert.doesNotMatch(content, /bootstrap-then-add `bot:in-progress`/);
});

test('dispatch/SKILL.md argument-hint drops --claim-only', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/SKILL.md'), 'utf8');
  const hintLine = content.split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.ok(hintLine, 'argument-hint line should exist');
  assert.doesNotMatch(hintLine, /claim-only/);
  assert.match(hintLine, /--batch-size/);
});

test('task-prompt.md first template no longer claims "already-claimed"; second still does', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/task-prompt.md'), 'utf8');
  assert.match(content, /Execute claude-tweaks build\+test for this file-overlap group of/);
  assert.doesNotMatch(content, /Execute claude-tweaks build\+test for this already-claimed/);
  assert.match(content, /Execute claude-tweaks review\+polish\+wrap-up for this already-claimed/);
});

test('task-prompt.md documents DISPATCH_HEADLESS for next-form firings', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/task-prompt.md'), 'utf8');
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('headless-self-report.md documents the Step 2.8 contest trigger', () => {
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'skills/dispatch/headless-self-report.md'),
    'utf8'
  );
  assert.match(content, /flow-step-2\.8-claim-contest|Step 2\.8 claim contest/);
});

test('settle-and-merge.md documents the claim-contest special case', () => {
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'skills/dispatch/settle-and-merge.md'),
    'utf8'
  );
  assert.match(content, /Claim-contest special case/);
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('mcp-transport.md no longer carries claim-write sections', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/mcp-transport.md'), 'utf8');
  assert.doesNotMatch(content, /## Step 4 — claiming a group/);
  assert.doesNotMatch(content, /## Step 4 — `--claim-only` release/);
});
```

- [ ] **Step 2: Run the tests to verify they fail before this plan's other tasks land**

If run standalone (before Tasks 1-8 land), most assertions above fail as expected — this
confirms the tests actually discriminate. If run after Tasks 1-8 (the normal execution order),
skip this verification step and run directly to confirm PASS instead — see Step 3.

```bash
node --test tests/flow-claim-preflight.test.js
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
node --test tests/flow-claim-preflight.test.js
```

Expected: all PASS, once Tasks 1-8 have landed.

- [ ] **Step 4: Commit**

```bash
git add tests/flow-claim-preflight.test.js
git commit -m "Add pinning tests for the relocated claim-acquisition procedure"
```

---

### Task 10: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1 | tail -60
```

Expected: all suites pass, including `bin/lib/skill-audit/tests/context-cost.test.js` (byte
ceiling) and `tests/console-on-pr.test.js` (if either `dispatch/SKILL.md` or `flow/SKILL.md`
somehow drifted near the ceiling despite this plan's net-shrink expectation).

- [ ] **Step 2: Manual grep sweep for stray references**

```bash
grep -rln "CLAIM_RUN_ID\|claim-outcomes\|--claim-only" skills/ docs/ bin/ 2>/dev/null
```

Expected: no matches. `CLAIM_RUN_ID` was already fully retired by #463 — this sweep re-confirms
nothing this plan touched reintroduced it, and confirms `claim-outcomes`/`--claim-only` are fully
gone.

- [ ] **Step 3: If anything fails, fix and re-commit — do not proceed to wrap-up with a red suite.**
