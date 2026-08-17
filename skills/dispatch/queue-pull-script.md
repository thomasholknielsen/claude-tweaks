# Dispatch Step 2 — The Queue-Pull Script

Referenced by `skills/dispatch/SKILL.md` Step 2. Run this verbatim — it produces `/tmp/dispatch-groups.json`, the file-overlap-grouped eligible queue every selection form (bare, `next`, `#N`, `#N,#M,...`) reads next.

```bash
gh issue list --label auto:build --state open --json number,title,body,labels,createdAt --limit 500 > /tmp/dispatch-queue-raw.json
QUEUE_RAW_COUNT=$(node -e "console.log(require('/tmp/dispatch-queue-raw.json').length)")
if [ "$QUEUE_RAW_COUNT" -ge 500 ]; then
  echo "Warning: the auto:build queue pull returned exactly the --limit cap (500) — this repo may have more open auto:build records than fetched. gh issue list returns newest-first, so any records beyond the cap are the OLDEST same-priority ones, exactly what next's own oldest-first tie-break (Step 3) exists to surface first. Consider raising the cap, or filing this as a signal to re-triage the queue down." >&2
fi
gh issue list --state open --json number --limit 200 > /tmp/dispatch-open-numbers.json
WORK_LINKS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links)
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
  const { extractKeyFiles, expectsKeyFilesSection, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const eligible = require('/tmp/dispatch-eligible.json');
  const repoData = require('/tmp/dispatch-native-deps.json').data.repository;
  const finalEligible = eligible.filter((i) => !hasOpenNativeBlocker(repoData['i' + i.number]));
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byIssue = new Map(finalEligible.map((i) => [i.number, i]));
  for (const item of items) {
    if (item.keyFiles.length === 0 && expectsKeyFilesSection(byIssue.get(item.id))) {
      console.error('Warning: eligible record #' + item.id + ' has no ### Key Files subsection — overlap detection disabled for it.');
    }
  }
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
" > /tmp/dispatch-groups.json
```

**MCP path** (`gh` unavailable): see `mcp-transport.md` in this skill's directory for the queue pull and the per-dependency open-state check. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.

**Queue-pull notes.** Read `queue-pull-notes.md` in this skill's directory when this repo sets `work-links: native` (the `gh api graphql` branch above), or when either pull returns exactly its `--limit` cap — it covers why the two bulk calls plus the bounded per-dependency fallback are shaped this way, what a truncated pull silently drops on each and which one has no per-record recovery, and the native query's fail-safe posture (including the `gh`-absent case). It changes nothing in the script above; skip it otherwise.
