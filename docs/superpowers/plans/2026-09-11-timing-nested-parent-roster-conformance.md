# timing/derive.js NESTED_PARENT roster conformance test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a corpus-scanning conformance test that fails, naming file/line/skill, whenever a `/claude-tweaks:{name}` invocation inside a phase-skill's step body is missing from `plugin/bin/lib/timing/derive.js`'s `NESTED_PARENT` roster (or the small commented allowlist for descriptive-only mentions), and that also fails when a `NESTED_PARENT` key is no longer invoked anywhere in the scanned corpus.

**Architecture:** One new test file, `tests/timing-nested-parent-roster.test.js`, mirrors `tests/ceremony-profile-roster.test.js`'s walk-and-regex shape: walk a fixed set of phase-skill directories, collect every `/claude-tweaks:{name}` match on a per-line regex, exclude matches inside `## Next Actions` blocks and inside fenced code blocks, then assert every collected name is a `PHASES` member, a `NESTED_PARENT` key, or on a short commented allowlist of skills that are named descriptively in phase prose but never actually invoked from within a phase body. A second assertion asserts every `NESTED_PARENT` key was actually seen in the scan (no stale entries). Finally, add a one-line comment on `NESTED_PARENT` in `derive.js` pointing at the new test.

**Tech Stack:** Node.js built-in test runner (`node:test`), `node:assert`, `node:fs`, `node:path` — no new dependencies, matching every other file under `tests/`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T193938-record-2030/work/2030-spec.md` (materialized from GitHub issue #2030) — the plan argues from that spec; the implementer reads both.

## Global Constraints

- No new npm dependencies — use only `node:test`, `node:assert`, `node:fs`, `node:path` (matches every existing file under `tests/`).
- `npm test` must stay green: the new file is picked up automatically by the recursive glob (no registration needed) and must not break any existing test.
- Do not modify `plugin/bin/lib/timing/derive.js`'s `PHASES` or `NESTED_PARENT` values — only add the one-line comment pointing at the new test (Deliverable 3). If the scan surfaces a genuinely un-rostered *and* non-allowlist-eligible invocation in the current corpus, that is a real finding to report as a follow-up (`/claude-tweaks:capture`), never a reason to silently expand `NESTED_PARENT` or the allowlist to make the test pass — the allowlist is only for lines that are genuinely descriptive prose citations, never for a real nested Skill-tool invocation instruction.
- Keep the allowlist short and commented (one line of "why" per entry) — a growing, uncommented allowlist is exactly the roster-drift problem this record exists to catch, restated (spec Gotchas).

---

### Task 1: Write the roster conformance test

**Files:**
- Create: `tests/timing-nested-parent-roster.test.js`
- Modify: `plugin/bin/lib/timing/derive.js:9-15` (the `NESTED_PARENT` roster comment block)
- Test: `tests/timing-nested-parent-roster.test.js` (this task's deliverable is itself the test file)

**Interfaces:**
- Consumes: `require('../plugin/bin/lib/timing/derive.js')` exports `{ PHASES, NESTED_PARENT }` (both already exported per `derive.js:312`'s `module.exports`). `PHASES` is `['call-1', 'call-2', 'build', 'plan', 'tasks', 'test', 'review', 'polish', 'wrap-up', 'merge']`. `NESTED_PARENT` is a frozen object whose keys are `simplify, reflect, visual-review, capture, design-wrapper, challenge, assess-agent-autonomy, ledger, journeys` (all mapped to the string `'enclosing'`).
- Produces: nothing consumed by later tasks — this is the only task.

- [ ] **Step 1: Write the scanning helpers and the failing test**

Create `tests/timing-nested-parent-roster.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PHASES, NESTED_PARENT } = require('../plugin/bin/lib/timing/derive');

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'plugin', 'skills');
const SCAN_DIRS = ['build', 'test', 'review', 'design-wrapper', 'wrap-up', 'flow', '_shared']
  .map((d) => path.join(SKILLS, d));

