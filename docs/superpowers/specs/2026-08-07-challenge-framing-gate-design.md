# Design: `/challenge` as an inline framing gate

**Date:** 2026-08-07
**Status:** Approved, pending decomposition into plans

## Problem

`/claude-tweaks:challenge` is structurally starved. The evidence, measured against this repo:

- **One brief has ever been produced.** `docs/plans/2026-07-08-worktree-directory-convention-brief.md`, committed 2026-07-08. Measured against maintenance cost: `git log --oneline --all -- skills/challenge/SKILL.md` returns 44 commits.
- **Its primary documented consumer does not read it.** `challenge/SKILL.md:253` claims the brief is "Read by `/superpowers:brainstorming` as input context." The installed superpowers 6.2.0 brainstorming SKILL.md (151 lines) contains no occurrence of "brief", "debias", or `docs/plans/`. Its only hook is Step 1's generic "explore project context — check files, docs, recent commits." The handoff is a one-directional reference into a third-party file this repo cannot edit.
- **The deletion contract has never fired.** `challenge/SKILL.md:255` says the brief is deleted by `/specify` Step 7. The one real brief is still on disk a month later.
- **The in-repo consumers are correct but starved.** `specify/record-creation.md:181,221,224`, `specify/decomposition-mode.md:23`, `build/SKILL.md:123`, and `wrap-up/config-updates.md:31` all read the brief correctly. They receive no input because briefs are not produced.
- **Nothing routes into it with force.** Both entry points (`capture/SKILL.md:187` routing Option 1, `:232` Next Actions Option 4) offer it as one option among several, neither marked Recommended. `/help`'s `status-scan.md:80` flags solution-baked titles, but it is a title-only signal rendered as a table row, not a route.
- **It contradicts itself.** Step 3 (`:179`) instructs "do NOT pre-filter lenses for 'relevance,' dispatch all 7." The Anti-Patterns table (`:287`) lists "Running all 7 lenses mechanically | Some problems only need 2-3 lenses."

The cost is 7 Sonnet proposers plus 1 Opus aggregator, spent before any solution work, to produce a document whose nominal primary reader never opens it.

The underlying idea is sound: the capture→specify path has no framing check anywhere in it. The defect is the **shape** — an artifact-producing standalone skill, in a repo where the things that reliably run are inline gates and scheduled sweeps.

## Approach

Convert `/challenge` from a brief producer into an inline framing gate, modeled on `/claude-tweaks:assess-agent-autonomy` — a multi-mode inline helper whose modes each Gather → Judge → Render two strict output lines, and whose callers act on the verdict.

The design constraint driving every choice below: **the reshape must not add user-facing prompts.** The current skill stops the user zero times because it never runs; a replacement that annotates every record and stops none strictly dominates it.

### Why not a new mode on `/assess-agent-autonomy`

Two reasons, either sufficient:

1. That skill explicitly disclaims generality — "any decision outside the call sites listed under 'When to Use' above — this is not a general-purpose risk service" (`assess-agent-autonomy/SKILL.md:38-39`).
2. It is defined as never invoked directly by a human (`:458`). This design keeps `--lens` as a human escape hatch, so `/challenge` must survive as a skill regardless. Given it survives, the mode belongs in it.

## Design

### 1. `/challenge` becomes two-mode

| Mode | Invoked by | Behavior |
|---|---|---|
| `framing-check` | `/claude-tweaks:specify` only, inline via `Skill()` | Gather → Judge → Render two lines. Omits `## Next Actions` per the existing Component-Skill Contract. |
| `--lens=<n[,n...]>` | A human, directly | Runs the named lens(es) in the main thread with no subagent dispatch, and returns the perspective in conversation. Writes no file. |

Deleted: full mode, quick mode, the seven-proposer MoA dispatch, the aggregator, the Brainstorming Brief schema, and the brief's save/delete lifecycle.

The seven lens definitions themselves are **retained** as the content of `--lens`. They are the substance of the skill; only the dispatch machinery around them goes.

This two-mode shape is the documented norm, not an anomaly — CLAUDE.md's Component-Skill Contract exists precisely for skills that are both component and human-invocable, and `/challenge` already carries that contract (`challenge/SKILL.md:275-279`).

### 2. Call sites — two, each alongside an existing `ceremony-check` call

`/specify` has two record-creation paths, and `ceremony-check` is already called from both. `framing-check` follows it to both:

