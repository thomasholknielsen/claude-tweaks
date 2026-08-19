# Work Record — Unified Contract

The GitHub issue (or its `local-files` twin) is the **one durable work record**. Spec files
are ephemeral build materializations (`{run-dir}/work/{n}-spec.md`), not records. This file
is the canonical home of the record taxonomy: every filing, shaping, gating, dispatching, or
sweeping skill cites this contract rather than restating it.

Prose twin: `bin/lib/issues/record.js` owns the same taxonomy as code (label-string literals,
payload assembly, facet parsing). If the two disagree, one of them has a bug — fix, don't fork.

## Lifecycle spine

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch dispatches──► BUILDING ──user merges──► CLOSED
   │ ▲          ▲              │ ▲                      │                                    │                    (completed)
   │ │          │              │ └─── flag back ────────┘                                    │
   │ │          │              │      (remove ready)                                         ├──► retry ceiling: bot:blocked,
   │ │   born-ready (health    │                                                             │    grants removed → needs re-triage
   │ │   skills file straight  └──────── parked (trigger set) ──► wakes on trigger           │
   │ │   into READY)                                                                         └──► failure: auto:merge revoked unless transient;
   │ └── parked record wakes (trigger fires, parked removed)                                  auto:build retries next firing
   └──── closed as not-planned (wontfix / duplicate / absorbed) at any stage
```

- **backlog** — the default state: an open record carrying no stage labels. Nothing asserts it.
- **parked** — deliberately on hold; carries the `parked` label and a trigger (milestone due
  date or watched paths) that wakes it.
- **ready** — spec-shaped and agent-sized; eligible for the authorization gate's worklist.
- **authorized** — carries a human-granted `auto:build` (optionally + `auto:merge`).
- **building** — an agent holds the claim (`bot:in-progress` mirrors the claim blob).
- **closed** — completed via the user's merge (close-via-merge), or not-planned (wontfix,
  duplicate, absorbed into another record). `work-backend: github-issues` — GitHub's own issue
  state. `work-backend: local-files` — `closeRecord(path)` (`bin/lib/issues/local-store.js`)
  marks `closed: true` in place; the file stays on disk as history and drops out of
  `queryRecords`' default results, the same way a closed GitHub issue drops out of
  `gh issue list --state open`.

Stage vocabulary is exactly these three words — **backlog** (absence of stage labels),
**parked**, **ready**. Legacy stage names from the spec-file era never name concepts here.

## The axes

| Axis | Values | Expressed as |
|---|---|---|
| **Type** | `bug` \| `feature` \| `task` | Native GitHub Issue Type when `work-types: native`; `type:*` label when `work-types: labels` |
| **Origin** | one `by:*` label — members listed once, in the Label taxonomy table's Origin row below — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
| **Scoring** | `risk:low\|medium\|high` × `size:low\|medium\|high` | Labels — at most one of each family |
| **Stage** | backlog (no label) \| `parked` \| `ready` | Labels — backlog is the absence of stage labels |
| **Authorization** | `auto:build`, `auto:merge` | Labels — human-granted only, absence is the default not-authorized state |
| **Bot state** | `bot:in-progress`, `bot:blocked` | Labels — machinery-owned visibility layer |
| **Acceptance** | `demo:pending` \| `demo:approved` \| `demo:changes-requested` — or no label | Labels — `demo:pending` is written by every skill the permission matrix below grants it to (more than one, and the matrix is the list; do not restate a single writer here), resolved to `demo:approved`/`demo:changes-requested` by `/claude-tweaks:demo` alone; independent of Stage and of the issue's own open/closed state |

**Origin axis, the two no-label cases:** a human filing directly on GitHub carries no `by:*`
label (absence = human-filed). Records created as side effects of other skills (e.g.
`/wrap-up` leftovers) also carry no `by:*` — they record provenance as an `Origin: {context}`
body line instead (e.g. `Origin: wrap-up leftover from #42`). The `by:*` family's membership
is stated once — the Label taxonomy table's Origin row below — and never restated in prose
here or in a consuming skill; read that row rather than re-deriving the list.

