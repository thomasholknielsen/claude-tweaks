# 254 — writeRunState contract: best-effort lock, atomic write, budget-independent test

**Spec:** `.claude-tweaks/pipelines/2026-08-09T094731-spec-246-247-254/spec-254/work/254-spec.md`

**Plan-time findings:**
- The test (`tests/hooks-context.test.js:141`, introduced by `e6683cba` guarding the original no-lock lost-update bug) spawns 8 real processes × 40 iterations. The lock (`bin/lib/hooks/context.js`) is a mkdir mutex with `LOCK_WAIT_MS = 500` total budget, `LOCK_POLL_MS = 10`, `LOCK_STALE_MS = 5000`, deliberately fail-open. mkdir contention is unfair (no queue), so on a slow 2-core runner one writer can starve past 500 ms while 7 others cycle the lock — the CI diagnosis is mechanically plausible.
- `writeRunState` writes `run-state.json` **in place** via `fs.writeFileSync` — no temp+rename. An unlocked (fail-open) writer racing a locked one can therefore tear the file, not just lose a field. The spec's option (b) ("assert no torn JSON") is currently unsatisfiable: nothing guarantees it.

**Contract decision (option b, sharpened):** production keeps the documented posture — bounded wait, fail-open, never hang a hook. Two hardening changes make that contract testable and safe: the write becomes atomic (temp file + `renameSync`, same dir — readers and racing writers can never observe a torn file, and a crash mid-write leaves the old state intact), and the wait budget becomes overridable via a `CLAUDE_TWEAKS_LOCK_WAIT_MS` env knob (default 500, production behavior unchanged) so tests pin the budget instead of racing it.

## Task 1: Atomic write + env-overridable budget

Files: `bin/lib/hooks/context.js`

- `writeRunState`: write `JSON.stringify(next, null, 2) + '\n'` to `run-state.json.tmp-<pid>` in the run dir, then `fs.renameSync` over `run-state.json`. Keep the same return/null-on-error semantics.
- `LOCK_WAIT_MS`: read from `process.env.CLAUDE_TWEAKS_LOCK_WAIT_MS` when it parses as a non-negative integer, else 500. One-line doc comment: test-only knob; production never sets it.
- Update the fail-open comment (IL-92): its cause list now demonstrably includes CI-runner contention (observed v6.73.0 release CI); note the knob.

## Task 2: One-off reproduction (recorded, not committed as a test)

Run the existing 8×40 workload with `CLAUDE_TWEAKS_LOCK_WAIT_MS=1` — budget exhaustion becomes near-certain, and lost updates should be observable (some `w{i}` fields below 40, or `seed` gone) while the final file still parses (atomic rename). Record the observed output in the spec file under `## Build Finding — Reproduction` (this is the spec's Deliverable 1: the fail-open path demonstrably taken under contention). If lost updates do NOT occur even at budget 1, STOP and report — the diagnosis is wrong and the contract decision must be revisited.

## Task 3: Test changes

Files: `tests/hooks-context.test.js`

- Strict test: spawn workers with `env: { ...process.env, CLAUDE_TWEAKS_LOCK_WAIT_MS: '60000' }`. The assertion set is unchanged (seed survives, every `w{i}` = 40) — it now verifies the serialization *mechanism* deterministically on any runner profile, instead of racing the 500 ms budget. Rename the test to "...serializes concurrent writers under an effectively-unbounded lock budget (finding regression)" and add a comment stating the contract: production is best-effort/fail-open by design; this test pins the budget high to test the lock, not the budget. 60000 is a ceiling on lock-wait, not a sleep — no assertion depends on its value (IL-62).
- New fail-open test: same workload with `CLAUDE_TWEAKS_LOCK_WAIT_MS: '0'` — assert every worker exits 0 and the final `run-state.json` parses as valid JSON (atomic rename means no torn file even fully unlocked). Do NOT assert updates are lost (nondeterministic) — parseability and clean exits are the deterministic guarantees.
- Discrimination check (run once, not committed): the strict test with budget '0' instead of '60000' must FAIL (fields lost) — proving the assertions still catch the original no-serialization defect. Record pass/fail of this inversion in the spec file's Build Finding section.

## Verification

- `npm test` → full suite green (2924 + 1 new = 2925 expected, 0 fail).
- The strict test passes 3 consecutive runs (stability spot-check).
- `grep -n "CLAUDE_TWEAKS_LOCK_WAIT_MS" bin/lib/hooks/context.js tests/hooks-context.test.js` → knob defined once, consumed by both tests.
- No assertion in either test references the literal 500 (IL-62).
