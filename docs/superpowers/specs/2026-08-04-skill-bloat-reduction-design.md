# Skill bloat reduction — Approach A: evict author-facing meta from the runtime payload

**Date:** 2026-08-04
**Status:** Approved design, not yet planned
**Baseline commit:** `fe393e30` — every measurement below was taken against this tree
**Scope:** Approach A only. Approach B is [#119](https://github.com/thomasholknielsen/claude-tweaks/issues/119), Approach C is [#120](https://github.com/thomasholknielsen/claude-tweaks/issues/120).

All sizes in this document use KB = 1024 bytes.

## Problem

`skills/` holds 2.8 MB across 214 files. That total is misleading on its own, because almost
none of it is resident at once — so the first job of this design is to say what actually
costs something.

| What | Size | Load frequency |
|---|---|---|
| `CLAUDE.md` | 47.5 KB (98 Don't rules = 23.9 KB) | every session **and** every dispatched subagent |
| 32 skill `description` fields | 10.4 KB | every session |
| one `SKILL.md` | mean 29.1 KB, max 62.1 KB | on invocation |
| per-skill sub-files | 1,123 KB | only when `Read` |
| `skills/_shared/` | 354 KB | on read, or inlined per dispatched agent |

Eight `SKILL.md` files exceed CLAUDE.md's 40 KB soft ceiling: `review` 62.1, `wrap-up` 59.3,
`init` 58.4, `dispatch` 50.4, `flow` 49.7, `code-health` 44.7, `stories` 41.6,
`journey-health` 41.2.

### The finding this design turns on

CLAUDE.md already classifies the largest single category of `SKILL.md` content:

> Conceptually: Next Actions is the user-facing handoff after the last workflow Step; CSC,
> Anti-Patterns, and Relationship are **meta-documentation for skill authors** and should
> come last.

That self-declared author-facing material is **200 KB — 21% of all `SKILL.md` bytes — and it
is loaded into the model's context on every skill invocation.** Per-skill shares reach 51%
(`routine`), 47% (`backlog`), 45% (`help`), 38% (`visual-review`).

So the dominant lever is not deletion. It is **eviction from the invocation payload**: the
knowledge survives for maintainers and for `/claude-tweaks:harness-health`, but stops being
billed on every run.

### Why this is not the extraction `[IL-76]` warns about

`[IL-76]` says not to treat bytes moved out of a file as an extraction's saving, and to
measure what each resolved mode loads afterward. The distinguishing test is whether anything
reads the destination at runtime. `init/bootstrap-steps.md` grew to 86 KB behind 18
section-naming stubs, so every mode paid the whole file. Here **no stub cites the
destination** — `docs/skill-graph.md` is read by humans and by `/harness-health`, never by a
skill mid-execution. The saving is real, and the check is stated as an explicit acceptance
criterion in Phase 2 rather than assumed.

### Precedent in this repo

This exact migration has already been done once here, for the same reason.
`skills/_shared/auto-mode-contract.md`:

> Per-skill `## Auto-mode behavior` tables in SKILL.md are deprecated as of v4.7.0 — the
> silences table is the single source of truth. Drift between two copies (skill-local and
> contract-canonical) was the failure mode they were meant to prevent and instead enabled.

Approach A applies that same move to the Relationship table.

## Measured levers

| Lever | Current | Action | Saving |
|---|---|---|---|
| Relationship tables | 127.6 KB / 510 rows | Three-way triage (below) | ~90–110 KB (pre-classification estimate) |
| Anti-Patterns | 72 KB / 379 rows | **Compress in place, do not evict** | ~29 KB |
| Interaction-style directive | 570 B × 32 files = 17.8 KB | **Compress in place** (see below), 570 B → 357 B | **6,816 B — shipped, Phase 1** |
| ASCII lifecycle diagrams | 13,502 B across all 32, but only 3,668 B mechanically replaceable | Replace the 10 linear ones with a one-line position marker; leave the other 22 alone | **2,685 B — shipped, Phase 1** |

**Total ~130–150 KB, roughly 14–16% of `SKILL.md` bytes.** Phase 1 banked 9,116 B of it
(the two shipped rows above, net of a +467 B `/help` diagram widening and −82 B of subtitle
trims); the Relationship table is the rest.

> **Row count corrected, 2026-08-04.** This document first stated 482 rows / 128 KB. A
> re-measurement before Phase 2 planning found **510 rows / 127.6 KB**, confirmed by two
> independent extractors (a Node section-walker and an `awk` pass) agreeing exactly. The
> original method could not be reconstructed, so the discrepancy is unexplained rather than
> attributed; 510 is the figure Phase 2 plans against. Length distribution likewise moves
> from 56/298/128 to **59 under 120 chars / 315 at 120–300 / 136 over 300**.

### The diagrams are not uniform

CLAUDE.md's structure convention calls item 4 an "ASCII lifecycle position diagram", but only
10 of 32 actually are one — a linear chain with a `^^^^ YOU ARE HERE ^^^^` marker, replaceable
mechanically by a neighbours-only line (`Lifecycle: /test → **/review** → /wrap-up`). The
canonical full chain already lives in `/claude-tweaks:help`.

| Shape | Count | Bytes | Treatment |
|---|---|---|---|
| Linear chain + `YOU ARE HERE` | 10 | 3,668 | Mechanical replacement (Phase 1) |
| Linear with ASCII art (`tidy`, `help`, `build`, `flow`, `ledger`) | 5 | 2,860 | Leave alone |
| Non-linear | 17 | 6,974 | Leave alone |

The remaining 22 document mechanism, not position, and it exists nowhere else in one place:
`code-health`'s is its findings pipeline (`findings → validate → file issue → /specify →
/build`), `browse`'s is its consumer set, `help`'s is a cycle, `dispatch`'s runs 16 lines.
Compressing those is judgment work with a poor ratio — 9.6 KB spread across 22 files, each
needing its own call — and is explicitly out of scope.

### What ships, and why it constrains the levers

`evals/runner.js` defines the plugin payload as
`PLUGIN_SNAPSHOT_DIRS = ['.claude-plugin', 'skills', 'agents', 'hooks', 'bin', 'commands']`.
**`CLAUDE.md` and `docs/` do not ship.** Two consequences:

- **The interaction-style directive cannot be hoisted into CLAUDE.md.** Doing so would strip
  it from all 32 skills in every consuming project with nothing replacing it — a functional
  regression, not a byte saving. It is compressed in place instead: the original 570 B
  directive states its four rules discursively, and the 357 B version shipped in Phase 1
  carries all four, saving 6,816 B across 32 files while remaining inline where it is needed.
  (The first draft cut it to 327 B by dropping "resolve each before showing the next" — a real
  functional regression that the whole-branch review caught and reverted. 357 B is the floor
  that preserves all four rules.)
- **`docs/skill-graph.md` is correctly out of the shipped payload.** That is the point — it is
  maintainer documentation for this repo, never read by a skill mid-execution, and consuming
  projects have no use for a map of claude-tweaks' internal wiring.

Relationship rows by length: 59 under 120 chars (label-like), 315 at 120–300 (sentence),
**136 over 300 chars (grown into paragraphs)**.

### A fourth class the triage did not name: rows targeting `_shared/*.md`

**111 of the 510 rows (27.1 KB) do not point at another skill at all** — their first cell is a
`_shared/*.md` contract file. `auto-mode-contract.md` alone accounts for 21, `work-record.md`
and `subagent-output-contract.md` for 10 each. These are contract citations wearing a
relationship table's clothes, and they have a property the skill-to-skill rows lack: whether
the skill *already* cites that file in its own step bodies is mechanically decidable.

| | Rows | Bytes |
|---|---|---|
| Shared file is **already cited** in the skill's step bodies | 77 | 19.2 KB |
| The Relationship row is the **only** mention in the whole `SKILL.md` | 34 | 7.9 KB |

The 77 are a strong prior for class 3, **not a verdict** — a duplicated pointer is not a
duplicated payload. A six-row sample splits: `build`, `dispatch`, and `code-health` add nothing
their bodies do not already say (`dispatch` says it twice more, at L98 and L424), but `tidy`'s
row carries "the Step 6 aggressiveness table implements the contract's reversibility floors" —
operative content whose home is Step 6 — and `capture`'s names a permission-matrix row
(`by:capture` + Type only) that may appear nowhere else. The prior goes to the classification
agents as evidence; the verdict stays theirs, then the human's.

The 34 "only mention" rows are the opposite signal: deleting one silently removes a skill's
sole pointer to a contract it is required to follow. They are class 2 by default.

## The three-way triage

Paragraph-length Relationship rows are not navigation. They carry live operative contract:

> `/claude-tweaks:flow` — Invoked BY /flow as the implementation step — flow constrains
> /build to `subagent` execution (batched pauses contradict flow's hands-off contract) and
> passes the pipeline run directory via `PIPELINE_RUN_DIR`…

A bulk move would evict runtime behavior into an author document. But the correct fix is
better than "keep it": a behavioral contract sitting in a trailing Relationship table is
already misplaced. It belongs in the step that implements it, where the model reads it during
execution. Relocating it removes the duplicate **and** improves adherence.

| Class | Signal | Destination |
|---|---|---|
| **Navigational** | "A produces what B consumes"; "runs before/after"; pure ordering | `docs/skill-graph.md`, stated **once** per edge |
| **Operative** | Names a step number, config key, env var, gate, label, or execution constraint | Into that step's body; a short edge remains in the graph |
| **Dead** | Restates what the other side already documents, or describes a path that no longer exists | Delete |

Spot-check of the method: `review`'s `/wrap-up` row asserts that wrap-up Step 10 reads
review's `### Visual Review` status. `wrap-up/verification-brief.md` documents that gate
independently, so the row is class 3. One sample is not a rate — classification is a
deliverable, not an assumption.

**Classification runs as batched subagent work, one agent per skill, returning a per-row
verdict table for human approval before any edit is applied.** Agents are dispatched
**edit-only with no git access**, commits made centrally (`[IL-43]`, `[IL-51]`).

## What deliberately does not move

**Anti-Patterns stay inline.** CLAUDE.md groups them with Relationship as author-facing, but
that grouping is wrong on the evidence. Relationship rows are inert during execution;
Anti-Patterns are runtime guardrails — "Skipping the test gate to save time → broken code
invalidates the entire review" fires while the model works. Removing a negative constraint
degrades **silently**: you do not observe the model doing the thing you stopped forbidding.
That is the worst possible failure shape for a change whose premise is "impact to function
must be mostly irrelevant."

The keep-criterion originally proposed ("cited by a sibling, or backed by an `[IL-nn]` entry")
was measured and rejected: there are only **9 citations** of Anti-Patterns tables repo-wide
(concentrated on `/browse`), and **zero** Anti-Pattern rows reference an incident-log entry.
The criterion selects almost nothing, so applying it would have evicted all 379 rows.

Instead: compress in place. 379 rows at ~190 B mean, many spending two sentences where one
clause serves, some restating a rule the step body already carries. Target ~40%, 72 KB → ~43 KB.

**CLAUDE.md's 98 Don't rules stay as they are.** The project's own governance already
reserves removal for `/claude-tweaks:harness-health`'s rule-expiry check, acting only on
positive evidence a hazard can no longer occur. The rules are also already tight — median
226 chars, p90 281, with a single 1,294-char outlier (the sub-file extraction rule itself).
Low yield, high blast radius, per-agent multiplier. Out of scope here.

## `docs/skill-graph.md`

One file. Each edge stated **once**, not twice — this is what kills the drift class that the
bidirectional convention generates (`[IL-17]`, `[IL-52]`).

Proposed shape, to be settled in planning:

| From | To | Relationship |
|---|---|---|
| `/build` | `/review` | Produces the code and journey files review evaluates |
| `/review` | `/test` | Gates on `TEST_PASSED=true`; auto-triggers `/test` standalone |

Rendering a per-skill view becomes a read of one file rather than a scan of 32.

## Verification

No test in the suite reads a single word of skill prose, in either direction. Verification
must therefore be constructed, not assumed.

1. **Eval baselines, before and after.** Run all 6 scenarios before Phase 1 and after each
   phase. Quality gate: no per-assertion regression. Cost signal:
   `cache_creation_input_tokens` should fall. Coverage is 5 of 32 skills, but includes
   `review` (62 KB), `dispatch` (50 KB), and `code-health` (44 KB) — three of the eight
   over-ceiling files. **Budget:** `evals/README.md` states $0.44–$5 per run, but
   `history.jsonl` records a `backlog-refine-permission-matrix-compliance` run at **$17.47 /
   32 minutes**. A full before/after sweep is plausibly $50–100.
2. **The completeness check CLAUDE.md's own extraction rule already mandates** — confirm every
   substantive original line still appears somewhere in the new file set. This is the
   load-bearing check for Phase 2: a relocated operative row that lands nowhere is exactly
   the silent failure this design must not produce.

   > **Phase 1 outcome — the checker as built cannot carry this.** `bin/lib/skill-audit/identifiers.js`
   > shipped in Phase 1, and the final whole-branch review measured its sensitivity against a
   > real case: deleting `skills/review/SKILL.md`'s entire Relationship table, a 100% loss of
   > 45 identifiers. It reported **4/45 lost (9%)** against the whole tree, and **11/45 (24%)**
   > against the rest of its own file. Common identifiers (`PIPELINE_RUN_DIR`, `auto:merge`,
   > `subagent`) recur everywhere, so they always read as surviving no matter what happened to
   > the row that carried them.
   >
   > **Phase 2 must not adopt it unchanged.** Re-spec it as a per-identifier *occurrence-count*
   > delta scoped to the named relocation destination, rather than binary presence against the
   > whole tree. Use the same "delete `review`'s whole Relationship table" experiment as its
   > acceptance test — it must report near-100% loss, not 9%. This supersedes the narrower
   > deferred finding about unanchored substring matching, which is a rounding error beside it.
3. **Make the structural tests fail loudly rather than pass silently.** Removing
   `## Relationship to Other Skills` breaks
   `assert.ok(idx('## Relationship to Other Skills') > 0)` in
   `bin/lib/health-core/tests/skill-md-house-checks.js`. That is a feature, not an obstacle.
   Note the current coverage is only `code-health`, `docs-health`, `harness-health`,
   `journey-health`, and `research` — not all 32 — and that file's own header documents three
   unmigrated duplicate copies plus a latent `idx()` bug.
4. **Same-change-set dependency** (`[IL-02]`, `[IL-60]`), re-pointed in Phase 2, not after:
   `skills/_shared/auto-mode-contract.md`'s rule that each pipeline-participating skill
   "MUST reference this file in its Relationship table". That rule governs this repo's own
   skills and breaks the moment the tables leave.

   `skills/harness-health/library-shape-analysis.md`'s overlap check also cites Relationship
   tables as evidence, but it is **not** a dependency: that pass reads the *consuming
   project's* `.claude/skills/*/SKILL.md`, not claude-tweaks' own, so evicting these tables
   does not affect it. Verified by reading the file's candidate-narrowing section, which
   scans `.claude/skills/*/SKILL.md`.

Verification greps are written per `[IL-16]`, `[IL-28]`, `[IL-39]`, and `[IL-66]`:
whitespace-flexible (prose is hard-wrapped), path-anchored exclusions, and this design
document itself excluded from any "the old pattern is gone" sweep.

## Phases

Risk-ascending. Phase 1 first is deliberate: it banks ~10.5 KB with zero judgment calls and
proves the convention/test update path works before Phase 2 depends on it.

| Phase | Work | Judgment |
|---|---|---|
| **0** | Capture eval baselines; build the completeness checker | None |
| **1** | Compress the interaction directive in all 32 copies; replace the 10 linear lifecycle diagrams; update CLAUDE.md conventions and the structural tests | **None** — mechanical, ~10.5 KB |
| **2** | Relationship triage: classify → human-approve the verdict table → apply. Build `docs/skill-graph.md`; relocate operative rows into step bodies; re-point the two dependencies above | High, gated |
| **3** | Anti-Pattern compression, 72 KB → ~43 KB | Medium |

Each feature phase carries its own explicit version-bump step (`[IL-12]`). Because the branch is
long-running across 32 skills, check `git log --oneline <branch>..main` periodically rather
than back-loading conflict resolution (`[IL-20]`).

**The marketplace mirror runs after the merge, not on the branch.** `[IL-59]` says not to pause
between the two repo pushes, and Phase 1's plan read that as "do both on the feature branch" —
which is wrong: the marketplace `source` is an unpinned git URL tracking this repo's `main`
HEAD, so mirroring from an unmerged branch publishes a version that does not exist upstream.
The two pushes are still one action; that action just begins once the bump has landed on `main`.
CLAUDE.md's Releasing section is worth a clause saying so, since the hazard is a wording gap
rather than a novel failure.

### Phase 1 outstanding

- **Mirror v6.33.0** to `thomasholknielsen/claude-tweaks-marketplace` once the branch merges.

## Risks

| Risk | Mitigation |
|---|---|
| An operative row is relocated nowhere and silently lost | Completeness check (verification 2) is a Phase 2 acceptance criterion, not a review step |
| Classification agents misjudge navigational vs operative | Verdict table is human-approved before any edit; agents are edit-only |
| Cross-skill awareness degrades once the tables are gone | `docs/skill-graph.md` retains every edge, stated once. Operative rows do not leave the payload at all — they move into the step bodies that implement them, which is where they belong |
| Eval coverage misses a regression in the 27 uncovered skills | Accepted and stated. The 5 covered skills include 3 of the 8 largest; the completeness check is the safety net for the rest |
| Bloat regrows after the cleanup | Out of scope here by design — that is [#120](https://github.com/thomasholknielsen/claude-tweaks/issues/120), sequenced last so its thresholds calibrate against the post-cleanup state |

## Out of scope

- **[#119](https://github.com/thomasholknielsen/claude-tweaks/issues/119)** — editorial prose
  diet (provenance narration, self-commentary, defensive restatement, degenerate tables) over
  the eight over-ceiling files. Sequenced after A, when those files are smaller and more
  coherent to read.
- **[#120](https://github.com/thomasholknielsen/claude-tweaks/issues/120)** — bloat detection
  in `/harness-health` plus an eval context-cost regression gate.
- CLAUDE.md's 98 Don't rules — governed by `/harness-health`'s rule-expiry mechanism.
