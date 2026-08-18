# Specify — Record Creation and Linking (Steps 3-4)

Loaded by `/claude-tweaks:specify` Step 3 onward, decomposition mode only — shaping mode never reaches this step (it runs `shaping-mode.md` in this skill's directory and exits straight to `SKILL.md`'s `## Next Actions`). Covers creating the parent issue and its sub-issue records (Step 3) and wiring their relationships plus absorbing the last of the design doc's context (Step 4), before Step 7 deletes the design doc.

## Step 3: Create the records

Records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it. Every body is composed fully in memory before any write call — compose-then-write-once, the same discipline Shaping mode uses.

### Idempotency (resume path)

Every record this step creates carries a deterministic fingerprint: `{design-doc-slug}:parent` for the parent, `{design-doc-slug}:{unit-slug}` for each sub-issue. The same design doc always produces the same fingerprint for the same record — that determinism is what makes the check below a real resume path instead of a one-shot guard. **A unit slug must never be the literal string `parent`** — that value is reserved for the parent record's own fingerprint; a sub-issue slugified to `parent` would collide with it in the map below.

Before creating anything, build a fingerprint→number map of every existing marker, once:

`work-backend: github-issues` — reuse Step 1's `/tmp/specify-all-issues.json` (already fetched `--state all --json number,title,labels,body,state`, the REST list, NOT the search index — the search index lags behind fresh writes, including this same run's own); no second `gh issue list` round-trip:

```bash
node -e "
  const { extractFingerprint } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/specify-all-issues.json');
  const map = {};
  for (const i of issues) { const fp = extractFingerprint(i.body); if (fp && !(fp in map)) map[fp] = i.number; }
  require('fs').writeFileSync('/tmp/specify-existing-fingerprints.json', JSON.stringify(map));
"
```

If `/tmp/specify-all-issues.json` is unavailable (a resumed decomposition run in a fresh session with no Step 1 state from this session — shaping mode never reaches this step, so this only matters for a resumed decomposition), fall back to reading through the session-scoped record snapshot the same way Step 1 does — `{Session-scoped record snapshot's read-fresh-or-fetch block (_shared/record-queue-fetch.md), with {tmp-records-file} = /tmp/specify-all-issues.json}`. A resumed session usually still has its own snapshot fresh at `/tmp/ct-records-{session-id}.json` (same session id, same TTL window), so this fallback is typically a cache hit, not a fresh `gh` round-trip.