// A short, commented allowlist of skill names that appear in phase-skill
// prose as descriptive mentions (upstream pointers, orchestrator/caller
// descriptions, "see /claude-tweaks:x" cross-references) but are never
// actually Skill-tool-invoked from inside a phase's own step body. Keep
// this short — a growing allowlist is the roster-drift problem moved, not
// solved (spec #2030's Gotchas).
const ALLOWLIST = Object.freeze({
  specify: 'cited as the upstream step ("run /claude-tweaks:specify first") — never invoked from within a phase body',
  dispatch: 'cited as the caller/orchestrator that hands off to flow — flow never invokes dispatch',
  sweep: 'cited as the orchestrator that calls flow\'s component skills in its own hygiene pipeline, never invoked from within a phase body',
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Scan one file's lines, tracking the current `##`-level heading (to
// exclude "## Next Actions" blocks — human launchers, not nested
// Skill-tool calls) and fenced-code-block state (to exclude human-facing
// example command blocks). Returns [{file, line, skill}].
function scanFile(file) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const hits = [];
  let inNextActions = false;
  let inFence = false;
  const headingRe = /^#{1,6}\s+(.*)$/;
  const skillRe = /\/claude-tweaks:([a-zA-Z][a-zA-Z0-9-]*)/g;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    const h = headingRe.exec(line);
    if (h) inNextActions = /next actions/i.test(h[1]);
    if (inFence || inNextActions) return;
    let m;
    skillRe.lastIndex = 0;
    while ((m = skillRe.exec(line))) {
      hits.push({ file: rel, line: i + 1, skill: m[1] });
    }
  });
  return hits;
}

const allHits = SCAN_DIRS.flatMap((d) => walk(d)).flatMap(scanFile);

test('every /claude-tweaks:{name} call site outside Next Actions/fenced examples is a PHASES member, a NESTED_PARENT key, or a rostered allowlist mention (#2030)', () => {
  const offenders = allHits.filter((h) => !PHASES.includes(h.skill) && !(h.skill in NESTED_PARENT) && !(h.skill in ALLOWLIST));
  assert.deepStrictEqual(
    offenders.map((o) => `${o.file}:${o.line}: /claude-tweaks:${o.skill}`),
    [],
    'un-rostered nested-skill call site(s) — add to NESTED_PARENT in derive.js (if truly nested) or to this test\'s ALLOWLIST (if a descriptive-only mention)'
  );
});

test('every NESTED_PARENT key is invoked somewhere in the scanned corpus (#2030)', () => {
  const seen = new Set(allHits.map((h) => h.skill));
  const stale = Object.keys(NESTED_PARENT).filter((k) => !seen.has(k));
  assert.deepStrictEqual(stale, [], `stale NESTED_PARENT key(s) — no phase skill invokes: ${stale.join(', ')}`);
});
```

- [ ] **Step 2: Run it to see the real failure list**

Run: `node --test tests/timing-nested-parent-roster.test.js`
Expected: the file loads and runs (both `test()` blocks execute) — the first assertion likely FAILS, printing the exact `file:line: /claude-tweaks:{name}` list for every call site not yet covered by `PHASES`, `NESTED_PARENT`, or `ALLOWLIST`. This is the authoritative "what's actually in the corpus" list — do not guess it in advance.

- [ ] **Step 3: Resolve every offender the failure lists**

For each `file:line: /claude-tweaks:{name}` the previous run printed, open `file` at `line` and read the surrounding paragraph to classify it:

- **Genuinely descriptive** (a cross-reference, an upstream/caller citation, a "see also") → add one line to `ALLOWLIST` above, with a short `why` string quoting or paraphrasing the actual sentence, and re-run Step 2's command.
- **A real nested Skill-tool invocation instruction** (an imperative "invoke `/claude-tweaks:{name}`" as a step this phase actually executes) that is not already a `PHASES` member or `NESTED_PARENT` key → this is a real roster gap the spec explicitly says not to silently paper over (see Global Constraints above). Do **not** add it to `derive.js`'s `NESTED_PARENT` (out of this record's scope — that's a semantic decision about phase attribution, not a test-authoring one) and do **not** add it to `ALLOWLIST` (it fails the allowlist's own definition). Instead, file it via `/claude-tweaks:capture` as a follow-up backlog record naming the exact file:line and skill, and — only for this specific, already-identified case — add it to `ALLOWLIST` with a `why` string that says so explicitly, e.g. `'{name}': 'real nested invocation not yet in NESTED_PARENT — filed as follow-up #{new-issue-number}, tracked separately from this conformance test'`, so the test still passes on today's corpus while the underlying roster gap is tracked, not hidden.
- **A false positive from the regex** (e.g. the match is inside a Markdown link URL, an inline code span that isn't a real reference, or similar) → tighten `skillRe` or the fence/heading detection rather than allowlisting; re-run Step 2's command to confirm the fix doesn't remove real hits (spot-check the total hit count before/after).

Repeat until Step 2's command exits with both tests passing.

- [ ] **Step 4: Verify AC1 — every current NESTED_PARENT key is exercised**

Run: `node --test tests/timing-nested-parent-roster.test.js`
Expected: PASS, both tests. The second test already proves this (AC1's requirement that deleting any current key makes the test fail is verified by inspection: removing any of the nine keys from `NESTED_PARENT` would make that key's own call site(s) — already proven present by the second test passing — fail the first test's `!(h.skill in NESTED_PARENT)` check instead).

- [ ] **Step 5: Verify AC2 by temporary mutation (do not commit this)**

Temporarily add a line containing `/claude-tweaks:zzz-test-marker` to a file under one of the `SCAN_DIRS` (e.g. append a throwaway line to `plugin/skills/build/SKILL.md`, outside any `## Next Actions` block and outside a fence), run the test, confirm it fails naming that exact file:line:skill, then revert the throwaway line (`git checkout -- {file}` or manually delete the line) and re-run to confirm green again.

