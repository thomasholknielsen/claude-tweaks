---
record: 117
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 117: Stamp health-sweep issues with the commit they were verified against

Surface: backend

## Current State

The four health-sweep skills (`/code-health`, `/harness-health`, `/journey-health`, `/docs-health`) file issues whose bodies assert concrete facts about the repo — line numbers, counts, file lists, `## Current State` narratives. Those facts are measured at filing time and then never revalidated. Nothing in the filed body records **when** they were true.

Consumers therefore cannot tell a freshly-filed issue from one whose premise has been invalidated by weeks of drift. `CLAUDE.md`'s `[IL-71]` already tells an implementer not to trust the body — but that rule makes every consumer pay a full re-derivation regardless of whether the issue is a day old or a quarter old.

Working #90, #91, #96 and #100 in one session surfaced four distinct kinds of staleness in bodies filed by the health-sweep skills:

| Issue | Claim | Reality |
|---|---|---|
| #91 | 9 `gh` calls missing `--limit` | 7 |
| #91 | Unbounded-execution instruction at `docs-health/SKILL.md:103` | Lives in `docs-health/judge-procedure.md` point 6 |
| #100 | 6 verbatim Template A copies, listed | 1 was a false positive, 2 real copies unlisted, 1 more undiscovered inside the canonical file |
| #96 | Fix the diagram title to say 24 core labels | Would have contradicted the 18 rows printed directly beneath it (see `[IL-77]`) |
| #90 | Split the permission matrix and the gap-detection steps | Both measured net-negative on every consumer path; correctly skipped |

Every line number in all four was stale. `bin/lib/issues/issue-payload.js` and its `specShapedBody` skeleton are the shared body-composition path all four health-sweep skills already funnel through — the natural home for a fix that applies to all of them at once.

## Deliverables

- [ ] Add a machine-readable freshness stamp to the filed body — e.g. a `verified-as-of: {sha}` line, or a `Verified against {sha} on {date}` footer — emitted by `bin/lib/issues/issue-payload.js`'s shared `specShapedBody` builder so all four health-sweep skills get it at once.
- [ ] Update whichever step in `/code-health`, `/harness-health`, `/journey-health`, `/docs-health` calls the shared builder so it passes the sweep's own read commit through, and the stamp reflects that commit rather than the time of the `gh issue create` / local-file-write call.
- [ ] Teach at least one consumer (`/claude-tweaks:dispatch`, `/claude-tweaks:build`, or `/claude-tweaks:flow`) to read the stamp, compare it against `HEAD`, and say something actionable about the drift (e.g. "premise is 340 commits old — re-derive before implementing") rather than treating a one-day-old and a one-quarter-old issue identically.

## Acceptance Criteria

1. Every issue filed by the four health-sweep skills carries the freshness stamp in its body.
2. The stamp records the commit the sweep actually read at filing time — proven by a test/fixture showing that filing after a queued delay still stamps the *read* commit, not the later filing-time commit.
3. At least one of `/dispatch`, `/build`, `/flow` reads the stamp and surfaces an explicit, actionable drift statement (naming the commit distance or elapsed time) when the stamp is older than a defined threshold.
4. `[IL-71]`'s instruction not to trust a filed body's facts stays in force in `CLAUDE.md` and any consumer-facing docs — this stamp narrows how much re-derivation `[IL-71]` implies, it does not replace the rule.

## Technical Approach

Add the stamp at the single shared choke point — `bin/lib/issues/issue-payload.js`'s `specShapedBody` skeleton — so `/code-health`, `/harness-health`, `/journey-health`, and `/docs-health` all pick it up from one change rather than four parallel edits. The stamp's value must be the commit each sweep resolves as "HEAD" at the point it *reads* the repo, threaded through to the builder call as an argument — never resolved fresh inside the builder itself — because a sweep that queues findings and files them later would otherwise stamp the filing-time commit, exactly the "worse than no stamp" failure the Gotchas below call out.

