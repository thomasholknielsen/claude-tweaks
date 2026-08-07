# Wrap-Up — Verification Brief Procedure

Canonical procedure for Step 10's acceptance-labeling action: applying `demo:pending` and
posting the Verification Brief. Record mode only (a materialized header exists for this run,
per Step 1) — conversation-based work has no work record to label, so this procedure does not
run for it.

## Family-Gate Procedure (parent-linked leaves)

`execution-and-verification.md`'s Acceptance labeling bullet routes here — in place of, not
alongside, Steps 1-4 below — when this record has a resolvable parent. A decomposed leaf never
carries its own `demo:pending`; the family's parent carries one gate for all of them.

### Two entry points

This procedure has two callers. Every step from **Enumerate the family's leaves** onward is
shared, unchanged, by both — only how the caller arrives at `$PARENT_NUM` differs:

- **`/wrap-up`** (this file's own caller, above) — arrives holding a **leaf** number, mid-close.
  Run every section below in order, starting with **Resolve the parent**.
- **`/claude-tweaks:tidy`'s `Open family gate` action** (`tidy/actions-github-issues.md`,
  executed on approving a `[family-gate]` finding from `_shared/github-pr-scan.md`'s
  `family-gate` scope) — arrives already holding the **parent** number directly (`$PARENT_NUM`),
  read straight from its own `family:parent`-labeled scan. Skip **Resolve the parent** and
  **Self-inclusion rule** below entirely — there is no leaf mid-close in this entry, so nothing
  needs resolving or self-inclusion special-casing. Start at **Enumerate the family's leaves**,
  but re-fetch every leaf's state and the parent's labels fresh rather than reusing the scan's own
  snapshot, and re-run **Evaluate the gate** before composing anything — time has passed since the
  scan ran (`/tidy`'s Step 6 approval is never instantaneous with its Step 4.8 scan), and another
  process (a concurrent `/wrap-up` gating the same family, or a leaf reopening) may already have
  changed the outcome. `work-backend: github-issues` only — `_shared/github-pr-scan.md`'s
  `family-gate` scope's own population is github-issues-only, so this entry never needs the
  `local-files` branches below.

**Fail open on every `gh` call in this section.** If `gh` is unavailable, unauthenticated, the
repo has no GitHub remote, or any family-gate `gh` call below fails: the **`/wrap-up`** entry
skips the family-gate procedure entirely and falls back to today's behavior (apply `demo:pending`
to this record itself via Steps 1-4 below) — never blocking the wrap-up. The **`/tidy`** entry
skips this one family for this run, leaving its `[family-gate]` finding surfaced and unmutated —
never failing the whole `/tidy` run over one family's `gh` call.

### Resolve the parent

**`/wrap-up` entry only** — see "Two entry points" above. `/tidy`'s entry already holds
`$PARENT_NUM` and skips straight to "Enumerate the family's leaves" below.

Resolve the leaf's parent the same way `/claude-tweaks:review` Step 1.6 does
(`skills/review/SKILL.md:147-154`): `work-backend: local-files` — `facets.parent`;
`work-backend: github-issues` + `work-links: native` — the sub-issue relationship queried
from this leaf's own side; `work-backend: github-issues` + `work-links: body-text` — the
`Parent: #N` line in this leaf's own body.

**No parent resolvable** (a record human-filed or `/capture`d directly, not produced by a
`/specify` decomposition) — skip this section entirely: fall through to Steps 1-4 below and
apply `demo:pending` to this record itself, exactly as today.

### Enumerate the family's leaves

With a parent resolved (`$PARENT_NUM`), enumerate the family's leaves from the **parent**
side, never from a leaf-side scan — a leaf-side lookup works under one `work-links` mode and
silently returns nothing under the other (`[IL-64]`):

```bash
# work-links: native
gh api "repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues" --jq '.[].number'

# work-links: body-text — parse the parent's own task list
gh issue view $PARENT_NUM --json body -q .body > /tmp/wrapup-parent-body.md
node -e "
  const { parseFamilyLeaves } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  console.log(JSON.stringify(parseFamilyLeaves(fs.readFileSync('/tmp/wrapup-parent-body.md','utf8'))));
"
```

