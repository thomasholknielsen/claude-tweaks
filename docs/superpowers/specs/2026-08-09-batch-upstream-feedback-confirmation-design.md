# Batch Confirmation for Upstream Feedback Filing

Date: 2026-08-09
Status: design approved, plan pending

## Problem

Filing a learning upstream to `thomasholknielsen/claude-tweaks` via `/claude-tweaks:feedback`
requires an explicit human confirmation before every issue is created — correctly so, per
`_shared/auto-mode-contract.md`'s "what `auto` does NOT silence" table: publishing to a public repo
is outward-facing and effectively irreversible, the same category as work-record creation, and not
exempt even under `unattended-tier`. That principle is not in question here. Its current
*implementation* costs more clicks than the principle requires, in two places:

1. **`/claude-tweaks:feedback` invoked bare (Step 0, queue mode).** When headless health sweeps
   have filed several local `upstream-candidate` records for a human to forward, Step 0 batches the
   *selection* of which to process, but each selected item then runs Steps 1-8 individually — one
   `AskUserQuestion` "File this upstream?" per item. N candidates, N confirmations.

2. **`/claude-tweaks:wrap-up`'s Review Console, `Upstream feedback` (`U#`) rows.** This path
   double-asks. `review-console.md`'s per-item section prompts Apply/Skip/Edit for each `U#` row,
   and on Apply it invokes `/claude-tweaks:feedback` with the already-scrubbed body —
   `/feedback`'s own Component-Skill Contract states *"Being inside a pipeline never relaxes Steps 6
   and 7,"* so its own Step 7 confirm gate fires again. N items, 2N confirmations, same content,
   same session, back-to-back.

Both are the same underlying friction: reviewing a batch of already-scrubbed drafts should be one
decision, not N (or 2N).

## Decisions taken

| Question | Decision |
|---|---|
| Collapse N prompts into 1? | Yes — one `multiSelect` `AskUserQuestion` call per batch, all items pre-selected |
| Collapse the wrap-up path's double-ask? | Yes — the console's own batch call becomes the sole human confirmation for wrap-up-originated filings; `/feedback` accepts an explicit `--pre-confirmed` signal and skips its own Step 7 re-ask, but always reruns Step 6 (scrub) regardless |
| Scope | Upstream feedback (`U#`) only. Queue writes (`Q#`) and Memory updates (`M#`) are untouched — different risk profile (work-record ownership; cross-project memory blast radius), and not what was asked for |
| Edit affordance | Reuse the existing free-text override channel (the same convention as the top-level "Approve all / Override specific items" choice) — no new per-item tri-state control |
| Dedup matches | Folded into the rendered draft as an inline flag, resolved by the same include/exclude decision — not a separate per-item ask |
| Default selection state | All items pre-checked (opt-out), not opt-in — the common case is "file everything"; the visible draft text is what carries the review burden, not the checkbox state |

### Rejected alternative: keep separate calls, reduce N instead

Considered and rejected as the primary fix. Tightening dedup or reducing false-positive sweep
findings lowers how many candidates reach the gate at all, which is real and worth doing, but it is
orthogonal — it doesn't address the wrap-up path's double-ask, and it doesn't help a maintainer who
has a genuine backlog of five distinct, deduplicated candidates to review in one sitting. Not
pursued as part of this design; it remains a valid, separate improvement to the health sweeps'
filing discipline.

## Architecture

### New: a shared batch-confirmation contract

`skills/_shared/upstream-feedback-batch.md` — the single definition of "how to present N scrubbed
upstream-feedback drafts and collect one filing decision," cited by both call sites rather than
restated (CLAUDE.md's cross-reference rule: every relationship stated once). It specifies:

- Render every candidate's full scrubbed draft as literal markdown text, above the tool call — same
  visibility as today's single-item flow; only the interaction mechanic changes, not what the human
  sees before deciding.
- One `AskUserQuestion` call, `multiSelect: true`, one option per candidate (`label`: title,
  `description`: one-line summary plus any dedup flag). All options pre-selected.
- The question wording states explicitly that a checked item **will be filed**, not merely
  shortlisted — this distinction is load-bearing for the `--pre-confirmed` handoff below.
- An unchecked item is logged as declined (CLAUDE.md: "don't silently skip or drop findings" — every
  surfaced item gets an explicit disposition).
- Wanting to change content rather than a flat include/exclude goes through the same free-text
  override channel already used for the top-level "Approve all / Override specific items" decision
  — no new mechanism.

### Modified: `skills/feedback/SKILL.md`

- **Step 0** no longer filters-then-loops. It gathers every open `upstream-candidate` issue, runs
  Steps 1-6 (gather, classify, self-reference, dedup, draft, scrub) non-interactively for each, then
  calls the shared batch contract once instead of looping Steps 1-8 per selected item.
- **Step 7** is restructured to operate over 1..N items: a single free-text invocation still renders
  one item through the batch contract's single-item degenerate case (functionally unchanged from
  today); `--queue` mode renders N.
