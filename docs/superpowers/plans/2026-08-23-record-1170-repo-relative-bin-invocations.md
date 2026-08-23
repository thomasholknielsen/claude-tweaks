# Record #1170: Repo-Relative bin Invocations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every consumer-reachable repo-relative `node plugin/bin/…` invocation in skill prose (dead with MODULE_NOT_FOUND in every installed-plugin project) to the `"${CLAUDE_PLUGIN_ROOT}/bin/…"` form, and pin the class closed with a conformance test carrying a documented exemption list.

**Architecture:** One mechanical task. Pre-plan sweep (already run, results below) found 3 consumer-reachable hits and 2 legitimate maintainer-side exemptions. The conformance test lives alongside the existing skill-prose suites and goes red when any non-exempt `node plugin/bin/` reappears.

**Tech Stack:** Markdown skill prose + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1170/work/1170-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1170` (never closes/fixes).
- Pre-plan sweep results (`grep -rn "node plugin/bin/" plugin/skills/ | grep -v CLAUDE_PLUGIN_ROOT`), verified at plan time — the complete hit list:
  1. `plugin/skills/_shared/pr-early-run-lifecycle.md` ~line 324-325 — the spec's primary bug: `node\nplugin/bin/merge-size-probe.js --integration-branch origin/{integration-branch}` (NOTE: the invocation wraps across two physical lines — `node` at the end of line 324, `plugin/bin/merge-size-probe.js …` starting line 325).
  2. `plugin/skills/_shared/pipeline-run-dir.md` line 27 — a usage synopsis for `hooks.js resolve-run-dir`, a verb consumers invoke.
  3. `plugin/skills/flow/multi-spec.md` line 91 — "written exclusively through `node plugin/bin/hooks.js spec-status`", a verb consumers invoke.
  4. EXEMPT: `plugin/skills/flow/summary-template.md` lines 84 and 89 — `node plugin/bin/release.js …`: releasing is a maintainer action run from a clean `main` checkout of the claude-tweaks repo itself (CLAUDE.md's `## Releasing` section and `docs/releasing.md` use the identical repo-relative form), so repo-relative is correct there.

### Task 1: Fix the three invocations and pin the class

**Files:**
- Modify: `plugin/skills/_shared/pr-early-run-lifecycle.md` (~line 324-325)
- Modify: `plugin/skills/_shared/pipeline-run-dir.md` (line 27)
- Modify: `plugin/skills/flow/multi-spec.md` (line 91)
- Create: `tests/skill-prose-plugin-root-invocations.test.js`

**Interfaces:** none — self-contained.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/skill-prose-plugin-root-invocations.test.js`:

```js
// tests/skill-prose-plugin-root-invocations.test.js — pins #1170: skill prose must never
// invoke a plugin bin via a repo-relative `node plugin/bin/…` path. In any consumer project
// running the installed plugin there is no plugin/ subtree, so the invocation dies with
// MODULE_NOT_FOUND — and degrade clauses ("log a warning and continue") swallow it, so the
// step silently never runs anywhere but this repo itself. The `"${CLAUDE_PLUGIN_ROOT}/bin/…"`
// form is the only install-safe invocation.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');

