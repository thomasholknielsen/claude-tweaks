# 0012. The autonomy ceiling's top tier ships defined but shut

- **Status:** accepted
- **Date:** 2026-08-07
- **Context:** Earned-autonomy tier design (`docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md`), Phase 3

## Context

The earned-autonomy design (`docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md`)
defines a three-value policy lever — `autonomy: supervised | trusted | unattended` — that caps what
per-class trust evidence is allowed to unlock. Phase 3 wires it. The design's own tier table gives
`unattended` two powers beyond `trusted`: born-authorized filing (`ready + auto:build`) and a
headless finalization drain.

Born-authorized is the problem. `_shared/work-record.md`'s Grant semantics has long asserted that
`auto:*` labels are only ever added by an interactive human session, and that machinery may only
remove or downgrade a grant, never originate one. That is not a stylistic rule. It was written
after a live run treated a low-risk, well-scoped, `ready` record as license to run a full
build-to-close lifecycle on its own judgment.

`trusted`'s born-`ready` and `unattended`'s born-authorized read as two steps on one dial, but they
differ in kind. `ready` asserts a record is *spec-shaped*; it gets the record into a worklist and
authorizes nothing, and `/claude-tweaks:backlog refine` re-derives shape from the body before
granting anyway ("labels are projection, not truth"). A wrongly-born-`ready` record costs a human
one flag-back. `auto:build` **is** the authorization — the thing the whole permission matrix exists
to protect.

So implementing the design's tier table literally would have amended a security invariant as a side
effect of adding a dial, with the amendment reachable by editing one line of a config file.

## Decision

Ship all three tiers. Implement `trusted` fully. Implement `unattended` such that its
born-authorized path requires a **second, explicit opt-in** beyond setting the ceiling —
`grantOriginationEnabled` in `bin/lib/issues/autonomy.js`'s `permittedGrants` — and ship with
nothing setting it. Reaching the top tier is never by itself an amendment of the invariant.

The tier is defined rather than deferred so that the ceiling is complete: a lever whose top value
does not exist cannot be said to cap anything, and adding the value later would be a second
breaking change to the same contract.

## Consequences

**`unattended` currently has zero incremental value over `trusted`.** Its only other listed power,
the finalization drain, is Phase 4 and unbuilt. An operator who sets `unattended` today gets exactly
`trusted` behavior. That is surprising, and it is why this decision is recorded here rather than
left implicit in the code — a reader who finds the tier inert should find the reason with it.

**The decision this defers is a real one, not a formality.** Whether machinery may ever originate a
grant is recorded as open question 4 in the design doc. Answering it means deciding that class-level
outcome evidence can substitute for a maintainer's signature on a specific record. That is the
user's call.

**What made the eval weaker evidence than it looked.** Both the module comment and
`_shared/autonomy-ceiling.md` initially claimed the invariant "has a live eval asserting it"
(`evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`). The scenario's own description
says the grant path is untestable in its sandbox — no live `gh`, network blocked — so what it
actually pins is the `local-files` boundary. The incident carries the weight here; the eval is a
partial guard. Both files were corrected to say so.

**Why this is hard to reverse in the direction that matters.** Flipping the opt-in is one line. What
is hard to reverse is the precedent: once a shipped release lets machinery originate a grant, every
consumer that reads `auto:build` as "a human authorized this" is wrong, and there is no way to tell
retroactively which grants had a signature behind them. The label's audit trail records who applied
it, which is exactly the property that stops being meaningful.

## Update (2026-08-10, #269)

Open question 4 is answered: `/claude-tweaks:backlog`'s headless `grant` mode
(`skills/backlog/grant-mode.md`) is the one path that reads `grantOriginationEnabled` (surfaced as
the `grant-origination-enabled` policy key) and acts on it. The opt-in is still `false` by
default — a project opts in deliberately, in `policy.yml`, and reaching `unattended` alone still
does nothing extra by itself. What changed is that a live consumer now exists behind the opt-in,
narrowed by its own gate chain (`bin/lib/issues/grant-gate.js`): a clean per-class trust verdict,
an agent-filed (`by:*`) origin — human-filed records are refused unconditionally, regardless of
every other key — a content-aware `grant-check` clearing, and no floor trip. This does not revise
the decision above; it exercises the path this ADR always said would exist, once amending the
invariant became a decision someone made deliberately.
