---
record: 262
origin: capture
risk: low
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 262: Add a superpowers entry to tools/upstream-drift/manifest.yml

Surface: backend

## Current State

- `tools/upstream-drift/manifest.yml` — two entries (`impeccable-cli`, `impeccable-plugin`); superpowers absent entirely. Entry schema: `name`/`kind`/`installed-probe`/`pinned`/`upstream`/`contract-paths`/`assertions`/`fixtures`.
- Installed superpowers: 6.2.0 at `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/` — equal to the latest upstream tag (`obra/superpowers` `v6.2.0`) when measured 2026-08-09 against the tree. No drift then; the gap is that the next release is invisible to every deterministic check. **This measurement expires** — see the re-verify deliverable below.
- The runner (`tools/upstream-drift/run.js`, shipped via #143, closed 2026-08-07) iterates the manifest and computes DUE from version movement — adding the entry auto-enrolls superpowers; no other registration exists. The runner has no `--source` CLI flag and never calls `gh` for writes — it emits issue payloads on stdout for the caller to file (run.js:32-38's own header).
- `tools/upstream-drift/tests/manifest.test.js:402` asserts the real manifest's name list is exactly `['impeccable-cli', 'impeccable-plugin']`. `tools/upstream-drift/tests/run.test.js:578` iterates dependencies generically (`length >= 2`, per-entry stubs) — unaffected by a third entry.
- `.claude/skills/upstream-drift/SKILL.md` carries stale forward references to #143 as future work: the Lifecycle line, Next Actions Option 1's description, and the Component-Skill Contract paragraph — the last one anticipates a `--source upstream-drift-runner` flag that was never built (see above).
- Design doc (deleted on decomposition; absorbed here): `docs/superpowers/specs/2026-08-09-superpowers-drift-manifest-design.md`, committed `88cf3591` on branch `worktree-superpowers-drift-manifest`.

## Deliverables

- [ ] **Re-verify the premise first** (the pin expires while this record waits — the repo's `[IL-109]` rule): immediately before writing the entry, re-resolve the installed version from the artifact (`~/.claude/plugins/cache/*/superpowers/*/.claude-plugin/plugin.json`) and the latest upstream tag (`gh api repos/obra/superpowers/tags`). Pin whatever is then installed; if it moved past 6.2.0, every literal below is re-verified against the newly installed artifact before writing.
- [ ] `superpowers` entry in `tools/upstream-drift/manifest.yml`: `kind: claude-plugin`; `installed-probe: plugin-cache-glob` over `~/.claude/plugins/cache/*/superpowers/*/.claude-plugin/plugin.json`; `pinned:` the re-verified installed version; `upstream: repo obra/superpowers, tag-prefix "v"`; `contract-paths` per the anchor-set rule in Technical Approach; `fixtures: []` with a comment stating the frozen-artifact rationale and its falsifier (below).
- [ ] **The sweep, with a stated denominator.** Enumerate citing files with exactly `git grep -il superpowers -- ':!docs/superpowers' ':!docs/incident-log.md'` from the repo root (tracked files only — reproducible, gitignore-proof; historical design artifacts and incident-log quotations excluded as inert by construction). This scope includes `bin/`, `.claude/`, `tests/`, and `tools/` — broader than the design doc's first draft, per red-team. Classify **every** file the command returns: **inert** (bare `/superpowers:{name}` invocation references, which fail loudly at the Skill tool; descriptive prose; code identifiers with no behavioral dependency on upstream content) vs. **pin** (claims about upstream behavior, vocabulary, output shape, file layout, or sequencing that claude-tweaks acts on and whose breakage is silent). Every pin becomes an assertion whose `must-match` literal is verified against the installed artifact before writing.
- [ ] **The classification ledger is a durable artifact:** post one comment on #262 listing every enumerated file with its verdict (`pin: {assertion}` / `inert: {one-line reason}`) before this record closes. A rejected *starting candidate* (below) additionally gets a one-line comment in `manifest.yml` beside the entry — the same accepted precedent as the existing design-contract comment block.
- [ ] Four starting assertions (literals verified against 6.2.0 on 2026-08-09; re-verify with the premise step above; the sweep may add more and may not silently drop one — a drop lands in the ledger comment with its reason):
  1. `skills/_shared/subagent-output-contract.md` claims the four-status vocabulary mirrors SDD's implementer statuses → `skills/subagent-driven-development/implementer-prompt.md` must-match `DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT` (line 130; literal is unescaped in YAML).
  2. `skills/build/SKILL.md` claims SDD ends by invoking finishing-a-development-branch (the step `/build` suppresses) → `skills/subagent-driven-development/SKILL.md` must-match `Use superpowers:finishing-a-development-branch`.
  3. `skills/build/SKILL.md` claims SDD has a per-task model-selection heuristic the tier override overrides → same file, must-match `## Model Selection`.
  4. `CLAUDE.md` claims brainstorming's terminal step invokes writing-plans (the step the project override suppresses) → `skills/brainstorming/SKILL.md` must-match `Invoke the writing-plans skill`.
- [ ] Pre-located sweep candidates (candidates, not committed assertions — each needs its literal derived and verified under the same rule before becoming one): the `.superpowers/sdd/` workspace path, cited at `skills/_shared/local-files-preflight-stop.md:24` and as "SDD ledger" in `skills/wrap-up/summary-template.md` — upstream literal confirmed at `skills/subagent-driven-development/scripts/sdd-workspace:36` (`base="$root/.superpowers/sdd"`; full root-relative path as written here, since it becomes the `upstream-path` value); `skills/build/failure-recovery.md`'s claims about SDD retry/status behavior; `skills/specify/decomposition-mode.md`'s 3–8 tasks-per-work-unit sizing.
- [ ] `tools/upstream-drift/tests/manifest.test.js:402` name-list expectation extended to include `'superpowers'`.
- [ ] `.claude/skills/upstream-drift/SKILL.md` brought to truth about the shipped runner. Target state, not judgment calls: the Lifecycle line and Next Actions Option 1 stop describing #143 as future and name `tools/upstream-drift/run.js`; the Component-Skill Contract paragraph's `--source upstream-drift-runner` gating language is removed or rewritten to the shipped split — the runner emits payloads on stdout, the skill (or a human) files them, and no runner-set flag exists to gate `## Next Actions` on.

## Acceptance Criteria

1. The skill's Step-1 deterministic command (`node -e` invoking `checkVersion`/`checkAssertions`/`replayFixtures` over the manifest) reports the `superpowers` entry all-`ok` at the pinned version: version ok (installed includes pinned), every assertion resolves, fixtures trivially ok.
2. `npm test` green, including `tools/upstream-drift/tests/` with the extended name-list expectation.
3. Sweep coverage is closed-out, not asserted: the #262 ledger comment lists every file returned by the stated `git grep` command with a pin/inert verdict — file count in the comment equals the command's output count at build time.
4. Every `must-match` literal in the new entry is verified by the check run against the installed artifact — no literal written from memory or paraphrase.
5. `fixtures: []` carries the frozen-artifact rationale as a manifest comment, including its falsifier (a same-version re-publish replacing bytes under an existing cache dir), accepted as out-of-scope risk shared with the `impeccable-plugin` precedent.
6. Zero remaining text in `.claude/skills/upstream-drift/SKILL.md` describing #143, the runner, or a `--source upstream-drift-runner` flag as future or existing mechanism respectively.
7. No `checks.js`/`manifest.js`/schema change of any kind — the entry is pure data (a diff touching those files fails this criterion).

## Technical Approach

The entry is data riding existing machinery: the runner already iterates the manifest, the `plugin-cache-glob` probe type already exists (used by `impeccable-plugin`), and the capability half's judge procedure handles any entry generically.

**`contract-paths` is a representative anchor set, not a union of assertion paths** — the `impeccable-plugin` precedent's own contract-paths omit `live.mjs`, which is an assertion `upstream-path` (red-team verified). The set's jobs are the judge procedure's root mapping (step 3) and giving the capability diff a starting anchor; the capability diff itself runs over the whole contract root's subtree, so consumed-but-unasserted skills (systematic-debugging, using-git-worktrees, test-driven-development, …) are covered by the capability half regardless of what contract-paths lists. Starting set: `skills/subagent-driven-development/SKILL.md`, `skills/subagent-driven-development/implementer-prompt.md`, `skills/brainstorming/SKILL.md`; the implementer may add anchors where the sweep's assertions concentrate. The contract root is expected to be identity (upstream repo carries `skills/` at top level, as does the installed root) but is resolved from evidence per the judge procedure's step 3, never assumed.

Rejected alternative (recorded in the design brainstorm): a `tests/superpowers-contract.test.js` under `npm test` — it would re-check a frozen artifact on every suite run, duplicate the manifest's job, and fail on cache-less machines (CI, cloud sandboxes) where the manifest's `absent`-vs-`breach` distinction degrades gracefully. A hybrid (both homes) guarantees drift between the two copies.

### Key Files

- `tools/upstream-drift/manifest.yml` — the new entry (the substantive change)
- `tools/upstream-drift/tests/manifest.test.js` — extend the line-402 name-list expectation
- `.claude/skills/upstream-drift/SKILL.md` — stale-#143 truth pass per the Deliverables target state

## Gotchas

- The four-status literal is pipe-separated in upstream (`DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`) and ordered differently from claude-tweaks' own rendering (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) — copy the upstream literal exactly; a markdown-escaped (`\|`) or reordered copy can never match.
- `upstream-path` values must be full contract-root-relative paths (`skills/subagent-driven-development/scripts/sdd-workspace`, never a `scripts/…` shorthand) — a shorthand resolves nowhere and fails as `missing-file`.
- `tools/upstream-drift/` is read-only to the `/upstream-drift` *skill*, but editing it in a build is fine — that restriction guards audit runs, not development.
- Do not run `bin/*-health.js` CLIs or `tools/upstream-drift/run.js` with real arguments to test — `run.js` writes a local dedup cache; exercise `checks.js` via `node -e` or the unit suites instead (`[IL-73]`'s hazard class).
- No version bump, no CHANGELOG entry: every touched path is maintainer-only unshipped surface (precedent: `240f40a2`, the manifest's founding commit, touched neither). If batched with shipped work, that work's own bump governs.
- The sweep's inert/pin classification must not infer "handled" from a grep for the upstream file's name (`[IL-15]`) — `_shared/subagent-output-contract.md` never says "superpowers", which is exactly why its coupling needs pinning.
- Later edits to this entry inherit the same discipline: an assertion added or removed later updates the ledger comment and, where judgment-worthy, the manifest comment — `checks.js` never cross-validates `contract-paths` against assertion paths, so nothing mechanical catches a drifted anchor set.

## Original request

Add a superpowers entry to tools/upstream-drift/manifest.yml

**Related:** #140, #145, #149 (upstream-drift phase family; the runner #143 is closed)

Context: A manual /upstream-drift run (2026-08-09) had to hand-resolve superpowers' installed version and contract paths — tools/upstream-drift/manifest.yml covers only impeccable-cli and impeccable-plugin, so the repo's heaviest dependency (eight consumed skills; /build's controller rides SDD's documented loop) has zero mechanical drift protection. Installed 6.2.0 equals the latest upstream tag today, so no drift yet — the gap is that the next release would be invisible to every deterministic check.

Scope: a plugin-cache-glob version probe against ~/.claude/plugins/cache/claude-plugins-official/superpowers/, plus assertions for the upstream literals this repo relies on: implementer-prompt.md's four statuses (mirrored by _shared/subagent-output-contract.md), SDD SKILL.md's finishing-a-development-branch handoff (suppressed by build/SKILL.md:188), and the tier-override instruction seam build/SKILL.md:188 depends on.
