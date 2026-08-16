# Feedback Frontier Flag Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/feedback`'s session-evaluation judge — the skill's one Frontier singleton slot — can actually resolve to Frontier from its call site: the hard-coded `--unattended` literal (which the resolver reads as "no human present" and unconditionally degrades Frontier on) is removed from the skill text, `--unattended` is reserved for genuinely headless invocations resolved from session state, and a conformance test pins the literal out.

**Architecture:** Text-only contract change across three markdown files plus one new conformance test. The skill authors meant `--unattended` as "no run-dir tally to consult"; `bin/lib/model-profiles/profiles.js` (~line 116) means "no human present" and degrades Frontier unconditionally, checked before the `frontier-run-cap` branch — so the judge could never resolve Frontier interactively. The resolver is NOT changed (its semantics are correct); the skill text is. Decision on the record's decide-one bullet: keep the default — the judge keeps its Frontier claim; only the flag usage is fixed.

**Tech Stack:** Markdown skill files; Node 18+ built-in `node --test` for the conformance test.

**Spec:** .claude-tweaks/pipelines/2026-08-16T164927-spec-647-648/spec-648/work/648-spec.md

## Global Constraints

- The resolver (`bin/lib/model-profiles/profiles.js`) is out of scope — no code change there.
- The literal to eliminate can SPAN A LINE BREAK: `session-evaluation.md`'s current text is `frontier\n--unattended` inside a backtick command, which is why the record's own `grep -rn "frontier --unattended" skills/` finds only `skills/init/claude-md-template.md:9` (already guarded — its own sentence says "in every headless context"). The conformance test must match `frontier\s+--unattended` with `\s+` spanning newlines.
- Commit messages: `{Verb} {what} — {detail}`, imperative, `refs #648` — NEVER "closes"/"fixes".
- All work in the worktree at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-647-648` — verify `pwd` + `git rev-parse --show-toplevel` before any commit.
- Targeted suites only per task; the full suite runs centrally after the build.

---

### Task 1: Drop the hard-coded flags and state the headless-only rule (three files)

**Files:**
- Modify: `skills/feedback/session-evaluation.md` (the `**Model:**` paragraph, ~lines 36-42)
- Modify: `skills/feedback/SKILL.md` (Step 6's `[Use: Capable]` singleton paragraph, ~line 245)
- Modify: `skills/_shared/subagent-output-contract.md` (the `**Dispatching.**` paragraph, ~line 102)

**Interfaces:**
- Consumes: nothing.
- Produces: `skills/feedback/session-evaluation.md` contains the exact command `` `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier` `` with no `--unattended` literal; Task 2's test relies on zero unguarded `frontier\s+--unattended` matches under `skills/`.

- [ ] **Step 1: Rewrite session-evaluation.md's Model paragraph**

Replace this text (current, spans lines — match it exactly as it appears in the file):

```
**Model:** resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier
--unattended` (no `--run-dir` — one judge dispatch per invocation, the contract's
standalone-invocation cap for this skill's Frontier singleton, enforced by this skill rather than
a run-dir tally). Degradation to Capable on a missed precondition is the resolver's own job,
```

with:

