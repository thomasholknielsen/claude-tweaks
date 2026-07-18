# demo — Design

**Goal:** Give the human a durable, cross-thread way to see everything that's finished building
across many parallel `/dispatch`/`/flow`/`/build` threads, get a tailored "here's what changed and
how to poke at it" brief without re-deriving it from scratch each time, and record an explicit
human verdict that is distinct from — and layered on top of — "tests passed" and "spec built."

**Architecture:** A seventh axis on the unified work-record contract (**Acceptance**:
`demo:pending` / `demo:approved` / `demo:changes-requested`), produced solely by
`/claude-tweaks:wrap-up` (which writes a **Verification Brief** as an issue comment while it still
has full context on hand), and resolved solely by a new standalone skill,
`/claude-tweaks:demo`, which aggregates every `demo:pending` record (open or closed — covers
already-merged autonomous work too), walks the human through each brief, captures a verdict, and
on "changes requested" files a linked follow-up backlog record.

## Motivation

The existing lifecycle has three things that sound similar but aren't: `/claude-tweaks:test`
(mechanical pass/fail — types, lint, tests, QA story replay), `/claude-tweaks:review` (analytical
judgment on code quality/correctness, gated on test passing), and merging (today the *implicit*
signal that a human looked at the result and it's good). None of these is "a human actually
exercised the feature and confirmed it does what was asked."

With 5-10 threads in flight at once — a mix of autonomously-dispatched (`auto:build`/`auto:merge`)
work and the user's own interactively-steered `/build`/`/flow` sessions — this gap compounds:

- **No durable overview.** Nothing aggregates "here's everything currently waiting on your
  judgment" across threads. `/help`'s status scan shows pipeline-run state, not an acceptance
  worklist.
- **Instructions get re-derived every time.** By the time the user circles back to actually verify
  a feature, the context (what changed, why, how to exercise it) has to be reconstructed — the
  user described repeatedly asking for "more specific instructions for testing it out."
- **Not everything is testable.** Some work (docs, harness config, backend refactors with no
  observable surface) has no click-through dimension at all, but still deserves a human look.
- **Not everything waits for a human before merging.** Autonomous `auto:merge` work merges
  without a live review by design — but the user still wants to be able to look at it after the
  fact and mark it approved, or flag a gap.

## Non-Goals

- **Not a merge mechanism.** `/demo` never merges or opens PRs — that stays with
  `superpowers:finishing-a-development-branch`. `/demo` only ever resolves the Acceptance axis.
- **Not a replacement for `/test` or `/review`.** Those remain the mechanical and code-quality
  gates respectively; `/demo` is strictly the human-judgment layer above both.
- **Not an automated or scheduled sweep.** Deliberately human-invoked only, like `/tidy` and
  `/triage` — no Routine, no auto-verdict, no silent resolution. This is one of the "not silenced"
  categories the Auto-Mode Contract already carves out room for (human sign-off), so it stays
  outside `auto` mode entirely.
- **Not gated by `auto:merge`.** `auto:merge` controls merge *timing* only. Whether a record
  eventually needs `demo:pending` resolved is orthogonal — an autonomously-merged record still
  gets a Verification Brief and still shows up in `/demo` for retrospective sign-off.
- **Not a skip path for trivial work.** Every completed record gets `demo:pending` uniformly, same
  as every other axis in this taxonomy (no project-level opt-out flag, consistent with how
  `ready`/`auto:*`/`bot:*` apply unconditionally). The batch UI's low-risk fast path (below) is
  where triviality gets handled — not by suppressing the gate itself.
- **Not retroactive.** No backfill of `demo:pending` onto records that closed before this shipped.
- **Not a `/tidy`-style staleness sweep** over old `demo:pending` records in v1. Worth revisiting
  once there's real usage data on how long these tend to sit unresolved; adding it now would be
  guessing at a threshold with no evidence.

## Architecture

### Taxonomy addition — seventh axis: Acceptance

`skills/_shared/work-record.md` gains a new axis alongside Type / Origin / Scoring / Stage /
Authorization / Bot state:

| Axis | Values | Expressed as |
|---|---|---|
| **Acceptance** | `demo:pending`, `demo:approved`, `demo:changes-requested` | Labels — at most one present at a time |

The lifecycle spine's final leg extends from a bare `BUILDING ──user merges──► CLOSED` to:

```
BUILDING ──/wrap-up: build+test+review done──► demo:pending ──human runs /demo──► demo:approved
                                                    │                                   │
                                                    │                       (merge proceeds, or already happened
                                                    │                        for auto:merge'd work)
                                                    └──► demo:changes-requested ──► follow-up record (backlog)
```

Permission-matrix additions (one new row, one new column entry):

| Actor | Adds | Removes | Never |
|---|---|---|---|
| **`/wrap-up`** | `demo:pending` | nothing | `demo:approved`, `demo:changes-requested` |
| **`/demo`** | `demo:approved`, `demo:changes-requested` | `demo:pending` (on resolution) | adding `demo:pending` itself |

No other skill in the permission matrix gains a new entry — health skills, `/capture`,
`/specify`, `/triage`, `/dispatch`, `/tidy` never touch this axis.

`_shared/label-bootstrap.md`'s `LABELS_JSON` gains the three labels (≤100-char descriptions,
same check-then-create bootstrap convention as every other family). `bin/lib/issues/record.js` —
the prose twin — gains the three label constants and an `acceptance` field on
`parseRecordFacets`'s returned facet shape (`'pending' | 'approved' | 'changes-requested' | null`),
mirrored by new cases in `bin/lib/issues/tests/*.test.js` the same way `bot`/`grants` are covered
today. The `local-files` driver gets an equivalent `facets.acceptance` frontmatter field for
isomorphism (same non-enforcement caveat as the rest of this taxonomy under that driver — see
work-record.md's Driver-conditional note).

### `/wrap-up` — trigger point + Verification Brief

`/wrap-up` gains a step (alongside its existing Step 5 cleanup) that fires once the record is
otherwise ready to close: apply `demo:pending`, then write a **Verification Brief** as an issue
comment. Generating it here — not later, inside `/demo` — matters: wrap-up already has the diff,
the spec, journeys, and ledger in hand; `/demo` running days later across a cold thread would
otherwise have to reconstruct all of that per record, which is exactly the "asking for more
specific instructions" pain this design targets.

Brief content, assembled in priority order from what already exists:

1. **What changed** — summary from the record body + diff.
2. **Why** — the record's Acceptance Criteria section (or design-doc rationale for design-mode
   builds with no spec-shaped record).
