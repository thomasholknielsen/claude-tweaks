---
name: claude-tweaks:assess-agent-autonomy
description: Use when triage or dispatch need a content-aware trust verdict instead of a mechanical label lookup, or when specify's record-creation step needs a content-aware ceremony-depth verdict — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule, ceremony-check informs specify's per-record ceremony depth (flow's materialize step falls back to it only for records that never went through specify). Inline helper, never invoked directly by a human. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification, ceremony profile, fast-lane.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Assess Agent Autonomy — Content-Aware Trust Verdicts

Four-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:triage`, `/claude-tweaks:dispatch`, `/claude-tweaks:specify`, or (fallback only)
`/claude-tweaks:flow`:

```
/claude-tweaks:triage Step 2          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:specify Step 3         [ ceremony-check ] -> CEREMONY: fast-lane | standard
```

## When to Use

- `/claude-tweaks:triage`'s Step 2 needs a grant recommendation for a worklist record.
- `/claude-tweaks:dispatch`'s Auto-merge gate needs a merge-or-human verdict for a clean, reviewed run.
- `/claude-tweaks:dispatch`'s Settle step needs to classify why a run failed.
- `/claude-tweaks:specify`'s Step 3 (Create the Records) needs a ceremony-depth verdict for a
  record, so `/specify` itself, `/claude-tweaks:review`, and `/claude-tweaks:wrap-up` all know how
  much fixed-cost ceremony it deserves. `/claude-tweaks:flow`'s materialize.md calls this mode only
  as a fallback, for a record that reaches `/flow` with no `ceremony:*` label at all.

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:triage`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), deciding auto-merge
eligibility or blast-radius caps (that's still `merge-check` alone — `ceremony-profile` and
`auto:merge` are independent axes), or any decision outside these four call sites — this is not a
general-purpose risk service.

## Input

`$ARGUMENTS` is `{mode} #{n}`, where `mode` is one of `grant-check` | `merge-check` |
`failure-check` | `ceremony-check` and `#{n}` is the record's issue number. Each mode's own Step 1
("Gather," below) is the source of truth for how it's used — they differ: `grant-check` fetches the
record body via `gh issue view` keyed on `#{n}`; `failure-check` fetches issue/PR comments via
`gh api ".../issues/${N}/comments..."`, also a genuine fetch keyed on `#{n}`; `ceremony-check`'s
primary call path (from `/specify`) issues no fetch at all — it reuses body/label data the caller
already holds in memory, and its fallback path (from `/flow`) likewise reuses data
`materialize.md` already fetched; `merge-check` uses `#{n}` only as a temp-file-name suffix for its
own git-diff/config-derived gather — it never fetches the record itself.

