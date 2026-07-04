# GitHub PR Awareness for /tidy and /help — Design

**Date:** 2026-07-04
**Status:** Approved

## Problem

Neither `/claude-tweaks:tidy` nor `/claude-tweaks:help` sees GitHub state. `/help` can recommend starting new work while the current branch's open PR has failing CI and unresolved review threads; `/tidy` audits every local artifact but ignores stale open PRs and recon-filed issues. Tidy's Relationship table even claims "`/tidy` can fold recon-labelled GitHub issues into a backlog-hygiene pass" — a documented-but-unimplemented promise.

## Decisions

1. **Signals in scope (all four):** unresolved review threads on the current branch's PR, CI/check failures, linked GitHub issues (including recon-filed), and the repo-wide open-PR backlog.
2. **GitHub mutations are allowed with approval.** `/tidy`'s batch table may include GitHub actions (close stale PR, close superseded issue, resolve addressed threads), executed only after "apply all" approval — like worktree removals today. In auto mode, all GitHub mutations stage at every aggressiveness level (outward-facing; never auto-applied).
3. **Architecture: shared markdown scan procedure** (`skills/_shared/github-pr-scan.md`), not a Node helper. Consistent with how the plugin already runs git commands from markdown instructions; zero new Node surface. Rejected: per-skill inline duplication (drift), `bin/` helper (determinism not needed for a read-and-summarize scan).
4. **Help/tidy split:** `/help` checks only the current branch's PR in depth plus a cheap repo-wide stale-PR *count* (maintenance signal). `/tidy` does the full repo-wide sweep. Keeps `/help`'s default dashboard fast.

## Section A — `skills/_shared/github-pr-scan.md` (shared foundation)

Single source of truth for GitHub scanning. Three parts:

### 1. Detection ladder (fail-open)

Before any scan: GitHub remote exists (`git remote get-url origin` matches `github.com`)? `gh` on PATH? `gh auth status` exits 0? Any "no" → the scan returns one info-severity row (`GitHub scan skipped — {reason}`) and the caller proceeds normally. `gh` becomes an optional dependency, same posture as the statusline's optional git segment.

### 2. Two named scan scopes

- **`current-pr`** (consumed by `/help`):
  - `gh pr view --json number,title,isDraft,reviewDecision,statusCheckRollup,closingIssuesReferences,url` for the current branch
  - Unresolved review threads via the GraphQL `reviewThreads { isResolved }` query — the exact command written out literally in the file
  - `gh pr checks` for CI detail
  - One cheap repo-wide signal: `gh pr list --state open --json updatedAt` → stale-PR count, handed to the caller as a maintenance signal only
- **`repo-wide`** (consumed by `/tidy`):
  - Full `gh pr list` with per-PR staleness classification — same thresholds as INBOX (<2 weeks fresh, 2–4 weeks review, >4 weeks stale), keyed on `updatedAt`
  - `gh issue list --label recon --state open`
  - Unresolved-thread counts per open PR
  - Merged/closed PRs whose head branch still exists locally (corroborates tidy Step 4.5 branch cleanup)

### 3. Output contract

Two new collection prefixes — `[pr]` and `[gh-issue]` — emitted as standard Template A rows so both skills' existing dispatchers consume them unchanged. Severity mapping defined once: failing CI or `CHANGES_REQUESTED` on the current PR = high; unresolved threads = medium; stale open PR = medium; fresh draft = info.

Subagents cannot read sibling files, so dispatchers inline the relevant scope section into the agent prompt (the existing `scan-procedures.md` pattern).

## Section B — `/help` changes

- **`status-scan.md`: new Stage 4.5 — Current PR.** Parallel with the other stages, Fast tier, `current-pr` scope inlined. Returns `[pr]` rows: PR existence/state, review decision, unresolved thread count, CI status, linked issues, stale-PR count. No PR on the branch → single info row; dashboard omits the section.
- **Dashboard: new "Current PR" section** (only when a PR exists), between Pipeline and Ready to Build:

  ```markdown
  ### Current PR — #{N} {title}
  | Signal | State | Action |
  |--------|-------|--------|
  | Review decision | CHANGES_REQUESTED | Address review threads |
  | CI checks | 2 failing | Fix before merge |
  | Unresolved threads | 5 | Address or resolve |
  | Linked issues | #12, #14 | Closed on merge |
  ```

