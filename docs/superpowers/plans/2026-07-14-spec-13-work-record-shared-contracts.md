# Spec 13: Work-Record Shared Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the canonical `skills/_shared/work-record.md` contract (lifecycle spine, six axes, 17+3 label taxonomy, permission matrix, grants, projection-not-truth invariant) and migrate `issue-claims.md`, `label-bootstrap.md`, and `auto-mode-contract.md` onto the unified-record vocabulary.

**Architecture:** Pure markdown contract fragments in `skills/_shared/` (flat files, no subdirectory). `work-record.md` is the prose twin of the future `bin/lib/issues/record.js` (spec 14) — normative tables + short prose in the style of `issue-claims.md`, no skill workflow steps. The three existing files get vocabulary migrations that keep all mechanics (ref locks, TTL, close-via-merge, bookends) unchanged.

**Tech Stack:** Markdown only. Verification is `grep`/`node -e` acceptance checks from spec 13's Acceptance Criteria.

## Global Constraints

- Work from the shared worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — every task: `cd` there first and verify with `pwd` + `git rev-parse --show-toplevel`.
- No emojis in skill files (CLAUDE.md Don'ts).
- `skills/_shared/` naming: flat fragment files, no subdirectory (spec 13 Gotchas).
- GitHub label descriptions must be ≤100 characters each (spec 13 Gotcha; prior 142-char incident).
- The words "inbox" and "deferred" must not appear as concept names in any of the four touched files (spec 13 AC 6) — literal legacy file paths (e.g. `specs/INBOX.md`) are the only exception.
- Do NOT chase cross-references in files other than the four this spec owns — consumers' stale references are specs 15-22's job (spec 13 Gotchas).
- Commit messages: `{Verb} {what} — {detail}` style, no conventional-commit prefixes. Never use closing keywords (`closes/fixes #N`).
- The canonical label set (17 core + 3 optional priority): `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture`, `risk:low`, `risk:medium`, `risk:high`, `effort:low`, `effort:medium`, `effort:high`, `parked`, `ready`, `auto:build`, `auto:merge`, `bot:in-progress`, `bot:blocked`, `wontfix`, plus `priority:high`, `priority:medium`, `priority:low`.
- Config keys (single spelling, no per-skill aliases, no env renames): `work-backend`, `work-types`, `work-links`, `dispatch-retry-ceiling` (3), `automerge-max-lines` (40), `automerge-max-files` (2), `dispatch-pick-max-concurrent` (3).

---

### Task 1: Create `skills/_shared/work-record.md` — spine, axes, taxonomy, permission matrix, grants, invariant

**Files:**
- Create: `skills/_shared/work-record.md`

**Interfaces:**
- Produces: the axes table, label taxonomy, permission matrix, and grant-semantics prose that Task 2 appends to and Tasks 3-5 point at. Section headings later tasks reference: `## The six axes`, `## Label taxonomy`, `## Permission matrix`, `## Grant semantics`, `## Labels are projection, not truth`.

- [ ] **Step 1: Write the file with exactly this content**

````markdown
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
   │ │   into READY)                                                                     └──► failure: auto:merge revoked,
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
  duplicate, absorbed into another record).

Stage vocabulary is exactly these three words — **backlog** (absence of stage labels),
**parked**, **ready**. Legacy stage names from the spec-file era never name concepts here.

## The six axes

| Axis | Values | Expressed as |
|---|---|---|
| **Type** | `bug` \| `feature` \| `task` | Native GitHub Issue Type when `work-types: native`; `type:*` label when `work-types: labels` |
| **Origin** | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
| **Scoring** | `risk:low\|medium\|high` × `effort:low\|medium\|high` | Labels — at most one of each family |
| **Stage** | backlog (no label) \| `parked` \| `ready` | Labels — backlog is the absence of stage labels |
| **Authorization** | `auto:build`, `auto:merge` | Labels — human-granted only, absence is the default not-authorized state |
| **Bot state** | `bot:in-progress`, `bot:blocked` | Labels — machinery-owned visibility layer |

