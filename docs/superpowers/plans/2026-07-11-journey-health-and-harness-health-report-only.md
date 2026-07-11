# Journey Health & Report-Only Harness Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/harness-health` report-only (drop its auto-apply path, matching `/code-health`), then build a new `/claude-tweaks:journey-health` watchman that rotates through `docs/journeys/*.md`, judges drift/coverage via a light tier and live behavior via a deep tier, and always files GitHub issues.

**Architecture:** Two independent subsystems in one plan. Part A (Tasks 1-3) strips harness-health's `Edit`+commit auto-apply branch down to a single "always file" path. Part B (Tasks 4-13) builds journey-health as a new bin/lib engine (mirroring `bin/lib/harness-health/`'s cache/scope/fingerprint/dedup/validate-finding/issue-payload shape almost exactly) plus a new `skills/journey-health/SKILL.md`, wired into the rest of the plugin via two extracted shared fragments and a cross-reference sweep.

**Tech Stack:** Node 18+ (`node --test`, no external deps), markdown SKILL.md files, `gh` CLI for issue filing, `agent-browser` for the deep tier's browser access.

## Global Constraints

- No external npm dependencies — every engine module uses only Node built-ins (`fs`, `path`, `crypto`, `child_process`).
- Test runner is `node --test`; every new `bin/lib/journey-health/*.js` module gets a sibling test file under `bin/lib/journey-health/tests/`, and `package.json`'s `test` script must include that glob.
- Neither `/harness-health` nor `/journey-health` ever edits journey files, story YAMLs, skills, rules, or CLAUDE.md — every finding files as a GitHub issue (`gh issue create`). Never call `Edit` from either skill's workflow.
- The deep tier's browser access must go through `/test`/`/visual-review` (which are `agent-browser`-only) — never call `claude-in-chrome` tools or `backend=chrome` directly.
- Follow this repo's Working Directory Discipline (`_shared/subagent-output-contract.md`) for every `git`/`gh` command: verify `pwd` and `git rev-parse --show-toplevel` before committing.
- Commit after every task with the working-directory verification shown in each task's steps.

## File Structure

**Part A (harness-health report-only):**
- Modify: `bin/harness-health.js` — `MARK_STATUSES` set, usage string
- Modify: `bin/lib/harness-health/dedup.js` — drop the `'applied'` branch
- Modify: `bin/lib/harness-health/tests/dedup.test.js`, `bin/lib/harness-health/tests/cli-mark.test.js`
- Modify: `skills/harness-health/SKILL.md` — Step 7, Step 8, Routine Configuration, Anti-Patterns
- Modify: `README.md`, `skills/help/reference-card.md`, `skills/_shared/github-pr-scan.md`

**Part B (journey-health):**
- Create: `skills/_shared/journey-self-review.md`, `skills/_shared/journey-coverage-check.md`
- Modify: `skills/journeys/SKILL.md` (Step 3.5), `skills/review/SKILL.md` (3g-cov lens)
- Create: `bin/lib/journey-health/score.js`, `cache.js`, `scope.js`, `fingerprint.js`, `dedup.js`, `validate-finding.js`, `issue-payload.js`
- Create: `bin/lib/journey-health/tests/*.test.js` (one per module above, plus 3 CLI test files)
- Create: `bin/journey-health.js`
- Create: `skills/journey-health/SKILL.md`, `skills/journey-health/routine-template.yml`
- Modify: `CLAUDE.md`, `README.md`, `skills/help/reference-card.md`, `skills/routine/SKILL.md`, `skills/journeys/SKILL.md` (relationship row), `skills/review/SKILL.md` (relationship row), `skills/test/SKILL.md`, `skills/visual-review/SKILL.md`, `skills/_shared/github-pr-scan.md`, `package.json`

---

## Part A: harness-health becomes report-only

### Task 1: Remove the "applied" mark status from harness-health's engine

