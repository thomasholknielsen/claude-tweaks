# Dispatch Step 3 — The `next` Ranking Script

Referenced by `skills/dispatch/SKILL.md` Step 3 — reused by the bare drain's per-iteration loop
and its deprecated `next` alias (`--budget 1`, one iteration). Run this verbatim — it picks
exactly one group from `dispatch-groups.json` (`queue-pull-script.md`'s output) by priority band
(high > medium > low > unprioritized), oldest-first within a band, using each group's
highest-priority (then oldest) member as its representative. Also reads
`dispatch-oversized-excluded.json` (same file, `{records, size, threshold}[]`) and excludes any
group matching one of its record-number sets from the candidate pool entirely — a headless firing
has nobody present to see the Oversized-group report's surfaced line, so the bare drain (and its
`next` alias) is the form that must not auto-select an oversized group at all (#1228). Writes the picked group (or `null`,
when no candidate remains) to `dispatch-next-pick.json`.

**Also reads `dispatch-firing-excluded.json`** (a flat array of issue numbers, e.g. `[833, 1633]`)
— every record this same bare-drain firing already dispatched to a terminal outcome short of
`build-test-ok` (SKILL.md's Loop step appends to it; see the false assumption that file's
introduction corrects). Absent or unreadable is treated as `[]`, never an error — the file may not
exist yet on a firing's first iteration, and `next`'s single-iteration alias never needs it at all.
A group with any member on this list is excluded from the candidate pool for the rest of the
firing, exactly like an oversized group — the record's labels alone (`auto:build` present, no
`bot:blocked`) do not change on a claim-contest/in-flight stop or a pre-retry-ceiling build/test
failure, so without this file the same firing's very next iteration re-selects the identical group
and reproduces the identical stop.

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = { DISPATCH_GROUPS: 'dispatch-groups.json', DISPATCH_OVERSIZED_EXCLUDED: 'dispatch-oversized-excluded.json', DISPATCH_FIRING_EXCLUDED: 'dispatch-firing-excluded.json', DISPATCH_NEXT_PICK: 'dispatch-next-pick.json' };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
node -e "
  const fs = require('fs');
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
  const groups = require(process.argv[2]);
  // Size guard (#1228): exclude an oversized group from next's headless
  // candidate pool -- see queue-pull-script.md for the oversized set.
  const oversized = require(process.argv[3]);
  // This firing's own already-attempted-and-not-build-test-ok records
  // (SKILL.md's Loop step maintains this file) -- absent means nothing has
  // been excluded yet, not an error.
  const firingExcludedPath = process.argv[4];
  const firingExcluded = fs.existsSync(firingExcludedPath) ? require(firingExcludedPath) : [];
  const firingExcludedSet = new Set(firingExcluded);
  const sortedKey = (nums) => nums.slice().sort((a, b) => a - b).join(',');
  const oversizedKeys = new Set(oversized.map((o) => sortedKey(o.records)));
  const keyOf = (g) => sortedKey(g.map((r) => r.number));
  const eligibleGroups = groups.filter((g) => !oversizedKeys.has(keyOf(g)) && !g.some((r) => firingExcludedSet.has(r.number)));
  const representative = (g) => g.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt))[0];
  const priorityFilter = process.argv[1] || null; // '--priority' value, or unset
  let candidates = eligibleGroups.map((g) => ({ group: g, rep: representative(g) }));
  if (priorityFilter) candidates = candidates.filter((c) => c.rep.facets.priority === priorityFilter);
  const ranked = candidates
    .sort((x, y) => bandOf(x.rep) - bandOf(y.rep) || new Date(x.rep.createdAt) - new Date(y.rep.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0].group : null));
" "$PRIORITY_FILTER" "$DISPATCH_GROUPS" "$DISPATCH_OVERSIZED_EXCLUDED" "$DISPATCH_FIRING_EXCLUDED" > "$DISPATCH_NEXT_PICK"
```

A `null` result (no eligible groups, none matching `--priority`, every remaining group was
oversized, or every remaining group was already attempted this firing) is the zero-eligible-groups
case documented at the top of Step 3 — report nothing eligible and stop, do not proceed to Step 4.
