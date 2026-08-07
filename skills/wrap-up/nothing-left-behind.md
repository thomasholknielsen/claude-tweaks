# Step 8.5 — Nothing Left Behind (wrap-up's wrapper around the resolve gate)

Loaded by `/claude-tweaks:wrap-up` Step 8.5 under the same condition that gates `ledger/resolve-gate.md`: the ledger exists and holds at least one item, of any status. Holds the requirements the resolve gate runs under here, the terminal-status bulk-resolve fast path, and the ops-acknowledgment sub-step.

The gate is item-*existence*, not open-item-existence: the bulk-resolve fast path below still stages proposals for `acknowledged` items via that file's Phase 3 `Acknowledge` disposition, and the Ops acknowledgment sub-step below applies the same disposition — both operate on items that are already terminal. Gating on `open` items alone would skip the read while those two paths still need it.

**Hard requirements:**

- Phase 1 must run before any user-facing output. The agent fixes everything that qualifies for fix-now, commits, then presents only the genuine residue.
- Phase 2 always requires explicit per-item user input for `fix` / `defer` / `accept` decisions. Status `acknowledged` (e.g., ops items the user has read — each one stages a work record proposal, resolved by the run's own Queue writes surface under its mandatory per-item approval — see the sub-step below for which surface that is) may be bulk-*staged* via a single explicit "I've read every item" choice, since the actual record creation still gets its own per-item gate downstream. Never bulk-resolve `fix` / `defer` / `accept`. Never assume "obvious" defers. Never offer a "Fix all (Recommended)" or "Defer all" shortcut — those bias the user toward whichever bulk action is easier to type.
- `auto` mode does NOT silence this gate.
- Both `parked` and `backlog` are valid stage destinations for a new work record, but every individual item requires an explicit per-item user choice — no record is ever staged autonomously.

### Bulk-resolve fast path (terminal-status only)

The fast path applies **only when every ledger item already has terminal status** (`fixed`, `deferred`, `accepted`, `acknowledged`, `observation`) at gate entry. If a single item has status `open`, the fast path does NOT apply — Phase 1 → Phase 2 → Phase 3 must run in full sequence without exception. Before reporting completion, check every `acknowledged` item for a staged proposal (a producer can create an item pre-set to `acknowledged`, bypassing Phase 3 entirely — e.g. `build/worktree-setup.md`'s auto-mode divergence entry): stage one now, per `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition, for any that lack one. Then report: "All {N} ledger items resolved. No open items." and proceed to Step 9.

Phase 2 is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md` — it is never skipped, regardless of `auto` state, when any `open` item exists.

### Ops acknowledgment (when ops items exist)

Ops items represent infrastructure changes the user needs to action post-merge — bulk-acknowledging them risks the user not reading them. Present each item, and require explicit confirmation rather than a shortcut that defaults to bulk action:

```
The following ops items need acknowledgment. These represent infrastructure changes you need to action post-merge — read each one before choosing:

| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
```

**Unattended-tier auto-acknowledge:** if `unattended-tier: on` (see `_shared/unattended-tier.md`),
skip the `AskUserQuestion` below entirely — for every item, stage a record proposal and update
status to `acknowledged` per `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition, log
`AUTO {time} — Ops acknowledgment: {N} items auto-acknowledged, staged for filing. Reversibility: high.` to
`decisions.md`, and continue to Step 8.6. Otherwise, present the block below.

Call `AskUserQuestion` with `question`: `"How do you want to handle these ops items?"`, `header`: `"Ops items"`, `multiSelect`: `false` — neither option's label is marked as the default:

- Option 1 — `label`: `"Acknowledge all"`, `description`: `"I've read every item"`
- Option 2 — `label`: `"Show details"`, `description`: `"I have questions about specific items"`

After option 1, apply `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition to every item — stage a record proposal per item and update status to `acknowledged`. The actual record creation is a separate, mandatory per-item approval at whichever Queue writes surface this run reaches — Step 8.6's Review Console in `auto`/`hybrid` mode, or `summary-template.md`'s Queue writes section in interactive mode, where that console never runs (bulk-acknowledging here only stages the proposal; it does not silently create N records). After option 2, surface each item with full detail and apply the same per-item `Acknowledge` disposition on confirmation.
