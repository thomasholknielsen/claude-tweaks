# Docs-Health Integration for /wrap-up Step 6.1

Loaded by `/claude-tweaks:wrap-up` Step 6.1 to judge the health of docs this work actually touched, and to detect documentation this work should have produced but didn't. Two independent checks — D1 judges existing docs, D2 judges the diff for missing coverage.

## D1: Inline JUDGE application

**Scope:** every doc under `docs/**` that this work edited or newly created (`git diff --name-only` against the run's base, filtered to `docs/**/*.md`). Registry-matched-but-unedited docs are Step 6.1's existing "should this have been updated" concern — not this check's job; don't re-scope this to include them.

For each doc in scope:

1. Read the doc in full.
2. Apply the full JUDGE procedure from `_shared/criteria-docs-diataxis.md` (genre-drift including placement-fit, depth-mismatch, findability, staleness including freshness-dependencies, dual-persona misleading-risk) — the identical procedure `/claude-tweaks:docs-health` Step 3 applies, reused inline here rather than invoking `/claude-tweaks:docs-health` as a nested skill call (same reuse pattern Step 7 already applies to `_shared/harness-health-analysis.md`).
3. Run the same verify gate `/claude-tweaks:docs-health` Step 3.5 applies: is each finding real, actionable, and correctly `misleads`-tagged? Drop any that fail.

Route surviving findings by `classification`:

- **`additive`** → collect as `[doc] {file} — {description}` rows, folded into Step 6's existing configuration-update batch table (Step 9's Configuration Updates section) — applied inline in Step 10 exactly like any other approved doc edit.
- **`restructural`** → file as a `by:docs-health` GitHub issue via the existing dedup/filing CLI machinery, scoped to exactly this run's touched-doc IDs instead of a `next-target` rotation pick:

  ```bash
  gh issue list --label by:docs-health --state all --json number,state,labels,body --limit 500 > /tmp/wrapup-docs-health-issues-raw.json
  ```

  Parse via `extractFingerprint` (`bin/lib/issues/record.js`) into `{ number, state, labels, fingerprint }` objects, same as `/claude-tweaks:docs-health` Step 4, and write to `/tmp/wrapup-docs-health-issues.json`. Write this check's `restructural` findings to `/tmp/wrapup-docs-health-findings.json` in the same finding shape `_shared/criteria-docs-diataxis.md`'s "Emitting a finding" section defines, then:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" validate-findings /tmp/wrapup-docs-health-findings.json \
    --root "${ROOT:-$PWD}" --issues /tmp/wrapup-docs-health-issues.json --dry-run \
    > /tmp/wrapup-docs-health-payloads.json
  ```

  `--dry-run` here — wrap-up's own approval gate (Step 8.6 Review Console / Step 9 batch decision) is the point of approval, not `validate-findings`'s own dedup-and-file path. After the user approves at that gate, re-run the identical command without `--dry-run` so the cursor/cache state actually persists, then file each surviving payload with `gh issue create` exactly as `/claude-tweaks:docs-health` Step 6 does (same label set: `by:docs-health`, the scoring labels from that skill's classification table's `restructural` row, `ready`, `docs-health:restructural`).

## D2: Missing-documentation gap-detection

**Scope:** this work's full diff, not any existing doc — this check's input is code, so it never runs against the docs-health criteria fragment (which only ever takes a doc as input).

Ask: did this work introduce a new subsystem, skill, or architectural pattern with **zero existing doc coverage anywhere** in the project — not merely a small change that doesn't match a registry Auto-detect pattern, but something a future reader would have no doc to go to at all? This is a deliberately high bar. Examples that clear it: a new skill directory, a new top-level architectural pattern, a new user-facing capability with no existing doc even adjacent to it. Examples that don't: a new function in an already-documented module, a bug fix, a config tweak.

On a hit:

1. Infer the matching genre from what the new subsystem actually is (see `_shared/criteria-docs-diataxis.md` Dimension 1's "what it actually does" table) — a new skill's user-facing guide is typically How-To-shaped; a new architectural pattern is typically Explanation-shaped; a new API surface is typically Reference-shaped.
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Step 6 batch table as D1's additive findings.
3. On approval, Step 10 scaffolds the new file from the matching section of `skills/_shared/diataxis-genre-templates.md`, then fills in real content from this work's own session context — unlike `/claude-tweaks:init` Phase 8.5's missing-doc detection (which only backlogs a pointer to the template, since it's scanning an unfamiliar codebase with no session context to fill anything in from), wrap-up has full context on what was just built and writes real content immediately.

Never propose more than one new doc per genuinely new subsystem — if the new subsystem spans multiple genres worth of content (e.g. both a How-To and a Reference), propose each as its own row rather than one doc trying to be two genres.