**"Effort" has three surviving meanings — know which one a given field is.** The Scoring axis's
`size:*` above is one of them, not the only one: (1) the record facet documented here is
`size` (renamed from `effort` in #217) — task size/complexity, `low|medium|high`; (2)
`finding.effort` in code-health's judge-output schema is the *same concept* under its
pre-rename name, deliberately left unrenamed because it's a live LLM-output contract
(`bin/lib/code-health/validate-finding.js` and every judge call site depend on that exact
field name) — not a different meaning, just a different vocabulary boundary; (3)
`review-effort`/`bin/lib/model-profiles/`'s `EFFORT_SCALE` is reasoning depth
(`low|medium|high|xhigh|max`), unrelated to task size entirely. Reading (1)'s rename as a
global invariant and "finishing" it into (2) breaks a live contract; conflating (1) or (2)
with (3) confuses size with reasoning depth, a different axis this file's Scoring row doesn't
cover at all.

## Label taxonomy

The core label families below, plus an optional `priority:*` family (see the table for the
current per-family and total counts). The canonical `LABELS_JSON` (names + ≤100-char
descriptions) lives in `_shared/label-bootstrap.md`; consumers bootstrap only the labels they
are about to apply.

| Family | Labels | Axis |
|---|---|---|
| Origin (6) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:docs-health`, `by:capture`, `by:dispatch` | Origin |
| Risk (3) | `risk:low`, `risk:medium`, `risk:high` | Scoring |
| Size (3) | `size:low`, `size:medium`, `size:high` | Scoring |
| Ceremony (2) | `ceremony:fast-lane`, `ceremony:standard` | Ceremony depth — cross-cutting, not one of the axes; stamped by `/specify` alongside Scoring, always explicit (no unscored state) |
| Stage (2) | `parked`, `ready` | Stage |
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
| Bot state (2) | `bot:in-progress`, `bot:blocked` | Bot state |
| Acceptance (3) | `demo:pending`, `demo:approved`, `demo:changes-requested` | Acceptance |
| Closure (1) | `wontfix` | re-filing suppression |
| Upstream (1) | `upstream-candidate` | marks a record whose real destination is the claude-tweaks plugin, filed locally only because a headless run could not clear `/claude-tweaks:feedback`'s confirmation gate |
| Structure (1) | `parent-issue` | Structure: parent issue — carries the acceptance gate for its sub-issues. Marks a `/claude-tweaks:specify` decomposition parent — the only thing that makes it enumerable for `/claude-tweaks:tidy`'s `parent-gate` sweep (`_shared/github-pr-scan-acceptance.md`); never carried by a sub-issue |
| Justification (1) | `solution:unjustified` | Marks a record whose stated problem names a solution that was never traded off; stamped by `/specify` via `/claude-tweaks:challenge`'s `framing-check`, absent means the framing read clean. Non-gating: the remedy is a one-line human call — `/claude-tweaks:challenge #{n}` resolves it in one step (supply evidence or accept the risk); re-running `/specify #N` also clears it, but only if the re-shape changes the framing itself. Pre-rename spelling `framing:baked` stays readable forever (`[IL-85]`), never emitted |
| Definition (1) | `needs:definition` | Marks a record naming a genuine open choice with no tradeoff made yet, rather than a single clear ask; stamped by `/capture` and `/feedback` at filing time (a content judgment, not a structural heuristic), absent means the ask read clear |
| Priority (3, optional) | `priority:high`, `priority:medium`, `priority:low` | dispatch ordering |

Retired names: `family:parent`, `framing:baked` (now `solution:unjustified`) — [IL-85] PERMANENT read-side support remains for adopter repos; removable only at a major version that drops pre-rename repo support.

Labels are reserved for these axes. Type is NOT a label family when the host supports native
Issue Types (`work-types: native`); producer-specific diagnostics (e.g.
`docs-health:additive`, `journey-health:coverage`, `code-health:filing-failed`) may exist as
optional extras but carry no mechanical meaning in this contract — no skill's dispatch, scoring,
or routing decision reads one back. (`code-health:<criterion>` was the pre-#240 example here;
code-health dropped per-criterion labels entirely once the criterion moved into the issue body's
header line, partly because that label class hit GitHub's 100-char cap — see
`bin/lib/code-health/issue-payload.js`.)

**The taxonomy is closed (#239).** A new label family requires a documented consumer —
somewhere in `skills/` or `bin/` that reads it back to make a decision — before a producer may
start stamping it. "Decorative" producer-specific diagnostics of the kind named above are the
one standing exception: they were grandfathered in as optional, human-readable categorization on
an already-filed issue, not a precedent for adding more without a consumer. A label with a real
mechanical consumer (`ready`, `auto:build`, `wontfix`, `parent-issue`, `bot:blocked`,
`demo:pending`, the `by:*` dedup keys, and `upstream-candidate` once `/claude-tweaks:feedback`'s
Step 0 queue mode shipped — see `skills/feedback/SKILL.md`) is unaffected; this closes the door
on filing a *new* write-only label the way `remembered.json`'s harness-health/docs-health gap and
`upstream-candidate`'s original orphan state both did (#239) — both closed by giving the writer an
actual reader rather than by deleting the write.

## Permission matrix

Who may add / remove which labels. "Machinery" = any headless or autonomous path.

**Every row is exhaustive for its actor.** There is no general "agent path" row that widens the
specific ones — each actor's born-`ready` conditions are documented on its own row directly:
`/capture`'s (the ceiling-gated `--chained` shaping its Never column describes, and — since #625 — the Shaped-body branch its Adds column authorizes) and, since
#623, the `side-effect:*` residue producers' — `/wrap-up` (leftover, ledger, and residue-sweep
routing), `/reflect`, `/review`, and `/visual-review` — whose rows below state the `specShapedBody` composition
their `ready` is conditional on. Extending born-`ready` to any further actor (`/demo` follow-ups)
still means editing that actor's own row, deliberately, and until then its `Never` column holds
as written whatever the ceiling says.

| Actor | Adds | Removes | Never |
|---|---|---|---|
| **Human** (GitHub UI or interactive session) | anything, incl. `auto:*` | anything | — |
| **Health skills** (`/code-health`, `/harness-health`, `/journey-health`, `/docs-health`) | `by:{self}`, `risk:*`, `size:*`, `ready` (born-ready), Type; on a headless D5 finding, `upstream-candidate` **instead of** `ready`/`risk:*`/`size:*` | nothing | `auto:*`, `bot:*`, `parked` |
| **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`), `needs:definition` (content judgment at filing time — see Judging Definition in `capture/SKILL.md`); `risk:*`, `size:*`, `ready` (**only** on the Shaped-body branch — structural check passed, `needs:definition` false, `via specShapedBody` footer present — see `capture/SKILL.md`) | nothing | `parked`, `auto:*`, `bot:*` — always; scoring and `ready` on any **stub** filing, at every ceiling (the Shaped-body branch is the sole exception, per Adds). Under `autonomy: trusted`+ with a `clean` `producer:capture` verdict the filing chains into `/claude-tweaks:specify --chained`, and *specify* stamps scoring and `ready` under its own row's authority (see `_shared/autonomy-ceiling.md`); the chain never fires alongside `needs:definition` — an undecided record cannot be born-ready |
| **`/feedback`** | `needs:definition` (content judgment at filing time, same posture as `/capture`'s), `bug`/`enhancement` **only** when `gh label list` confirms the label exists on `thomasholknielsen/claude-tweaks` | nothing | every other label in this repository's own internal automation taxonomy (`by:*`, `type:*`, `risk:*`, `size:*`, `ready`, `ceremony:*`, `auto:*`, `bot:*`, `parked`) — `needs:definition` is the single named exception |
| **`/specify`** (shaper) | `ready`, `risk:*`/`size:*` when unstamped, `ceremony:*` (always — no unscored state), `solution:unjustified` (via `/claude-tweaks:challenge`'s `framing-check`), Type, `parent-issue` (decomposition parents only, never sub-issues) | `parked` (promotion) | `auto:*`, `bot:*` |
| **`/backlog refine`** (write mode, human present) | `auto:build`, `auto:merge` (human-confirmed), `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed), scoring supplied inline | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path, adding any `bot:*`, `risk:*`/`size:*` beyond the inline-override case, body-shaping beyond the `**Related:**` line |
| **`/backlog grant`** (headless machine-grant mode, `github-issues` only — the one machine-origination path, see Grant semantics above) | `auto:build` (+`auto:merge` when `permittedGrants` also authorizes it), only on a record whose full gate chain clears (`bin/lib/issues/grant-gate.js`, `backlog/grant-mode.md`) | `bot:blocked` (re-authorize, `auto:build` only — never bundles `auto:merge`) | granting a human-filed record (no `by:*`), adding `ready`/`priority:*`/any `bot:*`, body-shaping beyond the audit comment, running at all under `work-backend: local-files` (no headless consumer acts on a local grant) |
| **`/backlog overview`** (read mode) | nothing | nothing | everything — pure read-only distribution/recommendation view |
| **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling), `demo:pending` (group auto-merge gate, `dispatch/settle-and-merge.md` — reuses `/wrap-up`'s own `verification-brief.md` procedure, including its parent-gate routing, so on a parent-linked sub-issue the label lands on the parent instead) | `auto:merge` (failure downgrade), `auto:*` (at ceiling), `bot:in-progress` (release) | adding `auto:*` or `ready`, `demo:approved`, `demo:changes-requested` |
| **`/tidy`** (hygiene) | `parked` (Defer action, with trigger), `demo:pending` (Open parent gate action, either driver — the local twin writes the parent's `acceptance: pending` facet; both reuse `/wrap-up`'s own gate-opening write) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*`, `demo:approved`, `demo:changes-requested` |
| **Executors** (`/flow`, `/build`) | `bot:blocked` — merge-verification park only (`_shared/pr-first-merge.md` Step 2.5's red path). This path parks **without** revoking `auto:*`: a red or timed-out CI check is not a build failure, so there is no Settle classification and no retry increment behind it — unlike `/dispatch`'s retry-ceiling write above | nothing | `auto:*`, `ready` |
| **`/wrap-up`** (all filing paths: leftover routing, ledger Phase 2/3 routing, residue-sweep records) | `demo:pending`; `parked` (a `Trigger:` leftover or Defer — never alongside `ready`); `bot:blocked` (the same `_shared/pr-first-merge.md` Step 2.5 red path, reached through `wrap-up/review-console.md`'s fast-lane merge — same no-`auto:*`-revocation rule as the Executors row); `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer; a `Trigger:` leftover carries `parked` instead of `ready`); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant) | `bot:in-progress` (claim release) | `auto:*`, `bot:*` (other than the release), `priority:*`, `demo:approved`, `demo:changes-requested`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
| **`/reflect`** (tangential routing, Defer) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
| **`/review`** (Step 3 Defer — Capture routes file under `/capture`'s own row) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
| **`/visual-review`** (Findings & Ideas Defer — standalone runs; under `/review` its findings route through that row) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
| **`/demo`** | `demo:approved`, `demo:changes-requested` | `demo:pending` (on resolution) | `auto:*`, `ready`, `bot:*`, adding `demo:pending` itself |

**Driver-conditional note:** grants are *enforceable* only under the `github-issues` driver —
GitHub's RBAC means applying a label requires triage permission (a label is a maintainer's
signature), and the label audit trail records who granted what. The `local-files` driver
records grants as frontmatter for isomorphism, but no headless consumer acts on them —
headless dispatch is github-issues only.

