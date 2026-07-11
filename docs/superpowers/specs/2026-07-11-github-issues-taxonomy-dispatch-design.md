# GitHub Issues Integration — Taxonomy, Dashboard & Dispatch Redesign

**Date:** 2026-07-11
**Status:** design
**Follows:** [`docs/github-issues-integration-review.md`](../../github-issues-integration-review.md) (the architecture review whose bug-fix pass this design builds on) and [`docs/diagrams/github-issues-lifecycle.html`](../../diagrams/github-issues-lifecycle.html)

## Context

The review's bug-fix pass (25 findings, all fixed) hardened the *existing* mechanics of the GitHub-issues integration: the claim system, the retry/downgrade rules, label-length safety. This design is the follow-on — not a reaction to a specific bug, but a proactive pass to simplify, standardize, and improve the human-AI collaboration ergonomics of the same subsystem while the review's findings are still fresh.

The plugin is distributed via the marketplace but adoption is early enough that **a clean breaking change is acceptable** — this design does not include a migration path for existing installs' open issues or labels. A major version bump and a documented "re-bootstrap your labels" note is sufficient.

One question was explicitly scoped out during brainstorming: whether to collapse the three-layer claim mechanism (git ref lock / comment-marker mirror / `status:in-progress` label). Investigation concluded each layer earns its place — the ref is the only atomic primitive GitHub offers, the comment is the audit trail visible on the issue page, the label is what makes claim state filterable/visible in GitHub's list and board views. None of the three is a copy of another; collapsing any of them loses a real capability. **No changes to `bin/lib/issues/claims.js` or the ref/comment/label mechanics in this design.**

## Goals

- Make the label taxonomy self-explanatory: an authorization grant and a bot-managed operational marker should not look like points on the same dial.
- Close the label-description-length bug class structurally (one shared bootstrap path with a built-in check), not by patching each instance as it's found.
- Reduce label sprawl where the same information already exists elsewhere (issue body) and nothing reads it back off the label.
- Give every GitHub-derived dashboard number exactly one owner, so a bug in the count can only exist in one place.
- Reduce how many times a human is interrupted by headless dispatch, and reduce wall-clock time for firings with several eligible issues — without fighting git's single-working-tree constraint.

## Non-goals

- No changes to the claim ref/comment/label mechanism (see Context).
- No migration tooling for existing installs.
- No changes to routine cadence or the cron-only execution model (no event-driven triggers are available on the platform this plugin targets).

---

## 1. Label taxonomy: `tier:*` / `status:*` split

**Problem.** `status:*` today mixes two orthogonal concerns under one prefix: authorization tier (`needs-review` / `approved` / `fast-track` — mutually exclusive, human-granted only, revoked but never granted by headless code) and operational state (`in-progress`, `blocked` — bot-managed, can coexist with any tier or none). A reader sees `status:blocked` next to `status:approved` and reasonably assumes they're mutually exclusive positions in one state machine; they're not — they're two different axes that happen to share a prefix.

**Design.**

| Old label | New label | Axis |
|---|---|---|
| `status:needs-review` | `tier:needs-review` | Authorization (human-granted) |
| `status:approved` | `tier:approved` | Authorization (human-granted) |
| `status:fast-track` | `tier:fast-track` | Authorization (human-granted) |
| `status:in-progress` | `status:in-progress` (unchanged) | Operational (bot-managed) |
| `status:blocked` | `status:blocked` (unchanged) | Operational (bot-managed) |

Mnemonic: **`tier` is a grant; `status` is the bot's current read of what's happening.** All existing rules carry over unchanged under the new names — `tier:*` still only ever gets *granted* by bare (interactive) `/claude-tweaks:triage`, `dispatch` mode still only downgrades/strips, the retry-ceiling and fast-track-downgrade rules are unaffected. This is a rename, not a behavior change.