- **`skills/specify/shaping-mode.md:57`** — the single-record path, reached from a captured record. This is the fast path and the primary target: `skill-graph.md:80` records capture→specify as "the primary capture→specify path," bypassing brainstorming entirely.
- **`skills/specify/record-creation.md:104`** — the per-leaf loop in decomposition mode.

Both sites already invoke `assess-agent-autonomy` in `ceremony-check` mode against a body held in memory, so `framing-check` adds a judgment call at a point that already makes one, with no additional fetch.

**Critical ordering constraint (shaping mode).** `shaping-mode.md:62` composes the record body and writes it **once** (`### Compose-then-write-once`). The framing annotation must be folded into that single compose pass. Applying it as a second edit after the write would both cost an extra API round-trip and break the section's stated discipline.

**Judged input (shaping mode).** Shaping mode preserves the user's original text in an `## Original request` block (`shaping-mode.md:20-32`, template at `:85`). `framing-check` judges the shaped body **and** that preserved original — the original is the un-reframed source text and is the better framing signal, since shaping may already have laundered solution-baked phrasing into neutral spec prose.

### 3. Output contract

```
FRAMING: open | solution-baked
RATIONALE: {one paragraph naming the specific content signal the verdict is based on}
```

**Inconclusive resolves to `open`.** This is the opposite direction from `assess-agent-autonomy`'s four modes, whose Error Handling section (`:446-454`) resolves ambiguity toward *more* caution. Here, more caution would mean manufacturing doubt about a framing that holds — which challenge's own Anti-Patterns table already forbids ("Inventing a flaw to look rigorous when the framing holds | Say so plainly when the lenses surface nothing — manufactured doubt is as useless as false agreement", `challenge/SKILL.md:291`).

State this inversion explicitly in the shipped skill, with the reason. A future consistency pass that "aligns" this mode with its siblings would silently turn the gate into a noise source.

**Judgment signals for `solution-baked`** (read from content, not from title keywords):

- The Deliverables name a specific technology, library, vendor, or mechanism as the thing to be built, while the Current State cites no measurement, profile, benchmark, or observed symptom that selects it over alternatives.
- The record's stated problem is a restatement of its own solution ("we need X" where X is the deliverable).
- The Acceptance Criteria can only be satisfied by one implementation, and the record does not say why the alternatives lost.

A record that names a technology **and** justifies it from observed evidence is `open`. Naming a solution is not itself the defect; naming one that was never traded off is.

### 4. Effect of a `solution-baked` verdict

The surfaced assumptions become bullets in the record's own `## Gotchas` section.

That section already exists on both paths (`shaping-mode.md:16` lists it among the five sections shaping mode writes; `spec-template.md` carries it for decomposition), and it is the same section `record-creation.md:224` currently fills from the brief. So this reuses a wired consumer rather than adding one.

This is the load-bearing difference from the current design. The brief fails because it lives in `docs/plans/` and requires *discovery* — a consumer must know to look. An annotation in the record body is read by `/specify`, `/build`, and `/flow` **by construction**, because reading the record body is step one of all three. Guaranteed reader, zero discovery cost, even when no human ever reads it.

### 5. Surfacing to a human — no new gate

`/claude-tweaks:backlog refine`'s Step 4 unified table (`refine-mode.md:160-183`) gains a **Framing** column.

The column is informational-only: it rides along with the table's existing single `AskUserQuestion` and is never gated behind its own. This follows the explicit precedent of the `Suggested Tier` column — "informational only — it rides along with the unified table, never gated behind its own `AskUserQuestion`, and is never itself written anywhere" (`refine-mode.md:175`).

Net user-facing prompt count added by this design across the whole system: **zero**. Consequently there is no new entry required on `_shared/auto-mode-contract.md`'s "not silenced" list, and no tension with CLAUDE.md's "don't invent new mid-flow stops in `auto` mode" rule.

### 6. Persistence: a single `framing:baked` label

For `/help` to flag these without re-deriving the judgment, the verdict needs to persist.

Stamp a **single label, `framing:baked`, on tripped records only.** No counterpart label — introducing a two-value family would put `framing:open` on the large majority of records as pure noise.

The precedent is `_shared/work-record.md`'s two existing one-member families: `Closure (1) | wontfix` (`:77`) and `Upstream (1) | upstream-candidate` (`:78`). Note that `parked` and `bot:blocked` are *not* precedents for this — each is a member of a two-label family (`Stage (2)` at `:73`, `Bot state (2)` at `:75`), so neither is presence-only in the sense meant here.

