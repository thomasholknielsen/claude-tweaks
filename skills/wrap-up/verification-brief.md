# Wrap-Up — Verification Brief Procedure

Canonical procedure for Step 10's acceptance-labeling action: applying `demo:pending` and
posting the Verification Brief. Record mode only (a materialized header exists for this run,
per Step 1) — conversation-based work and the legacy spec-file alias have no work record to
label, so this procedure does not run for them.

## Step 1: Bootstrap the Acceptance labels

Run the check-then-create loop from `_shared/label-bootstrap.md` with:

```js
LABELS_JSON = [
  ["demo:pending", "Acceptance: built and verified — awaiting human sign-off via /claude-tweaks:demo"]
]
```

Only `demo:pending` is bootstrapped here — `/wrap-up` never applies the other two acceptance
labels (see `_shared/work-record.md`'s permission matrix).

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
