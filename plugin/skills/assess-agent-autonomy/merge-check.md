# Mode: merge-check

**Called from:** `/claude-tweaks:dispatch`'s Auto-merge gate, replacing layers 2-4 (scoring
eligibility, runtime cleanliness, blast radius) entirely. Layer 1 (authorization — `auto:merge`
present on every group member) stays a hard binary gate in `dispatch/SKILL.md` itself, unchanged.

## Step 1: Gather

> **Parallel execution:** Use parallel tool calls aggressively — the merge-base-and-diff call
> (below) and reading this project's `merge-sensitive-paths`/`auto-merge-max-lines`/`auto-merge-max-files`
> config are independent read-only operations and should run concurrently; only the threshold
> comparison at the end of this step depends on both of their outputs. Note the qualifier: it is
> the **single** call deriving `$MERGE_BASE` and the diff together that runs concurrently with the
> config read. Do not split that call in two — `$MERGE_BASE` would be empty in the second shell,
> and an empty base makes `git diff --numstat` report a zero-file blast radius that clears every
> threshold silently.

The calling agent has just finished this run's build, test, and review — the diff and review
verdict are already in its own context. Confirm rather than re-derive where possible. `$MERGE_BASE`
is the commit this run's worktree branched from — the same base the pipeline's own build started
from.

