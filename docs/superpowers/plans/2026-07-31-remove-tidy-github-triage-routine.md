# Remove tidy github-triage Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the tidy github-triage routine template and every piece of infrastructure that
exists only to serve it — the `/claude-tweaks:routine` `--variant` mechanism, tidy's Evidence
tier/Rolling digest/Notification logic, and the `tidy-routine-autonomy` policy key — while
preserving Archival compaction (unrelated, runs on every Standalone-auto tidy firing) by
inlining it into `skills/tidy/SKILL.md`.

**Architecture:** This is a documentation/config removal, not new code. Two files get deleted
outright; one array entry and one hardcoded test count change in `bin/lib/`; the rest is
find-and-replace across markdown skill files, each edit backed by the exact literal old/new text
below. Every task touches a disjoint set of files, so tasks have no ordering dependency on each
other — the final task's repo-wide grep sweep is what confirms they all landed consistently.

**Tech Stack:** Node.js (`bin/lib/policy-schema.js`), `node --test` (`tests/`), Markdown skill
files.

**Design doc:** `docs/superpowers/specs/2026-07-31-remove-tidy-github-triage-routine-design.md`
— read it for full rationale; this plan only restates what's needed to execute.

## Global Constraints

- Test runner is `node --test tests/` via `npm test` — run it after every task, must stay green.
- No emojis in any file.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes).
- Version bump convention: patch for fixes/removals, minor for feature additions — this is a
  removal, so patch (Task 8).
- Do not touch any file under `docs/superpowers/specs/` or `docs/superpowers/plans/` (including
  this plan and its design doc) when running verification greps — those are permanent historical
  record per this repo's own CLAUDE.md convention, and will legitimately still mention
  `github-triage`/`--variant` in their own prose describing this change.
- This plan runs inside the `worktree-remove-tidy-github-triage-routine` git worktree — do not
  `cd` elsewhere; every path below is relative to the worktree root.

---

### Task 1: Remove the `tidy-routine-autonomy` policy key (code + test)

**Files:**
- Modify: `bin/lib/policy-schema.js`
- Modify: `tests/policy-schema.test.js`
- Modify: `skills/_shared/policy-schema.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume — `POLICY_KEYS` has no reference to
  `tidy-routine-autonomy` after this task, which Task 8's final grep sweep verifies repo-wide.

- [ ] **Step 1: Update the test's expected count first (should fail)**

  In `tests/policy-schema.test.js`, change:

  ```js
  test('POLICY_KEYS has exactly 34 entries with unique keys', () => {
    assert.strictEqual(POLICY_KEYS.length, 34);
    assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 34);
  });
  ```

  to:

  ```js
  test('POLICY_KEYS has exactly 33 entries with unique keys', () => {
    assert.strictEqual(POLICY_KEYS.length, 33);
    assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 33);
  });
  ```

- [ ] **Step 2: Run the test, confirm it fails**

  Run: `node --test tests/policy-schema.test.js`
  Expected: FAIL — `POLICY_KEYS.length` is still 34, not 33.

- [ ] **Step 3: Remove the schema entry**

  In `bin/lib/policy-schema.js`, change:

  ```js
  { key: 'creative-survey', type: 'enum', values: ['off'] },
  { key: 'tidy-routine-autonomy', type: 'enum', values: ['conservative', 'evidence-based'], default: 'conservative' },
  { key: 'promise-register-min-leaves', type: 'integer', default: 4 },
  ```

  to:

  ```js
  { key: 'creative-survey', type: 'enum', values: ['off'] },
  { key: 'promise-register-min-leaves', type: 'integer', default: 4 },
  ```

- [ ] **Step 4: Run the test, confirm it passes**

  Run: `node --test tests/policy-schema.test.js`
  Expected: PASS — all tests in the file green.

- [ ] **Step 5: Remove the config-table row from the shared doc**

  In `skills/_shared/policy-schema.md`, delete this table row entirely (it currently sits
  between the `creative-survey` and `backlog-fetch-limit` rows):

  ```
  | `tidy-routine-autonomy` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:tidy` | `conservative` | `evidence-based` lets 2 of 4 specific cite-able finding shapes auto-apply under the `--scope=github` Standalone-auto routine path; `conservative` (default) stages everything |
  ```

- [ ] **Step 6: Run the full suite**

  Run: `npm test`
  Expected: all tests pass (1687 tests before this task; 1687 still, since no tests were added
  or removed — only one assertion's expected values changed).

- [ ] **Step 7: Commit**

  ```bash
  git add bin/lib/policy-schema.js tests/policy-schema.test.js skills/_shared/policy-schema.md
  git commit -m "Remove tidy-routine-autonomy policy key — dead once github-triage routine is gone

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 2: Rewrite `skills/tidy/SKILL.md` and delete the github-triage template + sub-file

**Files:**
- Delete: `skills/tidy/routine-template-github-triage.yml`
- Delete: `skills/tidy/github-routine-procedures.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Delete the routine template**

  ```bash
  git rm skills/tidy/routine-template-github-triage.yml
  ```

- [ ] **Step 2: Edit `skills/tidy/SKILL.md` — Input section wording**

  Change:

  ```
  `$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]] [--dry-run]`. With no `--scope` argument, /tidy scans everything — the open work-record queue (per `work-backend` — see `scan-procedures.md` Step 1), design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. `--dry-run` forces every finding to Stage regardless of mode, aggressiveness tier, or evidence-tier match, and skips Step 7 execution entirely — see Step 6's `--dry-run` override for the full behavior. The two flags compose freely (e.g. `--scope=github --dry-run` previews just the GitHub-triage scope's would-be mutations, the same subset a scheduled `tidy-github-triage` routine firing would touch). An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope` or `--dry-run`.
  ```

  to:

  ```
  `$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]] [--dry-run]`. With no `--scope` argument, /tidy scans everything — the open work-record queue (per `work-backend` — see `scan-procedures.md` Step 1), design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. `--dry-run` forces every finding to Stage regardless of mode or aggressiveness tier, and skips Step 7 execution entirely — see Step 6's `--dry-run` override for the full behavior. The two flags compose freely (e.g. `--scope=github --dry-run` previews just the GitHub-triage scope's would-be mutations). An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope` or `--dry-run`.
  ```

