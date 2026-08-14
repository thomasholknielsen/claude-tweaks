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
const DISPATCH_SKILL = read('skills', 'dispatch', 'SKILL.md');
const DURABILITY_CONSOLE = read('skills', 'flow', 'pending-review-durability-console.md');

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
  // #411 retired `pr-opened` as a distinct OUTCOME value under pr-first (the PR already exists
  // from run start, so there is no longer a "branch just reached its finish decision" transition
  // separate from an ordinary pending-review outcome) — the agent picks its OUTCOME from this
  // template and never reads dispatch/SKILL.md, so the retirement has to be stated right here.
  assert.match(
    TASK_PROMPT,
    /`pending-review` also covers what `pr-opened` used to name separately/,
    'a draft PR being open must never be read by the agent as evidence the outcome is anything other than pending-review',
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

// --- resume-command gap ------------------------------------------------------
// A pending-review run parked nobody could resume without hand-reconstructing the mechanism
// from scattered files: /demo doesn't merge (by design), and nothing stated the literal
// PIPELINE_RUN_DIR/CLAIM_RUN_ID/target command that re-adopts the run and re-renders its
// console. These pin that the resume command is now stated literally everywhere a human
// might land: the outcome record, the PR body, the Verification Brief, the multi-spec
// console, and dispatch's own Reporting section.

test('the outcome record carries a literal resume: line', () => {
  assert.match(
    DURABILITY,
    /^resume: PIPELINE_RUN_DIR="\{run-dir\}" CLAIM_RUN_ID="\{RUN_ID\}" \/claude-tweaks:flow "\{target\}" wrap-up$/m,
    'a human or agent inspecting the run directory directly (no GitHub round trip) must find the exact command that re-adopts this run, not just the push/pr/branch facts',
  );
});

test('the PR body template includes the resume command, not just the /demo pointer', () => {
  assert.match(
    DURABILITY,
    /PIPELINE_RUN_DIR="\{run-dir\}" CLAIM_RUN_ID="\{RUN_ID\}" \/claude-tweaks:flow "\{target\}" wrap-up/,
    "the PR body previously named /demo (acceptance only, never merges) as the only next step, which is exactly the trap that led to hand-reconstructing Section E's claim/label cleanup instead of resuming the console",
  );
});

test('the bundle failure-path comment carries the resume line too', () => {
  assert.match(
    DURABILITY,
    /push:\/pr:\/branch:\/resume:\s+lines/,
    'the per-record failure comment quotes the outcome record verbatim; if it still names only three lines it silently drops the resume command on exactly the path most likely to need it',
  );
});

test('the brief renders the resume command in its own Branch section', () => {
  assert.match(
    BRIEF,
    /resume line from pending-review-durability\.md/,
    'the single-record path posts this brief as the issue comment a human actually reads — the resume command has to reach that comment, not only the PR body',
  );
});

test('the multi-spec console surfaces four lines, not three, including resume', () => {
  assert.match(
    DURABILITY_CONSOLE,
    /four lines.*resume:/,
    'the consolidated console is itself a place a human answers "kept as-is" and re-parks the run; it needs the resume line surfaced too, not just push/pr/branch',
  );
});

test("dispatch's Reporting section states the literal resume command, not just \"resumes that session\"", () => {
  assert.match(
    DISPATCH_SKILL,
    /PIPELINE_RUN_DIR="\{run-dir\}" CLAIM_RUN_ID="\{RUN_ID\}" \/claude-tweaks:flow "\{target\}" wrap-up/,
    '"resumes that session" is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads the report, so the report has to state the actual re-adoption command',
  );
});

test("dispatch's Reporting section warns against hand-chaining /demo + finishing-a-development-branch", () => {
  assert.match(
    DISPATCH_SKILL,
    /never hand-chain `\/claude-tweaks:demo`/,
    "/demo's own Anti-Patterns table already says it never merges; dispatch's report has to say what to do instead, not just what not to do, or an agent re-derives the same manual claim-release/label workaround",
  );
});
