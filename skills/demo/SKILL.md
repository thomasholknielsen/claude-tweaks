---
name: claude-tweaks:demo
description: Use when you want to sweep every built-but-unsigned-off work record — or recap and sign off on ad hoc work from this same conversation that has no work record at all — and give each one a human verdict, approve or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Demo — Human Acceptance Sign-Off

Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — plus any work this same conversation did with no backing record at all, and gives each one a real human verdict. Sits after wrap-up when a record exists; independent of it entirely for conversation-based work with no record to wait on:

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

A second, independent path exists for conversation-based work with no record at all — see Step
1's session-recall source below.

## When to Use

- You're running several parallel threads (`/dispatch`-driven or your own `/flow`/`/build` sessions) and want one place that shows everything built and waiting on your judgment.
- An autonomously `auto:merge`'d record already closed — you want to look at it after the fact and mark it approved, or flag a gap.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.
- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.

## Input

`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record plus this session's own unrecorded work (Step 1's two sources); `#N` scopes to a single label-backed record and skips the session-recall source entirely — a specific record number has nothing to do with recall.

## Step 1: Discover pending work

Two independent sources feed the same worklist, every run — not a fallback chain. Gather both,
then merge before Step 2.

### Source A: label-backed records

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
given, scope Source A to that single record instead of the full list, and skip Source B entirely
— session-recall entries have no record number to match against an explicit `#N`.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords(dir, { acceptance: 'pending' })`
(`bin/lib/issues/local-store.js`) — the Verification Brief is the record's own
`## Verification Brief` body section, not a separate fetch.

### Source B: session-recall scan

