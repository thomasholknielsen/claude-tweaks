# assess-agent-autonomy — Design

**Goal:** Replace the mechanical, label-only scoring that currently drives triage's grant
recommendation and dispatch's auto-merge/failure-handling decisions with content-aware judgment,
without weakening the human-confirmation boundary anywhere it currently exists.

**Architecture:** A new inline-invoked skill, `/claude-tweaks:assess-agent-autonomy`, with three
modes (`grant-check`, `merge-check`, `failure-check`) called from `/claude-tweaks:triage` and
`/claude-tweaks:dispatch` respectively. A new pure module, `bin/lib/issues/blast-radius.js`,
supplies the one genuinely mechanical input (test-exclusion-aware diff size) the skill consumes.

**Tech Stack:** Markdown skill file (prose procedure), Node.js pure module (`bin/lib/issues/`,
tested via `node --test`), no new dependencies.

## Motivation

Two real dispatch firings (#18, #19 — the first two records ever run through the unified
work-record model's authorization queue) surfaced two concrete, evidence-backed problems with
today's mechanical scoring:

1. **The auto-merge blast-radius cap counts test lines the same as implementation lines.** #18
   was a genuinely clean, low-risk, well-tested 2-file change — `bin/lib/issues/grouping.js`
   (33 lines) plus its test (39 lines) — that tripped `automerge-max-lines: 40` at a combined 72
   lines and fell back to a human-reviewed PR, even though the implementation alone was well
   under the cap and review found zero findings at any severity.
2. **Any failed run permanently revokes `auto:merge`, regardless of why it failed.** A transient
   `gh` API error or a known-flaky test (this repo already has one documented flake,
   `statusline.test.js`'s timing assertion) costs a record its merge trust exactly as harshly as
   a genuine correctness bug would — punishing the record for infrastructure noise that was
   never its fault.

Both problems share a root cause: the existing gates (`automerge-max-lines`/`files`,
`recommendGrants`'s risk/effort lookup, "any failure revokes merge") are proxies for a question
they were never actually answering directly — *is this safe to trust autonomously* — and proxies
built on diff size or label pairs alone can't see the content that would make the real answer
obvious to a human reviewer glancing at the same diff.

## Non-Goals

- **Not** a system-wide risk-assessment service. Scoped to exactly the decision points
  `/claude-tweaks:triage` and `/claude-tweaks:dispatch` already own; not reachable from
  `/claude-tweaks:review`'s own lenses or any other skill in this pass.
- **Not** a self-tuning calibration loop that durably logs outcomes and proposes threshold
  changes over time. That was the original shape of this brainstorm's first topic and was
  explicitly set aside in favor of this design — judgment replacing the mechanical thresholds
  directly, not a system that learns to re-tune them. Revisit the calibration-loop idea
  separately if real evidence later suggests `assess-agent-autonomy`'s own judgment needs tuning.
- **Not** a change to who may grant `auto:build`/`auto:merge`. Every grant is still added only by
  an interactive human session at `/claude-tweaks:triage` — this design changes what triage
  *recommends*, never who confirms it or what confirming it means.
- **Not** a change to `dispatch-retry-ceiling`'s counting. A `transient`-classified failure still
  costs an attempt toward the ceiling; classification only affects whether `auto:merge` is
  additionally stripped and whether a human is notified early.

## Architecture

### `bin/lib/issues/blast-radius.js` (new, pure, tested)

The one genuinely mechanical piece — everything else in this design requires reading content,
this doesn't.

- `classifyDiffFiles(files, sensitivePaths)` — given a diff's file list and the project's
  `merge-sensitive-paths` config, returns `[{path, isTest, isSensitive, additions, deletions}]`
  per file. `isTest` follows this repo's own existing convention (path contains a `tests/`
  directory segment, or the filename ends `.test.js`) — the same heuristic already implicit in
  every `bin/lib/issues/tests/*.test.js` path in this codebase.
- `blastRadiusSummary(classifiedFiles)` — reduces the classified list to
  `{implLines, testLines, implFiles, testFiles, sensitiveFilesTouched}`.

### New config key: `merge-sensitive-paths`

Read from CLAUDE.md/`.claude-tweaks/policy.yml`, a list of path globs. **Defaults to an empty
list** — this plugin is project-agnostic by construction (the same principle the hooks system
already follows: keys off plugin-owned state, never assumed project structure), so no generic
default can guess what's structurally sensitive in an arbitrary installed project. This repo
would populate its own list as part of adopting this design (`bin/hooks.js`, `skills/_shared/*.md`,
`.claude-tweaks/policy.yml`, `package.json`, `.claude-plugin/plugin.json`).

A sensitive-path hit is a **hard floor**: `merge-check` always returns `needs-human` when any
touched file matches, regardless of what the skill's own content judgment would otherwise
conclude. No override.

### `automerge-max-lines`/`automerge-max-files` — role change, not removal

These two existing config keys stop being a hard pass/fail gate (that was the mechanism that
missed #18) but aren't orphaned either: `merge-check` is told the project's configured values
alongside the actual `blastRadiusSummary` counts, as one weighted input among several rather than
a cutoff. A project that wants to express "prefer smaller unsupervised merges" still can, by
setting these lower — `merge-check`'s judgment treats a diff further past the configured guideline
as a reason to lean more conservative, not as an automatic disqualifier the way the old layer 4
did. This keeps existing project configs meaningful instead of silently unused.

### `/claude-tweaks:assess-agent-autonomy` (new skill)

Invoked **inline** via the Skill tool — not as a fresh Task-agent dispatch. By the time any of
its three call sites need a verdict, the calling agent (dispatch's per-group Task agent running
`/flow`, or a human-driven `/triage` session) already has the diff and review findings in reach;
a subagent restart would only pay to re-derive context that already exists. This matches the
existing inline-invocation pattern `/claude-tweaks:simplify` and `/claude-tweaks:deepen` already
use, not the parallel Task-dispatch pattern `/claude-tweaks:review`'s lenses use (which exists
specifically for parallelism this skill doesn't need).

#### Mode: `grant-check`

**Called from:** `/claude-tweaks:triage`'s Step 2 (Recommend), once per worklist record, every
triage session — no pre-filtering to "borderline" records, matching the same
don't-trust-a-mechanical-pre-filter reasoning as `merge-check` below.

**Input:** the record's full body (Current State / Deliverables / Acceptance Criteria) plus its
current `risk:*`/`effort:*` labels (via the existing colon-form reader — see Retirements).

**Output:**
```
RECOMMEND_BUILD: true | false
RECOMMEND_MERGE: true | false
RATIONALE: {one paragraph}
```

This becomes the batch table's "Recommended" column directly — not a flag layered on top of a
separate mechanical recommendation. The human still confirms or overrides every row exactly as
today; only what generates the suggestion changes.

**Calibration examples:**
- A record labeled `risk:low`/`effort:low` whose Deliverables section explicitly describes
  touching authentication or session logic → `RECOMMEND_MERGE: false`, rationale names the
  mismatch between the label and the described change — even though the mechanical labels alone
  would have recommended both grants.
- A record labeled `risk:medium`/`effort:low` that turns out to be a pure documentation
  correction with no behavioral surface at all → can recommend more generously than the label
  alone implies. This isn't a one-directional tightening; the goal is accuracy, not blanket
  caution.

#### Mode: `merge-check`

**Called from:** `/claude-tweaks:dispatch`'s Auto-merge gate, **replacing layers 2-4 entirely**
(scoring eligibility, runtime cleanliness, blast radius were three independent mechanical checks
standing in for one real question). Layer 1 (authorization — a human granted `auto:merge`) is
unchanged, still a hard binary gate.

**Input:** the diff, `/claude-tweaks:review`'s findings/verdict from this same run, the
`blastRadiusSummary` from `bin/lib/issues/blast-radius.js`, the project's configured
`automerge-max-lines`/`automerge-max-files` values (weighted input, not a cutoff — see above),
and the record's scoring labels.

**Output:**
```
VERDICT: auto-merge | needs-human
RATIONALE: {one paragraph}
```

**Calibration examples:**
- #18's actual diff (33 impl lines, 39 test lines excluded from the blast-radius count, zero
  review findings, no sensitive-path overlap) → `auto-merge`. This is the concrete case this
  design exists to fix.
- A diff under any reasonable size that touches a path in `merge-sensitive-paths` → `needs-human`,
  unconditionally (the hard floor, not a judgment call).
- A diff that creates or substantially edits a `skills/**/*.md` file → `needs-human`, regardless
  of line count. This generalizes and replaces the previous `harness-health:new-skill`-specific
  hard-coded exclusion (see Retirements) — a new or changed skill file encodes instructions
  future agents will follow, which is high-leverage independent of how small the diff looks.
- A diff that's small and passes review clean, but touches unfamiliar or structurally sensitive
  logic even outside the configured sensitive-paths list (concurrency, locking, auth, external
  API calls) → weigh this as elevated risk from the diff's own content, not just its size.

#### Mode: `failure-check`

**Called from:** `/claude-tweaks:dispatch`'s Settle step, **replacing** "any failed run
unconditionally revokes `auto:merge`."

**Input:** the failure output/logs from the failed gate, and this record's retry history (via
`bin/lib/issues/retry.js`'s `countFailedAttempts`).

**Output:**
```
CLASSIFICATION: correctness | transient | ambiguous
NOTIFY_NOW: true | false
RATIONALE: {one paragraph}
```

- `correctness` → revoke `auto:merge` (today's behavior, unchanged for this class).
- `transient` → **preserve** `auto:merge` — this is the new, less conservative behavior. The
  attempt still counts toward `dispatch-retry-ceiling` regardless of classification; only the
  merge-trust decision changes.
- `ambiguous` → default to `correctness`'s conservative handling. When the classifier can't tell,
  it errs toward the existing safe behavior rather than the new permissive one.

**Calibration examples:**
- Transient: `gh api` rate-limit (429) responses, network timeouts, `ECONNREFUSED`, or a failure
  in this repo's own already-documented flaky test (`statusline.test.js`'s render-timing
  assertion — a pre-existing, known flake, not a new signal to detect from scratch).
- Correctness: a test failure showing an assertion mismatch directly tied to the record's own
  changed logic (expected/actual values diverging in code the record touched).
- `NOTIFY_NOW: true`: the *same* correctness-class failure recurring verbatim across two or more
  consecutive attempts — a signal the agent may be stuck rather than making incremental progress,
  worth a human's attention before the retry ceiling would otherwise surface it.

### Hand-off contract

`/claude-tweaks:assess-agent-autonomy` does not write to `decisions.md` itself and does not know
about run-dir resolution — that stays the responsibility of whichever skill acts on its verdict
(`/claude-tweaks:dispatch` or `/claude-tweaks:triage`), matching how every other auto-decision log
entry in this codebase is written by the skill taking the action, not by a helper it calls.

## Retirements

Confirmed via a direct query against this repo's full issue history (`gh issue list --state
all`), not assumed:

- **`recommendGrants`/`recommendTier`** (`bin/lib/issues/tier.js`) — deleted once
  `grant-check` replaces their only caller (triage's Step 2). No fallback path is kept: triage's
  existing human-confirmation gate already covers the low-probability, low-consequence case of a
  missing recommendation on a single row, so a parallel mechanical system standing by "just in
  case" would be unused-until-a-rare-failure complexity with no real safety payoff.
- **Legacy label-vocabulary adapters** in `extractRiskEffort`
  (`extractCodeHealthRiskEffort`, `extractBareHyphenRiskEffort`, `extractHarnessHealthRiskEffort`)
  — deleted. A repo-wide query confirmed zero issues, open or closed, in this repository's entire
  history carry any of the legacy forms these adapters exist to parse
  (`code-health:risk-*`/`effort-*`, bare `risk-*`/`effort-*`, `harness-health:additive`/
  `restructural`). Only the canonical colon form has ever actually been used here.
- **Canonical colon-form extraction** (`extractColonRiskEffort`) — kept. `grant-check` still
  needs to know a record's current `risk:*`/`effort:*` labels as one input alongside the body
  content; this is the one piece of the old mechanism that isn't dead weight.
- **`harness-health:new-skill` never-merge-eligible rule** — retired as a hard-coded special
  case, folded into `merge-check`'s calibration guidance (see above) as the general
  "`skills/**/*.md` changes are high-leverage regardless of size" rule instead. This is a
  generalization, not a loosening — the underlying behavior (new-skill proposals essentially
  never auto-merge) should hold under the new mechanism precisely because it's now judged on the
  actual reason it's risky, not a label side-effect that happened to encode the same conclusion.

## Testing

- `blast-radius.js` — ordinary pure-function tests against fixture file lists, same shape as
  every other `bin/lib/issues/tests/*.test.js` file in this codebase.
- `tier.js` — existing tests for the retired functions and legacy-form adapters are deleted
  alongside the code they cover; tests for the surviving colon-form extraction stay.
- `/claude-tweaks:assess-agent-autonomy`'s own judgment isn't unit-testable in the traditional
  sense (it's LLM reasoning, not a pure function), so the calibration examples above are written
  into the skill file itself as anchoring reference points — the same role
  `_shared/criteria-review-quality.md`'s severity-floor table plays for `/claude-tweaks:review`'s
  own judgment calls.

## Error Handling

If `assess-agent-autonomy` cannot render a clear verdict for any reason, every mode defaults to
its more conservative outcome: `grant-check` → no recommendation (falls through to the human
deciding fresh, same as today's "flag back" rows); `merge-check` → `needs-human`; `failure-check`
→ `correctness` (revoke merge trust). Ambiguity never resolves toward more autonomy on an error
path — the asymmetry matters here specifically because a missed auto-merge only costs a human a
click, while a wrongly-granted one could ship something bad.

## Known Touch Points (not exhaustive — writing-plans owns the precise file-by-file breakdown)

- New: `skills/assess-agent-autonomy/SKILL.md`, `bin/lib/issues/blast-radius.js`,
  `bin/lib/issues/tests/blast-radius.test.js`
- Modified: `bin/lib/issues/tier.js`, `bin/lib/issues/tests/tier.test.js`,
  `skills/dispatch/SKILL.md` (Auto-merge gate + Settle step), `skills/triage/SKILL.md` (Step 2),
  `skills/_shared/work-record.md` (config-keys table gains `merge-sensitive-paths`),
  `skills/harness-health/SKILL.md` (if it documents the retired new-skill rule independently of
  `tier.js`'s comments — needs verification during planning, not assumed here)
- Documentation: README.md / `skills/help/reference-card.md` skill count and catalog entry
  (29 → 30 skills), per this project's own "update README/help when adding skills" convention.
