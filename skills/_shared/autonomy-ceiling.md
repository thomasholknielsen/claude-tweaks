# Autonomy Ceiling

Single source of truth for the `autonomy` policy lever (`supervised` default | `trusted` |
`unattended`). Referenced, not restated, by every consumer: `_shared/work-record.md` (permission
matrix, Grant semantics, Born-ready rule), `_shared/auto-mode-contract.md` (never-reversible list),
`_shared/policy-schema.md` (lever table), `capture/SKILL.md` (the born-`ready` exception),
`backlog/refine-mode.md` (Step 3.6), `backlog/grant-mode.md` (the machine-originated grant path —
the "What it authorizes" table's `unattended` row, made live), `dispatch/settle-and-merge.md`
(Step 6.5's negative-evidence persist point — see Revocation below), `flow/manifesto.md` and
`review/step3-routing.md` (the review-auto-apply-ceiling ceiling-conditional default's two
computation sites — see that section below), `bin/lib/policy-schema.js`
(the `housekeeping-auto-merge` derived default — unset resolves `true` at `trusted`/`unattended`,
#580), and — for the bookkeeping capabilities this file also documents —
`_shared/ledger-format.md`'s Resolve Gate section (Phase 2 narrowing,
route remainder), `wrap-up/review-console.md` (queue-write auto-file, console auto-resolve),
`wrap-up/nothing-left-behind.md` (ops-ack auto-acknowledge), and `_shared/console-execution.md`
(the reconciler-side `consoleAutoResolve` caller — a second, later trigger point for the same
capability `wrap-up/review-console.md`'s own short-circuit uses from the live-session side).

**Exactly one actor acts on the ceiling-gated born-`ready` tier today: `/claude-tweaks:capture`.**
That sentence is about this lever's trust-gated tier only — it is not a statement about everything
the ceiling authorizes, and not the only road to born-`ready`: since #623, `/claude-tweaks:wrap-up`,
`/claude-tweaks:reflect`, `/claude-tweaks:review`, `/claude-tweaks:visual-review`, and (on its Shaped-body branch, #625) `/claude-tweaks:capture` file born-ready **by construction**
(`specShapedBody` composition — see `_shared/work-record.md`'s born-shaped rows), ceiling-independent
the same way health-skill filings are. The in-run initiative budget rides the same `trusted` value
with a different actor set and a different gate entirely (`_shared/initiative-budget.md`).
`/claude-tweaks:demo` follow-ups keep the `Never` column their own permission-matrix row states,
whatever this lever is set to; widening born-`ready` to a further actor means editing that actor's
row deliberately. `/claude-tweaks:backlog refine`
consumes the ceiling but grants nothing from it: it renders an advisory column and inherits
whichever records arrived born-`ready`.

Two modules implement it. `bin/lib/issues/autonomy.js` resolves the ceiling and maps
`(ceiling, trust row)` to a permission set; `bin/lib/issues/trust.js` supplies the evidence those
rows carry, from **two** sources — a closed record's `demo:*` disposition (demo-descent), and, when
no `demo:*` verdict exists, whether it was merged and stayed unreverted for at least
`trust-revert-window-days` (default 14, `_shared/policy-schema.md`) — **operational** evidence,
evaluated lazily against the record's tracker `closedAt` and an injected integration-branch git
log. Neither source is exclusive: a class's `dispositioned` count and the `MIN_VERDICTS` floor it
must clear can be made up of either kind of evidence, or both. Neither module applies a label —
they answer whether a caller may, and the caller acts.

## Revocation: negative evidence auto-revokes a class

The evidence sources above are positive-only. Two negative-evidence sources write against the
same cell and pin its verdict below `clean` — machine-granting for that class stops with no human
action, unconditionally at **every** ceiling tier, not just `unattended`:

1. **A `correctness`- or `ambiguous`-classified failure.** `/claude-tweaks:dispatch`'s Settle step
   (`dispatch/settle-and-merge.md` Step 6.5) already classifies every HARD-GATE failure via
   `/claude-tweaks:assess-agent-autonomy` `failure-check` mode. When the classification is
   `correctness`/`ambiguous`, the same comment Settle already posts (`Attempt N failed: {reason}`)
   carries a line-anchored `<!-- trust-negative-evidence: attempt=N classification=... -->` marker
   (`bin/lib/issues/retry.js`'s `attemptFailedCommentBody`) — a `transient` classification's path
   never carries it, by construction. `trust.js` reads the marker back from the record's comments
   the next time it grades that record's cell.
2. **A revert.** A closing commit `trust.js`'s operational-evidence path (above) would otherwise
   have counted known-good, but a revert was discovered against it (`resolveOperationalOutcome`'s
   `grade: 'bad'` result) — converts that record's contribution from known-good to known-bad on the
   same lazy read. No stored verdict to invalidate; recomputation covers it.

Either source is read as `trustRows`' `negativeEvidence` count on the cell. A cell with
`negativeEvidence > 0` cannot read `clean` regardless of how many positive (approved/operational)
outcomes it also holds — one known-bad outcome in the sample is disqualifying, the same precedence
`changesRequested`/`followUps` already had. Negative evidence counts toward `dispositioned` (and
therefore `MIN_VERDICTS`) exactly like every other real outcome signal — a known-bad record is not
an unknown one.

**Scope: applies only where no `demo:*` disposition already exists on the record** (the same
`disposition === 'none'` branch the operational-good path already used) — a record that reached
`demo:approved` keeps that disposition; an earlier failed attempt on the way to an eventual
approval is not read as contradicting it. Changing dispatch's failure classification itself, its
retry ceilings, or its `auto:merge` revocation-on-retry is out of scope here — those are documented
in full in `dispatch/settle-and-merge.md` and unchanged; this section only makes that classification
durably visible to the trust table.

**Not currently time-windowed.** `_shared/trust-table.md`'s "Known limitation: no time window"
section applies here too: `trust.js` has no sample-size cap or aging mechanism today — every count,
positive or negative, is all-time. A class carrying negative evidence therefore stays pinned below
`clean` indefinitely under the shipped module, not until it "ages out" — there is no expiry
machinery to age it out with. A future trailing-evaluation window (see that section's own note) would
apply uniformly to every count trust.js keeps, negative evidence included, without any change here —
but until one ships, do not read a class's current `clean` verdict as proof it has never had a
negative outcome; read it only as "no negative outcome inside its current all-time evidence sample."
The marker's *absence* on a record means "no correctness/ambiguous failure since this shipped,"
never "no failures ever" — records built before this sub-issue landed carry no marker regardless of
their actual build history.

## What it authorizes

| Ceiling | Unlocks — only for classes that have earned it |
|---|---|
| `supervised` | Nothing. Trust is recorded and displayed, never acted on. **The default**, and the state of any repo that has not opted in. |
| `trusted` | Four things. **(a)** Born-`ready` for agent-filed work whose provenance class carries a `clean` verdict — the filing chains straight into `/claude-tweaks:specify --chained` shaping (headless), skipping the *human* shaping round-trip but never the shaping itself and never the human grant gate; the capture turn pays the shaping cost, only at this ceiling with a `clean` verdict. Today that means `/claude-tweaks:capture` and no other actor. **(b)** The in-run initiative budget — up to three capped **pointer repairs** per run, applied instead of staged (`_shared/initiative-budget.md`). Unlike (a), this one is **not** trust-gated; see below. **(c)** Two bookkeeping capabilities — `ledgerNarrowing` and `queueWriteAutoFile` (see Bookkeeping capabilities below). **(d)** The `housekeeping-auto-merge` derived default — while that key is unset, `/claude-tweaks:tidy`'s own green, marker-stamped Step-7 housekeeping PRs may arm `--auto` instead of staging for a human (`_shared/policy-schema.md`'s lever row; code twin `bin/lib/policy-schema.js`'s `deriveHousekeepingAutoMerge`, #580). Ceiling-only like (c), not trust-gated, and **not** one of the `bookkeepingPermissions` capabilities; an explicit `housekeeping-auto-merge` value in `policy.yml` wins over the derivation in both directions. |
| `unattended` | Everything `trusted` allows, plus the `unattended`-only rows of the Bookkeeping capabilities table below (`opsAckAutoAcknowledge`, `consoleAutoResolve`, `ledgerRouteRemainder`) and machine-originated `auto:build`. **The `auto:build` half is shut behind its own opt-in** — see below. |

## Bookkeeping capabilities

The narrow, opt-in, logged, fully reversible bookkeeping behaviors in the table below, resolved by
`bin/lib/issues/autonomy.js`'s `bookkeepingPermissions(ceiling)`:

| Capability | Unlocked at | What it does |
|---|---|---|
| `ledgerNarrowing` | `trusted`+ | `_shared/ledger-format.md`'s Resolve Gate Phase 2 skips the per-item drill for an item whose Phase 1 blocker reason clears the floor (below), auto-selecting `Route to a record -> Keep (backlog)` only. Never `Fix anyway`, `Accept`, `Drop`, or `Defer -> parked` from this drill specifically. |
| `queueWriteAutoFile` | `trusted`+ | `wrap-up/review-console.md` creates a proposed record (from the above, from leftover routing, or from `/reflect`'s tangential-idea routing) directly, instead of waiting for a live per-item approval at the Review Console. Since #623, an auto-filed exhaust proposal is spec-shaped and born-ready **by construction** (`specShapedBody` composition, `_shared/work-record.md`'s born-shaped rows), so `refine-mode.md` Step 3.5's spec-shape gate never flags it back — prevented by construction rather than by chaining `/specify`. |
| `opsAckAutoAcknowledge` | `unattended` only | `wrap-up/nothing-left-behind.md`, wrap-up's Phase 3 ledger gate — auto-acknowledges every ops item instead of presenting the acknowledgment drill. Held to the higher tier deliberately: this is the one bookkeeping capability that skips acknowledging a post-merge infrastructure follow-up, not just a reversible ledger/queue item. |
| `consoleAutoResolve` | `unattended` only | Zero-click, never zero-render: the Review Console resolves every section (batch table, `M#`, `Q#`, `U#`) per its own defaults with zero `AskUserQuestion` calls, but the FULL console — every table, every row — still renders in the terminal output, with each row pre-stamped `AUTO-RESOLVED` in place of a live decision. Skipping the prompt is not license to skip the render; a silent short-circuit that emits only a summary/prose recap, with none of the console's own rows, is the defect this capability's contract explicitly forbids. Two sanctioned callers: `wrap-up/review-console.md`'s own short-circuit (before a console ever renders), and `_shared/console-execution.md`'s reconciler-side executor (for a console already rendered on a PR, when the ceiling is raised or reconciled under a higher tier afterward). |
| `ledgerRouteRemainder` | `unattended` only | Extends `ledgerNarrowing` — a ledger item whose blocker reason misses the four-category floor also auto-routes to `Route to a record -> Keep (backlog)` (never `Fix anyway`/`Accept`/`Drop`). |

None of the bookkeeping capabilities touch `Fix anyway`/`Accept`/`Drop` dispositions, HARD-GATEs, `BLOCKED`/`STOP`
conditions, or merge-conflict resolution — those stay fully human-gated at every tier.

### Floor rule (ledger narrowing)

`ledgerNarrowing` only narrows an item whose Phase 1 blocker reason matches one of the four
categories `_shared/ledger-format.md`'s Resolve Gate Phase 1 already requires as legitimate:

| Category | Example blocker-reason text |
|---|---|
| External state | "Requires external state (third-party API data)" |
| User product/design decision | "Needs a product decision on the rate-limit value" |
| Not-yet-built dependency | "Depends on functionality not yet built in this pipeline" |
| Scope expansion | "Would expand scope — breaks 14 unrelated tests" |

Implemented by `bin/lib/issues/autonomy.js`'s `clearsFloor(blockerReason)`. Anything else —
including an ambiguous or unrecognized reason — fails closed: ask, exactly as if the capability
were locked for that one item.

### Restricted-disposition rule

`ledgerNarrowing` only ever authorizes routing to a new **backlog** record (no `parked` stage, no
trigger to invent) from the ledger drill. Leftover routing is different: it follows whatever
disposition (`backlog` or `parked`) its own existing `leftover-default` auto-mode policy already
decided — this capability only changes whether *creating* that record needs a click, never which
disposition auto-mode policy already picked.

### Review-auto-apply-ceiling ceiling-conditional default

At the `unattended` ceiling, `review-auto-apply-ceiling`'s skill default is `medium` instead of the
project-wide `low` (see `_shared/policy-schema.md`'s lever row). An explicit CLI arg, run config, or
project-policy value still wins under the standard precedence chain (`_shared/auto-mode-contract.md`)
— the ceiling only moves the *default*, it never overrides a stated choice.

Two sites read the ceiling to compute this default, and they must stay in lockstep (refs #566):
`skills/flow/manifesto.md`'s Recommendation-defaults row computes it into every piped run's
`config.yml` (which resolves as `source: run-config` downstream), and
`skills/review/step3-routing.md`'s `source: default` branch computes it for a run directory whose
`config.yml` never set the lever (not `skills/review/SKILL.md`, which never mentions this lever). A
flat value at either site silently defeats the other — the manifesto row's own rationale spells out
the failure shape.

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
  `dispositioned >= MIN_VERDICTS` — a floor counted on real outcome evidence (a `demo:*`
  disposition, or a merged-and-unreverted operational close), not on how many records the class has
  closed — **and** no `changes-requested` and no corrective follow-ups. A `mixed` verdict earns
  nothing; neither does `insufficient-evidence`.

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

### Reading the result

`permittedGrants` returns one `{ granted, reason }` object per grant, under `grants.bornReady` and
`grants.bornAuthorized` — read those, never the flat top-level `bornReady` / `bornAuthorized` /
`reason` keys beside them. The flat `reason` is a single string covering both decisions, so a
*granted* `bornReady` could carry the withheld `bornAuthorized`'s denial text; the per-grant pair is
what fixes that (refs #647). A granted decision's `reason` is the empty string — render nothing
rather than a placeholder.

The flat keys stay on as a dated transitional twin, because a skill's `node -e` block loads
`$CLAUDE_PLUGIN_ROOT`'s modules — the *installed* build — while the skill text around it is the
checkout's, so repo-HEAD prose can meet an older `autonomy.js` that has no `grants` key yet. That is
why `capture/SKILL.md` and `backlog/refine-mode.md` each guard the read with a
`(permitted.grants || {})` fallback. Removal condition: delete the flat keys, and those fallbacks
with them, at the first release on or after **2026-11-16** — `bin/lib/issues/autonomy.js`'s module
header carries the same condition.

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
(`grantOriginationEnabled` in `permittedGrants`, set via the `grant-origination-enabled` key in
`policy.yml` — `_shared/policy-schema.md`). **`false` by default**, so a repo that has not opted in
gets exactly the pre-#269 behavior: the tier is defined so the ceiling is complete, and the grant
path behind it stays shut until a human amends that invariant deliberately, in `policy.yml`, rather
than as a side effect of raising a dial. `/claude-tweaks:backlog`'s headless `grant` mode
(`skills/backlog/grant-mode.md`) is the one path that reads the opt-in and acts on it — it is
machinery, but it originates nothing on its own judgment: both keys are a human's deliberate
project-level configuration, and the mode's own gate chain (`bin/lib/issues/grant-gate.js`) still
requires a clean per-class trust verdict, agent-filed origin, a content-aware `grant-check` clear,
and no floor trip before a single grant is written.

## Logging

One `decisions.md` entry per ceiling-authorized action, in the shape every other auto-decision
uses:

```
AUTO {time} — {what}. Reason: {policy-source}. Reversibility: high.
```

Examples:

```
AUTO 15:04:22 — Filed #212 and chained /claude-tweaks:specify --chained shaping — born-ready (class producer:capture/elevated, verdict clean, ceiling trusted). Reversibility: high.
AUTO 15:06:03 — Ledger Phase 2: item #3 auto-routed to backlog (defer-reason: needs-human-decision). Reversibility: high.
AUTO 15:06:04 — Queue write: created record "Add OAuth refresh edge case" (parked, trigger: /auth provider docs land). Reversibility: high.
AUTO 15:06:05 — Ops acknowledgment: 2 items auto-acknowledged, staged for filing. Reversibility: high.
```

A ceiling-authorized action with no log entry is forbidden, exactly as for every other auto-resolved
decision — silent automation without an audit trail is the one thing `auto` never permits.

## Notification (bookkeeping capabilities)

One consolidated `PushNotification` per run, sent at the same point the existing auto-merge fast
lane sends its FYI (see `wrap-up/review-console.md`'s auto-merge short-circuit) — not one
notification per item. Summarize every action the bookkeeping capabilities resolved in the
run.

## Error handling (bookkeeping capabilities)

Every failure path fails toward asking, not toward silence:

- Record creation fails (`gh issue create` / `local-store.js` error) — leave the proposal
  staged, log the failure, let it render as a normal Queue write at the console.
- `PushNotification` fails or isn't configured — non-blocking; `decisions.md` and the Wrap-Up
  summary remain the durable record.
- Floor check is ambiguous — fails closed, ask exactly as if the capability were locked.
