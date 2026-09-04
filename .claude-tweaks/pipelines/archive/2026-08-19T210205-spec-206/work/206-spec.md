---
record: 206
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 206: Impeccable Rule 5 cites a version pin that nothing enforces, and the contract test skips instead of failing

Surface: backend

## Current State

The core hazard this record raised is already fixed, in the same-day plan the ledger note itself names:

- `d77e0a2c` — "Enforce the CLI pin on both sides — fail off-pin, skip only when absent" and `e17b8ef8` — "Classify the design gate on advisory, not severity" both landed on 2026-08-06, the same day as the plan (`2026-08-06-impeccable-cli-contract`) this record was recovered from. `6676ea9f` re-pinned the contract to CLI 3.6.0 on 2026-08-15.
- `tests/impeccable-cli-contract.test.js` (lines 27-33) now skips only when the CLI is absent (`version === null`) and fails when it is present but off-pin, with the rationale spelled out in a code comment: *"Absent CLI skips; present-but-off-pin FAILS. A contract probe that silently declines to run reads exactly like one that passed... Contributors without impeccable installed are unaffected."*
- Design-gate classification no longer reads `severity` at all. `skills/design-wrapper/impeccable-cli.md`'s field reference and Advisory-to-result mapping now classify strictly on the `advisory` field — the field upstream's own exit code is computed from — and state explicitly: *"`severity` outside `{warning, advisory, error}` → informational only... It does not change pass/fail — classification never reads `severity`, so an unrecognized value has nothing left to decide."* This closes the exact hazard the original ledger note raised: a renamed severity value can no longer downgrade a warning to a pass.
- Verified locally (2026-08-17): all 5 assertions in `tests/impeccable-cli-contract.test.js` pass — CLI 3.6.0 is installed and matches the pin.

What remains: `skills/design-wrapper/impeccable-cli.md` calls itself "the contract" (its opening line: *"Contract pinned to Impeccable CLI 3.6.0 and proven by `tests/impeccable-cli-contract.test.js`..."*), but it never states the fail/skip distinction itself — that distinction lives only in the test file's code comment. This is exactly the gap the original AC named: the behavior needs to be "stated in the contract file rather than only in the test."

## Deliverables

- [ ] Add a paragraph to `skills/design-wrapper/impeccable-cli.md`'s opening pin block (near the `<!-- upstream-pin -->` comment / the italic contract paragraph, lines 1-4) that states the fail/skip distinction explicitly: CLI absent → the contract test skips; CLI present but off-pin → the contract test fails. Cross-reference `tests/impeccable-cli-contract.test.js`'s `skip` variable as the single enforcement point rather than restating its logic in prose.
- [ ] State the safe-direction rationale in that same paragraph: an off-pin-but-present CLI must fail (silently passing would reproduce the exact "a check that does not run reads as a check that passed" hazard `[IL-105]` names), while an absent CLI is defensible to skip because no contributor is misled by it — they were never running the gate at all.
- [ ] Before closing, re-run `node --test tests/impeccable-cli-contract.test.js` to confirm the fail/skip distinction and the severity→advisory reclassification described above still hold — this record's ledger snapshot predates both fixes, so re-verify rather than trusting the recovered note's description of the state.

## Acceptance Criteria

1. `skills/design-wrapper/impeccable-cli.md` states, in prose (not only in the test file), that present-but-off-pin fails and absent skips.
2. The same paragraph states which direction is safe and why, matching the reasoning already embedded in the test's code comment — it must not merely assert the behavior without the rationale.
3. `node --test tests/impeccable-cli-contract.test.js` still passes after the doc edit (a docs-only change; no test-file logic changes are expected as part of this record).

## Technical Approach

No code or test-logic changes are needed — the three behavior deliverables implied by the original ledger note (fail-vs-skip, severity→advisory reclassification, an enforced pin) already shipped in `d77e0a2c`, `e17b8ef8`, and `6676ea9f`. This record's remaining scope is a single-file documentation deliverable: edit `skills/design-wrapper/impeccable-cli.md`'s opening pin block to state the behavior the test already enforces.

### Key Files

