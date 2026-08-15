---
record: 463
origin: human
risk: high
size: medium
ceremony: standard
grants: []
blocked-by: [333]
surface: backend
---
# 463: Unify dispatch/flow run identity: dispatch mints the run dir, flow adopts it, CLAIM_RUN_ID retires

Surface: backend

## Overview

Dispatch and flow currently run under two different identities for the same claimed pipeline
run: dispatch claims a group under its own standalone run id (`CLAIM_RUN_ID`), while flow
creates a *separate*, later `PIPELINE_RUN_DIR` for the actual pipeline execution. `CLAIM_RUN_ID`
exists purely to bridge that gap, threaded explicitly through dispatch Step 5, both
`task-prompt.md` templates, `two-call-gate.md`, wrap-up's Section E release check, and
`_shared/issue-claims.md`'s Identity section. The run-directory handoff between dispatch's two
Task calls compounds this: the first call states a `MANIFEST: <path>` line in its own prose
report, the dispatching session parses that string, validates it anchors under the main
checkout's `.claude-tweaks/pipelines/`, and reconstructs it by hand when validation fails
(`two-call-gate.md` §§1, 3, 4) — failing the whole group with reason `manifest-unresolvable` on
anything malformed.

This work unit unifies the two identities into one: dispatch mints an empty, anchored run
directory *before* claiming, both Task calls receive that same `PIPELINE_RUN_DIR` directly
(never a parsed report), and the claim's own identity becomes that directory's basename. Nothing
is parsed out of an agent's self-report anymore.

**Complexity:** High
**Estimated tasks:** 7

## Non-Goals

- The claim read-classify-write procedure itself (`_shared/issue-claims.md`, `classifyClaimBlob`,
  the gh/MCP transport split) is unchanged — this unit changes what identity the claim is written
  under, not how the write happens.
- Claim *acquisition* stays in dispatch Step 4 for this work unit — dispatch still writes the
  claim here, just under the new minted identity. Moving the write itself into flow is a separate,
  dependent work unit (blocked by this one).
- The two-Task-call split, the `DONE`/`DONE_WITH_CONCERNS` + `OUTCOME: build-test-ok` gate
  condition between calls, and settle running inside the agent that hits the terminal outcome are
  unchanged.
- `#226` and `#434` (both about the ownership-check / template ambiguity this unit removes) are
  not directly fixed here — re-verify their exact wording against the post-change templates once
  this lands; they likely dissolve as a side effect but are not closed automatically.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #333 | Extract sub-files from flow/SKILL.md and dispatch/SKILL.md — both sit bytes under the 40 KB ceiling | merged (#465) — headroom created, this unit is now unblocked |

## Current State

- Claim identity: `skills/dispatch/SKILL.md` Step 4 writes `claimPayload({..., runId: $RUN_ID, ...})` where `$RUN_ID` is dispatch's own standalone run directory basename (resolved via `_shared/pipeline-run-dir.md`'s standalone-auto allowlist, Step 1 of `dispatch/SKILL.md`).
- Run-directory handoff: `skills/dispatch/two-call-gate.md` §1 captures a `MANIFEST:` path from the first Task call's prose report; §3 validates it anchors under `$RUN_ROOT/.claude-tweaks/pipelines/` and substitutes it as `PIPELINE_RUN_DIR="{run-dir}"` on the *second* call only; §4 defines the `manifest-unresolvable` failure mode when the path can't be derived.
- Dual passing: both Task call templates in `skills/dispatch/task-prompt.md` currently pass `CLAIM_RUN_ID="{RUN_ID}"` inline; the second call additionally receives `PIPELINE_RUN_DIR="{run-dir}"` per the gate above. The first call receives neither `PIPELINE_RUN_DIR` value.
- Adopt logic: `skills/flow/SKILL.md` Step 3's resolution table has exactly two branches today — `PIPELINE_RUN_DIR` set, anchored, and already carrying `config.yml` → adopt as-is; anything else → create fresh (including a set-but-empty directory, which currently falls through to create-fresh and ignores the handed path).
- Ownership check: wrap-up's Section E (`skills/wrap-up/cleanup-procedures.md`) compares `claim.runId` against the value dispatch threaded in as `CLAIM_RUN_ID`, not against flow's own `$PIPELINE_RUN_DIR`.
- Accepted-position note: `skills/dispatch/design-notes.md`'s "Why dispatch's own run dir is never a dispatched group's run dir" section documents the current dual-identity design as deliberate — this note becomes stale once this unit ships and must be deleted, not left describing a design that no longer exists.

