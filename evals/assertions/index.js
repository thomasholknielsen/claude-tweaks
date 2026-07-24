import { fileExists } from './file-exists.js';
import { testPasses } from './test-passes.js';
import { decisionsLogHas } from './decisions-log-has.js';
import { toolCalled } from './tool-called.js';
import { toolCount } from './tool-count.js';
import { commitCount } from './commit-count.js';
import { findingsInclude } from './findings-include.js';
import { findingsExcludeFalsePositive } from './findings-exclude-false-positive.js';
import { localRecordFacet } from './local-record-facet.js';

// Registry mapping a scenario assertion's `type` field to its implementation.
// Each fn takes (context, params) -> {pass, message}. context is built once
// per scenario run by runner.js: {repoDir, resultText, toolCalls}.
const ASSERTIONS = {
  'file-exists': (ctx, params) => fileExists(ctx.repoDir, params),
  'test-passes': (ctx, params) => testPasses(ctx.repoDir, params),
  'decisions-log-has': (ctx, params) => decisionsLogHas(ctx.repoDir, params),
  'tool-called': (ctx, params) => toolCalled(ctx.toolCalls, params),
  'tool-count': (ctx, params) => toolCount(ctx.toolCalls, params),
  'commit-count': (ctx, params) => commitCount(ctx.repoDir, params),
  'findings-include': (ctx, params) => findingsInclude(ctx.resultText, params),
  'findings-exclude-false-positive': (ctx, params) => findingsExcludeFalsePositive(ctx.resultText, params),
  'local-record-facet': (ctx, params) => localRecordFacet(ctx.repoDir, params),
};

export function runAssertion(context, assertion) {
  const { type, ...params } = assertion;
  const fn = ASSERTIONS[type];
  if (!fn) throw new Error(`unknown assertion type: ${type}`);
  return { type, ...fn(context, params) };
}
