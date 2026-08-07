# Work Record — Unified Contract

The GitHub issue (or its `local-files` twin) is the **one durable work record**. Spec files
are ephemeral build materializations (`{run-dir}/work/{n}-spec.md`), not records. This file
is the canonical home of the record taxonomy: every filing, shaping, gating, dispatching, or
sweeping skill cites this contract rather than restating it.

Prose twin: `bin/lib/issues/record.js` owns the same taxonomy as code (label-string literals,
payload assembly, facet parsing). If the two disagree, one of them has a bug — fix, don't fork.

## Lifecycle spine

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch claims──► BUILDING ──user merges──► CLOSED
   │ ▲          ▲              │ ▲                      │                                │                    (completed)
   │ │          │              │ └─── flag back ────────┘                                │
   │ │          │              │      (remove ready)                                     ├──► retry ceiling: bot:blocked,
   │ │   born-ready (health    │                                                         │    grants removed → needs re-triage
   │ │   skills file straight  └──────── parked (trigger set) ──► wakes on trigger       │
   │ │   into READY)                                                                     └──► failure: auto:merge revoked unless transient;
   │ └── parked record wakes (trigger fires, parked removed)                                  auto:build retries next firing
   └──── closed as not-planned (wontfix / duplicate / absorbed) at any stage
```

- **backlog** — the default state: an open record carrying no stage labels. Nothing asserts it.
- **parked** — deliberately on hold; carries the `parked` label and a trigger (milestone due
  date or watched paths) that wakes it.
- **ready** — spec-shaped and agent-sized; eligible for the authorization gate's worklist.
- **authorized** — carries a human-granted `auto:build` (optionally + `auto:merge`).
- **building** — an agent holds the claim (`bot:in-progress` mirrors the claim ref).
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
| **Scoring** | `risk:low\|medium\|high` × `effort:low\|medium\|high` | Labels — at most one of each family |
| **Stage** | backlog (no label) \| `parked` \| `ready` | Labels — backlog is the absence of stage labels |
| **Authorization** | `auto:build`, `auto:merge` | Labels — human-granted only, absence is the default not-authorized state |
| **Bot state** | `bot:in-progress`, `bot:blocked` | Labels — machinery-owned visibility layer |
| **Acceptance** | `demo:pending` \| `demo:approved` \| `demo:changes-requested` — or no label | Labels — `demo:pending` set by `/claude-tweaks:wrap-up`, resolved to `demo:approved`/`demo:changes-requested` by `/claude-tweaks:demo`; independent of Stage and of the issue's own open/closed state |

**Origin axis, the two no-label cases:** a human filing directly on GitHub carries no `by:*`
label (absence = human-filed). Records created as side effects of other skills (e.g.
`/wrap-up` leftovers) also carry no `by:*` — they record provenance as an `Origin: {context}`
body line instead (e.g. `Origin: wrap-up leftover from #42`). The `by:*` family's membership
is stated once — the Label taxonomy table's Origin row below — and never restated in prose
here or in a consuming skill; read that row rather than re-deriving the list.

## Label taxonomy

The core label families below, plus an optional `priority:*` family (see the table for the
current per-family and total counts). The canonical `LABELS_JSON` (names + ≤100-char
descriptions) lives in `_shared/label-bootstrap.md`; consumers bootstrap only the labels they
are about to apply.

