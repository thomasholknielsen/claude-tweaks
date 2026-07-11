# Tidy GitHub-Triage Evidence Tier + Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third routing bucket (`auto-mutate-with-evidence`) to `/claude-tweaks:tidy`'s `--scope=github` routine firings, gated behind a new opt-in policy flag, so cite-able-evidence findings (thread resolved by a later commit, milestone due date passed, watched path touched, flagged code demonstrably removed) auto-apply instead of silently piling up in a throwaway standalone run directory nobody reads. Pair it with a rolling digest artifact (one GitHub issue or one committed file, updated in place, never recreated), dedup across firings, a `PushNotification` that only fires when something genuinely needs a human, and the 30-day archival compaction `_shared/auto-decision-log.md` already documents as "planned — not yet implemented."

**Architecture:** One small, real code change (`classifyBacklogIssue` gains a `milestoneDueOn` field, additive and backward-compatible) plus prose changes across `skills/tidy/SKILL.md`, `skills/_shared/github-pr-scan.md`, `skills/_shared/auto-decision-log.md`, `skills/tidy/routine-template-github-triage.yml`, and `skills/triage/SKILL.md`'s already-existing (but previously unfulfilled) cross-reference. The evidence tier is a narrow override that applies ONLY when `/tidy` is a Standalone-auto routine firing (no parent pipeline, `auto-mode: default-on`) scoped to `--scope=github` — interactive invocations and pipeline-embedded `/tidy` runs are completely unaffected regardless of the new flag's value; the existing `tidy-aggressiveness` conservative/moderate/aggressive table is untouched.

## Global Constraints

