# Health Skills — Filing-Gate Ordering Fix + Menu Symmetry — Design

## Goal

Fix a structural ordering bug shared by three of the four recurring "health" skills (`code-health`, `harness-health`, `docs-health`): each one's interactive "how do you want to handle these findings" decision is textually placed in the SUMMARIZE step, which runs *after* the FILE step has already unconditionally created every GitHub issue — making the decision dead, unreachable text. `journey-health` (built most recently) placed the identical decision correctly, inside its own FILE step, before any `gh issue create` call. Centralize the correct placement/applicability/scope rule in one new shared fragment all four skills reference, and while touching all four, harmonize the per-finding disposition menu so every skill offers the same four options (File issue / Capture / `/specify` directly / Dismiss) instead of today's 2-option (docs-health/harness-health/journey-health) vs. 4-option (code-health) split.

## Motivation

Real production evidence: a `/claude-tweaks:docs-health` run in an external repo filed 5 GitHub issues immediately (Step 6 FILE, unconditional), then reached Step 7 (SUMMARIZE)'s documented "File all vs. Route individually" `AskUserQuestion` gate and, correctly recognizing it no longer had anything left to gate, skipped it and noted the discrepancy as a transparency flag rather than performing a decision that couldn't do anything. This is not an agent misbehaving — it's the SKILL.md's own instructions being self-contradictory. The identical text/ordering exists (mutatis mutandis for field names) in `code-health` (Step 9 FILE / Step 10 SUMMARIZE) and `harness-health` (Step 7 FILE / Step 8 SUMMARIZE). `journey-health` (2026-07-11, the newest of the four) already places the same decision correctly inside its own FILE step (Step 6), proving the fix pattern already exists in this codebase — it just never got backported to the three older siblings.

Three independent, near-identical copies of the same interactive-gate logic drifting out of sync is exactly the failure mode this project's own CLAUDE.md already warns against ("Don't accept a plan's 'duplicate this across N≥2 near-identical consumers' framing as final — extract the shared logic anyway"). Patching each of the three files independently, with no single source of truth, leaves the door open for a future edit to reintroduce the exact defect this fix removes.

Separately, while unifying FILE-step placement across all four skills, the per-finding disposition menu is visibly asymmetric: `code-health` offers 4 options (File issue / Capture / `/specify` directly / Dismiss) with a pre-filled "Recommended" column; `docs-health`, `harness-health`, and `journey-health` offer only 2 (File issue / Dismiss), with no Recommended column. There's no reasoned justification for narrower dispositions on doc/harness/journey findings — "capture for later" and "promote straight to a spec" are equally meaningful for any of these findings, since all four file the same born-`ready`, spec-shaped work-record shape. Harmonizing the menu (not the underlying scoring machinery — code-health's `--min-risk` flag and severity×likelihood tiering stay code-health-specific) removes an arbitrary capability gap between siblings without inventing new CLI/scoring infrastructure the other three don't need.

## Architecture

### A. New shared fragment — `skills/_shared/health-filing-gate.md`

Canonical procedure defining three rules, referenced by all four health skills' FILE steps:

1. **Applicability** — interactive (standalone) mode only. A headless Routine firing skips this gate entirely and files every surviving finding automatically, per each skill's own Routine Configuration section (already documented, unchanged).
2. **Scope** — the gate applies only to *this firing's own brand-new findings* — the payloads surviving the verify-gate + dedup that are about to be created for the first time. It does not re-prompt for: (a) retry-queue drains (prior firings' failed-but-already-approved filings being retried), or (b) regressed-reopens (an existing issue reappearing and being reopened) — both categories were already approved/filed in an earlier firing and file/reopen unconditionally, before this gate runs.
3. **Placement** — the gate MUST execute inside the calling skill's own FILE step, positioned after retry-queue-drain and regressed-reopen handling and before the loop that calls `gh issue create` for this firing's new payloads. It must never live in a SUMMARIZE/reporting step, which by definition runs after filing.

The fragment also documents the harmonized menu shape (see C below) as the default every health skill's FILE step should render, while noting each skill keeps its own batch-table columns (matching its own Finding Shape) and its own Recommended-column pre-fill rule (matching its own scoring fields) written out inline in its SKILL.md — only the ordering/applicability/scope rule and the menu-option-set are centralized, not skill-specific field vocabulary.

### B. Per-skill FILE-step edits

