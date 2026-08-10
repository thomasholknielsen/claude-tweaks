'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #297: a `pending-review` outcome used to leave its branch only inside the sandbox that
// built it (observed live 2026-08-09 — bundle #264,#223,#221,#220,#179 built clean, landed
// pending-review, and `git ls-remote` found nothing on origin). These guards pin the parts
// of the procedure that are statements rather than code: the scope guard that keeps it off
// interactive and failed/blocked runs, the deliberate non-reuse of the merge path's
// close-run, and the three failure fallbacks. Prose is the implementation here, so prose is
// what has to be pinned.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const DURABILITY = read('skills', '_shared', 'pending-review-durability.md');
const WRAP_CONSOLE = read('skills', 'wrap-up', 'review-console.md');
const MULTI_CONSOLE = read('skills', 'flow', 'multispec-review-console.md');
const BRIEF = read('skills', 'wrap-up', 'verification-brief.md');
const TASK_PROMPT = read('skills', 'dispatch', 'task-prompt.md');

test('the scope guard gates on CLAIM_RUN_ID as the headless signal', () => {
  assert.match(
    DURABILITY,
    /`CLAIM_RUN_ID`\s+is\s+set\s+and\s+non-empty/,
    'without an explicit CLAIM_RUN_ID gate this pushes and opens PRs for interactive human-run /flow sessions too, where the human already has the branch in their own terminal',
  );
});

test('the scope guard excludes failed and blocked outcomes', () => {
  assert.match(
    DURABILITY,
    /Never\s+push\s+or\s+open\s+a\s+PR\s+for\s+a\s+`failed`\s+or\s+`blocked`\s+outcome/,
    'pushing an incomplete or broken branch is noise, not signal — the exclusion has to be stated, not inferred from the pending-review wording',
  );
});

test('the procedure states it never calls close-run', () => {
  assert.match(
    DURABILITY,
    /never\s+calls\s+`close-run`/,
    "close-run exists in the merge path to clear the run's worktree assignment for a main-checkout merge; reusing it here would end the run's worktree enforcement for a run that is still active",
  );
});

test("the procedure states it never clears the run's worktree assignment", () => {
  assert.match(
    DURABILITY,
    /never\s+clears\s+the\s+run's\s+worktree\s+assignment/,
    'the run must stay active with its worktree assigned — the only difference after this procedure is that the branch also exists on origin',
  );
});

test('the push is issued as its own Bash call from inside the worktree', () => {
  assert.match(
    DURABILITY,
    /git -C "\{worktree-path\}" push origin \{branch\}/,
    'the worktree.always gate inspects the whole command string up front, so a chained push is denied entirely and neither half runs (IL-33)',
  );
});

test('an existing open PR on the branch is detected before creating one', () => {
  assert.match(
    DURABILITY,
    /gh pr list --repo \{owner\}\/\{repo\} --head \{branch\} --state open/,
    'a retried run reaching pending-review a second time must skip creation rather than erroring or opening a duplicate',
  );
});

test('a push failure falls back to today behavior instead of attempting the PR', () => {
  assert.match(
    DURABILITY,
    /the\s+branch\s+stays\s+local,\s+the\s+console\s+renders\s+unchanged/,
    'a failed push must degrade to exactly the pre-#297 behavior, not to a half-state that also tries to open a PR for a branch origin does not have',
  );
});

test('a PR-creation failure is retried exactly once', () => {
  assert.match(
    DURABILITY,
    /retry\s+it\s+once/,
    'the durability goal is already met once the push landed, so the PR gets one retry and then a recorded failure — never an unbounded loop and never a silent drop',
  );
});

test('the PR base ref resolves through the shared integration-branch ladder', () => {
  assert.match(
    DURABILITY,
    /`skills\/_shared\/integration-branch\.md`/,
    'four sites once answered "which branch do we target" four different ways; a fifth inline resolver is what integration-branch.md exists to prevent',
  );
});

test('the outcome record is written to the run-dir root, never staged/', () => {
  assert.match(
    DURABILITY,
    /\*\*Root,\s+never\s+`staged\/`\.\*\*/,
    "both consoles classify a staged file carrying a Title:/Type:/Labels: header as a queue write needing its own per-item approval — a status note is neither a proposal nor a work record",
  );
});

test('the outcome record carries a pr: line for the brief to render', () => {
  assert.match(
    DURABILITY,
    /^pr: \{url\} \| existing \{url\} \| failed — \{reason\} \| skipped — \{reason\}$/m,
    'verification-brief.md renders its ### Branch section from these exact fields; changing the shape here silently empties that section (IL-04)',
  );
});

test('the wrap-up console cites the durability procedure before it renders', () => {
  const cite = WRAP_CONSOLE.indexOf('_shared/pending-review-durability.md');
  const render = WRAP_CONSOLE.indexOf('## Present the console');
  assert.ok(
    cite !== -1 && cite < render,
    'the console ends in a blocking AskUserQuestion a headless firing never returns from, so a durability step cited after it never runs — the citation has to sit above "## Present the console"',
  );
});

test("the wrap-up console's dry-run mode suppresses the push and the PR", () => {
  const start = WRAP_CONSOLE.indexOf('## Dry-run mode');
  const end = WRAP_CONSOLE.indexOf('## Auto-merge short-circuit', start);
  assert.match(
    WRAP_CONSOLE.slice(start, end),
    /pending-review\s+durability/i,
    '--dry-run is preview-only for every write on this page; a push to origin and a live PR are writes, and omitting them from that list is how a "preview" run publishes a branch',
  );
});

