# Ledger Resolve Gate

The critical gate that prevents dropped work. Called by `/claude-tweaks:wrap-up`'s Phase 3 ledger gate and `/claude-tweaks:flow` Step 5.

The gate runs in three phases. The agent does Phase 1 silently; Phases 2 and 3 always require explicit per-item user input.

**`auto` mode does NOT silence this gate.** Per-item user input on the resolve gate is mandatory regardless of mode. For the full list of what `auto` silences (and what it does not), see `_shared/auto-mode-contract.md`. The one narrow exception is the autonomy ceiling's `ledgerNarrowing` bookkeeping capability (locked at `supervised`, unlocked from `trusted` up) — see `_shared/autonomy-ceiling.md` and the narrowing step at the top of Phase 2 below.

**The pipeline cannot complete with unresolved items.** This is a hard gate.

---

## Phase 1 — Exhaust fixes (agent, silent)

For each item with status `open`, attempt to fix it now. **The default is fix; defer is the exception.** An item qualifies for fix-now if **all** of these hold:

- Change is localized — typically ≤5 files, no spans across unrelated systems
- Fix does not require functionality not yet built in this pipeline
- Fix does not require user product/design decisions
- Fix does not require external state (third-party data, prod traffic, approvals)
- Fix does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

If the item qualifies, fix it, commit it, update status to `fixed` with the commit hash. Do this BEFORE presenting anything to the user.

**Bad reasons to skip a fix** (do NOT use these to keep an item open):

- *"Out of scope of this plan / spec"* — if the file is in this build's diff, it is in scope
- *"Following plan verbatim"* — when plan code conflicts with `.claude/rules/` or CLAUDE.md don'ts, fix the violation; the plan was written before review-time context
- *"A future plan (P2/P3/...) might want X"* — speculative; only defer for *known* downstream needs
- *"Bundle of small items"* — items get classified individually, never as a group
- *"Premature without consumer signal"* — clear bugs and convention violations get fixed now
- *"Plan-prescribed routing"* — if the plan said "X moves to P6," that's plan documentation, not a ledger event; remove the item entirely instead of deferring

---

## Phase 2 — Present remainder (per-item user input required)

### Ledger narrowing (runs first, before the table below)

Resolve the `ceiling` per `_shared/autonomy-ceiling.md`'s existing precedence ladder. If
`bookkeepingPermissions(ceiling).ledgerNarrowing === true` (`bin/lib/issues/autonomy.js`), before
building the table below, check each remaining `open` item's Phase 1 blocker reason against
`bin/lib/issues/autonomy.js`'s `clearsFloor(blockerReason)`. For every item where it
returns `true`: auto-select `Route to a record → Keep (backlog)` — the only disposition this
capability ever authorizes from this drill; never `Fix anyway`, `Accept`, `Drop`, or `Defer →
parked` — compose the staged-proposal body exactly as Phase 3's `Keep` branch below already does,
update ledger status to `deferred` (note `→ backlog`), and log:

```
AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog (blocker: {category}). Reversibility: high.
```

