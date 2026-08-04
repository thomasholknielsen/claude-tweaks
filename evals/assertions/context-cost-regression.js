// Fails a scenario whose prompt got dramatically more expensive to cache than
// its own recent history says it should be.
//
// history.jsonl has recorded cost per scenario since this harness shipped, and
// nothing has ever gated on it — a skill file growing by tens of KB shows up
// there as a bigger number that no run ever reads. This closes that.
//
// WHY cache_creation_input_tokens specifically: it is the count of prompt bytes
// written into the cache on this run, which is dominated by the skill payload
// the SDK loads (SKILL.md in full, plus each sub-file the run actually reads).
// total cost mixes in output tokens and cache reads, both driven by how much
// work the model chose to do; cache creation tracks how much text the harness
// handed it. That is the quantity a bloat regression moves.

// ── Baseline: median of the last N passing runs ──────────────────────────────
//
// Three candidate baselines, and why this one:
//
//   Last run — a single sample of an LLM-driven process. evals/README.md says
//   outright that one run's numbers are noisy and a small delta is indicative,
//   not conclusive. A last-run baseline turns ordinary trajectory variance into
//   a failing check, which is how a check gets disabled.
//
//   Best ever — ratchets. One lucky-low run becomes a bar the scenario can
//   never clear again, and the check degrades into permanently red.
//
//   Median of the last N (chosen) — robust to a single outlier in either
//   direction, and it MOVES: once a deliberate, accepted increase has been the
//   reality for N runs, it becomes the new baseline instead of requiring
//   someone to hand-edit a pinned number.
//
// Window of 5: long enough that one anomalous run cannot set the baseline,
// short enough that the baseline still tracks the current shape of the skill
// rather than one it had a year ago.
const DEFAULT_WINDOW = 5;

// Only runs where every assertion passed count. A failing run took a different
// path through the skill — it stopped early, or looped — so its token count is
// not a baseline for a run that completed. This is also why the sample floor
// below is measured after filtering, not before.
const DEFAULT_MIN_SAMPLES = 3;

// ── Threshold ────────────────────────────────────────────────────────────────
//
// 50%, calibrated against the observed noise floor in this repo's own
// history.jsonl rather than picked for roundness. The tightest-clustered
// scenario with three passing runs (dispatch-local-files-preflight-stop) sits
// at 76442 / 57860 / 58087 cache-creation tokens — its high sample is +32%
// above its own median with no code change between them. Anything under ~35%
// therefore fires on ordinary variance.
//
// 50% still catches what this exists for: bloat regressions arrive as step
// changes (a sub-file inlined into a SKILL.md, an extraction reverted), not as
// a 10% drift. Tighten this as history.jsonl accumulates enough runs per
// scenario to measure the real noise floor instead of estimating it from three.
const DEFAULT_MAX_INCREASE_PCT = 50;

function cacheTokens(entry) {
  const n = entry && entry.tokens && entry.tokens.cache_creation_input_tokens;
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function contextCostRegression(context, params = {}) {
  const {
    maxIncreasePct = DEFAULT_MAX_INCREASE_PCT,
    minSamples = DEFAULT_MIN_SAMPLES,
    window = DEFAULT_WINDOW,
  } = params;

  const scenario = context.scenarioName;
  const current = cacheTokens({ tokens: context.tokens });

  // A missing measurement is a FAILURE, not a skip. Skipping here would mean
  // the check silently passes forever the moment the SDK stops reporting usage
  // — the exact shape of a check that cannot fail.
  if (current === null) {
    return {
      pass: false,
      message: 'no cache_creation_input_tokens on this run — the measurement this check '
        + 'depends on is missing, so no cost comparison was possible',
    };
  }

  // Only prior runs: runner.js evaluates assertions before appending this run
  // to history, so the current run is never in its own baseline.
  const priors = (context.history || [])
    .filter((e) => e.scenario === scenario && e.allPassed === true && cacheTokens(e) !== null)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, window);

  if (priors.length < minSamples) {
    return {
      pass: true,
      message: `SKIPPED — "${scenario}" has ${priors.length} comparable prior run(s) in history.jsonl `
        + `(need ${minSamples}); no baseline exists, so NO regression check was performed. `
        + `Current cache_creation_input_tokens: ${current}. Run this scenario `
        + `${minSamples - priors.length} more time(s) to establish a baseline.`,
    };
  }

  const baseline = median(priors.map(cacheTokens));
  if (baseline === 0) {
    return {
      pass: true,
      message: `SKIPPED — baseline for "${scenario}" is 0 cache_creation_input_tokens, so a `
        + 'percentage comparison is undefined; NO regression check was performed.',
    };
  }

  const deltaPct = ((current - baseline) / baseline) * 100;
  const summary = `${current} vs baseline ${baseline} (median of ${priors.length} passing runs), `
    + `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;

  if (deltaPct > maxIncreasePct) {
    return {
      pass: false,
      message: `context-cost regression: cache_creation_input_tokens ${summary}, over the `
        + `${maxIncreasePct}% ceiling`,
    };
  }
  return { pass: true, message: `context cost ${summary}, within the ${maxIncreasePct}% ceiling` };
}
