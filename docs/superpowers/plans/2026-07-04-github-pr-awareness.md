# GitHub PR Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:tidy` and `/claude-tweaks:help` consume GitHub PR and issue state — current-branch PR health in /help, repo-wide PR/recon-issue hygiene in /tidy — via one shared scan procedure.

**Architecture:** A new shared markdown file `skills/_shared/github-pr-scan.md` defines a fail-open detection ladder, two named scan scopes (`current-pr` for /help, `repo-wide` for /tidy), and an output contract with two new collection prefixes (`[pr]`, `[gh-issue]`). Each consumer skill gains one parallel scan unit (/help Stage 4.5, /tidy Step 4.8) whose dispatcher inlines the relevant scope section into the agent prompt. /tidy additionally gains three Action Vocabulary rows (Close (GitHub), Resolve thread, Capture) and auto-mode routing rows that stage all GitHub mutations at every aggressiveness level.

**Tech Stack:** Markdown skill files only. `gh` CLI (new optional dependency), GitHub GraphQL API via `gh api graphql`. No Node code, no test additions.

**Spec:** `docs/superpowers/specs/2026-07-04-github-pr-awareness-design.md`

## Global Constraints

- Markdown-only change — no new files under `bin/`, no `tests/` additions.
- No emojis in skill files; use `**(Recommended)**`-style bold for emphasis.
- Cross-references must be bidirectional — if A's Relationship table references B, B must reference A.
- Parallel-dispatch sites inline literal content into agent prompts (subagents cannot read sibling files); use the exact blockquote prefix `> **Parallel execution:**`.
- GitHub mutations (close PR/issue, resolve thread) are Stage at every aggressiveness level in auto mode; INBOX writes (Capture) likewise — INBOX/DEFERRED writes are on `_shared/auto-mode-contract.md`'s never-silenced list.
- Step numbering is fixed: tidy's new step is **4.8** (4.7 is the issue-claims sweep, landed in v5.3.0); help's new stage is **4.5**.
- Version bump happens at release time on `main` (minor — feature), NOT in this branch.
- Commit message style: `{Verb} {what} — {detail}`, no conventional-commit prefixes.
- All work happens on branch `github-pr-awareness`. Before each commit run `git branch --show-current` and confirm the output is `github-pr-awareness` — this checkout's branch can shift between sessions.

---

### Task 1: Create the shared scan procedure

**Files:**
- Create: `skills/_shared/github-pr-scan.md`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: section names later tasks reference verbatim — `## Detection Ladder (fail-open)`, `## Scope: current-pr`, `## Scope: repo-wide`, `## Output Contract` — and the collection prefixes `[pr]` / `[gh-issue]`. Tasks 2 and 4 tell dispatchers to inline these sections.

- [ ] **Step 1: Write the file**

Create `skills/_shared/github-pr-scan.md` with exactly this content:

````markdown
# GitHub PR Scan — Shared Procedure

Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).

## Detection Ladder (fail-open)

Run these checks in order before any scan. On the first failure, emit the single info row shown and stop — a skipped GitHub scan is normal, never a `BLOCKED` status, never a hard gate.

| # | Check | Command | On failure, emit Finding / Evidence |
|---|-------|---------|-------------------------------------|
| 1 | GitHub remote exists | `git -C "{REPO_ROOT}" remote get-url origin` output contains `github.com` | `GitHub scan skipped` / `no GitHub remote` |
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |
| 3 | gh authenticated | `gh auth status` exits 0 | `GitHub scan skipped` / `gh not authenticated` |

The skip row uses severity `info` and Path:Line `(github)`.

Individual `gh` command failures mid-scan (rate limit, network, transient API errors) degrade to a `DONE_WITH_CONCERNS` status line with whatever partial results exist — never `BLOCKED`.

`{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before the agent fires (see Working Directory Discipline in `_shared/subagent-output-contract.md`).

## Staleness Thresholds

Keyed on `updatedAt`. Same scale as /tidy's INBOX audit:

| Age since last update | Classification |
|----------------------|----------------|
| < 2 weeks | Fresh |
| 2-4 weeks | Review |
| > 4 weeks | Stale |

## Scope: `current-pr` (consumed by /help Stage 4.5)

Deep scan of the current branch's PR only, plus one cheap repo-wide count.

1. **PR lookup** — `gh pr view --json number,title,isDraft,reviewDecision,statusCheckRollup,closingIssuesReferences,url`. Non-zero exit means no PR for the current branch → emit one info row (`No open PR for current branch`), then run item 4 only.
2. **Unresolved review threads** — resolve `{owner}` and `{repo}` via `gh repo view --json owner,name -q '.owner.login + " " + .name'`, `{number}` from item 1, then run exactly:

   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved}}}}}' -f owner='{owner}' -f repo='{repo}' -F pr={number} --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length'
   ```

