# Superpowers entry in the upstream-drift manifest — design

**Date:** 2026-08-09
**Status:** Approved (brainstorm — manifest-entry approach)
**Record:** #262

## Problem

`tools/upstream-drift/manifest.yml` covers `impeccable-cli` and `impeccable-plugin` and
nothing else. Superpowers — this repo's heaviest dependency (eight consumed skills;
`/build`'s controller rides subagent-driven-development's documented loop, tier-override
instruction included) — has zero mechanical drift protection. #140's Non-Goals deferred this
explicitly: *"Auditing superpowers' integration surface. The manifest makes it possible;
doing it is separate work."* This is that work.

Today installed 6.2.0 equals the latest upstream tag (`obra/superpowers` `v6.2.0`, measured
2026-08-09 against the tree, not release notes), so nothing has drifted yet. The gap is that
the next release would be invisible to every deterministic check: no version pin, no
assertions, and the runner (`tools/upstream-drift/run.js`, shipped 2026-08-07 via #143)
never marks superpowers DUE because it isn't in the manifest.

The couplings at risk are silent by construction. `skills/_shared/subagent-output-contract.md`
mirrors SDD's four implementer statuses without ever containing the word "superpowers" — no
grep connects the two files, which is exactly the defect class (`[IL-15]`) the manifest's
assertion half exists to catch.

## Decision

### 1. The manifest entry

One new entry in `tools/upstream-drift/manifest.yml`, following the `impeccable-plugin`
shape. Pure data — no `checks.js`/`manifest.js`/schema change of any kind:

```yaml
- name: superpowers
  kind: claude-plugin
  installed-probe:
    type: plugin-cache-glob
    glob: "~/.claude/plugins/cache/*/superpowers/*/.claude-plugin/plugin.json"
  pinned: "6.2.0"
  upstream:
    repo: "obra/superpowers"
    tag-prefix: "v"
  contract-paths:
    # the union of the assertions' upstream-paths — final list falls out of the sweep
  assertions:
    # produced by the sweep below
  fixtures: []   # deliberate — see "Deliberately absent"
```

The `*` marketplace segment matches the impeccable precedent (resolves
`claude-plugins-official` today without hardcoding it). Contract-paths double as the
capability-diff anchor. The contract root is expected to be identity — the upstream repo
carries `skills/` at top level, as does the installed root — but is resolved from evidence
during implementation per the judge procedure's step 3, never assumed.

Adding the entry auto-enrolls superpowers in the shipped runner's version-driven sweeps
(`run.js` iterates the manifest and computes DUE from version movement). No other
registration exists or is needed.

### 2. The sweep and its criterion

One pass over every superpowers mention in `skills/**`, `CLAUDE.md`, and `docs/**`
(61 citing files measured 2026-08-09; most will classify as inert). Classification:

- **Inert (skip):** bare `/superpowers:{name}` invocation references — a renamed or removed
  skill fails loudly at the `Skill` tool with "Unknown skill"; descriptive prose with no
  behavioral dependency.
- **Pin (assert):** any claim about upstream *behavior, vocabulary, output shape, file
  layout, or sequencing* that claude-tweaks acts on and whose breakage is silent. Each
  becomes one assertion: citing `file`, the `claims` prose, `upstream-path`, and a
  `must-match` literal verified against the installed 6.2.0 at authoring time (running the
  deterministic checks is that verification).

Starting candidates, each literal verified against the installed artifact on 2026-08-09
(the sweep may add more; it may not silently drop one of these — if one is rejected, the
rejection is recorded in the spec):

| Citing file | Claim | Upstream path (under `skills/subagent-driven-development/` unless noted) | must-match |
|---|---|---|---|
| `skills/_shared/subagent-output-contract.md` | the four-status vocabulary mirrors SDD's implementer statuses | `implementer-prompt.md` | `DONE \| DONE_WITH_CONCERNS \| BLOCKED \| NEEDS_CONTEXT` |
| `skills/build/SKILL.md` | SDD ends by invoking finishing-a-development-branch — the step `/build` suppresses | `SKILL.md` | `Use superpowers:finishing-a-development-branch` |
| `skills/build/SKILL.md` | SDD has a per-task model-selection heuristic the tier override overrides | `SKILL.md` | `## Model Selection` |
| `CLAUDE.md` | brainstorming's terminal step invokes writing-plans — the step our override suppresses | `skills/brainstorming/SKILL.md` | `Invoke the writing-plans skill` |

The first row's pipes are markdown-escaped for this table; the manifest carries the literal
unescaped (`DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`, `implementer-prompt.md:130`).

Sweep-classify items already located (correct citing files, pin-vs-inert judgment left to
the sweep): the `.superpowers/sdd/` workspace path, cited as an example at
`skills/_shared/local-files-preflight-stop.md:24` and conceptually ("SDD ledger") in
`skills/wrap-up/summary-template.md` — upstream literal confirmed present at
`scripts/sdd-workspace:36` (`base="$root/.superpowers/sdd"`); `skills/build/failure-recovery.md`'s
claims about SDD's retry/status behavior; `skills/specify/decomposition-mode.md`'s 3–8
tasks-per-work-unit sizing.

### 3. Adjacent fixes (same change-set)

- **`tools/upstream-drift/tests/manifest.test.js:402`** asserts the real manifest's name
  list is exactly `['impeccable-cli', 'impeccable-plugin']`. Extend to include
  `'superpowers'`, else the entry lands as a scheduled test failure (`[IL-80]`'s shape,
  caught at design time).
- **`.claude/skills/upstream-drift/SKILL.md`** carries two stale forward references to #143
  as future work ("Lifecycle: … `#143` will add the runner…" and Next Actions Option 1's
  "the automated by:upstream-drift filing path arrives with #143"). #143 closed COMPLETED
  2026-08-07 and `run.js` shipped. Reword both to name the shipped runner. Note the skill's
  Component-Skill Contract paragraph also anticipates #143 gating Next Actions on
  `--source upstream-drift-runner`; reconcile that paragraph against what #143 actually
  shipped rather than editing it blind (`[IL-71]`).

## Deliberately absent

- **Fixtures.** `fixtures: []` with a manifest comment stating why: fixtures exist for
  artifacts that can change underfoot (the npm-global CLI — `npm root -g` contents move with
  no repo-side event); a versioned plugin-cache directory is frozen per version, so the
  version probe *is* the behavioral guard. Same reasoning that leaves `impeccable-plugin`
  fixture-free. This also avoids extending `replayFixtures`, which has no installed-root
  substitution and hard-requires a JSON payload — the SDD scripts print file paths.
- **No new schema fields, no runner changes.** The entry is data riding existing machinery.
- **Superpowers' runtime-environment claims** (e.g. cloud-sandbox install behavior) are out
  of scope — that is the `[IL-113]` class, owned elsewhere.
- **No repo-test duplicate.** The rejected alternative (a `tests/superpowers-contract.test.js`)
  would re-check a frozen artifact on every suite run, duplicate the manifest's job, and fail
  on cache-less machines (CI, cloud sandboxes) where the manifest's `absent`-vs-`breach`
  distinction degrades gracefully.

## Verification

- The skill's Step-1 deterministic command reports the superpowers entry all-`ok` at 6.2.0:
  version ok (installed includes pinned), every assertion resolves, fixtures trivially ok.
- `npm test` green, including `tools/upstream-drift/tests/` (the extended name-list
  expectation in `manifest.test.js`).
- Assertion literals are verified by execution (the checks themselves), not by reading —
  each `must-match` was grepped in the installed artifact before being written, and the
  check run re-confirms all of them.

## Release

No version bump and no CHANGELOG entry: every touched path (`tools/upstream-drift/`,
`.claude/skills/upstream-drift/`) is maintainer-only, unshipped surface. Precedent:
`240f40a2` (the manifest's founding commit, #141) touched neither `.claude-plugin/plugin.json`
nor `CHANGELOG.md`. If the eventual build batches this with shipped work, that work's own
bump governs.