```
**Model:** resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier` (no
`--run-dir` — a standalone `/feedback` has no run dir, so `frontierUsed` is 0 and the resolver's
cap branch passes; one judge dispatch per invocation is the contract's standalone-invocation cap
for this skill's Frontier singleton, enforced by this skill rather than a run-dir tally). Append
`--unattended` only when this invocation is genuinely headless — a scheduled Routine or a
`claude -p` run — resolved from session state, never a literal in skill text: the resolver reads
that flag as "no human is present" and unconditionally degrades Frontier on it.
Degradation to Capable on a missed precondition is the resolver's own job,
```

Leave the rest of the paragraph (from "logged in its `source`" onward) unchanged.

- [ ] **Step 2: Rewrite SKILL.md Step 6's scrub-call sentence**

In `skills/feedback/SKILL.md`, replace:

```
Resolve the model via `node
"${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" capable --unattended` (no `--run-dir` — `/feedback`
is typically invoked standalone with no run directory; one scrub dispatch per invocation,
enforced here by this skill rather than by a run-dir tally).
```

with:

```
Resolve the model via `node
"${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" capable` (no `--run-dir` — `/feedback`
is typically invoked standalone with no run directory; one scrub dispatch per invocation,
enforced here by this skill rather than by a run-dir tally; append `--unattended` only when the
invocation is genuinely headless — a scheduled Routine or a `claude -p` run — resolved from
session state, never a hard-coded literal).
```

(Capable never degrades on the flag, but the same meaning-conflation is corrected for consistency, per the record's Deliverable 2.)

- [ ] **Step 3: Add the two-meanings sentence to the subagent contract**

In `skills/_shared/subagent-output-contract.md`'s `**Dispatching.**` paragraph, immediately after the sentence ending `(add `--run-dir "$PIPELINE_RUN_DIR"` inside a pipeline, `--unattended` in any headless context) and copy the returned `model` into the Agent tool's `model` parameter.`, insert this sentence:

```
The two flag families answer different questions: `--frontier-used N` / `--run-dir` express the Frontier singleton tally (how many Frontier dispatches this run has already spent), while `--unattended` expresses "no human is present" and unconditionally degrades a Frontier resolution — so a Frontier singleton call site must never hard-code `--unattended` into its written command; it is appended only when the invocation is genuinely headless, resolved from session state.
```

Insert as a continuation of the same paragraph (no new heading, no new list item), before "Append the returned `effortLine`..." — if the exact anchor sentence reads slightly differently, insert after the sentence that names both `--run-dir` and `--unattended`, and say so in your report.

- [ ] **Step 4: Verify AC-1 and the sweep**

Run: `node bin/resolve-profile.js frontier`
Expected: JSON with `"source"` NOT equal to `"degraded:unattended"` (typically `default`, `ceiling`, or `cap`).

Run: `grep -rn "frontier --unattended" skills/`
Expected: at most the guarded `skills/init/claude-md-template.md:9` hit (its own sentence says "in every headless context").

Run: `grep -rnz "frontier[[:space:]]*--unattended" skills/feedback/ | head -3`
Expected: no output (the line-spanning literal is gone).

- [ ] **Step 5: Run conformance suites**

Run: `node --test tests/skill-conventions.test.js tests/skill-invocation.test.js tests/skill-catalog-completeness.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/feedback/session-evaluation.md skills/feedback/SKILL.md skills/_shared/subagent-output-contract.md
git commit -m "Reserve --unattended for genuinely headless invocations — the judge's Frontier singleton resolves interactively again, refs #648"
```

---

### Task 2: Conformance test pinning zero unguarded `frontier --unattended` literals

**Files:**
- Create: `tests/frontier-unattended-literal.test.js`

**Interfaces:**
- Consumes: Task 1's cleaned skill text (zero unguarded matches).
- Produces: nothing downstream.

- [ ] **Step 1: Write the test**

Create `tests/frontier-unattended-literal.test.js`:

```js
'use strict';

// Pins record #648's contract: a Frontier singleton call site must never
// hard-code --unattended (the resolver reads it as "no human present" and
// unconditionally degrades Frontier, making the singleton slot dead at its
// call site). A literal is "guarded" when its surrounding text names the
// headless-only condition. \s+ spans newlines deliberately — the original
// offender in skills/feedback/session-evaluation.md wrapped mid-command
// ("frontier\n--unattended"), which a plain single-line grep misses.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('no unguarded "frontier --unattended" literal in skills/ (whitespace-spanning)', () => {
  const root = path.join(__dirname, '..', 'skills');
  const offenders = [];
  for (const file of mdFilesUnder(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const re = /frontier\s+--unattended/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const context = text.slice(Math.max(0, m.index - 300), m.index + 300);
      if (!/headless/i.test(context)) {
        offenders.push(`${file}: index ${m.index}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Unguarded frontier --unattended literal(s): ${offenders.join('; ')}`);
});
```

- [ ] **Step 2: Run the test — verify it passes on the fixed tree**

Run: `node --test tests/frontier-unattended-literal.test.js`
Expected: PASS (1/1).

- [ ] **Step 3: Verify the test discriminates (revert check)**

Temporarily re-introduce the old literal in `skills/feedback/session-evaluation.md` — change the command back to `` `...resolve-profile.js" frontier --unattended` `` (single line is fine) — WITHOUT committing, run the test again, and confirm it FAILS naming that file... UNLESS the surrounding paragraph now contains "headless" within 300 characters (Task 1's new prose does mention headless nearby). If the ±300-char guard window makes the reverted literal pass, tighten the check to a 150-character window before the match only, re-run both directions, and note the adjustment in your report. Then restore the file exactly (`git checkout -- skills/feedback/session-evaluation.md`) and confirm `git status --porcelain` shows only the new test file. (Expect the harness to emit a "file modified externally" reminder after the checkout — that is the checkout's own side effect, not a real conflict.)

- [ ] **Step 4: Commit**

```bash
git add tests/frontier-unattended-literal.test.js
git commit -m "Pin zero unguarded frontier --unattended literals in skills — whitespace-spanning conformance test, refs #648"
```
