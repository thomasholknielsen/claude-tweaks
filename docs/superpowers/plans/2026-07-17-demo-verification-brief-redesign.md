# Demo Verification Brief Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/claude-tweaks:demo`'s walkthrough so it's a genuine vision/fit judgment tool instead
of a thin, pointer-based brief that reads like `/claude-tweaks:triage`'s batch-then-label
bookkeeping.

**Architecture:** Rewrite `skills/wrap-up/verification-brief.md` so the brief is always a
self-contained digest sourced from `/review` + `/visual-review`'s existing output, add a
safety-net gate that triggers a real visual-review pass (reusing `/review` Step 6's own
invocation) when one hasn't already run for a testable record, and reframe
`/claude-tweaks:demo`'s Step 3 verdict prompt around vision/fit with a new "Show me live"
on-demand look.

**Tech Stack:** Markdown skill files (prose procedures), `gh` CLI, `git`, no new `bin/` code.

## Global Constraints

- Screenshot commit path: `docs/demo-evidence/{record}/{NN}-{description}.png` — `{record}` is the
  issue number (`github-issues`) or record id (`local-files`); `{NN}` a zero-padded sequence
  starting at `01`; `{description}` a short kebab-case label.
- Embed screenshots via a **commit-SHA-pinned** raw URL:
  `https://raw.githubusercontent.com/{owner}/{repo}/{commit-sha}/docs/demo-evidence/{record}/{NN}-{description}.png`
  — never branch-pinned (see Task 1 rationale). `local-files` backend uses a relative repo path
  instead (no comment mechanism to post a raw URL into).
- Screenshot cap: **1-3 per record** — most representative state(s), not the full walk.
- Safety-net gate reads `/review`'s summary `### Visual Review` section's `**Status:**` field
  (exact values defined in `skills/review/review-summary-template.md`): `Completed (code +
  visual)`, `Completed (code + visual, QA-enriched)`, `Recommended — journeys affected`,
  `Recommended — UI changed (no journeys)`, `Skipped — no UI changes`, `Skipped — browser tools
  not configured`.
- "Buggy" (blocking) findings from the safety-net gate = **high/critical only**, per
  `_shared/criteria-review-quality.md`'s existing severity floors — medium/low findings are
  context, not a blocker.
- `npm test` must stay green throughout (no `bin/` code changes expected in this plan — verify
  after every task regardless).
- New section headings in the Verification Brief template — `### The ask`, `### What shipped`,
  `### Confirmed`, `### See it yourself` — must be used verbatim and identically by every task
  that references the template shape (Task 1 defines it; Task 3 references it).
