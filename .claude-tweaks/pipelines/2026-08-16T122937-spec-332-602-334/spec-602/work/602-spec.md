---
record: 602
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 602: Rename worktree.always → worktree-always: hook read-path alias, prose sweep, own policy.yml migration

Surface: backend

## Current State

#332 (the policy key naming convention + rename program) sets the rule — policy keys are flat kebab-case, never dotted — and renames the other dotted keys, but carves `worktree.always` out to this record because it is different in kind from the rest:

- **It bypasses the resolver.** The hook reads it through a bespoke literal — `bin/lib/policy.js:34` `isWorktreeAlwaysOn()` returns `parsePolicy(repoRoot)['worktree.always'] === 'true'` — so the `RENAMED_KEYS` alias machinery that makes every other rename a two-array change does not reach it. `bin/lib/hooks/pre-tool-use.js` and `session-start.js` consume `isWorktreeAlwaysOn` (`worktree-reap.js` requires `policy.js` for `readIntegrationBranch`, not the gate read — corrected 2026-08-16). `session-start.js:166` names the key verbatim in its user-facing "this project requires an isolated worktree (policy: worktree.always …)" message.
- **It is the hook's hot path and the most test-pinned key in the schema.** 15 test files cite it (`hooks-pre-tool-use`, `hooks-gate-coverage`, `hooks-policy-exemption`, `hooks-session-start`, `hooks-worktree-detect`, `hooks-dispatcher`, `teardown-gate`, `pr-early-run-lifecycle`, `sweep-backstop`, `resolve-policy-lib`, `resolve-policy-cli`, `policy`, `policy-schema`, `bin-lib/model-profiles/policy-fragment`, plus the frozen fixture `tests/fixtures/resolve-policy/policy-basic.yml`), and ~70 live prose files under `skills/`, `docs/`, `README.md` — including `skills/_shared/policy-schema.md`'s `### worktree.always coverage — canonical` block that `tests/hooks-gate-coverage.test.js` binds the gate's actual coverage to.
- **This repo's own `.claude-tweaks/policy.yml` sets it** (`worktree.always: true`), so the migration is exercised live here from the first session after merge, and #537's path-scoped exemption for `policy.yml` edits is what lets that line be updated from a main checkout.

Until this record lands, #332's naming-conformance test carries `PENDING_RENAMES = ['worktree.always']`. This record empties it.

## Deliverables

1. **Rename `worktree.always` → `worktree-always`** in `POLICY_KEYS` (metadata preserved) with a `RENAMED_KEYS` alias (identity `migrate`, `renamed-from` attribution) and an entry in `skills/_shared/policy-deprecations.md` under the shared removal predicate.
2. **Hook read path honors both names for the alias window, new name wins.** `isWorktreeAlwaysOn()` reads `worktree-always`, falling back to `worktree.always` only when the new key is absent — the same old/new precedence rule the resolver applies. Implement by routing through the shared alias resolution in `bin/lib/policy-schema.js` (preferred, so the hook and the resolver cannot disagree about which line wins) or, if that module's resolve entry point is unsuitable for the hot path, by a two-key read in `policy.js` with a comment naming the alias entry it mirrors. Either way, one place decides precedence.
3. **`PENDING_RENAMES` emptied** in the naming-conformance test #332 added; the allowance and its comment are deleted, not left as `[]`.
4. **Citation sweep** — every live occurrence of `worktree.always` under `skills/`, `bin/`, `tests/`, `docs/`, `README.md`, `agents/`, `hooks/` becomes `worktree-always`, including: `policy-schema.md`'s coverage block heading and body (keep the `<!-- gate-coverage:begin/end -->`-style markers `tests/hooks-gate-coverage.test.js` anchors on intact); `session-start.js`'s user-facing message; `bin/lib/policy.js`'s header comment (which currently describes the file as reading "flat dotted-key project policy … `key.path: value`" — reword to the flat kebab-case convention #332 documents); the frozen fixture `tests/fixtures/resolve-policy/policy-basic.yml` (add a second frozen fixture, or a test case, that still carries the *old* spelling to pin the alias — the alias is a real input the parser must keep handling); `skills/init/**` sites that *write* `worktree.always: true` into generated policy files (`worktree-policy-finalization.md`, `isolated-write-step.md`, `bootstrap-steps.md`, and any other writer — grep, don't trust this list). Tombstones exempt: the `RENAMED_KEYS` entry, its `policy-deprecations.md` entry, historical narrative in `docs/incident-log.md` and `docs/shipped-versions.tsv`, archived `.claude-tweaks/pipelines/**`.
5. **This repo's own `.claude-tweaks/policy.yml`** gains `worktree-always: true` as its first line and, during the transition, KEEPS the old `worktree.always: true` line beneath it with a dated comment — the plugin build a session actually runs is the *installed* one, whose `bin/lib/policy.js` reads the old literal with no alias, so a file carrying only the new name would silently disarm the gate for this repo on merge until the release shipping #602 is installed. Delete the old line once the installed build's `plugin.json` version is at or above that release (amended 2026-08-16 during the build).
6. **`/claude-tweaks:init --update`'s drift check** surfaces the stray old line via `auditPolicy`'s `renamedKeys` — verify that already happens generically (it should, via the alias entry) and state so; if the policy review renders `worktree.always` by literal anywhere in `skills/init/**` or `skills/help/policy.md`, sweep it.