`work-backend: local-files` — the parent body carries no task list (`specify/record-creation.md`'s
local-files branch writes only `facets.parent` on each leaf, never a checklist on the parent), so
query the reverse relationship instead — every record whose own `facets.parent` matches, open and
closed alike (the same two-call merge `specify/record-creation.md:35` already uses):

```js
const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
const leafRecords = [...queryRecords('specs', { parent: PARENT_ID }), ...queryRecords('specs', { parent: PARENT_ID, closed: true })];
const leaves = leafRecords.map((r) => ({ number: r.id, state: r.facets.closed ? 'CLOSED' : 'OPEN' }));
```

For each leaf number resolved above (`work-backend: github-issues`), fetch its current state
(`gh issue view {n} --json state -q .state`) to build the `leaves` array
`familyGateState({leaves, parentLabels})` (`bin/lib/issues/acceptance.js`) reads.

### Self-inclusion rule

**`/wrap-up` entry only** — see "Two entry points" above. `/tidy`'s entry never has a leaf
mid-close, so every leaf's live state is read as-is, with no special-casing.

1. The record `/wrap-up` is closing counts as `CLOSED` when building the `leaves` array,
   regardless of what `gh` reports for it. `/wrap-up` evaluates the gate while closing that
   very leaf, so reading its live state makes the last leaf always evaluate `incomplete` and
   the gate never fires.

This is the `[IL-65]` failure mode: a same-function self-inconsistency that no test catches,
because the symptom is a silent no-op.

### Evaluate the gate

Call `familyGateState({ leaves, parentLabels })`, where `parentLabels` is the parent's current
labels (`work-backend: github-issues`) or, under `work-backend: local-files`, the one-element
translation of its `facets.acceptance` (`parent.facets.acceptance ? ['demo:' + parent.facets.acceptance] : []`):

- `incomplete` — a sibling leaf is still open. No-op; this leaf's own closing proceeds with no
  acceptance labeling of any kind, neither its own nor the parent's.
- `gated` or `resolved` — the parent already carries a `demo:*` disposition. No-op.
- `due` — every leaf is closed and the parent carries no disposition yet. Compose and apply the
  parent brief below.

### Compose the parent brief

A parent brief consists of:

1. One verification item per `## Cross-Spec Promises` row on the parent, phrased as the claim
   to confirm — e.g. `F1: #48 assumed #46 exposes getStatus() — confirm it does.` Rows still
   `open` are included and marked unverified; they **do not** block the gate from opening. The
   register is deliberately not a hard gate anywhere (`skills/review/SKILL.md:173-175`).
2. One walkthrough of the feature's primary path across the assembled leaves. For this repo the
   runnable unit is a skill invocation, not a deploy — name the invocation and the observable
   outcome.

Where no register exists (below `promise-register-min-leaves`, default `4`, or
`work-backend: local-files`), part 2 alone is the brief.

Render the same `## Verification Brief` template Step 4 below renders, with: **The ask** — the
parent's own design summary (problem, chosen approach — `_shared/work-record.md`'s
Decomposition rules); **What shipped** — one-paragraph summary of what was delivered across the
assembled leaves; **Confirmed** — parts 1 and 2 above, in place of Step 4's testable/non-testable
branches. Omit **See it yourself** and **Verify it yourself (manual)** — part 2's walkthrough
already names the entry point inline within Confirmed.

### Apply the gate

`work-backend: github-issues` — write the rendered template composed above (**Compose the
parent brief**) to `/tmp/parent-verification-brief.md`, then:

```bash
gh issue comment $PARENT_NUM --body-file /tmp/parent-verification-brief.md
gh issue edit $PARENT_NUM --add-label demo:pending
```

Post the brief **before** adding the label — matching Step 4 below's existing invariant that a
reader never sees `demo:pending` without a brief already attached.

`work-backend: local-files` — append the brief to the parent record's own body and set
`facets.acceptance = 'pending'` on the parent, the same write Step 4 below performs for a
non-decomposed record, applied to the parent's file instead of this leaf's. `parentBriefTemplate`
below is the same rendered template from **Compose the parent brief**, above — no separate write
to a temp file is needed for this backend, since the write below embeds it directly.
`parentPath` is the `.path` field of the parent's own record — a combined open+closed
`queryRecords('specs', {})` / `queryRecords('specs', { closed: true })` listing (the parent
itself carries no `facets.parent`, so this is a fresh query, not the leaf listing above),
filtered to the entry whose `.id === PARENT_ID`:

