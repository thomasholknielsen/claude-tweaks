---
tier: 1
status: not-started
progress: 0
blocked-by: []
surface: backend
---

# 13: Unified work record — shared contracts and label taxonomy

## Overview

Foundation spec for the unified-work-record redesign (major version). Establishes the shared vocabulary every other spec in this program cites: a new `skills/_shared/work-record.md` contract fragment (lifecycle spine, six axes, label taxonomy, permission matrix, projection-vs-truth invariant), the updated `_shared/label-bootstrap.md` LABELS_JSON, and the `_shared/issue-claims.md` updates (`bot:*` rename, group-claiming, grant-revocation vocabulary).

The redesign's core decisions, absorbed from the validated design: the GitHub issue (or its local-files twin) is the **one durable work record** — spec files become ephemeral build materializations; origin (who filed) and type (what kind of work) are separate axes; the authorization gate is origin-agnostic; authorization is two stackable human-granted labels (`auto:build`, `auto:merge`) whose absence is the default not-authorized state; machinery may only remove grants, never add them.

**Complexity:** Medium
**Estimated tasks:** 6

## Decision Rationale (program-level, absorbed from the design doc)

- **Issue-as-record over spec-file-as-record:** of the legacy spec template's 10 frontmatter fields, 4 existed only to stitch issue↔spec (`recon-issue`, `recon-fingerprint`, `recon-was-parked`, `code-health-effort`) and 4 re-implemented native GitHub machinery (`status`, `progress`, `blocked-by`, `tier`) — a shadow tracker. One record kills the stitching and collapses two ID spaces into one.
- **Two stackable grants over a 3-tier enum:** `tier:needs-review/approved/fast-track` compressed two independent booleans (may agents build? may results merge unreviewed?) plus a no-op value. Grants name exactly what is granted; failure handling becomes plain revocation.
- **Native Issue Types over category labels:** type is a standard GitHub concept; labels stay reserved for origin/scoring/stage/authorization/bot-state.
- **Vocabulary:** stages are **backlog** (absence of stage labels), **parked**, **ready** — the words "inbox"/"deferred" never name concepts. `bot:*` (not `status:*`) marks machinery-owned state. "Health skills," never "watchdogs."
- **Drain-mode dispatch rejected** (context rot): throughput = routine cadence × single-group firings.

## Non-Goals

- No skill workflow rewrites (specs 15–22 own their skills; this spec only creates/updates the shared fragments they cite).
- No changes to `bin/lib` (spec 14).
- No migration of this repo's own live issues, legacy backlog files, or CLAUDE.md flags — migration is a separate later plan.
- No removal of `_shared/health-state.md` or the claim-ref mechanics — the claim protocol's lock/TTL/takeover semantics are unchanged; only its label mirror and vocabulary update.

## Current State

