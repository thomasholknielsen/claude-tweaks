---
record: 834
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 834: feedback: gh issue create has no shared retry wrapper, forcing hand-authored bash retry loops on transient 503s

Surface: backend

## Current State

`/claude-tweaks:feedback`'s Step 8 explicitly disclaims retry ("There is no automatic retry for upstream filings"), so a run of ordinary GitHub API 503s forced three separately hand-authored bash retry loops mid-flow, one of which still needed 5 attempts across two different loops before a filing succeeded. The plugin already ships a shared, bounded-backoff retry wrapper (`bin/lib/health-core/retry-cli.js`, documented as "one implementation instead of four near-identical copies"), but `/claude-tweaks:feedback` doesn't use it — Step 8's `gh issue create` and Step 4's dedup search both call `gh` directly with no retry.

Reproduced: run `/claude-tweaks:feedback` (any mode reaching Step 8) during a stretch of transient GitHub API instability (intermittent `HTTP 503: No server is currently available to service your request`); each `gh label list`/`gh issue create` call fails outright with no retry, forcing a hand-written shell retry loop that differs every time it's improvised.

## Deliverables

- Wire Step 8's `gh issue create` call through `bin/lib/health-core/retry-cli.js`'s existing bounded-backoff retry wrapper, matching how other health-sweep call sites already use it.
- Wire Step 4's dedup search (`gh label list` / equivalent) through the same wrapper.
- Update `/claude-tweaks:feedback`'s Step 8 text to no longer disclaim retry, since it now has one.

## Acceptance Criteria

- `/claude-tweaks:feedback` Step 8's `gh issue create` call retries transient failures (e.g. `HTTP 503`) via `retry-cli.js` instead of failing outright.
- Step 4's dedup search call gets the same retry treatment.
- Step 8's skill text is updated to reflect that retry now exists — no stale "no automatic retry" disclaimer.
- `npm test` green.

## Technical Approach

Reuse `bin/lib/health-core/retry-cli.js` at both call sites rather than introducing a second retry mechanism — it already exists specifically to be the one shared implementation instead of hand-rolled per-caller loops. In `/claude-tweaks:feedback`'s Step 8, replace the direct `gh issue create` invocation with a call through `retry-cli.js`'s wrapper, following whichever call convention its existing consumers use (check `bin/lib/health-core/` for a consumer example before wiring a new one). Apply the same wrapper to Step 4's dedup search (`gh label list` / equivalent). Once both call sites retry automatically, update Step 8's prose to remove the "There is no automatic retry for upstream filings" disclaimer, since it would then be stale.

### Key Files

- `plugin/skills/feedback/SKILL.md` — Step 8 (`gh issue create`), Step 4 (dedup search), and the stale no-retry disclaimer
- `plugin/bin/lib/health-core/retry-cli.js` — the existing shared retry wrapper to reuse

## Gotchas

- The retry wrapper already exists and is documented as the single shared implementation — this record is a wiring/reuse task, not a new-mechanism design; don't build a second retry implementation.
- One of 6 filings in the reported incident needed 5 attempts across two hand-rolled loops before succeeding — confirm the wrapper's bounded-backoff ceiling is generous enough to cover that observed worst case, or document why a lower ceiling is still acceptable.
- Plugin version at time of filing: 6.87.0 — confirm `retry-cli.js`'s current interface still matches what was true then before wiring against it.

## Original request

feedback: gh issue create has no shared retry wrapper, forcing hand-authored bash retry loops on transient 503s

**Summary:** `/claude-tweaks:feedback`'s Step 8 explicitly disclaims retry ("There is no automatic retry for upstream filings"), so a run of ordinary GitHub API 503s forced three separately hand-authored bash retry loops mid-flow, one of which still needed 5 attempts across two different loops before a filing succeeded.

**Kind:** Defect

**Affected component:** `/claude-tweaks:feedback` (Step 8); `bin/lib/health-core/retry-cli.js`

**Objective:** Automation efficiency

**Repro steps:**
1. Run `/claude-tweaks:feedback` (any mode that reaches Step 8) during a stretch of transient GitHub API instability (intermittent `HTTP 503: No server is currently available to service your request`).
2. Watch each `gh label list` / `gh issue create` call fail outright with no retry — the skill text states there is none.
3. Observe the only way forward is hand-writing a shell retry loop around each call, which differs every time it's improvised.

**Expected vs. actual:**
Expected: Step 8's `gh issue create` (and Step 4's dedup search) use a shared, bounded-backoff retry wrapper — the plugin already ships one (`bin/lib/health-core/retry-cli.js`, documented as "one implementation instead of four near-identical copies").
Actual: no such wrapper is used by `/claude-tweaks:feedback`; a single filing run needed 3 independently hand-authored retry loops, and one of 6 filings needed 5 attempts across two of them before succeeding.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-3d1cfd1e -->

