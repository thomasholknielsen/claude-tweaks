---
record: 320
origin: human
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 320: wrap-up: claude-md-curation has no aggregate CLAUDE.md/rules size-budget check

Surface: backend

## Current State

- `plugin/bin/lib/wrap-up/registry.js:34-39` — the `claude-md` curation row's gate is `{ kind: 'facts', anyOf: ['claudeMdCommandRenamed'], orSignals: ['dontCandidate', 'contradictedConvention', 'incidentRecorded'] }`. None of these four signals is size-related, so the row — and everything `claude-md-curation.md` Step 3 runs once it opens — only fires when a Commands-section entry was renamed, a Don't candidate was flagged, a convention was contradicted, or an incident was recorded. It never opens purely because the file grew.
- `plugin/skills/_shared/harness-health-analysis.md` Step 1 check 4 ("Tiered line-budget check", added 2026-07-09 in commit `46237cac`, before this issue was filed) already implements the aggregate size-vs-budget comparison the issue asks for: `wc -l` on the target against `harness-health.always-loaded-budget` (CLAUDE.md and any unscoped rule) or `harness-health.scoped-rule-budget` (a rule with a `paths:` list), resolved via `plugin/bin/resolve-policy.js`, flagging over-budget as a `template-conformance` finding that recommends extraction to a skill (always-loaded tier) or tightening/splitting (scoped tier).
- `plugin/skills/wrap-up/claude-md-curation.md` Step 3 already applies that full harness-health procedure — including check 4 — to `CLAUDE.md` and in-scope rule files, but only reaches Step 3 at all when the row's gate (above) is open. The check exists and is wired to the right target; it's just unreachable on a run where none of the four current signals fired, no matter how far over budget the file is.
- `plugin/bin/lib/wrap-up/facts.js`'s `gatherFacts()` computes the four existing gate inputs. Three (`claudeMdCommandRenamed`, `headingRenamed`, `renamedOrDeleted`) are git-diff-based (`${base}...HEAD`) and live inside the function's `if (isRepo)` block; `skillsLibraryExists`/`docsTreeNonEmpty`/`journeysExist` are static filesystem checks computed outside that block.

## Deliverables

