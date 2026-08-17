---
record: 537
origin: human
risk: medium
size: low
ceremony: standard
grants: [build]
fingerprint: policy-comprehension:worktree-always-path-scoped-exemption-for-policy-yml-edits-a
blocked-by: [533]
surface: backend
---
# 537: worktree.always path-scoped exemption for policy.yml edits and scoped commits
Surface: backend

## Overview

Under `worktree.always`, a one-line policy edit applied from a main checkout is denied by the PreToolUse gate, and even if written, its commit would be denied — so `/help policy`'s apply step (#534) can only hand the user a paste-ready command on such projects. This sub-issue widens the gate with a path-scoped exemption: `Edit`/`Write`/`NotebookEdit` targeting `.claude-tweaks/policy.yml` are allowed, and `git commit` is allowed when the command matches a strict allowlist grammar **and** the staged set is provably a subset of `{.claude-tweaks/policy.yml}`. Everything else — any other flag, any compound command, any push — keeps the existing posture.

This is deliberately release B of the policy-comprehension family (parent #532): an enforcement-semantics change shipped alone so it can be judged and reverted independently of the render surfaces.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No exemption for `git push` — push from a worktree remains the documented path.
- No exemption for any other `.claude-tweaks/` path beyond `policy.yml` (the `pipelines/` exemption already exists and is untouched).
- No change to E1 wrong-checkout ownership semantics, the fail-open rules, or any other hook module.
- No relaxation for Bash write shapes (`cp`/`mv`/`tee`/`sed`/…) targeting policy.yml — only the three file tools and the allowlisted commit; a shell rewrite of an enforcement-relevant file stays gated.
- **Cross-process index races are out of scope as an accepted risk**: a sibling session staging files between the hook's staged-set read and the commit executing is the same single-actor cwd trust the gate's existing checks already extend; stating this here makes it a scoped assumption rather than a silent one.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #533 | Policy schema human-facing metadata (summary/category/tier) and resolve-policy --all | Hard gate: both edit `skills/_shared/policy-schema.md` — do not start until #533 is merged (and #533 itself waits on #519); re-check at pickup |

Family sequencing: ships as its own minor release after release A (#533–#536).

## Current State

- `bin/lib/hooks/pre-tool-use.js` — the `worktree.always` gate; exports `GATE_COVERAGE`; reads policy via an in-process `bin/lib/policy.js` call (hot path, never shells out for the policy read); resolves cwd/run context in-process; the one existing exemption is `.claude-tweaks/pipelines/`. **At build, read the existing pipelines-exemption path resolution first**: if it does not already resolve symlinks and normalize `..`, extending that shared helper to do so is in-scope for this work (both exemptions must use it); likewise reuse its repo-root derivation for file-tool payloads (absolute `file_path`, no cwd field) rather than inventing a second mechanism — if none exists for file-tool paths, walking up from the target to the nearest `.git` is the fallback, and doing that with `fs` calls (no git spawn) keeps the hot-path constraint intact.
- `skills/_shared/policy-schema.md` — the canonical `worktree.always` coverage block (`<!-- gate-coverage:begin -->`), the single statement of what the gate intercepts; every other file cites it.
- `tests/hooks-gate-coverage.test.js` — pins the coverage block to `GATE_COVERAGE`; `tests/hooks-dispatcher.test.js` — the garbage-stdin invariant every hook module must pass; every hook path exits 0, denies only via `hookSpecificOutput.permissionDecision: 'deny'`.
- CLAUDE.md's Hooks section — "ambiguity resolves to allow — E1 denies only provable mismatches"; note the inversion here: for an *exemption*, the new claim requiring proof is the allow, so ambiguity keeps the deny-side posture.

## Deliverables

- [ ] File-tool exemption in `pre-tool-use.js`: `Edit`/`Write`/`NotebookEdit` whose target resolves to `.claude-tweaks/policy.yml` at the repo root bypass the `worktree.always` deny. Path comparison is between **fully-resolved real paths** (`fs.realpath`-style: symlinks and `..` resolved, on-disk casing canonicalized — this also settles case-insensitive-filesystem spoofs like `.Claude-Tweaks/Policy.yml`), never string containment. Repo-root derivation and normalization live in the one helper shared with the `pipelines/` exemption (see Current State).
- [ ] Commit exemption, **allowlist grammar first**: the command qualifies only when the entire command string matches an anchored pattern permitting exactly `git commit` with `-m`/`--message` (with argument, repeatable) and optionally `--no-verify` — nothing else. Any other content — any unlisted flag (`--amend`, `-a`, `-p`, `--interactive`, `-o`, `-C`, `--allow-empty`, …), any pathspec, any shell operator (`&&`, `;`, `|`, `$()`, backticks, `&`), any env-var prefix, any non-`git` invocation path — fails the match and keeps the gate. **Default-deny for anything not on the allowlist; there is no disqualifying-flag list to maintain.**
- [ ] Commit exemption, staged-set proof second: for an allowlist-matching command, `git -C {cwd} diff --cached --name-only` must return exactly `[".claude-tweaks/policy.yml"]` — one path, that path. A staged deletion of policy.yml alone also qualifies (deleting the file is a legitimate config change and appears as the same single path). Two or more paths (including a rename's old+new pair), an empty set, git spawn failure, or unparsable output → existing gated behavior.
- [ ] `GATE_COVERAGE` updated to express the exemption (paths + the allowlist-commit rule) alongside the existing `pipelines/` one, and the canonical coverage block in `skills/_shared/policy-schema.md` updated in the same change — the #138 discipline: constant, block, and test move together.
- [ ] Tests in `tests/hooks-gate-coverage.test.js` (or a sibling file if cleaner): coverage-block agreement, plus behavioral cases — Edit to policy.yml allowed; Edit to `.claude-tweaks/policy.yml.bak` denied; a symlink/case-variant path targeting policy.yml resolves to allowed (and one *escaping* policy.yml via symlink resolves to denied); allowlisted commit with only policy.yml staged allowed; same command with a second staged file denied; staged policy.yml rename (two paths) denied; `git commit -a -m x`, `git commit --amend -m x`, `git add X && git commit -m x`, `FOO=1 git commit -m x`, and `/usr/bin/git commit -m x` all denied; git-spawn-failure denied; every path exits 0 (assert exit codes).
- [ ] The `/help policy` mode file's gate-denied fallback note (#534) updated to state the exemption now covers the apply path, keeping the paste-ready fallback only for pre-exemption plugin versions.

## Acceptance Criteria

1. `node --test tests/hooks-gate-coverage.test.js` passes; temporarily reverting the coverage-block edit in `_shared/policy-schema.md` makes it fail (verify discrimination by reverting).
2. Every behavioral test above passes, and every denial/allow path exits 0 (asserted, matching the garbage-stdin invariant suite's pattern).
3. In a fixture main checkout with `worktree.always: true`, a `.claude-tweaks/policy.yml` file present, and **no** `.claude-tweaks/pipelines/` run dir: an Edit payload for `.claude-tweaks/policy.yml` produces no deny in stdout JSON; the same payload for `CLAUDE.md` produces the deny.
4. An allowlisted commit command with only policy.yml staged is allowed; adding a second staged file flips it to deny with no other input change.
5. `npm test` passes; no existing gate test is weakened.
6. Grep confirms no file other than the canonical block, `pre-tool-use.js`, and the tests restates the exemption list (negative sweep over `skills/` and `docs/` for a second policy.yml-exemption statement; the #534 fallback-note edit cites, not restates).

## Technical Approach

Extend the existing exemption check where the `pipelines/` carve-out lives, so both path exemptions share one resolution/normalization helper (extending that helper to full realpath semantics is part of this work if it lacks them — see Current State). The commit check is new capability for this module (it currently classifies the command, not the index): allowlist-match the command string first (pure regex, no spawn), and only for a match spawn git synchronously with the Bash call's cwd — the same cwd trust the run-resolution already applies — failing closed on any surprise. The policy read stays on the in-process hot path; only the allowlist-matched commit branch (already rare) pays the git spawn.

### Data / API Surface

- `GATE_COVERAGE` gains an exemptions expression covering `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`, and the allowlist+staged-subset commit rule; exact shape is the implementer's call but must remain the single machine counterpart the test pins.

### Key Files

- `bin/lib/hooks/pre-tool-use.js` — both exemption branches + `GATE_COVERAGE` (+ the shared path-resolution helper if it needs extending)
- `skills/_shared/policy-schema.md` — coverage block update
- `tests/hooks-gate-coverage.test.js` — pin + behavioral cases
- `skills/help/policy.md` — fallback-note update (cites the exemption)

### Package Dependencies

None.

## Gotchas

- **Never break a session**: every path — including every new deny and every error branch — exits 0; denial is stdout JSON only. `pre-tool-use.js`'s own header comment explains why exit 2 doesn't work.
- Ambiguity direction is inverted from the gate's usual rule: the gate denies only provable mismatches, but an *exemption* is the new claim — anything unprovable about the command or the staged set keeps the deny-side posture. The allowlist grammar is the mechanical form of that inversion: safety comes from what the pattern *admits*, never from a list of what it excludes.
- The hook sees the Bash *command string* and cwd, not the repo state at commit time — the allowlist's rejection of all shell operators is what closes the `git add X && git commit` stage-then-commit shape; don't re-open it with a "harmless prefix" carve-out.
- Worktree checkouts also have `.claude-tweaks/policy.yml`; the exemption is only *needed* in the main checkout but is harmless in a worktree (already allowed) — don't special-case it.
- `_shared/policy-schema.md` is contended: #533 (this family) and #519 both edit it — sequence via the Prerequisites row rather than merging around it.
- An exempted edit + scoped commit still leaves the commit unpushed on main — that's accepted; reconcile/push flows handle it, and the design explicitly keeps push gated.

## Decision Rationale

See parent #532 — the paste-ready-command fallback was rejected as the permanent answer because it makes the family's core promise ("every recommendation row is directly applicable") false on exactly the projects that opted into the strictest discipline; the exemption ships alone in release B so that judgment is separable and cheaply reversible. The commit rule's allowlist-over-denylist shape was chosen during red-team: a denylist of unsafe flags default-allows every flag nobody thought of (`--amend` being the proof case — it commits a tree `diff --cached` never saw), while an allowlist default-denies them all at zero maintenance cost.

<!-- work-fingerprint: policy-comprehension:worktree-always-path-scoped-exemption-for-policy-yml-edits-a -->

