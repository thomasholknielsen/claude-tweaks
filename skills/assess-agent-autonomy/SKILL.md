---
name: claude-tweaks:assess-agent-autonomy
description: Use when backlog refine or dispatch need a content-aware trust verdict instead of a mechanical label lookup, or when specify's record-creation step needs a content-aware ceremony-depth verdict — grant-check informs backlog refine's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule, ceremony-check informs specify's per-record ceremony depth (flow's materialize step falls back to it only for records that never went through specify). Inline helper, never invoked directly by a human. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification, ceremony profile, fast-lane.
argument-hint: "<grant-check|merge-check|failure-check|ceremony-check> [#<n>] [--base <ref>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

# Assess Agent Autonomy — Content-Aware Trust Verdicts

Four-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:backlog refine`, `/claude-tweaks:dispatch`, `/claude-tweaks:specify`, or (fallback only)
`/claude-tweaks:flow`:

```
/claude-tweaks:backlog refine         [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:specify Step 3         [ ceremony-check ] -> CEREMONY: fast-lane | standard
```

## When to Use

- `/claude-tweaks:backlog refine`'s Step 2 needs a grant recommendation for a worklist record.
- `/claude-tweaks:dispatch`'s Auto-merge gate needs a merge-or-human verdict for a clean, reviewed run.
- `/claude-tweaks:dispatch`'s Settle step needs to classify why a run failed.
- `/claude-tweaks:wrap-up`'s Step 8.6 Auto-merge short-circuit needs the same merge-or-human verdict
  for its own single-record run — the version wrap-up runs directly whether or not
  `/claude-tweaks:dispatch` was involved.
- `/claude-tweaks:specify`'s Step 3 (Create the Records) needs a ceremony-depth verdict for a
  record, so `/specify` itself, `/claude-tweaks:review`, and `/claude-tweaks:wrap-up` all know how
  much fixed-cost ceremony it deserves. `/claude-tweaks:flow`'s materialize.md calls this mode only
  as a fallback, for a record that reaches `/flow` with no `ceremony:*` label at all.

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:backlog refine`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), deciding auto-merge
eligibility or blast-radius caps (that's still `merge-check` alone — `ceremony-profile` and
`auto:merge` are independent axes), or any decision outside the call sites listed under "When to
Use" above — this is not a general-purpose risk service.

## Input

`$ARGUMENTS` is `{mode} [#{n}] [--base <ref>]`, where `mode` is one of `grant-check` |
`merge-check` | `failure-check` | `ceremony-check` and `#{n}` is the record's issue number. Each
mode's own Step 1 ("Gather," below) is the source of truth for how it's used — they differ:
`grant-check` fetches the record body via `gh issue view` keyed on `#{n}`; `failure-check` fetches
issue/PR comments via `gh api ".../issues/${N}/comments..."`, also a genuine fetch keyed on `#{n}`;
`ceremony-check`'s primary call path (from `/specify`) issues no fetch at all — it reuses
body/label data the caller already holds in memory, and its fallback path (from `/flow`) likewise
reuses data `materialize.md` already fetched; `merge-check` uses `#{n}` only as a temp-file-name
suffix for its own git-diff/config-derived gather — it never fetches the record itself.

