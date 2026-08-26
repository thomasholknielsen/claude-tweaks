# Dispatch Step 2 — The Queue-Pull Script

Referenced by `skills/dispatch/SKILL.md` Step 2. Run this verbatim — it produces this run's session-scoped `dispatch-groups.json` (`_shared/session-tmp-root.md`), the file-overlap-grouped eligible queue every selection form (bare, `next`, `#N`, `#N,#M,...`) reads next. It also produces `dispatch-blocked-excluded.json` — every otherwise-`auto:build`-eligible candidate this run's own blocked-by checks (body-text and, under `work-links: native`, the native `blockedBy` connection) dropped from the pool, each entry naming the blocker id(s) that excluded it (`{number, blockedBy: [ids]}[]`) via `record.js`'s `partitionByOpenBodyBlockers`/`partitionByOpenNativeBlockers` — SKILL.md Step 2's Blocked-exclusion report reads this file so a shrinking pool is never silent.

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = {
    DISPATCH_QUEUE_RAW: 'dispatch-queue-raw.json',
    DISPATCH_OPEN_NUMBERS: 'dispatch-open-numbers.json',
    DISPATCH_ELIGIBLE_PRE_DEP: 'dispatch-eligible-pre-dep.json',
    DISPATCH_UNRESOLVED_DEPS: 'dispatch-unresolved-deps.json',
    DISPATCH_VERIFIED_OPEN_DEPS: 'dispatch-verified-open-deps.txt',
    DISPATCH_ELIGIBLE: 'dispatch-eligible.json',
    DISPATCH_BLOCKED_EXCLUDED_BODY: 'dispatch-blocked-excluded-body.json',
    DISPATCH_NATIVE_DEPS: 'dispatch-native-deps.json',
    DISPATCH_NATIVE_QUERY: 'dispatch-native-query.graphql',
    DISPATCH_NATIVE_DEPS_TMP: 'dispatch-native-deps.tmp.json',
    DISPATCH_NATIVE_DEPS_ERR: 'dispatch-native-deps.err',
    DISPATCH_GROUPS: 'dispatch-groups.json',
    DISPATCH_BLOCKED_EXCLUDED: 'dispatch-blocked-excluded.json',
  };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"

gh issue list --label auto:build --state open --json number,title,body,labels,createdAt --limit 500 > "$DISPATCH_QUEUE_RAW"
QUEUE_RAW_COUNT=$(node -e "console.log(require(process.argv[1]).length)" "$DISPATCH_QUEUE_RAW")
if [ "$QUEUE_RAW_COUNT" -ge 500 ]; then
  echo "Warning: the auto:build queue pull returned exactly the --limit cap (500) — this repo may have more open auto:build records than fetched. gh issue list returns newest-first, so any records beyond the cap are the OLDEST same-priority ones, exactly what next's own oldest-first tie-break (Step 3) exists to surface first. Consider raising the cap, or filing this as a signal to re-triage the queue down." >&2
fi
gh issue list --state open --json number --limit 200 > "$DISPATCH_OPEN_NUMBERS"
WORK_LINKS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links)
node -e "
  const { parseRecordFacets, parseDependencies } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const issues = require(process.argv[1]);
  const openNumbers = new Set(require(process.argv[2]).map((i) => i.number));
  const eligiblePreDep = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.grants.build && !i.facets.bot.inProgress && !i.facets.bot.blocked && !i.facets.bot.parked);
  // '--limit 200' can silently truncate the open-issues pull on a repo with more open
  // issues than that — a dependency number absent from openNumbers means 'not in the
  // fetched 200', not 'closed'. Collect those as unresolved for a targeted live check below
  // rather than treating the absence as proof the blocker is closed.
  const unresolved = [...new Set(eligiblePreDep.flatMap((i) => parseDependencies(i.body)).filter((dep) => !openNumbers.has(dep)))];
  require('fs').writeFileSync(process.argv[3], JSON.stringify(eligiblePreDep));
  require('fs').writeFileSync(process.argv[4], JSON.stringify(unresolved));