## Grant semantics

Authorization is two stackable human-granted labels. Their **absence is the default
not-authorized state** — no label means no autonomous action, ever.

- `auto:build` — agents may claim and build this record autonomously.
- `auto:merge` — a completely clean autonomous run may merge without waiting for a live
  review. **Additive on `auto:build`:** the gate always grants `auto:build` when granting
  `auto:merge`. Dispatch queries `auto:build` only; `auto:merge` **alone is inert** — no
  queue selects on it.
- **Machinery may only remove grants, never add them** (save for the one carve-out in the
  next bullet, which is shut by default). Failure handling is
  classification-driven (via `/claude-tweaks:assess-agent-autonomy`'s `failure-check` mode):
  a `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before retry; a
  `transient`-classified one preserves it. At the retry ceiling (`dispatch-retry-ceiling`),
  regardless of classification, machinery removes all `auto:*` labels and adds `bot:blocked` —
  the record needs a human re-grant to run again.
- `auto:*` labels are only ever added by an interactive human session, with **one
  machine-origination path**: `/claude-tweaks:backlog`'s headless `grant` mode
  (`backlog/grant-mode.md`). It requires the full key set together — the `autonomy` ceiling
  resolving `unattended` AND the `grant-origination-enabled` policy opt-in
  (`_shared/autonomy-ceiling.md`, `_shared/policy-schema.md`), the candidate record's class
  reading a `clean` trust verdict, a `by:*` agent-filed origin, a content-aware
  `/claude-tweaks:assess-agent-autonomy` `grant-check` clearing, and no floor trip
  (`merge-sensitive-paths`, the oversight floor — `risk` and/or `size` at or above policy's
  configured `riskFloor`/`sizeFloor`, with an unscored axis failing closed — the fleet daily
  grant cap). **A human-filed record
  (no `by:*` label) is never eligible, regardless of every other key** — this path narrows the
  existing invariant exactly once, deliberately, rather than widening any actor's row generally.
  Both opt-in keys are human-set project policy (`policy.yml`), never written by any skill; with
  either absent — `policy.yml`'s shipped default — this path grants nothing and every candidate
  is skipped with the failing key logged.

## Acceptance semantics

The Acceptance axis records whether a human has actually verified a built record does what
was asked — distinct from tests passing (`/claude-tweaks:test`) and code-quality review passing
(`/claude-tweaks:review`), both of which gate *before* this axis is ever set.

- `/claude-tweaks:wrap-up` applies `demo:pending` once build+test+review are done, and posts a
  Verification Brief (an issue comment, or — under `work-links: body-text` on the `local-files`
  driver, which has no comment mechanism — a `## Verification Brief` body section) with what
  changed, why, and how to verify it. This happens **regardless of merge timing** — an
  `auto:merge`'d record still gets `demo:pending` on its now-closed issue, enabling retrospective
  sign-off. Two headless paths perform the identical write without passing through wrap-up's
  Phase 4 execution step: wrap-up's own auto-merge short-circuit (`wrap-up/review-console.md`) and
  `/claude-tweaks:dispatch`'s group auto-merge gate (`dispatch/settle-and-merge.md`), both by
  invoking the same `wrap-up/verification-brief.md` procedure. For a parent issue, that
  procedure applies one gate on the **parent**, once every sub-issue is closed — never on
  individual sub-issues, and identically on all three of those paths, since the routing lives in
  the procedure rather than in any caller.
- `/claude-tweaks:tidy`'s `Open parent gate` action is the backstop for the same write, on both
  drivers: when a parent's last sub-issue closes without ever reaching `/claude-tweaks:wrap-up`
  (`auto:merge`, a hand-close, a dispatch run that ended early), `/tidy` finds the un-gated
  parent and, once approved, applies the same disposition — reusing the identical Parent-Gate
  Procedure rather than a second copy of it. Only the sweep that surfaces it differs by driver:
  `_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope under `github-issues`, and
  `tidy/step-1-records.md`'s Shape 7 under `local-files` — the first queries the
  `parent-issue` label, which no local record carries, and its file is skipped entirely whenever
  `gh` is absent, so the local sweep cannot live there.
- `/claude-tweaks:demo` is the sole consumer: it walks the human through one `demo:pending`
  record's brief at a time (open or closed) — a bare `#N`, or an explicit `#N,#M` list taken in
  list order, never a backlog sweep — and resolves the label to `demo:approved` or
  `demo:changes-requested` — `/claude-tweaks:help` (Stage 4.7) is the sole discovery surface for
  which records are outstanding. On the latter, it files a linked follow-up backlog record.
- The three values are mutually exclusive by construction — `/claude-tweaks:demo` always removes
  `demo:pending` in the same operation it adds the resolution label.
- `auto:merge` governs merge timing only; it has no bearing on whether `demo:pending` eventually
  gets resolved.

## Labels are projection, not truth

Labels make record state visible and queryable — they are a **projection** of state whose
truth lives elsewhere (the body, the claim blob, the human's judgment). Any consumer about to
*act* re-verifies the truth; the label only builds the worklist.

Two worked examples:

1. **The gate re-verifies body shape despite `ready`.** `/backlog refine` lists by `ready`, but
   before granting it fetches the body and re-checks the spec-shaped definition (below). A
   `ready` label on an unshaped body gets flagged back (remove `ready`, comment why) — the
   label got the record *into the queue*; it never authorizes the grant by itself.
2. **Dispatch re-verifies the claim blob despite `bot:in-progress`.** The label is a cosmetic
   mirror of the atomic `claims/issue-<n>.json` lock on `claims-registry` (`_shared/issue-claims.md`). Dispatch skips or
   claims based on the blob's actual, freshly-read state (`classifyClaimBlob`), never on the label — a
   stale label with no live claim blob means the record is claimable, and a missing label with a
   live claim blob means it is not.

## Spec-shaped body

What `ready` asserts and the gate re-verifies. **Deliberately structural-plus-minimal:**

- The sections `Current State`, `Deliverables`, and `Acceptance Criteria` are present.
- Each of those sections is non-empty.
- No unresolved placeholder markers anywhere in the body: `TBD`, `TODO`, `<!-- ambiguity:`.

Content *quality* is explicitly NOT part of this check — judging whether the deliverables
are the right ones is the shaper's (`/specify`) and the human gate's job. The structural
check exists so machinery can cheaply catch "the label says shaped but the body is a
one-liner," not to automate editorial judgment.

## Born-ready rule

Health-skill records (`by:code-health`, `by:harness-health`, `by:journey-health`,
`by:docs-health`) are
agent-sized and spec-shaped **by construction** — their builders emit Current State /
Deliverables / Acceptance Criteria bodies with scoring. They therefore file with `ready`
already applied and appear directly in the gate's worklist, skipping maturation. Captured
and human-filed records start in backlog state and reach `ready` through `/specify`.

Under `autonomy: trusted` or higher, a `/capture` filing reaches born-`ready` too when the
`producer:capture` class carries a `clean` trust verdict — the same reasoning reached a different
way, the class having *demonstrated* it earns the skip. The mechanism differs from the
by-construction case: `/capture` itself files plain and chains into `/claude-tweaks:specify
--chained` shaping in the same turn, so the body is spec-shaped and `ready` is stamped under
`/specify`'s own authority, never `/capture`'s. See `_shared/autonomy-ceiling.md`. At
`supervised`, the default, a human-invoked `/specify` remains the only road to `ready` for a
captured record.

Records composed via `specShapedBody` by `/wrap-up`, `/reflect`, or `/review` — the
`side-effect:*` trust classes — are born-ready **by construction**, exactly as health-skill
records are: the composer emits the three sections with a `Defer-reason:` and a
`via specShapedBody` footer, and the producer scores per the Scoring axis. A producer that
cannot honestly write Acceptance Criteria uses the composer's `openQuestion` variant and files
`needs:definition` with no `ready` and no scoring — the two landing states, stated once here.
The `via specShapedBody` footer is prose-governed provenance, not a cryptographic proof — the
project's model is agent-read skills plus conformance tests plus `refine-mode.md` Step 3.5's
structural gate.

## Decomposition rules

When `/specify` decomposes a design into multiple records:

- The **parent record** body is the design summary (problem, chosen approach, key decisions,
  why alternatives lost). Type `feature`. **Parents never get `ready`** — they are not
  agent-sized work units.
- **Only sub-issue records get `ready`** (+ scoring). Sub-issues link to the parent (the native
  sub-issue relationship when `work-links: native`; parent task-list + `Blocked by #N` body lines
  when `work-links: body-text`).
- **`Blocked by #N` may carry an optional assumption**: `Blocked by #N: {assumption}` — the colon
  and trailing text are optional; a bare line means exactly what it means today.
  `parseDependencies`/`DEP_RE` are unchanged (they already stop matching at the number);
  `parseDependencyAssumptions` (`bin/lib/issues/record.js`) reads the trailing text when present.
  See Cross-Spec Promise Tracking, below.
- **Tasks never become records.** A sub-issue's internal task breakdown is a checklist inside its
  body, not further issues.

## Cross-Spec Promise Tracking

A decomposition of >= 4 sub-issues (the threshold was the `promise-register-min-leaves` policy
lever until its retirement in #331; removal trail: `_shared/policy-deprecations.md`) gets a
`## Cross-Spec Promises` section on the **parent** record's body, seeded by `/specify` and
maintained by `/claude-tweaks:review`'s Step 1.6 on every parent-linked sub-issue's own review —
not gated on the sub-issues being built together in one multi-spec `/flow` batch, since the
dominant workflow dispatches sub-issues independently, possibly weeks apart. This formalizes the ad hoc
"promise register" pattern from the spec 13-23 build, which caught 3 real cross-spec breaks but
previously lived in a gitignored pipeline directory and died with the run that created it.

**The register** lives on the parent as two GitHub primitives, not a new file: a
`## Cross-Spec Promises` table in the body (current-state truth, edited in place) and issue
comments (the chronological reconciliation log). Format:

```
| # | Promise | Owner (#sub-issue) | Status |
|---|---------|-----------------|--------|
| F1 | sub-issue #48 assumes sub-issue #46: exposes getStatus() | #48 | open |
```

**`Parent: #N`** — a decomposition-mode-only body-metadata line (`spec-template.md`), present on a
sub-issue's body only under `work-backend: github-issues` + `work-links: body-text` — the one
combination where nothing else records a sub-issue's own parent (`work-links: native`'s sub-issue
relationship is queryable from either side; `local-files` carries `facets.parent`). This is what
lets `/claude-tweaks:review`'s Step 1.6 resolve a sub-issue's parent without a native relationship
to query.

## Fingerprint marker

Every machine-filed record carries an HTML-comment fingerprint for dedup and resume-by-query
idempotency:

```
<!-- work-fingerprint: {fingerprint} -->
```

Readers accept the legacy `<!-- code-health-fingerprint: {fingerprint} -->` marker during
the migration window (read both, emit only `work-fingerprint`). `bin/lib/issues/record.js`'s
`extractFingerprint` implements the dual read; when both markers are present, the new one wins.

## Freshness stamp

Records filed by the four health-sweep skills also carry the commit the sweep actually read, as
a plain body-metadata line:

```
Verified-as-of: {git sha}
```

Composed by `bin/lib/issues/record.js`'s `specShapedBody` (`verifiedAsOf` param — rendered above
`Origin:`/`Defer-reason:`, validated as a bare hex sha so a date or a branch name fails loud at
compose time) and read back by that module's `extractVerifiedAsOf`. **The producer resolves the
value itself, at the moment it reads the repo** — once per sweep run, threaded through every
finding that run files — never re-derived at issue-create time: a finding queued and filed later
would otherwise stamp a commit it never looked at, which reads as authoritative freshness that
isn't real. The line is optional — a producer that doesn't stamp, or a checkout where git is
unavailable, simply omits it, and no structural check may start demanding it. What a consumer
does with the stamp is `flow/materialize.md`'s Freshness-stamp drift section; a fresh stamp
bounds drift, it never establishes correctness, so `[IL-71]`'s re-verification instruction stays
in force regardless.

## Type

The canonical Type enum is `bug | feature | task`. Two expressions, governed by the
`work-types` config key:

- `work-types: native` — apply the native GitHub Issue Type (org-level feature; presence
  probed once by `/init`).
- `work-types: labels` — apply a `type:bug|feature|task` label instead.

Filing skills read the key and branch; they never re-probe mid-flow.

## Config keys

Canonical home: `_shared/work-record-config.md` — the key table (names, values, defaults) lives
there, not here, so a consumer that needs one key doesn't load this whole contract. Read that
file whenever a key's name, accepted values, or default matters; nothing about them is restated
here.

The keys it defines govern this contract's drivers and capabilities: `work-backend` (which
driver stores records), `work-types` (how Type is expressed — see Type, above), `work-links`
(how parent/dependency links are expressed — see Decomposition rules, above), and the
dispatch/auto-merge/fetch/staleness/promise-register thresholds the Consumers below read.

