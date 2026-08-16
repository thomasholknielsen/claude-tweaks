# Releasing (two repos)

A release touches **both** this repo and the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`).

**The whole-branch review gates the bump.** When a release concludes multi-task work, run the broad cross-task review *before* step 1, not as a later step in the same plan — per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers sitting in different files. A plan that schedules its version bump and push as its final task has, by that ordering alone, decided that any cross-task defect ships and is fixed as a patch. That is exactly what happened in v6.48.0 → v6.48.1 (`[IL-97]`), where the review found a Critical roughly twenty minutes after the release it should have blocked.

**Invocation:** `node bin/release.js <minor|patch> "<summary>"` from a clean `main` — runs the 5-source collision pre-check (origin/main, unpushed local main, sibling worktree branches, plan-document claims), lands bump + CHANGELOG entry + `docs/shipped-versions.tsv` line in one commit, re-checks ancestry, pushes, and mirrors the marketplace catalog from its live `main` via the contents API. Aborts loudly on any collision or divergence — `--dry-run` previews. Fixture-tested in `tests/bin-lib/release/`; never invoke a live run as a test (`[IL-73]`).

**Judgment calls the script cannot make:**
- minor vs patch (feature vs fix — CLAUDE.md's Versioning convention), and the one-line summary.
- Whether a collision means renumber-yours or keep (the script suggests; a shipped version's number is never renumbered — see the shipped-vs-never-shipped split below).
- If a renumber is forced: whether the old number reached `main`'s tip. Never shipped → renumber the CHANGELOG heading and tsv line. Shipped → keep both and add a second entry/line pointing at it (a duplicate heading is a parse failure; deleting a shipped tsv line erases release history) — `e4a79904`/6.64.1.
- `metadata.version` in the marketplace catalog is the marketplace's own scheme — the mirror never touches it; bump it manually on catalog-shape changes only.

The mechanics live in `bin/release.js` (`--help`) and `bin/lib/release/`.

## After the push: the CI gate

Every push to `main` (including the release script's own push) triggers the `test` workflow (`.github/workflows/test.yml`), which runs the full `npm test` suite on a full-history checkout. A red first run after a release means the shipped tree fails its own gates — check `gh run list --workflow test --limit 1` before shipping anything further.

## After the merge: which release carried it

A pr-first merge that lands minutes before another session's bump is swept into that build with no CHANGELOG line of its own — nothing in the release step notices, because the release step never ran for it. `_shared/pr-first-merge.md` Step 4.1 asks the question once, before reconcile:

```
node bin/release.js status --merge <merge-sha> --records <n>[,<m>...] --ref origin/main [--json | --backfill]
```

It resolves the *oldest* version-bump commit reachable from `--ref` (a commit that changed `.claude-plugin/plugin.json#version`) that has the merge as an ancestor, then checks whether that version's CHANGELOG entry names each record. The outcomes, one line each: `not yet in a release — bump pending`; `already carried by vX.Y.Z — every record named in CHANGELOG`; `already carried by vX.Y.Z — CHANGELOG backfill needed: #A, #B`; `already carried by vX.Y.Z — CHANGELOG has no vX.Y.Z entry; backfill needed: #A, #B` (the version bumped but its CHANGELOG entry was never written — a release-process defect `tests/changelog-coverage.test.js` already fails the suite on). `/claude-tweaks:flow`'s closing report carries the line verbatim. The subcommand never calls `gh` and never guesses record numbers — the same invocation works under `local-merge`.

**Applying a staged backfill.** On either backfill outcome, Step 4.1 stages the `### also carried in this build` subsection (`--backfill` output) at `{run-dir}/staged/release-backfill-vX.Y.Z.md` — this run's own Review Console has already closed by merge time, so the staged file is this run's audit + revert artifact, archived with the run dir by Step 4.2's reconcile, not a live console row. Approving it means: scratch worktree, append the section to CHANGELOG.md's `## vX.Y.Z` entry (before the next `## v` heading — the label is what keeps it from reading as a contemporaneous release note; the convention is stated at the top of `CHANGELOG.md`), `node --test tests/changelog-coverage.test.js`, PR, merge. Never edit CHANGELOG.md in the main checkout — Step 4's no-commit rule holds for the backfill too. This is detection, not prevention — a release-time gate that refuses to bump while a merge since the last bump is unnamed is the natural companion (a backlog record for it is staged by the run that shipped this check).
