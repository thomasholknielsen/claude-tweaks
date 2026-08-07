# Design Mode — review

Invoked via `/claude-tweaks:design-wrapper review <spec>`. Returns `{mode, result: "advisory", files_scanned, findings, score_trend}` or `{mode, skipped, ...}` to caller. Also writes an audit cache that `polish` mode consumes, appends to a persistent design-score history log, and — when the built artifact carries one — records the Impeccable direction contract's seed key onto the work record (Step 3.6).

## When this runs

Called by `/claude-tweaks:review` during code review. Runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit` on changed UI files. Findings appear in the review summary as advisory (never auto-applied).

## Preconditions

Run the universal preconditions from `../SKILL.md` (Layers 1+2+3 and availability for the Impeccable plugin — verified by `/impeccable:impeccable*` skill resolution).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object.

### Step 2: Resolve changed UI files

If `<spec>` was passed and the spec lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths (Layer 3 rules).

If zero files remain after filtering, return `{skipped: "no UI files changed"}`. If `git diff --name-only` itself fails (non-git directory, git error, mid-rebase state), return `{skipped: "unable to resolve target files (git diff failed)"}` immediately — see `../SKILL.md`'s Input section for this shared fallback-failure rule.

### Step 3: Invoke Impeccable LLM commands

> **Parallel execution:** Use parallel tool calls aggressively — `critique` and `audit` run on the identical file list with no data dependency between them (Step 4 merges both outputs afterward), so dispatch both Skill-tool calls concurrently rather than sequentially.

Invoke via the Skill tool:

- `/impeccable:impeccable critique <files>` — qualitative critique
- `/impeccable:impeccable audit <files>` — heuristic audit pass

### Step 3.5: Read Impeccable's own cached critique (Layer 0, when signals resolved)

When Layer 0 resolved (see `../impeccable-plugin.md`) and `critique.latest` is non-null, carry it into the return as `prior_critique` — Impeccable's own most recent cached critique of this project, with its score and P0/P1 counts, free (the signals call already read it; no command runs).

It is **advisory context only**:

- It never replaces the live `critique` run in Step 3. A cached score describes whatever was critiqued last, which is not necessarily the diff under review — that is exactly why Step 3 still runs.
- It never changes `result`, which stays `advisory` regardless.
- It is **not** merged into `score_trend`. That series is this wrapper's own, written by Step 4.5 from parsed report totals on a known `/40` and `/20` scale; `critique.latest.score` comes from Impeccable's `.impeccable/critique/` frontmatter, a different producer whose scale this contract does not pin. Folding one into the other would manufacture a delta between two numbers that were never on the same axis.

When Layer 0 did not resolve, or resolved with `critique.latest: null`, omit `prior_critique` from the return entirely — the same convention Step 4.5 uses for an unparseable score. Both cases mean "no cached critique to report," and neither is an error.

### Step 3.6: Read the direction contract and record its seed key

This is the one point in the pipeline where a **built artifact** and its **work record** are both in
hand. Impeccable writes a direction contract into the opening comment of what it builds, before the
code; the seed key in that contract is the only thing that makes a build's direction reproducible,
since Impeccable 4.x is deliberately non-deterministic by dice. Nothing recovers it later — by the
time anyone asks, the artifact exists and the intent behind it is only inferable from the result.

Run the locate-and-parse procedure in `../../_shared/design-contract.md` over the **file list Step 2
already resolved**. Do not discover files again, and do not widen the list — a contract outside the
changed set belongs to work this review is not looking at.

That procedure returns one of three outcomes and this step handles each:

- **No contract** — the ordinary case. Do nothing at all: no record write, no log line, nothing
  added to the return. Most reviews are not of design work.
- **Malformed** — do not write anything to the record, and log the `SCANNED` entry that procedure
  specifies. A partial contract must never become a partial `Design-seed:`.
- **Contract found** — continue below.

**Resolve the record.** The seed belongs on the work record, not in a cache. Read `record:` from the
materialized header of `<spec>` (`{run-dir}/work/{n}-spec.md`, or its `spec-{N}/` equivalent —
`skills/flow/materialize.md` owns that format). If `<spec>` is not a materialized record file — a
path-driven or standalone `/claude-tweaks:review` with no record behind it — there is no record to
write to: skip the write, carry the contract into the return, and stop here. That is not a failure;
it is a review of work that no record is tracking.

**Write `Design-seed:` onto the record body.** Only when the parse produced a seed. Re-fetch the
body immediately before writing rather than reusing one fetched earlier in this run — a record's
body is shared mutable state that `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, or a concurrent
session can have changed since. Then insert or update the line inside the body's **leading metadata
block** (before the first blank line), beside `Surface:`/`Design-intent:`, per
`skills/specify/spec-template.md`:

- **`work-backend: github-issues`** — read-modify-write the body through
  `../../_shared/github-write-transport.md` (which routes around an absent `gh`), preserving every
  other byte of the body.
- **`work-backend: local-files`** — `readRecord`/`writeRecord` (`bin/lib/issues/local-store.js`).

Three rules on the write itself:

1. **Never write the line empty.** No seed means no line — the contract-without-a-seed case is legal
   upstream ("when the seed dealt stagings"), and an empty `Design-seed:` would be indistinguishable
   from a parse that silently failed.
2. **A differing existing value is overwritten, not duplicated**, and the overwrite is logged with
   both values. A re-roll legitimately changes the seed, so the newest build's key is the true one —
   but two records of one field is how a reproduction attempt picks the wrong die.
3. **An identical existing value is not rewritten at all** — no API call, no log entry. Re-running
   `/claude-tweaks:review` on an unchanged build must not churn the record.

Log one `AUTO` entry to `{run-dir}/decisions.md` (`../../_shared/auto-decision-log.md`) for a write,
naming the record, the artifact the contract came from, and the seed. Reversibility is high: the
line is one edit to a record body.

**Never gate on any of this.** A failed record write, an absent record, an unreadable artifact — each
degrades to "no seed recorded" and the review continues. This step is provenance capture; it has no
opinion on the review verdict and can never change `result`, which stays `advisory`.

### Step 4: Normalize findings

Parse each output into a normalized findings list:

```json
{
  "source": "critique" | "audit",
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."
}
```

Also extract each command's Total score from its report text, independently of findings parsing:

- **Critique** report ends with a `| **Total** | | **??/40** | **[Rating band]** |` row ("Design Health Score"). Extract the numeric fraction from the `??/40` cell.
- **Audit** report ends with a `| **Total** | | **??/20** | **[Rating band]** |` row ("Audit Health Score"). Extract the numeric fraction from the `??/20` cell.

If a command's output has no matching Total row (malformed report, drifted format, missing table), treat that score as **absent** for this run — this does not affect findings normalization above, which always proceeds independently of score parsing.

### Step 4.5: Capture score + compute trend

1. Resolve the history file path: `.claude-tweaks/design/score-history.jsonl` (relative to project root). Create the `.claude-tweaks/design/` directory if it does not exist.
2. Before appending anything, read the existing file (if present) to find:
   - The most recent line containing a `critique_score` field → this becomes `score_trend.critique.previous`.
   - Independently, the most recent line containing an `audit_score` field → this becomes `score_trend.audit.previous`.

   Each score type tracks its own most-recent value independently — the last line carrying `audit_score` is not necessarily the same line as the last one carrying `critique_score`, since either can be absent on any given prior run. Skip any line that fails to parse as JSON while scanning; do not fail the whole read over one malformed line.
3. For each score type where both a current value (from Step 4) and a previous value (from the scan above) exist, compute `delta = current - previous`. If no prior line carries that score type's field, set `previous: null` and `delta: null` for it — first-ever capture reports as "first captured score" downstream.
4. Append one new line to the history file (create the file if it does not exist):

   ```json
   {"timestamp": "<ISO 8601 timestamp>", "spec": "<spec id or path, same value Step 5 uses for the audit cache>", "critique_score": 32, "critique_max": 40, "audit_score": 16, "audit_max": 20, "files_scanned": 3}
   ```

   Omit `critique_score`/`critique_max` (or `audit_score`/`audit_max`) entirely from the line — not `null` — when that score wasn't parseable this run (Step 4). A partial capture (one score present, one absent) still writes a partial line rather than being dropped entirely.