## Consumers

| Skill | Role against the record |
|---|---|
| `/code-health`, `/harness-health`, `/journey-health`, `/docs-health` | File born-`ready` records with origin + scoring + fingerprint |
| `/capture` | Files raw backlog records (`by:capture`, Type only) |
| `/specify` | Shapes records to spec shape; decomposes designs into parent + `ready` sub-issues; seeds `## Cross-Spec Promises` on the parent for decompositions of 4 or more sub-issues |
| `/backlog` | `refine` mode is the human gate — grants `auto:build`/`auto:merge` over the `ready` queue, and suggests `priority:*`/`**Related:**` (human-confirmed). `overview` mode is read-only — distribution views plus a "what to build next" recommendation. `grant` mode is the one headless machine-grant path — see Grant semantics above and `backlog/grant-mode.md`. |
| `/dispatch` | Queue consumer — claims authorized records, invokes `/flow`, settles (release / revoke / report); also files `by:dispatch`-labeled backlog records when its own headless `next` firing hits a Preflight failure with nobody present to see it (`skills/dispatch/SKILL.md`'s Preflight, "Headless self-report") |
| `/flow`, `/build` | Executors — materialize the record into `{run-dir}/work/{n}-spec.md` and build it |
| `/wrap-up` | Closes the loop — carrier commit (close-via-merge), claim release, leftover records; applies `demo:pending` + posts the Verification Brief |
| `/demo` | Resolves the Acceptance axis — `demo:pending` → `demo:approved`/`demo:changes-requested`; files a linked follow-up backlog record on changes-requested |
| `/tidy` | Hygiene — stale backlog records, parked-trigger wakes, unsynced local records, `bot:blocked` surfacing; also the two acceptance backstops, each of which is a `github-pr-scan-acceptance.md` scope under `github-issues` and a Step 1 shape (`tidy/step-1-records.md`) under `local-files` — `acceptance-gap` surfaces closed records with no disposition and mutates nothing, while `parent-gate` surfaces complete-but-un-gated parent issues and carries the `Open parent gate` action, which applies `demo:pending` to the parent and attaches its Verification Brief |
| `/help` | Dashboard — live counts by stage / grants / bot state / acceptance |
| `/init` | Provisions the system — `work-backend` flag, label bootstrap, capability probes (`work-types`, `work-links`) |
| `/visualize` | Read-only — `record-graph` type renders the live open-record queue (stage columns, dependency edges, six-axis badges) as a diagram; never writes labels or body content |

See also: `_shared/issue-claims.md` (claim protocol; `bot:in-progress` mirror),
`_shared/label-bootstrap.md` (canonical LABELS_JSON + check-then-create loop).
