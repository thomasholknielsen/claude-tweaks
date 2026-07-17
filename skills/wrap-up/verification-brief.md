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

## Step 3: Source the "how to verify" content, in priority order

1. **QA stories** — Glob `stories/*.yaml` for entries whose `source_files` overlaps this run's
   changed files. If found, note the matching story names and their `journey:` field.
2. **Journey doc** — if no matching story, check `docs/journeys/*.md` for a journey whose
   `files:` front matter overlaps the changed files.
3. **Synthesized walkthrough** — if neither exists, run the dev URL detection procedure from
   `dev-url-detection.md` in `skills/_shared/` to resolve `APP_URL`, then write 2-4 concrete
   manual steps derived from the record's `## Acceptance Criteria` section (e.g. "Open
   {APP_URL}/settings, toggle X, confirm Y persists after reload").
4. **Non-testable fallback** (Step 2 found no interactive surface) — skip 1-3 entirely; the
   brief says so explicitly (see template below).

## Step 4: Compose and post the brief

Render this exact template:

```markdown
## Verification Brief

**What changed:** {one-paragraph summary from the record body + diff}

**Why:** {the record's `## Acceptance Criteria` section, verbatim or lightly condensed}

**How to verify:**
{one of:}
- Story: `{story name}` (`stories/{file}.yaml`{, journey: {journey}}) — run `/claude-tweaks:test qa story={name}`
- Journey: `docs/journeys/{file}.md` — walk it live or via `/claude-tweaks:visual-review journey:{name}`
- {numbered manual steps against {APP_URL}}
- _No interactive verification surface — this change has no user-observable behavior. Review the diff and the rationale above._

_Posted by `/claude-tweaks:wrap-up`. Resolve with `/claude-tweaks:demo`._
```

**`work-backend: github-issues`** — write the rendered template to
`/tmp/verification-brief-{issue}.md`, then:

```bash
gh issue comment {issue} --body-file /tmp/verification-brief-{issue}.md
gh issue edit {issue} --add-label demo:pending
```

Post the comment before adding the label — a reader reacting to the label's appearance should
never see `demo:pending` without a brief already attached.

**`work-backend: local-files`** — there is no comment mechanism. Append the same template as a
new `## Verification Brief` section to the record body (after any existing content), and write
the record with `facets.acceptance = 'pending'`:

```js
const { readRecord, writeRecord } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
const record = readRecord(filePath);
record.facets.acceptance = 'pending';
record.body = record.body + '\n\n' + briefTemplate;
writeRecord(filePath, record);
```
