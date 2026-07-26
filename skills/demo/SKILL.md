---
name: claude-tweaks:demo
description: Use when you want a human verdict — approve or request changes — on one built thing: this same conversation's own unrecorded work, or a specific `#N` record already marked demo:pending. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review); discovery of what's outstanding across the backlog is /help's job (Stage 4.7), not this skill's. Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall.
argument-hint: "[#N]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Demo — Human Acceptance Sign-Off

Gives one built thing a real human verdict — approve or request changes: either this
conversation's own unrecorded work, or a specific `#N` record. Sits after wrap-up when a record
exists; independent of it entirely for conversation-based work with no record to wait on. This
skill resolves one item per invocation — it never discovers or lists what's outstanding across
the backlog; `/claude-tweaks:help`'s dashboard (Stage 4.7) is where that list lives:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, on one item at a time)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

A second, independent path exists for conversation-based work with no record at all — see Step
1's session-recall source below.

## When to Use

- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.
- `/claude-tweaks:help`'s dashboard told you a specific `#N` is awaiting sign-off (Stage 4.7) — including an autonomously `auto:merge`'d record already closed — and you want to walk through that one record now.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.

Not for: discovering what's outstanding across the backlog (`/claude-tweaks:help`'s job — Stage 4.7 lists every `#N`), merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis, one item at a time.

## Input

`$ARGUMENTS` — *(none)* resolves this session's own unrecorded work via session-recall (Step 1);
`#N` resolves that single record's Verification Brief, falling back to session-recall scoped to
that `#N` when no `demo:pending` label exists on it (Step 1). Never sweeps the backlog —
`/claude-tweaks:help` (Stage 4.7) is where the full outstanding list lives.

## Step 1: Resolve the one item

`/demo` resolves exactly one unit of work per invocation — never a sweep. `$ARGUMENTS` selects
which path runs.

### No arguments: session-recall

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation. Work with no correlating `#N` is a session-recall candidate —
compose its Verification Brief content now, directly from recall, into the same shape
`verification-brief.md` renders (`### The ask` / `### What shipped` / `### Confirmed` / `### See
it yourself`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **See it yourself** — an entry point, only if one was actually exercised/known; omit the
  section entirely otherwise.

This path has no fetch step — there is no comment or record body to read from. A fresh `/demo`
session with no memory of any unrecorded work naturally finds nothing here; that's expected, not
a bug (session-recall never discovers *other* sessions' unrecorded work). Report "Nothing
awaiting sign-off." and stop — do not call `AskUserQuestion` — when recall finds nothing.

Almost always this yields exactly one candidate — skip straight to Step 2 with it. On the rare
occasion this session did 2+ genuinely distinct, uncorrelated units of work, walk each through
Step 2 in sequence — no batch table, no bulk-decision question; session-recall entries never
carry `risk:*`/`effort:*` data to pre-fill a bulk-approve option against.

### `#N` given: single-record lookup

**`work-backend: github-issues`:**

```bash
gh issue view {n} --json number,title,labels,url,state
```

If the result carries the `demo:pending` label, fetch its Verification Brief: the last issue
comment containing `## Verification Brief` (`gh issue view {n} --json comments -q
'.comments[-1].body'` if only one build/demo cycle occurred; otherwise search all comments for
the last one containing that heading). Go straight to Step 2 with it.

If the result does **not** carry `demo:pending` (e.g. it was built via a path that skipped
`/wrap-up`'s Step 10), fall back to session-recall for this specific `#N`: does this conversation
have memory of building and/or verifying it? If yes, compose a Verification Brief exactly as the
no-arguments path does above, scoped to this one record, and go straight to Step 2. If this
session has no memory of it either, report plainly: "`#N` has no Verification Brief and this
session has no memory of it — nothing to show." and stop.

**`work-backend: local-files`:** `readRecord(filePath)` for the single record
(`bin/lib/issues/local-store.js`); the Verification Brief is the record's own `## Verification
Brief` body section. Same `demo:pending`-then-session-recall fallback order as above, keyed on
`facets.acceptance === 'pending'` instead of the label.

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
- Option 4 — for a label-backed entry: `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`. For a session-recall entry: `label`: `"Skip for now"`, `description`: `"Nothing is written — unlike a label-backed record, this won't resurface in a later session"`

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
     (`bin/lib/issues/record.js`), just without invoking `/claude-tweaks:capture` itself —
     and, unlike `/capture`'s own call, **omit the `origin` field entirely** rather than passing
     `origin:'demo'`: `record.js`'s `ORIGINS` enum has no `'demo'` entry, so passing it throws;
     omitting `origin` is also what keeps this follow-up label-free, consistent with the
     "no `by:*` label" requirement above (`recordPayload` only pushes a `by:*` label when
     `origin` is set).
     `work-backend: local-files`: use `createRecord(dir, { slug, title, body, facets })` from
     `bin/lib/issues/local-store.js` — `title` is the reason text just collected, `body` is the
     reason plus the link back to the original plus the `Origin:` line above, `facets: { type,
     stage: 'backlog' }` (`type` being `bug` or the overridden type). Compute `slug` via that
     same module's `deriveSlug(title, existingSlugs)`. Never `allocateId`+`writeRecord`
     separately — same allocateId+writeRecord race `capture/SKILL.md`'s Backend Selection
     section documents (two near-simultaneous filings, e.g. two `/demo` "Request changes"
     verdicts landing in the same run, or `/demo` racing a `/capture`/`/specify` decomposition,
     can silently share one numeric id); see that section for the full call shape to mirror.
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
  Request changes above (step 2), reusing `recordPayload` (`work-backend: github-issues`) or
  `createRecord`+`deriveSlug` (`work-backend: local-files`) directly — the only difference is
  there is no original record to relabel or comment a link back onto, or reference within the
  follow-up's own body — the `Origin:` line is the sole provenance marker for a session-recall
  follow-up. The `Origin:` body line reads `Origin: demo changes-requested from session recall`
  instead of `from #{n}`.

## Next Actions

Render via `AskUserQuestion`, `question`: `"What's next?"`, `header`: `"Next step"`,
`multiSelect`: `false`:

- Option 1 (when any `demo:changes-requested` follow-up was filed) — `label`: `"Triage the new follow-up (Recommended)"`, `description`: `"/claude-tweaks:triage — the new gap record needs shaping/authorization like any other backlog item"`
- Option 2 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — full pipeline status"`
- Option 3 (when this record remains `demo:pending` after Skip) — `label`: `"Check what else is outstanding"`, `description`: `"/claude-tweaks:help — lists every #N still awaiting sign-off (Stage 4.7)"`

## Component-Skill Contract

`/claude-tweaks:demo` is a **standalone-only** skill — it is never invoked by a parent skill
in the workflow. There is no `PIPELINE_RUN_DIR` signal to check; the `## Next Actions` block
always renders.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Bulk-approving everything regardless of risk tier | This skill exists for real human judgment — only the `risk:low`+`effort:low` tier gets a pre-filled Approve suggestion, and it's still a choice, not a default |
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
| `/claude-tweaks:visual-review` | `/demo`'s Verification Brief digest (Step 3) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. |
| `/claude-tweaks:help` | `/help`'s dashboard surfaces a `demo:pending` count as a lightweight signal; `/demo` is where the actual walkthrough happens |
| `/claude-tweaks:capture` | On "request changes," `/demo` files a follow-up backlog record using the same `recordPayload` composition `/capture` itself uses, without invoking `/capture` |
