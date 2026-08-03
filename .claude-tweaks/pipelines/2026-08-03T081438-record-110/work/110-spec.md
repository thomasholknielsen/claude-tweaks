---
record: 110
origin: human
risk: low
effort: medium
ceremony: standard
grants: []
surface: infra
---
# 110: Sibling health skills pass a 29,728 B fragment pointer to dispatched agents (same class as #94)

Surface: infra

## Current State

`skills/harness-health/SKILL.md:56`'s parallel-dispatch blockquote states that each dispatched agent gets *"a pointer to `_shared/harness-health-analysis.md`"* (34,314 B) as the judging procedure to apply. Every agent in a `--budget > 1` firing therefore reads that file independently — a `--budget 4` run pays ~137 KB to deliver one procedure four times.

This is the cost half of the defect `#94` fixed for `/docs-health`. It is **not** the correctness half: the path resolves, so agents do complete. `#94`'s docs-health case was worse precisely because its references (`"Step 3 above"`, `SKILL.md` by path) were unresolvable, so agents emitted malformed output rather than merely expensive output.

`/claude-tweaks:init` Phase 6 (`skills/init/SKILL.md:363`, `:369`) is adjacent but a **different consumption shape**: `:369` instructs the main-thread reader to read the fragment, and `:363`'s conditional dispatch does not itself hand agents a pointer. It needs verifying, not assuming.

## Deliverables

- A skill-local, agent-facing procedure file for `/claude-tweaks:harness-health` — distilled from `_shared/harness-health-analysis.md`, self-contained, with a meta lead above a horizontal rule and an inlinable body below it.
- `skills/harness-health/SKILL.md:56`'s dispatch blockquote rewritten to inline that body verbatim (with placeholder substitution) instead of passing a path.
- A test asserting the inlinable body carries no reference a clean-room agent cannot resolve.
- A verified answer for `/init` Phase 6: either the same treatment, or a documented statement of why its consumption shape does not need it.

## Acceptance Criteria

- A dispatched harness-health agent receives its judging procedure inlined; no `--budget > 1` firing reads `_shared/harness-health-analysis.md` N times.
- `skills/_shared/harness-health-analysis.md` is **unchanged** — its other consumers keep reading it exactly as they do today.
- The self-containment test fails when a forbidden reference is injected into the inlinable body (verify by injecting one, as the reference implementation was).
- `skills/harness-health/SKILL.md` does not grow; ideally it shrinks.
- `npm test` passes.

## Technical Approach

**The design question this record originally left open is resolved: add a skill-local distilled file; do not split the shared fragment.**

That is what `#94` actually did for docs-health, verified against the commit rather than inferred: `git show --stat 5e188b42 -- skills/_shared/` returns nothing — the fix touched **zero** files under `_shared/`. It added `skills/docs-health/judge-procedure.md` (9,265 B), a distillation of the 15,008 B `_shared/criteria-docs-diataxis.md`, and left that fragment untouched for all 7 of its consumers.

So the 13 files referencing `_shared/harness-health-analysis.md` are not in the blast radius — none of them get touched. Copy the docs-health shape:

- One canonical file, two callers: the sequential path reads it; the dispatch path inlines its body verbatim.
- Meta lead above a `---`, inlinable body below, so the "how this file is used" text never reaches an agent.
- Dispatcher-substituted placeholders (`{target.path}`, `{target.id}`, `{plugin-root}`, `{root}`) rather than raw `$CLAUDE_PLUGIN_ROOT` — a subagent's environment may not carry it.

### Key Files

- `skills/harness-health/SKILL.md` — line 56's dispatch blockquote (the defect); the file to add a sub-file reference from
- `skills/_shared/harness-health-analysis.md` — the source to distill from; **read-only, do not modify**
- `skills/docs-health/judge-procedure.md` — the reference implementation of the file to create
- `skills/docs-health/SKILL.md` — reference for both caller shapes (Step 3 reads; Step 1 dispatch inlines)
- `bin/lib/docs-health/tests/skill-md.test.js` — the reference self-containment test to mirror
- `bin/lib/harness-health/tests/skill-md.test.js` — where the mirrored test lands
- `skills/init/SKILL.md` — lines 363, 369; verify only
- `docs/plugin-structure.md` — the sub-file table needs a row for the new file

## Gotchas

- **`skills/harness-health/SKILL.md` is already 45,577 B — over CLAUDE.md's 40 KB soft ceiling before this work starts.** Inlining the distilled body into it directly would make that worse; that is exactly `[IL-72]`. The fix must reference a sub-file, not inline into SKILL.md.
- `_shared/harness-health-analysis.md` has 13 referencing files, not the 3 an earlier version of this record claimed. The correct move keeps all 13 unaffected — but any approach that *does* modify the shared fragment inherits all 13 as blast radius, so verify before deviating.
- harness-health's dispatch has a `kind`-dependent branch: `design-artifact` and `memory` targets use the skill's own Step 3 branch text, not the shared fragment. The distilled file must cover, or explicitly exclude, those branches.
- Adding the sub-file requires a row in `docs/plugin-structure.md`'s sub-file table — the table already has a `harness-health` row listing two sub-files, so extend it rather than adding a second row.

## Original request

Sibling health skills pass a 29,728 B fragment pointer to dispatched agents (same class as #94)

Surface: skills

## Current State

`#94` fixed `/docs-health`'s dispatch prompt, which told agents to inline literally and then referenced content they could not reach. Its own Gotchas section flagged that the sibling skills have the same shape, and that was verified during that work but left unaddressed:

- `skills/harness-health/SKILL.md:56` — the parallel-dispatch blockquote states each agent gets *"a pointer to `_shared/harness-health-analysis.md`"* (29,728 B) as the judging procedure to apply.
- `/claude-tweaks:init` Phase 6 does the same.

Unlike #94's defect this is not a correctness bug — the path resolves, so agents do complete. It is the N-times-duplication cost: every dispatched agent reads the full fragment independently, so a `--budget 4` firing pays ~29.7 KB × 4.

## Deliverables

- Apply the same resolution `#94` used for docs-health: one canonical procedure file, read by the sequential path and inlined verbatim by the dispatch path — see `skills/docs-health/judge-procedure.md` and its callers (`skills/docs-health/SKILL.md` Step 3 and Step 1's dispatch block) as the reference implementation.
- Decide whether `_shared/harness-health-analysis.md` can serve as that canonical file directly (it is shared with `/wrap-up` and `/init`, so it may need the same meta-lead / inlinable-body split `judge-procedure.md` uses) or whether harness-health needs its own distilled sub-file.

## Acceptance Criteria

- A dispatched harness-health agent receives its judging procedure inlined, not as a path.
- `/init` Phase 6 does the same, or documents why it should not.
- The inlinable body carries no reference a clean-room agent cannot resolve, enforced by a test — `bin/lib/docs-health/tests/skill-md.test.js`'s `judge-procedure.md body is self-contained` test is the working reference (it was verified to discriminate by injecting the exact regression).
- Whichever host file gains content stays under the 40 KB SKILL.md soft ceiling (`CLAUDE.md`, `[IL-72]`).

## Gotchas

- `_shared/harness-health-analysis.md` has three consumers (`/harness-health`, `/wrap-up` Step 7, `/init`), so a split must not break the two that read it directly rather than inlining it.
- `skills/harness-health/SKILL.md` is already 58 KB+; inlining into it directly would breach the ceiling, which is exactly the mistake `[IL-72]` records.

## Original request

Surfaced as a deferred `/claude-tweaks:reflect` insight during the `/claude-tweaks:wrap-up` for #94/#92/#101, and verified against the live file at that time.

