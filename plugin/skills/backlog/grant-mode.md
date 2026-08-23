# Backlog — Grant Mode

The headless machine-grant unit: `/dispatch next`'s headless-unit shape applied to granting.
Sweeps the `ready` queue and applies `auto:build` (+ `auto:merge` when its own checks clear) to
every candidate whose gate chain fully clears — mechanically, with no per-record
`AskUserQuestion`. This is the one machine-origination path `_shared/work-record.md`'s Grant
semantics names: the `autonomy` ceiling's `unattended` tier plus its `grant-origination-enabled`
opt-in (`_shared/autonomy-ceiling.md`, `_shared/policy-schema.md`), narrowed by a per-record
gate chain that still requires a clean trust verdict, agent-filed origin, a content-aware
`grant-check` clearing, and no floor trip. Human-filed records are refused unconditionally,
regardless of every other key — see `_shared/work-record.md`'s new `/backlog grant` permission
matrix row.

As of #309, a gate-chain pass that would have granted merge trust applies `auto:merge-pending`
instead of `auto:merge` directly — see `_shared/work-record.md`'s Grant semantics for the full
pending-then-mature flow and why this replaces the old immediate-grant behavior outright.

Preflight (Detection Ladder, `work-backend: local-files` complete stop) is documented once in
`SKILL.md` — read it before this file if you haven't; nothing here restates it.

Every temp file this mode writes below resolves through `bin/lib/session-tmp.js`'s `sessionTmpPath`, per `_shared/session-tmp-root.md`'s session-scoped temp-root convention (cited once here, not restated per script).

## Step 0: Ceiling gate (whole-run, before any candidate fetch)

