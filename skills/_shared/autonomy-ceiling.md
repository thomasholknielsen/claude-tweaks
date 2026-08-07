# Autonomy Ceiling

Single source of truth for the `autonomy` policy lever (`supervised` default | `trusted` |
`unattended`). Referenced, not restated, by every consumer: `_shared/work-record.md` (permission
matrix, Grant semantics, Born-ready rule), `_shared/auto-mode-contract.md` (never-reversible list),
`_shared/policy-schema.md` (lever table), `capture/SKILL.md` (the born-`ready` exception), and
`backlog/refine-mode.md` (Step 3.6).

**Exactly one actor acts on the born-`ready` tier today: `/claude-tweaks:capture`.** That sentence
is about the born-`ready` tier only — it is not a statement about everything the ceiling
authorizes. The in-run initiative budget rides the same `trusted` value with a different actor set
and a different gate entirely (`_shared/initiative-budget.md`). The other
residue producers — `/claude-tweaks:wrap-up` leftovers, `/claude-tweaks:reflect` routing,
`/claude-tweaks:demo` follow-ups, all of which resolve to `side-effect:*` classes — keep the
`Never` columns their own permission-matrix rows state, whatever this lever is set to. Widening it
to one of them means editing that actor's row deliberately. `/claude-tweaks:backlog refine`
consumes the ceiling but grants nothing from it: it renders an advisory column and inherits
whichever records arrived born-`ready`.

Two modules implement it. `bin/lib/issues/autonomy.js` resolves the ceiling and maps
`(ceiling, trust row)` to a permission set; `bin/lib/issues/trust.js` supplies the evidence those
rows carry. Neither applies a label — they answer whether a caller may, and the caller acts.

## What it authorizes

| Ceiling | Unlocks — only for classes that have earned it |
|---|---|
| `supervised` | Nothing. Trust is recorded and displayed, never acted on. **The default**, and the state of any repo that has not opted in. |
| `trusted` | Two things. **(a)** Born-`ready` for agent-filed work whose provenance class carries a `clean` verdict — skips `/claude-tweaks:specify`, never the human grant gate. Today that means `/claude-tweaks:capture` and no other actor. **(b)** The in-run initiative budget — up to three capped **pointer repairs** per run, applied instead of staged (`_shared/initiative-budget.md`). Unlike (a), this one is **not** trust-gated; see below. |
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

- The class's `kind` is one `bin/lib/issues/autonomy.js` recognizes as a class at all — `producer`,
  `side-effect`, or `human`. This is an allowlist, so any kind it has not been taught denies.
  `unstructured` is `provenance.js` reporting it could not reduce those records to a class;
  a bucket whose only shared property is that nobody knows what is in it has no coherent class to
  earn trust for, and `trust.js` pins its verdict independently so neither module can open it alone.
- The class is **agent-filed** — `producer` or `side-effect`. `human` is a real class and grades
  normally in the table, but born-`ready` authorizes an *agent's* filing, and a human-filed class
  has no agent filing to authorize; granting on it would license agent filings from evidence that
  humans generated. This is the load-bearing half of the check rather than a corner case:
  `human:human` is this repo's largest provenance and the first that will clear both floors.
- The class's verdict is `clean`. That in turn requires `total >= MIN_SAMPLES`, **and**
  `dispositioned >= MIN_VERDICTS` — a floor counted on real acceptance verdicts, not on how many
  records the class has closed — **and** no `changes-requested` and no corrective follow-ups. A
  `mixed` verdict earns nothing; neither does `insufficient-evidence`.

Read `_shared/trust-table.md` for what those columns mean and for the Coverage figure that says
whether a verdict can be believed. A `clean` verdict at low coverage and one at high coverage are
different claims.

**The floor rule above governs born-`ready` and born-authorized. It does not govern the initiative
budget**, which is gated on the ceiling alone plus its own caps. That is deliberate, and it is the
first asymmetry under this lever, so it is stated here rather than left to be inferred:

`permittedGrants` asks *"has this class of agent-filed record proved itself?"* — a question only
history can answer, because the thing being authorized is a **judgment** (this record is
well-shaped) that nothing else checks. An initiative fix has **no class at all**: it is not a filed
record, it has no provenance, and it never appears in the trust table. Keying it on the provenance
of whatever record the run happens to be for would import a verdict about filing quality into a
decision about reference repair — two unrelated questions, which is the `[IL-101]` mistake in a new
place.

Its safety comes from somewhere else entirely: the change is mechanically verifiable (the old
target is gone, the new one exists), capped in count, files, and lines, causally tied to the run's
own diff, excluded from tests and merge-sensitive paths, committed separately, and reverted with
one `git revert`. Those caps are the gate. **Do not "fix" this by adding a trust-verdict
requirement** — no cell would ever satisfy it, since an unfiled repair generates no record and
therefore no verdict, and the budget would ship permanently inert.

## Why born-authorized is gated separately

`trusted`'s born-`ready` and `unattended`'s born-authorized differ in kind, not degree.

`ready` asserts a record is **spec-shaped**. It gets the record into a worklist; it authorizes
nothing, and `_shared/work-record.md`'s "labels are projection, not truth" rule means the gate
re-derives shape from the body before granting anyway. A wrongly-born-`ready` record costs a human
one flag-back.

`auto:build` **is** the authorization. Originating one from machinery contradicts the standing
invariant in `_shared/work-record.md`'s Grant semantics — that `auto:*` labels are only ever added
by an interactive human session — and that invariant is not theoretical: it was written after a
real run treated a low-risk, well-scoped, `ready` record as license to run a full build-to-close
lifecycle on its own judgment. `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`
exists because of that incident, though what it can actually assert is narrower — its own
description states the grant path is untestable in the sandbox (no live `gh`, network blocked), so
it pins the `local-files` boundary rather than the grant invariant itself. The incident is the
evidence; the eval is a partial guard on it.

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
