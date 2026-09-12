# Acceptance-Gap Closed-Record Fetch Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound `acceptance-gap`'s closed-record fetch in `plugin/skills/_shared/github-pr-scan-acceptance.md` by the resolved `backlog-fetch-limit` (same substitution convention the scope's own parent fetches already use) instead of a hardcoded `--limit 200`, so this scope stops silently dropping older closed records on a repo that closes more than 200 issues in 30 days — and emit the same exact-cap truncation warning the parent fetches already emit.

**Architecture:** This is a single-file prose/procedure edit — no application code, no runtime. The fetch block that currently pipes `gh issue list --state closed --limit 200` through an inline `jq` date filter is replaced with a two-step version: fetch the raw (unfiltered) records bounded by `{resolved-limit}`, check whether the raw count hit the limit (truncation signal), then filter to the last 30 days in `node` (dropping the BSD/GNU `date` shell-fallback dance the inline `jq` filter needed, since `node`'s `Date` arithmetic is cross-platform). The surrounding "Fetch limit" prose section is updated to match (drop the retired "200 is in practice never reached" claim; state the new shared-limit behavior).

**Tech Stack:** Markdown skill prose (bash + node snippets embedded for the dispatching agent to run verbatim). No new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T153247-record-2217/work/2217-spec.md` (materialized from issue #2217)

## Global Constraints

- `plugin/skills/_shared/github-pr-scan-acceptance.md` is already at 38,853 bytes against the 40,960-byte (40 KB) per-file ceiling (`context-cost.js`'s `overComposedCeiling`) — within the ~10% headroom-check threshold `build/SKILL.md` Common Step 1.5 names. The task below is a net-neutral-to-slightly-larger edit (it removes the retired BSD/GNU `date` fallback prose and the "never reached" claim while adding the truncation-warning code); **after editing, re-measure `wc -c` on the file and confirm it stays under 40,960 bytes** — if it doesn't, trim the "Fetch limit" prose further (it's the only discretionary prose touched by this task) rather than leaving the file over ceiling.
- Follow the project's `{resolved-limit}` substitution convention exactly as the file's own parent-fetch blocks already do (`_shared/github-pr-scan-acceptance.md` lines ~119-127, ~150-158): resolve `backlog-fetch-limit` via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values backlog-fetch-limit` and substitute the literal number into the block — never carry it across blocks in a shell variable (shell state does not survive between separate Bash calls in this harness).
- No test file exists today that pins this file's closed-record fetch line (confirmed: `grep -rn "limit 200" tests/` finds two unrelated matches in `tests/backlog-attention-rows.test.js`, not this file; `grep -rln "github-pr-scan-acceptance" tests/` finds only `tests/session-tmp-root-migration.test.js` and `tests/fetch-sub-issues-prose-conformance.test.js`, neither of which pins the `--limit 200` line). This task does not add one — the record's own AC #3 ("update tests/ conformance ... if any pins the fetch line") is conditional and the condition is false.

---

### Task 1: Bound the closed-record fetch by `backlog-fetch-limit` and add the truncation warning

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md:51-63` (Record-set prose + fetch block)
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md:95-112` (Fetch limit section prose)
- Modify: `plugin/skills/tidy/scan-procedures.md` — **no change expected** (verification step below confirms no `200` figure is restated there)

**Interfaces:** N/A — this is a documentation/procedure file with no exported functions; "interfaces" here means the shell variable names later blocks in the same file may reuse. This task's new block writes to `$CLOSED` (unchanged variable name — every later reference to the closed-record set in this file, e.g. the Disposition-filter block around line 266, reads `tidy-closed-records.json` via that same session-tmp-resolved name, so the output file path and shape — a JSON array of `{number,title,state,labels,closedAt}` objects — must stay identical to today's).

