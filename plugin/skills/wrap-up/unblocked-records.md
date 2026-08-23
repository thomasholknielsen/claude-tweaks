# Phase 3 — Newly Unblocked Records (record mode only)

The record this run just closed is already known — the `${CLOSED_NUM}` value passed into this step (the only source every snippet below actually reads; there is no materialized-header field consumed here). Check whether closing it unblocked anything, purely informational — this must never gate, block, or delay the wrap-up; on any error, log and continue.

**`work-backend: github-issues`:** branches on `work-links` (same resolver read `/claude-tweaks:dispatch` Step 2 uses):

```bash
WORK_LINKS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links)
gh issue list --state open --json number,title,body --limit 200 > /tmp/wrapup-open-records.json
```

`work-links: body-text` — dependents are found via literal `Blocked by #N` body-text lines:

```bash
node -e "
  const { parseDependencies } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
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

`work-links: native` — `parseDependencies` matches nothing (native links write no body text at all per `_shared/work-record.md`), so this branch instead calls `bin/resolve-blockers.js` — the single-invocation CLI wrapping `bin/lib/issues/native-dependencies.js`'s `fetchNativeDependencies` (the same underlying function `/claude-tweaks:dispatch` Step 2 and `flow/materialize.md` use for this mode) rather than hand-rolling `gh api graphql` with bound variables, which a worktree-isolated session's compound-Bash refusal blocks (`_shared/scratch-worktree.md`'s Shell constraint section). Pass every open record's number as ONE comma-joined list — the CLI batches them into a single aliased GraphQL query, exactly like the hand-rolled version it replaces, so this is still one network round trip regardless of how many open records exist:

```bash
node -e "
  const { execFileSync } = require('child_process');
  const records = require('/tmp/wrapup-open-records.json');
  const closedNum = ${CLOSED_NUM};
  let byNumber = {};
  if (records.length) {
    try {
      const out = execFileSync('node', ['${CLAUDE_PLUGIN_ROOT}/bin/resolve-blockers.js', records.map((r) => r.number).join(',')], { encoding: 'utf8' });
      byNumber = JSON.parse(out.trim());
    } catch (e) {
      console.error('Warning: native dependency query failed — skipping newly-unblocked check this run:', e.message);
    }
  }
  const unblocked = records
    .filter((r) => byNumber[r.number] && byNumber[r.number].blockedBy.includes(closedNum) && !byNumber[r.number].openBlocker)
    .map((r) => ({ number: r.number, title: r.title }));
  require('fs').writeFileSync('/tmp/wrapup-unblocked.json', JSON.stringify(unblocked));
"
```

`byNumber[r.number].openBlocker` reflects LIVE blocker state at query time, run after this session already closed `${CLOSED_NUM}` — so a `false` here means every one of the record's blockers, `${CLOSED_NUM}` included, is now resolved, without needing to special-case `closedNum` out of the check. On any error this fails safe — skip the check for this run (an empty `wrapup-unblocked.json`) rather than blocking wrap-up, matching this section's own "must never gate, block, or delay the wrap-up" rule above and dispatch's identical native-mode fallback.

**`work-backend: local-files`:**

```bash
node -e "
  const { queryRecords, readRecord } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js');
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
