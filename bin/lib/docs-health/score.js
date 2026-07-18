'use strict';
// Round-robin floor: docs unaudited past this many days are force-boosted
// regardless of churn. Between code-health's 30-day floor (code bugs move
// fast) and harness-health's 90-day floor (skill-doc drift moves slow) —
// docs/** content (guides, references, ADRs) tracks a live codebase (like
// code) but isn't itself instruction text an agent executes every turn
// (like a skill file), so it sits between the two.
const STALE_DAYS = 60;

module.exports = { STALE_DAYS };
