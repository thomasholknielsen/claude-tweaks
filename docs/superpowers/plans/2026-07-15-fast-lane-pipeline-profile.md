# Fast-Lane Pipeline Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `risk:low`/`effort:low`-shaped work records a proportionately cheap pipeline shape by deciding, once at materialize time, how much retrospective and documentation ceremony a record's content deserves — instead of leaving each wrap-up step to re-derive that judgment ad hoc.

**Architecture:** A new 4th mode (`ceremony-check`) on `/claude-tweaks:assess-agent-autonomy`, invoked from `flow/materialize.md`. Its verdict becomes a per-record `ceremony:` header field, folded at the Manifesto step into a 9th `config.yml` lever (`ceremony-profile`) that build/wrap-up steps read instead of re-judging triviality themselves.

**Tech Stack:** Markdown skill-file edits only (prose procedures) — no new JavaScript modules. The one existing pure function this plan reuses, `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles`, already exists and is already fully tested by `assess-agent-autonomy`'s own plan; this plan feeds it a different pattern list at one call site, requiring no new code or tests.

## Global Constraints

- Full design doc, approved and committed: `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` — read it before starting; every task below implements a specific section of it.
- `ceremony-check` runs unconditionally for every record at materialize time — no pre-filtering to "borderline" records, matching `grant-check`'s existing principle. Do not add a mechanical pre-filter deciding when to invoke it.
- `risk:`/`effort:` labels are signal to `ceremony-check`, never a hard gate — a record can score `fast-lane` or `standard` independent of its own scoring labels (see the design doc's calibration examples).
- The escape hatch (Task 5) is one-directional and never retroactive: a mid-run downgrade from `fast-lane` to `standard` never re-runs an already-skipped build-side step (Plan Audit, Architecture Alignment) — it only changes what Steps 6/7 do from that point forward.
- Every mode's/step's ambiguity handling defaults to the **conservative** outcome (`standard`, full ceremony) — never resolve uncertainty toward less ceremony. This applies to `ceremony-check` itself and to the bundle-fold (a record missing the `ceremony:` header field folds in as `standard`).
- This design does **not** touch auto-merge eligibility, blast-radius caps, dispatch's retry ceiling, claim protocol, or Journeys (Build Common Step 6) — do not modify those in service of this plan.
- Tasks 1 and 7 depend on `skills/assess-agent-autonomy/SKILL.md` (and, for Task 7's catalog-doc sub-part, its own README.md/`skills/help/reference-card.md` entries) already existing from `docs/superpowers/plans/2026-07-15-assess-agent-autonomy.md`'s own execution — verify the stated precondition at the start of each before proceeding; if unmet, stop and wait rather than guessing at content that isn't real yet.
- Working Directory Discipline applies to every step below: confirm `pwd` and `git rev-parse --show-toplevel` resolve to your worktree before any commit.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes). Reference the design doc's motivation where relevant, never invent new justification. This work has no associated GitHub record yet — do not invent a `refs #N` placeholder in commit messages (see Task 8's closing note for what to do if you want this tracked through the record system).

---

### Task 1: Add `ceremony-check` mode to `assess-agent-autonomy`'s skill file

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md`

**Interfaces:**
- Produces: a 4th inline-invocable mode, `ceremony-check`, alongside the existing `grant-check`/`merge-check`/`failure-check`. Output contract: `CEREMONY: fast-lane | standard` + `RATIONALE: {paragraph}`.
- Consumes: `bin/lib/issues/tier.js`'s `extractRiskEffort` (already used by `grant-check`, unchanged).

- [ ] **Step 1: Verify the precondition**

```bash
pwd
git rev-parse --show-toplevel
test -f skills/assess-agent-autonomy/SKILL.md && grep -q "## Mode: failure-check" skills/assess-agent-autonomy/SKILL.md && echo "OK: file exists with expected structure" || echo "BLOCKED: skills/assess-agent-autonomy/SKILL.md missing or lacks the failure-check section — wait for docs/superpowers/plans/2026-07-15-assess-agent-autonomy.md's Task 2 to land before starting this task"
```

If `BLOCKED`, stop this task and do not proceed to Step 2 — do not guess at the file's content.

- [ ] **Step 2: Update the frontmatter description**

Find:

```markdown
description: Use when triage or dispatch need a content-aware trust verdict instead of a mechanical label lookup — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule. Inline helper, never invoked directly by a human. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification.
```

Replace with:

```markdown
description: Use when triage or dispatch need a content-aware trust verdict instead of a mechanical label lookup, or when flow's materialization step needs a content-aware ceremony-depth verdict — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule, ceremony-check informs flow's per-record wrap-up ceremony depth. Inline helper, never invoked directly by a human. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification, ceremony profile, fast-lane.
```

- [ ] **Step 3: Update the intro paragraph and call-site diagram**

Find:

```markdown
Three-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:triage` or `/claude-tweaks:dispatch`:

```
/claude-tweaks:triage Step 2        [ grant-check ]  -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge  [ merge-check ]   -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle      [ failure-check ] -> CLASSIFICATION + NOTIFY_NOW
```
```

Replace with:

```markdown
Four-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:triage`, `/claude-tweaks:dispatch`, or `/claude-tweaks:flow`:

```
/claude-tweaks:triage Step 2          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:flow materialize.md    [ ceremony-check ] -> CEREMONY: fast-lane | standard
```
```

- [ ] **Step 4: Update "When to Use"**

Find:

```markdown
## When to Use

- `/claude-tweaks:triage`'s Step 2 needs a grant recommendation for a worklist record.
- `/claude-tweaks:dispatch`'s Auto-merge gate needs a merge-or-human verdict for a clean, reviewed run.
- `/claude-tweaks:dispatch`'s Settle step needs to classify why a run failed.

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:triage`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), or any decision outside
these three call sites — this is not a general-purpose risk service.
```

Replace with:

```markdown
## When to Use

- `/claude-tweaks:triage`'s Step 2 needs a grant recommendation for a worklist record.
- `/claude-tweaks:dispatch`'s Auto-merge gate needs a merge-or-human verdict for a clean, reviewed run.
- `/claude-tweaks:dispatch`'s Settle step needs to classify why a run failed.
- `/claude-tweaks:flow`'s materialization step needs a ceremony-depth verdict for a record, so build
  and wrap-up know how much retrospective/documentation ceremony it deserves.

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:triage`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), deciding auto-merge
eligibility or blast-radius caps (that's still `merge-check` alone — `ceremony-profile` and
`auto:merge` are independent axes), or any decision outside these four call sites — this is not a
general-purpose risk service.
```

- [ ] **Step 5: Update the Input section's mode enum**

Find:

```markdown
`$ARGUMENTS` is `{mode} #{n}`, where `mode` is one of `grant-check` | `merge-check` |
`failure-check` and `#{n}` is the record's issue number (used to fetch the record body for
`grant-check`; used for reference/logging in `merge-check`/`failure-check`'s rendered output).
```

Replace with:

```markdown
`$ARGUMENTS` is `{mode} #{n}`, where `mode` is one of `grant-check` | `merge-check` |
`failure-check` | `ceremony-check` and `#{n}` is the record's issue number (used to fetch the
record body for `grant-check`/`ceremony-check`; used for reference/logging in
`merge-check`/`failure-check`'s rendered output).
```

- [ ] **Step 6: Insert the `ceremony-check` mode section**

Find (the end of the `failure-check` mode section, immediately before Error Handling):

```markdown
### Step 3: Render