**Origin axis, the two no-label cases:** a human filing directly on GitHub carries no `by:*`
label (absence = human-filed). Records created as side effects of other skills (e.g.
`/wrap-up` leftovers) also carry no `by:*` — they record provenance as an `Origin: {context}`
body line instead (e.g. `Origin: wrap-up leftover from #42`). The `by:*` family has exactly
four members — one per filing skill: `by:code-health`, `by:harness-health`,
`by:journey-health`, `by:capture`.

## Label taxonomy

17 core labels + 3 optional `priority:*` labels. The canonical `LABELS_JSON` (names +
≤100-char descriptions) lives in `_shared/label-bootstrap.md`; consumers bootstrap only the
labels they are about to apply.

| Family | Labels | Axis |
|---|---|---|
| Origin (4) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` | Origin |
| Risk (3) | `risk:low`, `risk:medium`, `risk:high` | Scoring |
| Effort (3) | `effort:low`, `effort:medium`, `effort:high` | Scoring |
| Stage (2) | `parked`, `ready` | Stage |
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
| Bot state (2) | `bot:in-progress`, `bot:blocked` | Bot state |
| Closure (1) | `wontfix` | re-filing suppression |
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
| **Health skills** (`/code-health`, `/harness-health`, `/journey-health`) | `by:{self}`, `risk:*`, `effort:*`, `ready` (born-ready), Type | nothing | `auto:*`, `bot:*`, `parked` |
| **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`) | nothing | scoring, stage, `auto:*`, `bot:*` |
| **`/specify`** (shaper) | `ready`, `risk:*`/`effort:*` when unstamped, Type | `parked` (promotion) | `auto:*`, `bot:*` |
| **`/triage`** (gate, human present) | `auto:build`, `auto:merge` (human-confirmed), scoring supplied inline | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path |
| **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling) | `auto:merge` (failure downgrade), `auto:*` (at ceiling), `bot:in-progress` (release) | adding `auto:*` or `ready` |
| **`/tidy`** (hygiene) | `parked` (Defer action, with trigger) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*` |
| **Executors** (`/flow`, `/build`, `/wrap-up`) | nothing | `bot:in-progress` (claim release at wrap-up) | `auto:*`, `ready` |

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
- **Machinery may only remove grants, never add them.** Failure handling is plain
  revocation: any failed run revokes `auto:merge` before retry; at the retry ceiling
  (`dispatch-retry-ceiling`) machinery removes all `auto:*` labels and adds `bot:blocked` —
  the record needs a human re-grant to run again.
- `auto:*` labels are only ever added by an interactive human session; there is no
  machinery path that originates a grant.

## Labels are projection, not truth

Labels make record state visible and queryable — they are a **projection** of state whose
truth lives elsewhere (the body, the claim ref, the human's judgment). Any consumer about to
*act* re-verifies the truth; the label only builds the worklist.

Two worked examples:

1. **The gate re-verifies body shape despite `ready`.** `/triage` lists by `ready`, but
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

Health-skill records (`by:code-health`, `by:harness-health`, `by:journey-health`) are
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
- **Tasks never become records.** A leaf's internal task breakdown is a checklist inside its
  body, not further issues.

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

Written by `/init` (probe + policy), read by every filing/shaping/dispatching skill **by
these literal names** — per-skill aliases and env-var renames are forbidden:

| Key | Values / default | Meaning |
|---|---|---|
| `work-backend` | `github-issues` \| `local-files` | Which driver stores work records |
| `work-types` | `native` \| `labels` | How Type is expressed (native Issue Types vs `type:*` labels) |
| `work-links` | `native` \| `body-text` | How parent/dependency links are expressed (sub-issue + blocked-by APIs vs `Blocked by #N` body lines) |
| `dispatch-retry-ceiling` | `3` | Failed autonomous attempts before `auto:*` removal + `bot:blocked` |
| `automerge-max-lines` | `40` | Auto-merge blast-radius cap: max diff lines |
| `automerge-max-files` | `2` | Auto-merge blast-radius cap: max files touched |
| `dispatch-pick-max-concurrent` | `3` | Max concurrent groups a bare `/dispatch` multi-pick may run |

