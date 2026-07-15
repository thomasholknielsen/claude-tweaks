# unified-digest — Design

**Goal:** Collapse the human-facing surface of the triage → dispatch → review pipeline into fewer
touchpoints — one motion to grant-and-build, one recurring place to learn what needs a human.

**Architecture:** Two independent, additive changes, each reusing existing mechanics rather than
introducing new ones. (1) A new explicit-list invocation form on `/claude-tweaks:dispatch`
(`#N[,#M,...]`) that triage's Next Actions calls directly with just-granted record numbers,
skipping dispatch's own re-selection UI. (2) A new PR finding shape plus enumerated (not just
counted) queue metrics in the existing `/claude-tweaks:tidy --scope=github` rolling digest.

**Tech Stack:** Markdown skill-file changes only (`skills/dispatch/SKILL.md`,
`skills/triage/SKILL.md`, `skills/_shared/github-pr-scan.md`, `skills/tidy/SKILL.md`) — no new
modules, no new dependencies. Any incidental pure-logic extraction (if planning decides one is
warranted) would land in `bin/lib/issues/` per existing convention.

## Motivation

The unified work-record model (specs 13-23, 6.0.0) already runs triage → dispatch → flow →
wrap-up → close-via-merge as five separate skill invocations plus one async digest. Two real
gaps make this feel like more touchpoints than the underlying work requires:

1. **Grant and build are artificially two sittings.** After `/claude-tweaks:triage` grants
   `auto:build`, the human's only path to actually building it is a *second*, structurally
   identical batch-pick UI inside `/claude-tweaks:dispatch` — re-selecting from a table that, in
   the common case, is exactly what was just granted a message ago.
2. **The one async notice surface doesn't actually surface everything it should.** `/tidy`'s
   `--scope=github` rolling digest already fires every 3 hours and already tracks
   pending-authorization/blocked/backlog *counts* — but a fresh, clean, dispatch-opened
   `pending-review` PR produces no digest finding at all until it ages a full 4 weeks into
   `Stale` — the existing severity table has no finding shape for a clean PR in the `Fresh` (0-2
   week) or `Review` (2-4 week) bands, only for `Stale`. A human relying on the digest as their
   one check-in point can miss a PR that's been waiting for a merge click for weeks.

Both fixes are deliberately narrow — this is the smallest-lift of four directions identified
after this system's first two real dispatch firings (#18, #19); see
`2026-07-15-assess-agent-autonomy-design.md` for the (larger, separately-scoped) content-aware
judgment direction from the same evaluation.

## Non-Goals

- **Not** a change to any authorization/security boundary. `/claude-tweaks:triage`'s Step 3 grant
  confirm is untouched — still the sole, unshortened human confirmation for every `auto:build`/
  `auto:merge` grant. This design only changes what happens *after* a grant is applied.
- **Not** a "drain" mode or consolidated multi-group console. `/claude-tweaks:dispatch`'s own
  docs already reject this shape ("throughput comes from routine cadence × single-group firings,
  not session breadth") — nothing here reintroduces it.
- **Not** an actionable digest. The digest stays a read-only notice surface; a human still runs
  `/triage`, `/dispatch`, or opens the PR directly to act. No comment-to-grant, no embedded
  buttons.
- **Not** surfacing `assess-agent-autonomy`'s `merge-check`/`failure-check` rationale in the
  digest. Considered and explicitly deferred — `/tidy`'s scan doesn't fetch PR diffs today, and
  doing so purely to generate an assistive annotation is a real, separate cost. Revisit once
  `assess-agent-autonomy` itself has shipped and there's a natural point to reuse its verdicts
  rather than re-deriving them.
- **Not** a change to `dispatch-pick-max-concurrent`'s meaning, the auto-merge gate, or the
  Settle step. The just-granted set is subject to the exact same concurrency cap, claim
  mechanics, and failure handling as any other dispatch selection.

## Architecture

### Part 1: Triage → dispatch hand-off

#### New dispatch invocation form: explicit list

Extend `/claude-tweaks:dispatch`'s existing `#N` "Direct" form (`skills/dispatch/SKILL.md` Step
3) to accept a comma-joined list of issue numbers: `#N[,#M,#O...]`. This is a superset of the
existing single-`#N` form, not a parallel mechanism:

1. Re-verify each named record still carries `auto:build` and no `bot:*` label (the same live
   re-check the singular `#N` form already does — seconds may have passed since the grant).
   Report and drop any that no longer qualify; don't abort the whole batch over one stale entry.
2. Pull each named record's whole file-overlap group from Step 2's grouping, deduplicating groups
   that share a member (two named records might already belong to the same group).
3. Skip Step 3's `AskUserQuestion` entirely — selection is already explicit, there is nothing to
   pick.
4. Proceed straight to Step 4 (claim) → Step 5 (Task-agent dispatch), unchanged in every other
   respect: `dispatch-pick-max-concurrent` still throttles how many groups run at once, with the
   remainder queued exactly as bare mode's "more selections than the cap" case already handles;
   Step 4's atomic claim/contested-claim logic runs per group member exactly as today, so a
   record claimed by a concurrent session or routine firing in the intervening seconds is simply
   skipped, not treated as an error.

#### Triage's Next Actions change

`skills/triage/SKILL.md`'s Next Actions Option 1 changes from a generic hand-off to plain
`/claude-tweaks:dispatch` (which re-pulls and re-groups the *entire* authorized queue) to a
call into the new explicit-list form, passing exactly the record numbers Step 4 just applied a
grant to — not the full historical authorized queue. Reword the option label from `"Dispatch
what's authorized (Recommended)"` to `"Dispatch what I just granted (Recommended)"` to match the
narrower, more precise scope.

A human who wants the broader authorized queue (including older, previously-granted-but-
undispatched records from a prior session) still runs plain `/claude-tweaks:dispatch` themselves
— that path, and its own Step 3 picker, is completely unchanged. It doesn't need a dedicated slot
in triage's Next Actions menu, since it was never scoped to "this session" in the first place and
remains one command away regardless.

Everything else in triage (Step 1 queue pull, Step 2 recommend, Step 3 batch-confirm, Step 3.5
body-shape re-verification, Step 4 apply) is unchanged.

### Part 2: Digest consolidation

#### New PR finding shape

`skills/_shared/github-pr-scan.md`'s `repo-wide` scope (item 1, Open PRs) currently classifies
every open PR only by staleness age (Fresh / Review / Stale), but the existing severity-mapping
table only ever gives a finding to the `Stale` (>4 weeks) case — a clean PR sitting in the
`Review` band (2-4 weeks) is just as invisible today as a brand-new one. Add a new finding for a
PR that is simultaneously: not draft, **not yet `Stale`** (< 4 weeks since `updatedAt` — spans
both the `Fresh` and `Review` bands, closing the whole gap rather than half of it), zero
unresolved review threads, and no failing/pending CI:

```
[pr] PR #{n}: {title} — awaiting review — last updated {age} ago, CI {status}, 0 unresolved threads
```

("last updated," not "opened" — the underlying check is keyed on `updatedAt` per this scope's
existing Staleness Thresholds, not creation time, so the label should match what's actually being
measured.)

**Disposition:** the same "Auto (no-op), always surfaced regardless of aggressiveness" treatment
`tidy/SKILL.md`'s Step 6 routing table already gives "Needs scoring" and "Re-triage" findings —
not a new Action Vocabulary entry. This finding recommends nothing to mutate; it exists purely so
the digest shows it promptly instead of only once it ages into the existing "stale" finding.
**Severity:** `info` — distinct from the existing `medium` "stale open PR" row, so a PR that later
does go stale produces a genuinely different row rather than colliding with this one.

#### Enumerated queue metrics