**Files:**
- Modify: `bin/harness-health.js:234,261`
- Modify: `bin/lib/harness-health/dedup.js`
- Modify: `bin/lib/harness-health/tests/dedup.test.js:30-33`
- Modify: `bin/lib/harness-health/tests/cli-mark.test.js:12-19`
- Test: `bin/lib/harness-health/tests/dedup.test.js`, `bin/lib/harness-health/tests/cli-mark.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `decide(finding, issueIndex, cache)` in `dedup.js` no longer recognizes `status: 'applied'` in the cache — an old/stale `'applied'` entry falls through to `{ action: 'file' }` (harmless re-proposal, not a crash). `MARK_STATUSES` in `bin/harness-health.js` is now `Set(['declined'])`.

- [ ] **Step 1: Write the failing tests**

Replace the test at `bin/lib/harness-health/tests/dedup.test.js:30-33` (currently `test('decide skips a finding the local cache marked applied', ...)`) with:

```js
test('decide files a finding when the local cache carries a stale "applied" status (pre-report-only cache entries fall through to file, not error)', () => {
  const cache = { 'skillhealth-abc': { status: 'applied', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'file' });
});
```

Replace the test at `bin/lib/harness-health/tests/cli-mark.test.js:12-19` (currently `test('mark writes an applied status to the cache', ...)`) with:

```js
test('mark exits non-zero for "applied" now that harness-health is report-only', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'skillhealth-abc12345', 'applied', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/dedup.test.js bin/lib/harness-health/tests/cli-mark.test.js`
Expected: the two new/changed tests FAIL — `decide` still returns `{ action: 'skip' }` for a cached `'applied'` status, and `mark ... applied` still exits 0.

- [ ] **Step 3: Implement — drop the 'applied' branch from dedup.js**

Replace the full contents of `bin/lib/harness-health/dedup.js` with:

```js
'use strict';

// Decide what to do with a freshly-fingerprinted proposal given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label harness-health` output (the skill builds
//   it; the engine never calls network) — same contract as recon's dedup.js.
//
// Decision logic:
//   open issue match           -> skip      (already staged, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user rejected this exact proposal)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
//
// harness-health never applies anything itself (report-only, matching
// code-health), so there is no 'applied' cache status to check. A cache
// entry written before this change (status: 'applied') simply doesn't match
// any branch below and falls through to 'file' — a harmless re-proposal of
// something already resolved, not a crash.
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

- [ ] **Step 4: Implement — drop 'applied' from MARK_STATUSES**

In `bin/harness-health.js`, change line 234 from:

```js
const MARK_STATUSES = new Set(['applied', 'declined']);
```

to:

```js
const MARK_STATUSES = new Set(['declined']);
```

And change line 261's usage string from:

```js
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
```

to:

```js
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>\n',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/dedup.test.js bin/lib/harness-health/tests/cli-mark.test.js`
Expected: PASS, all tests including the two changed ones.

- [ ] **Step 6: Run the full harness-health suite to confirm no other test depended on 'applied'**

Run: `node --test bin/lib/harness-health/tests/*.test.js`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
pwd  # confirm you are in the worktree root
git -C "$(git rev-parse --show-toplevel)" add bin/harness-health.js bin/lib/harness-health/dedup.js bin/lib/harness-health/tests/dedup.test.js bin/lib/harness-health/tests/cli-mark.test.js
git -C "$(git rev-parse --show-toplevel)" commit -m "harness-health: drop the 'applied' mark status — report-only from here on"
```

### Task 2: Rewrite harness-health/SKILL.md for report-only behavior

**Files:**
- Modify: `skills/harness-health/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: Step 7 named "FILE" (was "APPLY or FILE"); Step 8's interactive routing has 2 top-level options (was 2, unchanged count) and 2 per-finding options (was 3 — "Apply now" dropped); Anti-Patterns table has one consolidated auto-apply row (was two).

- [ ] **Step 1: Replace Step 7**

In `skills/harness-health/SKILL.md`, find the section starting `**Step 7 — APPLY or FILE.**` and ending just before `**Step 8 — SUMMARIZE.**`. Replace the entire block with:

```markdown
**Step 7 — FILE.**

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown). These stay on the payload as triage metadata — nothing here branches on them anymore.

For each payload, file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`. This applies uniformly — CLAUDE.md findings, design-artifact findings, additive skill/rule patches, restructural patches, and new-skill candidates all file the same way. `/harness-health` never edits anything directly; matching `/code-health`, it only ever judges and files.

In `--dry-run` mode, print what would be filed but do not call `gh`.
```

- [ ] **Step 2: Replace Step 8's interactive routing**

Find the batch-table + `AskUserQuestion` block inside Step 8 (starts with `In interactive mode, route surviving findings through a two-tier decision:` and ends with the `"dismiss"` sentence just before `## Routine Configuration`). Replace it with:

```markdown
In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility |
   |---|-------|----------|-----------------|------------|----------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} |
   ```

   `classification`/`confidence`/`reversibility` stay visible as triage metadata — every row files the same way, so there is no per-row recommendation column to pre-fill.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.
```

- [ ] **Step 3: Replace the Routine Configuration section**

Find the `## Routine Configuration` section (from that heading through the `> **Billing note:**` line). Replace with:

```markdown
## Routine Configuration

`/harness-health` ships a routine template (`skills/harness-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create harness-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Report-only, matching `/code-health` — every finding files as a `harness-health`-labelled GitHub issue, with no `Edit` in `allowed_tools` and no project-policy dependency to reason about.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.
```

- [ ] **Step 4: Consolidate the Anti-Patterns table**

In the `## Anti-Patterns` table, find these two rows:

```
| Auto-applying a CLAUDE.md patch | CLAUDE.md findings always file as an issue for human review, regardless of classification/confidence/reversibility — it governs every future session's behavior, so an unattended bad edit has outsized blast radius. |
| Auto-applying a restructural patch (skill/rule) | Only additive+high-confidence+high-reversibility patches auto-apply — restructural changes always go through a filed issue for human review. |
```

Replace both with one row:

```
| Applying any patch directly instead of filing an issue | `/harness-health` never edits anything — every finding, regardless of `assetType`/classification/confidence/reversibility, files as a GitHub issue for human review. Matches `/code-health`'s report-only contract. |
```

- [ ] **Step 5: Verify no stale "applied"/"apply" references remain in the skill file**

Run: `grep -n "apply\|Apply" skills/harness-health/SKILL.md`
Expected: no remaining hits describing an apply-directly code path. (Hits referring to "applying" in a purely descriptive/historical sense, if any, should read correctly in context — re-read any surviving hit before deciding it's fine.)

- [ ] **Step 6: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add skills/harness-health/SKILL.md
git -C "$(git rev-parse --show-toplevel)" commit -m "harness-health: rewrite SKILL.md for report-only filing (no more auto-apply)"
```

### Task 3: Sweep cross-references for harness-health's now-stale auto-apply language

**Files:**
- Modify: `README.md:211`
- Modify: `skills/help/reference-card.md:45`
- Modify: `skills/_shared/github-pr-scan.md:79`

**Interfaces:**
- Consumes: nothing new.
- Produces: no code interface — documentation only.

- [ ] **Step 1: Fix README.md's harness-health entry**

In `README.md`, find (line 211):

```
**`/claude-tweaks:harness-health`** — Recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and either auto-applies a safe additive patch (skills/rules/memory) or files a `harness-health`-labelled GitHub issue. CLAUDE.md findings always file as an issue, never auto-applied. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Memory (`~/.claude/projects/{slug}/memory/`) is audited only via an explicit `--kind memory --memory-dir <path>` invocation — never through the Routine's automatic rotation. Never edits code — only harness documentation.
```

Replace with:

```
**`/claude-tweaks:harness-health`** — Recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and always files a `harness-health`-labelled GitHub issue. Never edits anything directly (skills, rules, memory, or CLAUDE.md) — report-only, matching `/code-health`. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Memory (`~/.claude/projects/{slug}/memory/`) is audited only via an explicit `--kind memory --memory-dir <path>` invocation — never through the Routine's automatic rotation.
```

- [ ] **Step 2: Fix reference-card.md's harness-health row**

In `skills/help/reference-card.md`, find (line 45):

```
| `/claude-tweaks:harness-health` | Recurring watchman auditing `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits code; CLAUDE.md findings never auto-apply. | `--target <name>`, `--kind <skill\|rule\|claude-md\|design-artifact\|memory>`, `--memory-dir <path>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

Replace with:

```
| `/claude-tweaks:harness-health` | Recurring watchman auditing `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <name>`, `--kind <skill\|rule\|claude-md\|design-artifact\|memory>`, `--memory-dir <path>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 3: Fix github-pr-scan.md's harness-health findings-table row**

In `skills/_shared/github-pr-scan.md`, find (line 79):

```
| Harness-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:harness-health --target <name> --kind <skill\|rule\|claude-md>` to re-judge |
```

Replace with:

```
| Harness-health issue still valid | Suggest `/claude-tweaks:triage` or Capture — same as a still-valid code-health issue (harness-health never applies patches directly) |
```

- [ ] **Step 4: Verify the sweep is complete**

Run: `grep -rn "auto-appl\|auto applies\|applies a safe" README.md skills/help/reference-card.md skills/_shared/github-pr-scan.md`
Expected: no remaining hits describing harness-health auto-applying anything.

- [ ] **Step 5: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add README.md skills/help/reference-card.md skills/_shared/github-pr-scan.md
git -C "$(git rev-parse --show-toplevel)" commit -m "harness-health: sweep cross-references for stale auto-apply language"
```

---

## Part B: new `/claude-tweaks:journey-health` skill

### Task 4: Extract journey self-review criteria into a shared fragment

**Files:**
- Create: `skills/_shared/journey-self-review.md`
- Modify: `skills/journeys/SKILL.md` (Step 3.5's four numbered checks)

**Interfaces:**
- Consumes: nothing new.
- Produces: `_shared/journey-self-review.md` — the canonical four-check list (persona, step shape, origin coverage, outcome clarity) plus a structural-validity check, reused verbatim by Task 10's journey-health light tier.

- [ ] **Step 1: Create the shared fragment**

Create `skills/_shared/journey-self-review.md`:

```markdown
# Journey Self-Review Criteria

Shared checklist for judging whether a journey file (`docs/journeys/{name}.md`) still holds together — used at *write time* by `/claude-tweaks:journeys` Step 3.5 (right after creating or updating a journey) and at *audit time* by `/claude-tweaks:journey-health`'s light tier (periodically, for journeys nobody has touched recently). Both consumers apply the same four checks; each layers its own response on top (`/journeys` fixes inline or stages/blocks; `journey-health` files a GitHub issue).

## The four checks

1. **Persona check** — is the persona named and consistent across steps? "User" is a placeholder; replace with the actual role (`new visitor`, `paid subscriber`, `admin`).
2. **Step shape** — does each step have an action, a result, and either a page URL or a verbatim UI signal? Steps that just describe the page ("On the dashboard...") with no action don't belong.
3. **Origin coverage** — every `files:` entry should be reachable through the documented steps. If a changed file isn't visited by any step, either add the missing step or drop the file from `files:`.
4. **Outcome clarity** — what does success look like for this journey? If the journey ends in ambiguity ("user is logged in" without where they land), tighten it.

## Structural validity (checked first, both consumers)

A journey file is structurally invalid when it's missing required frontmatter, missing the `## Steps` heading, or has no steps at all. Both consumers treat this as a harder failure than the four content checks above — `/journeys` BLOCKs on it (Step 3.5); `journey-health` files it as a `category: drift, section: self-review` finding with `confidence: high` regardless of anything else.
```

- [ ] **Step 2: Point journeys/SKILL.md's Step 3.5 at the shared fragment**

In `skills/journeys/SKILL.md`, find the four numbered checks inside `## Step 3.5: Journey Self-Review`:

```markdown
1. **Persona check** — is the persona named and consistent across steps? "User" is a placeholder; replace with the actual role (`new visitor`, `paid subscriber`, `admin`).
2. **Step shape** — does each step have an action, a result, and either a page URL or a verbatim UI signal? Steps that just describe the page ("On the dashboard...") with no action don't belong.
3. **Origin coverage** — every `files:` entry should be reachable through the documented steps. If a changed file isn't visited by any step, either add the missing step or drop the file from `files:`.
4. **Outcome clarity** — what does success look like for this journey? If the journey ends in ambiguity ("user is logged in" without where they land), tighten it.
```

Replace with:

```markdown
Apply the four checks and the structural-validity check in `_shared/journey-self-review.md` (shared with `/claude-tweaks:journey-health`'s audit-time check).
```

- [ ] **Step 3: Verify the replacement reads correctly in context**

Run: `grep -n "Persona check\|journey-self-review" skills/journeys/SKILL.md`
Expected: no remaining hit for "Persona check" (the inline text is gone); one hit for `journey-self-review.md`.

- [ ] **Step 4: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add skills/_shared/journey-self-review.md skills/journeys/SKILL.md
git -C "$(git rev-parse --show-toplevel)" commit -m "journeys: extract self-review criteria into a shared fragment"
```

### Task 5: Extract journey-story coverage computation into a shared fragment

**Files:**
- Create: `skills/_shared/journey-coverage-check.md`
- Modify: `skills/review/SKILL.md` (3g-cov lens, lines ~222-250)

**Interfaces:**
- Consumes: nothing new.
- Produces: `_shared/journey-coverage-check.md` — the coverage computation (read journeys, read stories, cross-reference), reused verbatim by Task 10's journey-health coverage scan.

- [ ] **Step 1: Create the shared fragment**

Create `skills/_shared/journey-coverage-check.md`:

```markdown
# Journey Coverage Check

Shared procedure for computing coverage between journey files (`docs/journeys/*.md`) and story YAML files — used inline by `/claude-tweaks:review`'s `3g-cov` lens (informational, runs whenever `/review` runs and both journeys and stories exist) and periodically by `/claude-tweaks:journey-health`'s decoupled coverage scan (files a GitHub issue for anything this procedure finds). Both consumers apply the same computation below; each formats its own output.

> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and story YAML files are independent and should run concurrently.

**Skip this procedure when** no journey files exist in `docs/journeys/` or no story YAML files exist in the stories directory.

## Computation

1. Read all journey files from `docs/journeys/*.md`. Parse each for: journey name, step URLs, `files:` frontmatter.
2. Read all story YAML files from `stories/*.yaml` (or the configured stories directory). Collect the `journey:` field from each story.
3. Cross-reference:
   - For each journey, find stories with `journey: {journey-name}`. Count stories and check which journey step URLs are covered.
   - Identify **orphaned stories** — stories with no `journey:` field, or whose `journey:` value references a non-existent journey file.
   - For orphaned stories, check their URL against journey step URLs to suggest potential links.

## Output

Produces three result sets a caller formats into its own output shape:
- **Uncovered journey steps** — one entry per journey with any gap: the journey name and its uncovered step numbers.
- **Orphaned stories with a URL match** — the story id, its file, and the journey it likely belongs to.
- **Orphaned stories with no match** — informational count only (negative stories or standalone flows; not a finding).
```

- [ ] **Step 2: Point review/SKILL.md's 3g-cov lens at the shared fragment**

In `skills/review/SKILL.md`, find the `### 3g-cov: Journey-Story Coverage (when journeys and stories exist)` section. Replace the block from the `> **Parallel execution:**` line through step 3's cross-reference sub-bullets (i.e., replace everything between the intro sentence and `4. Add findings to the code review findings table:`) with a single line referencing the shared fragment. Concretely, replace:

```markdown
> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and story YAML files are independent and should run concurrently.

**Skip this lens when** no journey files exist in `docs/journeys/` or no story YAML files exist in the stories directory.

1. Read all journey files from `docs/journeys/*.md`. Parse each for: journey name, step URLs, `files:` frontmatter.
2. Read all story YAML files from `stories/*.yaml` (or the configured stories directory). Collect the `journey:` field from each story.
3. Cross-reference:
   - For each journey, find stories with `journey: {journey-name}`. Count stories and check which journey step URLs are covered.
   - Identify **orphaned stories** — stories with no `journey:` field, or whose `journey:` value references a non-existent journey file.
   - For orphaned stories, check their URL against journey step URLs to suggest potential links.

4. Add findings to the code review findings table:
```

with:

```markdown
Run the computation in `_shared/journey-coverage-check.md` (shared with `/claude-tweaks:journey-health`'s coverage scan; that file also documents the skip condition and parallel-execution note).

Add findings to the code review findings table:
```

- [ ] **Step 3: Verify the replacement reads correctly in context**

Run: `grep -n "journey-coverage-check\|Read all journey files" skills/review/SKILL.md`
Expected: one hit for `journey-coverage-check.md`; no remaining hit for "Read all journey files" (the inline computation text is gone).

- [ ] **Step 4: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add skills/_shared/journey-coverage-check.md skills/review/SKILL.md
git -C "$(git rev-parse --show-toplevel)" commit -m "review: extract 3g-cov's coverage computation into a shared fragment"
```

### Task 6: journey-health engine — score.js and cache.js

**Files:**
- Create: `bin/lib/journey-health/score.js`
- Create: `bin/lib/journey-health/cache.js`
- Test: `bin/lib/journey-health/tests/cache.test.js`

**Interfaces:**
- Consumes: nothing (foundational, no dependency on other journey-health modules).
- Produces: `STALE_DAYS_LIGHT = 30`, `STALE_DAYS_DEEP = 90` (from `score.js`); `readCache`, `writeCache`, `readCursors`, `writeCursors`, `recordAudit(root, id, tier, opts)`, `readCoverageScanCursor`, `recordCoverageScan`, `recordRun`, `readRuns`, `computeChurn` (from `cache.js`) — Task 7's `scope.js` imports `STALE_DAYS_LIGHT`/`STALE_DAYS_DEEP`; Task 9's `bin/journey-health.js` imports everything from `cache.js`.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/journey-health/tests/cache.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readCoverageScanCursor, recordCoverageScan,
  recordRun, readRuns, computeChurn,
} = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cache-')); }

test('readCache returns {} when the cache file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCache(root), {});
});

test('writeCache then readCache round-trips', () => {
  const root = tmp();
  writeCache(root, { 'journeyhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
  assert.deepStrictEqual(readCache(root), { 'journeyhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
});

test('cachePath points under .claude-tweaks/journey-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'journey-health', 'cache.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCursors(root), {});
});

test('recordAudit writes a light-tier cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'light', { hash: 'h1', whenMs: 5000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], { lastLightAuditMs: 5000, lastLightHash: 'h1' });
});

test('recordAudit writes a deep-tier cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'deep', { hash: 'h2', whenMs: 9000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], { lastDeepAuditMs: 9000, lastDeepHash: 'h2' });
});

test('recordAudit for light tier does not clobber an existing deep-tier entry, and vice versa', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'deep', { hash: 'd1', whenMs: 1000 });
  recordAudit(root, 'checkout-flow', 'light', { hash: 'l1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], {
    lastDeepAuditMs: 1000, lastDeepHash: 'd1',
    lastLightAuditMs: 2000, lastLightHash: 'l1',
  });
});

test("recordAudit for one journey does not clobber another journey's entry", () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'light', { hash: 'a1', whenMs: 1000 });
  recordAudit(root, 'signup-flow', 'light', { hash: 'b1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['checkout-flow'].lastLightHash, 'a1');
  assert.strictEqual(cursors['signup-flow'].lastLightHash, 'b1');
});

test('recordAudit defaults whenMs to now when omitted', () => {
  const root = tmp();
  const before = Date.now();
  recordAudit(root, 'checkout-flow', 'light', {});
  const cursors = readCursors(root);
  assert.ok(cursors['checkout-flow'].lastLightAuditMs >= before);
});

test('readCoverageScanCursor returns null when never recorded', () => {
  const root = tmp();
  assert.deepStrictEqual(readCoverageScanCursor(root), { lastScannedMs: null });
});

test('recordCoverageScan then readCoverageScanCursor round-trips and does not appear in per-journey keys', () => {
  const root = tmp();
  recordCoverageScan(root, { whenMs: 9000 });
  assert.deepStrictEqual(readCoverageScanCursor(root), { lastScannedMs: 9000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.__coverageScan.lastScannedMs, 9000);
});

test('readRuns returns [] when no run logs exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readRuns(root), []);
});

test('recordRun then readRuns round-trips, sorted oldest first', () => {
  const root = tmp();
  recordRun(root, 'run-2', ['journeyhealth-b']);
  const start = Date.now();
  while (Date.now() === start) { /* spin past this millisecond */ }
  recordRun(root, 'run-1', ['journeyhealth-a']);
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].runId, 'run-2');
  assert.strictEqual(runs[1].runId, 'run-1');
});

