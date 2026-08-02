---
name: claude-tweaks:dispatch
description: Use when you want to claim and build already-authorized GitHub work records — the queue consumer between the human gate and the executor. Bare picklist, next for the headless routine unit, or #N direct; claims the whole file-overlap group, hands off to /flow, and settles the result. Keywords - dispatch, queue, claim, auto:build, auto:merge, bot:in-progress, bot:blocked, autonomous build, routine.
argument-hint: "[next|#N[,#M...]] [--claim-only] [--concurrent <n>] [--priority high|medium|low]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Dispatch — the Queue Consumer

The thin protocol wrapper between the authorization gate and the executor: select → claim group → invoke /flow → settle. Sits outside the main brainstorm-to-build chain, downstream of the gate:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
                  /claude-tweaks:backlog refine   (grants auto:build / auto:merge)
                              │
                              v
              [ /claude-tweaks:dispatch ]   <- utility (no fixed lifecycle position)
                              │
                              v
          /claude-tweaks:flow #{n}[,#{m}...]   (claims whole group, executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- Something is already authorized (`auto:build`, optionally `+ auto:merge`) and you want to build it now — run bare `/dispatch` to pick from the queue, or `/dispatch #N` for a specific record.
- A scheduled Routine needs a single, deterministic unit of headless work to fire on a cadence — that's `/dispatch next`.
- A prior dispatched build failed and you want the retry/ceiling bookkeeping to run — this happens automatically inside the Settle step (Step 6), not as a separate invocation.

Not for: granting authorization (`/claude-tweaks:backlog refine`'s job), deriving a spec, or building anything yourself. Dispatch only ever claims, hands off to `/claude-tweaks:flow`, and settles the result.

**Why no `drain` mode.** There is no mode that shepherds every authorized group to completion in one session. A session babysitting N pipeline runs accumulates context until it rots; throughput comes from routine cadence × single-group firings (a Routine firing `next` on a schedule), not session breadth. The old design's consolidated multi-group Review Console existed to aggregate a drain session's N outcomes into one table; a single-group firing has nothing to consolidate, so it dies with drain — see Reporting below.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| *(none)* | Bare — interactive batch pick over the authorized queue, grouped by file overlap; up to `dispatch-pick-max-concurrent` groups per firing |
| `next` | Headless-safe — claim + dispatch exactly one group, chosen by priority-then-age ordering; the unit a scheduled Routine fires |
| `#N` | Direct — claim + dispatch record `#N`'s whole file-overlap group |
| `#N,#M,...` | Explicit list — claim + dispatch each named record's whole file-overlap group, deduplicated; skips interactive selection since the set is already named |
| `--claim-only` (modifier) | Suffix any of the four forms above — run through Step 4's claim and stop before Step 5's Task-agent dispatch. Diagnostic/testing use: exercises the real claim mechanism (atomic ref, `bot:in-progress`, claim comment) without spending build time. The claim is left held afterward — release manually (Step 4's stop-point output prints the exact commands) or let it expire via the standard 72h TTL. |
| `--concurrent <n>` (modifier) | Suffix bare or `#N,#M,...` — per-firing override of `dispatch-pick-max-concurrent` (Configuration below) for this invocation only; does not edit CLAUDE.md/policy.yml. Highest-precedence per `_shared/auto-mode-contract.md`'s CLI-arg-first ordering. No effect on `next`/`#N`, which always dispatch exactly one group regardless of the cap. See Step 3 (bare-mode question wording) and Step 5 (concurrency throttle). |
| `--priority <high\|medium\|low>` (modifier) | Suffix `next` only — restrict this firing's candidate pool to groups whose representative member (Step 3's `next`-ranking definition) carries that priority band before ranking/selection runs. Lets multiple differently-scheduled Routines each own a distinct slice of the queue (e.g. a fast-cadence `--priority high` routine alongside a slower one covering everything else). No effect on bare or `#N`/`#N,#M,...`, which select by human pick or explicit name, not the `next` ranking. |

## Preflight

> The local-files stop paragraph below follows the canonical pattern in `_shared/local-files-preflight-stop.md` — do not weaken its enumeration, no-exception clause, or auto-mode disclaimer when editing.

Read the project's `work-backend` config key (per `_shared/work-record.md`'s Config keys table). **`work-backend: local-files`** — report that headless dispatch is github-issues only (GitHub's RBAC + atomic refs are the mechanism this protocol depends on, not a policy choice) and **stop this turn completely**: do not invoke `/claude-tweaks:flow`, `/claude-tweaks:build`, or any other skill; do not claim, write, edit, or create any file; do not run any build, test, or git-committing command. Tell the user they can run `/claude-tweaks:flow` or `/claude-tweaks:build` manually against a chosen record if they want that work done — this is information for the user to act on, never an instruction for you to act on yourself. This holds with no exception when no interactive human is present to receive it, including the `next` form's headless/Routine firing (see Input table above): the absence of a human to hand this off to is not license to do the work in their place — it means the claim mechanism this protocol depends on is unavailable, so the correct behavior is to stop, not proceed. **This stop is also not superseded by this project's own documented auto-mode or hands-off-pipeline conventions elsewhere in CLAUDE.md** (e.g. `/claude-tweaks:flow` defaulting to `auto`, "skills MUST NOT invent new mid-flow stops"): those conventions govern behavior within a pipeline run that has already been authorized to proceed — they say nothing about whether this Preflight may authorize new work in the first place, which under `local-files` it explicitly cannot. A record that looks low-risk, well-scoped, or "ready" is not an exception. Only `work-backend: github-issues` proceeds past this point.

**Missing key vs. deliberate `local-files` choice.** Before treating an absent `work-backend` line as an intentional `local-files` project, check whether CLAUDE.md's `## Backlog integration` section already carries a `backlog-backend:` line (the pre-6.0 legacy key, per `_shared/work-record.md`'s "Legacy alias exception"):