**Files touched:** grepped for every literal `status:needs-review`/`status:approved`/`status:fast-track` occurrence to confirm the full set: `triage/SKILL.md`, `triage/routine-template.yml`, `issue-claims.md`, `wrap-up/cleanup-procedures.md`, `wrap-up/review-console.md`, `flow/multispec-review-console.md`, `help/status-scan.md`, `github-pr-scan.md`. (`tidy/scan-procedures.md` and `README.md` reference the taxonomy narratively — check during implementation, not confirmed by the grep.) `status:in-progress`/`status:blocked` strings are unaffected — search-and-verify, not rewrite.

### Shared label-bootstrap helper

**Problem.** Every skill hand-rolls its own `gh label list --search "X" ... || gh label create X --description "..."` snippet. This is why the 100-char cap broke `status:in-progress` once and two `code-health:*` criterion labels a second time (before this review caught it) — there's no single place a length check could live. It's also why `parked` and the code-health/harness-health base+tier labels ship with GitHub's blank auto-description: the pattern is a copy-pasted convention, not an enforced contract.

**Design.** New module `bin/lib/issues/labels.js`:

```js
// Pure: validate + shape a label bootstrap payload. Throws on GitHub's 100-char
// description cap so a too-long description fails at construction time, not
// silently as a 422 on first `gh label create`.
function ensureLabelPayload(name, description) {
  if (typeof description !== 'string' || description.length > 100) {
    throw new Error(`label "${name}": description must be a string <= 100 chars (got ${description ? description.length : 'undefined'})`);
  }
  return { name, description };
}

module.exports = { ensureLabelPayload };
```

Every skill's bootstrap snippet becomes:

```bash
node -e "const {ensureLabelPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/labels.js');
  const p=ensureLabelPayload('$NAME','$DESCRIPTION');
  console.log(JSON.stringify(p))" > /tmp/label-payload.json
gh label list --search "$NAME" --json name -q '.[].name' | grep -qx "$NAME" || \
  gh label create "$NAME" --description "$DESCRIPTION"
```

(The `ensureLabelPayload` call is what throws pre-flight if the description is too long; the existing search-then-create shape is unchanged otherwise — this is deliberately not a bigger abstraction than the bug requires.)

**Follow-on fixes this enables in the same pass** (all currently-missing descriptions get real ones): `parked`, `code-health`, `code-health:risk-*`, `code-health:effort-*`, `harness-health`, `harness-health:risk-*`, `harness-health:effort-*`.

**Test:** `bin/lib/issues/tests/labels.test.js` — asserts `ensureLabelPayload` throws over 100 chars, passes at exactly 100, and every real description string used across the skill tree (a table of the ~15 labels this system bootstraps) passes.

---

## 2. Code-health: drop per-criterion labels

**Problem.** `bin/lib/code-health/issue-payload.js:70` adds `code-health:${finding.criterion}` (e.g. `code-health:architecture-depth`) to every filed issue's labels. This is the label class that hit the 100-char cap. Investigation confirmed nothing reads this label back: `fingerprint.js`'s v2 hashing takes `criterion` from the in-memory finding object (never parses a label), `validate-finding.js` and `dedup.js` work the same way, and `criteria.js` only defines the catalog, it doesn't query issues by label. The criterion is *already* in the issue body (`issue-payload.js:47`: `**Criterion:** {finding.criterion} | ...`).

**Design.** Pure subtraction:
- `issue-payload.js:70` — remove `` `code-health:${finding.criterion}` `` from the labels array. Keeps `code-health`, `code-health:risk-${finding.risk}`, `code-health:effort-${finding.effort}`.
- `criteria.js` — remove the per-criterion label-description strings (the ones that motivated the length-shortening fix in the prior bug-fix pass); the char-cap regression test added there moves to `labels.js`'s test file (§1) since it's now a generic property of the shared helper, not something specific to code-health's criteria list.
- `skills/code-health/SKILL.md` Step 9 (label bootstrap) — drop the per-criterion bootstrap loop entirely; only `code-health`, `code-health:risk-*`, `code-health:effort-*` get bootstrapped (via the §1 helper).
- Harness-health's parallel `issue-payload.js`-equivalent gets the same treatment if it independently adds a per-finding-type label (verify during implementation; the review's low-severity list didn't flag harness-health as having this specific pattern, but check for symmetry).