3. **CI checks** — `gh pr checks {number}` → count failing / pending / passing. Exit code 8 means checks are still pending; a non-zero exit that still lists checks is valid output, not a scan failure.
4. **Repo-wide stale count (maintenance signal only)** — `gh pr list --state open --json number,updatedAt` → total open PRs + count stale per the thresholds above. This row is routed to the caller's maintenance-signals rendering, not the Current PR dashboard section.

Emit `[pr]` rows per the Output Contract.

## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs and recon-labelled issues.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Recon issues** — `gh issue list --label recon --state open --json number,title,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to INBOX or run `/review` — local action |
| Recon issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
| Recon issue still valid | Suggest `/flow --from-recon` or Capture to INBOX |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract.

## Output Contract

Two collection prefixes, emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

Severity mapping (Template A Severity column):

| Signal | Severity |
|--------|----------|
| Failing CI or `CHANGES_REQUESTED` on the current branch's PR | high |
| Unresolved review threads | medium |
| Stale open PR (>4 weeks) | medium |
| Recon issue stale/superseded | medium |
| Recon issue still valid, awaiting pipeline | low |
| Fresh draft PR / no PR / scan skipped | info |
````

- [ ] **Step 2: Verify the file's section anchors**

Run: `grep -c "^## " "skills/_shared/github-pr-scan.md"`
Expected: `5`

Run: `grep -n "^## " skills/_shared/github-pr-scan.md`
Expected: exactly these headings — Detection Ladder (fail-open), Staleness Thresholds, Scope: `current-pr` (consumed by /help Stage 4.5), Scope: `repo-wide` (consumed by /tidy Step 4.8), Output Contract.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/_shared/github-pr-scan.md
git commit -m "Add _shared/github-pr-scan.md — shared GitHub PR/issue scan procedure for /tidy and /help"
```

---

### Task 2: /help status scan — Stage 4.5, maintenance signal, dashboard section

**Files:**
- Modify: `skills/help/status-scan.md`

**Interfaces:**
- Consumes: Task 1's section names (`current-pr` scope, Detection Ladder, Output Contract) and the `[pr]` prefix.
- Produces: the Stage 4.5 name and "Current PR" dashboard section that Task 3's priority order and Task 7's docs refer to.

- [ ] **Step 1: Update the parallel-dispatch blockquote**

In `skills/help/status-scan.md`, replace:

```markdown
> **Parallel execution:** Dispatch Stages 1-7 as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete.
```

with:

```markdown
> **Parallel execution:** Dispatch Stages 1-7 (including Stage 4.5) as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete.
```

And in the model-tier line of the same blockquote, replace:

```markdown
> **Model tier:** Fast (Haiku) — each stage scan is a mechanical read/grep over a single data source (INBOX, DEFERRED, design docs, specs, plans, registry). No synthesis at the per-stage level; the orchestrator assembles the dashboard.
```

with:

```markdown
> **Model tier:** Fast (Haiku) — each stage scan is a mechanical read/grep over a single data source (INBOX, DEFERRED, design docs, specs, plans, registry, current PR via gh). No synthesis at the per-stage level; the orchestrator assembles the dashboard.
```

- [ ] **Step 2: Insert Stage 4.5 between Stage 4 and Stage 5**

Immediately before the line `## Stage 5: Specs Awaiting Review`, insert:

```markdown
## Stage 4.5: Current PR (GitHub)

Scan per `_shared/github-pr-scan.md`, **`current-pr`** scope. The dispatcher inlines that file's Detection Ladder, `current-pr` scope section, and Output Contract into this agent's prompt — subagents cannot read sibling files.

- Detection ladder runs first — any failure emits a single info row (`GitHub scan skipped — {reason}`) and the stage completes normally (fail-open, never BLOCKED)
- Current branch's PR: review decision, failing/pending CI checks, unresolved review-thread count, linked issues
- Repo-wide stale-PR count (total open, count stale) — routed to Stage 7's maintenance signals, not the Current PR dashboard section
- No PR on the branch → single info row (`No open PR for current branch`); the dashboard omits the Current PR section

```