```bash
grep -q '^work-backend:' CLAUDE.md && echo "OK" || { grep -qE '^backlog-backend:[[:space:]]*\S' CLAUDE.md && echo "MIGRATION_GAP" || echo "GENUINE_LOCAL_FILES"; }
```

`MIGRATION_GAP` means this is very likely an incomplete migration, not a deliberate `local-files` choice — report exactly this message (substituting the actual `backlog-backend` value for `{value}`) and stop, instead of the generic local-files redirect above:

> CLAUDE.md has backlog-backend but no work-backend: line — add work-backend: {value} (the same value as backlog-backend) to CLAUDE.md's Backlog integration section to fix this.

`GENUINE_LOCAL_FILES` (neither key present, or `work-backend` present) proceeds through the normal branch above unchanged.

**Headless self-report (`next` form only).** The `next` form fires unattended — the unit a scheduled Routine fires with nobody present to read a stop message (see the Input table above). A Preflight failure here needs a durable trace instead of a message nobody sees. Before stopping on any Preflight failure (the `work-backend` checks above, or the Detection Ladder below), search for an existing open report first, to avoid re-filing on every firing — never via `gh issue list --search`, which rides GitHub's eventually-consistent search index (the same anti-pattern documented in `_shared/github-write-transport.md`); use the same plain-list + marker-match idiom instead:

```bash
gh issue list --label by:dispatch --state open --json number,title,body,createdAt --limit 500 > /tmp/dispatch-selfreport-issues.json

rm -f /tmp/dispatch-selfreport-lookup.json
node -e "
  const { findByMarker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js');
  const issues = require('/tmp/dispatch-selfreport-issues.json');
  const marker = '<!-- dispatch-preflight-marker: ' + process.argv[1] + ' -->';
  const result = findByMarker(issues, marker);
  require('fs').writeFileSync('/tmp/dispatch-selfreport-lookup.json', JSON.stringify(result));
" "{failing-check-name}"
```

Read `/tmp/dispatch-selfreport-lookup.json`:
- `null`: read the project's `work-types` config key (per `_shared/work-record.md`'s Config keys table) and branch —
same pattern `/capture`'s Backend Selection already uses, Type is always `bug` here (a Preflight
failure is definitionally a defect). The body now carries the marker so future firings can find it reliably:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['by:dispatch', 'Origin: self-filed by /claude-tweaks:dispatch on a headless Preflight failure']]
# — bootstrap the matching type:bug pair too under work-types: labels, same as /capture does.

# work-types: native
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --type bug \
  --label by:dispatch

# work-types: labels
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --label by:dispatch \
  --label type:bug
```
- Otherwise (`canonical` is set — a match was found): if `duplicates` is non-empty (however that happened — this is the hedge, not the expected path), resolve this firing's run dir first — via `_shared/pipeline-run-dir.md`'s standalone-auto fallback (dispatch is on the allowlist; this block runs in Preflight, before Workflow Step 1 would otherwise resolve `$RUN_ID`, so it cannot be assumed already resolved here) — then close every duplicate entry: `gh issue close {n} --reason "not planned"` with a comment `` "Duplicate of #{canonical.number} — same `dispatch-preflight-marker` match, closing to keep one open self-report per failing check." `` — then log one line per closed duplicate to that run dir's `decisions.md`: `AUTO {time} — dispatch headless self-report: closed duplicate issue #{n} (marker match with canonical #{canonical.number}). Reversibility: low (GitHub state; issue can be manually re-opened).` Then, whether or not any duplicates were found, reference `#{canonical.number}` in the stop output and file nothing new.

No `ready`/`auto:build` on the filed issue — a human confirms and applies the fix, the same conservative default `/capture`'s `keep` route uses elsewhere in this codebase. The bare/`#N`/explicit-list forms always run with a human present (per the Input table framing above) — they still just report and stop; self-filing is `next`-only.

Before any `gh` command, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3:
GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Unlike
`/tidy`/`/help`'s use of this ladder, which fails open into a skipped scan,
`/claude-tweaks:dispatch` treats any ladder failure as a hard gate — this skill's entire purpose
is writing GitHub state (claims, labels, merges), so there is no meaningful degraded mode to
fall back into. Report the specific failing check and stop (headless self-report above still
applies for the `next` form).

Check 2 (`gh` CLI installed) stays a hard gate even though `_shared/github-write-transport.md`
now defines an MCP path for this skill's *writes*: dispatch's read path is still `gh`-only
end to end (Step 2's `gh issue list` queue pull, the dependency-check `gh issue view` /
`gh api graphql` calls, the contested-claim `gh api .../comments` fetch, and all of
`settle-and-merge.md`), so proceeding without `gh` would only trade a clean Preflight stop for
an unstructured `gh: command not found` deep inside Step 2. Bridging that read path is real
future work; until it lands, `gh` absent stops here.

## Workflow

### Step 1: Resolve this firing's run id

Resolve this firing's `$RUN_ID` once, before Step 2, via the standalone-auto run-dir resolution in `_shared/pipeline-run-dir.md` (dispatch is on the allowlist) — `$RUN_ID` is that run directory's basename (e.g. `2026-07-14T140322-dispatch-standalone`). Every claim this firing makes in Step 4 embeds this same value as `claimPayload`'s `runId`, and every group's Task agent in Step 5 receives it explicitly as `CLAIM_RUN_ID` (Task agents don't inherit shell variables — per `_shared/subagent-output-contract.md`'s Input Discipline, a dispatched agent is a clean room), so Step 6's ownership check (`claim.runId === $RUN_ID`), performed inside that agent rather than in this thread, compares against the firing that actually claimed the record.