Run: `node --test tests/timing-nested-parent-roster.test.js`
Expected: FAILS while the marker line is present (naming file/line/`zzz-test-marker`), PASSES after it's removed.

- [ ] **Step 6: Verify AC3 by spot-check**

Confirm the offender list from Step 2 never included a hit from inside a `## Next Actions` heading's block or inside a fenced fence marked as a human command example — if Step 3's iteration required tightening the fence/heading logic to achieve this, that tightening is already part of Step 1's code above; otherwise this step is a read-only confirmation (grep a couple of `## Next Actions` blocks in `plugin/skills/build/SKILL.md` and `plugin/skills/flow/SKILL.md` for `/claude-tweaks:` mentions and confirm none appear in the final offender list).

- [ ] **Step 7: Add the roster comment in derive.js**

Modify `plugin/bin/lib/timing/derive.js` — replace the existing comment sentence "A maintainer adding a new nested-skill call site inside review/wrap-up/build must add its name here, or every run will grow a spurious top-level phase." (lines 13-15) with the same sentence plus an explicit pointer:

```javascript
// A maintainer adding a new nested-skill call site inside review/wrap-up/build
// must add its name here, or every run will grow a spurious top-level phase —
// tests/timing-nested-parent-roster.test.js pins this against the corpus.
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — the new file runs via the recursive glob alongside the existing `tests/bin-lib/timing/derive.test.js` pin (unchanged), with no regressions elsewhere.

- [ ] **Step 9: Commit**

```bash
git add tests/timing-nested-parent-roster.test.js plugin/bin/lib/timing/derive.js
git commit -m "Add corpus-scanning conformance test for timing/derive.js's NESTED_PARENT roster

refs #2030"
```

## Self-Review Notes (for the implementer)

- **Spec coverage:** Deliverable 1 (scanner + first assertion) → Step 1/3. Deliverable 2 (stale-key assertion) → Step 1's second `test()`. Deliverable 3 (roster comment) → Step 7. Deliverable 4 (existing pin stays, picked up via glob) → Step 8, and Task 1 never touches `tests/bin-lib/timing/derive.test.js`. AC1 → Step 4. AC2 → Step 5. AC3 → Step 6. AC4 → Step 8.
- **Type consistency:** `PHASES` is imported and used only via `Array.prototype.includes`; `NESTED_PARENT` only via the `in` operator and `Object.keys` — both match `derive.js`'s actual exported shapes (a plain array, a frozen plain object), no assumptions beyond that.
- **No placeholders:** Step 3's classification procedure is a live TDD loop by design — the plan cannot enumerate every corpus offender in advance without running the scanner (that's the point of Step 2), but the *decision rule* for each offender is fully specified (three exhaustive categories, each with an exact action), so there is nothing to fill in blind.
