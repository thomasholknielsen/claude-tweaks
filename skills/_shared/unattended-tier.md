# Unattended Tier

Single source of truth for the `unattended-tier` policy lever (`off` default | `on`). Referenced,
not restated, by every consumer: `flow/manifesto.md` (Manifesto lever #9), `flow/SKILL.md` Step 3,
`ledger/resolve-gate.md` Phase 2 + Phase 3, `wrap-up/review-console.md` Step 8.6,
`wrap-up/SKILL.md` Step 8.5, `wrap-up/leftover-routing.md`.

## What it authorizes

Exactly three behaviors, all opt-in, all logged, all reversible:

1. **Ledger Phase 2 narrowing** (`ledger/resolve-gate.md`) — skip the per-item drill for an item
   whose Phase 1 blocker reason clears the floor (below), auto-selecting `Route to a record ->
   Keep (backlog)` only. Never `Fix anyway`, `Accept`, `Drop`, or `Defer -> parked` from this
   drill specifically.
2. **Queue-write auto-file** (`wrap-up/review-console.md`) — create a proposed record (from the
   above, from leftover routing, or from `/reflect`'s tangential-idea routing) directly, instead
   of waiting for a live per-item approval at the Review Console.
3. **Ops-item auto-acknowledge** (`wrap-up/SKILL.md` Step 8.5) — auto-select "Acknowledge all"
   for the ops-acknowledgment block.

It never touches `Fix anyway`/`Accept`/`Drop` dispositions, HARD-GATEs, `BLOCKED`/`STOP`
conditions, or merge-conflict resolution — those stay fully human-gated regardless of this
lever's state.

## Precedence

Same resolution order as every other lever in `_shared/auto-mode-contract.md`:

1. Explicit CLI arg
2. `config.yml` (this run's Manifesto answer)
3. CLAUDE.md / `.claude-tweaks/policy.yml` project default
4. Skill default: `off`

## Floor rule

An item is eligible for auto-routing only when its blocker reason matches one of the four
categories `ledger/resolve-gate.md`'s Phase 1 already requires as legitimate:

| Category | Example blocker-reason text |
|---|---|
| External state | "Requires external state (third-party API data)" |
| User product/design decision | "Needs a product decision on the rate-limit value" |
| Not-yet-built dependency | "Depends on functionality not yet built in this pipeline" |
| Scope expansion | "Would expand scope — breaks 14 unrelated tests" |

Implemented by `bin/lib/issues/unattended-tier.js`'s `clearsFloor(blockerReason)`. Anything else —
including an ambiguous or unrecognized reason — fails closed: ask, exactly as if the lever were
off for that one item.

## Restricted-disposition rule

The lever only ever authorizes routing to a new **backlog** record (no `parked` stage, no
trigger to invent) from the ledger drill. Leftover routing is different: it follows whatever
disposition (`backlog` or `parked`) its own existing `leftover-default` auto-mode policy already
decided — this lever only changes whether *creating* that record needs a click, never which
disposition auto-mode policy already picked.

## Logging

One `decisions.md` entry per auto-resolved item, in the same shape every other auto-decision
uses:

```
AUTO {time} -- {what}. Reason: {policy-source}. Reversibility: high.
```

Examples:

```
AUTO 15:04:22 -- Ledger Phase 2: item #3 auto-routed to backlog (blocker: product decision). Reversibility: high.
AUTO 15:06:03 -- Queue write: created record "Add OAuth refresh edge case" (parked, trigger: /auth provider docs land). Reversibility: high.
AUTO 15:06:04 -- Ops acknowledgment: 2 items auto-acknowledged. Reversibility: high.
```

## Notification

One consolidated `PushNotification` per run, sent at the same point the existing auto-merge fast
lane sends its FYI (see `wrap-up/review-console.md`'s auto-merge short-circuit) — not one
notification per item. Summarize every action this lever resolved in the run.

## Error handling

Every failure path fails toward asking, not toward silence:

- Record creation fails (`gh issue create` / `local-store.js` error) — leave the proposal
  staged, log the failure, let it render as a normal Queue write at the console.
- `PushNotification` fails or isn't configured — non-blocking; `decisions.md` and the Wrap-Up
  summary remain the durable record.
- Floor check is ambiguous — fails closed, ask exactly as if the lever were off.