3. **How to verify** — first choice, QA stories (`stories/*.yaml` matching `source_files`);
   second, a journey doc (`docs/journeys/*.md`); third, a manual walkthrough synthesized from the
   Acceptance Criteria plus the dev URL (reusing `dev-url-detection.md`, not reinventing URL
   discovery).
4. **Non-testable fallback** — when the diff touches only non-UI paths (docs, config, harness
   skill files, backend-only with no observable surface), the brief says so explicitly and
   reframes the ask as "review the diff/rationale," not "click through this."

Stored as a comment (not a body edit) so the spec-shaped body stays stable and multiple
build/demo cycles on the same record leave a chronological log.

### `/claude-tweaks:demo`

**Input:** `$ARGUMENTS` — *(none)* sweeps every `demo:pending` record; `#N` scopes to a single
record.

**Discovery:** `gh issue list --state all --label demo:pending` (or the `local-files` facet
equivalent). `--state all` is what makes retrospective sign-off on already-merged `auto:merge`
work possible — the label persists independent of open/closed state.

**Presentation:**

1. A scope summary line (count, split by risk tier) per this project's 10+-item convention.
2. A batch table: `# | Title | Type | Risk/Effort | What changed (1-liner from the brief) |
   Suggested verdict`. Suggested verdict is pre-filled **Approve** only for records that are both
   `risk:low` and `effort:low` and don't touch any `merge-sensitive-paths` glob; every other
   record gets **Needs a look** with no pre-fill — this skill exists for real judgment, so blind
   bulk-approval is opt-in for the genuinely trivial tier only, never the default.
3. One `AskUserQuestion` terminal decision: *Approve the low-risk batch, walk through the rest
   individually* (recommended) / *Walk through every item individually* / *Override specific
   items*.