- **New flag `--pre-confirmed`** (boolean, presence-only, same shape as `--dry-run`). When present,
  skip Step 7's `AskUserQuestion` — the caller already ran an equivalent confirmation — but Step 6
  (scrub) always reruns unconditionally regardless, as a drift check against the staged file.
- **Component-Skill Contract section** gains an explicit, narrow carve-out: `--pre-confirmed` is
  legitimate **only** when passed by `/claude-tweaks:wrap-up`'s Review Console, immediately after its
  own batch confirmation included that specific item. It is not a general-purpose flag any caller may
  set, and the contract names the one authorized caller rather than describing a general condition —
  see "Guardrail" below.

### Modified: `skills/wrap-up/review-console.md`

- The `Upstream feedback` section's per-item Apply/Skip/Edit `AskUserQuestion` loop is replaced by
  one call to the shared batch contract.
- "On approval" step 9: for each item the batch call included, invoke `/claude-tweaks:feedback
  --pre-confirmed` with the staged, already-scrubbed body. Declined items are logged the same way
  they are today (stated reason, or "declined, no reason given").
- The "Hard requirements" section's blanket rule — *"Queue writes, Memory updates, and Upstream
  feedback are per-item only... never batch two items into one `AskUserQuestion` call"* — is narrowed
  to name only Queue writes and Memory updates. The rationale sentence explaining *why* (the
  `_shared/auto-mode-contract.md` not-silenced rule) is preserved and now points to the batch
  contract's own confirmation guarantee for Upstream feedback specifically.

### Modified: `skills/wrap-up/execution-and-verification.md`

Step 9's description of "invoke `/claude-tweaks:feedback`... that skill re-runs its own scrub and
confirm gates" is updated to state that the confirm gate is satisfied by the console's own batch
approval (`--pre-confirmed`) and only the scrub gate reruns.

### Modified: `docs/skill-graph.md`, `docs/plugin-structure.md`

- `skill-graph.md`'s `/feedback` ↔ `/wrap-up` edges get the `--pre-confirmed` handoff and the new
  `_shared` file added.
- `plugin-structure.md`'s wrap-up sub-file description currently reads "review-console.md (... the
  per-item `Q#`/`M#`/`U#` sections ...)" — this goes stale under the new design and is corrected to
  distinguish the per-item `Q#`/`M#` sections from the batch `U#` section (`[IL-93]`: don't widen or
  narrow an enforcement mechanism without sweeping the prose describing its old reach).

## Data flow

### Scenario A — `/claude-tweaks:feedback --queue` (direct invocation)

1. Step 0 lists every open `upstream-candidate` issue via `gh issue list`.
2. For each, run Steps 1-6 non-interactively: gather from the issue's own body, classify, confirm
   self-reference doesn't apply (already local), dedup search, draft, scrub.
3. Render every scrubbed draft as text.
4. Shared batch contract: one `multiSelect` call, all pre-checked.
5. For each checked item: Step 8 files it, then closes the local `upstream-candidate` issue with a
   comment linking the new upstream issue (unchanged from today's per-item behavior).
6. For each unchecked item: log declined; the local `upstream-candidate` issue stays open for a
   future run.
7. Report: N filed (with issue URLs), M declined.

### Scenario B — `/claude-tweaks:wrap-up` Review Console, `U#` rows

1. The Upstream feedback curation row stages one proposal per D5 learning (unchanged) — scrub already
   ran at staging time.
2. The console renders the `U#` table plus each staged draft's full text (mostly unchanged
   rendering).
3. Instead of per-item Apply/Skip/Edit, one `multiSelect` call across all `U#` items, default
   all-checked (shared batch contract).
4. On approval: for each checked item, invoke `/claude-tweaks:feedback --pre-confirmed` with the
   staged body. `/feedback` reruns Step 6 scrub (drift check), skips Step 7, files via Step 8, and
   returns the issue URL.
5. Unchecked items: logged declined with the stated reason, or "declined, no reason given" —
   consistent with today's per-item skip logging.

## Edge cases

