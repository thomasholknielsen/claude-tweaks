# Release Train Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the scheduled Routine that fires `/claude-tweaks:release --train` unattended — a fleet-slottable template mirroring `specify/routine-template.yml`, `release` registered as an instantiable skill, and an autonomy-ceiling row for what the unattended *firing* may do.

**Architecture:** One template file (`plugin/skills/release/routine-template.yml`, discovered by `tests/routine-template-schema.test.js`'s directory glob and by `/claude-tweaks:routine create release`), one registration sentence in `plugin/skills/routine/SKILL.md`, one `train (Routine firing)` row in `_shared/autonomy-ceiling.md`, the skill-graph edges (`## routine` ↔ `## release`), the plugin-structure sub-file entry, and one conformance test pinning all of it. The refusal/HELD/PARTIAL logic is #2256's — this unit invokes it verbatim.

**Tech Stack:** YAML template per `_shared/routine-template-schema.md`; Markdown prose; `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2258/work/2258-spec.md` (record #2258, fast-lane).

## Global Constraints

- The template never carries `environment_id`, a repo URL, or credentials (`tests/routine-template-schema.test.js`'s FORBIDDEN_KEYS); no `prompt` field — the kernel is assembled at instantiation; `kickoff`'s first token equals the owning directory name (`release`).
- Skill references inside actionable text use `/claude-tweaks:{skill}`; edges live once in `docs/skill-graph.md` (a consumer row in `## routine` and the reciprocal row in `## release`, as `## specify` does).
- Commits `{Verb} {what} — {detail}, refs #2258`; trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`; plain single git commands.

## Rulings

1. **Template discovery is the registration mechanism** — `/claude-tweaks:routine create <skill>` reads `skills/<skill>/routine-template.yml` and the schema test globs every `skills/*/routine-template.yml`; there is no registry list to append to. "Register `release` as instantiable" therefore lands as (a) the template itself, (b) a sentence in `routine/SKILL.md`'s When to Use naming `release` and its policy precondition, and (c) the skill-graph consumer/reciprocal rows — the same three places every other template-bearing skill occupies.
2. **Daily cadence, weekdays** — `default_schedule.cron_expression: "37 7 * * 1-5"` (UTC; offset from every fleet minute — dispatch `11 */2`, specify `23 */2`, the fleet table's `0/15/30/45 5`, `0/30 6`, `0 8`); the spec's "daily" is a default the project reconfigures at instantiation like any other template.
3. **Model and tools** — `claude-sonnet-5`, `[Bash, Read, Edit, Write, Grep, Glob, Task]`: the train merges a PR, pushes a `Release-As:` commit, writes `release-held.md` and comments on records, and Step 3 dispatches review lenses — the same write set `dispatch/routine-template.yml` carries, not `specify`'s read-only set.
4. **A firing on a repo without the levers is a refused no-op, reported as blocked** — `--train` is refused unless `release-train: true` and `autonomy: unattended` (#2256 ruling 9); a refused train behaves as on-demand, which in a headless firing hits the kernel's unattended-firing constraint (report blocked, stop, nothing done). The template's `notes` say so, and the autonomy row says the firing never proceeds past the refusal.
5. **The Routine-firing row cites `execute.md`** for the per-engine action (merge the release PR under pr-first, `bin/release-local.js` under local-merge) rather than restating either; it states the three never-does exactly as the skill's `train` row does, plus the firing-specific facts: refused → blocked/no-op; `HELD` → `release-held.md` in the run directory the firing minted (the Review Console never renders in a firing — the held file is the only record); `PARTIAL` → the firing's report names the recovery command and stops.
6. **Conformance test** — `tests/release-routine-template.test.js` pins: the template parses via `parseRoutineTemplate`, `kickoff` is `release --train`, `routine_name` is `release-train-daily`, the write tools are present, `notes` names `release-train` and `unattended`; `routine/SKILL.md` names `release`; `autonomy-ceiling.md` carries a row whose first cell is `` `train (Routine firing)` `` and mentions `execute.md`, `HELD`, `PARTIAL`; `docs/skill-graph.md`'s `## routine` block has a `/release` row and `## release` a `/routine` row.
7. **ACs 2–3 are #2256's `--train` classification invoked verbatim** — proven by the release skill's own journey step 4 and its whole-branch scenario walk (e); this unit adds no fixture run, exactly as the spec's AC text allows ("exactly as reliable as unit 6's own logic").

---

### Task 1: The template

**Files:**
- Create: `plugin/skills/release/routine-template.yml`
- Test: `tests/routine-template-schema.test.js` (existing glob — discovers it)

- [ ] **Step 1: Run the schema test to see release absent** — `node --test tests/routine-template-schema.test.js` — Expected: PASS with no `release/routine-template.yml conforms to schema` subtest.
- [ ] **Step 2: Write the template**

```yaml
template_version: 1
routine_name: release-train-daily
kickoff: release --train
# Optional: `branch: <name>` pins the assembled kernel's target-branch placeholder.
# Normally unset here — a branch is project-specific, so /claude-tweaks:routine resolves
# it at instantiation.
model: claude-sonnet-5
allowed_tools: [Bash, Read, Edit, Write, Grep, Glob, Task]
mcp_connections: []
default_schedule:
  cron_expression: "37 7 * * 1-5"
  description: "daily on weekdays, UTC — confirm against your local timezone at creation time. Offset from dispatch's 11 */2 and specify's 23 */2 cadences and from every fleet-table minute, so a firing never shares a minute with a queue drain"
notes: >
  The release train (refs #2258): each firing invokes /claude-tweaks:release --train and lets
  that skill decide — it reads the preflight fact pack, runs the whole-branch review before any
  bump, and merges release-please's PR (pr-first) or runs bin/release-local.js (local-merge)
  only for a minor or patch bump whose review came back clean or non-blocking. Two policy
  levers gate every firing: `release-train: true` and `autonomy: unattended` in
  .claude-tweaks/policy.yml. Without both, --train is refused and the firing ends as a
  reported-blocked no-op — nothing merged, nothing tagged, no record touched. A major bump
  (measured on the effective version, --as included) or a `review: blocking` verdict ends the
  firing with `HELD` and a `release-held.md` in the firing's run directory naming the gate;
  re-run the train once the gate is addressed. A hook that fails after the tag landed is
  `PARTIAL` with the recovery command in the report — the release exists; only the publish
  step needs re-running. A firing with nothing to release is a cheap no-op (`nothing to
  release since v{lastTag}`); a repository that has never tagged a version is held at the
  first-release gate until its manifest version is tagged (#2259 bootstraps that for this repo).
```

- [ ] **Step 3: Run** — `node --test tests/routine-template-schema.test.js` — Expected: PASS including `release/routine-template.yml conforms to schema`.
- [ ] **Step 4: Commit** — `git add plugin/skills/release/routine-template.yml` / `git commit -m "Add the release train routine template — daily weekday firing of /claude-tweaks:release --train, refs #2258"` + trailer.

### Task 2: Registration — routine skill, autonomy row, skill graph, plugin structure

**Files:**
- Modify: `plugin/skills/routine/SKILL.md` (When to Use — one bullet naming `release`)
- Modify: `plugin/skills/_shared/autonomy-ceiling.md` (one `train (Routine firing)` row after the `train` row)
- Modify: `docs/skill-graph.md` (`## routine` consumer row; `## release` reciprocal row)
- Modify: `docs/plugin-structure.md` (the `release` sub-files row gains `routine-template.yml`)
- Modify: `docs/journeys/release-a-version-2256.md` (`files:` + step 4 names the Routine)

- [ ] **Step 1: Edit** — routine/SKILL.md When to Use bullet: `- You want the release train — a daily unattended firing of /claude-tweaks:release --train that ships minor and patch releases whose pre-bump review came back clean: \`/claude-tweaks:routine create release\` instantiates \`skills/release/routine-template.yml\`; it is a refused no-op until the project sets \`release-train: true\` and \`autonomy: unattended\`.` Autonomy row (2-column, after the `train` row): `| \`train (Routine firing)\` | The scheduled Routine (\`skills/release/routine-template.yml\`, #2258) fires \`/claude-tweaks:release --train\` unattended; this row is what that *firing* may do, distinct from the \`train\` row above (what \`--train\` may do whenever invoked). Same ceiling, same two levers: at \`unattended\` with \`release-train: true\` a firing may merge the release PR (pr-first) or tag through \`bin/release-local.js\` (local-merge) — \`release/execute.md\`'s Step 5 dispatch, never re-derived here — for a minor or patch bump whose Step 3 review came back clean or non-blocking. Without both levers the firing is refused and ends as a reported-blocked no-op (the kernel's unattended-firing constraint; nothing moved). It never lands a major bump, never proceeds past \`review: blocking\`, and never treats a failed publish hook as clean: the first two are \`HELD\` with \`release-held.md\` in the firing's run directory as the only record (no Review Console renders in a firing), the third is \`PARTIAL\` with Step 6's recovery command in the firing's report. |`. Skill-graph `## routine` row (alphabetical, after `/journey-health`): `| \`/release\` | Ninth consumer — \`skills/release/routine-template.yml\` is the release train: \`kickoff: release --train\`, daily on weekdays, write tools like \`/dispatch\`'s; every firing defers to the release skill's own Step 4 gates (\`HELD\`) and Step 6 verification (\`PARTIAL\`), and is a refused no-op until \`release-train: true\` and \`autonomy: unattended\` are set (\`_shared/autonomy-ceiling.md\`'s \`train (Routine firing)\` row). |`. `## release` reciprocal row: `| \`/routine\` | \`/claude-tweaks:routine create release\` instantiates \`skills/release/routine-template.yml\` (#2258) — the scheduled unattended form of \`--train\`; the template is a thin wrapper and adds no refusal or gate logic of its own. |`. plugin-structure `release` row: prepend `routine-template.yml` to its sub-file list with "the release train's fleet-slottable template (#2258)". Journey: add `plugin/skills/release/routine-template.yml` to `files:`; step 4's URL line names `/claude-tweaks:routine create release` as the scheduled form.
- [ ] **Step 2: Run** — `node --test tests/skill-graph-table-structure.test.js tests/skill-catalog-completeness.test.js tests/tidy-subfile-table-completeness.test.js tests/skill-conventions.test.js tests/bin-lib/skill-audit/context-cost.test.js tests/routine-kickoff.test.js` — Expected: PASS.
- [ ] **Step 3: Commit** — the five files / `git commit -m "Register the release train — routine skill bullet, autonomy Routine-firing row, skill-graph edges, plugin-structure and journey, refs #2258"` + trailer.

### Task 3: Conformance test

**Files:**
- Test: `tests/release-routine-template.test.js`

- [ ] **Step 1: Write the test** — per ruling 6, using `parseRoutineTemplate` from `plugin/bin/lib/routine-template-parser.js` and plain `fs` reads of the four prose files; one `test()` per pinned fact.
- [ ] **Step 2: Run** — `node --test tests/release-routine-template.test.js` — Expected: PASS. Discrimination: temporarily change `kickoff` to `release` (no `--train`) → the kickoff test FAILS; restore.
- [ ] **Step 3: Commit** — `git add tests/release-routine-template.test.js` / `git commit -m "Pin the release train template and its registrations, refs #2258"` + trailer.

## Self-Review

**Spec coverage:** template → T1; routine registration → T2 (ruling 1); autonomy Routine-firing row → T2; AC1 (schedule validated like specify's) → the schema test's glob + `routine create --dry-run`'s assembly path, both unchanged; AC2/AC3 → ruling 7; AC4 → T2's bullet and the reciprocal skill-graph rows, no manual edit beyond `create release`.

**Placeholder scan:** every literal is written out above.

**Type consistency:** `kickoff: release --train` ↔ the kernel's `/claude-tweaks:routine-kickoff release --train` ↔ `routine-kickoff` Step 4's `/claude-tweaks:{first-token}` composition; the row label `` `train (Routine firing)` `` is the string T3 pins.