Registration requires three edits, not one:

1. `_shared/work-record.md`'s Label taxonomy table (`:67-79`) — a new `Framing (1) | framing:baked` row.
2. `_shared/label-bootstrap.md`'s `LABELS_JSON` — name plus a description of 100 characters or fewer, per `work-record.md:63-64`.
3. `_shared/work-record.md`'s per-skill write-authority table (`:95`) — add `framing:baked` to the `/specify` (shaper) row's writes column, alongside the `ceremony:*` entry it already carries.

Bootstrap before first write per `_shared/label-bootstrap.md`, exactly as `shaping-mode.md:57` already does for the `ceremony:*` pair.

`/help`'s `status-scan.md:80` then reads label presence instead of guessing from record titles — replacing a weaker derived signal with the stamped verdict.

Adding a family changes the taxonomy's family count. `work-record.md:62-63` already states counts by reference ("see the table for the current per-family and total counts"), which is the correct form per `[IL-40]` — but the plan must still sweep for any *restated* total elsewhere, since a keyword grep for one phrasing will not find a reworded restatement.

Under `work-backend: local-files`, the equivalent is a `facets.framing` value written by the same `writeRecord` call that `shaping-mode.md:107` already makes; unlike `facets.ceremony`, it is absent rather than defaulted when the verdict is `open`.

### 7. Removals and their reference sweeps

| Removed | Sites requiring update |
|---|---|
| Brief production, schema, and save/delete lifecycle | `challenge/SKILL.md:68,72,201,210,220,225,251`; `specify/record-creation.md:181,221,224`; `specify/decomposition-mode.md:23,228,254,262,274,304`; `build/SKILL.md:123,139`; `wrap-up/config-updates.md:31`; `tidy/SKILL.md:99`; `tidy/scan-procedures.md:96,107`; `help/context-flow.md:26,54,55,56` |
| MoA dispatch (7 proposers + 1 aggregator) | `challenge/SKILL.md` |
| Mode 4 — Layered MoA (`/challenge` is its only consumer) | `_shared/multi-agent-coordination.md:3,30,221ff`; `_shared/subagent-output-contract.md:90,148,208`; `_shared/auto-mode-contract.md:181` |
| ADR-candidate flagging sourced from the brief | `_shared/decision-records.md:42`; `wrap-up/config-updates.md:31` |

#### Executable code, not only prose

The reshape touches four code files. These were absent from this document's first draft and are the reason the change is larger than a documentation sweep:

| File | Change |
|---|---|
| `bin/lib/coordination.js` | Delete `MOA_AGGREGATOR_INSTRUCTION` (`:38`) and `buildMoADispatch` (`:247`), plus their `module.exports` entries (`:267`+). `/challenge` is the only consumer. |
| `tests/multi-agent-coordination.test.js` | Delete the Layered MoA block (`:496-525`) and the `/challenge` integration block (`:744-858`). This suite reads the **live** `skills/challenge/SKILL.md` at `:23` and asserts on the exact design being removed — seven proposers, the six-section brief schema, quick mode's two proposers, and a decision-log pattern derived from that live file. Per `[IL-80]` this is a scheduled failure timed to this migration, so the test edits belong in the same task as the code deletion, not in cleanup afterward. |
| `bin/lib/issues/record.js` | Add `FRAMING_BAKED: 'framing:baked'` to the `LABELS` constant (`:16-26`). |
| `bin/lib/issues/labels.js` + `bin/lib/issues/tests/labels.test.js` | Add the bootstrap payload. `ensureLabelPayload` (`:8-15`) throws at construction time on a description over 100 characters, so the cap is enforced rather than advisory. |

`tests/skill-conventions.test.js` constrains the `challenge/SKILL.md` rewrite and must keep passing unchanged: the skill count stays 33 (`:26` — `/challenge` survives), the canonical interaction directive must be preserved verbatim (`:29-31`), and `/challenge` is one of the eleven skills required to carry a one-line `Lifecycle:` marker (`:56-58`) and to **not** open with a fenced block within fifteen lines of its H1 (`:62-72`).

