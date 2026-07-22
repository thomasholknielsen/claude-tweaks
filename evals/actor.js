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

export function createActor({ answerOverrides = [] } = {}) {
  return async function canUseTool(toolName, input, _options) {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow', updatedInput: input };
    }
    const answers = {};
    for (const q of input.questions) {
      const override = findOverride(q.question, answerOverrides);
      answers[q.question] = override ? override.answer : pickRecommended(q.options);
    }
    return { behavior: 'allow', updatedInput: { questions: input.questions, answers } };
  };
}
