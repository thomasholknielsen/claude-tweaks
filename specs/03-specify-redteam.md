---
tier: 1
status: complete
progress: 100
blocked-by: [01]
surface: infra
design-intent: none
---

# 03: /specify Multi-Persona Red-Team Integration

## Overview

Integrate Spec 01's Mode 3 (Multi-persona red-team) into `/claude-tweaks:specify`. After a draft spec is written but **before** the existing Spec Self-Review step (Step 6.5 in `skills/specify/SKILL.md`), dispatch 3 persona-instantiated agents in one parallel batch — Implementer, Maintainer, Skeptical Reviewer — each reading the full draft and returning Template-A findings narrowed to **ambiguities, gaps, and unstated assumptions**.

Findings are written **back into the spec body itself** as either an appended `## Open Questions` section (one row per finding with persona + finding + suggested resolution if the persona offered one) or as inline `<!-- ambiguity: ... -->` HTML comments next to the specific sentence the persona flagged. Each finding produces a `STAGED` entry in `decisions.md`. The existing Spec Self-Review step naturally surfaces these — they're now part of the spec the user reviews. **No new mid-flow prompt.**

Touches `skills/specify/SKILL.md` and `skills/specify/spec-template.md`. Adds the `/specify` integration test to `tests/multi-agent-coordination.test.js` (file created by Spec 01).

**Complexity:** Low–Medium
**Estimated tasks:** 4

## Non-Goals

- Not changing the 4-tier sizing guidelines or the decomposition heuristics in Step 2 of `/specify`.
- Not changing the polymorphic input behavior (topic vs. design-doc-path vs. INBOX reference).
- Not adding a 4th persona, swapping personas, or making personas user-configurable. The three personas are fixed by Spec 01.
- Not running red-team on backend/infra specs only — the lens questions are artefact-agnostic, so red-team runs on every spec regardless of `surface:` value.
- Not blocking the rest of `/specify` workflow on red-team findings. Red-team writes findings to the spec body and continues. The existing Spec Self-Review step does the human pass.
- Not running red-team in `/challenge` or `/review` — those are Specs 02 and 04.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 01 | Multi-Agent Coordination Primitive | not-started (must merge first) |

