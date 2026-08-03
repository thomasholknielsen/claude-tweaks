# Record Graph — Live Work-Record Queue Diagram

Used by `/claude-tweaks:visualize record-graph` only. Read from `SKILL.md`'s Step 1
once `<type>` resolves to `record-graph` — this file replaces Step 4 (baseline
authoring) entirely for this type, and supplies the D2 source `d2-enhanced-path.md`'s
Step 1 hands to the `d2` binary for the enhanced path. No topic is ever resolved for
this type; skip Input's "if `$ARGUMENTS` is empty, ask the user for both" entirely —
`record-graph` alone is a complete invocation.

## Step A: Fetch the open record queue

Run `_shared/record-queue-fetch.md`'s existing fetch procedure exactly as written,
with one addition: append `body` to `{EXTRA_FIELDS}` (needed for `Blocked by #N`
parsing below). This produces the same faceted-record JSON `/help`, `/tidy`, and
`/backlog` already consume — no new fetch logic, this type is one more consumer of
that shared procedure.

Also read `work-links` from the project's CLAUDE.md (`_shared/work-record.md`'s
Config keys table) — a missing key defaults to `body-text`, matching that table's
own default.

## Step B: Render

Resolve `--format` from `SKILL.md` Step 1's already-computed enhanced/baseline
decision: `d2` when enhanced, `svg` when baseline. Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/record-graph.js" render "{tmp-faceted-file}" \
  --format <d2|svg> \
  --work-links "$WORK_LINKS" \
  --fetch-limit "${BACKLOG_FETCH_LIMIT:-1000}" \
  --out "{destination-path}.{d2|html-fragment-scratch}"
```

For the **enhanced** path, `--out` targets the `.d2` source file at the same base
path as the eventual HTML output (matching `d2-enhanced-path.md` Step 1's existing
convention) — then continue at `d2-enhanced-path.md` Step 2 (`d2 --layout=elk`) and
Step 3 (re-theme) exactly as written for every other enhanced type. The re-theming
step's "map each distinct hex to the nearest project token, by role — use judgment,
there's no universal 1:1 mapping" guidance applies here too: this type's six-value
Origin fill palette will commonly map several origins onto the same nearest token
on a project with fewer than six accent-ish colors in `DESIGN.md` — an accepted,
inherited limitation of the existing generic mechanism, not something this type
works around.

For the **baseline** path, the render call's `svg` output IS the core fragment
`SKILL.md` Step 4 would otherwise author by hand — skip Step 4's own instructions
entirely for this type and pass this output straight to `visual-html-output.md`
Step 4's wrapper adapters.

## Step C: Placement (overrides SKILL.md Step 3's table for this type only)

`record-graph` always resolves to `docs/diagrams/record-graph.html` (+ `.d2` source
alongside it on the enhanced path) — regardless of whether this was a direct
invocation, `--source`, or `--ephemeral` was passed. Skip Step 3's persist-vs-
ephemeral `AskUserQuestion` entirely for this type: always persisted, always
overwritten and committed on every run. This is a deliberate override of the
general persist-vs-ephemeral rule — a live-state snapshot that isn't saved defeats
the point of a "living dashboard" file you regenerate on demand.

`SKILL.md` Step 6 (registry update) applies completely unchanged — this path
matches the existing `docs/diagrams/{slug}.html` fallback convention exactly, so
no new registry logic is needed here.

## Error handling

- **Zero open records** — `bin/record-graph.js` still renders a valid 3-column
  empty diagram (no special-casing needed; `buildGraph([], ...)` returns empty
  column arrays and `renderD2`/`renderSvg` handle empty containers/groups
  correctly). Note on the diagram: still shows the "Generated {timestamp}" line;
  the empty columns communicate "no open work records" on their own.
- **Truncated fetch** — `--fetch-limit` is always passed from
  `backlog-fetch-limit` (or its default 1000); when the fetched count equals it,
  `bin/record-graph.js` renders the on-diagram truncation note itself (Task 7) —
  no separate handling needed here beyond passing the flag through.
- **`work-backend: local-files`** — Step A's fetch already branches on
  `work-backend` per `record-queue-fetch.md`; both drivers land in the same
  faceted-record shape, so no change is needed here. Not separately verified
  against real local-files data.
