import { fileExists } from './file-exists.js';
import { fileContains } from './file-contains.js';
import { dirFileCount } from './dir-file-count.js';
import { testPasses } from './test-passes.js';
import { decisionsLogHas } from './decisions-log-has.js';
import { toolCalled } from './tool-called.js';
import { toolCount } from './tool-count.js';
import { commitCount } from './commit-count.js';
import { commitMessagesAllowed } from './commit-messages-allowed.js';
import { findingsInclude } from './findings-include.js';
import { resultContains } from './result-contains.js';
import { findingsExcludeFalsePositive } from './findings-exclude-false-positive.js';
import { localRecordFacet } from './local-record-facet.js';
import { absolutePathExists } from './absolute-path-exists.js';
import { toolInputIncludes } from './tool-input-includes.js';
import { toolInputExcludes } from './tool-input-excludes.js';
import { contextCostRegression } from './context-cost-regression.js';
import { routingDestinationMatches } from './routing-destination-matches.js';
import { verdictMatches } from './verdict-matches.js';
import { filterOutcomeMatches } from './filter-outcome-matches.js';

// Registry mapping a scenario assertion's `type` field to its implementation.
// Each fn takes (context, params) -> {pass, message}. context is built once
// per scenario run by runner.js: {repoDir, resultText, toolCalls, escapeTargetPath,
// toolInputs, scenarioName, tokens, history}.
const ASSERTIONS = {
  'file-exists': (ctx, params) => fileExists(ctx.repoDir, params),
  'file-contains': (ctx, params) => fileContains(ctx.repoDir, params),
  'dir-file-count': (ctx, params) => dirFileCount(ctx.repoDir, params),
  'test-passes': (ctx, params) => testPasses(ctx.repoDir, params),
  'decisions-log-has': (ctx, params) => decisionsLogHas(ctx.repoDir, params),
  'tool-called': (ctx, params) => toolCalled(ctx.toolCalls, params),
  'tool-count': (ctx, params) => toolCount(ctx.toolCalls, params),
  'commit-count': (ctx, params) => commitCount(ctx.repoDir, params),
  'commit-messages-allowed': (ctx, params) => commitMessagesAllowed(ctx.repoDir, params),
  'findings-include': (ctx, params) => findingsInclude(ctx.resultText, params),
  'result-contains': (ctx, params) => resultContains(ctx.resultText, params),
  'findings-exclude-false-positive': (ctx, params) => findingsExcludeFalsePositive(ctx.resultText, params),
  'local-record-facet': (ctx, params) => localRecordFacet(ctx.repoDir, params),
  'absolute-path-exists': (ctx, params) => absolutePathExists(ctx, params),
  'tool-input-includes': (ctx, params) => toolInputIncludes(ctx, params),
  'tool-input-excludes': (ctx, params) => toolInputExcludes(ctx, params),
  'context-cost-regression': (ctx, params) => contextCostRegression(ctx, params),
  'routing-destination-matches': (ctx, params) => routingDestinationMatches(ctx.resultText, params),
  'verdict-matches': (ctx, params) => verdictMatches(ctx.resultText, params),
  'filter-outcome-matches': (ctx, params) => filterOutcomeMatches(ctx.resultText, params),
};

export function runAssertion(context, assertion) {
  const { type, ...params } = assertion;
  const fn = ASSERTIONS[type];
  if (!fn) throw new Error(`unknown assertion type: ${type}`);
  return { type, ...fn(context, params) };
}