### Step 2: Pull the authorized queue and group by file overlap

Common to all four selection forms — group membership must be computed over the full current pool *before* anything is claimed (per `_shared/issue-claims.md`'s group-claim rule: group membership is computed over **unclaimed** records only, so two racing firings converge on the same winner instead of splitting a group between them).

The queue: **open + `auto:build` + no `bot:*` + no open `Blocked by #N` dependency + unclaimed**. Dispatch never adds `auto:build`, `auto:merge`, or `ready` — see Anti-Patterns.

```bash
gh issue list --label auto:build --state open --json number,title,body,labels,createdAt --limit 500 > /tmp/dispatch-queue-raw.json
QUEUE_RAW_COUNT=$(node -e "console.log(require('/tmp/dispatch-queue-raw.json').length)")
if [ "$QUEUE_RAW_COUNT" -ge 500 ]; then
  echo "Warning: the auto:build queue pull returned exactly the --limit cap (500) — this repo may have more open auto:build records than fetched. gh issue list returns newest-first, so any records beyond the cap are the OLDEST same-priority ones, exactly what next's own oldest-first tie-break (Step 3) exists to surface first. Consider raising the cap, or filing this as a signal to re-triage the queue down." >&2
fi
gh issue list --state open --json number --limit 200 > /tmp/dispatch-open-numbers.json
WORK_LINKS=$(grep -E "^work-links:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//')
node -e "
  const { parseRecordFacets, parseDependencies } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/dispatch-queue-raw.json');
  const openNumbers = new Set(require('/tmp/dispatch-open-numbers.json').map((i) => i.number));
  const eligiblePreDep = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.grants.build && !i.facets.bot.inProgress && !i.facets.bot.blocked);
  // '--limit 200' can silently truncate the open-issues pull on a repo with more open
  // issues than that — a dependency number absent from openNumbers means 'not in the
  // fetched 200', not 'closed'. Collect those as unresolved for a targeted live check below
  // rather than treating the absence as proof the blocker is closed.
  const unresolved = [...new Set(eligiblePreDep.flatMap((i) => parseDependencies(i.body)).filter((dep) => !openNumbers.has(dep)))];
  require('fs').writeFileSync('/tmp/dispatch-eligible-pre-dep.json', JSON.stringify(eligiblePreDep));
  require('fs').writeFileSync('/tmp/dispatch-unresolved-deps.json', JSON.stringify(unresolved));
"
: > /tmp/dispatch-verified-open-deps.txt
for DEP in $(node -e "console.log(require('/tmp/dispatch-unresolved-deps.json').join(' '))"); do
  STATE=$(gh issue view "$DEP" --json state -q .state 2>/dev/null)
  if [ "$STATE" = "OPEN" ]; then echo "$DEP" >> /tmp/dispatch-verified-open-deps.txt; fi
done
node -e "
  const fs = require('fs');
  const { parseDependencies } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const eligiblePreDep = require('/tmp/dispatch-eligible-pre-dep.json');
  const openNumbers = new Set(require('/tmp/dispatch-open-numbers.json').map((i) => i.number));
  const verifiedOpen = fs.existsSync('/tmp/dispatch-verified-open-deps.txt')
    ? fs.readFileSync('/tmp/dispatch-verified-open-deps.txt', 'utf8').trim().split('\n').filter(Boolean).map(Number)
    : [];
  for (const dep of verifiedOpen) openNumbers.add(dep);
  const eligible = eligiblePreDep.filter((i) => !parseDependencies(i.body).some((dep) => openNumbers.has(dep)));
  fs.writeFileSync('/tmp/dispatch-eligible.json', JSON.stringify(eligible));
"
echo '{"data":{"repository":{}}}' > /tmp/dispatch-native-deps.json
if [ "$WORK_LINKS" = "native" ]; then
  rm -f /tmp/dispatch-native-query.graphql
  node -e "
    const { buildNativeDependencyQuery } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
    const eligible = require('/tmp/dispatch-eligible.json');
    const query = buildNativeDependencyQuery(eligible.map((i) => i.number));
    if (query) require('fs').writeFileSync('/tmp/dispatch-native-query.graphql', query);
  "
  if [ -s /tmp/dispatch-native-query.graphql ]; then
    OWNER_REPO=$(gh repo view --json owner,name -q '.owner.login + " " + .name')
    if gh api graphql -f query="$(cat /tmp/dispatch-native-query.graphql)" \
      -f owner="$(echo "$OWNER_REPO" | cut -d' ' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d' ' -f2)" \
      > /tmp/dispatch-native-deps.tmp.json 2>/tmp/dispatch-native-deps.err; then
      mv /tmp/dispatch-native-deps.tmp.json /tmp/dispatch-native-deps.json
    else
      echo "Warning: native dependency query failed — falling back to no native filtering this run: $(cat /tmp/dispatch-native-deps.err)" >&2
    fi
  fi
fi
node -e "
  const { hasOpenNativeBlocker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const eligible = require('/tmp/dispatch-eligible.json');
  const repoData = require('/tmp/dispatch-native-deps.json').data.repository;
  const finalEligible = eligible.filter((i) => !hasOpenNativeBlocker(repoData['i' + i.number]));
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
" > /tmp/dispatch-groups.json
```

**MCP path** (`gh` unavailable — not reachable in practice today, Preflight hard-gates before this point; documented as groundwork per `_shared/github-write-transport.md`'s CRUD mapping): the queue pull uses the confirmed "list issues by label" mapping; the per-dependency open-state check (the `gh issue view "$DEP" --json state` loop) uses the confirmed "get single issue by number" mapping, checking the returned state field for `OPEN`. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.

Two bulk calls plus a small, bounded fallback — the second pull is a cheap existence check for `parseDependencies`' targets (an open blocker under `work-links: body-text`; a record isn't eligible while any `Blocked by #N` line still names an open issue), but `--limit 200` can silently truncate that pull on a repo with more open issues than that. Rather than raise the cap and still have the same failure mode at a higher threshold, any referenced dependency number the capped pull didn't confirm as open gets one targeted `gh issue view --json state` check of its own — bounded by how many distinct blockers this firing's `auto:build`-eligible records actually reference (typically a handful), not by the repo's total open-issue count. Grouping still runs before claiming, unlike the pre-grants design, so the full issue body/labels/createdAt needed for eligibility, dependency-checking, and `extractKeyFiles` is already in hand from the first pull.

The **first** pull (`--label auto:build`, `--limit 500`) is the actual candidate pool every later step operates on — unlike the second pull's targeted per-dependency fallback above, there is no equivalent per-record recovery for a truncated queue pull, since a silently-dropped record's number was never fetched at all. `--limit 500` is a high-enough ceiling that truncation should be rare in practice, but on a repo with more than 500 open `auto:build` records the pull would still silently drop the oldest same-priority ones — exactly what `next`'s own oldest-first tie-break (Step 3) exists to surface first. The `QUEUE_RAW_COUNT` check above catches exactly this: an exact-cap-count result logs a stderr warning for this firing rather than failing silently with no trace at all.

**`work-links: native` support.** Under `work-links: native`, one additional batched `gh api graphql` call (`buildNativeDependencyQuery`/`hasOpenNativeBlocker`, `bin/lib/issues/record.js`) queries every eligible candidate's native `blockedBy` connection in a single aliased request and drops any candidate with an `OPEN` native blocker — the same outcome `parseDependencies` already produces for an open `Blocked by #N` body-text line under `work-links: body-text`. The two modes are mutually exclusive per record, mirroring `flow/materialize.md`'s existing `blocked-by` driver/work-links branching — a project mid-migration with stale body-text lines under `native` is out of scope. The GraphQL call fails safe: on any error (network, auth, or a schema mismatch — e.g. a GitHub Enterprise host exposing only `issueDependenciesSummary`, not `blockedBy`) it logs a warning and falls back to no native filtering for that run rather than crashing Step 2's queue-build entirely — a missed native-dependency check degrades to the pre-`work-links: native` behavior, not a hard failure of headless dispatch.

The same fallback also triggers when `gh` itself is absent — there is no GraphQL passthrough on the MCP path, so a `work-links: native` project running headless without `gh` degrades to no native filtering for that run, identically to any other query failure. This is not a new code path — it's the existing on-error fallback reached via a capability check instead of a failed call.

The `bot:*` filter here is the cheap label-based pre-filter — labels are projection, not truth (`_shared/work-record.md`). The authoritative unclaimed check is Step 4's atomic 201/422 claim attempt; a record can pass this pre-filter and still turn out contested by the time it's actually claimed. A group of size 1 is a **singleton**; size 2+ is a **bundle** — both dispatch the same way in Step 5, with a different `/flow` invocation shape only.

### Step 3: Select

**Zero eligible groups (all forms).** Step 2's `groups` array can legitimately be empty — the common steady state right after a dispatch drain, or after an `auto:build` queue with nothing new authorized since the last firing. This is not an error: report "nothing eligible this firing" and stop before Step 4 — do not render a zero-option `AskUserQuestion` (bare mode) or proceed with a `null` pick (`next`, whose ranking script below writes `null` to `/tmp/dispatch-next-pick.json` exactly for this case). A headless (`next`) firing with no eligible groups is a cheap no-op, per `routine-template.yml`'s own notes — report nothing and exit cleanly, no self-report, no `PushNotification`.

**Bare** `/dispatch` — render a batch table, one row per group from Step 2 (skip this and the rest of Step 3 entirely if the zero-groups case above applies):

```markdown
### Dispatch — {N} groups in the authorized queue

| # | Group | Records | Priority | Auto-merge? |
|---|---|---|---|---|
| 1 | bundle (2) | #123, #124 | high | no |
| 2 | singleton | #130 | — | yes |
```

Resolve `{effective-concurrent}` first — `--concurrent <n>` if present on this invocation (Input table above), else `dispatch-pick-max-concurrent` from Configuration below (CLI arg beats project policy, per `_shared/auto-mode-contract.md`'s precedence order). Then one `AskUserQuestion`:

- `question`: `"Which groups should this firing dispatch (up to {effective-concurrent} concurrently)?"`, `header`: `"Dispatch pick"`, `multiSelect`: `true`
- One option per group — `label`: the group's record numbers (e.g. `"#123, #124"`), `description`: titles + priority + whether it carries `auto:merge`. Pre-mark the top `{effective-concurrent}` groups, ranked by the `next` ordering below, as `(Recommended)`.

Selecting more groups than `{effective-concurrent}` is not an error — the extra selections queue and start as slots free (Step 5), same as overlapping `next` firings do across routine windows.

**`next`** — no human decision. Pick exactly ONE group by this literal ordering: `priority:high` > `priority:medium` > `priority:low` > unprioritized, oldest-first within each band. **A group's rank = its highest-priority member** — find each group's highest-priority (then oldest) member as its representative, then sort groups by that representative's priority band and `createdAt`. When `--priority <band>` (Input table above) is present, filter to only groups whose representative's band matches before ranking — this lets multiple differently-scheduled Routines each own a distinct slice of the queue instead of competing for the same top-of-queue pick:

```bash
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
  const groups = require('/tmp/dispatch-groups.json');
  const representative = (g) => g.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt))[0];
  const priorityFilter = process.argv[1] || null; // '--priority' value, or unset
  let candidates = groups.map((g) => ({ group: g, rep: representative(g) }));
  if (priorityFilter) candidates = candidates.filter((c) => c.rep.facets.priority === priorityFilter);
  const ranked = candidates
    .sort((x, y) => bandOf(x.rep) - bandOf(y.rep) || new Date(x.rep.createdAt) - new Date(y.rep.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0].group : null));
" "$PRIORITY_FILTER" > /tmp/dispatch-next-pick.json
```

A `null` result here (no eligible groups, or none matching `--priority`) is the zero-eligible-groups case documented at the top of this step — report nothing eligible and stop, do not proceed to Step 4.

`next` is the headless-safe unit — the only selection form a scheduled Routine ever fires (see Routine Configuration below), since it needs no `AskUserQuestion` answer to resolve.

**`#N`** — direct. Fetch issue `#N`, confirm it currently carries `auto:build` and no `bot:*` label (re-verify against Step 2's live queue, not a cached table); if it doesn't qualify, report why (no grant, already claimed, or blocked) and stop. Otherwise pull its **whole file-overlap group** from Step 2's output — claiming a single member of a group alone is forbidden; every one of that record's overlap partners comes along, whether or not the user named them.

**`#N[,#M,#O...]`** — explicit list. Parse the argument via `parseExplicitIssueList` (`bin/lib/issues/grouping.js`) into an array of issue numbers. Call `selectGroupsForExplicitList(requestedNumbers, groups)` (same file) against Step 2's already-computed `groups` array. Report every entry in the returned `notFound` list with why it's excluded — no `auto:build` grant, already claimed, or `bot:blocked` (re-check against Step 2's live queue, the same re-verification the singular `#N` form already does) — but do not abort the rest of the named set over one excluded entry. Every group in the returned `selectedGroups` proceeds to Step 4 exactly as a bare-mode pick would, still bound by `dispatch-pick-max-concurrent` (extra groups queue for a freed slot, same as bare mode's "more selections than the cap" case). Skip Step 3's `AskUserQuestion` entirely — the selection is already explicit; there is nothing to pick.

### Step 4: Claim the selected group (whole group, or none)

Per `_shared/issue-claims.md`'s group-claim rule: claim **all members of the group before
starting any**. Resolve the detection check once per run, not per issue (per
`_shared/github-write-transport.md`).

**gh CLI path** (`gh` on PATH): resolve the sha once per run, then for each member of the
selected group attempt the atomic ref creation exactly as `_shared/issue-claims.md`'s "The
lock" section describes:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
  # ... branch on the result below, per member
done
```

**MCP path** (`gh` unavailable): **not reachable in practice today** — Preflight hard-gates on
`gh` being installed (check 2), so dispatch never reaches this step without it. It is
documented here as groundwork for the follow-up that bridges the rest of dispatch's read path
(Step 2's queue pull, the dependency checks, the contested-claim comment fetch,
`settle-and-merge.md`), after which the gate can drop. Read it as future scope, not live
behavior.

For each member of the selected group, generate the claim payload and follow
`_shared/issue-claims.md`'s "The lock" section's MCP claim procedure — read the claim file
first, then branch on missing / tombstone-or-stale / live, rather than a bare create-only
write:

```bash
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
    console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
    sha:process.argv[2],runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
    host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$SHA" "$RUN_ID" > "/tmp/claim-payload-${ISSUE}.json"
  # Then run _shared/issue-claims.md's "The lock" MCP claim procedure against this payload's
  # claimPath on CLAIMS_BRANCH: read the file first; missing -> create_or_update_file omitting
  # sha; tombstone or TTL-stale -> the same call WITH sha = the file's current blob sha;
  # live and non-stale -> contested. Branch on that outcome below, per member, exactly as the
  # gh path branches on 201 vs 422.
done
```

**On success (claimed, either path):** bootstrap-then-add `bot:in-progress` (still a plain
label edit — `gh issue edit` or `issue_write` per the CRUD mapping in
`_shared/github-write-transport.md`), then post the claim comment (`claimPayload`'s
`commentBody`, unchanged regardless of which path claimed it):

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['bot:in-progress', 'Bot state: an agent currently holds the claim on this record']]
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$SHA" "$RUN_ID" > /tmp/claim-${ISSUE}.md
gh issue edit "$ISSUE" --add-label bot:in-progress
gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
# The MCP-path claim block above (Step 4) is not reachable in practice today — Preflight
# hard-gates on gh being installed — so these are the only live commands for this step.
```

**On 422 (contested):** fetch comments and fold through `claimStatus` exactly as `_shared/issue-claims.md`'s "Reading claim state" section describes, then branch on the full returned shape — do not collapse to a two-way live/stale fold:

```bash
gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" "/tmp/dispatch-claim-${ISSUE}.json"
```

Resolve the returned `{claimed, stale, everReleased}` shape per `_shared/issue-claims.md`'s own "Failure posture" table (not restated here — that file's header explicitly asks consumers not to duplicate it inline) — its four rows cover live claim (skip), stale claim (break: delete ref, recreate, takeover comment), unreadable/never-claimed (treat as live), and released-but-undeleted (treat as stale).

Any other `gh` failure during claim: skip, log, continue.

**Partial claim.** If any member of the group resolves to Skip (a live claim held elsewhere) or hits an unresolvable `gh` failure, the group cannot be fully claimed: release every member this firing already claimed this round (`releasePayload`, reason `never-started: file-overlap group partial claim`), log, and move to the next candidate group (bare, and `#N,#M,...` — per Step 3, an explicit-list group proceeds "exactly as a bare-mode pick would," so a partial-claim failure on one named group moves to the next named group rather than aborting the rest of the list) or report nothing eligible this firing (`next` / `#N`, which each name only one group to begin with). A Break outcome (stale-claim takeover) is not a partial-claim failure — it succeeds in claiming that member, so it never triggers the abort path on its own.

**`--claim-only` stop point.** When this modifier is present (Input table above), stop here for every successfully claimed group — do not proceed to Step 5. Report each claimed group's members, confirm `bot:in-progress` and the claim comment landed, and print the manual-release commands for each member (mirrors `_shared/issue-claims.md`'s "The lock" → Release):

(Preflight requires `gh`, so this is the only reachable release path today — see Step 4's note
above on the MCP-path claim block's current unreachability):

```bash
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-{n}"
gh issue edit {n} --remove-label bot:in-progress
```

Every Skip/Break/partial-claim outcome above is unaffected by this modifier — it only short-circuits the path between a *successful* claim and Step 5's Task-agent dispatch.

### Concurrency note (Preflight reads, not claim correctness)

Two `/dispatch` firings running close together (e.g. two terminals, or a Routine firing overlapping a human-run session) each do their own single Preflight read of CLAUDE.md's `work-backend` key. That read is not synchronized against a concurrent CLAUDE.md edit by a third actor (a human hand-edit, or another firing's own out-of-band fix) — one firing's Preflight can see different content than another's, purely from wall-clock timing. This is accepted, not engineered around, for the same reason `/claude-tweaks:backlog refine`'s own Concurrency section accepts its last-writer-wins label race: it's self-correcting (the next Preflight read picks up whatever state won) and never risks a double-build — Step 4's atomic claim ref, not the Preflight read, is the actual correctness boundary, and it's completely unaffected by what any concurrent Preflight check decided. Worst case is a firing bailing on a Preflight check that would have passed a few seconds later (or vice versa), not a corrupted claim or a double-build.

### Step 5: Dispatch — one Task agent per group

> **Parallel execution:** Dispatch every selected group as a parallel Task agent — each runs independently, owns its own worktree, and returns the GROUP/OUTCOME/MANIFEST template below. Assemble results after all agents complete.

Work through the selected group(s) — bare / `#N,#M,...`: as many as were picked, up to `{effective-concurrent}` (Step 3's resolved `--concurrent` override, or `dispatch-pick-max-concurrent` when absent) running at once, remainder queued for a freed slot; `next` / `#N`: exactly one. Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups). There is no per-firing timeout, only the concurrency throttle — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, already wait for all dispatched agents regardless of duration).

Export `CLAIM_RUN_ID="{RUN_ID}"` (this firing's run id — the same value already embedded in each member's claim marker by Step 4) before invoking `/claude-tweaks:flow`. `/flow` threads it through to `/wrap-up`'s release step (`cleanup-procedures.md` Section E) so the success-path ownership check compares against the run that actually made the claim, not `/flow`'s own (different, later-created) `PIPELINE_RUN_DIR` — see `_shared/issue-claims.md`'s Identity section.

**Singleton group** `[123]` — the agent's job is exactly today's single-record dispatch: invoke `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123`.

**Bundle group** `[123, 456]` — a granted record is already spec-shaped (`ready` + spec-shaped body per `_shared/work-record.md`); there is no per-member `/specify` pre-step to run first. That derivation loop is deleted — bundle materialization is `/flow`'s own concern (an opaque executor from dispatch's point of view):

```bash
CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456"
```

Each group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

```
Task scope: Execute claude-tweaks pipeline work for this already-claimed file-overlap group of
GitHub records: {issue list}. This firing's run id, for the ownership check in the Settle step,
is: {RUN_ID} -- the same value already embedded as runId in each of this group's claim markers
by Step 4. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue}`. Bundle (2+
issues) -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..."` once, comma-joined.
The CLAIM_RUN_ID export matters on the success path too, not just failures below -- /flow threads
it to /wrap-up's release step so its ownership check compares against the run that actually
claimed the record, not /flow's own later PIPELINE_RUN_DIR. Handle any HARD-GATE failure per
skills/dispatch/settle-and-merge.md's Settle procedure (retry ceiling / classification-driven
auto:merge revocation) before finishing -- do not leave a failed record's claim or label state
unresolved. That procedure's ownership check compares each record's claim.runId against the {RUN_ID} given above, not any run
id you generate yourself. If you reference any of these issue numbers in an intermediate commit
message during this run, write "refs #N" -- never "closes #N" or "fixes #N". The real closing
keyword is stamped once, at the end, by wrap-up's carrier commit or the merge commit
(close-via-merge, `_shared/issue-claims.md`) -- an early closing keyword on an intermediate commit
would close the record before the work is actually done.