- [ ] **Step 3: Add the maintenance signal to Stage 7**

In the `## Stage 7: Maintenance Signals` list, after the line:

```markdown
- INBOX has 10+ items → suggest `/claude-tweaks:tidy`
```

insert:

```markdown
- Stage 4.5 reports stale open PRs (>4 weeks without updates) → suggest `/claude-tweaks:tidy` (Step 4.8 audits the PR backlog)
```

- [ ] **Step 4: Add the Current PR dashboard section**

In the `## Present Dashboard` template, immediately after the Pipeline table's last row:

```markdown
| Specs awaiting wrap-up | {N} | `/claude-tweaks:wrap-up {number}` |
```

and before `### Ready to Build (priority order)`, insert:

```markdown

### Current PR — #{N} {title}

*(Omit this section when Stage 4.5 reports no open PR or the GitHub scan was skipped.)*

| Signal | State | Action |
|--------|-------|--------|
| Review decision | {APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED} | {Address review threads / —} |
| CI checks | {N failing, M pending} | {Fix before merge / —} |
| Unresolved threads | {N} | {Address or resolve / —} |
| Linked issues | {#12, #14} | Closed on merge |
```

- [ ] **Step 5: Verify**

Run: `grep -n "Stage 4.5\|Current PR\|github-pr-scan" skills/help/status-scan.md`
Expected: matches in the dispatch blockquote (none required), the Stage 4.5 heading, the Stage 7 bullet, and the dashboard section — at least 4 lines total, including one `### Current PR — #{N} {title}`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/help/status-scan.md
git commit -m "Add Stage 4.5 current-PR scan to /help status scan — dashboard section + stale-PR maintenance signal"
```

---

### Task 3: /help SKILL.md — priority order, anti-pattern, relationship row

**Files:**
- Modify: `skills/help/SKILL.md`

**Interfaces:**
- Consumes: Stage 4.5 and the Current PR dashboard section from Task 2.
- Produces: the "Current PR blocked" priority-order item referenced by Task 7's README copy.

- [ ] **Step 1: Insert new priority #1 and renumber**

In `### Priority Order`, replace the full 10-item list:

```markdown
1. **Specs awaiting review** — review completed work before it goes stale
2. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
3. **Specs in progress** — finish what's started before starting new work
4. **Design docs unspecified** — specify before building (don't let designs go stale)
5. **Deferred items with met triggers** — promote before starting new work
6. **Specs ready to build** — pick the highest-priority spec with met prerequisites
7. **Promoted INBOX items** — items tagged `**Promoted:**` are ready for `/superpowers:brainstorming` (or `/claude-tweaks:challenge` first if they have baked-in assumptions). These have already been triaged and prioritized over unpromoted items.
8. **INBOX review** — if inbox is stale or has 10+ items, suggest `/claude-tweaks:tidy` before new brainstorming
9. **Challenge + Brainstorming** — if pipeline is empty and no promoted items exist, suggest promoting an INBOX item; if it has baked-in assumptions, run `/claude-tweaks:challenge` first, then `/superpowers:brainstorming`
10. **Nothing to do** — if everything is clean, say so
```

with this 11-item list:

```markdown
1. **Current PR blocked** — the current branch's open PR has failing CI, `CHANGES_REQUESTED`, or unresolved review threads (Stage 4.5). PR feedback is the most perishable work in the system — reviewer context decays fastest and it blocks in-flight work from merging. Recommend fixing CI, addressing threads, or resuming `/claude-tweaks:build` before anything below.
2. **Specs awaiting review** — review completed work before it goes stale
3. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
4. **Specs in progress** — finish what's started before starting new work
5. **Design docs unspecified** — specify before building (don't let designs go stale)
6. **Deferred items with met triggers** — promote before starting new work
7. **Specs ready to build** — pick the highest-priority spec with met prerequisites
8. **Promoted INBOX items** — items tagged `**Promoted:**` are ready for `/superpowers:brainstorming` (or `/claude-tweaks:challenge` first if they have baked-in assumptions). These have already been triaged and prioritized over unpromoted items.
9. **INBOX review** — if inbox is stale or has 10+ items, suggest `/claude-tweaks:tidy` before new brainstorming
10. **Challenge + Brainstorming** — if pipeline is empty and no promoted items exist, suggest promoting an INBOX item; if it has baked-in assumptions, run `/claude-tweaks:challenge` first, then `/superpowers:brainstorming`
11. **Nothing to do** — if everything is clean, say so
```

