# Wire Surface: terminal into /build Common Step 1.7 pre-build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/claude-tweaks:build` Common Step 1.7's surface predicate to route `Surface: terminal` records to `/claude-tweaks:design-wrapper pre-build`, matching what `terminal-routing.md`'s outcomes table already documents as the terminal track's intended behavior.

**Architecture:** `design-wrapper`'s `pre-build` mode (`plugin/skills/design-wrapper/modes/pre-build.md` Step 3) already implements the terminal-track always-load set (`_shared/terminal-ux.md` + `_shared/design-craft.md` only) and its track-resolution CLI already resolves a declared `Surface: terminal` to `track: "terminal"`/`decision: "proceed"` (`frontend-detection.md` line 99). The only gap is the caller side: `build/SKILL.md` Common Step 1.7's own surface predicate never invokes `pre-build` for `terminal`, so the branch that already exists downstream is never reached. This is a pure wiring fix — three prose edits plus one pinning test, no new runtime logic.

**Tech Stack:** Markdown skill prose (`plugin/skills/**/*.md`), `node --test` (`tests/*.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-24T032622-record-735/work/735-spec.md` (record #735)

## Global Constraints

- No new `docs/skill-graph.md` edge — build → design-wrapper is already recorded there (spec's Deliverables list confirms this explicitly).
- Do not touch `design-wrapper/modes/pre-build.md` or `terminal-routing.md` — both already implement the terminal branch correctly; this plan only wires the caller (`build/SKILL.md`) to reach it.

---

### Task 1: Extend build's Common Step 1.7 surface predicate to include terminal

**Files:**
- Modify: `plugin/skills/build/SKILL.md:182-184`
- Modify: `plugin/skills/build/design-prebuild.md:1-18`
- Test: `tests/terminal-track.test.js`

**Interfaces:**
- Consumes: nothing new — reuses the existing `/claude-tweaks:design-wrapper pre-build <spec>` invocation and the materialized header's `surface:` field, both already wired for `web | mobile | desktop`.
- Produces: nothing new — no function signatures involved, this is prose-only.

- [ ] **Step 1: Write the failing test**

Append a new test to the existing `tests/terminal-track.test.js` (it already pins other `terminal` enum sites from #601's work — this is a new, independent `test()` block in the same file, not a new file):

```javascript
test('build Common Step 1.7 routes surface: terminal to design-wrapper pre-build', () => {
  const skill = read('plugin/skills/build/SKILL.md');
  assert.match(
    skill,
    /Common Step 1\.7[\s\S]{0,400}`surface` ∈ `web \| mobile \| desktop \| terminal`/,
    'Common Step 1.7 must route surface: terminal to /claude-tweaks:design-wrapper pre-build, not only web|mobile|desktop',
  );

  const prebuild = read('plugin/skills/build/design-prebuild.md');
  assert.match(
    prebuild,
    /terminal/,
    'design-prebuild.md must document the terminal track (its always-load set, or a cite to terminal-routing.md\'s pre-build row)',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal-track.test.js`
Expected: FAIL — the new test's first assertion fails because `plugin/skills/build/SKILL.md` still reads `surface` ∈ `web | mobile | desktop` (no `terminal`).

- [ ] **Step 3: Write minimal implementation — SKILL.md**

In `plugin/skills/build/SKILL.md`, find:

```markdown
### Common Step 1.7: Design Pre-Build (frontend specs)

For frontend specs — `surface` ∈ `web | mobile | desktop`, read from the materialized header's `surface:` field (lifted from the record body's `Surface:` metadata line per `skills/flow/materialize.md`) — invoke `/claude-tweaks:design-wrapper pre-build <spec>` to lazy-load relevant design references into the implementer subagent's context. For the full skip conditions, invocation rules, result handling, and where loaded references go, see `design-prebuild.md` in this skill's directory.
```

Replace with:

```markdown
### Common Step 1.7: Design Pre-Build (frontend specs + terminal)

For a surface routed to pre-build — `surface` ∈ `web | mobile | desktop | terminal`, read from the materialized header's `surface:` field (lifted from the record body's `Surface:` metadata line per `skills/flow/materialize.md`) — invoke `/claude-tweaks:design-wrapper pre-build <spec>` to lazy-load relevant design references into the implementer subagent's context. `terminal` resolves a different, smaller always-load set (`_shared/terminal-ux.md` + `_shared/design-craft.md` only, no Impeccable references) than the three visual surfaces — see `design-prebuild.md`'s Terminal track note and `design-wrapper/terminal-routing.md`'s `pre-build` row. For the full skip conditions, invocation rules, result handling, and where loaded references go, see `design-prebuild.md` in this skill's directory.
```

- [ ] **Step 4: Write minimal implementation — design-prebuild.md**

In `plugin/skills/build/design-prebuild.md`, find the opening line:

```markdown
Common Step 1.7 of `/claude-tweaks:build`. Loaded only when the build is in record mode with a frontend surface and the plan is non-trivial.
```

Replace with:

```markdown
Common Step 1.7 of `/claude-tweaks:build`. Loaded only when the build is in record mode with a surface routed to pre-build (`web`, `mobile`, `desktop`, or `terminal`) and the plan is non-trivial.
```

Then, immediately after the existing `## Invocation` section (after its one paragraph, before `## Visual-reference scaffold (when present)`), insert a new subsection:

```markdown
## Terminal track

For `surface: terminal`, `/claude-tweaks:design-wrapper pre-build`'s own track resolution (`design-wrapper/SKILL.md`'s Layer 2 surface check) resolves `track: "terminal"` and loads a different, smaller always-load set than the three visual surfaces: `_shared/terminal-ux.md` plus `_shared/design-craft.md` only — no Impeccable references, no Emil skills, no `PRODUCT.md`/`DESIGN.md`/sidecar read (`design-wrapper/terminal-routing.md`'s `pre-build` row; the terminal branch itself lives in `design-wrapper/modes/pre-build.md` Step 3). The Result handling table and "Where the loaded references go" section below apply unchanged — the terminal track differs only in *what* gets loaded, never in how the result is consumed by `/build`.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/terminal-track.test.js`
Expected: PASS — all tests in the file, including the new one, pass.

- [ ] **Step 6: Run the full existing terminal-adjacent suite to confirm no regressions**

Run: `node --test tests/terminal-track.test.js tests/auto-mode-terminal-next-actions.test.js tests/hooks-archive-terminal.test.js`
Expected: PASS — the edits above only add a `terminal` alternative to an existing predicate and add new prose; they don't touch any of the enum literals `tests/terminal-track.test.js`'s first test already pins (`spec-template.md`, `specify/SKILL.md`, `flow/materialize.md`, `help/reference-card.md`), so those assertions should be unaffected.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/build/SKILL.md plugin/skills/build/design-prebuild.md tests/terminal-track.test.js
git commit -m "Wire Surface: terminal into build Common Step 1.7 pre-build

refs #735"
```

---

## Self-Review Notes

**Spec coverage:**
- Deliverable 1 (extend Step 1.7's predicate + design-prebuild.md skip conditions) — Task 1 Steps 3-4.
- Deliverable 2 (test pin) — Task 1 Steps 1-2, 5.
- Deliverable 3 (skill-graph edge check) — no new edge needed per the spec itself; nothing to do.
- AC 1 (SKILL.md routes surface: terminal to pre-build) — Task 1 Step 3.
- AC 2 (design-prebuild.md documents the terminal always-load set or cites terminal-routing.md) — Task 1 Step 4's new "Terminal track" subsection cites both `terminal-routing.md`'s row and `modes/pre-build.md`'s Step 3.
- AC 3 (test fails if terminal is dropped) — the new test's regex requires the literal `web | mobile | desktop | terminal` string in SKILL.md; removing `terminal` breaks the match.

**Placeholder scan:** none — every step shows the exact before/after text to write.

**Type consistency:** N/A — prose-only change, no functions or types introduced.
