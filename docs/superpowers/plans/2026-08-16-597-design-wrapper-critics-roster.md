# design-wrapper critics.md — track-keyed critic roster (#597) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `skills/design-wrapper/critics.md` — the single curated, track-keyed table of project-local design critics that `review` mode Step 3.8 (#598) will dispatch — and move `review-animations` in `skills/_shared/design-craft.md` from the not-wired table into a new "Wired — review-time critics" table.

**Architecture:** Pure markdown. One new reference sub-file shaped like `native-routing.md` (purpose → table → definitions → delegation), one table move + one table addition + one sentence rewrite in `design-craft.md`, and two one-line roster additions (`design-wrapper/SKILL.md` Reference sub-files list, `docs/plugin-structure.md` design-wrapper row). No dispatch procedure, no lever schema, no skill-graph edges — those are #598, #595, #600.

**Tech Stack:** Markdown; `node --test tests/` conformance suites (repo-wide prose pins).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T160107-spec-597-595-598-599-601/spec-597/work/597-spec.md`

## Global Constraints

- Never restate `design-craft.md`'s Emil lookup order or motion-signal definition in `critics.md` — cite by section name (`grep -n "animation, transition, gesture" skills/design-wrapper/critics.md` must return nothing).
- `SKILL.md` additions are one line each, no prose paragraphs; measure `wc -c skills/design-wrapper/SKILL.md` before/after.
- Do NOT add `docs/skill-graph.md` edges — owned by #600.
- The `terminal` row is the literal `*pending*` pointer row only — #601 edits it in place.
- Commit messages: `{Verb} {what} — {detail}`, ending with `refs #597` (never `closes`/`fixes`).
- Work from the worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-597-595-598-599-601` — verify with `pwd` + `git rev-parse --show-toplevel` before any edit or commit.
- Do not run the full `npm test` inside a task — the build runs it centrally after all tasks. Each task runs only its own grep checks.

---

### Task 1: Create `skills/design-wrapper/critics.md`

**Files:**
- Create: `skills/design-wrapper/critics.md`

**Interfaces:**
- Consumes: section names in `skills/_shared/design-craft.md` (`## Relevance map`, `## Emil skill resolution`, `## Gating`, `## Degradation posture`), `hasDesign` in `skills/design-wrapper/impeccable-plugin.md` (`setup.hasDesign`), the three-path `DESIGN.md` lookup in `skills/_shared/visual-html-output.md` Step 1, `Design-intent:` in `skills/specify/spec-template.md`, `native-routing.md`.
- Produces: the file `skills/design-wrapper/critics.md` with a table whose columns are exactly `Track | Critic | Trigger`, read by #598's Step 3.8 and edited (terminal row) by #601.

- [ ] **Step 1: Write the file**

Write `skills/design-wrapper/critics.md` with exactly this content:

````markdown
# Critics — track-keyed roster of project-local craft critics

The single, curated roster of project-local design critics that `/claude-tweaks:design-wrapper`'s `review` mode dispatches at Step 3.8 (`modes/review.md`, #598). It is read only there. Adding a critic provider means adding a row to the table below; there is deliberately **no per-project manifest**. An open manifest (the shape #573 proposed) was rejected because it reverses `skills/_shared/design-craft.md`'s posture — upstream skills are wired by deliberate choice, not accident — and because arbitrary skills' output shapes cannot be normalized at the boundary; a curated row is the only place a critic's reply shape is known well enough to normalize.

## Roster

| Track | Critic | Trigger |
|---|---|---|
| `web` | `emil-design-eng` | Lever `full` → every web-track UI diff; `auto` → decisions present, or motion signal, or `Design-intent:` set on the record; `off` → never |
| `web` | `review-animations` | Motion signal, lever ≠ `off`. Deliberately not forced by `full` — the skill is motion-scoped; without a motion signal there is nothing for it to review |
| `ios` / `android` / `adaptive` | *none* | Deliberate: Impeccable's `critique`/`audit` already run natively with the platform named (`native-routing.md`); Emil is web-only (`design-craft.md` Gating). No decisions pushback on native until a row exists — a stated gap, not a hole; see the unblocking condition below the table |
| `terminal` | *pending* | Filled by #601 (edits this row in place) |