- [ ] **Step 2: Add the anti-pattern row**

In the `## Anti-Patterns` table, after the row:

```markdown
| Recommending new work when specs await review | Finish in-progress work first — stale reviews lose context |
```

insert:

```markdown
| Recommending new work while the current PR has unresolved feedback or failing checks | In-flight work rots fastest — reviewer context decays and merge conflicts accumulate. The pipeline picture is incomplete without PR state. |
```

- [ ] **Step 3: Add the relationship row**

In `## Relationship to Other Skills`, after the final row (the `_shared/auto-mode-contract.md` row), append:

```markdown
| `_shared/github-pr-scan.md` | Stage 4.5 scans the current branch's PR per this shared procedure (`current-pr` scope) — detection ladder, exact gh/GraphQL commands, output contract, severity mapping |
```

- [ ] **Step 4: Verify**

Run: `grep -n "Current PR blocked\|github-pr-scan\|unresolved feedback" skills/help/SKILL.md`
Expected: 3 lines — priority item 1, the anti-pattern row, the relationship row.

Run: `grep -c "^[0-9]*\. \*\*" skills/help/SKILL.md`
Expected: `11` (the renumbered priority list; if other numbered-bold lists exist in the file, instead visually confirm the Priority Order list runs 1-11 with no gaps).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/help/SKILL.md
git commit -m "Rank blocked current PR first in /help recommendations — new priority #1 + anti-pattern + shared-scan cross-reference"
```

---

### Task 4: /tidy scan procedures — Step 4.8 + collection routing

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: Task 1's `repo-wide` scope, findings table, and `[pr]` / `[gh-issue]` prefixes.
- Produces: Step 4.8 and its collect formats, referenced by Task 5's SKILL.md tables and Task 6's recon row.

- [ ] **Step 1: Insert Step 4.8 between Step 4.7 and Step 5**

Immediately before the line `## Step 5: Spec Sizing Review`, insert:

```markdown
## Step 4.8: Audit GitHub PRs and Issues

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope. The dispatcher inlines that file's Detection Ladder, `repo-wide` scope section (including its findings table), and Output Contract into this agent's prompt. The detection ladder makes this fail-open — skip with a single info row when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).

GitHub mutations recommended here (Close (GitHub), Resolve thread) execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

```

- [ ] **Step 2: Add the prefixes to Collection routing**

In the `## Collection routing` table, replace:

```markdown
| `[inbox]`, `[deferred]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]` | Actions table | Each row gets a pre-filled recommendation. |
```

with:

```markdown
| `[inbox]`, `[deferred]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]` | Actions table | Each row gets a pre-filled recommendation. |
```

- [ ] **Step 3: Verify**

Run: `grep -n "Step 4.8\|\[gh-issue\]" skills/tidy/scan-procedures.md`
Expected: the Step 4.8 heading, the two collect-format lines, and the routing-table row — at least 4 lines.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/tidy/scan-procedures.md
git commit -m "Add Step 4.8 GitHub PR/issue audit to /tidy scan procedures — repo-wide sweep via _shared/github-pr-scan.md"
```

---

### Task 5: /tidy SKILL.md — step bookkeeping, Action Vocabulary, routing, verification, meta tables

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: Step 4.8 from Task 4; action names Close (GitHub) / Resolve thread / Capture from the design.
- Produces: the Action Vocabulary rows and routing rows Task 7's docs summarize; the recon relationship wording Task 6 mirrors.

- [ ] **Step 1: Renumber the scan-step range (5 occurrences)**

Apply these exact replacements:

1. `## Steps 1-4.7: Scan Everything` → `## Steps 1-4.8: Scan Everything`
2. `> **No decisions during scanning.** Steps 1-4.7 silently collect all findings.` → `> **No decisions during scanning.** Steps 1-4.8 silently collect all findings.`
3. In the parallel-execution blockquote: `Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, and 4.7 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims).` → `Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues).`
4. In the scan-steps table: `| 5.5 (sequential, after Steps 2-4.7) |` → `| 5.5 (sequential, after Steps 2-4.8) |`
5. In the Relationship table's `_shared/subagent-output-contract.md` row: `Steps 1-4.7 dispatch parallel Task agents per this contract` → `Steps 1-4.8 dispatch parallel Task agents per this contract`

- [ ] **Step 2: Add the Step 4.8 row to the scan-steps table**

After the row:

```markdown
| 4.7 | `gh api git/matching-refs/claims/` + issue comments | `[claim]` |
```

