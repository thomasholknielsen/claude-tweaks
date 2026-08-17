---
record: 721
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 721: Run-dir ISO-timestamp is timezone-unspecified — a local-time mint sorts newest over a UTC sibling and steals fallback attribution; a contested mint lingers 24h

Surface: backend

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)
Defer-reason: genuinely-larger

## Current State

- `flow/claim-targets.md` (mint step), `flow/manifesto.md` Path conventions and `dispatch/SKILL.md` Step 4 say only "ISO-timestamp `YYYY-MM-DDTHHMMSS`" — no timezone. `date -u` appears solely in `_shared/pipeline-run-dir.md`'s standalone-fallback snippet, a section a Step 2.8 mint never loads. Two concurrent sessions on one machine minted `…T210742-spec-686-…` (UTC) and `…T230738-spec-688-…` (local, UTC+2) for the same instant.
- `bin/lib/hooks/context.js`'s fallback resolver attributes hook events to the newest unowned run dir. The local-time mint sorted newest and absorbed 4 foreign events (`skill_invoked` ×2, `session-end` ×2, from 3 other sessions) in ~90 s, all `attribution: "fallback"`. #607 records the attribution-noise symptom; this is a distinct cause (ordering flip from mixed timezones) and a distinct victim (an empty, never-adopted mint).
- On contest, `claim-targets.md` says the mint is left for "the reconciler's `isOrphanedMint` sweep … after 24h" — so by-the-book an empty mint keeps stealing attribution for a day. The session removed it by hand.

## Deliverables

- [ ] State UTC (`date -u`) once, in `_shared/pipeline-run-dir.md`, as the ISO-timestamp rule; `claim-targets.md`'s mint step, `manifesto.md` Path conventions and `dispatch/SKILL.md` Step 4 cite it. Conformance test: every `date +%Y-%m-%dT%H%M%S` under `skills/**` carries `-u`.
- [ ] Step 2.8 contest path: when this invocation minted the run dir itself (`PIPELINE_RUN_DIR` unset on entry) and it holds no `config.yml`, remove it immediately instead of deferring to `isOrphanedMint`.
- [ ] `resolveRun`'s fallback branch skips run dirs lacking `config.yml`/`run-state.json`, so an unadopted mint can never become the newest-run attribution target (relates #607).

## Acceptance Criteria

1. `grep -rn 'date +%Y-%m-%dT%H%M%S' skills/ | grep -v -- '-u' | wc -l` → `0`.
2. A contest on a self-minted run dir leaves no `.claude-tweaks/pipelines/*` entry for that run.
3. Unit test: the fallback attribution never selects a dir without `config.yml`; `npm test` green.

## Technical Approach

### Key Files
- `skills/_shared/pipeline-run-dir.md`
- `skills/flow/claim-targets.md`
- `skills/flow/manifesto.md`
- `skills/dispatch/SKILL.md`
- `bin/lib/hooks/context.js`
- `tests/bin-lib/hooks/`

## Gotchas

- Standalone run dirs (`*-capture-standalone`, `*-wrap-up-standalone`, `*-record-N-standalone`) never carry `config.yml` by design — key the resolver skip on the absence of **both** `decisions.md` and `run-state.json`, never on `config.yml` alone, or standalone runs lose attribution.
- Existing on-disk run dirs were minted in local time; for a transition period a new UTC-stamped dir may sort *older* than a stale local-time one — expected, not a regression.
- The immediate-removal step must only fire when this invocation minted the dir (`PIPELINE_RUN_DIR` unset on entry) — a dispatch-minted dir belongs to the caller.

**Related:** #607, #692

## Original request

Run-dir ISO-timestamp is timezone-unspecified — a local-time mint sorts newest over a UTC sibling and steals fallback attribution; a contested mint lingers 24h

Defer-reason: genuinely-larger

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

- `flow/claim-targets.md` (mint step), `flow/manifesto.md` Path conventions and `dispatch/SKILL.md` Step 4 say only "ISO-timestamp `YYYY-MM-DDTHHMMSS`" — no timezone. `date -u` appears solely in `_shared/pipeline-run-dir.md`'s standalone-fallback snippet, a section a Step 2.8 mint never loads. Two concurrent sessions on one machine minted `…T210742-spec-686-…` (UTC) and `…T230738-spec-688-…` (local, UTC+2) for the same instant.
- `bin/lib/hooks/context.js`'s fallback resolver attributes hook events to the newest unowned run dir. The local-time mint sorted newest and absorbed 4 foreign events (`skill_invoked` ×2, `session-end` ×2, from 3 other sessions) in ~90 s, all `attribution: "fallback"`. #607 records the attribution-noise symptom; this is a distinct cause (ordering flip from mixed timezones) and a distinct victim (an empty, never-adopted mint).
- On contest, `claim-targets.md` says the mint is left for "the reconciler's `isOrphanedMint` sweep … after 24h" — so by-the-book an empty mint keeps stealing attribution for a day. The session removed it by hand.

## Deliverables

- [ ] State UTC (`date -u`) once, in `_shared/pipeline-run-dir.md`, as the ISO-timestamp rule; `claim-targets.md`'s mint step, `manifesto.md` Path conventions and `dispatch/SKILL.md` Step 4 cite it. Conformance test: every `date +%Y-%m-%dT%H%M%S` under `skills/**` carries `-u`.
- [ ] Step 2.8 contest path: when this invocation minted the run dir itself (`PIPELINE_RUN_DIR` unset on entry) and it holds no `config.yml`, remove it immediately instead of deferring to `isOrphanedMint`.
- [ ] `resolveRun`'s fallback branch skips run dirs lacking `config.yml`/`run-state.json`, so an unadopted mint can never become the newest-run attribution target (relates #607).

## Acceptance Criteria

1. `grep -rn 'date +%Y-%m-%dT%H%M%S' skills/ | grep -v -- '-u' | wc -l` → `0`.
2. A contest on a self-minted run dir leaves no `.claude-tweaks/pipelines/*` entry for that run.
3. Unit test: the fallback attribution never selects a dir without `config.yml`; `npm test` green.

## Technical Approach

### Key Files
- `skills/_shared/pipeline-run-dir.md`
- `skills/flow/claim-targets.md`
- `skills/flow/manifesto.md`
- `skills/dispatch/SKILL.md`
- `bin/lib/hooks/context.js`
- `tests/bin-lib/hooks/`

**Related:** #607, #692