Invoked inline via the Skill tool — not as a fresh Task-agent dispatch. The calling agent (a
human-driven `/claude-tweaks:triage` session, or dispatch's per-group Task agent running `/flow`)
runs this skill's procedure in its own context and reads the produced report directly; there is no
cross-process hand-off.

## Mode: grant-check

**Called from:** `/claude-tweaks:triage`'s Step 2, once per worklist record, every triage session
— never pre-filtered to "borderline" records.

### Step 1: Gather

```bash
gh issue view "$N" --json body,labels -q '{body: .body, labels: [.labels[].name]}' > /tmp/assess-grant-${N}.json
```

Read the record's full body (Current State / Deliverables / Acceptance Criteria) from the fetched
JSON. Extract the current `risk:*`/`effort:*`/`ceremony:*` labels, if present:

```bash
node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const d=require('/tmp/assess-grant-${N}.json');
  const {risk, effort, ceremony}=parseRecordFacets(d.labels);
  console.log(JSON.stringify({risk, effort, ceremony}))"
```

### Step 2: Judge

Read the body content directly — don't just trust the risk/effort labels as ground truth. Weigh:

- Does the Deliverables/Acceptance Criteria text describe touching authentication, session
  handling, claim/locking logic, or other structurally sensitive behavior, regardless of what the
  risk/effort labels say? That's a reason to recommend more cautiously than the labels alone imply.
- Does the record describe creating or substantially editing a file under `skills/**/*.md` or
  `agents/**/*.md` (a new or changed skill, or a new or changed subagent definition)? This includes
  `harness-health:new-skill` findings — their body reads "**New skill candidate**" with a "Proposed
  new skill" deliverable (see `bin/lib/harness-health/issue-payload.js`). Recognize this from body
  content, not from a label — `new-skill` findings currently carry no `risk:*`/`effort:*` labels at
  all, by design, so labels alone tell you nothing here. A well-specified new-skill proposal can
  still reasonably recommend `RECOMMEND_BUILD: true` (drafting the content autonomously is fine — a
  human still confirms the grant, and reviews again before any merge), but recommend
  `RECOMMEND_MERGE: false` — new skill and agent-definition files encode instructions future agents
  follow, which is high-leverage independent of how small or clean the proposal looks.
- Is the described change actually lower-risk than its labels suggest (e.g. a `risk:medium` record
  that turns out to be a pure documentation correction with no behavioral surface)? Judge accuracy,
  not blanket caution — recommend generously when the content genuinely supports it.
- A missing Current State/Deliverables/Acceptance Criteria section, or an unresolved
  `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job to catch — that's
  `/claude-tweaks:triage`'s own Step 3.5 body-shape re-verification, which runs after this mode
  regardless of its output.

### Step 3: Render

Output ONLY these lines, no preamble:

```
RECOMMEND_BUILD: true | false
RECOMMEND_MERGE: true | false
RATIONALE: {one paragraph, naming the specific content signal the recommendation is based on}
```

If nothing in the record's content or scoring supports any recommendation, output
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false` — triage's Step 2 already treats this the same
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
plumbing (`/claude-tweaks:triage`'s Step 2 already carries `RATIONALE` verbatim into the batch
table's Rationale column and the `decisions.md` log line) — no new field, no separate mechanism.

## Mode: merge-check

**Called from:** `/claude-tweaks:dispatch`'s Auto-merge gate, replacing layers 2-4 (scoring
eligibility, runtime cleanliness, blast radius) entirely. Layer 1 (authorization — `auto:merge`
present on every group member) stays a hard binary gate in `dispatch/SKILL.md` itself, unchanged.

### Step 1: Gather

The calling agent has just finished this run's build, test, and review — the diff and review
verdict are already in its own context. Confirm rather than re-derive where possible. `$MERGE_BASE` is the commit this run's worktree branched from — the same base the pipeline's own build started from. If not already known from context, resolve it dynamically rather than assuming `main` — some projects default to `master`, `trunk`, or another branch name, and this skill runs against whatever project has it installed:

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
if [ -z "$DEFAULT_BRANCH" ]; then
  DEFAULT_BRANCH=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
fi
MERGE_BASE=$(git merge-base "$DEFAULT_BRANCH" HEAD)
```

```bash
git diff --numstat "$MERGE_BASE"..HEAD | node -e "
const fs = require('fs');
let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  const files = input.trim().split('\\n').filter(Boolean).map(line => {
    const [additions, deletions, ...pathParts] = line.split('\\t');
    return { path: pathParts.join('\\t'), additions: parseInt(additions), deletions: parseInt(deletions) };
  });
  fs.writeFileSync('/tmp/assess-merge-files-${N}.json', JSON.stringify(files));
});
"
```

Read this project's own configured `merge-sensitive-paths`/`automerge-max-lines`/
`automerge-max-files` directly — this skill reads its own config, the same way
`skills/dispatch/SKILL.md`'s existing Configuration section reads `dispatch-retry-ceiling` and
friends directly rather than expecting a caller to pre-fetch and pass them:

```bash
grep -E "^merge-sensitive-paths:|^automerge-max-lines:|^automerge-max-files:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null
MERGE_SENSITIVE_PATHS_CSV=$(grep -E "^merge-sensitive-paths:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/^[^:]*: *//')
```

`merge-sensitive-paths` is a single line, comma-separated glob list (e.g.
`merge-sensitive-paths: bin/hooks.js,skills/_shared/*.md,.claude-tweaks/policy.yml`) — split on `,`
and trim whitespace; absent entirely defaults to `[]` (see `_shared/work-record.md`'s Config keys
table). `automerge-max-lines`/`automerge-max-files` default to `40`/`2` when absent, matching
`skills/dispatch/SKILL.md`'s existing Configuration table.

Then compute the blast-radius summary:

```bash
node -e "
  const { classifyDiffFiles, blastRadiusSummary } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/blast-radius.js');
  const files = require('/tmp/assess-merge-files-${N}.json'); // [{path, additions, deletions}]
  const sensitivePaths = process.argv[1] ? process.argv[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const classified = classifyDiffFiles(files, sensitivePaths);
  console.log(JSON.stringify(blastRadiusSummary(classified)));
" "$MERGE_SENSITIVE_PATHS_CSV" > /tmp/assess-merge-blast-radius-${N}.json
```

(`$MERGE_SENSITIVE_PATHS_CSV` is the comma-separated value parsed from the grep above, e.g.
`"bin/hooks.js,skills/_shared/*.md"` — passed as a positional arg, not an env var expected from a
caller, since this skill reads its own config rather than depending on one.)

### Step 2: Judge

- **Sensitive-path hit is a hard floor.** If `sensitiveFilesTouched` is non-empty, render
  `needs-human` immediately — do not weigh anything else. No content judgment overrides this.
- **A new or substantially-edited `skills/**/*.md` or `agents/**/*.md` file is `needs-human`,
  regardless of size.** Generalizes the old `harness-health:new-skill` exclusion — both directories
  hold files that shape future agent behavior (skill procedures, subagent definitions like
  `agents/qa-agent.md`), which is high-leverage independent of how small the diff looks.
- **Weigh `blastRadiusSummary.implLines`/`implFiles` against the project's configured
  `automerge-max-lines`/`automerge-max-files`** as one input, not a cutoff — a diff comfortably
  under the configured guideline (e.g. #18's 33 impl lines under a 40-line guideline) supports
  `auto-merge` when review is clean; a diff well past it is a reason to lean `needs-human` even
  with a clean review, but is not an automatic disqualifier the way the old mechanical gate was.
  `testLines`/`testFiles` are informational only — never weigh test-file bulk toward risk.
- **Weigh the diff's actual content**, not just its size or file list: does it touch concurrency,
  locking, auth, or external API calls in a way that looks structurally sensitive even outside the
  configured `merge-sensitive-paths` list? Treat that as elevated risk from content, the same way a
  human reviewer would flag it on sight.
- **Review's findings are a hard input, not advisory**: if this run's `/claude-tweaks:review` pass
  produced anything at Medium severity or above, render `needs-human` — this mode never overrides a
  real review finding.

### Step 3: Render

```
VERDICT: auto-merge | needs-human
RATIONALE: {one paragraph, naming the specific factors weighed}
```

## Mode: failure-check

**Called from:** `/claude-tweaks:dispatch`'s Settle step, replacing "any failed run
unconditionally revokes `auto:merge`."

### Step 1: Gather

```bash
gh api "repos/{owner}/{repo}/issues/${N}/comments?per_page=100" > /tmp/assess-failure-comments-${N}.json
node -e "
  const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
  const comments = require('/tmp/assess-failure-comments-${N}.json');
  console.log(JSON.stringify({ priorAttempts: countFailedAttempts(comments) }));
"
```

Read the actual failure output from the gate that failed (test output, review findings, error
logs) — already in the calling agent's context from the run that just failed.

### Step 2: Judge

- **Transient signatures**: `gh api` rate-limit (HTTP 429) responses, network timeouts,
  `ECONNREFUSED`, or a test failure the calling agent can independently confirm is pre-existing and
  unrelated to this run's diff (e.g., rerunning the same test against unchanged code on the default
  branch also fails intermittently). Do not classify a test as flaky from memory of a specific test
  name — a test once known to be flaky may since have been fixed, and a genuine regression that
  happens to fail the same assertion must not inherit an old flakiness verdict. Classify
  `transient`.
- **Correctness signatures**: a test failure showing an assertion mismatch directly tied to code
  the record's own diff changed (expected/actual values diverging in logic the change touched).
  Classify `correctness`.
- **Ambiguous**: anything that doesn't clearly match either pattern. Classify `ambiguous` and
  handle it exactly like `correctness` downstream (see Output) — when genuinely unsure, err toward
  the existing conservative behavior, never toward the new permissive one.
- **`NOTIFY_NOW`**: set `true` when this is the *same* `correctness`-class failure recurring
  verbatim across two or more consecutive attempts — compare this failure's content against the
  prior `Attempt N failed: {reason}` comment bodies in `/tmp/assess-failure-comments-${N}.json`
  (the raw comments fetched in Step 1; `priorAttempts` itself is only the count from
  `countFailedAttempts`, not the reason text) — a signal the agent may be stuck rather than making
  incremental progress. Otherwise `false`.

### Step 3: Render

```
CLASSIFICATION: correctness | transient | ambiguous
NOTIFY_NOW: true | false
RATIONALE: {one paragraph}
```

The caller (dispatch's Settle step) is responsible for acting on `CLASSIFICATION` — revoking
`auto:merge` for `correctness`/`ambiguous`, preserving it for `transient` — and for the
retry-ceiling bookkeeping, which runs unconditionally regardless of this mode's output (see
`skills/dispatch/SKILL.md`'s Settle step).

## Mode: ceremony-check

**Called from:** `/claude-tweaks:specify`'s Step 3 (Create the Records) — both Shaping mode's
single-record path and decomposition mode's per-leaf loop (never the parent, which carries no
`risk:*`/`effort:*` scoring either) — immediately alongside the existing `risk:*`/`effort:*` label
stamping. Every leaf/single record, every `/specify` run, no pre-filtering to "borderline" records.

`/claude-tweaks:flow`'s materialize.md (`skills/flow/materialize.md`) calls this mode only as a
**fallback**, for a record that reaches `/flow` carrying no `ceremony:*` label at all — a legacy
hand-authored spec file, or a record created before this mode moved upstream. See
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` for the full rationale.

### Step 1: Gather

**Primary call, from `/specify`'s Step 3:** the record body (Current State/Deliverables/
Acceptance Criteria) and its `risk:*`/`effort:*` labels are already composed in memory for that
step's own create/edit call — no fetch at all, more direct than a re-fetch. Read them straight from
whatever local variable Step 3 already holds; there's nothing to shell out for.

