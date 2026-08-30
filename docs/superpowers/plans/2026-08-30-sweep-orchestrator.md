# Sweep Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/claude-tweaks:sweep` — a thin orchestrator running tidy (auto) → specify (bare drain) → backlog refine (headless) under one shared run directory, closing with attention's render — plus the `--source sweep` parent contracts on all three children.

**Architecture:** `sweep` is a sequencer, not a reimplementation: each step is a direct `Skill` invocation with an explicit `--source sweep` flag (the parent signal — never inferred from `$PIPELINE_RUN_DIR`), sharing one `{ISO}-sweep-standalone/` run dir and one `decisions.md`. Between steps, the session-scoped record snapshot is explicitly invalidated so each step reads its predecessor's mutations. Sweep never claims, builds, or merges — which is what makes it a legal headless parent of refine's grant-writing posture; an eval scenario enforces that invariant, not just prose.

**Tech Stack:** Markdown skill files, Node conformance tests (`node --test`), one evals scenario YAML.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1494/work/1494-spec.md` (record #1494)

## Global Constraints

- **Worktree:** all work in `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1608-666`, branch `worktree-flow+spec-1608-666`. Verify with `pwd` + `git rev-parse --abbrev-ref HEAD` before any edit; STOP if mismatched.
- **Byte ceiling:** every `plugin/skills/**/*.md` file ≤ 40,960 bytes (`tests/bin-lib/skill-audit/context-cost.test.js`). **`tidy/SKILL.md` is at 40,953 (7 B headroom) and `specify/SKILL.md` at 40,951 (9 B)** — every edit to those two is a byte-swap: run `wc -c` after each edit and trim per the task's named candidates until ≤ 40,960.
- **Pinned-literal check:** before modifying ANY existing sentence in a skill file, grep `tests/` for distinctive substrings of that sentence (e.g. `grep -rn "standalone-only" tests/`). A pinned sentence must keep its pinned literal or the pin must be updated in the same commit with a note in the report.
- **Test-pinned regex that must survive:** `tests/bin-lib/skill-audit/csc-registry.test.js` exempts tidy from the `$PIPELINE_RUN_DIR` CSC mention via regex `/no \`PIPELINE_RUN_DIR\` signal/` — the literal text ``no `PIPELINE_RUN_DIR` signal`` must remain in tidy's CSC after the rewrite.
- **Spec path correction (ruled):** `invalidateSnapshot` lives at `plugin/bin/lib/issues/record-snapshot.js` (the spec's `plugin/bin/lib/record-snapshot.js` is wrong). Use the real path everywhere.
- **Skill-graph edges (ruled):** `docs/skill-graph.md`'s stated-once ownership convention (lines 13-21) overrides the spec's "reciprocal rows" deliverable — sweep (the upstream caller) owns ALL its edges in its own `## sweep` section; do NOT add duplicate rows to tidy's/specify's/backlog's sections. The children's own SKILL.md Component-Skill Contract prose (Task 2) is what names sweep as sanctioned parent.
- **Commits:** `{Verb} {what} — {detail}`, body references `refs #1494` (never "closes"), and end with:
  `Claude-Session: https://claude.ai/code/session_0179EggZ9TSWreaPpQCyHDca`
- **Fully-qualified skill refs** (`/claude-tweaks:{skill}`) in any actionable instruction text (Step bodies, Next Actions); bare `/{skill}` only in descriptive prose and relationship tables.
- Run only the targeted test files named per task; the controller runs the full suite centrally after the final task.

---

### Task 1: Create `plugin/skills/sweep/SKILL.md` + register it on every enforced surface

Four `listSkillDirs`-driven test suites go red the moment `plugin/skills/sweep/SKILL.md` exists unless the doc surfaces land in the same commit — so this task ships the skill AND all registrations atomically.

**Files:**
- Create: `plugin/skills/sweep/SKILL.md`
- Modify: `plugin/skills/_shared/pipeline-run-dir.md` (line 12 allowlist + one clause paragraph near lines 14-20)
- Modify: `docs/skill-graph.md` (new `## sweep` section, alphabetical — between `## stories` and `## test`)
- Modify: `plugin/skills/help/reference-card.md` (Utility table row)
- Modify: `plugin/skills/help/context-flow.md` ("What Each Skill Reads and Writes" row — match the live table's header columns exactly)
- Modify: `docs/getting-started.md` (one skill paragraph)
- Modify: `docs/plugin-structure.md` (line 59 Utility roster: add `sweep`)
- Modify: `README.md` (line ~113 utility-skill enumeration: add `sweep`)

**Interfaces:**
- Produces: the `--source sweep` calling convention Tasks 2-4 cite: Step 1 `/claude-tweaks:tidy --source sweep [--scope ...]`, Step 2 `/claude-tweaks:specify --source sweep [--budget ...]`, Step 3 `/claude-tweaks:backlog refine --source sweep`; run dir `{ISO}-sweep-standalone/`.

- [ ] **Step 1: Write `plugin/skills/sweep/SKILL.md`** from the draft below. Adjust only where live file contents contradict it (verify each cited file/section exists before citing). Structural requirements enforced by tests: frontmatter `name: sweep` (bare, no namespace), `description` ≤ 260 chars, quoted `argument-hint`; the Interaction style line **byte-identical** to `plugin/skills/specify/SKILL.md:6` (copy it verbatim from there); sections `## When to Use`, `## Input`, numbered steps, `## Next Actions`, `## Component-Skill Contract` (must contain the literal string `$PIPELINE_RUN_DIR`), `## Anti-Patterns` (`| Pattern | Why It Fails |`) — Next Actions before CSC/Anti-Patterns. Every bracket leaf of the argument-hint must appear literally in `## Input`.

Draft (transcribe, completing the Interaction style line from specify):

````markdown
---
name: sweep
description: Use for one hands-off hygiene pass — tidy (auto), specify's bare drain, then backlog refine's headless posture under one run directory, closing with backlog attention's render. Keywords: sweep, hygiene, queue maintenance, orchestrator
argument-hint: "[--budget <n|all>] [--scope <name>[,<name>...]]"
---
> **Interaction style:** {byte-identical line copied from specify/SKILL.md:6}

# Sweep — Hands-Off Queue Hygiene Orchestrator

Run everything cheap and frequent that doesn't need a human, in one command: `/claude-tweaks:tidy` (auto mode), `/claude-tweaks:specify` (bare drain), and `/claude-tweaks:backlog refine` (headless posture), in that order, under one shared run directory and one `decisions.md` — closing with `/claude-tweaks:backlog attention`'s render and a recommended `/claude-tweaks:dispatch` line. Sweep never claims, builds, or merges — that boundary is what makes it a legal parent of a grant-writing unit (refine's headless posture) under this codebase's self-authorization rule, and `evals/scenarios/sweep-never-invokes-build-machinery.yaml` pins it.

Lifecycle: utility — the on-demand, single-session sibling of the cloud fleet's independently scheduled hygiene rows (`routine/fleet.md`); it replaces none of them.

## When to Use

- The queue has accumulated hygiene debt — stale records, unshaped-but-eligible records, shaped-but-ungranted records — and you want one command to work through all of it without answering questions
- Before a dispatch session: run sweep first so `/claude-tweaks:dispatch` sees a tidied, shaped, granted queue
- NOT for audits — the four health sweeps (code/docs/journey/harness) are deliberate human-triggered audits, not hygiene, and sweep never runs them
- NOT for building — sweep never invokes `/claude-tweaks:flow`, `/claude-tweaks:build`, or `/claude-tweaks:dispatch`; its close-out only recommends the dispatch command

## Input

`$ARGUMENTS` is parsed as `[--budget <n|all>] [--scope <name>[,<name>...]]`, both optional, order-independent:

- `--budget <n|all>` → forwarded verbatim to the specify step (Step 2) — `_shared/record-batch-input.md`'s canonical `--budget` grammar; omitted, specify applies its own `specify-budget` policy default.
- `--scope <name>[,<name>...]` → forwarded verbatim to the tidy step (Step 1) as `--scope=<name>[,<name>...]`; omitted, tidy runs its full scan roster.

Anything else in `$ARGUMENTS` is an error — report it and stop; sweep deliberately accepts no mode keyword (it is always hands-off) and no record refs (it drains queues, it doesn't target records).

## Step 0: Resolve the run directory

Resolve one standalone run directory per `_shared/pipeline-run-dir.md`'s standalone-auto fallback (sweep is on that file's allowlist):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --mode auto --standalone sweep --create
```

Adopt the printed path as `$PIPELINE_RUN_DIR` for the whole run — `{ISO}-sweep-standalone/` under the main checkout's `.claude-tweaks/pipelines/`, pre-populated with `decisions.md` and `staged/`. Every component step logs to this one `decisions.md`; none mints its own.

## Step 1: Tidy

Invoke `/claude-tweaks:tidy --source sweep` (appending `--scope=<...>` when given) in auto mode, under `$PIPELINE_RUN_DIR`. Per tidy's Component-Skill Contract, `--source sweep` forces the auto-mode path regardless of the project's `auto-mode` policy, logs to the shared `decisions.md`, stages findings to the shared `staged/`, and suppresses both tidy's `## Next Actions` block and its terminal `AskUserQuestion` approval — tidy reports its counts (applied / staged / yours / clean) back to this step instead. Staged items wait for `/claude-tweaks:tidy --approve` after the run; nothing is applied unseen.

## Step 1.5: Invalidate the record snapshot

Tidy may have mutated records (closes, defers, `needs:decision` markers). Before Step 2, delete the session-scoped record snapshot so specify's drain reads tidy's mutations rather than a stale pre-tidy snapshot — `_shared/record-queue-fetch.md`'s invalidation rule, enforced at its own named point:

```bash
node -e "require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-snapshot.js').invalidateSnapshot(process.env.CLAUDE_CODE_SESSION_ID)"
```

## Step 2: Specify

Invoke `/claude-tweaks:specify --source sweep` bare (appending `--budget <n|all>` when given), under the same `$PIPELINE_RUN_DIR`. Per specify's Component-Skill Contract, `--source sweep` runs the bare-drain form headlessly: no `AskUserQuestion`, no suggestion menu, shared `decisions.md`; the drain's `{shaped: N, routed: M, failed: K}` close-out counts report back to this step.

## Step 2.5: Invalidate the record snapshot again

Specify's shaping and routing also mutate records. Repeat Step 1.5's invalidation command verbatim before Step 3.

## Step 3: Backlog refine (headless posture)

Invoke `/claude-tweaks:backlog refine --source sweep` under the same `$PIPELINE_RUN_DIR` — the headless posture (`backlog/refine-headless.md`): labeling lanes plus the grant chain, zero clicks. This is the call that only this skill's existence makes legal to run with nobody present outside a scheduled Routine — sweep itself never claims, builds, or merges, so parenting a grant-writing unit does not self-authorize anything. Refine reports its counts (granted / re-authorized / needs-decision / skipped) back to this step; its `## Next Actions` stays suppressed per `backlog/SKILL.md`'s presence rule.

## Failure propagation

An unhandled error in a step halts the sequence before the next step — sweep never runs specify against a possibly-incomplete tidy pass, or refine against a possibly-incomplete specify pass. On a halt, skip Step 4's normal render and report the partial run instead: which step failed, what it had completed before failing (from its counts and `decisions.md` entries), and which steps never ran. A step's own internal per-record error handling (specify's `failed` bucket, refine's per-record `failedKey` skips, tidy's staged fallbacks) is NOT a sweep-level failure — only an exception the step's own contract doesn't already catch halts the run.

## Step 4: Close-out

1. Repeat Step 1.5's invalidation command once more, so the close-out reads the run's final record state.
2. Invoke `/claude-tweaks:backlog attention`'s render — execute `backlog/attention-mode.md`'s existing Steps 1-4 directly as the first block of sweep's own output. Do not restate its fetch/merge/rank/render logic here: any future change to attention's row types or ranking must need no edit in this file.
3. Render sweep's `## Next Actions` (below), then log one summary line to `decisions.md` with the three steps' counts.

## Next Actions

**`/claude-tweaks:dispatch`** — drain the authorized queue this sweep just prepared (recommended)
`/claude-tweaks:tidy --approve` — apply this run's staged tidy items, if any
`/claude-tweaks:backlog attention` — re-check after acting

Precedence: when attention's render above names a "needs you" item (its Pick up next line or a `needs:*` row), that item's launcher leads this block instead of `/claude-tweaks:dispatch`, bolded, with `(recommended)` — mirroring `backlog/SKILL.md`'s own needs-you-first precedence.

## Component-Skill Contract

`/claude-tweaks:sweep` is a **parent, never a child** — no skill invokes it, and it is not on any pipeline's step list. It sets `$PIPELINE_RUN_DIR` for its three component steps (Step 0) and passes `--source sweep` explicitly on every call; the flag, never a bare `$PIPELINE_RUN_DIR`, is the parent signal each child detects (a human or Routine can also set `$PIPELINE_RUN_DIR` via the standalone-auto path, so the variable alone proves nothing). Its own `## Next Actions` always renders when a human is present; a scheduled firing would omit it, but sweep ships no `routine-template.yml` — the cloud fleet keeps its own composition (`routine/fleet.md`).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Invoking `/claude-tweaks:dispatch`, `/claude-tweaks:flow`, or `/claude-tweaks:build` from sweep | Sweep's legality as a headless parent of the grant chain rests on never claiming, building, or merging — the eval scenario fails CI on this, not just doc review |
| Inferring parent invocation from `$PIPELINE_RUN_DIR` in a child | The variable is set by standalone-auto paths too — `--source sweep` is the only parent signal |
| Restating attention's fetch/merge/rank logic in the close-out | The two surfaces drift apart; call the existing render |
| Skipping the between-step snapshot invalidations | The next step reads a stale pre-mutation snapshot and re-processes records the previous step already disposed of |
| Continuing past a failed step | Specify against a half-finished tidy pass (or refine against a half-finished specify pass) acts on inconsistent queue state |
| Adding a mode keyword or per-record targeting | Sweep is always hands-off and always whole-queue; targeted work belongs to the children invoked directly |
````

- [ ] **Step 2: Add sweep to `_shared/pipeline-run-dir.md`'s standalone-auto allowlist** (line 12): extend the parenthesized list with `` `/claude-tweaks:sweep` ``. Then add one clause paragraph after specify's (line ~20), same shape: sweep is the orchestrator case — always hands-off, so step 5's interactive fallback is never a real option; it mints `{ISO}-sweep-standalone/` at its Step 0 and its three component steps (`/tidy`, `/specify`, `/backlog refine`, each passing `--source sweep`) adopt that dir via the normal resolution ladder instead of minting their own. No code change: `bin/lib/hooks/run-dir-resolve.js` gates on `--mode auto`, not a name list (update its lines 150-155 comment roster to include sweep).
- [ ] **Step 3: `docs/skill-graph.md` `## sweep` section** (alphabetical position, table `| Target | Relationship |`):

```markdown
## sweep

| Target | Relationship |
|---|---|
| `/tidy` | Step 1 invokes `/claude-tweaks:tidy --source sweep` (forwarding `--scope`) in auto mode under the shared run dir — tidy's one sanctioned parent (tidy/SKILL.md's Component-Skill Contract): shared `decisions.md`/`staged/`, Next Actions and terminal approval suppressed. |
| `/specify` | Step 2 invokes the bare drain as `/claude-tweaks:specify --source sweep` (forwarding `--budget`) under the shared run dir — headless drain, counts reported back (specify's Component-Skill Contract; `specify/next-mode.md`). |
| `/backlog` | Step 3 invokes `/claude-tweaks:backlog refine --source sweep` (headless posture, `backlog/refine-headless.md`); the close-out executes attention mode's render directly (`backlog/attention-mode.md`) as sweep's first output block. |
| `/dispatch` | Recommended-line-only: sweep's Next Actions names `/claude-tweaks:dispatch` but never invokes it — sweep never claims, builds, or merges, the boundary that legalizes its parenting of the grant chain (`evals/scenarios/sweep-never-invokes-build-machinery.yaml` pins it). |
| `_shared/record-queue-fetch.md` | Sweep invalidates the session-scoped record snapshot between steps and before close-out (`bin/lib/issues/record-snapshot.js`'s `invalidateSnapshot`) so each step reads its predecessor's mutations. |
| `_shared/pipeline-run-dir.md` | Mints `{ISO}-sweep-standalone/` via the standalone-auto allowlist at Step 0; all three children adopt it and log to one `decisions.md`. |
```

- [ ] **Step 4: `plugin/skills/help/reference-card.md`** — Utility table row; the `Takes` column must byte-match the argument-hint (`tests/reference-card-argument-hint.test.js`):

```markdown
| `/claude-tweaks:sweep` | One hands-off hygiene pass — tidy (auto) → specify drain → backlog refine headless under one run dir, closing with attention's render; never claims, builds, or merges | `[--budget <n|all>] [--scope <name>[,<name>...]]` |
```

- [ ] **Step 5: `plugin/skills/help/context-flow.md`** — read the "What Each Skill Reads and Writes" table's header first, then add a `/sweep` row matching its column semantics (reads: work-record queue via its component steps; writes: one shared run dir's `decisions.md`/`staged/`, plus the children's own record writes; hands off to: `/dispatch` recommendation).
- [ ] **Step 6: `docs/getting-started.md`** — add a `**\`/claude-tweaks:sweep\`** — ...` paragraph in the same shape as its neighbors (see the `/claude-tweaks:tidy` paragraph at line ~92): one bolded fully-qualified command, em-dash, 2-4 sentences covering the three steps, the shared run dir, the never-claims/builds/merges boundary, and the attention close-out.
- [ ] **Step 7: rosters** — `docs/plugin-structure.md` line 59: append `sweep` to the **Utility** list (do NOT touch the sub-files table — sweep ships none). `README.md` line ~113: add `sweep` inside the utility-skills parenthetical.
- [ ] **Step 8: verify**

Run: `wc -c plugin/skills/sweep/SKILL.md` (must be ≤ 40960) then
`node --test tests/skill-catalog-completeness.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/bin-lib/skill-audit/csc-registry.test.js tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/anti-patterns.test.js tests/skill-conventions.test.js tests/skill-graph-table-structure.test.js tests/bin-lib/skill-audit/option-description.test.js`
Expected: all pass. Paste raw output in the report.

- [ ] **Step 9: Commit** — `Add /claude-tweaks:sweep orchestrator skill — tidy→specify→refine under one run dir, registered on every enforced surface (refs #1494)` + trailer.

---

### Task 2: `--source sweep` parent contracts in the three children

**Files:**
- Modify: `plugin/skills/tidy/SKILL.md` (frontmatter `argument-hint` line 4; `## Input`; CSC lines 237-241) — **byte-swap, 7 B headroom**
- Modify: `plugin/skills/specify/SKILL.md` (frontmatter `argument-hint` line 4; Input case 0 area line ~76; CSC lines 161-163) — **byte-swap, 9 B headroom**
- Modify: `plugin/skills/specify/next-mode.md` (drain close-out area, lines ~274-347 — room: 27,661 B)
- Modify: `plugin/skills/backlog/SKILL.md` (lines 104, 120 — room: 26,539 B)
- Modify: `plugin/skills/backlog/refine-headless.md` (line 7's `Phase 7` reference)
- Modify: `plugin/skills/help/reference-card.md` (tidy + specify rows' `Takes` columns must track the new hints)

**Interfaces:**
- Consumes: Task 1's calling convention (`--source sweep` on each call, shared `$PIPELINE_RUN_DIR`).
- Produces: the suppression semantics Task 4's tests pin.

- [ ] **Step 1: tidy.** (a) argument-hint gains `[--source sweep]` (and reference-card's tidy `Takes` gets the identical bytes). (b) `## Input` gains a one-sentence `--source sweep` bullet: parent-only flag passed by `/claude-tweaks:sweep` Step 1 — forces the auto-mode path regardless of `auto-mode` policy; see Component-Skill Contract. (c) Rewrite CSC line 239, preserving the literal ``no `PIPELINE_RUN_DIR` signal``, to:

> `/claude-tweaks:tidy` has one sanctioned parent: `/claude-tweaks:sweep`, whose Step 1 passes `--source sweep` — the explicit parent signal; there is still no `PIPELINE_RUN_DIR` signal expected as a caller-side argument (a set `$PIPELINE_RUN_DIR` alone never means parent invocation — sweep's shared run dir arrives via the normal resolution ladder, and the run dir is otherwise resolved internally for Step 6's auto-mode routing). Under `--source sweep`: the auto-mode path runs regardless of `auto-mode` policy, entries log to the shared `decisions.md` (no standalone run dir minted), findings stage to the shared `staged/`, and both the `## Next Actions` block and the terminal `AskUserQuestion` approval are suppressed — counts report back to the parent; staged items wait for `/claude-tweaks:tidy --approve`. Every other invocation is standalone: the `## Next Actions` block always renders.

(d) **Byte budget:** this adds ~+330 B against 7 B headroom. Trim candidates, in order, until `wc -c` ≤ 40960: (1) line 241's closing sentence "This is bookkeeping internal to Steps 7-7.5, not a parent-skill relationship, and doesn't change anything about this contract's `PIPELINE_RUN_DIR`/Next Actions guidance." → "Bookkeeping internal to Steps 7-7.5, not a parent-skill relationship." (~-110 B); (2) tighten the new CSC text itself; (3) line 143's `--dry-run` paragraph's final sentence ("This mirrors `/claude-tweaks:routine create --dry-run`'s ... instead of the routine's own setup.") may be dropped (~-260 B). Grep `tests/` for pins on every sentence trimmed BEFORE trimming.

- [ ] **Step 2: specify.** (a) argument-hint gains `[--source sweep]` (reference-card's specify `Takes` follows byte-identically). (b) Input case 0 (line ~76, the bare-drain bullet) gains a short clause: `--source sweep` (passed only by `/claude-tweaks:sweep` Step 2) runs this same drain as a component step — see the Component-Skill Contract and `next-mode.md`. (c) CSC (line 163): rework "user-facing in every invocation except one" → "except two", adding: `/claude-tweaks:sweep`'s Step 2 invokes the bare drain as `Skill(skill: "claude-tweaks:specify", args: "--source sweep [--budget ...]")` — like `--chained`, an explicit component-mode flag (`$PIPELINE_RUN_DIR` alone is never the signal); under it the drain runs headlessly with no `AskUserQuestion` and no suggestion menu, logs to the parent's shared `decisions.md`, and its close-out counts report to the parent (details: `next-mode.md`). (d) **Byte budget:** ~+380 B against 9 B headroom. Trim candidates: the CSC's final sentence "A batch under `--chained` is permitted but has no caller: the born-ready chain passes exactly one ref." (~-105 B — grep `tests/` for pins first; if pinned, keep and trim elsewhere); compress the new text; other CSC redundancy. `wc -c` ≤ 40960 required. (e) **next-mode.md:** in the close-out section (~line 343), add a `--source sweep` paragraph: under `--source sweep` the firing is a component step of `/claude-tweaks:sweep` — the close-out counts render as the step's report to the parent (never a `## Next Actions`/suggestion-menu render, even with a human present at sweep's own prompt: the parent owns the handoff), `decisions.md` entries go to the parent's shared run dir adopted via the resolution ladder, and the `$ATTEMPTED` this-firing set still resets at firing start exactly as for a Routine firing.

- [ ] **Step 3: backlog.** (a) Line 104's render rule currently says a human typing `--source sweep` directly → render. Extend it: `--source sweep` is reserved for `/claude-tweaks:sweep`'s component-step invocation and NEVER renders Next Actions — the parent owns the handoff (sweep's own close-out and Next Actions are the surface); a human "standing in for a Routine" types `--source routine`, not `--source sweep`. (b) CSC line 120: append one sentence naming the sweep-parented firing's suppression (Next Actions never renders under `--source sweep`; counts report to the parent; shared `decisions.md`). (c) `refine-headless.md` line 7: replace the stale design-doc reference `(\`/claude-tweaks:sweep\`'s component-step invocation, Phase 7)` with `(\`/claude-tweaks:sweep\`'s Step 3 component invocation)`. `wc -c` both files ≤ 40960 (both have room; verify anyway).

- [ ] **Step 4: verify**

Run: `wc -c plugin/skills/tidy/SKILL.md plugin/skills/specify/SKILL.md plugin/skills/specify/next-mode.md plugin/skills/backlog/SKILL.md plugin/skills/backlog/refine-headless.md` (each ≤ 40960) then
`node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/csc-registry.test.js tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/backlog-refine-headless.test.js tests/backlog-attention-rows.test.js tests/tidy-residue-markers.test.js tests/tidy-subfile-table-completeness.test.js tests/specify-next-mode.test.js tests/bin-lib/skill-audit/house-structure.test.js`
Expected: all pass (if a pre-existing pin trips on a trimmed sentence, restore or update the pin per Global Constraints and note it). Paste raw output.

- [ ] **Step 5: Commit** — `Add --source sweep parent contracts to tidy, specify, and backlog refine — suppression, shared decisions.md, byte-swapped CSCs (refs #1494)` + trailer.

---

### Task 3: Make sweep-run residue visible to the four `-tidy-standalone` matchers

Tidy under sweep stages into `{ISO}-sweep-standalone/staged/` — invisible today to four surfaces that filter on the `-tidy-standalone` directory-name substring. The spec's attention-mode verification clause ("if verification finds a real assumption that breaks under sweep's context, fixing it becomes an in-scope deliverable") covers this class; the fix is widening each matcher to also accept `-sweep-standalone`.

**Files:**
- Modify: `plugin/bin/lib/hooks/session-start.js` (lines ~117-130: the `-tidy-standalone` substring filter)
- Modify: `plugin/bin/lib/hooks/sweep-shadow.js` (lines ~122-127: `path.basename(runDir).includes('-tidy-standalone')` exemption)
- Modify: `plugin/skills/tidy/approve-mode.md` (the newest-non-empty walk-back's `*-tidy-standalone*` scope)
- Modify: `plugin/skills/backlog/attention-mode.md` (Step 3.5 Tidy row, lines ~240-262: run-dir discovery scope)
- Test: `tests/hooks-session-start.test.js`, `tests/bin-lib/hooks/sweep-shadow.test.js` (extend the existing suites — sweep-shadow's `-tidy-standalone` exemption case is at line ~147), `tests/tidy-residue-markers.test.js` (prose pins for the two .md widenings)

**Interfaces:**
- Consumes: Task 1's run-dir shape `{ISO}-sweep-standalone/` with `staged/`.
- Produces: nothing later tasks consume; Task 4's conformance test cites the widened prose.

- [ ] **Step 1: failing tests first.** In each of the two hooks suites, add a case: a `2026-08-30T120000-sweep-standalone` run dir with a non-empty `staged/` is (a) listed by session-start's clean-run listing exactly as a `-tidy-standalone` one is, and (b) exempted by sweep-shadow exactly as a `-tidy-standalone` one is. Run them; expected: FAIL (the substring filter misses it). Paste the failing output.
- [ ] **Step 2: widen the two JS matchers.** Change each `-tidy-standalone` substring check to accept either suffix, e.g. `/-(tidy|sweep)-standalone/.test(path.basename(runDir))` — match each file's local style; touch nothing else in either module.
- [ ] **Step 3: widen the two .md consumers.** `tidy/approve-mode.md`: the walk-back scans `*-tidy-standalone*` AND `*-sweep-standalone*` run dirs (newest non-empty `staged/` across both — a sweep run's staged tidy items are approvable the same way). `backlog/attention-mode.md` Step 3.5 Tidy row: same widening for its newest-run discovery, with one clause noting a `-sweep-standalone` run's staged items originate from tidy's Step 1 component run.
- [ ] **Step 4: run** `node --test tests/bin-lib/hooks/ tests/hooks-session-start.test.js tests/tidy-residue-markers.test.js tests/backlog-attention-rows.test.js` — expected: PASS, including Step 1's new cases. Paste raw output.
- [ ] **Step 5: Commit** — `Widen -tidy-standalone matchers to sweep-standalone runs — session-start, sweep-shadow, tidy --approve walk-back, attention tidy row (refs #1494)` + trailer.

---

### Task 4: Conformance test + eval scenario

**Files:**
- Create: `tests/sweep-orchestrator.test.js`
- Create: `evals/scenarios/sweep-never-invokes-build-machinery.yaml`

**Interfaces:**
- Consumes: everything Tasks 1-3 shipped (pins their literal text).

- [ ] **Step 1: `tests/sweep-orchestrator.test.js`** — same idiom as `tests/backlog-refine-headless.test.js` (header comment naming record #1494 and stating each pin was discrimination-checked; `ROOT`/`read()` helpers). Pin at minimum:
  1. `plugin/skills/sweep/SKILL.md` exists; its prose contains all three component calls with `--source sweep` (`/claude-tweaks:tidy --source sweep`, `/claude-tweaks:specify --source sweep`, `/claude-tweaks:backlog refine --source sweep`).
  2. Both between-step invalidations plus the close-out invalidation: `invalidateSnapshot` appears, citing `bin/lib/issues/record-snapshot.js`, and the file contains Step 2.5's "Repeat" instruction.
  3. Failure propagation: the halt-and-report paragraph's discriminating sentence (e.g. "halts the sequence before the next step") and the internal-error carve-out ("is NOT a sweep-level failure").
  4. The never-invokes boundary: the When-to-Use NOT-for-building bullet naming flow/build/dispatch, and the Anti-Patterns row.
  5. `_shared/pipeline-run-dir.md` line-12 allowlist contains `` `/claude-tweaks:sweep` `` and a sweep clause paragraph exists.
  6. tidy CSC: contains both `/claude-tweaks:sweep` and the literal ``no `PIPELINE_RUN_DIR` signal``; specify CSC: contains `--source sweep`; `specify/next-mode.md` contains the `--source sweep` component paragraph; `backlog/SKILL.md` line-104 rule states `--source sweep` never renders Next Actions.
  7. `--source sweep` in both tidy's and specify's `argument-hint` lines.
  Discrimination-check each pin via `git show 0ac4d7a00:{path}` (pre-#1494 base): the pinned text must be absent there (or the file absent). Note the check's result per pin in the header comment.
- [ ] **Step 2: run** `node --test tests/sweep-orchestrator.test.js` — expected: PASS. Then spot-check discrimination: pick two pins, confirm via `git show 0ac4d7a00:plugin/skills/tidy/SKILL.md | grep -c "claude-tweaks:sweep"` (expect 0) and the sweep SKILL.md's absence at base. Paste raw output.
- [ ] **Step 3: eval scenario** `evals/scenarios/sweep-never-invokes-build-machinery.yaml`, mirroring `backlog-refine-permission-matrix-compliance.yaml`'s shape (fixture `base: init-baseline`, two seeded local records — one stale/tidy-eligible, one ready-and-scored; `skill_invocation.prompt: "/claude-tweaks:sweep"`). `description` must state the invariant (sweep never invokes flow/build/dispatch; under local-files neither posture may grant or build) and that this is the enforcement of #1494's Non-Goal. Assertions:
  - `local-record-facet`: `grants.build` `equals: false` and `stage` `equals: "ready"` for the ready-and-scored record (paths `specs/1-*.md`/`specs/2-*.md` per `local-store.js`'s `allocateId` order — verify the slugs' order yields those ids, copying the sibling scenario's recordPath comment discipline).
  - `commit-messages-allowed`: derive the allow list from actual writer message shapes — read `plugin/bin/lib/issues/local-store.js` for its commit message prefixes and tidy's tidy-up commit shape (grep `plugin/skills/tidy/` for its commit message template), and include `'^init$'`, `'^seed base fixture$'`, `'^seed local work record: '`, `'^Backlog Refine: '` plus what you find. Document each allowed shape's source file in a comment.
  - `commit-count` ceiling (generous — ~14) and `tool-count` ceiling (~60), each with a comment explaining the calibration basis.
  This scenario cannot run locally (no `ANTHROPIC_API_KEY`) — state that in the task report; do NOT fabricate a run.
- [ ] **Step 4: Commit** — `Pin sweep orchestrator contracts — conformance test + never-invokes-build-machinery eval scenario (refs #1494)` + trailer.

---

## Verification (controller, after final task)

- Full `npm test` centrally (redirect to a file; flake rule: isolate-and-rerun single failing file before concluding).
- `wc -c` sweep across the five near-ceiling touched files.
- AC walk: AC1 (single run dir, one decisions.md, zero AskUserQuestion — satisfied by design: tidy suppression + specify headless + refine headless; assert prose pins green), AC2 (interpreted per ruling: sweep-level prose pins + `tests/bin-lib/issues/record-snapshot.test.js`'s existing `invalidateSnapshot` behavior coverage — an executable skill-run stub is not possible for a markdown skill in `node --test`), AC3 (eval scenario shipped; run disclosed as blocked on API key), AC4 (children's direct invocations unchanged — line-104 rule + CSC text pins), AC5 (per skill-graph ruling: `## sweep` section + children's CSC prose in place of duplicate reciprocal rows).
