# Record #1137: Opt-in auto-continue from an approved brainstorming design doc into /specify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in policy key, `specify-auto-continue`, that — when enabled — has a session invoke `/claude-tweaks:specify` on a brainstorming session's just-approved, committed design doc immediately, instead of waiting for a separate manual command. Default `false`: today's behavior (stop after brainstorming) is unchanged.

**Architecture:** `/superpowers:brainstorming` is unchanged/upstream (CLAUDE.md's own "Superpowers overrides" boundary), so the opt-in lives entirely on the claude-tweaks side: a new boolean policy key (registered the same way every other pipeline-behavior lever is), a claude-tweaks-side instruction at the handoff point (CLAUDE.md's existing "Superpowers overrides" line, extended, plus a fuller explanation in `specify/SKILL.md`), and nothing else — the auto-continued call is a literal `Skill(skill: "claude-tweaks:specify", args: "{doc-path}")` invocation, identical to what a human would type by hand, so every one of `/specify`'s own decomposition-mode gates (Step 2.5 design pre-steps, granularity contract, red-team, record creation) runs unchanged; AC3 holds by construction, not by any new enforcement code.

**Tech Stack:** Node.js (`bin/lib/policy-schema.js`) + Markdown skill prose + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1137/work/1137-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1137` (never closes/fixes).
- `/superpowers:brainstorming` itself is never edited — it is an unchanged upstream superpowers skill per CLAUDE.md's own stated boundary. Every change in this plan is claude-tweaks-side (policy schema, CLAUDE.md, `specify/SKILL.md`, tests).
- `resolve-policy.js`'s `--run <dir>` flag is optional (confirmed at plan time: `usage: resolve-policy.js [--values | --all] [--run <dir>] <key> [<key>…]`) — at the brainstorming-completion moment there is no pipeline run directory yet (brainstorming happens before `/specify`/materialize ever create one), so the resolution call in this record's prose omits `--run` entirely, reading `.claude-tweaks/policy.yml` directly with no `config.yml` overlay.
- CLAUDE.md's byte budget (confirmed at plan time: `tests/claude-md-budget.test.js`, `BUDGET_BYTES = 24576`, current size 19293 bytes) has ~5.2 KB of headroom — the planned CLAUDE.md edit extends one existing line by roughly 160 bytes, well within budget; no CLAUDE.md trimming needed elsewhere.

### Task 1: Register the policy key, wire the handoff prose, add regression tests

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js` (`POLICY_KEYS` array)
- Modify: `plugin/skills/_shared/policy-schema.md` (lever table)
- Modify: `CLAUDE.md` (the "Superpowers overrides" line)
- Modify: `plugin/skills/specify/SKILL.md` (new subsection, `### Resolve the input:`'s section)
- Modify: `tests/resolve-policy-lib.test.js` (3 new resolution tests)
- Modify: `tests/policy-schema.test.js` (bump the `POLICY_KEYS.length`/count-pin, add the running-history comment line)
- Create: `tests/specify-auto-continue-conformance.test.js`

**Interfaces:** none — pure config/prose/test addition, no new function signatures.

- [ ] **Step 1: Register the policy key**

In `plugin/bin/lib/policy-schema.js`, in the `POLICY_KEYS` array, immediately after the `review-auto-apply-prose-exempt` entry, add:

```js
  { key: 'specify-auto-continue', type: 'boolean', default: false, summary: "Lets a session invoke /claude-tweaks:specify on an approved brainstorming design doc immediately, instead of waiting for a separate manual command.", category: 'pipeline-behavior', tier: 'advanced' },
```

- [ ] **Step 2: Add the lever-table row**

In `plugin/skills/_shared/policy-schema.md`, immediately after the `review-auto-apply-prose-exempt` row, add:

```
| `specify-auto-continue` | `policy.yml` — no run dir exists at the check point (brainstorming completes before any pipeline run starts), so the resolver is invoked with no `--run` flag | `/claude-tweaks:specify` (the brainstorming → specify handoff) | `false` | When `true`, immediately invokes `/claude-tweaks:specify` on an approved, committed brainstorming design doc instead of waiting for a separate manual command — every one of `/specify`'s own decomposition-mode gates still runs, since this is the identical invocation a human would type by hand. See `skills/specify/SKILL.md`'s Auto-continue section |
```

- [ ] **Step 3: Extend CLAUDE.md's Superpowers overrides line**

In `CLAUDE.md`, change:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
```

to:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`; when policy key `specify-auto-continue` resolves `true` (default `false`), invoke `/claude-tweaks:specify` on the approved doc immediately instead — see `specify/SKILL.md`'s Auto-continue section. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
```

- [ ] **Step 4: Add the Auto-continue subsection to specify/SKILL.md**

In `plugin/skills/specify/SKILL.md`, immediately after the line "This explicit disambiguation prevents the silent wrong-path failure flagged by past polymorphic-input edge cases." and before the `## Shaping mode (one or more records)` heading, insert:

```markdown
### Auto-continue from an approved brainstorming design doc (opt-in)

The Resolve-the-input cases above cover `/specify` being invoked directly. The reverse
direction — a session that starts in `/superpowers:brainstorming` itself, not via one of
those cases — is a separate handoff, gated by the `specify-auto-continue` policy key
(`_shared/policy-schema.md`, default `false`). Resolve it with
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" specify-auto-continue` — no `--run`
flag: brainstorming completes before any pipeline run directory exists, so this is always
a standalone read of `.claude-tweaks/policy.yml`, never a `config.yml` overlay. When it
resolves `true`, immediately after `/superpowers:brainstorming` returns with its design
doc committed, invoke `Skill(skill: "claude-tweaks:specify", args: "{design-doc-path}")`
without waiting for a separate user command — this is Resolve-the-input case 2 (design
doc path) reached automatically instead of by hand, so every downstream gate (Step 2.5
design pre-steps, the granularity contract, red-team, record creation) runs exactly as it
would on a manual invocation; nothing is bypassed. When it resolves `false` (the default),
today's behavior is unchanged: `/superpowers:brainstorming` stops after the design doc,
and a human types `/claude-tweaks:specify {doc}` to continue. `/superpowers:brainstorming`
itself is unmodified — CLAUDE.md's "Superpowers overrides" section states this check as a
claude-tweaks-side handoff instruction, not an edit to the upstream skill.
```

- [ ] **Step 5: Add resolution tests**

In `tests/resolve-policy-lib.test.js`, immediately after the three existing `review-auto-apply-prose-exempt` tests, add:

```js
test('specify-auto-continue defaults to false (source: default) when unset', () => {
  const result = resolvePolicyKeys(['specify-auto-continue'], { policyRaw: null, runConfigRaw: null });
  assert.deepStrictEqual(result['specify-auto-continue'], { value: false, source: 'default' });
});

test('specify-auto-continue: true in policy.yml resolves to native boolean true', () => {
  const result = resolvePolicyKeys(['specify-auto-continue'], { policyRaw: 'specify-auto-continue: true\n' });
  assert.deepStrictEqual(result['specify-auto-continue'], { value: true, source: 'policy' });
});

test('specify-auto-continue: resolves with no runConfigRaw at all (the no-run-dir standalone read this key is designed for)', () => {
  const result = resolvePolicyKeys(['specify-auto-continue'], { policyRaw: 'specify-auto-continue: true\n' });
  assert.deepStrictEqual(result['specify-auto-continue'], { value: true, source: 'policy' });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result['specify-auto-continue'], 'renamed-from'), false);
});
```

- [ ] **Step 6: Update the POLICY_KEYS count pin**

In `tests/policy-schema.test.js`, find the comment block documenting the running history of key additions (search for `#194 (Phase 2 doc-convention wiring)`) and add a new line immediately after it:

```js
  // 59 -> 60, #1137 (brainstorming auto-continue): specify-auto-continue —
  // lets a session invoke /claude-tweaks:specify on an approved brainstorming
  // design doc immediately, see skills/specify/SKILL.md's Auto-continue section.
```

Then change both count assertions from `59` to `60`:

```js
  assert.strictEqual(POLICY_KEYS.length, 60);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 60);
```

- [ ] **Step 7: Write the conformance test**

Create `tests/specify-auto-continue-conformance.test.js`:

```js
'use strict';
// tests/specify-auto-continue-conformance.test.js — pins #1137: the
// specify-auto-continue opt-in is documented at both its policy-schema.md
// definition site and its actual handoff point (CLAUDE.md's Superpowers
// overrides line + specify/SKILL.md's Auto-continue subsection), and the
// resolve-policy.js invocation shown omits --run (this check runs before any
// pipeline run directory exists).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('CLAUDE.md names specify-auto-continue in the Superpowers overrides line', () => {
  const text = read('CLAUDE.md');
  const line = text.split('\n').find((l) => l.includes('Superpowers overrides'));
  assert.ok(line, 'CLAUDE.md must still carry a Superpowers overrides line');
  assert.ok(line.includes('specify-auto-continue'), 'the overrides line must name the new policy key');
  assert.ok(line.includes('default `false`') || line.includes('default false'), 'the overrides line must state the default');
});

test('specify/SKILL.md documents the Auto-continue subsection with the no-run-flag resolution', () => {
  const text = read('plugin', 'skills', 'specify', 'SKILL.md');
  assert.match(text, /### Auto-continue from an approved brainstorming design doc \(opt-in\)/);
  const start = text.indexOf('### Auto-continue from an approved brainstorming design doc');
  const end = text.indexOf('## Shaping mode', start);
  const region = text.slice(start, end === -1 ? text.length : end);
  assert.match(region, /specify-auto-continue/);
  assert.match(region, /resolve-policy\.js" specify-auto-continue/, 'must show the exact no-key-args-only invocation, no --run flag');
  assert.doesNotMatch(region, /resolve-policy\.js" --run/, 'must not show a --run flag for this key — no run dir exists at the check point');
  assert.match(region, /every downstream gate/i, 'must state that /specify\'s existing gates still run — AC3');
});

test('_shared/policy-schema.md carries the specify-auto-continue lever row', () => {
  const text = read('plugin', 'skills', '_shared', 'policy-schema.md');
  assert.match(text, /`specify-auto-continue`/);
  assert.match(text, /specify-auto-continue.*`false`/);
});
```

