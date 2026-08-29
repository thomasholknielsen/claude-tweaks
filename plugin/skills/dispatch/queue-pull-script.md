# Dispatch Step 2 — The Queue-Pull Script

Referenced by `skills/dispatch/SKILL.md` Step 2. Run this verbatim — it produces this run's session-scoped `dispatch-groups.json` (`_shared/session-tmp-root.md`), the file-overlap-grouped eligible queue every selection form (bare, `next`, `#N`, `#N,#M,...`) reads next. It also produces `dispatch-blocked-excluded.json` — every otherwise-`auto:build`-eligible candidate this run's own blocked-by checks (body-text and, under `work-links: native`, the native `blockedBy` connection) dropped from the pool, each entry naming the blocker id(s) that excluded it (`{number, blockedBy: [ids]}[]`) — via `record.js`'s `partitionByOpenBodyBlockers` for the body-text case, and via `bin/resolve-blockers.js`'s `openBlockerIds` field for the `work-links: native` case — SKILL.md Step 2's Blocked-exclusion report reads this file so a shrinking pool is never silent. It also produces `dispatch-oversized-excluded.json` (#1228) — every file-overlap group `grouping.js`'s `partitionGroupsBySizeGuard` found over the size guard, each entry naming the group's members and size (`{records: number[], size, threshold}[]`). These groups stay IN `dispatch-groups.json` (`#N`/`#N,#M,...` still resolve them normally — a human present, explicitly naming one, is itself the required surfacing); only bare drain's auto-selection (SKILL.md Step 3, reusing the `next`-alias ranking script) reads this file to exclude an oversized group from its own candidate pool, since nobody is present there to see a table row or answer a prompt. SKILL.md Step 3's Oversized-exclusion report also reads this file so every form's exclusion (or non-exclusion) is surfaced, never silent.

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
    DISPATCH_NATIVE_DEPS_TMP: 'dispatch-native-deps.tmp.json',
    DISPATCH_NATIVE_DEPS_ERR: 'dispatch-native-deps.err',
    DISPATCH_GROUPS: 'dispatch-groups.json',
    DISPATCH_BLOCKED_EXCLUDED: 'dispatch-blocked-excluded.json',
    DISPATCH_OVERSIZED_EXCLUDED: 'dispatch-oversized-excluded.json',
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
DISPATCH_GROUP_SIZE_GUARD=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values dispatch-group-size-guard)
node -e "
  const { parseRecordFacets, parseDependencies } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const issues = require(process.argv[1]);
  const openNumbers = new Set(require(process.argv[2]).map((i) => i.number));
  const eligiblePreDep = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.grants.build && !i.facets.bot.inProgress && !i.facets.bot.blocked);
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
echo '{}' > "$DISPATCH_NATIVE_DEPS"
if [ "$WORK_LINKS" = "native" ]; then
  NATIVE_NUMS=$(node -e "console.log(require(process.argv[1]).map((i) => i.number).join(','))" "$DISPATCH_ELIGIBLE")
  if [ -n "$NATIVE_NUMS" ]; then
    if node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-blockers.js" "$NATIVE_NUMS" \
      > "$DISPATCH_NATIVE_DEPS_TMP" 2>"$DISPATCH_NATIVE_DEPS_ERR"; then
      mv "$DISPATCH_NATIVE_DEPS_TMP" "$DISPATCH_NATIVE_DEPS"
    else
      echo "Warning: native dependency query failed — falling back to no native filtering this run: $(cat "$DISPATCH_NATIVE_DEPS_ERR")" >&2
    fi
  fi
fi
node -e "
  const fs = require('fs');
  const { extractKeyFiles, expectsKeyFilesSection, groupByFileOverlap, partitionGroupsBySizeGuard } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grouping.js');
  const eligible = require(process.argv[1]);
  const nativeDeps = require(process.argv[2]);
  const finalEligible = [];
  const excludedNative = [];
  for (const c of eligible) {
    const dep = nativeDeps[c.number];
    const openIds = (dep && Array.isArray(dep.openBlockerIds)) ? dep.openBlockerIds : [];
    if (openIds.length > 0) excludedNative.push({ number: c.number, blockedBy: openIds });
    else finalEligible.push(c);
  }
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
  // Size guard (#1228): flagged, never removed from DISPATCH_GROUPS -- bare
  // and #N/#N,#M still resolve an oversized group normally (a human present,
  // explicitly naming/picking it, is itself the required surfacing). Only
  // the headless `next` ranking script (Step 3) reads this file to exclude
  // an oversized group from its own candidate pool, since nobody is present
  // there to see a table row or answer a prompt.
  const groupSizeGuard = parseInt(process.argv[6], 10);
  const { oversized, threshold } = partitionGroupsBySizeGuard(groups, { groupSizeGuard });
  fs.writeFileSync(process.argv[5], JSON.stringify(oversized.map((g) => ({ records: g.map((i) => i.number), size: g.length, threshold }))));
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" "$DISPATCH_OVERSIZED_EXCLUDED" "$DISPATCH_GROUP_SIZE_GUARD" > "$DISPATCH_GROUPS"
```

**MCP path** (`gh` unavailable): see `mcp-transport.md` in this skill's directory for the queue pull and the per-dependency open-state check. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.

**Queue-pull notes.** Read `queue-pull-notes.md` in this skill's directory when this repo sets `work-links: native` (the `bin/resolve-blockers.js` branch above), or when either pull returns exactly its `--limit` cap — it covers why the two bulk calls plus the bounded per-dependency fallback are shaped this way, what a truncated pull silently drops on each and which one has no per-record recovery, and the native query's fail-safe posture (including the `gh`-absent case). It changes nothing in the script above; skip it otherwise.