**Fallback call, from `/flow`'s materialize.md:** only when a record reaches `/flow` carrying no
`ceremony:*` label. Reuses the same body/labels already fetched during materialize's Resolution
step:

```bash
node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const d=require('/tmp/materialize-record-${N}.json');
  const {risk, effort}=parseRecordFacets(d.labels);
  console.log(JSON.stringify({risk, effort}))"
```

### Step 2: Judge

Read the record's full body (Current State / Deliverables / Acceptance Criteria) directly —
`risk:`/`effort:` labels are signal, not a gate, the same non-label-bound judgment principle
`grant-check`/`merge-check` already establish ("this isn't a one-directional tightening"):

- Does the Deliverables/Acceptance Criteria describe a small, self-contained change with an obvious
  test story (a bug fix, a narrow migration, a single-module addition)? That supports `fast-lane`
  regardless of the record's own `risk:`/`effort:` labels.
- Does the record describe a change with real knowledge-capture value even though the code-level
  risk is low — multiple call sites across packages, a public-surface rename or CLI-facing
  decision, a migration retiring a module? That supports `standard` even when labeled
  `risk:low`/`effort:low`.
- Is the record's Deliverables a pure prose/comment/documentation correction with no behavioral
  surface at all? That supports `fast-lane` regardless of labels.
