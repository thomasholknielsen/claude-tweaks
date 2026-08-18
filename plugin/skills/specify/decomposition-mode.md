# Specify — Decomposition Mode (design doc to parent + sub-issues)

Loaded by `/claude-tweaks:specify` when Resolve-the-input lands on case 2 (a design doc path),
case 3 (a topic matching an existing design doc), case 4 (a bare topic, after `/superpowers:brainstorming`
produces the doc), or case 5 where the matched record's topic already has a design doc. Decomposes
one design doc into a parent record plus ready sub-issue records.

Step numbering (Steps 1-9, including the 2.5 / 2.5d sub-steps) matches `SKILL.md`'s pre-split
numbering exactly, so existing cross-references from other skills and from this skill's own
sub-files (`design-pre-steps.md`, `record-creation.md`, `red-team.md`, `spec-template.md`) keep
pointing at the right step. Shaping mode never reaches any of them — it runs `shaping-mode.md` in
this skill's directory instead and exits straight to `SKILL.md`'s `## Next Actions`.

When Step 9 completes, return to `SKILL.md`'s `## Next Actions` block.

---

## Step 1: Understand the Landscape

> **Parallel execution:** Use parallel tool calls aggressively — all reads and searches below are independent and should run concurrently. Front-load all I/O before analysis.

1. **The design doc** — understand what was decided, the scope, and the technical approach
2. **Open records** — the record store itself is the current landscape; there is no separate index file to read. Resolve this run's session-scoped temp paths once, per `_shared/session-tmp-root.md` (cited throughout this file and `record-creation.md` rather than restated):

   ```bash
   SPECIFY_ALL_ISSUES=$(node -e "
     const { sessionTmpPath } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/session-tmp.js');
     console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-all-issues.json') || require('path').join(require('os').tmpdir(), 'specify-all-issues.json'))
   ")
   SPECIFY_KEY_FILES=$(node -e "
     const { sessionTmpPath } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/session-tmp.js');
     console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-key-files.json') || require('path').join(require('os').tmpdir(), 'specify-key-files.json'))
   ")
   ```

   Query once, per driver, fetching the union of fields both this step and Step 3's Idempotency map need so Step 3 can reuse this same fetch instead of paying for a second round-trip: `work-backend: github-issues` — read through the session-scoped record snapshot (`_shared/record-queue-fetch.md`'s Session-scoped record snapshot section: `{Session-scoped record snapshot's read-fresh-or-fetch block, with {tmp-records-file} = "$SPECIFY_ALL_ISSUES"}`), then filter in-memory to `state === 'OPEN'` and run `parseRecordFacets` (`bin/lib/issues/record.js`) over each issue's `labels` for this step's Landscape/Overlap Analysis use. Reading `--state all` here (rather than `--state open`) is deliberate — Step 3's Idempotency map needs the closed records too, and reuses `"$SPECIFY_ALL_ISSUES"` directly instead of re-fetching (see Step 3). The snapshot's own `backlog-fetch-limit` cap (default 1000, superseding the previous hardcoded 500 this step used before the shared snapshot existed) matches the `--state all` convention `/code-health`/`/harness-health`/`/journey-health`/`/docs-health` already use for their own `--state all` fetches — a combined open+closed fetch capped too low can silently push older open issues out (pigeonhole: a fixed number of slots shared between both states, returned newest-first by default), narrowing this step's Landscape/Overlap Analysis coverage versus an open-only fetch. `work-backend: local-files` — `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`), which returns parsed `facets` directly.
3. **Every open record's body** (from the query above) — scan for overlap with the design doc's scope; feeds the File Reference Map below.
4. **Recent git log** — check if any part of the design has already been implemented
5. **The codebase** — identify existing files, schemas, APIs, and patterns that the new work will build on. This context is critical for writing sub-issue records that `/superpowers:writing-plans` can act on. When a sub-issue's Technical Approach tells the builder to mirror an existing sibling pattern (e.g., "copy `{facet}`'s existing parse in `{file}` exactly"), grep for every other file implementing that same pattern (`grep -rn "facets\.{facet}\b"` or equivalent) and list all of them under Key Files — not just the file the cited instance happened to live in. A shared facet/field commonly has more than one parity implementation (e.g. a GitHub-label driver and a local-files driver); naming only one lets the other silently drift out of sync (`record #472`).