## Deliverables

- [ ] Dispatch Step 4 mints an empty, anchored run directory *before* writing the claim: derive `$RUN_ROOT` via `_shared/pipeline-run-dir.md`'s Anchoring section (`git rev-parse --git-common-dir`), create `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{slug}/` where `{slug}` follows the same convention `/flow` already uses for its own run dirs (derived from the group's representative record), and log one line to dispatch's own `decisions.md`: group → minted path.
- [ ] Dispatch Step 4's claim write now uses `basename({minted-run-dir})` as `claimPayload`'s `runId` value, in place of dispatch's own standalone `$RUN_ID`.
- [ ] Flow Step 3 gains a new middle branch in its resolution table: `PIPELINE_RUN_DIR` set, anchored, and **empty** (no `config.yml`) → adopt the directory's identity, then run the Manifesto *into* it exactly as the create-fresh path does (write `config.yml`, initialize `decisions.md`). The existing "set + has `config.yml`" and "unset/unanchored/missing" branches are unchanged.
- [ ] Both templates in `skills/dispatch/task-prompt.md` change from passing `CLAIM_RUN_ID="{RUN_ID}"` to passing `PIPELINE_RUN_DIR="{minted-run-dir}"` — including the *first* call, which today receives neither value. `two-call-gate.md` §1 (MANIFEST capture), §3 (validate/rebuild), and §4 (`manifest-unresolvable` failure mode) are deleted; the `MANIFEST:` line may stay in the first call's report as a human-readable trace, but nothing downstream parses it — the gate between calls reduces to reading the status line and `OUTCOME`.
- [ ] `CLAIM_RUN_ID` is deleted from every consumer: `skills/dispatch/SKILL.md` Step 5, both templates in `skills/dispatch/task-prompt.md`, `skills/flow/SKILL.md`'s argument table, and `skills/_shared/issue-claims.md`'s Identity section. Wrap-up's Section E (`skills/wrap-up/cleanup-procedures.md`) ownership check changes to `claim.runId === basename($PIPELINE_RUN_DIR)`.
- [ ] `skills/dispatch/design-notes.md`'s "Why dispatch's own run dir is never a dispatched group's run dir" section is deleted — the premise it documents no longer holds.
- [ ] The reconciler's run-dir archive sweep (`bin/lib/reconcile`) gains one new archive criterion: a minted run directory that is both **empty** (no `config.yml`) and **older than the standard run-dir TTL** — the orphan case introduced by this unit when a first Task call dies after dispatch mints the directory but before flow adopts it. This is an addition to the sweep's existing criteria, not a replacement.

## Acceptance Criteria

1. A fresh `/claude-tweaks:dispatch #N` run mints an anchored, empty run directory in Step 4 before any claim write, verified by inspecting `decisions.md` for the logged group→path line before the claim comment is posted.
2. `grep -rn "CLAIM_RUN_ID" skills/` returns zero matches anywhere in the `dispatch/`, `flow/`, and `_shared/` skill directories.
3. `grep -n "manifest-unresolvable" skills/dispatch/two-call-gate.md` returns zero matches (the whole failure mode is gone, not just renamed).
4. Flow invoked with `PIPELINE_RUN_DIR` set to a freshly minted, empty, correctly-anchored directory initializes `config.yml` and `decisions.md` inside it rather than falling through to create-fresh in a new location — verified by checking the initialized files land at the handed path, not a second directory.
5. Wrap-up's Section E release check for a dispatched run passes when `claim.runId` equals `basename($PIPELINE_RUN_DIR)` and correctly reports contested ownership when it doesn't — verified against both a same-session release and a claim held by a different run id.
6. A dispatched group's first Task call, run against this change, produces a report that a second Task call can be dispatched against using only the pre-minted `PIPELINE_RUN_DIR` value (no MANIFEST line is read by the dispatching session to construct that value).
7. An empty, minted run directory older than the TTL is picked up and archived by the reconciler's existing sweep on its next run — verified by seeding an empty directory with a backdated mtime and confirming it's archived rather than left in place.