`#{n}` is omitted only from `ceremony-check`'s primary call in `/specify`'s Step 3
decomposition-mode per-leaf loop — the leaf has no issue number yet at that point in the
procedure (it's assigned only after the record is created, later in the same step), so that call
site invokes this skill as bare `ceremony-check` with no trailing `#{n}` at all. Every other mode,
and `ceremony-check`'s own Shaping-mode and `/flow`-fallback calls, always pass `#{n}`.

`--base <ref>` is `merge-check`-only: an optional pre-known merge-base commit or ref the caller
already has in context (e.g. dispatch's per-group Task agent, which ran `/flow` and set up the
worktree itself). When present, `merge-check`'s Step 1 uses it directly instead of re-deriving
`$MERGE_BASE` from `$DEFAULT_BRANCH`. Ignored by the other three modes.

Invoked inline via the Skill tool — not as a fresh Task-agent dispatch. The calling agent (a
human-driven `/claude-tweaks:backlog refine` session, or dispatch's per-group Task agent running `/flow`)
runs this skill's procedure in its own context and reads the produced report directly; there is no
cross-process hand-off.

## Mode: grant-check

**Called from:** `/claude-tweaks:backlog refine`'s grant-check pass, once per worklist record, every refine run
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
- Does the record describe creating or editing an agent-instruction file (see `merge-check`'s Step
  2 for the class — a skill, a subagent definition, `CLAUDE.md`/`AGENTS.md`, or a rules file)? This
  includes `harness-health:new-skill` findings — their body reads "**New skill candidate**" with a
  "Proposed new skill" deliverable (see `bin/lib/harness-health/issue-payload.js`). Recognize this
  from body content, not from a label — `new-skill` findings currently carry no `risk:*`/`effort:*`
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

### Step 3: Render

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

## Mode: merge-check

**Called from:** `/claude-tweaks:dispatch`'s Auto-merge gate, replacing layers 2-4 (scoring
eligibility, runtime cleanliness, blast radius) entirely. Layer 1 (authorization — `auto:merge`
present on every group member) stays a hard binary gate in `dispatch/SKILL.md` itself, unchanged.

### Step 1: Gather

> **Parallel execution:** Use parallel tool calls aggressively — resolving `$MERGE_BASE` (below)
> and reading this project's `merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files`
> config are independent read-only operations and should run concurrently; only the blast-radius
> compute at the end of this step depends on both of their outputs.

The calling agent has just finished this run's build, test, and review — the diff and review
verdict are already in its own context. Confirm rather than re-derive where possible. `$MERGE_BASE`
is the commit this run's worktree branched from — the same base the pipeline's own build started
from.

- **If the caller passed `--base <ref>`** (see Input — e.g. dispatch's per-group Task agent, which
  ran `/flow` and set up the worktree itself, often already knows this value), use it directly:
  `MERGE_BASE="<ref>"`. Skip the derivation below entirely.
- **Otherwise**, if not already known from context, resolve it dynamically rather than assuming
  `main` — some projects default to `master`, `trunk`, or another branch name, and this skill runs
  against whatever project has it installed. `gh` is already a hard dependency of this skill
  (`grant-check`/`failure-check` both shell out to it), so reuse the same one-liner
  `skills/dispatch/SKILL.md`'s own auto-merge flow already uses for this:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch 2>/dev/null)
```

  If `$DEFAULT_BRANCH` comes back empty (no `origin` remote configured, no `gh` auth, or an
  offline/detached runner), stop here — this is exactly the "inconclusive read" case `## Error
  Handling` already covers, not a hard crash to let the rest of Gather fail on. Render Step 3
  directly — `VERDICT: needs-human` / `RATIONALE: {name the specific resolution failure, e.g.
  "could not resolve this project's default branch via gh api"}` — and skip the rest of this
  mode's procedure.

```bash
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
friends directly rather than expecting a caller to pre-fetch and pass them. This grep is
independent of the `$MERGE_BASE`/diff-derivation chain above (see the parallel-execution note) and
can be issued as a concurrent tool call:

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
- **An agent-instruction file is `needs-human` unless a refutation attempt clears it.** An
  agent-instruction file is any file this project's harness loads as *instruction* rather than as
  *subject matter*: `CLAUDE.md`/`AGENTS.md`, `.claude/rules/*`, `.claude/skills/**`,
  `.claude/agents/**`, and — in a repository that *is* a plugin — its own `skills/**`/`agents/**`
  sources. Resolve the class by that role for the project at hand; do not match a fixed path list,
  which is wrong in every repository whose layout differs from the one it was written against.
  `_shared/harness-health-analysis.md` audits a related but narrower set for a different purpose
  (`.claude/skills/*.md`, `.claude/rules/*.md`, and `CLAUDE.md`, stated there as a fixed list) —
  read it as a floor for what counts, never as this class's definition. These files encode
  instructions future agents follow, which is high-leverage independent of how small the diff looks.

  **The escape is a refutation, not a classification.** Do not ask "is this change mechanical?" —
  that phrasing invites agreement. Instead, try to name a concrete behavior an agent could take
  differently after the edit: an instruction it would now follow, skip, or apply at a different
  threshold; a claim it would now reason from. Render `auto-merge` only when a genuine attempt to
  name one comes up empty. If you can name any candidate — including one you are unsure about —
  render `needs-human`. A correction can be factually true and independently verifiable and still
  change what agents infer; truth is not the test, behavior delta is.
- **Weigh `blastRadiusSummary.implLines`/`implFiles` against the project's configured
  `automerge-max-lines`/`automerge-max-files` — but only once the diff is judged to carry behavior
  change at all.** `blastRadiusSummary` reports whole-diff totals; there is no per-hunk breakdown
  to weigh, which is why the judgment below is deliberately a binary on the whole diff rather than
  an attempt to size some behavior-carrying fraction of it. Size proxies review burden, not risk:
  a large diff in which every hunk is the same
  behavior-preserving transformation (a rename, a call site updated
  uniformly, dead code removed) is safer than a small one that changes a branch condition. So ask
  first whether the diff is behavior-preserving as a whole — a single hunk that is not an instance
  of the same transformation makes the whole diff behavior-carrying. When it is behavior-preserving
  and review is clean, exceeding the configured guideline is not by itself a reason to lean
  `needs-human`. When it carries behavior change, weigh the guideline as one input, not a cutoff —
  a diff comfortably under it (e.g. #18's 33 impl lines under a 40-line guideline) supports
  `auto-merge` when review is clean; well past it is a reason to lean `needs-human`, but not an
  automatic disqualifier the way the old mechanical gate was. `testLines`/`testFiles` are
  informational only — never weigh test-file bulk toward risk.
- **Weigh the diff's actual content**, not just its size or file list: does it touch concurrency,
  locking, auth, or external API calls in a way that looks structurally sensitive even outside the
  configured `merge-sensitive-paths` list? Treat that as elevated risk from content, the same way a
  human reviewer would flag it on sight.
- **Review's findings are a hard input, not advisory**: if this run's `/claude-tweaks:review` pass
  produced anything at Medium severity or above, render `needs-human` — this mode never overrides a
  real review finding.

#### Calibration

Boundary cases are stated as shapes, not as issue references — an issue closes and its defect gets
fixed, and calibration anchored to one then describes a state that no longer exists.

| Change | Verdict | Why |
|--------|---------|-----|
| A skill's factual claim corrected — e.g. state described as independent, corrected to a shared singleton | `needs-human` | True, verifiable, and still changes how agents reason about concurrency. The case that kills "verifiable therefore safe". |
| A threshold, budget, or cap literal changed | `needs-human` | Reads as a number correction; directly changes what agents do at the limit. "Small and numeric" is not a safety signal. |
| A section reworded so an existing instruction reads more strongly or more weakly | `needs-human` | No instruction added or removed, yet the threshold for following it moved. |
| A stale cross-reference repaired after a file split — `above`/`below` pointers, a moved path, a renamed anchor | `auto-merge` eligible | Pointer repair. The refutation attempt comes up empty: no agent acts differently, it just finds the target. |
| A dead pointer deleted, nothing replacing it | `auto-merge` eligible | Removes an instruction that could not be followed. Confirm nothing else cited the removed target. |
| A behavior-preserving rename spanning many files, review clean | `auto-merge` eligible | Uniformly one transformation. Exceeding `automerge-max-lines` is review burden, not risk. |
| A rename spanning many files where one hunk also changes a default | `needs-human` | One non-conforming hunk makes the whole diff behavior-carrying — the guideline binds again. |

`auto-merge` eligible means the refutation attempt came up empty for the agent-instruction floor
alone — necessary, never sufficient. Both floors stated above still apply on their own terms: a
sensitive-path hit renders `needs-human` with nothing else weighed, and so does any review finding
at Medium or above. Match a row here and you have cleared one gate, not the step.

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
- Same non-goal as `grant-check`'s Step 2 (above): a missing Current State/Deliverables/Acceptance
  Criteria section, or an unresolved `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job
  to catch — here that's the materialization hard gate's own job, which runs *before* this mode
  regardless of its output (`grant-check`'s analogous gate runs *after*).

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
`/claude-tweaks:backlog refine` (Step 2, `grant-check`), `/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`), `/claude-tweaks:wrap-up` (Step 8.6's Auto-merge
short-circuit, `merge-check` — the single-record version of dispatch's same gate, run whether or not
`/claude-tweaks:dispatch` was involved), `/claude-tweaks:specify` (Step 3, `ceremony-check`), and
`/claude-tweaks:flow` (materialization fallback, `ceremony-check` only when record carries no
`ceremony:*` label).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Overriding a Medium+ review finding because the diff otherwise looks safe | `merge-check` never overrides a real review finding — they're a hard input, not advisory. |
| Weighing test-file line count toward risk in `merge-check` | Test-line bulk isn't implementation risk; `testLines`/`testFiles` are informational only. |
| Skipping the sensitive-path hard floor because the content judgment "looks fine" | A floor exactly because content judgment isn't sufficient signal there — never overridden. |
| Classifying an unclear failure as `transient` "to be less conservative" | Ambiguity always resolves to `correctness`'s conservative handling — accuracy, not blanket permissiveness. |
| Rendering `auto-merge` on an agent-instruction change without attempting to refute it | The escape is a refutation attempt, not a classification: name a behavior an agent could take differently; pass only if it comes up empty. "Looks small and tidy" isn't an attempt. |
| Treating a correction as safe because it is factually true and verifiable | Behavior delta is the test, not truth — a claim corrected wrong→right still changes what agents reason from. |
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The caller already holds the diff/review-findings/failure-output — a subagent only pays to re-derive it. |
| Treating `ceremony-check`'s verdict as a merge-safety signal | `ceremony-profile` and `auto:merge` are independent axes — a `fast-lane` record can still fail `merge-check`. Ceremony depth never influences merge eligibility, or vice versa. |
| Writing to `decisions.md` from inside this skill | This skill doesn't resolve run dirs; logging is the caller's job (`/claude-tweaks:backlog refine` or `/claude-tweaks:dispatch`). |
