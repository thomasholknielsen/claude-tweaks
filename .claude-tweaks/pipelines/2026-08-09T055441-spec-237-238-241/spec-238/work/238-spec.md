---
record: 238
origin: capture
risk: medium
effort: medium
ceremony: standard
grants: [build]
surface: backend
---
# 238: Per-run record cache and one-shot label bootstrap

Surface: backend

## Current State

One ordinary unit of work (capture → specify → backlog refine → dispatch → flow materialize → wrap-up → demo) issues 43 gh invocations on the happy path: 11 label-existence probes, 10 reads, 17 mutations, 5 infra calls. The same record body is fetched at least 5 separate times (specify, backlog ×3, materialize, demo ×2) with no cache between skills — each skill's prose mandates its own `gh issue view`. Label bootstrap re-probes the same ~11 labels every run because `_shared/label-bootstrap.md` mandates per-consumer bootstrap of "only the labels they are about to apply," with no repo-level marker recording that bootstrap ever completed.

## Deliverables

- Per-run record cache: the first stage that fetches a record in a pipeline run writes it to `{run-dir}/work/record-{n}.json`; subsequent stages in the same run read the cache instead of re-fetching. Build start re-verifies the record's premise against the live tracker (the IL-71/IL-109 check) — that one deliberate re-fetch refreshes the cache; everything downstream of it reads cached.
- One-shot label bootstrap: a marker (a repo label like `claude-tweaks:bootstrapped-v{N}`, or a note in `.claude-tweaks/policy.yml` — decided at build) recording that the canonical label set exists; consumers probe only when the marker is absent or its version is behind the label-bootstrap file's.
- `_shared/label-bootstrap.md` and each mandating call site updated to the marker-first flow; `_shared/work-record.md`'s config-key table documents the cache file as run-dir state.

## Acceptance Criteria

- The happy-path gh-call count for one unit of work drops from 43 to ≤ 28, re-traced by the same method as the audit (count every mandated invocation across the seven stages' prose).
- A record edited on GitHub mid-run is still caught: the build-start premise re-verification reads live and updates the cache, and any stage that mutates the record (label add/remove, body edit) invalidates or rewrites the cache in the same step.
- Standalone skill invocations (no run dir) behave exactly as today — the cache exists only where a run dir does.
- Bootstrap on a virgin repo still creates the full label set; on a bootstrapped repo, zero `gh label list` probes on the happy path.

## Technical Approach

Prose-level change across the mandating skills plus one small conventions section in `_shared/pipeline-run-dir.md` naming the cache file and its invalidation rule. No new Node modules required; the marker-version comparison can reuse the label-bootstrap file's own list as the version source (hash or count).

## Gotchas

- The cache is a premise-decay hazard by construction (IL-109): the rule must be stated as "cache serves reads; every mutation writes through; build start re-verifies live" — an unconditional rule, not an enumeration of stages (IL-14).
- Multi-record runs: cache is per-record file, and dispatch's group agents each have their own run dir — no cross-session sharing, which is the safe default.
- The bootstrap marker must be versioned or it silently stops covering labels added later (IL-85: a compatibility path with no recorded removal/refresh condition).
- `/tidy` and `/help` scan issues outside any run dir — they keep fetching live; only pipeline stages inside a run participate.
- #237's run-dir memo stamps touch the same `run-state.json`/run-dir conventions — same wave, sequence within one worktree to avoid conflicting shapes.

## Original request

Per-run record cache and one-shot label bootstrap

**Related:** #237

Context: Session audit: one unit of work costs 43 gh invocations; the record is re-fetched 5+ times across specify/backlog/materialize/demo with no cache; 11 gh label list probes repeat every run.

Scope: Fetch the record once into {run-dir}/work/record-N.json and have every stage read it (re-verify premise only at build start per IL-71/IL-109); bootstrap labels once per repo behind a marker instead of per-consumer probes.