**Standalone run (no pipeline run directory resolves — see `_shared/pipeline-run-dir.md`):**
there is no `staged/` directory or `decisions.md` to write to, and no Review Console to later
reconcile a staged file into a real record. Note what the reason is **not**: the console is no
longer mode-gated — it runs in every mode, including interactive and standalone wrap-up. It is
absent here because this is `/claude-tweaks:ledger resolve` invoked outside any `/flow` or
`/wrap-up` run at all, so no wrap-up ever executes to render one. Apply Phase 3's standalone
"create directly instead of staging" behavior inline here instead — create the record now via
the same dual-driver contract Phase 3 uses (`gh issue create` / `local-store.js`'s `writeRecord`),
and surface the auto-routing decision in this run's summary output in place of the `decisions.md`
entry above, since no run-dir log exists to write it to.

Remove the item from this phase's remaining set — it does not appear in the table below and does
not get an `AskUserQuestion` drill. Items whose blocker reason returns `false` (ambiguous, or
outside the four categories) fall through to the unchanged per-item drill below — the floor check
fails closed, exactly as if the capability were locked for that one item.

After Phase 1 (and, when the capability is unlocked, after the narrowing above), only items that qualify for
neither — Phase 1's fix-now criteria nor the narrowing's floor check — remain `open`. Present the
full table once, upfront — it is not re-rendered per item as the drill below proceeds:

```
### Unresolved Open Items

| # | Phase | Item | Why not fixed now |
|---|-------|------|-------------------|
| {N} | {phase} | {description} | {specific blocker — must be one of the legitimate-defer reasons} |
```

Immediately below the table, before starting the drill, tell the user once: *"No item here has a safe default, so each gets its own question below — but if several should get the same treatment, say so in your answer to the first one (e.g. via 'Other') and I'll apply it to the rest."* This is the only place the hint appears — it is not repeated per item, and it is plain text, not a presented button (see Guardrail below).

Both `parked` and `backlog` are valid stage destinations for a new work record (see `_shared/work-record.md` for the full stage vocabulary) — the user picks per item. Rough guidance to surface alongside each row if helpful (not a rule):

- **`parked`** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
- **`backlog`** (no stage label) when the item is a captured idea without a specific trigger yet — to be triaged later

For each item, run a two-step drill, chunked per `_shared/batched-item-drill.md`'s contract (the old one-`AskUserQuestion`-per-item shape exceeded a reasonable call count for any batch bigger than a handful of items):

**Guardrail:** No chunk of this drill may gain a shared "apply to all" option answered once for the whole chunk — the checkbox state (Step 2a) or each item's own distinct question (Step 1, Step 2b) *is* the per-item choice. Bulk routing is user-initiated via `Other` only, never a presented default. See Anti-Patterns: "Bulk-resolving open items without per-item user input."

**Step 1 (always).** Step 1 is a genuine three-way choice (Fix anyway / Route to a record / Close out) — a checkbox can't represent "which of three sets," so this step uses **bundled single-select chunking**: up to 4 remaining items' separate single-select questions in one `AskUserQuestion` call (chunked per the shared contract), each item keeping its own distinct question and its own three options:

- `question`: `"How do you want to handle item #{N}: {short description}?"`, `header`: `"Item #{N}"`
- Option 1 — `label`: `"Fix anyway"`, `description`: `"Address it now even though it expands scope"`
- Option 2 — `label`: `"Route to a record"`, `description`: `"Defer (new record, parked) or keep (new record, backlog) — staged for per-item approval before the record is created"`
- Option 3 — `label`: `"Close out"`, `description`: `"Accept, acknowledge, or drop it"`

None of these three options carries `(Recommended)` — Phase 1 already fixed everything fixable; every remaining item is a genuine judgment call with no safe default. Restate the free-text override hint (shared contract) in this chunk's first question.

**Step 2a (only for items that chose "Route to a record" in Step 1) — genuinely binary, so this step uses multiSelect chunking**: one `multiSelect: true` `AskUserQuestion` call per chunk of ≤4 items in the "Route to a record" subset, one checkbox per item — checked = `Keep` (new record, backlog), unchecked = `Defer` (new record, parked). No item is pre-checked — every remaining item is inherently ambiguous (that's why it wasn't auto-routed by the narrowing step above), so there is no sensible default to pre-check toward.

- `question`: `"Where should these items go? (checked = Keep/backlog, unchecked = Defer/parked)"`, `header`: `"Route items"`

**Step 2b (only for items that chose "Close out" in Step 1) — three-way (Accept / Acknowledge / Drop), so this step keeps bundled single-select chunking**, same shape as Step 1: up to 4 items' separate single-select questions per `AskUserQuestion` call, chunked over the "Close out" subset:

- `question`: `"How should item #{N} be closed out?"`, `header`: `"Close item #{N}"`
- Option 1 — `label`: `"Accept"`, `description`: `"Intentional, with stated reason"`
- Option 2 — `label`: `"Acknowledge"`, `description`: `"Ops item requiring action outside the codebase — filed as a trackable backlog record"`
- Option 3 — `label`: `"Drop"`, `description`: `"No longer relevant"`

None of Step 1/2a/2b's options carries `(Recommended)` — every remaining item is a genuine judgment call with no safe default (Step 2a's binary encoding is a checkbox with no pre-check, not a recommendation).

