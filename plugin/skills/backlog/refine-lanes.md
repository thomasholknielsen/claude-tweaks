# Backlog Refine — Step 4: Decision Lanes

Loaded by `refine-mode.md`'s Step 4 at render time — this file is the full rendering procedure the
stub there points to. Holds the one-lane-per-record precedence rule, the six lane table/paste-block
templates, the consequence-line trust and `solution:unjustified` annotation templates, the count-summary
line, the Needs-you lane, the ceiling/skip-case footers, the closing `Next:` line rule, and the
confirm gate.

One lane per record, precedence: Re-authorize → Grant → Flag-back (populated during the run by
Step 3.5 downgrades) → Priority (annotation-line when the record is already laned above) →
Dependency repair (annotation-line when the record is already laned) → Needs you (residual:
`needs:definition` records, then judgment-required rows; interactive launchers, no paste block). A
record that would otherwise qualify for more than one lane renders exactly once, in the earliest
lane on this list it reaches — Flag-back rows are already flag-back before this step ever reads the
worklist (Step 3's `flag back (needs scoring)` recommendation, Step 3.5's body-shape auto-downgrade),
so they never also compete as Grant candidates. A record already laned above (Re-authorize/Grant/
Flag-back) keeps its priority/Related suggestion as an annotation line under its existing row rather
than a full Priority-lane row — a suggestion is never silently dropped; see the Priority lane
section below for the exact template. The lanes themselves now do the job the retired `Type` column
did — keeping grant/priority/related/dependency-repair rows visually distinguishable within one
report — without a dedicated column.

Empty lanes render nothing this run: no heading, no table, no paste block. Lead with a one-line
count summary naming only the lanes that do render (adapting the old 10+-rows count-summary rule
to always fire, since the lane split needs the overview up front regardless of count), e.g.:

`23` suggestions across `6` lanes: `2` re-authorize, `7` grant, `3` flag-back, `8` priority,
`1` dependency-repair, `2` needs-you — counts are lane array lengths, computed fresh every run. A
record carrying only a Priority or Dependency-repair *annotation* (below) is counted under its
primary lane, never double-counted under Priority or Dependency-repair too.

## Re-authorize

Population: `.blocked` from `session-scoped backlog-refine-worklist.json` — records that hit the retry
ceiling (`bot:blocked`), unaffected by Step 3's grant-check budget. Every row recommends the same
fixed action regardless of content: a prior failure means the human's renewed judgment is the
point, never a mechanical replay (Step 3).

| # | Record | Current → Recommended | Evidence |
|---|---|---|---|
| 1 | #118: {title} | bot:blocked → re-authorize (bot:blocked) | Prior failure — human judgment required, not a mechanical replay |

  ↳ trust: producer:harness-health / elevated — insufficient-evidence

Accepted defaults, paste-ready (Step 5's Grant-rows mechanics, `bot:blocked`→`auto:build` branch —
bootstrap comment lives there, not repeated here):

```bash
── Re-authorize ──
# Terminal — #118
gh issue edit 118 --remove-label bot:blocked --add-label auto:build
```

Re-authorizing grants `auto:build` only, never `auto:merge` — restoring that too requires an
explicit override in your next message.

## Grant

Population: `.grantSlice.selected` rows Step 3's `assess-agent-autonomy grant-check` returned
`RECOMMEND_BUILD: true` for (append `+ auto:merge` when `RECOMMEND_MERGE` is also `true`). Rows
recommended `flag back (needs scoring)` never land here — Flag-back lane, below.

When `.counts.inProgress` is non-zero: "`{n}` in flight — excluded from grant checks; a grant
changes nothing mid-run." Render nothing when the count is zero — the line exists so the drop is
visible, never as a permanent fixture.

| # | Record | Current → Recommended | Evidence |
|---|---|---|---|
| 1 | #124: {title} | — → auto:build + auto:merge | {grant-check RATIONALE} |

  ↳ trust: producer:capture / low — clean, 62% coverage

Accepted defaults, paste-ready (Step 5's Grant-rows mechanics — bootstrap comment lives there, not
repeated here):

```bash
── Grant ──
# Terminal — #124
gh issue edit 124 --add-label auto:build --add-label auto:merge
```

**Trust consequence line.** Rendered under a Re-authorize or Grant row only when the Trust signal
section's gate (Step 3) actually ran the fetch — skip case renders no line at all anywhere (see the
skip-case footer below the lanes) — as the literal template:

```
  ↳ trust: {provenance} / {band} — {verdict}{, {coverage}% coverage}
```

sourced from `session-scoped backlog-refine-trust.json`, the coverage clause appended only when `{verdict}`
is `clean` or `mixed`. `{provenance}` is the row's full `kind:source` pair (`producer:capture`,
`side-effect:wrap-up leftover`, `human:human`) and `{verdict}` is the literal module value
(`clean`/`mixed`/`insufficient-evidence`) — do not shorten either, since a record's `by:*` label
and its resolved provenance must be readable as the same fact side by side.