Plus lifecycle-chain and command-reference prose in: `capture/SKILL.md` (`:4,31,165,187,201,232,238`), `help/SKILL.md` (`:14,78,85,92`), `help/reference-card.md` (`:11,68,132,169`), `help/context-flow.md` (`:10,27,54`), `flow/SKILL.md` (`:14,304`), `flow/steps-and-gates.md:18`, `tidy/SKILL.md:14`, `research/SKILL.md` (`:22,99,100,106`), `build/SKILL.md:14`, `docs/skill-graph.md` (`:74,84`), `docs/getting-started.md` (`:9,11`), `docs/plugin-structure.md:33`.

**Roughly 18 files.** This requires decomposition into multiple plans, not a single pass.

#### Deliberately retained

- **`docs/plans/2026-07-08-worktree-directory-convention-brief.md` stays on disk.** `docs/decisions/0004-worktree-two-domain-convention.md:5` cites it as source context for a shipped ADR. Deleting it would orphan a decision record. It becomes a historical artifact, not a live pipeline input.
- **The ADR gate keeps its other three candidate sources** — `/build` Common Step 4.5 architectural deviations, `/deepen`'s `[ADR-candidate]` interface trade-offs, and tradeoffs accepted during `/review` and reflection (`wrap-up/config-updates.md:29-33`). Only the brief-sourced input is removed. That source has produced exactly one ADR in the repo's history, and that ADR already exists.

## Risks

**The §7 sweep is the highest-risk part of this change**, and it fails silently rather than loudly.

Per `[IL-10]` and `[IL-21]`, a task-scoped review cannot catch prose in an untouched file that still assumes briefs exist — every task's own diff will read as self-consistent. Per `[IL-93]`, prose describing a mechanism's old reach stays true-sounding while going incomplete, and keyword search cannot find a procedure whose defect is silence.

**There are three unrelated "brief" concepts in this repo, and only one is being removed.** This is `[IL-37]`: near-identical names, different categories. A bulk sweep on the bare word would eat all three.

| Concept | Home | Disposition |
|---|---|---|
| Brainstorming brief | `challenge` → `docs/plans/*-brief.md` | **Removed by this design** |
| Verification brief | `skills/wrap-up/verification-brief.md`, consumed by `/demo` | Untouched |
| Visual-review briefs | `skills/visual-review/*` | Untouched |

A bare-word case-insensitive sweep for `brief` matches **74 files** — it is a common English word ("keep it brief", "briefly") and is useless as a gate. The discriminating pattern, verified against the current tree, is:

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md" \
  skills/ docs/getting-started.md docs/plugin-structure.md docs/skill-graph.md bin/ tests/ \
  | grep -v "2026-08-07-challenge-framing-gate-design"
```

It returns the authoritative worklist and correctly excludes the other two concepts. Running it during authoring is what surfaced `tidy/SKILL.md:99`, `tidy/scan-procedures.md:96,107`, and `build/SKILL.md:139` — three sites this document's first draft missed.

Note that `docs/getting-started.md`, `docs/plugin-structure.md`, and `docs/skill-graph.md` do **not** match that pattern: they reference `/challenge` without naming the brief. Reference sweeps for the skill itself therefore need a separate `challenge` pattern, and neither sweep substitutes for the other.

Remaining mitigations to bake into the plans from task one:

- A case-insensitive sweep for `MoA`, `Layered MoA`, `proposer`, and `aggregator` — 9 files at baseline, tractable as a bare-word sweep because the vocabulary is not generic English.
- Exclude this design document and any generated plan from every sweep, per `[IL-28]` — a document describing the removal necessarily quotes the removed terms verbatim.
- A whole-branch review before the version bump, per CLAUDE.md's Releasing section — a producer and its consumers sit in different files here by construction, so per-task review cannot see the pair.

**Second risk: the gate's judgment quality is unproven.** Unlike the modes it is modeled on, `framing-check` has no calibration table drawn from real cases. The signals in §3 are derived from the lens definitions, not from observed misfires. Expect the first few runs to need recalibration, and prefer `open` while calibrating — a missed flag costs nothing that the current design does not already cost.

## What this design does not do

It removes the ability to be **stopped** before building on a baked premise. A `solution-baked` record still gets built — correctly implementing a possibly-wrong premise — carrying a Gotcha noting the premise was never validated. The save occurs only if the row is caught in `/backlog refine`, or if the building agent takes its Gotchas seriously.

This is the accepted cost of the no-new-prompts constraint. It is not a regression: the current design stops the user zero times, because it never runs.