`work-backend: local-files` (the local marker search — same idea, read every record body and extract its marker). `queryRecords('specs', {})` alone excludes closed records by default (its `filtersOnClosed` check treats an empty filter object as "open, as today," per `local-store.js`'s own header comment on the function) — this map needs both open and closed, mirroring the github driver's `--state all` fetch above: a fingerprint match against an already-closed local record still means "already exists" and must not be recreated on a resumed decomposition. Merge a default (open) query with an explicit `{ closed: true }` query — the same two-call idiom `tests/bin-lib/issues/local-store.test.js` demonstrates:

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const { extractFingerprint } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const records = [...queryRecords('specs', {}), ...queryRecords('specs', { closed: true })];
  const map = {};
  for (const r of records) { const fp = extractFingerprint(r.body); if (fp && !(fp in map)) map[fp] = r.id; }
  require('fs').writeFileSync('/tmp/specify-existing-fingerprints.json', JSON.stringify(map));
"
```

Then, immediately before **each individual create** — parent included, and not just once against the batch list above — re-check that record's fingerprint against the map. A match means the record already exists (a prior partial run, or a concurrent one): skip the create and use the mapped number instead — the parent's number for the sub-issues to link to, a sub-issue's number for Step 4's linking pass. On every successful create, add the new record's fingerprint and number to the in-memory map before moving on — this catches a same-run collision (two units that happen to slugify to the same name) exactly the way it catches a prior-run resume, since the map stays live for the whole loop rather than being a snapshot trusted for its duration.

### Parent record

One parent per decomposition run (or per `phase-N`, when scoped — see Step 7's phase table). Type is always `feature` — the parent is a summary record, not agent-sized work: **parents never get `ready`**, and they carry no `risk:*`/`size:*` scoring at all.

Parent body = design summary: the problem, the chosen approach, the key decisions, and why the alternatives lost. This is deliberately not the design doc pasted verbatim — it's the durable digest that has to survive Step 7 deleting the design doc. Prefix it with a one-line metadata block, `Surface: {value}` — reuse whatever Step 2.5a's whole-design-doc detection already produced (the canonical value list lives in `spec-template.md`). The parent never carries `Design-intent:` — parents are never built or polished directly, so creative intent has nothing to attach to.

```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({title:process.argv[1], body:process.argv[2], type:'feature', fingerprint:process.argv[3]});
  require('fs').writeFileSync('/tmp/specify-parent-payload.json', JSON.stringify(p))" "$PARENT_TITLE" "$PARENT_BODY" "${DESIGN_DOC_SLUG}:parent"

node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/specify-parent-payload.json','utf8')).body)" > /tmp/specify-parent-body.md
```

`recordPayload` returns zero labels for the parent — no origin, no scoring, no `ready`. Two
labels can still land on it, both applied directly via `gh issue create --label` rather than
through the payload: `type:feature` — only under `work-types: labels` — and `parent-issue`,
unconditionally, regardless of `work-types`. `parent-issue` is what makes a parent enumerable
at all: the `{design-doc-slug}:parent` fingerprint is a body marker reachable only through `gh
issue list --search`, which this step's "Resuming after a partial run" note (below) says to
never fall back to — without a label, a `/claude-tweaks:tidy` sweep has no way to find a parent
issue whose gate was never applied
(`_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope). Bootstrap both before the create (per
`_shared/label-bootstrap.md`): `parent-issue` always, `type:feature` only under `work-types:
labels`. The `parent-issue` row below is copied verbatim from `_shared/label-bootstrap.md`'s
canonical `LABELS_JSON` and must stay byte-identical to it; the `type:feature` row comes from
`record.js`'s `TYPE_LABELS`:

```js
[
  ["parent-issue",      "Structure: parent issue — carries the acceptance gate for its sub-issues"],
  ["type:feature",      "Type: new capability or enhancement"]
]
```

The `{design-doc-slug}:parent` fingerprint rides in the body as the standard marker — every
machine-filed record carries one (`_shared/work-record.md`), and it's what the Idempotency map
above keys the parent's resume on.

