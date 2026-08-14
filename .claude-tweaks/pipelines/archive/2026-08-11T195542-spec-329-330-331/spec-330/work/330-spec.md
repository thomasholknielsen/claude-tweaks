---
record: 330
origin: human
risk: medium
size: high
ceremony: standard
grants: []
fingerprint: policy-read-path-and-collapse:migrate-policy-prose-grep-read-sites-to-the-resolver
blocked-by: [170, 329]
surface: backend
---
# 330: Migrate policy prose-grep read sites to the resolver

Surface: backend

## Overview

Migrate every prose read site of `.claude-tweaks/policy.yml` in `skills/**` onto `bin/resolve-policy.js` (built by #329 (the resolver leaf)), and delete each site's inline restatement of the key's default — after this leaf, a default is stated in exactly two places: `POLICY_KEYS` and its mirror row in `skills/_shared/policy-schema.md`. The dominant idiom being retired is a verbatim `grep -E "^{key}:" .claude-tweaks/policy.yml | head -1 | sed …` pipeline (measured 2026-08-11: roughly forty sites; `work-links` alone has six literal instances, `integration-branch` five). This is deliberately mechanical, behavior-preserving work — the value each site acts on must be identical before and after; only the mechanism of obtaining it changes.

**Complexity:** Medium
**Estimated tasks:** 8 (coarse granularity: mechanical, well-understood migration — 1-4 files per task; re-derive the count from the fresh enumeration before committing to a plan — the ~40-site snapshot this estimate rides on is explicitly non-authoritative)

Leaf mapping for the release note: A = #329 (resolver), B = this record.

## Non-Goals

- Renaming, deleting, or re-defaulting any key — the collapse leaf owns that
- Touching JS read paths (`bin/lib/policy.js` callers, `trust.js`, `grant-gate.js`, model-profiles resolver) — already settled by #329 (the resolver leaf)
- Migrating reads of non-policy files (CLAUDE.md's `work-backend`/`work-types`/`diagram-suggestions`, run-dir `run-state.json`) — out of scope; #159 owns the work-record-config home question
- Changing what any skill *does* with a resolved value

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #329 | Policy resolver CLI | must be merged first |
| #170 | Determine whether ${CLAUDE_PLUGIN_ROOT} actually resolves in Bash tool calls | blocks — this migration multiplies the assumption ~40× (and note: the var was observed unset in this repo's own Bash environment on 2026-08-11) |

## Current State

- Read sites: `skills/**/*.md` prose instructing agents to grep `policy.yml` directly — the enumeration is a deliverable below, not an input; known heavy clusters from the 2026-08-11 consumer map: `_shared/{work-record,git-discipline,integration-branch,autonomy-ceiling,trust-table,auto-mode-contract,record-queue-fetch,github-pr-scan,issue-claims,health-filing-digest,initiative-budget}.md`, `dispatch/{SKILL,settle-and-merge}.md`, `backlog/{refine,grant,overview}-mode.md`, `flow/{SKILL,manifesto,survey,materialize}.md`, `build/{SKILL,build-options,plan-audit}.md`, `wrap-up/*`, `init/*`, `help/*`, `tidy/*`, `review/*`, `test/SKILL.md`, `assess-agent-autonomy/SKILL.md`, `capture/SKILL.md`, `deepen/SKILL.md`, `research/SKILL.md`, the four health skills' FILE steps, `routine/fleet.md`, `visualize/record-graph.md`, `ledger/resolve-gate.md`
- Precedence chain: defined once in `skills/_shared/auto-mode-contract.md` (CLI arg > pipeline config > project policy > skill default), re-executed in prose at every Manifesto-lever read site
- The resolver leaf's CLI accepts multiple keys per call and `--run "$PIPELINE_RUN_DIR"` for the overlay

## Deliverables

- [ ] Structural enumeration of every read site, committed as the execution plan's checklist: `find skills -name '*.md' | xargs grep -l 'policy\.yml'` cross-checked with a second sweep for pipe-idiom fragments (`head -1 | sed`) — enumerate by *idiom*, not by key name, and use `find`+`xargs` (a gitignore-honoring grep silently skips nothing here, but the discipline is the point: the sweep must state what its red looks like)
- [ ] Every enumerated site replaced with a resolver call, batching multi-key reads at sites that read several keys. The invocation form shown elsewhere in this record (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" …`) is a **placeholder pending #170's resolution** — this leaf's first task records the resolved canonical form (env-var, relative-path, or hybrid) and every subsequent task uses it verbatim
- [ ] Every inline default restatement at those sites deleted (the resolver output already applied it)
- [ ] `skills/_shared/auto-mode-contract.md`'s precedence section rewritten to name the resolver as the executing mechanism; Manifesto-lever read sites cite it instead of re-executing precedence in prose
- [ ] Verification sweep with a negative control: (a) the old idiom count in `skills/**` is zero, (b) inverting the check — planting one synthetic old-idiom line in a scratch copy — makes the same sweep fail
- [ ] The A+B pair ships as one minor release (a resolver with no consumers is a promise without its consumer)

## Acceptance Criteria

1. Two-stage completeness gate, dry-run against the current tree before relying on it, with a planted synthetic old-idiom line proving each stage can fail:
   (a) **Superset review:** `find skills -name '*.md' -print0 | xargs -0 grep -ln 'policy\.yml'` — every file still mentioning `policy.yml` is itemized in the PR body, each remaining mention classified descriptive-only (schema doc, index tables, this-key-lives-here prose), never an executable read instruction;
   (b) **Idiom greps zero:** the known read idioms (`grep -E "^…:" .claude-tweaks/policy.yml`, the `head -1 | sed` pipeline) each return zero matches under `skills/**` — keep `-print0`/`-0` paired through every xargs stage. AC (a) is what closes the completeness gap for idioms (b) doesn't know about — an `awk`/`cut` variant still mentions `policy.yml` and lands in the superset list
2. Every migrated site's surrounding prose still names the same key(s) and the same behavior on each resolved value — verified per key family against the `POLICY_KEYS` row via one representative site plus the structural sweep. This is the deliberately narrowed equivalence claim: no exhaustive per-site old-output-vs-new-output diff is required; the behavior-preserving intent plus the review gate carry the residual risk
3. No site restates a default numerically/literally alongside its resolver call — human spot-check per key family guided by shape examples, not an automatable gate. Retired restatement (delete): "…read `dispatch-retry-ceiling` (default 3) from policy.yml" → "…resolve `dispatch-retry-ceiling` via the resolver". NOT a restatement (keep): behavioral prose like "at 3 consecutive failures, apply `bot:blocked`" where the number is the rule being described, not the key's default being quoted
4. `skills/_shared/auto-mode-contract.md` names `resolve-policy` in its precedence section; no skill file outside `_shared/policy-schema.md` re-states the four-level chain as an executable procedure
5. Full `npm test` green — in particular the skill-audit and inlined-region suites, since some migrated files feed dispatcher-inlined fragments
6. `docs/skill-graph.md` unchanged (no skill relationships change) — verify by diff, not assumption

## Technical Approach

Work through the enumerated checklist in file-cluster batches (the eight tasks), one commit per batch, full-suite run centrally at the end rather than per batch. The final enumerated checklist is a durable artifact: it lands in the execution plan file and the PR body, so "what was actually migrated" is answerable after the fact without re-deriving.

Where a site sits inside a region that a dispatcher inlines into subagent prompts, confirm which region actually gets inlined before editing. Locate the pinning test by grepping `tests/` and `bin/lib/*/tests/` for the edited file's basename; where no pinning test exists (many prose-only `wrap-up/*`/`init/*` files have none), verify by reading the dispatching skill's inline block directly. Keep the resolver call inside the inlined region so dispatched agents still receive a working read instruction.

### Data / API Surface

- No new surface. Consumes the resolver CLI's documented JSON contract only.

### Key Files

- `skills/**/*.md` — every file the structural enumeration returns (the checklist is authoritative; the Current State cluster list above is the expected shape, not the contract)
- `skills/_shared/auto-mode-contract.md` — precedence-section rewrite

### Package Dependencies

- none

## Gotchas

- Bake the sweep into the plan from task one, case-insensitive and content-anchored — a literal-path grep misses reworded variants, and a plan-verification grep expecting "no output" can't distinguish success from a sweep that examined nothing; pair every zero-result check with the planted-line negative control
- Re-verify this record's premise immediately before building: concurrent sessions ship constantly here, and both the site count and the file list will have drifted — re-run the enumeration, don't trust this body's snapshot
- Check `git log --oneline HEAD..origin/main` mid-window; a wide sweep left unmerged while main moves is the worst conflict shape this repo knows
- Some sites do a combined multi-key grep (e.g. `assess-agent-autonomy/SKILL.md` reads `merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files` in one pipeline) — replace with one multi-key resolver call, not three single-key calls
- `worktree.always` prose sites describe the *hook's* enforcement, not a value the skill reads at runtime — many of its 32 mentions are descriptive, not read sites; the idiom enumeration (not the key-name count) decides what migrates
- Files feeding dispatched-agent prompts must keep the resolver call *inside* the inlined region — a read instruction that lands outside the split point silently no-ops for the agent
- This leaf touches files that nine open records also name in their Key Files (#81, #113, #179, #220, #221, #223, #276, #324, #325) — assessed as physical adjacency only, no content dependency, **at decomposition time**. The concrete collision trigger: if any of those records merges mid-flight, diff its changes against this leaf's touched files; a collision is an edit to the same section/paragraph a migrated read site sits in (not merely the same file) — on collision, rebase and re-verify that site's migration against the new text before continuing
- Pin #329's shipped CLI contract at build start (re-read its merged README/docs row and the JSON shape from its tests); if #329 receives follow-up commits mid-window, re-check before the final sweep

## Decision Rationale

See #329 (the resolver leaf)'s Decision Rationale (first spec of this decomposition).


<!-- work-fingerprint: policy-read-path-and-collapse:migrate-policy-prose-grep-read-sites-to-the-resolver -->