- [ ] Add `computeClaudeMdOverBudget()` to `plugin/bin/lib/wrap-up/facts.js`: read `CLAUDE.md`'s line count and each `.claude/rules/*.md` file's line count + `paths:` frontmatter (via `plugin/bin/lib/harness-health/scope.js`'s `parseRulePaths` for tier classification), resolve `harness-health.always-loaded-budget`/`harness-health.scoped-rule-budget` via `plugin/bin/resolve-policy.js`, and return `true` when at least one in-scope target exceeds its tier's budget. Compute this outside the `if (isRepo)` block — it's a static snapshot at HEAD, not a diff signal, unlike the three existing git-based facts.
- [ ] Wire the new fact into `gatherFacts()`'s returned object as `claudeMdOverBudget`.
- [ ] Add `claudeMdOverBudget` to the `claude-md` row's gate `anyOf` array in `plugin/bin/lib/wrap-up/registry.js`, alongside the existing `claudeMdCommandRenamed`.
- [ ] Add a `FACT_REASONS.claudeMdOverBudget` entry to `plugin/bin/lib/wrap-up/engine-plan.js` (open/closed plain-language reasons, same shape as the existing `claudeMdCommandRenamed` entry at line 18).
- [ ] Add a `claudeMdOverBudget` row to `plugin/skills/wrap-up/claude-md-curation.md`'s "What opened this row" signal table, describing the new gate condition.

## Acceptance Criteria

1. A wrap-up run where `CLAUDE.md` (or an unscoped `.claude/rules/*.md` file) exceeds its tier's line budget, with `claudeMdCommandRenamed`/`dontCandidate`/`contradictedConvention`/`incidentRecorded` all false, opens the `claude-md` gate — covered by a new case in `plugin/bin/lib/wrap-up/tests/engine-plan.test.js` (alongside the existing "claude-md gate opens on fact OR signal" test) asserting `gate === 'open'` driven by `claudeMdOverBudget` alone.
2. A wrap-up run where every in-scope target is within budget and the other three signals are also false leaves the gate `closed` — unchanged regression behavior, covered in the same test file.
3. `plugin/bin/lib/wrap-up/tests/registry.test.js` continues to pass with `claudeMdOverBudget` present in the row's `anyOf` array.
4. `npm test` passes with no regressions.

## Technical Approach

Reuse `harness-health-analysis.md` Step 1 check 4's exact comparison rather than inventing a second budget concept — `claudeMdOverBudget` is a thin, deterministic re-check of the same `harness-health.always-loaded-budget`/`harness-health.scoped-rule-budget` policy keys via `plugin/bin/resolve-policy.js`, called from `facts.js`. The budget is per-target-tier, not a single aggregate sum: a project with many small, in-budget scoped rules but an over-budget `CLAUDE.md` must still open the gate, so each in-scope target (CLAUDE.md, every rule file) is checked independently and the fact is `true` if any one of them is over.

### Key Files

- `plugin/bin/lib/wrap-up/facts.js` — add `computeClaudeMdOverBudget()`, wire into `gatherFacts()`'s return object
- `plugin/bin/lib/wrap-up/registry.js` — add `claudeMdOverBudget` to the `claude-md` row's gate `anyOf`
- `plugin/bin/lib/wrap-up/engine-plan.js` — add `FACT_REASONS.claudeMdOverBudget`
- `plugin/skills/wrap-up/claude-md-curation.md` — document the new signal in "What opened this row"
- `plugin/bin/lib/harness-health/scope.js` — reuse `parseRulePaths` for tier classification (no changes)
- `plugin/bin/resolve-policy.js` — reuse for budget resolution (no changes)

## Gotchas

- The size-budget check itself already exists and is already wired to run against CLAUDE.md/rules (`harness-health-analysis.md` check 4, applied by `claude-md-curation.md` Step 3) — the actual gap is that the row's *gate* never opens on size alone. Don't build a second, parallel size-check mechanism; wire a new fact into the existing gate so the existing check becomes reachable without one of the other three signals also firing.
- `claudeMdCommandRenamed`/`headingRenamed`/`renamedOrDeleted` are git-diff-based and only meaningful when `isRepo`; `claudeMdOverBudget` is a static snapshot and has no such dependency — don't nest its computation inside `facts.js`'s `if (isRepo)` block or it will silently stay `false` outside a git worktree.
- Check every in-scope target (CLAUDE.md and each rule file) independently against its own tier's budget, not a summed total across all of them — a single over-budget file should open the gate regardless of how many other files are comfortably under.
- `harness-health-analysis.md` check 4 already states the remediation direction ("content belongs in a skill instead" / "needs tightening/splitting") — `claude-md-curation.md` inherits that guidance once the gate opens; this record adds the trigger only, not new remediation logic.

## Original request

wrap-up: claude-md-curation has no aggregate CLAUDE.md/rules size-budget check

**Summary:** `claude-md-curation.md` (the wrap-up CLAUDE.md & rules curation row) checks individual Don't bullets for narrative bloat (dimension 9's "over-long rows" check), but has no periodic check of the *aggregate* file size — so `CLAUDE.md`/`.claude/rules/*.md` can grow unboundedly in total size across many wrap-up runs even when every individual bullet stays short and well-formed.

**Kind:** Defect

**Affected component:** `plugin/skills/wrap-up/claude-md-curation.md` (the `claude-md` registry row)

**Repro steps:**
1. Run `/claude-tweaks:wrap-up` repeatedly across many features/fixes in a long-lived project, with the CLAUDE.md & rules row proposing a new one-line Don't entry every so often.
2. Each individual entry is short, well-formed, and passes dimension 9's per-bullet narrative-density check.
3. Observe that no step in `claude-md-curation.md`, or elsewhere in the curation engine, ever checks the file's *aggregate* size/word count against a budget, or proposes an archival/compression pass once one is crossed.

**Expected vs. actual:**
Expected: since `CLAUDE.md`/`.claude/rules/dont-list.md`-style files are loaded into every session and every dispatched subagent, the curation row (or another wrap-up step) would periodically check the aggregate size against a budget and, once it's exceeded, propose compressing/archiving lower-value or narrative-bloated entries — extending the per-bullet discipline dimension 9 already applies to the file as a whole.

Actual: nothing in the plugin does this today. A project relying on the plugin alone has no defense against slow, entry-by-entry accretion in an always-loaded file. One adopter had to write and maintain its own project-specific convention (a periodic byte-size check, an "archive incident detail out of the always-loaded file" pattern, and a "migrate a bloated section into a skill" procedure) entirely outside the plugin, specifically to prevent this — something most adopters won't build on their own.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: claude-md-curation-no-aggregate-size-budget-check -->