## Technical Approach

The unification has two halves that must ship together: dispatch's minting (the "expand" side —
add the new handoff) and the consumer migration (the "contract" side — delete `CLAIM_RUN_ID` and
the MANIFEST-parsing machinery). They cannot be split into separate work units because a
partially-applied state — minting without migrating consumers, or migrating consumers without
minting — leaves the pipeline in a genuinely broken intermediate state, not a safely-reversible
one. This is why "Estimated tasks: 7" spans four skill directories plus one `bin/lib` module in
one unit rather than being further decomposed.

### Key Files

- `skills/dispatch/SKILL.md` — Step 4: add run-dir minting before the claim write; claim write's `runId` value changes.
- `skills/dispatch/task-prompt.md` — both Task call templates: swap `CLAIM_RUN_ID` for `PIPELINE_RUN_DIR`.
- `skills/dispatch/two-call-gate.md` — delete §1 (MANIFEST capture), §3 (validate/rebuild), §4 (`manifest-unresolvable`); the gate-condition logic (status + `OUTCOME`) stays.
- `skills/dispatch/design-notes.md` — delete the "Why dispatch's own run dir is never a dispatched group's run dir" section.
- `skills/flow/SKILL.md` — Step 3: add the adopt-and-initialize branch; argument table: remove `CLAIM_RUN_ID` references.
- `skills/_shared/issue-claims.md` — Identity section: update to describe `basename($PIPELINE_RUN_DIR)` as the claim's `runId` source, remove `CLAIM_RUN_ID` references.
- `skills/wrap-up/cleanup-procedures.md` — Section E: ownership check compares against `basename($PIPELINE_RUN_DIR)`.
- `bin/lib/reconcile` — run-dir archive sweep: add the empty-and-older-than-TTL criterion for orphaned minted directories.

## Gotchas

- **Don't split expand and contract here.** Unlike the usual expand-contract discipline this
  project follows for shared contracts, the `task-prompt.md` template swap (`CLAIM_RUN_ID` →
  `PIPELINE_RUN_DIR`) is a single atomic change at the template level, not an add-then-remove
  two-step — `CLAIM_RUN_ID`'s only job was this same handoff, so there is no genuine "old
  consumer still reading the old value" state to migrate through gradually.
- **Reversibility note for scoring:** this touches the ownership-check correctness path used by
  every dispatched build — a mistake here can cause a claim to release incorrectly or never
  release. Treat any deviation from the Acceptance Criteria above as a hard stop, not a "close
  enough."
- **The `two-call-gate.md` file survives, thinner.** Only §§1/3/4 are deleted — §2 (the gate
  condition: `DONE`/`DONE_WITH_CONCERNS` + `OUTCOME: build-test-ok`) and §5 (the terminal path
  when the first call fails) are unrelated to identity and stay as-is.
- **`skills/dispatch/design-notes.md` is cited elsewhere** — `skills/dispatch/SKILL.md`'s "When
  to Use" section, its Concurrency note, and its Component-Skill Contract all reference this
  file. Deleting one section from it (not the whole file) is sufficient; verify no other section
  references the deleted one before finishing.


<!-- work-fingerprint: dispatch-flow-identity-unification:unify-dispatch-flow-run-identity-dispatch-mints-the-run-dir -->
