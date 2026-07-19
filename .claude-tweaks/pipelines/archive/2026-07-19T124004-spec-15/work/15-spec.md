---
record: 15
origin: human
risk: low
effort: low
grants: []
ceremony: fast-lane
surface: backend
---
# 15: ledger/SKILL.md documents docs/plans/*-ledger.md as canonical in 4 places, but the real write target (and .gitignore) say .claude-tweaks/ledgers/

Surface: backend

## Current State

Re-verified against the current codebase (v6.8.0) — the contradiction is real, but the fix direction is the opposite of what was originally proposed.

`skills/ledger/SKILL.md` has 5 references to where a ledger file lives, and they disagree:

- Lines 43, 131, 192, 202 (`## Ledger File > Location`, the `File:` example, and the two "find the active ledger" glob instructions) all say `docs/plans/YYYY-MM-DD-{feature}-ledger.md`.
- Line 216, in `## Component-Skill Contract`, says callers "write to `.claude-tweaks/ledgers/{feature}.md` directly."

The original report (filed alongside #13, evidence from an external project — memenu-io/memenu-app) concluded the `.claude-tweaks/ledgers/` line was correct and the 4 `docs/plans/` mentions were stale, based on that project's own `.gitignore` pattern and observed files.

Checking this repo's own actual practice — the plugin's own source, not a downstream consumer — gives the opposite answer:

- 3 real ledger files exist in this repo today, all under `docs/plans/*-ledger.md` (`docs/plans/2026-07-14-unified-work-record-ledger.md`, plus two created this session for #14 and #32). `.claude-tweaks/ledgers/` has never existed in this repo.
- `docs/plans/*-ledger.md` (or the equivalent "ledger" reference) is cited in 17 files repo-wide: `README.md`, `CHANGELOG.md`, three `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` design/plan docs, and 9 other skill files (`skills/init/bootstrap-steps.md`, `skills/design/SKILL.md`, `skills/design/modes/polish.md`, `skills/design/modes/review.md`, `skills/wrap-up/SKILL.md`, `skills/wrap-up/cleanup-procedures.md`, `skills/review/SKILL.md`, `skills/help/context-flow.md`, plus `ledger/SKILL.md` itself).
- `.claude-tweaks/ledgers/` appears in exactly one place in the entire repo: the single Component-Skill Contract line (216) flagged above.

That is a 17-files-vs-1-line split, not a 4-vs-1 split as originally framed — the single Component-Skill Contract line is the stale one, not the four `## Ledger File` mentions. It reads as though the Component-Skill Contract section was drafted independently (perhaps anticipating a `.claude-tweaks/`-rooted runtime-state convention used elsewhere in the plugin) and never cross-checked against the rest of the file it lives in, let alone the rest of the repo.

## Deliverables

Fix the single contradicting line, not the four correct ones.

1. In `skills/ledger/SKILL.md`'s `## Component-Skill Contract` section (line 216), change `.claude-tweaks/ledgers/{feature}.md` to `docs/plans/YYYY-MM-DD-{feature}-ledger.md`, matching the file's own `## Ledger File > Location` section and every other reference in the repo.

## Acceptance Criteria

- `grep -rn "\.claude-tweaks/ledgers" skills/ledger/SKILL.md` returns no matches.
- `grep -n "docs/plans/YYYY-MM-DD-{feature}-ledger.md" skills/ledger/SKILL.md` still matches at least 4 lines (the pre-existing correct references, now joined by the Component-Skill Contract's corrected one).
- No other file in the repo references `.claude-tweaks/ledgers/` after the fix (`grep -rln "\.claude-tweaks/ledgers" .` excluding `.git/` returns nothing).
- The corrected sentence still reads naturally in context — this is a path substitution, not a rewrite of the surrounding sentence's meaning.

## Technical Approach

### Key Files

- `skills/ledger/SKILL.md` — line 216 only

### Approach

One-line documentation fix. No code changes, no test suite impact — `docs/plans/*-ledger.md` is already the path every other reference and this repo's own real ledger files use; this brings the one outlier in line.

## Gotchas

- Do not "resolve" this by updating the 4 correct references to match the 1 wrong one — that was the original bug report's proposed direction, and it's backwards. Verified against this repo's own git history and 17 corroborating references, not just the file in isolation. (The original report's evidence came from a different, downstream project's `.gitignore`, which is not authoritative for what this plugin's own skill files should say.)
- If a project genuinely wants ledgers under `.claude-tweaks/ledgers/` instead of `docs/plans/`, that would be a deliberate, separate feature (a configurable ledger-location setting, analogous to `work-backend`) — not something to retrofit by editing this one contradicting sentence. Out of scope here.

## Original request

ledger/SKILL.md documents docs/plans/*-ledger.md as canonical in 4 places, but the real write target (and .gitignore) say .claude-tweaks/ledgers/

**Related:** #13

## Context

Found while auditing memenu's spec/pipeline artifact lifecycle (alongside #13).

## The contradiction

`skills/ledger/SKILL.md` gives two different canonical locations for the same artifact:

- `## Ledger File > Location`, a `File:` example, and two globs used for "find the active ledger" (4 mentions total) all say: `docs/plans/YYYY-MM-DD-{feature}-ledger.md`
- `## Component-Skill Contract`, describing what callers (`/build`, `/test`, `/review`, `/wrap-up`, `/flow`, `/tidy`) actually do, says they "write to `.claude-tweaks/ledgers/{feature}.md` directly"

## Evidence

A project using this plugin has real files in both locations — one git-tracked under `docs/plans/`, one untracked under `.claude-tweaks/ledgers/`. That project's own `.gitignore` explicitly ignores `.claude-tweaks/ledgers/`, which only makes sense if that's the actually-intended location (matching the general "`.claude-tweaks/` holds runtime state" convention) — meaning the `docs/plans/*-ledger.md` convention documented 4 times in `ledger/SKILL.md` is stale and was never updated after the location changed.

## Suggested fix

Update all 4 references in `ledger/SKILL.md` to `.claude-tweaks/ledgers/{feature}.md`, matching what `## Component-Skill Contract` already says callers do.