On the consuming side, `/dispatch`, `/build`, and `/flow` each already resolve (or can cheaply resolve) the repository's current `HEAD` sha at the point they read a work record. Parse the stamp from the body as a plain body-metadata line — the same convention `Surface:`/`Design-intent:` already use, never YAML frontmatter — diff the stamped commit against current `HEAD` (`git rev-list --count {stamp}..HEAD` or equivalent), and render an explicit statement when the distance crosses a threshold worth naming in the response. Pick one consumer to implement first per Acceptance Criterion 3, rather than requiring all three in this record's scope.

### Key Files

- `bin/lib/issues/issue-payload.js` — add the stamp to `specShapedBody` (or the equivalent skeleton function each health-sweep skill calls to compose its filed body)
- `skills/code-health/`, `skills/harness-health/`, `skills/journey-health/`, `skills/docs-health/` — whichever step calls the shared builder needs to pass its own read-commit sha through
- `skills/dispatch/`, `skills/build/`, or `skills/flow/` — pick one as the first stamp-reading consumer per Acceptance Criterion 3

## Gotchas

- The stamp must reflect the sweep's read commit, not the time of the `gh issue create` (or local-file-write) call. A sweep that queues findings and files them later would otherwise stamp a commit it never looked at — worse than no stamp, because it reads as authoritative when it isn't.
- Do not make consumers *trust* a fresh stamp and skip verification. #96's diagram claim was wrong the moment it was filed, not through drift — freshness bounds drift, it does not establish correctness. A near-zero commit distance is not a substitute for `[IL-71]`'s existing re-verification instruction.

## Original request

Stamp health-sweep issues with the commit they were verified against

Surface: skills

## Current State

The four health-sweep skills (`/code-health`, `/harness-health`, `/journey-health`, `/docs-health`) file issues whose bodies assert concrete facts about the repo — line numbers, counts, file lists, `## Current State` narratives. Those facts are measured at filing time and then never revalidated. Nothing in the filed body records **when** they were true.

Consumers therefore cannot tell a freshly-filed issue from one whose premise has been invalidated by six weeks of drift. `CLAUDE.md`'s `[IL-71]` already tells an implementer not to trust the body — but that rule makes every consumer pay a full re-derivation regardless of whether the issue is a day old or a quarter old.

## Evidence

Working #90, #91, #96 and #100 in one session, **all four bodies were factually wrong**, in four distinct ways:

| Issue | Claim | Reality |
|---|---|---|
| #91 | 9 `gh` calls missing `--limit` | 7 |
| #91 | Unbounded-execution instruction at `docs-health/SKILL.md:103` | Lives in `docs-health/judge-procedure.md` point 6 |
| #100 | 6 verbatim Template A copies, listed | 1 was a false positive, 2 real copies unlisted, 1 more undiscovered inside the canonical file |
| #96 | Fix the diagram title to say 24 core labels | Would have contradicted the 18 rows printed directly beneath it (see `[IL-77]`) |
| #90 | Split the permission matrix and the gap-detection steps | Both measured net-negative on every consumer path; correctly skipped |

Every line number in all four was stale.

## Deliverable

Add a machine-readable freshness stamp to the filed body — e.g. a `verified-as-of: {sha}` line, or a `Verified against {sha} on {date}` footer — emitted by the shared issue-payload builder so all four skills get it at once. `bin/lib/issues/issue-payload.js` and its `specShapedBody` skeleton are the natural home (all four builders already share it).

Then teach the consuming side to use it: `/dispatch`, `/build`, and `/flow` can compare the stamp against `HEAD` and scale re-derivation effort to the actual drift, rather than treating a one-day-old issue and a one-quarter-old issue identically.

## Acceptance Criteria

- Every issue filed by the four health skills carries the stamp.
- The stamp is the commit the sweep actually read, not the time of the `gh issue create` call.
- At least one consumer reads it and says something actionable about drift (e.g. "premise is 340 commits old — re-derive before implementing").
- `[IL-71]` stays in force; this narrows how much work it implies, it does not replace it.

## Gotchas

- The stamp must reflect the sweep's read commit. A sweep that queues findings and files them later would otherwise stamp a commit it never looked at — worse than no stamp, because it reads as authoritative.
- Do not make consumers *trust* a fresh stamp and skip verification. #96's diagram claim was wrong the moment it was filed, not through drift — freshness bounds drift, it does not establish correctness.

## Original request

Wrap-up reflection (Fresh start lens) after landing #90, #91, #96, #100.