```
CLASSIFICATION: correctness | transient | ambiguous
NOTIFY_NOW: true | false
RATIONALE: {one paragraph}
```

The caller (dispatch's Settle step) is responsible for acting on `CLASSIFICATION` — revoking
`auto:merge` for `correctness`/`ambiguous`, preserving it for `transient` — and for the
retry-ceiling bookkeeping, which runs unconditionally regardless of this mode's output (see
`skills/dispatch/SKILL.md`'s Settle step).

## Error Handling
```

Replace with:

```markdown
### Step 3: Render

```
CLASSIFICATION: correctness | transient | ambiguous
NOTIFY_NOW: true | false
RATIONALE: {one paragraph}
```

The caller (dispatch's Settle step) is responsible for acting on `CLASSIFICATION` — revoking
`auto:merge` for `correctness`/`ambiguous`, preserving it for `transient` — and for the
retry-ceiling bookkeeping, which runs unconditionally regardless of this mode's output (see
`skills/dispatch/SKILL.md`'s Settle step).

## Mode: ceremony-check

**Called from:** `/claude-tweaks:flow`'s materialization step (`skills/flow/materialize.md`), once
per record, immediately alongside the existing `risk:`/`effort:` header-field population — every
record, every materialize, no pre-filtering to "borderline" records.

### Step 1: Gather

Reuses the same record body/labels already fetched during materialize's Resolution step — no
separate fetch needed:

```bash
node -e "const {extractRiskEffort}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/tier.js');
  const d=require('/tmp/materialize-record-${N}.json');
  console.log(JSON.stringify(extractRiskEffort(d.labels)))"
```

### Step 2: Judge

Read the record's full body (Current State / Deliverables / Acceptance Criteria) directly —
`risk:`/`effort:` labels are signal, not a gate, the same non-label-bound judgment principle
`grant-check`/`merge-check` already establish ("this isn't a one-directional tightening"):

- Does the Deliverables/Acceptance Criteria describe a small, self-contained change with an obvious
  test story (a bug fix, a narrow migration, a single-module addition)? That supports `fast-lane`
  regardless of the record's own `risk:`/`effort:` labels.
- Does the record describe a change with real knowledge-capture value even though the code-level
  risk is low — multiple call sites across packages, a public-surface rename or CLI-facing
  decision, a migration retiring a module? That supports `standard` even when labeled
  `risk:low`/`effort:low`.
- Is the record's Deliverables a pure prose/comment/documentation correction with no behavioral
  surface at all? That supports `fast-lane` regardless of labels.
- A missing Current State/Deliverables/Acceptance Criteria section, or an unresolved
  `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job to catch — that's the
  materialization hard gate's own job, which runs before this mode regardless of its output.

### Step 3: Render

Output ONLY these lines, no preamble:

```
CEREMONY: fast-lane | standard
RATIONALE: {one paragraph, naming the specific content signal the verdict is based on}
```

If nothing in the record's content clearly supports `fast-lane`, output `standard` — the same
conservative-on-ambiguity principle as this skill's other three modes (see Error Handling).

## Error Handling
```

- [ ] **Step 7: Update the Error Handling section**

Find:

```markdown
If this skill cannot render a clear verdict for any reason (malformed input, an inconclusive read),
default to the conservative outcome for whichever mode was running: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`. Never resolve ambiguity toward more autonomy — a
missed auto-merge costs a human a click; a wrongly-granted one could ship something bad.
```

Replace with:

```markdown
If this skill cannot render a clear verdict for any reason (malformed input, an inconclusive read),
default to the conservative outcome for whichever mode was running: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`; `ceremony-check` → `CEREMONY: standard`. Never
resolve ambiguity toward more autonomy or less ceremony — a missed auto-merge or a fuller wrap-up
pass costs a human a click or a few extra minutes; a wrongly-granted shortcut could ship something
bad or under-reflect on real complexity.
```

- [ ] **Step 8: Update the Component-Skill Contract**

Find:

```markdown
## Component-Skill Contract

`/claude-tweaks:assess-agent-autonomy` is **always** a component skill — it is never invoked
directly by a human, and never renders a `## Next Actions` block. Its only callers are
`/claude-tweaks:triage` (Step 2, `grant-check`) and `/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`).
```

Replace with:

```markdown
## Component-Skill Contract

`/claude-tweaks:assess-agent-autonomy` is **always** a component skill — it is never invoked
directly by a human, and never renders a `## Next Actions` block. Its only callers are
`/claude-tweaks:triage` (Step 2, `grant-check`), `/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`), and `/claude-tweaks:flow` (materialization step,
`ceremony-check`).
```

- [ ] **Step 9: Add an Anti-Patterns row**

Find:

```markdown
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The calling agent already has the diff/review-findings/failure-output in its own context — a subagent restart only pays to re-derive what's already known. |
```

Replace with:

```markdown
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The calling agent already has the diff/review-findings/failure-output in its own context — a subagent restart only pays to re-derive what's already known. |
| Treating `ceremony-check`'s verdict as a merge-safety signal | `ceremony-profile` and `auto:merge` are independent axes — a `fast-lane` record can still fail `merge-check` and fall back to a human-reviewed PR (this is exactly what happened to #18 before `merge-check` existed, for an unrelated reason). Never let ceremony depth influence merge eligibility or vice versa. |
```

- [ ] **Step 10: Add a Relationship table row**

Find:

```markdown
| `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` | The full design rationale, motivation (the #18/#19 evidence), and calibration examples this skill's judgment procedures are anchored against. |
```

Replace with:

```markdown
| `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` | The full design rationale, motivation (the #18/#19 evidence), and calibration examples this skill's judgment procedures are anchored against. |
| `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` | Design rationale and calibration examples for `ceremony-check` specifically, and for how `/claude-tweaks:flow`/`/claude-tweaks:build`/`/claude-tweaks:wrap-up` consume its verdict via the `ceremony-profile` lever. |
| `/claude-tweaks:flow` | Calls `ceremony-check` inline (not a fresh Task dispatch) once per record during materialization (`skills/flow/materialize.md`) — the verdict becomes that record's `ceremony:` header field, later folded into the `ceremony-profile` Manifesto lever. |
```

- [ ] **Step 11: Self-review against the design doc**

This is a prose deliverable — there is no `pytest`-style test cycle. Re-read
`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`'s `ceremony-check` section
and confirm line-for-line:

- Input/Output blocks match the design doc's Output block exactly (`CEREMONY: fast-lane | standard`
  + `RATIONALE`).
- All three calibration examples from the design doc are represented in Step 2's judgment guidance
  (the #18-shaped example, the #19-shaped example, the pure-documentation example).
- The Error Handling addition matches the design doc's Error Handling section's conservative
  default (`standard`) exactly.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline. No need to re-review after fixing — just fix and move on.

- [ ] **Step 12: Commit**

```bash
git add skills/assess-agent-autonomy/SKILL.md
git commit -m "Add ceremony-check mode to assess-agent-autonomy

Fourth mode alongside grant-check/merge-check/failure-check — judges
how much wrap-up ceremony a record's actual content deserves, called
from flow's materialization step. Not yet wired to any caller — Task 2
does that. See docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md."
```

---

### Task 2: Wire `ceremony:` header field into `flow/materialize.md`

**Files:**
- Modify: `skills/flow/materialize.md`

**Interfaces:**
- Consumes: `/claude-tweaks:assess-agent-autonomy`'s `ceremony-check` mode (Task 1).
- Produces: the `ceremony:` materialized-header field, consumed by Task 3 (manifesto.md's bundle-fold).

- [ ] **Step 1: Add `ceremony:` to the pinned header format**

Find:

```markdown
## The pinned header format (single definition — materialize.md owns it)

```markdown
---
record: {n}
origin: {code-health|harness-health|journey-health|capture|human}
risk: {low|medium|high}            # omitted when unscored
effort: {low|medium|high}          # omitted when unscored
grants: [build, merge]             # as held at materialization time; may be [build] or []
fingerprint: {fp}                  # omitted when none
surface: {web|mobile|desktop|backend|infra}
design-intent: {value}             # omitted for backend/infra
parked-at-shaping: true            # omitted unless the record was parked when shaped
---
{record body verbatim}
```
```

Replace with:

```markdown
## The pinned header format (single definition — materialize.md owns it)

```markdown
---
record: {n}
origin: {code-health|harness-health|journey-health|capture|human}
risk: {low|medium|high}            # omitted when unscored
effort: {low|medium|high}          # omitted when unscored
ceremony: fast-lane                # omitted when standard — see ceremony-check mode below
grants: [build, merge]             # as held at materialization time; may be [build] or []
fingerprint: {fp}                  # omitted when none
surface: {web|mobile|desktop|backend|infra}
design-intent: {value}             # omitted for backend/infra
parked-at-shaping: true            # omitted unless the record was parked when shaped
---
{record body verbatim}
```
```

- [ ] **Step 2: Add a `ceremony` row to the Field/Named-reader table**

Find:

```markdown
| Field | Named reader |
|---|---|
| `record` | `/wrap-up` close-via-merge carrier (`Fixes #{n}`) + Section E claim release |
| `origin` | `/wrap-up` summary/Review Console display (provenance line) |
| `risk` | Audit snapshot (preserved in the committed file; no active mechanical reader today) |
| `effort` | `/build` effort-based model-tier selection (replaces `code-health-effort`) |
| `grants` | Snapshot for audit; `/wrap-up`'s auto-merge check RE-READS LIVE LABELS before any merge (truth, not projection) |
```

Replace with:

```markdown
| Field | Named reader |
|---|---|
| `record` | `/wrap-up` close-via-merge carrier (`Fixes #{n}`) + Section E claim release |
| `origin` | `/wrap-up` summary/Review Console display (provenance line) |
| `risk` | Audit snapshot (preserved in the committed file; no active mechanical reader today) |
| `effort` | `/build` effort-based model-tier selection (replaces `code-health-effort`) |
| `ceremony` | `/flow`'s Manifesto (Step 3) bundle-fold into the `ceremony-profile` lever |
| `grants` | Snapshot for audit; `/wrap-up`'s auto-merge check RE-READS LIVE LABELS before any merge (truth, not projection) |
```

- [ ] **Step 3: Wire the population instruction**

Find:

```markdown
## Populating the header

Every field except `surface`/`design-intent` (next section) comes straight off data already fetched during Resolution — nothing extra to read:

- `record` — the id used to resolve it.
- `origin` — `facets.origin` (`code-health` / `harness-health` / `journey-health` / `capture`), or the literal `human` when `facets.origin` is `null` (no `by:*` label — human-filed, or a side-effect record, per `_shared/work-record.md`'s origin axis).
- `risk` / `effort` — `facets.risk` / `facets.effort`; omit the line when the value is `null` (unscored).
- `grants` — `facets.grants.build` / `facets.grants.merge`, as the bracket list `[build, merge]` / `[build]` / `[]`. Unlike every other optional field here, always emit the `grants:` line, even empty — a record can reach materialization ungranted (a human running `/flow #{n}` directly against a record nobody authorized).
- `fingerprint` — from Resolution; omit the line when `null`.
- `parked-at-shaping` — `true` when the labels/facets fetched at materialization time still carry `parked`, omitted otherwise. `/specify` strips `parked` on promotion to `ready` (its permission-matrix row in `_shared/work-record.md`), so this is normally absent by the time a record is buildable; it stays meaningful for a record re-parked after promotion — e.g. by `/tidy`'s Defer action — that still got dispatched anyway, which is exactly the case `/wrap-up`'s restore-on-abandon step (see the reader table above) needs to detect.

`surface` / `design-intent` are the one exception — the lift rule below.
```

Replace with:

```markdown
## Populating the header

Every field except `surface`/`design-intent` (next section) and `ceremony` (below) comes straight off data already fetched during Resolution — nothing extra to read:

- `record` — the id used to resolve it.
- `origin` — `facets.origin` (`code-health` / `harness-health` / `journey-health` / `capture`), or the literal `human` when `facets.origin` is `null` (no `by:*` label — human-filed, or a side-effect record, per `_shared/work-record.md`'s origin axis).
- `risk` / `effort` — `facets.risk` / `facets.effort`; omit the line when the value is `null` (unscored).
- `grants` — `facets.grants.build` / `facets.grants.merge`, as the bracket list `[build, merge]` / `[build]` / `[]`. Unlike every other optional field here, always emit the `grants:` line, even empty — a record can reach materialization ungranted (a human running `/flow #{n}` directly against a record nobody authorized).
- `fingerprint` — from Resolution; omit the line when `null`.
- `parked-at-shaping` — `true` when the labels/facets fetched at materialization time still carry `parked`, omitted otherwise. `/specify` strips `parked` on promotion to `ready` (its permission-matrix row in `_shared/work-record.md`), so this is normally absent by the time a record is buildable; it stays meaningful for a record re-parked after promotion — e.g. by `/tidy`'s Defer action — that still got dispatched anyway, which is exactly the case `/wrap-up`'s restore-on-abandon step (see the reader table above) needs to detect.
- `ceremony` — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode
  (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`), once per
  record, using the same body/labels already fetched during Resolution. Its `CEREMONY` output
  becomes this field verbatim; omit the line when the verdict is `standard` (mirrors
  `risk`/`effort`'s omit-when-unscored convention). See
  `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the full mode
  contract.

`surface` / `design-intent` / `ceremony` are the exceptions — `surface`/`design-intent` via the
lift rule below, `ceremony` via the invocation above.
```

- [ ] **Step 4: Verify no other file assumed the old header shape rigidly**

```bash
grep -rn "record: {n}" skills/ --include="*.md" | grep -v "flow/materialize.md"
```

Expected: no output, or only informal prose references (not another copy of the pinned header
block) — `materialize.md`'s own comment states it's "the single definition." If this returns a
second literal copy of the header block, that file needs the same `ceremony:` line added too;
resolve before committing.

- [ ] **Step 5: Commit**

```bash
git add skills/flow/materialize.md
git commit -m "Add ceremony: materialized-header field, populated via ceremony-check

Populated the same way effort:/risk: already are, plus one extra
ceremony-check invocation per record. Consumed by manifesto.md's
bundle-fold into the ceremony-profile lever (Task 3)."
```

---

### Task 3: Add `ceremony-profile` as the 9th Pipeline Config Manifesto lever

**Files:**
- Modify: `skills/flow/manifesto.md`

**Interfaces:**
- Consumes: each record's materialized `ceremony:` header field (Task 2).
- Produces: `config.yml`'s `ceremony-profile` lever, consumed by Task 5 (wrap-up) and Task 6 (build).

- [ ] **Step 1: Add a Ceremony column to the per-spec preview derivation table**

Find:

```markdown
| Field | Source | How to derive |
|---|---|---|
| Surface | Materialized header `surface:` (`materialize.md`) — or the record body's `Surface:` line / the legacy spec file's `surface:` header field when no run-dir header exists yet (or detect from Key Files extensions) | `frontend` if `.tsx/.jsx/.vue/.svelte/.css` files present; else `backend` / `infra` per header or content |
| Polish | `surface` × materialized header `design-intent:` (or the body's `Design-intent:` line / legacy spec `design-intent:`) × `no-polish` arg | `run` if frontend + design-intent != none + no-polish not set; `skip ({reason})` otherwise |
```

Replace with:

```markdown
| Field | Source | How to derive |
|---|---|---|
| Surface | Materialized header `surface:` (`materialize.md`) — or the record body's `Surface:` line / the legacy spec file's `surface:` header field when no run-dir header exists yet (or detect from Key Files extensions) | `frontend` if `.tsx/.jsx/.vue/.svelte/.css` files present; else `backend` / `infra` per header or content |
| Ceremony | Materialized header `ceremony:` (`materialize.md`) — omitted means `standard` | `fast-lane` if header present; else `standard` |
| Polish | `surface` × materialized header `design-intent:` (or the body's `Design-intent:` line / legacy spec `design-intent:`) × `no-polish` arg | `run` if frontend + design-intent != none + no-polish not set; `skip ({reason})` otherwise |
```

- [ ] **Step 2: Add the ceremony-profile computation rule**

Find:

```markdown
**Git lever override.** When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git lever is forced to `worktree` regardless of CLI args or defaults above — `current-branch` is never offered or accepted. This is enforced mechanically by a `PreToolUse` gate (see `_shared/git-discipline.md`), so a stale/overridden config value would simply get every edit denied; the Manifesto short-circuits to `worktree` here to avoid presenting a choice that can't actually be honored.
```

Replace with:

```markdown
**Git lever override.** When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git lever is forced to `worktree` regardless of CLI args or defaults above — `current-branch` is never offered or accepted. This is enforced mechanically by a `PreToolUse` gate (see `_shared/git-discipline.md`), so a stale/overridden config value would simply get every edit denied; the Manifesto short-circuits to `worktree` here to avoid presenting a choice that can't actually be honored.

**Ceremony profile computation.** Unlike the other 8 levers (policy preferences resolved via the precedence chain above), `ceremony-profile`'s value is computed by folding every record's materialized `ceremony:` header field (`materialize.md`) with a logical AND: `fast-lane` only when every record in this run has `ceremony: fast-lane`; any record missing the field (defaults to `standard`) or carrying an explicit `standard` sends the whole run's `ceremony-profile` to `standard` — mirrors the auto-merge gate's existing "every member of the group must carry `auto:merge`" rule (`dispatch/SKILL.md`'s Auto-merge gate). Source is always `header`. The computed value still becomes this lever's Recommended value, which the human can override via the normal `9=value` mechanism below — unlike Design intent (a prior human decision from `/specify`, not re-litigated here), `ceremony-check`'s verdict is itself a fresh automated judgment call, and this Manifesto is the first point a human sees it.
```

- [ ] **Step 3: Add the lever to the canonical numbering and levers table**

Find:

```markdown
**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review severity floor, 8=Tidy aggressiveness. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.

| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review severity floor | **low** | none / **low** / medium | LOW findings auto-applied; MED staged; HIGH still prompts |
```

Replace with:

```markdown
**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review severity floor, 8=Tidy aggressiveness, 9=Ceremony profile. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.

| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review severity floor | **low** | none / **low** / medium | LOW findings auto-applied; MED staged; HIGH still prompts |
| 9 | Ceremony profile | **{computed}** | **fast-lane** / standard | Fast-lane trims wrap-up ceremony depth (reflect light mode, narrower skill-curation scan, doc-scan pre-check); standard runs full depth |
```

- [ ] **Step 4: Update the Suppressed/valid-overrides line and the Override semantics table**

Find:

```markdown
**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7.
```

Replace with:

```markdown
**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7, 9.
```

Find:

```markdown
| Review severity floor | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review severity floor | `medium` | LOW + MED auto-applied; only HIGH prompts |
```

Replace with:

```markdown
| Review severity floor | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review severity floor | `medium` | LOW + MED auto-applied; only HIGH prompts |
| Ceremony profile | `standard` | Forces full-depth wrap-up ceremony (reflect full mode, unrestricted skill-curation scan, doc/CLAUDE.md/ADR sub-scans) even though `ceremony-check` verdicted `fast-lane` for every record |
| Ceremony profile | `fast-lane` | Forces the fast-lane shape even if a record's `ceremony:` header was `standard` (or one member of a bundle was) — an active, informed human override, not the automated default |
```

- [ ] **Step 5: Update "Always visible" and the config.yml example**

Find:

```markdown
Always visible: **Mode** (1), **Scope-creep** (2) — they affect every pipeline.
```

Replace with:

```markdown
Always visible: **Mode** (1), **Scope-creep** (2), **Ceremony profile** (9) — they affect every pipeline.
```

Find:

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-severity-floor: low
tidy-aggressiveness: conservative
spec: 42
created: 2026-05-15T143207
```

Replace with:

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-severity-floor: low
tidy-aggressiveness: conservative
ceremony-profile: fast-lane
spec: 42
created: 2026-05-15T143207
```

- [ ] **Step 6: Update the Source values table and the Recommendation defaults note**

Find:

```markdown
| `header` | Locked by the materialized header (`materialize.md`) or the record body's `Surface:`/`Design-intent:` metadata lines — or, under the legacy spec-file alias, the spec file's own header fields (e.g., `design-intent:` set on every record in the run) |
```

Replace with:

```markdown
| `header` | Locked by the materialized header (`materialize.md`) — e.g. `surface:`/`design-intent:`/`ceremony:` — or the record body's `Surface:`/`Design-intent:` metadata lines — or, under the legacy spec-file alias, the spec file's own header fields (e.g., `design-intent:` set on every record in the run) |
```

Find:

```markdown
## Recommendation defaults (when no arg and no policy)

| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review severity floor | `low` | Auto LOW (nits), stage MED, prompt HIGH |
| Tidy aggressiveness | `conservative` | Keep + unambiguous Delete only |
```

Replace with:

```markdown
## Recommendation defaults (when no arg and no policy)

| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review severity floor | `low` | Auto LOW (nits), stage MED, prompt HIGH |
| Tidy aggressiveness | `conservative` | Keep + unambiguous Delete only |

`ceremony-profile` (lever 9) has no row here — its source is always `header` (the bundle-folded
`ceremony:` value from each record's materialized header), never `arg`/`policy`/`default`. See
`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`.
```

- [ ] **Step 7: Commit**

```bash
git add skills/flow/manifesto.md
git commit -m "Add ceremony-profile as the 9th Pipeline Config Manifesto lever

Folded from each record's materialized ceremony: header field (AND
across a bundle, mirroring the auto-merge gate's every-member rule).
Human-overridable via 9=value like any other lever, since it's a
fresh automated verdict, not a prior human decision like design-intent."
```

---

### Task 4: Add reflect's `light` mode

**Files:**
- Create: `skills/reflect/light-mode.md`
- Modify: `skills/reflect/SKILL.md`

**Interfaces:**
- Produces: a third reflect mode, `light` — 2 lenses (Near-misses, Fresh start), no tradeoff review.
- Consumes: `full-mode.md`'s existing lens definitions (reused by reference, not duplicated).

- [ ] **Step 1: Create `light-mode.md`**

```markdown
# Light Mode

Cheap knowledge-capture procedure for `light` mode (invoked by `/claude-tweaks:wrap-up` Step 3 when
`config.yml`'s `ceremony-profile` is `fast-lane`).

Light mode is a narrowed subset of full mode — see `full-mode.md` for the Near-misses/Fresh-start
lens definitions this mode reuses verbatim; Surprises, Approach, and Tradeoff Review are dropped.
See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the rationale.

## Step 2: Run Lenses — Light Mode (2 lenses, no tradeoff review)

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **2. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives, memory files |

Surprises and Approach are skipped — light mode exists specifically to trim ceremony for a
`fast-lane`-profiled record. If this run's escape hatch fires mid-pass (see below), the *next*
wrap-up steps run at standard depth — this pass itself is not retroactively widened.

### Seed from Review Learnings (pipeline context)

Same as full mode: check the `/claude-tweaks:review` summary's **Key Learnings** section and use it
as a starting point for the two lenses rather than re-deriving from scratch.

### No Tradeoff Review

Light mode does not run the Tradeoff Review sub-step — a `fast-lane` record's Review summary is not
expected to carry a `Tradeoffs Accepted` section large enough to warrant it. If one exists anyway,
note it under the Fresh start lens rather than running a separate pass.

## Step 3: Route Findings — Light Mode

### Auto mode (policy-driven routing)

Identical to full mode — auto-mode routing (including the mandatory Safety regression KEPT-PROMPT
routing) is shared across every mode, mode-independent: see the auto-routing table in SKILL.md Step
3. **If a Safety regression finding fires here, this triggers the ceremony escape hatch** (see
`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`'s Escape Hatch section) —
`/claude-tweaks:wrap-up` checks for this immediately after this step completes and downgrades
`ceremony-profile` to `standard` for the remainder of the run when it fires.

### Interactive mode (batch user routing)

Same table/`AskUserQuestion` mechanics as full mode (see `full-mode.md`'s Interactive mode section)
— light mode only narrows which lenses feed the table, not how the table itself is presented or
routed.
```

- [ ] **Step 2: Add `light` to the Modes table**

Find:

```markdown
## Modes

| Mode | Lenses | Invoked by | Best for |
|------|--------|------------|----------|
| **hindsight** | Approach, Structure, Consolidation, Convention, Skills | `/claude-tweaks:review` Step 4 | Pre-ship "should we change something?" gate |
| **full** | All four lenses (Surprises, Approach, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Step 3 | Post-review knowledge capture |
| *(default)* | **full** when standalone | Direct invocation | General-purpose reflection |
```

Replace with:

```markdown
## Modes

| Mode | Lenses | Invoked by | Best for |
|------|--------|------------|----------|
| **hindsight** | Approach, Structure, Consolidation, Convention, Skills | `/claude-tweaks:review` Step 4 | Pre-ship "should we change something?" gate |
| **full** | All four lenses (Surprises, Approach, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Step 3 | Post-review knowledge capture |
| **light** | Near-misses, Fresh start (no tradeoff review) | `/claude-tweaks:wrap-up` Step 3, when `ceremony-profile: fast-lane` | Cheap post-review capture for a fast-lane record |
| *(default)* | **full** when standalone | Direct invocation | General-purpose reflection |
```

- [ ] **Step 3: Add `light` to Step 2's mode-file pointer list**

Find:

```markdown
## Step 2: Run Lenses

Mode-specific lens procedures live in sub-files (a given invocation only uses one):

- **Hindsight mode** → see `hindsight-mode.md` in this skill's directory (5 evaluations, action gate)
- **Full mode** → see `full-mode.md` in this skill's directory (4 lenses + tradeoff review; superset of hindsight)
```

Replace with:

```markdown
## Step 2: Run Lenses

Mode-specific lens procedures live in sub-files (a given invocation only uses one):

- **Hindsight mode** → see `hindsight-mode.md` in this skill's directory (5 evaluations, action gate)
- **Full mode** → see `full-mode.md` in this skill's directory (4 lenses + tradeoff review; superset of hindsight)
- **Light mode** → see `light-mode.md` in this skill's directory (2 lenses, no tradeoff review; narrowed subset of full, for `ceremony-profile: fast-lane` wrap-ups)
```

- [ ] **Step 4: Update "When to Use"**

Find:

```markdown
## When to Use

- After any implementation work — you want a second look before moving on
- During `/claude-tweaks:review` Step 4 — invoked in **hindsight** mode
- During `/claude-tweaks:wrap-up` Step 3 — invoked in **full** mode
- After a debugging session or refactor — capture what you learned
- After conversation-based work that had no formal review
```

Replace with:

```markdown
## When to Use

- After any implementation work — you want a second look before moving on
- During `/claude-tweaks:review` Step 4 — invoked in **hindsight** mode
- During `/claude-tweaks:wrap-up` Step 3 — invoked in **full** mode, or **light** mode when the run's `ceremony-profile` is `fast-lane`
- After a debugging session or refactor — capture what you learned
- After conversation-based work that had no formal review
```

- [ ] **Step 5: Update the pipeline-context input description**

Find:

```markdown
### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Mode** — `hindsight` (from `/review`) or `full` (from `/wrap-up`)
- **Scope** — changes already analyzed by the parent
- **Ledger phase** — `review/hindsight` (from `/review`) or `wrap-up` (from `/wrap-up`)
- **Seed context** (full mode only) — review summary, key learnings, tradeoffs accepted
```

Replace with:

```markdown
### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Mode** — `hindsight` (from `/review`) or `full`/`light` (from `/wrap-up`; `light` when the run's
  `ceremony-profile` is `fast-lane`, `full` otherwise)
- **Scope** — changes already analyzed by the parent
- **Ledger phase** — `review/hindsight` (from `/review`) or `wrap-up` (from `/wrap-up`)
- **Seed context** (full and light modes only) — review summary, key learnings, tradeoffs accepted
```

- [ ] **Step 6: Update the Component-Skill Contract**

Find:

```markdown
## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 4, `hindsight` mode) and `/claude-tweaks:wrap-up` (Step 3, `full` mode). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/review`, `/wrap-up`, or other pipeline orchestrators). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.
```

Replace with:

```markdown
## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 4, `hindsight` mode) and `/claude-tweaks:wrap-up` (Step 3, `full` or `light` mode). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/review`, `/wrap-up`, or other pipeline orchestrators). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.
```

- [ ] **Step 7: Update the Relationship table row for wrap-up**

Find:

```markdown
| `/claude-tweaks:wrap-up` | Invokes /reflect in **full** mode (Step 3). Passes review summary, key learnings, and tradeoffs. Receives routed insights for knowledge capture. |
```

Replace with:

```markdown
| `/claude-tweaks:wrap-up` | Invokes /reflect in **full** mode (Step 3), or **light** mode when the run's `ceremony-profile` is `fast-lane`. Passes review summary, key learnings, and tradeoffs. Receives routed insights for knowledge capture. |
```

- [ ] **Step 8: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- `light-mode.md`'s lens table matches `full-mode.md`'s Near-misses/Fresh-start rows verbatim
  (same question/surfaces text) — no accidental drift between the two copies.
- The Safety-regression escape-hatch cross-reference in `light-mode.md`'s Step 3 matches the
  design doc's Escape Hatch section (trigger condition, downgrade target, log format).
- No `TBD`/`TODO`/placeholder text anywhere in the new file or the edited sections.

Fix any drift found inline.

- [ ] **Step 9: Commit**

```bash
git add skills/reflect/light-mode.md skills/reflect/SKILL.md
git commit -m "Add reflect's light mode for fast-lane wrap-ups

Near-misses + Fresh-start lenses only, no tradeoff review — reuses
full-mode.md's lens definitions by reference rather than duplicating
them. Not yet invoked by any caller — Task 5 wires wrap-up's Step 3."
```

---

### Task 5: Wire `/claude-tweaks:wrap-up`'s Steps 3/6/7 to `ceremony-profile`, add the escape hatch

**Files:**
- Modify: `skills/wrap-up/SKILL.md` (Step 3, new Step 3.5, Step 6 intro)
- Modify: `skills/wrap-up/skill-curation.md` (7.2's cap, core-principle note)

**Interfaces:**
- Consumes: `config.yml`'s `ceremony-profile` lever (Task 3); reflect's `light` mode (Task 4);
  `bin/lib/issues/blast-radius.js`'s existing, already-tested `classifyDiffFiles` (from
  `assess-agent-autonomy`'s own plan — reused here with a different `sensitivePaths` argument, no
  new code).

- [ ] **Step 1: Wire Step 3's mode selection**

Find:

```markdown
## Step 3: Reflect on Implementation

Run `/claude-tweaks:reflect` in **full** mode. Pass:
- **Scope** — files changed during this work
- **Ledger phase** — `wrap-up`
- **Seed context** — review summary (Key Learnings section), tradeoffs accepted

The reflect skill handles all four reflection lenses (Surprises, Hindsight, Near-misses, Fresh start), the tradeoff review, insight routing, and ledger writes. See `/claude-tweaks:reflect` for details.

If any insight is "Implement now", /reflect handles it before returning control. Proceed after all insights are resolved.
```

Replace with:

```markdown
## Step 3: Reflect on Implementation

When a pipeline run directory exists, read `config.yml`'s `ceremony-profile`. Run
`/claude-tweaks:reflect` in **light** mode when it is `fast-lane`; **full** mode otherwise
(including standalone wrap-up, where no `config.yml` exists to read). Pass:
- **Scope** — files changed during this work
- **Ledger phase** — `wrap-up`
- **Seed context** — review summary (Key Learnings section), tradeoffs accepted

Full mode handles all four reflection lenses (Surprises, Hindsight, Near-misses, Fresh start), the
tradeoff review, insight routing, and ledger writes. Light mode
(`skills/reflect/light-mode.md`) runs only the Near-misses and Fresh-start lenses and skips the
tradeoff review — see `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for
the rationale. See `/claude-tweaks:reflect` for details on both.

If any insight is "Implement now", /reflect handles it before returning control. Proceed after all insights are resolved.

## Step 3.5: Ceremony Escape Hatch (fast-lane runs only)

Skip entirely when `config.yml`'s `ceremony-profile` is not `fast-lane` (including standalone
wrap-up, where no `config.yml` exists). Otherwise, check both trigger conditions:

- Did `/claude-tweaks:review`'s summary (passed into this run) contain a finding at any severity?
- Did Step 3's reflect pass produce a Safety regression finding (`reflect/SKILL.md` Step 3's
  routing table)?

If either is true, downgrade `config.yml`'s `ceremony-profile` to `standard` in place and log:

```
AUTO {time} — Ceremony profile downgraded fast-lane → standard: {trigger}. Remaining wrap-up steps run at standard depth.
```

Steps 6 and 7 below read the (possibly just-downgraded) value fresh at their own point of use — no
other propagation needed. This never re-runs Step 3 itself, or any build-side step already
completed under the original `fast-lane` value — see the design doc's Escape Hatch section for why
this is deliberate, not a gap.
```

- [ ] **Step 2: Add the fast-lane pre-check to Step 6**

Find:

```markdown
## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential documentation, CLAUDE.md/rules, and decision-record updates in a single pass across three sub-scans (Documentation, CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7.

> **Parallel execution:** Run all three sub-scans (documentation, CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### 6.1: Documentation
```

Replace with:

```markdown
## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential documentation, CLAUDE.md/rules, and decision-record updates in a single pass across three sub-scans (Documentation, CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7.

> **Parallel execution:** Run all three sub-scans (documentation, CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### Fast-lane pre-check (skip condition)

When `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh — see Step 3.5), skip all three
sub-scans below entirely — report "No configuration updates needed (fast-lane: diff touches no
registry-matched path, no new dependency, no schema/config file)" and proceed to Step 7 — when ALL
of the following hold:

- `git diff --name-only` against this work's base ref matches none of `docs/REGISTRY.md`'s
  Auto-detect patterns. Reuse `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles`, passing the
  registry's patterns as the `sensitivePaths` argument — a result's `isSensitive: true` means a
  registry-pattern hit here, not a merge-sensitivity one; the function is generic path-glob
  matching regardless of which patterns list it's fed, and is already fully tested.
- `git diff package.json` (and any workspace-level equivalent) shows no added dependency.
- No file in the diff matches a schema/env/IaC/CI/platform-config pattern — reuse Build Common Step
  5.5's own Category A/B trigger list (`operational-checklist.md` in `skills/build/`).

If `docs/REGISTRY.md` doesn't exist, this pre-check cannot resolve the first condition — treat it
as unmet (run the sub-scans normally) rather than skipping on incomplete information. This
pre-check only applies under `fast-lane`; a `standard`-profile run (or standalone wrap-up, where no
`config.yml` exists) always runs all three sub-scans as before.

### 6.1: Documentation
```

- [ ] **Step 3: Verify no stale reference to a fixed "full mode" assumption survives**

```bash
grep -n "Run \`/claude-tweaks:reflect\` in \*\*full\*\* mode" skills/wrap-up/SKILL.md
```

Expected: no output (the one instance was replaced in Step 1 above).

- [ ] **Step 4: Commit `wrap-up/SKILL.md`**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Wire wrap-up Steps 3/6 to ceremony-profile, add the escape hatch

Step 3 selects reflect's light vs full mode from config.yml's
ceremony-profile. New Step 3.5 checks review findings + reflect's own
safety-regression routing and downgrades to standard mid-run if
either fires. Step 6 gains a mechanical pre-check that skips the 3
doc/CLAUDE.md/ADR sub-scans under fast-lane when the diff touches no
registry-matched path, adds no dependency, and touches no schema/config
file — reusing blast-radius.js's existing classifyDiffFiles with a
different pattern list, no new code."
```

- [ ] **Step 5: Narrow Step 7's skill-curation scan cap**

Find (in `skills/wrap-up/skill-curation.md`):

```markdown
**Core principle: this step *generates* candidates from the work itself — it does not merely filter whatever upstream producers tagged.** Ledger entries and reflection insights are **seeds** that focus the analysis, not the gate that decides whether it runs. Even with zero seeds, the independent scan (7.2) inspects the skills whose domain overlaps the changed files, and gap detection looks for reusable patterns no skill covers.
```

Replace with:

```markdown
**Core principle: this step *generates* candidates from the work itself — it does not merely filter whatever upstream producers tagged.** Ledger entries and reflection insights are **seeds** that focus the analysis, not the gate that decides whether it runs. Even with zero seeds, the independent scan (7.2) inspects the skills whose domain overlaps the changed files, and gap detection looks for reusable patterns no skill covers.

**Fast-lane narrows breadth, never gates existence.** Under `ceremony-profile: fast-lane`
(`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`), 7.2's independent scan
still always runs regardless of seeds — only its cap shrinks (top ~2 instead of top ~5, see 7.2
below). This is a deliberate, narrow exception to the cap number, not a reopening of the
seed-gating question this principle exists to close.
```

- [ ] **Step 6: Update 7.2's cap**

Find:

```markdown
3. **Rank by domain overlap** — score each skill by how much its domain (the directories, file-types, and patterns it documents) intersects the changed files. Read the **top ~5 most relevant** skills in full. The cap bounds token cost; the ranking ensures the highest-value skills are covered. If more than 5 skills are relevant, **note the overflow explicitly** — `/claude-tweaks:tidy` and future wrap-ups pick up the remainder (never silently truncate).
```

Replace with:

```markdown
3. **Rank by domain overlap** — score each skill by how much its domain (the directories, file-types, and patterns it documents) intersects the changed files. Read the **top ~5 most relevant** skills in full — or **top ~2** when `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh; see `wrap-up/SKILL.md` Step 3.5) — the narrower cap under fast-lane trims read cost without skipping the scan outright, preserving the seed-independent principle above. The cap bounds token cost; the ranking ensures the highest-value skills are covered. If more skills than the applicable cap are relevant, **note the overflow explicitly** — `/claude-tweaks:tidy` and future wrap-ups pick up the remainder (never silently truncate).
```

- [ ] **Step 7: Commit `skill-curation.md`**

```bash
git add skills/wrap-up/skill-curation.md
git commit -m "Narrow skill-curation's independent scan cap under fast-lane

Top ~5 -> top ~2 domain-relevant skills when ceremony-profile is
fast-lane. The scan itself is never skipped or seed-gated — only
its breadth shrinks, preserving the existing 'never seed-gated'
principle this file documents."
```

---

### Task 6: Widen build's Common Step 1.5/4.5 skip conditions

**Files:**
- Modify: `skills/build/SKILL.md`

**Interfaces:**
- Consumes: `config.yml`'s `ceremony-profile` lever (Task 3).

- [ ] **Step 1: Widen Common Step 1.5's skip condition**

Find:

```markdown
**Skip this step entirely when** the plan has fewer than 3 file references AND no `Scope keywords:` field is present.
```

Replace with:

```markdown
**Skip this step entirely when** the plan has fewer than 3 file references AND no `Scope keywords:`
field is present, **or** when `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh from the
run directory) — a `ceremony-check` verdict of `fast-lane` is itself a judgment that this record's
plan doesn't need auditing against scope creep. Standalone `/build` (no `config.yml`) always falls
back to the size-based condition alone.
```

- [ ] **Step 2: Widen Common Step 4.5's skip condition**

Find:

```markdown
**Skip this step if:** design mode with no formal spec, or the plan was trivial (< 3 tasks, single-file changes).
```

Replace with:

```markdown
**Skip this step if:** design mode with no formal spec, the plan was trivial (< 3 tasks,
single-file changes), or `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh from the run
directory). Skipping this check under fast-lane is a deliberate bet on `ceremony-check`'s upfront
judgment, not an oversight — the safety net for "this was gnarlier than it looked" is
`/claude-tweaks:review` and `/claude-tweaks:reflect`'s safety-regression check, both unaffected by
`ceremony-profile` and both evaluated against the real, finished diff (see
`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`'s Escape Hatch section).
Standalone `/build` (no `config.yml`) always falls back to the existing two conditions alone.
```

- [ ] **Step 3: Verify no other reference to the old skip conditions survives verbatim elsewhere**

```bash
grep -n "fewer than 3 file references AND no\|< 3 tasks, single-file changes)\.$" skills/build/SKILL.md
```

Expected: no output (both instances were replaced above; a trailing period without the new clause
would indicate a missed edit).

- [ ] **Step 4: Commit**

```bash
git add skills/build/SKILL.md
git commit -m "Widen build's Plan Audit and Architecture Alignment skip conditions for fast-lane

Both steps already had a size-based skip condition (plan-shape driven,
not record-label driven) — fast-lane adds an OR clause treating
ceremony-profile: fast-lane as automatically satisfying it. A
deliberate bet on ceremony-check's upfront judgment; the safety net
is review + reflect's safety-regression check, unaffected either way."
```

---

### Task 7: Amend `assess-agent-autonomy-design.md`'s Non-Goals, update the skill catalog

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` (Non-Goals section)
- Modify: `README.md`, `skills/help/reference-card.md` (catalog entries — conditional on their own
  `assess-agent-autonomy` rows already existing)

**Interfaces:** none — pure documentation, no code.

- [ ] **Step 1: Amend the Non-Goals bullet**

Find (in `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`):

```markdown
- **Not** a system-wide risk-assessment service. Scoped to exactly the decision points
  `/claude-tweaks:triage` and `/claude-tweaks:dispatch` already own; not reachable from
  `/claude-tweaks:review`'s own lenses or any other skill in this pass.
```

Replace with:

```markdown
- **Not** a system-wide risk-assessment service. Scoped to exactly the decision points
  `/claude-tweaks:triage` and `/claude-tweaks:dispatch` already own, plus one narrow addition: a
  4th mode, `ceremony-check`, reachable from `/claude-tweaks:flow`'s materialization step (see
  `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`) — judging how much
  wrap-up ceremony a record's content deserves, a different question from "is this safe to trust
  autonomously" asked at a different point in the pipeline. Still not reachable from
  `/claude-tweaks:review`'s own lenses or any other skill beyond these four call sites.
```

- [ ] **Step 2: Verify the catalog precondition, then update if present**

```bash
grep -q "assess-agent-autonomy" README.md && echo "README has an entry" || echo "README has no entry yet — skip Step 3, note in Task 8's report"
grep -q "assess-agent-autonomy" skills/help/reference-card.md && echo "reference-card has a row" || echo "reference-card has no row yet — skip Step 3, note in Task 8's report"
```

- [ ] **Step 3: If both exist, update them to mention the 4th mode (skip this step entirely if either check above said "no entry"/"no row yet" — do not fabricate the surrounding entry)**

In `README.md`, find:

```markdown
**`/claude-tweaks:assess-agent-autonomy`** — Content-aware trust verdicts replacing mechanical label lookups. Three modes: **grant-check** (informs `/triage`'s Step 2 recommendation, reading a record's actual body content rather than just its risk/effort labels), **merge-check** (replaces `/dispatch`'s Auto-merge gate — weighs diff content, review findings, and a test-exclusion-aware blast-radius summary holistically instead of a hard line-count cutoff), and **failure-check** (replaces `/dispatch`'s blanket failure-revocation rule — classifies a failure as correctness/transient/ambiguous so a flaky test or infrastructure hiccup no longer permanently strips merge trust). Invoked inline by its callers, never directly by a human.
```

Replace with:

```markdown
**`/claude-tweaks:assess-agent-autonomy`** — Content-aware trust and ceremony-depth verdicts replacing mechanical label lookups. Four modes: **grant-check** (informs `/triage`'s Step 2 recommendation, reading a record's actual body content rather than just its risk/effort labels), **merge-check** (replaces `/dispatch`'s Auto-merge gate — weighs diff content, review findings, and a test-exclusion-aware blast-radius summary holistically instead of a hard line-count cutoff), **failure-check** (replaces `/dispatch`'s blanket failure-revocation rule — classifies a failure as correctness/transient/ambiguous so a flaky test or infrastructure hiccup no longer permanently strips merge trust), and **ceremony-check** (informs `/flow`'s materialization step of how much wrap-up ceremony a record's actual content deserves, independent of merge trust). Invoked inline by its callers, never directly by a human.
```

In `skills/help/reference-card.md`, find:

```markdown
| `/claude-tweaks:assess-agent-autonomy` | Inline judgment helper — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule. Never invoked directly by a human. | `{mode} #{n}` (`grant-check`\|`merge-check`\|`failure-check`) |
```

Replace with:

```markdown
| `/claude-tweaks:assess-agent-autonomy` | Inline judgment helper — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule, ceremony-check informs flow's per-record wrap-up ceremony depth. Never invoked directly by a human. | `{mode} #{n}` (`grant-check`\|`merge-check`\|`failure-check`\|`ceremony-check`) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md
# add README.md skills/help/reference-card.md too, only if Step 3 actually ran
git commit -m "Amend assess-agent-autonomy's Non-Goals for ceremony-check, update catalog docs

Non-Goals previously scoped this skill's reach to triage/dispatch
only, which ceremony-check (flow's materialization step) directly
contradicts -- amended deliberately rather than left as a silent
inconsistency between two committed docs."
```

---

### Task 8: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
pwd
git rev-parse --show-toplevel
npm test
```

Expected: PASS in full, identical count to the pre-this-plan baseline — no `.js` file was created
or modified by this plan, so no test count change is expected (unlike `assess-agent-autonomy`'s own
plan, which did add/remove tests).

- [ ] **Step 2: Confirm every new identifier is used consistently across files**

```bash
grep -rln "ceremony-check\|ceremony-profile\|ceremony:" skills/ docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md
```

Expected: at least `skills/assess-agent-autonomy/SKILL.md`, `skills/flow/materialize.md`,
`skills/flow/manifesto.md`, `skills/wrap-up/SKILL.md`, `skills/wrap-up/skill-curation.md`,
`skills/build/SKILL.md`, `skills/reflect/SKILL.md`, `skills/reflect/light-mode.md`,
`docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`, and the design doc itself.
Cross-check the exact spelling is identical everywhere (`ceremony-profile`, not `ceremony_profile`
or `ceremonyProfile`; `ceremony-check`, not `ceremonycheck`) — a typo in one file silently breaks
the chain since nothing here is code-checked by a compiler.

- [ ] **Step 3: Confirm no dangling reference to the old fixed behaviors survives**

```bash
grep -rn "Run \`/claude-tweaks:reflect\` in \*\*full\*\* mode\." skills/wrap-up/SKILL.md
grep -n "Three-mode inline helper" skills/assess-agent-autonomy/SKILL.md
```

Expected: no output for either (both were rewritten in Tasks 1 and 5).

- [ ] **Step 4: Confirm `light-mode.md`'s structure matches its siblings' convention**

```bash
head -5 skills/reflect/light-mode.md
head -5 skills/reflect/full-mode.md
head -5 skills/reflect/hindsight-mode.md
```

Expected: all three open with a level-1 title and a one-line "invoked by ..." context sentence,
matching the established sub-file convention.

- [ ] **Step 5: Simplify pass**

Run `/claude-tweaks:simplify` on the files this plan touched:
`skills/assess-agent-autonomy/SKILL.md skills/flow/materialize.md skills/flow/manifesto.md skills/reflect/SKILL.md skills/reflect/light-mode.md skills/wrap-up/SKILL.md skills/wrap-up/skill-curation.md skills/build/SKILL.md docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`.
Commit any simplifications separately if made.

- [ ] **Step 6: Report**

Summarize: tests passing (count, confirming no regression), files created/modified, whether Task
7's catalog-doc Step 3 ran or was skipped (and why), and confirm both Task 8 grep sweeps returned
clean. This plan does not include filing a GitHub record for itself or dispatching through
`/claude-tweaks:triage`/`/claude-tweaks:dispatch` — it assumes direct execution via
`/superpowers:subagent-driven-development` or `/superpowers:executing-plans` against this plan
file, in the worktree it was written in. If you want this work to flow through the record system
instead (so it's tracked, claimable, and subject to the same grant/dispatch protocol it
implements), file it via `/claude-tweaks:capture` or `/claude-tweaks:specify` before executing —
this plan doesn't do that itself, and no commit message above includes a `refs #N` placeholder
since no record number exists yet.
