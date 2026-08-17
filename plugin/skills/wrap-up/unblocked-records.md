# Phase 3 — Newly Unblocked Records (record mode only)

The record this run just closed is already known — `record: {n}` from the materialized header (the same field the close-via-merge carrier commit used). Check whether closing it unblocked anything, purely informational — this must never gate, block, or delay the wrap-up; on any error, log and continue.

**`work-backend: github-issues`:** branches on `work-links` (same resolver read `/claude-tweaks:dispatch` Step 2 uses):

```bash
WORK_LINKS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links)
gh issue list --state open --json number,title,body --limit 200 > /tmp/wrapup-open-records.json
```

`work-links: body-text` — dependents are found via literal `Blocked by #N` body-text lines:

```bash
node -e "
  const { parseDependencies } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const records = require('/tmp/wrapup-open-records.json');
  const closedNum = ${CLOSED_NUM};
  const dependents = records
    .map((r) => ({ number: r.number, title: r.title, blockedBy: parseDependencies(r.body) }))
    .filter((r) => r.blockedBy.includes(closedNum));
  require('fs').writeFileSync('/tmp/wrapup-dependents.json', JSON.stringify(dependents));
"
```

If `dependents` is non-empty, check whether **every other** blocker (excluding the record that just closed) is also already resolved — one batch call, not one query per blocker id:

```bash
gh issue list --state all --json number,state --limit 200 > /tmp/wrapup-all-states.json
node -e "
  const dependents = require('/tmp/wrapup-dependents.json');
  const allStates = require('/tmp/wrapup-all-states.json');
  const stateOf = new Map(allStates.map((i) => [i.number, i.state]));
  const closedNum = ${CLOSED_NUM};
  const unblocked = dependents.filter((d) => d.blockedBy.every((b) => b === closedNum || stateOf.get(b) === 'CLOSED'));
  require('fs').writeFileSync('/tmp/wrapup-unblocked.json', JSON.stringify(unblocked));
"
```

`work-links: native` — `parseDependencies` matches nothing (native links write no body text at all per `_shared/work-record.md`), so this branch instead reuses `bin/lib/issues/record.js`'s `buildNativeDependencyQuery`/`hasOpenNativeBlocker`, the same pair `/claude-tweaks:dispatch` Step 2 and `flow/materialize.md` already use for this mode. One batched, aliased GraphQL query over every open record's number returns each record's `blockedBy` connection with each blocker's live `state` in the same response, so — unlike the body-text branch — no second all-states call is needed:

```bash
node -e "
  const { buildNativeDependencyQuery } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const records = require('/tmp/wrapup-open-records.json');
  const query = buildNativeDependencyQuery(records.map((r) => r.number));
  if (query) require('fs').writeFileSync('/tmp/wrapup-native-query.graphql', query);
"
echo '{"data":{"repository":{}}}' > /tmp/wrapup-native-deps.json
if [ -s /tmp/wrapup-native-query.graphql ]; then
  OWNER_REPO=$(gh repo view --json owner,name -q '.owner.login + " " + .name')
  if gh api graphql -f query="$(cat /tmp/wrapup-native-query.graphql)" \
    -f owner="$(echo "$OWNER_REPO" | cut -d' ' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d' ' -f2)" \
    > /tmp/wrapup-native-deps.tmp.json 2>/tmp/wrapup-native-deps.err; then
    mv /tmp/wrapup-native-deps.tmp.json /tmp/wrapup-native-deps.json
  else
    echo "Warning: native dependency query failed — skipping newly-unblocked check this run: $(cat /tmp/wrapup-native-deps.err)" >&2
  fi
fi
node -e "
  const { hasOpenNativeBlocker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const records = require('/tmp/wrapup-open-records.json');
  const repoData = require('/tmp/wrapup-native-deps.json').data.repository;
  const closedNum = ${CLOSED_NUM};
  const unblocked = records
    .filter((r) => {
      const node = repoData['i' + r.number];
      const nodes = node && node.blockedBy && node.blockedBy.nodes;
      return Array.isArray(nodes) && nodes.some((n) => n && n.number === closedNum);
    })
    .filter((r) => !hasOpenNativeBlocker(repoData['i' + r.number]))
    .map((r) => ({ number: r.number, title: r.title }));
  require('fs').writeFileSync('/tmp/wrapup-unblocked.json', JSON.stringify(unblocked));
"
```

On any GraphQL error this fails safe — skip the check for this run (an empty `wrapup-unblocked.json`) rather than blocking wrap-up, matching this section's own "must never gate, block, or delay the wrap-up" rule above and dispatch's identical native-mode fallback.

**`work-backend: local-files`:**

```bash
node -e "
  const { queryRecords, readRecord } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const glob = require('fs').readdirSync('specs').filter((f) => /^\d+-.*\.md\$/.test(f));
  const closedNum = ${CLOSED_NUM};
  const openRecords = queryRecords('specs', {}); // excludes closed by default — correct for finding open dependents
  const dependents = openRecords
    .map((r) => ({ id: r.id, title: r.title, blockedBy: r.facets.blockedBy || [] }))
    .filter((r) => r.blockedBy.includes(closedNum));
  const isBlockerResolved = (id) => {
    const file = glob.find((f) => f.startsWith(id + '-'));
    if (!file) return true; // already gone — treat as resolved
    const r = readRecord('specs/' + file);
    return r.facets.closed === true;
  };
  const unblocked = dependents.filter((d) => d.blockedBy.every((b) => b === closedNum || isBlockerResolved(b)));
  require('fs').writeFileSync('/tmp/wrapup-unblocked.json', JSON.stringify(unblocked));
"
```

For every record in the resulting `/tmp/wrapup-unblocked.json`: log one line to `decisions.md` (`AUTO {time} — Unblocked records: closing #{n} unblocked #{m} ("{title}"). Reversibility: n/a (informational).`), and carry it forward as this run's "newly unblocked" signal — feeds the `## Next Actions` table in `SKILL.md` and the Pipeline Summary's Key Outputs.
