---
record: 923
origin: human
risk: low
size: high
ceremony: standard
grants: [build]
surface: infra
---
# 923: Extend session-scoped temp-root convention (#266) to the remaining skills/** sweep

Surface: infra

## Current State

#266 defined the session-scoped temp-root convention (`plugin/bin/lib/session-tmp.js` + `plugin/skills/_shared/session-tmp-root.md`) and migrated the 4 named skill families plus two directly-chained backlog files: `specify/` (decomposition-mode.md, record-creation.md, shaping-mode.md), `dispatch/` (queue-pull-script.md, headless-self-report.md, settle-and-merge.md, SKILL.md), `backlog/` (overview-mode.md, refine-mode.md, refine-lanes.md, grant-mode.md, attention-mode.md, trust-signal.md), and `assess-agent-autonomy/grant-check.md`.

A repo-wide sweep at build time (`grep -rl '/tmp/[a-z][a-z0-9-]*-[a-z0-9-]*\.\(json\|md\|txt\|graphql\|err\|jsonl\)' plugin/skills/ --include="*.md"`) found 22 more files still hardcoding literal, unscoped `/tmp/{skill}-*` paths, carrying the same collision class #266 fixed for dispatch/specify/backlog — a compose-then-write window that two concurrent sessions of the same skill can race on:

- `_shared/github-pr-scan-acceptance.md`, `_shared/github-pr-scan.md`, `_shared/harness-health-analysis.md`, `_shared/label-bootstrap.md`, `_shared/trust-table.md` — shared infrastructure consumed by multiple skills each (tidy, visualize, capture, the four health sweeps); migrating these has the widest blast radius per file touched.
- `code-health/SKILL.md`, `code-health/filing.md`, `code-health/focus-mode.md`
- `docs-health/SKILL.md`
- `harness-health/SKILL.md`, `harness-health/filing.md`, `harness-health/judge-procedure.md`
- `journey-health/SKILL.md`
- `capture/SKILL.md`
- `help/status-scan.md`
- `init/bootstrap/step-14-cloud-routine-parity.md`
- `tidy/step-1-records.md`
- `wrap-up/SKILL.md`, `wrap-up/docs-health-integration.md`, `wrap-up/leftover-routing.md`, `wrap-up/unblocked-records.md`, `wrap-up/verification-brief-parent-gate.md`

The four health-sweep skills (code-health, docs-health, harness-health, journey-health) are the highest-priority subset: CLAUDE.md documents them as scheduled-Routine-invoked, so two overlapping firings racing on the same literal filename is not a hypothetical — it is the exact incident class #266's own dispatch-queue-pull evidence already demonstrated (8 parallel firings, 2026-08-14, truncated mid-run reads).

## Deliverables

- [ ] Migrate the four health-sweep skills first (code-health, docs-health, harness-health, journey-health) — highest concurrent-firing risk
- [ ] Migrate `wrap-up/*` (5 files) — multi-spec runs already share one worktree per #266's own dispatch evidence
- [ ] Migrate `tidy/step-1-records.md`, `capture/SKILL.md`, `help/status-scan.md`, `init/bootstrap/step-14-cloud-routine-parity.md`
- [ ] Migrate the `_shared/` files last (github-pr-scan.md, github-pr-scan-acceptance.md, harness-health-analysis.md, label-bootstrap.md, trust-table.md) — each has multiple consumers, so re-verify every consumer's own citation after the shared file changes, the same discipline #266 applied when backlog/trust-signal.md and backlog/refine-mode.md both cited the same session-scoped file
- [ ] Re-run this record's own sweep grep (below) after each batch to confirm no new hits were missed

## Acceptance Criteria