Only meaningful when `$ARGUMENTS` is empty (a full sweep) — skip entirely when `#N` was given.

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation or present in Source A's results. Work with no correlating `#N` is
a session-recall candidate — compose its Verification Brief content now, directly from recall,
into the same shape `verification-brief.md` renders (`### The ask` / `### What shipped` /
`### Confirmed` / `### See it yourself`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **See it yourself** — an entry point, only if one was actually exercised/known; omit the
  section entirely otherwise.

This source has no fetch step — there is no comment or record body to read from. A fresh `/demo`
session with no memory of the work in question naturally finds nothing here; that's expected,
not a bug (session-recall never discovers *other* sessions' unrecorded work).

### Merge and stop condition

Combine Source A and Source B into one worklist. Report "Nothing awaiting sign-off." and stop —
do not render an empty batch table or call `AskUserQuestion` — only when **both** sources are
empty.

## Step 2: Present the batch

Skip straight to Step 3 when the merged worklist (Step 1) has exactly one item and it is a
session-recall entry — rendering a batch table for a single row is unnecessary ceremony.
Otherwise, lead with a scope line: `**{N} records awaiting sign-off** ({M} low-risk, {K} need a
closer look)`.

Render a batch table:

| # | Title | Type | Risk/Effort | What shipped | Suggested verdict |
|---|-------|------|--------------|---------------|--------------------|
| {ref} | {title} | {type} | {risk}/{effort} | {one-liner from the brief's "What shipped"} | {Approve \| Needs a look} |

**Suggested verdict** is pre-filled **Approve** only when the record is both `risk:low` and
`effort:low` AND its changed-file list doesn't touch any `merge-sensitive-paths` glob
(`_shared/work-record.md`'s config key). Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping. Session-recall entries never carry
`risk:*`/`effort:*` labels (there's no record to hold them), so they always render `{ref}` as
`(session)`, `{type}` as `ad hoc`, `{risk}/{effort}` as `—`, and always get **Needs a look**.

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (The ask / What
shipped / Confirmed / See it yourself — evidence the human can judge, not a checklist to
complete). Label-backed entries were fetched per `verification-brief.md`'s digest template in
Step 1's Source A; session-recall entries were composed directly from recall, also in Step 1
(Source B), into the same four-heading shape — both render identically here. Then call
`AskUserQuestion` with `question`: `"Does {title} do what you asked for?"`, `header`:
`"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 (only when the brief's "See it yourself" entry point resolved) — `label`: `"Show me live"`, `description`: `"Open {entry point} in a live browser session before deciding"`
- Option 3 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 4 — `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`

**"Show me live"**: open an `agent-browser` session at the brief's resolved entry point, following
`/claude-tweaks:browse`'s conventions (session naming, lifecycle) directly — the same relationship
`/claude-tweaks:visual-review` already has with `/claude-tweaks:browse`, not a workflow-step
invocation of `/claude-tweaks:browse` itself. After the human finishes looking, close the session
(leaked sessions consume resources — same discipline `/claude-tweaks:browse`'s own Anti-Patterns
table requires), then re-render the same
`AskUserQuestion` for this record with only Approve / Request changes / Skip for now (the live
look already happened — don't offer it twice for the same record).

## Step 4: Apply verdicts

**Label-backed entries** (Source A, Step 1): bootstrap `demo:approved` and
`demo:changes-requested` via the check-then-create loop from `_shared/label-bootstrap.md` before
the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
- **Request changes** — prompt for a short reason inline, then:
  1. **`work-backend: github-issues`:** `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`. **`work-backend: local-files`:** set `facets.acceptance = 'changes-requested'` via `writeRecord`.
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. `work-backend: github-issues`:
     use the same `recordPayload` composition `/claude-tweaks:capture` uses
     (`bin/lib/issues/record.js`), just without invoking `/claude-tweaks:capture` itself.
     `work-backend: local-files`: use `allocateId`/`writeRecord`
     from `bin/lib/issues/local-store.js` instead.
  3. Note the bidirectional link back on the original record. `work-backend: github-issues`:
     comment on the original issue with the new follow-up's issue number. `work-backend:
     local-files`: there is no comment mechanism (same constraint `verification-brief.md` and
     `_shared/work-record.md` already document) — append a short note with the follow-up's id to
     the original record's body instead, via the same `readRecord`/`writeRecord` round trip.
- **Skip for now** — no label change.

**Session-recall entries** (Source B, Step 1) — no record exists, so nothing here ever
bootstraps a label or writes to GitHub/local-files for Approve or Skip:

- **Approve** — nothing written anywhere. The verdict lives in this conversation.
- **Skip for now** — nothing written anywhere. Unlike a label-backed record, this will not
  reappear in a future `/demo` run — a different session has no memory of this conversation to
  recall from. This is the accepted tradeoff of not persisting anything, not a bug.
- **Request changes** — the exact same follow-up-filing procedure as the label-backed path's
  Request changes above (step 2), reusing `recordPayload`/`allocateId` directly — the only
  difference is there is no original record to relabel or comment a link back onto. The
  `Origin:` body line reads `Origin: demo changes-requested from session recall` instead of
  `from #{n}`.

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
| Leaving a "Show me live" session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
| Writing `demo:approved`/`demo:pending` for a session-recall entry | There's no record to hold it — the verdict lives in the conversation, not a label. Only a Request-changes verdict ever produces a real record for one of these. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Sole producer of *label-backed* `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`), gated on a clean visual-review pass — `/demo` is the sole consumer/resolver for that path. `/demo`'s session-recall source (Step 1) surfaces conversation-based work independently of `/wrap-up` ever running. |
| `/claude-tweaks:browse` | `/demo`'s "Show me live" option (Step 3) consumes /browse's conventions directly (session naming, lifecycle) for an on-demand live look — the same relationship /claude-tweaks:visual-review has with /browse, not a workflow-step invocation |
| `/claude-tweaks:help` | `/help`'s dashboard surfaces a `demo:pending` count as a lightweight signal; `/demo` is where the actual walkthrough happens |
| `/claude-tweaks:capture` | On "request changes," `/demo` files a follow-up backlog record using the same `recordPayload` composition `/capture` itself uses, without invoking `/capture` |