5. If the append fails (disk full, permission denied), surface as a one-time skip and continue — same recovery rule as Step 5's cache-write failure below. A history-write failure never blocks the review gate; scores are informational only.

### Step 5: Write audit findings cache for polish mode

Persist the **audit findings only** (not critique) to a JSON file alongside the ledger:

- **Primary path:** `docs/plans/YYYY-MM-DD-{feature}-audit.json` (matches the ledger filename `docs/plans/YYYY-MM-DD-{feature}-ledger.md`).
- **Fallback (review invoked outside a flow context):** derive from the spec slug — `docs/plans/audit-{spec-slug}.json`.

Cache shape:

```json
{
  "spec": "<spec id or path>",
  "written_at": "<ISO timestamp>",
  "findings": [ { "id": "...", "source": "audit", "file": "...", "category": "...", "severity": "...", "message": "...", "suggestion": "..." }, ... ]
}
```

Two fields exist for `polish` mode's benefit and must be written even when they look redundant:

- **`suggestion`** — the command `audit` named for this finding, normalized to a bare command name. It is the *only* thing that selects a command in `polish` mode's suggestion-driven dispatch, so a finding cached without it is downgraded to an unclassified observation. When `audit`'s output gives no suggested command for an issue, write the field as `null` rather than omitting it, so the downgrade is visibly deliberate rather than looking like a cache-shape bug.
- **`id`** — a per-run identifier, stable within one cache file: use the finding's own identifier when `audit` emits one, otherwise assign `audit-{n}` by position, 1-based. `polish` mode stages unclassified findings by `id`, and a human at the Review Console needs it to find the finding this cache came from.

Cache entries are stale after one flow run; they get overwritten on the next `review` invocation for the same spec. Cleanup is handled by `/claude-tweaks:wrap-up` Step 5 alongside the ledger.

If the cache write fails (disk full, permission denied), surface the failure as a one-time skip and continue — with the cache absent, `polish` mode runs its refinement set and intent dispatch, and skips suggestion-driven dispatch entirely.

## Output to caller

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": <int>,
  "findings": [ ... combined critique + audit findings ... ],
  "score_trend": {
    "critique": { "current": 32, "max": 40, "previous": 28, "delta": 4 },
    "audit": { "current": 16, "max": 20, "previous": null, "delta": null }
  },
  "prior_critique": { "slug": "dashboard", "score": 78, "p0": 1, "p1": 4, "timestamp": "...", "file": ".impeccable/critique/..." },
  "design_contract": { "found": true, "file": "src/routes/+page.svelte", "seed": "a1b2c3d4", "recorded_on": 152 }
}
```

`design_contract` is built from Step 3.6 and is **omitted entirely** whenever that step's parse
returned No-contract or Malformed — the two cases are one absence to a caller, and neither is an
error. `seed` is omitted when the contract carried none; `recorded_on` is omitted when there was no
record to write to, or when the value was already present and unchanged. The `blocks` themselves are
deliberately **not** in the return: `/claude-tweaks:demo` re-reads them from the shipped artifact at
acceptance time (`../../_shared/design-contract.md`), so passing a copy through here would create a
second, staler source of the same text.

`prior_critique` is built from Step 3.5 and is omitted entirely when Layer 0 did not resolve or reported `critique.latest: null`. It is passed through verbatim from `gatherSignals()` — see `../impeccable-plugin.md`'s field reference for its shape and for the fields that can be `null`. Its `score` is on Impeccable's own scale, deliberately not the `/40` of `score_trend.critique`.

`score_trend` is built from Step 4.5. A score type's key (`critique` or `audit`) is omitted entirely from `score_trend` if that command's Total row didn't parse this run (Step 4). If **neither** score parsed, omit `score_trend` entirely from the output — same pattern as other inapplicable fields elsewhere in this contract.

`result: advisory` signals the findings inform the review verdict but do not auto-modify code. The `polish` mode (invoked separately by `/flow`) is the code-modifying counterpart that consumes the cached audit findings to drive suggestion-driven dispatch. Each cached finding's `suggestion` field is what selects the command there, so preserve it verbatim when writing the cache — dropping it turns a dispatchable finding into an unclassified observation.
