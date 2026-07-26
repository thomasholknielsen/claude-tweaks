# Design: Fix `--search`-based dedup causing duplicate GitHub issues

## Problem

`/claude-tweaks:tidy --scope=github` routine firings are documented (`tidy/github-routine-procedures.md`'s "Rolling digest" subsection) to find and update one digest issue per repo, in place, across every firing. In production this created a new "Tidy GitHub-Triage Digest" issue on at least three separate firings (#1016, #1079, #1089 — the last two only hours apart, well within the routine's normal 3-hour cron cadence), instead of finding and updating the existing one. All three carried the identical title and the `<!-- tidy-digest-marker -->` the lookup step is supposed to search for.

## Root cause

The digest lookup uses `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body`. `--search` hits GitHub's Search API, which is documented as eventually consistent — unlike the plain `gh issue list` REST endpoint, which reads directly from primary storage. That alone would produce occasional false "not found" results after a fresh create.

It doesn't fully explain the observed pattern by itself, though: the routine's default schedule is `0 */3 * * *` (every 3 hours), and #1079/#1089 landed on the same day, hours apart — well past any plausible transient index-propagation delay. Two contributing factors, both structural rather than transient:

1. **No deterministic code enforces this procedure.** Unlike every comparable "does my issue already exist" problem elsewhere in this codebase (code-health/harness-health/journey-health/docs-health's dedup via `bin/lib/health-core/issue-index.js` + `dedup.js`; `specify`'s record-creation idempotency via `bin/lib/issues/record.js`'s `extractFingerprint`), the digest lookup is pure prose that an LLM freehand-executes at every Routine firing, headless, with nothing to catch a misstep and no way to unit-test that the 3-step "search → confirm marker → conditionally act" judgment call is followed correctly.
2. **`specify/record-creation.md` already solved this exact class of problem and explicitly documents the anti-pattern the digest step fell into**: *"Never fall back to a title search — `gh issue list --search` rides the search index this step deliberately avoids."* Its proven fix: one plain `gh issue list --state all --json ... --limit 500` call (explicit `--limit` override so a large open-issue count can't silently truncate the page before the target issue is reached), then a small pure function that extracts a marker/fingerprint from each issue's body in-process. The digest step never adopted this pattern — it's the one place in the codebase that reinvented issue-dedup from scratch, and reinvented it with the exact anti-pattern a sibling skill already learned to avoid.

Live verification performed against this repo (read-only, no mutations): `--state` does combine correctly with `--search` (ruling out a flag-interaction bug), and `--search` results return full, untruncated bodies (ruling out "the marker isn't in the payload" as the mechanism). The fragility is specifically the eventual-consistency + no-explicit-`--limit` combination, not a JSON-shape or flag-parsing bug.

## Sweep: is this anti-pattern used anywhere else?

Grepped every `gh issue list --search` and `gh issue create` site in `skills/`:

| Site | Uses `--search` for dedup? | Autonomous/unattended? | Disposition |
|---|---|---|---|
| `tidy/github-routine-procedures.md` (digest) | Yes, alone | Yes — Routine firing | **Fix (this design)** |
| `dispatch/SKILL.md` (headless self-report, Preflight failure dedup) | Yes, alongside `--label by:dispatch` | Yes — the `next` form fires from a scheduled Routine, nobody present | **Fix (this design)** — identical anti-pattern, identical unattended-duplicate-accumulation risk, not yet observed only because it hasn't been exercised as much |
| `capture/SKILL.md` (Option 4 backlog-match suggestion) | Yes | No — interactive, `AskUserQuestion`-gated, human sees the result | Out of scope. Worst case is a missed suggestion, not a silent duplicate. |
| `specify/SKILL.md` (backlog-reference free-text match) | Yes | No — interactive `/specify` invocation | Out of scope, same reasoning. |
| `tidy/github-routine-procedures.md` (Pipeline Funnel closed-issue sample) | Yes (`closed:>{date}`) | Yes, but not a dedup/idempotency gate | Out of scope — a stats sample, not an existence check; worst case is a slightly stale funnel number, never a duplicate. |
| `specify/record-creation.md` | No — explicitly avoids it | N/A | Reference implementation this design mirrors. |

## Design

### New shared module: `bin/lib/issues/dedup-lookup.js`

Pure function, no network — same discipline as every existing `bin/lib` module (`bin/lib/health-core/dedup.js`'s own header comment: *"the engine never calls network"*). No precedent exists anywhere in this codebase for a Node helper shelling out to `gh` directly (confirmed by grep); every deterministic helper computes a decision from data the LLM already fetched via Bash, and the LLM performs the actual `gh` mutation. This design keeps that convention rather than breaking it.

```js
function findByMarker(issues, markerPattern) {
  // issues: [{ number, title, body, state, createdAt }] — from a plain
  // `gh issue list --json number,title,body,state,createdAt --limit 500` call
  // markerPattern: string (exact substring) or RegExp, matched against .body
  // Returns { canonical, duplicates } where canonical is the newest match
  // (highest createdAt; ties broken by highest number) and duplicates is
  // every other match, oldest-first. Returns null if no issue matches.
}

module.exports = { findByMarker };
```

"Newest wins" mirrors the judgment already applied manually in production (the tidy sweep that discovered this bug closed #1016 and #1079 as duplicates of #1089, the freshest).

Unit tests (`bin/lib/issues/tests/dedup-lookup.test.js`): no match → null; single match → canonical set, duplicates empty; multiple matches → correct canonical selection regardless of input array order; a body containing the marker as a substring of unrelated text still matches (matches current spec behavior — marker is a literal HTML comment, collision with organic text is not a realistic concern); malformed/missing `body` field on an issue doesn't throw.

### `tidy/github-routine-procedures.md` — Rolling digest

Replace the identity lookup:

- **Before:** `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body`
- **After:** `gh issue list --state open --json number,title,body,createdAt --limit 500`, piped through `findByMarker(issues, '<!-- tidy-digest-marker -->')`.

Behavior:
- `canonical` found → `gh issue edit {canonical.number} --body-file <file>` (unchanged from today).
- No match → `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once (unchanged from today).
- **New:** `duplicates` non-empty → for each, `gh issue close {n} --reason "not planned"` with a comment citing the marker match and the canonical issue's number, then log one `AUTO` line to `decisions.md` in the same format/tier as the existing evidence-tier auto-applies (this is a structurally provable match — same literal marker, not a judgment call — so it fits that precedent's bar for auto-apply-without-staging cleanly). This is the defense-in-depth layer: even if some future firing's lookup fails in a way not yet anticipated, the accumulation this bug report's "Impact" section describes is bounded to one extra firing cycle instead of growing forever.

### `dispatch/SKILL.md` — headless self-report (Preflight failure dedup)

Currently has no body marker at all — it depends entirely on `gh issue list --label by:dispatch --state open --search "{failing-check-name} in:title"`, matching on title text via the same eventually-consistent search index.

- Add a body marker on creation: `<!-- dispatch-preflight-marker: {failing-check-name} -->`.
- Replace the lookup: `gh issue list --label by:dispatch --state open --json number,title,body,createdAt --limit 500`, piped through `findByMarker(issues, `<!-- dispatch-preflight-marker: ${failingCheckName} -->`)`.
- `canonical` found → reference it, file nothing new (unchanged behavior, now reliable).
- No match → create with the new marker embedded in the body.
- **New:** `duplicates` non-empty → same self-heal close-extras behavior as the digest, same rationale.

### Not touched

`capture`/`specify`'s interactive `--search` suggestions, and tidy's Pipeline Funnel sampling query — see the sweep table above for why each is out of scope. Recorded here explicitly so a future reader doesn't wonder whether they were missed.

## Testing

- New unit tests for `dedup-lookup.js` (`node --test bin/lib/issues/tests/`).
- No existing test coverage exercises the prose-driven Routine firing procedures directly (they're markdown, not code) — verification here is design-review + the unit tests on the one piece of logic that is code. `npm test` must stay green (1593 tests passing at baseline in this worktree).

## Out of scope

- Retroactively re-labeling or reconciling the three already-closed duplicate digest issues in the affected downstream repo — already handled manually by the `/tidy` sweep that discovered this bug.
- Any change to the Evidence tier, Notification, or Archival compaction subsections of `github-routine-procedures.md` beyond what the Rolling digest rewrite touches.
- Adding a `tidy-digest`-style label as a lookup fast-path — considered and dropped in favor of reusing the proven marker-matching idiom from `record-creation.md` rather than introducing a second, redundant dedup mechanism.