**`work-backend: github-issues`** — the Type expression branch (`_shared/work-record-config.md`, the config-key table's canonical home; read `work-types` once, never re-probe mid-flow):

```bash
# work-types: native
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --type feature --label parent-issue)
# work-types: labels
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --label type:feature --label parent-issue)

PARENT_NUM=$(basename "$PARENT_URL")
```

**`work-backend: local-files`:** use `createRecord`, not `allocateId`+`writeRecord` separately — two near-simultaneous decomposition runs (or a `/specify` decomposition racing a `/capture` filing) calling `allocateId`+`writeRecord` independently can both read the same directory listing, both compute the same next id, and both succeed under different slugs — two records silently sharing one numeric id, corrupting any later `facets.parent`/`facets.blockedBy` reference that assumes id uniqueness (exactly the kind of reference this decomposition is about to write). `createRecord` closes that race by allocating the id and writing the file as one atomic step (see `bin/lib/issues/local-store.js`'s header comments on `allocateId` and `createRecord`; the same fix `capture/SKILL.md`'s local-files branch already applies). The slug is `deriveSlug(title, existingSlugs)` from that same module — not a hand-derived slugification:

```bash
PARENT_ID=$(node -e "const fs=require('fs');
  const {createRecord, deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const dir='specs';
  const existingSlugs=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  const slug=deriveSlug(process.argv[1], existingSlugs);
  const body=fs.readFileSync('/tmp/specify-parent-body.md', 'utf8');
  const record=createRecord(dir, { slug, title: process.argv[1], body, facets: { type: 'feature', isParentIssue: true } });
  console.log(record.id)" "$PARENT_TITLE")
```

`isParentIssue: true` is the local-files parity for the `parent-issue` label above — the same
queryable-parent problem, solved the same way, on the backend where there is no label at all.
`bin/lib/issues/local-store.js` serializes it as an `is-parent-issue: true` frontmatter line and
parses it back into `facets.isParentIssue`; no sub-issue ever carries it (a sub-issue's own
`createRecord` call below never sets this key, so it stays at its `false` default).
`/claude-tweaks:demo`'s Approve step (`demo/SKILL.md`) reads it to decide whether to close the
parent record once its sub-issues are accepted.

`$PARENT_NUM` / `$PARENT_ID` is now captured — every sub-issue below links back to it.

**If parent creation fails** (`gh` unreachable, transient API error): fall back to `local-store.js` for the parent — same `unsynced: true` fallback as the sub-issue-level one below — and run the rest of this decomposition on the local driver too, so sub-issues have a real parent to link to instead of a GitHub record that doesn't exist. `/tidy`'s Sync finding reconciles the parent and its sub-issues later.

**Resuming after a partial run:** nothing parent-specific — the Idempotency map above already covers it. A `{design-doc-slug}:parent` marker match means a prior run created this parent; reuse the mapped number and skip the create, exactly as with any sub-issue. Never fall back to a title search — `gh issue list --search` rides the search index this step deliberately avoids.

### Sub-issues

**Only sub-issues get `ready`** — and only sub-issues carry `risk:*`/`size:*` scoring; the parent gets neither. One per work unit from Step 2, in any order — Step 4 does the linking once every number exists, so creation order doesn't matter.

**Tasks never become records.** A sub-issue's own internal breakdown — the Deliverables checklist, the Acceptance Criteria list — stays exactly that: a checklist inside the sub-issue's body. `/superpowers:writing-plans` turns it into an execution plan at build time; nothing at this granularity spawns a further issue per task.

**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents (`shaping-mode.md` in this skill's directory), just run once per sub-issue instead of once per shaped record. When Step 2.5b-ii's variant exploration ran and the user accepted a scaffold direction for this sub-issue's surface, also prefix `Visual-reference: {scaffold path}` (`design-pre-steps.md` Step 2.5b-ii item 5) — omit the line entirely when Step 2.5b-ii was skipped, declined, or not offered (the canonical field reference lives in `spec-template.md`). Under `work-backend: github-issues` + `work-links: body-text`, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a sub-issue's own parent (`spec-template.md`).

**Type** — matches the parent (`feature`) unless the unit is clearly a defect fix (a bug report, a regression, broken behavior) — override to `bug` in that case.

**Scoring** — judge each sub-issue's `risk` and `size` (low/medium/high each) from its own Deliverables and Acceptance Criteria — blast radius and reversibility for `risk`, estimated size and file spread for `size` — per `_shared/work-record.md`'s Scoring axis. This is the same judgment Shaping mode's stamping step applies to each shaped record, run here once per sub-issue; the tiers become `$SUB_ISSUE_RISK`/`$SUB_ISSUE_SIZE` below.

**Ceremony** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check")`) against this sub-issue's own composed body — never the parent, which carries no `ceremony:*` label either, mirroring the no-risk/size-on-parents rule above. The verdict (always explicit — no unscored state for this axis) becomes `$SUB_ISSUE_CEREMONY` below.

**Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against this sub-issue's own composed body — never the parent, which carries no scoring labels either. On `FRAMING: solution-baked`, stamp `solution:unjustified` on the sub-issue and fold the RATIONALE's named assumptions into that sub-issue's `## Gotchas` bullets. On `FRAMING: open`, stamp nothing. Sub-issues have no `## Original request` block, so the composed body is the whole input here.

**Slug derivation** — `$UNIT_SLUG` is `deriveSlug(title, existingSlugs)` (`bin/lib/issues/local-store.js`) — the same deterministic algorithm `/claude-tweaks:capture` and `/claude-tweaks:demo` use for their own record creation, not a hand-derived slugification. Seed `existingSlugs` with the literal string `'parent'` (a sub-issue slug must never collide with the parent's reserved fingerprint suffix — see above) plus, under `work-backend: local-files`, the current `specs/` directory listing (same scan `/claude-tweaks:capture`'s local-files branch uses — since each sub-issue's `createRecord` call below writes its file before the next one runs, this rescan also naturally dedupes against slugs already assigned earlier in this same decomposition loop):

```bash
UNIT_SLUG=$(node -e "const fs=require('fs');
  const {deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const dir='specs';
  const onDisk=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  console.log(deriveSlug(process.argv[1], ['parent', ...onDisk]))" "$SUB_ISSUE_TITLE")
```

Reuse this same `$UNIT_SLUG` value below for both the fingerprint and, under `work-backend: local-files`, the record's own slug — do not re-derive it separately at write time.

**Fingerprint** — `{design-doc-slug}:{unit-slug}` (`$UNIT_SLUG` from Slug derivation, above), the sub-issue half of the deterministic scheme the Idempotency section above defines.

```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  });
  require('fs').writeFileSync('/tmp/specify-sub-issue-payload.json', JSON.stringify(p))" \
  "$SUB_ISSUE_TITLE" "$SUB_ISSUE_BODY" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"

node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/specify-sub-issue-payload.json','utf8')).body)" > /tmp/specify-sub-issue-body.md
```

`recordPayload` embeds the fingerprint as `<!-- work-fingerprint: {design-doc-slug}:{unit-slug} -->` in the returned body — `/tmp/specify-sub-issue-body.md` above already carries it, so both drivers below write the same fingerprinted text.

Bootstrap the labels this run is about to apply before the first create (per `_shared/label-bootstrap.md`): `ready` plus every `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` pair in use, plus `solution:unjustified` — and, under `work-types: labels`, the `type:{t}` pairs from `record.js`'s `TYPE_LABELS`, as with the parent.

**`work-backend: github-issues`** — same Type expression branch as the parent. The `recordPayload` call above never passes `solutionUnjustified` (it embeds the fingerprint into the body, not the create call's labels), so its `.labels` cover only `risk:{tier}`, `size:{tier}`, `ceremony:{tier}`, `ready`, and no `by:*` label — a decomposition is human-shaped work, not a health-skill filing. The `--label` flags below are exactly that set; `solution:unjustified` is added separately, below the create blocks, once the Framing verdict is known:

```bash
# work-types: native
SUB_ISSUE_URL=$(gh issue create --title "$SUB_ISSUE_TITLE" --body-file /tmp/specify-sub-issue-body.md \
  --type "$SUB_ISSUE_TYPE" \
  --label "risk:$SUB_ISSUE_RISK" --label "size:$SUB_ISSUE_SIZE" --label "ceremony:$SUB_ISSUE_CEREMONY" --label ready)

# work-types: labels
SUB_ISSUE_URL=$(gh issue create --title "$SUB_ISSUE_TITLE" --body-file /tmp/specify-sub-issue-body.md \
  --label "risk:$SUB_ISSUE_RISK" --label "size:$SUB_ISSUE_SIZE" --label "ceremony:$SUB_ISSUE_CEREMONY" --label ready \
  --label "type:$SUB_ISSUE_TYPE")

SUB_ISSUE_NUM=$(basename "$SUB_ISSUE_URL")
```

When this sub-issue's Framing verdict (above) was `solution-baked`, add `--label "solution:unjustified"` to the create call; on `open` add nothing — the label is presence-only, and absence is the common case since most sub-issues are `open`.

**`work-backend: local-files`** — use `createRecord`, not `allocateId`+`writeRecord` separately, for the same concurrent-creation-race reason as the parent above (`createRecord` allocates the id and writes the file as one atomic step; see `bin/lib/issues/local-store.js`'s header comments). One call carries the same state as facets: `stage: 'ready'` instead of the `ready` label, `origin` omitted for the same no-`by:*` reason. `/tmp/specify-sub-issue-body.md` already carries the fingerprint marker, so the local write preserves it:

```bash
SUB_ISSUE_ID=$(node -e "const {createRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const body = require('fs').readFileSync('/tmp/specify-sub-issue-body.md', 'utf8');
  const record = createRecord('specs', {
    slug: process.argv[1],
    title: process.argv[2],
    body,
    facets: { type: process.argv[3], risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], stage: 'ready' }
  });
  console.log(record.id)" "$UNIT_SLUG" "$SUB_ISSUE_TITLE" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY")
```

Add a `facets.solutionUnjustified: true` key to the object above only when this sub-issue's Framing verdict (above) was `solution-baked`; omit the key entirely on `open` (absent, not null) — unlike `facets.ceremony`, which always gets a value the first time a record is shaped, `facets.solutionUnjustified` is genuinely absent on the common `open` case.

Capture `$SUB_ISSUE_NUM` / `$SUB_ISSUE_ID` for every sub-issue (created or resumed via the Idempotency map) — Step 4's linking pass consumes them.

**Write-path resilience.** A `gh` create failure for one sub-issue (the parent already exists on GitHub) falls back to `local-store.js` for that sub-issue only — write it locally with `unsynced: true` (fingerprint preserved, so a later sync still dedups correctly) and continue with the rest of the batch. Don't abort the whole decomposition over one failed sub-issue. `/tidy`'s Sync finding reconciles the local sub-issue onto GitHub on a later pass. The same rule applies to Step 4's linking edits below — a failed link gets noted and the pass continues, it doesn't roll back everything already created.

**Body size ceiling.** A sub-issue body pushing past roughly 50KB (GitHub's hard cap is 65,536 characters) is a decomposition smell, not a formatting problem — split the unit further rather than shipping an oversized sub-issue.

**Snapshot invalidation.** Once every `gh issue create` call in this step's batch (parent and
every sub-issue) has run, invalidate the session-scoped record snapshot once — this step's own
Idempotency map stays correct in-memory for the rest of the batch without it, so there is no need
to invalidate after each individual create, only after the whole batch, before Step 4 or any later
consumer reads the queue again:

```bash
node -e "require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-snapshot.js').invalidateSnapshot(process.env.CLAUDE_CODE_SESSION_ID)"
```

### Rules

- **Absorb decisions from the design doc** — each sub-issue must be self-contained. The design doc will be deleted (Step 7), so all rationale, decisions, and technical context relevant to that sub-issue lives in its own body.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Include known manual steps — but only ones that survive the triage.** The Manual Steps section is reserved for items that have no CLI, require human judgment, or require out-of-band signoff. Infrastructure setup, env var provisioning, and API key creation with CLIs (`terraform`, `gh secret set`, `vercel env add`, `stripe`, `ldcli`, etc.) do NOT belong here — `/build` Step 2.5 auto-classifies and executes them. See `spec-template.md` Manual Steps section for the triage criteria and the `reason-not-auto` qualifier.

---

## Step 4: Link and order

Every parent and sub-issue number now exists. This pass wires the relationships between them and absorbs the last of the design doc's context, before Step 7 deletes it.

### Linking

Branches on driver, then — for `github-issues` — on `work-links`.

**`work-backend: github-issues`, `work-links: native`:**

- **One command links the whole batch.** Both native write endpoints take the target issue's
  integer database ID (`databaseId`) **in the request body**, never its issue number, and the
  dependency edge lives at `issues/{dependent}/dependencies/blocked_by` — `bin/link-records.js`
  (over `bin/lib/issues/link.js`) resolves every needed id in one GraphQL call and issues the
  writes, so no per-edge `gh api` assembly happens here. Pass the parent, every sub-issue, and
  every dependency edge as `dependent:blocker` (blockers may be pre-existing records from Step 1's
  companion overlaps or Step 2's implicit-dependency notes):

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
- **Mechanical vs. prose-shape assumptions.** The assumption text must assert a structural fact about #N's own deliverable — a function, symbol, API, file, or exported artifact existing — never a specific prose string, documentation wording, or a claim about what #N's own `## Non-Goals` will or won't scope out. #N's `## Non-Goals`, finalized after this line is written, can legitimately narrow *how something is described* (prose/documentation shape) without touching *whether it structurally exists* — so a mechanical assumption survives that later scoping decision where a prose-shape one does not. Safe (mechanical): `Blocked by #41: exposes getStatus()`. Unsafe (prose-shape): `Blocked by #41: documents the retry behavior as "exponential backoff"` — #41's Non-Goals can legitimately drop that exact phrasing from its docs while still shipping the capability as code, silently invalidating the assumption.
- Readers parse this back out with `record.js`'s `parseDependencies(body)` — it returns every `Blocked by #N` target as a deduped, ordered array; a mid-line mention doesn't count, only a line-starting one does.

**`work-backend: local-files`** (no native/body-text choice — frontmatter is the only mechanism):

- Parent ↔ sub-issue — `facets.parent = $PARENT_ID` on each sub-issue.
- Sub-issue ↔ sub-issue / sub-issue ↔ pre-existing record — `facets.blockedBy = [N1, N2, ...]` on the dependent sub-issue.
- Both are `writeRecord` calls — compose-then-write-once, recompose the full facets/body and write once per sub-issue that needs a link. No task-list or `Blocked by #N` text needed; `parent`/`blocked-by` frontmatter is already queryable via `queryRecords`.

There's no ordering step separate from linking — the dependency graph these links encode **is** the order. The old tier tables are gone; nothing replaces them. `priority:*` labels are optional, dispatch-ordering-only, and human-applied only — per the permission matrix in `_shared/work-record.md`, no skill in this pipeline, including `/specify`, ever adds one *autonomously*. The sole exception is `/claude-tweaks:backlog`'s `refine` mode, which may write `priority:*` — always gated on an explicit human batch-confirm, never silently.

### Decision Rationale and Assumptions

Before Step 7 deletes the design doc, absorb the last of its context into the records that survive:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). Add as a `## Decision Rationale` section in the **parent** body — recompose the parent's full body (design summary + this new section + the task list, under `body-text`) and write once.
2. **Assumptions** — from the design doc's own stated assumptions, surfaced blind spots, and hard constraints, extract what's relevant to each sub-issue. Fold them into that sub-issue's **existing `## Gotchas` section** as additional bullets — there's no separate `## Assumptions` section anymore. Recompose the affected sub-issue's body and write once.
3. **Cross-Spec Promises** (only when this decomposition produced 4 or more sub-issues — the threshold was the `promise-register-min-leaves` policy lever until its retirement in #331; removal trail: `_shared/policy-deprecations.md`) — add a `## Cross-Spec Promises` section to the **parent** body, recomposed alongside Decision Rationale and the task list. This seeding step is `work-links: body-text`-specific — only that mode's Linking pass (above) writes `Blocked by #N: {assumption}` lines to seed rows from; `work-links: native` sub-issues have zero such lines at decomposition time (native's Linking pass writes no body text at all — see Linking, above), so a native-mode decomposition's section still gets created here, just empty at first — `/claude-tweaks:review`'s Step 1.6 can populate it later regardless of `work-links` mode, since its writes are plain `gh issue edit`/`gh issue comment` calls with no native-vs-body-text restriction. The one genuine, permanent exclusion is `work-backend: local-files`: there's no GitHub issue to hold a section, a row, or a comment on at all, so a decomposition under that backend never gets a `## Cross-Spec Promises` section, regardless of sub-issue count. Seed one row per `Blocked by #{blocker}: {assumption}` line the Linking pass above just wrote between two sub-issues of this decomposition — `{blocker}` is the same number from that line (the record being depended on); `{owner}` is the dependent sub-issue whose body carries the line (pre-existing-record links don't get a row — the register tracks promises between this parent issue's own sub-issues, not every dependency):

   ```
   | # | Promise | Owner (#sub-issue) | Status |
   |---|---------|-----------------|--------|
   | F1 | sub-issue #{owner} assumes sub-issue #{blocker}: {assumption} | #{owner} | open |
   ```

   When no sub-issue-to-sub-issue assumption lines exist (the threshold is still met — this decomposition simply had no forward dependencies among its sub-issues), still create the section with just the header row — `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) looks for this section by name on every parent-linked record it reviews, and an absent section means "nothing to track at all (below threshold)" while a present-but-empty one means "tracked, nothing found yet." Post one comment on the parent noting the seed: `gh issue comment $PARENT_NUM --body "Cross-Spec Promises seeded: {count} forward reference(s) at decomposition time."` (skip the comment, but still create the empty section, when count is 0).

Step 3's Rules already asked for design-doc absorption while each sub-issue was being drafted; this is the systematic completeness pass — the last chance to catch a sub-issue that missed something, before the design doc becomes unrecoverable.

This is what keeps the records self-contained: reading the parent, or any sub-issue, later explains *why* the approach was chosen without needing the deleted design doc.
