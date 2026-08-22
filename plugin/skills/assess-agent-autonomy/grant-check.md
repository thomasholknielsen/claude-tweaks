# Mode: grant-check

**Called from:** `/claude-tweaks:backlog refine`'s grant-check pass, once per worklist record, every refine run
— never pre-filtered to "borderline" records. Also called from `/claude-tweaks:backlog grant`'s gate
chain (gate 4), once per candidate whose ceiling/opt-in/trust/origin gates already cleared —
`grant-mode.md`'s Step 2 Phase B, same call shape, same non-pre-filtered rule.

## Step 1: Gather

Resolve this run's session-scoped temp path first (`_shared/session-tmp-root.md`) — combined with
the existing `${N}` record suffix, per that file's "Record-suffixed callers keep both suffixes"
section: two different sessions building the same record concurrently still need the session
segment, and two different records in the same session still need the record segment.

```bash
ASSESS_GRANT=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'assess-grant-' + process.argv[1] + '.json') || require('path').join(require('os').tmpdir(), 'assess-grant-' + process.argv[1] + '.json'))
" "$N")
gh issue view "$N" --json body,labels -q '{body: .body, labels: [.labels[].name]}' > "$ASSESS_GRANT"
```

Follows `_gather-resilience.md`'s three-part shape: the MCP path uses `issue_read`'s **get mode**
(`grant-check`'s current callers, `/claude-tweaks:backlog refine`/`grant`, do not yet have a
resolved MCP transport, so this branch is not reachable from them today) in place of the `gh
issue view` call above — the rest of this step consumes the same `{body, labels}` shape
regardless of transport. The could-not-gather short-circuits (neither transport available, or the
fetch itself fails) render Step 3 directly with `RECOMMEND_BUILD: false` / `RECOMMEND_MERGE:
false` and the specific gather/fetch failure named verbatim in `RATIONALE` — the same
short-circuit shape `merge-check.md` Step 1 already uses for its own resolution failures.

Read the record's full body (Current State / Deliverables / Acceptance Criteria) from the fetched
JSON. Extract the current `risk:*`/`size:*`/`ceremony:*` labels, if present. Re-resolve
`$ASSESS_GRANT` first — a fresh bash invocation does not inherit Step 1's shell variables:

```bash
ASSESS_GRANT=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'assess-grant-' + process.argv[1] + '.json') || require('path').join(require('os').tmpdir(), 'assess-grant-' + process.argv[1] + '.json'))
" "$N")
node -e "const {parseRecordFacets}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const d=require(process.argv[1]);
  const {risk, size, ceremony}=parseRecordFacets(d.labels);
  console.log(JSON.stringify({risk, size, ceremony}))" "$ASSESS_GRANT"
```

## Step 2: Judge

**Mechanical check, first — before any content weighing below.** If the labels fetched in Step 1
include `needs:definition`, skip the rest of this step entirely and go straight to Step 3 with:

```
RECOMMEND_BUILD: false
RECOMMEND_MERGE: false
RATIONALE: Carries needs:definition — this record names an open choice with no tradeoff made
yet. Run /claude-tweaks:specify #{n} to route through brainstorming before it can be built.
```

Otherwise, read the body content directly — don't just trust the risk/size labels as ground truth. Weigh:

- Does the Deliverables/Acceptance Criteria text describe touching authentication, session
  handling, claim/locking logic, or other structurally sensitive behavior, regardless of what the
  risk/size labels say? That's a reason to recommend more cautiously than the labels alone imply.
- Does the record describe creating or editing an agent-instruction file (see `merge-check`'s Step
  2 for the class — a skill, a subagent definition, `CLAUDE.md`/`AGENTS.md`, or a rules file)? This
  includes `harness-health:new-skill` findings — their body reads "**New skill candidate**" with a
  "Proposed new skill" deliverable (see `bin/lib/harness-health/issue-payload.js`). Recognize this
  from body content, not from a label — `new-skill` findings currently carry no `risk:*`/`size:*`
  labels at all, by design, so labels alone tell you nothing here. A well-specified new-skill
  proposal can still reasonably recommend `RECOMMEND_BUILD: true` — drafting content autonomously
  is fine, since a human confirms the grant and reviews again before any merge.

  For `RECOMMEND_MERGE`, judge what the record's own body describes. A record proposing content
  that adds or changes instructions agents follow is `false`; a **new** skill or subagent
  definition is always `false`, since a new instruction file is new instructions by definition. A
  record describing only repair to what the file points at — a moved path, a renamed anchor, a
  stale cross-reference — can be `true`. Whatever you recommend, state in the `RATIONALE` that
  `merge-check` re-judges the real diff at merge time and may still route to a human: the grant
  authorizes an attempt, it does not promise a merge. Recommending `true` on a body that reads
  clean is safe precisely because the diff is judged again against this class's floor.
- Is the described change actually lower-risk than its labels suggest (e.g. a `risk:medium` record
  that turns out to be a pure documentation correction with no behavioral surface)? Judge accuracy,
  not blanket caution — recommend generously when the content genuinely supports it.
- A missing Current State/Deliverables/Acceptance Criteria section, or an unresolved
  `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job to catch — that's
  `/claude-tweaks:backlog refine`'s own Step 3.5 body-shape re-verification, which runs after this mode
  regardless of its output.
- Does the record carry `shaped:headless` (#968 — no human reviewed the spec body, only `/specify`'s headless `next` unit)? Content-derived confidence is inherently weaker here than on a human-shaped record, since nobody has validated the spec text itself against the actual codebase. Weigh ambiguity toward `RECOMMEND_BUILD: false` in this case — this is a judgment nudge, not a hard rule: `evaluateGrantGate`'s own gate 5 (`grant-gate.js`) already hard-denies a `shaped:headless` record whose risk or size is `medium`+ regardless of what this step recommends, so this paragraph only affects the narrower population that clears that gate (risk and size both `low`) but still carries some content-level ambiguity this step can weigh.

## Step 3: Render

Output ONLY these lines, no preamble:

```
RECOMMEND_BUILD: true | false
RECOMMEND_MERGE: true | false
RATIONALE: {one paragraph, naming the specific content signal the recommendation is based on}
```

If nothing in the record's content or scoring supports any recommendation, output
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false` — backlog refine's grant sub-stage already treats this the same
as today's "flag back (needs scoring)" case; no separate error path is needed here.

**Ceremony-tier disclosure.** When recommending `RECOMMEND_MERGE: true` for a record whose
`ceremony:*` label is `fast-lane`, the RATIONALE must explicitly state the review-depth this
implies — this is the actual fact a human granting `auto:merge` is trusting, not an implementation
detail to leave buried in ceremony-tiering machinery the batch table never surfaces: a
`ceremony:fast-lane` build routes through `/flow`'s lightweight self-review, not a full
`/claude-tweaks:review` lens dispatch. Append one clause naming this plainly, e.g. "...; note this
will route through self-review only (ceremony:fast-lane), not the full review lens matrix." A
`ceremony:standard` record needs no such clause — it gets the full review path regardless of the
merge recommendation, so there's no tradeoff to disclose. This clause rides on the existing
plumbing (`/claude-tweaks:backlog refine`'s Step 2 already carries `RATIONALE` verbatim into the batch
table's Rationale column and the `decisions.md` log line) — no new field, no separate mechanism.