Working directory: create your own worktree via /superpowers:using-git-worktrees; do not
reuse a path from another group. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to your own worktree.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

[Use: Standard model -- this dispatch wraps full pipeline execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes a full pipeline rather than returning findings/locations/a yes-no, so this is its own minimal template, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.

### Step 6: Settle — on pipeline failure, and the Auto-merge gate

Two conditional branches that don't run on the common clean pending-review path — a `/flow` HARD-GATE failure (Settle), or an `auto:merge`-granted group reaching `/wrap-up`'s Review Console (Auto-merge gate). Read `settle-and-merge.md` in this skill's directory for the full procedure: Settle's ownership check, `assess-agent-autonomy` failure classification, retry-ceiling counting and `bot:blocked` escalation; and the Auto-merge gate's two-layer check, the worktree-safe merge-then-push sequence, and conflict fallback.

## Reporting

Per-firing output is one group's outcome (bare mode with M ≤ `dispatch-pick-max-concurrent` groups: one report block per dispatched group) — there is **no consolidated multi-group console**. The old design's console existed to support `drain`; it dies with it (see When to Use above).

A headless (Routine-fired) firing's report has nobody live to read it — the durable trace is the label state change, the claim-comment trail, and `decisions.md`, not a rendered console. Over time, a human sees the aggregate picture via `/claude-tweaks:tidy`'s own periodic sweep (`tidy/SKILL.md`) — it scans GitHub state independently on its own cadence and surfaces `bot:blocked` records and stale claims without dispatch having to push anything to it directly.

`pending-review` outcomes park: the branch (and, for the group's `/flow`-created run dir) sit waiting for a human — an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it.

`PushNotification` fires only at the retry ceiling and for auto-merge FYIs (Step 6's Settle procedure and Auto-merge gate, both in `settle-and-merge.md`) — never per-firing just because a firing happened, to avoid notification fatigue.

## Configuration

These four rows mirror `_shared/work-record.md`'s canonical Config keys table (which every filing/shaping/dispatching skill is meant to cite rather than restate) — kept spelled out here too since this is the skill that actually reads and branches on them; check that file when a default or meaning changes to keep this copy in sync. Read from CLAUDE.md or `.claude-tweaks/policy.yml`:

| Flag | Default | Meaning |
|---|---|---|
| `dispatch-retry-ceiling` | `3` | Consecutive failures before a dispatched record gets `bot:blocked` and stops auto-retrying. |
| `automerge-max-lines` | `40` | Auto-merge blast-radius guideline on changed lines — a weighted input to `merge-check`'s judgment, not a hard cutoff. |
| `automerge-max-files` | `2` | Auto-merge blast-radius guideline on changed files — same weighted-not-cutoff treatment. |
| `dispatch-pick-max-concurrent` | `3` | Maximum groups (bundles or singleton records) a firing runs at once; remaining groups queue for a freed slot. |

**Legacy aliases:** the pre-grants keys `triage-retry-ceiling`, `triage-fast-track-max-lines`, `triage-fast-track-max-files`, and `triage-dispatch-max-concurrent` are still read as aliases for the four rows above, in that order, when the new key is absent — no project should have to rename its policy file just because this skill was renamed.

**Per-firing CLI overrides:** `--concurrent <n>` (Input table above) overrides `dispatch-pick-max-concurrent` for this invocation only, and `--priority <band>` filters the `next` form's candidate pool before ranking — neither writes back to CLAUDE.md/`policy.yml`. CLI arg beats project policy, per `_shared/auto-mode-contract.md`'s precedence order (CLI arg > pipeline config > project policy > skill default).

## Routine Configuration

`/dispatch` ships a routine template (`skills/dispatch/routine-template.yml`) whose prompt is `/claude-tweaks:dispatch next` — the headless-safe selection form from Step 3. Instantiate it for the current project with:

```
/claude-tweaks:routine create dispatch
```

**Migration note.** A cloud Routine created from `/claude-tweaks:triage`'s old template still fires `triage dispatch` — that skill no longer exists; grants now live at `/claude-tweaks:backlog refine` (see Relationship below). This cannot be detected or fixed from inside a `/dispatch` run — a live routine referencing a retired prompt isn't visible here. If you have a routine scheduled before this skill existed, re-create it now via the command above; the old one keeps firing a prompt that no longer does anything until you replace or delete it.

## Next Actions

Render only when a human is present to answer — the bare form is definitionally interactive (its own Step 3 pick already required one answer); `next` / `#N` / `#N,#M,...` render this block when a human typed the command directly or a prior skill (e.g. `/claude-tweaks:backlog refine`'s Next Actions) invoked it on a human's behalf, never when this firing came from a scheduled Routine (nobody is present to answer, and an unanswered question at the very end of a headless run is just noise):

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch again (Recommended)"`, `description`: `"/claude-tweaks:dispatch — pick from what's left in the authorized queue"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create dispatch — schedule 'dispatch next' as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see the authorized-queue size and bot:blocked records"`

## Component-Skill Contract

`/claude-tweaks:dispatch` is never invoked as a pipeline component by another skill — a human runs one of its four forms directly, or a scheduled Routine fires `/claude-tweaks:dispatch next` headlessly (see Routine Configuration above). See Next Actions above for the render/suppress rule.

`$PIPELINE_RUN_DIR` is not this skill's own state. Dispatch resolves its own standalone-auto run dir (per `_shared/pipeline-run-dir.md`'s allowlist) purely to write its own `decisions.md` — the claim/release/downgrade audit trail for this firing. Each dispatched group's `/claude-tweaks:flow` invocation creates a separate, later `PIPELINE_RUN_DIR` of its own for the actual pipeline execution; the two are never the same directory, which is exactly why Step 5 threads `CLAIM_RUN_ID` explicitly into the Task agent rather than relying on `/flow` inheriting dispatch's run id.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Adding `auto:build`, `auto:merge`, or `ready` from inside dispatch | Machinery may only remove or downgrade grants, never add them — the permission matrix's hard line (`_shared/work-record.md`). Dispatch selects on grants a human already gave; it never originates one. |
| Claiming a single member of a file-overlap group without its partners | Building one member alone would leave the branch and its overlap partners racing each other — `_shared/issue-claims.md`'s group-claim rule requires the whole group before starting any. |
| Letting a group auto-merge on a retry after a prior `correctness`-classified failure | The failure-downgrade rule exists specifically to prevent this — a `correctness` or `ambiguous` classification unconditionally revokes `auto:merge` before the next retry; only a `transient` classification preserves it. |
| Treating a clean review as sufficient for auto-merge on its own | `merge-check` weighs diff content, review findings, and blast radius together as one holistic judgment — a clean review alone doesn't guarantee `auto-merge`; a large or structurally sensitive diff can still verdict `needs-human` even with zero findings. |
| Retrying a failed record indefinitely with no ceiling | Wastes routine cycles on something fundamentally stuck and never surfaces it to a human — the retry ceiling exists to force a checkpoint. |
| Building a session that shepherds every authorized group to completion in one run | Context rot — a session babysitting N pipeline runs accumulates context until it degrades. Throughput comes from routine cadence × single-group firings, not session breadth. |
| Filing, closing, or granting authorization on records from inside dispatch | Dispatch is a *consumer* of what `/claude-tweaks:backlog refine` already granted — filing belongs to the health skills/`/claude-tweaks:capture`, granting belongs to `/claude-tweaks:backlog refine`. |
| Deriving a spec per bundle member before invoking `/flow` | A granted record is already spec-shaped (`ready` + spec-shaped body) — `/flow #A,#B` materializes directly. The old per-member `/specify` pre-step is deleted; don't reintroduce it. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:backlog` | `refine` mode is the human gate upstream — grants `auto:build` (optionally `+ auto:merge`) that dispatch selects on, and is the only mode that ever suggests a `priority:*` value (human-confirmed) dispatch's `next` form consumes for tie-break ordering. Dispatch never grants; it only strips or downgrades a grant on failure or at the retry ceiling. `refine` never claims or dispatches. |
| `/claude-tweaks:flow` | The executor dispatch hands claimed groups to — `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n}[,#{m}...]`. `/flow` is opaque to dispatch: materialization (spec derivation, multi-issue bundling) is `/flow`'s own concern, not dispatch's. |
| `_shared/issue-claims.md` | Defines the claim protocol (the lock, the mirror, the group-claim rule, release triggers, the ownership rule) that dispatch implements start to finish — claim in Step 4, release in Settle. |
| `_shared/work-record.md` | Taxonomy home — the seven-axis label contract and the permission-matrix row dispatch implements (`bot:in-progress` / `bot:blocked` add; `auto:merge` / `auto:*` / `bot:in-progress` remove; never add `auto:*` or `ready`). Also the canonical home of this skill's own `## Configuration` table's four rows (`dispatch-retry-ceiling`, `automerge-max-lines`, `automerge-max-files`, `dispatch-pick-max-concurrent`) — see that section's own cross-reference. |
| `/claude-tweaks:tidy` | Surfaces orphaned or stale claims dispatch left behind (Step 4.7) and `bot:blocked` records as re-authorization candidates; a headless firing's outcome ultimately surfaces on `/tidy`'s own periodic sweep rather than a console dispatch renders itself — see Reporting above. |
| `/claude-tweaks:wrap-up` | Releases the claim on success (cleanup Section E) using the `CLAIM_RUN_ID` dispatch threaded through `/flow`, not its own `PIPELINE_RUN_DIR` — the ownership check depends on this. The auto-merge gate's checks run against wrap-up's own Review Console output before it would otherwise render. |
| `/claude-tweaks:help` | Surfaces the `authorized` and `building` counts on the dashboard (Stage 1) — the reciprocal of `help/SKILL.md`'s own `/claude-tweaks:dispatch` row. |
| `/claude-tweaks:routine` | `/routine create dispatch` instantiates `skills/dispatch/routine-template.yml` as a scheduled headless dispatcher (`prompt: /claude-tweaks:dispatch next`). |
| `_shared/subagent-output-contract.md` | Each group's `Task()` prompt follows the contract's Input Discipline and status-line protocol; the GROUP/OUTCOME/MANIFEST template is this skill's own minimal shape (none of Templates A/B/C fit a full-pipeline-execution agent). |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for `bot:in-progress` / `bot:blocked` — the only two labels dispatch itself ever adds. |
| `_shared/pipeline-run-dir.md` | Dispatch resolves a standalone-auto run dir (allowlist) for its own `decisions.md`; distinct from the `PIPELINE_RUN_DIR` each dispatched `/flow` run creates for its own build — see Component-Skill Contract above. |
| `_shared/github-pr-scan.md` | Preflight runs its Detection Ladder (checks 1-3) before any `gh` command — unlike `/tidy`/`/help`'s fail-open use of the same ladder, dispatch treats any failure as a hard gate, check 2 (`gh` installed) included, since its read path has no MCP equivalent yet (see Preflight above). Dispatch consumes only the ladder, not the scope sections those two skills use. |
| `_shared/local-files-preflight-stop.md` | Canonical "stop this turn completely" boundary-language pattern this skill's Preflight local-files stop paragraph follows — added after the identical weaker phrasing was proven insufficient in `/claude-tweaks:triage`'s own Preflight (now `/claude-tweaks:backlog refine`'s grant sub-stage). |
| `bin/lib/issues/{claims,retry,grouping,record}.js` | The pure helpers behind claim/release payloads, retry-ceiling math, file-overlap grouping, and grant/bot-state facet parsing — dispatch calls all four, unchanged. Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue under `work-links: body-text`, and `buildNativeDependencyQuery`/`hasOpenNativeBlocker` to do the same against GitHub's native dependency relationship under `work-links: native`. |
| `/claude-tweaks:assess-agent-autonomy` | Called inline (not a fresh Task dispatch) at two points: the Auto-merge gate (`merge-check` mode, replacing the old three-layer mechanical check) and the Settle step (`failure-check` mode, replacing unconditional `auto:merge` revocation). Dispatch still owns authorization, claim mechanics, and retry-ceiling counting directly — assess-agent-autonomy only ever returns a verdict, never writes a label itself. |
