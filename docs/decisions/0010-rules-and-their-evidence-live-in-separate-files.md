# 0010. Rules and their evidence live in separate files

- **Status:** accepted
- **Date:** 2026-08-03
- **Context:** Conversation-based context-budget work (#95, #80, #102) and the follow-on rule-expiry pass

## Context

`CLAUDE.md` had grown to 94 KB, of which the `## Don'ts` section alone was 53,939 B — 57% of the
file, across 87 bullets averaging 620 B. Forty-two of those bullets carried explicit post-mortem
narrative ("This bit…", "Caught only…", "survived N reviews", "Cost the rollout 5 fix rounds").

The file's own house style already prescribed the opposite shape: the ten short bullets present
averaged ~140 B and were exactly the rule-plus-brief-why form the maintainer's stated preference
calls for. Seventy-seven of 87 violated it anyway, accumulating over roughly eight weeks. **The norm
existed and lost** — which rules out "restate the norm" as the fix.

The cost is not paid per session. Every Task-dispatched subagent inherits the full `CLAUDE.md` in its
system prompt, so a 13-agent `/review` fan-out paid the whole file thirteen times — measured at
ratios between 13:1 and 38:1 against the prompts those agents were actually given. A Fast-tier agent
grepping `git worktree list` was carrying ~13.5k tokens of incident narrative about unrelated builds.

The narratives were not worthless — their specificity is what makes an otherwise arbitrary-looking
rule credible, and what lets a future reader judge whether it still earns its place. Deleting them
would have been cheaper and worse.

## Decision

A rule and the evidence for that rule live in different files, with different budgets.

- **`CLAUDE.md`** holds rules only: one sentence of rule, one clause of why. It is always-loaded and
  billed per dispatched agent, so it is budgeted accordingly.
- **`docs/incident-log.md`** holds the full post-mortem behind any rule that has one — which build it
  bit, how it was caught, what it cost — kept **verbatim**, tagged `[IL-nn]`, and referenced from the
  rule. It is never auto-loaded, so its length costs nothing until someone deliberately reads it.

Three mechanisms keep the split from collapsing back:

1. **Ordering.** The incident account is written *first*, then compressed to the rule
   (`reflect/full-mode.md`, `wrap-up/claude-md-curation.md`). Writing the rule first pads it — the
   incident is vivid, every detail feels load-bearing, and the justification leaks into the
   always-loaded file a clause at a time.
2. **An exit.** `/claude-tweaks:harness-health`'s rule-expiry check proposes removing rules whose
   hazard can no longer occur, via the `intent: "remove"` finding shape. Before this, nothing in the
   system ever proposed removing a rule; the section could only grow.
3. **Tag stability.** Allocate the next free `IL-nn`; never renumber. Gaps are fine.

The incident-log entry survives its rule's removal. The narrative is the evidence for why the rule
once existed; it costs nothing unread, and a rule removed in error is re-derived from it.

## Consequences

**Accepted, superseded.** `## Don'ts` initially landed at ~20 KB within `CLAUDE.md` against the
originating record's ~15 KB target, trading directly against that record's other criterion — every
rule "still present and enforceable as a rule" — since reaching 15 KB across 90 rules means ~167 B
each, at which point the specific rules (the `--since` boundary, the grep-anchoring ones) stop being
actionable. #80 tracked this and closed as completed on 2026-08-04. `## Don'ts` has since been
extracted entirely out of `CLAUDE.md` into `docs/donts.md` (now ~38 KB); `CLAUDE.md` retains only a
pointer line.

**Accepted.** Rule expiry is scoped to `assetType: claude-md`, because CLAUDE.md findings never
auto-apply and that containment is what makes an empty `newString` safe. Rules under
`.claude/rules/` and skill files therefore have no expiry path yet; widening it requires auditing
every auto-apply consumer (`/init` Phase 6, `/wrap-up`'s Skills curation row) first.

**Risk.** The incident log grows without bound. That is acceptable while it stays un-auto-loaded —
but if anything ever adds it to a always-loaded path or inlines it into a dispatch prompt, the
original problem returns with an extra indirection. It must stay read-on-demand.
