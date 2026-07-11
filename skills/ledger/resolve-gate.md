# Ledger Resolve Gate

The critical gate that prevents dropped work. Called by `/claude-tweaks:wrap-up` Step 8.5 and `/claude-tweaks:flow` Step 5.

The gate runs in three phases. The agent does Phase 1 silently; Phases 2 and 3 always require explicit per-item user input.

**`auto` mode does NOT silence this gate.** Per-item user input on the resolve gate is mandatory regardless of mode. For the full list of what `auto` silences (and what it does not), see `_shared/auto-mode-contract.md`.

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

After Phase 1, only items the agent could not fix remain `open`. Present the full table once, upfront — it is not re-rendered per item as the drill below proceeds:

```
### Unresolved Open Items

| # | Phase | Item | Why not fixed now |
|---|-------|------|-------------------|
| {N} | {phase} | {description} | {specific blocker — must be one of the legitimate-defer reasons} |
```

Immediately below the table, before starting the drill, tell the user once: *"No item here has a safe default, so each gets its own question below — but if several should get the same treatment, say so in your answer to the first one (e.g. via 'Other') and I'll apply it to the rest."* This is the only place the hint appears — it is not repeated per item, and it is plain text, not a presented button (see Guardrail below).

Both `**Stage:** parked` and `**Stage:** inbox` (both written as a `specs/backlog/{slug}.md` entry) are valid destinations — the user picks per item. Rough guidance to surface alongside each row if helpful (not a rule):

- **`**Stage:** parked`** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
- **`**Stage:** inbox`** when the item is a captured idea without a specific trigger yet — to be triaged later

For each item, run a two-step `AskUserQuestion` drill (the old 6-option flat list exceeds the tool's 4-option-per-question cap):

**Guardrail:** No step of this drill may gain a 4th/"apply to all" option, even though the option cap would allow it — bulk routing is user-initiated via `Other` only, never a presented default. See Anti-Patterns: "Bulk-resolving open items without per-item user input."

**Step 1 (always) — call `AskUserQuestion` with `question`: `"How do you want to handle item #{N}: {short description}?"`, `header`: `"Item #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Fix anyway"`, `description`: `"Address it now even though it expands scope"`
- Option 2 — `label`: `"Route to a doc"`, `description`: `"Defer (specs/backlog/, Stage: parked) or capture (specs/backlog/, Stage: inbox)"`
- Option 3 — `label`: `"Close out"`, `description`: `"Accept, acknowledge, or drop it"`

None of these three options carries `(Recommended)` — Phase 1 already fixed everything fixable; every remaining item is a genuine judgment call with no safe default.

**Step 2a (only if "Route to a doc" was chosen) — call `AskUserQuestion` with `question`: `"Where should item #{N} go?"`, `header`: `"Route item #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Defer"`, `description`: `"To specs/backlog/{slug}.md (Stage: parked) — has a trigger condition for when to revisit"`
- Option 2 — `label`: `"Send to Inbox"`, `description`: `"To specs/backlog/{slug}.md (Stage: inbox) — captured for later evaluation, no specific trigger yet"`

**Step 2b (only if "Close out" was chosen) — call `AskUserQuestion` with `question`: `"How should item #{N} be closed out?"`, `header`: `"Close item #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Accept"`, `description`: `"Intentional, with stated reason"`
- Option 2 — `label`: `"Acknowledge"`, `description`: `"Ops item requiring action outside the codebase"`
- Option 3 — `label`: `"Drop"`, `description`: `"No longer relevant"`

Neither Step 2a nor Step 2b carries a `(Recommended)` option either — same reasoning as Step 1.

**Wait for the user's reply at every step.** Do NOT pre-classify items, do NOT pick "obviously correct" resolutions, do NOT auto-route to "apply all" — every remaining item gets an explicit per-item response, at every step of the drill. The user may bulk-route by answering any step's `Other` free-text field with a bulk instruction (e.g., Step 1 `Other`: "apply Route to a doc + Defer to all remaining items"; Step 2b `Other`, after answering Step 1 individually per item: "Drop the rest") — apply it to all remaining like-classified items and skip individual calls for those. This is the direct replacement for the old `all: {choice}` free-text convention, generalized to both steps of the drill — but the request must come from them, never a presented button at any step, at any level of the drill.

---

## Phase 3 — Apply user decisions

For each item, apply the user-chosen disposition. **Each `specs/backlog/{slug}.md` entry (`Stage: parked` or `Stage: inbox`) requires the user's explicit choice for that specific item — never bulk-write without their per-item input.**

- `Fix anyway` → return to Phase 1 for that item, fix, commit, mark `fixed`
- `Defer` → create `specs/backlog/{slug}.md` with `**Stage:** parked`, origin (this pipeline), affected files, and the user-stated trigger. Update ledger status to `deferred`
- `Send to Inbox` → create `specs/backlog/{slug}.md` with `**Stage:** inbox`, origin (this pipeline), and short context. Update ledger status to `deferred` (with note `→ backlog (inbox)` in Resolution column)
- `Accept` → record the user's stated reason in Resolution column. Update status to `accepted`
- `Acknowledge` → record as `acknowledged` (ops items only)
- `Drop` → mark as `accepted` with reason "dropped per user — no longer relevant"