Gate 1 of the chain (`bin/lib/issues/grant-gate.js`'s first two checks) is ceiling-wide, not
per-record — every candidate would fail it identically, so check it once, before spending a
single `gh` call on candidate enumeration:

```bash
POLICY_VALUES=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy grant-origination-enabled risk-floor size-floor)
CEILING=$(printf '%s\n' "$POLICY_VALUES" | sed -n '1p')   # line 1: autonomy
OPT_IN=$(printf '%s\n' "$POLICY_VALUES" | sed -n '2p')    # line 2: grant-origination-enabled
RISK_FLOOR=$(printf '%s\n' "$POLICY_VALUES" | sed -n '3p')   # line 3: risk-floor
SIZE_FLOOR=$(printf '%s\n' "$POLICY_VALUES" | sed -n '4p')   # line 4: size-floor
```

`RISK_FLOOR`/`SIZE_FLOOR` are whole-run values, resolved once here — like `CEILING`/`OPT_IN`, they feed both Phase A's and Phase C's `policy` object below (gate 5's oversight floor is not per-record configuration). A `shaped:headless` record (#968 — no human reviewed the spec body) is additionally checked against a fixed `medium` floor on both axes, denying with `failedKey: 'shaped-headless-floor'` when it exceeds that floor — this second check is not configurable and is not part of `RISK_FLOOR`/`SIZE_FLOOR` above; it runs only after the configured floor already cleared, so the existing `'oversight-floor'` key keeps winning when both would deny.

Substitute the literal values — do not `export` in an earlier Bash call and read `process.env`
later (shell state doesn't survive between calls or reach a subagent; same hazard
`refine-mode.md`'s Trust Signal section already documents for this exact pattern). The resolver
applies the schema defaults, so both values are always concrete. If
`CEILING` is not literally `unattended`, or `OPT_IN` is not literally `true`: **report "nothing
to do — ceiling is `{CEILING}`, grant-origination-enabled is
`{OPT_IN}`" and stop the whole mode here.** Log one line to this run's `decisions.md`
(standalone-auto run dir per `_shared/pipeline-run-dir.md`, resolved the same way every other
standalone-auto skill on the allowlist resolves it):

```
AUTO {time} — Backlog grant: ceiling gate not satisfied (ceiling={CEILING}, opt-in={OPT_IN}) — nothing to do this firing.
```

This is not an error and not a HARD-GATE — it's the expected steady state for any project that
hasn't deliberately opted into both keys. Do not proceed to Step 1.

## Step 0.5: Merge-lane circuit breaker sweep (whole-run, after Step 0, before Step 1)

A second, independent, additive floor over the per-record gate chain (#311) — checked once per
firing, the same "whole-run fact, not a per-record one" shape Step 0's ceiling gate already is.
Reads `merge-lane/watched.json` — the set of records this mode itself machine-granted
`auto:merge` to (Step 4's seed write below is the only write path that adds an entry) — and
classifies each against fresh evidence, tripping `merge-lane/breaker.json` repo-wide the moment
any one of them looks bad. Independent from, not a replacement for, `trust.js`'s per-class
revocation (#268) — a class can read `clean` while this breaker is tripped, and vice versa.

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = {
    ST_BACKLOG_GRANT_WATCHED: 'backlog-grant-watched.json',
  };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
node -e "
  const { readWatched } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
  console.log(JSON.stringify(readWatched(process.cwd())));
" > "$ST_BACKLOG_GRANT_WATCHED"
```

An empty `{}` means nothing to sweep — skip straight to Step 1. Otherwise, for every
`{number}` key in the watched map:

1. Fetch its current state fresh: `gh issue view {number} --json state,closedAt,labels`.
2. Reuse this run's already-fetched integration-branch git log (`_shared/trust-table.md`'s Fetch
   section — the same log Step 2's trust-row build pulls; do not fetch it a second time here) and
   the resolved `trust-revert-window-days` policy value (`resolve-policy.js --values
   trust-revert-window-days`, same resolver pattern Step 0/Step 2 already use elsewhere in this
   mode).
3. Classify:

   ```bash
   node -e "
     const { classifyWatchedRecord } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
     // entry = { number, grantedAt, lastKnownState: watched[number].lastKnownState, state, closedAt, labels }
     // gitLog: [{ sha, message }] from the already-fetched integration-branch log
     const result = classifyWatchedRecord(entry, gitLog, Date.now(), windowDays);
     console.log(JSON.stringify(result));
   "
   ```

4. Apply the result:
   - `{ action: 'trip', reason }` — CAS-write `merge-lane/breaker.json` via
     `writeBreakerState(root, (b) => ({ ...b, tripped: true, trippedAt: new Date().toISOString(), trippedBy: { record: number, reason } }))`.
     Log one `decisions.md` AUTO entry (format below). Leave the record's own `watched.json` entry
     in place — a repeat classification on a later firing is harmless, since the write is
     idempotent once already tripped.
   - `{ action: 'prune' }` — remove the entry from `watched.json` via `writeWatched` (resolved-good:
     closed, unreverted, past the revert window).
   - `{ action: 'update', newState }` — write the entry's `lastKnownState: newState` back via
     `writeWatched`, leaving the entry in place (still-pending — nothing to report).

**This firing's own remaining Phase A-C candidate loop must read the freshly-tripped state, not a
stale in-memory copy from before this step ran.** Phase C's `mergeLaneBreakerTripped` read (Step 2
below) always calls `readBreakerState` fresh, after this step has finished — do not resolve the
breaker once at the top of the run and thread a cached value through; a bad merge discovered
mid-sweep must block that same firing's own remaining grants, not only the next one.

`decisions.md` entry for a trip:

```
AUTO {time} — Backlog grant: merge-lane circuit breaker TRIPPED by #{n} (reason: {revert|reopened|demo:changes-requested}) — auto:merge origination halted repo-wide until an explicit reset via /claude-tweaks:backlog refine.
```

## Step 1: Fetch candidates (`work-backend: github-issues` only)

Reuses `refine-mode.md`'s own grant-fetch shape and `dispatch/SKILL.md`'s pagination posture
(same `--limit`/at-cap-warning pattern, same `parseRecordFacets` fold), narrowed to this mode's
own eligibility:

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = {
    ST_BACKLOG_GRANT_READY: 'backlog-grant-ready.json',
  };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
gh issue list --label ready --state open --json number,title,body,labels,createdAt --limit "$LIMIT" > "$ST_BACKLOG_GRANT_READY"
if [ "$(node -e "console.log(require('$ST_BACKLOG_GRANT_READY').length)")" = "$LIMIT" ]; then
  echo "WARNING: fetched exactly $LIMIT ready-labeled issues (backlog-fetch-limit) — there may be more. See .claude-tweaks/policy.yml." >&2
fi
```

The `ready`-labeled fetch above stays a dedicated server-side-filtered call — GitHub does that
narrowing cheaper than pulling the whole queue and filtering client-side. The open-issue-number
set below, though, is data every session-scoped record snapshot already carries (`number` +
`state` on every row) — read it from there instead of a second bare fetch:

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = {
    ST_BACKLOG_GRANT_ALL_RECORDS: 'backlog-grant-all-records.json',
    ST_BACKLOG_GRANT_OPEN_NUMBERS: 'backlog-grant-open-numbers.json',
    ST_BACKLOG_GRANT_READY: 'backlog-grant-ready.json',
    ST_BACKLOG_GRANT_CANDIDATES: 'backlog-grant-candidates.json',
  };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
{Session-scoped record snapshot's read-fresh-or-fetch block (_shared/record-queue-fetch.md),
 with {tmp-records-file} = $ST_BACKLOG_GRANT_ALL_RECORDS}
node -e "
  const records = require('$ST_BACKLOG_GRANT_ALL_RECORDS').filter((i) => i.state === 'OPEN');
  require('fs').writeFileSync('$ST_BACKLOG_GRANT_OPEN_NUMBERS', JSON.stringify(records.map((i) => ({ number: i.number }))));
"
node -e "
  const { parseRecordFacets, parseDependencies } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const issues = require('$ST_BACKLOG_GRANT_READY');
  const openNumbers = new Set(require('$ST_BACKLOG_GRANT_OPEN_NUMBERS').map((i) => i.number));
  const candidates = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.origin !== null)               // by:* sweep origin only (gate 3, pre-filtered here for cheapness)
    .filter((i) => !i.facets.grants.build && !i.facets.grants.merge)  // no existing grant
    .filter((i) => !i.facets.bot.inProgress)                 // not already claimed
    .filter((i) => {
      const deps = parseDependencies(i.body);
      return deps.every((d) => !openNumbers.has(d));         // no open 'Blocked by #N'
    });
  console.log(JSON.stringify(candidates));
" > "$ST_BACKLOG_GRANT_CANDIDATES"
```

The `facets.origin !== null` filter is a cheap pre-pass on the same gate-3 condition
`evaluateGrantGate` re-checks anyway — filtering here just avoids running the full chain on
every human-filed record in the `ready` queue. `bot:blocked` records are **included** here
(their retry-ceiling state doesn't disqualify them from re-authorization — see Step 4's
re-authorize handling) unless they also carry `bot:in-progress`.

**`--limit 500` on the open-numbers pull** can silently truncate on a repo with more than 500
open issues — same caveat `dispatch/SKILL.md`'s own use of this pattern documents (a dependency
number absent from `openNumbers` reads as "not in the fetched page," not "closed"). Given the
volume this mode is designed for (a `ready`-labeled subset, not the whole backlog), this is
accepted without a targeted live-check fallback; `evaluateGrantGate`'s own gates still apply
per-record regardless.

## Step 2: Evaluate the gate chain (bounded, per candidate)

Bound the LLM-bound grant-check pass to `--budget` (default 40, independent of `refine`'s own
budget — same `--budget` flag, same default, per `SKILL.md`'s Input). Two-phase per record,
matching `bin/lib/issues/grant-gate.js`'s own two-phase contract (gate 4 needs a Skill call this
pure module cannot make itself):

**Phase A — gates 1-3, pure, no LLM call:**

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = {
    ST_BACKLOG_GRANT_CANDIDATES: 'backlog-grant-candidates.json',
    ST_BACKLOG_GRANT_TRUST_ROWS: 'backlog-grant-trust-rows.json',
    ST_BACKLOG_GRANT_PHASE_A: 'backlog-grant-phase-a.json',
  };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
node -e "
  const { evaluateGrantGate } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grant-gate.js');
  const candidates = require('$ST_BACKLOG_GRANT_CANDIDATES');
  const policy = { ceiling: '$CEILING', grantOriginationEnabled: $([ \"$OPT_IN\" = 'true' ] && echo true || echo false), riskFloor: '$RISK_FLOOR', sizeFloor: '$SIZE_FLOOR' };
  // trustVerdicts: built the same way refine-mode.md's Trust Signal section builds its 'rows'
  // Map — trustRows() + resolveProvenance()/riskBand() over the fetched + git-log evidence, per
  // _shared/trust-table.md's Fetch section. Omitted here for brevity; reuse that section's script
  // verbatim, substituting this mode's candidate set.
  const trustVerdicts = require('$ST_BACKLOG_GRANT_TRUST_ROWS'); // Map-shaped: [[classKey, row], ...]
  const results = candidates.map((c) => ({
    number: c.number,
    result: evaluateGrantGate({ record: { number: c.number, labels: c.labels, body: c.body, facets: c.facets }, policy, trustVerdicts: new Map(trustVerdicts) }),
  }));
  console.log(JSON.stringify(results));
" > "$ST_BACKLOG_GRANT_PHASE_A"
```

Every result with `failedKey` set is a **skip** — do not invoke `grant-check` for it (the whole
point of gate ordering: don't spend an LLM call on a record already refused for a cheaper
reason). Log each skip now (Step 4's Logging format).

Every result with `needsGrantCheck: true` proceeds to Phase B, bounded by `--budget`
(`bl.selectBudgetSlice`, same helper `refine-mode.md` Step 3 uses); state `remaining > 0` plainly
in the report exactly as that step does.

**Phase B — gate 4, per selected candidate:**

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE` (`assess-agent-autonomy/grant-check.md`
— the identical call `refine-mode.md` Step 3 makes). Fold into `grantCheck`:
`{ clear: RECOMMEND_BUILD === true, rationale: RATIONALE }`. `RECOMMEND_MERGE` is read separately
below — it is advisory context for the audit trail, never a second gate: `evaluateGrantGate`'s
own final `autoMerge` decision comes from `permittedGrants`, not from `grant-check`'s merge
opinion (this mode's Deliverables: "its own checks" means exactly `permittedGrants`, no other
criteria).

**Phase C — re-run the full chain with `grantCheck` populated:**

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

`dailyGrantCap` is `FLEET_DAILY_GRANT_CAP` from the resolver call above
(`policy-schema.md`); `grantsIssuedToday` is a running in-memory counter for this firing, seeded
before Phase C begins by counting today's (UTC) `<!-- grant-mode-audit: date=... -->` markers
already posted — see Step 4's Cap tracking. An empty `FLEET_DAILY_GRANT_CAP` (key unset — it has
no schema default) leaves
`dailyGrantCap` undefined, which `evaluateGrantGate` treats as uncapped (optional-when-absent,
this record's own AC 4).

## Step 3: Body-shape re-verification (before granting)

Identical rule to `refine-mode.md` Step 3.5 — for every candidate Phase C resolves to
`grant: true`, re-verify the fetched body against `_shared/work-record.md`'s spec-shaped
definition (`## Current State`/`## Deliverables`/`## Acceptance Criteria` present and non-empty,
no `TBD`/`TODO`/`<!-- ambiguity:` markers) before writing any label — labels are projection, not
truth. A failing record downgrades to a skip with `failedKey: 'not-spec-shaped'` (this module's
own addition, not part of `grant-gate.js`'s chain, since body re-verification is a caller-level
concern the same way it is in `refine-mode.md`) — log it the same way as any other skip, comment
on the record:

```
Skipped by /claude-tweaks:backlog grant: body is not spec-shaped — missing/empty: {list}. This does not remove `ready`; a human or /claude-tweaks:backlog refine can still grant it after inspection.
```

Unlike `refine`'s Step 3.5, this mode does **not** remove `ready` on this downgrade — flag-back
is a human-gate action (`_shared/work-record.md`'s permission matrix: `/backlog refine` removes
`ready`, `/backlog grant` never does). Leaving `ready` in place lets a human or a subsequent
`refine` run reconsider it normally.

## Step 4: Apply

**Grant rows** (Phase C `grant: true`): bootstrap `auto:build` (+`auto:merge-pending` when
`result.autoMerge`) per `_shared/label-bootstrap.md`, same `LABELS_JSON` pair `refine-mode.md`
Step 5 uses. `auto:merge-pending` is a waypoint, not the final merge grant — it matures to
`auto:merge` at `/claude-tweaks:dispatch`'s existing Auto-merge gate Authorization layer, gated
by `grant-veto-window-hours` and vetoable by a human removing the label before then (see
`_shared/work-record.md`'s Grant semantics). `bot:blocked` candidates take the **re-authorize**
path — strip `bot:blocked`, grant **`auto:build` only, never `auto:merge`/`auto:merge-pending`**,
regardless of what `result.autoMerge` says (mirrors `refine-mode.md` Step 3's `re-authorize
(bot:blocked)` row: "a prior failure means the human's renewed judgment is the point" — this
mode has no human in the loop for this decision, so the conservative floor is to never restore
merge trust on a re-authorization headlessly, full stop):

```bash
if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
  if [ "$AUTO_MERGE" = "true" ]; then
    gh issue edit "$ISSUE" --add-label auto:merge-pending
  fi
fi
```

Unlike before #309, this step no longer seeds `merge-lane/watched.json` — a pending grant hasn't
merged anything yet, so there is nothing for the circuit breaker to watch. That seed now happens
in `dispatch/settle-and-merge.md`'s Auto-merge gate, at the moment `auto:merge-pending` actually
matures into `auto:merge` (see that file).

Post the audit comment (evidence snapshot — see the Audit format below), then log to
`decisions.md`.

**Skip rows** (any `failedKey` set, at any phase): no label change, no comment on the record —
a skip is silent to the record itself (a human-filed record, an out-of-cap record, or a
transiently-unclean class should not accumulate visible noise every firing). Log to
`decisions.md` only, naming the exact `failedKey` and `reason` — no per-verdict branching, per
this record's own gate-chain design.

## Audit format

**Record comment** (grant rows only) — the evidence snapshot from `evaluateGrantGate`'s
`snapshot`, plus a machine-parseable marker the cap check (Step 2 above) reads back:

```
Machine-granted by /claude-tweaks:backlog grant (headless).

- Ceiling: unattended (grant-origination-enabled: true)
- Class: {classKey} — verdict: clean
- Origin: {origin}
- grant-check: clear — {rationale}
- Floors: merge-sensitive-paths clear, risk:{risk}, daily-grant-cap {n/a | "N of M"}
- Grants applied: auto:build{ + auto:merge-pending}

<!-- grant-mode-audit: date={YYYY-MM-DDTHH:MM:SSZ} auto-merge={true|false|pending} -->
```

The trailing HTML comment is the durable, greppable marker Step 2's cap-seeding count reads back
(`date=` truncated to the UTC calendar date for same-day comparison) — same dual-purpose
human-readable-plus-machine-marker convention `_shared/work-record.md`'s fingerprint marker
already uses.

**`decisions.md`** (this run's standalone-auto run dir):

```
AUTO {time} — Backlog grant: ceiling gate not satisfied (ceiling={x}, opt-in={y}) — nothing to do this firing.
AUTO {time} — Backlog grant: granted auto:build{ + auto:merge-pending} to #{n} (class {classKey}, verdict clean). Rationale: {grant-check RATIONALE}.
AUTO {time} — Backlog grant: re-authorized #{n} — stripped bot:blocked, granted auto:build only.
AUTO {time} — Backlog grant: skipped #{n} — {failedKey}: {reason}.
```

Every grant and every skip gets exactly one line — "no silent outcome in either direction" is
this record's own Deliverables wording, not a stylistic preference.

## Step 5: Report

No `AskUserQuestion` for any individual decision — this mode's entire point is that the gate
chain, not a human, decides. At the end, render a short summary (record count granted /
re-authorized / skipped, with skip reasons grouped by `failedKey`) and the Next Actions block
from `SKILL.md` (rendered only when a human is present — see that file's Next Actions section
and Component-Skill Contract).

## Cap tracking

`fleet-daily-grant-cap` counts machine grants issued **today** (UTC calendar date), read from
`<!-- grant-mode-audit: date=... -->` markers, not from an in-repo counter file (no durable
per-day state this mode owns — the record comments already are that state, and reading them back
avoids a second source of truth that could drift from what was actually granted). Seed
`grantsIssuedToday` once, before Phase C begins, by searching today's comments:

```bash
TODAY=$(date -u +%Y-%m-%d)
gh search issues --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" \
  --match comments "grant-mode-audit: date=${TODAY}" --json number | node -e "
    const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    console.log(rows.length);
  "
```

Increment the in-memory counter by one immediately after each grant is applied in Step 4 (not
just at the end) so a cap reached mid-run stops the remaining candidates in the same firing, not
only on the next one. When `fleet-daily-grant-cap` resolves empty (key unset — Phase C's own
resolver read above),
skip this whole section — `evaluateGrantGate` treats an absent cap as uncapped and this search
never runs (avoids an unnecessary `gh search` call on the common, uncapped-by-default path).

## Concurrency

Same reasoning as `refine-mode.md`'s Concurrency section: every label add is idempotent, so two
overlapping grant-mode firings (e.g. an overlapping Routine cadence) at worst repeat the same
write. The daily cap read is a snapshot at the start of each firing, not a lock — two concurrent
firings could each read the same "N of M" count and both grant, overshooting the cap by a small,
self-correcting margin. Acceptable for the same reason `refine-mode.md` accepts its own narrow
race: the next firing reads the true, now-current count and stops appropriately; this is not
worth a distributed lock for a soft fleet-hygiene cap.
