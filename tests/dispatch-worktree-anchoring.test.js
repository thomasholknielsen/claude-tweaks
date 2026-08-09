'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #295 (closing #155) removed the "every group is a parallel Task agent that creates
// its own worktree" model from /claude-tweaks:dispatch Step 5: a Task-tool subagent is
// always launched cwd-pinned to the DISPATCHING session's worktree, so it can never get
// an independent one. The dispatching session now enters group N's worktree, dispatches
// group N's agent into that inherited cwd, waits for a terminal outcome, tears the
// worktree down, and only then enters group N+1's.
//
// The prose that actually executes is the literal Task() prompt inlined into every
// dispatched agent. A whole-branch review caught that prompt still saying "create your
// own worktree" — the exact instruction the fix exists to retire — while the surrounding
// narrative had already been rewritten. No test read skill prose, so nothing failed.
// This is that test: the forbidden phrasings below are the pre-fix wording, so an edit
// that reintroduces the retired model fails the suite instead of shipping a prompt that
// contradicts its own step.
//
// See CLAUDE.md's Don't: "Don't pass isolation: 'worktree' to the Agent tool when
// dispatching from inside a worktree already set up for the task ... Anchor to the
// existing path via the prompt."

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SKILL = read('skills', 'dispatch', 'SKILL.md');
const SEQUENTIAL = read('skills', 'dispatch', 'sequential-execution.md');

// Scope the sweep to Step 5 rather than the whole SKILL.md: the retired model is a
// Step 5 claim, and a whole-file sweep would be at the mercy of unrelated prose
// elsewhere reusing the same vocabulary.
function step5Region(text) {
  const start = text.indexOf('### Step 5:');
  assert.notStrictEqual(start, -1, 'skills/dispatch/SKILL.md no longer has a "### Step 5:" heading — this guard has lost its anchor');
  const end = text.indexOf('\n### Step 6', start);
  return text.slice(start, end === -1 ? text.length : end);
}

// The literal prompt handed to each group's Task agent — the part of Step 5 that
// actually executes, and where the pre-fix instruction survived the rewrite.
function taskPromptRegion(text) {
  const start = text.indexOf("Each group's `Task()` prompt");
  assert.notStrictEqual(start, -1, 'skills/dispatch/SKILL.md no longer introduces the per-group Task() prompt — this guard has lost its anchor');
  const end = text.indexOf('None of Templates A/B/C', start);
  assert.notStrictEqual(end, -1, 'the Task() prompt block is no longer followed by its template note — this guard has lost its anchor');
  return text.slice(start, end);
}

const REGIONS = [
  ['skills/dispatch/SKILL.md (Step 5)', step5Region(SKILL)],
  ['skills/dispatch/sequential-execution.md', SEQUENTIAL],
];

// Each entry is one pre-fix phrasing. One test per pattern per region — a single test
// stacking every assertion short-circuits at the first failure and hides the rest.
const FORBIDDEN = [
  [
    /creat\w*\s+(?:your|its|their)\s+own\s+(?:fresh\s+)?worktree/i,
    'the dispatched agent inherits the dispatching session\'s worktree; it must never be told to create one of its own',
  ],
  [
    /with\s+its\s+own\s+worktree/i,
    'no group "becomes one Task agent with its own worktree" — a subagent cannot be given an independent worktree (#155)',
  ],
  [
    /do\s+not\s+pre-create/i,
    'pre-creation by the dispatching session IS the new mechanism — forbidding it is the literal negation of the fix',
  ],
  [
    /parallel\s+Task\s+agents?\b/i,
    'Step 5 dispatches exactly one Task agent at a time; a "parallel Task agent" claim is the retired model',
  ],
];

for (const [name, region] of REGIONS) {
  for (const [pattern, why] of FORBIDDEN) {
    test(`${name}: does not reinstate ${pattern}`, () => {
      const hit = region.match(pattern);
      assert.ok(
        hit === null,
        `${name} matches ${pattern}${hit ? ` at "${hit[0]}"` : ''} — ${why}`,
      );
    });
  }
}

// Negative guards alone would also pass if the Working-directory instruction were simply
// deleted. These pin that the replacement is actually present and says the anchoring
// thing, so a deletion fails too.

test('the Task() prompt anchors the agent to the inherited worktree', () => {
  const prompt = taskPromptRegion(SKILL);
  assert.match(
    prompt,
    /Working directory:/,
    'the dispatched prompt must still carry a Working directory instruction — agents only see what is in their prompt',
  );
  assert.match(
    prompt,
    /inherit/i,
    'the prompt must tell the agent it INHERITS the dispatching session\'s worktree',
  );
});

test('the Task() prompt still requires a pwd / rev-parse check before committing', () => {
  const prompt = taskPromptRegion(SKILL);
  assert.match(prompt, /git rev-parse --show-toplevel/, 'the executable cwd check must survive the rewrite');
  assert.match(
    prompt,
    /BLOCKED/,
    'a resolved-to-the-main-checkout cwd must stop the agent, not merely be noticed',
  );
});

test('Step 5 states that the dispatching session enters the worktree before dispatching', () => {
  const step5 = step5Region(SKILL);
  assert.match(
    step5,
    /dispatching session/i,
    'Step 5 must name the dispatching session as the thing that switches worktrees between groups',
  );
});
