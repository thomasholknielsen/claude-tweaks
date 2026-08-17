---
record: 722
origin: capture
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---
# 722: flow claim-contest card: render holder liveness (session, local worktree, transcript freshness) so a live-sibling contest is actionable

Surface: backend

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)
Defer-reason: genuinely-larger

## Current State

- `flow/claim-targets.md`'s "Flow: Claim contested" card renders holder runId / host / claimedAt / expiry and closes with "Wait for the claim to expire, or resume once it releases." That is the right stop (no `AskUserQuestion`), but it is unactionable when the holder is a **live sibling on the same host** running the identical command — observed: two `/flow` invocations over the same 8 records 15 s apart, the second losing the claim race.
- To tell the user anything useful (is it alive? did I launch it? where is its worktree?) the model improvised 5 tool rounds — holder transcript mtime, `git worktree list`, `ps` — none of which the card asks for.

## Deliverables

- [ ] Extend the contest card: holder `sessionId`; when `host` == `hostname`, the `git worktree list` match for the holder's slug (`flow-spec-{…}`, locked or not) and the holder transcript's mtime (`~/.claude/projects/<slug>/<sessionId>.jsonl`, path rule per `feedback/session-evaluation.md`); render one verdict line — `Live sibling on this machine — {worktree}, last active {age}` / `Remote holder ({host})` / `Stale holder — no activity since {ts}` — each with its own next step (wait for it / inspect that session / `/claude-tweaks:tidy` to reclaim).
- [ ] Still a stop, never a prompt.

## Acceptance Criteria

1. The card template in `claim-targets.md` carries the verdict line and its three variants.
2. A test (fixture-driven, or a documented manual check in the skill) exercises each verdict.

## Technical Approach

### Key Files
- `skills/flow/claim-targets.md`
- `bin/lib/hooks/worktree-detect.js` (worktree lookup helper, if reused)

## Gotchas

- The holder session's transcript lives under the project-slug derived from *its* cwd — a session inside a linked worktree writes to a different slug directory (`--claude-worktrees-…`); search both the main-checkout slug and worktree-derived slugs before declaring `no transcript`.
- Absence of a transcript or worktree is evidence, not an error — the card must render a verdict either way and never block on the lookup.
- `hostname` comparison uses the claim blob's `host` field; a remote holder simply gets the `Remote holder` line — no network probing.

**Related:** #607, #689, #693

## Original request

flow claim-contest card: render holder liveness (session, local worktree, transcript freshness) so a live-sibling contest is actionable

Defer-reason: genuinely-larger

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

- `flow/claim-targets.md`'s "Flow: Claim contested" card renders holder runId / host / claimedAt / expiry and closes with "Wait for the claim to expire, or resume once it releases." That is the right stop (no `AskUserQuestion`), but it is unactionable when the holder is a **live sibling on the same host** running the identical command — observed: two `/flow` invocations over the same 8 records 15 s apart, the second losing the claim race.
- To tell the user anything useful (is it alive? did I launch it? where is its worktree?) the model improvised 5 tool rounds — holder transcript mtime, `git worktree list`, `ps` — none of which the card asks for.

## Deliverables

- [ ] Extend the contest card: holder `sessionId`; when `host` == `hostname`, the `git worktree list` match for the holder's slug (`flow-spec-{…}`, locked or not) and the holder transcript's mtime (`~/.claude/projects/<slug>/<sessionId>.jsonl`, path rule per `feedback/session-evaluation.md`); render one verdict line — `Live sibling on this machine — {worktree}, last active {age}` / `Remote holder ({host})` / `Stale holder — no activity since {ts}` — each with its own next step (wait for it / inspect that session / `/claude-tweaks:tidy` to reclaim).
- [ ] Still a stop, never a prompt.

## Acceptance Criteria

1. The card template in `claim-targets.md` carries the verdict line and its three variants.
2. A test (fixture-driven, or a documented manual check in the skill) exercises each verdict.

## Technical Approach

### Key Files
- `skills/flow/claim-targets.md`
- `bin/lib/hooks/worktree-detect.js` (worktree lookup helper, if reused)

**Related:** #607, #689, #693