" "$DISPATCH_QUEUE_RAW" "$DISPATCH_OPEN_NUMBERS" "$DISPATCH_ELIGIBLE_PRE_DEP" "$DISPATCH_UNRESOLVED_DEPS"
: > "$DISPATCH_VERIFIED_OPEN_DEPS"
for DEP in $(node -e "console.log(require(process.argv[1]).join(' '))" "$DISPATCH_UNRESOLVED_DEPS"); do
  STATE=$(gh issue view "$DEP" --json state -q .state 2>/dev/null)
  if [ "$STATE" = "OPEN" ]; then echo "$DEP" >> "$DISPATCH_VERIFIED_OPEN_DEPS"; fi
done
node -e "
  const fs = require('fs');
  const { partitionByOpenBodyBlockers } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const eligiblePreDep = require(process.argv[1]);
  const openNumbers = new Set(require(process.argv[2]).map((i) => i.number));
  const verifiedOpen = fs.existsSync(process.argv[3])
    ? fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean).map(Number)
    : [];
  for (const dep of verifiedOpen) openNumbers.add(dep);
  const { eligible, excluded } = partitionByOpenBodyBlockers(eligiblePreDep, openNumbers);
  fs.writeFileSync(process.argv[4], JSON.stringify(eligible));
  fs.writeFileSync(process.argv[5], JSON.stringify(excluded));
" "$DISPATCH_ELIGIBLE_PRE_DEP" "$DISPATCH_OPEN_NUMBERS" "$DISPATCH_VERIFIED_OPEN_DEPS" "$DISPATCH_ELIGIBLE" "$DISPATCH_BLOCKED_EXCLUDED_BODY"
echo '{"data":{"repository":{}}}' > "$DISPATCH_NATIVE_DEPS"
if [ "$WORK_LINKS" = "native" ]; then
  rm -f "$DISPATCH_NATIVE_QUERY"
  node -e "
    const { buildNativeDependencyQuery } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
    const eligible = require(process.argv[1]);
    const query = buildNativeDependencyQuery(eligible.map((i) => i.number));
    if (query) require('fs').writeFileSync(process.argv[2], query);
  " "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_QUERY"
  if [ -s "$DISPATCH_NATIVE_QUERY" ]; then
    OWNER_REPO=$(gh repo view --json owner,name -q '.owner.login + " " + .name')
    if gh api graphql -f query="$(cat "$DISPATCH_NATIVE_QUERY")" \
      -f owner="$(echo "$OWNER_REPO" | cut -d' ' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d' ' -f2)" \
      > "$DISPATCH_NATIVE_DEPS_TMP" 2>"$DISPATCH_NATIVE_DEPS_ERR"; then
      mv "$DISPATCH_NATIVE_DEPS_TMP" "$DISPATCH_NATIVE_DEPS"
    else
      echo "Warning: native dependency query failed — falling back to no native filtering this run: $(cat "$DISPATCH_NATIVE_DEPS_ERR")" >&2
    fi
  fi
fi
node -e "
  const fs = require('fs');
  const { partitionByOpenNativeBlockers } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const { extractKeyFiles, expectsKeyFilesSection, groupByFileOverlap } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grouping.js');
  const eligible = require(process.argv[1]);
  const repoData = require(process.argv[2]).data.repository;
  const { eligible: finalEligible, excluded: excludedNative } = partitionByOpenNativeBlockers(eligible, repoData);
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  for (const item of items) {
    if (item.keyFiles.length === 0 && expectsKeyFilesSection(byId.get(item.id))) {
      console.error('Warning: eligible record #' + item.id + ' has no ### Key Files subsection — overlap detection disabled for it.');
    }
  }
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
  const excludedBody = require(process.argv[3]);
  fs.writeFileSync(process.argv[4], JSON.stringify([...excludedBody, ...excludedNative]));
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" > "$DISPATCH_GROUPS"
```

**MCP path** (`gh` unavailable): see `mcp-transport.md` in this skill's directory for the queue pull and the per-dependency open-state check. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.

**Queue-pull notes.** Read `queue-pull-notes.md` in this skill's directory when this repo sets `work-links: native` (the `gh api graphql` branch above), or when either pull returns exactly its `--limit` cap — it covers why the two bulk calls plus the bounded per-dependency fallback are shaped this way, what a truncated pull silently drops on each and which one has no per-record recovery, and the native query's fail-safe posture (including the `gh`-absent case). It changes nothing in the script above; skip it otherwise.
