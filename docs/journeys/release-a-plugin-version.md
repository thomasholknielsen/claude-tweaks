---
files:
  - bin/release.js
  - bin/lib/release/run.js
  - bin/lib/release/precheck.js
  - bin/lib/release/compose.js
  - bin/lib/release/mirror.js
---

# Release a Plugin Version

**Persona:** claude-tweaks maintainer (or a Claude session concluding a feature branch) with reviewed work merged to local `main`, ready to ship it to the marketplace.
**Goal:** Ship a release — version bump, CHANGELOG entry, shipped-versions record, push, marketplace mirror — as one invocation, with every collision hazard checked mechanically instead of by memory.
**Entry point:** A terminal at the repo root, on a clean `main`, with `gh` authenticated.
**Success state:** The console prints `released vX.Y.Z`; `origin/main` holds one commit containing exactly `.claude-plugin/plugin.json`, `CHANGELOG.md`, and `docs/shipped-versions.tsv`; the marketplace repo's `marketplace.json` mirrors the new version.

## Steps

### 1. (Optional) Preview with a dry run — terminal
- **URL:** `node bin/release.js minor "One-line summary" --dry-run`
- **Action:** Run with `--dry-run` to see every intended action — the computed version, the CHANGELOG heading, the tsv line, and the push/mirror steps — with nothing written.
- **Expect:** Four `[dry-run] would …` lines and `[dry-run] vX.Y.Z — no changes written`, exit 0. The default (without the flag) is a live release — the flag is the preview, not the other way round.

### 2. Run the release — terminal
- **URL:** `node bin/release.js <minor|patch> "One-line summary"` (`minor` for features, `patch` for fixes — CLAUDE.md's Versioning convention)
- **Action:** Run it. The script guards the branch (`main` only) and a clean tree, fetches `origin/main`, and runs the collision pre-check across every source a concurrent session could have claimed a number through: origin/main's tip, unpushed local `main`, sibling worktree branches, and unexecuted plan documents.
- **Expect:** On a clean state — one commit with exactly the release trio, an ancestry re-check against a fresh fetch, a push, then `marketplace mirrored`. Exit 0.

### 3. If it aborts — read the conflict list, don't override — terminal
- **Action:** A collision abort names each conflicting source (`worktree-branch: … claims vX.Y.Z`, `plan-claim: …`) and prints `Suggested renumber: vX.Y.Z`. A divergence abort means someone pushed during compose — rebase and re-run.
- **Expect:** No partial state: aborts happen before the commit (collision, stray staged file) or before the push (divergence). Never force; never renumber a version that already shipped (see CLAUDE.md's Releasing judgment calls).
