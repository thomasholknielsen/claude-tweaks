# Releasing (two repos)

A release touches **both** this repo and the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`).

**The whole-branch review gates the bump.** When a release concludes multi-task work, run the broad cross-task review *before* step 1, not as a later step in the same plan — per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers sitting in different files. A plan that schedules its version bump and push as its final task has, by that ordering alone, decided that any cross-task defect ships and is fixed as a patch. That is exactly what happened in v6.48.0 → v6.48.1 (`[IL-97]`), where the review found a Critical roughly twenty minutes after the release it should have blocked.

**Invocation:** `node bin/release.js <minor|patch> "<summary>"` from a clean `main` — runs the 5-source collision pre-check (origin/main, unpushed local main, sibling worktree branches, plan-document claims), lands bump + CHANGELOG entry + `docs/shipped-versions.tsv` line in one commit, re-checks ancestry, pushes, and mirrors the marketplace catalog from its live `main` via the contents API. Aborts loudly on any collision or divergence — `--dry-run` previews. Fixture-tested in `bin/lib/release/tests/`; never invoke a live run as a test (`[IL-73]`).

**Judgment calls the script cannot make:**
- minor vs patch (feature vs fix — CLAUDE.md's Versioning convention), and the one-line summary.
- Whether a collision means renumber-yours or keep (the script suggests; a shipped version's number is never renumbered — see the shipped-vs-never-shipped split below).
- If a renumber is forced: whether the old number reached `main`'s tip. Never shipped → renumber the CHANGELOG heading and tsv line. Shipped → keep both and add a second entry/line pointing at it (a duplicate heading is a parse failure; deleting a shipped tsv line erases release history) — `e4a79904`/6.64.1.
- `metadata.version` in the marketplace catalog is the marketplace's own scheme — the mirror never touches it; bump it manually on catalog-shape changes only.

The mechanics live in `bin/release.js` (`--help`) and `bin/lib/release/`.