**Per-item walkthrough:** render the full Verification Brief from wrap-up's comment, then capture
a verdict via `AskUserQuestion`: **Approve** / **Request Changes** / **Skip for now** (leaves
`demo:pending`, resurfaces on the next `/demo` run — never silently dropped).

**Verdict handling:**

- **Approve** → swap `demo:pending` → `demo:approved`.
- **Request Changes** → prompt for a short reason, swap to `demo:changes-requested`, file a
  linked follow-up record: backlog stage (not born-ready — a one-line reason isn't spec-shaped
  the way a health-skill finding is), Type `bug` by default (a filer's judgment can override for a
  scope-adding request), no `by:*` label — instead `Origin: demo changes-requested from #N` per
  the existing side-effect-record convention — plus the reason and a link back to the original.
  `/demo` also comments on the *original* record noting the follow-up's issue number, so the link
  is bidirectional.
- **Skip for now** → no label change.

`/demo` never merges. It is a standalone, human-invoked leaf skill like `/tidy`/`/triage`/`/help`
— never invoked by another skill, so it carries no Component-Skill Contract and always renders its
own `## Next Actions`.

## Relationship to Existing Mechanisms

- **vs. `/test`** — mechanical pass/fail on types/lint/tests/QA stories. `/demo` runs *after* that
  gate already passed; it never re-runs or duplicates it.
- **vs. `/review`** — analytical code-quality/correctness judgment. `/demo` is not about code
  quality at all; it's about whether the *behavior* matches what the human actually wanted.
- **vs. `/wrap-up`** — remains the lifecycle closure step; it gains one producer responsibility
  (label + brief) but the merge/PR decision it already drives is untouched.
- **vs. `/help`** — `/help`'s dashboard (live counts by stage/grants/bot state) gains a `demo:pending`
  count alongside its existing axis counts, giving a lightweight "N awaiting your sign-off"
  signal without duplicating `/demo`'s own detailed walkthrough.
- **vs. `/tidy`** — no interaction in v1 (see Non-Goals); a natural future extension once usage
  data exists.

## Testing

- `bin/lib/issues/record.js`: unit tests for the three new label constants and the new
  `facets.acceptance` case in `parseRecordFacets`, mirroring existing coverage patterns in
  `bin/lib/issues/tests/`.
- No new `bin/` CLI — like `/triage` and `/dispatch`, `/demo` is a pure-prose skill shelling out to
  `gh` directly; it does not join `code-health.js`/`harness-health.js`/`journey-health.js`'s
  dedicated-CLI pattern.
- `npm test` must stay green (covers the `bin/lib/issues/tests/*.test.js` additions).

## Known Touch Points

- `skills/_shared/work-record.md` — lifecycle spine diagram, axis table (six → seven), label
  taxonomy table, permission matrix, consumers table.
- `skills/_shared/label-bootstrap.md` — `LABELS_JSON` += 3 labels.
- `bin/lib/issues/record.js` + `bin/lib/issues/tests/*.test.js` — label constants, facet parsing,
  mirrored tests.
- `skills/wrap-up/SKILL.md` (+ a sub-file if the brief-generation procedure grows long) — new step.
- `skills/demo/SKILL.md` (new skill directory) — full standard structure (frontmatter,
  interaction directive, Anti-Patterns table, Relationship table).
- `skills/help/reference-card.md` — add `/demo` to the command catalog.
- `skills/help/status-scan.md` / dashboard counts — add the Acceptance axis.
- `README.md` — skill directories table (30 → 31, add `demo` under **Utility**), workflow
  diagram, artifact lifecycle diagram (must stay in sync with `/help`'s per CLAUDE.md).
- `CLAUDE.md` — skill directory count/list.
- Bidirectional Relationship-to-Other-Skills updates: `/wrap-up`'s table gains a `/demo` row;
  `/demo`'s own table references `/wrap-up`, `/test`, `/review`, `/help`.
- `.claude-plugin/plugin.json` — version bump (minor, per CLAUDE.md versioning rules) — check
  `origin/main` for a concurrent bump first, per the Releasing section's discipline.
