# Dispatch Step 3 — The `next` Ranking Script

Referenced by `skills/dispatch/SKILL.md` Step 3's `next` form. Run this verbatim — it picks
exactly one group from `dispatch-groups.json` (`queue-pull-script.md`'s output) by priority band
(high > medium > low > unprioritized), oldest-first within a band, using each group's
highest-priority (then oldest) member as its representative. Also reads
`dispatch-oversized-excluded.json` (same file, `{records, size, threshold}[]`) and excludes any
group matching one of its record-number sets from the candidate pool entirely — a headless firing
has nobody present to see the Oversized-group report's surfaced line, so `next` is the one form
that must not auto-select an oversized group at all (#1228). Writes the picked group (or `null`,
when no candidate remains) to `dispatch-next-pick.json`.

```bash
eval "$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  const os = require('os'); const path = require('path');
  const files = { DISPATCH_GROUPS: 'dispatch-groups.json', DISPATCH_OVERSIZED_EXCLUDED: 'dispatch-oversized-excluded.json', DISPATCH_NEXT_PICK: 'dispatch-next-pick.json' };
  for (const [varName, filename] of Object.entries(files)) {
    const p = sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, filename) || path.join(os.tmpdir(), filename);
    console.log(varName + '=' + JSON.stringify(p));
  }
")"
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
  const groups = require(process.argv[2]);
  // Size guard (#1228): exclude an oversized group from next's headless
  // candidate pool -- see queue-pull-script.md for the oversized set.
  const oversized = require(process.argv[3]);
  const oversizedKeys = new Set(oversized.map((o) => o.records.slice().sort((a, b) => a - b).join(',')));
  const keyOf = (g) => g.map((r) => r.number).sort((a, b) => a - b).join(',');
  const eligibleGroups = groups.filter((g) => !oversizedKeys.has(keyOf(g)));
  const representative = (g) => g.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt))[0];
  const priorityFilter = process.argv[1] || null; // '--priority' value, or unset
  let candidates = eligibleGroups.map((g) => ({ group: g, rep: representative(g) }));
  if (priorityFilter) candidates = candidates.filter((c) => c.rep.facets.priority === priorityFilter);
  const ranked = candidates
    .sort((x, y) => bandOf(x.rep) - bandOf(y.rep) || new Date(x.rep.createdAt) - new Date(y.rep.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0].group : null));
" "$PRIORITY_FILTER" "$DISPATCH_GROUPS" "$DISPATCH_OVERSIZED_EXCLUDED" > "$DISPATCH_NEXT_PICK"
```

A `null` result (no eligible groups, none matching `--priority`, or every remaining group was
oversized) is the zero-eligible-groups case documented at the top of Step 3 — report nothing
eligible and stop, do not proceed to Step 4.
