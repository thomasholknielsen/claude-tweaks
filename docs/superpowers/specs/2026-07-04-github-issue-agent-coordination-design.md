# GitHub Issue Agent Coordination — Design

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Scope:** Issue claiming/locking, close-the-loop automation, generic issue ingestion, and label-driven dispatch — implemented in four phases.

## Problem

The plugin has a producer → consumer pipeline for GitHub issues with a coordination gap in the middle:

- `/recon` **produces**: files deduplicated issues (`recon` + `recon:<severity>` + `recon:<criterion>` labels), embeds `<!-- recon-fingerprint: ... -->` markers, treats GitHub issue state as cross-run source of truth. `/routine create recon` runs it on a schedule in the cloud.
- `/flow --from-recon` **consumes**: pulls open `recon` issues → briefs → `/specify` → multi-spec batch, carrying `recon-issue: <n>` in spec frontmatter.
- Closing is human-only: the auto-mode contract classifies issue-close as a never-reversible network write, so the Review Console surfaces `gh issue close` commands for the user to run.

**Nothing claims an issue.** Two concurrent consumers — a cloud routine and a local session, two machines, or two collaborators' agents — pull the same open issues and double-build them. There is also no progress reflection back onto issues, and no entry point for human-filed (non-recon) issues.

The design must cover all three concurrency topologies: same-machine parallel agents, cross-machine (cloud routine + local sessions), and cross-account (multiple humans' agents on a shared repo).

## Core insight

GitHub has no lease primitive, but **ref creation is an atomic test-and-set**: creating `refs/claims/issue-<n>` via the git refs API fails with 422 if the ref exists. One arbiter (the GitHub API) covers all three topologies — local locks and assignee conventions each cover only one, so they are not load-bearing here.

Claims use a dedicated ref namespace (`refs/claims/*`, not `refs/heads/*`) because multi-spec `/flow` batches several issues into one shared worktree/branch — claims must be issue-granular regardless of how work batches, and must not clutter the branch list.

## Architecture

Two new artifacts, following the recon precedent (deterministic emit-only engine + skill-executed `gh` calls):

### 1. Module: `bin/lib/issues/`

Emit-only, no network calls, unit-tested under `bin/lib/issues/tests/` (run by `npm test`). All time-dependent functions take `now` as a parameter — no `Date.now()` inside logic.

```
claims.js
  claimPayload({owner, repo, issueNumber, sha, runId, sessionId, ttlHours, now})
      → { refArgs, commentBody }
  parseClaimMarker(commentBody) → claim | release | null   // never throws
  claimStatus(comments, now) → { claimed, claim, stale }   // folds claim/release markers in comment order
  releasePayload({owner, repo, issueNumber, runId, reason, now})
      → { refDeleteArgs, commentBody }

ingest.js   (Phase 3)
  issuesToBriefs({issues, label, minSeverity}) → briefs[]
      // generalization of recon's pull-issues; pullReconIssues becomes a thin wrapper
```

Skills execute the `gh` commands and pass results back; the module builds payloads and parses results. The engine never calls the network.

### 2. Contract: `skills/_shared/issue-claims.md`

Referenced by `/flow`, `/tidy`, `/wrap-up` (and later the dispatch routine), the way the subagent contract is referenced today. Defines:

**The lock.** `refs/claims/issue-<number>`, created via:

```bash
gh api repos/{owner}/{repo}/git/refs -f ref=refs/claims/issue-123 -f sha=<default-branch-HEAD>
```

Creation returns 201 (claimed) or 422 (already claimed). The sha is arbitrary — ref existence is the lock, not its target. Release deletes the ref:

```bash
gh api -X DELETE repos/{owner}/{repo}/git/refs/claims/issue-123
```

**The mirror.** A claim comment on the issue — machine-readable marker plus one human-readable line:

```
<!-- agent-claim: {"runId": "...", "sessionId": "...", "claimedAt": "<ISO>", "ttlHours": 72, "host": "..."} -->
Claimed by claude-tweaks run <runId> at <claimedAt> (TTL 72h).
```

Release posts a matching `<!-- agent-claim-release: {"runId": ..., "reason": ..., "releasedAt": ...} -->` comment. **The ref is authoritative; the comment is for humans and staleness metadata.** If the comment post fails after the ref succeeds, the claim stands — retry once, warn, proceed.

Identity fields: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`, or the routine's run id when headless); `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity `record-worktree` already stamps.

**TTL.** Default 72h from `claimedAt`. No heartbeat/renewal in v1 (runs last hours, not days); the contract reserves a renewal comment as a future extension. A claim past TTL is *stale*: sweepable by `/tidy`, and a new claimant may break it (delete ref → recreate → comment noting the takeover with the prior run-id). Two agents breaking the same stale claim self-resolves: after both delete, recreation is atomic again — exactly one gets 201.

**Release triggers.** Batch completion (`/wrap-up`), failure/abandon (`/flow` failure-card path), user declining the work at the Review Console. An interrupted session releases nothing — its claim ages out via TTL.

**Failure posture.** Ambiguity resolves to *don't work the issue* (fail-closed on claiming), but *never block the session* (a `gh` outage during release just logs; TTL is the backstop). Consistent with the hooks philosophy.

| Failure | Behavior |
|---|---|
| `gh` missing/unauthenticated | Existing hard gate (auto never silences a missing dependency) |
| Claim ref 422 with live claim | Skip issue, log `AUTO`, continue batch |
| Claim ref 422 with stale claim | Break: delete ref → recreate → takeover comment |
| Comment fails after ref succeeds | Ref is the lock — retry once, warn, proceed |
| Release fails | Log; TTL is the backstop |
| Ref listing fails in `/tidy` | Skip the sweep step, note it in the report |
| Any other `gh` failure during claim | Drop the brief, log, continue batch — partial batch is fine, hung batch is not |

**Non-consumers (documented boundary).** `/recon` does not claim (it files issues, doesn't work them — a concurrent-filing race costs at worst one duplicate issue, caught by dedup next run). Interactive single-spec `/build` does not claim (the user is present; collision is visible).

## Phase 1 — Claiming core

**`/flow --from-recon` — new Step 2.5 (claim before deriving).** After `pullReconIssues` produces briefs, before any `/specify` invocation, claim each issue in sequence:

1. Attempt ref creation. **201 → claimed**: post claim comment, log `AUTO` to `decisions.md`, keep the brief.
2. **422 → contested**: fetch issue comments, run `claimStatus()`. Live claim → drop the brief, log `AUTO` ("skipped #123 — claimed by run X, expires T"). Stale claim → break it and proceed.
3. Other `gh` failure → drop the brief, log, continue.

Claiming precedes `/specify` because the wasted work being prevented includes spec derivation, not just implementation. The Review Console gains a "claims held by this run" line.

**`/wrap-up` — release on closure.** For each spec with `recon-issue: <n>` frontmatter, run the release payload (delete ref + release comment stating outcome: merged / abandoned / deferred). Lands in `cleanup-procedures.md` alongside worktree teardown. `/flow` failure cards gain one line: on abandon, release held claims with reason `failed: <gate>`.

**`/tidy` — stale-claim sweep.** New scan step in `scan-procedures.md`: list claims via `gh api repos/{o}/{r}/git/matching-refs/claims/`, fetch each issue's `claimStatus()`, present stale claims in the standard batch table (recommended: release; override: keep). A claim ref whose issue is closed is always releasable (orphan). Deliberately in `/tidy`, not automated — breaking someone else's lock is a judgment call the sweep surfaces, not silently performs.

## Phase 2 — Close the loop

**Status: implemented in v5.4.0** (plus the addendum's five hardening items).

**Checkpoint comments** — three, not a running commentary:

- *claimed* (Phase 1 posts it)
- *blocked* — on a failure card: gate that failed, one-line reason (a stalled issue carries a resumable breadcrumb)
- *work-ready* — link to the PR or merged commit

Every comment is a network write: each logs to `decisions.md`. Allowed in `auto`, never silent.

**Close-via-merge.** For each spec carrying `recon-issue: <n>`, the closing keyword rides the user's merge action:

- **PR path:** `Fixes #123` lines in the PR body — GitHub closes the issues when the human merges.
- **Local-merge path** (worktree-merge handoff): the same `Fixes #123` lines go in the merge commit message — GitHub closes the issues when that commit reaches the default branch on push.

The agent never closes an issue; the user's merge/push does. This satisfies the auto-mode contract's never-reversible rule while eliminating the manual `gh issue close` step.

**Review Console change.** Replace "here are the `gh issue close` commands" with a mapping table ("spec 12 → closes #123 on merge"). Manual close commands surface only for issues resolved *without* a merge (wontfix, duplicates).

**`from-recon.md` anti-pattern update.** Rewrite the "Auto-closing the issue when its spec merges" row to draw the real line: closing keywords in merge artifacts are sanctioned (merge is the user's action); direct `gh issue close` by the agent stays forbidden.

### Phase 2 addendum — hardening items carried from Phase 1's final review (2026-07-04)

Phase 1's whole-branch review triaged these as defer-to-Phase-2; recorded here so they survive the worktree teardown:

**All five items implemented in v5.4.0.**

1. **Ownership check before ref delete** — Section E and console-decline releases delete `refs/claims/issue-N` unconditionally; a >TTL-stalled run that resumes can delete a successor's lock. Before deleting, confirm `claimStatus().claim.runId` is this run's; otherwise skip and log. (Related design characteristic: `claimStatus` release-folding is runId-agnostic.)
2. **Placeholder disambiguation** — `{N}` means spec number in release reasons but issue number in `refs/claims/issue-{N}` and `{N+1}` is a list index in failure cards; rename to `{spec}` / `{issue}` at the next touch of those files.
3. **`$TMP` vs `/tmp` alignment** — the contract's `node -e` snippets use an undefined `$TMP` (and `require()` of a relative path fails in `-e` mode); tidy Step 4.7 uses `/tmp`. Align on `/tmp` or define `TMP` in the snippet.
4. **Takeover-comment mechanics** — the takeover must "name the prior run id" but `claimPayload` emits a fixed body; state explicitly: append a human-readable line after the generated body, never modify the marker line.
5. **`parseClaimMarker` doc comment** — state kind-precedence (derived kind wins over marker JSON) explicitly above the function.

## Phase 3 — Generic ingestion

**Status: implemented in v5.5.0** (selectors, ingest module, issue form, freeform translation, current-branch carrier).

**New `/flow` selectors.** `--from-issues <n,...>` and `--from-label <label>` generalize the recon-only entry point. `--from-recon` becomes a preserved alias for `--from-label recon` with severity-filter semantics intact. `--min-severity` applies only when issues carry `recon:<severity>`-style labels; unlabeled issues default to no severity.

**Two body shapes**, detected by heading presence:

- *Form-shaped* (Current State / Deliverables / Acceptance Criteria headings present) → zero-translation brief, exactly the recon path.
- *Freeform* → an LLM translation step writes the brief from the issue prose. The translated brief is **staged** so the Review Console shows what the model inferred the issue meant — translation is a judgment call the user should see.

**Module.** `ingest.js` owns `issuesToBriefs()`; recon's `pullReconIssues` becomes a thin wrapper over it. The compatibility gate is literal: recon's existing test suite must stay green.

**Issue form template.** The plugin ships `.github/ISSUE_TEMPLATE/agent-task.yml` (form fields matching the three sections); `/init` offers to install it into the project so human-filed issues are pipeline-ready at filing time.

Claiming (Phase 1) applies to all ingested issues identically.

**Carried from Phase 2 review:** current-branch mode has no closing-keyword carrier — `--from-recon` in `current-branch` mode produces neither a merge commit nor a PR, so its issues never auto-close and Section E's outcome mapping has no input. Phase 3 must either gate `--from-recon` to worktree mode at `/flow` validation, or define the carrier (e.g. `Fixes #{issue}` lines in the final wrap-up commit, which closes on push when the current branch is the default branch). **Resolved in v5.5.0:** the carrier is defined — `Fixes #{issue}` lines in the final wrap-up commit message.

## Phase 4 — Dispatch + policy

**`agent:eligible` — the authorization gate.** Autonomous (headless/routine) runs only pick up issues carrying this label; interactive runs are unrestricted (the user is present to decide). Security rationale, stated explicitly in the contract doc: **applying a label requires triage permission, so the label is a maintainer's signature.** A drive-by issue from a stranger cannot opt itself into autonomous execution — this matters because "headless agent builds arbitrary issue content" is a prompt-injection surface. Default policy in `.claude-tweaks/policy.yml` (e.g. `issues.autonomous-eligibility: label agent:eligible | any`), overridable per run.

**`agent:go` — dispatch signal.** A routine template following recon's pattern: scheduled firing lists issues labelled `agent:go` + `agent:eligible`, claims them (Phase 1 machinery), runs `/flow` headless. Semantics: **label = standing request, claim = in flight.** The label persists until successful wrap-up (a failed run gets retried next firing once its claim ages out); the claim prevents double-dispatch meanwhile. Label removal on success is reversible and logged. Event-driven dispatch (webhooks/Actions) is out of scope — the plugin cannot receive webhooks; polling via routine is the honest version.

**`--from-milestone <m>`** — third selector, trivial once `--from-label` exists.

## Testing

Unit tests in `bin/lib/issues/tests/`:

- Claim payload shape; marker parse round-trip.
- `claimStatus()` folding claim/release/re-claim sequences in comment order.
- Staleness boundary cases (exactly at TTL, just under, just over).
- Garbage-input invariant (adapted from the hooks suite): `parseClaimMarker` never throws on arbitrary input.
- Ingest: form-shape detection; recon's existing suite as the regression gate for the `pullReconIssues` wrapper.

## Documentation ripple

- CLAUDE.md: structure table (`bin/lib/issues/`), `_shared` list (`issue-claims.md`), sub-file rows for flow/tidy/wrap-up.
- README + `/help` reference card + context-flow.
- Bidirectional Relationship rows: flow ↔ tidy ↔ wrap-up ↔ recon all reference the claims contract.
- Version: one minor bump per phase landing.

## Phase recap

| Phase | Deliverables |
|---|---|
| 1 — Claiming core | `bin/lib/issues/claims.js` + tests, `_shared/issue-claims.md`, `/flow` Step 2.5, `/wrap-up` release, `/tidy` sweep |
| 2 — Close the loop | Checkpoint comments, close-via-merge (PR + local-merge paths), Review Console mapping table, anti-pattern rewrite |
| 3 — Generic ingestion | `--from-issues` / `--from-label` selectors, `ingest.js` + `pullReconIssues` wrapper, freeform translation (staged), issue form template + `/init` install offer |
| 4 — Dispatch | `agent:eligible` policy gate, `agent:go` routine template, `--from-milestone` selector |

## Alternatives considered

- **Assignee/label as the claim** — most visible, but racy (check-then-set) and all of one user's agents share identity. Retained only as an optional human-facing mirror, never the lock.
- **Ordered comment claims** (lowest comment ID wins) — correct and branch-free, but chattier than the ref and needs read-after-write; the ref's 201/422 answer is simpler.
- **Work branch as the lock** (`refs/heads/agent/issue-N`) — atomic, but breaks under multi-spec batching (one branch, many issues) and clutters the branch list. The `refs/claims/*` namespace keeps the atomicity without the coupling.
- **Local run-dir locks** — race-free via `mkdir` atomicity but same-machine only; the real topology includes cloud routines. Not load-bearing once the remote ref arbitrates.
- **Dedicated `/issues` component skill** (Approach 2) — single choke point, but skill-invoking-skill indirection costs context on every run to wrap what are mostly one-liner `gh` calls. Can front the module later if a user-facing need appears, without rework.
- **Convention only, no code** (Approach 3) — fastest, but marker parsing and TTL arithmetic in prose steps is the drift-prone case, and forfeits tests on the piece where a race bug means silent double work.
- **Projects v2 / status-field mirroring** — every mirror is a consistency liability; issue state stays the source of truth, and claim + comments + linked PR is the full set worth writing.