// Documented exemptions — file (relative to plugin/skills/) -> why repo-relative is correct there.
// release.js is a maintainer command run from a clean main checkout of the claude-tweaks repo
// itself (CLAUDE.md `## Releasing`, docs/releasing.md use the identical form), never from an
// installed consumer plugin.
const EXEMPT = new Map([
  ['flow/summary-template.md', /node plugin\/bin\/release\.js/],
]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

test('no skill prose invokes a bin via a repo-relative `node plugin/bin/` path (install-dead — #1170)', () => {
  const offenders = [];
  for (const file of walk(SKILLS)) {
    const rel = path.relative(SKILLS, file);
    // Normalize the one wrap shape that hid the original bug: `node` at end-of-line,
    // `plugin/bin/…` starting the next line (pr-early-run-lifecycle.md's own line wrap).
    const text = fs.readFileSync(file, 'utf8').replace(/node\s*\n\s*plugin\/bin\//g, 'node plugin/bin/');
    const exemptRe = EXEMPT.get(rel);
    for (const line of text.split('\n')) {
      if (!line.includes('node plugin/bin/')) continue;
      if (exemptRe && exemptRe.test(line)) continue;
      offenders.push(`${rel}: ${line.trim().slice(0, 120)}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `repo-relative plugin/bin invocations in skill prose:\n${offenders.join('\n')}`);
});

test('the exemption list only exempts lines that still exist (no stale exemptions)', () => {
  for (const [rel, re] of EXEMPT) {
    const text = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    assert.ok(re.test(text), `stale exemption: ${rel} no longer contains ${re}`);
  }
});
```

- [ ] **Step 2: Run to verify it fails (red gate)**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/skill-prose-plugin-root-invocations.test.js 2>&1 | tail -8`
Expected: FAIL — the offender list must name all three hits (pr-early-run-lifecycle.md via the wrap-normalization, pipeline-run-dir.md, multi-spec.md) and NOT the exempt release.js lines. If the pr-early-run-lifecycle.md wrapped hit is missing from the failure output, the wrap-normalization regex is wrong — fix the test, not the expectation.

- [ ] **Step 3: Fix the three invocations**

In each file, replace the repo-relative form with the plugin-root form, changing nothing else on the line:
- `plugin/skills/_shared/pr-early-run-lifecycle.md` ~324-325: `node\nplugin/bin/merge-size-probe.js --integration-branch …` → `node\n"${CLAUDE_PLUGIN_ROOT}/bin/merge-size-probe.js" --integration-branch …` (keep the existing line wrap; the quoted plugin-root form starts line 325).
- `plugin/skills/_shared/pipeline-run-dir.md` line 27: `node plugin/bin/hooks.js resolve-run-dir …` → `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir …`.
- `plugin/skills/flow/multi-spec.md` line 91: `node plugin/bin/hooks.js spec-status` → `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" spec-status`.

- [ ] **Step 4: Run the test to verify it passes, plus neighboring prose pins**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/skill-prose-plugin-root-invocations.test.js tests/console-on-pr.test.js 2>&1 | tail -6`
Then check for pins on the three edited files: `grep -rln "pr-early-run-lifecycle\|pipeline-run-dir\|multi-spec" tests/*.js` — run every hit and quote tails. A pin failing on the edited lines means adjust wording expectations carefully (the plugin-root form is non-negotiable; a pin that requires the repo-relative form is itself the bug this record fixes — report it rather than reverting).

- [ ] **Step 5: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1170-full.txt 2>&1; tail -8 /tmp/1170-full.txt; grep "^not ok" /tmp/1170-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test is a known machine-load flake — re-run `node --test tests/bin-lib/reconcile/pr-state.test.js` in isolation before treating it as real).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/skills/_shared/pr-early-run-lifecycle.md plugin/skills/_shared/pipeline-run-dir.md plugin/skills/flow/multi-spec.md tests/skill-prose-plugin-root-invocations.test.js && git commit -m "Fix repo-relative plugin/bin invocations in skill prose — dead in every consumer install

An installed plugin has no plugin/ subtree, so 'node plugin/bin/…' dies
with MODULE_NOT_FOUND and degrade clauses swallow it — the #641
merge-size probe silently never ran outside this repo. All three
consumer-reachable hits now use the CLAUDE_PLUGIN_ROOT form; a
conformance test pins the class with a documented release.js exemption
(maintainer command, run from the repo checkout).

refs #1170"
```

## Verification against Acceptance Criteria

- **AC1** (no repo-relative invocations in skill instruction text): Step 3 fixes all three sweep hits; the exempt release.js lines are maintainer-side by documented rationale.
- **AC2** (test goes red when the old line is restored): Step 2's red gate demonstrates exactly this — the test fails against the pre-fix tree.

## Scope keywords:

merge-size-probe, node plugin/bin/, CLAUDE_PLUGIN_ROOT