- A missing Current State/Deliverables/Acceptance Criteria section, or an unresolved
  `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job to catch — that's the
  materialization hard gate's own job, which runs before this mode regardless of its output.

### Step 3: Render

Output ONLY these lines, no preamble:

```
CEREMONY: fast-lane | standard
RATIONALE: {one paragraph, naming the specific content signal the verdict is based on}
```

If nothing in the record's content clearly supports `fast-lane`, output `standard` — the same
conservative-on-ambiguity principle as this skill's other three modes (see Error Handling).

**Persisting the verdict:** `/specify`'s Step 3 (the primary caller) stamps this verdict as an
explicit `ceremony:fast-lane`/`ceremony:standard` label — never omitted, unlike `risk:*`/
`effort:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a
verdict the first time it's shaped). `/flow`'s materialize.md fallback call uses the verdict only
for that run's own materialized header — it never writes a label back to the record.

## Error Handling

If this skill cannot render a clear verdict for any reason (malformed input, an inconclusive read),
default to the conservative outcome for whichever mode was running: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`; `ceremony-check` → `CEREMONY: standard`. Never
resolve ambiguity toward more autonomy or less ceremony — a missed auto-merge or a fuller wrap-up
pass costs a human a click or a few extra minutes; a wrongly-granted shortcut could ship something
bad or under-reflect on real complexity.

## Component-Skill Contract

`/claude-tweaks:assess-agent-autonomy` is **always** a component skill — it is never invoked
directly by a human, and never renders a `## Next Actions` block. Its only callers are
`/claude-tweaks:triage` (Step 2, `grant-check`), `/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`), `/claude-tweaks:specify` (Step 3, `ceremony-check`),
and `/claude-tweaks:flow` (materialization fallback, `ceremony-check` only when record carries no
`ceremony:*` label).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Overriding a review finding at Medium+ severity because the diff otherwise looks safe | `merge-check` never overrides a real review finding — review's own findings are a hard input, not advisory. |
| Weighing test-file line count toward risk in `merge-check` | The entire reason this skill exists is that test-line bulk isn't implementation risk — `testLines`/`testFiles` are informational only. |
| Skipping the sensitive-path hard floor because the content judgment "looks fine" | Sensitive paths are a floor precisely because they're the cases where content judgment alone isn't sufficient signal — never overridden. |
| Classifying an unclear failure as `transient` "to be less conservative" | Ambiguity always resolves to `correctness`'s conservative handling — the point of this skill is accuracy, not blanket permissiveness. |
| Recommending `RECOMMEND_MERGE: true` for a new-or-changed `skills/**/*.md` or `agents/**/*.md` file | Skill and agent-definition files shape future agent behavior — this is a hard `needs-human`/`false` case regardless of how clean or small the change looks. |
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The calling agent already has the diff/review-findings/failure-output in its own context — a subagent restart only pays to re-derive what's already known. |
| Treating `ceremony-check`'s verdict as a merge-safety signal | `ceremony-profile` and `auto:merge` are independent axes — a `fast-lane` record can still fail `merge-check` and fall back to a human-reviewed PR (this is exactly what happened to #18 before `merge-check` existed, for an unrelated reason). Never let ceremony depth influence merge eligibility or vice versa. |
| Writing to `decisions.md` from inside this skill | This skill doesn't know about run-dir resolution — logging is the caller's job (`/claude-tweaks:triage` or `/claude-tweaks:dispatch`), matching every other auto-decision log entry in this codebase. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:triage` | Calls `grant-check` once per worklist record in Step 2 — the output becomes the batch table's Recommended column directly. Triage still renders the human batch-confirm exactly as before; only what generates the suggestion changed. |
| `/claude-tweaks:dispatch` | Calls `merge-check` in the Auto-merge gate (replacing layers 2-4) and `failure-check` in the Settle step (replacing the old unconditional-revocation rule). Dispatch still owns layer 1 (authorization) and all label/claim mechanics directly. |
| `bin/lib/issues/blast-radius.js` | Pure module supplying `merge-check`'s one genuinely mechanical input — test-exclusion-aware diff sizing. This skill never computes blast radius itself. |
| `bin/lib/issues/record.js` | `parseRecordFacets`'s `risk`/`effort` fields supply `grant-check`'s and `ceremony-check`'s current-label input (the standalone `tier.js` extractor this used to read was retired as redundant with `parseRecordFacets`). `recommendGrants`/`recommendTier` are also retired — this skill replaces them as triage's recommendation signal. |
| `bin/lib/issues/retry.js` | `countFailedAttempts` supplies `failure-check`'s retry-history input. |
| `_shared/work-record.md` | Taxonomy home — the `merge-sensitive-paths` config key this skill's `merge-check` mode reads as a hard floor. |
| `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` | The full design rationale, motivation (the #18/#19 evidence), and calibration examples this skill's judgment procedures are anchored against. |
| `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` | Original design rationale and calibration examples for `ceremony-check` and for how `/claude-tweaks:build`/`/claude-tweaks:wrap-up` consume the `ceremony-profile` lever — amended (not superseded) by the design doc below. |
| `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` | Relocates this mode's primary call site to `/claude-tweaks:specify` and promotes `ceremony:` to an always-explicit label; the rationale for why `/claude-tweaks:review` and `/claude-tweaks:specify`'s own Step 5 needed this moved upstream of materialize. |
| `/claude-tweaks:specify` | The primary caller — Step 3 (Create the Records) invokes `ceremony-check` inline once per record (Shaping mode's single record; decomposition mode's per leaf, never the parent) immediately alongside `risk:*`/`effort:*` stamping, and persists the verdict as an explicit `ceremony:*` label. Step 5 (Multi-Persona Red-Team) also reads the freshly-stamped label to decide persona count. |
| `/claude-tweaks:flow` | Calls `ceremony-check` inline (not a fresh Task dispatch) only as a **fallback**, for a record reaching materialization (`skills/flow/materialize.md`) with no `ceremony:*` label — the verdict populates that run's own materialized header field without writing a label back. |