## Consumers

| Skill | Role against the record |
|---|---|
| `/code-health`, `/harness-health`, `/journey-health` | File born-`ready` records with origin + scoring + fingerprint |
| `/capture` | Files raw backlog records (`by:capture`, Type only) |
| `/specify` | Shapes records to spec shape; decomposes designs into parent + `ready` leaves |
| `/triage` | The human gate — grants `auto:build` / `auto:merge` over the `ready` queue |
| `/dispatch` | Queue consumer — claims authorized records, invokes `/flow`, settles (release / revoke / report) |
| `/flow`, `/build` | Executors — materialize the record into `{run-dir}/work/{n}-spec.md` and build it |
| `/wrap-up` | Closes the loop — carrier commit (close-via-merge), claim release, leftover records |
| `/tidy` | Hygiene — stale backlog records, parked-trigger wakes, unsynced local records, `bot:blocked` surfacing |
| `/help` | Dashboard — live counts by stage / grants / bot state |
| `/init` | Provisions the system — `work-backend` flag, label bootstrap, capability probes (`work-types`, `work-links`) |

See also: `_shared/issue-claims.md` (claim protocol; `bot:in-progress` mirror),
`_shared/label-bootstrap.md` (canonical LABELS_JSON + check-then-create loop).
````

- [ ] **Step 2: Verify the acceptance greps pass**