- [ ] **Step 1: Read the current fetch block and confirm line numbers before editing**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/record-2217"
grep -n "Record set: closed records\|gh issue list --state closed --limit 200\|This scope's own closed-record fetch" plugin/skills/_shared/github-pr-scan-acceptance.md
```

Expected: three matches, at line 51 (`Record set: closed records...`), line 59 (`gh issue list --state closed --limit 200 \`), and line 107 (`This scope's own closed-record fetch above keeps its hardcoded...`). If the line numbers have drifted since this plan was written, re-locate the same three text anchors by content, not by line number, before editing.

- [ ] **Step 2: Replace the Record-set paragraph (drop the BSD/GNU `date` fallback description)**

Replace this exact block:

```markdown
Record set: closed records from the last 30 days. The `date` fallback covers both platforms this
plugin runs on — BSD `date` (macOS, this project's development platform) uses `-v-30d`; GNU `date`
(Linux, cloud Routine sandboxes) uses `-d '30 days ago'`.
```

with:

```markdown
Record set: closed records from the last 30 days, computed as `Date.now() - 30 days` in the
`node` step below — cross-platform, no shell `date` variant needed.
```

- [ ] **Step 3: Replace the fetch code block with the limit-bound, warning-emitting version**

Replace this exact block:

````markdown
Resolve session-scoped paths first (`_shared/session-tmp-root.md`, cited throughout this file rather than restated):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" CLOSED=tidy-closed-records.json)"
gh issue list --state closed --limit 200 \
  --json number,title,state,labels,closedAt \
  --jq '[.[] | select(.closedAt > "'"$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)"'")]' \
  > "$CLOSED"
```
````

with:

````markdown
Resolve session-scoped paths first (`_shared/session-tmp-root.md`, cited throughout this file rather than restated), then resolve `backlog-fetch-limit` and substitute it into the fetch below (per this file's "Fetch limit" section):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" RAW=tidy-closed-records-raw.json CLOSED=tidy-closed-records.json)"
LIMIT="{resolved-limit}"
gh issue list --state closed --limit "$LIMIT" \
  --json number,title,state,labels,closedAt \
  > "$RAW"
node -e "
  const fs = require('fs');
  const raw = require('$RAW');
  const LIMIT = $LIMIT;
  if (raw.length === LIMIT) {
    console.error('WARNING: the closed-record fetch returned exactly ' + LIMIT + ' records (the configured backlog-fetch-limit) — closed records older than the newest ' + LIMIT + ' are invisible to this scope, even within the 30-day window. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before treating this scope as complete.');
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync('$CLOSED', JSON.stringify(raw.filter((r) => r.closedAt > cutoff)));
"
```
````

`$RAW`/`$CLOSED`/`$LIMIT` are interpolated directly by the shell into the `node -e "..."` double-quoted string — no backslash-escaping — exactly the convention this file's other inline `node -e` blocks already use (e.g. the `work-links: body-text` branch a few sections below: `require('$PFG_NEW')`, `fs.writeFileSync('$GAP_SUBS', ...)`). Match that style precisely.

- [ ] **Step 4: Update the "Fetch limit" section's closed-record paragraph**

Replace this exact block:

```markdown
Both branches below bound their parent fetches with `{resolved-limit}` rather than a
hardcoded cap. Resolve `backlog-fetch-limit` with
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values backlog-fetch-limit`
(`_shared/work-record-config.md`'s key table; the resolver applies the schema default when the
key is absent) and substitute the literal number into **every**
block below that names it. Substitute it independently per
block and never carry it across blocks in a shell variable — shell environment does not survive
between Bash calls and never reaches a subagent, so a cross-block `export` silently resolves
empty (the same discipline `_shared/trust-table.md` states for its own identical fetches).