test('computeChurn: no prior run treats every fingerprint as appeared, giving ratio 1', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
  assert.strictEqual(result.ratio, 1);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['a', 'b'], prior);
  assert.strictEqual(result.ratio, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/journey-health/tests/cache.test.js`
Expected: FAIL — `Cannot find module '../cache'` (neither `cache.js` nor its directory exist yet).

- [ ] **Step 3: Write score.js**

Create `bin/lib/journey-health/score.js`:

```js
'use strict';
// Round-robin floors: journeys unaudited past these many days are
// force-boosted regardless of churn. Light tier moves at roughly
// code-health's 30-day pace (bin/lib/code-health/score.js); deep tier is 90
// days, matching harness-health's slower-moving-doc rationale, since a deep
// audit boots a real dev server + browser session and should run far less
// often than the light tier.
const STALE_DAYS_LIGHT = 30;
const STALE_DAYS_DEEP = 90;

module.exports = { STALE_DAYS_LIGHT, STALE_DAYS_DEEP };
```

- [ ] **Step 4: Write cache.js**

Create `bin/lib/journey-health/cache.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/journey-health/{cache,cursors}.json and .../runs/*.json

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'cache.json');
}

function readCache(root) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty (the cache is an optimization, not state)
  }
}

function writeCache(root, cache) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return p;
}

function cursorsPath(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json');
}

function readCursors(root) {
  try {
    return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8'));
  } catch {
    return {};
  }
}

function writeCursors(root, cursors) {
  const p = cursorsPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
  return p;
}

// Record that journey `id` was audited on `tier` ('light' or 'deep'). Light
// and deep cursors are tracked independently on the same entry (merged, not
// overwritten) so a light-tier firing never clobbers the deep-tier cadence,
// or vice versa.
function recordAudit(root, id, tier, { hash = null, whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  const existing = cursors[id] || {};
  const patch = tier === 'deep'
    ? { lastDeepAuditMs: whenMs, lastDeepHash: hash }
    : { lastLightAuditMs: whenMs, lastLightHash: hash };
  cursors[id] = { ...existing, ...patch };
  writeCursors(root, cursors);
  return cursors[id];
}

// Coverage-scan cursor is a single global entry (key "__coverageScan"), not
// per-journey — coverage gaps are a whole-library concern, decoupled from
// whichever single journey next-target picked that firing.
function readCoverageScanCursor(root) {
  const cursors = readCursors(root);
  return cursors.__coverageScan || { lastScannedMs: null };
}

function recordCoverageScan(root, { whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  cursors.__coverageScan = { lastScannedMs: whenMs };
  writeCursors(root, cursors);
  return cursors.__coverageScan;
}

function runsDir(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'runs');
}

// Persist the fingerprint set a firing produced, for churn-report diagnostics.
function recordRun(root, runId, fingerprints) {
  const dir = runsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// All run records, oldest first (by runAt).
function readRuns(root) {
  let entries;
  try {
    entries = fs.readdirSync(runsDir(root));
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
    .sort((a, b) => {
      const x = a.runAt || '', y = b.runAt || '';
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readCoverageScanCursor, recordCoverageScan,
  runsDir, recordRun, readRuns, computeChurn,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test bin/lib/journey-health/tests/cache.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add bin/lib/journey-health/score.js bin/lib/journey-health/cache.js bin/lib/journey-health/tests/cache.test.js
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add score.js + cache.js (tier-aware cursor state)"
```

### Task 7: journey-health engine — scope.js (journey discovery + tier-aware selection)

**Files:**
- Create: `bin/lib/journey-health/scope.js`
- Test: `bin/lib/journey-health/tests/scope.test.js`

**Interfaces:**
- Consumes: `STALE_DAYS_LIGHT`, `STALE_DAYS_DEEP` from `./score` (Task 6).
- Produces: `parseJourneyFiles(content)`, `listJourneys(root)` → `[{ kind: 'journey', id, path, filesFrontmatter }]`, `domainChurn(root, relPaths, sinceMs)`, `selectTarget(root, cursors, opts)` → `{ ...candidate, why: 'stale'|'hotspot', ... } | null` — Task 9's `bin/journey-health.js` imports `selectTarget` and `listJourneys`.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/journey-health/tests/scope.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseJourneyFiles, listJourneys, domainChurn, selectTarget } = require('../scope');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-scope-')); }

function writeJourney(root, name, filesFrontmatter) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = filesFrontmatter.length
    ? `---\nfiles:\n${filesFrontmatter.map((f) => `  - ${f}`).join('\n')}\n---\n`
    : '';
  fs.writeFileSync(path.join(dir, `${name}.md`), `${frontmatter}\n# ${name}\n`, 'utf8');
}

test('parseJourneyFiles returns [] when there is no frontmatter', () => {
  assert.deepStrictEqual(parseJourneyFiles('# Checkout\n\n## Steps\n'), []);
});

test('parseJourneyFiles parses a files: list', () => {
  const content = '---\nfiles:\n  - src/checkout/Cart.tsx\n  - src/checkout/Payment.tsx\n---\n\n# Checkout\n';
  assert.deepStrictEqual(parseJourneyFiles(content), ['src/checkout/Cart.tsx', 'src/checkout/Payment.tsx']);
});

test('listJourneys returns [] when docs/journeys does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listJourneys(root), []);
});

test('listJourneys finds and parses journey files, sorted by id', () => {
  const root = tmp();
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const journeys = listJourneys(root);
  assert.strictEqual(journeys.length, 2);
  assert.strictEqual(journeys[0].id, 'checkout-flow');
  assert.strictEqual(journeys[1].id, 'signup-flow');
  assert.deepStrictEqual(journeys[0].filesFrontmatter, ['src/checkout/Cart.tsx']);
});

test('domainChurn returns 0 when relPaths is empty', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, [], 0), 0);
});

test('domainChurn returns 0 when git is unavailable or the path has no history', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, ['src/nonexistent.ts'], 0), 0);
});

test('selectTarget returns null when there are no journeys', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}, { now: Date.now(), tier: 'light' }), null);
});

test('selectTarget force-picks a journey unaudited past STALE_DAYS_LIGHT on the light tier', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now - 31 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'light' });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget does not force-pick a light-stale journey on the deep tier (independent thresholds)', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  // 31 days is past the light threshold (30) but well under the deep threshold (90),
  // and there is no churn signal, so the deep-tier pick must be null.
  const cursors = { 'checkout-flow': { lastDeepAuditMs: now - 31 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'deep', signals: {} });
  assert.strictEqual(result, null);
});

test('selectTarget picks the highest-churn journey via the signals injection hook', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  const now = Date.now();
  const cursors = {
    'checkout-flow': { lastLightAuditMs: now - 1 * 86400000 },
    'signup-flow': { lastLightAuditMs: now - 1 * 86400000 },
  };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: { 'checkout-flow': 5, 'signup-flow': 2 } });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 5);
});

test('selectTarget returns null when no candidate is stale and none has churn', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now - 1 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {} });
  assert.strictEqual(result, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/journey-health/tests/scope.test.js`
Expected: FAIL — `Cannot find module '../scope'`.

- [ ] **Step 3: Write scope.js**

Create `bin/lib/journey-health/scope.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS_LIGHT, STALE_DAYS_DEEP } = require('./score');

// ─── parseJourneyFiles ───────────────────────────────────────────────────────
// Extracts a journey file's `files:` frontmatter list, e.g.:
//   ---
//   files:
//     - src/checkout/Cart.tsx
//   ---
// Returns [] if there's no frontmatter, no `files:` key, or no list items —
// an unparseable header means "no declared domain," not an error.
function parseJourneyFiles(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const filesIdx = frontmatter.findIndex((l) => /^files:\s*$/.test(l));
  if (filesIdx === -1) return [];
  const paths = [];
  for (let i = filesIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    paths.push(m[1]);
  }
  return paths;
}

// ─── listJourneys ────────────────────────────────────────────────────────────
// Returns [{ kind: 'journey', id, path, filesFrontmatter }] for each
// docs/journeys/*.md file, sorted by id. Empty array if the directory doesn't
// exist — a project with no journeys yet is a valid state, not an error.
function listJourneys(root) {
  const dir = path.join(root, 'docs', 'journeys');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const filePath = path.join(dir, e.name);
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* unreadable -> no files */ }
      return { kind: 'journey', id: e.name.slice(0, -3), path: filePath, filesFrontmatter: parseJourneyFiles(content) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms). Returns