This spec depends on `skills/_shared/multi-agent-coordination.md` existing (for Mode 3's inlined dispatch template and persona prompts).

## Current State

- `skills/specify/SKILL.md` (388 lines) — produces specs from design docs. Existing Step 6.5 is the user-facing Spec Self-Review pass that scans for placeholders, internal consistency, scope, ambiguity. **Red-team runs immediately before Step 6.5** so its findings are part of what self-review evaluates.
- `skills/specify/spec-template.md` (181 lines) — the canonical spec template + frontmatter reference. Currently has no `## Open Questions` section.
- The Spec Self-Review step (Step 6.5) already has an ambiguity check: "Could any acceptance criterion be interpreted two different ways? Pick one and make it explicit." Red-team's output enriches what that step sees rather than duplicating it — personas surface things the author missed; self-review fixes them.
- Recent commit (4e0e44b) converted per-overlap interactive prompts into a single batch table; the anti-friction posture is established at this gate.

## Deliverables

- [ ] Add a new sub-step in `skills/specify/SKILL.md` between Step 6 (Clean Up INBOX) and Step 6.5 (Spec Self-Review) — call it **Step 6.4: Multi-Persona Red-Team**. Inline the Mode 3 dispatch template from Spec 01's primitive (Implementer / Maintainer / Skeptical Reviewer prompts verbatim).
- [ ] Document red-team output disposition: findings written into the spec body as either appended `## Open Questions` or inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences. STAGED `decisions.md` entry per finding.
- [ ] Update `skills/specify/spec-template.md` to add `## Open Questions` as an optional template section (only populated when red-team finds something — explicitly marked optional and omitted by self-review if empty).
- [ ] Add the `/specify` integration test to `tests/multi-agent-coordination.test.js`: fixture draft spec with deliberate ambiguity → red-team flags it → spec body contains `## Open Questions` section with the flagged ambiguity OR inline `<!-- ambiguity: -->` comment.
- [ ] Verify `node --test tests/` passes.

## Acceptance Criteria

1. When `/specify` writes a draft spec, Step 6.4 dispatches exactly 3 persona agents in one batch (Implementer, Maintainer, Skeptical Reviewer). Each agent receives the full draft spec body, the persona's lens question inlined verbatim from Spec 01's Mode 3, and the Template-A output contract narrowed to ambiguities / gaps / unstated assumptions.
2. Each persona's lens question is inlined exactly as defined in Spec 01:
   - **Implementer:** "Could I build exactly what this asks for without asking a question?"
   - **Maintainer:** "In 6 months, can someone changing related code know what they can/can't break?"
   - **Skeptical Reviewer:** "What unstated assumption is doing the load-bearing work here?"
3. Each returned finding includes: the persona name, the finding text, optionally a suggested resolution, and (when the persona pointed at a specific sentence) the line range or sentence identifier in the draft spec.
4. Findings written into the spec body in one of two shapes:
   - **Inline `<!-- ambiguity: ... -->` HTML comment** when the persona pointed at a precise location — the comment is inserted immediately after the flagged sentence with format `<!-- ambiguity: {persona} — {finding text}{; suggested: {resolution}} -->`.
   - **`## Open Questions` section appended to the spec** otherwise — one row per finding with table columns `Persona | Finding | Suggested Resolution`.
5. The `## Open Questions` section is added to `spec-template.md` as **optional** (marked `(optional)` in the template's section list). When red-team produces zero findings, the section is omitted entirely from the generated spec — it is not present as an empty placeholder.
6. Each finding produces a `decisions.md` STAGED entry with the schema from `auto-decision-log.md`:
   `STAGED {HH:MM:SS} — Red-team: persona "{persona}" flagged {ambiguity|gap|unstated assumption} at {location}. Written to spec as {<!-- ambiguity: --> marker | ## Open Questions row}.`
7. Red-team runs **before** Step 6.5 (Spec Self-Review). The existing Step 6.5 procedure is unchanged — it now scans the spec including any new red-team artefacts. No mid-flow user prompt is added between red-team and self-review.
8. `tests/multi-agent-coordination.test.js` includes a `/specify` integration test: a fixture draft spec containing a deliberate ambiguity (e.g., "the API should be fast" with no metric) is passed through the red-team logic; assertion that the resulting spec contains either a `## Open Questions` row OR an inline `<!-- ambiguity: -->` comment naming the ambiguous criterion.
9. All existing `node --test tests/` tests continue to pass.
10. Red-team runs on every generated spec regardless of `surface:` value (frontend/backend/infra/mixed). The personas' lens questions are not frontend-specific.

## Technical Approach

### Insertion point in `/specify` workflow

After Step 6 (Clean Up INBOX) and before Step 6.5 (Spec Self-Review), insert Step 6.4. The numbering keeps the existing Self-Review at 6.5 — no renumbering of downstream steps. Step 6.4 procedure:

1. For each draft spec produced by Step 3, dispatch 3 persona agents in one batch. Inline the Mode 3 dispatch template verbatim. Tier: **Standard** (Sonnet) — the work is judgment-heavy but isn't Capable-tier synthesis.
2. Collect findings. For each finding:
   - If the persona supplied a precise location (line range, sentence quote) → write inline `<!-- ambiguity: ... -->` HTML comment immediately after the flagged sentence.
   - Else → accumulate for the `## Open Questions` table.
3. If any findings accumulated, append the `## Open Questions` section to the spec body using the table format from acceptance criterion 4.
4. Append one STAGED `decisions.md` entry per finding using the schema from acceptance criterion 6.
5. Proceed to Step 6.5 — the spec now includes red-team artefacts that self-review will scan.

### Persona prompts (inlined verbatim per Subagent Contract)

Each persona's `Task()` prompt skeleton (illustrative; author per existing prose style in the SKILL):

```
Task scope: Read the draft spec below as {Implementer | Maintainer | Skeptical Reviewer}.
Lens question: {persona's lens question — verbatim from Spec 01}
Constraint: Surface only ambiguities, gaps, and unstated assumptions. Not stylistic feedback. Not approval/rejection.
Output: Template-A — one finding per row with columns: Severity | Path:Line (the line range in the draft spec, OR "general" if no precise location) | Finding | Evidence | Suggested resolution (optional).
Read-only. Do not modify the spec.

Draft spec follows:
---
{draft spec content}
```

Three such dispatches go out in one batch via Form B parallel execution.

### Spec-template.md addition

Add a new section block to `skills/specify/spec-template.md` after `## Assumptions (optional)` and before `## Manual Steps`:

```markdown
## Open Questions (optional)

{Populated by /specify Step 6.4 multi-persona red-team. Each row is a question raised by a persona during red-team review. When empty, this section is omitted from the spec.}

| Persona | Finding | Suggested Resolution |
|---------|---------|---------------------|
| {Implementer | Maintainer | Skeptical Reviewer} | {finding text} | {resolution or "—"} |

{Resolve each row during Step 6.5 Self-Review: edit the spec to remove the ambiguity, or explicitly accept the finding inline. When all rows resolved, delete the section.}
```

Mark the section `(optional)` in the canonical template's section list at the top of the file (matching how `## Manual Steps`, `## Decision Rationale (optional)`, `## Assumptions (optional)` are marked).

### Inline `<!-- ambiguity: -->` comment shape

Format: `<!-- ambiguity: {persona} — {finding text}{; suggested: {resolution}} -->`

Placement: immediately after the flagged sentence, on the same line if short, on the next line if long. Example:

```
The API should return results quickly. <!-- ambiguity: Skeptical Reviewer — "quickly" has no metric; suggested: define p95 latency target -->
```

These comments are invisible in rendered markdown but visible in the raw file the user reviews during Self-Review.

### Data / API Surface

No new files in `bin/lib/`. Red-team output is markdown-mutation logic that lives in the `/specify` skill prose — implementations consume Spec 01's primitives directly.

### Key Files

- `skills/specify/SKILL.md` — insert Step 6.4 between Step 6 and Step 6.5; inline the Mode 3 dispatch template with the three persona prompts verbatim; document write-back disposition (inline comment vs. Open Questions section). **~30 line growth expected.**
- `skills/specify/spec-template.md` — add `## Open Questions (optional)` section between `## Assumptions (optional)` and `## Manual Steps`; mark `(optional)` in any section-list overview at the top of the template. **~15 line growth expected.**
- `tests/multi-agent-coordination.test.js` — add the `/specify` integration test (file created by Spec 01). **~1–2 test blocks added.**

### Package Dependencies

- No new external packages. No new `bin/lib/` modules — the persona-dispatch + write-back logic is described in skill prose, not implemented in JS code. The integration test uses the dispatch recorder from Spec 01's test file with fixture persona outputs.

## Gotchas

- **The shared test file `tests/multi-agent-coordination.test.js` is also touched by Specs 02 and 04.** See the same Gotcha in Spec 02 — build sequentially via `/claude-tweaks:flow 02,03,04`.
- **`spec-template.md`'s "Why Each Section Matters for `/superpowers:writing-plans`" table** must also gain an `## Open Questions` row when the section is added — otherwise the canonical template's section-to-purpose mapping has a gap. The row should read: "Open Questions | Reviewed during Step 6.5 Self-Review — must be resolved (clarified or accepted) before the spec is handed to `/superpowers:writing-plans`."
- **`spec-template.md`'s "No Placeholders" failure-pattern list** does NOT need updating — `## Open Questions` rows are not placeholders, they're explicit unresolved items. The user is expected to act on them during Self-Review. Don't accidentally categorise them as `TBD`-like failures.
- **Personas must not modify the draft spec themselves** — they are read-only review agents. The write-back logic (HTML comment insertion or table appending) is the dispatcher's responsibility, not the agent's. State `Read-only. Do not modify the spec.` in every persona prompt per the input-discipline rules.
- **The Skeptical Reviewer persona is the riskiest** — its lens "what unstated assumption is doing the load-bearing work" can produce verbose philosophical findings if the prompt isn't tight. Keep the constraint clear: ambiguities, gaps, unstated assumptions only. Not stylistic feedback. Not approval/rejection.
- **Persona prompt depth for large specs** — design doc open question 3 flags that specs are larger than typical review artefacts. If integration testing shows the Implementer persona producing exhaustive enumeration on a 200-line spec instead of "the 3-5 most load-bearing ambiguities," add explicit length guidance to the Implementer prompt: "Focus on the 3-5 most load-bearing ambiguities, not exhaustive enumeration. If you find more than 5, return only the 5 highest-impact and note '(N more not listed)' in your summary." This guidance is conditional on tuning during implementation, not a v1 default.
- **HTML comments in markdown specs are preserved by all standard markdown tooling** — the `<!-- ambiguity: -->` markers survive markdownlint, mdformat, and renderers. They are not visible in rendered output (good — keeps the spec readable to humans during review) but are visible when editing (good — Self-Review sees them).
- **When red-team finds zero findings, the `## Open Questions` section is omitted entirely.** Do not write an empty header with a "(none)" placeholder — that's noise. Self-Review skips a section that doesn't exist; that's the correct behavior.
- **Red-team is dispatched at Standard tier (Sonnet).** Not Fast (Haiku — would miss subtleties), not Capable (Opus — overkill for ambiguity detection on a single artefact). Standard matches the cost/value envelope per the Subagent Contract tier guidance.
- **Decisions.md entry timing.** Write entries *after* the spec body is updated, not before — that way if the write-back fails for any reason (e.g., the persona supplied an unparseable location), the decision-log doesn't lie about what happened.

## Decision Rationale

(See Spec 01's Decision Rationale for the broader design context.)

- **Why write findings into the spec body rather than presenting as a prompt.** The binding operational rule: "No mid-flow stops in auto mode." Surfacing red-team findings as an inline prompt would add a new mid-flow stop. Writing findings into the spec body folds them into the existing Step 6.5 Self-Review — the user sees them naturally during their existing pass, no new interruption.
- **Why three personas, not five or ten.** Spec 01's Mode 3 hard-limits 3 personas. The three chosen (Implementer / Maintainer / Skeptical Reviewer) cover orthogonal failure modes: implementer catches under-specification, maintainer catches future-coupling, skeptical reviewer catches load-bearing assumptions. Adding more personas risks vote-counting (the same anti-pattern that limits reproduction to 2 and debate to 2).
- **Why STAGED, not AUTO.** AUTO means "applied — override = revert." STAGED means "logged for the Console." Red-team findings are *informational* — they're written into the spec body, not auto-resolved into edits. The user (or Self-Review) decides what to do with each one. STAGED accurately reflects "we wrote it down; you decide."

## Manual Steps

None — this spec ships markdown updates and one integration test. After merge, run `node --test tests/`. Optionally exercise `/claude-tweaks:specify` on a known-ambiguous design doc to confirm `## Open Questions` populates correctly.
