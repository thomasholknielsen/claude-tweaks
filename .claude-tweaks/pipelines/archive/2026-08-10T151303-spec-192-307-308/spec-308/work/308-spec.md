---
record: 308
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: worktree-concurrency-hardening:sibling-sessions
surface: backend
---
# 308: Sibling-session detection script wired into /dispatch's claim step

Surface: backend

## Overview

CLAUDE.md's `[IL-107]` documents the rule "before starting work on a record, enumerate
worktrees and their lock-owning pids, not just branches, claims, and labels" — unpushed work
by a live session is invisible to every remote-facing signal. Today this rule has zero code
and zero skill call site tied to record-claiming; it exists only as a Don'ts-list bullet an
agent has to remember unprompted. This leaf turns it into a callable script wired into
`/claude-tweaks:dispatch`'s claim step — the entry point `[IL-107]`'s actual incident (a
finished nine-task implementation nearly redone from scratch) went through — by **reusing**
the pid-liveness primitive `bin/lib/hooks/worktree-reap.js` already ships (`parseWorktreeList`,
`isPidAlive`, `lockVerdict`), not reimplementing it.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Replacing the existing branches/claims/labels check `/dispatch` already runs before
  claiming — this is additive to it, not a replacement.
- Wiring into `/claude-tweaks:specify` or `/claude-tweaks:build`'s own record-selection paths.
  `/dispatch` is the first consumer; a second consumer is what would trigger relocating this
  module out of `bin/lib/hooks/` per `[IL-32]`'s "three consumers" threshold — decide that
  later, when/if a second consumer appears, not speculatively here.
- Reimplementing pid-liveness checking via a `ps` subprocess. `worktree-reap.js`'s
  `isPidAlive` already does this correctly with a `process.kill(pid, 0)` signal-0 probe — no
  subprocess spawn, already tested. Shelling out to `ps` here would be a second, divergent
  implementation of the exact thing `[IL-32]` warns about, in the same directory as the
  original.
- Cross-checking a lock's captured start-timestamp against the live process's actual start time
  to detect pid reuse. `isPidAlive`'s own design comment states this directly: "a recycled pid
  reads as alive... the failure mode is always under-reaping" — an accepted, documented,
  empirically rare (the reaper design measured "perfect discrimination across 12 cases")
  limitation of the primitive this leaf reuses. See Gotchas for what this means for THIS leaf's
  own failure direction, which differs from the reaper's.

## Current State

- `bin/lib/hooks/worktree-reap.js` already exports everything this leaf needs:
  `parseWorktreeList(porcelain)` (parses `git worktree list --porcelain`, capturing `path`,
  `branch`, `locked`, `lockReason`, and `pid` extracted via its own `PID_RE`),
  `isPidAlive(pid)` (signal-0 liveness probe), and `lockVerdict(entry)` (returns `'free' |
  'in-use' | 'orphaned' | 'unknown'`). Import and call these directly — do not re-derive
  `lockReason` parsing or pid extraction; an earlier draft of this leaf incorrectly pointed at
  `bin/lib/residue/scope.js` for this (that file only stores the raw `lockReason` string with
  no pid extraction or liveness check at all).
- `/claude-tweaks:dispatch`'s claim step (`skills/dispatch/SKILL.md`) currently checks only
  branches, claims, and labels before claiming a record — no worktree/pid enumeration. Dispatch
  claims whole file-overlap **groups** (multiple issue numbers bundled per the group-claim
  rule), not single records in isolation.
- `bin/hooks.js` already exposes CLI verbs for related worktree bookkeeping
  (`record-worktree`, `close-run`) — this leaf's new verb follows the same invocation
  convention (`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" <verb> ...`).
- Existing test convention for `bin/lib/hooks/` modules: flat files under top-level `tests/`
  (e.g. `tests/hooks-worktree-reap.test.js`), matched by `package.json`'s `node --test tests/`
  glob — there is no `bin/lib/hooks/tests/` directory.

## Deliverables

