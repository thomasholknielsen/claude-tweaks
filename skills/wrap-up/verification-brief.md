# Wrap-Up — Verification Brief Procedure

Canonical procedure for the acceptance-labeling action: applying `demo:pending` and posting
the Verification Brief. Record mode only (a materialized header exists for this run, per
`/claude-tweaks:wrap-up` Step 1) — conversation-based work has no work record to label, so
this procedure does not run for it.

## Routing — read this before anything else, whatever invoked this file

**The routing below is this file's decision, not its caller's.** Every call site lands here
first and inherits it, so a new one never has to re-derive the condition (and cannot get it
wrong by omission). Four call sites exist today:

| Caller | Arrives holding |
|---|---|
| `/claude-tweaks:wrap-up` Step 10's Acceptance-labeling bullet (`wrap-up/execution-and-verification.md`) | one **leaf**, mid-close |
| `/claude-tweaks:wrap-up`'s auto-merge short-circuit (`wrap-up/review-console.md`) | one **leaf**, mid-close |
| `/claude-tweaks:dispatch`'s group auto-merge gate (`dispatch/settle-and-merge.md`) | one **leaf** per group member, mid-close — plus the group's whole closing-leaf set (see the Self-inclusion rule) |
| `/claude-tweaks:tidy`'s `Open family gate` action (`tidy/actions-github-issues.md`, or `tidy/actions-local-files.md` on that driver) | a **parent** number (`$PARENT_NUM`) directly |

**Whatever invoked this file: if the record in hand has a resolvable parent, run the
Family-Gate Procedure below in place of — not alongside — Steps 1-4.** A decomposed leaf never
carries its own `demo:pending`; the family's parent carries one gate for all of them. This
holds on every path equally, including the two that bypass Step 10 entirely: an `auto:merge`'d
leaf is precisely the population `_shared/github-pr-scan.md`'s `family-gate` backstop scope
exists to catch, so giving it its own gate here would both defeat the family gate and falsify
that scope's stated reason for existing. `auto:merge` governs merge timing only — it does not
change the unit of acceptance.

**Otherwise — no resolvable parent** (a record human-filed or `/capture`d directly, not
produced by a `/specify` decomposition) — run Steps 1-4 as written, applying `demo:pending` to
the record itself.

A caller that already holds a **parent** number is inside the Family-Gate Procedure by
construction — there is no leaf to resolve, so it starts at **Enumerate the family's leaves**.

## Family-Gate Procedure (parent-linked leaves)

The Routing section above routes here — in place of, not alongside, Steps 1-4 below — whenever
the record in hand has a resolvable parent.

### Two entry shapes

Every step from **Enumerate the family's leaves** onward is shared, unchanged, by every caller
— only how the caller arrives at `$PARENT_NUM` differs, and there are exactly two shapes:

- **Leaf-side entry** — the three mid-close callers in the Routing table above
  (`/claude-tweaks:wrap-up` Step 10, `/claude-tweaks:wrap-up`'s auto-merge short-circuit, and
  `/claude-tweaks:dispatch`'s group auto-merge gate, the last running this procedure once per
  group member). Each arrives holding a **leaf** number, plus `$CLOSING_LEAVES` — the set of
  leaf numbers its own run is closing, which the **Self-inclusion rule** below reads (one
  element for both wrap-up entries; the whole group for the dispatch gate). Run every section
  below in order, starting with **Resolve the parent**.
