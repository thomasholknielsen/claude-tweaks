# Live Record-Graph Visualization via /visualize

## Context

Issue #28: the work-record model's live state (stages, `Blocked by #N` edges, `auto:*` grants)
isn't visible anywhere except raw `gh issue list` output. `/claude-tweaks:visualize` already
has the self-contained-HTML machinery (`_shared/visual-html-output.md`, the D2 enhanced path)
but every existing type takes a free-text `<topic>` the model authors content from — none of
them render live queried data. `_shared/record-queue-fetch.md` already exists as the canonical
single-pull-and-facet-parse procedure (`gh issue list` + `parseRecordFacets`), used identically
by `/help`, `/tidy`, and `/backlog`.

The issue's own scope note says "six-axis coloring," but `_shared/work-record.md` documents
**seven** axes (Type, Origin, Scoring, Stage, Authorization, Bot state, Acceptance). This
resolves cleanly: Stage becomes the spatial column layout, and the other six become
color/badge encodings — six axes of *coloring*, seven axes covered overall.

## Decision

**New `/visualize` type: `record-graph`.** `/claude-tweaks:visualize record-graph` — no topic
argument, since content always comes from the live queue, never a description. Routed to the
enhanced D2 path (container-based directed graph, same bucket as architecture/flowchart/tree).

**Pipeline:**
1. **Fetch** — reuse `record-queue-fetch.md`'s existing `github-issues`/`local-files`
   procedure verbatim, with `body` added to `{EXTRA_FIELDS}` (needed for `Blocked by #N`
   parsing). Produces the same faceted-record JSON every other consumer already uses.
2. **Render** — a new `bin/record-graph.js` (CLI wrapper, `render` subcommand) backed by a new
   `bin/lib/record-graph/` module, mirroring the `code-health.js`/`bin/lib/code-health/` split.
   Pure functions: faceted JSON + `work-links` config in, `.d2` source (or SVG for the
   no-`d2`-binary baseline path) out. Reuses the existing, tested `parseDependencies`
   (`bin/lib/issues/record.js`) for edges — no new dependency-parsing logic, no model-authored
   transcription of issue numbers, titles, or labels at any point. This mirrors the project's
   established pattern of pushing deterministic data transforms into tested `bin/lib` code
   rather than free-hand LLM authorship, specifically because LLM transcription of structured
   data is a documented recurring bug source in this codebase.
3. **Theme + place** — `/visualize`'s existing Step 2 (theming) and the enhanced path's Steps
   2-3 (render + re-theme) proceed unchanged. Placement gets one new fixed rule: `record-graph`
   always resolves to `docs/diagrams/record-graph.html` + `.d2` source alongside it —
   **always persisted**, skipping the normal persist-vs-ephemeral `AskUserQuestion`, overwritten
   and committed on every run. The diagram carries a visible "Generated {timestamp} — re-run
   `/claude-tweaks:visualize record-graph` to refresh" stamp; no live client-side data fetch
   (considered and rejected — see Alternatives).

**Stage columns (3, deterministic):**

| Column | Rule |
|---|---|
| Backlog | no `parked`, no `ready` label |
| Parked | has `parked` label |
| Ready | has `ready` label |

Closed records are already excluded by the `--state open` fetch — no fourth column. No filter
on top of this by default: the full open queue renders every run (a genuinely comprehensive
live view is the point of the issue).

**Six-axis encoding** — split between true color channels (high-visibility, low-cardinality)
and compact text badges (discrete, multi-valued):

| Axis | Channel | Values |
|---|---|---|
| Origin | Node fill color | `by:code-health`/`by:harness-health`/`by:journey-health`/`by:docs-health`/`by:capture`/`by:dispatch`/none (human) |
| Bot state | Node border style/color | `bot:in-progress` (solid accent), `bot:blocked` (dashed warning), neither (default) |
| Type | Text badge | `[bug]`/`[feature]`/`[task]` |
| Scoring | Text badge | `R:{risk} E:{effort}` |
| Authorization | Text badge | `AUTO-BUILD`, `AUTO-MERGE` (both shown when both granted) — the issue's "grant badges" |
| Acceptance | Text badge | `demo:pending`/`demo:approved`/`demo:changes-requested` (omitted when unset) |

Each node renders as `#{number} {title, truncated ~40 chars}` plus applicable badges as
additional label lines. No emoji, matching this project's skill-writing convention.