- [ ] **Step 3: Edit `skills/tidy/SKILL.md` — Step 6 `--dry-run` paragraph**

  Change:

  ```
  **`--dry-run`:** when passed, every finding routes to Stage regardless of mode, aggressiveness tier, or evidence-tier match — Step 7 never executes, whether the run is Auto mode (embedded-pipeline or Standalone) or Interactive. The Auto-mode routing table below and the Evidence tier subsection are both bypassed entirely. Interactive mode still renders the full report and its `AskUserQuestion` approval, but choosing "Apply all" writes would-be log entries instead of executing Step 7. Write each finding's would-be action as `DRY-RUN {time} — {finding} — would: {action}. Reversibility: {tier}.` to `{run-dir}/decisions.md` — same file and format the Auto-mode Log entries use below, prefixed `DRY-RUN` instead of `AUTO`/`STAGED`. If no pipeline run dir exists yet (an interactive or ad hoc `--dry-run` invocation), create a Standalone-auto run dir per `_shared/pipeline-run-dir.md`'s fallback first, so the preview has somewhere durable to land. This mirrors `/routine create --dry-run`'s "inspect before anything is created" pattern one level up (see "Routine Configuration" below), but for a live tidy firing's actual mutations instead of the routine's own setup.
  ```

  to:

  ```
  **`--dry-run`:** when passed, every finding routes to Stage regardless of mode or aggressiveness tier — Step 7 never executes, whether the run is Auto mode (embedded-pipeline or Standalone) or Interactive. The Auto-mode routing table below is bypassed entirely. Interactive mode still renders the full report and its `AskUserQuestion` approval, but choosing "Apply all" writes would-be log entries instead of executing Step 7. Write each finding's would-be action as `DRY-RUN {time} — {finding} — would: {action}. Reversibility: {tier}.` to `{run-dir}/decisions.md` — same file and format the Auto-mode Log entries use below, prefixed `DRY-RUN` instead of `AUTO`/`STAGED`. If no pipeline run dir exists yet (an interactive or ad hoc `--dry-run` invocation), create a Standalone-auto run dir per `_shared/pipeline-run-dir.md`'s fallback first, so the preview has somewhere durable to land. This mirrors `/routine create --dry-run`'s "inspect before anything is created" pattern one level up (see "Routine Configuration" below), but for a live tidy firing's actual mutations instead of the routine's own setup.
  ```

- [ ] **Step 4: Edit `skills/tidy/SKILL.md` — replace the 4-subsection block with a fully-inlined Archival compaction**

  Change (this whole block, from the "four subsections" intro line through the end of the
  Archival compaction paragraph):

  ```
  The four subsections below apply only to `--scope=github` routine firings (Archival compaction excepted — it runs on every Standalone-auto firing regardless of scope). Read `github-routine-procedures.md` in this skill's directory for the full procedures — the summaries here exist for orientation only; the sub-file is authoritative.

  #### Evidence tier (`--scope=github` routine firings only)

  Under `tidy-routine-autonomy: evidence-based` (default `conservative`, in which nothing here applies), before staging one of four specific finding shapes with cite-able evidence, auto-apply the mutation instead and log the evidence literally. Two of the four rows (parked-record milestone/watched-path evidence) require Step 1, which the shipped `tidy-github-triage` routine never runs and so stay documented-but-unreachable today; the other two (thread-resolution, issue-supersession) are live on that routine. Read `github-routine-procedures.md` for the full evidence table, reachability note, and log-entry format.

  #### Rolling digest (`--scope=github` routine firings only)

  Every Standalone-auto `--scope=github` firing updates one rolling digest issue (or `tidy-digest.md` under `local-files` with no GitHub remote) in place — never creates a new one per firing. It sections auto-applied actions, evidence-tier mutations, and still-open findings (deduped by a `{number}:{finding-type}` key), plus a regenerated Pipeline Funnel of shaping/grant/build latency and wontfix rate. Read `github-routine-procedures.md` for the exact structure, identity-resolution, dedup, and funnel-computation procedure.

  #### Notification (`--scope=github` routine firings only)

  After the digest is written, `PushNotification` fires at most once per firing, only when the dedup step above marked at least one "Still needs your review" row as new-this-firing — never merely because the section is non-empty, and never on a lingering-but-unchanged finding. Read `github-routine-procedures.md` for the exact trigger condition and message format.

  #### Archival compaction (every Standalone-auto firing, any scope)

  Unlike the three subsections above, this runs on every Standalone-auto firing regardless of scope. Before writing this run's own report, `/tidy` compacts standalone run directories older than 30 days (and abandoned non-standalone runs past the same age with a non-`active` status) into `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md`, then moves each into `.claude-tweaks/pipelines/archive/{run-id}/`. Read `github-routine-procedures.md` for the exact matching rules and per-directory steps.
  ```

  to (Archival compaction's full procedure, moved here verbatim from
  `github-routine-procedures.md` before that file is deleted in Step 6):

  ```
  #### Archival compaction (every Standalone-auto firing, any scope)

  This runs on every Standalone-auto firing regardless of scope — it's about aging out prior standalone runs, not about this run's own findings.

  Before writing this run's own report, scan `.claude-tweaks/pipelines/` for two kinds of aged-out run directories:

  - **Standalone runs** (name matches `*-standalone`) whose ISO-timestamp prefix is more than 30 days old — compacted on age alone, same as always.
  - **Abandoned non-standalone runs** — a `/flow`-orchestrated run directory (no `-standalone` suffix) whose ISO-timestamp prefix is more than 30 days old AND whose `run-state.json` status is not `active` (`interrupted`, or the file is missing/unreadable). This covers a run that stopped at an interactive HARD-GATE and was never resumed or wrapped up — it never reaches `/wrap-up`'s successful-closure archival, so without this rule it would sit on disk indefinitely with no cleanup path. The `status` check (absent from the standalone rule, which compacts on age alone) exists so a genuinely long-running, still-`active` pipeline is never swept purely for being old.

  For each matched directory:

  1. Read its `decisions.md`.
  2. Append its content to `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (the month derived from the run's own timestamp, not today's date — a run compacted late still files under the month it actually ran), creating the file if absent. Prefix the appended block with the run's own directory name as a header so entries stay attributable.
  3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` (same target `/wrap-up` uses for completed pipeline runs — see `wrap-up/cleanup-procedures.md` Section B).
  4. Log one `AUTO` line to *this* firing's own `decisions.md`: `AUTO {time} — Archival: compacted {run-id} (age: {N} days) into index-{YYYY-MM}.md. Reversibility: high (archive is additive, nothing deleted).`

  Skipped staged items inside a compacted run are preserved verbatim in the archive (not silently dropped) — same rule `/wrap-up`'s own archival already follows.
  ```

