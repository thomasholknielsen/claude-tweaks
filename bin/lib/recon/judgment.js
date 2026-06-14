'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Lens id -> Phase 0 shared-criteria filename under skills/_shared/.
const JUDGMENT_LENS_MAP = {
  'architecture-depth': 'criteria-architecture-depth.md',
  'simplification': 'criteria-simplification.md',
  'review-quality': 'criteria-review-quality.md',
};

// Per-lens metadata: model tier and a one-line framing for the prompt header.
// Tiers follow skills/_shared/subagent-output-contract.md:
//   Standard (Sonnet) for cross-cutting multi-file judgment;
//   Fast (Haiku) for the more local, mechanical simplification pass.
const LENS_META = {
  'architecture-depth': {
    modelTier: 'sonnet',
    role: 'an architect reviewing this area for shallow, passthrough, or over-abstracted modules (the deep-module lens)',
  },
  'simplification': {
    modelTier: 'haiku',
    role: 'an engineer reviewing this area for unnecessary complexity, dead code, and convoluted logic that has a clearer equivalent',
  },
  'review-quality': {
    modelTier: 'sonnet',
    role: 'a senior reviewer auditing this area for correctness, convention, security, error-handling, and test-quality problems',
  },
};

// Default location of the Phase 0 criteria fragments. bin/lib/recon -> repo via ../../..
const DEFAULT_CRITERIA_DIR = path.resolve(__dirname, '..', '..', '..', 'skills', '_shared');

// The auto-mode-contract lives in skills/_shared/ and is embedded in review-quality
// prompts for confidence/reversibility vocabulary. It is always read from the real
// shared dir (not the test criteriaDir override), since tests don't stub it and
// only assert on criteria sentinel text — not on auto-mode-contract content.
const AUTO_MODE_CONTRACT_PATH = path.resolve(DEFAULT_CRITERIA_DIR, 'auto-mode-contract.md');

// Output-format block, embedded verbatim in every prompt so the subagent emits
// exactly the Phase 1 Finding shape (minus `id`, which ingest-judgment assigns).
const OUTPUT_FORMAT = `## Required output format

First line of your reply MUST be exactly one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

After that line, reply with a single fenced JSON block and nothing after it:

\`\`\`json
[
  {
    "title": "<one-line finding title>",
    "lens": "<this lens id>",
    "category": "<one of: Architecture | Security | Convention | Performance | Error handling | Test quality | Coverage | UX | Docs>",
    "severity": "<low | medium | high | critical>",
    "confidence": "<high | med | low>",
    "area": "<the area path you were given, verbatim>",
    "files": ["<relative/path/to/file.ts:lineNumber>"],
    "signature": "<a short, stable, unique phrase identifying THIS specific issue (no line numbers, no volatile identifiers)>",
    "evidence": "<concrete evidence: what you saw, where, why it is a problem>",
    "suggestion": "<specific, actionable change>",
    "acceptance": "<how to verify the problem is gone>"
  }
]
\`\`\`

Rules:
- If you find nothing worth reporting, emit an empty array: \`\`\`json
[]
\`\`\`
- Report only findings you are confident are real problems, not style preferences.
- At most 5 findings.
- Keep "signature" stable across cosmetic edits: describe the issue, not its current location.
- Use hyphens, not em-dashes, in all text fields.`;

function readCriteria(criteriaDir, filename) {
  try {
    return fs.readFileSync(path.join(criteriaDir, filename), 'utf8').trim();
  } catch (err) {
    // Missing criteria is a configuration error, not a per-finding drop.
    throw new Error(`judgment: criteria fragment not found: ${path.join(criteriaDir, filename)} (${err.code || err.message})`);
  }
}

function readAutoModeContract() {
  try {
    return fs.readFileSync(AUTO_MODE_CONTRACT_PATH, 'utf8').trim();
  } catch {
    // If not present (e.g. in test environments that don't stub it), omit gracefully.
    return '';
  }
}

function buildPrompt(lensId, area, criteriaText) {
  const meta = LENS_META[lensId];
  let prompt = `You are ${meta.role}.

Area under review: "${area}"
Read the source files in that area before answering. Do not modify any files — this is read-only analysis.

## What to flag (criteria for the "${lensId}" lens)

${criteriaText}`;

  // For review-quality, embed the auto-mode-contract for confidence/reversibility vocab.
  // The criteria-review-quality.md deliberately does not duplicate these definitions.
  if (lensId === 'review-quality') {
    const autoModeText = readAutoModeContract();
    if (autoModeText) {
      prompt += `\n\n## Confidence and reversibility vocabulary\n\n${autoModeText}`;
    }
  }

  prompt += `\n\n${OUTPUT_FORMAT}`;
  return prompt;
}

// buildWorkOrders({ areas, lenses, maxSubagents, criteriaDir? })
//   -> [{ lensId, area, modelTier, prompt }], capped to maxSubagents.
// Iterates areas-outer, lenses-inner so a partial cap still covers the
// highest-priority area completely before spending budget on the next.
function buildWorkOrders({ areas, lenses, maxSubagents, criteriaDir = DEFAULT_CRITERIA_DIR }) {
  const cap = Number.isFinite(maxSubagents) ? maxSubagents : Infinity;
  const orders = [];

  // Cache each lens's criteria text so we read each fragment at most once.
  const criteriaCache = new Map();

  outer:
  for (const area of areas) {
    for (const lensId of lenses) {
      const filename = JUDGMENT_LENS_MAP[lensId];
      if (!filename) continue; // unknown lens — skip, don't crash
      if (!criteriaCache.has(lensId)) {
        criteriaCache.set(lensId, readCriteria(criteriaDir, filename));
      }
      orders.push({
        lensId,
        area,
        modelTier: LENS_META[lensId].modelTier,
        prompt: buildPrompt(lensId, area, criteriaCache.get(lensId)),
      });
      if (orders.length >= cap) break outer;
    }
  }

  return orders;
}

module.exports = { buildWorkOrders, JUDGMENT_LENS_MAP, LENS_META, OUTPUT_FORMAT };