### File Reference Map

Extract the `### Key Files` subsection (under `## Technical Approach`, per `spec-template.md`'s record body template) from every open record's body to build a file→record map. Never let the raw record bodies re-enter the model's context for this step — call the existing extractor and redirect its output:

`work-backend: github-issues` (reads `"$SPECIFY_ALL_ISSUES"`, the same `--state all` snapshot Step 1 above already fetched):

```bash
node -e "
  const { extractKeyFiles } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const issues = require('$SPECIFY_ALL_ISSUES').filter((i) => i.state === 'OPEN');
  console.log(JSON.stringify(issues.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }))));
" > "$SPECIFY_KEY_FILES"
```

`work-backend: local-files` (over every file `queryRecords('specs', {})` returns, reference by record id instead of `#N`):

```bash
node -e "
  const { extractKeyFilesSection } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const records = queryRecords('specs', {});
  console.log(JSON.stringify(records.map((r) => ({ id: r.id, keyFiles: extractKeyFilesSection(r.body) }))));
" > "$SPECIFY_KEY_FILES"
```

`"$SPECIFY_KEY_FILES"` is `[{id, keyFiles}]` — feed this into the file→record map, e.g.:

```
src/components/ShoppingList.tsx → #41, #45
src/api/items.ts → #41
src/pages/shopping.tsx → #45, #52
```

Records without a `Key Files` subsection contribute an empty `keyFiles` array and nothing to the map — a record still in `backlog` or `parked` isn't spec-shaped yet, so it has no such section; this is the documented absence case, not an error. "Non-completed" is automatic for local records: `queryRecords(dir, facetFilter)` (`bin/lib/issues/local-store.js`) auto-excludes closed records whenever the caller's `facetFilter` doesn't itself filter on the `closed` key, and this step's `queryRecords('specs', {})` call passes an empty filter, so it hits that default-exclude path — every file the query returns is by definition still open.

This map is used in Step 2 to detect implicit file-based dependencies when creating new sub-issues. If a new sub-issue will touch files that an open record also touches, that's an implicit dependency — even if neither one names the other yet.

### Overlap Analysis

For each major section/feature in the design doc, classify coverage against the open records found above:

| Coverage | Meaning |
|----------|---------|
| **Already exists** | An open record covers this fully |
| **Partial overlap** | An open record covers part of this |
| **Gap** | No open record addresses this |

**For each item with overlap:**

### Auto mode (policy lookup)

When a pipeline run directory exists, resolve `overlap` — `OVERLAP=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values --run "$PIPELINE_RUN_DIR" overlap)`. Apply per policy:

| Policy | Action | Log entry |
|---|---|---|
| `companion` (default) | Add a new sub-issue to the Step 2 work-unit set, noting its dependency on the overlapping record — the record itself is created with the rest of the batch in Step 3, and its `Blocked by #N` link is wired in Step 4's linking pass; no separate write here. Reversible — the sub-issue is its own record. | `AUTO {time} — Step 1: overlap "{section}" ↔ record {ref} resolved as companion sub-issue, Blocked by {ref}.` |
| `skip` | Auto-skip — don't create a sub-issue for this section. Note in summary. | `AUTO {time} — Step 1: overlap "{section}" ↔ record {ref} resolved as skip — already covered.` |
| `extend` | Stage as `staged/specify-overlap-{ref}.md` containing the proposed additions to the record's body. NEVER auto-modify an existing record's body — that's not reversible enough. | `STAGED {time} — Step 1: overlap "{section}" ↔ record {ref} requires extending an open record. Stage path: staged/specify-overlap-{ref}.md.` |
| `replace` | Stage as `staged/specify-overlap-{ref}.md`. Replacement is destructive; the user must approve at the Review Console. | `STAGED {time} — Step 1: overlap "{section}" ↔ record {ref} proposed as replacement. Stage path: staged/specify-overlap-{ref}.md.` |

`{ref}` is `#{N}` under `work-backend: github-issues`, the bare record id under `local-files`.

### Interactive mode (batch per-overlap decisions)

Collect ALL overlaps first, then present as one batch table. Per CLAUDE.md, never present per-item prompts when 2+ items can batch — that scales badly when a design doc overlaps with multiple open records.

```
Overlap analysis — {M} overlap(s) found:

| # | Section | Existing record | Coverage | Recommended | Override? |
|---|---------|-----------------|----------|-------------|-----------|
| 1 | "{section A}" | {ref}: "{title}" | Already exists | Skip | (1) skip / (2) extend / (3) companion / (4) replace |
| 2 | "{section B}" | {ref}: "{title}" | Partial overlap | Companion (Recommended) | (1) skip / (2) extend / (3) companion / (4) replace |
| ...|
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these overlaps?"`, `header`: `"Overlaps"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Apply all recommended"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change and to what"`

**Hard gate.** Check the response you are about to send: does it already contain the overlap analysis table above as literal rendered markdown, with a row for every overlap? If not, render it now, in this response, before the tool call — "Apply all recommended" with no table above it leaves the user approving an unnamed set of spec-overlap resolutions.

The recommendation column pre-fills based on coverage type: `Already exists` → Skip; `Partial overlap` → Companion. The user can pick "Apply all recommended" to accept all in one decision, or "Override specific items" and follow up with which #s to change in ordinary free-text conversation. Policy-driven equivalent in auto mode (above).

For **Gap** items, proceed directly to Step 2 (decompose into work units).

## Step 2: Decompose into Work Units

Break the design doc into self-contained work units. Each work unit must be:

### Sizing Guidelines

Defaults below apply under `--granularity standard` (the default when the flag is omitted). `--granularity fine` tightens Tasks per work unit to 2-4 and Files touched per task to 1-2, for a use case that wants smaller blast radius per sub-issue (an unfamiliar or high-risk surface). `--granularity coarse` relaxes Tasks per work unit to 6-12 and Files touched per task to 1-4, for a well-understood, low-risk refactor where fewer, larger sub-issues reduce coordination overhead. Dependency depth and cross-package scope targets are unaffected by `--granularity` in either direction.

| Criteria | Target (`standard`) |
|----------|--------|
| Tasks per work unit | 3–8 (what `/superpowers:subagent-driven-development` or `/superpowers:executing-plans` will execute) |
| Files touched per task | 1–3 |
| Dependency depth | Max 2 levels (A blocks B blocks C, but not deeper) |
| Cross-package scope | A work unit should touch at most 2-3 packages/modules |

### Decomposition Heuristics

**Check first — rewrite-signal against an existing subsystem.** Resolve `project-maturity` — `MATURITY=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values project-maturity)`. The resolver's schema default is `greenfield`, and a value outside the four-item enum also resolves to `greenfield`; at `greenfield`/`pre-launch`, skip this check entirely. When `early-production` or `established`, scan the design doc's Deliverables/Overview for rewrite-shaped language ("replace," "rewrite," "rebuild," "migrate off," "delete and rebuild") naming a target that appears to already exist in the codebase (per Step 1's file/git-log reads) — not something this same design doc introduces fresh. Step 1's Landscape scan does not itself compute an outside-reference count, so before deciding, run one targeted grep for the named target's identifier across the codebase (excluding its own file) to confirm at least one reference from outside the file itself. When matched, decompose along a strangler-fig boundary instead of the standard five below:

| Maturity | Decomposition shape |
|---|---|
| `greenfield` / `pre-launch` (or missing) | Standard five heuristics, unchanged |
| `early-production` | Two sub-issues — implement the new path behind a flag, then a second sub-issue removing the old path once the flag is validated |
| `established` | Three sub-issues — parallel implementation, cutover, decommission, sequenced so the old path keeps working until cutover is verified |

An ambiguous match (rewrite language present, but neither Step 1's reads nor the targeted grep can confirm outside usage of the named target) falls through to the standard five heuristics below rather than forcing a strangler-fig shape onto something that may not need it. `--granularity` does not apply once this path is taken — the two/three-sub-issue counts above are fixed regardless of `fine`/`coarse`.

Otherwise, split along these natural boundaries (in priority order):

1. **Data layer** — database schema, migrations, data access methods
2. **API / business logic** — endpoints, services, validation
3. **UI / presentation** — components, pages, forms
4. **Infrastructure** — deployment, CI/CD, configuration
5. **Cross-cutting** — feature flags, permissions, monitoring

A design doc about "meal planning improvements" might become:
- Spec 73: Meal planning data layer (schema + data access + migration)
- Spec 74: Meal planning API (endpoints + services)
- Spec 75: Meal planning UI (components + pages)

Each is independently buildable with clear dependencies (73 → 74 → 75).

### What Makes a Good Work Unit

- **Self-contained**: An agent can `/claude-tweaks:build` it without needing context from other uncommitted work
- **Testable**: Has clear acceptance criteria that can be verified
- **Atomic**: Either fully done or not done — no meaningful "50% complete" state
- **Ordered**: Dependencies are explicit and minimal

### What Makes a Bad Work Unit

- Requires another in-progress spec to be half-done first
- Touches every layer (data + API + UI + infra) in a single spec
- Has vague acceptance criteria ("improve performance")
- Would decompose into 15+ tasks

### Implicit Dependency Detection

After decomposing into work units, before creating any records, build the input set — every new work unit plus every open record (from the file reference map in Step 1), each as `{id, keyFiles}` — and write it to this run's session-scoped key-files path (`_shared/session-tmp-root.md`; re-resolved here since a fresh bash invocation does not inherit Step 1's shell variables):

```bash
SPECIFY_KEY_FILES=$(node -e "
  const { sessionTmpPath } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-key-files.json') || require('path').join(require('os').tmpdir(), 'specify-key-files.json'))
")
```

- **Every open record** — invert Step 1's File Reference Map (`file → [record refs]`) into one `{id, keyFiles}` entry per record ref, `keyFiles` being every file that mapped to it.
- **Every new work unit from this decomposition** — its own `keyFiles` is the file list identified while applying the Decomposition Heuristics and drafting its own Key Files section (Step 1 item 5's codebase pass plus the design doc's Data/API Surface feed this; the same list that will populate the sub-issue's `### Key Files` subsection in Step 3). Use `{design-doc-slug}:{unit-slug}` as `id` — the same slug the fingerprint below uses — since these units have no record number yet.

```bash
node -e "
  const items = ${WORK_UNIT_KEY_FILES_JSON}.concat(${OPEN_RECORD_KEY_FILES_JSON}); // both assembled above: [{id, keyFiles}]
  require('fs').writeFileSync('$SPECIFY_KEY_FILES', JSON.stringify(items));
"
node -e "
  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const items = require('$SPECIFY_KEY_FILES'); // [{id, keyFiles}] — new work units + open records
  console.log(JSON.stringify(groupByFileOverlap(items).filter(g => g.length > 1)));
"
```

Each returned group of size > 1 is a set of records/work-units sharing at least one file, directly or transitively. Classify each new work unit's group membership:

| Overlap Type | Meaning | Action |
|-------------|---------|--------|
| Grouped with a **not-started** record (no `bot:in-progress`) | Potential conflict — both will modify the same files | Flag for a `Blocked by #N` link in Step 4, or reorder to avoid concurrent modification |
| Grouped with an **in-progress** record (`bot:in-progress`) | Active conflict — concurrent changes to the same files | Flag for a `Blocked by #N` link in Step 4 — wait for the in-progress record to finish |
| Grouped with another **new** work unit from this decomposition | Internal conflict within the batch | Flag the dependency between the two resulting sub-issues for Step 4's linking pass |

`work-backend: local-files` carries no bot-state signal (`_shared/work-record.md`: "the local driver carries no bot state") — every group membership with an existing local record collapses to the first row; there's no in-progress distinction available to make.

(Closed records are excluded from the input set entirely — no group they'd appear in needs action.)

Present any detected implicit dependencies as part of the Step 9 summary. These are flagged alongside the `Blocked by #N` relationships already noted from Overlap Analysis — both feed the same Step 4 linking pass, which is where the actual links get written, once every record's number exists.

> **Algorithm shared with /claude-tweaks:help:** both /specify and /help call the same `groupByFileOverlap` (`bin/lib/issues/grouping.js`) — /specify runs it at creation time; /help re-runs it at dashboard time to catch new conflicts from records that started building after /specify ran.

> **Why this matters:** An explicit `Blocked by #N` link captures a logical dependency (sub-issue B needs sub-issue A's API). File-based overlap captures a physical dependency (both sub-issues modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds.

## Step 2.5: Design Pre-Steps (frontend specs only)

Before creating sub-issue records, run frontend detection and two design pre-steps when the design doc covers a frontend surface — these capture design context (`shape`) and creative direction (`design-intent:`) so the resulting specs carry both forward to `/build` and `/flow`'s polish phase. For the frontend-detection sniff rules, the shape pre-step auto/interactive behavior, and the design-intent question + answer-mapping table, read `design-pre-steps.md` in this skill's directory.

For non-frontend design docs (no frontend signals detected), skip this step entirely — set `surface: backend` (or `infra`) on each generated spec; do not write `design-intent:`.

## Step 2.5d: Diagram Suggestion (all surfaces)

**Unlike Step 2.5, this runs for every surface** — architecture, ER, sequence, and state diagrams help backend and infra specs equally.

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 12). When the flag is `disabled` or missing, skip this step silently.

When `enabled`, scan the design doc text + decomposed record titles for structural signals. Use this detection table:

| Signal in design doc | Diagram type (suggest) |
|----------------------|------------------------|
| Phrases like "state machine", "states:", "transitions from … to …", named status enums (3+ values) | `state` |
| Schema definitions, `entity`, `references`, `foreign key`, ORM relations between 2+ tables | `er` |
| 3+ services / actors / queues exchanging messages or HTTP calls | `sequence` |
| 3+ named branches in a decision (`If A then B; if C then D; otherwise E`) | `flowchart` |
| 3+ system components / boxes in a layout (microservices, layers, gateways) | `architecture` |
| Parent-child taxonomy with 2+ levels (categories → subcategories → items) | `tree` |

Emit at most **two** recommendations per design doc — the two strongest matches. Skip emission entirely if no signal matches (trivial records and refactors should not trigger the hook).

For each emitted recommendation:

```
**Diagram suggestion:** This design doc describes a state machine for orders
(pending → paid → shipped → delivered → refunded). Consider a state diagram:
`/claude-tweaks:visualize state {spec-slug} --source specify`
```

Place these recommendations in the Step 9 summary under a `### Diagram suggestions` block. They are advisory — they do not block decomposition, do not write spec frontmatter, and do not invoke any tool. The user decides whether to act in the next conversation turn.

**Auto mode:** the diagram suggestion is always advisory — `auto` mode emits the recommendation without prompting, logs `STAGED {time} — Step 2.5d: diagram-suggestion ({type}) for {spec/slug}. Reversibility: high.` to the decision log, and continues. No mid-flow stop.

## Step 3: Create the records

Records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it, using deterministic fingerprints for idempotent resume across partial or concurrent runs. **Decomposition mode only** — shaping mode never reaches this step. Read `record-creation.md` in this skill's directory for the full procedure: the Idempotency (resume path) map, Parent record creation, and Sub-issue creation (body composition — including the `Visual-reference:` line when Step 2.5b-ii accepted a variant — Type, Scoring, Ceremony, slug/fingerprint derivation, and both drivers' write calls), plus write-path resilience and the body size ceiling.

## Step 4: Link and order

Every parent and sub-issue number now exists. This pass wires the relationships between them and absorbs the last of the design doc's context, before Step 7 deletes it. Read `record-creation.md` in this skill's directory for the full procedure: Linking (branches on driver and `work-links`), and Decision Rationale / Assumptions / Cross-Spec Promises absorption.

## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch persona-instantiated agents in one parallel batch per sub-issue record — not the parent, which is never built directly — to surface ambiguities, gaps, and unstated assumptions. **Persona count depends on the sub-issue's own `ceremony:*` label** (stamped in Step 3): `ceremony:fast-lane` dispatches **one** persona (Skeptical Reviewer only); `ceremony:standard` dispatches all **three** (Implementer / Maintainer / Skeptical Reviewer), unchanged from before. See `red-team.md` for which persona(s) to dispatch for each tier.

**Freshly-created sub-issues only.** Skip this dispatch for a sub-issue resumed via Step 3's Idempotency map whose fetched body already shows zero unresolved `<!-- ambiguity: -->` markers and no `## Open Questions` section — that sub-issue completed red-team and self-review in a prior run, and re-dispatching would duplicate findings against content already resolved. Dispatch normally for every sub-issue actually created in this run, and for any resumed sub-issue that still carries unresolved markers or an open `## Open Questions` table from an interrupted prior run.

Each agent's input is a record reference, never inlined content: `work-backend: github-issues` — the sub-issue's number plus a `gh issue view` read instruction; `work-backend: local-files` — the sub-issue's record file path. Never both in the same dispatch. Findings are written **back into the record body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table — via compose-then-write-once, the same discipline every write in this skill uses. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the persona lens questions, and the write-back procedure.

---

## Step 6: Record Self-Review

Before deleting the design doc, look at every record you wrote with fresh eyes — including the red-team findings just written in Step 5. Fix issues inline — no subagent, no separate review pass. This is also the last chance to catch content the design doc captured but no sub-issue implements.

"Wrote" means created or edited in this run. A sub-issue resumed via Step 3's Idempotency map that Step 5 skipped (already clean — no unresolved findings) and that this run made no further edits to does not need a fresh self-review pass; its prior run already completed one. Scope checks 1-5 below to sub-issues this run actually created, plus any resumed sub-issue Step 5 dispatched against (because it still carried unresolved findings) or that Step 4's linking pass edited.

> **Parallel execution (conditional):** When N ≥ 3 sub-issue records are produced, run scope and ambiguity checks across all sub-issues concurrently — `gh issue view` per sub-issue under `work-backend: github-issues`, `Read` per record file under `work-backend: local-files` — plus `Grep` over the fetched bodies for placeholder patterns.

1. **Placeholder scan** — search for the failure patterns in `spec-template.md`'s "No Placeholders" section, over every record body (parent and sub-issues). Any `TBD`, vague acceptance criteria, undefined types, "standard error handling", or "similar to sub-issue N" — fix them now. Also confirm every `<!-- ambiguity: ... -->` marker Step 5's red-team wrote has been resolved and **deleted** — zero may remain: a `ready` sub-issue still carrying one fails `_shared/work-record.md`'s spec-shaped structural check, which treats `<!-- ambiguity:` as an unresolved placeholder marker exactly like `TBD`/`TODO`.
2. **Internal consistency** — across the sub-issues in this decomposition, do referenced types, model names, and endpoint signatures match? A function called `clearLayers()` in sub-issue 42 but `clearFullLayers()` in sub-issue 43 is a bug.
3. **Scope check** — is each sub-issue genuinely a single work unit (3-8 tasks)? If one is doing two things, split it now. If two are doing the same thing, merge them.
4. **Ambiguity check** — could any acceptance criterion be interpreted two different ways? Pick one and make it explicit.
5. **Design-doc coverage** — re-read the design doc with each sub-issue open. If you find a requirement the doc captured but no sub-issue implements, add it to the right sub-issue now — the doc is about to be deleted in Step 7.

When all five checks come back clean, proceed to Step 7. No need to re-review after fixing.

---

## Step 7: Delete Consumed Artifacts (only when fully decomposed)

The design doc has served its purpose **once every phase has been decomposed into sub-issue records and Step 6 Self-Review has confirmed coverage**. Behavior depends on the phase target:

| Decomposition mode | Delete design doc? |
|---|---|
| No `phase-N` argument; doc has 0 phase sections (single-phase) | Yes — fully consumed |
| No `phase-N` argument; doc has N phase sections; all decomposed in this run | Yes — fully consumed |
| `phase-N` argument; only that phase decomposed | **No** — design doc retained for remaining phases. Add a `## Phase N: Specified` marker after the phase heading instead, listing the record numbers it produced. |
| `phase-N` argument; this was the last un-specified phase | Yes — fully consumed (run delete after marker bookkeeping confirms all phases marked) |

```bash
# Full decomposition (all phases or single-phase):
git rm docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md

# Partial decomposition (phase-N only): commit the marker, keep the doc
git add docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git commit -m "Mark phase-{N} specified in design doc"
```

When fully consumed, do NOT keep these around. They create dangling references and stale artifacts. The sub-issue records are the durable artifact.

(Step 8 — the old backlog-entry deletion — is retired: a captured record is shaped in place, so there is nothing to delete.)

---

## Step 9: Summary and Commit

Present a summary:

```markdown
## Specification: {design doc topic}

### Work Units Created
| Record | Title | Type | Blocked by | Est. tasks |
|--------|-------|------|------------|------------|
| {ref} | {title} | {type} | {refs or —} | {count} |

### Existing Records Modified
- {ref} "{title}" — {what was added/changed}

### Artifacts Removed
- Design doc: `docs/superpowers/specs/{filename}` (absorbed into the parent + sub-issue records)

### Diagram suggestions (optional — render only when Step 2.5d emitted any)
- {one or two `**Diagram suggestion:** …` blocks emitted by Step 2.5d}
```

`{ref}` is `#{N}` under `work-backend: github-issues`, the bare record id under `local-files` — same convention as Step 1's Overlap Analysis.

**`needs:definition` origin closure.** When `$ORIGIN_RECORD_NUM` is set (this run was reached via the `needs:definition` redirect — `specify/SKILL.md`'s Resolve-the-input case 1), close that origin record now that the parent and every sub-issue this run produced exist, using the same number list the Work Units Created table above already assembled: post a comment on `$ORIGIN_RECORD_NUM` in that table's own list format, e.g. "Superseded by decomposition: #{parent}, #{sub1}, #{sub2}, ..." (`work-backend: github-issues`: `gh issue comment "$ORIGIN_RECORD_NUM" --body "..."` then `gh issue close "$ORIGIN_RECORD_NUM"`; `local-files`: append the note to the record body and mark it closed via `local-store.js`). When `$ORIGIN_RECORD_NUM` is unset (every other entry path — cases 2-5), this is a no-op: decomposition mode unconditionally produces exactly one parent record every run, so there is never a produced-sub-issues-with-no-parent case this needs to special-case.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Created parent record {parent-ref} + {N} sub-issue records | `{hash}` (local-files) / `—` (github-issues — creates already landed via API, no commit) |
| Operational | Deleted design doc | `{hash}` |

**Commit whatever this run wrote to disk — the skill's terminal action, run whether or not anything ends up staged.** This covers only artifacts that are files: the design-doc deletion/marker from Step 7, and — under `work-backend: local-files` — the parent and sub-issue record files plus Step 4's linking edits, composed and written across Steps 3-4 but not yet committed. A clean `github-issues` run has nothing to commit for the records themselves — every parent/sub-issue create and edit already landed via the API in Steps 3-5, the same no-commit case Shaping mode documents — **except** any sub-issue (or the whole batch, if the parent itself fell back) that Step 3's write-path resilience wrote to `local-store.js` after a `gh` failure; that file needs this commit exactly like a `local-files` record does. A full (non-`phase-N`) decomposition may therefore have nothing staged beyond the design doc's `git rm`; a `phase-N` run already committed its own marker back in Step 7, so it may have nothing staged at all. None of this affects durability — a sub-issue is durable the moment its create/write call lands, not when this step commits it. What used to be true of spec files no longer applies: sub-issues don't need to exist in committed history before a pipeline can run them; `/claude-tweaks:flow #N` (or a local record id) materializes a sub-issue into a build-time file only when a pipeline actually runs it (spec 20's contract), independent of this commit.

```bash
git add specs/ docs/   # local-files driver: parent/sub-issue record files + link edits; docs/: design-doc removal/marker
git status --porcelain   # empty is a valid outcome (github-issues, or a phase-N run) — commit only if something is staged
git commit -m "{message describing the sub-issues created}"   # skip when nothing is staged
git log --oneline -1   # verify it landed when a commit was made (see _shared/git-discipline.md)
```

By the time Next Actions renders, any commit from this step has already happened.