- [ ] **Step 5: Edit `skills/tidy/SKILL.md` — Routine Configuration section**

  Change:

  ```
  ## Routine Configuration

  `/tidy` ships two routine templates. The default, `skills/tidy/routine-template.yml`, is a weekly full-backlog hygiene sweep — instantiate it with:

  ```
  /claude-tweaks:routine create tidy
  ```

  A second variant, `skills/tidy/routine-template-github-triage.yml`, runs only GitHub issue/PR triage (`--scope=github`) on a much tighter cadence, and can be instantiated alongside the default in the same project:

  ```
  /claude-tweaks:routine create tidy --variant=github-triage
  ```

  Both resolve the account- and project-specific values a portable template can't hardcode (which environment, which repo) and create a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism, including how `--variant` selects between them. Add `--dry-run` to `/claude-tweaks:routine create` to inspect the assembled routine configuration before anything is created — distinct from `/claude-tweaks:tidy --dry-run` (Step 6 above), which previews what a specific tidy firing would mutate, not how the routine itself is configured. Before trusting a newly-changed `tidy-aggressiveness` or `tidy-routine-autonomy` policy value to an unattended scheduled firing, invoke `/claude-tweaks:tidy --dry-run` manually first (optionally with the same `--scope` the routine uses, e.g. `--scope=github --dry-run` to preview exactly what `tidy-github-triage` would do) and review the `DRY-RUN` log entries before letting the routine run for real.
  ```

  to:

  ```
  ## Routine Configuration

  `/tidy` ships one routine template, `skills/tidy/routine-template.yml` — a weekly full-backlog hygiene sweep (including GitHub issue/PR triage as Step 4.8) — instantiate it with:

  ```
  /claude-tweaks:routine create tidy
  ```

  This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to `/claude-tweaks:routine create` to inspect the assembled routine configuration before anything is created — distinct from `/claude-tweaks:tidy --dry-run` (Step 6 above), which previews what a specific tidy firing would mutate, not how the routine itself is configured. Before trusting a newly-changed `tidy-aggressiveness` policy value to an unattended scheduled firing, invoke `/claude-tweaks:tidy --dry-run` manually first (optionally with the same `--scope` the routine uses, e.g. `--scope=github --dry-run`) and review the `DRY-RUN` log entries before letting the routine run for real.
  ```

- [ ] **Step 6: Delete the now-empty sub-file**

  All of `github-routine-procedures.md`'s content is either deleted (Evidence tier, Rolling
  digest, Notification) or moved (Archival compaction, in Step 4 above). Delete it:

  ```bash
  git rm skills/tidy/github-routine-procedures.md
  ```

- [ ] **Step 7: Verify no dangling references remain in this file**

  Run: `grep -n "github-triage\|Evidence tier\|Rolling digest\|github-routine-procedures\|tidy-routine-autonomy" skills/tidy/SKILL.md`
  Expected: no output.

- [ ] **Step 8: Run the full suite**

  Run: `npm test`
  Expected: all tests pass (markdown-only changes plus file deletions — no test references
  either deleted file).

- [ ] **Step 9: Commit**

  ```bash
  git add skills/tidy/SKILL.md
  git add -u skills/tidy/routine-template-github-triage.yml skills/tidy/github-routine-procedures.md
  git commit -m "Fold github-triage routine into base tidy sweep, inline Archival compaction

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 3: Fix stale Evidence-tier cross-references in `skills/tidy/scan-procedures.md`

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: nothing from other tasks (these are prose cross-references, not code — safe to run
  independently of Task 2's deletion of the thing they reference).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Fix the Shape 2 cross-reference**

  Change:

  ```
  `isParked(record)` (`bin/lib/issues/record-buckets.js`). Judge the trigger live — the same evidence `_shared/github-pr-scan.md`'s `repo-wide` scope and the Evidence tier (`SKILL.md` Step 6) already read, so this shape and those procedures never disagree:
  ```

  to:

  ```
  `isParked(record)` (`bin/lib/issues/record-buckets.js`). Judge the trigger live — the same evidence `_shared/github-pr-scan.md`'s `repo-wide` scope already reads, so this shape and that procedure never disagree:
  ```

- [ ] **Step 2: Fix the Shape 6 cross-reference**

  Change:

  ```
  Not scanned here. This is Step 4.8's code-health/harness-health/journey-health/docs-health issue judgment (`_shared/github-pr-scan.md`'s `repo-wide` scope, items 3/5/6/7) together with the Evidence tier's fourth row (`SKILL.md` Step 6) — both unchanged by this merge. It's listed in this file only so the seven finding shapes the record-scan design replaces (former Steps 1 and 2, plus former Step 4.8's backlog-issue item) stay documented in one place; the mechanics that actually judge "is the flagged code gone" continue to live where they already did.
  ```

  to:

  ```
  Not scanned here. This is Step 4.8's code-health/harness-health/journey-health/docs-health issue judgment (`_shared/github-pr-scan.md`'s `repo-wide` scope, items 3/5/6/7) — unchanged by this merge. It's listed in this file only so the seven finding shapes the record-scan design replaces (former Steps 1 and 2, plus former Step 4.8's backlog-issue item) stay documented in one place; the mechanics that actually judge "is the flagged code gone" continue to live where they already did.
  ```

- [ ] **Step 3: Fix the Step 4.8 findings-table note**

  Change:

  ```
  The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads → Capture or a suggested local command; still-valid vs. superseded code-health, harness-health, journey-health, and docs-health issues → Close (GitHub) when the flagged code is demonstrably gone (Shape 6 above / Evidence tier row 4, when evidence-qualified) or a suggested `/claude-tweaks:backlog refine` run when still valid; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly). Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are Step 1's job now, not this step's — `repo-wide` no longer queries the `backlog` label (see `_shared/github-pr-scan.md`).
  ```

  to:

  ```
  The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads → Capture or a suggested local command; still-valid vs. superseded code-health, harness-health, journey-health, and docs-health issues → Close (GitHub) when the flagged code is demonstrably gone (Shape 6 above) or a suggested `/claude-tweaks:backlog refine` run when still valid; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly). Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are Step 1's job now, not this step's — `repo-wide` no longer queries the `backlog` label (see `_shared/github-pr-scan.md`).
  ```

- [ ] **Step 4: Verify**

  Run: `grep -n "Evidence tier" skills/tidy/scan-procedures.md`
  Expected: no output.

- [ ] **Step 5: Run the full suite**

  Run: `npm test`
  Expected: all tests pass (prose-only change).

- [ ] **Step 6: Commit**

  ```bash
  git add skills/tidy/scan-procedures.md
  git commit -m "Drop stale Evidence-tier cross-references from tidy scan-procedures

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 4: Strip the `--variant` mechanism from `skills/routine/SKILL.md`

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Frontmatter `argument-hint`**

  Change:

  ```
  argument-hint: "<create|update|status> <skill>|--all [--variant <name>] [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
  ```

  to:

  ```
  argument-hint: "<create|update|status> <skill>|--all [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]"
  ```