- [ ] **Step 8: Run the target test files**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/specify-auto-continue-conformance.test.js tests/resolve-policy-lib.test.js tests/policy-schema.test.js tests/claude-md-budget.test.js 2>&1 | tail -25`
Expected: all pass.

- [ ] **Step 9: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1137-full.txt 2>&1; tail -8 /tmp/1137-full.txt; grep "^not ok" /tmp/1137-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test and the already-tracked `recordDecline` concurrency test, GitHub issue #1192, are known unrelated flakes this session — re-run any failing file in isolation via `node --test <file>` before treating it as real).

- [ ] **Step 10: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/bin/lib/policy-schema.js plugin/skills/_shared/policy-schema.md CLAUDE.md plugin/skills/specify/SKILL.md tests/resolve-policy-lib.test.js tests/policy-schema.test.js tests/specify-auto-continue-conformance.test.js && git commit -m "Add specify-auto-continue: opt-in brainstorming design-doc handoff

A user brainstorming through to an approved, committed design doc had to
type /claude-tweaks:specify by hand to continue — pure ceremony, since
the design was already section-by-section approved. A new boolean policy
key (default false, unchanged behavior) lets a session invoke /specify
on the doc immediately instead. The auto-continued call is the identical
Skill invocation a human would type, so every one of /specify's own
decomposition-mode gates still runs unchanged. /superpowers:brainstorming
itself is untouched — the check lives entirely claude-tweaks-side.

refs #1137"
```

## Verification against Acceptance Criteria

- **AC1** (opt-in enabled → auto-continues without a separate manual invocation): Steps 3-4 wire the handoff instruction.
- **AC2** (opt-in disabled/default → unchanged): default `false` (Step 1), and the prose in Step 4 explicitly states the false branch is today's unchanged behavior.
- **AC3** (every existing gate still runs on the auto-continued path): true by construction — the auto-continued invocation is `Skill(skill: "claude-tweaks:specify", args: "{doc-path}")`, the exact call a human would make, entering Resolve-the-input case 2 and every downstream gate unchanged. No separate enforcement code was needed or written.

## Scope keywords:

specify-auto-continue, brainstorming, resolve-policy.js, CLAUDE.md, Superpowers overrides