- Version bump: read `.claude-plugin/plugin.json`'s current `version` at execution time and check
  `origin/main` for a concurrent bump first (CLAUDE.md's Releasing section) — do not hardcode a
  version number in this plan; it would already be stale by the time this task runs.

---

### Task 1: Rewrite `skills/wrap-up/verification-brief.md`

**Files:**
- Modify: `skills/wrap-up/verification-brief.md` (full rewrite of Steps 2-4; Step 1 unchanged)

**Interfaces:**
- Produces: the Verification Brief template's four section headings (`### The ask`, `### What
  shipped`, `### Confirmed`, `### See it yourself`) and the new `## Step 2.5: Visual-Review
  Safety-Net Gate` step name — Task 2 and Task 3 reference both by name.
- Consumes: `review-summary-template.md`'s `### Visual Review` → `**Status:**` field values
  (read-only reference, not modified by this plan).

- [ ] **Step 1: Read the current file**

Read `skills/wrap-up/verification-brief.md` in full (85 lines as of this plan's authoring) to
confirm Step 1 (label bootstrap) is unchanged and to get exact line ranges for Steps 2-4.

- [ ] **Step 2: Replace Steps 2 through 4 with the rewritten procedure**

Replace everything from `## Step 2: Determine testability` through the end of the file with:

````markdown
## Step 2: Determine testability

Read the changed-file list for this run (`git diff --name-only {base}...HEAD`, or the
materialized header's file list). If every changed path matches a non-UI pattern —
documentation (`docs/**`, `*.md` outside `stories/`/`docs/journeys/`), configuration, harness
skill files (`skills/**/*.md`, `.claude/**`), or backend-only code with no route/component/page
touched — this record has **no interactive verification surface**. Otherwise it is testable.

## Step 2.5: Visual-Review Safety-Net Gate (testable records only)

Skip this step for non-testable records (Step 2) — there is nothing to walk.

Read this run's `/claude-tweaks:review` summary — the `### Visual Review` section's `**Status:**`
field (`review-summary-template.md`). Branch on its value:

| Status value | Meaning | Action |
|---|---|---|
| `Completed (code + visual)` or `Completed (code + visual, QA-enriched)` | A full browser walk already ran; any bug it found was already fixed and reverified through `/review`'s Step 3 Routing before `/review` could PASS | Proceed to Step 3 — no further action |
| `Recommended — journeys affected` or `Recommended — UI changed (no journeys)` | Only recommendation mode ran — no browser walk happened | Trigger the gate below |
| `Skipped — no UI changes` | Contradicts Step 2 finding an interactive surface | Treat as `Recommended` — trigger the gate below and let `/visual-review`'s own detection re-confirm |
| `Skipped — browser tools not configured` | Nothing was walked, nothing can be | See the browser-unavailable fallback below |
| No `/review` summary available for this run (standalone `/wrap-up`, no recent `/review` run) | No signal exists | Treat as `Recommended` — trigger the gate below |

**Trigger the gate** (`Recommended` / no-summary / `Skipped — no UI changes` cases): invoke
`/claude-tweaks:visual-review` now, using the same mode resolution `/review` Step 6 already
applies — `journey:{name}` when a journey was named (by the recommendation, or by matching
`docs/journeys/*.md` against the changed files), otherwise page mode against the resolved
`APP_URL` (`dev-url-detection.md`), otherwise discover mode. Route every finding through the same
severity floors `_shared/criteria-review-quality.md` defines: **high/critical** (broken layout,
accessibility barrier, functional defect) blocks — dispatch a fix the same way `/review`'s Step 3
Routing does, then re-run the walk until clean. **Medium/low** findings (polish, consistency
suggestions) are not blocking; they carry into Step 3's digest as context, not a gate. Never apply
`demo:pending` until any high/critical finding is fixed and reverified clean.

**Browser-unavailable fallback** (`Skipped — browser tools not configured`, or the trigger above
itself hits this status when it runs `/visual-review`): not a bug-found case — there is nothing to
fix, only nothing to verify. Proceed to Step 3 without blocking, using the same auto-mode
stage/skip semantics `/visual-review` already applies elsewhere (`_shared/auto-mode-contract.md`).
Record that visual verification wasn't available in this environment — Step 3's
testable-with-browser-unavailable sourcing applies for this record's Confirmed section instead.

## Step 3: Source the Confirmed-section content

Every record's brief converges on the same self-contained shape — no branch between "pointer to
another skill" and "generic fallback."

**Testable, visual-review available** (Step 2.5 resolved clean with an actual walk — not the
browser-unavailable fallback):

1. Read the visual-review report (from Step 2.5's trigger, or `/review`'s existing Step 6 report
   when no trigger was needed) for its headline: `clean`, or `found and fixed: {N} issues` (name
   each in one line).
2. Select 1-3 of the walk's most representative screenshots — the primary journey step's final
   state, or the single-page review's key screenshot(s). Hand them to Step 4's screenshot-commit
   procedure.
3. Resolve the entry point — `APP_URL` + the journey/page path (reuse `dev-url-detection.md`, do
   not re-derive URL discovery).

**Non-testable, or testable-with-browser-unavailable** (Step 2 found no interactive surface, or
Step 2.5's browser-unavailable fallback applied):

1. Pull the spec-compliance verdict and key quality notes from `/review`'s own summary
   (`### Spec Compliance` and `### Code Review Findings` sections).
2. Capture the diff: `git diff --stat {base}...HEAD` plus the diff itself. For diffs under ~200
   lines, include it in full; for larger diffs, include the stat summary plus the 2-3 hunks most
   central to the record's Acceptance Criteria.

## Step 4: Compose and post the brief

**Screenshot commit** (testable records with screenshots from Step 3): commit the 1-3 selected
screenshots to `docs/demo-evidence/{record}/{NN}-{description}.png` on this run's current branch
— `{record}` is the issue number (`github-issues`) or record id (`local-files`); `{NN}` is a
zero-padded sequence starting at `01`; `{description}` is a short kebab-case label matching the
screenshot's content (e.g. `settings-toggle-persisted`). Commit before composing the template
below — the embed needs the committed SHA.

```bash
git add docs/demo-evidence/{record}/
git commit -m "Add demo evidence screenshots for #{record}"
```

Embed via a commit-SHA-pinned raw URL (not branch-pinned — resolves regardless of which branch
this lands on, as soon as the commit is pushed to origin, sidestepping any question of "which
branch is this brief rendering against"):

```
![{description}](https://raw.githubusercontent.com/{owner}/{repo}/{commit-sha}/docs/demo-evidence/{record}/{NN}-{description}.png)
```

Resolve `{owner}/{repo}` from `git remote get-url origin`; `{commit-sha}` is the screenshot
commit's own SHA (`git rev-parse HEAD` immediately after the commit above). This resolves once
that commit is pushed to origin — the normal case for `github-issues`-backend work (which always
eventually pushes for the record to close via merge). If this run's work is later discarded
without ever pushing, the embedded image simply won't resolve, same as any broken link — the
brief's text content is unaffected.

`work-backend: local-files` — no comment mechanism (existing constraint, per
`_shared/work-record.md`); embed via a relative repo path instead of a raw URL:
`![{description}](../../demo-evidence/{record}/{NN}-{description}.png)` (adjust the relative
depth to the record file's actual location under `specs/`).

Render this exact template:

```markdown
## Verification Brief

### The ask
{condensed vision/why — the record's problem statement, not just the Acceptance Criteria
checklist; a human returning days later needs to remember *why*, not just *what to check*}

### What shipped
{one-paragraph summary from the record body + diff}

### Confirmed
{testable, visual-review available:}
Visual review walked {journey/page name} — {clean | "found and fixed: {N} issues — {one line each}"}.

{screenshot embeds from above, 1-3}

{testable, browser unavailable:}
_Visual verification wasn't available in this environment._

{diff/rationale, same shape as non-testable below}

{non-testable:}
Code review: {spec-compliance verdict}. {key quality notes, 1-2 lines}

{diff, embedded in full or bounded to key hunks per Step 3}

### See it yourself (optional)
{APP_URL}/{path} — {journey name, when applicable}
{omit this section entirely for non-testable records and the browser-unavailable fallback}

---

_Posted by `/claude-tweaks:wrap-up`. Resolve with `/claude-tweaks:demo`._
```

`work-backend: github-issues` — write the rendered template to
`/tmp/verification-brief-{issue}.md`, then:

```bash
gh issue comment {issue} --body-file /tmp/verification-brief-{issue}.md
gh issue edit {issue} --add-label demo:pending
```

Post the comment before adding the label — a reader reacting to the label's appearance should
never see `demo:pending` without a brief already attached.

`work-backend: local-files` — append the same template as a new `## Verification Brief` section
to the record body (after any existing content), and write the record with
`facets.acceptance = 'pending'`:

```js
const { readRecord, writeRecord } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
const record = readRecord(filePath);
record.facets.acceptance = 'pending';
record.body = record.body + '\n\n' + briefTemplate;
writeRecord(filePath, record);
```
````

- [ ] **Step 3: Verify the rewrite**

```bash
grep -c "^## Step" skills/wrap-up/verification-brief.md
```

Expected: `5` (Step 1, Step 2, Step 2.5, Step 3, Step 4).

```bash
grep -n "The ask\|What shipped\|### Confirmed\|See it yourself" skills/wrap-up/verification-brief.md
```

Expected: all four headings present exactly once each in the template block.

```bash
grep -n "run \`/claude-tweaks:test qa story\|walk it live via" skills/wrap-up/verification-brief.md
```

Expected: no output — the old pointer-based tiers are gone.

- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/verification-brief.md
git commit -m "Rewrite verification-brief.md: digest template, visual-review safety-net gate"
```

---

### Task 2: Update `skills/wrap-up/SKILL.md`

**Files:**
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `verification-brief.md` Step 2.5 gate name (referenced by name, not
  duplicated).

- [ ] **Step 1: Update the Step 10 Acceptance-labeling bullet**

In `skills/wrap-up/SKILL.md`, find:

```markdown
- **Acceptance labeling** (record mode only — a materialized header exists for this run) — apply `demo:pending` and post the Verification Brief; see `verification-brief.md` in this skill's directory for the bootstrap, sourcing, and posting procedure
```

Replace with:

```markdown
- **Acceptance labeling** (record mode only — a materialized header exists for this run) — for testable records, gate on a clean visual-review pass (triggering one now via Step 2.5's safety net if `/review` only produced a recommendation), then apply `demo:pending` and post the Verification Brief; see `verification-brief.md` in this skill's directory for the full bootstrap, safety-net, sourcing, and posting procedure
```

- [ ] **Step 2: Update the "Verify execution" checklist's Acceptance-labeling line**

Find:

```markdown
- Acceptance labeling landed (record mode only) — `work-backend: github-issues`: `gh issue view {issue} --json labels -q '.labels[].name'` includes `demo:pending` and the issue's last comment contains `## Verification Brief`; `work-backend: local-files`: the record's body contains `## Verification Brief` and its frontmatter has `acceptance: pending`
```

Replace with:

```markdown
- Acceptance labeling landed (record mode only) — `work-backend: github-issues`: `gh issue view {issue} --json labels -q '.labels[].name'` includes `demo:pending` and the issue's last comment contains `## Verification Brief` with a `### Confirmed` section; `work-backend: local-files`: the record's body contains `## Verification Brief` with a `### Confirmed` section and its frontmatter has `acceptance: pending`. For a testable record, confirm the safety-net gate actually resolved (no high/critical visual-review finding left unfixed) before this line was reached.
```

- [ ] **Step 3: Update the `/claude-tweaks:demo` Relationship table row**

Find:

```markdown
| `/claude-tweaks:demo` | /claude-tweaks:wrap-up applies `demo:pending` and posts the Verification Brief (Step 10, `verification-brief.md`) — record mode only. /claude-tweaks:demo later resolves the label to `demo:approved`/`demo:changes-requested` and, on the latter, files a linked follow-up record. |
```

Replace with:

```markdown
| `/claude-tweaks:demo` | /claude-tweaks:wrap-up applies `demo:pending` and posts the Verification Brief (Step 10, `verification-brief.md`) — record mode only, gated on a clean visual-review pass (Step 2.5's safety net). /claude-tweaks:demo later resolves the label to `demo:approved`/`demo:changes-requested` and, on the latter, files a linked follow-up record. |
```

- [ ] **Step 4: Add a new `/claude-tweaks:visual-review` Relationship table row**

Find the existing row:

```markdown
| `/claude-tweaks:review` (visual modes) | Visual complement — findings from visual review may feed into wrap-up's reflection lenses |
```

Immediately after it, insert a new row:

```markdown
| `/claude-tweaks:visual-review` | `verification-brief.md`'s Step 2.5 safety-net gate invokes /claude-tweaks:visual-review directly when a testable record reaches wrap-up without a full pass already having run (standalone /review in code mode, or /build run outside /flow) — reuses /review Step 6's own mode resolution, never a separate implementation. |
```

- [ ] **Step 5: Verify**

```bash
grep -n "Step 2.5's safety net\|safety-net gate" skills/wrap-up/SKILL.md
```

Expected: at least 3 matches (Step 10 bullet, verify-execution line, two Relationship rows).

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Update wrap-up/SKILL.md for the visual-review safety-net gate"
```

---

### Task 3: Rewrite `skills/demo/SKILL.md` Step 3

**Files:**
- Modify: `skills/demo/SKILL.md`

**Interfaces:**
- Consumes: Task 1's Verification Brief template section names (`The ask` / `What shipped` /
  `Confirmed` / `See it yourself`).
- Consumes: `/browse`'s conventions (session naming, lifecycle) directly, per Task 4's
  documentation of that relationship — this task only writes the consuming text in `demo/SKILL.md`
  itself; Task 4 handles `browse/SKILL.md`'s reciprocal side.

- [ ] **Step 1: Replace Step 3 (Per-item walkthrough)**

Find:

```markdown
## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (What changed /
Why / How to verify, or the non-testable note verbatim), then call `AskUserQuestion` with
`question`: `"Verdict for {ref}: {title}?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 3 — `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`
```

Replace with:

```markdown
## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (The ask / What
shipped / Confirmed / See it yourself, per `verification-brief.md`'s digest template — evidence
the human can judge, not a checklist to complete), then call `AskUserQuestion` with `question`:
`"Does {title} do what you asked for?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 (only when the brief's "See it yourself" entry point resolved) — `label`: `"Show me live"`, `description`: `"Open {entry point} in a live browser session before deciding"`
- Option 3 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 4 — `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`

**"Show me live"**: open an `agent-browser` session at the brief's resolved entry point, following
`/claude-tweaks:browse`'s conventions (session naming, lifecycle) directly — the same relationship
`/claude-tweaks:visual-review` already has with `/browse`, not a workflow-step invocation of
`/browse` itself. After the human finishes looking, close the session (leaked sessions consume
resources — same discipline `/browse`'s own Anti-Patterns table requires), then re-render the same
`AskUserQuestion` for this record with only Approve / Request changes / Skip for now (the live
look already happened — don't offer it twice for the same record).
```

- [ ] **Step 2: Add a `/claude-tweaks:browse` Relationship table row**

Find:

```markdown
| `/claude-tweaks:wrap-up` | Sole producer of `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`) — `/demo` is the sole consumer/resolver |
```

Replace with:

```markdown
| `/claude-tweaks:wrap-up` | Sole producer of `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`), gated on a clean visual-review pass — `/demo` is the sole consumer/resolver |
| `/claude-tweaks:browse` | `/demo`'s "Show me live" option (Step 3) consumes /browse's conventions directly (session naming, lifecycle) for an on-demand live look — the same relationship /claude-tweaks:visual-review has with /browse, not a workflow-step invocation |
```

- [ ] **Step 3: Add an Anti-Patterns table row**

Find:

```markdown
| Scanning only open issues | `demo:pending` persists on closed issues too (auto-merged autonomous work) — always query `--state all` |
```

Replace with:

```markdown
| Scanning only open issues | `demo:pending` persists on closed issues too (auto-merged autonomous work) — always query `--state all` |
| Leaving a "Show me live" session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
```

- [ ] **Step 4: Verify**

```bash
grep -n "Does {title} do what you asked for\|Show me live" skills/demo/SKILL.md
```

Expected: matches in Step 3's verdict question, the new option, the new Relationship row, and the
new Anti-Patterns row.

```bash
grep -n "Verdict for {ref}: {title}" skills/demo/SKILL.md
```

Expected: no output — the old generic verdict prompt is gone.

- [ ] **Step 5: Commit**

```bash
git add skills/demo/SKILL.md
git commit -m "Reframe demo Step 3 verdict around vision/fit, add Show me live option"
```

---

### Task 4: Update Relationship tables in `review`, `visual-review`, and `browse`

**Files:**
- Modify: `skills/review/SKILL.md`
- Modify: `skills/visual-review/SKILL.md`
- Modify: `skills/browse/SKILL.md`

**Interfaces:**
- Consumes: Task 1's Step 2.5 gate name, Task 3's "Show me live" option name — referenced by name
  only, no shared code.

- [ ] **Step 1: `skills/review/SKILL.md` — extend the `/claude-tweaks:wrap-up` Relationship row**

Find:

```markdown
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture. Skill-routed entries from lens 3a (phase `review/skill`) and from /reflect hindsight findings tagged `[skill: …]` (phase `review/hindsight`) feed into wrap-up's skill update analysis (Step 7). |
```

Replace with:

```markdown
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture. Skill-routed entries from lens 3a (phase `review/skill`) and from /reflect hindsight findings tagged `[skill: …]` (phase `review/hindsight`) feed into wrap-up's skill update analysis (Step 7). `/wrap-up`'s own Step 10 safety-net gate (`verification-brief.md`) reads this skill's `### Visual Review` summary status and, when it shows only `Recommended` (no browser walk ran), triggers `/claude-tweaks:visual-review` itself using the same Step 6 mode resolution — never a separate implementation. |
```

- [ ] **Step 2: `skills/visual-review/SKILL.md` — append two Relationship table rows**

Find the last row of the Relationship table:

```markdown
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The "Auto mode" branches in Step 1 (browser prereqs) and Step 2 (dev URL) implement the contract's auto-skip + stage-at-Review-Console pattern. |
```

Replace with:

```markdown
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The "Auto mode" branches in Step 1 (browser prereqs) and Step 2 (dev URL) implement the contract's auto-skip + stage-at-Review-Console pattern. |
| `/claude-tweaks:wrap-up` | `verification-brief.md`'s Step 2.5 safety-net gate invokes /visual-review directly (same mode resolution as /review Step 6) when a testable record reaches wrap-up without a full pass already having run. Any bug found gates `demo:pending` the same way /review's Step 3 Routing gates PASS. |
| `/claude-tweaks:demo` | `/demo`'s Verification Brief digest (Step 3) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. `/demo`'s optional "Show me live" escape hatch consumes /browse's conventions directly (the same relationship /visual-review itself has with /browse), not a re-invocation of /visual-review. |
```

- [ ] **Step 3: `skills/browse/SKILL.md` — update frontmatter description**

Find:

```markdown
description: Use for browser automation via agent-browser — defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review. Keywords - browse, browser, agent-browser, screenshot, scrape, automation.
```

Replace with:

```markdown
description: Use for browser automation via agent-browser — defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, /review, and /demo. Keywords - browse, browser, agent-browser, screenshot, scrape, automation.
```

- [ ] **Step 4: `skills/browse/SKILL.md` — update the opening description sentence**

Find:

```markdown
Conventions skill for browser automation. Defines session naming, screenshot/trace paths, lifecycle, and the abstract operation vocabulary that `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, and the `qa-agent` all speak. Concrete `agent-browser` syntax lives in `agent-browser-reference.md` in this skill's directory.
```

Replace with:

```markdown
Conventions skill for browser automation. Defines session naming, screenshot/trace paths, lifecycle, and the abstract operation vocabulary that `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, `/claude-tweaks:demo`, and the `qa-agent` all speak. Concrete `agent-browser` syntax lives in `agent-browser-reference.md` in this skill's directory.
```

- [ ] **Step 5: `skills/browse/SKILL.md` — update the ASCII "Used by" diagram**

Find:

```markdown
```
                             [ /claude-tweaks:browse ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:stories, /claude-tweaks:visual-review,
            /claude-tweaks:review (visual + qa modes), qa-agent, ad-hoc tasks
```
```

Replace with:

```markdown
```
                             [ /claude-tweaks:browse ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:stories, /claude-tweaks:visual-review,
            /claude-tweaks:review (visual + qa modes), /claude-tweaks:demo
            (on-demand live look), qa-agent, ad-hoc tasks
```
```

- [ ] **Step 6: `skills/browse/SKILL.md` — add a "When to Use" bullet**

Find:

```markdown
- `/claude-tweaks:review` is running its visual or QA modes
- A consumer skill needs to dispatch parallel agents that each drive a browser
```

Replace with:

```markdown
- `/claude-tweaks:review` is running its visual or QA modes
- `/claude-tweaks:demo` opens an on-demand live look at a record's resolved entry point ("Show me live")
- A consumer skill needs to dispatch parallel agents that each drive a browser
```

- [ ] **Step 7: `skills/browse/SKILL.md` — update the Component-Skill Contract paragraph**

Find:

```markdown
`/claude-tweaks:browse` is a conventions skill — it documents the operation vocabulary for `agent-browser` and is consumed transitively by `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, and the registered `qa-agent`. Those callers either inline the relevant operation text directly in their own dispatch prompts (parallel-session pattern) or call `agent-browser` commands by name; they do not "invoke" /browse as a workflow step.
```

Replace with:

```markdown
`/claude-tweaks:browse` is a conventions skill — it documents the operation vocabulary for `agent-browser` and is consumed transitively by `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, `/claude-tweaks:demo`, and the registered `qa-agent`. Those callers either inline the relevant operation text directly in their own dispatch prompts (parallel-session pattern) or call `agent-browser` commands by name; they do not "invoke" /browse as a workflow step.
```

- [ ] **Step 8: `skills/browse/SKILL.md` — add a `/claude-tweaks:demo` Relationship table row**

Find:

```markdown
| `/claude-tweaks:help` | `/help` lists `/browse` in the utility skills table and surfaces availability when scanning for browser-dependent recommendations. |
```

Replace with:

```markdown
| `/claude-tweaks:help` | `/help` lists `/browse` in the utility skills table and surfaces availability when scanning for browser-dependent recommendations. |
| `/claude-tweaks:demo` | `/demo`'s "Show me live" option (Step 3) opens an on-demand `agent-browser` session at a record's resolved entry point, following /browse's session-naming and lifecycle conventions directly — not a workflow-step invocation, the same relationship `/visual-review` has with `/browse`. |
```

- [ ] **Step 9: Verify all three files**

```bash
grep -c "claude-tweaks:demo" skills/browse/SKILL.md
```

Expected: `6` (frontmatter description, opening sentence, ASCII diagram, When to Use bullet,
Component-Skill Contract paragraph, Relationship table row).

```bash
grep -n "claude-tweaks:visual-review" skills/wrap-up/SKILL.md skills/review/SKILL.md | grep -i "safety-net\|Step 2.5"
```

Expected: at least 2 matches (one per file, from Task 2 Step 4 and this task's Step 1).

```bash
grep -n "claude-tweaks:wrap-up\|claude-tweaks:demo" skills/visual-review/SKILL.md | tail -5
```

Expected: shows the two new rows added in this task's Step 2.

- [ ] **Step 10: Commit**

```bash
git add skills/review/SKILL.md skills/visual-review/SKILL.md skills/browse/SKILL.md
git commit -m "Update review/visual-review/browse Relationship tables for the demo redesign"
```

---

### Task 5: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `README.md`

**Interfaces:** None — final task, no downstream consumers within this plan.

- [ ] **Step 1: Resolve the current version**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
cat .claude-plugin/plugin.json | grep '"version"'
```

Per CLAUDE.md's Releasing section: if a concurrent bump landed on `origin/main` after this
worktree branched, renumber from that value instead of this branch's base. Determine the current
authoritative version `{CURRENT}` from whichever source is higher.

- [ ] **Step 2: Bump the minor version**

Edit `.claude-plugin/plugin.json`'s `version` field from `{CURRENT}` to the next minor version
(`{MAJOR}.{MINOR+1}.0`), per CLAUDE.md's "Bump minor version for feature additions" rule — this
revision adds user-facing behavior (embedded evidence, "Show me live", the safety-net gate).

- [ ] **Step 3: Add a README changelog entry**

Read `README.md`'s existing changelog section to find the current latest entry's heading format
(established pattern: `### What's new in v{X.Y.Z} — {title}`). Add a new entry above it for this
version:

```markdown
### What's new in v{NEW_VERSION} — Demo walkthrough redesign

`/claude-tweaks:demo`'s Verification Brief is now a self-contained digest instead of a pointer to
re-run another skill — vision/why, what shipped, and confirmed evidence (visual-review's result +
up to 3 committed screenshots, or a code-review digest + diff for non-UI work). `/wrap-up` gains a
safety-net gate that triggers a real visual-review pass before `demo:pending` is ever applied, for
the one path (`/review` outside `full` mode) where one might not have already run.
`/claude-tweaks:demo`'s verdict prompt reframes around vision/fit ("Does this do what you asked
for?") and gains an on-demand "Show me live" option for a live look via `agent-browser`.
```

- [ ] **Step 4: Verify**

```bash
node -e "console.log(require('./.claude-plugin/plugin.json').version)"
grep -c "^### What's new in v" README.md
```

Confirm the printed version matches Step 2's target, and the changelog count increased by 1 from
before this task.

```bash
npm test
```

Expected: all tests pass — this task touches no test-covered code.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "Bump version for demo verification-brief redesign"
```

---

## Self-Review

**Spec coverage:** Task 1 covers Design Architecture #1 (safety-net gate) and #2/#3 (digest
template + screenshot durability). Task 2 covers the `/wrap-up` SKILL.md touch points named in the
design's Known Touch Points. Task 3 covers Architecture #4 (`/demo` Step 3 reframe). Task 4 covers
the design's "Relationship to Existing Mechanisms (delta)" section's three bidirectional updates
(`/review`, `/visual-review`, `/browse`). Task 5 covers the version-bump touch point. No design
section is uncovered.

**Placeholder scan:** No `TBD`/`TODO` in any task step. The one deliberately-deferred value (exact
version number) is a live-git-state lookup, not a placeholder — hardcoding it would itself be a
bug given the version-collision incident this project's own CLAUDE.md documents.

**Type/name consistency:** `### The ask` / `### What shipped` / `### Confirmed` / `### See it
yourself` are used identically across Task 1 (defines) and Task 3 (references). `Step 2.5:
Visual-Review Safety-Net Gate` is named identically in Task 1, Task 2, and Task 4. `"Show me
live"` is named identically in Task 3 and Task 4.
