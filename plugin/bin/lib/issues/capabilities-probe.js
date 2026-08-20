// bin/lib/issues/capabilities-probe.js
// Detects which GitHub-native issue features this repo/org can use, so
// /init (spec 22) can persist a one-time driver choice (work-types:
// native|labels, work-links: native|body-text) instead of every skill
// re-probing mid-flow. Two independent `gh api graphql` probes:
//   1. Schema introspection on the Issue type — does this GitHub host's
//      schema expose subIssues / blockedBy fields (varies by GHE version)?
//      `dependencies` requires `blockedBy` specifically, not the sibling
//      `issueDependenciesSummary` field some GHE versions expose instead:
//      that field is count-only (no per-issue node data), so it cannot
//      back the query bin/lib/issues/record.js's buildNativeDependencyQuery
//      actually issues — treating it as sufficient would let /init enable
//      work-links: native on a host where every resulting query fails
//      schema validation.
//   2. Repository issueTypes enablement — Issue Types are an org-level
//      feature; repository.issueTypes is non-null only when the org has
//      it turned on.
// The runner is injectable (never the real `gh` in tests): runner(args) is
// invoked as if `gh ${args.join(' ')}` and returns stdout. Each probe's
// runner call + JSON.parse is independently try/caught so one probe's
// failure (unsupported query, network error, garbage JSON) never masks the
// other's result — a failed probe fails safe to false (the labels /
// body-text fallback expressions). No caching here — see specs/14's
// Deliverables note (caching/persistence is /init's job, not this module's).
'use strict';

const { execFileSync } = require('child_process');

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

// Shared skeleton both probes below follow: call the runner with a fixed args
// array, JSON.parse the result, hand the parsed body to `extract`, and fail
// safe to `fallback` on ANY failure (unsupported query, network error,
// garbage JSON) — each probe still fails independently of the other (callers
// pass their own `args`/`extract`/`fallback`, no shared mutable state), so
// this is purely deduplicating the try/parse/catch skeleton itself, not
// coupling the two probes' failure behavior together.
function runGraphQLProbe(runner, args, extract, fallback) {
  try {
    const out = runner(args);
    const parsed = JSON.parse(out);
    return extract(parsed);
  } catch {
    return fallback;
  }
}

// One call: introspect the Issue type's field names on this GitHub host.
function probeSchema(runner) {
  return runGraphQLProbe(
    runner,
    ['api', 'graphql', '-f', 'query={ __type(name: "Issue") { fields { name } } }'],
    (parsed) => {
      const fields = parsed?.data?.__type?.fields;
      const names = Array.isArray(fields) ? fields.map((f) => f && f.name) : [];
      return {
        subIssues: names.includes('subIssues'),
        dependencies: names.includes('blockedBy'),
      };
    },
    { subIssues: false, dependencies: false },
  );
}

// One call: does this repo's org have Issue Types enabled?
function probeIssueTypes(runner, owner, repo) {
  const query = 'query($o:String!,$n:String!){ repository(owner:$o, name:$n) { issueTypes(first:1) { totalCount } } }';
  return runGraphQLProbe(
    runner,
    ['api', 'graphql', '-f', `query=${query}`, '-f', `o=${owner}`, '-f', `n=${repo}`],
    (parsed) => parsed?.data?.repository?.issueTypes != null,
    false,
  );
}

// { owner, repo, runner? } -> { types, subIssues, dependencies }. Two probes,
// each independently fail-safe to false — see module header.
function probeCapabilities({ owner, repo, runner = defaultRunner } = {}) {
  const schema = probeSchema(runner);
  const types = probeIssueTypes(runner, owner, repo);
  return { types, subIssues: schema.subIssues, dependencies: schema.dependencies };
}

module.exports = { probeCapabilities, probeSchema };
