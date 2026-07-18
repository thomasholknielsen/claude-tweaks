# Health Filing Gate — Canonical Ask-Before-File Rule

`code-health`, `harness-health`, `journey-health`, and `docs-health` each end their SELECT → JUDGE → VALIDATE/DEDUP → FILE pipeline with an interactive decision over which surviving findings actually become GitHub issues. This file is the one place that decision's *applicability*, *scope*, and *placement* are defined — consumers still write out their own batch-table columns and `AskUserQuestion` option blocks in full inline (a skill file must be self-contained for whichever session reads it), matching the canonical menu shape below.

## Applicability

Interactive (standalone) mode only. A headless Routine firing has no human present to ask — it skips this gate entirely and files every surviving finding automatically, per each skill's own Routine Configuration section.

## Scope

The gate applies only to *this firing's own brand-new findings* — the payloads surviving the verify gate and dedup that are about to be created for the first time. It does **not** re-prompt for:

- **Retry-queue drains** — a prior firing's filing that failed and is now being retried. It was already approved in that earlier firing; retrying a transient `gh` failure isn't a new proposal.
- **Regressed reopens** — an existing issue whose finding has reappeared. Reopening isn't creating anything new.

Both categories file/reopen unconditionally, before this gate ever runs.

## Placement

The gate MUST execute **inside the calling skill's own FILE step** — after retry-queue-drain and regressed-reopen handling, and before the action that turns a surviving new finding into a `gh issue create` call. It must never live in a SUMMARIZE/reporting step: that step runs after filing, by definition, so a gate placed there can't gate anything.

**A subtler version of the same bug:** being inside the FILE step is necessary but not sufficient. Every consumer also documents a "Type expression branch" — reference syntax showing how to construct the `gh issue create` command for `work-types: native` vs. `work-types: labels`. That section's own connecting sentence ("Apply the same branch to every payload regardless of `{classification|kind|category}`...") reads as an unconditional execution instruction when an agent follows the file top-to-bottom, not as inert documentation — regardless of authorial intent. The gate must sit **before** that connecting sentence, with an explicit conditioning sentence between them ("For each survivor disposed as 'File issue' ... call `gh issue create`") that scopes "every payload" in the sentence that follows to mean "every surviving, gated payload," not "every payload in the full findings set." Positioning the gate merely somewhere inside the FILE step, without checking it precedes every such connecting sentence, reproduces the exact dead-gate bug this file exists to prevent — this happened once already: `code-health`, `harness-health`, and `docs-health` all needed this fix, and even `journey-health` — despite having its `AskUserQuestion` block correctly inside FILE rather than SUMMARIZE — still had its own Type-expression-branch's unconditional-sounding language (a line 211 that said outright "every finding files, unconditionally") sitting *before* the gate until this was caught and fixed. "Inside FILE, not SUMMARIZE" was necessary; "before the Type-expression-branch's own filing trigger" is the actual sufficient condition.

## Canonical menu shape

Every consumer renders its own batch table (columns matching its own Finding Shape, plus a `Recommended` column) and then calls `AskUserQuestion`:

- `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
  - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" is chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`:

- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:{skill} issue"`
- Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
- Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
- Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

Each consumer's own Recommended-column pre-fill rule uses whatever fields its own Finding Shape already computes. `code-health` keeps its existing `--min-risk`-driven severity×confidence rule (with a third fallback tier held in its `remembered` cache). `docs-health`, `harness-health`, and `journey-health` all use the same rule instead of inventing separate ones: pre-fill `"File issue"` when `confidence` is `high` or `med`, `"Capture"` when `confidence` is `low`.

"Dismiss" always runs the consumer's own `mark <id> declined` CLI command so the same proposal doesn't reappear on a future firing — except `code-health`, whose CLI has no `mark` subcommand; its "Dismiss" description stays `"Drop this finding"` since it has no persistent decline cache to write to.
