---
record: 232
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: infra
---
# 232: Add automated CI gate running npm test on push/PR

Surface: infra

## Current State

The only workflow under `.github/workflows/` is `eval-benchmark.yml`, which is `workflow_dispatch`-only (manual trigger) and runs eval-harness scenarios, not the plugin's own `npm test` suite. There is no automated CI gate that runs `npm test` on push or pull request — the 2500+ test suite currently only runs when a human or agent remembers to run it locally. This matters more now: four parallel work streams (#233/#234 and the dispatched #235–#241 waves) are about to ship releases concurrently.

## Deliverables

A GitHub Actions workflow under `.github/workflows/` that runs `npm test` on push to `main` and on pull requests. `npm run test:perf` stays excluded (timing budgets are machine-sensitive; deliberately not part of `npm test` per docs/plugin-structure.md).

## Acceptance Criteria

- New workflow file triggers on `push` (branch `main`) and `pull_request`.
- Runs `npm test` on a supported Node version (Node 18+ per CLAUDE.md's Stack table); fails the check when any test fails.
- Does not interfere with the existing `eval-benchmark.yml` `workflow_dispatch` trigger.
- A `concurrency` group cancels superseded runs on the same ref (twenty pushes to `main` a day is the measured cadence — queued stale runs would pile up).
- The workflow passes green on its own introduction PR/push.

## Technical Approach

Single small YAML: checkout, setup-node (LTS ≥18, npm cache), install, `npm test`. Install step matches the repo's actual state (`npm ci` if a lockfile is committed, `npm install` otherwise — verify at build). No matrix; one Node version keeps the gate fast at this push cadence.

## Gotchas

- #104 documents nondeterministic hooks/perf test flaps under parallel-agent load; a CI runner is a different load profile, but if the suite flaps there, surface it rather than adding silent retries — a flaky gate at 20 pushes/day trains everyone to ignore it.
- `evals/` is a separate Node project with its own package.json — the workflow must not install or run it.
- Some hooks tests exercise git operations; verify the suite passes in a fresh clone (CI has no ~/.claude, no plugin cache) before assuming local green transfers.
- Keep triggers narrow: `push` on `main` only, plus `pull_request` — worktree feature branches are local-only in this repo's flow, but a broad `push: '**'` would double-run every PR.

## Original request

Add automated CI gate running npm test on push/PR

### Current State

The only workflow under `.github/workflows/` is `eval-benchmark.yml`, which is `workflow_dispatch`-only (manual trigger) and runs eval-harness scenarios, not the plugin's own `npm test` suite. There is no automated CI gate that runs `npm test` on push or pull request — the 2500+ test suite currently only runs when a human or agent remembers to run it locally.

### Deliverables

Add a GitHub Actions workflow that runs `npm test` (and optionally `npm run test:perf`) on push to `main` and on pull requests.

### Acceptance Criteria

- New workflow file under `.github/workflows/` triggers on `push` (to `main`) and `pull_request`
- Runs `npm test` using a supported Node version (Node 18+ per CLAUDE.md's Stack table)
- Fails the check when any test fails
- Does not interfere with the existing `eval-benchmark.yml` workflow_dispatch trigger

Origin: /claude-tweaks:init Update Mode reconnaissance (Phase 2a/2e identity and workflow detection).
