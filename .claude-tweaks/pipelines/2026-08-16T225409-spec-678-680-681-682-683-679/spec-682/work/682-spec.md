---
record: 682
origin: human
risk: medium
size: low
ceremony: standard
grants: []
surface: backend
---
# 682: worktree-always transitional twin: removal condition keyed on the installed build, not the running one — deleting it in-session disarmed the gate and a direct push to main went through with a false explanation

Surface: backend

## Current State

- `skills/_shared/policy-deprecations.md` §`worktree.always` (renamed to `worktree-always`, #602) states the transitional twin's removal clause as: delete the twin "once the **installed** build's `plugin.json` version is at or above the release that shipped #602". `docs/decisions/0014-hook-read-key-renames-carry-a-transitional-twin.md` carries the same wording.
- `claude plugin update` moves the install pointer immediately but the running session keeps the build it started with (`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — the same "running build, not install metadata" rule `[IL-89]` already applies to version fields; `docs/donts.md`).
- `bin/lib/policy.js` `isWorktreeAlwaysOn(repoRoot)` reads via `RENAMED_KEYS` on the new build; the 6.87.0 build reads only the old literal `worktree.always`. This repo's `.claude-tweaks/policy.yml` now carries only `worktree-always: true` — the twin was deleted in the incident session.
- Incident: in a session started under 6.87.0, after `claude plugin update` (pointer → 6.87.1), the twin line was deleted; the running hook then resolved the gate OFF, and a `git commit` + `git push origin main` from the shared checkout succeeded. The session attributed the success to the #537 allowlist, which covers commits only (`bin/lib/hooks/pre-tool-use.js`: "never 'push'"). Verified ff + green CI, no damage — but the run's most privileged action happened under a silently disabled gate with a wrong explanation recorded.
- `bin/lib/hooks/session-start.js` emits `additionalContext` (unfinished runs, worktrees left, the worktree-always nudge) but never states the resolved gate verdict or which key satisfied it.

## Deliverables

- [ ] `policy-deprecations.md` `worktree.always` entry and ADR 0014: restate the removal condition against the **running** build (`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`) and state that the deletion belongs in a fresh session started on a build ≥ the release that shipped #602 — never mid-session after `claude plugin update`. Record the incident in `docs/incident-log.md` under a new `[IL-nnn]` tag and cite it from both.
- [ ] `session-start.js`: once per session, print the resolved worktree-always verdict — `worktree-always: ON (matched key: worktree.always)` / `ON (matched key: worktree-always)` / `OFF (no key)` — sourced from the same resolver the gate uses (`bin/lib/policy.js`), so the announcement can never disagree with enforcement. Silent when `policy.yml` is absent.
- [ ] `docs/hooks.md`: document the verdict line.
- [ ] `tests/hooks-session-start.test.js`: old-key-only → ON/old key; new-key-only → ON/new key; both → ON/new key; neither → OFF; no policy file → no line; malformed file → no line, no throw.

## Acceptance Criteria

1. The removal clause in `skills/_shared/policy-deprecations.md` and `docs/decisions/0014-*.md` no longer says "installed build"; both name the running build's `plugin.json` and "fresh session", and cite the new `[IL-nnn]`.
2. Session start on this repo prints exactly one verdict line naming ON/OFF and the matched key; the resolver called is `bin/lib/policy.js`'s, not a second parse.
3. The six fixture cases above pass; the never-break-a-session invariant holds (malformed `policy.yml` → no line, no throw).
4. `docs/hooks.md` and `docs/incident-log.md` updated; `npm test` passes.

## Technical Approach

- Expose `resolveWorktreeAlways(repoRoot) → { on, matchedKey }` in `bin/lib/policy.js`; `isWorktreeAlwaysOn` becomes a thin wrapper over it, so `pre-tool-use.js` and `session-start.js` share one reader.
- Prose edits: two files + incident log; keep `policy-deprecations.md`'s shared predicate paragraph (line 5) unchanged — every entry cites it.

### Key Files
- `skills/_shared/policy-deprecations.md`, `docs/decisions/0014-hook-read-key-renames-carry-a-transitional-twin.md`, `docs/incident-log.md`, `docs/hooks.md`
- `bin/lib/policy.js`, `bin/lib/hooks/session-start.js`
- `tests/hooks-session-start.test.js`

## Gotchas

- A session-start line announces the verdict **at start**; it cannot catch a deletion made later in the same session. What closes the incident's actual scenario is the restated rule ("delete in a fresh session") plus the banner naming which key the running build reads, so the operator knows *before* deleting which line is load-bearing. Don't claim more than that in the docs.
- Never re-parse `policy.yml` in `session-start.js` with a second implementation — this defect class *is* two readers disagreeing (project memory: silent fallback masks bugs; grep for duplicate implementations).
- `session-start.js` runs on every install's every session — one short line, silent when there's nothing to say, inside the existing tiered try/catch posture (`docs/hooks.md`).
- The #537 allowlist covers commits, not pushes — don't widen it while here.

## Original request

worktree-always transitional twin: removal condition keyed on the installed build, not the running one — deleting it in-session disarmed the gate and a direct push to main went through with a false explanation

**Summary:** The twin's comment (and ADR 0014 / the #602 deprecation entry) said "delete once the installed build's plugin.json version ≥ the release that shipped #602". `claude plugin update` moved the install pointer to 6.87.1 but explicitly defers to a restart; the running session's 6.87.0 hook reads the old literal only. Deleting the twin therefore switched the worktree gate OFF for the running session, which then committed and pushed to `main` from the shared checkout — and attributed the success to the #537 allowlist, which covers commits only (`pre-tool-use.js`: "never 'push'"). The push was a verified fast-forward with green CI, so no damage — but the most privileged action of the run happened under an unnoticed disabled gate with a wrong reason recorded.

**Kind:** Defect

**Affected component:** `skills/_shared/policy-deprecations.md` (`worktree.always` entry's removal clause); `docs/decisions/0014-…`; `bin/lib/hooks/session-start.js`

**Objective:** Trust calibration

**Repro steps:**
1. On a project whose `policy.yml` carries both spellings, run `claude plugin update` (pointer → 6.87.1) in a session started under 6.87.0.
2. Delete the `worktree.always` line in that same session.
3. `git commit` and `git push origin main` from the main checkout.

**Expected vs. actual:**
Expected: the gate still enforces (the running hook is 6.87.0 and reads the old literal), or the plugin tells the operator the removal must wait for a fresh session.
Actual: gate OFF; commit and push succeed; nothing announces the enforcement flip.

**Proposed fix:** (1) Restate every transitional-twin removal condition against the **running** build — `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, the same rule `[IL-89]` already applies to version fields — and say the deletion belongs in a fresh session; fix the `policy-deprecations.md` clause and ADR 0014 wording. (2) Have `session-start.js` print the resolved `worktree-always` verdict once per session (ON/OFF and which key the running reader matched), so an enforcement flip from a spelling/build mismatch announces itself instead of being inferred from a push that unexpectedly succeeded.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-9bb25538 -->

