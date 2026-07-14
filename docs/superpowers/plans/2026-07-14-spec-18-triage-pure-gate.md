# Spec 18: /triage as the Pure Human Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `skills/triage/SKILL.md` as a single-purpose interactive authorization gate: pull open `ready` ungranted records of any origin, recommend via `recommendGrants`, re-verify body shape before granting (labels are projection, not truth), apply `auto:build` (+`auto:merge`), flag back unshaped records.

**Architecture:** Wholesale rewrite of the 464-line file — more than half (the entire `dispatch` mode: claims, grouping, Task dispatch, retry ceiling, auto-merge gate, consolidated console, routine references) leaves this file. **Cross-spec coordination (decided by the controller, logged):** spec 19 ports the dispatch content into `skills/dispatch/SKILL.md` from this plan's recorded pre-rewrite git ref (`git show {PRE_REF}:skills/triage/SKILL.md`); spec 19 also owns deleting `skills/triage/routine-template.yml` (do NOT delete it here). Spec 18's own AC 1 requires the dispatch workflow gone from this file at this spec's gate — the rewrite satisfies it.

**Tech Stack:** Markdown; consumers `bin/lib/issues/tier.js` (`recommendGrants`, `extractRiskEffort`) and `record.js` (`parseRecordFacets`) — unchanged.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel` before git commands.
- **Record the pre-rewrite ref FIRST:** `PRE_REF=$(git rev-parse HEAD)` — write it into the commit message body (`Dispatch-content port source for spec 19: {PRE_REF}`) and into `.superpowers/sdd/progress.md`.
- Standard skill structure preserved: frontmatter (`name`, `description` with trigger + keywords), interaction directive (byte-identical to other skills), H1 + lifecycle diagram, When to Use, Input, numbered workflow, Next Actions (before CSC/Anti-Patterns), Component-Skill Contract (canonical template — but see below: triage is human-only, mirror the current file's stance), Anti-Patterns, Relationship (bidirectional).
- **The security sentence appears literally (AC 5):** `auto:*` labels are only ever added by an interactive human session; machinery may only remove them.
- **The invariant cited by name (AC 4 context):** the body-shape re-verification step cites "labels are projection, not truth" (`_shared/work-record.md`).
- Detection Ladder preflight (`_shared/github-pr-scan.md`) stays a hard gate.
- Never grants on `local-files` records — state it (spec Non-Goal): the gate is github-issues-only; local grants are hand-recorded frontmatter, no headless consumer.
- Vocabulary: zero `tier:approved|tier:fast-track|tier:needs-review|status:blocked|status:in-progress` (AC 2 allows ONE migration-note line; prefer zero and rely on `/tidy`'s legacy-taxonomy finding instead — decide: include exactly one migration note in the Relationship/notes area saying pre-6.0 `tier:*` issues surface via `/tidy` as retired vocabulary). Zero `recon-` references (F11: the old :227 reference dies with the rewrite).
- The batch table + one-AskUserQuestion convention per CLAUDE.md (apply-all/override/flag-some); one decision per message.
- No emojis; commit style; tests: `grep -rn "triage" bin/lib/*/tests/*.test.js` to find any suites asserting this SKILL.md's content — update them in the SAME task.

## Workflow content requirements (the rewritten file's spine)

1. **Frontmatter description:** "Use when you want to authorize GitHub work records for autonomous building — the interactive human gate over the ready queue. Grants auto:build / auto:merge; flags unshaped records back. Keywords - triage, authorize, grant, auto:build, auto:merge, ready queue, gate."
2. **Lifecycle diagram:** capture/health-file → specify shapes → **[ /triage grants ]** → /dispatch claims+executes → close-via-merge.
3. **Preflight:** Detection Ladder hard gate (remote exists, gh installed, authenticated) per `_shared/github-pr-scan.md`; `work-backend: local-files` → report grants-not-applicable, point at manual `/flow`.
4. **Step 1 — Pull the queue (origin-agnostic, AC 3):** `gh issue list --label ready --state open --json number,title,labels,updatedAt --limit 100`, then facet-filter via `parseRecordFacets`: keep records with `grants.build == false && grants.merge == false && !bot.inProgress && !bot.blocked`... EXCEPTION: records carrying `bot:blocked` ARE pulled — they surface in the table as re-authorization candidates (the strip rule in Step 4). So: filter = no `auto:*` grants; partition into `fresh` (no bot state) and `blocked` (bot:blocked — re-triage candidates). State explicitly: no `by:*`/producer filtering — health-filed, captured, and human-filed records all enter one worklist.
5. **Step 2 — Recommend:** per record, `extractRiskEffort` (colon-first) → `recommendGrants({risk, effort})` via a `node -e` snippet; unscored → `{build:false, merge:false}` → table shows "needs scoring → flag back or score now" (human may supply scoring inline; the gate stamps it with the grant — bootstrap-then-add the scoring labels).
6. **Step 3 — Batch table:** columns `# / Record / Origin / Risk / Effort / Recommended` where Recommended ∈ {`auto:build`, `auto:build + auto:merge`, `flag back (needs scoring)`, `re-authorize (bot:blocked)`}; one AskUserQuestion (Apply all recommended / Override specific items / Flag some back); overrides via free text per convention. 10+ records → severity/count summary line first.
7. **Step 3.5 — Body-shape re-verification (AC 4):** for rows about to be GRANTED only (not the whole queue — "projection for listing, truth before action"): fetch bodies (`gh issue view {n} --json body`), check the spec-shaped definition per `_shared/work-record.md` (Current State / Deliverables / Acceptance Criteria present, non-empty, no `TBD`/`TODO`/`<!-- ambiguity:` markers — structural-plus-minimal; content quality stays human judgment). A failing record's row auto-downgrades to flag-back with a comment naming the missing sections (exact comment shape: `Flagged back by /triage: body is not spec-shaped — missing/empty: {list}. Run /claude-tweaks:specify #{n} to shape it, then re-add 'ready'.`). Cite the invariant by name.
8. **Step 4 — Apply:** bootstrap-then-add per `_shared/label-bootstrap.md` (only labels being applied: `auto:build`, `auto:merge`, any inline-supplied `risk:*`/`effort:*`); when granting a record carrying `bot:blocked`, strip `bot:blocked` in the same edit (rationale: without the strip, dispatch's skip rule ignores the fresh authorization forever — the documented incident); flag-back = remove `ready` + post the comment; log every action to the run dir's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md` — triage is on the allowlist).
9. **Concurrency note (spec Gotcha):** two humans triaging concurrently — label adds idempotent; last-writer-wins on flag-back vs grant is acceptable (note it, don't engineer).
10. **Next Actions:** offer `/claude-tweaks:dispatch` picklist / `/claude-tweaks:dispatch next` / re-run `/triage` (forward references to spec 19's skill — fine, it lands later on this branch).
11. **CSC:** triage is human-only (never invoked by pipeline parents); keep a short CSC paragraph stating it always renders Next Actions (mirror `/specify`'s stance) — `$PIPELINE_RUN_DIR` may be set for LOGGING (standalone run dir) but never suppresses interactivity.
12. **Anti-Patterns (include at minimum):** grant-only-interactively verbatim in new vocabulary; "never grant on a `ready` label alone — re-verify the body"; "never grant from a headless/scheduled session"; "never add `bot:*` from the gate" (permission matrix); "never bulk-grant without the batch-table decision".
13. **Relationship table (bidirectional, forward-consistent):** /dispatch (consumer — spec 19), health skills (feeders, born-ready), /capture + /specify (feeders/shaper), /tidy (surfaces bot:blocked + retired-vocabulary records), `_shared/work-record.md`, `_shared/issue-claims.md` (dispatch claims, not triage), `_shared/github-pr-scan.md`, `_shared/label-bootstrap.md`, `_shared/auto-mode-contract.md`, `bin/lib/issues/tier.js` + `record.js`. ONE migration note line allowed here re pre-6.0 `tier:*` records (per Global Constraints decision).
14. **What leaves this file entirely:** the `dispatch` mode (Steps 1-4, claims, grouping, capped-concurrent Task dispatch, retry ceiling, auto-merge gate, consolidated console), `$RUN_ID`/`CLAIM_RUN_ID` threading, the Configuration table (config keys move to dispatch — spec 19), routine creation/references (`/routine create triage` dies; spec 19 ships `/routine create dispatch`). AC 6: `grep -n "routine" skills/triage/SKILL.md` shows no triage-owned routine creation (a pointer to `/routine create dispatch` in Next Actions/Relationship is allowed).

---

### Task 1: Rewrite `skills/triage/SKILL.md` as the pure gate

**Files:**
- Modify: `skills/triage/SKILL.md` (wholesale rewrite per the spine above)
- Modify: any test files asserting triage SKILL.md content (locate: `grep -rln "triage" bin/lib --include="*.test.js"` then inspect which assert SKILL.md text)

- [ ] **Step 0:** `PRE_REF=$(git rev-parse HEAD)`; echo it; keep for the commit message.
- [ ] **Step 1:** Read the current file fully (you are deleting the dispatch mode — the commit message must carry the port-source ref for spec 19).
- [ ] **Step 2:** Write the new file per the 14-point spine. Target length: roughly 200-280 lines (a thin gate, not a pipeline).
- [ ] **Step 3:** Update any tests asserting old triage content; run those suites + `npm test` tail.
- [ ] **Step 4:** Verify (ACs 1-6):
```bash
grep -n "dispatch" skills/triage/SKILL.md            # only /dispatch-skill references (hand-off, Next Actions, Relationship) — no workflow steps/claims/retry/auto-merge/console
grep -n "tier:approved\|tier:fast-track\|tier:needs-review\|status:blocked\|status:in-progress" skills/triage/SKILL.md   # 0 (or the single allowed migration-note line)
grep -in "origin-agnostic\|any origin\|regardless of origin" skills/triage/SKILL.md | head -3   # AC 3 statement present
grep -in "labels are projection" skills/triage/SKILL.md      # AC 4 invariant named
grep -n "only ever added by an interactive human session" skills/triage/SKILL.md   # AC 5 literal
grep -n "recon-" skills/triage/SKILL.md                       # 0 (F11)
grep -c "flag back\|flag-back\|Flagged back" skills/triage/SKILL.md   # ≥ 3
```
- [ ] **Step 5:** Commit — `git add skills/triage/ bin/lib/ && git commit -m "Rewrite triage as the pure human gate — ready queue, grant recommendations, body re-verification" -m "Dispatch-content port source for spec 19: {PRE_REF}"`

---

### Task 2: Spec-18 acceptance sweep

- [ ] **Step 1:** Re-run all Task-1 Step-4 greps + `npm test` tail + `test -f skills/triage/routine-template.yml && echo "still present (correct — spec 19 deletes it)"`.
- [ ] **Step 2:** Fix findings (triage files + its test asserters only), re-run until clean.
- [ ] **Step 3:** Commit (only if fixes) — `Fix spec-18 acceptance sweep findings`