This scope's own closed-record fetch above keeps its hardcoded `--limit 200`: its record set is
bounded to the last 30 days, so 200 is in practice never reached. The parent fetches are
not — they are `--state all` over the repo's entire history, and `gh issue list` returns
newest-first, so a fixed cap drops the **oldest** parents first. Those are precisely the parents
whose sub-issues have already closed, so truncation silently re-floods this scope with exactly the
rows the filter exists to remove.
```

with:

```markdown
This scope's own closed-record fetch above and both parent-fetch branches below bound their
fetches with `{resolved-limit}` rather than a hardcoded cap. Resolve `backlog-fetch-limit` with
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values backlog-fetch-limit`
(`_shared/work-record-config.md`'s key table; the resolver applies the schema default when the
key is absent) and substitute the literal number into **every**
block below that names it. Substitute it independently per
block and never carry it across blocks in a shell variable — shell environment does not survive
between Bash calls and never reaches a subagent, so a cross-block `export` silently resolves
empty (the same discipline `_shared/trust-table.md` states for its own identical fetches).

A 30-day window does not bound the closed-record fetch the way it might seem to: a busy repo can
close far more than any reasonable hardcoded cap within 30 days (971 closed issues in 30 days was
observed on this repo alone), so a fixed limit silently drops the **oldest** closed records first —
exactly the quiet-failure a backstop scope must never have. The parent fetches share the same
exposure for a different reason — they are `--state all` over the repo's entire history, and
`gh issue list` returns newest-first, so a fixed cap drops the **oldest** parents first. Those are
precisely the parents whose sub-issues have already closed, so truncation silently re-floods this
scope with exactly the rows the filter exists to remove.
```

- [ ] **Step 5: Verify no stale "200" figure remains for this scope, and confirm `tidy/scan-procedures.md` needs no change**

Run:

```bash
grep -n "limit 200\|never reached in practice" plugin/skills/_shared/github-pr-scan-acceptance.md
grep -n "\b200\b" plugin/skills/tidy/scan-procedures.md
```

Expected: the first command prints no matches (both retired strings are gone from this file — the `acceptance-queue` scope's own unrelated `--limit 200` at line 26 is a different scope, deliberately untouched by this record, so if it appears make sure it's *that* line and not a leftover from the edited scope). The second command prints no matches (already confirmed by this plan's author before writing it — `tidy/scan-procedures.md`'s Step 4.8 section never restated the literal `200` figure, so there is nothing to update there; this step exists to catch drift if that's changed since).

- [ ] **Step 6: Confirm the edited fetch block is syntactically valid**

Extract the new `node -e` snippet's JS body into a scratch file and lint it for syntax errors only (no execution — there's no live `gh` data available offline, and this is a syntax check, not a behavior test):

```bash
node -e "
  const fs = require('fs');
  const raw = [];
  const LIMIT = 5;
  if (raw.length === LIMIT) {
    console.error('WARNING: the closed-record fetch returned exactly ' + LIMIT + ' records (the configured backlog-fetch-limit) — closed records older than the newest ' + LIMIT + ' are invisible to this scope, even within the 30-day window. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before treating this scope as complete.');
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(JSON.stringify(raw.filter((r) => r.closedAt > cutoff)));
"
```

Expected: prints `[]` with no thrown error (this is the same JS body as the plan's Step 3 block, run standalone against a stub `raw = []` and `LIMIT = 5` — no crash confirms the syntax and the `.filter`/`.toISOString` calls are valid; the real block additionally substitutes `require('$RAW')`/`fs.writeFileSync('$CLOSED', ...)` for file I/O, which this standalone check doesn't exercise since there's no `$RAW` file to read offline).

- [ ] **Step 7: Re-measure file size against the 40 KB ceiling**

```bash
wc -c plugin/skills/_shared/github-pr-scan-acceptance.md
```

Expected: under `40960`. If over, trim the Step 4 prose (the only discretionary addition in this task) rather than dropping any of the warning/fetch-limit code.

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/_shared/github-pr-scan-acceptance.md
git commit -m "Bound acceptance-gap's closed-record fetch by backlog-fetch-limit

refs #2217"
```