**Step 1 must fully resolve (across however many chunked calls it took) before Step 2a/2b begin** — which items go to 2a vs. 2b isn't known until Step 1's responses return.

**Wait for the user's reply at every chunk.** Do NOT pre-classify items, do NOT pick "obviously correct" resolutions, do NOT auto-route to "apply all" — every remaining item gets an explicit per-item response (a checkbox state or its own distinct question), across however many chunks the drill takes. The user may bulk-route by answering any chunk's `Other` free-text field with a bulk instruction (e.g., Step 1 `Other`: "apply Route to a record + Defer to all remaining items"; Step 2b `Other`: "Drop the rest") — apply it to all remaining like-classified items and skip individual encoding for those. This is the direct replacement for the old `all: {choice}` free-text convention — but the request must come from them, never a presented button at any step, at any level of the drill.

---

## Phase 3 — Apply user decisions

For each item, apply the user-chosen disposition. **Each new work record (`parked` or `backlog`) requires the user's explicit choice for that specific item — never bulk-write without their per-item input.** Creating the record itself is a second, separate approval from the per-item disposition choice (`_shared/auto-mode-card.md`'s work-record-creation row) — `Defer`, `Keep`, and `Acknowledge` therefore **stage a record proposal**, never create the record directly, mirroring `wrap-up/leftover-routing.md`'s Auto mode behavior:

- `Fix anyway` → return to Phase 1 for that item, fix, commit, mark `fixed`
- `Defer` → stage a record proposal at `{run-dir}/staged/ledger-record-{slug}.md` (`Title:`/`Type:`/`Labels:` header + body, same shape as `leftover-{slug}.md` — see `wrap-up/leftover-routing.md` step 3): `parked`, a `Trigger:` line from the user-stated trigger, an `Origin: ledger resolve gate` line, and affected files. Update ledger status to `deferred`. Resolves on per-item approval at the Wrap-Up (or Flow) Review Console's Queue writes section, which runs in every mode. The console creates the record (`gh issue create` under `work-backend: github-issues`, or `local-store.js`'s `writeRecord` under `work-backend: local-files`)
- `Keep` → same staging shape, backlog (no `Trigger:` line, no stage label), `Origin: ledger resolve gate` line, and short context. Update ledger status to `deferred` (with note `→ backlog` in Resolution column). Same two-surface resolution as `Defer` above
- **No pipeline run directory resolves** (truly standalone `/claude-tweaks:ledger resolve`, outside any `/flow` or `/wrap-up` run — see `_shared/pipeline-run-dir.md`): no Review Console will ever read a staged file, so create the record directly instead, using the same dual-driver contract the console would have used. When `bookkeepingPermissions(ceiling).ledgerNarrowing === true`, apply Phase 2's narrowing check inline here too (no wrap-up runs on this path, so there is no Review Console to centralize the auto-file decision through).
- `Accept` → record the user's stated reason in Resolution column. Update status to `accepted`
- `Acknowledge` (ops items only) → **stages a record proposal**, same shape as `Keep` above (backlog, no `Trigger:` line), but `Origin: ledger resolve gate (acknowledged)` and `Type: task` — an ops item is action still outstanding, just not something the agent can perform, so unlike `Accept`/`Drop` it must not disappear once the ledger file is deleted at cleanup. Update ledger status to `acknowledged` (unchanged from before — this only adds the staged proposal, it doesn't rename the status). Same two-surface resolution as `Defer`/`Keep`.
- `Drop` → mark as `accepted` with reason "dropped per user — no longer relevant"
