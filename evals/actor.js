import path from 'node:path';

// canUseTool callback (Claude Agent SDK @anthropic-ai/claude-agent-sdk@0.3.217):
//   CanUseTool = (toolName, input, options) => Promise<PermissionResult | null>
//   PermissionResult = {behavior:'allow', updatedInput?, ...} | {behavior:'deny', message, ...}
// (confirmed against the installed package's sdk.d.ts — see evals/NOTES.md)
//
// The `answers` map returned below (`{[questionText]: selectedLabel}`) matches
// the shape of `AskUserQuestionOutput.answers` in the installed package's
// sdk-tools.d.ts (question text -> answer string; multi-select answers are
// comma-separated) — the tool's own *output* schema, not its input schema
// (confirmed by Step 1's grep of sdk-tools.d.ts during Task 4; see NOTES.md).
//
// Default policy for AskUserQuestion: auto-select whichever option in each
// question is labeled "(Recommended)" — claude-tweaks' own documented
// AskUserQuestion convention (CLAUDE.md's Interaction patterns section marks
// exactly one option this way on every call). answerOverrides lets a scenario
// target a specific question (matched by a case-insensitive substring of its
// `question` text) and supply a different answer, taking priority over the
// default. All other tools are allowed unmodified.

function pickRecommended(options) {
  const recommended = options.find((o) => /\(Recommended\)/i.test(o.label));
  return recommended ? recommended.label : options[0].label;
}

function findOverride(question, answerOverrides) {
  return (answerOverrides || []).find((o) => question.toLowerCase().includes(o.match.toLowerCase()));
}

// Scope guard: when a repoDir is supplied, deny any non-AskUserQuestion tool
// call whose path-like input resolves to a path OUTSIDE repoDir. Checks
// whichever of file_path/path/notebook_path is present on the tool's input
// (the SDK's built-in file tools all use one of these three keys). A call
// with none of these keys present is allowed regardless of repoDir, since
// there is no path to check.
//
// Known, accepted limitation: this does NOT inspect or restrict Bash command
// text — there is no reliable way to parse an arbitrary shell command string
// into a target path, so a Bash call is always allowed unmodified by this
// guard. This is deliberately narrow, defense-in-depth on top of the primary
// containment layer: runner.js's managedSettings.sandbox, which enforces
// filesystem/network restrictions on every Bash-tool subprocess at the OS
// level regardless of what this guard does or doesn't inspect. The
// evals/scenarios/actor-escape-attempt.yaml scenario is live, executable
// proof that the OS sandbox denies a Bash-executed escape from the fixture
// repoDir — see README.md's Safety model section.
const PATH_INPUT_KEYS = ['file_path', 'path', 'notebook_path'];

function findPathInput(input) {
  for (const key of PATH_INPUT_KEYS) {
    if (input && Object.prototype.hasOwnProperty.call(input, key)) {
      return { key, value: input[key] };
    }
  }
  return null;
}

// Resolved-candidate must be exactly the repo dir, or nested under it via a
// real path.sep boundary — a plain string-prefix check would incorrectly
// treat a sibling directory like "/tmp/ct-eval-123-evil" as inside
// "/tmp/ct-eval-123".
function isInsideRepoDir(candidatePath, resolvedRepoDir) {
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedRepoDir || resolvedCandidate.startsWith(resolvedRepoDir + path.sep);
}

// Returns a deny PermissionResult when toolName's path-like input resolves
// outside resolvedRepoDir, or null when the call should proceed (no repoDir
// configured, no path-like input present, or the path is inside repoDir).
function checkScopeGuard(toolName, input, resolvedRepoDir) {
  if (!resolvedRepoDir) return null;
  const pathInput = findPathInput(input);
  if (!pathInput || isInsideRepoDir(pathInput.value, resolvedRepoDir)) return null;
  return {
    behavior: 'deny',
    message: `Scope guard: ${toolName}'s "${pathInput.key}" (${pathInput.value}) resolves outside the fixture repoDir (${resolvedRepoDir}) and was denied.`,
  };
}

// Async cross-session coordination tools assume a live, persistent,
// multi-turn Claude Code harness that can actually deliver a scheduled
// wakeup or a background task's completion notification later. The eval
// harness invokes skills via the SDK's single embedded query() call, which
// has no such host process — a model that schedules a wakeup or waits on a
// background task via these tools blocks until the connection is silently
// aborted (confirmed via real session transcripts: this exact
// ScheduleWakeup/SendMessage signature appears both in the run that
// preceded the Task 7 GitHub-issue escape and, separately, in a later real
// run that never completed). Denying these tools up front pushes the model
// to finish its work synchronously within the one query() turn instead of
// hanging.
const ASYNC_COORDINATION_TOOLS = ['ScheduleWakeup', 'SendMessage', 'Monitor', 'TaskOutput', 'TaskStop'];

export function createActor({ answerOverrides = [], repoDir } = {}) {
  const resolvedRepoDir = repoDir ? path.resolve(repoDir) : null;

  return async function canUseTool(toolName, input, _options) {
    if (ASYNC_COORDINATION_TOOLS.includes(toolName)) {
      return {
        behavior: 'deny',
        message: `${toolName} is not supported when running under the eval harness — there is no live multi-turn harness process to deliver a scheduled wakeup or background task notification here. Complete this step synchronously, inline, in this same turn instead of waiting on a background task.`,
      };
    }
    // AgentInput.run_in_background defaults to true when omitted — the SDK's
    // own sdk-tools.d.ts doc comment: "Agents run in the background by
    // default... Set to false to run this agent synchronously." A check for
    // `=== true` alone misses the (more common) omitted case, which
    // backgrounds just the same. Deny unless explicitly false.
    if (toolName === 'Agent' && (!input || input.run_in_background !== false)) {
      return {
        behavior: 'deny',
        message: 'Agent dispatch is not supported when running under the eval harness unless explicitly synchronous (run_in_background:false) — it defaults to running in the background, and the background task\'s completion cannot be delivered back to this session. Dispatch with run_in_background:false instead.',
      };
    }
    if (toolName !== 'AskUserQuestion') {
      const denial = checkScopeGuard(toolName, input, resolvedRepoDir);
      return denial || { behavior: 'allow', updatedInput: input };
    }
    const answers = {};
    for (const q of input.questions) {
      const override = findOverride(q.question, answerOverrides);
      answers[q.question] = override ? override.answer : pickRecommended(q.options);
    }
    return { behavior: 'allow', updatedInput: { questions: input.questions, answers } };
  };
}
