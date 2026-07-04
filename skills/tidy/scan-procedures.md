# Tidy — Scan Procedures

Per-step scan rules for `/claude-tweaks:tidy`. Each scan reads a single data source and collects findings in the `[type] item — detail — recommendation` format. The parallel dispatcher inlines the relevant section into each agent's prompt so agents have everything they need (subagents cannot read sibling files).

Step numbering matches `SKILL.md`. The order below mirrors execution order.

---

## Step 1: Audit the INBOX

Read `specs/INBOX.md` and classify each entry:

| Age | Classification | Default Recommendation |
|-----|---------------|----------------------|
| < 2 weeks | Fresh | Keep |
| 2-4 weeks | Review | Keep (unless clearly stale) |
| > 4 weeks | Stale | Delete or Promote |

→ Collect each as: `[inbox] {title} — {age} — {recommendation}`

## Step 1.5: Audit Deferred Work

Read `specs/DEFERRED.md` and classify each entry:

| Trigger Status | Default Recommendation |
|---------------|----------------------|
| Trigger met (referenced spec complete) | Promote to spec or merge |
| Trigger not met, < 4 weeks | Keep |
| Trigger not met, > 4 weeks | Re-evaluate or delete |
| No clear trigger | Move to INBOX or delete |

→ Collect each as: `[deferred] {title} — from spec {N} — {recommendation}`

## Step 2: Audit Existing Specs

Read `specs/INDEX.md` and all spec files. For each spec, do a lightweight scan:
- Search for key files, endpoints, tests mentioned in the spec
- Estimate completion: `not started`, `in progress (~X%)`, `mostly done (~90%+)`, `appears complete`

Flag specs that need attention:
- **Appears complete, not reviewed** → recommend `/claude-tweaks:review {N}`
- **Appears complete, reviewed but not wrapped up** → recommend `/claude-tweaks:wrap-up {N}`
- **In progress for 4+ weeks** → recommend resuming `/claude-tweaks:build` or re-evaluating scope
- **Unmet prerequisites that are themselves stale** → recommend re-prioritizing the blocking spec
- **Overlaps significantly with another spec** → recommend merging

Check dependency health: circular dependencies, specs blocked by unstarted specs, orphan specs.

→ Collect each as: `[spec] Spec {N}: {title} — {issue} — {recommendation}`
→ Collect each as: `[dependency] {issue} — {recommendation}`

## Step 3: Audit Design Docs and Briefs

Scan `docs/superpowers/specs/*-design.md` and `docs/plans/*-brief.md`.

**Design doc classification** — for each file in `docs/superpowers/specs/*-design.md`:

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

**Brief classification** — for each file in `docs/plans/*-brief.md`:

| Status | Recommendation |
|--------|---------------|
| Matching design doc exists | Keep |
| No matching design doc, specs exist | Delete |
| No matching design doc, no specs | Delete |
| Very old (4+ weeks), no design doc | Delete |

→ Collect each as: `[doc] {filename} — {recommendation}`

## Step 4: Audit Execution Plans