// 0 (not an error) when git is unavailable, paths don't exist, or there is no
// churn — the caller treats 0 as "nothing changed," not a failure signal.
function domainChurn(root, relPaths, sinceMs) {
  if (!relPaths || relPaths.length === 0) return 0;
  try {
    const since = new Date(sinceMs || 0).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...relPaths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// ─── selectTarget ────────────────────────────────────────────────────────────
// opts: { now?: number, tier?: 'light'|'deep', signals?: { [id]: number } }
// Returns { kind: 'journey', id, path, filesFrontmatter, why: 'stale'|'hotspot', ... } or null.
// Light and deep tiers use independent staleness thresholds and independent
// cursor fields (lastLightAuditMs vs lastDeepAuditMs) — a journey force-picked
// as light-stale is not automatically deep-stale too, and vice versa.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const tier = opts.tier === 'deep' ? 'deep' : 'light';
  const signals = opts.signals || null; // test injection hook — churn override by id
  const staleDays = tier === 'deep' ? STALE_DAYS_DEEP : STALE_DAYS_LIGHT;
  const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';

  const candidates = listJourneys(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any journey unaudited on this tier past staleDays.
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id];
    const lastAuditedMs = cursor && cursor[auditField] != null ? cursor[auditField] : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > staleDays) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by churn on filesFrontmatter
  // since last audit on this tier.
  const scored = [];
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id] || {};
    const sinceMs = cursor[auditField] || 0;
    const churn = signals ? (signals[candidate.id] || 0) : domainChurn(root, candidate.filesFrontmatter, sinceMs);
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = { parseJourneyFiles, listJourneys, domainChurn, selectTarget };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/journey-health/tests/scope.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add bin/lib/journey-health/scope.js bin/lib/journey-health/tests/scope.test.js
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add scope.js (journey discovery + tier-aware selection)"
```

### Task 8: journey-health engine — fingerprint, dedup, validate-finding, issue-payload

**Files:**
- Create: `bin/lib/journey-health/fingerprint.js`
- Create: `bin/lib/journey-health/dedup.js`
- Create: `bin/lib/journey-health/validate-finding.js`
- Create: `bin/lib/journey-health/issue-payload.js`
- Test: `bin/lib/journey-health/tests/fingerprint.test.js`, `dedup.test.js`, `validate-finding.test.js`, `issue-payload.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces the journey-health Finding Shape (used by Task 9's CLI and Task 10's SKILL.md): `{ journey, category: 'drift'|'coverage'|'regression-suspected', section: 'files-frontmatter'|'self-review'|'coverage'|'live-check', description, reason, confidence: 'high'|'med'|'low', recommendation }`. `fingerprint({ journey, category, section, description })` → `journeyhealth-{8 hex}`. `decide(finding, issueIndex, cache)` → `{ action: 'file'|'skip'|'suppress', issue? }`. `validateFinding(obj)` → `{ ok, value|errors }`. `toIssuePayload(finding)` → `{ id, journey, category, section, confidence, title, body, labels }`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/journey-health/tests/fingerprint.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../fingerprint');

test('fingerprint is stable for identical input', () => {
  const args = { journey: 'checkout-flow', category: 'drift', section: 'self-review', description: 'Persona is a placeholder' };
  assert.strictEqual(fingerprint(args), fingerprint(args));
});

test('fingerprint differs when journey differs', () => {
  const base = { category: 'drift', section: 'self-review', description: 'x' };
  assert.notStrictEqual(
    fingerprint({ ...base, journey: 'checkout-flow' }),
    fingerprint({ ...base, journey: 'signup-flow' }),
  );
});

test('fingerprint is stable across cosmetic rewording (whitespace/case)', () => {
  const base = { journey: 'checkout-flow', category: 'drift', section: 'self-review' };
  const a = fingerprint({ ...base, description: 'Persona is a placeholder' });
  const b = fingerprint({ ...base, description: '  persona   IS a Placeholder  ' });
  assert.strictEqual(a, b);
});

test('fingerprint starts with the journeyhealth- prefix', () => {
  const fp = fingerprint({ journey: 'checkout-flow', category: 'drift', section: 'self-review', description: 'x' });
  assert.match(fp, /^journeyhealth-[0-9a-f]{8}$/);
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   Bar  '), 'foo bar');
});
```

Create `bin/lib/journey-health/tests/dedup.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 7 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 7 });
});

test('decide skips when the matching issue is closed (assumed resolved)', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'closed', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 7 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'journeyhealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked staged (avoid re-filing while unresolved)', () => {
  const cache = { 'journeyhealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'skip' });
});
```

Create `bin/lib/journey-health/tests/validate-finding.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validFinding(overrides = {}) {
  return {
    journey: 'checkout-flow',
    category: 'drift',
    section: 'self-review',
    description: 'Persona is a placeholder',
    reason: 'Step 2 says "User clicks Buy" with no named persona',
    confidence: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('validateFinding accepts a complete valid finding', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.journey, 'checkout-flow');
});

test('validateFinding rejects a non-object', () => {
  assert.strictEqual(validateFinding(null).ok, false);
  assert.strictEqual(validateFinding('x').ok, false);
});

test('validateFinding rejects a missing required string', () => {
  const f = validFinding();
  delete f.reason;
  const result = validateFinding(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('reason:')));
});

