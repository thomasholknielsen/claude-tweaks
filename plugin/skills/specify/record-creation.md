# Specify — Record Creation and Linking (Steps 3-4)

Loaded by `/claude-tweaks:specify` Step 3 onward, decomposition mode only — shaping mode never reaches this step (it runs `shaping-mode.md` instead). Covers creating this run's records — every sub-issue, plus the parent issue when Step 2.6 kept one (Step 3) — and wiring their relationships plus absorbing the last of the design doc's context (Step 4), before Step 7 deletes the design doc.

## Step 3: Create the records

When `decomposition-mode.md`'s Step 2.6 kept the parent, records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it. Under collapse, there is no parent — every produced record is created independently, in any order. Every body is composed fully in memory before any write call — compose-then-write-once, the same discipline Shaping mode uses.

### Idempotency (resume path)

Every record this step creates carries a deterministic fingerprint: `{design-doc-slug}:parent` for the parent, `{design-doc-slug}:{unit-slug}` for each sub-issue. The same design doc always produces the same fingerprint for the same record — that determinism is what makes the check below a real resume path instead of a one-shot guard. **A unit slug must never be the literal string `parent`** — that value is reserved for the parent record's own fingerprint; a sub-issue slugified to `parent` would collide with it in the map below. Under collapse (`decomposition-mode.md` Step 2.6), no `{design-doc-slug}:parent` fingerprint is ever minted — a resumed collapsed run's fingerprint→number map has only unit fingerprints to match against, and finds every already-created record that way; it never checks for a parent checkpoint.

Before creating anything, build a fingerprint→number map of every existing marker, once. Resolve this run's session-scoped temp paths inside whichever driver branch below actually runs (`_shared/session-tmp-root.md`) — a fresh bash invocation does not inherit shell variables from a separate fence, so each branch resolves its own paths rather than relying on a shared preamble fence:

`work-backend: github-issues` — reuse Step 1's session-scoped `specify-all-issues.json` (already fetched `--state all --json number,title,labels,body,state`, the REST list, NOT the search index — the search index lags behind fresh writes, including this same run's own); no second `gh issue list` round-trip:

```bash
SPECIFY_ALL_ISSUES=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-all-issues.json') || require('path').join(require('os').tmpdir(), 'specify-all-issues.json'))
")
SPECIFY_EXISTING_FINGERPRINTS=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-existing-fingerprints.json') || require('path').join(require('os').tmpdir(), 'specify-existing-fingerprints.json'))
")
node -e "
  const { extractFingerprint } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const issues = require('$SPECIFY_ALL_ISSUES');
  const map = {};
  for (const i of issues) { const fp = extractFingerprint(i.body); if (fp && !(fp in map)) map[fp] = i.number; }
  require('fs').writeFileSync('$SPECIFY_EXISTING_FINGERPRINTS', JSON.stringify(map));
"
```

If `"$SPECIFY_ALL_ISSUES"` is unavailable (a resumed decomposition run in a fresh session with no Step 1 state from this session), fall back to reading through the session-scoped record snapshot the same way Step 1 does — `{Session-scoped record snapshot's read-fresh-or-fetch block (_shared/record-queue-fetch.md), with {tmp-records-file} = "$SPECIFY_ALL_ISSUES"}` — within the same `$CLAUDE_CODE_SESSION_ID` this resolves to the identical path and is typically a cache hit, not a fresh `gh` round-trip.