`Track` values come from `SKILL.md`'s track-resolution table plus `terminal`. `Critic` is an upstream skill name resolvable via the lookup cited under Resolution below, or the literal `none` / `pending`. `Trigger` prose references only the three signals defined next.

## Trigger signals

Exactly three inputs feed the Trigger column. None is defined here — each is cited to its one home:

- **Motion signal** — the motion signal defined in `skills/_shared/design-craft.md`'s **Relevance map** section (the `animate`/`animation-vocabulary` row's trigger). Cited by section name, never restated: it is an LLM judgment call there and stays one here.
- **Decisions present** — Layer 0's `hasDesign` signal (`skills/design-wrapper/SKILL.md` Layer 0, `impeccable-plugin.md`'s `setup.hasDesign`). When Layer 0 is degraded (absent plugin, version mismatch, execution failure — no signals), fall back to a direct `DESIGN.md` existence check using `skills/_shared/visual-html-output.md`'s three-path lookup (project root, `docs/design/DESIGN.md`, `docs/DESIGN.md`).
- **Lever** — the resolved `design.critique` policy value: `off | auto | full` (schema entry owned by #595; read via `bin/resolve-policy.js` by the Step 3.8 procedure, #598). `full` and `off` are the two escape hatches; `auto` conditions on the other two signals as the table states per row.

`Design-intent:` in the table is the record body-metadata line defined in `skills/specify/spec-template.md`'s metadata block.

## Resolution

Every critic name in the table resolves through `skills/_shared/design-craft.md`'s **Emil skill resolution** lookup, per skill name — `review-animations` is an Emil skill from the same upstream set and resolves exactly the same way as `emil-design-eng`. A name resolving at neither path is absent, per that file's **Degradation posture**: never a gate, never a stop; the dispatch reports it as unavailable and continues.

## Native row — unblocking condition

A native critic row is added only if a native-track craft-principles source ships upstream (an Emil-equivalent for SwiftUI/Compose), or Impeccable's native `critique`/`audit` prove insufficient in dogfooding — never by copying the web rows onto the native track, which `design-craft.md`'s Gating forbids.
````

- [ ] **Step 2: Run the acceptance greps**

Run (from the worktree root):

```bash
test -f skills/design-wrapper/critics.md && echo OK-exists
grep -c "^| \`web\` | \`emil-design-eng\`" skills/design-wrapper/critics.md
grep -c "^| \`web\` | \`review-animations\`" skills/design-wrapper/critics.md
grep -c "^| \`ios\` / \`android\` / \`adaptive\` | \*none\*" skills/design-wrapper/critics.md
grep -c "^| \`terminal\` | \*pending\*" skills/design-wrapper/critics.md
grep -n "animation, transition, gesture" skills/design-wrapper/critics.md
grep -n "unblocking\|added only if" skills/design-wrapper/critics.md
```

Expected: `OK-exists`; the four counts each print `1`; the `animation, transition, gesture` grep prints nothing (exit 1); the last grep prints two lines (the `## Native row — unblocking condition` heading and the "added only if" sentence).

- [ ] **Step 3: Commit**

```bash
git add skills/design-wrapper/critics.md
git commit -m "Add design-wrapper critics.md — track-keyed curated critic roster for review-mode Step 3.8 — refs #597"
```

---

### Task 2: Move `review-animations` to a review-time wired table in `design-craft.md`

**Files:**
- Modify: `skills/_shared/design-craft.md:47-68` (the `## Relevance map` section)

**Interfaces:**
- Consumes: `skills/design-wrapper/critics.md` (Task 1) — cited by path in the new table's Trigger column.
- Produces: a `Wired — review-time critics` table heading line that Task 3's checks and #600's docs edges will reference.

- [ ] **Step 1: Add the review-time wired table**

In `skills/_shared/design-craft.md`, immediately after the existing writing-time wired table (the table ending with the `apple-design` row) and before the line `Deliberately not wired — a future consumer wires these by deliberate choice, not accident:`, insert:

```markdown
Wired — review-time critics (a skill may be wired for both roles; the writing-time table above governs context assembly, this one governs review-time critique — see `skills/design-wrapper/critics.md`):

| Skill | Trigger |
|---|---|
| `emil-design-eng` | see `skills/design-wrapper/critics.md` |
| `review-animations` | see `skills/design-wrapper/critics.md` |

```

(Blank line before and after the block, so the three tables stay separated.)

- [ ] **Step 2: Remove `review-animations` from the not-wired table**

Delete this single line from the "Deliberately not wired" table:

```markdown
| `review-animations` | Review-time critique of existing motion — no consumer composes build-time context from it. |
```

- [ ] **Step 3: Rewrite the closing sentence**

Replace the line

```markdown
The map accounts for the whole upstream skill set as pinned in the drift manifest. A new upstream skill appearing there is triaged into one of these two tables — never silently absent.
```

with

```markdown
The map accounts for the whole upstream skill set as pinned in the drift manifest. Every upstream skill appears in at least one wired table (a skill may be wired for both the writing-time and review-time roles) or in the not-wired table — never silently absent. A new upstream skill appearing there is triaged into one of them.
```

- [ ] **Step 4: Run the acceptance greps**

```bash
grep -n "review-animations" skills/_shared/design-craft.md
grep -c "emil-design-eng" skills/_shared/design-craft.md
grep -n "at least one wired table" skills/_shared/design-craft.md
grep -n "Wired — review-time critics" skills/_shared/design-craft.md
grep -n "Deliberately not wired" skills/_shared/design-craft.md
```

Expected: `review-animations` appears exactly once, on a line **between** the `Wired — review-time critics` line number and the `Deliberately not wired` line number (i.e. under the review-time heading, not in the not-wired table); `emil-design-eng` count ≥ 2; the "at least one wired table" grep returns the rewritten closing sentence; the last two greps each return one line.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/design-craft.md
git commit -m "Move review-animations into a review-time wired table in design-craft.md — every upstream skill appears in at least one wired table or the not-wired table — refs #597"
```

---

### Task 3: Roster pointers — `design-wrapper/SKILL.md` bullet + `docs/plugin-structure.md` row

**Files:**
- Modify: `skills/design-wrapper/SKILL.md:245-251` (the `## Reference sub-files` bullet list)
- Modify: `docs/plugin-structure.md:61` (the `| design-wrapper | ...` row)

**Interfaces:**
- Consumes: `skills/design-wrapper/critics.md` (Task 1) exists.
- Produces: nothing downstream in this spec.

- [ ] **Step 1: Measure SKILL.md before**

```bash
wc -c skills/design-wrapper/SKILL.md
```

Note the byte count.

- [ ] **Step 2: Add the Reference sub-files bullet**

In `skills/design-wrapper/SKILL.md`, in the `## Reference sub-files` bullet list, insert this one bullet immediately after the `native-routing.md` bullet (before the `impeccable-cli.md` bullet):

```markdown
- `critics.md` — track-keyed roster of project-local craft critics; read only by `review` mode Step 3.8.
```

- [ ] **Step 3: Add critics.md to the plugin-structure row**

In `docs/plugin-structure.md`, on the `| design-wrapper | availability.md, command-map.md, ...` row: in the file-list column, insert `critics.md, ` immediately after `command-map.md, ` (keeping alphabetical order: `availability.md, command-map.md, critics.md, frontend-detection.md, ...`); and in the description column, append before the closing ` |`: `; the track-keyed roster of project-local craft critics (\`critics.md\`), read only by \`review\` mode Step 3.8`.

- [ ] **Step 4: Run the acceptance greps and re-measure**

```bash
grep -c "critics.md" skills/design-wrapper/SKILL.md docs/plugin-structure.md
wc -c skills/design-wrapper/SKILL.md
```

Expected: `skills/design-wrapper/SKILL.md:1` and `docs/plugin-structure.md:2` (or ≥1 each); SKILL.md grew by roughly 110 bytes only.

- [ ] **Step 5: Run the targeted structure/conformance suites**

```bash
node --test tests/skill-catalog-completeness.test.js 2>&1 | tail -3
node --test tests/skill-conventions.test.js 2>&1 | tail -3
node --test tests/claude-md-budget.test.js 2>&1 | tail -3
```

Expected: `# fail 0` for each.

- [ ] **Step 6: Commit**

```bash
git add skills/design-wrapper/SKILL.md docs/plugin-structure.md
git commit -m "List critics.md in design-wrapper's Reference sub-files and the plugin-structure sub-file row — refs #597"
```
