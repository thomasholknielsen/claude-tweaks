'use strict';

// Pure: the mechanical half of assess-agent-autonomy's merge-check mode. Classifies a diff's
// files (test vs. implementation, sensitive vs. not) and reduces that to the summary merge-check
// weighs as one input alongside review findings and diff content — never a pass/fail gate on its
// own. See docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md.

const TEST_PATH_RE = /(^|\/)tests\//;
const TEST_SUFFIX_RE = /\.test\.js$/;

function isTestPath(path) {
  return TEST_PATH_RE.test(path) || TEST_SUFFIX_RE.test(path);
}

// Minimal glob support: '*' matches within a path segment (not '/'). Sufficient for this
// project's own sensitive-path shapes (e.g. 'skills/_shared/*.md', 'bin/hooks.js' as a literal).
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function isSensitivePath(path, sensitivePaths) {
  return sensitivePaths.some((glob) => globToRegExp(glob).test(path));
}

function classifyDiffFiles(files, sensitivePaths = []) {
  return (files || []).map((f) => ({
    path: f.path,
    isTest: isTestPath(f.path),
    isSensitive: isSensitivePath(f.path, sensitivePaths),
    additions: f.additions || 0,
    deletions: f.deletions || 0,
  }));
}

function blastRadiusSummary(classifiedFiles) {
  const summary = {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    sensitiveFilesTouched: [],
  };
  for (const f of classifiedFiles || []) {
    const lines = f.additions + f.deletions;
    if (f.isTest) {
      summary.testLines += lines;
      summary.testFiles += 1;
    } else {
      summary.implLines += lines;
      summary.implFiles += 1;
    }
    if (f.isSensitive) summary.sensitiveFilesTouched.push(f.path);
  }
  return summary;
}

module.exports = { classifyDiffFiles, blastRadiusSummary };
