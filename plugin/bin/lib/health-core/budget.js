'use strict';

// Shared "pick up to `budget` distinct targets, simulating post-audit
// cursor state in-memory between picks" loop. The four health engines'
// next-target/next-slice CLIs (code-health#cmdNextSlice, harness-health's
// two --budget sites (main + memory-kind), journey-health#cmdNextTarget,
// docs-health#cmdNextTarget) each hand-rolled this identical shape —
// `budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1`
// plus a for/break loop threading a simulated cursor patch into the next
// iteration — even though the adjacent single-pick selection logic
// (selectByStaleThenChurn, above in rotation.js) already went through this
// same extraction once. Each engine differs only in: how it derives a
// candidate's cursor key, what fields the simulated post-audit cursor patch
// carries, and (journey-health only) an extra alreadyPicked side-channel its
// Phase 0 needs, since Phase 0 keys off a cursor field (deletedFileSig) that
// only a real validate-findings run writes, not one the simulated patch below
// carries.
//
// selectOne(cursors) -> candidate|null : the engine's own single-pick call,
//   closed over its own root/now/tier/kind/memoryDir/etc.
// getCursorKey(candidate) -> string : cursor map key for this candidate.
// buildCursorPatch(existingCursorEntry, candidate) -> object : the
//   simulated post-audit cursor entry to merge in before the next
//   iteration's selectOne call.
// onPick(candidate) : optional side effect run after each pick, before the
//   next selectOne call (journey-health uses this to grow its
//   alreadyPicked Set, which selectOne's own closure also reads).
//
// Returns the array of picked candidates (may be shorter than `budget` if
// selectOne runs out and returns null early).
function selectBudget(budget, initialCursors, selectOne, { getCursorKey, buildCursorPatch, onPick } = {}) {
  let cursors = initialCursors;
  const picked = [];
  for (let i = 0; i < budget; i++) {
    const candidate = selectOne(cursors);
    if (!candidate) break;
    picked.push(candidate);
    if (onPick) onPick(candidate);
    const key = getCursorKey(candidate);
    cursors = { ...cursors, [key]: buildCursorPatch(cursors[key], candidate) };
  }
  return picked;
}

module.exports = { selectBudget };