- [ ] **Step 2: Input table**

  Change:

  ```
  | `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill+variant combination. |
  | `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
  | `status <skill>` | Show the instantiated record(s) alongside live routine state. With no `--variant`, lists every instantiated variant found for `<skill>`. |
  | `status --all` | Bulk drift check across every instantiated record in the project (`.claude-tweaks/routines/*.yml`), regardless of skill or variant — no `<skill>` argument. The only entry point that can discover a record whose named skill no longer exists at all (renamed/retired), since every other path here starts from a skill name and globs that skill's own template file forward. See STATUS Step 1's `--all` branch for the full verdict table. |
  | `--variant <name>` | Use `skills/{skill}/routine-template-<name>.yml` instead of the default `skills/{skill}/routine-template.yml`. Combine with `create`/`update`/`status`. Omit for the default template — fully backward compatible with every existing consumer (code-health, dispatch, harness-health, journey-health, docs-health), none of which ship a variant; `tidy` is the only skill with a named variant today (see Relationship below). `/claude-tweaks:flow` does not ship a routine template at all — it is reached only indirectly via `/claude-tweaks:dispatch`'s template (see Relationship below). |
  | `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
  ```

  to:

  ```
  | `create <skill>` | Instantiate `<skill>`'s routine template into a live routine for the current project. Routes to the UPDATE workflow automatically if an instantiated record already exists for this project+skill combination. |
  | `update <skill>` | Re-sync an existing routine against its (possibly changed) template. |
  | `status <skill>` | Show the instantiated record for `<skill>` alongside live routine state. |
  | `status --all` | Bulk drift check across every instantiated record in the project (`.claude-tweaks/routines/*.yml`), regardless of skill — no `<skill>` argument. The only entry point that can discover a record whose named skill no longer exists at all (renamed/retired), since every other path here starts from a skill name and globs that skill's own template file forward. See STATUS Step 1's `--all` branch for the full verdict table. |
  | `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
  ```

- [ ] **Step 3: CREATE Step 1**

  Change:

  ```
  **Step 1 — Load the template.** When `--variant=<name>` was passed, read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-<name>.yml`; if it doesn't exist, stop: "`{skill}` has no routine-template-{name}.yml — check the variant name." Otherwise (no `--variant`), read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` exactly as before; if it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema — identical for the default template and every named variant — is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.
  ```

  to:

  ```
  **Step 1 — Load the template.** Read `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml`; if it doesn't exist, stop: "`{skill}` has no routine-template.yml — it doesn't support routines yet." The field schema is documented once in `skills/_shared/routine-template-schema.md` — read it if any field's meaning is unclear.
  ```

- [ ] **Step 4: CREATE Step 3**

  Change:

  ```
  **Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill+variant combination. (`PREFIXED_NAME` already encodes the loaded template's `routine_name`, which differs per variant by construction — creating `tidy` with `--variant=github-triage` while `tidy-weekly`'s record already exists is a legitimate second instance, not a duplicate; see the Anti-Patterns table below.)
  ```

  to:

  ```
  **Step 3 — Idempotency check.** Check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` already exists in the current project. If it does, stop this workflow and continue at UPDATE below instead — never create a second routine for the same project+skill combination.
  ```

- [ ] **Step 5: UPDATE Step 1**

  Change:

  ```
  **Step 1.** Load the template the same way as CREATE Step 1 (respecting `--variant` if passed; if missing, stop with the same message). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill> [--variant=<name>]` first and stop.
  ```

  to:

  ```
  **Step 1.** Load the template the same way as CREATE Step 1 (if missing, stop with the same message). Resolve the repo URL and derive `PREFIXED_NAME` the same way as CREATE Step 2. Require an existing `.claude-tweaks/routines/{PREFIXED_NAME}.yml` for the current project (routed here automatically from CREATE's idempotency check, or invoked directly). If none exists, tell the user to run `create <skill>` first and stop.
  ```

- [ ] **Step 6: STATUS Step 1 (per-skill path)**

  Change:

  ```
  **Step 1.** When `--all` was passed (no `<skill>` argument), skip straight to the `--all` branch below. Otherwise, when `--variant=<name>` was passed, load the template and resolve `PREFIXED_NAME`/record path exactly as CREATE Steps 1-2, then read that single `.claude-tweaks/routines/{PREFIXED_NAME}.yml`; if missing, report no routine for `<skill> --variant=<name>` and suggest `create <skill> --variant=<name>`. Stop.

  When `--variant` is omitted (and `--all` wasn't passed): glob `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template.yml` and `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/routine-template-*.yml` to enumerate every template `<skill>` ships, read each one's `routine_name`, and derive `REPO_SLUG` (same recipe as CREATE Step 2) to check which of `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exist. If none exist, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If exactly one exists, proceed with that single instance for the rest of this workflow, exactly as before. If more than one exists, run Steps 2-3.5 below once per existing instance and present all of them together, each labeled by its variant name (or "default" for the base template).
  ```

  to:

  ```
  **Step 1.** When `--all` was passed (no `<skill>` argument), skip straight to the `--all` branch below. Otherwise, load the template and resolve `PREFIXED_NAME` exactly as CREATE Steps 1-2, then check whether `.claude-tweaks/routines/{PREFIXED_NAME}.yml` exists. If it doesn't, report that no routine has been created for `<skill>` in this project and suggest `create <skill>`. Stop. If it does, proceed with that instance for the rest of this workflow.
  ```

- [ ] **Step 7: STATUS `--all` branch, template-resolution items 1-3**

  Change:

  ```
  1. Glob `${CLAUDE_PLUGIN_ROOT}/skills/{record.template}/routine-template*.yml`. If the glob is empty (the skill directory doesn't exist, or exists with no routine templates at all), this record is **Orphaned** — record that verdict and move to the next record without calling `RemoteTrigger` for this one (there is no live template to compare against, so a `get` call adds nothing actionable).
  2. If the glob returned exactly one file, that is the matching template — the common case (every shipped skill today except `tidy`).
  3. If the glob returned more than one file (only `tidy` ships a named variant today), read each candidate's `routine_name` field and find the one where `record.filename` (minus its `.yml` suffix) ends with `-{that candidate's routine_name}`. This disambiguates without ever deriving `REPO_SLUG` — a record's filename already encodes its `routine_name` as a suffix, by construction (see CREATE Step 2's `PREFIXED_NAME` recipe). If no candidate's `routine_name` matches as a suffix (shouldn't happen in practice), fall back to the skill's default `routine-template.yml` and note "variant ambiguous — compared against the default template" alongside this record's row.
  ```

  to:

  ```
  1. Check whether `${CLAUDE_PLUGIN_ROOT}/skills/{record.template}/routine-template.yml` exists. If it doesn't (the skill directory doesn't exist, or exists with no routine template at all), this record is **Orphaned** — record that verdict and move to the next record without calling `RemoteTrigger` for this one (there is no live template to compare against, so a `get` call adds nothing actionable).
  2. Otherwise, that file is the matching template.
  ```

- [ ] **Step 8: Example verdict table**

  Change:

  ```
  | tidy (github-triage) | Drifted | template v1 → v2; schedule unchanged |
  ```

  to:

  ```
  | tidy | Drifted | template v1 → v2; schedule unchanged |
  ```

- [ ] **Step 9: Anti-Patterns table, duplicate-creation row**

  Change:

  ```
  | Creating a second routine for the same project+skill+**variant** when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. A second routine for a **different** variant of the same skill (e.g. `tidy-weekly` and `tidy-github-triage` coexisting) is not a duplicate — it's a distinct `PREFIXED_NAME`, and both instances legitimately run side by side. |
  ```

  to:

  ```
  | Creating a second routine for the same project+skill when an instantiated record already exists | Always check `.claude-tweaks/routines/{name}.yml` first and route to `update` — duplicate routines double-run the same work. |
  ```

- [ ] **Step 10: Anti-Patterns table, `--all` combination row**

  Change:

  ```
  | Passing `--all` together with `<skill>` or `--variant` | `--all` is a distinct entry point with no skill name at all — it enumerates every instantiated record in the project directly. Combining it with a skill name is a contradiction, not a narrower filter; treat it the same as any other conflicting-arguments case and ask which was meant rather than silently picking one. |
  ```

  to:

  ```
  | Passing `--all` together with `<skill>` | `--all` is a distinct entry point with no skill name at all — it enumerates every instantiated record in the project directly. Combining it with a skill name is a contradiction, not a narrower filter; treat it the same as any other conflicting-arguments case and ask which was meant rather than silently picking one. |
  ```

- [ ] **Step 11: Relationship table, `/claude-tweaks:init` row**

  Change:

  ```
  | `/claude-tweaks:init` | Step 14 (Cloud/Routine Parity Setup) runs immediately before Step 15 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 15 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 15 itself discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. Update Mode also invokes `/claude-tweaks:routine status --all --source init` to detect drifted, orphaned, stale, and malformed routines across the whole project in one call, staging any Drifted ones as a batch re-sync offer — see `update-mode.md`'s Routine Drift entry. |
  ```

  to:

  ```
  | `/claude-tweaks:init` | Step 14 (Cloud/Routine Parity Setup) runs immediately before Step 15 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 15 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 15 itself discovers skills with a `routine-template.yml` and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. Update Mode also invokes `/claude-tweaks:routine status --all --source init` to detect drifted, orphaned, stale, and malformed routines across the whole project in one call, staging any Drifted ones as a batch re-sync offer — see `update-mode.md`'s Routine Drift entry. |
  ```

- [ ] **Step 12: Relationship table, `/claude-tweaks:tidy` row**

  Change:

  ```
  | `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. Tidy also ships this skill's first named variant, `skills/tidy/routine-template-github-triage.yml` (`--variant=github-triage`), a frequent `--scope=github`-only companion to the weekly full sweep. |
  ```

  to:

  ```
  | `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
  ```

- [ ] **Step 13: Verify**

  Run: `grep -n -i "variant\|github-triage" skills/routine/SKILL.md`
  Expected: no output.

- [ ] **Step 14: Run the full suite**

  Run: `npm test`
  Expected: all tests pass (prose-only change; no test exercises `/routine`'s markdown logic
  directly).

- [ ] **Step 15: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "Strip --variant mechanism from /claude-tweaks:routine — no consumer remains

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 5: Strip variant framing from `skills/_shared/routine-template-schema.md`

**Files:**
- Modify: `skills/_shared/routine-template-schema.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Simplify the Template heading and its paragraph**

  Change:

  ```
  ## Template — `skills/{skill}/routine-template.yml` (default) or `skills/{skill}/routine-template-<variant>.yml` (named variant)

  Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials. A skill may ship just the default template, or the default plus one or more named variants — every variant uses this identical field schema, just with its own `routine_name` (and typically its own `prompt`/`default_schedule`) so it produces a distinct `PREFIXED_NAME` and can be instantiated alongside the default. `/claude-tweaks:routine create/update/status <skill> --variant=<name>` selects `routine-template-<name>.yml`; omitting `--variant` selects the default file.
  ```

  to:

  ```
  ## Template — `skills/{skill}/routine-template.yml`

  Ships with the plugin. Plugin-owned, project-agnostic, account-agnostic. NEVER contains `environment_id`, a repo URL, or MCP credentials.
  ```

- [ ] **Step 2: Remove the variant-naming Anti-Patterns row**

  Delete this row entirely from the Anti-Patterns table:

  ```
  | Giving a variant template the same `routine_name` as the skill's default template, or as another variant of the same skill | `PREFIXED_NAME` derives from `routine_name` — a collision means the second template can never be instantiated without silently colliding with the first's instantiated record file. Every template a skill ships (default + every variant) must have a unique `routine_name`. |
  ```

- [ ] **Step 3: Verify**

  Run: `grep -n -i "variant" skills/_shared/routine-template-schema.md`
  Expected: no output.

- [ ] **Step 4: Run the full suite**

  Run: `npm test`
  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/_shared/routine-template-schema.md
  git commit -m "Drop variant-template framing from routine-template-schema.md

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 6: Strip variant mentions from `/init`'s Routine Installation and Update Mode

**Files:**
- Modify: `skills/init/SKILL.md`
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/init/update-mode.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume.

- [ ] **Step 1: `skills/init/SKILL.md` — Step 15 description**

  Change:

  ```
  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered — but Update Mode does audit existing records for drift and relevance; see `update-mode.md`'s Routine Drift and Routine Relevance entries. Read `bootstrap-steps.md` (Step 15) for the full procedure.
  ```

  to:

  ```
  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered — but Update Mode does audit existing records for drift and relevance; see `update-mode.md`'s Routine Drift and Routine Relevance entries. Read `bootstrap-steps.md` (Step 15) for the full procedure.
  ```

- [ ] **Step 2: `skills/init/SKILL.md` — Relationship table `/claude-tweaks:routine` row**

  Change:

  ```
  | `/claude-tweaks:routine` | Step 15 discovers claude-tweaks skills shipping a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. Update Mode also invokes `/claude-tweaks:routine status --all --source init` and, on confirmation, `update <skill> [--variant=<name>] --defaults --source init` to detect and re-sync drifted routines — see `update-mode.md`'s Routine Drift entry. |
  ```

  to:

  ```
  | `/claude-tweaks:routine` | Step 15 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. Update Mode also invokes `/claude-tweaks:routine status --all --source init` and, on confirmation, `update <skill> --defaults --source init` to detect and re-sync drifted routines — see `update-mode.md`'s Routine Drift entry. |
  ```

- [ ] **Step 3: `skills/init/bootstrap-steps.md` — Step 15 intro paragraph**

  Change:

  ```
  claude-tweaks skills can ship one or more routine templates (schema: `skills/_shared/routine-template-schema.md`) — a skill's default template at `skills/{skill}/routine-template.yml`, plus optional named variants at `skills/{skill}/routine-template-<variant>.yml` — each enabling `/claude-tweaks:routine create <skill> [--variant=<name>]` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, tidy's periodic backlog hygiene pass, or tidy's frequent GitHub-issue-triage variant. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.
  ```

  to:

  ```
  claude-tweaks skills can ship a routine template (schema: `skills/_shared/routine-template-schema.md`) at `skills/{skill}/routine-template.yml`, enabling `/claude-tweaks:routine create <skill>` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, or tidy's periodic backlog hygiene pass. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.
  ```

- [ ] **Step 4: `skills/init/bootstrap-steps.md` — candidate-detection glob**

  Change:

  ```
  ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template-*.yml 2>/dev/null
  ```

  to:

  ```
  ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml 2>/dev/null
  ```

- [ ] **Step 5: `skills/init/bootstrap-steps.md` — candidate-naming paragraph**

  Change:

  ```
  For each match, note the candidate skill name (the directory under `skills/`) and, for a `routine-template-<variant>.yml` match, the variant name (everything between `routine-template-` and `.yml`). Read each candidate's `routine_name` field and its `default_schedule.cron_expression`, and derive its human-readable form via the same 5a classification table `/claude-tweaks:routine`'s CREATE Step 5 uses (e.g. `"0 3 * * *"` → "Daily, 03:00 UTC").
  ```

  to:

  ```
  For each match, note the candidate skill name (the directory under `skills/`). Read each candidate's `routine_name` field and its `default_schedule.cron_expression`, and derive its human-readable form via the same 5a classification table `/claude-tweaks:routine`'s CREATE Step 5 uses (e.g. `"0 3 * * *"` → "Daily, 03:00 UTC").
  ```

- [ ] **Step 6: `skills/init/bootstrap-steps.md` — existing-record check paragraph**

  Change:

  ```
  Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project — check per candidate, not per skill, since a skill with a default template plus a variant can have zero, one, or both already instantiated; the instantiated record's own `template:` field only names the skill, not which variant, so filename existence (not field content) is the correct check here. If `git remote get-url origin` fails (no remote configured), treat every candidate as un-instantiated and offer them all — `/claude-tweaks:routine`'s own CREATE workflow (Step 2) handles the actual missing-remote stop later, at the point a candidate is actually created. Only offer candidates without a matching record. If no candidates remain, skip this step silently.
  ```

  to:

  ```
  Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project. If `git remote get-url origin` fails (no remote configured), treat every candidate as un-instantiated and offer them all — `/claude-tweaks:routine`'s own CREATE workflow (Step 2) handles the actual missing-remote stop later, at the point a candidate is actually created. Only offer candidates without a matching record. If no candidates remain, skip this step silently.
  ```

- [ ] **Step 7: `skills/init/bootstrap-steps.md` — candidate table example, remove the github-triage row**

  Change:

  ```
  | code-health | Daily, 03:00 UTC | {template's notes field, if present} |
  | tidy | Weekly, Sunday 04:00 UTC | ... |
  | tidy --variant=github-triage | Every 3 hours | ... |
  | ... | ... | ... |
  ```

  to:

  ```
  | code-health | Daily, 03:00 UTC | {template's notes field, if present} |
  | tidy | Weekly, Sunday 04:00 UTC | ... |
  | ... | ... | ... |
  ```

- [ ] **Step 8: `skills/init/bootstrap-steps.md` — group-count wording (7 → 6)**

  Change:

  ```
  **Present the picklist.** Call `AskUserQuestion` with one multiSelect question per group of up to 4 candidates (all groups issued together, in the same call — the tool caps `options` at 4 per question but allows up to 4 questions per call, so up to 16 candidates fit in a single call; today's 7 candidates need exactly 2 groups). For a single group of 4 or fewer candidates, one question is enough — omit the group-numbering suffix. Not reachable with today's 7 shipped templates, but if candidates ever exceed 16, split into multiple sequential `AskUserQuestion` calls (present the first 16, act on that selection, then offer the remainder in a follow-up call) rather than silently truncating the list.
  ```

  to:

  ```
  **Present the picklist.** Call `AskUserQuestion` with one multiSelect question per group of up to 4 candidates (all groups issued together, in the same call — the tool caps `options` at 4 per question but allows up to 4 questions per call, so up to 16 candidates fit in a single call; today's 6 candidates need exactly 2 groups). For a single group of 4 or fewer candidates, one question is enough — omit the group-numbering suffix. Not reachable with today's 6 shipped templates, but if candidates ever exceed 16, split into multiple sequential `AskUserQuestion` calls (present the first 16, act on that selection, then offer the remainder in a follow-up call) rather than silently truncating the list.
  ```

- [ ] **Step 9: `skills/init/bootstrap-steps.md` — picklist question example labels**

  Change:

  ```
  - `question` (group 1): `"Which routines do you want to set up?"` (or, when there is more than one group, `"Which routines do you want to set up? (1/{G})"`), `header`: `"Routines"`, `multiSelect`: `true`, one option per candidate in this group: `label` = the candidate's routine identity (e.g. `"code-health"`, `"tidy"`, `"tidy --variant=github-triage"`), `description` = its human-readable default schedule (e.g. `"Daily, 03:00 UTC"`)
  ```

  to:

  ```
  - `question` (group 1): `"Which routines do you want to set up?"` (or, when there is more than one group, `"Which routines do you want to set up? (1/{G})"`), `header`: `"Routines"`, `multiSelect`: `true`, one option per candidate in this group: `label` = the candidate's skill name (e.g. `"code-health"`, `"tidy"`), `description` = its human-readable default schedule (e.g. `"Daily, 03:00 UTC"`)
  ```

- [ ] **Step 10: `skills/init/bootstrap-steps.md` — per-candidate invocation**

  Change:

  ```
  **For each selected candidate:** invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<resolved id> --source init` directly (omit `--variant` for a default-template candidate). This flag combination skips `/routine`'s own interactive cadence picker and confirm — it uses the template's own default schedule and creates immediately, since the multiSelect selection above already served as the confirmation. `/init` still does not reimplement or duplicate any of `/routine`'s body-assembly, `RemoteTrigger`, or record-writing logic — `--defaults --environment=<id>` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it.
  ```

  to:

  ```
  **For each selected candidate:** invoke `/claude-tweaks:routine create <skill> --defaults --environment=<resolved id> --source init` directly. This flag combination skips `/routine`'s own interactive cadence picker and confirm — it uses the template's own default schedule and creates immediately, since the multiSelect selection above already served as the confirmation. `/init` still does not reimplement or duplicate any of `/routine`'s body-assembly, `RemoteTrigger`, or record-writing logic — `--defaults --environment=<id>` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it.
  ```

- [ ] **Step 11: `skills/init/bootstrap-steps.md` — decline-and-customize sentence**

  Change:

  ```
  A user who wants a non-default schedule or environment for a specific routine declines it here and runs `/claude-tweaks:routine create <skill> [--variant=<name>]` (without `--defaults`) afterward, where the full interactive Customize path is available.
  ```

  to:

  ```
  A user who wants a non-default schedule or environment for a specific routine declines it here and runs `/claude-tweaks:routine create <skill>` (without `--defaults`) afterward, where the full interactive Customize path is available.
  ```

- [ ] **Step 12: `skills/init/update-mode.md` — Routine Drift re-sync invocation**

  Change:

  ```
  On "Apply all recommended," invoke `/claude-tweaks:routine update <skill> [--variant=<name>]
  --defaults --source init` once per Drifted record. On "Override specific items," follow up
  ```

  to:

  ```
  On "Apply all recommended," invoke `/claude-tweaks:routine update <skill>
  --defaults --source init` once per Drifted record. On "Override specific items," follow up
  ```

- [ ] **Step 13: Verify**

  Run: `grep -n -i "variant" skills/init/SKILL.md skills/init/bootstrap-steps.md skills/init/update-mode.md`
  Expected: no output.

- [ ] **Step 14: Run the full suite**

  Run: `npm test`
  Expected: all tests pass.

- [ ] **Step 15: Commit**

  ```bash
  git add skills/init/SKILL.md skills/init/bootstrap-steps.md skills/init/update-mode.md
  git commit -m "Drop --variant mentions from /init Routine Installation and Update Mode

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 7: Small doc-only cleanups (harness-health, help reference card, getting-started)

**Files:**
- Modify: `skills/harness-health/routine-relevance-analysis.md`
- Modify: `skills/help/reference-card.md`
- Modify: `docs/getting-started.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume.

- [ ] **Step 1: `skills/harness-health/routine-relevance-analysis.md` — replace the example**

  Change:

  ```
  4. If the judgment surfaces something worth a look, emit one row: `{routine identity, e.g.
     "tidy --variant=github-triage"} | {N} commits touching ${CLAUDE_PLUGIN_ROOT}/skills/{template}/
     since {created_at date} | {one or two sentence relevance note grounded in what the diffs
     actually showed}`. If nothing from steps 2-3 surfaces a concern, this record produces no
  ```

  to:

  ```
  4. If the judgment surfaces something worth a look, emit one row: `{routine identity, e.g.
     "code-health"} | {N} commits touching ${CLAUDE_PLUGIN_ROOT}/skills/{template}/
     since {created_at date} | {one or two sentence relevance note grounded in what the diffs
     actually showed}`. If nothing from steps 2-3 surfaces a concern, this record produces no
  ```

- [ ] **Step 2: `skills/help/reference-card.md` — drop `--variant` from the argument cell**

  Change:

  ```
  | `/claude-tweaks:routine` | Instantiate a skill's routine template (e.g. code-health's) into a live cloud Routine via `RemoteTrigger` — template-driven, resolves project/account values with minimal prompts | `<create\|update\|status> <skill>\|--all [--variant <name>] [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]` |
  ```

  to:

  ```
  | `/claude-tweaks:routine` | Instantiate a skill's routine template (e.g. code-health's) into a live cloud Routine via `RemoteTrigger` — template-driven, resolves project/account values with minimal prompts | `<create\|update\|status> <skill>\|--all [--dry-run] [--defaults] [--environment <id>] [--refresh-environment]` |
  ```

- [ ] **Step 3: `docs/getting-started.md` — drop the `--variant` mention and its example**

  Change:

  ```
  **`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. code-health's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `status --all` for a bulk drift check across every instantiated routine and `update --defaults` for non-interactive batch re-sync, plus `--variant=<name>` to target a named template variant (e.g. tidy's `github-triage`) and `--dry-run` to inspect the assembled configuration before anything is created.
  ```

  to:

  ```
  **`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. code-health's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `status --all` for a bulk drift check across every instantiated routine and `update --defaults` for non-interactive batch re-sync, plus `--dry-run` to inspect the assembled configuration before anything is created.
  ```

- [ ] **Step 4: Verify**

  Run: `grep -n -i "variant\|github-triage" skills/harness-health/routine-relevance-analysis.md skills/help/reference-card.md docs/getting-started.md`
  Expected: no output.

- [ ] **Step 5: Run the full suite**

  Run: `npm test`
  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/harness-health/routine-relevance-analysis.md skills/help/reference-card.md docs/getting-started.md
  git commit -m "Drop remaining --variant/github-triage mentions from docs

  refs #remove-tidy-github-triage-routine"
  ```

---

### Task 8: Version bump and repo-wide verification sweep

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: the final state of every prior task (this task's grep sweep is the check that all
  of Tasks 1-7 landed consistently).
- Produces: nothing — this is the terminal task.

- [ ] **Step 1: Check for a concurrent version bump before touching `plugin.json`**

  Per this repo's own CLAUDE.md Releasing convention, run:

  ```bash
  git fetch origin main
  git log --oneline -5 origin/main -- .claude-plugin/plugin.json
  ```

  Read the current version in this worktree's `.claude-plugin/plugin.json` (`version` field).
  If `origin/main`'s `plugin.json` shows a higher version than this worktree's, use one patch
  above whichever is higher as the new version. Otherwise, bump this worktree's current version
  by one patch (e.g. `6.23.2` → `6.23.3`). This is a removal/simplification, not a feature
  addition, so it is always a **patch** bump, never minor.

- [ ] **Step 2: Bump the version**

  In `.claude-plugin/plugin.json`, change the `version` field to the value determined in Step 1.

- [ ] **Step 3: Repo-wide verification sweep**

  Run:

  ```bash
  grep -rn "github-triage" . --include="*.md" --include="*.yml" --include="*.js" | grep -v "docs/superpowers/specs/\|docs/superpowers/plans/"
  ```

  Expected: no output (every remaining hit, if any, must be inside `docs/superpowers/specs/` or
  `docs/superpowers/plans/` — historical record, untouched by this plan).

  Run:

  ```bash
  grep -rn -- "--variant" skills/ bin/ tests/ docs/getting-started.md
  ```

  Expected: no output.

  Run:

  ```bash
  grep -rln "tidy-routine-autonomy" . --include="*.md" --include="*.js" | grep -v "docs/superpowers/specs/\|docs/superpowers/plans/"
  ```

  Expected: no output.

  If any of these three greps return unexpected output, go back and fix the corresponding file
  before proceeding — do not bump the version or commit over an incomplete sweep.

- [ ] **Step 4: Run the full suite one final time**

  Run: `npm test`
  Expected: all 1687 tests pass, 0 failures (same count as the pre-task baseline — no tests
  were added or removed across this whole plan).

- [ ] **Step 5: Commit**

  ```bash
  git add .claude-plugin/plugin.json
  git commit -m "Bump version — remove tidy github-triage routine

  refs #remove-tidy-github-triage-routine"
  ```

- [ ] **Step 6: Note the marketplace mirror (not part of this plan)**

  Per this repo's Releasing convention, the marketplace-repo mirror
  (`thomasholknielsen/claude-tweaks-marketplace`'s `.claude-plugin/marketplace.json`) must be
  updated to match this new version when this branch ships — that happens in the separate
  marketplace repo, outside this worktree, and is not a task in this plan. Flag it at
  finishing-the-branch time so it isn't forgotten.

---

## Self-Review Notes

- **Spec coverage:** every "Files touched" row in the design doc maps to exactly one step above
  — code/test (Task 1), the two deletions plus the SKILL.md rewrite and Archival-compaction
  relocation (Task 2), the 3 scan-procedures.md cross-references (Task 3), the full
  `--variant` strip in routine/SKILL.md (Task 4), the schema doc (Task 5), the three `/init`
  files (Task 6), the three small doc files (Task 7), and the version bump + sweep (Task 8).
  The Migration note in the design doc is informational only (no instantiated routine record
  exists in this repo) and correctly has no corresponding task.
- **Placeholder scan:** every step above contains literal old/new text, exact commands, or exact
  grep patterns — no "TBD," no "handle appropriately," no "similar to Task N" shortcuts.
- **Type/name consistency:** `POLICY_KEYS` (not `POLICY_SCHEMA`) is the actual exported name in
  `bin/lib/policy-schema.js` and is used consistently in Task 1; the design doc's looser
  "POLICY_SCHEMA" phrasing was a conceptual label only, not a task-facing type name — Task 1
  uses the real one throughout.