test('validateFinding rejects an invalid category', () => {
  const result = validateFinding(validFinding({ category: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an invalid section', () => {
  const result = validateFinding(validFinding({ section: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('section:')));
});

test('validateFinding rejects an invalid confidence', () => {
  const result = validateFinding(validFinding({ confidence: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence:')));
});

test('validateFinding accepts all three valid categories', () => {
  for (const category of ['drift', 'coverage', 'regression-suspected']) {
    assert.strictEqual(validateFinding(validFinding({ category })).ok, true, category);
  }
});
```

Create `bin/lib/journey-health/tests/issue-payload.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function finding(overrides = {}) {
  return {
    id: 'journeyhealth-abc12345',
    journey: 'checkout-flow',
    category: 'drift',
    section: 'files-frontmatter',
    description: 'files: entry no longer exists',
    reason: 'src/checkout/OldCart.tsx was deleted in a1b2c3d',
    confidence: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('toIssuePayload embeds the fingerprint marker in the body', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('<!-- journey-health-fingerprint: journeyhealth-abc12345 -->'));
});

test('toIssuePayload builds a title from category and section', () => {
  const payload = toIssuePayload(finding());
  assert.strictEqual(payload.title, 'Journey drift: checkout-flow — files-frontmatter');
});

test('toIssuePayload maps regression-suspected to the "regression" title label', () => {
  const payload = toIssuePayload(finding({ category: 'regression-suspected', section: 'live-check' }));
  assert.strictEqual(payload.title, 'Journey regression: checkout-flow — live-check');
});

test('toIssuePayload sets both the journey-health label and a category-specific label', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['journey-health', 'journey-health:drift']);
});

test('toIssuePayload includes description, reason, and recommendation in the body', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('files: entry no longer exists'));
  assert.ok(payload.body.includes('src/checkout/OldCart.tsx was deleted in a1b2c3d'));
  assert.ok(payload.body.includes('Run /claude-tweaks:journeys checkout-flow'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/journey-health/tests/fingerprint.test.js bin/lib/journey-health/tests/dedup.test.js bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js`
Expected: FAIL — `Cannot find module '../fingerprint'` (and the other three modules).

- [ ] **Step 3: Write fingerprint.js**

Create `bin/lib/journey-health/fingerprint.js`:

```js
'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from journey + category + section + normalized description.
function fingerprint({ journey, category, section, description }) {
  const basis = JSON.stringify([journey, category, section, normalizeDescription(description)]);
  return 'journeyhealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 4: Write dedup.js**

Create `bin/lib/journey-health/dedup.js`:

```js
'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label journey-health` output.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user dismissed this exact proposal)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
//
// journey-health never applies anything itself, so there is no 'applied'
// cache status to check (unlike harness-health's pre-existing cache entries).
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

- [ ] **Step 5: Write validate-finding.js**

Create `bin/lib/journey-health/validate-finding.js`:

```js
'use strict';

// Validates a journey-health finding against the Finding Shape documented in
// skills/journey-health/SKILL.md. Returns { ok:true, value } or
// { ok:false, errors:string[] }.

const CATEGORY_VALUES = new Set(['drift', 'coverage', 'regression-suspected']);
const SECTION_VALUES = new Set(['files-frontmatter', 'self-review', 'coverage', 'live-check']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['journey', 'category', 'section', 'description', 'reason', 'confidence', 'recommendation'];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }
  if (typeof obj.section === 'string' && !SECTION_VALUES.has(obj.section)) {
    errors.push(`section: must be one of ${[...SECTION_VALUES].join('|')} (got "${obj.section}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = { validateFinding, CATEGORY_VALUES, SECTION_VALUES, CONFIDENCE_VALUES };
```

- [ ] **Step 6: Write issue-payload.js**

Create `bin/lib/journey-health/issue-payload.js`:

```js
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.

const CATEGORY_LABELS = { drift: 'drift', coverage: 'coverage', 'regression-suspected': 'regression' };

function toIssuePayload(finding) {
  const marker = `<!-- journey-health-fingerprint: ${finding.id} -->`;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const body = [
    marker,
    '',
    `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Confidence:** ${finding.confidence}`,
    '',
    '## Description',
    '',
    finding.description,
    '',
    '## Evidence',
    '',
    finding.reason,
    '',
    '## Recommended Action',
    '',
    finding.recommendation,
    '',
    '_Filed by `/claude-tweaks:journey-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  const title = `Journey ${categoryLabel}: ${finding.journey} — ${finding.section}`;

  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    confidence: finding.confidence,
    title,
    body,
    labels: ['journey-health', `journey-health:${finding.category}`],
  };
}

module.exports = { toIssuePayload };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test bin/lib/journey-health/tests/fingerprint.test.js bin/lib/journey-health/tests/dedup.test.js bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js`
Expected: PASS, all tests.

- [ ] **Step 8: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add bin/lib/journey-health/fingerprint.js bin/lib/journey-health/dedup.js bin/lib/journey-health/validate-finding.js bin/lib/journey-health/issue-payload.js bin/lib/journey-health/tests/fingerprint.test.js bin/lib/journey-health/tests/dedup.test.js bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add fingerprint/dedup/validate-finding/issue-payload"
```

### Task 9: journey-health engine — bin/journey-health.js CLI

**Files:**
- Create: `bin/journey-health.js`
- Test: `bin/lib/journey-health/tests/cli-next-target.test.js`, `cli-validate-findings.test.js`, `cli-mark.test.js`
- Modify: `package.json` (test script glob)

**Interfaces:**
- Consumes: everything from Tasks 6-8 (`cache.js`, `scope.js`, `fingerprint.js`, `dedup.js`, `validate-finding.js`, `issue-payload.js`, `score.js`).
- Produces: the `journey-health.js` CLI — `next-target [--target <id>] [--tier light|deep] [--budget <n>] [--root <dir>]`, `validate-findings <file> [--target <id>] [--tier light|deep] [--coverage-scan] [--issues <file>] [--run-id <id>] [--root <dir>] [--dry-run]`, `mark <fingerprint> declined [--root <dir>]`, `churn-report [--fail-on-high-churn <r>]` — Task 10/11's `skills/journey-health/SKILL.md` shells out to this CLI exactly as `harness-health/SKILL.md` shells out to `bin/harness-health.js`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/journey-health/tests/cli-next-target.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-next-')); }

function writeJourney(root, name) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\nfiles:\n  - src/${name}.tsx\n---\n\n# ${name}\n`, 'utf8');
}

test('next-target returns null target and coverageScanDue:true when no journeys exist yet', () => {
  const root = tmp();
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target, null);
  assert.strictEqual(result.coverageScanDue, true);
});

test('next-target defaults to the light tier and force-picks a never-audited journey', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'checkout-flow');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --target bypasses selection with why: "manual"', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  writeJourney(root, 'signup-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--target', 'signup-flow', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'signup-flow');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --tier deep uses the deep-tier cursor field', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--tier', 'deep', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'checkout-flow');
  assert.strictEqual(result.target.why, 'stale');
});
```

Create `bin/lib/journey-health/tests/cli-validate-findings.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-validate-')); }

function finding(overrides = {}) {
  return {
    journey: 'checkout-flow', category: 'drift', section: 'self-review',
    description: 'Persona is a placeholder', reason: 'Step 2 has no named persona',
    confidence: 'high', recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('validate-findings files a brand-new valid finding and persists a cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  const raw = execFileSync('node', [CLI, 'validate-findings', findingsFile, '--target', 'checkout-flow', '--tier', 'light', '--root', root], { encoding: 'utf8' });
  const payloads = JSON.parse(raw);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(payloads[0].journey, 'checkout-flow');
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json'), 'utf8'));
  assert.ok(cursors['checkout-flow'].lastLightAuditMs);
});

test('validate-findings drops an invalid finding and reports 0 payloads', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding({ category: 'bogus' })]));
  const raw = execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(raw), []);
});

test('validate-findings --dry-run does not write cursor or cache state', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  execFileSync('node', [CLI, 'validate-findings', findingsFile, '--target', 'checkout-flow', '--dry-run', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json')), false);
});

test('validate-findings --coverage-scan records the coverage-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding({ category: 'coverage', section: 'coverage' })]));
  execFileSync('node', [CLI, 'validate-findings', findingsFile, '--coverage-scan', '--root', root], { encoding: 'utf8' });
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json'), 'utf8'));
  assert.ok(cursors.__coverageScan.lastScannedMs);
});

test('a finding marked declined is suppressed by a later validate-findings run on the same fingerprint', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  const first = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(first.length, 1, 'first run must file the finding');
  const fp = first[0].id;
  execFileSync('node', [CLI, 'mark', fp, 'declined', '--root', root], { encoding: 'utf8' });
  const second = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(second.length, 0, 'declined finding must be suppressed on the next run');
});