- [ ] New module `bin/lib/hooks/sibling-sessions.js` exporting a function
      `findConflictingSession(recordRef, { cwd })` that: calls `worktree-reap.js`'s
      `parseWorktreeList`/`lockVerdict` over `git worktree list --porcelain` (run from `cwd`,
      the invoking repo root — never assumed from process cwd without an explicit anchor, per
      `[IL-26]`'s cd-to-sibling-repo hazard), filters to entries whose `lockVerdict` is
      `'in-use'`, and among those, matches `recordRef` (a record id or slug) against each
      candidate's `branch`/`path` as a `/`-or-`-`-delimited token — not a bare substring match,
      so record `19` doesn't false-match branch `flow-spec-192-193`. Excludes any match whose
      resolved pid equals the *calling* session's own — read `CLAUDE_CODE_SESSION_ID` and
      compare against the live worktree's recorded owner the same way `record-worktree`/E1
      already do, so a session resuming its own claimed record never reads as a conflict with
      itself.
- [ ] New CLI verb `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-sibling-sessions --record
      <id-or-slug>` on `bin/hooks.js`, wrapping the module above, following the same
      invocation convention as `record-worktree`/`close-run`. This is the fixed, load-bearing
      contract — not an illustrative example.
- [ ] `skills/dispatch/SKILL.md`'s claim step calls this verb once per member of the group
      being claimed, before claiming. Any match aborts the automated claim and surfaces the
      conflicting session (worktree path, branch, pid) for human/agent decision — this is not
      an unconditional hard block with no path forward, matching this plugin's existing
      "ambiguity resolves to allow, but never silently" posture elsewhere (e.g. E1's foreign-
      session warning): the claim stops automatically, but a human/agent that confirms the
      other session is actually stale can still proceed manually. No match proceeds exactly as
      today's branches/claims/labels check already does.
- [ ] Unit tests (`tests/hooks-sibling-sessions.test.js`) using frozen
      `git worktree list --porcelain` fixtures (never live output, per `[IL-80]`) and a mocked
      `isPidAlive`/process-liveness layer — covering: live match, dead-pid (no match),
      unparseable lock reason (no match, warns), self-match excluded via matching session id,
      substring-vs-token match discrimination (record `19` does not match branch
      `flow-spec-192-193`), and no worktrees at all (no-op).
- [ ] Discrimination check: revert the matching predicate and confirm the new tests fail
      against the broken version (`[IL-105]`) — a test that passes either way proves nothing.

## Acceptance Criteria

1. Given a fixture `git worktree list --porcelain` output containing a locked worktree whose
   branch/path names a record id as a delimited token, and that lock's pid reported alive by
   `isPidAlive`, `findConflictingSession` returns a match naming the worktree path, branch, and
   pid.
2. Given the same fixture but with the pid reported dead, `findConflictingSession` returns no
   match.
3. Given a `lockReason` string `worktree-reap.js`'s parser can't extract a pid from,
   `findConflictingSession` returns no match (`lockVerdict` `'unknown'`) and does not throw.
4. Given a match whose pid equals `CLAUDE_CODE_SESSION_ID`'s own recorded owner,
   `findConflictingSession` excludes it — no match returned.
5. Given a fixture branch `flow-spec-192-193` and record ref `19`, `findConflictingSession`
   returns no match — substring containment alone is not sufficient.
6. `/dispatch`'s claim step, run against a record/group with no matching worktree, claims
   exactly as it did before this leaf — the new check adds a match/no-match branch, it does not
   alter the existing branches/claims/labels logic.
7. `node --test tests/hooks-sibling-sessions.test.js` passes, and each Acceptance Criteria
   case above fails when its corresponding predicate is reverted (`[IL-105]`).

## Technical Approach

### Key Files

- `bin/lib/hooks/sibling-sessions.js` — new module, imports from `bin/lib/hooks/worktree-reap.js`
- `tests/hooks-sibling-sessions.test.js` — new
- `bin/hooks.js` — new `check-sibling-sessions` CLI verb, following the existing
  `record-worktree`/`close-run` pattern
- `skills/dispatch/SKILL.md` — wire the check into the claim step, once per group member

## Gotchas

- Reuse `worktree-reap.js`'s `parseWorktreeList`/`isPidAlive`/`lockVerdict` directly — an
  earlier draft of this leaf pointed at `bin/lib/residue/scope.js` for pid parsing, which is
  wrong (that file has no pid extraction at all). Import from `worktree-reap.js`, don't
  re-derive.
- `isPidAlive`'s accepted limitation ("a recycled pid reads as alive") means a false-positive
  match is possible in the rare case a dead session's pid was reused by an unrelated process.
  For the reaper this is safe (it just means under-reaping, the reaper's own designed-safe
  direction). For this leaf it means an over-cautious block — a claim gets flagged as
  conflicting when it isn't. That's the correct failure direction for a claim-blocking check
  (never worse than "ask a human to double check"), so no additional start-timestamp
  cross-check is being added — see Non-Goals.
- #225 (open, priority:high — "Residue worktree rows can't distinguish a live session from an
  abandoned lock") wants the same `worktree-reap.js` primitives for a different purpose
  (rendering residue-sweep evidence, not blocking a claim) — both leaves are consumers of the
  same existing module, not of each other; no dependency link needed between them.
- Everything here fails open: an unparseable lock or a dead pid lets the claim proceed — this
  check must never become a new hard blocker on `/dispatch` with no override, consistent with
  the rest of this plugin's "ambiguity resolves to allow" posture.
- The lock-reason string format is an unversioned implementation detail of `git worktree` this
  plugin doesn't own — `worktree-reap.js`'s own header comment already states this and tests
  against frozen fixtures for exactly that reason; this leaf's tests do the same (`[IL-80]`).


<!-- work-fingerprint: worktree-concurrency-hardening:sibling-sessions -->
