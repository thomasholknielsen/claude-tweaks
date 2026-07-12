# journey-health Tier Improvements — Design

## Context

journey-health shipped with a two-tier design (light: static checks; deep: interactive-only live verification) and a rotation-based selector (`scope.js`'s `selectTarget`, staleness-floor + churn-ranked). Reviewing that implementation surfaced three improvement opportunities, each grounded in reading the actual current code rather than assumed from the original design:

1. A journey whose declared file was deleted can go unaudited indefinitely if it's neither globally stale nor shows other churn (`git log` on a missing path silently returns 0 commits — indistinguishable from "nothing changed").
2. The deep tier always drives its own live verification, even when a recent `/claude-tweaks:test` run already exercised the same journey's stories and passed — duplicating real evidence that already exists.
3. Findings carry `confidence` (how sure the finding is real) but nothing captures *severity* (how bad it is if true) — the two are orthogonal, and only `confidence` exists today, so nothing distinguishes a cosmetic wording drift from a broken domain mapping at filing time.

A fourth candidate — making the routine's cron cadence dynamically self-adjusting — was investigated and dropped: routines are created via the `RemoteTrigger` API (not the session-local `CronCreate` tool), and self-rescheduling would require granting the routine `RemoteTrigger` access — real scope expansion for a report-only skill, working against this project's own design philosophy of keeping schedule mutation at the human-driven console. It also turned out to solve an already-solved problem: `SKILL.md` already treats a firing with nothing due as a cheap no-op (line 178). Not pursued further.

## A. Deletion force-select

**Current state (verified, not assumed):** `SKILL.md` Step 2's file-existence check already emits the correct finding (`category: "drift"`, `section: "files-frontmatter"`) — but only for whichever journey Step 1 happens to select. `scope.js`'s `selectTarget` has two selection phases: Phase 1 force-picks anything past the staleness floor (30 days light / 90 days deep); Phase 2 ranks remaining candidates by git churn on their `files:` frontmatter paths since last audit. Neither phase currently checks whether a declared file still exists. A journey with a deleted file that (a) was audited within the last 30 days and (b) has an otherwise-quiet `files:` list can sit unaudited past its actual drift indefinitely.

**Fix:** add a Phase 0 to `selectTarget`, gated to `tier === 'light'` only. `tier === 'deep'` is deliberately excluded: Step 3.5's existing "Skip condition" (line 81) already checks file existence *after* deep-tier selection and correctly skips without advancing the cursor — if Phase 0 also force-selected on the deep-tier's own `next-target --tier deep` call, it would force the deep tier onto the same broken journey on every firing until the light tier's finding gets fixed, starving every other journey's deep-tier rotation in the meantime.

```js
// Phase 0 (light tier only): force-pick any journey with a declared file that
// no longer exists. This is a stronger, more certain signal than staleness or
// churn, and requires no LLM judgment to detect — a plain existence check.
// Deep tier does not get this phase: its own post-selection "skip condition"
// already handles a broken journey without permanently parking the deep-tier
// rotation on it.
if (tier === 'light') {
  for (const candidate of candidates) {
    const missing = candidate.filesFrontmatter.filter(
      (relPath) => !fs.existsSync(path.join(root, relPath)),
    );
    if (missing.length > 0) {
      return { ...candidate, why: 'deleted-file', missingFiles: missing };
    }
  }
}
```

This runs before the existing Phase 1 (staleness). `SKILL.md` Step 1's `why` field documentation gains a fourth case: `why: "deleted-file"` — this journey has a `files:` entry that no longer exists on disk; takes priority over staleness and churn.

No `Finding Shape` changes — `category: "drift"`, `section: "files-frontmatter"` are already exactly what Step 2 emits once the journey is selected.

## B. Recent QA evidence can satisfy the deep tier

**Current state (verified):** Step 3.5 always resolves a target then unconditionally resolves a dev URL, drives `/claude-tweaks:test` or `/claude-tweaks:visual-review`, and judges drift-vs-regression on failure. `_shared/journey-coverage-check.md` already computes the journey↔story cross-reference (`journey:` field in story YAML) for `/review`'s coverage lens and journey-health's own coverage scan — the same mapping this feature needs. `/claude-tweaks:test`'s `report.json` (`skills/test/qa-reporting.md`) records, per run: `stories[]` with `{id, status: "PASS"|"PASS_WITH_CAVEATS"|"FAIL"|"SKIPPED"}`, and `findings[]` with `{story_id, category: "stale-selector"|"code-bug"|"ux-issue"|"flaky-env"|"story-bug", severity: "Low"|"Medium"|"High", finding, trace}`. `bin/journey-health.js`'s `recordAudit` call during `validate-findings` already passes an empty options object (`{}`) — the cursor `hash` field is null in every existing call, light or deep. This feature reuses that exact convention; it doesn't invent new cursor semantics.

**Fix:** insert a new sub-step at the start of Step 3.5, before "Resolve a dev URL":

1. Glob `screenshots/qa/*/report.json`, take the most recent whose `timestamp` is within `STALE_DAYS_DEEP` (90 days) of now.
2. If none found, or the target journey has no stories with `journey: {target.id}` at all (per the same cross-reference `_shared/journey-coverage-check.md` computes) — fall through to the existing live-verification path (sub-steps 1-4), unchanged.
3. Otherwise, look up each of the journey's story ids in that run's `stories[]`:
   - **Any story id absent from `stories[]` entirely, or present with status `SKIPPED`:** that story has no evidence in this run — inconclusive coverage. Fall through to the existing live-verification path. (Evaluate this case first, before the two below — it's not "a kind of failure," it's "no data.")
   - **All present with status `PASS` or `PASS_WITH_CAVEATS`:** the deep audit is satisfied by this evidence. Skip dev-URL resolution and the live test/visual-review drive entirely. Produce an empty deep-findings array. Continue to Step 4/5/6 exactly as today — `validate-findings --tier deep --target $DEEP_TARGET_ID` still runs (with `[]`), so `recordAudit(root, target.id, 'deep', {})` still fires and the deep cursor still advances, via the same call already in use.
   - **Any present with status `FAIL`**, and that story's `findings[]` entry has `category: "code-bug"` or `"ux-issue"`: emit `{ journey: target.id, category: "regression-suspected", section: "live-check", description: "<findings[].finding text>", reason: "QA run {report timestamp} recorded this failure for story {story_id}: <findings[].finding>", confidence: "high", severity: <mapped from findings[].severity: Low→low, Medium→med, High→high>, recommendation: "File as a product bug — QA evidence, not journey-health's own live verification, surfaced this" }`. No live re-verification — the QA evidence stands on its own.
   - **Any present with status `FAIL`** and `category: "stale-selector"|"flaky-env"|"story-bug"`: inconclusive — a QA-tooling problem, not evidence of journey drift or product regression. Fall through to the existing live-verification path.

`SKILL.md`'s existing sub-step 4 ("Clean up... if `SERVER_STARTED` is `true`") stays correct unmodified: `SERVER_STARTED` is never set to `true` on the QA-satisfied path, since dev-URL resolution never runs.

## C. Severity field

**Fix:** add `severity` to the Finding Shape everywhere a finding is constructed:

- `validate-finding.js`: add `'severity'` to `REQUIRED_STRINGS`, add `SEVERITY_VALUES = new Set(['high', 'med', 'low'])` with the same validation-branch pattern already used for `confidence`.
- Fingerprint basis is unchanged (`[journey, category, section, normalizeDescription(description)]`) — severity is metadata about the finding, not part of its identity, so re-filing the same underlying finding at a different severity must not mint a new fingerprint/issue.
- `issue-payload.js`: add `**Severity:** ${finding.severity}` to the body's metadata line, and append `journey-health:${finding.severity}` to `labels`.
- `SKILL.md` Step 6's label-ensure guard currently only ensures the category sub-label (`journey-health:<category>`) exists before filing — it needs a second guard for the severity sub-label (`journey-health:<severity>`).

**Severity-assignment guidance** — lives in `journey-health/SKILL.md` itself (Steps 2 and 3.5's finding-construction instructions), not in the shared `_shared/journey-self-review.md` fragment: severity is journey-health's own audit-time judgment call, not something `/journeys`' write-time authoring needs, so folding it into the shared fragment would repeat the exact "shared fragment leaks consumer-specific mechanics" mistake this project's own history already caught once during journey-health's original build.

| Finding source | Severity rule |
|---|---|
| Deletion detection (files-frontmatter, Phase 0-selected) | Always `high` — a broken domain mapping is never low-severity. |
| Self-review: structural-validity failure (missing frontmatter, no `## Steps`, no steps) | `high` |
| Self-review: other check failure (persona, origin coverage, outcome clarity) | `med` |
| Self-review: cosmetic wording drift | `low` |
| Coverage: journey has zero story coverage | `high` |
| Coverage: partial gap | `med` |
| Coverage: single-step gap, or orphaned-story-with-URL-match suggestion | `low` |
| Regression-suspected (live-check, Step 3.5) | Judge same as self-review guidance (no external evidence to mirror) |
| Regression-suspected (QA-evidence-derived, section B above) | Mirror the QA report's own `findings[].severity` (Low→low, Medium→med, High→high) |

## Out of scope

- Dynamic cron rescheduling (investigated, dropped — see Context).
- Any change to `_shared/journey-self-review.md` or `_shared/journey-coverage-check.md`'s actual computation logic — both are reused as-is by section B; only journey-health's own `SKILL.md` and `bin/lib/journey-health/` change.
- `code-health`/`harness-health` — this design touches journey-health exclusively.

## Testing

- `scope.js`'s existing test file gains cases for Phase 0 (deletion force-select, light-tier-only gating, priority over staleness/churn).
- `validate-finding.js`'s existing test file gains cases for the new `severity` field (required, enum-checked) — every existing valid-finding fixture in that test file needs `severity` added or its test will now correctly fail validation.
- `issue-payload.js`'s existing test file gains a case confirming `journey-health:<severity>` appears in `labels`.
- New test coverage for the QA-evidence cross-reference logic (all-pass satisfies, code-bug/ux-issue failure produces regression-suspected, stale-selector/flaky-env/story-bug failure falls through, a story absent from the run or `SKIPPED` falls through, no-recent-run falls through, no-stories falls through).

## Risk

Low-to-moderate. Section A is a small, well-isolated function change. Section C is additive and mechanical (mirrors the existing `confidence` pattern exactly). Section B is the most involved — it's new cross-file logic (glob + JSON parsing + cross-reference) rather than a small pure function, but it only ever *substitutes* for existing live-verification, never bypasses Step 5's cursor-recording call, so a bug in the QA-evidence path degrades to "ran the live verification anyway" in the worst case, not to a silently-skipped audit.
