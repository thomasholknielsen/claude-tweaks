# Sweep Retired Ask-First Demo Prose (#325) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop on #324 everywhere else in the repo: sweep prose still describing the retired ask-first demo flow, verify skill-graph edges and top-level docs, update the plugin-structure sub-file table, and take the family's single version bump.

**Architecture:** Mechanical consistency pass — the one judgment call per hit is topic-consistency (does this sentence describe the current show-first flow, or the retired ask-first one, as *current behavior*?). Historical records quote the old shape legitimately.

**Tech Stack:** Markdown prose; `find`+`xargs` sweep (never bare recursive grep — it honors .gitignore); `node --test` suite.

**Spec:** the materialized record at `.claude-tweaks/pipelines/2026-08-11T210247-spec-324-325/spec-325/work/325-spec.md` — read in full; its Non-Goals and Gotchas are normative.

## Global Constraints

- **Exemptions (survivors that are correct, never "fix" them):** `skills/demo/legacy-brief-compatibility.md` (the sanctioned compatibility home — states its exemption inline); `skills/demo/SKILL.md` lines ~77/~212/~271/~330 (deliberate quotations of retired names inside routing/compat prose, each with backward-compat framing); `docs/incident-log.md`; `CHANGELOG.md`; `docs/superpowers/plans/*` and `docs/superpowers/specs/*` (historical); `.claude-tweaks/pipelines/**` and `.superpowers/**` (run artifacts, this family's own specs/briefs quote the patterns by necessity); `docs/journeys/accept-built-work-via-demo.md` line ~23 (quotes retired labels as a red-flag description — verify it reads as retired-history, which a staged review fix is already correcting).
- Sweep exclusions anchored to path position against `find` output (`grep -v "^./docs/incident-log.md"`), never bare content substrings.
- Never write an expect-no-output sweep — the new section name is legitimate content everywhere, and survivors are judged per hit for topic-consistency.
- No emojis; 40 KB ceiling per skill file; `/claude-tweaks:{skill}` form in actionable text.
- Commits: `{Verb} {what} — {detail}`, `refs #325` — never closing keywords.
- **#324's files:** re-edit only to fix a stale reference the sweep finds that it missed — nothing else.

---

### Task 1: Verify precondition, derive patterns, run the literal sweep, fix hits

**Files:**
- Read: `#324`'s landed commits (`git log --oneline 372ef984..HEAD`), `skills/demo/legacy-brief-compatibility.md`
- Modify: every file with an unaccounted stale hit. **Pre-known targets from this run's own reference sweep (all confirmed stale, fix all seven):**
  1. `skills/_shared/pending-review-durability.md` — cites verification-brief.md Step 3's retired branch name "Non-testable, or testable-with-browser-unavailable"; re-key to the kind-keyed branch names (`cli`/`flow`/`diff` plans; URL-surface plans under the browser-unavailable fallback).
  2. `skills/wrap-up/execution-and-verification.md` (two spots) — gates on "the record is testable" / "for testable records"; re-key to plan kinds (`app-route`/`rendered-page` vs `cli`/`flow`/`diff`).
  3. `skills/visual-review/SKILL.md` — "when a testable record reaches wrap-up…"; re-key to URL-surface plan kinds.
  4. `skills/_shared/dev-url-detection.md` — caller list names "/demo's 'See it yourself' pre-flight … before offering a live session or manual steps"; the current caller is /demo's Prepare/Validate (show-first); legacy flow lives only in `legacy-brief-compatibility.md`.
  5. `skills/browse/SKILL.md` — "When to Use" names /demo's live look as "See it yourself"; current step is Show (Validate is the headless check).
  6. `docs/skill-graph.md` ~line 130 — describes retired vocabulary as current /demo behavior.
  7. `docs/skill-graph.md` ~line 409 — same.

- [ ] **Step 1: Precondition.** `grep -c '### Observation plan' skills/wrap-up/verification-brief.md` ≥ 1 AND `grep -c '### See it yourself' skills/wrap-up/verification-brief.md` = 0. If either fails, STOP: the blocked-by link was bypassed.
- [ ] **Step 2: Derive the pattern set from the landed diff** (read `git log --oneline 372ef984..HEAD` and the exemption statement inside `legacy-brief-compatibility.md`). Patterns (case-insensitive): `See it yourself`, `Verify it yourself`, `Open a live session and show you`, `Determine testability`, `non-interactive verification surface`, `testable record`, `non-testable`, `testable-with-browser-unavailable`, `give me the steps`, `show me live`. (The `testable` family is derived from the landed diff's renamed Step 2/Step 3 vocabulary — the spec's own pattern list predates it.)
- [ ] **Step 3: Positive control.** Plant a token file containing one pattern under a gitignored path (e.g. `.claude-tweaks/pipelines/sweep-control.md` with the literal `See it yourself`), run the pipeline: `find . -type f \( -name "*.md" -o -name "*.js" \) -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./evals/node_modules/*" | xargs grep -il "see it yourself"` — the control file MUST appear (proving .gitignore is bypassed). Remove the control file afterward and show its removal.
- [ ] **Step 4: Run the sweep** for every pattern; classify every hit: exempt (Global Constraints list, with reason), already-correct (describes the flow as retired/history), or STALE (describes it as current). Fix every STALE hit — including the 7 pre-known targets above (confirm each against its live text first; the descriptions were written hours ago).
- [ ] **Step 5: Enumerate the accounting** in your report: every hit → fixed / exempt-with-reason. Zero unaccounted.
- [ ] **Step 6: Verify + commit.** `node --test tests/pending-review-durability.test.js` (it reads one edited file) and `bash -n` any edited bash block. `git add` exactly the edited files; `git diff --cached --name-only`; commit: `Sweep retired ask-first demo prose across skills and skill-graph — refs #325`

### Task 2: Reworded-prose read pass

**Files:**
- Read IN FULL: `docs/skill-graph.md` (demo↔wrap-up and demo↔browse edges), `README.md` (lifecycle/workflow prose), `skills/help/*.md` (all), `skills/_shared/design-contract.md`, `skills/_shared/github-pr-scan.md`, `skills/tidy/step-1-records.md`
- Modify: only files whose prose describes the ask-first flow (any wording)

- [ ] **Step 1:** Read each enumerated file fully (literal grep can't catch paraphrase — Task 1's sweep does not substitute for this). For each: verdict "consistent with show-first" or fix the description. Where prose partially describes the old flow, rewrite by reference to `skills/demo/SKILL.md` rather than restating the procedure. Never restate list cardinalities as literals.
- [ ] **Step 2:** Per-file verdict table in your report (file → consistent | changed: what).
- [ ] **Step 3:** Commit any edits: `Align lifecycle prose with show-first demo flow — refs #325` (skip commit if zero edits).

### Task 3: plugin-structure sub-file table

**Files:**
- Modify: `docs/plugin-structure.md`

- [ ] **Step 1:** Add to the per-skill sub-file table: `skills/_shared/observation-plan.md` (canonical observation-plan schema; cited by wrap-up's verification brief and /demo) and `skills/demo/legacy-brief-compatibility.md` (pre-schema brief walkthrough — demo's compatibility branch). Match the table's existing row format exactly; #324's landed diff shows no other extraction.
- [ ] **Step 2:** Commit: `List observation-plan and demo legacy-compat sub-files in plugin structure — refs #325`

### Task 4: Version bump (family's single bump)

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1:** `git fetch origin`, read `origin/main:.claude-plugin/plugin.json`'s version and `docs/shipped-versions.tsv` (worktree copy, post-merge), and `git worktree list --porcelain` sibling branches for unshipped bumps (check each sibling's `.claude-plugin/plugin.json` via `git show <branch>:.claude-plugin/plugin.json` where readable).
- [ ] **Step 2:** Pick the next minor strictly ahead of the tip (tip 6.77.0 → candidate 6.78.0, unless step 1 shows higher). Edit `.claude-plugin/plugin.json` only.
- [ ] **Step 3:** Commit: `Bump version to {X} — observation-plan briefs and show-first demo family (refs #325)`. NOTE for the dispatcher, not you: the bump is re-verified against a fresh fetch immediately before push at branch finish.

### Task 5: Final verification

- [ ] **Step 1:** Full `npm test` (background if needed; report `# tests`/`# fail` lines).
- [ ] **Step 2:** Re-run Task 1's sweep accounting spot-check: one pattern (`see it yourself`), confirm every hit is in the exempt list or fixed set.
- [ ] **Step 3:** No commit expected; report results.

## Self-Review notes

- Spec coverage: Deliverable 1 (precondition + derive from diff) → T1.1-1.2; Deliverable 2 (literal sweep + control) → T1.3-1.5; Deliverable 3 (read pass) → T2; Deliverable 4 (plugin-structure) → T3; Deliverable 5 (version bump) → T4; AC5 (npm test) → T5. AC1→T1.5, AC2→T1.3, AC3→T2.2, AC4→T4 + finish-time re-verify.
- The `testable`-family patterns extend the spec's list per its own Deliverable 1 rule (patterns come from the landed diff, never the record's predictions alone).
