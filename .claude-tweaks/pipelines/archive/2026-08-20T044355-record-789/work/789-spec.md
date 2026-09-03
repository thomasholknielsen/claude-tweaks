---
record: 789
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 789: capture: no cross-session signal when two open issues independently propose the same missing bin/ CLI

Title: capture: no cross-session signal when two open issues independently propose the same missing bin/ CLI
Type: task
Labels: none
Defer-reason: tangential

# Reflect — staged finding 1

**Category:** tangential

Origin: reflect full from #693 (batch pass, specs 686-693)
Defer-reason: tangential

## Current State

During this 8-spec bundle, spec 686 built `bin/log-decision.js` (a `decisions.md`-entry-appender CLI)
from issue #637's own scope. Independently, while this bundle ran, an unrelated upstream PR
("Ship bin/ CLIs for the hand-scripted per-run procedures — materialize, claim, release-claims,
log-decision") shipped its own `bin/log-decision.js` with a materially different CLI signature —
discovered only at spec 692's wrap-up, as a `git merge origin/main` add/add conflict, after both
implementations had already been built, tested, and relied on by their respective branches. The
issue-claims protocol (`_shared/issue-claims.md`) claims the *issue number* being worked, not the
*deliverable* (a named CLI, module, or artifact) it proposes to create — so two different issues
proposing overlapping/duplicate tooling never collide at the claim layer, only much later at a git
merge, by which point both sides have sunk real work into diverging designs.

## Deliverables

Some mechanism — a `bin/` CLI naming convention check at capture/specify time, a periodic
cross-issue "proposed deliverable name" scan, or simply a prose reminder in `_shared/issue-claims.md`
to grep `bin/` for a same-named file before filing a new "build a CLI for X" issue — that surfaces
this class of collision earlier than a mid-bundle merge conflict discovered by chance.

## Acceptance Criteria

A human deciding to act on this should be able to state, concretely, at what point in the lifecycle
(capture, specify, or build) the check would fire, and confirm it would have caught this specific
incident (#637's spec 686 vs. the upstream "Ship bin/ CLIs" PR) had it existed.

_Filed by `reflect` via specShapedBody._