1. `grep -rn '/tmp/[a-z-]*-[a-z-]*\.\(json\|md\|txt\|graphql\|err\|jsonl\)' plugin/skills/ --include="*.md"` (excluding `_shared/session-tmp-root.md`'s own documentation examples and any `ct-{session-id}` session-snapshot path) returns zero matches
2. Every migrated file cites `_shared/session-tmp-root.md` rather than restating the mechanism
3. `bash -n` validates cleanly against every edited bash fence (the verification method #266 used, given these are prose-only skill-markdown changes with no `node --test` coverage of the executable shape itself)
4. `npm test` green — full suite

## Technical Approach

Same procedure #266 already validated: for each file, resolve session-scoped paths via `bin/lib/session-tmp.js`'s `sessionTmpPath(sessionId, filename)` at the top of the bash fence that needs them (re-derived per fence, since shell state does not persist across separate tool-call bash invocations), substitute every literal `/tmp/{name}` occurrence with the resolved shell variable, and cite `_shared/session-tmp-root.md` once per file rather than restating the convention. For a file whose existing temp name already carries a record-number suffix (mirroring `assess-agent-autonomy/grant-check.md`'s `assess-grant-${N}.json` before #266), combine the session root with the existing suffix — neither replaces the other.

For the `_shared/` files specifically: after migrating, grep every known consumer (not just the ones #266 already touched) for a stale citation of the old literal path, since a shared file's callers may cite it by literal filename in their own prose.

### Key Files

- `plugin/skills/code-health/SKILL.md`, `filing.md`, `focus-mode.md`
- `plugin/skills/docs-health/SKILL.md`
- `plugin/skills/harness-health/SKILL.md`, `filing.md`, `judge-procedure.md`
- `plugin/skills/journey-health/SKILL.md`
- `plugin/skills/wrap-up/SKILL.md`, `docs-health-integration.md`, `leftover-routing.md`, `unblocked-records.md`, `verification-brief-parent-gate.md`
- `plugin/skills/tidy/step-1-records.md`, `plugin/skills/capture/SKILL.md`, `plugin/skills/help/status-scan.md`, `plugin/skills/init/bootstrap/step-14-cloud-routine-parity.md`
- `plugin/skills/_shared/github-pr-scan.md`, `github-pr-scan-acceptance.md`, `harness-health-analysis.md`, `label-bootstrap.md`, `trust-table.md`
- `plugin/skills/_shared/session-tmp-root.md` — cite, don't restate
- `plugin/bin/lib/session-tmp.js` — the module every migrated snippet calls into; no code change expected here

## Gotchas

- `_shared/trust-table.md` writes `/tmp/trust-table-records.json` and `/tmp/trust-table-git-log.txt`, read back by `backlog/trust-signal.md` (already migrated for its own `backlog-refine-trust.json` output in #266, but this upstream pair was left as a noted, deliberate exception — see that record's ledger). Migrating `trust-table.md` closes this gap and lets the exception be removed from `backlog/trust-signal.md`'s own citation.
- Byte ceiling: `backlog/refine-mode.md` sits at 40,313/40,960 bytes after #266's own edits (647 B headroom) — any further edit to that specific file from this sweep must re-measure `wc -c` before committing.
- Bash-fence self-containment: #266 hit one real bug from assuming a variable resolved in an earlier fence was still in scope in a later one (settle-and-merge.md's Step 5) — re-derive session-scoped variables per fence rather than relying on cross-call shell persistence.
- Worked-example prose (e.g. `refine-lanes.md`'s illustrative `#201`/`#420` transcripts) needs the same treatment even though it's not literally executed — a stale unscoped literal there still fails AC1's grep and reads as inconsistent with the surrounding convention.

## Decision Rationale

Deferred out of #266's own scope at build time (2026-08-18): the explicit Deliverables list named 4 skill families (11 files) plus a general "sweep the rest of skills/** ... migrate every hit that carries cross-write risk" instruction whose full scope (22 more files, several of them shared `_shared/` infrastructure with many consumers) is a comparably-sized second pass, not a same-session extension of the first. Filed immediately per this project's no-implicit-deferrals rule rather than left as an unfiled gap.

Defer-reason: scope-larger-than-single-pass

## Original request

Extend session-scoped temp-root convention (#266) to the remaining skills/** sweep

Surface: infra

(see body above — original request section preserved verbatim per record convention)