- **Parent-side entry** — **`/claude-tweaks:tidy`'s `Open family gate` action**, on either
  driver: `tidy/actions-github-issues.md` executing on a `[family-gate]` finding from
  `_shared/github-pr-scan.md`'s `family-gate` scope, or `tidy/actions-local-files.md` executing
  on one from `tidy/step-1-records.md`'s Shape 7. Both arrive already holding the
  **parent** number directly (`$PARENT_NUM` — a `family:parent`-labeled issue number, or a
  `family-parent: true` record's id), read straight from their own scan. Skip **Resolve the
  parent** and **Self-inclusion rule** below entirely — there is no leaf mid-close in this entry,
  so nothing needs resolving or self-inclusion special-casing. Start at **Enumerate the family's
  leaves**, but re-read every leaf's state and the parent's own disposition fresh rather than
  reusing the scan's snapshot, and re-run **Evaluate the gate** before composing anything — time
  has passed since the scan ran (`/tidy`'s Step 6 approval is never instantaneous with its scan),
  and another process (a concurrent `/wrap-up` gating the same family, or a leaf reopening) may
  already have changed the outcome. Every per-driver branch below applies to this entry exactly
  as it does to a leaf-side one — take the `local-files` branches when that is the driver.

**Fail open on every `gh` call in this section.** If `gh` is unavailable, unauthenticated, the
repo has no GitHub remote, or any family-gate `gh` call below fails: a **leaf-side** entry
skips the family-gate procedure entirely and falls back to today's behavior (apply `demo:pending`
to this record itself via Steps 1-4 below) — never blocking the wrap-up, the auto-merge
short-circuit, or the dispatched group's merge gate. The **parent-side** entry skips this one
family for this run, leaving its `[family-gate]` finding surfaced and unmutated — never failing
the whole `/tidy` run over one family's `gh` call. This paragraph is moot under
`work-backend: local-files`, whose branches below make no `gh` call at all; a filesystem error
there is a real failure to report, not a fail-open case.

### What this path deliberately does not run

This procedure replaces Steps 1-4, and **Step 2.5's visual-review safety-net gate sits inside
that range, so it does not run for a family.** That is an explicit exclusion, not an oversight,
and it is stated here rather than left to be inferred from the range:

- The gate's input does not exist at family scope. Step 2.5 branches on *this run's* `/review`
  summary and classifies *this run's* changed-file list. A family's leaves close days or weeks
  apart (the design's own Risks section calls that the dominant workflow), so there is no single
  run whose diff is the family's diff and no single `/review` summary covering it.
- The parent-side entry has neither. `/tidy`'s backstop can fire long after the last leaf
  merged, from a checkout with no branch, no dev server, and no `/review` summary for anything
  — and it is a staged batch action, so triggering a browser walk from it would be an
  unapproved side effect of approving a label write.

**What still covers the UI:** every leaf runs `/claude-tweaks:review` before it reaches any
caller of this file, and `/review` Step 6 invokes `/claude-tweaks:visual-review` for the leaf's
own UI changes in `full` mode. What a family loses is the *safety net* — the wrap-up-time
re-trigger for a leaf whose `/review` produced only a recommendation. A decomposed UI feature
can therefore reach `demo:pending` on its parent with no browser walk having run for some
leaf, and the parent brief must not imply otherwise.

**So the brief carries the human instead.** Part 2 of **Compose the parent brief** below — the
end-to-end walkthrough, rendered inline inside `### Confirmed` — is the only walk instruction a
parent brief carries (it omits both `### See it yourself` and `### Verify it yourself (manual)`,
so `/claude-tweaks:demo` Option 2 is not offered for one). For a family whose assembled leaves
touch UI, that walkthrough must therefore name the pages or journeys to open and what to look
for, not just the skill invocation — it is standing in for the safety net, not summarizing it.

### Resolve the parent

**Leaf-side entries only** — see "Two entry shapes" above. The parent-side entry already holds
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
silently returns nothing under the other.

Resolve `work-links` before picking a branch below (`native` or `body-text`, default
`body-text` — `_shared/work-record-config.md`), the same read `wrap-up/unblocked-records.md`
already performs:

```bash
grep -E "^work-links:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//; s/[[:space:]]*#.*$//'
```

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

Then fetch the **parent's** own current labels — the other argument that predicate takes, and
the one nothing above has produced yet. Both entry shapes need this: the parent-side entry
re-fetches them because its scan's snapshot is stale by approval time, and a leaf-side entry
has never read them at all (**Resolve the parent** yields only a number):

```bash
gh issue view $PARENT_NUM --json labels -q '[.labels[].name]'
```

`work-backend: local-files` — read the parent record instead and translate its
`facets.acceptance`, per **Evaluate the gate** below.

### Self-inclusion rule

**Leaf-side entries only** — see "Two entry shapes" above. The parent-side entry never has a
leaf mid-close, so every leaf's live state is read as-is, with no special-casing.

**Every leaf number in `$CLOSING_LEAVES` counts as `CLOSED`** when building the `leaves` array,
regardless of what `gh` reports for it. `$CLOSING_LEAVES` is the set of leaves *this run* is
closing, supplied by the caller. Every leaf-side caller evaluates the gate while its own leaves
are still open — all three label **before** the close lands — so reading their live state makes
a family's last leaves always evaluate `incomplete` and the gate never fires.

The set overrides state; it never adds leaves. Only members of `$CLOSING_LEAVES` that the
family enumeration above already returned are affected — a member belonging to a different
family, or to no family at all, is simply irrelevant to this family's `leaves` array.

**A leaf-side entry arriving without an explicit `$CLOSING_LEAVES` defaults to the one-element
set `{the leaf in hand}` — never to the empty set.** That default is what keeps this rule a
strict widening of the self-contained one it replaced rather than a replacement for it: a caller
that names no set still gets exactly the old behavior. The empty set would instead make every
leaf evaluate `incomplete` and label nothing, which is precisely the silent no-op this rule
exists to prevent and the `[IL-65]` mode named below — so a future fifth caller that forgets to
pass one degrades to correct-for-one-leaf, not to silence.

**Sizing the set to the run, not to the invocation.** There is one path here, not two: the
single-leaf case is the one-element set.

| Leaf-side caller | `$CLOSING_LEAVES` |
|---|---|
| `/claude-tweaks:wrap-up` Step 10 (`wrap-up/execution-and-verification.md`) | the one leaf this run is closing |
| `/claude-tweaks:wrap-up`'s auto-merge short-circuit (`wrap-up/review-console.md`) | the one leaf this run is closing |
| `/claude-tweaks:dispatch`'s group auto-merge gate (`dispatch/settle-and-merge.md`) | **every** member of the group, on every one of its per-member invocations — that gate's single merge carries one `Fixes #{issue}` line per record, so the whole group closes together |

The two wrap-up entries close exactly one record per run, so their set has exactly one member —
the leaf in hand — and this rule reduces to "the leaf being closed counts as `CLOSED`". For the
group gate the set's size is the difference between the eager gate firing and not existing at
all: count only the leaf in hand and a group holding two or more leaves of one family evaluates
`incomplete` on every one of them, labeling nothing — not the leaves, not the parent.

**The gate still fires once per family.** The group gate's later invocations for the same
family re-fetch the parent's labels (**Enumerate the family's leaves** above does this
per invocation), read `gated`, and no-op — one brief and one `demo:pending`, never a second.

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
branches; **`{poster}`** in the template's own footer — substitute the **skill** actually
running *this* composition (see the Routing table above), never hardcode
`` `/claude-tweaks:wrap-up` ``: `` `/claude-tweaks:wrap-up` `` for either wrap-up entry (Step 10
or the auto-merge short-circuit), `` `/claude-tweaks:dispatch` `` for the group auto-merge gate,
`` `/claude-tweaks:tidy` `` for the backstop entry. Omit **See it yourself** and
**Verify it yourself (manual)** — part 2's walkthrough
already names the entry point inline within Confirmed.

### Apply the gate

`work-backend: github-issues` — bootstrap `demo:pending` first, per `_shared/label-bootstrap.md`'s
check-then-create loop:

```js
LABELS_JSON = [
  ["demo:pending", "Acceptance: built and verified — awaiting human sign-off via /claude-tweaks:demo"]
]
```

The same pair Step 1 below bootstraps for the default (non-family-gate) path — this procedure
runs **in place of, not alongside** Step 1 (see the top of this section), so on a repo where
every `demo:pending` application has ever gone through this procedure, the label may not exist
yet at all. Both entry shapes need this — a leaf-side caller skips Step 1 exactly the same way
the parent-side one does.

**Then check whether a brief is already posted, before posting one** — and, when re-entering for
a family that may already be partially applied, before even composing it above. A gate whose
comment landed but whose label add failed still reads `due`, so `/tidy`'s `Open family gate`
action re-enters this section for that family on every future run. Fetch the parent's comments
(`gh issue view $PARENT_NUM --json comments`, the same lookup `/claude-tweaks:demo`'s Step 1
already does) and test whether **any** of them contains a `## Verification Brief` heading — every
comment on the parent, not just the most recent one, which a human reply or a bot notification
will routinely have displaced (this population is long-lived open records that other people
comment on, so a most-recent-only test reports "no brief" on a parent that plainly has one, and
posts a duplicate).

If a brief is already present, the recovery is to **skip the comment entirely and apply only the
missing label**:

```bash
gh issue edit $PARENT_NUM --add-label demo:pending
```

That completes the gate — the rest of this subsection is already done for that parent. Never
blindly re-post.

Otherwise write the rendered template composed above (**Compose the parent brief**) to
`/tmp/parent-verification-brief.md`, then:

```bash
gh issue comment $PARENT_NUM --body-file /tmp/parent-verification-brief.md
gh issue edit $PARENT_NUM --add-label demo:pending
```

Post the brief **before** adding the label — matching Step 4 below's existing invariant that a
reader never sees `demo:pending` without a brief already attached.

**Partial-state note.** These are two independent `gh` calls, not one atomic write: if the comment
posts and the label add then fails (a transient `gh` error; the bootstrap above should make a
missing-label failure specifically impossible), report exactly which step failed — don't assume
all-or-nothing, the same rule `tidy/actions-github-issues.md`'s `Defer` action states for its own
multi-step sequence. The already-posted-brief check above is the recovery path out of exactly that
state: the next entry finds the brief, skips the comment, and adds the label alone.

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

Resolve `{base}` (used here and in Step 4 below) by `summary-template.md`'s `{base}` rule.

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

_Posted by {poster}. Resolve with `/claude-tweaks:demo`._
```

`{poster}` is the **skill** that invoked this file, on this default (Step 1-4) path exactly as on
the Family-Gate Procedure's — never hardcode `` `/claude-tweaks:wrap-up` ``. Per the Routing
table at the top of this file: `` `/claude-tweaks:wrap-up` `` for either wrap-up entry (Step 10 or
the auto-merge short-circuit), `` `/claude-tweaks:dispatch` `` for the group auto-merge gate, and
— on the Family-Gate Procedure's parent-side entry only — `` `/claude-tweaks:tidy` ``. The string
is outward-facing (posted as a GitHub comment, or embedded in a local record body), so a
`/tidy`-posted parent brief claiming `/wrap-up` posted it would be wrong on exactly the population
the backstop exists for: families that never reached `/wrap-up`. The same applies to a
`/dispatch`-posted brief: that path never reached `/wrap-up` Step 10 either.

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