- `skills/_shared/issue-claims.md` — claim protocol (refs/claims/*, TTL, takeover, release triggers, close-via-merge). Mirrors claims with the `status:in-progress` label; documents `status:blocked`.
- `skills/_shared/label-bootstrap.md` — canonical check-then-create loop; callers pass `LABELS_JSON` pairs.
- `skills/_shared/github-pr-scan.md` — Detection Ladder (remote exists, `gh` installed, authenticated+reachable) referenced by triage/tidy/help.
- `skills/_shared/auto-mode-contract.md` — mode states, decision precedence, never-silenced list (mentions backlog writes).
- No `skills/_shared/work-record.md` exists.

## Deliverables

- [ ] New `skills/_shared/work-record.md` — the canonical contract: lifecycle spine diagram (BACKLOG → READY → AUTHORIZED → BUILDING → CLOSED, with parked/not-planned exits and bot:blocked), the six-axes table (type / origin / scoring / stage / authorization / bot state), the 17-core-label taxonomy (+3 optional `priority:*`), the permission matrix (who adds/removes what), grant semantics (`auto:merge` additive on `auto:build`; alone-inert; machinery removes, never adds), and the named invariant **"labels are projection, not truth"** with its two worked examples (gate re-verifies body shape despite `ready`; dispatch re-verifies the claim ref despite `bot:in-progress`). The origin axis enumerates its four label values literally — `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` — and states the two no-label cases: a human filing directly on GitHub carries no `by:*` (absence = human-filed), and records created as side effects of other skills (e.g. `/wrap-up` leftovers) also carry no `by:*`, recording provenance as an `Origin: {context}` body line instead. The permission matrix carries a driver-conditional note: grants are enforceable only under the `github-issues` driver (GitHub RBAC + label audit trail); the `local-files` driver records grants as frontmatter for isomorphism but no headless consumer acts on them.
- [ ] `work-record.md` also defines: born-ready rule for health-skill records; decomposition rules (parent = design-summary body, only leaves get `ready`, tasks never become issues); the spec-shaped-body definition that "ready" asserts and the gate re-verifies — **deliberately structural-plus-minimal**: Current State / Deliverables / Acceptance Criteria sections present, each non-empty, no unresolved placeholder markers (`TBD`, `TODO`, `<!-- ambiguity:`); content *quality* is the shaper's and the human's job, and the contract says so explicitly; the `<!-- work-fingerprint: … -->` marker (with legacy `code-health-fingerprint` accepted by readers during migration); the canonical Type enum (`bug | feature | task`) and its two expressions (native Issue Types when `work-types: native`, `type:*` labels when `work-types: labels`); the `work-types` and `work-links` config keys (written by `/init`, read by every filing/shaping skill — `work-links: native | body-text` governs sub-issue/dependency linking the same way `work-types` governs Type).
- [ ] Update `skills/_shared/label-bootstrap.md` with the canonical full LABELS_JSON for the 17 core labels + 3 optional priority labels (each ≤100-char description), and a note that consumers bootstrap only the labels they are about to apply.
- [ ] Update `skills/_shared/issue-claims.md`: `status:in-progress`→`bot:in-progress`, `status:blocked`→`bot:blocked` throughout; add the group-claim rule (a dispatcher claims **all members of a file-overlap group** before starting any); add grant-revocation vocabulary to the release-triggers table (failure → revoke `auto:merge`; retry ceiling → remove `auto:*`, add `bot:blocked`); close-via-merge section unchanged in mechanics.
- [ ] Update `skills/_shared/auto-mode-contract.md`'s never-silenced list wording from backlog-entry writes to work-record creation (same protection, new vocabulary).
- [ ] Cross-reference stubs: `work-record.md` lists its consumers (health skills, capture, specify, triage, dispatch, flow, build, wrap-up, tidy, help, init); `issue-claims.md` and `label-bootstrap.md` gain a pointer to `work-record.md` as the taxonomy home.

## Acceptance Criteria

1. `skills/_shared/work-record.md` exists; `grep -c "auto:build\|auto:merge" skills/_shared/work-record.md` ≥ 4; contains the literal heading-level invariant text "labels are projection, not truth" (case-insensitive).
2. `grep -rn "status:in-progress\|status:blocked" skills/_shared/issue-claims.md` returns 0 matches; `grep -c "bot:in-progress" skills/_shared/issue-claims.md` ≥ 2.
3. `work-record.md` contains a markdown table with rows for all six axes and a permission-matrix table whose row set includes Human, Health skills, `/capture`, `/specify`, `/triage`, `/dispatch`, `/tidy`.
4. `label-bootstrap.md` contains a LABELS_JSON (or equivalent enumerated list) covering exactly: 4 `by:*`, 3 `risk:*`, 3 `effort:*`, `parked`, `ready`, `auto:build`, `auto:merge`, `bot:in-progress`, `bot:blocked`, `wontfix`, and 3 `priority:*` — and every description string is ≤100 characters.
5. `issue-claims.md` documents the group-claim rule in a dedicated paragraph or subsection (grep for "group" within the claim-acquisition section returns ≥1 hit).
6. The words "inbox" and "deferred" appear in none of the four touched `_shared` files as concept names (`grep -rin "inbox\|deferred" skills/_shared/work-record.md skills/_shared/issue-claims.md skills/_shared/label-bootstrap.md skills/_shared/auto-mode-contract.md` returns only hits inside literal legacy file paths like `specs/INBOX.md`, if any).

## Technical Approach

`work-record.md` is a contract fragment in the style of `issue-claims.md` — normative tables + short prose, no skill workflow steps. Copy the axes/taxonomy/matrix content from the design doc verbatim where possible (it was user-validated section by section). Grant semantics must state: the gate always grants `auto:build` when granting `auto:merge`; dispatch queries `auto:build` only; `auto:merge` alone is inert. Include the config-key table (`dispatch-retry-ceiling` 3, `automerge-max-lines` 40, `automerge-max-files` 2, `dispatch-pick-max-concurrent` 3, plus the init-written capability keys `work-types: native | labels` and `work-links: native | body-text`) here so specs 14–22 cite one home and one spelling — no per-skill alias names (`WORK_TYPES_NATIVE`-style env renames are forbidden; skills read the config keys by their literal names).

## Gotchas

- GitHub label descriptions cap at 100 chars — a prior incident shipped a 142-char description that GitHub rejected. AC 4 enforces the check per label.
- `issue-claims.md` is cited by many files; this spec updates only the shared file itself — consumers' stale references are each owning spec's job (15–22), with spec 23 as the final sweep. Do not chase cross-references here.
- Keep `_shared/` naming conventions: flat fragment files, no subdirectory.

## Key Files

- `skills/_shared/work-record.md` (new)
- `skills/_shared/issue-claims.md`
- `skills/_shared/label-bootstrap.md`
- `skills/_shared/auto-mode-contract.md`