- **New policy flag:** `tidy-routine-autonomy: conservative | evidence-based` (default `conservative` — today's behavior, unchanged). Read from the target project's CLAUDE.md (same missing-flag-defaults convention as `backlog-backend`). Checked only when BOTH hold: (a) `/tidy` is executing via the Standalone-auto fallback (no parent pipeline run dir, `auto-mode: default-on` already set), AND (b) the active scope includes `github` (i.e. Step 4.8 ran). This flag is NOT wired into `/init`'s interactive flow — it's manually set in CLAUDE.md, matching how `tidy-aggressiveness` itself is a `config.yml` Manifesto lever rather than an `/init`-time question. Do not add an `/init` prompt for it.
- **The four qualifying evidence shapes**, each an override on an existing "Stage — never auto-applied" row in `tidy/SKILL.md`'s Step 6 aggressiveness table:
  1. Unresolved review thread whose flagged file:line a later commit provably touches → **Resolve thread**, evidence = the commit SHA.
  2. Parked backlog issue whose milestone due date has passed → **Promote**, evidence = the due date.
  3. Parked backlog issue whose watched path was touched since parking → **Promote**, evidence = the `git log` hit (commit SHA).
  4. Code-health/harness-health issue whose flagged code is demonstrably removed/rewritten since filing → **Close (GitHub), superseded**, evidence = the diff reference.
- **Design decision — what "Promote" mutates on a parked GitHub backlog issue under the evidence tier:** (1) `gh issue edit {n} --remove-label parked`, (2) post a comment citing the literal evidence (the due date, or the commit SHA(s) touching the watched path). This does **not** auto-run `/claude-tweaks:specify` — it only restores the issue to plain `backlog`-labeled (no `parked`) state, exactly mirroring what `/specify` itself already does when a human runs it manually on a parked issue (per `tidy/SKILL.md`'s existing Action Vocabulary "Promote" row and `specify/SKILL.md` Step 3's `recon-was-parked` handling) — this design just lets the trigger firing do it proactively instead of waiting for a human to run `/specify`. The issue then flows into the pending-authorization queue exactly like any other `backlog`-labeled, non-`parked` issue.
- **The four EXCLUDED judgment-call shapes stay staged always**, unaffected by the flag, because `github-pr-scan.md`'s own findings table already labels them judgment calls: stale-PR close-or-resume, PR-superseded-by-equivalent-work, backlog inbox->4wk delete-or-promote, and any "still valid" code-health/harness-health assessment.
- **Every evidence-tier auto-mutation logs an `AUTO` line to `decisions.md`** per `_shared/auto-decision-log.md`'s format, citing the literal evidence inline (never a bare reason label like "evidence-based").
- **`classifyBacklogIssue`'s new `milestoneDueOn` field** is additive: the existing `milestone` field (a title string, or `null`) is unchanged; a new sibling field `milestoneDueOn` (an ISO date string from the raw `milestone.dueOn`, or `null` when no milestone or no due date) is added alongside it.
- **Digest artifact identity:**
  - `backlog-backend: github-issues` (and the project has a GitHub remote regardless of backlog backend, per the Detection Ladder): one GitHub issue, found via `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body` and confirmed by an exact `<!-- tidy-digest-marker -->` HTML comment in the body (same disambiguation pattern `code-health-fingerprint` already uses elsewhere in this codebase) — never matched by title alone. If none found, this firing creates it once (`gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>`); every later firing edits it in place (`gh issue edit {n} --body-file <file>`), never creates a second one.
  - `backlog-backend: local-files` (or no GitHub remote at all — the Detection Ladder's own fail-open path): one committed file, `.claude-tweaks/tidy-digest.md`, rewritten in place and committed each firing.
- **Digest has exactly three sections, in this order:** `## Auto-applied`, `## Auto-mutated with evidence`, `## Still needs your review`. The last section ends with a `**Pending authorization:** {N} issues awaiting a tier label` line (see the pending-authorization queue-size item below).
- **Dedup key:** `{PR or issue number}:{finding-type}` (e.g. `142:stale-pr`, `88:unresolved-thread`). Before adding a row to "Still needs your review," read the digest's CURRENT content and text-match this key against existing rows. A match → update that row's `(still open as of {timestamp})` suffix in place, do not duplicate, do not trigger a fresh notification for it. A materially different finding for the same number (e.g. the PR was Review-passing before, now CI-red) is a different finding-type key → a genuinely new row, triggers notification.
- **`PushNotification` fires at most once per firing**, only when "Still needs your review" is non-empty after this firing's updates. Never fires on an all-clear firing (nothing to review) and never fires more than once per firing regardless of how many new rows landed.
- **Archival implements the documented-but-unbuilt 30-day compaction.** `_shared/auto-decision-log.md` already states the target behavior and calls it "planned — not yet implemented" — this plan removes that caveat and builds it: on every Standalone-auto `/tidy` firing (not `--scope=github`-specific — this sweep is about aging OUT any prior standalone run, regardless of which scope produced it), scan `.claude-tweaks/pipelines/` for standalone run directories whose ISO-timestamp prefix is more than 30 days old, fold each one's `decisions.md` content into one monthly rollup file `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (append, keyed by the run's own timestamp), then move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` — the same archive root `/wrap-up` already uses for completed pipeline runs, so both flows share one archive.
- **Pending-authorization queue-size surfacing fulfills an existing, previously-unfulfilled cross-file promise.** `skills/triage/SKILL.md`'s Relationship-to-Other-Skills table already states: "`/claude-tweaks:tidy` | Step 4.8 surfaces `status:blocked` counts and the pending-authorization queue size (issues with no tier label yet) as maintenance signals; `/tidy` never applies a tier label itself." Grepping `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, and `skills/_shared/github-pr-scan.md` confirms this was never actually implemented — this plan is where it gets its consumer. Tier labels are `agent:go` / `agent:fast` / (whatever the current triage tier-label vocabulary is — read `skills/triage/SKILL.md` directly during Task 3 to get the exact label names, do not guess).
- Every markdown edit in this plan is a literal text substitution given verbatim below; the one code task (Task 1) follows standard TDD (failing test → implementation → passing test).

---

### Task 1: Extend `classifyBacklogIssue` with `milestoneDueOn`

**Files:**
- Modify: `bin/lib/issues/backlog.js`
- Test: `bin/lib/issues/tests/backlog.test.js`

**Interfaces:**
- Produces: `classifyBacklogIssue(...)` now returns `{ number, title, stage, category, priority, milestone, milestoneDueOn, watchedPaths, updatedAt, url }` — every other task in this plan that reads a classified backlog issue's milestone data uses `milestoneDueOn` (ISO date string or `null`), never re-derives it from the raw `milestone` object itself.

- [ ] **Step 1: Read the current implementation and test fixtures**

  Read `bin/lib/issues/backlog.js` (the `classifyBacklogIssue` function, currently returning `milestone: milestone.title` with no due-date field) and `bin/lib/issues/tests/backlog.test.js` (the `PARKED_ISSUE` fixture at line 141, currently `milestone: { title: 'Before launch' }` with no `dueOn`). Confirm these match this description exactly before proceeding — if they don't, stop and report NEEDS_CONTEXT.

- [ ] **Step 2: Write the failing tests**

  In `bin/lib/issues/tests/backlog.test.js`, add a new fixture (near `PARKED_ISSUE`, same file):

  ```javascript
  const PARKED_ISSUE_WITH_DUE_DATE = {
    ...PARKED_ISSUE,
    milestone: { title: 'Before launch', dueOn: '2026-08-01T00:00:00Z' },
  };
  ```

  Add these tests immediately after the existing `classifyBacklogIssue milestone is null when none is attached` test:

  ```javascript
  test('classifyBacklogIssue surfaces the attached milestone due date', () => {
    assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE_WITH_DUE_DATE).milestoneDueOn, '2026-08-01T00:00:00Z');
  });

  test('classifyBacklogIssue milestoneDueOn is null when the milestone has no due date', () => {
    assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).milestoneDueOn, null);
  });

  test('classifyBacklogIssue milestoneDueOn is null when no milestone is attached', () => {
    assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).milestoneDueOn, null);
  });
  ```

- [ ] **Step 3: Run tests to verify they fail**

  Run: `node --test bin/lib/issues/tests/backlog.test.js`
  Expected: FAIL — 3 new failures, `milestoneDueOn` is `undefined`, not the expected value (since `classifyBacklogIssue` doesn't return this field yet).

- [ ] **Step 4: Implement `milestoneDueOn` in `classifyBacklogIssue`**

  In `bin/lib/issues/backlog.js`, replace:

  ```javascript
  // issue: { number, title, labels, body, milestone, updatedAt, url } — shaped like
  // `gh issue list --json number,title,labels,body,milestone,updatedAt,url` output.
  // Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
  // watchedPaths, updatedAt, url } — category/priority/milestone/watchedPaths are null
  // when absent.
  function classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url }) {
    const names = labelNames(labels);
    const stage = names.includes('parked') ? 'parked' : 'inbox';
    const categoryLabelName = names.find((n) => n.startsWith('backlog:category-'));
    const priorityLabelName = names.find((n) => n.startsWith('backlog:priority-'));
    return {
      number,
      title,
      stage,
      category: categoryLabelName ? categoryLabelName.slice('backlog:category-'.length) : null,
      priority: priorityLabelName ? priorityLabelName.slice('backlog:priority-'.length) : null,
      milestone: milestone ? milestone.title : null,
      watchedPaths: extractWatchedPaths(body),
      updatedAt,
      url,
    };
  }
  ```

  with:

  ```javascript
  // issue: { number, title, labels, body, milestone, updatedAt, url } — shaped like
  // `gh issue list --json number,title,labels,body,milestone,updatedAt,url` output.
  // Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
  // milestoneDueOn, watchedPaths, updatedAt, url } — category/priority/milestone/
  // milestoneDueOn/watchedPaths are null when absent.
  function classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url }) {
    const names = labelNames(labels);
    const stage = names.includes('parked') ? 'parked' : 'inbox';
    const categoryLabelName = names.find((n) => n.startsWith('backlog:category-'));
    const priorityLabelName = names.find((n) => n.startsWith('backlog:priority-'));
    return {
      number,
      title,
      stage,
      category: categoryLabelName ? categoryLabelName.slice('backlog:category-'.length) : null,
      priority: priorityLabelName ? priorityLabelName.slice('backlog:priority-'.length) : null,
      milestone: milestone ? milestone.title : null,
      milestoneDueOn: milestone && milestone.dueOn ? milestone.dueOn : null,
      watchedPaths: extractWatchedPaths(body),
      updatedAt,
      url,
    };
  }
  ```

- [ ] **Step 5: Run tests to verify they pass**

  Run: `node --test bin/lib/issues/tests/backlog.test.js`
  Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 6: Run the full test suite**

  Run: `npm test`
  Expected: all 717 tests pass (714 existing + 3 new).

- [ ] **Step 7: Commit**

  ```bash
  git add bin/lib/issues/backlog.js bin/lib/issues/tests/backlog.test.js
  git commit -m "backlog.js: add milestoneDueOn to classifyBacklogIssue (additive, backward compatible)"
  ```

---

### Task 2: Evidence-tier routing logic in `tidy/SKILL.md`

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: `classifyBacklogIssue`'s `milestoneDueOn` field from Task 1.
- Produces: the `tidy-routine-autonomy` flag and the auto-mutate-with-evidence override that Task 4 (digest) and Task 6 (archival) reference.

- [ ] **Step 1: Insert the evidence-tier section immediately after the existing "Standalone auto" paragraph**

  Locate this existing paragraph in `skills/tidy/SKILL.md` (Step 6, immediately after the `**Log entries:**` example block and the "Auto-applied items are committed..." sentence):

  ```
  **Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from CLAUDE.md as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).
  ```

  Replace it with (same text, plus a new subsection immediately after):

  ```markdown
  **Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from CLAUDE.md as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).

  #### Evidence tier (`--scope=github` routine firings only)

  When this Standalone-auto firing's scope includes `github` (Step 4.8 ran), read `tidy-routine-autonomy` from CLAUDE.md (default `conservative`). Under `conservative`, nothing in this subsection applies — every GitHub-mutation finding routes through the table above exactly as always (all four "Stage — never auto-applied" rows stay staged).

  Under `evidence-based`, before staging any of the following four finding shapes, check whether it carries the specific cite-able evidence listed. If it does, auto-apply the mutation instead of staging it, and log the evidence literally:

  | Finding shape | Evidence required | Auto-applied action |
  |---|---|---|
  | Unresolved review thread whose flagged file:line a later commit touches | The commit SHA that touches those lines | Resolve thread (GraphQL `resolveReviewThread`) |
  | Parked backlog issue, `milestoneDueOn` is in the past | The due date itself | `gh issue edit {n} --remove-label parked`, then comment citing the due date |
  | Parked backlog issue, a `watchedPaths` entry has a matching commit in `git log` since the issue was parked | The commit SHA `git log` returns | `gh issue edit {n} --remove-label parked`, then comment citing the commit SHA and touched path |
  | Code-health/harness-health issue whose flagged code is demonstrably removed or rewritten since filing (a diff shows the flagged lines gone or materially changed) | The diff reference (commit range or PR number) | `gh issue close {n} --reason "not planned"` after a comment citing the diff reference |

  These four are the only shapes this tier ever touches. Every other GitHub-mutation finding — stale-PR close-or-resume, PR-superseded-by-equivalent-work, backlog inbox item past 4 weeks (delete-or-promote), and any "still valid" code-health/harness-health assessment — is a judgment call per `_shared/github-pr-scan.md`'s own findings table and stays staged regardless of `tidy-routine-autonomy`.

  Log entries follow the same format as the table above, e.g.:
  ```
  AUTO 03:14:02 — Step 6 (evidence tier): resolved thread on PR #88 — commit a1b2c3d touches src/auth.ts:42-48 (the flagged lines). Reversibility: low (GitHub state; thread can be manually re-opened).
  AUTO 03:14:09 — Step 6 (evidence tier): removed `parked` label from issue #142 — milestone "Q3 launch" due date 2026-08-01 has passed. Reversibility: med (label re-addable; commented with cited evidence).
  ```
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "tidy-routine-autonomy\|Evidence tier" skills/tidy/SKILL.md
  ```

  Expected: at least 3 hits (the flag mention, the section header, the table intro).

- [ ] **Step 3: Commit**

  ```bash
  git add skills/tidy/SKILL.md
  git commit -m "tidy: add auto-mutate-with-evidence tier for --scope=github routine firings"
  ```

---

### Task 3: `github-pr-scan.md` — evidence details + pending-authorization queue size

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`

**Interfaces:**
- Consumes: `classifyBacklogIssue`'s `milestoneDueOn` field (Task 1).
- Produces: the queue-size count Task 4's digest surfaces in "Still needs your review."

- [ ] **Step 1: Read `skills/triage/SKILL.md` directly to get the exact tier-label vocabulary**

  Before editing, read `skills/triage/SKILL.md` in full (or at minimum its label-vocabulary section) to find the exact current tier label names (e.g. `agent:go`, `agent:fast`, or whatever the actual current names are post-triage-status-lifecycle). Do not guess or reuse names from memory — that design shipped its own final vocabulary and this task must match it exactly. Use the exact label names found in the edit below, substituting for `{TIER_LABELS}` wherever it appears.

- [ ] **Step 2: Add the pending-authorization queue-size query to the `repo-wide` scope section**

  In `skills/_shared/github-pr-scan.md`, immediately after item 6 (the "Backlog issues" item, ending with "One query, split client-side by `stage`... not two separate queries."), add a new item 7:

  ```markdown
  7. **Pending-authorization queue size** (only under `backlog-backend: github-issues`, same gate as item 6) — count open `backlog`-labeled issues carrying none of the tier labels ({TIER_LABELS} — read the exact current set from `skills/triage/SKILL.md`, do not hardcode a stale list here):

     ```bash
     gh issue list --label backlog --state open --json number,labels \
       --jq '[.[] | select((.labels | map(.name) | any(startswith("agent:"))) | not)] | length'
     ```

     This is a maintenance signal only — `/tidy` never applies a tier label itself (`/claude-tweaks:triage` owns that). Surface the count in the digest's "Still needs your review" section (see `tidy/SKILL.md`'s digest section) as `**Pending authorization:** {N} issues awaiting a tier label`.
  ```

  (Replace `{TIER_LABELS}` in the prose above with the actual label list found in Step 1 — do not leave the placeholder text in the shipped file.)

- [ ] **Step 3: Update the Backlog-issue findings table rows to reference `milestoneDueOn` explicitly**

  Replace:

  ```
  | Backlog issue, stage `parked`, milestone attached | Trigger met when the milestone is due/closed — Promote. Otherwise Keep. |
  ```

  with:

  ```
  | Backlog issue, stage `parked`, milestone attached | Trigger met when `milestoneDueOn` (from `classifyBacklogIssue`) is in the past — Promote (evidence: the due date; qualifies for the evidence tier, see `tidy/SKILL.md`). Otherwise Keep. |
  ```

  Replace:

  ```
  | Backlog issue, stage `parked`, `watchedPaths` present | Trigger met when `git log` shows recent commits touching any watched path — Promote. Otherwise Keep. |
  ```

  with:

  ```
  | Backlog issue, stage `parked`, `watchedPaths` present | Trigger met when `git log` shows recent commits touching any watched path — Promote (evidence: the commit SHA; qualifies for the evidence tier, see `tidy/SKILL.md`). Otherwise Keep. |
  ```

- [ ] **Step 4: Update the Output Contract to add the new collection prefix**

  Replace:

  ```
  - `[deferred]` — backlog issue, stage `parked`: `[deferred] {title} — from issue #{n} — {recommendation}` (mirrors `/tidy` Step 1.5's file-based row shape; `#{n}` stands in for `spec {N}` since a parked issue has no originating spec)
  ```

  with:

  ```
  - `[deferred]` — backlog issue, stage `parked`: `[deferred] {title} — from issue #{n} — {recommendation}` (mirrors `/tidy` Step 1's file-based row shape; `#{n}` stands in for `spec {N}` since a parked issue has no originating spec)
  - `[queue]` — pending-authorization queue size (item 7 above, `repo-wide` scope only, `backlog-backend: github-issues` only): `[queue] {N} issues awaiting a tier label`
  ```

- [ ] **Step 5: Verify**

  ```bash
  grep -n "milestoneDueOn\|Pending authorization\|\[queue\]" skills/_shared/github-pr-scan.md
  ```

  Expected: at least 4 hits, no literal `{TIER_LABELS}` placeholder remaining.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/_shared/github-pr-scan.md
  git commit -m "github-pr-scan: surface milestoneDueOn evidence + pending-authorization queue size"
  ```

---

### Task 4: Digest artifact — identity, write-in-place, dedup

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: the evidence-tier auto-mutations from Task 2, the queue-size count from Task 3.
- Produces: the digest structure Task 5 (notification) reads to decide whether to fire.

- [ ] **Step 1: Insert the digest section immediately after the evidence-tier subsection added in Task 2**

  Immediately after the evidence-tier table and its two example log lines added in Task 2 Step 1 (ending `...Reversibility: med (label re-addable; commented with cited evidence).`), add:

  ```markdown

  #### Rolling digest (`--scope=github` routine firings only)

  Every Standalone-auto `--scope=github` firing updates one rolling digest artifact in place — never creates a new one per firing.

  **Identity:**
  - `backlog-backend: github-issues` (or any project with a reachable GitHub remote, regardless of backlog backend — this is about where the digest lives, not the backlog storage choice): find the digest issue via `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body`, then confirm the match by checking its body contains the exact marker `<!-- tidy-digest-marker -->` (title alone is not sufficient — do not match on title only). If found, `gh issue edit {n} --body-file <file>`. If not found (first-ever firing, or the issue was manually closed), `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once.
  - `backlog-backend: local-files` with no reachable GitHub remote: rewrite `.claude-tweaks/tidy-digest.md` in place and commit it.

  **Structure**, exactly three sections in this order:

  ```markdown
  <!-- tidy-digest-marker -->
  # Tidy GitHub-Triage Digest

  Last updated: {ISO timestamp}

  ## Auto-applied

  - {finding} — {action} — {timestamp}

  ## Auto-mutated with evidence

  - {finding} — {action} — evidence: {literal evidence cited} — {timestamp}

  ## Still needs your review

  - {finding} — {recommendation} — (still open as of {timestamp})

  **Pending authorization:** {N} issues awaiting a tier label
  ```

  **Dedup (applies to "Still needs your review" only — the other two sections are a fresh append per firing, since they're already-resolved actions, not open items):** before adding a row, compute its key as `{PR or issue number}:{finding-type}` (e.g. `142:stale-pr`, `88:unresolved-thread`). Read the digest's current "Still needs your review" section and check for a row with a matching key (match on the PR/issue number and finding-type substring in the existing row text — both are always present in the rendered row). If found, update only that row's `(still open as of {timestamp})` suffix to the current firing's timestamp — do not add a second row, do not treat this as a new finding for notification purposes (see the PushNotification subsection below). If not found, append a new row — this is either a genuinely new finding or one whose finding-type changed materially for the same number (e.g. a PR that was `Review` last firing is now `CI-red` — different finding-type key, so a new row, which does count as new for notification purposes).
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "tidy-digest-marker\|Rolling digest\|Still needs your review" skills/tidy/SKILL.md
  ```

  Expected: at least 3 hits.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/tidy/SKILL.md
  git commit -m "tidy: add rolling digest artifact with dedup for --scope=github routine firings"
  ```

---

### Task 5: `PushNotification` wiring

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: the digest's "Still needs your review" section state from Task 4.

- [ ] **Step 1: Insert the notification subsection immediately after the digest section added in Task 4**

  Immediately after Task 4's digest section (ending `...a new row, which does count as new for notification purposes.`), add:

  ```markdown

  #### Notification (`--scope=github` routine firings only)

  After the digest is written, call `PushNotification` at most once per firing, and only when the "Still needs your review" section is non-empty after this firing's updates (i.e. at least one row exists there, whether newly added or pre-existing). Compose the notification body from the count and the top finding, e.g. `"{N} items need your review — {top finding title}. See the Tidy GitHub-Triage Digest."` Never fire when "Still needs your review" is empty (an all-clear firing) — this keeps the signal high-value; a routine firing every 3 hours that notified on every run would train the user to ignore it.
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "PushNotification" skills/tidy/SKILL.md
  ```

  Expected: at least 1 hit.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/tidy/SKILL.md
  git commit -m "tidy: wire PushNotification to fire only when the digest needs review"
  ```

---

### Task 6: Archival compaction

**Files:**
- Modify: `skills/_shared/auto-decision-log.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the archival behavior other standalone-auto skills (not just `/tidy`) can eventually adopt, though this plan only wires it into `/tidy`.

- [ ] **Step 1: Update `auto-decision-log.md`'s Archival section to describe the real, built behavior**

  Replace:

  ```
  `/tidy` may compact archive entries older than 30 days into `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (planned — not yet implemented).
  ```

  with:

  ```
  `/tidy` compacts archive entries older than 30 days: any standalone run directory under `.claude-tweaks/pipelines/` whose ISO-timestamp prefix is more than 30 days old gets its `decisions.md` content folded into `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (one monthly rollup file, appended per compacted run — keyed by the run's own timestamp so entries stay chronologically traceable), then the run directory itself moves to `.claude-tweaks/pipelines/archive/{run-id}/` — the same archive root completed pipeline runs already use. See `tidy/SKILL.md`'s "Archival compaction" subsection for the exact procedure.
  ```

- [ ] **Step 2: Add the archival-compaction subsection to `tidy/SKILL.md`**

  Immediately after Task 5's notification subsection (ending `...an all-clear firing) — this keeps the signal high-value; a routine firing every 3 hours that notified on every run would train the user to ignore it.`), add:

  ```markdown

  #### Archival compaction (every Standalone-auto firing, any scope)

  Unlike the evidence tier, digest, and notification subsections above (which are `--scope=github`-specific), this compaction sweep runs on every Standalone-auto `/tidy` firing regardless of scope — it's about aging out prior standalone runs, not about this run's own findings.

  Before writing this run's own report, scan `.claude-tweaks/pipelines/` for standalone run directories (matching `*-standalone`) whose ISO-timestamp prefix is more than 30 days old. For each:

  1. Read its `decisions.md`.
  2. Append its content to `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (the month derived from the run's own timestamp, not today's date — a run compacted late still files under the month it actually ran), creating the file if absent. Prefix the appended block with the run's own directory name as a header so entries stay attributable.
  3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` (same target `/wrap-up` uses for completed pipeline runs — see `wrap-up/cleanup-procedures.md` Section B).
  4. Log one `AUTO` line to *this* firing's own `decisions.md`: `AUTO {time} — Archival: compacted {run-id} (age: {N} days) into index-{YYYY-MM}.md. Reversibility: high (archive is additive, nothing deleted).`

  Skipped staged items inside a compacted run are preserved verbatim in the archive (not silently dropped) — same rule `/wrap-up`'s own archival already follows.
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "planned — not yet implemented" skills/_shared/auto-decision-log.md
  ```

  Expected: no output (the caveat is fully replaced, not left alongside the new behavior).

  ```bash
  grep -n "Archival compaction\|index-{YYYY-MM}" skills/tidy/SKILL.md skills/_shared/auto-decision-log.md
  ```

  Expected: at least 3 hits across both files.

- [ ] **Step 4: Commit**

  ```bash
  git add skills/_shared/auto-decision-log.md skills/tidy/SKILL.md
  git commit -m "tidy, auto-decision-log: implement the documented-but-unbuilt 30-day archival compaction"
  ```

---

### Task 7: Routine template notes + relationship-table cross-references

**Files:**
- Modify: `skills/tidy/routine-template-github-triage.yml`
- Modify: `skills/tidy/SKILL.md` (Relationship-to-Other-Skills table)
- Modify: `skills/triage/SKILL.md` (Relationship-to-Other-Skills table, if its existing row needs a forward-reference update)

**Interfaces:**
- Consumes: nothing new — this task is documentation/cross-reference only.

- [ ] **Step 1: Update the routine template's `notes` field**

  In `skills/tidy/routine-template-github-triage.yml`, replace the `notes:` block's final sentence:

  ```
  if Task-based subagent dispatch isn't supported in a given cloud routine session, it degrades to running sequentially, same as the base template.
  ```

  with:

  ```
  if Task-based subagent dispatch isn't supported in a given cloud routine session, it degrades to running sequentially, same as the base template. Set `tidy-routine-autonomy: evidence-based` in this project's CLAUDE.md to let cite-able-evidence findings (thread resolved by commit, milestone/watched-path trigger met, superseded code-health issue) auto-apply on this routine's firings instead of only staging to the rolling digest — see skills/tidy/SKILL.md's "Evidence tier" subsection. Default is `conservative` (everything stages, matching pre-this-feature behavior).
  ```

- [ ] **Step 2: Verify `tidy/SKILL.md`'s Relationship-to-Other-Skills table already covers `/claude-tweaks:triage`; add a row if it doesn't**

  Read `skills/tidy/SKILL.md`'s Relationship-to-Other-Skills table in full. If it has no row for `/claude-tweaks:triage`, add one:

  ```
  | `/claude-tweaks:triage` | `/tidy` Step 4.8's pending-authorization queue-size count (item 7 in `_shared/github-pr-scan.md`'s `repo-wide` scope) surfaces in the rolling digest so a human sees both `/tidy`'s own findings and `/claude-tweaks:triage`'s queue in one place. `/tidy` never applies a tier label itself — that stays `/claude-tweaks:triage`'s job. |
  ```

  If a row already exists (e.g. from the earlier triage-status-lifecycle work), update it to reflect the digest instead of adding a duplicate row — read the existing row's exact text first and report what you found before deciding whether to edit or add.

- [ ] **Step 3: Confirm `skills/triage/SKILL.md`'s existing row about `/tidy` is now accurate**

  `skills/triage/SKILL.md`'s Relationship-to-Other-Skills table already contains: `` | `/claude-tweaks:tidy` | Step 4.8 surfaces `status:blocked` counts and the pending-authorization queue size (issues with no tier label yet) as maintenance signals; `/tidy` never applies a tier label itself. | `` — this plan's Task 3 (queue-size query) and Task 4 (digest) are what make this row true. No edit needed to this specific row unless its surrounding context (e.g. a "not yet implemented" caveat) needs removing — read it directly and report if any such caveat is present; if so, remove only that caveat phrase, leaving the rest of the row's factual content unchanged.

- [ ] **Step 4: Verify**

  ```bash
  grep -n "tidy-routine-autonomy" skills/tidy/routine-template-github-triage.yml
  ```

  Expected: at least 1 hit.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/tidy/routine-template-github-triage.yml skills/tidy/SKILL.md skills/triage/SKILL.md
  git commit -m "tidy, triage: cross-reference the evidence tier, digest, and pending-authorization queue"
  ```

  (If Step 3 found nothing to change in `triage/SKILL.md`, drop it from this `git add` — do not create an empty diff for a file with no actual changes.)

---

### Task 8: Whole-repo verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm the new flag, evidence tier, digest, notification, and archival sections are all present**

  ```bash
  grep -n "tidy-routine-autonomy\|Evidence tier\|Rolling digest\|Archival compaction" skills/tidy/SKILL.md
  ```

  Expected: at least 4 hits (one per subsection header/mention).

- [ ] **Step 2: Confirm no stale "planned — not yet implemented" caveat survives for the archival feature**

  ```bash
  grep -rn "planned — not yet implemented" skills/
  ```

  Expected: no output.

- [ ] **Step 3: Confirm `classifyBacklogIssue`'s new field is consumed correctly wherever it's referenced**

  ```bash
  grep -rn "milestoneDueOn" skills/ bin/
  ```

  Expected: hits in `bin/lib/issues/backlog.js`, `bin/lib/issues/tests/backlog.test.js`, and `skills/_shared/github-pr-scan.md` — no other file should reference this field name incorrectly (e.g. as `milestone_due_on` or `dueOn` alone).

- [ ] **Step 4: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: 717/717 passing (714 baseline + 3 new from Task 1), modulo the same pre-existing, unrelated `statusline.test.js` timing flake seen throughout this project's test history.

- [ ] **Step 5: Final commit (if Step 1-3 surfaced any straggler fix)**

  If verification found any remaining gap, fix it now, re-verify, then:

  ```bash
  git add -A
  git commit -m "tidy-github-triage-evidence-tier: fix stragglers found by whole-repo sweep"
  ```

  If nothing was found, skip this commit — Task 8 is verification-only.

## Self-Review Notes

- **Spec coverage:** Solution A (evidence tier + exclusion list) → Task 2. Solution B (digest + pending-authorization surfacing) → Tasks 3-4. Solution C (dedup) → Task 4. Solution D (archival) → Task 6. The design's own Testing/verification approach's 5 scenarios map to: scenario 1 (evidence-based auto-resolve + decisions.md logging) → Task 2; scenario 2 (judgment-call findings still stage) → Task 2's exclusion list; scenario 3 (dedup, no duplicate notification) → Task 4; scenario 4 (no notification on all-clear) → Task 5; scenario 5 (30-day archival) → Task 6.
- **Design decisions made during planning, not left implicit:** what "Promote" concretely mutates on a parked GitHub issue under the evidence tier (Global Constraints, resolved by mirroring `/specify`'s existing `parked`-removal behavior rather than inventing a new mutation shape); the digest's exact identity-resolution mechanism (marker comment + title search, mirroring the existing `code-health-fingerprint` pattern); the dedup key shape (`{number}:{finding-type}`); the pending-authorization queue-size query filtering on `agent:` label prefix (Task 3 explicitly instructs reading `triage/SKILL.md`'s actual current label vocabulary rather than hardcoding a guessed set, since that design shipped after this one was drafted and its final label names must be read fresh, not assumed).
- **No placeholders:** every edit is literal before/after text; the one deliberately-left-open item (`{TIER_LABELS}` in Task 3 Step 2's markdown block) is explicitly flagged as "read the exact current set... do not hardcode a stale list here" and the task's own Step 5 verification checks the placeholder was actually replaced before committing — this is a controlled substitution, not an unresolved placeholder in the shipped output.
- **Type/name consistency:** `milestoneDueOn`, `tidy-routine-autonomy`, `tidy-digest-marker`, and the dedup key shape are used identically everywhere they appear across Tasks 1-6.
