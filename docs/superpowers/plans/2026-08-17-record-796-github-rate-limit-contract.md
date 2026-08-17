# Shared GitHub Rate-Limit Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `skills/_shared/github-rate-limit.md` as the fleet's single GitHub rate-limit recognition-and-response contract, and migrate the seven prose consumers that currently carry their own standalone rate-limit clause to cite it instead — recognition/backoff centralizes, each consumer's degradation *outcome* stays exactly as it is today.

**Architecture:** One new `_shared` prose contract (taxonomy table + response policy + fallbacks + burst-shape rules). Seven small text edits — six replace a consumer's existing recognition clause with a citation while preserving its outcome wording verbatim; one (`github-write-transport.md`) and the project-local `gh-api-module-pattern` skill gain new burst-shape-rules citations since they carry no prior rate-limit clause to replace. `docs/skill-graph.md` gains the consumer edges. A new `node --test` conformance suite pins the contract's taxonomy/policy text and every consumer's citation.

**Tech Stack:** Markdown prose only. No runtime code changes. `node --test` for the conformance suite (built-in test runner, no external deps — see `package.json`).

**Spec:** `.claude-tweaks/pipelines/2026-08-17T142841-spec-796/work/796-spec.md`

## Global Constraints

- No change to the claims-registry transport mechanics (that's #787) — only `issue-claims.md`'s recognition prose changes, not its retry-once/TTL outcome.
- No GitHub App / identity change (parked as #794).
- No new `bin/` retry helper and no caching layer — this is a prose contract plus a conformance test suite.
- No behavioral/fault-injection verification — the conformance suite pins text presence only.
- Every consumer's degradation **outcome** wording (`DONE_WITH_CONCERNS`, retry-once-then-TTL, log-and-continue, etc.) must survive every task below byte-for-byte. Only recognition/backoff wording changes.
- A skill reference inside actionable instruction text must use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md cross-reference rule) — the new contract file does not reference any skill in actionable text, so this does not apply to it directly, but keep it in mind if any task's replacement text does.
- `_shared/*.md` files have a practical ~40KB ceiling (#204's precedent). Current sizes measured before this plan: `issue-claims.md` 24,515 bytes, `forge-detection.md` 3,025 bytes, `pr-run-comments.md` 6,826 bytes, `github-write-transport.md` 3,980 bytes — all with large headroom for the small additions below.

---

### Task 1: Create the contract file `skills/_shared/github-rate-limit.md`

**Files:**
- Create: `skills/_shared/github-rate-limit.md`
- Test: `tests/github-rate-limit-conformance.test.js` (written in Task 9 — this task only creates the prose file)

**Interfaces:**
- Consumes: nothing (new file).
- Produces: the anchors every later task's migrated citation points at (`_shared/github-rate-limit.md`) and the taxonomy/policy text Task 9's conformance suite pins verbatim. The three taxonomy row names used downstream: "Secondary / abuse limit", "Primary exhaustion", "Plain 403 (catchall)". The two burst-shape rule anchors used downstream: "at least 1 second between scripted mutative calls" and "single call carrying the full label list".

- [ ] **Step 1: Verify the read-only rate-limit probe the taxonomy cites actually works**

Run (already verified once during plan authoring — re-run to confirm it's still live before writing the file):

```bash
gh api rate_limit -q '.resources.core, .resources.graphql'
```

Expected: two JSON objects each with `limit`, `remaining`, `reset`, `used` keys (confirmed output during planning: `{"limit":5000,"remaining":5000,"reset":1786981812,"used":0}` for core, `{"limit":5000,"remaining":4825,"reset":1786980107,"used":175}` for graphql — exact numbers will differ by the time this task runs, only the shape matters).

- [ ] **Step 2: Write the contract file**

Create `skills/_shared/github-rate-limit.md`:

```markdown
# GitHub Rate-Limit Recognition & Response — Shared Contract

One recognition-and-response playbook for every skill that shells to `gh` or calls the
GitHub API/MCP directly. Classification and backoff live here; each caller keeps its own
degradation *outcome* (skip, `DONE_WITH_CONCERNS`, log-and-continue, retry-once-then-TTL,
etc.) — this file never dictates what a caller does after classifying, only how to classify
and how long to wait before giving up.

## Recognition taxonomy

Classification reads the response **body and headers**, never the status code alone — a
bare 403/429 is ambiguous between all three rows below. Shelling through `gh` (rather than
a raw HTTP client), the error text `gh` prints to stderr carries the secondary-limit message
verbatim, so no `-i`/`--include` header capture is needed to spot it. Distinguishing primary
exhaustion from secondary abuse-detection needs one follow-up read-only probe:
`gh api rate_limit` — `remaining: 0` on the bucket the failed call used means primary
exhaustion; quota still remaining means the failure was a secondary/abuse limit, not
exhaustion.

| Signature | How to recognize | Classification |
|---|---|---|
| Secondary / abuse limit | HTTP 403 whose body/error text contains a "secondary rate limit" message; usually carries `Retry-After`; `gh api rate_limit` shows quota still remaining on the bucket in use | Transient — retry per the response policy below |
| Primary exhaustion | HTTP 403 or 429 whose body/headers show `X-RateLimit-Remaining: 0` on the bucket in use (REST and GraphQL track separate buckets); `gh api rate_limit` confirms `remaining: 0` | Transient — retry per the response policy below, honoring the bucket's `reset` time when known |
| Plain 403 (catchall) | Carries neither the secondary-limit message nor exhaustion evidence — includes any response matching neither positive signature above | Not transient — never retry; surface immediately per the caller's own error contract |

Fail loud beats a blind wait: a response that doesn't positively match one of the two
transient rows is the plain-403 row, by construction, not a default-to-retry.

## Response policy

- Honor a `Retry-After` header when present.
- Otherwise wait 45-90 seconds with uniform jitter before retrying. This number, like every
  number in this section, is documentary authoring guidance — pinned as text for authors to
  follow, never runtime-enforced.
- At most 2 retries, as a *ceiling* — a caller's own contract may undercut it (e.g.
  `_shared/issue-claims.md`'s Section E keeps its existing retry-once-then-TTL outcome
  unchanged; this file only supplies the recognition step feeding into that retry).
- A total wall-clock bound of ~5 minutes for the whole retry sequence. When honoring
  `Retry-After` (or the sum of prior waits) would exceed the bound, skip the remaining
  retries and degrade immediately per the caller's own outcome — never poll open-endedly
  (the anti-pattern named by record-418's background poller).
- Recognition, classification, and backoff are mode-agnostic. Only the logging step is bound
  to a pipeline run: with an active `$PIPELINE_RUN_DIR`, log one `decisions.md` line naming
  the classified signature (`_shared/auto-decision-log.md`'s entry schema), then apply the
  caller's own stage/defer-or-continue outcome. With no run dir (a standalone invocation),
  skip the log and apply the caller's outcome directly.

## Codified fallbacks

- **Contents-API read fallback.** A `gh api .../contents/...` *read* may always fall back to
  reading the identical blob via plain git — `git fetch` then `git show 'ref:path'` —
  independent of any claims-registry-specific machinery. This fallback is unconditional for
  reads; it carries no rate-limit-classification precondition of its own.
- **Protocol swap (primary exhaustion only).** Swapping from REST to GraphQL (or the
  reverse) is legitimate *only* for a primary-exhaustion classification, and only toward
  whichever protocol's bucket still has quota — never as an escape from a secondary/abuse
  limit, since abuse detection is domain-shared across both protocols. A swap is valid only
  for a call with a documented equivalent on the other protocol (label operations, comments,
  issue edits are the documented set); the caller verifies the equivalent exists before
  swapping. No other mid-run transport invention is sanctioned by this file.

## Burst-shape authoring rules

For any skill or `bin/lib/` module issuing a scripted sequence of mutative GitHub calls:

- Leave at least 1 second between scripted mutative calls (GitHub's own documented guidance).
- Coalesce every label change for one target into a single call carrying the full label list
  (e.g. `addLabelsToLabelable` with the complete set), rather than one call per label.
- When a fixed scripted sequence has no data dependencies between its calls, prefer one
  aliased GraphQL request over N sequential mutations.

## Consumers

Each consumer keeps its own degradation *outcome* — only its recognition wording cites this
file.

| Consumer | Outcome this file does not change |
|---|---|
| `skills/_shared/forge-detection.md` | Degrades to `DONE_WITH_CONCERNS` with partial results |
| `skills/_shared/pr-run-comments.md` | Logs to `decisions.md` as a retryable failure and falls back to the issue-only post |
| `skills/tidy/scan-procedures.md` | Skips the rest of the step and notes it in the report |
| `skills/_shared/issue-claims.md` | Retry-once-then-TTL-backstop (Section E's own outcome contract, unchanged) |
| `skills/assess-agent-autonomy/failure-check.md` | Classifies the failure `transient` in retry/merge-eligibility judgment |
| `skills/_shared/github-write-transport.md` | Pacing rules for scripted mutation sequences (this file's burst-shape rules, directly) |
| `.claude/skills/gh-api-module-pattern/SKILL.md` | Burst-shape rules for `bin/lib/` module authors |
```

- [ ] **Step 3: Check the file's byte size**

```bash
wc -c skills/_shared/github-rate-limit.md
```

Expected: well under the ~40KB practical ceiling (the draft above is roughly 5KB).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/github-rate-limit.md
git commit -m "Add shared GitHub rate-limit recognition-and-response contract"
```

---

### Task 2: Migrate `skills/_shared/forge-detection.md`

**Files:**
- Modify: `skills/_shared/forge-detection.md:15`

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation only — no code interface, prose-only.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Replace the standalone recognition clause**

Current line 15 reads exactly:

```
Individual `gh` command failures mid-scan (rate limit, network, transient API errors) degrade to a `DONE_WITH_CONCERNS` status line with whatever partial results exist — never `BLOCKED`.
```

Replace it with:

```
Individual `gh` command failures mid-scan degrade to a `DONE_WITH_CONCERNS` status line with whatever partial results exist — never `BLOCKED`. Recognize and classify a rate-limit failure per `_shared/github-rate-limit.md`; network and other transient API errors degrade the same way without needing that classification.
```

- [ ] **Step 2: Verify the outcome wording survived and the citation landed**

```bash
grep -c "DONE_WITH_CONCERNS" skills/_shared/forge-detection.md
grep -c "_shared/github-rate-limit.md" skills/_shared/forge-detection.md
grep -c "(rate limit, network, transient API errors)" skills/_shared/forge-detection.md
```

Expected: first two commands print `1`; the third prints `0` (the old standalone clause is gone).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/forge-detection.md
git commit -m "forge-detection.md: cite the shared GitHub rate-limit contract"
```

---

### Task 3: Migrate `skills/_shared/pr-run-comments.md`

**Files:**
- Modify: `skills/_shared/pr-run-comments.md:77`

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Replace the standalone recognition clause**

Current line 77 reads exactly:

```
**On failure of either the find or the write** (network, auth, rate limit): log to `decisions.md`
```

(continuing on line 78: `as a retryable failure per the gate section above and fall back to the issue-only post for that call — never silently drop the content.`)

Replace the line-77 fragment so the full sentence becomes:

```
**On failure of either the find or the write** (network, auth, or a rate limit classified per `_shared/github-rate-limit.md`): log to `decisions.md`
as a retryable failure per the gate section above and fall back to the issue-only post for that call — never silently drop the content.
```

- [ ] **Step 2: Verify**

```bash
grep -c "as a retryable failure per the gate section above" skills/_shared/pr-run-comments.md
grep -c "_shared/github-rate-limit.md" skills/_shared/pr-run-comments.md
grep -c "(network, auth, rate limit)" skills/_shared/pr-run-comments.md
```

Expected: first two print `1`; the third prints `0`.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/pr-run-comments.md
git commit -m "pr-run-comments.md: cite the shared GitHub rate-limit contract"
```

---

### Task 4: Migrate `skills/tidy/scan-procedures.md`

**Files:**
- Modify: `skills/tidy/scan-procedures.md` (around line 164, inside the block spanning roughly lines 162-168)

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Replace the standalone recognition clause**

Current text (spans lines 164-168):

```
use the MCP path instead. If the listing call itself fails mid-scan (rate limit, transient
API error) after passing that pre-check, skip the rest of this step and note it in the
report — per `_shared/issue-claims.md`'s Failure posture table ("Blob listing fails in /tidy
→ skip the sweep step, note it in the report"), not silently. See `_shared/issue-claims.md`
for the full protocol.
```

Replace with:

```
use the MCP path instead. If the listing call itself fails mid-scan after passing that
pre-check — recognized and classified per `_shared/github-rate-limit.md` for a rate limit,
or any other transient API error — skip the rest of this step and note it in the report —
per `_shared/issue-claims.md`'s Failure posture table ("Blob listing fails in /tidy → skip
the sweep step, note it in the report"), not silently. See `_shared/issue-claims.md` for the
full protocol.
```

- [ ] **Step 2: Verify**

```bash
grep -c "skip the rest of this step and note it in the report" skills/tidy/scan-procedures.md
grep -c "_shared/github-rate-limit.md" skills/tidy/scan-procedures.md
grep -c "(rate limit, transient" skills/tidy/scan-procedures.md
```

Expected: first two print `1`; the third prints `0`.

- [ ] **Step 3: Commit**

```bash
git add skills/tidy/scan-procedures.md
git commit -m "scan-procedures.md: cite the shared GitHub rate-limit contract"
```

---

### Task 5: Migrate `skills/_shared/issue-claims.md`

**Files:**
- Modify: `skills/_shared/issue-claims.md` (a new sentence immediately after the Failure posture table, before the "Group-claim-all-or-abort exception" paragraph — currently around line 335-337)

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation.
- Produces: nothing new consumed by later tasks.

**Note:** this file's retry-once/TTL wording (lines ~160-162 and the Failure posture table rows at ~327-335, e.g. "Comment fails after blob write succeeds | The blob is the lock — retry the comment once, warn, proceed; claim stands either way" and "Release fails | Log; TTL is the backstop") is Section E's own **outcome** contract and stays completely unchanged — do not edit those rows. Only add a new recognition sentence.

- [ ] **Step 1: Confirm the exact anchor text is unchanged since planning**

```bash
grep -n "Group-claim-all-or-abort exception" skills/_shared/issue-claims.md
```

Expected: one match, immediately after the Failure posture table (the table's last row is `| Any other \`gh\`/MCP failure during claim | Drop that issue, log, continue — partial batch over hung batch |`).

- [ ] **Step 2: Insert the recognition sentence between the table and that paragraph**

Insert this new paragraph immediately after the Failure posture table's closing row and its blank line, and immediately before the `**Group-claim-all-or-abort exception.**` paragraph:

```
**Recognition.** A `gh`/MCP failure in the table above is classified per
`_shared/github-rate-limit.md` before applying that row's outcome — a rate-limit response
follows that file's taxonomy; every other failure class in this table applies exactly as
stated.
```

- [ ] **Step 3: Verify the outcome rows and TTL wording survived verbatim, and the citation landed**

```bash
grep -c "retry the comment once, warn, proceed; claim stands either way" skills/_shared/issue-claims.md
grep -c "Log; TTL is the backstop" skills/_shared/issue-claims.md
grep -c "_shared/github-rate-limit.md" skills/_shared/issue-claims.md
wc -c skills/_shared/issue-claims.md
```

Expected: first three each print `1`; byte count still well under 40KB (was 24,515 bytes before this task).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "issue-claims.md: cite the shared GitHub rate-limit contract for failure recognition"
```

---

### Task 6: Migrate `skills/assess-agent-autonomy/failure-check.md`

**Files:**
- Modify: `skills/assess-agent-autonomy/failure-check.md:22`

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Replace the transient-signatures bullet's rate-limit clause**

Current bullet (line 22, continuing to line ~28) reads:

```
- **Transient signatures**: `gh api` rate-limit (HTTP 429) responses, network timeouts,
  `ECONNREFUSED`, or a test failure the calling agent can independently confirm is pre-existing and
  unrelated to this run's diff (e.g., rerunning the same test against unchanged code on the default
  branch also fails intermittently). Do not classify a test as flaky from memory of a specific test
  name — a test once known to be flaky may since have been fixed, and a genuine regression that
  happens to fail the same assertion must not inherit an old flakiness verdict. Classify
  `transient`.
```

Replace the first clause only (leave everything from "network timeouts" onward unchanged):

```
- **Transient signatures**: a `gh api` rate-limit response classified per
  `_shared/github-rate-limit.md` as secondary/abuse or primary exhaustion (a plain 403 under
  that file's taxonomy is NOT transient), network timeouts,
  `ECONNREFUSED`, or a test failure the calling agent can independently confirm is pre-existing and
  unrelated to this run's diff (e.g., rerunning the same test against unchanged code on the default
  branch also fails intermittently). Do not classify a test as flaky from memory of a specific test
  name — a test once known to be flaky may since have been fixed, and a genuine regression that
  happens to fail the same assertion must not inherit an old flakiness verdict. Classify
  `transient`.
```

- [ ] **Step 2: Verify**

```bash
grep -c "network timeouts" skills/assess-agent-autonomy/failure-check.md
grep -c "_shared/github-rate-limit.md" skills/assess-agent-autonomy/failure-check.md
grep -c "rate-limit (HTTP 429) responses, network timeouts" skills/assess-agent-autonomy/failure-check.md
```

Expected: first two print `1`; the third prints `0` (the old unqualified phrasing is gone).

- [ ] **Step 3: Commit**

```bash
git add skills/assess-agent-autonomy/failure-check.md
git commit -m "failure-check.md: distinguish secondary/primary rate-limit transience per shared contract"
```

---

### Task 7: Add burst-shape citations to `skills/_shared/github-write-transport.md` and `.claude/skills/gh-api-module-pattern/SKILL.md`

Neither file carries a prior rate-limit clause to replace — both are purely additive.

**Files:**
- Modify: `skills/_shared/github-write-transport.md` (append a new section at the end of the file)
- Modify: `.claude/skills/gh-api-module-pattern/SKILL.md` (append a new bullet under `## Batching and failure posture`)

**Interfaces:**
- Consumes: `_shared/github-rate-limit.md` (Task 1) by citation.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Append a new section to `github-write-transport.md`**

Append at the end of the file (after the existing "## The conditional-write pattern (flow's claim lock)" section):

```markdown

## Pacing scripted mutation sequences

Any scripted sequence of mutative calls through either transport follows
`_shared/github-rate-limit.md`'s burst-shape authoring rules: at least 1 second between
scripted mutative calls, one label-change call carrying the full label list rather than one
call per label, and one aliased GraphQL request in place of N sequential mutations when the
sequence has no data dependencies. That file also owns recognizing and classifying a
rate-limit failure encountered on either transport — this file's CRUD mapping and
conditional-write pattern above are unaffected.
```

- [ ] **Step 2: Append a bullet to `gh-api-module-pattern/SKILL.md`'s Batching and failure posture section**

Current section ends with (last bullet):

```
- **Enumerate an operation's full documented error-status set in one sitting.** Adding one status per bug report ships the same misclassification serially: `bin/lib/issues/claim-store.js`'s Contents-API PUT got its 422 create-race branch in `75c8b3b6`, then the symmetric 409 sha-mismatch branch in `4ee0fbcc` — one defect class, found twice, the second time by a review lens. Read the endpoint's documented statuses first (Contents PUT: 404 read-miss, 409 sha-mismatch, 422 create-race) and branch on all of them in the same commit.
```

Append immediately after that bullet, still inside `## Batching and failure posture`:

```
- **Rate-limit recognition and burst pacing.** Classify a `gh api` rate-limit failure per `_shared/github-rate-limit.md`'s taxonomy before deciding whether to retry — a plain 403 under that file's rules is not transient and must not be retried. When a module issues a scripted sequence of mutative calls, follow that file's burst-shape rules: ≥1s between calls, one label-change call carrying the full list, one aliased GraphQL request over N sequential mutations when the sequence has no data dependencies.
```

- [ ] **Step 3: Verify both citations landed**

```bash
grep -c "_shared/github-rate-limit.md" skills/_shared/github-write-transport.md
grep -c "_shared/github-rate-limit.md" .claude/skills/gh-api-module-pattern/SKILL.md
```

Expected: both print `1`.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/github-write-transport.md .claude/skills/gh-api-module-pattern/SKILL.md
git commit -m "github-write-transport.md, gh-api-module-pattern: cite burst-shape pacing rules"
```

---

### Task 8: `docs/skill-graph.md` edges and `docs/plugin-structure.md` enumeration

**Files:**
- Modify: `docs/skill-graph.md` (four new Target rows, one each under `## assess-agent-autonomy`, `## tidy`, `## dispatch`, `## flow`)
- Modify: `docs/plugin-structure.md` (extend the existing `_shared` row's individually-enumerated file list — confirmed in planning that this row already names a curated subset: `observation-plan.md, design-craft.md, feedback-objectives.md, deferral-gate.md, terminal-ux.md`)

**Interfaces:**
- Consumes: nothing new — this task only documents relationships already created in Tasks 1-7.
- Produces: nothing consumed by later tasks (Task 9's conformance suite pins `docs/skill-graph.md` content directly, not through any code interface).

**Placement rationale (decided during planning, do not re-litigate):** `_shared/github-rate-limit.md` has no single owning skill — it's cited by seven files across five different skills/areas. Per skill-graph.md's own convention ("Non-skill targets sit with the skill that depends on them"), add one row per skill whose own file gained a citation in Tasks 2-7: `assess-agent-autonomy` (failure-check.md), `tidy` (scan-procedures.md), `dispatch` (forge-detection.md + github-write-transport.md — both are dispatch-critical infrastructure and dispatch already owns an edge to the sibling `pr-run-comments.md` file at its existing row), and `flow` (issue-claims.md, alongside the existing `_shared/issue-claims.md` row already in that section). `pr-run-comments.md`'s own edge is already owned by `## dispatch` (existing row, line ~170) — do not add a second, separate row for it; its new citation is covered by the dispatch row this task adds. `.claude/skills/gh-api-module-pattern/SKILL.md` is project-local dev tooling for working on this repo, not a shipped `skills/` plugin component — it is out of `skill-graph.md`'s stated scope ("maintainer documentation... not part of the shipped plugin") and gets no edge here; its citation from Task 7 is self-contained.

- [ ] **Step 1: Confirm the anchor line numbers are still accurate**

```bash
grep -n "^## assess-agent-autonomy\|^## tidy\|^## dispatch\|^## flow" docs/skill-graph.md
```

Expected: four matches. Use the line numbers returned (not the ones recorded during planning, in case the file shifted) to find each section's table and insert the new row as the last row of that section's table, immediately before the blank line that precedes the next `## ` heading.

- [ ] **Step 2: Add the row under `## assess-agent-autonomy`**

```
| `_shared/github-rate-limit.md` | `failure-check.md`'s transient-signature classification (Step 2) cites this contract's taxonomy to distinguish a transient rate-limit response (secondary/abuse or primary exhaustion) from a non-transient plain 403, rather than treating every `gh api` rate-limit response as transient. |
```

- [ ] **Step 3: Add the row under `## tidy`**

```
| `_shared/github-rate-limit.md` | `scan-procedures.md`'s claim-listing pre-check cites this contract to recognize and classify a rate-limit failure before applying its existing skip-the-sweep-step outcome. |
```

- [ ] **Step 4: Add the row under `## dispatch`**

```
| `_shared/github-rate-limit.md` | `_shared/forge-detection.md`'s degrade clause and `_shared/github-write-transport.md`'s scripted-mutation pacing both cite this contract — dispatch is the heaviest consumer of both underlying files. Recognition/backoff centralizes here; each citing file's own degradation outcome (`DONE_WITH_CONCERNS`, etc.) is unchanged. |
```

- [ ] **Step 5: Add the row under `## flow`**

```
| `_shared/github-rate-limit.md` | `_shared/issue-claims.md`'s Failure posture table (used at flow's Step 2.8 claim) cites this contract to classify a `gh`/MCP failure before applying the table's existing retry-once/TTL outcome — the outcome itself is unchanged. |
```

- [ ] **Step 6: Extend `docs/plugin-structure.md`'s `_shared` row**

Read the current row (search for `observation-plan.md, design-craft.md, feedback-objectives.md, deferral-gate.md, terminal-ux.md` in the file's `_shared` table row) and append `github-rate-limit.md` to both the file-list column and the description column, following that row's existing one-clause-per-file style, e.g. append to the description: `github-rate-limit.md: the recognition-and-response taxonomy for GitHub rate limiting cited by seven skill-prose consumers across dispatch, tidy, flow, and assess-agent-autonomy (recognition/backoff centralized; each consumer keeps its own degradation outcome).`

- [ ] **Step 7: Verify no `skills/**/SKILL.md` restates the edges**

```bash
grep -rl "github-rate-limit.md" skills/ | grep "SKILL.md$"
```

Expected: this should list only files where the citation is a legitimate inline reference inside a sub-file's prose flow (none of Tasks 2-7 touch a top-level `SKILL.md` file directly, so expect zero or near-zero matches; if any `SKILL.md` file does match, confirm it's citing the contract inline the same way the other consumers do, not restating the taxonomy/policy content itself).

- [ ] **Step 8: Commit**

```bash
git add docs/skill-graph.md docs/plugin-structure.md
git commit -m "docs: add shared GitHub rate-limit contract's consumer edges"
```

---

### Task 9: New conformance test suite

**Files:**
- Create: `tests/github-rate-limit-conformance.test.js`

**Interfaces:**
- Consumes: `skills/_shared/github-rate-limit.md` (Task 1) and all seven migrated consumer files (Tasks 2-7) as plain text reads — no code interfaces, this is a pure prose-pinning test file following the pattern in `tests/deferral-gate-conformance.test.js`.
- Produces: `node --test tests/github-rate-limit-conformance.test.js` passing.

- [ ] **Step 1: Write the test file**

Create `tests/github-rate-limit-conformance.test.js`:

```javascript
// tests/github-rate-limit-conformance.test.js
// Pins skills/_shared/github-rate-limit.md's taxonomy/burst-shape text and each
// of its seven consumers' citation of it. Deliberately does not re-pin any
// consumer's own degradation outcome wording — that stays owned by each
// consumer's existing pin suites (or is untested prose where no suite exists).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const CONTRACT_PATH = 'skills/_shared/github-rate-limit.md';
const CONTRACT = read(CONTRACT_PATH);

// --- the three taxonomy signatures ---

const TAXONOMY_ANCHORS = [
  'Secondary / abuse limit',
  'Primary exhaustion',
  'Plain 403 (catchall)',
];

for (const anchor of TAXONOMY_ANCHORS) {
  test(`github-rate-limit.md states the "${anchor}" taxonomy row`, () => {
    assert.ok(CONTRACT.includes(anchor), anchor);
  });
}

test('github-rate-limit.md names the primary-vs-secondary probe mechanism', () => {
  assert.ok(CONTRACT.includes('gh api rate_limit'));
  assert.ok(CONTRACT.includes('remaining: 0'));
});

// --- response policy ---

test('github-rate-limit.md response policy names Retry-After, a bounded retry count, and the wall-clock bound', () => {
  assert.ok(CONTRACT.includes('Retry-After'));
  assert.ok(CONTRACT.includes('At most 2 retries'));
  assert.ok(CONTRACT.includes('~5 minutes'));
});

test('github-rate-limit.md states the auto-mode log-stage-continue shape', () => {
  assert.ok(CONTRACT.includes('$PIPELINE_RUN_DIR'));
  assert.ok(CONTRACT.includes('decisions.md'));
  assert.ok(CONTRACT.includes('standalone invocation'));
});

// --- codified fallbacks ---

test('github-rate-limit.md codifies the contents-API git read fallback', () => {
  assert.ok(CONTRACT.includes("git show 'ref:path'"));
});

test('github-rate-limit.md restricts the protocol swap to primary exhaustion only', () => {
  assert.ok(CONTRACT.includes('Protocol swap (primary exhaustion only)'));
});

// --- the two burst-shape rules ---

const BURST_SHAPE_ANCHORS = [
  'at least 1 second between scripted mutative calls',
  'single call carrying the full label list',
];

for (const anchor of BURST_SHAPE_ANCHORS) {
  test(`github-rate-limit.md states the burst-shape rule "${anchor}"`, () => {
    assert.ok(CONTRACT.includes(anchor), anchor);
  });
}

// --- each consumer cites the contract (case-insensitive, content-anchored) ---
// Paired with a whitespace-spanning control scan per the spec's Gotchas: a
// literal-string grep can miss a citation that wraps mid-line in prose, so
// each consumer is also checked with all whitespace collapsed.

const CONSUMER_FILES = [
  'skills/_shared/forge-detection.md',
  'skills/_shared/pr-run-comments.md',
  'skills/tidy/scan-procedures.md',
  'skills/_shared/issue-claims.md',
  'skills/assess-agent-autonomy/failure-check.md',
  'skills/_shared/github-write-transport.md',
  '.claude/skills/gh-api-module-pattern/SKILL.md',
];

function collapseWhitespace(s) {
  return s.replace(/\s+/g, ' ');
}

for (const rel of CONSUMER_FILES) {
  test(`${rel} cites _shared/github-rate-limit.md (case-insensitive)`, () => {
    const content = read(rel);
    assert.match(content, /_shared\/github-rate-limit\.md/i, rel);
  });

  test(`${rel} cites _shared/github-rate-limit.md (whitespace-spanning control)`, () => {
    const collapsed = collapseWhitespace(read(rel));
    assert.match(collapsed, /_shared\/github-rate-limit\.md/i, rel);
  });
}

// --- the six skill-prose consumers no longer carry their own standalone
// recognition wording (deliberately excludes github-write-transport.md and
// gh-api-module-pattern/SKILL.md, which never carried a standalone clause to
// begin with — their tasks were purely additive) ---

const RETIRED_CLAUSES = {
  'skills/_shared/forge-detection.md': '(rate limit, network, transient API errors)',
  'skills/_shared/pr-run-comments.md': '(network, auth, rate limit)',
  'skills/tidy/scan-procedures.md': '(rate limit, transient',
  'skills/assess-agent-autonomy/failure-check.md': 'rate-limit (HTTP 429) responses, network timeouts',
};

for (const [rel, retired] of Object.entries(RETIRED_CLAUSES)) {
  test(`${rel} no longer carries its retired standalone rate-limit clause`, () => {
    assert.ok(!read(rel).includes(retired), rel);
  });
}

// --- outcome wording survives verbatim (the sweep's target phrases from the
// spec's AC 2 — this is the "consumers' outcome wording stays owned by each
// consumer" half made concrete, not a second copy of any existing pin) ---

test('forge-detection.md keeps its DONE_WITH_CONCERNS outcome', () => {
  assert.ok(read('skills/_shared/forge-detection.md').includes('DONE_WITH_CONCERNS'));
});

test('pr-run-comments.md keeps its log-to-decisions retryable-failure outcome', () => {
  assert.ok(read('skills/_shared/pr-run-comments.md').includes('as a retryable failure per the gate section above'));
});

test('scan-procedures.md keeps its skip-the-sweep-step outcome', () => {
  assert.ok(read('skills/tidy/scan-procedures.md').includes('skip the rest of this step and note it in the report'));
});

test('issue-claims.md keeps its retry-once and TTL-backstop outcome wording verbatim', () => {
  const content = read('skills/_shared/issue-claims.md');
  assert.ok(content.includes('retry the comment once, warn, proceed; claim stands either way'));
  assert.ok(content.includes('Log; TTL is the backstop'));
});

// --- skill-graph edges exist and no SKILL.md restates the contract ---

test('docs/skill-graph.md carries edges to the new contract from at least four skill sections', () => {
  const graph = read('docs/skill-graph.md');
  const matches = graph.match(/_shared\/github-rate-limit\.md/g) || [];
  assert.ok(matches.length >= 4, `found ${matches.length} edges, expected >= 4`);
});

test('no skills/**/SKILL.md restates the taxonomy row names', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'SKILL.md') {
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('Secondary / abuse limit') && c.includes('Plain 403 (catchall)')) {
          offenders.push(path.relative(REPO_ROOT, p));
        }
      }
    }
  };
  walk(skillsDir);
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: Run the new suite in isolation**

```bash
node --test tests/github-rate-limit-conformance.test.js
```

Expected: all tests pass (this only works after Tasks 1-8 have landed — if run earlier, expect failures on the missing file/citations, which is correct TDD-red for this task run in isolation after the other tasks are already complete).

- [ ] **Step 3: Commit**

```bash
git add tests/github-rate-limit-conformance.test.js
git commit -m "Add conformance suite pinning the shared GitHub rate-limit contract"
```

---

### Task 10: Verify-by-reverting, then full suite

**Files:**
- No new files — this task temporarily mutates and restores `skills/_shared/github-rate-limit.md`, then runs the full suite.

**Interfaces:**
- Consumes: Task 9's suite.
- Produces: the AC 4 proof that the new suite can actually go red, and a green `npm test`.

- [ ] **Step 1: Revert one pinned element**

```bash
sed -i.bak "s/| Plain 403 (catchall) |.*|.*|/| REMOVED-FOR-VERIFICATION |/" skills/_shared/github-rate-limit.md
```

- [ ] **Step 2: Re-run the new suite and confirm it goes red**

```bash
node --test tests/github-rate-limit-conformance.test.js
```

Expected: at least the `github-rate-limit.md states the "Plain 403 (catchall)" taxonomy row` test FAILS.

- [ ] **Step 3: Restore the file**

```bash
mv skills/_shared/github-rate-limit.md.bak skills/_shared/github-rate-limit.md
```

- [ ] **Step 4: Re-run the new suite and confirm green again**

```bash
node --test tests/github-rate-limit-conformance.test.js
```

Expected: all tests pass again.

- [ ] **Step 5: Merge upstream before the full-suite check**

Per the spec's Gotchas: #787 and #780 both edit `skills/_shared/issue-claims.md` concurrently (different sections — #787 the transport prose, #780 the lock steps 1-2). Merge the integration branch immediately before the final whole-branch review to catch any conflict early:

```bash
git fetch origin main
```

```bash
git merge origin/main
```

Resolve any conflict per `_shared/git-discipline.md`'s Merge conflict resolution if one occurs (most likely in `issue-claims.md` if #787/#780 landed first) — preserve this plan's new "Recognition." paragraph (Task 5) alongside whatever else merged in.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: 0 failures. If the failure count varies run-to-run on identical code, re-run only the affected file(s) in isolation before concluding anything is broken (CLAUDE.md's stated machine-load caveat) — do not diagnose from a single noisy run.

- [ ] **Step 7: Commit any merge or fixups**

```bash
git add -A
git commit -m "Merge origin/main and confirm full suite green for the rate-limit contract"
```

(Skip this commit if the merge was a fast-forward with nothing to commit and no fixups were needed.)

---

## Self-Review

**Spec coverage:**
- AC 1 (contract file exists with all three signatures + both burst rules + response policy naming Retry-After/bounded-retry/log-stage-continue) → Task 1.
- AC 2 (seven consumers cite the file case-insensitively + content-anchored, standalone wording removed from the six, outcomes verbatim) → Tasks 2-7 (edits), Task 9 (pins).
- AC 3 (skill-graph.md edges, no SKILL.md restates) → Task 8, verified by Task 9's own suite.
- AC 4 (suite fails when reverted, `npm test` green) → Task 10.
- Deliverables' `docs/plugin-structure.md` conditional update → Task 8 Step 6 (confirmed during planning that the file's `_shared` row does enumerate individual files, so this update applies).

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate handling"/"similar to Task N" patterns anywhere above — every task's replacement text is the literal content to write, every grep command is a real, runnable command.

**Type/name consistency:** the contract file's three taxonomy row names ("Secondary / abuse limit", "Primary exhaustion", "Plain 403 (catchall)") and the two burst-shape rule anchor phrases are used identically in Task 1 (creation) and Task 9 (pin tests) — no drift between the two.

**Verbatim-command check (writing-plans authoring discipline):** `gh api rate_limit -q '.resources.core, .resources.graphql'` was run once, read-only, against the live repo during planning (Task 1 Step 1 records its actual output). No other task dictates a runnable command whose content is invented rather than copied from a live read (the `sed`/`mv`/`git`/`node --test`/`grep` commands in Tasks 2-10 are all standard, already-idiomatic-in-this-repo shapes, not novel API calls).

**Degrade-clause convention check:** the new contract's degrade language ("with no run dir... skip the log and apply the caller's outcome directly", "gh absent" is not introduced by this contract at all — recognition happens after a `gh`/MCP call already returned a response, so there's no new "when gh is unavailable" clause being authored here to check against existing convention.

**Blocking-verification-downgrade check:** none of these tasks scope down a live-data verification into a non-live one — Task 1's Step 1 stays a live, read-only `gh api rate_limit` call.

**Deictic-reference re-resolution check:** N/A — no task reorders existing paragraphs relative to their cross-references; every edit is a same-position replacement or a pure append.
