---
record: 234
origin: capture
risk: medium
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 234: Release automation: bin/release.js plus a marketplace mirror action

Surface: backend

## Current State

The release procedure lives as prose in CLAUDE.md's Releasing section: 16 discrete manual actions across two repos (this repo and `thomasholknielsen/claude-tweaks-marketplace`), of which only the CHANGELOG entry and `docs/shipped-versions.tsv` append are test-enforced (`tests/changelog-coverage.test.js`, `tests/shipped-record.test.js`, plus a warn-tier hook). The 5-source version-collision pre-check (fetch origin/main; `git log origin/main -- .claude-plugin/plugin.json`; grep unexecuted plans; sibling worktree branches; unpushed local `main`) and the entire marketplace mirror are prose-only. Measured cadence: ~20 releases/day (22 on 2026-08-07, 18 on 2026-08-08), 30% patch ratio (61 of 203), and at least seven incident-log entries (IL-12, 59, 95, 98, 99, 104, 109) trace to this ritual being manual.

## Deliverables

- `bin/release.js` (+ `bin/lib/release/` modules): runs the 5-source collision pre-check, bumps `.claude-plugin/plugin.json`, stubs the `## vX.Y.Z — {summary}` CHANGELOG entry (heading shape `bin/lib/changelog.js` parses), appends the `shipped-versions.tsv` line, enforces same-commit for bump+changelog+tsv, and pushes — aborting with a clear message on any collision or divergence.
- Marketplace mirror automation: either the script mirrors via `gh api` against the marketplace repo (reading current values from its `origin/main`, never a working checkout), or a GitHub Action in the marketplace repo triggered by this repo's push-to-main. Keeps `plugins[].version` and `plugins[].description` aligned with `plugin.json` and derives `metadata.version` from what `origin/main` currently holds.
- CLAUDE.md's Releasing section shrinks to the invocation plus the judgment calls the script can't make (coordinates with #233's eviction of the section).
- Fixture-driven tests for the pre-check and composition logic — never exercising a live push (the health-CLI lesson: a "test invocation" that writes durable shared state is not a test).

## Acceptance Criteria

- One command performs a complete release from a clean `main`, ending with both repos pushed.
- The collision pre-check detects, in fixtures, each of: a bump already on `origin/main`, a committed-but-unmerged bump on a sibling worktree branch, an already-executed bump on unpushed local `main`, and a plan document claiming the number — and renumbers or aborts loudly rather than proceeding.
- Bump, CHANGELOG entry, and tsv line land in one commit; `tests/changelog-coverage.test.js` and `tests/shipped-record.test.js` stay green.
- The marketplace mirror never reads the stale working checkout: mirrored values are derived from the marketplace repo's `origin/main` (or the Action's checkout at trigger time).
- A `--dry-run` mode prints every action without writing; the default is decided at build time and documented.

## Technical Approach

Node modules under `bin/lib/release/` (flat sibling directory per repo convention), reusing `bin/lib/changelog.js` for heading composition/parsing. Git/gh via `execFileSync`. The mirror decision (script-driven `gh api` vs marketplace-repo Action) is a build-time tradeoff: the Action removes the second repo from the human loop entirely but adds CI surface; the script keeps everything in one invocation but still runs under the releasing session's credentials. Start with the script path, leave the Action as a follow-up if cross-repo latency or auth friction shows up.

## Gotchas

- An unpushed local `main` can hold an executed bump on no branch, in no plan, invisible to `git log origin/main` — the pre-check must read local `main` directly (this collided three times from exactly there).
- Marketplace values must come from `origin/main`, not the working checkout — that clone's staleness is silent because `git status` compares against the stale tracking ref.
- `docs/shipped-versions.tsv` is the release-history authority; never reconstruct from a `--first-parent` git walk (removed in v6.45.0 for instability).
- The race window between pre-check and push cannot be fully closed by a script — it can only be narrowed to one fetch-check-push sequence; the script should re-fetch immediately before pushing.
- The script is itself release infrastructure: a defect ships bad releases ~20×/day. Fixture tests only; no test may perform a real push.
- Two sessions bumping to the same version merge with no textual conflict — the collision is semantic, which is why the pre-check must run at push time, not just at authoring time.

## Original request

Release automation: bin/release.js plus a marketplace mirror action

**Related:** #233

Context: The release ritual is 16 manual actions across 2 repos (3 test-enforced), running ~20x/day at a 30% patch rate; at least 7 incident-log entries (IL-12, 59, 95, 98, 99, 104, 109) are release-collision incidents.

Scope: Script the 5-source collision pre-check, bump, CHANGELOG stub, shipped-versions.tsv append, push; mirror the marketplace repo via the script or a GitHub Action on push-to-main so the second repo leaves the human loop. Shares files with the CLAUDE.md Releasing-section eviction.