- `skills/design-wrapper/impeccable-cli.md` — add the fail/skip + safe-direction paragraph near the existing `<!-- upstream-pin -->` comment (lines 1-4)
- `tests/impeccable-cli-contract.test.js` — reference only; lines 27-33 hold the mechanism and rationale being promoted into the doc. No edits expected here.

## Gotchas

- Do not restate the fail/skip *logic* in the doc in a way that could drift from the test's actual `skip` computation — cross-reference the test's `skip` variable as the single source of truth for the mechanism, and state only the *behavior* and *rationale* in the doc's prose.
- Three deferred minors were carried in the original ledger note. None is merge-blocking and none is part of this record's Deliverables/AC — do not fold them in:
  - The contract test's field-presence loop (`every documented field is present on a finding`) checks presence, not type; a past review recommended a severity-domain assertion instead of type-checking `line`. Out of scope here.
  - `skills/init/bootstrap/step-11-impeccable-design-integration.md` still says "the same 25-rule detector" against a pinned registry of 59 rules — pre-existing, unrelated to this record.
  - The original "24 Impeccable commands" stale-count note (previously cited at `skills/design-wrapper/SKILL.md:192`) no longer matches that file's current content as of shaping time — it appears already resolved or moved; cross-check against #145 (Phase 3, still open) before assuming it's fully closed.

## Original request

Impeccable Rule 5 cites a version pin that nothing enforces, and the contract test skips instead of failing

Surface: skills

## Current State

Recovered from the SDD ledger of `worktree-impeccable-upstream-contract` (plan `2026-08-06-impeccable-cli-contract`), where it was recorded as **"Task 4: PARKED FOR HUMAN"** and never raised. That branch merged into `main`; its worktree was reaped during a cleanup pass, so this record is the only surviving copy.

The Impeccable CLI contract's Rule 5 rests on a pin that nothing enforces:

- Rule 5's rationale is *"under a pin, an unrecognized severity is evidence the pin was violated."*
- The documented invocation is `npx impeccable detect --json <files>` — **no `@3.5.0`**, and there is no `impeccable` entry in any `package.json` in this repo.
- `tests/impeccable-cli-contract.test.js` **SKIPs** on version mismatch rather than failing.

So on a drifted environment the contract check silently does not run, and a renamed severity would downgrade a warning to advisory and thus to `pass`.

## Why it matters

This is the same shape as the bug the parent plan existed to fix: **a check that does not run reads as a check that passed** — the hazard `[IL-105]` names. It partially undercuts that plan's own thesis.

The reviewer raised it; the controller confirmed it was real and explicitly declined to fix it unilaterally, because the obvious fix changes behavior for contributors and CI.

The stated escalation path — "Phase 2's drift auditor" (#140) — is unbuilt, so nothing covers the gap in the meantime.

## Deliverables

- [ ] Decide whether the contract test should **fail** rather than skip when the Impeccable CLI is present but off-pin. This is the behavior change that needs a human: it turns a silent skip into a red suite for anyone whose local `npx` resolves a different version.
- [ ] If it should fail, decide what happens when the CLI is **absent** entirely — skip is defensible there in a way it is not for "present but wrong version".
- [ ] Either pin the invocation (`npx impeccable@<version>`) so the rationale for Rule 5 holds, or rewrite Rule 5's rationale so it does not claim a pin that does not exist.

## Acceptance Criteria

1. Present-but-off-pin and absent are handled distinctly, and each behavior is stated in the contract file rather than only in the test.
2. Rule 5's rationale and the actual invocation agree — either the pin exists or the rationale stops citing one.
3. The chosen failure direction is explicit: state which way an unresolvable version reads, and why that is the safe direction.

## Notes

Deferred minors carried in the same ledger, recorded here so they are not lost with the worktree — none merge-blocking:

- The contract test's field loop checks presence, not type. The final review recommended superseding it with a severity-domain assertion rather than type-checking `line`.
- `skills/design-wrapper/SKILL.md:192` says "all 24 Impeccable commands"; there were 23 at 4.0.4. The design assigns this to Phase 3/A3 (#145).
- `init/bootstrap/step-11:64` says "the same 25-rule detector"; the pinned registry has 59. Pre-existing, outside that plan entirely.