Run from the worktree root:
```bash
grep -c "auto:build\|auto:merge" skills/_shared/work-record.md   # expect ≥ 4
grep -ci "labels are projection, not truth" skills/_shared/work-record.md   # expect ≥ 1 (heading present)
grep -c "by:code-health\|by:harness-health\|by:journey-health\|by:capture" skills/_shared/work-record.md   # expect ≥ 4
grep -in "inbox\|deferred" skills/_shared/work-record.md   # expect 0 hits
```
Expected: first grep ≥ 4, second ≥ 1, third ≥ 4, fourth returns nothing.

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23" && pwd && git rev-parse --show-toplevel
git add skills/_shared/work-record.md
git commit -m "Add work-record contract — lifecycle spine, six axes, taxonomy, permission matrix, grants, invariant"
```

---

### Task 2: `skills/_shared/label-bootstrap.md` — canonical LABELS_JSON for the full taxonomy

**Files:**
- Modify: `skills/_shared/label-bootstrap.md`

**Interfaces:**
- Consumes: the label list from Task 1's taxonomy table (exact names).
- Produces: the canonical `LABELS_JSON` block consumers copy label pairs from.

- [ ] **Step 1: Replace the header paragraph (lines 1-7) with**

````markdown
# Label Bootstrap — Shared Check-Then-Create Snippet

The canonical check-then-create loop every label-filing skill in this codebase uses.
Referenced by the work-record consumers (`_shared/work-record.md` is the taxonomy home —
health skills, `/capture`, `/specify`, `/triage`, `/dispatch`, `/tidy`,
`wrap-up/cleanup-procedures.md` Section E and `flow/multispec-review-console.md` for the
shared `parked` restoration step). Consumers reference this file; do not restate the loop
inline.
````

- [ ] **Step 2: Append the canonical LABELS_JSON section after the existing snippet's closing paragraph**

````markdown
## Canonical LABELS_JSON — the full work-record taxonomy

The complete label set from `_shared/work-record.md` (17 core + 3 optional `priority:*`),
with descriptions pre-checked against GitHub's 100-character cap. **Consumers bootstrap only
the labels they are about to apply** — copy the relevant pairs, don't create all 20
speculatively (except `/init`'s one-time provision-now offer, which uses this list whole):

```js
[
  ["by:code-health",    "Origin: filed by the code-health skill"],
  ["by:harness-health", "Origin: filed by the harness-health skill"],
  ["by:journey-health", "Origin: filed by the journey-health skill"],
  ["by:capture",        "Origin: filed via /capture"],
  ["risk:low",          "Scoring: low blast radius — safe for autonomous build"],
  ["risk:medium",       "Scoring: moderate blast radius — review before merge recommended"],
  ["risk:high",         "Scoring: high blast radius — human review required"],
  ["effort:low",        "Scoring: small, agent-sized change"],
  ["effort:medium",     "Scoring: moderate change, may span several files"],
  ["effort:high",       "Scoring: large change — consider decomposition before building"],
  ["parked",            "Stage: deliberately on hold until its trigger fires (milestone due or watched path change)"],
  ["ready",             "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
  ["auto:build",        "Grant: agents may build this record autonomously (human-granted; machinery only removes)"],
  ["auto:merge",        "Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)"],
  ["bot:in-progress",   "Bot state: an agent currently holds the claim on this record"],
  ["bot:blocked",       "Bot state: retry ceiling reached — needs human re-triage before autonomous retry"],
  ["wontfix",           "Closed as not-planned; health skills will not re-file findings with this fingerprint"],
  ["priority:high",     "Priority: dispatch picks this band first"],
  ["priority:medium",   "Priority: dispatch picks after priority:high"],
  ["priority:low",      "Priority: dispatch picks last among prioritized records"]
]
```
````

- [ ] **Step 3: Verify — every description ≤ 100 chars, exactly 20 labels, AC-4 family coverage**

```bash
node -e '
const labels = [
  ["by:code-health","Origin: filed by the code-health skill"],
  ["by:harness-health","Origin: filed by the harness-health skill"],
  ["by:journey-health","Origin: filed by the journey-health skill"],
  ["by:capture","Origin: filed via /capture"],
  ["risk:low","Scoring: low blast radius — safe for autonomous build"],
  ["risk:medium","Scoring: moderate blast radius — review before merge recommended"],
  ["risk:high","Scoring: high blast radius — human review required"],
  ["effort:low","Scoring: small, agent-sized change"],
  ["effort:medium","Scoring: moderate change, may span several files"],
  ["effort:high","Scoring: large change — consider decomposition before building"],
  ["parked","Stage: deliberately on hold until its trigger fires (milestone due or watched path change)"],
  ["ready","Stage: spec-shaped and agent-sized — in the authorization gate'"'"'s worklist"],
  ["auto:build","Grant: agents may build this record autonomously (human-granted; machinery only removes)"],
  ["auto:merge","Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)"],
  ["bot:in-progress","Bot state: an agent currently holds the claim on this record"],
  ["bot:blocked","Bot state: retry ceiling reached — needs human re-triage before autonomous retry"],
  ["wontfix","Closed as not-planned; health skills will not re-file findings with this fingerprint"],
  ["priority:high","Priority: dispatch picks this band first"],
  ["priority:medium","Priority: dispatch picks after priority:high"],
  ["priority:low","Priority: dispatch picks last among prioritized records"]
];
if (labels.length !== 20) { console.error("FAIL: expected 20 labels, got " + labels.length); process.exit(1); }
const over = labels.filter(([n,d]) => d.length > 100);
if (over.length) { console.error("FAIL: >100 chars: " + over.map(([n,d])=>n+"("+d.length+")").join(", ")); process.exit(1); }
console.log("OK: 20 labels, all descriptions <= 100 chars");
'
grep -c "priority:" skills/_shared/label-bootstrap.md   # expect ≥ 3
grep -n "work-record.md" skills/_shared/label-bootstrap.md   # expect ≥ 1 (pointer to taxonomy home)
```
Expected: `OK: 20 labels, all descriptions <= 100 chars`.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/label-bootstrap.md
git commit -m "Add canonical work-record LABELS_JSON to label-bootstrap — 17 core + 3 priority labels"
```

---

### Task 3: `skills/_shared/issue-claims.md` — bot:* rename, group-claim rule, grant vocabulary

**Files:**
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: grant semantics from Task 1 (`auto:build` / `auto:merge`, failure-downgrade, ceiling behavior).
- Produces: the group-claim rule that spec 19's `/dispatch` will cite; `bot:*` vocabulary that specs 15-21 will cite.

Mechanics stay untouched: the ref lock, comment mirror, `claimStatus` fold, TTL/staleness, takeover, ownership rule, dispatch-success-path `CLAIM_RUN_ID` threading, close-via-merge section, failure-posture table.

- [ ] **Step 1: Rename the status label section and all `status:*` occurrences**

1. Section heading `## The status label` → `## The bot:in-progress label`.
2. In that section: `status:in-progress` → `bot:in-progress` (the label named in the opening sentence).
3. Everywhere else in the file: `status:in-progress` → `bot:in-progress`, `status:blocked` → `bot:blocked`. Occurrences to catch: the label-bootstrap parenthetical (rewrite that consumer note to `(see _shared/label-bootstrap.md for the canonical snippet and the full work-record LABELS_JSON; /dispatch is the claim-acquiring consumer)`), and the Dispatch authorization section (rewritten wholesale in Step 3).

- [ ] **Step 2: Add the group-claim rule as a new subsection immediately after the `## The lock` section's code block**

````markdown
### Group claiming

Records whose key files overlap form a **file-overlap group** (`bin/lib/issues/grouping.js`'s
`groupByFileOverlap`). A dispatcher claims **all members of the group before starting any** —
building one member alone would leave the branch and its overlap partners racing each other.
Per-member acquisition uses the same 201/422 handling; on a partial group claim (some members
contested live mid-acquisition), release the members this run just claimed, log, and skip the
whole group this firing. Group membership is computed over *unclaimed* records only, so two
racing dispatchers converge: exactly one wins each contested member, and the loser backs off
group-wide.
````

- [ ] **Step 3: Replace the entire `## Dispatch authorization` section (currently describing `tier:*`) with the grants model**

````markdown
## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue
body is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**. Authorization is two stackable grants
(see `_shared/work-record.md`, the taxonomy home, for full semantics), *granted* exclusively
by `/claude-tweaks:triage`'s interactive invocation. Machinery may remove or downgrade
grants; it never adds them:

- `auto:build` — authorized to build. `/dispatch` selects on this, claims the record's whole
  file-overlap group, and hands it to `/flow #{n}`. Label = standing request, claim = in
  flight: the claim ref prevents double-dispatch across firings, and the grant persists until
  *successful* wrap-up — a failed run retries at a later firing once its claim ages out, up
  to the `dispatch-retry-ceiling` config key.
- `auto:merge` — additionally authorized to auto-merge without a live Review Console
  approval, but only when the run comes back completely clean (four-layer gate, defined in
  `skills/dispatch/SKILL.md`). Additive on `auto:build`; alone it is inert.

**Grant revocation (machinery-owned, the only direction machinery moves):**

- Any run failure revokes `auto:merge` before the next retry — a run that wasn't clean the
  first time never gets another unsupervised shot at auto-merge.
- At the retry ceiling (`dispatch-retry-ceiling`), remove all `auto:*` labels and add
  `bot:blocked` — the record leaves the autonomous queue until a human re-grants at the gate
  (which strips `bot:blocked` alongside the new grant).
- Flag-back at the gate (remove `ready`, comment why) returns an unshaped record to backlog
  state for more shaping — the gate's equivalent of "not yet."

These are reversible label writes, logged to `decisions.md`. Removing grants on *success* is
a different owner's job — `/wrap-up` (or the consolidated console) after a `merged:`/
`pr-opened:` release, per the Release triggers table above.
````

- [ ] **Step 4: Update the Release triggers table's tier row and the Consumers table**

1. Release-triggers row `Tier-label removal (tier:approved/tier:fast-track) after a merged:/pr-opened: release | Console dispatch-label step (multi-spec) / /wrap-up Section E step 6 (single-spec) | — (label edit, not a claim release)` → `Grant removal (auto:build/auto:merge) after a merged:/pr-opened: release | Console dispatch-label step (multi-spec) / /wrap-up Section E step 6 (single-spec) | — (label edit, not a claim release)`.
2. Release-triggers row for headless failure: replace `/claude-tweaks:triage dispatch Step 4` with `/claude-tweaks:dispatch settle step` (the consumer spec 19 creates; until then the prose names the role, not a file path).
3. Consumers table: `/claude-tweaks:triage (SKILL.md's dispatch mode Step 2)` row → `/claude-tweaks:dispatch` with role `Claims each authorized record's whole file-overlap group before handing off to /flow; releases + revokes on failure (per the retry-ceiling procedure)`. Update the `/claude-tweaks:flow` row's last sentence to `Never claims — /claude-tweaks:dispatch always claims before invoking /flow #{n}.`
4. In the `Identity:` paragraph (inside the `## The mirror` section): `(/claude-tweaks:triage dispatch, the one such consumer today)` → `(/claude-tweaks:dispatch, the one such consumer today)` and `{ISO-timestamp}-triage-standalone` → `{ISO-timestamp}-dispatch-standalone`. In the `**Dispatch's success path.**` paragraph (inside `## Release triggers`): replace the two references to `triage/SKILL.md` Step 3/Step 4 with `dispatch/SKILL.md` (execution step / settle step).

- [ ] **Step 5: Add the taxonomy pointer to the intro paragraph**

After the sentence `Consumers reference this file; do not restate the protocol inline.` append:
```
Label taxonomy home: `_shared/work-record.md` — this file defines the claim protocol; the
record contract defines what the labels mean.
```

- [ ] **Step 6: Verify**

```bash
grep -rn "status:in-progress\|status:blocked" skills/_shared/issue-claims.md   # expect 0 matches
grep -c "bot:in-progress" skills/_shared/issue-claims.md    # expect ≥ 2
grep -n -A3 "## The lock" skills/_shared/issue-claims.md | head -5   # sanity: lock section intact
grep -c -i "group" skills/_shared/issue-claims.md    # expect ≥ 3 (group-claim subsection present)
grep -n "tier:approved\|tier:fast-track\|tier:needs-review" skills/_shared/issue-claims.md   # expect 0 matches
grep -n "work-record.md" skills/_shared/issue-claims.md   # expect ≥ 2 (intro pointer + dispatch-authorization pointer)
grep -in "inbox\|deferred" skills/_shared/issue-claims.md   # expect 0 matches
```

- [ ] **Step 7: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "Migrate issue-claims to work-record vocabulary — bot:* labels, group claiming, grant revocation"
```

---

### Task 4: `skills/_shared/auto-mode-contract.md` — never-silenced wording to work-record vocabulary

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md`

**Interfaces:**
- Consumes: record vocabulary from Task 1 (backlog state, parked, record creation).
- Produces: the never-silenced list wording specs 16-21 cite.

- [ ] **Step 1: Update the "What `auto` does NOT silence" table**

Replace these two rows:
```
| `specs/backlog/` writes (inbox stage) | Each entry needs explicit user approval — the backlog is the user's queue, not the model's |
| `specs/backlog/` writes (parked stage) | Same — deferral is a user decision |
```
with:
```
| Work-record creation (new backlog records) | Each record filed on the user's tracker needs explicit user approval — the record queue is the user's, not the model's |
| Marking records `parked` | Same — putting work on hold is a user decision |
```

- [ ] **Step 2: Update the "Never-reversible (auto-FORBIDDEN)" list**

Replace:
```
- Deleting `specs/backlog/` entries
```
with:
```
- Closing or deleting work records
```
and replace:
```
- Writing to `specs/backlog/`
```
with:
```
- Creating work records (filing new records on the user's tracker)
```

- [ ] **Step 3: Fix the AC-6 concept-name hit in the silences table**

Row `| Capture next-action routing | Numbered options | Apply --route arg if set; else default to `inbox` (most conservative) |` → `| Capture next-action routing | Numbered options | Apply --route arg if set; else default to `keep` (record stays in backlog state — most conservative) |`

- [ ] **Step 4: Update the two Anti-Patterns rows naming `specs/backlog/`**

1. `| Writing to specs/backlog/ autonomously because a finding "obviously belongs there" | Each entry needs user approval. "Obvious" is the model's judgment, not the user's. |` → `| Filing work records autonomously because a finding "obviously belongs there" | Each record needs user approval. "Obvious" is the model's judgment, not the user's. |`
2. In the "What `auto` does NOT silence" intro or elsewhere, no other `specs/backlog/` mentions should remain: verify with the grep below.

- [ ] **Step 5: Verify**

```bash
grep -n "specs/backlog" skills/_shared/auto-mode-contract.md   # expect 0 matches
grep -in "inbox\|deferred" skills/_shared/auto-mode-contract.md   # expect 0 matches
grep -c "work record\|work-record" skills/_shared/auto-mode-contract.md   # expect ≥ 2
```

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/auto-mode-contract.md
git commit -m "Recast auto-mode never-silenced backlog rows as work-record creation — same protection, record vocabulary"
```

---

### Task 5: Acceptance-criteria sweep — all six ACs, cross-reference stubs, final commit

**Files:**
- Modify (only if a check fails): any of the four files above

**Interfaces:**
- Consumes: everything Tasks 1-4 produced.

- [ ] **Step 1: Run the full spec-13 acceptance sweep**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23"
# AC 1
test -f skills/_shared/work-record.md && echo "AC1a OK"
[ "$(grep -c 'auto:build\|auto:merge' skills/_shared/work-record.md)" -ge 4 ] && echo "AC1b OK"
grep -qi "labels are projection, not truth" skills/_shared/work-record.md && echo "AC1c OK"
# AC 2
[ -z "$(grep -n 'status:in-progress\|status:blocked' skills/_shared/issue-claims.md)" ] && echo "AC2a OK"
[ "$(grep -c 'bot:in-progress' skills/_shared/issue-claims.md)" -ge 2 ] && echo "AC2b OK"
# AC 3 — six axes rows + permission matrix rows
for axis in "Type" "Origin" "Scoring" "Stage" "Authorization" "Bot state"; do grep -q "\*\*${axis}\*\*" skills/_shared/work-record.md || echo "AC3 MISSING AXIS: $axis"; done; echo "AC3 axes checked"
for actor in "Human" "Health skills" "/capture" "/specify" "/triage" "/dispatch" "/tidy"; do grep -q -- "$actor" skills/_shared/work-record.md || echo "AC3 MISSING ACTOR: $actor"; done; echo "AC3 actors checked"
# AC 4 — exact label census in label-bootstrap.md
for l in "by:code-health" "by:harness-health" "by:journey-health" "by:capture" "risk:low" "risk:medium" "risk:high" "effort:low" "effort:medium" "effort:high" "parked" "ready" "auto:build" "auto:merge" "bot:in-progress" "bot:blocked" "wontfix" "priority:high" "priority:medium" "priority:low"; do grep -q "\"$l\"" skills/_shared/label-bootstrap.md || echo "AC4 MISSING LABEL: $l"; done; echo "AC4 labels checked"
# AC 5 — group rule within claim-acquisition area
grep -qi "group" skills/_shared/issue-claims.md && echo "AC5 OK"
# AC 6 — bare-word pass across all four files
grep -rin "inbox\|deferred" skills/_shared/work-record.md skills/_shared/issue-claims.md skills/_shared/label-bootstrap.md skills/_shared/auto-mode-contract.md
```
Expected: every `OK` line prints; no `MISSING` lines; the AC 6 grep returns nothing at all.

- [ ] **Step 2: Fix any failures found, then re-run until clean**

- [ ] **Step 3: Commit (only if fixes were made)**

```bash
git add skills/_shared/
git commit -m "Fix spec-13 acceptance sweep findings — cross-reference and vocabulary corrections"
```