test('validate-findings exits non-zero for a missing findings file argument', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'validate-findings', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
```

Create `bin/lib/journey-health/tests/cli-mark.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-mark-')); }

test('mark writes a declined status to the cache', () => {
  const root = tmp();
  execFileSync('node', [CLI, 'mark', 'journeyhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['journeyhealth-xyz98765'].status, 'declined');
});

test('mark exits non-zero for an invalid status (journey-health never had "applied")', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'journeyhealth-abc12345', 'applied', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark exits non-zero when the fingerprint arg is missing', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/journey-health/tests/cli-next-target.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-mark.test.js`
Expected: FAIL — `bin/journey-health.js` does not exist yet (`execFileSync` throws `ENOENT`).

- [ ] **Step 3: Write bin/journey-health.js**

Create `bin/journey-health.js`:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/journey-health/fingerprint');
const {
  readCache, writeCache, readCursors, recordAudit,
  readCoverageScanCursor, recordCoverageScan, recordRun, readRuns, computeChurn,
} = require('./lib/journey-health/cache');
const { decide } = require('./lib/journey-health/dedup');
const { validateFinding } = require('./lib/journey-health/validate-finding');
const { toIssuePayload } = require('./lib/journey-health/issue-payload');
const { selectTarget, listJourneys } = require('./lib/journey-health/scope');
const { STALE_DAYS_LIGHT } = require('./lib/journey-health/score');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString(), tier: 'light' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--tier') args.tier = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--coverage-scan') args.coverageScan = true;
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[journey-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[journey-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();
  const tier = args.tier === 'deep' ? 'deep' : 'light';
  const coverageScan = readCoverageScanCursor(root);
  const coverageScanDue = coverageScan.lastScannedMs == null || (now - coverageScan.lastScannedMs) / 86400000 > STALE_DAYS_LIGHT;

  if (args.target) {
    const found = listJourneys(root).find((t) => t.id === args.target) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target, coverageScanDue }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readCursors(root);

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now, tier });
    process.stdout.write(JSON.stringify({ target, coverageScanDue }, null, 2) + '\n');
    return;
  }

  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different journey (mirrors harness-health's next-target --budget).
  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now, tier });
    if (!target) break;
    targets.push(target);
    const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';
    cursors = { ...cursors, [target.id]: { ...(cursors[target.id] || {}), [auditField]: now } };
  }
  process.stdout.write(JSON.stringify({ targets, coverageScanDue }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: journey-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--tier light|deep] [--coverage-scan] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  const survivors = [];
  for (const f of raw) {
    const v = validateFinding(f);
    if (!v.ok) {
      process.stderr.write(
        `[journey-health] validate-findings: dropped finding for journey "${(f && f.journey) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      journey: v.value.journey,
      category: v.value.category,
      section: v.value.section,
      description: v.value.description,
    });
    survivors.push({ ...v.value, id });
  }

  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    if (args.target) recordAudit(root, args.target, args.tier === 'deep' ? 'deep' : 'light', {});
    if (args.coverageScan) recordCoverageScan(root, {});
    recordRun(root, args.runId, [...seen]);
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[journey-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readRuns(root);
  if (runs.length === 0) {
    process.stdout.write('no run logs found\n');
    return;
  }
  const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
  const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
  let exceeded = false;
  for (let i = 0; i < runs.length; i++) {
    const prior = i > 0 ? runs[i - 1] : null;
    const c = computeChurn(runs[i].fingerprints, prior);
    rows.push([
      runs[i].runId,
      (runs[i].runAt || '').slice(0, 19),
      String(runs[i].fingerprints.length),
      String(c.appeared.length),
      String(c.disappeared.length),
      String(c.ratio),
    ]);
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
  }
  if (exceeded) {
    process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
    process.exit(1);
  }
}

const MARK_STATUSES = new Set(['declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: journey-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  process.stderr.write(
    'usage: journey-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--tier light|deep] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--tier light|deep] [--coverage-scan], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/journey-health/tests/cli-next-target.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-mark.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Wire journey-health's tests into the npm test script**

In `package.json`, find:

```json
    "test": "node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js"
```

Replace with:

```json
    "test": "node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js"
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all tests including every `bin/lib/journey-health/tests/*.test.js` file.

- [ ] **Step 7: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add bin/journey-health.js bin/lib/journey-health/tests/cli-next-target.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-mark.test.js package.json
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add bin/journey-health.js CLI, wire into npm test"
```

### Task 10: journey-health skill — light tier, coverage scan, filing, routine template

**Files:**
- Create: `skills/journey-health/SKILL.md`
- Create: `skills/journey-health/routine-template.yml`

**Interfaces:**
- Consumes: `bin/journey-health.js`'s `next-target`/`validate-findings` commands (Task 9); `_shared/journey-self-review.md` (Task 4); `_shared/journey-coverage-check.md` (Task 5).
- Produces: a complete, working light-tier-only watchman skill. Task 11 adds the deep tier (`--deep`) as an additive extension — this task's file must stand alone and be fully functional without it.

- [ ] **Step 1: Write skills/journey-health/SKILL.md**

Create `skills/journey-health/SKILL.md`:

```markdown
---
name: claude-tweaks:journey-health
description: Use when you want to check whether docs/journeys/*.md files still accurately describe the codebase and still back reliable agent e2e testing — picks one journey to audit (or the coverage scan, when due), judges it via file-existence + self-review + coverage checks, and always files a journey-health-labelled GitHub issue. Runs standalone or on a schedule via a Routine. Never edits journeys, stories, or code. Keywords - journey health, journey drift, journey staleness, agent e2e testing, coverage gap, scheduled, routine.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Journey Health — Keep Journeys Honest for Agent E2E Testing

A recurring watchman for `docs/journeys/*.md`: picks one journey to audit against the codebase, judges it, and always files a `journey-health`-labelled GitHub issue. Never edits journey files, stories, or code — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`.

```
              [ /claude-tweaks:journey-health ] <- utility (no fixed lifecycle position)
                           |  next-target picks a journey; coverage scan runs when due
                           v
file-existence + self-review + coverage -> finding -> validate-findings -> file GitHub issue
```

## When to Use

- You want journey documentation to stay accurate — and the QA stories/agent e2e checks built on it to stay trustworthy — without manually re-walking every journey.
- You want a scheduled Routine that periodically rotates through journeys and flags drift or coverage gaps as they're found.
- You want to check one specific journey right now (`--target <name>`).

Not for: creating or updating journey content (`/claude-tweaks:journeys`' job) or generating story coverage (`/claude-tweaks:stories`' job) — this skill only judges and files; it never writes to `docs/journeys/` or the stories directory itself.

## Input

`$ARGUMENTS` may contain:

- `--target <journey-name>` — manual override: audit one specific journey directly, bypassing `next-target` selection.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` journeys in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next journey.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: {...}|null, coverageScanDue: boolean }`. With `--budget <n>` where `n > 1`, prints `{ targets: [...], coverageScanDue: boolean }` instead — run Steps 2-6 once per entry before moving on.

Read the `why` field on whichever target came back:
- If `target` is `null` and `coverageScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this journey has not been audited in over 30 days regardless of churn.
- `why: "hotspot"` — this journey's `files:` frontmatter paths have the highest git churn since its last light-tier audit among journeys with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

If `target` is `null` but `coverageScanDue` is `true`, skip straight to Step 3 (coverage scan) — the coverage scan is still due even with nothing else to audit.

**Step 2 — LIGHT TIER JUDGE (when a target was selected).**

Read the target's journey file (`target.path`) in full.

1. **File-existence check.** For each path in `target.filesFrontmatter`, check whether it still exists in the repo (`Read` or a quick `test -f`). For each missing path, emit a finding: `{ journey: target.id, category: "drift", section: "files-frontmatter", description: "files: entry '{path}' no longer exists", reason: "<how you confirmed it's missing>", confidence: "high", recommendation: "Run /claude-tweaks:journeys {target.id} to prune the dead entry" }`.
2. **Self-review criteria.** Apply the four checks (and the structural-validity check) in `_shared/journey-self-review.md` against the journey file's actual content. For each violated check, emit a finding: `{ journey: target.id, category: "drift", section: "self-review", description: "<which check failed and why>", reason: "<the specific text/evidence>", confidence: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} to fix {check name}" }`. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) always gets `confidence: "high"`.

Collect all findings from both checks (may be zero, one, or several) into a JSON array.

**Step 3 — COVERAGE SCAN (when `coverageScanDue`, per Step 1).**

Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `description: "Story '{storyId}' matches journey '{journey}' but has no journey: field"`, `recommendation: "Add journey: {journey} to {storyFile}"`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).

Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).

Write the full findings array (from Steps 2 and 3 combined) to `/tmp/journey-health-findings.json`. If neither step produced any findings, write `[]`.

**Step 4 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label journey-health --state all --json number,state,labels,body --limit 500 > /tmp/journey-health-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- journey-health-fingerprint: journeyhealth-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/journey-health-issues.json`. If `gh` is unavailable or the repo has no `journey-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" validate-findings /tmp/journey-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} \
  ${COVERAGE_SCAN_RAN:+--coverage-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/journey-health-payloads.json
```

`TARGET_ID` is `target.id` from Step 1 (omit if Step 1 returned `target: null` and only the coverage scan ran). `COVERAGE_SCAN_RAN` is passed whenever Step 3 actually ran this firing. The command validates each finding, fingerprints via `journey + category + section + normalizedDescription`, dedups against open `journey-health` issues and the local cache, records the light-tier cursor for `TARGET_ID` (and the coverage-scan cursor when `--coverage-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 6 — FILE.**

For each payload in `/tmp/journey-health-payloads.json`: `gh issue create --title "<payload.title>" --body "<payload.body>" --label journey-health --label "<payload.labels[1]>"`. `/journey-health` never edits journey files, stories, or code — every finding files, unconditionally.

In `--dry-run` mode, print what would be filed but do not call `gh`.

In interactive mode, render surviving findings as a markdown batch table before filing:

```
| # | Journey | Category | Section | Confidence | Recommendation |
|---|---------|----------|---------|------------|----------------|
| 1 | {journey} | {category} | {section} | {confidence} | {recommendation} |
```

Then call `AskUserQuestion` with `question`: `"File these findings as GitHub issues?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a journey-health-labelled GitHub issue"`
- Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {journey}/{section}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub journey-health issue"`
- Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

**Step 7 — SUMMARIZE.**

Report: which journey (if any) was audited, whether the coverage scan ran, how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

## Routine Configuration

`/journey-health` ships a routine template (`skills/journey-health/routine-template.yml`) designed for small, predictable sips: one journey per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create journey-health
```

**Headless run flow:** SELECT(`next-target`) → LIGHT TIER JUDGE → COVERAGE SCAN (when due) → validate-findings → file. A firing with nothing due (`target: null`, `coverageScanDue: false`) is a cheap no-op.

Report-only, matching `/code-health` and `/harness-health` — every finding files as a `journey-health`-labelled GitHub issue, with no `Edit` in `allowed_tools`.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create journey-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one journey"`, `description`: `"/claude-tweaks:journey-health --target <name> — audit one specific journey right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed journey-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:journey-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing a journey file, story YAML, or code directly | `/journey-health` only ever judges and files — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`. |
| Treating a `files:` entry that exists but is content-stale the same as a missing one | Missing-on-disk is a mechanical, high-confidence file-existence finding. Content drift (the step no longer matches what the file does) is a self-review or deep-tier finding, not a file-existence one — don't conflate the two `section` values. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the coverage scan because a per-journey target was already selected this firing | The coverage scan is a decoupled, whole-library check (its own cursor) — run it whenever `coverageScanDue` is true, independent of which single journey `next-target` picked. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/code-health`/`/harness-health`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:journeys` | Produces and updates the journey files this skill audits. `/journey-health` never edits them — it files an issue recommending `/claude-tweaks:journeys {name}` be re-run. Shares `_shared/journey-self-review.md`'s four checks (write-time here, audit-time in `/journey-health`). |
| `/claude-tweaks:stories` | Produces the QA story YAMLs this skill's coverage scan checks against. Coverage-gap findings recommend `/claude-tweaks:stories journey={name}`. |
| `/claude-tweaks:review` | Shares `_shared/journey-coverage-check.md`'s coverage computation with lens `3g-cov` — `/review`'s lens stays inline/informational; this skill adds cursor-tracking and issue-filing on top. |
| `/claude-tweaks:routine` | `/routine create journey-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `journey-health`-labelled issues alongside `code-health`/`harness-health` ones, using the same stale/superseded triage. |
| `/claude-tweaks:triage` | Filed `journey-health` issues resolve through `/triage dispatch` → `/flow`, or manually — same path `code-health`/`harness-health` issues already take. |
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5. |
| `_shared/journey-coverage-check.md` | Canonical coverage computation this skill's coverage scan applies — shared with `/claude-tweaks:review`'s `3g-cov` lens. |
```

- [ ] **Step 2: Write skills/journey-health/routine-template.yml**

Create `skills/journey-health/routine-template.yml`:

```yaml
template_version: 1
routine_name: journey-health-daily
prompt: "/claude-tweaks:journey-health"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob]
mcp_connections: []
default_schedule:
  cron_expression: "0 4 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Report-only, like code-health and harness-health — no Edit in allowed_tools,
  nothing auto-applies. Light-tier checks only (file-existence, self-review,
  coverage scan); the deep tier is interactive-only (`--deep`) until a
  validation spike confirms cloud-Routine feasibility for a background dev
  server + agent-browser session. See journey-health/SKILL.md's Step 4
  (added once the deep tier ships) for details.
```

- [ ] **Step 3: Verify the skill file is internally consistent**

Run: `grep -n "^## \|^\*\*Step" skills/journey-health/SKILL.md`
Expected: a clean list of section headers (`When to Use`, `Input`, `Workflow`, `Routine Configuration`, `Next Actions`, `Component-Skill Contract`, `Anti-Patterns`, `Relationship to Other Skills`) and Steps 1-7 in order, no gaps or duplicate numbers.

- [ ] **Step 4: Trace Step 1's next-target call against Task 9's actual CLI output shape**

Run: `node bin/journey-health.js next-target --root .` from the worktree root (no journeys exist in this repo, so this exercises the empty-state path).
Expected: `{ "target": null, "coverageScanDue": true }` — matches Step 1's documented "nothing is due" / "coverage scan still due" branch exactly (this repo's first-ever run has never recorded a coverage-scan cursor).

- [ ] **Step 5: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add skills/journey-health/SKILL.md skills/journey-health/routine-template.yml
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add SKILL.md (light tier + coverage scan) and routine template"
```

### Task 11: journey-health skill — deep tier (`--deep`, live checks, drift-vs-regression)

**Files:**
- Modify: `skills/journey-health/SKILL.md` (Input, insert Step 3.5, replace Step 5 and Step 6's opening, Anti-Patterns, Relationship table)
- Modify: `skills/journey-health/routine-template.yml` (fix the Step reference in `notes`)

**Interfaces:**
- Consumes: `bin/journey-health.js next-target --tier deep` and `validate-findings --tier deep` (already supported by Task 9's CLI — no engine changes needed here); `/claude-tweaks:test`, `/claude-tweaks:visual-review`, `_shared/dev-url-detection.md`.
- Produces: `--deep` as a documented, working flag. Light-tier and deep-tier findings now go through two independent `validate-findings` calls (see Step 5 below) — this is a correctness fix over Task 10's single-call Step 5, which never had a deep-tier finding to account for.

- [ ] **Step 1: Add `--deep` to the Input section**

In `skills/journey-health/SKILL.md`'s `## Input` list, find:

```markdown
- `--root <dir>` — audit a project elsewhere (default: current working directory).
```

Replace with:

```markdown
- `--root <dir>` — audit a project elsewhere (default: current working directory).
- `--deep` — also run the deep tier (Step 3.5): actually execute the selected journey's QA stories or walk it live, catching drift/regressions a static check can't. Interactive only — no scheduled Routine drives this yet (see Routine Configuration).
```

- [ ] **Step 2: Insert Step 3.5 between Step 3 and Step 4**

Find the boundary between Step 3 (ends with `... per the shared fragment).` and its closing sentence about combining findings) and `**Step 4 — GATHER OPEN ISSUES for dedup.**`. Specifically, find:

```markdown
Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).

Write the full findings array (from Steps 2 and 3 combined) to `/tmp/journey-health-findings.json`. If neither step produced any findings, write `[]`.

**Step 4 — GATHER OPEN ISSUES for dedup.**
```

Replace with:

```markdown
Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).

Write the combined Steps 2-3 findings array to `/tmp/journey-health-findings-light.json`. If neither step produced any findings, write `[]`.

**Step 3.5 — DEEP TIER (only when `--deep` was passed).**

Re-resolve the target for the deep tier — deep and light tiers use independent cursors, so re-run Step 1's `next-target` call with `--tier deep` (this may select a different journey than Step 1's light-tier pick, or the same one, depending on each tier's own churn/staleness state):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" next-target --root . --tier deep ${TARGET:+--target "$TARGET"}
```

If `target` is `null`, report "nothing due for the deep tier" and skip the rest of this step.

**Skip condition:** read the selected journey's `files:` frontmatter. If any entry doesn't exist on disk, skip the deep tier for this journey entirely — file-existence drift must be fixed (via the light tier's finding, already emitted in Step 2) before a live run is worth attempting. Do not advance the deep-tier cursor when skipping this way; log the gap.

Otherwise:

1. **Resolve a dev URL.** Follow `_shared/dev-url-detection.md` in auto mode — this starts an ephemeral server on a free port with no prompt when no server is already running and a dev command is known. Record whether this procedure started the server (`SERVER_STARTED`).
2. **Check for story coverage.** Read the stories directory for any story with `journey: {target.id}`.
   - Stories exist → drive `/claude-tweaks:test journey={target.id}` against the resolved dev URL.
   - No stories → fall back to `/claude-tweaks:visual-review journey:{target.id}` against the resolved dev URL.
3. **On failure, judge drift vs. regression** — don't assume either. Compare the failure evidence (a changed selector, a renamed route, a UI element that no longer exists) against the journey file's documented steps:
   - **Confirmed drift** (the app's structure changed and the journey/story text is what's stale): emit `{ journey: target.id, category: "drift", section: "live-check", description: "<what changed>", reason: "<the failure evidence>", confidence: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} — <what needs updating>" }`.
   - **Confirmed regression** (the app's actual behavior broke, journey/story text still accurately describes the intended flow): emit `{ journey: target.id, category: "regression-suspected", section: "live-check", description: "<what broke>", reason: "<the failure evidence>", confidence: "high"|"med", recommendation: "File as a product bug — journey/story text is accurate, the implementation regressed" }`.
   - If genuinely ambiguous, emit the drift-leaning finding with `confidence: "med"` and say so explicitly in `reason` — never silently pick one.
4. **Clean up.** If `SERVER_STARTED` is `true`, stop the ephemeral server now (`lsof -ti tcp:{port} | xargs kill`) — this is a standalone invocation with no `/wrap-up` to do it later, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule.

Write any Step 3.5 findings to `/tmp/journey-health-findings-deep.json` (or skip creating this file entirely if Step 3.5 didn't run or produced nothing).

**Step 4 — GATHER OPEN ISSUES for dedup.**
```

- [ ] **Step 3: Replace Step 5 to handle two independent validate-findings calls**

Find the entire `**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**` block (from that heading through the line ending `... emits gh-ready payloads on stdout.`). Replace with:

```markdown
**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**

Findings from Steps 2-3 (light tier) and Step 3.5 (deep tier) use different `--tier`/`--target` cursor keys and must never share one `validate-findings` call — each tier's own target needs its own cursor recorded independently (same discipline `/code-health`'s multi-slice `--budget` runs use: one call per distinct target).

Always run the light-tier call, even when its findings file is `[]`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" validate-findings /tmp/journey-health-findings-light.json \
  --root "${ROOT:-$PWD}" --tier light \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${LIGHT_TARGET_ID:+--target "$LIGHT_TARGET_ID"} \
  ${COVERAGE_SCAN_RAN:+--coverage-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/journey-health-payloads-light.json
```

Run the deep-tier call only when Step 3.5 actually ran and produced a findings file:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" validate-findings /tmp/journey-health-findings-deep.json \
  --root "${ROOT:-$PWD}" --tier deep \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  --target "$DEEP_TARGET_ID" \
  ${DRY_RUN:+--dry-run} \
  > /tmp/journey-health-payloads-deep.json
```

`LIGHT_TARGET_ID`/`DEEP_TARGET_ID` are the respective `target.id` values from Step 1 and Step 3.5 (omit `LIGHT_TARGET_ID` if Step 1 returned `target: null` and only the coverage scan ran; `DEEP_TARGET_ID` is required whenever the deep-tier call runs at all, since Step 3.5 always resolves a concrete journey before producing findings). Both commands validate, fingerprint, dedup, and record their own tier's cursor unless `--dry-run`, and both emit gh-ready payloads on stdout.
```

- [ ] **Step 4: Update Step 6 to file from both payload files**

Find the opening sentence of Step 6:

```markdown
For each payload in `/tmp/journey-health-payloads.json`: `gh issue create --title "<payload.title>" --body "<payload.body>" --label journey-health --label "<payload.labels[1]>"`. `/journey-health` never edits journey files, stories, or code — every finding files, unconditionally.
```

Replace with:

```markdown
For each payload in `/tmp/journey-health-payloads-light.json` and (when Step 3.5 ran) `/tmp/journey-health-payloads-deep.json`: `gh issue create --title "<payload.title>" --body "<payload.body>" --label journey-health --label "<payload.labels[1]>"`. `/journey-health` never edits journey files, stories, or code — every finding files, unconditionally.
```

- [ ] **Step 5: Add a deep-tier Anti-Patterns row**

In the `## Anti-Patterns` table, find the last row (the "Treating the local cache as durable state" row) and add a new row immediately after it:

```markdown
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |
```

- [ ] **Step 6: Add /test and /visual-review to the Relationship table**

In the `## Relationship to Other Skills` table, find the `/claude-tweaks:stories` row and add two new rows immediately after it:

```markdown
| `/claude-tweaks:test` | The deep tier drives `/test journey={name}` when stories exist for the selected journey — this is the "agent e2e testing" this skill exists to protect. |
| `/claude-tweaks:visual-review` | The deep tier falls back to `/visual-review journey:{name}` when no stories exist yet for the selected journey. |
```

- [ ] **Step 7: Fix the routine-template.yml Step reference**

In `skills/journey-health/routine-template.yml`, find:

```yaml
notes: >
  Report-only, like code-health and harness-health — no Edit in allowed_tools,
  nothing auto-applies. Light-tier checks only (file-existence, self-review,
  coverage scan); the deep tier is interactive-only (`--deep`) until a
  validation spike confirms cloud-Routine feasibility for a background dev
  server + agent-browser session. See journey-health/SKILL.md's Step 4
  (added once the deep tier ships) for details.
```

Replace with:

```yaml
notes: >
  Report-only, like code-health and harness-health — no Edit in allowed_tools,
  nothing auto-applies. Light-tier checks only (file-existence, self-review,
  coverage scan); the deep tier is interactive-only (`--deep`) until a
  validation spike confirms cloud-Routine feasibility for a background dev
  server + agent-browser session. See journey-health/SKILL.md's Step 3.5
  for details.
```

- [ ] **Step 8: Verify Step numbering and cross-references are consistent**

Run: `grep -n "^\*\*Step" skills/journey-health/SKILL.md`
Expected: `Step 1`, `Step 2`, `Step 3`, `Step 3.5`, `Step 4`, `Step 5`, `Step 6`, `Step 7`, in that order, no duplicates or gaps.

Run: `grep -n "journey-health-findings.json\|journey-health-payloads.json" skills/journey-health/SKILL.md`
Expected: no hits — Task 10's single-file names (`journey-health-findings.json`, `journey-health-payloads.json`, without `-light`/`-deep`) must not survive anywhere in the file after Steps 3, 5, and 6's edits.

- [ ] **Step 9: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add skills/journey-health/SKILL.md skills/journey-health/routine-template.yml
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: add deep tier (--deep, live checks, drift-vs-regression judgment)"
```

### Task 12: Cross-reference sweep — wire journey-health into the rest of the plugin

**Files:**
- Modify: `CLAUDE.md` (skill count, utility list, Commands section)
- Modify: `README.md` (new entry)
- Modify: `skills/help/reference-card.md` (new row)
- Modify: `skills/routine/SKILL.md` (Relationship table)
- Modify: `skills/journeys/SKILL.md` (Relationship table)
- Modify: `skills/review/SKILL.md` (Relationship table)
- Modify: `skills/test/SKILL.md` (Relationship table)
- Modify: `skills/visual-review/SKILL.md` (Relationship table)
- Modify: `skills/_shared/github-pr-scan.md` (repo-wide sweep)

**Interfaces:**
- Consumes: nothing new.
- Produces: no code interface — documentation only. This is the final task that makes `/claude-tweaks:journey-health` discoverable and fully wired into every place `/harness-health` already appears.

- [ ] **Step 1: CLAUDE.md — skill count and utility list**

Find:

```
### Skill directories (26 total)
```

Replace with:

```
### Skill directories (27 total)
```

Find:

```
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, triage
```

Replace with:

```
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage
```

- [ ] **Step 2: CLAUDE.md — Commands section**

Find:

```
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
```

Replace with:

```
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/ AND bin/lib/journey-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
node --test bin/lib/journey-health/tests/*.test.js   # Journey-health unit suite only
node bin/journey-health.js <cmd>     # Journey-health CLI: next-target, validate-findings, mark, churn-report
```

- [ ] **Step 3: README.md — new journey-health entry**

Find the harness-health bullet (already rewritten by Task 3):

```
**`/claude-tweaks:harness-health`** — Recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and always files a `harness-health`-labelled GitHub issue. Never edits anything directly (skills, rules, memory, or CLAUDE.md) — report-only, matching `/code-health`. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Memory (`~/.claude/projects/{slug}/memory/`) is audited only via an explicit `--kind memory --memory-dir <path>` invocation — never through the Routine's automatic rotation.
```

Add a new paragraph immediately after it:

```

**`/claude-tweaks:journey-health`** — Recurring watchman for `docs/journeys/*.md`: picks one journey to audit (or the decoupled coverage scan, when due), checks it against the codebase (file-existence, self-review criteria shared with `/claude-tweaks:journeys`, journey-story coverage shared with `/claude-tweaks:review`'s `3g-cov` lens), and always files a `journey-health`-labelled GitHub issue. A separate, interactive-only deep tier (`--deep`) actually runs the journey's QA stories via `/claude-tweaks:test` (or walks it live via `/claude-tweaks:visual-review` when no stories exist yet) and judges whether a failure means the journey/story text is stale or the app genuinely regressed. Never edits journeys, stories, or code — report-only, matching `/code-health` and `/harness-health`.
```

- [ ] **Step 4: reference-card.md — new row**

Find (the harness-health row, already rewritten by Task 3):

```
| `/claude-tweaks:harness-health` | Recurring watchman auditing `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <name>`, `--kind <skill\|rule\|claude-md\|design-artifact\|memory>`, `--memory-dir <path>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

Add a new row immediately after it:

```
| `/claude-tweaks:journey-health` | Recurring watchman auditing `docs/journeys/*.md` for drift and journey-story coverage gaps (light tier); an interactive-only deep tier actually runs a journey's QA stories or walks it live. Scheduled Routine (light tier only). Never edits anything — always files a GitHub issue. | `--target <name>`, `--deep`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 5: routine/SKILL.md — Relationship table**

Find:

```
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
```

Replace with:

```
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
| `/claude-tweaks:journey-health` | Fifth consumer — `skills/journey-health/routine-template.yml` audits `docs/journeys/*.md` for drift and coverage gaps (light tier only; the deep tier is interactive-only, pending a cloud-Routine feasibility spike). |
```

- [ ] **Step 6: journeys/SKILL.md — Relationship table**

Find:

```
| `_shared/diagram-integration-check.md` | Step 3.6 reads this for the flag check and signal→type mapping. Soft-hook only — emits a recommendation, never invokes the companion plugin. |
```

Add two new rows immediately after it:

```
| `/claude-tweaks:journey-health` | Applies the same `_shared/journey-self-review.md` checks at audit time, on journeys nobody has touched recently. Never edits — files a GitHub issue instead of the fix-inline/stage/BLOCK routing this skill uses. |
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria Step 3.5 applies — shared with `/claude-tweaks:journey-health`'s audit-time check. |
```

- [ ] **Step 7: review/SKILL.md — Relationship table**

Find:

```
| `/claude-tweaks:stories` | Generates the YAML stories that /test validates. /review consumes /test results (including QA) via `TEST_PASSED`. /review also checks journey-to-story coverage in code review lens 3g-cov — uncovered journey steps and orphaned stories are surfaced as informational findings. |
```

Add two new rows immediately after it:

```
| `/claude-tweaks:journey-health` | Shares `_shared/journey-coverage-check.md`'s coverage computation for its decoupled coverage-scan tier — /review's 3g-cov lens stays inline/informational; journey-health adds cursor-tracking and issue-filing on top. |
| `_shared/journey-coverage-check.md` | Canonical coverage computation lens 3g-cov applies — shared with `/claude-tweaks:journey-health`'s coverage scan. |
```

- [ ] **Step 8: test/SKILL.md — Relationship table**

Find:

```
| `/claude-tweaks:journeys` | /journeys feeds journey files into /stories which /test qa consumes; `journey={name}` filter lets /test run only the QA stories tied to a single journey. |
```

Add a new row immediately after it:

```
| `/claude-tweaks:journey-health` | The deep tier drives `/test journey={name}` when auditing a journey that has story coverage — this is the "agent e2e testing" journey-health exists to protect. |
```

- [ ] **Step 9: visual-review/SKILL.md — Relationship table**

Find:

```
| `/claude-tweaks:journeys` | /visual-review (journey mode) walks journeys created by /journeys. /visual-review (discover mode) creates new journey files. |
```

Add a new row immediately after it:

```
| `/claude-tweaks:journey-health` | The deep tier falls back to `/visual-review journey:{name}` when auditing a journey that has no story coverage yet. |
```

- [ ] **Step 10: github-pr-scan.md — add journey-health to the repo-wide sweep**

In `skills/_shared/github-pr-scan.md`, find (line 49):

```
Full sweep of open PRs, code-health-labelled issues, and harness-health-labelled issues.
```

Replace with:

```
Full sweep of open PRs, code-health-labelled issues, harness-health-labelled issues, and journey-health-labelled issues.
```

Find item 5 and the start of item 6:

```
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.
6. **Backlog issues** (only when this repo's CLAUDE.md sets `backlog-backend: github-issues` — read it directly from CLAUDE.md's `## Backlog integration` section, same as `/tidy` Steps 1/1.5; skip this item entirely under `local-files` or a missing flag) — write the query's output to a temp file, then classify each issue:
```

Replace with:

```
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.
6. **Journey-health issues** — `gh issue list --label journey-health --state open --json number,title,updatedAt,url`.
7. **Backlog issues** (only when this repo's CLAUDE.md sets `backlog-backend: github-issues` — read it directly from CLAUDE.md's `## Backlog integration` section, same as `/tidy` Steps 1/1.5; skip this item entirely under `local-files` or a missing flag) — write the query's output to a temp file, then classify each issue:
```

Find the two harness-health findings-table rows (already updated by Task 3's Step 3):

```
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest `/claude-tweaks:triage` or Capture — same as a still-valid code-health issue (harness-health never applies patches directly) |
```

Add two new rows immediately after them:

```
| Journey-health issue stale (>4 weeks, the referenced journey or its files: have since changed again) | Close (GitHub) — superseded |
| Journey-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to backlog |
```

Find:

```
Two collection prefixes for PR/code-health/harness-health findings, plus two conditional ones for backlog findings (`repo-wide` scope only, `backlog-backend: github-issues` only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
```

Replace with:

```
Two collection prefixes for PR/code-health/harness-health/journey-health findings, plus two conditional ones for backlog findings (`repo-wide` scope only, `backlog-backend: github-issues` only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health/journey-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
```

- [ ] **Step 11: Verify the full sweep**

Run: `grep -rln "journey-health" CLAUDE.md README.md skills/help/reference-card.md skills/routine/SKILL.md skills/journeys/SKILL.md skills/review/SKILL.md skills/test/SKILL.md skills/visual-review/SKILL.md skills/_shared/github-pr-scan.md skills/journey-health/SKILL.md`
Expected: every file listed appears in the output (all now mention journey-health).

Run: `npm test`
Expected: PASS, full suite (documentation-only changes shouldn't affect this, but confirms nothing else broke).

- [ ] **Step 12: Commit**

```bash
pwd
git -C "$(git rev-parse --show-toplevel)" add CLAUDE.md README.md skills/help/reference-card.md skills/routine/SKILL.md skills/journeys/SKILL.md skills/review/SKILL.md skills/test/SKILL.md skills/visual-review/SKILL.md skills/_shared/github-pr-scan.md
git -C "$(git rev-parse --show-toplevel)" commit -m "journey-health: wire into CLAUDE.md, README, reference-card, and sibling skills' relationship tables"
```

### Task 13: Validation spike — confirm cloud-Routine feasibility for the deep tier

**Independent of Tasks 1-12.** This task doesn't touch any code or file this plan created, and nothing in Tasks 1-12 depends on its outcome — `routine-template-deep.yml` (a scheduled/headless deep tier) is explicitly out of this plan's scope regardless of what the spike finds. Run this whenever a suitable target project (one with a real dev server) becomes available — before, during, or after Tasks 1-12. Its only consumer is a *future* plan: whether that future plan writes `skills/journey-health/routine-template-deep.yml` depends on this task passing.

**Files:** none in this repo. The spike runs against an external target project with a working dev server — this repo (claude-tweaks) has no UI to validate against.

**Interfaces:** none — this is an operational verification task, not a code change.

- [ ] **Step 1: Pick a target project**

Identify a project (not this repo) with a working `npm run dev`/equivalent dev-server command, reachable on localhost. Confirm you have `RemoteTrigger` access for it (the same access `/schedule`/`/routine` use).

- [ ] **Step 2: Author the spike's one-off routine prompt**

Write a minimal prompt — not a saved template, just the literal text for one `RemoteTrigger create` (or `/schedule`'s conversational flow) call:

```
Start this project's dev server in the background (use the command from
package.json's "dev" script, or CLAUDE.md's documented dev command). Wait
until it responds on its port (poll with a plain HTTP HEAD/GET check, up to
90 seconds). Then use agent-browser to navigate to the resolved URL and take
a screenshot. Report: did the server start, did agent-browser reach it, and
attach or describe the screenshot. Finally, stop the dev server
(`lsof -ti tcp:{port} | xargs kill`) before finishing.
```

- [ ] **Step 3: Fire it as a one-off run**

Use `RemoteTrigger`/`/schedule` to fire this prompt once against the target project (not on a recurring cron — a single manual run). This exercises the same `session_context`/`allowed_tools` shape a real `routine-template.yml` would use (`Bash`, plus whatever `agent-browser` needs).

- [ ] **Step 4: Inspect the result**

Read the firing's transcript/output. Confirm all three:
1. The dev server actually started and stayed up long enough to be reached (not killed by the sandbox, not blocked from binding a port).
2. `agent-browser` successfully navigated to the localhost URL and captured a screenshot (not a connection-refused or timeout).
3. The whole round-trip finished within the firing's time limit.

- [ ] **Step 5: Record the outcome**

If all three checks in Step 4 pass: the deep tier's cloud-execution assumption (documented in `docs/superpowers/specs/2026-07-11-journey-health-design.md`'s "Deep tier cloud-execution story" section) is confirmed. A future plan can add `skills/journey-health/routine-template-deep.yml` (light-vs-deep `--variant` pattern, mirroring `/tidy`'s `--variant=github-triage`) with confidence.

If any check fails: note exactly which one and why (sandbox killed the background process; port unreachable from `agent-browser`'s execution context; timeout). The deep tier stays interactive-only (`--deep`) indefinitely — Tasks 1-12's `journey-health/SKILL.md` and `routine-template.yml` already document this as the accepted fallback, so no further plan changes are needed regardless of outcome.

No commit for this task — it produces a decision record, not a file change in this repo. If you want the outcome preserved, add one sentence to `docs/superpowers/specs/2026-07-11-journey-health-design.md`'s "Deep tier cloud-execution story" section noting the result and date, and commit that single-line addition separately.