Scan `docs/superpowers/plans/` for execution plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`

## Step 4.5: Audit Git Worktrees and Build Branches

**Working-directory discipline:** every `git` command in this step (and in any dispatched parallel agent) MUST be anchored with `git -C "{REPO_ROOT}"` (or run after `cd "{REPO_ROOT}"`). `{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before any agent fires. See `_shared/git-discipline.md` and the Working Directory Discipline section in `_shared/subagent-output-contract.md`. CWD does not propagate reliably across parallel agents — without the anchor, branch deletions and worktree removals can land in the wrong checkout.

**Worktrees:** Run `git -C "{REPO_ROOT}" worktree list`. Any worktree beyond the main working tree is a candidate.

**Build branches:** Run `git -C "{REPO_ROOT}" branch --list "build/*"`.

| Status | Recommendation |
|--------|---------------|
| Related spec complete + changes merged | Remove/delete |
| Related spec in progress | Keep |
| No related spec found | Remove/delete (orphan) |
| Unmerged changes | Keep (flag for attention) |

→ Collect each as: `[git] {worktree/branch} — {recommendation}`

Use `git -C "{REPO_ROOT}" branch -d {branch}` (safe delete, refuses if unmerged). Use `git -C "{REPO_ROOT}" worktree remove {path}` for worktrees. If `-d` refuses, surface the branch as **`unmerged — manual review required`** rather than escalating to `-D` — destructive deletes are never autonomous in /tidy.

## Step 4.6: Audit Doc Registry

Scan `docs/REGISTRY.md` for health issues. Skip if the file doesn't exist.

| Issue | Recommendation |
|-------|---------------|
| Registry entry points to non-existent file | Delete entry |
| Doc file exists in `docs/` but not in registry | Add entry (with Auto-detect patterns) |
| Auto-detect pattern references non-existent directory | Update pattern |
| Registry tier doesn't match project complexity | Update tier (suggest `/init update`) — apply tier-detection signals from `detection-tables.md` in `/claude-tweaks:init` skill's directory |

→ Collect each as: `[registry] {issue} — {recommendation}`

## Step 4.7: Audit Issue Claims

Skip silently when `gh` is unavailable or the repo has no GitHub remote. See
`_shared/issue-claims.md` for the protocol.

List claim refs; for each, fetch the issue's state and comments, and fold through
`claimStatus`:

```bash
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
# for each refs/claims/issue-<n>:
gh issue view <n> --json state -q .state
gh api "repos/{owner}/{repo}/issues/<n>/comments?per_page=100" > /tmp/tidy-claims-<n>.json
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" /tmp/tidy-claims-<n>.json
```

| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Claim stale (`stale: true`) | Release (crashed or abandoned run) |
| Ref exists, no readable claim marker, issue open | Manual review (never break a claim you cannot read) |
| Claim live, issue open | Keep |

Releasing = delete the ref + post the release comment generated by `releasePayload`
(reason `swept: stale claim` or `swept: issue closed`). Releases execute only after Step 6
batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] refs/claims/issue-{n} — {status} — {recommendation}`

## Step 4.8: Audit GitHub PRs and Issues

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope. The dispatcher inlines that file's Detection Ladder, `repo-wide` scope section (including its findings table), and Output Contract into this agent's prompt. The detection ladder makes this fail-open — skip with a single info row when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).

GitHub mutations recommended here (Close (GitHub), Resolve thread) execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

## Step 5: Spec Sizing Review

For specs not yet built, check sizing:

- **Too large** (10+ tasks): recommend splitting
- **Too small** (1-2 trivial tasks): recommend merging with a related spec
- **Too vague** (no concrete deliverables or acceptance criteria): recommend re-specifying

## Step 5.5: Cross-Spec Pattern Detection

Scan recent git history for recurring findings across review summaries and wrap-up reflections. Patterns that appear in 2+ specs signal systemic issues worth addressing at the project level rather than per-spec.

### How to scan

1. Search recent commits for review and wrap-up artifacts:
   - `git log --all --oneline --grep="review" --grep="wrap-up" --since="4 weeks ago"` (or check `docs/plans/*-review-summary*` and recent wrap-up commits)
2. Read the review summaries and wrap-up reflections referenced in those commits
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality)

### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own spec — it's not going away |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`

### Project Health Summary

When 3+ specs have been completed (check INDEX.md for completed entries or git log for wrap-up commits), include a brief project health summary in the tidy report:

1. **Velocity** — count completed specs vs. in-progress vs. not-started
2. **Recurring themes** — conventions worth codifying if they appear in 3+ specs' wrap-up reflections
3. **Convention candidates** — suggest: "This pattern shows up in {N} specs — consider adding to CLAUDE.md: `{pattern}`"

→ Collect each as: `[health] {observation} — {recommendation}`

Patterns and health observations are informational — they surface systemic issues the user may want to address. They appear in the tidy report alongside actionable items but don't require immediate action.

---

## Collection routing

| Collection prefix | Renders in Step 6 table | Notes |
|---|---|---|
| `[inbox]`, `[deferred]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]` | Actions table | Each row gets a pre-filled recommendation. |
| `[pattern]` | Cross-Spec Patterns table | Informational; presented separately. |
| `[health]` | Summary section | Project-level observations. |