- **`gh` failure mid-batch.** Existing Step 8 failure handling applies per item — report verbatim,
  stage to `staged/upstream-unfiled-{N}.md` — and does not block or roll back sibling items in the
  same batch.
- **Dedup match found for one candidate.** Folded into that item's rendered draft as an inline flag
  (e.g. "possible duplicate: #123"); checking the item means "file anyway, having seen the flag."
  Wanting to comment on the existing issue instead of filing a new one goes through the free-text
  override channel.
- **`--dry-run` in batch mode.** Extends the existing single-item behavior: render every draft, state
  each one's classified destination and kind, and stop before the batch `AskUserQuestion` call is
  ever issued — no filing, no confirmation prompt.

## Guardrail: `--pre-confirmed` is a named contract, not a general bypass

CLAUDE.md's `[IL-114]` states the exact hazard this flag could become: *"an approval never implies a
differently-scoped write is authorized... state a dedicated per-decision approval."* This design
leans on that rule rather than working around it:

- The batch question's wording makes "checked" unambiguously mean "authorize filing now," not
  "shortlist for a later confirmation" — so the console's own multiSelect call **is** the dedicated
  per-decision approval `[IL-114]` asks for, not an inferred one.
- `/feedback`'s Component-Skill Contract names the Review Console as the only legitimate source of
  `--pre-confirmed`, by name — not a general condition any pipeline orchestrator could satisfy.
- Step 6 (scrub) is never skippable, regardless of `--pre-confirmed` — this is the drift check against
  content that may have changed between staging time and filing time.

## Out of scope

- **Queue writes (`Q#`) and Memory updates (`M#`)** in `review-console.md` — untouched, remain
  strictly per-item with separate `AskUserQuestion` calls. Different risk profile (work-record queue
  ownership; cross-project, always-loaded memory blast radius) and not what this design was asked to
  address.
- **Reducing N via better dedup or tighter sweep false-positive rates** — complementary, separate
  work; not pursued here.
- **`_shared/auto-mode-contract.md`'s "not silenced" table itself** — the underlying policy (explicit
  human confirmation is required, and `auto` never silences it) is unchanged. Only the *mechanism* of
  that confirmation changes: one call instead of N, and a named, narrow carve-out for the redundant
  second ask in the wrap-up path.

## Testing

These are prose skill files, not executable code, so verification is scenario-based rather than
unit-tested:

- `tests/multi-agent-coordination.test.js` asserts `review-console.md` contains the
  `Low-confidence findings` and `Contested findings` subsection headers — unrelated subsystem, no
  change required, confirmed by reading the assertions directly.
- No other test suite currently pins the "never batch" wording or the per-item `U#` structure
  (checked directly — `grep -rl "review-console\|upstream feedback\|never batch\|per-item" tests/`
  returns only the file above).
- Verification at implementation time is a hand-traced walkthrough of both scenarios above against
  the literal rewritten skill text (per `[IL-24]`: don't assert how existing prose behaves without
  reading it).

## Files touched

**New**

```
skills/_shared/upstream-feedback-batch.md
```

**Modified**

| File | Change |
|---|---|
| `skills/feedback/SKILL.md` | Step 0 (gather-all-then-batch), Step 7 (1..N via shared contract), new `--pre-confirmed` flag + `argument-hint`, Component-Skill Contract carve-out |
| `skills/wrap-up/review-console.md` | Upstream feedback section rewritten to the shared batch contract; "On approval" step 9 passes `--pre-confirmed`; Hard requirements' per-item rule narrowed to `Q#`/`M#` |
| `skills/wrap-up/execution-and-verification.md` | Step 9 description updated for the `--pre-confirmed` handoff |
| `docs/skill-graph.md` | `/feedback` ↔ `/wrap-up` edges, new `_shared` file registered |
| `docs/plugin-structure.md` | Wrap-up sub-file description corrected — no longer describes `U#` as per-item alongside `Q#`/`M#` |

## Risks

| Risk | Mitigation |
|---|---|
| `--pre-confirmed` drifts into a de facto generic bypass over time | Named to one caller in `/feedback`'s own contract text; a future second caller passing it is a scope violation to flag in review, not a precedent to extend |
| `multiSelect`'s lack of a rich preview panel makes per-item context thin at decision time | Full scrubbed draft is always rendered as literal text immediately above the call — same visibility as today, only the interaction count changes |
| Narrowing `review-console.md`'s blanket per-item rule accidentally loosens it for `Q#`/`M#` too | The rule is edited to explicitly name `Q#`/`M#`, not deleted and rewritten from scratch — the edit is a scope narrowing of an existing sentence, not a new one |
