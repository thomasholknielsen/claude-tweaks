# GitHub Issues Integration — Architecture Review

**Date:** 2026-07-11
**Scope:** Every touchpoint where the plugin reads or writes GitHub issues/labels/refs — `bin/lib/issues/*`, `bin/lib/code-health/*`, `bin/lib/harness-health/*`, and the skills `capture`, `tidy`, `triage`, `flow`, `wrap-up`, `code-health`, `harness-health`, `help`, `init`, plus the shared contracts `_shared/issue-claims.md` and `_shared/github-pr-scan.md`.
**Method:** 10 subsystems mapped in parallel, each bug-hunted independently, plus 6 cross-cutting consistency checks (label taxonomy, release-site parity, doc drift, test coverage, fail-open posture, authorization boundary). Every high/medium finding was then adversarially re-verified by a separate agent instructed to try to refute it against the actual file content. 37 raw findings → 25 confirmed or plausible, 1 refuted as a reasonable design tradeoff, 11 lower-confidence findings passed through unverified.

See also: [`docs/diagrams/github-issues-lifecycle.html`](diagrams/github-issues-lifecycle.html) for the architecture overview this review is based on.

> **Superseded in part.** This is a dated report, kept as a record of what was found on 2026-07-11 — its findings are not re-verified against later code. Its `/claude-tweaks:wrap-up` citations in particular predate the wrap-up phase architecture, which replaced that skill's numbered steps with four phases plus a curation registry; read any `wrap-up/SKILL.md Step N` reference below as naming the step that existed then, not a current anchor.

## The throughline

Four systemic patterns explain most of what follows — worth fixing as a batch rather than one finding at a time:

1. **The `flow/from-code-health.md` removal (commit `8c5b323`) left loose threads.** `/flow`'s issue-sourced batch mode was correctly absorbed into `/claude-tweaks:triage`, but at least one piece of *behavior* — not just documentation — went missing in the move: the `status:in-progress` label-bootstrap command that used to live in that file was never ported into `triage/SKILL.md`'s replacement Step 2 (#16 below). README's changelog also still describes the deleted flags as live (#22).
2. **`triage/SKILL.md`'s Step 4 — the headless failure-retry path — is the least-audited release site in the system.** It's the one place that runs completely unattended after a real failure, and it independently has four separate gaps: it contradicts the fast-track downgrade rule (#8, high), never removes `status:in-progress` (#19), never checks claim ownership before deleting a ref (#20), and collapses four documented 422-outcomes into two (#23). Every other release site (`wrap-up/cleanup-procedures.md` Section E, `flow/multispec-review-console.md`) was checked pairwise and found in exact parity with each other — Step 4 is the outlier.
3. **Two of five `status:*` labels have no removal path.** `status:blocked` (#17, high) and `status:needs-review` (#18, low) are both add-only — an issue can reach a state with no in-tool way back into the triage flow.
4. **Label-description length is a recurring, unguarded bug class.** GitHub's 100-char cap already broke `status:in-progress` once (fixed in `54ab897`); two *new* labels (`code-health:architecture-depth`, `code-health:review-quality`) are over the cap today with no length check anywhere to catch a third occurrence (#15, high).

## High severity (5)

| # | Finding | File | Fix |
|---|---|---|---|
| 4 | **Cache never persists `wontfix`/`closed` status** — `cmdValidateFindings` only writes cache entries for file/reopen/remember; skip/suppress decisions never touch the cache. Breaks the documented gh-unavailable dedup fallback (a wontfix'd finding can be re-filed) and permanently zeroes the `wontfix:`/`closed:` status counters. | `bin/code-health.js:235` | Write `status: 'wontfix'` to the cache on a wontfix-driven suppress/skip before `continue`ing. |
| 8 | **Dispatch Step 4 item 5 contradicts the Failure-downgrade rule** — "leave the tier label in place" (sub-ceiling failure) is unconditional in the numbered procedure, directly conflicting with the adjacent rule that a `status:fast-track` failure must downgrade to `status:approved` on *any* failure. A literal reading lets a fast-track issue keep unsupervised auto-merge trust after a failed attempt — the exact scenario the Anti-Patterns table says the rule exists to prevent. | `skills/triage/SKILL.md:178` | Fold the downgrade check into item 5 itself as an explicit carve-out. |
| 10 | **Spec-file deletion (item 6) runs before claim release (item 8)**, destroying the `recon-was-parked:` frontmatter that Section E's parked-restoration check needs to read — and `/tidy`'s own backstop for this exact failure mode depends on the same now-deleted file, so the designed safety net is defeated by the same root cause. | `skills/wrap-up/cleanup-procedures.md:16` | Cache `recon-was-parked`/`recon-issue` before item 6 deletes the file, or preserve them in `specs/INDEX.md`'s removed-entry record. |
| 15 | **Two label descriptions exceed GitHub's 100-char cap** — `code-health:architecture-depth` (103 chars) and `code-health:review-quality` (109 chars) will 422 on first bootstrap, silently breaking issue filing for those two criteria. This is the exact bug class already fixed once for `status:in-progress`. | `bin/lib/code-health/criteria.js:14,28` | Shorten both descriptions under 100 chars; add a test asserting every `criteria.js` description stays under the cap. |
| 17 | **`status:blocked` is added at the retry ceiling but nothing ever removes it** — bare triage's untiered-issue filter doesn't exclude it, so a blocked issue can get re-tiered (gaining `status:approved` alongside `status:blocked`), after which dispatch's skip rule silently ignores it forever. No in-plugin recovery path exists. | `skills/triage/SKILL.md:176` | Strip `status:blocked` whenever Step 4 (bare triage) applies a new tier label; add a `/tidy` backstop flagging issues carrying both. |

## Medium severity (18)

| # | Finding | File |
|---|---|---|
| 1 | `isStale`'s "unparseable claimedAt → /tidy surfaces it" promise has no matching row in `/tidy`'s Step 4.7 table — a corrupted-but-JSON-valid claim silently reads as a normal live claim, kept forever. | `bin/lib/issues/claims.js:70` |
| 2 | Triage dispatch's on-422 procedure only names two branches (live/stale); the contract's four-row failure table's "unreadable claim" and "comments fold to released" rows aren't restated. | `skills/triage/SKILL.md:128` |
| 3 | `tier.js`'s risk/effort regexes only match `code-health:` labels — every harness-health issue silently gets a blank risk/effort and defaults to "approved," contradicting the design doc's claim of real per-issue differentiation for both issue kinds. | `bin/lib/issues/tier.js:7` |
| 5 | Label bootstrap in code-health Step 9 only covers the criterion label — `code-health`, `code-health:risk-*`, `code-health:effort-*` are attached with no existence/description check and get GitHub's blank auto-vivified description, despite risk-tier being the "primary triage tag" `/triage` reads directly. | `skills/code-health/SKILL.md:211` |
| 6 | harness-health's dedup never reopens a finding that matches a closed, non-wontfix issue (unlike code-health's parallel implementation) — a regressed finding is silently and permanently discarded, with no cache signal and no CI-gate equivalent. | `bin/lib/harness-health/dedup.js:21` |
| 7 | harness-health's `cmdValidateFindings` persists cache/cursor state with no try/catch — unlike code-health's explicitly-hardened equivalent — so a transient fs failure crashes the process and discards an already-computed payload. | `bin/harness-health.js:188` |
| 9 | The multi-terminal-parallel close-via-merge path double-stamps the `Fixes #N` keyword: `wrap-up`'s carrier-commit step has no exemption for the case `_shared/issue-claims.md` documents as not needing one, so `worktree-merge.md`'s later `--no-ff` merge adds a second, redundant closing reference. | `skills/wrap-up/cleanup-procedures.md:75` |
| 12 | Fast-track's direct `git merge` bypasses `/superpowers:finishing-a-development-branch` entirely, but Section E's release-reason mapping is documented as reading that skill's outcome — the bridge is inferable but never stated. | `skills/wrap-up/review-console.md:22` |
| 13 | The pending-authorization queue count doesn't exclude `status:blocked` issues, so an already-failed-out issue gets double-counted across two dashboard lines presented as disjoint (`/tidy` and `/help`, independently reimplemented with the identical gap). | `skills/_shared/github-pr-scan.md:67` |
| 14 | `help/SKILL.md`'s Relationship table omits `/claude-tweaks:triage` even though `triage/SKILL.md` claims a bidirectional relationship — violates this repo's own "Relationship tables must be bidirectional" convention. | `skills/help/SKILL.md:122` |
| 16 | `status:in-progress`'s bootstrap (`gh label create`) command no longer exists anywhere in the live skill tree — it lived in the deleted `flow/from-code-health.md` and was never ported to `triage/SKILL.md`'s replacement Step 2. On a fresh project where the label doesn't pre-exist, the headless claim step fails outright (`gh issue edit --add-label` doesn't auto-vivify). | `skills/triage/SKILL.md:127` |
| 19 | Triage dispatch's failure-release path never removes `status:in-progress` — every other release site does this unconditionally and explicitly; blast radius is bounded (the ref lock is authoritative, `/tidy` self-heals it), but it's the sole silent omission. | `skills/triage/SKILL.md:139` |
| 20 | Triage dispatch's failure-release never mentions the ownership check (`claim.runId === $RUN_ID`) before deleting the ref — the one release path most exposed to the race it guards against, since a full pipeline attempt elapses between claim and release. | `skills/triage/SKILL.md:143` |
| 21 | Internal contradiction: the Failure-downgrade rule vs. Step 4/5's "leave the tier label in place" (same root cause as #8, listed separately since it's the internal-consistency angle). | `skills/triage/SKILL.md:178` |
| 22 | `skills/flow/from-code-health.md` doesn't exist; README's v5.15.0 changelog still describes `--from-code-health`/`--quick-wins` as live `/flow` behavior, self-contradicting the current `/triage` description elsewhere in the same file. | `README.md:17` |
| 23 | Triage dispatch Step 2 has no literal claim code (unlike Steps 1/4 in the same file) and its prose collapses four documented 422 outcomes into two branches — the "comments fold to released" case could land in the wrong catch-all. | `skills/triage/SKILL.md:123` |
| 24 | No consumer of `_shared/issue-claims.md` (triage, wrap-up, multispec-review-console) shows the promised "gh missing/unauthenticated → hard gate" — the Detection Ladder that implements this exists but is wired only into `/tidy` and `/help`, never the claim consumers. | `skills/triage/SKILL.md:50` |
| 25 | `/tidy` Step 4.7's own backstop table has no row for a dangling claim ref whose release comment already reads "released" (DELETE failed after the comment succeeded) — the one case `/tidy` is specifically the designed backstop for. | `skills/tidy/scan-procedures.md:147` |

## Low severity / doc hygiene (13)

Two downgraded-on-verify items, plus 11 unverified-but-plausible findings — worth a look during a cleanup pass, not urgent:

- `wrap-up/SKILL.md` Step 10 says "6 cleanup items"; the canonical list has 8 (`skills/wrap-up/SKILL.md:309`).
- `status:needs-review` is granted but never removed, and permanently excluded from re-triage — no in-tool path back; the trivial workaround (a maintainer removing one label on GitHub) is arguably the intended security model, not a bypass of it (`skills/_shared/issue-claims.md:174`).
- `classifyBacklogIssue` derives "inbox" purely from the absence of `parked`, never checking issue state or the `backlog` label itself — safe only because the sole caller pre-filters (`bin/lib/issues/backlog.js:67`).
- The 2026-07-08 backlog design doc's "three release call sites" framing is superseded architecture, not a live defect — no action needed, optionally add a superseded-by pointer.
- harness-health skips label-bootstrap-with-description before filing, unlike every sibling skill (`skills/harness-health/SKILL.md:112`).
- `worktree-merge.md` hardcodes `main` in a diff-sort command while every other reference in the file says "the base branch" — breaks on `master`/`trunk` repos (`skills/flow/worktree-merge.md:32`).
- Tier-label-removal scoping to "released" issues is inconsistently worded between `cleanup-procedures.md` Section E and its `multispec-review-console.md` mirror (`skills/flow/multispec-review-console.md:125`).
- `parked`'s four bootstrap sites all say "same pattern as `backlog`" but none states a description string, unlike `backlog` itself — ends up with GitHub's blank auto-description (`skills/tidy/SKILL.md:112`).
- code-health/harness-health's base and tier labels are never bootstrapped with a description anywhere — a taxonomy-wide gap, not a new divergence (`skills/code-health/SKILL.md:225`).
- Test coverage across all 9 pure-logic modules is substantive and targeted — no gaps found, called out as a confirmed-clean result.
- `isStale`'s malformed (non-number, non-missing) `ttlHours` branch is untested — only the missing-key case is covered (`bin/lib/issues/claims.js:74`).
- code-health dedup's `finding.fingerprint` fallback branch has zero test coverage — likely dead/defensive code with no current producer (`bin/lib/code-health/dedup.js:24`).
- `/tidy` Step 4.7's skip condition covers only the gh-availability pre-check, not the documented "ref listing fails mid-scan" case, and says "silently" where the contract says "note it in the report" (`skills/tidy/scan-procedures.md:132`).

## Not a bug

**Retry-once semantics aren't implemented in code anywhere** (comment-post / claim-release failures) — the contract promises it in prose, but no consuming skill has an actual retry construct. Verification concluded this is a reasonable limitation of prose-executed skills rather than a defect: accept and note it explicitly, or add a literal retry wrapper at each site if it matters in practice.

## Suggested order of attack

1. **The four Step-4 gaps together** (#8, #19, #20, #21, #23) — one pass through `skills/triage/SKILL.md`'s dispatch failure-retry procedure fixes five findings at once, since they're all in the same ~40-line block.
2. **The two dead-end labels** (#17, #18) — a small, self-contained label-lifecycle fix.
3. **The high-severity singles** (#4, #10, #15) — independent, no shared blast radius.
4. **Doc drift** (#16, #22) — mechanical, low-risk, closes the loop on the `from-code-health.md` removal.
5. Everything else opportunistically.