- **Recommendation priority order: new #1** — "Current PR blocked (failing CI, `CHANGES_REQUESTED`, or unresolved review threads)" above "Specs awaiting review". PR feedback is the most perishable work in the system; every existing priority assumes the current branch is healthy. Everything else shifts down one.
- **Maintenance signals (Stage 7 rendering):** "N open PRs, M stale → suggest `/claude-tweaks:tidy`", mirroring the INBOX-10+ signal.
- **Anti-Patterns: one new row** — recommending new work while the current PR has unresolved feedback / failing checks.
- **No new skill-to-skill relationship rows** (the `_shared/github-pr-scan.md` row comes via Section D); `commands`-only invocation already skips Section 2, so gh calls never run on the cheap path.

## Section C — `/tidy` changes

- **`scan-procedures.md`: new Step 4.8 — Audit GitHub PRs and Issues.** (4.7 is taken — the issue-claims sweep landed there in v5.3.0.) Parallel scan wave, Fast tier, `repo-wide` scope inlined. Findings:

  | Finding | Recommendation |
  |---------|---------------|
  | Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
  | Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
  | Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
  | Unresolved review thread addressed by a later commit (evidence: commit touching flagged lines) | Resolve thread |
  | Unresolved review thread not addressed | Capture to INBOX or run `/review` — local action |
  | Recon issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
  | Recon issue still valid | Suggest `/flow --from-recon` or capture to INBOX |

- **Action Vocabulary: three new rows**, each atomic:

  | Action | Execution |
  |--------|-----------|
  | **Close (GitHub)** | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close` / `gh issue close` |
  | **Resolve thread** | GraphQL `resolveReviewThread` mutation — only with commit evidence that the concern was addressed |
  | **Capture** | Add structured entry to `specs/INBOX.md` referencing the PR/thread URL — the local-followup escape hatch |

- **Aggressiveness routing (Step 6): one overriding rule** — all GitHub mutations (Close, Resolve thread) **Stage at every aggressiveness level** in auto mode; outward-facing actions are never-auto per the auto-mode contract's reversibility floor. Interactive mode: they sit in the batch table and execute on approval. `Capture` also stages at every level — it writes to `specs/INBOX.md`, and INBOX/DEFERRED writes are on the auto-mode contract's never-silenced list.
- **Step 7.5 verification:** GitHub actions verified by re-querying state (`gh pr view --json state`, etc.) before the checklist renders.
- **Bookkeeping in existing files:** add Step 4.8 to SKILL.md's scan-steps table and the parallel-dispatch list (Steps 1–4.8); add `[pr]` / `[gh-issue]` to `scan-procedures.md`'s Collection routing table (both route to the Actions table).
- **Anti-Patterns: two new rows** — closing a PR/issue without a comment (silent closes destroy the audit trail); resolving review threads without commit evidence (resolving unaddressed feedback is worse than leaving it open).

## Section D — Cross-cutting

- **CLAUDE.md:** add `github-pr-scan` to the `_shared` list in Structure; add `gh` CLI to Stack Dependencies as "(optional — required only for GitHub PR/issue scanning in /tidy and /help)".
- **Relationship tables (bidirectional rule):** update tidy↔recon wording from "can fold" to the implemented Step 4.7; tidy and help each gain a `_shared/github-pr-scan.md` row; recon's table gets the matching tidy update.
- **README + `/help` reference-card:** one-line mentions of PR-awareness in both skills' descriptions.
- **No new Node code, no new tests** — pure markdown change. Version bump: minor (feature) at release time.

## Error handling

All GitHub access is fail-open via the Section A detection ladder. Individual `gh` command failures inside a scan agent (rate limit, network) degrade to a `DONE_WITH_CONCERNS` status line with the partial results — never `BLOCKED`, never a hard gate.

## Testing

No Node code changes, so no `node --test` additions. Verification is behavioral: run `/help` and `/tidy` in a repo with an open PR (this one qualifies) and in a repo without `gh` auth, confirm the dashboard section, priority ordering, tidy report rows, and the skip-note degradation.