insert:

```markdown
| 4.8 | `gh pr list` / `gh issue list --label recon` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
```

- [ ] **Step 3: Fix the unattended-execution step range**

In the `## Routine Configuration` section's **Unattended execution** paragraph, replace:

```markdown
If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1-4.6 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized.
```

with:

```markdown
If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1-4.8 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized.
```

(This also fixes a pre-existing off-by-one: the text said 1-4.6 after 4.7 landed.)

- [ ] **Step 4: Add three Action Vocabulary rows**

In the `## Action Vocabulary` table, after the row:

```markdown
| **Keep** | No action needed | None | No |
```

insert:

```markdown
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Add a structured entry to `specs/INBOX.md` referencing the PR/thread/issue URL | No — creates an INBOX entry |
```

- [ ] **Step 5: Add two aggressiveness-routing rows**

In the Step 6 auto-mode routing table, after the row:

```markdown
| **Add rule to CLAUDE.md** (cross-spec patterns) | Stage | Stage | Stage — CLAUDE.md never edited autonomously |
```

insert:

```markdown
| **Close (GitHub) / Resolve thread** (outward-facing GitHub mutations) | Stage | Stage | Stage — visible to collaborators and may trigger notifications; never auto-applied per the auto-mode contract's reversibility floor |
| **Capture** (PR/issue → INBOX entry) | Stage | Stage | Stage — INBOX writes are on the auto-mode contract's never-silenced list |
```

- [ ] **Step 6: Extend the Step 7.5 verification checklist**

In the Step 7.5 checklist template, after the line:

```markdown
- [x] Promoted: "{title}" — tagged in INBOX, still present
```

insert:

```markdown
- [x] Closed (GitHub): PR #{n} / issue #{n} — explanatory comment posted, state re-queried as `CLOSED` (`gh pr view {n} --json state` / `gh issue view {n} --json state`)
- [x] Resolved thread: PR #{n} — thread re-queried as `isResolved: true`
```

- [ ] **Step 7: Add two Anti-Patterns rows**

In the `## Anti-Patterns` table, after the row about `git branch -d` escalation, append:

```markdown
| Closing a PR/issue without a comment | Silent closes destroy the audit trail and confuse collaborators. Comment first, then close — the comment is the record of why. |
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |
```

- [ ] **Step 8: Update the recon relationship row and add the shared-file row**

Replace:

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues; `/tidy` can fold those issues into a backlog-hygiene pass alongside INBOX, deferred items, and specs. |
```

with:

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/flow --from-recon` or captured to INBOX. |
```

Then, after the final relationship row (the `_shared/issue-claims.md` row), append:

```markdown
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs and recon issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
```

- [ ] **Step 9: Verify**

Run: `grep -n "4.8\|Close (GitHub)\|Resolve thread\|github-pr-scan" skills/tidy/SKILL.md`
Expected: matches for the renumbered headings/blockquote/table rows, three Action Vocabulary + two routing rows, the Step 7.5 lines, and the two relationship-table changes.

Run: `grep -c "1-4\.7\|2-4\.7" skills/tidy/SKILL.md`
Expected: `0` (all five range mentions renumbered; `4.7` alone still appears for the issue-claims step — that is correct)

- [ ] **Step 10: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/tidy/SKILL.md
git commit -m "Wire Step 4.8 GitHub audit into /tidy SKILL.md — action vocabulary, always-stage routing for GitHub mutations, verification"
```

---

### Task 6: recon SKILL.md — bidirectional relationship update

**Files:**
- Modify: `skills/recon/SKILL.md`

**Interfaces:**
- Consumes: the Step 4.8 wording set in Task 5 Step 8 (keep the two sides consistent).
- Produces: nothing downstream.

- [ ] **Step 1: Update the tidy row**

In `skills/recon/SKILL.md`'s Relationship table, replace:

```markdown
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it folds into a hygiene pass. |
```

with:

```markdown
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `recon`-labelled issues in its hygiene pass — stale/superseded ones are closed (with comment) after batch approval; still-valid ones are suggested for `/flow --from-recon` or captured to INBOX. |
```

- [ ] **Step 2: Verify**

Run: `grep -n "Step 4.8" skills/recon/SKILL.md`
Expected: 1 line (the updated row).

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add skills/recon/SKILL.md
git commit -m "Update recon↔tidy relationship — Step 4.8 now implements the recon-issue hygiene fold"
```

---

### Task 7: Cross-cutting docs — CLAUDE.md, README, reference card

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`