`github-pr-scan.md`'s `repo-wide` scope item 7 (grant-queue counts) currently returns only
`{pending, blocked, backlog}` lengths. Extend the same query to also return each bucket's record
list (`{number, title}`), and render every non-empty bucket as bullets under its existing summary
line in `tidy/SKILL.md`'s digest structure:

```markdown
**Pending authorization:** 3 records awaiting a grant
- #142: Add dark-mode toggle
- #156: Migrate footer to shadcn
- #161: Dedup ingredient aliases

**Blocked:** 1 record hit its retry ceiling
- #118: Refiner lexicals inArray fix
```

Omit the bulleted sub-list (not just the summary line) when a bucket's count is 0, matching the
existing "omit any line whose count is 0" rule. No cap on list length — if a bucket grows to 40
records, all 40 render; this project's tidy/digest mechanics already avoid silent truncation
elsewhere, and a human relying on this digest as their one check-in point should see the true
size of what's waiting, not a hidden overflow.

#### Dedup and notification: reused unchanged

The new PR finding gets its own finding-type key (e.g. `142:awaiting-review`), distinct from the
existing `142:stale-pr`/`142:unresolved-thread` keys the digest's dedup already tracks. This is
exactly the "finding-type materially changed → new row, not a duplicate" case
`tidy/SKILL.md`'s existing dedup rule already documents (a PR that's fresh this cycle and stale
next cycle is a key change, not a re-notify of the same finding) — no new dedup mechanism needed.
A first-time "awaiting review" row is new-this-firing by that same existing logic, so it
triggers the existing `PushNotification` rule exactly like any other new finding, with no special
casing required.

## Error Handling

- **Explicit-list dispatch form, a named record no longer qualifies** (claimed by a race, grant
  stripped): report why per-record (no grant / already claimed / blocked), continue with the
  rest of the named set — don't abort the whole batch over one entry, matching the existing
  singular `#N` form's behavior.
- **Partial claim within the just-granted set:** the existing partial-claim release-and-skip
  logic (`skills/dispatch/SKILL.md` Step 4) applies unchanged — release whatever this firing did
  claim, log, move to the next candidate.
- **New PR finding shape, a `gh pr checks` call fails transiently:** degrades to
  `DONE_WITH_CONCERNS` with whatever partial results exist, matching every other mid-scan `gh`
  failure in this scope today — never a hard block, per the Detection Ladder's existing fail-open
  posture.

## Testing

- No new pure modules are introduced by this design as scoped — both changes are prose-procedure
  edits to existing skill files. If planning identifies a piece of genuinely mechanical logic
  worth extracting (e.g., the explicit-list parsing/dedup-by-group step), it gets ordinary
  `node --test` fixture coverage in `bin/lib/issues/`, matching every other file there.
- The new PR finding shape and enumerated-list rendering are prose-procedure, LLM-driven scan
  behavior, not unit-testable in the traditional sense — verified the same way this skill's
  other classification rules already are: worked examples written directly into
  `github-pr-scan.md`/`tidy/SKILL.md` as anchoring reference points, the same role the
  calibration-examples play in `assess-agent-autonomy`'s design.
- Manual verification before considering this design implemented: dry-run both changes against
  this repo's own live queue — records #18/#19 and any currently-open PRs are real, available
  fixtures, not hypothetical ones.

## Known Touch Points (not exhaustive — writing-plans owns the precise file-by-file breakdown)

- Modified: `skills/dispatch/SKILL.md` (Step 3 — new explicit-list form), `skills/triage/SKILL.md`
  (Next Actions Option 1 — reworded + rewired), `skills/_shared/github-pr-scan.md` (new PR
  finding shape in `repo-wide` scope item 1; enumerated lists in item 7), `skills/tidy/SKILL.md`
  (digest structure — bulleted sub-lists under the three summary lines)
- Documentation: none of these are new skills, so no README/help skill-count changes are needed
  (contrast with `assess-agent-autonomy`, which adds a skill).
