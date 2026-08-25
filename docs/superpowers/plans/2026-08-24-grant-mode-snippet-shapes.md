# grant-mode.md self-sufficient snippet shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin/skills/backlog/grant-mode.md`'s remaining hand-composed `node -e` snippets (Step 0.5's `classifyWatchedRecord` call, Phase C's `evaluateGrantGate` call) self-sufficient — state each snippet's exact input/output shape inline, using real runnable code instead of ellipsis/pseudocode placeholders — so a fresh session executing this skill never needs to `Read` `bin/lib/issues/grant-gate.js` or `bin/lib/issues/merge-lane-breaker.js` to know what to pass.

**Architecture:** #1384 already closed the CLI-consolidation half of this record's Deliverables — Step 1 + Step 2 Phase A now run through `bin/backlog-grant-gate.js`, one invocation, with its output envelope shape already documented in the skill prose (`out.candidates`/`out.trustRows`/`out.phaseA`/`out.eligible`/`out.refused`/`out.shortcut`). Two snippets remain genuinely hand-composed against module internals with no inline shape statement:

1. **Step 0.5** (merge-lane circuit breaker sweep) — `classifyWatchedRecord(entry, gitLog, now, windowDays)` is called with `entry`/`gitLog` left as bare comments ("// entry = ...", "// gitLog: ... from the already-fetched integration-branch log") rather than real variable-building code, and the function's own return shape (`{action: 'trip'|'prune'|'update', ...}`) is never restated in the skill.
2. **Step 2 Phase C** — `evaluateGrantGate({record, policy, trustVerdicts, grantCheck})` is called with the comment `// ... same record/policy/trustVerdicts as Phase A, plus:` standing in for the actual reconstruction of `record` (from the Phase A candidate JSON already written to `$ST_BACKLOG_GRANT_CANDIDATES`) and `trustVerdicts` (a `Map` rebuilt from `$ST_BACKLOG_GRANT_TRUST_ROWS`'s `[key, row]` pairs). `keyFiles` is left as a bare `/* parsed from the record body's '### Key Files' list */` comment with no named function.

This plan replaces both snippets with real, runnable code plus a one-line shape comment sourced verbatim from each function's own header comment (`grant-gate.js:32-50`, `merge-lane-breaker.js`'s `classifyWatchedRecord`/`readWatched`/`writeWatched`/`readBreakerState`/`writeBreakerState` header comments) — copied inline, not paraphrased, so the shape stated in the skill can never silently drift from the shape the module actually implements. `keyFiles` is wired to the existing `extractKeyFiles(issue)` helper (`bin/lib/issues/grouping.js`) by name, replacing the placeholder comment.

No behavior change to any `.js` module — this is a prose-only edit to `plugin/skills/backlog/grant-mode.md`. `plugin/skills/_shared/trust-table.md` is at 31KB of the 40KB skill-file ceiling (77% full) — this plan does not touch it; all additions land in `grant-mode.md` (22.5KB, ample headroom).

**Tech Stack:** Markdown skill-prose edit only. Verification is `npm test` (the skill-prose conformance suites in `tests/`) plus a manual re-read confirming every `node -e` snippet in the touched sections is realistic (matches the actual exported function signatures) and self-contained.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T193427-record-1385/work/1385-spec.md` (record #1385) — the plan argues from this spec; the executor reads both.

## Global Constraints

- Do not restate a shape from memory — every shape comment added must be copied verbatim (or trivially reformatted, e.g. collapsing multi-line JSDoc into one comment block) from the cited source file's own existing header-comment documentation, which is already accurate and complete. This plan adds no new module code and changes no function signature.
- Preserve every existing behavioral instruction in Step 0.5 and Phase C (gate order, `readBreakerState` freshness note, the `--keep-going` interaction, etc.) — only the snippet bodies and their preceding comments change.
- Do not touch Step 1 + Step 2 Phase A (already fixed by #1384) or Step 3/4/5 (no raw module calls needing shape documentation — Step 4's `writeWatched` call already shows a concrete, self-explanatory lambda).
- Keep `grant-mode.md` under the 40KB skill-file ceiling — measure `wc -c` after editing and confirm headroom remains.
- No new files. No test files (this is a prose-only skill file, not covered by `tests/bin-lib/*` unit suites) — `tests/` conformance suites that pin `grant-mode.md`'s prose (search `tests/` for any fixture referencing this file) must still pass after the edit; check for one and re-read/update it if it byte-pins the changed sections.

---

### Task 1: Wire real code + inline shapes into Step 0.5's `classifyWatchedRecord` call

**Files:**
- Modify: `plugin/skills/backlog/grant-mode.md` (Step 0.5 section, the `node -e` block calling `classifyWatchedRecord`)

**Interfaces:**
- Consumes (read-only, for citing the shape — no edits to these files): `plugin/bin/lib/issues/merge-lane-breaker.js`'s `classifyWatchedRecord` header comment (entry/gitLog/now/windowDays params, three-shape return value), `readWatched`/`writeWatched` header comments.
- Produces: an updated `node -e` block in `grant-mode.md` that actually constructs `entry` (from the per-`{number}` loop's already-fetched `gh issue view` result plus the `watched.json` map entry) and `gitLog` (from the already-fetched integration-branch log, per `_shared/trust-table.md`'s Fetch section this step already cites) rather than leaving them as bare comments.

- [ ] **Step 1: Read the current Step 0.5 section verbatim**

Read `plugin/skills/backlog/grant-mode.md` lines ~52-124 (the whole Step 0.5 section) in full immediately before editing, to confirm line numbers and exact surrounding text haven't drifted since this plan was written (materialize/plan-authoring-checks.md's deictic-reference re-resolution rule).

- [ ] **Step 2: Replace the classify snippet**

Replace the `node -e` block currently reading:

```bash
node -e "
  const { classifyWatchedRecord } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  // entry = { number, grantedAt, lastKnownState: watched[number].lastKnownState, state, closedAt, labels }
  // gitLog: [{ sha, message }] from the already-fetched integration-branch log
  const result = classifyWatchedRecord(entry, gitLog, Date.now(), windowDays);
  console.log(JSON.stringify(result));
"
```

with a version that states the full shape inline (copied from the source header comment) and shows real construction of `entry`/`gitLog` from data this step already has in scope (the per-number `gh issue view` fetch from bullet 1 above it, the `watched.json` map read at the top of Step 0.5, and the git-log fetch from bullet 2):

```bash
# classifyWatchedRecord(entry, gitLog, now, windowDays) — bin/lib/issues/merge-lane-breaker.js
#   entry: { number, grantedAt, lastKnownState: 'OPEN'|'CLOSED'|undefined,
#            state: 'OPEN'|'CLOSED' (this firing's fresh fetch), closedAt: ISO8601|null,
#            labels: string[], closingCommitShas?: string[] }
#   gitLog: [{ sha, message }] — trust.js's parseGitLog shape (already fetched above)
#   now: epoch ms.  windowDays: resolved trust-revert-window-days policy value.
#   Returns exactly one of:
#     { action: 'trip', reason: 'demo:changes-requested' | 'revert' | 'reopened' }
#     { action: 'prune' }
#     { action: 'update', newState: 'OPEN' | 'CLOSED' }
node -e "
  const { classifyWatchedRecord } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  const watched = require('$ST_BACKLOG_GRANT_WATCHED');
  const fresh = require('$ST_BACKLOG_GRANT_FRESH_STATE');   // this number's own gh issue view --json state,closedAt,labels result
  const entry = {
    number: $NUMBER,
    grantedAt: watched['$NUMBER'].grantedAt,
    lastKnownState: watched['$NUMBER'].lastKnownState,
    state: fresh.state,
    closedAt: fresh.closedAt,
    labels: fresh.labels.map((l) => (typeof l === 'string' ? l : l.name)),
  };
  const gitLog = require('$ST_BACKLOG_GRANT_GITLOG');   // [{sha, message}] from bullet 2's fetch, parsed once per Step 0.5 run
  const result = classifyWatchedRecord(entry, gitLog, Date.now(), $WINDOW_DAYS);
  console.log(JSON.stringify(result));
"
```

Add one sentence directly above the new block noting that `$ST_BACKLOG_GRANT_FRESH_STATE` and `$ST_BACKLOG_GRANT_GITLOG` are session-tmp paths the loop writes once per `{number}`/once per Step 0.5 run respectively (`sessionTmpPath`, same convention as every other `ST_*` variable already in this file) — bullet 1 and bullet 2 above this snippet already perform those fetches; this task only needs to name where their output lands so the `require()` calls above are real, not aspirational.

- [ ] **Step 3: Verify byte count and re-read the full section**

`wc -c plugin/skills/backlog/grant-mode.md` — confirm still under 40000. Re-read the edited Step 0.5 section top to bottom to confirm it reads coherently as one continuous procedure (no orphaned references to variables that no longer exist).

---

### Task 2: Wire real code + inline shapes into Step 2 Phase C's `evaluateGrantGate` call

**Files:**
- Modify: `plugin/skills/backlog/grant-mode.md` (Step 2 Phase C section)

**Interfaces:**
- Consumes (read-only, for citing the shape): `plugin/bin/lib/issues/grant-gate.js:32-50`'s header comment (the exact `record`/`policy`/`trustVerdicts`/`grantCheck`/return shape for `evaluateGrantGate`), `plugin/bin/lib/issues/grouping.js`'s `extractKeyFiles(issue)` (`issue: {body, labels}` shaped like `gh api .../issues/{n}` output → `string[]`).
- Produces: an updated Phase C `node -e` block that loads `$ST_BACKLOG_GRANT_CANDIDATES` (already written by Step 1+2 Phase A) and `$ST_BACKLOG_GRANT_TRUST_ROWS`, finds this candidate's own row by `number`, rebuilds `trustVerdicts` as a real `Map`, and calls `extractKeyFiles` by name for `keyFiles` instead of a placeholder comment.

- [ ] **Step 1: Read the current Phase C section verbatim**

Read `plugin/skills/backlog/grant-mode.md`'s Phase C section (currently ~lines 214-236) in full immediately before editing, for the same deictic-reference re-resolution reason as Task 1 Step 1.

- [ ] **Step 2: Replace the Phase C snippet**

Replace the block currently reading:

```bash
FLOOR_VALUES=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values merge-sensitive-paths fleet-daily-grant-cap)
MERGE_SENSITIVE_PATHS=$(printf '%s\n' "$FLOOR_VALUES" | sed -n '1p')   # line 1: merge-sensitive-paths (raw comma string; empty = none)
FLEET_DAILY_GRANT_CAP=$(printf '%s\n' "$FLOOR_VALUES" | sed -n '2p')   # line 2: fleet-daily-grant-cap (empty = unset/uncapped)
node -e "
  const { evaluateGrantGate } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grant-gate.js');
  const { readBreakerState } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  // ... same record/policy/trustVerdicts as Phase A, plus:
  const keyFiles = /* parsed from the record body's '### Key Files' list, one path per bullet */;
  const sensitivePaths = /* MERGE_SENSITIVE_PATHS from the resolver call above, split on ',' */;
  // Read fresh, per candidate — Step 0.5 may have tripped it mid-run; a cached
  // pre-Step-0.5 value must never be reused (see Step 0.5's own note on this).
  const mergeLaneBreakerTripped = readBreakerState(process.cwd()).tripped === true;
  const result = evaluateGrantGate({
    record: { number, labels, body, facets, keyFiles },
    policy: { ceiling, grantOriginationEnabled, sensitivePaths, dailyGrantCap, grantsIssuedToday, riskFloor: '$RISK_FLOOR', sizeFloor: '$SIZE_FLOOR', mergeLaneBreakerTripped },
    trustVerdicts,
    grantCheck: { clear, rationale },
  });
"
```

with a version stating `evaluateGrantGate`'s exact shape inline (copied from `grant-gate.js:32-50`) and real reconstruction code:

```bash
FLOOR_VALUES=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values merge-sensitive-paths fleet-daily-grant-cap)
MERGE_SENSITIVE_PATHS=$(printf '%s\n' "$FLOOR_VALUES" | sed -n '1p')   # line 1: merge-sensitive-paths (raw comma string; empty = none)
FLEET_DAILY_GRANT_CAP=$(printf '%s\n' "$FLOOR_VALUES" | sed -n '2p')   # line 2: fleet-daily-grant-cap (empty = unset/uncapped)
# evaluateGrantGate({record, policy, trustVerdicts, grantCheck}) — bin/lib/issues/grant-gate.js
#   record: { number, labels: string[]|{name}[], body, facets? (parseRecordFacets
#     output — computed from labels when omitted), keyFiles?: string[] (the
#     record's own '### Key Files' list; [] when absent) }
#   policy: { ceiling, grantOriginationEnabled, dailyGrantCap?: number (absent =
#     uncapped), grantsIssuedToday?: number, sensitivePaths?: string[] globs,
#     riskFloor?, sizeFloor? (undefined defaults to 'high') }
#   trustVerdicts: Map<classKey, row> — classKey 'kind:source|band', row is one
#     of trustRows()'s rows (bin/lib/issues/trust.js); absent class reads
#     'insufficient-evidence' the same as everywhere else in this codebase.
#   grantCheck: { clear: boolean, rationale?: string }
#   Returns { grant, autoMerge, failedKey, reason, snapshot }.
node -e "
  const { evaluateGrantGate } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grant-gate.js');
  const { readBreakerState } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  const { extractKeyFiles } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grouping.js');
  const candidates = require('$ST_BACKLOG_GRANT_CANDIDATES');
  const candidate = candidates.find((c) => c.number === $NUMBER);
  const trustRowPairs = require('$ST_BACKLOG_GRANT_TRUST_ROWS');   // [[key, row], ...] written by Phase A
  const trustVerdicts = new Map(trustRowPairs);
  const keyFiles = extractKeyFiles(candidate);
  const sensitivePaths = '$MERGE_SENSITIVE_PATHS' ? '$MERGE_SENSITIVE_PATHS'.split(',') : [];
  // Read fresh, per candidate — Step 0.5 may have tripped it mid-run; a cached
  // pre-Step-0.5 value must never be reused (see Step 0.5's own note on this).
  const mergeLaneBreakerTripped = readBreakerState(process.cwd()).tripped === true;
  const result = evaluateGrantGate({
    record: { number: candidate.number, labels: candidate.labels, body: candidate.body, facets: candidate.facets, keyFiles },
    policy: { ceiling, grantOriginationEnabled, sensitivePaths, dailyGrantCap: $FLEET_DAILY_GRANT_CAP_OR_UNDEFINED, grantsIssuedToday, riskFloor: '$RISK_FLOOR', sizeFloor: '$SIZE_FLOOR', mergeLaneBreakerTripped },
    trustVerdicts,
    grantCheck: { clear, rationale },
  });
  console.log(JSON.stringify(result));
"
```

Note in prose immediately above the block that `$ST_BACKLOG_GRANT_CANDIDATES`/`$ST_BACKLOG_GRANT_TRUST_ROWS` are the exact tmp files Step 1 + Step 2 Phase A already wrote (cite the existing `fs.writeFileSync` lines earlier in this file rather than re-deriving), and that `$NUMBER`/`ceiling`/`grantOriginationEnabled`/`grantsIssuedToday`/`clear`/`rationale` are this iteration's already-in-scope loop/Phase-B values (name each one's origin in one clause rather than leaving them as unexplained bare identifiers).

- [ ] **Step 3: Verify byte count and re-read the full section**

`wc -c plugin/skills/backlog/grant-mode.md` — confirm still under 40000. Re-read Step 2 Phase C top to bottom for coherence.

---

### Task 3: Whole-file consistency pass and verification

**Files:**
- Read (no further edits expected, but fix anything found): `plugin/skills/backlog/grant-mode.md`

- [ ] **Step 1: Search for any other bare pseudocode placeholder in the touched file**

`grep -n '/\*.*\*/' plugin/skills/backlog/grant-mode.md` and `grep -n '^\s*//\s*\.\.\.' plugin/skills/backlog/grant-mode.md` — confirm no remaining `/* ... */` or `// ...` placeholder comments stand in for real code anywhere in the file (the two this plan targets are the ones identified during research; this is a safety sweep, not an expectation of finding more).

- [ ] **Step 2: Run the full test suite**

`npm test` from the repo root — confirms no skill-prose conformance suite byte-pins the sections this plan edits, and nothing else regresses.

- [ ] **Step 3: Manual acceptance check against the record's own criteria**

Re-read `plugin/skills/backlog/grant-mode.md` Step 0 through Step 2 end-to-end as if executing it fresh, and confirm: every `node -e`/`require()` call's input shape is now stated in the surrounding prose or comments, with no need to open `bin/lib/issues/*.js` to know what to pass. This is the acceptance criterion from record #1385 itself — verify it directly rather than assuming the diff satisfies it.
