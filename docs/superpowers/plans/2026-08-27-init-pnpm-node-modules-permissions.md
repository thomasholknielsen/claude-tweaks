# init: pnpm node_modules Read-Only Permission Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:init` seeds a read-only `Read`/`Grep` permission allowlist entry for a project's own `node_modules` — including `node_modules/.pnpm/**` on pnpm workspaces — in the generated `.claude/settings.json`, as a new unconditional, idempotent Core Bootstrap step, and repairs the gap on re-run for an already-initialized project missing it.

**Architecture:** Add a new Core Bootstrap step (`Step 8.5`) to `/claude-tweaks:init`'s Phase 0, inserted between the existing Step 8 (Statusline & Dependencies) and the Optional Enhancements block (Step 9 onward) — a fractional insertion (matching this skill's own `Phase 8.5` precedent) chosen specifically to avoid renumbering Steps 9-20 and every citation of their specific numbers elsewhere in the plugin. The step is pure prose (like every other bootstrap step in this skill) executed by the LLM at `/init` invocation time: detect a pnpm workspace, compute the missing `permissions.allow` entries, and merge them into `.claude/settings.json` non-destructively. No new runtime code — `bin/` ships no executable logic for any bootstrap step today, and this one follows the same convention.

**Tech Stack:** Markdown skill prose (Claude Code plugin skill files) — no application code, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-27T092707-record-836/work/836-spec.md` (materialized from GitHub issue #836 in the current worktree)

## Global Constraints

- The fix must cover `node_modules/.pnpm/**` explicitly, not rely on a plain `node_modules/**` pattern to also match it — the record's own premise is that pnpm's nested dot-prefixed directory needs a distinct pattern.
- Entries are read-only only (`Read`/`Grep` tools) — never grant `Bash`/`Edit`/`Write` access under `node_modules` (this record's own Gotchas, mirroring #811's).
- `plugin/skills/init/SKILL.md` is at 40,942 / 40,960 bytes (the 40 KB per-`SKILL.md` ceiling enforced by `tests/bin-lib/skill-audit/context-cost.test.js`) before this plan's edits — 18 bytes of headroom. Every edit to that file in Task 1 below is pre-computed (via a byte-exact simulation, not estimation) to land the file at 40,938 bytes net — 22 bytes under ceiling — by trimming three already-redundant/preview parentheticals elsewhere in the same file to offset the new step's own footprint. Do not add anything to `SKILL.md` beyond what Task 1 specifies without re-running the same `wc -c` check.
- Out of scope: reconciling with #811 (a near-duplicate open record) — that reconciliation is explicitly deferred to human/backlog triage per #836's own Gotchas, not this build.

---

### Task 1: Register Step 8.5 in SKILL.md and the version-check/index/grammar files

**Files:**
- Modify: `plugin/skills/init/SKILL.md` (insert Step 8.5 stub; extend the `Steps 1-8` → `Steps 1-8.5` range in the Core Bootstrap Version Check section; trim three redundant/preview parentheticals to stay under the 40 KB ceiling)
- Modify: `plugin/skills/init/bootstrap-steps.md` (add the `8.5` row to the step index table; extend the `Steps 1-8` mention)
- Modify: `plugin/skills/init/input-grammar.md` (extend the three `Steps 1-8` mentions in its worked examples)
- Modify: `plugin/skills/init/bootstrap/version-check.md` (extend every `Steps 1-8` mention — this file's whole subject is the Core Bootstrap run/skip gate, so every reference to the range it gates needs the same extension)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `### Step 8.5: Dependency Read-Only Permissions` stub in `SKILL.md`, pointing at `bootstrap/step-08-5-dependency-read-permissions.md` (created in Task 2). Task 2's file existing is required for the citation to resolve, but Task 1's own edits are syntactically and mechanically complete without it (a citation to a not-yet-created file is not itself a test failure).

- [ ] **Step 1: Baseline-measure `SKILL.md` against the ceiling**

Run:
```bash
wc -c plugin/skills/init/SKILL.md
```
Expected: `40942` (or whatever the current byte count is on this branch — if it differs from 40942, the trims in Step 3 below still apply the same net delta; re-run the verification in Step 5 regardless of the exact starting number).

- [ ] **Step 2: Extend every `Steps 1-8` range reference to `Steps 1-8.5`**

In `plugin/skills/init/SKILL.md`, five occurrences of the literal substring `Steps 1-8` (lines 85, 87 ×3, 89) become `Steps 1-8.5`. Also update the heading on line 91:

```
OLD: **Core Bootstrap (Steps 1–8):**
NEW: **Core Bootstrap (Steps 1–8.5):**
```

(Note: the heading uses an en-dash `–`, not a hyphen — it is a separate literal string from the five `Steps 1-8` hyphen occurrences and must be edited separately.)

In `plugin/skills/init/bootstrap-steps.md`:
```
OLD: Order-dependent — later steps may assume earlier ones completed. Steps 1-8 run unconditionally and idempotently (only act on missing state).
NEW: Order-dependent — later steps may assume earlier ones completed. Steps 1-8.5 run unconditionally and idempotently (only act on missing state).
```
And:
```
OLD: ## Core Bootstrap Steps (1-8)
NEW: ## Core Bootstrap Steps (1-8.5)
```

In `plugin/skills/init/input-grammar.md`, the one line with three occurrences:
```
OLD: Examples (assuming Steps 1-8 actually run this time — see "Core Bootstrap Version Check" below for when they're skipped instead): `routines` alone runs Steps 1-8, then only Steps 14+15, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8, then only Steps 14+15, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8, then only Steps 13 and 16, then stops.
NEW: Examples (assuming Steps 1-8.5 actually run this time — see "Core Bootstrap Version Check" below for when they're skipped instead): `routines` alone runs Steps 1-8.5, then only Steps 14+15, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8.5, then only Steps 14+15, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8.5, then only Steps 13 and 16, then stops.
```

In `plugin/skills/init/bootstrap/version-check.md`, replace every occurrence of the literal substring `Steps 1-8` with `Steps 1-8.5` (lines 4, 42, 44, 45 ×2, 46, 83, 91, 92, 93, 104 — 11 occurrences total). Verify the count first:
```bash
grep -o 'Steps 1-8' plugin/skills/init/bootstrap/version-check.md | wc -l
```
Expected: `11`. Replace each — there is no other meaning of this substring in the file, so a global find-and-replace is safe here (unlike `SKILL.md`, which needed the en-dash heading handled separately).

- [ ] **Step 3: Trim three redundant/preview parentheticals in `SKILL.md` to offset the new step's footprint**

These three edits remove content that is either a redundant restatement (already stated canonically elsewhere) or a preview-listing of a sub-file's own contents (a pattern most other stubs in this same file don't follow) — not a rewrite of any step's meaning:

Step 8's stub — trim the sub-file content preview (the sub-file itself, `step-08-statusline-and-dependencies.md`, already documents this):
```
OLD: Read `bootstrap/step-08-statusline-and-dependencies.md` for the full procedure (detection, package-manager prompts, settings.json migration matrix, NO_COLOR opt-out).
NEW: Read `bootstrap/step-08-statusline-and-dependencies.md` for the full procedure.
```

Step 9's stub — trim the parenthetical preview of what the repo-creation prompt asks (the sub-file documents the actual options):
```
OLD: then offers to create a GitHub repository (personal/org account, confirmed name, private/public) and link it as `origin`.
NEW: then offers to create a GitHub repository and link it as `origin`.
```

Step 14's stub — trim two clauses: a parenthetical about Step 15 that Step 15's own stub already states from its side ("Also issues (or skips, when none selected) the dedicated-environment offer deferred from Step 14"), and a sentence restating `bootstrap-steps.md`'s own canonical ordering-dependency rationale verbatim ("Step 14 ... must run before Step 15 ... a Routine created before cloud/plugin parity is set up would silently fail its first cloud firing"):
```
OLD: writes the `## Cloud parity` CLAUDE.md section (the dedicated-environment attach offer is deferred to Step 15, once routine selection is known). Runs before Step 15 deliberately — a Routine created first would silently fail its first cloud firing. Idempotent
NEW: writes the `## Cloud parity` CLAUDE.md section. Idempotent
```

- [ ] **Step 4: Insert the Step 8.5 stub**

In `plugin/skills/init/SKILL.md`, insert immediately after Step 8's stub (now ending `...for the full procedure.` per Step 3 above) and before the `**Optional Enhancements (Steps 9 onward):**` line:

```markdown
### Step 8.5: Dependency Read-Only Permissions

Seeds a read-only `Read`/`Grep` allowlist for the project's `node_modules` (plus `.pnpm/**` on pnpm workspaces) in `.claude/settings.json`, idempotently — also repairs a missing entry on re-run. Read `bootstrap/step-08-5-dependency-read-permissions.md` for the full procedure.
```

with a blank line before and after (matching every other step stub's spacing).

In `plugin/skills/init/bootstrap-steps.md`'s step table, insert a new row immediately after the `8` row and before the `9` row:

```
| 8.5 | `step-08-5-dependency-read-permissions.md` | Read-only `node_modules`/`node_modules/.pnpm/**` allowlist entry; idempotent drift-repair on re-run. |
```

- [ ] **Step 5: Verify the ceiling**

```bash
wc -c plugin/skills/init/SKILL.md
```
Expected: at or under `40960` (the 40 KB ceiling `context-cost.test.js` enforces) — the pre-computed target is `40938` starting from a `40942`-byte baseline. If the file is over ceiling, the fallback trim candidates (in priority order, each independent of the others) are: (a) Step 15's stub sentence "Also issues (or skips, when none selected) the dedicated-environment offer deferred from Step 14." (redundant with Step 14 already not mentioning it after Step 3's edit — trim to "Also issues the dedicated-environment offer, when applicable."); (b) Step 11's stub trailing parenthetical `(frontend-detection list, install sequence, flag-value table, re-run behavior, failure handling)`; (c) Step 17's stub trailing parenthetical `(counts and the taxonomy these config keys govern: ...)`. Do not touch any text outside these named candidates without re-deriving a fresh byte count first.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/init/SKILL.md plugin/skills/init/bootstrap-steps.md plugin/skills/init/input-grammar.md plugin/skills/init/bootstrap/version-check.md
git commit -m "Register init Step 8.5 (dependency read-only permissions) — refs #836"
```

---

### Task 2: Write the Step 8.5 procedure file

**Files:**
- Create: `plugin/skills/init/bootstrap/step-08-5-dependency-read-permissions.md`

**Interfaces:**
- Consumes: nothing — a leaf procedure file, like every other `bootstrap/step-NN-*.md` file, referenced only by `SKILL.md`'s Step 8.5 stub (Task 1) and `bootstrap-steps.md`'s table row (Task 1).
- Produces: the full procedure `/claude-tweaks:init`'s Phase 0 executes when it reaches Step 8.5.

- [ ] **Step 1: Write the procedure file**

```markdown
# Step 8.5 — Dependency Read-Only Permissions (detailed procedure)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

Reading an installed dependency's own source or type definitions (`node_modules/**`) is routine, safe research — but with no permission entry for it, every such `Read`/`Grep` is denied by default, and the denial recurs identically on every re-inspection, within a session and across sessions (#811, #836). On a pnpm workspace, reads resolve through the nested `node_modules/.pnpm/**` layout — a `**` glob rooted at plain `node_modules/**` does not reliably match a dot-prefixed path segment like `.pnpm`, so an allowlist scoped only to the top-level pattern still leaves those reads denied. This step seeds both.

**Detect a pnpm workspace:** a `pnpm-lock.yaml` file at the project root, or a `.pnpm` directory under `node_modules/`.

**Compute the entries to seed** (read-only — `Read`/`Grep` only; never `Edit`/`Write`/`Bash`, so nothing here grants write or execute access under `node_modules`):

| Condition | Entries |
|---|---|
| Always | `Read(node_modules/**)`, `Grep(node_modules/**)` |
| pnpm workspace detected | `Read(node_modules/.pnpm/**)`, `Grep(node_modules/.pnpm/**)` |

**Merge into `.claude/settings.json`:**

1. Read `.claude/settings.json` if it exists; treat it as `{}` if it doesn't (an earlier Core Bootstrap step may not have created it yet — Step 8.5 is the first step in this skill's own numbering that's guaranteed to write it if nothing else has).
2. Back up first when the file exists: `cp .claude/settings.json .claude/settings.json.bak` (nothing to back up when it doesn't).
3. Ensure `permissions.allow` is an array (create both keys if absent). Append only the computed entries above that are not already present (exact string match against existing array entries) — never remove, reorder, or deduplicate anything already there, and never touch `permissions.deny`.
4. Write the file.

No prompt — this step is unconditional and strictly additive, the same posture as every other Core Bootstrap step (1-8): a read-only allowlist entry carries no risk profile that warrants an `AskUserQuestion` gate, unlike the Optional Enhancement steps (9 onward), which do prompt.

**Idempotent / drift-repair, with no extra logic needed.** Re-running `/claude-tweaks:init` re-checks and adds only what's missing on its own, because this step's merge (above) is already idempotent and Core Bootstrap's version-check gate (`version-check.md`) re-runs Steps 1-8.5 in full whenever the plugin version has advanced past what the project's `.claude-tweaks/init-state.yml` marker recorded — which is exactly the case for a project initialized by a pre-#836 plugin version. A user already on a post-#836 plugin version whose marker already matches (so Steps 1-8.5 would otherwise be skipped) can still force a re-check with `/claude-tweaks:init bootstrap`, which `version-check.md`'s own Exception always runs regardless of the marker.
```

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/init/bootstrap/step-08-5-dependency-read-permissions.md
git commit -m "Add init Step 8.5 procedure — pnpm node_modules read-only permission allowlist, refs #836"
```

---

### Task 3: Full verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 1 and 2's committed state.
- Produces: a green `npm test` run, confirming the byte-ceiling assertions (`tests/bin-lib/skill-audit/context-cost.test.js`) and every other existing suite still pass with no regression.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: PASS — in particular `tests/bin-lib/skill-audit/context-cost.test.js`'s `'no SKILL.md exceeds the 40 KB per-invocation ceiling'` and `'no lazy-loaded sub-file exceeds the ceiling either'` tests, which this plan's Task 1 Step 5 already pre-verified by hand via `wc -c`.

- [ ] **Step 2: Spot-check the new stub and procedure file read coherently**

```bash
grep -n "Step 8.5" plugin/skills/init/SKILL.md plugin/skills/init/bootstrap-steps.md
grep -c "node_modules/.pnpm" plugin/skills/init/bootstrap/step-08-5-dependency-read-permissions.md
```
Expected: both `SKILL.md` and `bootstrap-steps.md` show the new step; the `.pnpm` pattern appears in the procedure file (non-zero count).

- [ ] **Step 3: Confirm no other file in the repo restates the now-stale `Steps 1-8` range**

```bash
grep -rnP "Steps 1-8(?!\.5)" plugin/skills/ docs/
```
Expected: no output. (A plain `grep -v "Steps 1-8\.5"` filter is insufficient here — `Steps 1-8\b` itself still matches inside `Steps 1-8.5`, since `\b` only requires a word→non-word transition and `.` qualifies; the negative-lookahead form above is the one that actually excludes the already-updated occurrences. Verified against a two-line fixture before relying on it in this plan.) Any hit here is a missed citation to fix before this build's own verification gate.
