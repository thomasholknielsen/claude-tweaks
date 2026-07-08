# Design Mode — polish

Invoked via `/claude-tweaks:design polish <spec>`. Returns `{mode, result: "ok", commands_invoked, files_modified}` or `{mode, skipped, ...}` to caller. **First wrapper mode that modifies code.**

## When this runs

Called by `/claude-tweaks:flow` in the polish phase between review and wrap-up. Dispatches three categories in order:

1. **Auto-fit** — always when frontend (`polish` / `clarify` / `harden`)
2. **Issue-driven** — only when the audit cache has matching categories (`typeset` / `layout` / `adapt` / `optimize`)
3. **Intent-driven** — only when the spec's `design-intent:` frontmatter declares matching values (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard`)

The full dispatch tables for each category live in `../command-map.md`.

## Preconditions

Run the universal preconditions from `../SKILL.md` (all three detection layers + availability for the Impeccable plugin).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object — `/flow` notes the skip and proceeds to wrap-up without invoking re-verify.

### Step 2: Resolve changed files

If `<spec>` was passed and lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths.

If zero files remain after filtering, return `{skipped: "no UI files changed"}`.

### Step 3: Read prior audit findings cache

The `review` mode writes findings to a per-spec cache alongside the ledger: `docs/plans/YYYY-MM-DD-{feature}-audit.json` (or `docs/plans/audit-{spec-slug}.json` when invoked outside a flow context).

Cache resolution:

- If a ledger file exists for this spec, derive the date+feature prefix from the ledger filename and use the matching `-audit.json` sibling.
- Otherwise, glob `docs/plans/*-audit.json` and `docs/plans/audit-*.json`, pick the most recently modified file matching the spec slug.
- If no cache file is found, proceed without issue-driven dispatch — only auto-fit commands run.
- If the cache exists but is older than the most recent commit on the spec's branch, treat as stale and skip issue-driven dispatch (the audit no longer reflects current code).

### Step 4: Auto-fit dispatch (always invoked when frontend)

Invoke each via the Skill tool, in order:

- `/impeccable:impeccable polish <files>` — final design system alignment
- `/impeccable:impeccable clarify <files>` — UX copy improvement
- `/impeccable:impeccable harden <files>` — error handling, i18n, edge cases

**File-target convention:** The wrapper passes the file list as a single space-separated argument. If a command rejects multi-file input, the wrapper falls back to looping per file and records the per-command preference once per session in the in-memory marker (same marker pattern as the availability skip de-dupe). Do not surface the looping as a finding — it is a normalization detail, not user-facing behavior. The canonical per-command argument shape is documented alongside each command in `../command-map.md`.

### Step 5: Issue-driven dispatch (only when audit flagged matching category)

Read the audit findings from Step 3. For each category match, invoke the corresponding command per `../command-map.md` Step 2 table. Match by checking the audit finding's `category` or `rule` field (case-insensitive substring match against the category keywords).

When the audit produces multiple matches for the same category, dispatch the command once with the union of affected files.

### Step 6: Intent-driven dispatch

Read the spec's `design-intent:` frontmatter (the canonical field definition lives in `skills/specify/spec-template.md`; the dispatch table is in `../command-map.md` Step 3). For each declared intent value, invoke the matching command via the Skill tool on the same scoped file list used in Steps 4–5.

**Multi-intent ordering.** When the user declared comma-separated intents (e.g., `design-intent: bold, delightful`), invoke commands in the order declared. The fixed `delight` → `animate` pairing for `delightful` is preserved even when interleaved with other intents — treat `delightful` as a single dispatch unit that produces two commands. The wrapper does not run a re-verify cycle between intent commands; the polish phase as a whole shares a single re-verify cycle (capped by `/flow`'s polish phase, see flow's polish-phase decision tree).

**Frequency Gate guardrail.** The `animate` command's target argument always carries a fixed Frequency Gate guardrail suffix, appended after the file list — see `../command-map.md`'s `### Step 3 — Intent-driven` section for the exact text and rationale. Do not treat `animate`'s target as a bare file list when reasoning about this dispatch; the suffix is not optional and is not gated by audit findings or `design-intent` value.

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations. Do not auto-dispatch them from `polish`.

**No declined-recommendation suppression in polish.** Declined-recommendation tracking applies to `survey` mode only — `polish` always honors the explicit `design-intent:` declaration. The user changes intent dispatch behavior by editing the spec frontmatter, not by declining recommendations.

### Step 7: Build `decision_summary`

When `commands_invoked` is non-empty, build a single-sentence summary for the caller to log to the auto-decision log: `"Dispatched {N} Impeccable commands on {M} files — {category list}."` where `N` is the total count of entries in `commands_invoked`, `M` is the count of unique files across all invoked commands, and `{category list}` is built by grouping `commands_invoked` entries by their `category` field, semicolon-separated, in the order auto-fit, issue-driven, intent-driven — skip any category with zero entries:

- **auto-fit** clause: `auto-fit: {comma-separated command names}` (no trigger — auto-fit never has one)
- **issue-driven** clause: `issue-driven: {command} ({trigger})` per distinct command, comma-separated within the clause when more than one dispatched
- **intent-driven** clause: same shape as issue-driven — `intent-driven: {command} ({trigger})`, comma-separated within the clause when more than one dispatched

Worked example — 3 auto-fit commands (`polish`, `clarify`, `harden`), 1 issue-driven (`typeset`, triggered by `audit:typography`), 1 intent-driven (`bolder`, triggered by `intent:bold`), across 3 files:

```
Dispatched 5 Impeccable commands on 3 files — auto-fit: polish, clarify, harden; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold).
```

When `commands_invoked` is empty, do not build `decision_summary` — omit the field entirely from the output.

## Output to caller

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
  ],
  "files_modified": [ "<path>", ... ],
  "decision_summary": "Dispatched 5 Impeccable commands on 3 files — auto-fit: polish; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold), delight (intent:delightful), animate (intent:delightful)."
}
```

Or, when no commands ran (skip from preconditions, or zero files in scope, or no findings + no auto-fit applicable):

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [],
  "files_modified": [],
  "note": "Auto-fit ran with zero net changes" | "No frontend files in scope"
}
```

Note `decision_summary` is absent from the empty-`commands_invoked` case above — there is nothing to log.

`polish` is the **first wrapper mode that modifies code.** Callers (`/flow` polish phase) must follow up with re-verification (types/lint/tests) when `files_modified` is non-empty. When `decision_summary` is present, callers must also append it to the auto-decision log (see `_shared/auto-mode-contract.md`).
