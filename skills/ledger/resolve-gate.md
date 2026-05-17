# Ledger Resolve Gate

The critical gate that prevents dropped work. Called by `/claude-tweaks:wrap-up` Step 8.5 and `/claude-tweaks:flow` Step 5.

The gate runs in three phases. The agent does Phase 1 silently; Phases 2 and 3 always require explicit per-item user input.

**`auto` mode does NOT silence this gate.** Pipeline `auto` flags only suppress the merge-check (flow Step 2.5) and scope-check (flow Step 2.6) prompts. Per-item user input on the resolve gate is mandatory regardless of mode.

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

After Phase 1, only items the agent could not fix remain `open`. Present them:

```
### Unresolved Open Items

| # | Phase | Item | Why not fixed now |
|---|-------|------|-------------------|
| {N} | {phase} | {description} | {specific blocker — must be one of the legitimate-defer reasons} |

For each item, reply with `{#}: {choice}` (or `all: {choice}` if uniform):
1. Fix anyway — address it now even though it expands scope
2. Defer to `specs/DEFERRED.md` — has a trigger condition for when to revisit
3. Send to `specs/INBOX.md` — captured for later evaluation, no specific trigger yet
4. Accept — intentional, with stated reason
5. Acknowledge — ops items requiring action outside the codebase
6. Drop — no longer relevant
```

Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid destinations — the user picks per item. Rough guidance to surface alongside each row if helpful (not a rule):

- **DEFERRED.md** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
- **INBOX.md** when the item is a captured idea without a specific trigger yet — to be triaged later

**Wait for the user's reply.** Do NOT pre-classify items, do NOT pick "obviously correct" resolutions, do NOT auto-route to "apply all" — every remaining item gets an explicit per-item user response. The user may reply `all: 2` (or `all: 3`) to bulk-route, but the request must come from them, not be the default offered.

---

## Phase 3 — Apply user decisions

For each item, apply the user-chosen disposition. **Each write to `DEFERRED.md` or `INBOX.md` requires the user's explicit choice for that specific item — never bulk-write without their per-item input.**

- `Fix anyway` → return to Phase 1 for that item, fix, commit, mark `fixed`
- `Defer to DEFERRED.md` → append entry with origin (this pipeline), affected files, and the user-stated trigger. Update ledger status to `deferred`
- `Send to INBOX.md` → append entry with origin (this pipeline) and short context. Update ledger status to `deferred` (with note `→ INBOX.md` in Resolution column)
- `Accept` → record the user's stated reason in Resolution column. Update status to `accepted`
- `Acknowledge` → record as `acknowledged` (ops items only)
- `Drop` → mark as `accepted` with reason "dropped per user — no longer relevant"
