---
name: claude-tweaks:demo
description: Use when you want to sweep every built-but-unsigned-off work record and give each one a human verdict — approve, or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Demo — Human Acceptance Sign-Off

Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — and gives each one a real human verdict. Sits after wrap-up, with no fixed position in any single pipeline run:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, across every in-flight thread)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

## When to Use

- You're running several parallel threads (`/dispatch`-driven or your own `/flow`/`/build` sessions) and want one place that shows everything built and waiting on your judgment.
- An autonomously `auto:merge`'d record already closed — you want to look at it after the fact and mark it approved, or flag a gap.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.

## Input

`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record; `#N` scopes to a single record.

## Step 1: Discover pending records

**`work-backend: github-issues`:**

```bash
gh issue list --state all --label demo:pending --json number,title,labels,url --limit 200 > /tmp/demo-pending.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/demo-pending.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
"
```

`--state all` is deliberate — `demo:pending` persists independent of open/closed state, which is
what makes retrospective sign-off on already-merged `auto:merge` work possible. When `#N` is
given, scope to that single record instead of the full list.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords(dir, { acceptance: 'pending' })`
(`bin/lib/issues/local-store.js`) — the Verification Brief is the record's own
`## Verification Brief` body section, not a separate fetch.

If no records match, report "Nothing awaiting sign-off." and stop — do not render an empty
batch table or call `AskUserQuestion`.

## Step 2: Present the batch

Lead with a scope line: `**{N} records awaiting sign-off** ({M} low-risk, {K} need a closer look)`.

Render a batch table:

| # | Title | Type | Risk/Effort | What changed | Suggested verdict |
|---|-------|------|--------------|---------------|--------------------|
| {ref} | {title} | {type} | {risk}/{effort} | {one-liner from the brief's "What changed"} | {Approve \| Needs a look} |

**Suggested verdict** is pre-filled **Approve** only when the record is both `risk:low` and
`effort:low` AND its changed-file list doesn't touch any `merge-sensitive-paths` glob
(`_shared/work-record.md`'s config key). Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping.

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (What changed /
Why / How to verify, or the non-testable note verbatim), then call `AskUserQuestion` with
`question`: `"Verdict for {ref}: {title}?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 3 — `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`

## Step 4: Apply verdicts

Bootstrap `demo:approved` and `demo:changes-requested` via the check-then-create loop from
`_shared/label-bootstrap.md` before the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
- **Request changes** — prompt for a short reason inline, then:
  1. `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. Use the same `recordPayload`
     composition `/capture` uses (`bin/lib/issues/record.js`), just without invoking `/capture`
     itself.
  3. Comment on the original record noting the new follow-up's issue number, so the link is
     bidirectional.
- **Skip for now** — no label change.

## Next Actions

Render via `AskUserQuestion`, `question`: `"What's next?"`, `header`: `"Next step"`,
`multiSelect`: `false`:

- Option 1 (when any `demo:changes-requested` follow-up was filed) — `label`: `"Triage the new follow-up (Recommended)"`, `description`: `"/claude-tweaks:triage — the new gap record needs shaping/authorization like any other backlog item"`
- Option 2 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — full pipeline status"`
- Option 3 (when records remain `demo:pending` after Skip) — `label`: `"Run demo again later"`, `description`: `"{N} records still awaiting sign-off — /claude-tweaks:demo picks them back up next run"`

## Component-Skill Contract

`/claude-tweaks:demo` is a **standalone-only** skill — it is never invoked by a parent skill
in the workflow. There is no `PIPELINE_RUN_DIR` signal to check; the `## Next Actions` block
always renders.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Bulk-approving everything regardless of risk tier | This skill exists for real human judgment — only the `risk:low`+`effort:low` tier with no `merge-sensitive-paths` touch gets a pre-filled Approve suggestion, and it's still a choice, not a default |
| Re-deriving "how do I test this" from the diff | The Verification Brief already has it — `/wrap-up` wrote it at build time with full context; read the brief, don't reconstruct it |
| Merging or opening a PR from within this skill | Merge/PR decisions belong to `/superpowers:finishing-a-development-branch` — `/demo` only ever resolves the Acceptance axis |
| Silently dropping a `demo:pending` record with no verdict | Every record gets Approve / Request changes / Skip — Skip is explicit and leaves `demo:pending` for next run, it never disappears from the worklist unrecorded |
| Treating a record with no interactive surface as not needing sign-off | Non-testable work still gets a lightweight human look — the brief just reframes the ask as "review the diff/rationale" instead of "click through this" |
| Scanning only open issues | `demo:pending` persists on closed issues too (auto-merged autonomous work) — always query `--state all` |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Sole producer of `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`) — `/demo` is the sole consumer/resolver |
| `/claude-tweaks:help` | `/help`'s dashboard surfaces a `demo:pending` count as a lightweight signal; `/demo` is where the actual walkthrough happens |
| `/claude-tweaks:capture` | On "request changes," `/demo` files a follow-up backlog record using the same `recordPayload` composition `/capture` itself uses, without invoking `/capture` |
