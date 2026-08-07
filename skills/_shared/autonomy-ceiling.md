# Autonomy Ceiling

Single source of truth for the `autonomy` policy lever (`supervised` default | `trusted` |
`unattended`). Referenced, not restated, by every consumer: `_shared/work-record.md` (permission
matrix, Grant semantics, Born-ready rule), `_shared/auto-mode-contract.md` (never-reversible list),
`_shared/policy-schema.md` (lever table), `backlog/refine-mode.md` (Step 3 trust signal, Step 3.6).

Two modules implement it. `bin/lib/issues/autonomy.js` resolves the ceiling and maps
`(ceiling, trust row)` to a permission set; `bin/lib/issues/trust.js` supplies the evidence those
rows carry. Neither applies a label — they answer whether a caller may, and the caller acts.

## What it authorizes

| Ceiling | Unlocks — only for classes that have earned it |
|---|---|
| `supervised` | Nothing. Trust is recorded and displayed, never acted on. **The default**, and the state of any repo that has not opted in. |
| `trusted` | Born-`ready` for agent-filed work whose provenance class carries a `clean` verdict — skips `/claude-tweaks:specify`, never the human grant gate. |
| `unattended` | Everything `trusted` allows, plus machine-originated `auto:build`. **That half is shut behind its own opt-in** — see below. |

## Ceiling, not level

> `autonomy: supervised | trusted | unattended` caps what earned trust is *allowed* to unlock.
> Evidence moves the level; policy caps it. A class that has proven itself still cannot exceed the
> configured ceiling, and lowering the ceiling revokes immediately without destroying history.

The lever does not replace the existing policy levers and does not absorb them — it constrains
them. Nothing here loosens a floor that `_shared/auto-mode-contract.md` already sets.

## Precedence

Same resolution order as every other lever, implemented by `resolveCeiling`:

1. Explicit CLI arg
2. `config.yml` (this run's Manifesto answer)
3. `.claude-tweaks/policy.yml` project default
4. Skill default: `supervised`

An unrecognized value at any level is **skipped, not honored and not thrown on** — resolution
continues to the next source, so a typo lands on whatever the next source says and in the worst
case on `supervised`. Matching is exact and case-sensitive: `Trusted` is not `trusted`, and
resolves to the default rather than to the tier it resembles.

## Floor rule

A class earns nothing unless `permittedGrants` says so, which requires **all** of:

- The class's `kind` is one `bin/lib/issues/autonomy.js` recognizes — `producer`, `side-effect`, or
  `human`. This is an allowlist, so any kind it has not been taught denies. `unstructured` is
  `provenance.js` reporting it could not reduce those records to a class at all; a bucket whose
  only shared property is that nobody knows what is in it has no coherent class to earn trust for,
  and `trust.js` pins its verdict independently so neither module can open it alone.
- The class's verdict is `clean`. That in turn requires `total >= MIN_SAMPLES`, **and**
  `dispositioned >= MIN_VERDICTS` — a floor counted on real acceptance verdicts, not on how many
  records the class has closed — **and** no `changes-requested` and no corrective follow-ups. A
  `mixed` verdict earns nothing; neither does `insufficient-evidence`.

Read `_shared/trust-table.md` for what those columns mean and for the Coverage figure that says
whether a verdict can be believed. A `clean` verdict at low coverage and one at high coverage are
different claims.

## Why born-authorized is gated separately

`trusted`'s born-`ready` and `unattended`'s born-authorized differ in kind, not degree.

`ready` asserts a record is **spec-shaped**. It gets the record into a worklist; it authorizes
nothing, and `_shared/work-record.md`'s "labels are projection, not truth" rule means the gate
re-derives shape from the body before granting anyway. A wrongly-born-`ready` record costs a human
one flag-back.

`auto:build` **is** the authorization. Originating one from machinery contradicts the standing
invariant in `_shared/work-record.md`'s Grant semantics — that `auto:*` labels are only ever added
by an interactive human session — and that invariant is not merely documented: it has a live eval
asserting it (`evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`), written after a
real run treated a low-risk, well-scoped, `ready` record as license to run a full build-to-close
lifecycle on its own judgment.

So reaching the top tier is **not by itself** an amendment of that invariant. Machine-originated
grants need a second, explicit opt-in beyond setting `autonomy: unattended`
(`grantOriginationEnabled` in `permittedGrants`). **Nothing sets it today**, which is its shipped
state: the tier is defined so the ceiling is complete, and the grant path behind it stays shut
until amending that invariant is a decision someone makes deliberately rather than a side effect of
raising a dial.

## Logging

One `decisions.md` entry per ceiling-authorized action, in the shape every other auto-decision
uses:

```
AUTO {time} — {what}. Reason: {policy-source}. Reversibility: high.
```

Example:

```
AUTO 15:04:22 — Filed #212 born-ready (class producer:code-health/low, verdict clean, ceiling trusted). Reversibility: high.
```

A ceiling-authorized action with no log entry is forbidden, exactly as for every other auto-resolved
decision — silent automation without an audit trail is the one thing `auto` never permits.
