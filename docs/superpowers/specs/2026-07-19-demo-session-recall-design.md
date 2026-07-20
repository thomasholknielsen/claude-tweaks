# /demo Session-Recall Fallback — Design

**Goal:** Close the gap where ad hoc, conversation-based work — no backing GitHub issue or
local record — never becomes visible to `/claude-tweaks:demo`, even though this is a primary
way the user actually develops, not an edge case. `/demo` currently only discovers
`demo:pending`-labeled records, and `/claude-tweaks:wrap-up`'s Verification Brief procedure is
explicitly "record mode only" — so a session that builds and manually verifies something real,
entirely in conversation, leaves `/demo` with nothing to show, even run immediately afterward in
the very same session.

**Architecture:** `/demo`'s Step 1 becomes dual-source: the existing `demo:pending` label query
(unchanged) plus a new session-recall scan that looks, within the current conversation only, for
units of implemented/verified work with no `#N` record reference. Both sources feed one worklist
into Step 2/3, every run — not a fallback chain. Recall entries render through the same
Verification Brief heading shape but are composed directly from conversation memory, not from
`verification-brief.md`'s diff/testability-classification machinery, and carry no backing label:
Approve/Skip on a recall entry writes nothing anywhere; Request changes still files a real
follow-up record via the same `recordPayload` composition `/demo` already uses. This is entirely
a skill-prose change — `/demo` has no backing code.

## Motivation

Concrete trigger: the user did live browser verification of a real feature (a patient-dashboard
labs redesign) directly in conversation — no `/capture`, no `/specify`, no `/flow`, no `#N`
record of any kind. Immediately after, they ran `/claude-tweaks:demo` expecting to see that work
ready for sign-off. `/demo`'s Step 1 only queries `demo:pending`-labeled records, found none
(correctly, by its current design), and reported "Nothing awaiting sign-off."

The root cause has two layers:

1. No work record existed to attach `demo:pending` + a Verification Brief to.
2. `/wrap-up`'s Verification Brief procedure is explicitly record-mode-only (per
   `verification-brief.md`'s own header) — so even running `/wrap-up` first would not have
   helped, since there was nothing for Step 10 to label.

An earlier direction in this design had `/wrap-up` (or `/demo`) retroactively file-then-close a
GitHub issue/local record purely to hang a label on it. Rejected: record-less, ad hoc work is a
*primary* way this user develops. Forcing every such session through the full seven-axis work-record
taxonomy (Type, Origin, Scoring, ...) just to get a sign-off recap is disproportionate ceremony for
what's often a two-line tweak. The actual data source that matters is session self-recall — the
agent running `/demo` already has full conversational memory of what was just done; there's no
need to reconstruct it via git-log parsing, diffing, or a synthetic record.

## Non-Goals

- **Not a way to retroactively discover other sessions' orphaned work.** Session-recall only
  works within the same conversation that did the work. A fresh `/demo` invocation in a new
  session has no memory to draw on and still falls through to "Nothing awaiting sign-off" for
  anything record-less — this is `/demo`'s normal "sweep every parallel thread" use case,
  unaffected.
- **Not persisting recall-sourced Approve/Skip verdicts anywhere.** No log file, no audit trail
  beyond the conversation itself. Considered and explicitly rejected a lightweight local
  append-only log, to keep the ad hoc path genuinely lightweight.
- **Not touching `/help`'s `demo:pending` dashboard count** — stays label-only. Reconciling it
  with recall-detectable work is separate scope; `/help` doesn't reliably share a given
  conversation's memory the way `/demo` does when run in-session.
- **Not promoting `verification-brief.md` into `_shared/` or having `/demo` invoke it.** The
  recall path reuses only its rendered template headings, not its git-diff/testability-
  classification/visual-review-gate procedure — that machinery assumes a materialized pipeline
  record and run dir, neither of which exists here.
- **Not changing the existing label-backed path at all.** Step 1's `demo:pending` query, Step 2's
  batch table, Step 4's label-swap mechanics, and the "Request changes" follow-up-filing behavior
  are unchanged.