**Risk-tier and effort-tier labels are unchanged** — they're a genuine GitHub-UI filter axis ("show me everything high-risk") in a way that exact criterion isn't; `tier.js`'s recommendation logic already reads only these two.

---

## 3. Dashboard consolidation: one owner per number

**Problem.** Confirmed during design (not just the review's description): `skills/help/status-scan.md` Stage 4.6 hand-writes its own query for the "pending authorization" count — independent of `skills/_shared/github-pr-scan.md` item 7, which exists specifically to be the shared single-source-of-truth `/tidy` already consumes. Stage 4.6's version also has a live bug: its untiered count doesn't exclude `status:blocked` issues (a blocked issue carries none of the three tier labels, so it satisfies "untiered"), so the same issue shows up in *both* the "Pending authorization" line and the "Blocked" line on one dashboard, presented as disjoint counts.

**Design.** Add a `triage-queue` scope to `github-pr-scan.md`, alongside the existing `current-pr` and `repo-wide` scopes:

```
## Scope: `triage-queue` (consumed by /help Stage 4.6)

1. Pending authorization — code-health + harness-health issues carrying none
   of tier:needs-review / tier:approved / tier:fast-track / status:blocked.
   (Excluding status:blocked is the fix: a blocked issue is not "pending your
   initial decision," it already had one and failed out.)
2. Blocked — status:blocked count.
3. Auto-merged this week — [fast-lane]-tagged commits on the default branch,
   last 7 days (unchanged query, moved here for ownership).
```

`status-scan.md` Stage 4.6 shrinks to: run the Detection Ladder, inline this new scope section (same pattern Stage 4.5 already uses for `current-pr`), render the three dashboard lines from its output. No independent `gh issue list`/`jq` logic left in `status-scan.md`.

---

## 4. Grouped, capped-parallel dispatch

**Problem.** `triage/SKILL.md`'s dispatch Step 3 today is sequential prose ("For each successfully claimed issue, invoke `/flow #{issue}`") — no parallelism, and a human gets a separate Review Console interruption per issue, potentially across several routine firings. The claim system's entire purpose is making issues independently safe to work concurrently, so this is unclaimed value — but a naive "just parallelize everything" design would be wrong: issues whose changes touch the same files should *not* run in isolated parallel worktrees (their commits would diverge from each other rather than build on top of each other), and unrelated issues bundled sequentially into one shared worktree just serializes wall-clock time for no benefit and lets one unrelated issue's failure block the others (without `keep-going`, a shared-worktree multi-spec run halts subsequent specs after a HARD-GATE).

**Design — grouping.** Reuse the "Implicit dependency check" (Key-Files overlap) that `specify/SKILL.md` and `help/status-scan.md` Stage 3 each currently describe independently in prose (a third duplication of the same logic, found during this design). Extract it once:

```js
// bin/lib/issues/grouping.js
// Pure: partition a batch of {id, keyFiles: string[]} items into groups whose
// keyFiles overlap (union-find over shared paths). Items with no overlap to
// anything else are singleton groups.
function groupByFileOverlap(items) { /* ... */ }

module.exports = { groupByFileOverlap };
```

`specify/SKILL.md` and `status-scan.md` Stage 3 are updated to call this instead of restating the algorithm in prose — a standardization win independent of dispatch.

Dispatch Step 2 (after claiming) extracts each claimed issue's Key Files (from the issue body / linked spec, same source `specify` already reads) and calls `groupByFileOverlap`. Groups with 2+ issues become one multi-spec `/flow #A #B #C` invocation — the *existing* shared-worktree, sequential multi-spec infrastructure, unchanged, because that's exactly the right tool for related work. Singleton groups become their own isolated `/flow #N` invocation.

**Design — concurrency.** Each group (bundle or singleton) is dispatched as one Task agent with its own worktree, up to a new policy flag `triage-dispatch-max-concurrent` (default `3`, same table as `triage-retry-ceiling` / `triage-fast-track-max-lines` / `triage-fast-track-max-files`). Remaining groups queue behind the cap.

**Design — consolidation.** A new outer console, one level above `multispec-review-console.md`'s per-invocation console. Nothing in this codebase imposes a hard per-firing timeout (existing parallel-Task dispatch sites — `/help`'s Stage 1-7, `/tidy`'s scoped scan — already wait for all dispatched agents regardless of duration), so the concurrency cap is purely a "how many run at once" throttle, not a cutoff: a firing claims all eligible issues up front, groups them, then works through the queue at up to `triage-dispatch-max-concurrent` at a time until every group has completed, however long that takes. Once every group is done, dispatch reads each group's manifest/`decisions.md` (a bundle's is already a multi-spec manifest per the existing format; a singleton's is the degenerate one-item case) and renders **one** consolidated Review Console for the whole firing — reusing `multispec-review-console.md`'s table format and Hard Requirements (every entry surfaced, `Spec`/`Issue` column mandatory, sort order) rather than inventing a new rendering contract.

The auto-merge gate (§ existing "Auto-merge gate (fast-track only)" in `triage/SKILL.md`) stays evaluated **per issue**, not per group — a bundle containing one `tier:fast-track`-eligible issue and one that isn't only auto-merges the eligible one; both still surface at the same consolidated console (the eligible one as an FYI row, the other as a normal pending-approval row).

**Explicitly deferred to implementation, not resolved here:** whether risk-tier should be a secondary bundling signal in addition to file overlap (e.g. never bundling a high-risk issue with anything, even with file overlap). Flag for the plan/implementation phase rather than blocking this design on it.

---

## Summary of file-level impact

| File | Change |
|---|---|
| `bin/lib/issues/labels.js` (new) | `ensureLabelPayload` + tests |
| `bin/lib/issues/grouping.js` (new) | `groupByFileOverlap` + tests |
| `bin/lib/code-health/issue-payload.js` | Remove per-criterion label |
| `bin/lib/code-health/criteria.js` | Remove per-criterion label descriptions; char-cap test moves to `labels.js` |
| `skills/triage/SKILL.md` | `tier:*` rename throughout; Step 2/3 grouped+parallel dispatch; new `triage-dispatch-max-concurrent` config row |
| `skills/triage/routine-template.yml` | `tier:*` rename in the routine's `notes:` prose |
| `skills/_shared/issue-claims.md` | `tier:*` rename in the Dispatch authorization section |
| `skills/wrap-up/cleanup-procedures.md`, `skills/wrap-up/review-console.md`, `skills/flow/multispec-review-console.md` | `tier:*` rename in tier-label-removal steps |
| `skills/_shared/github-pr-scan.md` | `tier:*` rename in item 7's tier-label check (§3 already adds the new `triage-queue` scope here) |
| `skills/help/status-scan.md` | Stage 4.6 consumes the new scope instead of its own query |
| `skills/tidy/scan-procedures.md`, `README.md` | `tier:*` rename — confirm exact occurrences during implementation (not fully enumerated by the grep in §1) |
| `skills/specify/SKILL.md`, `skills/help/status-scan.md` (Stage 3) | Call `groupByFileOverlap` instead of restating the algorithm |
| `skills/code-health/SKILL.md` | Step 9 drops per-criterion label bootstrap; all bootstrap snippets call the §1 helper |
| `README.md` | Label taxonomy reference updated |

## Testing

- `bin/lib/issues/tests/labels.test.js` — new (§1)
- `bin/lib/issues/tests/grouping.test.js` — new (§4)
- Existing `bin/lib/code-health/tests/criteria.test.js`'s char-cap test relocates to `labels.test.js`
- Full `npm test` run with zero new failures beyond the pre-existing flaky `tests/statusline.test.js` timing test