**Interfaces:**
- Consumes: everything above (summarizes it for docs).
- Produces: nothing downstream.

- [ ] **Step 1: CLAUDE.md — `_shared` list in Structure**

In the `skills/_shared/*.md` line of the Structure block, replace:

```
issue-claims contract (refs/claims/* atomic lock))
```

with:

```
issue-claims contract (refs/claims/* atomic lock), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5))
```

- [ ] **Step 2: CLAUDE.md — Stack Dependencies row**

In the `| Dependencies |` row of the Stack table, replace:

```
git CLI (optional — required only for the statusline git segment)
```

with:

```
git CLI (optional — required only for the statusline git segment), gh CLI (optional — required for /recon issue filing and the GitHub PR/issue scans in /tidy and /help)
```

- [ ] **Step 3: CLAUDE.md — sub-files table rows for tidy and help**

Replace the tidy row's parenthetical:

```
cross-spec patterns, issue claims (Step 4.7))
```

with:

```
cross-spec patterns, issue claims (Step 4.7), GitHub PRs + recon issues (Step 4.8 via _shared/github-pr-scan.md))
```

Replace in the help row:

```
pipeline status scan parallel-dispatch procedure (Stages 1-7)
```

with:

```
pipeline status scan parallel-dispatch procedure (Stages 1-7, incl. Stage 4.5 current-PR scan)
```

- [ ] **Step 4: README.md — help and tidy descriptions**

Replace:

```markdown
**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs.
```

with:

```markdown
**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs. Surfaces the current branch's open PR (review decision, CI checks, unresolved threads) and ranks blocked-PR work first in recommendations.
```

Replace:

```markdown
**`/claude-tweaks:tidy`** — Batch backlog hygiene. Triages INBOX items, scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes.
```

with:

```markdown
**`/claude-tweaks:tidy`** — Batch backlog hygiene. Triages INBOX items, scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes. Also audits GitHub state — stale open PRs, recon-filed issues, addressed-but-unresolved review threads — with GitHub mutations (close, resolve) executing only after batch approval.
```

- [ ] **Step 5: reference-card.md — help and tidy rows**

In the Utility table, replace:

```markdown
| `/claude-tweaks:help` | Dashboard: commands + status + recommendations | `status`, `commands`, spec/topic |
```

with:

```markdown
| `/claude-tweaks:help` | Dashboard: commands + status (incl. current PR) + recommendations | `status`, `commands`, spec/topic |
```

and replace:

```markdown
| `/claude-tweaks:tidy` | Batch backlog hygiene | — |
```

with:

```markdown
| `/claude-tweaks:tidy` | Batch backlog hygiene (incl. GitHub PRs + recon issues) | — |
```

- [ ] **Step 6: Verify**

Run: `grep -rn "github-pr-scan" CLAUDE.md README.md skills/help/reference-card.md`
Expected: 2 matches, both in CLAUDE.md (the Structure `_shared` line and the tidy sub-files row). README and reference-card mention PR awareness in prose instead — confirm with:

Run: `grep -n "current PR\|GitHub PRs" README.md skills/help/reference-card.md`
Expected: at least 4 matches (2 per file).

Run: `npm test`
Expected: all existing tests pass (markdown-only change; this confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print: github-pr-awareness
git add CLAUDE.md README.md skills/help/reference-card.md
git commit -m "Document GitHub PR awareness — gh CLI dependency, _shared listing, README + reference-card mentions"
```

---

## Final Verification (after all tasks)

- [ ] `grep -rn "github-pr-scan" skills/ CLAUDE.md | wc -l` → at least 6 (help status-scan, help SKILL relationship, tidy scan-procedures, tidy SKILL relationship, CLAUDE.md ×2).
- [ ] Bidirectionality check: tidy SKILL.md references `_shared/github-pr-scan.md` and `/recon`; recon SKILL.md references tidy Step 4.8; help SKILL.md references `_shared/github-pr-scan.md`.
- [ ] Behavioral spot-check (this repo has a GitHub remote): run `/claude-tweaks:help` and confirm the dashboard renders a Current PR section (or the no-PR info row) and the recommendation respects the new #1; run `/claude-tweaks:tidy` and confirm the report contains `[pr]` / `[gh-issue]` rows or the skip row.
- [ ] Degradation spot-check: `GH_TOKEN= gh auth status` failing environment (or a repo without a GitHub remote) → both skills render the `GitHub scan skipped` info row and proceed.
