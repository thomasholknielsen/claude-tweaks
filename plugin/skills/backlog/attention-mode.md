# Backlog — Attention Mode

Read-only, like `overview` mode — no writes, no grants. Unifies discovery of every open record
carrying `needs:definition` or `solution:unjustified` into one ranked list with a per-row,
type-differentiated recommended action. This is the "what does the backlog need from me today"
surface — distinct from `/claude-tweaks:help`'s Triage Queue (awaiting authorization, flagged or
not) and Acceptance Queue (awaiting sign-off), which cover different concerns.

## Step 1: Fetch

Two separate `gh issue list` calls — `--label` ANDs multiple values passed to the same flag, so a
single call with both labels would return only records carrying both (nearly always empty), not
either:

```bash
gh issue list --state open --label needs:definition --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-needs-definition.json
gh issue list --state open --label solution:unjustified --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-solution-unjustified.json
gh issue list --state open --label ready --label shaped:headless --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-shaped-headless.json
```

If either fetch returns exactly `200` results, state that in the rendered output — the same
"may be more, here's the count" convention `/claude-tweaks:help`'s own fetches use — rather than
silently treating it as complete. The `shaped-headless` fetch additionally needs `auto:build`
excluded, done in Step 2's merge script (below) rather than via a `gh` query flag — `gh issue
list --label` only ANDs, it has no exclusion flag, matching this file's own established idiom of
doing set logic in the `node -e` merge step rather than the `gh` query.

## Step 2: Merge and dedupe

Merge by issue number. A record's number appearing in both fetches is not assumed impossible —
no automated path stamps both labels today, but a human can always add either label directly, so
the merge must not assume the two fetches are disjoint. When a number appears in both, render
**one row** for it: `Type` reads `needs:definition + solution:unjustified`, and `Recommended
action` concatenates both remedies (`needs:definition`'s redirect action first, then
`solution:unjustified`'s grant-or-evidence action, semicolon-separated). A record can in principle
carry all three — e.g. `needs:definition` + `shaped:headless` (a headlessly-shaped record whose
own guard routed it to `needs:definition` — #968's Framing Guard) — the same one-row-per-number,
concatenated-action convention applies; `types` is always rendered in fetch order
(`needs:definition`, `solution:unjustified`, `shaped:headless (no grant)`) for a deterministic
Type column.

```bash
node -e "
  const needsDefinition = require('/tmp/backlog-attention-needs-definition.json');
  const solutionUnjustified = require('/tmp/backlog-attention-solution-unjustified.json');
  const shapedHeadless = require('/tmp/backlog-attention-shaped-headless.json')
    .filter((r) => !r.labels.some((l) => l.name === 'auto:build'));
  const byNumber = new Map();
  for (const r of needsDefinition) byNumber.set(r.number, { ...r, types: ['needs:definition'] });
  for (const r of solutionUnjustified) {
    const existing = byNumber.get(r.number);
    if (existing) existing.types.push('solution:unjustified');
    else byNumber.set(r.number, { ...r, types: ['solution:unjustified'] });
  }
  for (const r of shapedHeadless) {
    const existing = byNumber.get(r.number);
    if (existing) existing.types.push('shaped:headless (no grant)');
    else byNumber.set(r.number, { ...r, types: ['shaped:headless (no grant)'] });
  }
  console.log(JSON.stringify([...byNumber.values()]));
" > /tmp/backlog-attention-merged.json
```

## Step 3: Rank

Priority band first (`priority:high` > `priority:medium` > `priority:low`), then oldest
`createdAt` first within a band — the identical two-key ordering `/claude-tweaks:dispatch`'s own
`next` ranking uses (`dispatch/SKILL.md`'s Step 3), not a third scheme. A record with no priority
label sorts after every banded record, ordered among themselves by `createdAt` only.

```bash
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const BAND_ORDER = { high: 0, medium: 1, low: 2 };
  const records = require('/tmp/backlog-attention-merged.json');
  const ranked = records
    .map((r) => ({ ...r, priority: parseRecordFacets(r.labels).priority }))
    .sort((a, b) => {
      const bandA = a.priority && BAND_ORDER[a.priority] !== undefined ? BAND_ORDER[a.priority] : 3;
      const bandB = b.priority && BAND_ORDER[b.priority] !== undefined ? BAND_ORDER[b.priority] : 3;
      if (bandA !== bandB) return bandA - bandB;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  console.log(JSON.stringify(ranked));
" > /tmp/backlog-attention-ranked.json
```

## Step 4: Render

One markdown table, one row per record:

```markdown
## Backlog — Needs Attention

| Record | Type | Filed | Recommended action |
|--------|------|-------|---------------------|
| #{n} | needs:definition | {createdAt, relative} | run /claude-tweaks:specify #{n} to route through brainstorming |
| #{n} | solution:unjustified | {createdAt, relative} | run /claude-tweaks:backlog refine #{n} to grant despite the flag (accept risk), or add evidence to Current State and re-run /claude-tweaks:specify #{n} first |
| #{n} | shaped:headless (no grant) | {createdAt, relative} | run /claude-tweaks:backlog refine #{n} to grant (spec was headlessly shaped — no human has reviewed it) |
| #{n} | needs:definition + solution:unjustified | {createdAt, relative} | run /claude-tweaks:specify #{n} to route through brainstorming; run /claude-tweaks:backlog refine #{n} to grant despite the flag (accept risk), or add evidence to Current State and re-run /claude-tweaks:specify #{n} first |

Pick up next: #{n} "{title}" — {oldest/highest-priority reason}.
```

`needs:definition` rows recommend `run /claude-tweaks:specify #{n} to route through
brainstorming`. `solution:unjustified` rows recommend `run /claude-tweaks:backlog refine #{n} to
grant despite the flag (accept risk), or add evidence to Current State and re-run
/claude-tweaks:specify #{n} first` — naming `/backlog refine` explicitly as the actual grant
mechanism, since this mode itself performs no grant. `shaped:headless (no grant)` rows recommend
`run /claude-tweaks:backlog refine #{n} to grant (spec was headlessly shaped — no human has
reviewed it)` — naming `/backlog refine` explicitly, same as the `solution:unjustified` row,
since this mode itself performs no grant. The trailing "Pick up next" line names the
single oldest/highest-priority record across all types — the same shape `overview` mode's own
"what to build next" recommendation uses.

When the merged list is empty, render `Nothing needs attention — no open record carries
needs:definition or solution:unjustified.` instead of an empty table, and omit the "Pick up next"
line.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| A single `gh issue list --label needs:definition --label solution:unjustified` call | `--label` ANDs multiple values within one call — this returns only records carrying both, nearly always empty |
| Granting, closing, or shaping anything from this mode | Read-only, like `overview` — the recommended actions are for the human to run, never executed here |
| Inventing a third ranking scheme | Reuse `/claude-tweaks:dispatch`'s existing priority-band-then-age ordering |
| Two rows for a record carrying both labels | Dedupe by issue number and render one row with a concatenated Type/Recommended action |