`work-backend: local-files` (the local marker search — same idea, read every record body and extract its marker). `queryRecords('specs', {})` alone excludes closed records by default (its `filtersOnClosed` check treats an empty filter object as "open, as today," per `local-store.js`'s own header comment on the function) — this map needs both open and closed, mirroring the github driver's `--state all` fetch above: a fingerprint match against an already-closed local record still means "already exists" and must not be recreated on a resumed decomposition. Merge a default (open) query with an explicit `{ closed: true }` query — the same two-call idiom `tests/bin-lib/issues/local-store.test.js` demonstrates:

```bash
SPECIFY_EXISTING_FINGERPRINTS=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-existing-fingerprints.json') || require('path').join(require('os').tmpdir(), 'specify-existing-fingerprints.json'))
")
node -e "
  const { queryRecords } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js');
  const { extractFingerprint } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const records = [...queryRecords('specs', {}), ...queryRecords('specs', { closed: true })];
  const map = {};
  for (const r of records) { const fp = extractFingerprint(r.body); if (fp && !(fp in map)) map[fp] = r.id; }
  require('fs').writeFileSync('$SPECIFY_EXISTING_FINGERPRINTS', JSON.stringify(map));
"
```

Then, immediately before **each individual create** — a kept parent included, and not just once against the batch list above — re-check that record's fingerprint against the map. A match means the record already exists (a prior partial run, or a concurrent one): skip the create and use the mapped number instead — the parent's number for the sub-issues to link to, a sub-issue's number for Step 4's linking pass. On every successful create, add the new record's fingerprint and number to the in-memory map before moving on — this catches a same-run collision (two units that happen to slugify to the same name) exactly the way it catches a prior-run resume, since the map stays live for the whole loop rather than being a snapshot trusted for its duration.

### Parent record

Skip this whole section entirely when Step 2.6 (`decomposition-mode.md`) decided to collapse — no parent record, no `{design-doc-slug}:parent` fingerprint is ever minted, and Step 3 proceeds straight to Sub-issues below with no `$PARENT_NUM`/`$PARENT_ID` for them to link to. Otherwise, unchanged from before collapse existed: a parent record is minted once per decomposition run (or per `phase-N`, when scoped — see Step 7's phase table). Type is always `feature` — the parent is a summary record, not agent-sized work: **parents never get `ready`**, and they carry no `risk:*`/`size:*` scoring at all.

Parent body = design summary: the problem, the chosen approach, the key decisions, and why the alternatives lost. This is deliberately not the design doc pasted verbatim — it's the durable digest that has to survive Step 7 deleting the design doc. Prefix it with a one-line metadata block, `Surface: {value}` — reuse whatever Step 2.5a's whole-design-doc detection already produced (the canonical value list lives in `spec-template.md`). The parent never carries `Design-intent:` — parents are never built or polished directly, so creative intent has nothing to attach to.

```bash
SPECIFY_PARENT_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-payload.json') || require('path').join(require('os').tmpdir(), 'specify-parent-payload.json'))
")
SPECIFY_PARENT_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-body.md') || require('path').join(require('os').tmpdir(), 'specify-parent-body.md'))
")

node -e "require('fs').writeFileSync('$SPECIFY_PARENT_PAYLOAD', JSON.stringify({title:process.argv[1], body:process.argv[2], type:'feature', fingerprint:process.argv[3]}))" \
  "$PARENT_TITLE" "$PARENT_BODY" "${DESIGN_DOC_SLUG}:parent"

# Parent bodies are a design summary, not spec-shaped — no --require-shaped (bin/compose-record.js's Global Constraints).
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" "$SPECIFY_PARENT_PAYLOAD" --out "$SPECIFY_PARENT_BODY"
```

(`_shared/session-tmp-root.md` — cited, not restated. `$SPECIFY_PARENT_PAYLOAD`/`$SPECIFY_PARENT_BODY` stay in scope for the rest of this section below.)

`recordPayload` returns zero labels for the parent — no origin, no scoring, no `ready`. Two
labels can still land on it, both applied directly via `gh issue create --label` rather than
through the payload: `type:feature` — only under `work-types: labels` — and `parent-issue`,
unconditionally. `parent-issue` is what makes a parent enumerable at all: its
`{design-doc-slug}:parent` fingerprint is a body marker reachable only through `gh issue list
--search`, which "Resuming after a partial run" (below) forbids falling back to — so without the
label a `/claude-tweaks:tidy` sweep cannot find a parent whose gate was never applied
(`_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope). Bootstrap both before the create
(per `_shared/label-bootstrap.md`); the `parent-issue` row below is copied verbatim from that
file's canonical `LABELS_JSON` and must stay byte-identical to it, and the `type:feature` row
comes from `record.js`'s `TYPE_LABELS`:

```js
[
  ["parent-issue",      "Structure: parent issue — carries the acceptance gate for its sub-issues"],
  ["type:feature",      "Type: new capability or enhancement"]
]
```

**`work-backend: github-issues`** — the Type expression branch (`_shared/work-record-config.md`, the config-key table's canonical home; read `work-types` once, never re-probe mid-flow):

```bash
SPECIFY_PARENT_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-body.md') || require('path').join(require('os').tmpdir(), 'specify-parent-body.md'))
")
# work-types: native
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file "$SPECIFY_PARENT_BODY" --type feature --label parent-issue)
# work-types: labels
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file "$SPECIFY_PARENT_BODY" --label type:feature --label parent-issue)

PARENT_NUM=$(basename "$PARENT_URL")
```

**`work-backend: local-files`:** use `createRecord`, not `allocateId`+`writeRecord` separately — two near-simultaneous runs calling those two separately can both compute the same next id and both succeed under different slugs, silently sharing one numeric id and corrupting any later `facets.parent`/`facets.blockedBy` reference that assumes id uniqueness. `createRecord` closes that race by allocating the id and writing the file as one atomic step (`bin/lib/issues/local-store.js`'s header comments; the same fix `capture/SKILL.md`'s local-files branch already applies). The slug is `deriveSlug(title, existingSlugs)` from that same module — not a hand-derived slugification:

```bash
SPECIFY_PARENT_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-body.md') || require('path').join(require('os').tmpdir(), 'specify-parent-body.md'))
")
PARENT_ID=$(node -e "const fs=require('fs');
  const {createRecord, deriveSlug}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js');
  const dir='specs';
  const existingSlugs=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  const slug=deriveSlug(process.argv[1], existingSlugs);
  const body=fs.readFileSync(process.argv[2], 'utf8');
  const record=createRecord(dir, { slug, title: process.argv[1], body, facets: { type: 'feature', isParentIssue: true } });
  console.log(record.id)" "$PARENT_TITLE" "$SPECIFY_PARENT_BODY")
```

`isParentIssue: true` is the local-files parity for the `parent-issue` label above — the same
queryable-parent problem, on the backend with no labels at all. `local-store.js` serializes it as
an `is-parent-issue: true` frontmatter line and parses it back into `facets.isParentIssue`; no
sub-issue ever sets it, so it stays `false` there. `/claude-tweaks:demo`'s Approve step reads it
to decide whether to close the parent once its sub-issues are accepted.

`$PARENT_NUM` / `$PARENT_ID` is now captured — every sub-issue below links back to it.

**If parent creation fails** (`gh` unreachable, transient API error): fall back to `local-store.js` for the parent — the same `unsynced: true` fallback as below — and run the rest of this decomposition on the local driver too, so sub-issues have a real parent to link to instead of a GitHub record that doesn't exist. `/tidy`'s Sync finding reconciles them later.

**Resuming after a partial run:** nothing parent-specific — the Idempotency map above already covers it. A `{design-doc-slug}:parent` marker match means a prior run created this parent; reuse the mapped number and skip the create, exactly as with any sub-issue. Never fall back to a title search — `gh issue list --search` rides the search index this step deliberately avoids.

### Sub-issues

**Only sub-issues get `ready`** — and only sub-issues carry `risk:*`/`size:*` scoring; a kept parent gets neither. One per work unit from Step 2, in any order — Step 4 does the linking once every number exists, so creation order doesn't matter.

**Origin-set carve-out (1-unit collapse).** When Step 2.6 returned a 1-unit collapse *and* `$ORIGIN_RECORD_NUM` is set (`SKILL.md`'s `needs:definition` redirect, Resolve-the-input case 1), that unit gets **no fresh create**: compose its body exactly as below, then write it onto the origin record in place — `gh issue edit "$ORIGIN_RECORD_NUM" --body-file` plus the labels the create call would have applied and `--remove-label "needs:definition"` in the same edit; under `local-files`, `writeRecord` with those same facets and `facets.needsDefinition` cleared (the record is now defined — the redirect that routed here must not re-fire) — carrying the `{design-doc-slug}:{unit-slug}` fingerprint into that body so the Idempotency map above resolves it on any resumed run. **This write replaces the origin's own body, so preserve that body as a `## Original request` block in the composed one** — shaping mode's ground-truth rule (`shaping-mode.md`), and the last record of what was originally asked once Step 7 deletes the design doc. Treat `$ORIGIN_RECORD_NUM` as this unit's `$SUB_ISSUE_NUM`/`$SUB_ISSUE_ID` from here on: Step 4's linking, Step 5's red-team and Step 6's self-review all run against it as an ordinary produced record, and Step 9 then only skips its closure. With `$ORIGIN_RECORD_NUM` unset (every other entry path), a 1-unit collapse creates one fresh standalone ready record, exactly as below.

When a sub-issue proposes building a new `bin/` CLI, check for a same-named deliverable already
shipped or already proposed elsewhere before creating it — `_shared/issue-claims.md`'s
Deliverable-name-collisions section owns the check and the grep.

**Tasks never become records.** A sub-issue's internal breakdown — its Deliverables and Acceptance Criteria checklists — stays a checklist inside its own body; `/superpowers:writing-plans` turns it into an execution plan at build time, and nothing at this granularity spawns a further issue per task.

**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}` and `Ui-stack: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents (`shaping-mode.md` in this skill's directory), just run once per sub-issue instead of once per shaped record. When Step 2.5b-ii's variant exploration ran and the user accepted a scaffold direction for this sub-issue's surface, also prefix `Visual-reference: {scaffold path}` (`design-pre-steps.md` Step 2.5b-ii item 5) — omit the line entirely when Step 2.5b-ii was skipped, declined, or not offered (the canonical field reference lives in `spec-template.md`). Under `work-backend: github-issues` + `work-links: body-text`, and only when Step 2.6 kept the parent, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a sub-issue's own parent (`spec-template.md`). Under collapse, omit this line entirely — there is no `$PARENT_NUM` to reference.

**Type** — when Step 2.6 kept a parent, matches it (`feature`). Under collapse there is no parent to match: derive the type from the unit itself (`feature` for a new capability or enhancement), and when shaping the origin in place (carve-out above), keep the origin record's existing type unless the unit's own content contradicts it. Either way, a unit that is clearly a defect fix (a bug report, a regression, broken behavior) overrides to `bug`.

**Scoring** — judge each sub-issue's `risk` and `size` (low/medium/high each) from its own Deliverables and Acceptance Criteria — blast radius and reversibility for `risk`, estimated size and file spread for `size` — per `_shared/work-record.md`'s Scoring axis, run once per sub-issue. The tiers become `$SUB_ISSUE_RISK`/`$SUB_ISSUE_SIZE` below.

**Ceremony** — invoke the canonical ceremony-check pattern (`_shared/ceremony-check-invocation.md`) against this sub-issue's own composed body — never a kept parent, which carries no `ceremony:*` label either. **This call site's delta:** per-leaf (once per sub-issue in the decomposition loop), without `#{n}` (no sub-issue number exists yet). The verdict becomes `$SUB_ISSUE_CEREMONY` below, written into the sub-issue's own create call — writeback happens via record creation itself, not a separate stamp.

**Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against this sub-issue's own composed body — never the parent, which carries no scoring labels either. On `FRAMING: solution-baked`, stamp `solution:unjustified` on the sub-issue and fold the RATIONALE's named assumptions into that sub-issue's `## Gotchas` bullets. On `FRAMING: open`, stamp nothing. A freshly created sub-issue has no `## Original request` block, so the composed body is the whole input; under the origin-set carve-out above, the preserved block is part of that input too, as in shaping mode.

**Per-sub-issue invocation.** Both the Ceremony and Framing calls above run once per sub-issue, inside this per-sub-issue loop — `#{n}` is omitted from both (`ceremony-check`'s own documented pre-numbering exception, `assess-agent-autonomy/SKILL.md`'s Input section; `framing-check` mirrors it here for the identical reason — no sub-issue number exists until the create call further below) — never reused or rendered from memory for a later sub-issue in the same decomposition. **Self-check before creating:** count the bare `ceremony-check`/`framing-check` invocations made since the previous sub-issue's create call (or since the start of this loop, for the first sub-issue) and confirm it is exactly one of each before this create call runs — a divergent verdict across sub-issues in the same decomposition is only valid when each sub-issue had its own invocation, made inside its own since-the-last-create window.

**Slug derivation** — `$UNIT_SLUG` is `deriveSlug(title, existingSlugs)` (`bin/lib/issues/local-store.js`) — the same deterministic algorithm `/claude-tweaks:capture` and `/claude-tweaks:demo` use for their own record creation, not a hand-derived slugification. Seed `existingSlugs` with the literal string `'parent'` (a sub-issue slug must never collide with the parent's reserved fingerprint suffix — see above) plus, under `work-backend: local-files`, the current `specs/` directory listing (same scan `/claude-tweaks:capture`'s local-files branch uses; since each `createRecord` below writes its file before the next runs, the rescan also dedupes against slugs already assigned earlier in this loop):

```bash
UNIT_SLUG=$(node -e "const fs=require('fs');
  const {deriveSlug}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js');
  const dir='specs';
  const onDisk=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  console.log(deriveSlug(process.argv[1], ['parent', ...onDisk]))" "$SUB_ISSUE_TITLE")
```

Reuse this same `$UNIT_SLUG` value below for both the fingerprint and, under `work-backend: local-files`, the record's own slug — do not re-derive it separately at write time.

**Fingerprint** — `{design-doc-slug}:{unit-slug}` (`$UNIT_SLUG` from Slug derivation, above), the sub-issue half of the deterministic scheme the Idempotency section above defines.

```bash
SPECIFY_SUB_ISSUE_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-payload.json') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-payload.json'))
")
SPECIFY_SUB_ISSUE_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-body.md') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-body.md'))
")

node -e "require('fs').writeFileSync('$SPECIFY_SUB_ISSUE_PAYLOAD', JSON.stringify({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  }))" \
  "$SUB_ISSUE_TITLE" "$SUB_ISSUE_BODY" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"

# Sub-issue bodies are spec-shaped by construction (spec-template.md) — validate before writing.
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" "$SPECIFY_SUB_ISSUE_PAYLOAD" --out "$SPECIFY_SUB_ISSUE_BODY" --require-shaped
```

(This bash fence runs once per work unit, in a loop — `sessionTmpPath` is idempotent per session+filename, so both paths resolve identically on every iteration and each iteration's compose-then-write-once overwrites cleanly before the next.)

`recordPayload` embeds the fingerprint as `<!-- work-fingerprint: {design-doc-slug}:{unit-slug} -->` in the returned body — `"$SPECIFY_SUB_ISSUE_BODY"` above already carries it, so both drivers below write the same fingerprinted text.

Bootstrap the labels this run is about to apply before the first create (per `_shared/label-bootstrap.md`): `ready` plus every `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` pair in use, plus `solution:unjustified` — and, under `work-types: labels`, the `type:{t}` pairs from `record.js`'s `TYPE_LABELS`, as with the parent.

**`work-backend: github-issues`** — same Type expression branch as the parent. The `recordPayload` call above never passes `solutionUnjustified`, so its `.labels` cover only `risk:{tier}`, `size:{tier}`, `ceremony:{tier}`, `ready`, and no `by:*` label — a decomposition is human-shaped work, not a health-skill filing. The `--label` flags below are exactly that set; `solution:unjustified` is added separately, below the create blocks, once the Framing verdict is known:

```bash
SPECIFY_SUB_ISSUE_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-body.md') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-body.md'))
")
# work-types: native
SUB_ISSUE_URL=$(gh issue create --title "$SUB_ISSUE_TITLE" --body-file "$SPECIFY_SUB_ISSUE_BODY" \
  --type "$SUB_ISSUE_TYPE" \
  --label "risk:$SUB_ISSUE_RISK" --label "size:$SUB_ISSUE_SIZE" --label "ceremony:$SUB_ISSUE_CEREMONY" --label ready)

# work-types: labels
SUB_ISSUE_URL=$(gh issue create --title "$SUB_ISSUE_TITLE" --body-file "$SPECIFY_SUB_ISSUE_BODY" \
  --label "risk:$SUB_ISSUE_RISK" --label "size:$SUB_ISSUE_SIZE" --label "ceremony:$SUB_ISSUE_CEREMONY" --label ready \
  --label "type:$SUB_ISSUE_TYPE")

SUB_ISSUE_NUM=$(basename "$SUB_ISSUE_URL")
```

When this sub-issue's Framing verdict (above) was `solution-baked`, add `--label "solution:unjustified"` to the create call; on `open` add nothing — the label is presence-only, and absence is the common case.

**`work-backend: local-files`** — use `createRecord`, not `allocateId`+`writeRecord` separately, for the same concurrent-creation-race reason as the parent above. One call carries the same state as facets: `stage: 'ready'` instead of the `ready` label, `origin` omitted for the same no-`by:*` reason. `"$SPECIFY_SUB_ISSUE_BODY"` already carries the fingerprint marker, so the local write preserves it:

```bash
SPECIFY_SUB_ISSUE_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-body.md') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-body.md'))
")
SUB_ISSUE_ID=$(node -e "const {createRecord}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js');
  const body = require('fs').readFileSync(process.argv[7], 'utf8');
  const record = createRecord('specs', {
    slug: process.argv[1],
    title: process.argv[2],
    body,
    facets: { type: process.argv[3], risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], stage: 'ready' }
  });
  console.log(record.id)" "$UNIT_SLUG" "$SUB_ISSUE_TITLE" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY" "$SPECIFY_SUB_ISSUE_BODY")
```

Add a `facets.solutionUnjustified: true` key to the object above only when this sub-issue's Framing verdict (above) was `solution-baked`; omit the key entirely on `open` (absent, not null) — unlike `facets.ceremony`, which always gets a value the first time a record is shaped, `facets.solutionUnjustified` is genuinely absent on the common `open` case.

Capture `$SUB_ISSUE_NUM` / `$SUB_ISSUE_ID` for every sub-issue (created or resumed via the Idempotency map) — Step 4's linking pass consumes them.

**Write-path resilience.** A `gh` create failure for one sub-issue (any kept parent already exists on GitHub by this point) falls back to `local-store.js` for that sub-issue only — write it locally with `unsynced: true` (fingerprint preserved, so a later sync still dedups correctly) and continue with the rest of the batch rather than aborting the whole decomposition over one failure. `/tidy`'s Sync finding reconciles it onto GitHub on a later pass. The same rule applies to Step 4's linking edits below — a failed link is noted and the pass continues; nothing already created rolls back.

**Body size ceiling.** A sub-issue body past roughly 50KB (GitHub's hard cap is 65,536 characters) is a decomposition smell, not a formatting problem — split the unit further.

**Snapshot invalidation.** Once every `gh issue create` call in this step's batch (every
sub-issue, plus a kept parent) has run, invalidate the session-scoped record snapshot once — the
Idempotency map above stays correct in-memory for the rest of the batch, so invalidation is needed
only after the whole batch, before Step 4 or any later consumer reads the queue again:

```bash
node -e "require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record-snapshot.js').invalidateSnapshot(process.env.CLAUDE_CODE_SESSION_ID)"
```

### Rules

- **Absorb decisions from the design doc** — each sub-issue must be self-contained. The design doc will be deleted (Step 7), so all rationale, decisions, and technical context relevant to that sub-issue lives in its own body.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Include known manual steps — but only ones that survive the triage.** The Manual Steps section is reserved for items that have no CLI, require human judgment, or require out-of-band signoff. Infrastructure setup, env var provisioning, and API key creation with CLIs (`terraform`, `gh secret set`, `vercel env add`, `stripe`, `ldcli`, etc.) do NOT belong here — `/build` Step 2.5 auto-classifies and executes them. See `spec-template.md` Manual Steps section for the triage criteria and the `reason-not-auto` qualifier.

---

## Step 4: Link and order

Every record this run is going to create now has a number (a parent's, under a kept parent; every unit's own, under collapse). This pass wires the relationships between them and absorbs the last of the design doc's context, before Step 7 deletes it.

### Linking

Branches on driver, then — for `github-issues` — on `work-links`.

**Independent 2-unit collapse (Step 2.6, `decomposition-mode.md`) — `**Related:**` cross-links, not parent/child.** When Step 2.6 collapsed two independent units, there is no parent to link either sub-issue to. Instead, each of the two records gets a line-anchored, greppable `**Related:** #N` body line pointing at the other — `work-backend: github-issues`, both `work-links` values (GitHub's own automatic `#N`-mention timeline cross-reference exists but is not greppable record-body text, which is why this explicit line is written even under `work-links: native`); `work-backend: local-files`, the identical `**Related:** {id}` body line, no new frontmatter facet. The **bolded** form is the repo-canonical cross-reference line (`capture/SKILL.md`'s body template), so `/backlog refine` replaces it in place instead of appending a competing second one. Each line names a number, and neither number exists until its record is created, so this is a **post-create edit inside this Step 4 pass**, exactly like every other link here: create both records in Step 3, then recompose each record's full body with its `**Related:**` line and write it once per record (`gh issue edit --body-file` / `writeRecord`) — compose-then-write-once, never an incremental append.

**`work-backend: github-issues`, `work-links: native`:**

- **One command links the whole batch.** Both native write endpoints take the target issue's
  integer database ID (`databaseId`) **in the request body**, never its issue number, and the
  dependency edge lives at `issues/{dependent}/dependencies/blocked_by` — `bin/link-records.js`
  (over `bin/lib/issues/link.js`) resolves every needed id in one GraphQL call and issues the
  writes, so no per-edge `gh api` assembly happens here. Pass any kept parent, every sub-issue,
  and every dependency edge as `dependent:blocker` — under collapse there is no parent, so
  leave `--parent`/`--subs` off and pass only edges (skip the call when there are none):

  ```bash
  # Step 3 captured $SUB_ISSUE_NUM per sub-issue — join them: SUB_ISSUE_NUMS="595,597,598".
  # DEP_EDGES is every dependency edge as dependent:blocker, comma-joined: "598:595,600:530"
  # (blockers may be pre-existing records; leave --blocked-by off when there are none, and leave
  # --parent/--subs off when only edges need wiring — at least one of the two is required).
  node "${CLAUDE_PLUGIN_ROOT}/bin/link-records.js" --parent $PARENT_NUM --subs $SUB_ISSUE_NUMS \
    --blocked-by "$DEP_EDGES"
  # Prints one JSON envelope to stdout (do not redirect it away — read it from the tool result).
  # Owner/repo resolve from `origin`; pass --repo owner/name to override.
  ```

  Read the envelope's `subIssues.failed` and `blockedBy.failed` — a non-empty `failed` list is the
  Write-path resilience case above (note the failed link, continue the pass; never abort the
  decomposition). Exit 1 means the id resolution itself failed (a number that resolves to no
  issue) — stop and check the numbers before retrying. A re-run is safe: an edge GitHub already
  holds lands in `ok` with `already: true`.

- **This command requires `gh`** — the sub-issues and issue-dependencies endpoints have no
  GitHub MCP equivalent, so `_shared/github-write-transport.md`'s MCP path does not cover them.
  When `command -v gh` fails, `bin/link-records.js` exits 2 naming the fallback: link under
  `work-links: body-text` instead (the branch below, which needs only `issue_write`). The
  endpoint family is the one `capabilities-probe.js`'s `probeSchema` checks for via the
  `blockedBy` GraphQL field — the sibling `issueDependenciesSummary` field is count-only and
  insufficient, see that file's header comment.

- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.

**`work-backend: github-issues`, `work-links: body-text`** (fallback when native isn't available):

- Parent ↔ sub-issue — append one task-list line per sub-issue to the parent's body, `- [ ] #{subIssueNum}`, then a single `gh issue edit $PARENT_NUM --body-file` with the recomposed body (design summary + Decision Rationale below + the task list).
- Sub-issue ↔ sub-issue / sub-issue ↔ pre-existing record — add one `Blocked by #N` line to the dependent sub-issue's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $SUB_ISSUE_NUM --body-file` with the recomposed body. When the dependency is between two sub-issues of this same decomposition (not a pre-existing companion record) and this decomposition produced 4 or more sub-issues (the Cross-Spec Promises threshold — see item 3 below), write the extended form instead — `Blocked by #N: {one-line assumption}` — stating what the dependent sub-issue actually needs from #N (`record.js`'s `parseDependencyAssumptions` reads the trailing text; bare lines and pre-existing-record links are unaffected).
- **Authoring the assumption text — mechanical, not prose-shape.** The assumption text should assert a structural fact about #N's own deliverable — a function, symbol, API, file, or exported artifact existing — never a specific prose string, documentation wording, or a claim about what #N's own eventual `## Non-Goals` will or won't scope out. A sibling's `## Non-Goals` narrows *how something is described*, not *whether it structurally exists*, so a mechanical assertion survives that narrowing and a prose-shape one doesn't. Safe example: `Blocked by #211: exposes getStatus() on the queue module`. Fragile example (avoid): `Blocked by #211: documents the retry-window default as "5 minutes" in its README section` — #211's own scoping decision can legitimately drop that exact wording from its docs while still shipping the capability, stranding this check.
- Readers parse this back out with `record.js`'s `parseDependencies(body)` — it returns every `Blocked by #N` target as a deduped, ordered array; a mid-line mention doesn't count, only a line-starting one does.

**`work-backend: local-files`** (no native/body-text choice — frontmatter is the only mechanism):

- Parent ↔ sub-issue — `facets.parent = $PARENT_ID` on each sub-issue.
- Sub-issue ↔ sub-issue / sub-issue ↔ pre-existing record — `facets.blockedBy = [N1, N2, ...]` on the dependent sub-issue.
- Both are `writeRecord` calls — compose-then-write-once, recompose the full facets/body and write once per sub-issue that needs a link. No task-list or `Blocked by #N` text needed; `parent`/`blocked-by` frontmatter is already queryable via `queryRecords`.

There's no ordering step separate from linking — the dependency graph these links encode **is** the order. The old tier tables are gone; nothing replaces them. `priority:*` labels are optional, dispatch-ordering-only, and human-applied — per the permission matrix in `_shared/work-record.md`, no skill here, `/specify` included, ever adds one *autonomously*; `/claude-tweaks:backlog`'s `refine` mode is the sole exception, always gated on an explicit human batch-confirm.

### Decision Rationale and Assumptions

Before Step 7 deletes the design doc, absorb the last of its context into the records that survive:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). When a parent exists, add as a `## Decision Rationale` section in its body — recompose the parent's full body (design summary + this new section + the task list, under `body-text`) and write once. Under collapse, no parent exists to hold it: fold it into each produced record's own body wherever Assumptions goes (below), recomposed and written once per record.
2. **Assumptions** — from the design doc's own stated assumptions, surfaced blind spots, and hard constraints, extract what's relevant to each sub-issue. Fold them into that sub-issue's **existing `## Gotchas` section** as additional bullets — there's no separate `## Assumptions` section anymore. Recompose the affected sub-issue's body and write once.
3. **Cross-Spec Promises** (only when this decomposition produced 4 or more sub-issues — the threshold was the `promise-register-min-leaves` policy lever until its retirement in #331; removal trail: `_shared/policy-deprecations.md`; **unreachable under collapse by arithmetic** — Step 2.6 collapses at most 2 units and this threshold is 4, so a collapsed run never reaches this item and needs no no-parent branch here) — add a `## Cross-Spec Promises` section to the **parent** body, recomposed alongside Decision Rationale and the task list. This seeding step is `work-links: body-text`-specific — only that mode's Linking pass (above) writes `Blocked by #N: {assumption}` lines to seed rows from; `work-links: native` sub-issues have zero such lines at decomposition time (that pass writes no body text at all), so a native-mode decomposition's section still gets created here, just empty at first — `/claude-tweaks:review`'s Step 1.6 can populate it later regardless of `work-links` mode, its writes being plain `gh issue edit`/`gh issue comment` calls. The one permanent exclusion is `work-backend: local-files`: there's no GitHub issue to hold any of it, so a decomposition under that backend never gets a `## Cross-Spec Promises` section, regardless of sub-issue count. Seed one row per `Blocked by #{blocker}: {assumption}` line the Linking pass above just wrote between two sub-issues of this decomposition — `{blocker}` is the same number from that line (the record being depended on); `{owner}` is the dependent sub-issue whose body carries the line (pre-existing-record links don't get a row — the register tracks promises between this parent issue's own sub-issues, not every dependency):

   ```
   | # | Promise | Owner (#sub-issue) | Status |
   |---|---------|-----------------|--------|
   | F1 | sub-issue #{owner} assumes sub-issue #{blocker}: {assumption} | #{owner} | open |
   ```

   When no sub-issue-to-sub-issue assumption lines exist (the threshold is still met — this decomposition simply had no forward dependencies among its sub-issues), still create the section with just the header row — `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) looks for this section by name on every parent-linked record it reviews, and an absent section means "nothing to track at all (below threshold)" while a present-but-empty one means "tracked, nothing found yet." Post one comment on the parent noting the seed: `gh issue comment $PARENT_NUM --body "Cross-Spec Promises seeded: {count} forward reference(s) at decomposition time."` (skip the comment, but still create the empty section, when count is 0).

Step 3's Rules already asked for design-doc absorption while each sub-issue was being drafted; this is the systematic completeness pass — the last chance to catch a sub-issue that missed something, before the design doc becomes unrecoverable.

This is what keeps the records self-contained: reading any record this run produced later explains *why* the approach was chosen without needing the deleted design doc.
