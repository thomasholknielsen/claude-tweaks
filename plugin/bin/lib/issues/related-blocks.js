'use strict';

// Shared "Also affects: ..." related-sections bundler, used by every health
// producer's issue-payload.js (harness-health, journey-health, docs-health)
// to note when multiple findings in one audit share the same root cause and
// get filed as a single issue — previously a byte-identical block duplicated
// across all three files. Returns [] when there's nothing to bundle; callers
// spread this into their currentState array.
function buildRelatedBlocks(relatedSections) {
  return Array.isArray(relatedSections) && relatedSections.length > 0
    ? [`Also affects: ${relatedSections.map((s) => `\`${s}\``).join(', ')}`]
    : [];
}

module.exports = { buildRelatedBlocks };