| Family | Labels | Axis |
|---|---|---|
| Origin (6) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:docs-health`, `by:capture`, `by:dispatch` | Origin |
| Risk (3) | `risk:low`, `risk:medium`, `risk:high` | Scoring |
| Effort (3) | `effort:low`, `effort:medium`, `effort:high` | Scoring |
| Ceremony (2) | `ceremony:fast-lane`, `ceremony:standard` | Ceremony depth — cross-cutting, not one of the axes; stamped by `/specify` alongside Scoring, always explicit (no unscored state) |
| Stage (2) | `parked`, `ready` | Stage |
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
| Bot state (2) | `bot:in-progress`, `bot:blocked` | Bot state |
| Acceptance (3) | `demo:pending`, `demo:approved`, `demo:changes-requested` | Acceptance |
| Closure (1) | `wontfix` | re-filing suppression |
| Upstream (1) | `upstream-candidate` | marks a record whose real destination is the claude-tweaks plugin, filed locally only because a headless run could not clear `/claude-tweaks:feedback`'s confirmation gate |
| Structure (1) | `family:parent` | marks a `/claude-tweaks:specify` decomposition parent — the only thing that makes it enumerable for `/claude-tweaks:tidy`'s `family-gate` sweep (`_shared/github-pr-scan.md`); never carried by a leaf |
| Priority (3, optional) | `priority:high`, `priority:medium`, `priority:low` | dispatch ordering |

Labels are reserved for these axes. Type is NOT a label family when the host supports native
Issue Types (`work-types: native`); producer-specific diagnostics (e.g.
`code-health:<criterion>`) may exist as optional extras but carry no mechanical meaning in
this contract.

## Permission matrix

Who may add / remove which labels. "Machinery" = any headless or autonomous path.

| Actor | Adds | Removes | Never |
|---|---|---|---|
| **Human** (GitHub UI or interactive session) | anything, incl. `auto:*` | anything | — |
| **Health skills** (`/code-health`, `/harness-health`, `/journey-health`, `/docs-health`) | `by:{self}`, `risk:*`, `effort:*`, `ready` (born-ready), Type; on a headless D5 finding, `upstream-candidate` **instead of** `ready`/`risk:*`/`effort:*` | nothing | `auto:*`, `bot:*`, `parked` |
| **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`) | nothing | scoring, stage, `auto:*`, `bot:*` |
| **`/specify`** (shaper) | `ready`, `risk:*`/`effort:*` when unstamped, `ceremony:*` (always — no unscored state), Type, `family:parent` (decomposition parents only, never leaves) | `parked` (promotion) | `auto:*`, `bot:*` |
| **`/backlog refine`** (write mode, human present) | `auto:build`, `auto:merge` (human-confirmed), `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed), scoring supplied inline | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path, adding any `bot:*`, `risk:*`/`effort:*` beyond the inline-override case, body-shaping beyond the `**Related:**` line |
| **`/backlog overview`** (read mode) | nothing | nothing | everything — pure read-only distribution/recommendation view |
| **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling) | `auto:merge` (failure downgrade), `auto:*` (at ceiling), `bot:in-progress` (release) | adding `auto:*` or `ready` |
| **`/tidy`** (hygiene) | `parked` (Defer action, with trigger) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*` |
| **Executors** (`/flow`, `/build`) | nothing | nothing | `auto:*`, `ready` |
| **`/wrap-up`** | `demo:pending` | `bot:in-progress` (claim release) | `auto:*`, `ready`, `demo:approved`, `demo:changes-requested` |
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
- **Machinery may only remove grants, never add them.** Failure handling is
  classification-driven (via `/claude-tweaks:assess-agent-autonomy`'s `failure-check` mode):
  a `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before retry; a
  `transient`-classified one preserves it. At the retry ceiling (`dispatch-retry-ceiling`),
  regardless of classification, machinery removes all `auto:*` labels and adds `bot:blocked` —
  the record needs a human re-grant to run again.
- `auto:*` labels are only ever added by an interactive human session; there is no
  machinery path that originates a grant.

## Acceptance semantics

The Acceptance axis records whether a human has actually verified a built record does what
was asked — distinct from tests passing (`/claude-tweaks:test`) and code-quality review passing
(`/claude-tweaks:review`), both of which gate *before* this axis is ever set.

- `/claude-tweaks:wrap-up` applies `demo:pending` once build+test+review are done, and posts a
  Verification Brief (an issue comment, or — under `work-links: body-text` on the `local-files`
  driver, which has no comment mechanism — a `## Verification Brief` body section) with what
  changed, why, and how to verify it. This happens **regardless of merge timing** — an
  `auto:merge`'d record still gets `demo:pending` on its now-closed issue, enabling retrospective
  sign-off.
- `/claude-tweaks:demo` is the sole consumer: it walks the human through one `demo:pending`
  record's brief per invocation (open or closed) and resolves the label to `demo:approved` or
  `demo:changes-requested` — `/claude-tweaks:help` (Stage 4.7) is the sole discovery surface for
  which records are outstanding. On the latter, it files a linked follow-up backlog record.
- The three values are mutually exclusive by construction — `/claude-tweaks:demo` always removes
  `demo:pending` in the same operation it adds the resolution label.
- `auto:merge` governs merge timing only; it has no bearing on whether `demo:pending` eventually
  gets resolved.

## Labels are projection, not truth

Labels make record state visible and queryable — they are a **projection** of state whose
truth lives elsewhere (the body, the claim ref, the human's judgment). Any consumer about to
*act* re-verifies the truth; the label only builds the worklist.

Two worked examples:

1. **The gate re-verifies body shape despite `ready`.** `/backlog refine` lists by `ready`, but
   before granting it fetches the body and re-checks the spec-shaped definition (below). A
   `ready` label on an unshaped body gets flagged back (remove `ready`, comment why) — the
   label got the record *into the queue*; it never authorizes the grant by itself.
2. **Dispatch re-verifies the claim ref despite `bot:in-progress`.** The label is a cosmetic
   mirror of the atomic `refs/claims/*` lock (`_shared/issue-claims.md`). Dispatch skips or
   claims based on the ref's actual state (201/422 + comment fold), never on the label — a
   stale label with no live ref means the record is claimable, and a missing label with a
   live ref means it is not.

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

## Decomposition rules

When `/specify` decomposes a design into multiple records:

- The **parent record** body is the design summary (problem, chosen approach, key decisions,
  why alternatives lost). Type `feature`. **Parents never get `ready`** — they are not
  agent-sized work units.
- **Only leaf records get `ready`** (+ scoring). Leaves link to the parent (sub-issue when
  `work-links: native`; parent task-list + `Blocked by #N` body lines when
  `work-links: body-text`).
- **`Blocked by #N` may carry an optional assumption**: `Blocked by #N: {assumption}` — the colon
  and trailing text are optional; a bare line means exactly what it means today.
  `parseDependencies`/`DEP_RE` are unchanged (they already stop matching at the number);
  `parseDependencyAssumptions` (`bin/lib/issues/record.js`) reads the trailing text when present.
  See Cross-Spec Promise Tracking, below.
- **Tasks never become records.** A leaf's internal task breakdown is a checklist inside its
  body, not further issues.

## Cross-Spec Promise Tracking

A decomposition of `>= promise-register-min-leaves` leaves (Config keys, below) gets a
`## Cross-Spec Promises` section on the **parent** record's body, seeded by `/specify` and
maintained by `/claude-tweaks:review`'s Step 1.6 on every parent-linked leaf's own review — not
gated on the leaves being built together in one multi-spec `/flow` batch, since the dominant
workflow dispatches leaves independently, possibly weeks apart. This formalizes the ad hoc
"promise register" pattern from the spec 13-23 build, which caught 3 real cross-spec breaks but
previously lived in a gitignored pipeline directory and died with the run that created it.

**The register** lives on the parent as two GitHub primitives, not a new file: a
`## Cross-Spec Promises` table in the body (current-state truth, edited in place) and issue
comments (the chronological reconciliation log). Format:

```
| # | Promise | Owner (#leaf) | Status |
|---|---------|-----------------|--------|
| F1 | leaf #48 assumes leaf #46: exposes getStatus() | #48 | open |
```

**`Parent: #N`** — a decomposition-mode-only body-metadata line (`spec-template.md`), present on a
leaf's body only under `work-backend: github-issues` + `work-links: body-text` — the one
combination where nothing else records a leaf's own parent (`work-links: native`'s sub-issue
relationship is queryable from either side; `local-files` carries `facets.parent`). This is what
lets `/claude-tweaks:review`'s Step 1.6 resolve a leaf's parent without a native relationship to
query.

## Fingerprint marker

Every machine-filed record carries an HTML-comment fingerprint for dedup and resume-by-query
idempotency:

```
<!-- work-fingerprint: {fingerprint} -->
```

Readers accept the legacy `<!-- code-health-fingerprint: {fingerprint} -->` marker during
the migration window (read both, emit only `work-fingerprint`). `bin/lib/issues/record.js`'s
`extractFingerprint` implements the dual read; when both markers are present, the new one wins.

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
| `/specify` | Shapes records to spec shape; decomposes designs into parent + `ready` leaves; seeds `## Cross-Spec Promises` on the parent for decompositions at or above `promise-register-min-leaves` |
| `/backlog` | `refine` mode is the human gate — grants `auto:build`/`auto:merge` over the `ready` queue, and suggests `priority:*`/`**Related:**` (human-confirmed). `overview` mode is read-only — distribution views plus a "what to build next" recommendation. |
| `/dispatch` | Queue consumer — claims authorized records, invokes `/flow`, settles (release / revoke / report); also files `by:dispatch`-labeled backlog records when its own headless `next` firing hits a Preflight failure with nobody present to see it (`skills/dispatch/SKILL.md`'s Preflight, "Headless self-report") |
| `/flow`, `/build` | Executors — materialize the record into `{run-dir}/work/{n}-spec.md` and build it |
| `/wrap-up` | Closes the loop — carrier commit (close-via-merge), claim release, leftover records; applies `demo:pending` + posts the Verification Brief |
| `/demo` | Resolves the Acceptance axis — `demo:pending` → `demo:approved`/`demo:changes-requested`; files a linked follow-up backlog record on changes-requested |
| `/tidy` | Hygiene — stale backlog records, parked-trigger wakes, unsynced local records, `bot:blocked` surfacing |
| `/help` | Dashboard — live counts by stage / grants / bot state / acceptance |
| `/init` | Provisions the system — `work-backend` flag, label bootstrap, capability probes (`work-types`, `work-links`) |
| `/visualize` | Read-only — `record-graph` type renders the live open-record queue (stage columns, dependency edges, six-axis badges) as a diagram; never writes labels or body content |

See also: `_shared/issue-claims.md` (claim protocol; `bot:in-progress` mirror),
`_shared/label-bootstrap.md` (canonical LABELS_JSON + check-then-create loop).
