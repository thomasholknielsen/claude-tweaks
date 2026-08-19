---
record: 534
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: policy-comprehension:help-policy-mode-grouped-config-render-with-actionable-valid
blocked-by: [533]
surface: backend
---
# 534: /help policy mode: grouped config render with actionable, validated edits

Surface: backend

## Overview

Add a `policy` mode to `/claude-tweaks:help` — the standing answer to "how is this project configured, and what should I change?". One `resolve-policy.js --all` call plus one `auditPolicy()` call drive sections 1, 2, and 4 of the render; section 3 (notable defaults) may additionally issue the named read-only probes listed in its deliverable. The render: set levers by category, audit issues inline, notable defaults judged against live project signals, advanced tier collapsed. The mode ends with /help's standard `## Next Actions` `AskUserQuestion` offering the top recommended edits — each applied as a `resolveValue`-validated write to `.claude-tweaks/policy.yml` on approval, confirmed by re-running `auditPolicy()`. Every recommendation row is directly actionable, never information-only.

Part of the policy-comprehension family (parent #532). This mode's render contract is the single renderer — init's policy review delegates to it in a sibling sub-issue (#536), so the contract surface below is explicit.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No top-level `/policy` skill and no `set` subcommand — the write path is the conversational Next Actions apply, validated at the boundary (parent #532's Decision Rationale records why the alternative lost).
- No change to init's bootstrap policy questions or the `/flow` Manifesto.
- No recommendation data in the schema — notable-defaults is judgment in this mode's prose, bounded to core-tier levers.
- No gate changes. Under `worktree.always` in a main checkout, the apply path is unavailable until #537 ships; the mode detects this by **pre-check, not try/catch**: `worktree.always` is already in the `--all` output in hand, and checkout type comes from comparing `git rev-parse --git-dir` with `git rev-parse --git-common-dir`. When enforced-and-main-checkout, render the paste-ready-command fallback instead of the apply options. The fallback note in `policy.md` cites #537 as its removal condition.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #533 | Policy schema human-facing metadata (summary/category/tier) and resolve-policy --all | Hard gate: do not start until #533 is merged; at pickup, verify the shipped `--all` output shape against the field list restated below rather than trusting this record's copy |

## Current State

- `skills/help/SKILL.md` — argument-dispatched modes (`status`, `commands`, bare topic) via an Input table + `argument-hint`; `commands` already demonstrates a mode that skips the status scan; the file carries the canonical Interaction-style directive and ends every path with `## Next Actions` via `AskUserQuestion`.
- `skills/help/reference-card.md`, `skills/help/status-scan.md`, `skills/help/context-flow.md` — existing lazy-loaded mode/sub-files, the pattern to follow.
- `bin/resolve-policy.js --all` — full resolved config + metadata (from #533); `auditPolicy(repoRoot)` in `bin/lib/policy-schema.js` — `invalidValues`, `unrecognizedKeys`, `migratableKeys`.
- `skills/init/policy-review.md` — the #388-shipped read-only review whose detail render this mode's contract will later absorb (#536; do not modify init here).
- `docs/plugin-structure.md` — per-skill sub-file table; `docs/skill-authoring.md` — required reading before editing any `skills/**/*.md`, including the `${CLAUDE_PLUGIN_ROOT}` substitution contract for the Bash invocations this mode embeds.

## Deliverables

- [ ] `skills/help/policy.md` — the mode file: gather (the `--all` + `auditPolicy()` invocations plus section 3's probes, exact commands per the `CLAUDE_PLUGIN_ROOT` contract), the render contract below, and the Next Actions apply procedure. The file carries an explicit **"Render contract"** heading declaring the stable surface #536 may consume: the four numbered section headings, their order, and their data sources; changing any of these requires updating `skills/init/policy-review.md`'s citation in the same change.
- [ ] Render section 1 — **Set levers**: grouped by `category`, each row `key — value (source)` with the schema default it diverged from; only keys with `source ≠ default`.
- [ ] Render section 2 — **Issues**: `invalidValues` (with the schema default the value silently degrades to), `unrecognizedKeys`, `migratableKeys`. When all three lists are empty, render exactly one line ("Policy config issues: none") — never silently skipped; otherwise render each non-empty list.
- [ ] Render section 3 — **Notable defaults**: core-tier keys still on `source: default` where project signals argue otherwise. Named read-only probes the section may issue (each skippable when its probe fails or `gh` is absent — an absent signal skips that judgment, and zero available signals renders a "no notable defaults" line, never silence): `git remote -v` (forge presence vs unset `integration-model`), an issue-label scan for standing `auto:*` grants (vs `autonomy`), and an `ls` of `.claude-tweaks/pipelines/` (recent pipeline activity vs `project.maturity`). This signal list is the v1 set and is extensible by editing the mode file's prose — no schema or new-issue ceremony. Each finding: one line, lever + proposed value + why. Advanced-tier keys are never "notable."
- [ ] Render section 4 — **Advanced tier**: one collapsed count line ("N advanced levers on defaults — say 'show advanced' to expand"), expandable in-conversation.
- [ ] `## Next Actions` via one `AskUserQuestion` (`multiSelect: true`): the top recommended edits as options, **capped at 3**, ranked core-tier severity first (order of listing in section 3), plus a "No changes" option. Recommendations beyond the cap stay visible in section 3's rendered list with an "ask to apply" note — never dropped. "Show advanced" is section 4's in-conversation affordance, not an option. Apply semantics are **per-key, in selection order**: each approved key validates via `resolveValue` before its write (rejected value → report that key, continue the rest); after the batch, one `auditPolicy()` re-run — any new issue names the offending key, reverts that key's line to its prior value, and reports; the edit is never described as confirmed until the re-audit is clean. Include the #537-gated pre-check fallback from Non-Goals.
- [ ] `skills/help/SKILL.md`: `policy` row in the Input table (skips Section 1 cheat sheet and Section 2 status scan; reads `policy.md`), positioned so it matches before the bare-`<topic>` fallthrough; `argument-hint` updated to `[status|commands|policy|<topic>] [--budget <n>]`.
- [ ] `skills/help/reference-card.md`: one row for the `policy` argument; `docs/plugin-structure.md`: `skills/help/policy.md` added to the sub-file table.

## Acceptance Criteria

1. `skills/help/policy.md` exists and contains: the gather commands (including section 3's named probes and their skip-on-absence rule), all four render sections in order under a "Render contract" heading, the AskUserQuestion Next Actions spec with cap, ranking, per-key validate-before-write, revert-on-new-audit-issue, and the #537 pre-check fallback.
2. `skills/help/SKILL.md`'s Input table has a `policy` row whose behavior cell states both skips and names `policy.md`, matched before `<topic>`; the `argument-hint` frontmatter includes `policy`.
3. Every skill reference inside actionable instruction text in the new/edited files uses the fully-qualified `/claude-tweaks:{skill}` form; bare short forms appear only in descriptive prose.
4. Section 2's contract mirrors #388's non-skippable count: the mode file states the single "none" line renders when all three issue lists are empty, and each non-empty list renders otherwise.
5. `docs/plugin-structure.md`'s help sub-file table lists `policy.md`; `reference-card.md` documents the argument.
6. No new `AskUserQuestion` call beyond the single Next Actions call is specified anywhere in the mode (Interaction-style directive: one call per decision, batch table first).
7. `npm test` passes (docs-only change must not break the harness-health budget tests; if `skills/help/SKILL.md` trips the SKILL.md size ceiling early-warning, move detail into `policy.md` rather than growing SKILL.md).

## Technical Approach

Follow `docs/skill-authoring.md` before writing (mandatory for `skills/**` edits). The mode file owns everything except the argument-table row — SKILL.md gets one row and a hint edit only, keeping its size budget flat. The render is deterministic-data-first (sections 1, 2, 4 are pure transformations of `--all` + `auditPolicy` output) with judgment confined to section 3, which degrades gracefully as signals disappear.

### Data / API Surface

Consumes (no new code surface of its own): `resolve-policy.js --all` JSON (`{key: {value, source, summary, category, tier, type, default}}` — verify against shipped #533 at pickup), `auditPolicy(repoRoot)` (`{invalidValues, unrecognizedKeys, migratableKeys}`), `resolveValue(key, raw)` for pre-write validation, plus section 3's three named read-only probes.

### Key Files

- `skills/help/policy.md` — new mode file (the bulk of the work)
- `skills/help/SKILL.md` — Input-table row + `argument-hint`
- `skills/help/reference-card.md` — argument documentation row
- `docs/plugin-structure.md` — sub-file table row

### Package Dependencies

None.

## Gotchas

- `${CLAUDE_PLUGIN_ROOT}` in embedded Bash is a model-resolved placeholder, not a live env var — follow `docs/skill-authoring.md`'s substitution contract verbatim; it has been observed unset in real Bash environments.
- `skills/help/reference-card.md` and `docs/plugin-structure.md` are also touched by open records #530/#276/#509 — pure append contention, no logical dependency; rebase rather than block.
- The mode must not re-derive precedence or defaults in prose — every value, source, and default comes from `--all` output; restating a default inline is the exact drift #330's migration deleted.
- Cardinality rule: never write the literal lever count into prose ("every lever", not "48").
- The apply-path revert (on a new audit issue) is possible only because the mode holds the key's prior value from the `--all` snapshot taken this run — don't re-read the file to "discover" the prior value after writing.

## Decision Rationale

See #533's Decision Rationale and parent #532 — this sub-issue implements the "/help mode, not a top-level skill" and "judgment, not matrix" decisions recorded there.

<!-- work-fingerprint: policy-comprehension:help-policy-mode-grouped-config-render-with-actionable-valid -->