- **Not mechanically classifying testability for recall entries** (e.g. via
  `verification-brief.md`'s changed-file-pattern check). The agent directly narrates what was
  actually done and verified — no diff-size or story/journey-match threshold gates whether a
  brief can be produced, which is exactly why this also works for minor tweaks, not just
  full features.

## Architecture

### 1. Step 1 becomes dual-source discovery

- **Source A (unchanged):** the existing `demo:pending` label query — `gh issue list --state all
  --label demo:pending ...` / `queryRecords(dir, { acceptance: 'pending' })`, exactly as
  documented today.
- **Source B (new): session-recall scan.** Always evaluated alongside Source A — not only when
  Source A is empty, so both can contribute in the same run. Scoped per unit of work: the agent
  cross-references any `#N` already mentioned in this conversation (including anything Source A
  just returned) against what it recalls doing; only conversation activity with no correlating
  `#N` becomes a Source B candidate. A session that touched one record-backed piece of work and
  did one unrelated ad hoc tweak yields one Source A entry and one Source B entry for the tweak
  only — never two entries for the same work.
- **Stop condition (unchanged in shape, now gated on both sources):** report "Nothing awaiting
  sign-off." only when *both* sources are empty.
- **Batch-table simplification:** when the merged worklist has exactly one item and it is
  recall-only, skip straight to Step 3's per-item walkthrough — rendering a batch table for a
  single row is unnecessary ceremony.

### 2. Recall-entry brief composition

Render into the same headings as the existing Verification Brief template (`### The ask` /
`### What shipped` / `### Confirmed` / `### See it yourself`), so Step 3 displays label-backed and
recall entries identically — but sourced directly from conversation memory, not
`verification-brief.md`'s machinery:

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, *including what wasn't checked* — matching the honesty
  already present in how this user narrates verification, not a checklist pretending
  completeness.
- **See it yourself** — an entry point, only if one was actually exercised/known; omitted
  otherwise, same as today's non-testable case.

No screenshot-commit step — there is no record to attach evidence to, and no commit boundary to
pin a raw URL against.

### 3. Verdict handling forks per entry kind

- **Label-backed entries (Source A):** unchanged — Approve/Request changes/Skip behave exactly as
  documented today.
- **Recall entries (Source B):**
  - **Approve** → nothing written anywhere. The verdict lives in the conversation.
  - **Skip for now** → nothing written anywhere. Since nothing persists, a later `/demo` session
    (with no memory of this conversation) will not re-surface this — a deliberate, disclosed
    tradeoff of the "nothing persists" decision, not a bug.
  - **Request changes** → files a real follow-up record, reusing the exact existing mechanism
    `/demo` already has for record-backed items (`recordPayload` composition, no `/capture`
    invocation, backlog stage, `Origin:` body line, linked back). This is the one branch where
    durable tracking earns its keep — it's new work that would otherwise be forgotten.

## Relationship to Existing Mechanisms (delta)

- **vs. `/claude-tweaks:wrap-up`** — still the sole producer of label-backed `demo:pending`
  records; unchanged. `/demo`'s session-recall path is entirely independent of `/wrap-up` ever
  running — new: previously `/demo` had zero capability outside what `/wrap-up` produced.
- **vs. `verification-brief.md`** — unchanged; not invoked by the recall path, only its rendered
  heading shape is mirrored for a consistent display.
- **vs. `work-record.md`'s seven-axis taxonomy** — recall entries deliberately sit entirely
  outside this taxonomy: no Type, Origin, Scoring, Stage, Authorization, Bot state, or Acceptance
  label ever applies to them, unless a "Request changes" verdict spins off a real follow-up
  record, which then is a normal backlog record like any other.

## Testing

`/demo` has no backing code (`bin/` has no `demo.js`) — this is entirely skill-prose, so
verification is procedural, not a unit suite:

- `npm test` stays green throughout (no expected changes to any existing suite).
- Manual walkthrough: do ad hoc, record-less feature work + live verification in a session, then
  run `/demo` in that same session. Confirm a recall entry appears with an honest Confirmed
  section (including a "not verified" note for something genuinely not checked), confirm Approve
  leaves `git status`/`gh issue list` unchanged, confirm Request changes correctly files a linked
  follow-up record.
- Manual dedup check: in one session, touch one real `demo:pending`-eligible record *and* do an
  unrelated ad hoc tweak. Confirm the record-backed item surfaces once via Source A and the tweak
  surfaces once via Source B — never duplicated.
- Manual negative check: run `/demo` in a *fresh* session (no conversation memory of prior ad hoc
  work) with nothing `demo:pending`. Confirm it still reports "Nothing awaiting sign-off." —
  session-recall must not fabricate entries it has no memory backing.

## Known Touch Points

- `skills/demo/SKILL.md` — Step 1 rewritten (dual-source discovery); Step 3 gains the
  recall-entry branch (composition + verdict handling); Anti-Patterns table gains a row:
  "Writing `demo:approved`/`demo:pending` for a recall entry — there's no record to hold it; the
  verdict lives in the conversation, not a label"; Relationship table's `/claude-tweaks:wrap-up`
  row gains the independence caveat; "When to Use" section gains a line about ad hoc/record-less
  sessions.
- `CLAUDE.md` — the one-line `demo` skill summary in the skill-directories table refreshed to
  mention session-recall.
- `.claude-plugin/plugin.json` — version bump (minor, per CLAUDE.md's versioning rules) — check
  `origin/main` for a concurrent bump first, per the Releasing section's discipline. Called out
  explicitly here so it isn't dropped, per this project's own recorded lesson about version bumps
  silently going missing from feature-scoped plans.
- **No changes** to `skills/wrap-up/verification-brief.md`, `skills/wrap-up/SKILL.md`,
  `skills/_shared/work-record.md`, `skills/help/*`, `bin/lib/issues/*`, or any label taxonomy —
  the label-backed path and the record model are untouched.

## Prior Design

Builds on `2026-07-16-demo-skill-design.md` (original Acceptance axis + `/demo` skill, v6.3.0)
and `2026-07-17-demo-verification-brief-redesign-design.md` (digest-shaped brief, safety-net
gate, vision/fit framing). This document is additive: a new discovery source and a new entry
kind, not a replacement of either prior document's architecture.
