# Wrap-Up Residue Sweep — Close-Time Outstanding Detection and Report Restructure

Date: 2026-08-08
Status: design approved, plan pending

## Problem

A release session (6.65.0, record #185) ended with a hand-composed report whose closing section,
"Outstanding", listed five items as prose. Every one was still outstanding when audited the
following day, and one had silently worsened: the red `changelog-coverage` suite it named was
picked up by a concurrent session, "fixed" in 6.65.1 by restoring the deleted 6.61.2 entry, and
left red on a *duplicate heading* instead. The report that flagged it had no mechanism to learn
that, because it was a transcript note rather than a tracked record.

### Root cause — the report had no floor

Three templated end-of-work shapes exist: `/flow` Step 5's Pipeline Summary, `/wrap-up` Step 9
(`skills/wrap-up/summary-template.md`), and `/dispatch`'s headless label-state trace. The 6.65.0
work reached none of them. It ran brainstorm → design doc → plan → `superpowers:subagent-driven-development`
invoked directly, bypassing `/claude-tweaks:build <design-doc-path>` — the governed on-ramp for
exactly that shape of work, which wraps SDD (`skills/build/SKILL.md`'s subagent strategy) and hands
to `/wrap-up`.

Nothing in the harness noticed the bypass. With no applicable template, the model composed a report
from what it remembered doing. Grepping `skills/`, `docs/`, and `bin/` for that report's headings
("What landed", "Outstanding", "Shipped:") returns zero hits outside a single unrelated string in
`post-tool-use.js` — the headings were invented that session and would differ the next.

This is the same failure `summary-template.md`'s Conversation-mode variant was added to fix, for the
same reason ("its absence is what caused a conversation-based run to compose its report from the
steps it had just executed"). That fix covered conversation mode. It did not cover *work that never
invoked wrap-up at all*.

### Three defects independent of which path ran

1. **`### Manual Steps Required` has no provenance.** `summary-template.md` carries exactly two
   `Generate from:` clauses — Actions Performed and Decisions. The one section that *promises*
   "Each row is a real, trackable record (`ledger/resolve-gate.md`'s `Acknowledge` disposition) —
   not just a note in this transcript" has none. Nothing tells it where to look.

2. **Nothing scans outside this run's own artifacts.** `skills/wrap-up/` contains no `gh pr list`,
   no `branch -r`, no `--merged`, no suite-state check. Step 5's cleanup is eight enumerated items,
   every one scoped to artifacts this run created.

3. **The enforcement mechanism is disabled in the mode that needs it.** Step 8.5's
   nothing-left-behind gate is per-item forced disposition, and its `Acknowledge` path creates a
   real record — precisely the guarantee wanted here. `SKILL.md` Step 8.5 skips it entirely when no
   ledger exists, which is the standalone case by definition. The ledger is *not* structurally
   coupled to pipelines (it lives at `docs/plans/YYYY-MM-DD-{feature}-ledger.md`, a plain repo
   path); ad-hoc work simply has nobody to create one.

### The failure is disposition, not discovery

The session *knew* about all five items — it wrote them down. Each was recorded as prose because
there was nowhere else to put it. This distinction sets the design: the sweep's job is to force a
disposition onto things that are true of the repository, not to be the first to learn them.

## Decisions taken

| Question | Decision |
|---|---|
| Where the guarantee lives | Reconstructive — `/wrap-up` computes outstanding state at close time; no new mid-session collection point |
| What happens to a finding | Fixed in a scratch worktree when it needs a write; filed as a record otherwise |
| Scan scope | This work's blast radius, plus what the session observably hit regardless of attribution |
| Report's job | Verdict plus proof of routing — pointers to durable destinations, not re-narration |
| health-core reuse | Consume the pure modules; defend purity with a test; do not move or rename them |

### Why reconstructive rather than a collection point

A collection point (a ledger created for ad-hoc work, written to as decisions are made) captures
*intent*, which a repo scan cannot see. It was rejected because it reintroduces the dependency that
failed here: something must remember to write to it mid-session. A close-time scan depends only on
the session reaching wrap-up once.

The accepted cost is that a purely internal judgment ("I decided not to fix the changelog") leaves
no trace. Two of the three observable classes are recoverable mechanically anyway — see
*Scope resolution* below — and the third is marked as judgment in the report rather than presented
as complete.

### Why not duplicate `/tidy`'s scans

`/tidy` Steps 4.5 (worktrees and build branches), 4.7 (issue claims), and 4.8 (GitHub PRs and
issues) already describe these scans. Copying them into wrap-up creates the second near-identical
consumer `[IL-32]` exists to prevent. The probes become a shared module both skills call, which also
converts `/tidy`'s prose instructions into a mechanism.

Note the project's countervailing convention, which this design respects:
`_shared/health-finding-shapes.md` states that each consumer writes its shared *prose* out in full
inline, with the `_shared` file as the reference the copies are checked against. So the sharing here
is **JavaScript, not skill prose** — `bin/lib/residue/` is shared code; `residue-sweep.md` and
`/tidy`'s steps each keep their own inline wording.

## Architecture

### What is reused, unmodified

| Module | Contribution |
|---|---|
| `bin/lib/health-core/fingerprint.js` | `createFingerprint(skillName, fields)` — stable finding identity |
| `bin/lib/health-core/dedup.js` | `decide(finding, issueIndex, cache, durableDeclined)` — file-once-then-suppress |
| `bin/lib/health-core/finding-validation.js` | `requireNonEmptyStrings` — shared validation |
| `bin/lib/health-core/issue-index.js` | `loadIssueIndex(file, toolName)` over a caller-supplied `gh issue list` dump |
| `bin/lib/issues/{record,local-store}.js` | record creation on either `work-backend` |
| `bin/lib/issues/claims.js` | claim-ref state |
| `bin/lib/wrap-up/{state,reflog,render}.js` | the State block — already shipped |

`dedup.decide` is pure by signature: every piece of state arrives as a parameter. Residue passes an
`issueIndex` it built itself and omits `cache` / `durableDeclined`, so it inherits none of the
sweep's durable state. `issue-index.js` reads only a caller-supplied JSON file — it does not touch
the `health-state` branch.

**Deliberately not touched:** `durable-state.js` and `cache.js` (the only module requiring it).
`/wrap-up` writing to the shared `health-state` branch on every close would be a surprising side
effect and the `[IL-73]` hazard.

### What is new

```
bin/residue.js                 CLI: --scope blast-radius|repo --base <sha> [--json]
bin/lib/residue/
  scope.js                     resolve "this work" → branches, worktrees, PR, record, claim refs
  probes/
    worktrees.js branches.js claims.js forge.js suite.js release.js
  render.js                    emit the Outstanding rows
  tests/                       + frozen fixtures
skills/_shared/scratch-worktree.md    provision → merge → act → ff-merge → tear down
skills/wrap-up/residue-sweep.md       the procedure Step 8.7 points at
```

### Consumers

- **`/wrap-up`** — ~~new Step 8.7, `--scope blast-radius`~~. **Superseded during execution, twice.** Step 8.7 was measured at 723 bytes against 382 of headroom in `skills/wrap-up/SKILL.md`; the sweep instead runs as a preamble to the existing Step 8.5, writing findings as ledger items so that gate's per-item forced disposition handles them — less machinery, and it closes the gap this design itself identified (Step 8.5 skips when no ledger exists, which is the standalone case). And the scope is `repo`, not `blast-radius`: every suite finding is `scope: 'observed'` by construction, so `blast-radius` would have made `/wrap-up` structurally unable to report a red suite — the headline item this feature exists to catch.
- **`/tidy`** — Steps 4.5 / 4.7 / 4.8 call the same probes with `--scope repo`.
- **`release.js`** is guarded by the `manifest.name === 'claude-tweaks'` check `post-tool-use.js`
  already uses, so adopters get the other five probes and no false release nags.

## Finding model

Each probe returns the shared shape so `fingerprint` and `dedup.decide` work unmodified:

| Field | Meaning |
|---|---|
| `id` | fingerprint — stable across sessions, so one stale branch files once |
| `kind` | `worktree` · `branch` · `claim` · `pr` · `suite` · `release` |
| `scope` | `blast-radius` or `observed` |
| `subject` | branch name, worktree path, PR number, failing suite |
| `remedy` | `auto` (residue can fix it) or `record` (needs a human) |
| `evidence` | the command run and its output |

## Scope resolution

`scope.js` derives "this work" from `git merge-base HEAD {integration-branch}` — the same base the
State block already prints, so a wrong base is visible rather than silent. `{integration-branch}`
resolves via `_shared/integration-branch.md`'s canonical ladder. From that base: branches whose tip
is reachable from HEAD, worktrees whose branch matches, the PR whose head ref matches, and claim
refs for records named in the commit range.

The `observed` half resolves to two mechanisms and one acknowledged gap:

| Observed class | Detection |
|---|---|
| A suite red independently of this work | `suite.js` re-runs the project's test command at close time — deterministic |
| A gate denied an action the session wanted | `pre-tool-use.js` already computes every deny; append it to the run dir's `events.jsonl` |
| A sibling record read and judged wrong | Judgment. Named trigger in `residue-sweep.md`; the report marks it as such |

Gate-denial logging is run-dir-scoped. Ad-hoc work with no run directory is the one case that stays
unrecorded, and this is stated rather than papered over.

## Report shape

`Manual Steps Required` becomes `Outstanding` and gains the `Generate from:` clause it never had.
`Routed` is new.

```
## Wrap-Up: {Record #N — title | topic}

### Verdict
{one line — what shipped, where it is, what is blocking}

### State                       (unchanged — bin/wrap-up-state.js)

### Outstanding (3)
| # | What | Kind | Disposition |
|---|------|------|-------------|
| 1 | worktree-reaping-impl merged, remote branch alive | branch | Fixed — a1b2c3d |
| 2 | changelog-coverage red: duplicate v6.61.2 heading | suite | Filed as #201 |
| 3 | PR #182 has no release triple | pr | Accepted — other lane owns it |

### Routed (4)
| Learning | Destination |
|---|---|
| Checks that cannot fail are not evidence | CLAUDE.md [IL-105] |
| A new worktree's base is untrustworthy | CLAUDE.md [IL-106] |
| Precondition over seam | specs/2026-08-07-worktree-reaping-design.md |
| Reaper staleness depth | record #199 |

### Actions Performed            (unchanged)
```

**Generate from (Outstanding):** `bin/residue.js` findings, Step 4's routed leftover sections, and
any ledger item resolved to `Acknowledge`.

### Rule 1 — no row renders without a disposition

Every `Outstanding` row carries `Fixed — {sha}`, `Filed as #{n}`, or `Accepted — {reason}`. A row
with a blank disposition is the prose note this design exists to eliminate.

### Rule 2 — `Routed` names destinations, never restates them

This is `summary-template.md`'s existing rule ("Do NOT restate an insight that already became a
Decisions row; name the row instead") finally given a section to live in. A learning with no
destination is visibly missing, which is the point.

## Scratch-worktree procedure

`skills/_shared/scratch-worktree.md`, consumed by `/wrap-up` and `/tidy`. Both need it: `/tidy`
under `work-backend: local-files` calls `writeRecord`, a file write, and the gate covers `Edit`,
`Write`, `NotebookEdit`, and git `commit`/`push` from the main checkout
(`pre-tool-use.js`'s `GATE_COVERAGE`).

**Provision only on demand.** The trigger is at least one finding with `remedy: auto` that requires
an `Edit`/`commit`/`push`. Worktree removal and local branch deletion do not qualify — both are
already legal from the main checkout. A run with no such finding must never create a worktree.

1. Create it via the **native tool** (`EnterWorktree`) when one is available, falling back to
   `git worktree add` in `.worktrees/` when none is — `superpowers:using-git-worktrees` Step 1a
   before Step 1b. **Do not aim the fallback mechanism at `.claude/worktrees/`.** ADR-0004
   (`docs/decisions/0004-worktree-two-domain-convention.md`) treats the two as permanently separate
   ownership domains, and putting a git-created worktree in the harness-owned one is the exact
   hazard it rejects: superpowers' cleanup later `git worktree remove`s it out from under the
   harness's bookkeeping. The procedure must detect via `git worktree list` or
   `GIT_DIR != GIT_COMMON`, never by asserting a directory name — also ADR-0004.
2. **`git merge origin/main` as the first action inside it, unconditionally** (`[IL-106]`). The
   harness `worktree.baseRef` default is `fresh`, which branches from `origin/<default-branch>`
   while claude-tweaks expects `head` — see `_shared/worktree-base-ref.md`. The merge makes the
   procedure correct under either setting.
3. Apply remedies, commit, push from inside the worktree, where the gate does not apply.
4. Return via `git push . <sha>:main`; when `main` is checked out that is refused, so use a
   branch-guarded `git merge --ff-only` (`[IL-05]`).
5. Tear down via `ExitWorktree`, never raw `git worktree remove` — it fails on the live lock
   (`[IL-58]`). If teardown fails, the `SessionStart` reaper collects it **only in the native
   domain**: `worktree-reap.js` considers only worktrees under `{REPO_ROOT}/.claude/worktrees/`.
   A fallback-path worktree in `.worktrees/` has no reaper and must be torn down explicitly, or it
   accumulates — which is itself a `kind: worktree` finding on the next run.

The procedure must state that after entering a worktree, `&&` chains and heredocs are refused by
shape — one plain command per call, and `Edit` rather than heredoc append.

## Record-mode half-state

Step 1 can enter record mode from an argument (`/wrap-up #185`) or from branch/commit references.
Downstream, record mode is tested by materialized-header existence (`${RUN_DIR}/work/*-spec.md`),
which standalone runs never have. So `/wrap-up #185` after ad-hoc work enters record mode and then
has every record-keyed step skip: closure, claim release, acceptance labeling, unblocked-records.

One concept becomes two named signals:

| Signal | Means | Gates |
|---|---|---|
| **record identified** | a reference resolved — argument, branch name, or commit trailer | record closure, acceptance labeling, unblocked-records, claim release |
| **materialized header present** | `${RUN_DIR}/work/*-spec.md` exists | only what needs header fields — `effort:`, `blocked-by:` |

**The audit set is defined by reference, not by count:** every occurrence of `materialized header`
under `skills/wrap-up/`, enumerated at plan time via
`grep -rn "materialized header" skills/wrap-up/` plus `grep -rn "work/\*-spec.md" skills/wrap-up/`.
A literal cardinality is deliberately not recorded here — it drifts, and no single keyword grep
catches every reworded restatement (`[IL-40]`).

`[IL-101]` governs this edit: it splits one set to answer a second question, so **each site's
criterion is restated against the new question**, never bulk-assigned. The last time that shortcut
was taken, three of four answers matched and the fourth was the largest bucket in the repo.

## health-core demarcation

The pure/stateful split already exists structurally — `dedup.js`, `finding-validation.js`,
`budget.js`, `rotation.js`, `mark.js`, `runs.js`, `churn-report.js`, and `frontmatter-list.js` have
zero I/O requires; `fingerprint.js` requires only `crypto`. It is undeclared and unenforced.

**Decision: declare and test the boundary; move nothing.**

- A directory boundary does not prevent a cross-directory require, so it does not defend the
  property. A test does.
- Renaming touches every `.js` requiring the pure modules (34 at time of writing) plus `package.json`,
  `docs/plugin-structure.md`, `docs/skill-graph.md`, three `_shared/` fragments, and three
  `SKILL.md`s. `[IL-93]` is the live hazard: prose describing health-core's current reach goes
  stale silently.
- Bundling a rename into a feature branch costs the whole-branch review its ability to distinguish
  "residue broke" from "the rename broke a sweep".

**New test:** for each module in the pure set, assert its source requires none of `fs`,
`child_process`, `./durable-state`, or `./cache`. Its red: a stateful require added to `dedup.js`
fails the assertion naming the module and the forbidden import.

## Out of scope

- **The four duplicated sweep wrappers.** `bin/lib/{code,docs,harness,journey}-health/` each carry
  near-identical `cache.js` / `dedup.js` / `fingerprint.js` — `health-core/dedup.js`'s own header
  calls them "byte-identical wrapper across the three today". Genuine `[IL-32]` debt, pre-existing,
  unrelated to this feature. **Gets its own record.**
- Renaming `health-core`. Filed with the above if the name keeps biting.
- Any change to `/flow`'s Pipeline Summary or the other Actions Performed consumers.
- Restoring `/build`'s design-doc on-ramp as a mandatory path — this design deliberately assumes
  the bypass will recur.

## Error handling

| Condition | Behavior |
|---|---|
| Not a git repository | Every git-derived probe renders `unknown`; CLI exits 0 |
| `--base` unresolvable | Error with a usage message rather than defaulting silently (`[IL-47]`) |
| `gh` unavailable | `forge.js` and `claims.js` render `unknown`, never "clean" |
| Test command unknown or times out | `suite.js` renders `unknown`, never "passing" |
| A probe throws | That probe's findings render `unknown`; siblings still report |
| Scratch-worktree teardown fails | Leave it; the `SessionStart` reaper collects it |

The CLI never exits non-zero for a *degraded read*, only for a *malformed invocation* — wrap-up must
render a partial Outstanding table rather than lose the report. **`unknown` is printed, never
omitted:** a missing fact that looks like an absent fact is the mechanism behind the original
"it landed" error.

A probe that could not run must never render as one that found nothing. This is wrap-up's own
established convention, not a new rule — Step 7.9 requires `audit not run` and forbids rendering it
as `no findings`, "a gate that never opened is indistinguishable from a clean CLAUDE.md unless the
summary says which one happened", and the matching anti-pattern row makes silence-vs-found-nothing
a named failure. Each probe therefore reports `ran / unknown ({reason})` alongside its findings, and
`[IL-105]` supplies the authoring test: name what this probe's red looks like before trusting its
green.

## Testing

Suites at `bin/lib/residue/tests/*.test.js`. **The glob is added to `package.json`'s test script in
the same change** — the enumerated list does not pick up new directories (`[IL-84]`).

Probe tests run against **frozen fixtures**, captured once and committed, never against live
repository state: a test asserting "this repo currently has N merged branches" is a scheduled
failure timed to the next merge (`[IL-80]`). Expectations are derived independently, not by calling
what the implementation calls (`[IL-62]`).

| Case | Asserts |
|---|---|
| Probe classification | each `kind` produced from its fixture; `remedy` assigned correctly |
| Scope resolution | blast-radius membership from a fixture history; full ISO 8601 boundaries (`[IL-47]`) |
| Degradation | missing `gh`, non-repo, unknown test command → `unknown`, never omitted or "clean" |
| Dedup wiring | a finding matching an open issue yields `skip`; a closed one yields `reopen` |
| Purity boundary | no pure health-core module requires `fs`, `child_process`, `./durable-state`, `./cache` |
| Disposition rule | a rendered `Outstanding` row without a disposition fails validation |

Each classification test is verified by reverting the classifier and confirming the test fails —
reading correct is not the same as discriminating.

## Files touched

**New**

```
bin/residue.js
bin/lib/residue/{scope,render}.js
bin/lib/residue/probes/{worktrees,branches,claims,forge,suite,release}.js
bin/lib/residue/tests/*.test.js + fixtures/
skills/_shared/scratch-worktree.md
skills/wrap-up/residue-sweep.md
```

**Modified**

| File | Change |
|---|---|
| `skills/wrap-up/SKILL.md` | Step 8.7 pointer + record-signal split — **382 bytes of headroom** (40,578 of 40,960) |
| `skills/wrap-up/summary-template.md` | `Outstanding` (with `Generate from:`) + `Routed`; Verdict line |
| `skills/wrap-up/cleanup-procedures.md` | record-signal split at its header-gated rows |
| `skills/tidy/scan-procedures.md` | Steps 4.5 / 4.7 / 4.8 become probe consumers |
| `bin/lib/hooks/pre-tool-use.js` | log resolved denies to `events.jsonl` |
| `bin/lib/health-core/` | header comment declaring the pure set (no code moves) |
| `package.json` | test glob for `bin/lib/residue/tests/` (`[IL-84]`) |
| `docs/plugin-structure.md`, `docs/skill-graph.md` | register the new module and `_shared` fragment |

## Risks

| Risk | Mitigation |
|---|---|
| `skills/wrap-up/SKILL.md` has 382 bytes of headroom; Step 8.7 plus the signal split may not fit | Measured before the edit. If it does not fit, an extraction lands first — this is a hard precondition, not a discovery |
| Re-running the suite is the slowest probe | Timeout plus a policy lever; never an unconditional run |
| First run on a repo with accumulated residue files a batch | Cap it, and **report the cap** — no silent truncation |
| Scratch worktree fails mid-remedy, leaving a dirty tree | The `SessionStart` reaper collects it; remedies are individually committed so partial progress survives |
| The `observed` judgment class degrades to whatever the model recalls | Named triggers in `residue-sweep.md`; the report marks judgment rows as such rather than implying completeness |
| Filing residue as records inflates the backlog | `dedup.decide` suppresses re-filing; `wontfix` is a standing decision |

## What this delivers, measured against the incident

Of the five items in the 6.65.0 report:

| Item | Outcome |
|---|---|
| Merged remote branch alive | Automatic — fixed in the scratch worktree |
| Stale worktrees | Automatic — already shipped in 6.65.0's reaper |
| `changelog-coverage` red | Detected by `suite.js`; fixed if mechanical, filed otherwise |
| PR #182 missing its release triple | Detected by `release.js`, filed — residue cannot fix another lane's PR |
| Unrelated notes filed into record #199 | **Not caught.** That is filing discipline, not residue |

Two automatic, one conditional (the changelog item is auto-fixed only when the remedy is
mechanical — a duplicate heading is; a judgment about which of two versions shipped is not), one
filed, one unaddressed.

That is a deliberately unflattering count. The honest claim is **not** "residue eliminates manual
work" — it is that every item acquires a disposition, so nothing again survives as an untracked
sentence in a transcript. The unaddressed one is stated rather than implied away.