- **If the caller passed `--base <ref>`** (see Input — e.g. one of dispatch's per-group Task calls,
  which ran `/flow` inside its dispatching session's worktree, often already knows this value), use it directly:
  `MERGE_BASE="<ref>"`. Skip the derivation below entirely.

- **Otherwise**, resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md`.
  `--base <ref>` short-circuits that ladder entirely rather than being a rank of it — it names a
  merge-base commit, not a branch, so a caller that already knows the merge base
  (one of dispatch's per-group Task calls, running inside the worktree its dispatching session set up) passes it and skips
  resolution entirely.

  If nothing resolves — no `origin` remote, no `gh` auth, an offline or detached runner — stop
  here. This is the "inconclusive read" case `SKILL.md`'s Error Handling already covers, not a hard crash.
  Render Step 3 directly: `VERDICT: needs-human` / `RATIONALE: {name the specific resolution
  failure, e.g. "could not resolve this project's integration branch"}`, and skip the rest of this
  mode's procedure.

Substitute the resolved branch **literally** where `{integration-branch}` appears below, and issue
the derivation and the diff as **one** Bash call. Each Bash invocation gets a fresh shell, so
`MERGE_BASE` assigned in one call is empty in the next — and the two commands fail in opposite
directions on an empty value. `git merge-base "" HEAD` exits 128 with `fatal: Not a valid object
name`, which is loud. `git diff --numstat ""..HEAD` reads `..HEAD` as `HEAD..HEAD` and returns
**zero lines with exit 0** — a blast radius of 0 files and 0 lines, which clears every
`auto-merge-max-*` threshold and verdicts `auto-merge`. Splitting these blocks turns a
resolution failure into an unconditional approval, which is the failure class this whole
procedure exists to prevent.

  Measuring from the integration branch rather than the GitHub default is what makes blast radius
  mean the record's own change. Against a branch that diverged long ago, the merge base is ancient
  and the diff spans every commit since the fork — which reads as an enormous change and returns
  `needs-human` for a reason that looks legitimate and isn't (#132).

```bash
MERGE_BASE=$(git merge-base {integration-branch} HEAD)
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

Read this project's own configured `merge-sensitive-paths`/`auto-merge-max-lines`/
`auto-merge-max-files` directly — this skill reads its own config, the same way
`skills/dispatch/SKILL.md`'s existing Configuration section reads `dispatch-retry-ceiling` and
friends directly rather than expecting a caller to pre-fetch and pass them. This read is
independent of the `$MERGE_BASE`/diff-derivation chain above (see the parallel-execution note) and
can be issued as a concurrent tool call:

```bash
CONFIG_VALUES=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values merge-sensitive-paths auto-merge-max-lines auto-merge-max-files)
MERGE_SENSITIVE_PATHS_CSV=$(printf '%s\n' "$CONFIG_VALUES" | sed -n '1p')   # line 1: merge-sensitive-paths
AUTO_MERGE_MAX_LINES=$(printf '%s\n' "$CONFIG_VALUES" | sed -n '2p')         # line 2: auto-merge-max-lines
AUTO_MERGE_MAX_FILES=$(printf '%s\n' "$CONFIG_VALUES" | sed -n '3p')         # line 3: auto-merge-max-files
```

`merge-sensitive-paths` is a single line, comma-separated glob list (e.g.
`merge-sensitive-paths: bin/hooks.js,skills/_shared/*.md,.claude-tweaks/policy.yml`) — split on `,`
and trim whitespace; an empty resolution means the key is unset and the list is `[]` (see
`_shared/work-record.md`'s Config keys
table). `auto-merge-max-lines`/`auto-merge-max-files` come back already defaulted by the resolver,
so both are always concrete numbers.

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

(`$MERGE_SENSITIVE_PATHS_CSV` is the comma-separated value captured from the resolver call above, e.g.
`"bin/hooks.js,skills/_shared/*.md"` — passed as a positional arg, not an env var expected from a
caller, since this skill reads its own config rather than depending on one.)

## Step 2: Judge

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
  `auto-merge-max-lines`/`auto-merge-max-files` — but only once the diff is judged to carry behavior
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

### Calibration

Boundary cases are stated as shapes, not as issue references — an issue closes and its defect gets
fixed, and calibration anchored to one then describes a state that no longer exists.

| Change | Verdict | Why |
|--------|---------|-----|
| A skill's factual claim corrected — e.g. state described as independent, corrected to a shared singleton | `needs-human` | True, verifiable, and still changes how agents reason about concurrency. The case that kills "verifiable therefore safe". |
| A threshold, budget, or cap literal changed | `needs-human` | Reads as a number correction; directly changes what agents do at the limit. "Small and numeric" is not a safety signal. |
| A section reworded so an existing instruction reads more strongly or more weakly | `needs-human` | No instruction added or removed, yet the threshold for following it moved. |
| A stale cross-reference repaired after a file split — `above`/`below` pointers, a moved path, a renamed anchor | `auto-merge` eligible | Pointer repair. The refutation attempt comes up empty: no agent acts differently, it just finds the target. |
| A dead pointer deleted, nothing replacing it | `auto-merge` eligible | Removes an instruction that could not be followed. Confirm nothing else cited the removed target. |
| A behavior-preserving rename spanning many files, review clean | `auto-merge` eligible | Uniformly one transformation. Exceeding `auto-merge-max-lines` is review burden, not risk. |
| A rename spanning many files where one hunk also changes a default | `needs-human` | One non-conforming hunk makes the whole diff behavior-carrying — the guideline binds again. |

`auto-merge` eligible means the refutation attempt came up empty for the agent-instruction floor
alone — necessary, never sufficient. Both floors stated above still apply on their own terms: a
sensitive-path hit renders `needs-human` with nothing else weighed, and so does any review finding
at Medium or above. Match a row here and you have cleared one gate, not the step.

## Step 3: Render

```
VERDICT: auto-merge | needs-human
RATIONALE: {one paragraph, naming the specific factors weighed}
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Overriding a Medium+ review finding because the diff otherwise looks safe | `merge-check` never overrides a real review finding — they're a hard input, not advisory. |
| Weighing test-file line count toward risk in `merge-check` | Test-line bulk isn't implementation risk; `testLines`/`testFiles` are informational only. |
| Skipping the sensitive-path hard floor because the content judgment "looks fine" | A floor exactly because content judgment isn't sufficient signal there — never overridden. |
| Rendering `auto-merge` on an agent-instruction change without attempting to refute it | The escape is a refutation attempt, not a classification: name a behavior an agent could take differently; pass only if it comes up empty. "Looks small and tidy" isn't an attempt. |
| Treating a correction as safe because it is factually true and verifiable | Behavior delta is the test, not truth — a claim corrected wrong→right still changes what agents reason from. |