## Acceptance Criteria

- `node bin/resolve-policy.js --values worktree-always` resolves (default `false`); `--values worktree.always` resolves the replacement key's value (the alias contract pinned by `tests/resolve-policy-lib.test.js` — `unknown-key` is reserved for retirements with `replacedBy: null`; corrected 2026-08-16 during the build).
- A `policy.yml` containing only `worktree.always: true` → `isWorktreeAlwaysOn()` returns `true` AND the resolver reports `worktree-always` = `true` with `"renamed-from": "worktree.always"`; containing only `worktree-always: true` → both true, no `renamed-from`; containing `worktree-always: false` and `worktree.always: true` → both **false** (new key wins). Three test cases, in `tests/policy.test.js` (hook reader) and `tests/resolve-policy-lib.test.js` (resolver).
- The pre-tool-use gate denies a covered edit outside a worktree under a `policy.yml` that says `worktree-always: true` — the existing `tests/hooks-pre-tool-use.test.js` cases pass with the fixture spelling updated, plus one case under the old spelling to prove the alias window.
- `tests/hooks-gate-coverage.test.js` still binds the gate to `policy-schema.md`'s coverage block after the heading/body rename.
- #332's naming-conformance test has no `PENDING_RENAMES` and passes.
- `grep -rnF "worktree.always" skills bin tests docs README.md agents hooks` returns only the tombstone sites named in Deliverable 4 plus the deliberate old-spelling alias tests/fixtures (list them in the change).
- `.claude-tweaks/policy.yml` in this repo reads `worktree-always: true`; a session started on the merged commit gets the worktree gate (SessionStart message names `worktree-always`).
- `npm test` green.

## Technical Approach

- Build **after** #332 (which adds the convention, the test, and the deprecations-predicate wording this record's entry uses) and **after** #537 / PR #589 merges (it edits `bin/lib/hooks/pre-tool-use.js`, `skills/_shared/policy-schema.md`, and the same three hook test files — building concurrently guarantees a conflict on the hot path).
- Rename mechanics as #331's `merge-check` → `branch-divergence-check` (see the `RENAMED_KEYS` comment block); the only novel piece is Deliverable 2, the hook reader's alias handling.
- Sweep with `grep -rlF "worktree.always"` (fixed-string — the dot is a regex metachar), edit, then run the Acceptance Criteria grep as the negative control.

## Gotchas

- `worktree.always` is the anchor for prose in `docs/donts.md`, `docs/hooks.md`, `docs/skill-authoring.md`, `CLAUDE.md`'s Cloud-parity/hook sections and the SessionStart reminder text users see every session — a partial sweep leaves the plugin telling users to set a key the audit will flag as deprecated.
- The `[IL-97]` class: `skills/init/**` *writes* this key; sweeping reads only leaves init minting the deprecated spelling into every new project's `policy.yml`.
- `tests/fixtures/resolve-policy/policy-basic.yml` is annotated "Frozen fixture — never this repo's live policy.yml": renaming its line is fine (it's a fixture, not history) but keep or add an old-spelling case so the alias window is pinned by a test, not just by the `RENAMED_KEYS` array.
- The `parseFlatLines` parser treats `.` in a key as a literal — `tests/policy.test.js:127` exists to prove dotted keys don't corrupt the regex. That test stays meaningful (aliases remain dotted inputs) — don't delete it because "no key is dotted anymore".