```js
const { readRecord, writeRecord } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
const parentRecord = readRecord(parentPath);
parentRecord.facets.acceptance = 'pending';
parentRecord.body = parentRecord.body + '\n\n' + parentBriefTemplate;
writeRecord(parentPath, parentRecord);
```

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

Classify the changed-file list for this run (`git diff --name-only {base}...HEAD`, or the
materialized header's file list) through the shared classifier — the same one
`bin/lib/issues/acceptance.js` exports for `/claude-tweaks:tidy`'s acceptance-gap scan
(`_shared/github-pr-scan.md`), so the two never drift apart:

```bash
node -e "
  const { verificationSurface } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const paths = process.argv.slice(1);
  console.log(verificationSurface(paths));
" $(git diff --name-only {base}...HEAD)
```

`interactive` — this record is testable; continue to Step 2.5.

`non-interactive` — this record has **no interactive verification surface**, but it is not a
dead end: compose **manual verification steps** now, concrete enough for a human to run or read
by hand and observe the result —

- A changed skill or harness file — name the skill and the specific behavior to exercise (a step
  number, a branch, a template section), not "read the skill."
- Changed `bin/` code — the command to run and its expected output (e.g. the module's own test
  file and its pass output, or a one-line `node -e` exercising the changed function).
- A changed doc or config file — the file to open and the specific claim or setting to check
  against current behavior.

(Read the changed-path list itself to tell which of these applies per file — do not re-derive
which categories `verificationSurface` treats as non-interactive; that classification already
ran above.)

These steps carry forward into Step 4's `### Verify it yourself (manual)` section. Skip Step 2.5
(its own header already scopes it to testable records) and go straight to Step 3's non-testable
branch.

## Step 2.5: Visual-Review Safety-Net Gate (testable records only)

Skip this step for non-testable records (Step 2) — there is nothing to walk.

Read this run's `/claude-tweaks:review` summary — the `### Visual Review` section's `**Status:**`
field (`review-summary-template.md`). Branch on its value:

| Status value | Meaning | Action |
|---|---|---|
| `Completed (code + visual)` or `Completed (code + visual, QA-enriched)` | A full browser walk already ran; any bug it found was already fixed and reverified through `/review`'s Step 3 Routing before `/review` could PASS | Proceed to Step 3 — no further action |
| `Recommended — journeys affected` or `Recommended — UI changed (no journeys)` | Only recommendation mode ran — no browser walk happened | Trigger the gate below |
| `Skipped — no UI changes` | `/review` read the diff and found no UI. Step 2 disagrees, but only by default — no path positively matched a UI surface, and `verificationSurface` carries no backend-code category (see its own comment for why), so a backend-only change lands here routinely | Treat as `Recommended` — trigger the gate below and let `/visual-review`'s own detection re-confirm. It costs a walk that finds nothing; the reverse error skips acceptance on a real UI change |
| `Skipped — browser tools not configured` or `Completed (code only — no browser)` | Nothing was walked, nothing can be — the latter is full-mode `/review` completing with a code-only fallback when no browser backend was available at invocation, same practical outcome as the former | See the browser-unavailable fallback below |
| No `/review` summary available for this run (standalone `/wrap-up`, no recent `/review` run) | No signal exists | Treat as `Recommended` — trigger the gate below |

**Trigger the gate** (`Recommended` / no-summary / `Skipped — no UI changes` cases): invoke
`/claude-tweaks:visual-review` now, passing `--source wrap-up` (this run has no `$PIPELINE_RUN_DIR`
of its own to signal parent invocation on — the same fallback `skills/wrap-up/SKILL.md` Step 3
already passes to `/claude-tweaks:reflect` for standalone wrap-up), using the same mode
resolution `/review` Step 6 already applies — `journey:{name}` when a journey was named (by the
recommendation, or by matching
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

### Verify it yourself (manual)
{non-testable records only — the manual verification steps composed in Step 2: one concrete
command, file path, or observable behavior per changed area}
{omit this section entirely for testable records, with or without visual review — mutually
exclusive with "See it yourself" above, never both}

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
