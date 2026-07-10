# Help — Pipeline Status Scan

Stage-by-stage scan procedure run by `/claude-tweaks:help` (default invocation, or `status` argument). Lazy-loaded from `SKILL.md` Section 2.

> **Parallel execution:** Dispatch Stages 1-7 (including Stage 4.5) as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input (scope + path + literal output template, no conversation), status line first (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`), then Template A.
>
> **Model tier:** Fast (Haiku) — each stage scan is a mechanical read/grep over a single data source (INBOX, DEFERRED, design docs, specs, plans, registry, current PR via gh). No synthesis at the per-stage level; the orchestrator assembles the dashboard.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | medium | specs/INBOX.md | 14 items, 3 stale | lines 12, 28, 41 are 4+ weeks old |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
> ```

**Dispatcher column mapping (status-scan use):** Severity = recommendation urgency (`info` for nothing-to-do, `low` for routine, `medium` for needs-attention, `high` for blocking). Path:Line = the artifact (`specs/INBOX.md:42`, `docs/journeys/checkout.md`, etc.). Finding = the count or flag (`14 items, 3 stale`). Evidence = the specific items or signals.

## Stage 1: INBOX (`specs/INBOX.md`)

- Count total items
- Flag stale items (> 4 weeks old)
- Flag items tagged as `**Promoted:**` — these are awaiting `/superpowers:brainstorming` and should appear as brainstorm candidates in the recommendation
- Identify items marked as related to existing specs
- Flag items with baked-in assumptions (solution-oriented phrasing) → candidates for `/claude-tweaks:challenge`

## Stage 1.5: Deferred Work (`specs/DEFERRED.md`)

- Count total deferred items
- Check triggers against current state:
  - Completed specs referenced in triggers → these items are now actionable
  - In-progress specs referenced → flag for awareness
- Flag items with no clear trigger (missing context)
- Flag items older than 4 weeks with unmet triggers

## Stage 2: Design Docs (`docs/superpowers/specs/*-design.md`)

- Find design docs that still exist (full decomposition deletes the doc, so any surviving doc is either un-decomposed or partially decomposed)
- For each surviving doc, check whether it has `## Phase N:` headings:
  - No phase headings → never decomposed, waiting for `/claude-tweaks:specify`
  - Has phase headings but at least one lacks a matching `## Phase N: Specified` marker → partially decomposed, the unmarked phases are still waiting for `/claude-tweaks:specify`
- These are brainstorming outputs waiting for `/claude-tweaks:specify`

## Stage 3: Specs Ready to Build (`specs/INDEX.md` + `specs/*.md`)

- Find specs where all prerequisites are met (blocking specs are complete)
- Check YAML frontmatter for `status: not-started` with empty or satisfied `blocked-by`
- Check which tier they're in (lower tier = higher priority)
- Check if a plan already exists in `docs/plans/` (ready for immediate `/claude-tweaks:build`)
- **Implicit dependency check:** Extract `Key Files` from each ready spec and each in-progress (or other not-started) spec. If a ready spec shares Key Files with any non-completed spec, flag it in the "Needs Attention" table — building it now risks merge conflicts or duplicated work. This is the same algorithm that `/claude-tweaks:specify` runs at spec creation time, re-run here to catch conflicts from specs that started building since then.

## Stage 4: Specs In Progress

- Check recent git commits for spec references
- Check frontmatter for `status: in-progress`
- These may need `/claude-tweaks:build` resumed or `/claude-tweaks:review` run

## Stage 4.5: Current PR (GitHub)

Scan per `_shared/github-pr-scan.md`, **`current-pr`** scope. The dispatcher inlines that file's Detection Ladder, `current-pr` scope section, and Output Contract into this agent's prompt — subagents cannot read sibling files.

- Detection ladder runs first — any failure emits a single info row (`GitHub scan skipped — {reason}`) and the stage completes normally (fail-open, never BLOCKED)
- Current branch's PR: review decision, failing/pending CI checks, unresolved review-thread count, linked issues
- Repo-wide stale-PR count (total open, count stale) — routed to Stage 7's maintenance signals, not the Current PR dashboard section
- No PR on the branch → single info row (`No open PR for current branch`); the dashboard omits the Current PR section

## Stage 4.6: Triage Queue (GitHub)

Cheap counts only — detail stays `/claude-tweaks:triage`'s and `/tidy`'s job,
not `/help`'s. Skip silently (same fail-open detection ladder as Stage 4.5)
when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

```bash
gh issue list --label code-health --state open --json number,labels --limit 200 > /tmp/help-triage-ch.json
gh issue list --label harness-health --state open --json number,labels --limit 200 > /tmp/help-triage-hh.json
node -e "
  const all = [...require('/tmp/help-triage-ch.json'), ...require('/tmp/help-triage-hh.json')];
  const names = i => (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  const untiered = all.filter(i => !names(i).some(n => n === 'status:needs-review' || n === 'status:approved' || n === 'status:fast-track')).length;
  console.log(untiered);
"
gh issue list --label status:blocked --state open --json number --limit 200 -q 'length'
```

Render as three lines on the dashboard:

- Pending authorization: **N issues awaiting your decision** — run `/claude-tweaks:triage` (omit this line when N is 0)
- Blocked: **N issues hit their retry ceiling** — run `/claude-tweaks:triage` to review (omit this line when N is 0)
- Auto-merged this week: **N fast-lane merges** (count `[fast-lane]`-tagged commits on the default branch in the last 7 days via `git log --oneline --since="7 days ago" --grep="\[fast-lane\]"`; omit this line when N is 0)

## Stage 5: Specs Awaiting Review

- Find specs that appear fully implemented but haven't been reviewed yet
- These need `/claude-tweaks:review` before `/claude-tweaks:wrap-up`

## Stage 6: Specs Awaiting Wrap-Up

- Find specs that have been reviewed (review commits/artifacts exist) but not wrapped up

## Stage 7: Maintenance Signals

- INBOX has 10+ items → suggest `/claude-tweaks:tidy`
- Stage 4.5 reports stale open PRs (>4 weeks without updates) → suggest `/claude-tweaks:tidy` (Step 4.8 audits the PR backlog)
- Plans older than 4 weeks with no matching spec progress → flag
- More than 3 design docs unspecified → suggest a `/claude-tweaks:specify` session
- Doc registry exists but has stale entries or gaps → suggest `/claude-tweaks:tidy` (Step 4.6 audits registry health)
- No doc registry exists but `docs/` has files → suggest `/claude-tweaks:init update` to create registry

## Present Dashboard

```markdown
## Workflow Status

### Pipeline
| Stage | Count | Action |
|-------|-------|--------|
| INBOX items | {N} ({M} stale) | `/claude-tweaks:capture` to add, `/claude-tweaks:tidy` if stale |
| INBOX items promoted | {N} | `/superpowers:brainstorming {topic}` (or `/claude-tweaks:challenge` first if assumptions present) |
| INBOX items needing debiasing | {N} | `/claude-tweaks:challenge {topic}` |
| Deferred items ready | {N} | Trigger met — promote to spec or merge |
| Deferred items waiting | {N} | Triggers not yet met |
| Design docs unspecified | {N} | `/claude-tweaks:specify {topic}` |
| Specs ready to build | {N} | `/claude-tweaks:build {number}` |
| Specs in progress | {N} | Resume `/claude-tweaks:build` or check status |
| Specs awaiting review | {N} | `/claude-tweaks:review {number}` |
| Specs awaiting wrap-up | {N} | `/claude-tweaks:wrap-up {number}` |

### Current PR — #{N} {title}

*(Omit this section when Stage 4.5 reports no open PR or the GitHub scan was skipped.)*

| Signal | State | Action |
|--------|-------|--------|
| Review decision | {APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED} | {Address review threads / —} |
| CI checks | {N failing, M pending} | {Fix before merge / —} |
| Unresolved threads | {N} | {Address or resolve / —} |
| Linked issues | {#12, #14} | Closed on merge |

### Ready to Build (priority order)
| Spec | Title | Tier | Has Plan? |
|------|-------|------|-----------|
| {N} | {title} | {tier} | {yes/no} |

### Needs Attention
| Item | Issue | Suggested Action |
|------|-------|-----------------|
| {item} | {issue} | {action} |
```