**Edges:** `Blocked by #N`, drawn from the blocked record to the record it depends on, via the
existing `parseDependencies`. Populated only under `work-links: body-text` (the body field is
already in the one fetch pull). Under `work-links: native`, the diagram still renders fully
(columns, colors, badges) but with a visible note that edges are unavailable — resolving
native sub-issue/blocked-by relations needs a second query beyond the issue's explicit
"one `gh issue list` pull" scope. Parent/leaf decomposition hierarchy (a different relationship
from Blocked-by) is explicitly out of scope — the issue only names dependency edges.

**New sub-file:** `skills/visualize/record-graph.md` holds this full bucketing/encoding/edge
contract, referenced from `SKILL.md`'s type table (one new row) rather than inlined — matching
`d2-enhanced-path.md`'s existing precedent and CLAUDE.md's 40 KB soft ceiling on `SKILL.md`.

**Error handling:**
- No `d2` binary → baseline SVG path, same deterministic bucketing/badge/edge computation,
  simple fixed-width lane stacking (no graph-layout algorithm needed — this is mechanical
  layout, not freehand).
- Zero open records → renders the 3-column empty shell with a "No open work records" note.
- Queue exceeds `backlog-fetch-limit` → the existing fetch-procedure truncation warning fires;
  the diagram itself also carries a "showing N, possibly more" note.
- `work-backend: local-files` → should work unmodified since `record-queue-fetch.md` already
  normalizes both drivers to the same faceted-record shape; not separately tested against real
  local-files data as part of this scope.

  > **Superseded:** this claim was found false during implementation — normalizing to the same
  > *shape* does not mean the same *fields*: `local-store.js`'s records carry `id`/`slug`/`path`
  > and no `.number`, the field every node and edge is keyed on, so the whole queue would
  > collapse onto one node. `local-files` is now an explicit, gated-on scope boundary. See
  > `skills/visualize/record-graph.md`'s Error handling section for the corrected, accurate
  > statement and Step A for the gate that enforces it.

**Testing:** `bin/lib/record-graph/` gets `node --test` coverage (mirroring
`bin/lib/code-health/tests/`) — pure functions, no `gh`/`d2` I/O, fed fixture JSON. Covers
stage-bucketing, badge/color assignment per axis-combination (including unset-Origin/Acceptance
defaults), edge generation from `parseDependencies` fixtures, the native-work-links
edge-omission note, and truncation-warning surfacing at the fetch cap.

## Alternatives considered

- **New dedicated skill** (e.g. `/claude-tweaks:record-graph`) consuming
  `visual-html-output.md` directly, bypassing `/visualize`'s type/topic model. Rejected: this
  fits cleanly as one more type in an existing dispatch table: same theming, placement, and
  wrapper machinery as every other diagram, no new command surface needed.
- **Extend `/backlog overview`** with a visual mode instead of a new type. Rejected: overview
  is a read-only distribution/recommendation view with its own established shape; bolting a
  full diagram-generation pipeline onto it blurs scope for no real benefit over a new
  `/visualize` type.
- **Live client-side refresh button** — embed a `fetch()` to GitHub's REST API (CORS-enabled
  for public read endpoints, 60 req/hour unauthenticated) plus a JS port of
  `parseRecordFacets`/`parseDependencies`, with an optional `localStorage`-only token field for
  private repos. Rejected for v1: real added surface (token UI, error states, a second
  implementation of the parsing rules to keep in sync with `bin/lib/issues/record.js`) against
  an issue explicitly scoped as "one pull rendered as HTML." A static timestamp + regenerate
  hint gets most of the value at a fraction of the risk.
- **Query native `work-links` dependency relations via a second API call**, so edges always
  render regardless of config. Rejected: goes beyond the issue's explicit "one `gh issue list`
  pull" scope; the on-diagram limitation note is cheaper and honest about what's not covered.
- **Model hand-authors D2 source from the fetched JSON** each run, matching every other
  `/visualize` type's free-text-topic pattern. Rejected: this project has documented, recurring
  bugs from LLM transcription of structured data (wrong numbers, dropped labels) with no test
  coverage on the generation logic; a deterministic script sidesteps the whole failure class
  and is trivially unit-testable.
- **Six columns instead of three** (folding Authorization/Bot-state into the column axis to
  mirror `work-record.md`'s five-stage lifecycle spine diagram) — rejected because the issue
  text explicitly separates "stage columns" from "grant badges," and `work-record.md`'s own
  Stage axis definition is exactly the three values used here; the lifecycle spine is a
  derived/composite view, not the raw axis.
