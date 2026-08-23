---
record: 549
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 549: Release note: announce the tidy-aggressiveness default flip (conservative → moderate)

Surface: infra

## Current State

PR #526 (specs #517/#518/#519, merged 2026-08-16T07:37:36Z) flipped the
`tidy-aggressiveness` default from `conservative` to `moderate` — a distributed
behavior change under expand-contract discipline (CLAUDE.md): under `moderate`,
`/claude-tweaks:tidy` now auto-applies reversible git-tracked judgment cleanups
(`local-files` deletes/absorbs/defers) that previously only staged for approval;
outward-facing GitHub writes still stage regardless of aggressiveness.
`conservative` remains available as the documented opt-down in
`.claude-tweaks/policy.yml`.

This record was filed by the ledger resolve gate at fix time, before the release
had shipped, on the assumption that the announcement would ride the next
`node bin/release.js` run for the version carrying PR #526. That assumption is
now stale: the merge landed only six minutes before `v6.85.0`'s release commit
(`6ca709d3`), so PR #526 already shipped in `v6.85.0` — confirmed by
`node bin/release.js status --merge 9c577350e92777d510f707c21213640e0ff8dc32 --records 517,518,519 --ref origin/main`,
which reports `already carried by v6.85.0 — every record named in CHANGELOG`.

That check only verifies the record numbers are *named* in the `v6.85.0`
CHANGELOG.md entry — and they are, generically ("Tidy report redesign +
reconcile-backed auto-apply (#517-#519)"). The entry never spells out the
specific behavior change: the `tidy-aggressiveness` default flip and what it
means for anyone running `/claude-tweaks:tidy` without an explicit
`.claude-tweaks/policy.yml` override. That gap — not a missing future release —
is what this record now targets: an amendment to the already-published
`v6.85.0` CHANGELOG.md entry, not a hook into a future `bin/release.js` run.

## Deliverables

- Amend the existing `## v6.85.0` entry in `CHANGELOG.md` to explicitly name
  the `tidy-aggressiveness` default change (`conservative` → `moderate`) and
  its user-visible consequence — `/claude-tweaks:tidy` now auto-applies
  reversible git-tracked judgment cleanups by default, with `conservative`
  remaining available as an explicit opt-down in `.claude-tweaks/policy.yml`.
- Close this record once the amendment lands on `main`.

## Acceptance Criteria

- `CHANGELOG.md`'s `## v6.85.0` entry contains a sentence (in the entry body,
  or a clearly-labelled addition within that entry — never a new top-level
  `## vX.Y.Z` heading, since `v6.85.0` already shipped) naming the
  `tidy-aggressiveness` default flip from `conservative` to `moderate` and
  describing the behavior change: `moderate` auto-applies reversible
  git-tracked judgment cleanups (`local-files` deletes/absorbs/defers) that
  previously staged; outward-facing GitHub writes still stage regardless;
  `conservative` remains available via `.claude-tweaks/policy.yml`.
- `node --test tests/changelog-coverage.test.js` and `node --test
  tests/changelog.test.js` both pass against the amended file.
- The edit reaches `main` via a PR from a scratch worktree (per
  `docs/releasing.md`: "Never edit CHANGELOG.md in the main checkout"), not a
  direct commit in the main checkout.
- Issue #549 is closed once the amendment merges.

## Technical Approach

`CHANGELOG.md`'s three documented `###` subsection conventions (branch-numbered,
"also carried in this build") are both for backfilling a *missing record*, not
enriching an existing entry's prose — neither is the right shape here, since
`#517`/`#518`/`#519` are already named. The straightforward approach is a plain
prose addition to the existing `## v6.85.0` entry body (its second paragraph),
inserted before the next `## v` heading so it reads as part of that entry, not
a new one.

Work in a scratch worktree (never the main checkout, per `docs/releasing.md`'s
"Never edit CHANGELOG.md in the main checkout" rule, which the backfill flow
already follows for the analogous case): edit `CHANGELOG.md`'s `## v6.85.0`
entry, run `node --test tests/changelog-coverage.test.js
tests/changelog.test.js`, open a PR, merge, then close #549 referencing the
merged PR. Refs #519.

## Gotchas

- The original framing ("consume this record in the `node bin/release.js`
  summary for the version that includes PR #526, then close it") assumed the
  release hadn't shipped yet. It had — six minutes after the PR merged. Don't
  wait for a future release step; the target is an amendment to the
  already-published `v6.85.0` entry.
- `node bin/release.js status --merge <sha> --records <n,...>` reporting
  "every record named in CHANGELOG" is not the same bar as this record's
  ask — it confirms the record numbers appear, not that the specific
  behavior-change detail is spelled out. Don't treat that status output alone
  as grounds to close this record without editing.
- This is a `CHANGELOG.md`-only content edit with no code change — small,
  reversible, no behavioral surface of its own.

## Original request

Release note: announce the tidy-aggressiveness default flip (conservative → moderate)

Origin: ledger resolve gate (run 2026-08-16T010137-spec-517-518-519, item 6 — auto-routed at unattended ceiling)

The release that ships PR #526 (specs #517/#518/#519) must announce the `tidy-aggressiveness` default change `conservative` → `moderate` in its release notes — a distributed behavior change under expand-contract discipline (CLAUDE.md). Under `moderate`, tidy auto-applies reversible git-tracked judgment cleanups (`local-files` deletes/absorbs/defers) that previously staged; outward-facing GitHub writes still stage. `conservative` remains the documented opt-down (`.claude-tweaks/policy.yml`).

Blocker at fix time: awaits the release step — release timing and notes are the maintainer's approval to give.

Consume this record in the `node bin/release.js` summary for the version that includes PR #526, then close it. Refs #519.