| Skill | Change |
|---|---|
| `docs-health` (Step 6) | Move the gate block (batch table + two-tier `AskUserQuestion` + per-finding `AskUserQuestion`) out of Step 7 into Step 6, positioned right before the loop that calls `gh issue create` on `/tmp/docs-health-payloads.json`. Step 7 (SUMMARIZE) keeps only the reporting prose. Menu expands from 2 to 4 options (add Capture, `/specify` directly); add the uniform confidence-only Recommended-column rule (see below). |
| `code-health` (Step 9) | Move the existing gate block out of Step 10 into Step 9, before the "For each payload in `/tmp/code-health-payloads.json`, call `gh issue create`" loop — and before Step 9.5 (Confirm health-state persistence), which is unaffected since it reports on `validate-findings`' own (Step 8) persistence write, not on Step 9's filing outcome. Step 10 keeps only reporting prose. Menu/Recommended-column logic unchanged (already the 4-option, `--min-risk`-driven shape every other skill is harmonizing toward). |
| `harness-health` (Step 7) | Move the gate block out of Step 8 into Step 7, before its filing loop. Step 8 keeps only reporting prose. Menu expands from 2 to 4 options; add the uniform confidence-only Recommended-column rule. |
| `journey-health` (Step 6) | Already correctly placed — replace the inline duplicated ordering/applicability/scope prose with a reference to `_shared/health-filing-gate.md` (no change to placement, since it's already correct). Menu expands from 2 to 4 options; add the uniform confidence-only Recommended-column rule. |

Every skill's own `AskUserQuestion` option labels/descriptions and batch-table columns stay written out in full inline in that skill's own SKILL.md (a skill file must be self-contained for whichever session reads it directly — the same reason the Subagent Contract requires literal templates, not references, in dispatched-agent prompts) — only the *placement* and *applicability* rule is centralized in the new fragment, referenced by name.

### C. Menu-symmetry harmonization

All four skills' per-finding follow-up (when "Route individually" is chosen) becomes:

- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:{skill} issue"`
- Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
- Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
- Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

And the top-level two-tier decision's first option becomes `"Apply all recommended (Recommended)"` (matching code-health's existing phrasing, since a Recommended column now exists on every skill's batch table) instead of the current plain `"File all (Recommended)"` used by docs-health/harness-health/journey-health.

**Recommended-column rule for docs-health, harness-health, and journey-health** (uniform, not three bespoke rules): pre-fill `"File issue"` when `confidence` is `high` or `med`; pre-fill `"Capture"` when `confidence` is `low`. This uses the one field all three finding shapes already emit in common, and mirrors code-health's own stated philosophy ("file issue is the safe default whenever a finding clears the confidence bar") without inventing a different multi-field combination per skill or any new scoring infrastructure. `--min-risk`, its `remembered` cache tier, and code-health's severity×likelihood scoring stay exclusively code-health's — they're *why* code-health's own Recommended rule differs (it can hold a finding as `remembered` sub-threshold); the other three don't gain that mechanism, only the four-option menu shape and this confidence-only Recommended column.

## Code Changes

| File | Change |
|---|---|
| `skills/_shared/health-filing-gate.md` | New — applicability/scope/placement rule + harmonized menu-shape reference |
| `skills/docs-health/SKILL.md` | Step 6 gains the gate (relocated + expanded menu + Recommended column); Step 7 loses the dead block; Anti-Patterns + Relationship table rows added |
| `skills/code-health/SKILL.md` | Step 9 gains the gate (relocated, menu/Recommended unchanged); Step 10 loses the dead block; Anti-Patterns + Relationship table rows added |
| `skills/harness-health/SKILL.md` | Step 7 gains the gate (relocated + expanded menu + Recommended column); Step 8 loses the dead block; Anti-Patterns + Relationship table rows added |
| `skills/journey-health/SKILL.md` | Step 6's inline gate text replaced with a fragment reference; menu expanded + Recommended column added; Anti-Patterns + Relationship table rows added (same guardrail applies here too — a future edit could still reintroduce inline duplication even though placement is already correct today) |
| `CLAUDE.md` | `_shared/*.md` bullet list in Structure gains `health-filing-gate.md`'s one-line description |

## Testing

These are markdown-prose skill files — no unit-testable logic changes (matches the existing convention that "the LLM-judgment half isn't unit-testable... verified via `--dry-run` runs during development"). Verification is a manual read-through of all four SKILL.md files confirming: (a) the gate block appears before, not after, any `gh issue create` invocation in each FILE step; (b) SUMMARIZE steps contain no leftover `AskUserQuestion` gate text; (c) all four skills' per-finding menus list the same four options; (d) the full `node --test` suite still passes unmodified (no code paths touched).

## Non-Goals (explicitly parked / out of scope)

- **Porting `--min-risk` / severity×likelihood scoring / the `remembered` cache tier to docs-health, harness-health, or journey-health.** A materially bigger change (new CLI flags, new scoring model, new cache semantics per skill) than an ordering-bug fix and menu-symmetry pass — a separate future brainstorm if wanted.
- **The broader docs-health usability set** (first-run flood control on a never-audited repo, root-cause grouping of multiple findings from one underlying event, Next Actions recommendation logic) — explicitly deferred to a second, separate brainstorm/design pass per this session's own scoping decision.
- **Adding a fifth health skill, or generalizing the fragment beyond the four that exist today** — not requested, no evidence it's needed yet.
- **Giving code-health a persistent `mark ... declined` cache.** Discovered during plan-writing: `code-health.js` has no `mark` subcommand at all (unlike the other three, confirmed against `bin/code-health.js` and CLAUDE.md's Commands table) — its "Dismiss" option genuinely just drops the finding in-conversation, with no durable decline-memory. The harmonized menu keeps the `"Dismiss"` *label* identical across all four skills, but code-health's option description stays `"Drop this finding"` rather than being rewritten to falsely claim a `mark declined` call that doesn't exist for it. Adding that CLI capability to code-health would be new code (a cache field, a subcommand, tests) — out of scope for a docs-only pass; a candidate for a future session if wanted.

## Known Touch Points

- `_shared/health-state.md` — the durable retry-queue/regressed-reopen persistence layer these skills already share; this fix doesn't change it, only where the interactive gate sits relative to it in each SKILL.md's prose.
- `_shared/work-record.md` — the born-ready/spec-shaped filing contract that makes "`/specify` directly" and "Capture" equally valid dispositions for all four skills' findings (all four already produce Current State/Deliverables/Acceptance-Criteria-shaped bodies).
- `_shared/auto-mode-contract.md` — unaffected; the interactive gate only ever runs in standalone/interactive mode, never in `auto`/headless Routine firings, consistent with the existing "auto never invents mid-flow stops" rule (this fix doesn't add one — it relocates an existing one to where it can actually take effect).