test('the multi-spec console cites the durability procedure before it renders', () => {
  const cite = MULTI_CONSOLE.indexOf('_shared/pending-review-durability.md');
  const render = MULTI_CONSOLE.indexOf('## Present the consolidated console');
  assert.ok(
    cite !== -1 && cite < render,
    'a dispatched bundle defers every per-spec console (MULTISPEC_REVIEW_DEFER=1), so this consolidated console is the only render point a bundle reaches — wiring only the single-record console leaves bundles exactly as unprotected as they were',
  );
});

test('the brief renders a Branch section from the durability record', () => {
  assert.match(
    BRIEF,
    /pending-review-durability\.md/,
    'the durability step promises a push or PR-open failure reaches the human in the same comment as the brief; without a reader here that promise resolves to a log line nobody opens (IL-02)',
  );
});

test('the reporting template tells the agent a durability PR is still pending-review', () => {
  assert.match(
    TASK_PROMPT,
    /not\s+`pr-opened`/,
    'the agent picks its OUTCOME from this template and never reads dispatch/SKILL.md; with a draft PR now open on the pending-review path, nothing in its own prompt distinguishes the two values',
  );
});

// --- #297 final-review fixes -------------------------------------------------
// Two defects the whole-branch review found in the shipped procedure: the scope guard's outcome
// clause justified itself with a claim that #296's failure-path teardown call had already made
// false, and the bundle path's outcome record was written where no reader could reach it in
// time. Both are prose, so both are pinned as prose.

test('the scope guard no longer claims a failed outcome cannot reach a console', () => {
  assert.doesNotMatch(
    DURABILITY,
    /never\s+reaches\s+a\s+console\s+at\s+all/,
    "two-call-gate.md section 5 issues `/flow {target} wrap-up` from inside the group's worktree with CLAIM_RUN_ID set after a build/test HARD-GATE, precisely because wrap-up's own gate always passes — an agent standing at the console on a failed run can observe this justification to be false and resolve the contradiction by pushing",
  );
});

test('the scope guard names the failure-path teardown call as the case it must exclude', () => {
  assert.match(
    DURABILITY,
    /failure-path\s+teardown/,
    'the exclusion has to name the concrete invocation that reaches this console on a failed run, not gesture at failed/blocked in the abstract',
  );
});

test('the scope guard supplies a positive discriminator, not only a negative claim', () => {
  assert.match(
    DURABILITY,
    /step\s+list\s+contains\s+`review`/,
    'a `wrap-up`-only step list is the one dispatch-issued invocation that omits review, so its presence is the checkable signal that this run is heading to pending-review rather than being torn down',
  );
});

test('the scope guard resolves ambiguity to skip rather than to push', () => {
  assert.match(
    DURABILITY,
    /Ambiguity\s+resolves\s+to\s+skip,\s+never\s+to\s+push/,
    'an unwanted push and draft PR are not retractable by the agent that opened them, while a skip is never an error — the tie has to break one way explicitly',
  );
});

test('the wrap-up console enforces the outcome condition at the gate, not one level down', () => {
  assert.match(
    WRAP_CONSOLE,
    /step\s+list\s+contained\s+`review`\s+and\s+that\s+step\s+passed/,
    'this console gates the read on CLAIM_RUN_ID and a worktree strategy alone; the failure-path teardown call satisfies both, so without the review clause it reads the file on a failed run',
  );
});

test('the multi-spec console enforces the outcome condition at the gate too', () => {
  assert.match(
    MULTI_CONSOLE,
    /step\s+list\s+contained\s+`review`\s+and\s+that\s+step\s+passed/,
    'the bundle path has the same hole: a teardown call reaching the consolidated console satisfies both original clauses on a failed run',
  );
});

test("the bundle path's outcome record is homed at the parent run dir, never per-spec", () => {
  assert.match(
    DURABILITY,
    /never\s+a\s+`spec-\{N\}\/`\s+subdirectory/,
    'one bundle gets one push, one PR and one record; N copies would be N things to drift, and would still miss the briefs',
  );
});

test('the bundle path carries a push/PR failure to each record by its own comment', () => {
  assert.match(
    DURABILITY,
    /gh issue comment \{m\}/,
    "every per-spec brief posts before the consolidated console runs (acceptance labeling is not deferred by MULTISPEC_REVIEW_DEFER), so the brief cannot carry this run's push/PR failure and AC 6/7 needs another comment carrier on this path",
  );
});

test('the brief reader states why a bundle correctly produces no record for it to find', () => {
  assert.match(
    BRIEF,
    /Do not go looking for it up a level/,
    'a reader who knows only that the file sits at "the run dir root" will patch the location and believe the gap closed — the ordering, not the location, is why this reader cannot serve the bundle path',
  );
});

test('the procedure records the post-resume PR staleness as a residual, not a silent gap', () => {
  assert.match(
    DURABILITY,
    /Residual:\s+the\s+PR\s+can\s+go\s+stale/,
    'the wrap-up commit and the closing-keyword carrier commit both land after the console is answered and neither is pushed to this branch, so the draft PR shows the pre-console state',
  );
});