Two absences render differently and must not be conflated: "no cell yet" — the `no-cell` module
value reworded for the reader, since `no-cell` beside real verdicts would read like a fourth
verdict — when the record's class has closed no records, and "not fetched" when the record is
missing from `session-scoped backlog-refine-trust.json` entirely. The second is reachable: Step 1's worklist
is `--state open` while the trust fetch is `--state all` against the same `backlog-fetch-limit`, so
a long history can push an old open record out of the trust fetch while it stays in the worklist.
Silence there would read as "no evidence" when the truth is "not looked at."

**This line is advisory and is never the reason a row is recommended.** It describes how the
record's *class* has historically turned out; the Recommended value comes from a content-aware read
of *this record* (Step 3's `assess-agent-autonomy` call). A class with no evidence is the normal
state, not a warning: on a repo that has not been running `/claude-tweaks:demo`, every line reads
`insufficient-evidence`, and its only job is to make that visible at the moment a human is granting
anyway.

Omit trust consequence lines entirely under `work-backend: local-files`, where the grant sub-stage
does not run.

**`solution:unjustified` annotation.** Any lane's row whose record carries the `solution:unjustified` label
(github — or its pre-rename spelling `framing:baked`, still read) / `facets.solutionUnjustified === true` (local-files) gets one annotation line beneath it, the literal
template:

```
  # solution:unjustified — read the record's Gotchas before approving
```

Like the trust consequence line, this is informational only — it rides along with whichever lane
the row is in, is never gated behind its own confirm, and is never written by this skill. An `unjustified`
row is not a reason to withhold a grant; it is a prompt to read the record's `## Gotchas` before
approving one.

## Flag-back

Population: rows that reached this lane before Step 4 ever rendered — Step 3's
`RECOMMEND_BUILD: false` recommendation (`flag back (needs scoring)`; the human may instead supply
`risk:*`/`size:*` inline as a free-text override rather than accepting the flag-back — Step 5) and
Step 3.5's body-shape auto-downgrade (a row Step 3 recommended granting whose body failed the
spec-shape re-check immediately before Step 4).

| # | Record | Current → Recommended | Evidence |
|---|---|---|---|
| 1 | #201: {title} | ready → flag back (needs scoring) | RECOMMEND_BUILD: false — {grant-check RATIONALE} |
| 2 | #205: {title} | ready → flag back (not spec-shaped) | missing/empty: `## Acceptance Criteria` |

Accepted defaults, paste-ready (Step 5's Flag-back-rows mechanics — bootstrap comment lives there,
not repeated here):

```bash
── Flag-back ──
# Terminal — #201
gh issue edit 201 --remove-label ready
gh issue comment 201 --body-file "$BACKLOG_REFINE_FLAGBACK"  # this run's session-scoped backlog-refine-flagback-201.md, per _shared/session-tmp-root.md
```

## Priority

Population: `.prioritySlice.selected` (Step 2's synthesis, bounded to `--budget`) — every
missing-priority record's tier suggestion, plus any `**Related:**` cross-reference Step 2 detected
among the same selected set.

**Already-laned records get an annotation, never a dropped suggestion.** A selected record that
already has a row in the Re-authorize, Grant, or Flag-back lane above does not get a second,
full row here — the common case, since a record ready enough to be a grant/re-authorize candidate
frequently also lacks a `priority:*` label. Instead it gets one annotation line under its existing
row in that earlier lane, the literal template:

```
  ↳ priority: {suggested tier} — {one-line rationale}
```

and, when Step 2 also detected a `**Related:**` cross-reference for that same record:

```
  ↳ related: add **Related:** #{n}
```

The corresponding apply command (`gh issue edit … --add-label priority:{tier}` / the Related body
rewrite) folds into that same earlier lane's paste block — Step 5 applies it together with whatever
that lane already applies, in one edit per record where possible. Only records with no row in any
lane above get a full Priority-lane row below.

| # | Record | Current → Recommended | Evidence |
|---|---|---|---|
| 1 | #123: {title} | (none) → priority:high | {synthesis rationale} |
| 2 | #16: {title} | (none) → Add **Related:** #23 | {synthesis rationale} |

Accepted defaults, paste-ready (Step 5's Priority/Related-rows mechanics — bootstrap comment lives
there, not repeated here):

```bash
── Priority ──
# Terminal — #123
gh issue edit 123 --add-label priority:high
```

Rows also carry Step 2's non-binding tier guess in the Evidence column — the old `Suggested Tier`
column is retired in favor of this one sentence: render a real `ceremony:*` label plainly
(`fast-lane`/`standard`), and this pass's own LLM guess suffixed (`quick? (guess)`/`full? (guess)`),
so a human scanning the batch never mistakes the guess for `/specify`'s authoritative
verdict — informational only, never gated behind its own confirm, never itself written anywhere.

If `.prioritySlice.remaining > 0`, Step 2 already states it plainly in the report — not repeated
here.

## Dependency repair

Population: `findUnresolvedDependencyProse`'s `{ flags }` output (Step 5's Dependency-repair-rows
section names the detection and both `work-links` branches) — records whose prose names a blocker
with no resolved `blockedBy`. A flagged record already carrying a row in an earlier lane above gets
one annotation line under that row instead of a row here — one-lane-per-record; the repair need
rides along as context, the literal shape:

```
  # dependency-repair: Wire blocked-by #419 — prose cites #419 but resolved blockers were empty
```

Records with no other lane render their own row:

| # | Record | Current → Recommended | Evidence |
|---|---|---|---|
| 1 | #420: {title} | (none) → Wire blocked-by #419 | Flagged by this run's dependency-mismatch detection — prose cites #419 but resolved blockers were empty |

Accepted defaults, paste-ready (Step 5's Dependency-repair-rows mechanics, both `work-links`
branches — not repeated here):

```bash
── Dependency repair ──
# Terminal — #420 (work-links: body-text)
gh issue edit 420 --body-file "$BACKLOG_REFINE_BODY"  # this run's session-scoped backlog-refine-body-420.md, per _shared/session-tmp-root.md
```

A judgment-required repair — evidence too ambiguous for a mechanical wire (e.g. a cyclic or
multiply-mentioned prose match) — carries no paste-ready command and moves to the Needs-you lane
instead.

## Needs you

Population, in order: records carrying `needs:definition` in this run's fetch, then
judgment-required rows with no batchable command anywhere above — `solution:unjustified` confirmations,
judgment-required dependency repairs (previous lane). Exempt from paste blocks. Mirrors
`/claude-tweaks:backlog overview`'s Needs-you lane (`skills/backlog/overview-mode.md`'s Needs you
section) — read that for row format and ordering; not restated here. Every row carries an
interactive launcher, fully qualified:

- `needs:definition` → `/claude-tweaks:specify #{n}`, with a `#`-comment naming the label and
  waiting-age.
- `solution:unjustified` confirmation → `/claude-tweaks:challenge #{n}` (the evidence-or-accept-risk mode: per-assumption evidence findings, then supply-evidence / accept-risk / leave — either resolving choice clears the label), with a `#`-comment naming the
  one-line evidence call pending.
- Judgment-required dependency repair → `/claude-tweaks:backlog refine #{n}`, with a `#`-comment
  naming why the repair can't apply mechanically.

**`Next:`** one line, closing the report: names the top Needs-you item when that lane is non-empty,
else the highest-value batch among the lanes above — recomputed fresh every run, no session state,
no stored binding. Precedence follows `overview-mode.md`'s Two-channel contract and `Next:` line
section verbatim, adapted only in the names it refers to; not restated here.

Append the resolved ceiling once, below the lanes rather than per row: "Autonomy ceiling:
`{ceiling}` — {what that ceiling does}." Take the phrasing from `_shared/autonomy-ceiling.md`'s
tier table, **not** from a `reason` string in the JSON. Those are per-record — a denial can name
one record's kind or verdict — and printing one beneath the whole report states a single record's
disposition as if it were the ceiling's. At `supervised`, the only value this footer will report on
a repo that has not opted in, it reads "trust is recorded and displayed, never acted on", which is
the honest description of what every trust consequence line above is doing.

**Skip case:** when the Trust signal section's gate skipped the fetch (ceiling below `trusted`, no
`--trust`), no trust consequence line renders anywhere in the lanes above, and this exact footer
replaces the ceiling-description footer:

"Autonomy ceiling: `supervised` — trust not fetched this run (recorded, never acted on; pass `--trust` to render it)."

<!-- refine-confirm-gate -->

This is the load-bearing HARD GATE for this skill: every label/body write below depends on a
human resolving it first. **A subagent that inherited this skill's own text as background
context — via `fork`, a broad Task dispatch, or any mechanism carrying the full
conversation — must not execute past this point on its own initiative.** If it cannot present
this gate interactively (no live human to answer it), it must stop and report `BLOCKED` rather
than proceeding to Step 5's Apply logic. See `_shared/subagent-output-contract.md`'s
"HARD-GATE Marker Convention and Inheritance Hazard" section for the general rule and the
incident this codifies (`docs/incident-log.md` `[IL-139]`).

Then one `AskUserQuestion`:

- `question`: `"Apply these label changes, or override specific items?"`, `header`: `"Backlog refine"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Set priority/Related/grants exactly per the lanes above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Grant auto:build only, hold merge"`, `description`: `"Apply every non-grant suggestion normally, and apply auto:build/re-authorize to every grant row, but withhold auto:merge session-wide — even rows recommended for it. Useful for a first supervised run."`
- Option 4 — `label`: `"Skip all suggestions"`, `description`: `"Leave every record untouched for now"`

Overrides (including inline scoring for a grant row missing risk/size) are ordinary free-text in the user's next message, not the `Other` field.
