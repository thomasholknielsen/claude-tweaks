# Spec 15: Health Producers on the Unified Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all three health skills (code-health, harness-health, journey-health) onto `record.js`'s `recordPayload`: `by:*` origin, colon scoring, born-`ready`, Type, `work-fingerprint` marker — with mapping tables stated literally in each SKILL.md, validators updated, and journey-health joining the origin-agnostic gate pipeline.

**Architecture:** Each builder keeps its per-skill body composition and top-level payload fields, delegating ONLY label/marker assembly to `recordPayload` (spec 14). journey-health's body is additionally recomposed into spec shape (Current State / Deliverables / Acceptance Criteria) because born-`ready` asserts it — the old Description/Evidence/Recommended Action sections do NOT satisfy the gate's re-verification. `record.js`'s legacy fingerprint read is widened to all three producers' historical markers.

**Tech Stack:** Node 18+, node:test. Suites: `bin/lib/{code-health,harness-health,journey-health}/tests/`, `bin/lib/issues/tests/`.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel` before any git command.
- **Producer/consumer invariant (documented incident):** `harness-health/issue-payload.js`'s return object carries `id, kind, target, assetType, category, section, classification, confidence, reversibility, oldString, newString` — harness-health SKILL.md Step 7 branches on these. They MUST all survive the repoint. Same for journey-health's `id, journey, category, section, severity, confidence`.
- **Mapping tables (canonical for this spec):**
  - code-health: `risk`/`effort` finding fields → `risk:{v}` / `effort:{v}` (colon form); Type `task`; origin `code-health`.
  - harness-health: classification `additive` → `risk:low` + `effort:low`; `restructural` → `risk:medium` + `effort:high`; kind `new-skill` → NO risk/effort (unscored — the gate shows "needs scoring"); Type `task`; origin `harness-health`; keep `harness-health:additive|restructural|new-skill` as optional diagnostic labels.
  - journey-health: severity `high`→`risk:high`, `med`→`risk:medium`, `low`→`risk:low`; effort always `effort:medium` (no scope field exists to derive from — deterministic); Type `bug` when `category === 'regression-suspected'`, else `task`; origin `journey-health`; keep `journey-health:{category}` as optional diagnostic; DROP the bare `journey-health:{severity}` label (severity now expressed as risk).
  - All three: `ready: true` (born-ready), `fingerprint: finding.id` (recordPayload appends the `work-fingerprint` marker — remove the hand-built legacy marker line from body arrays).
- Bare-name labels (`code-health`, `harness-health`, `journey-health`) are RETIRED as mechanical origin (replaced by `by:*`). Where a SKILL.md keeps a diagnostic label, the SKILL.md must say it is optional-diagnostic.
- Vocabulary sweep rule (from this program's review learnings): in every file you touch, rename ALL occurrences of retiring vocabulary (old label names, old marker names, "not pulled by /triage" carve-outs), not just the ones enumerated here. Completion contract = the AC greps, not the enumerated list.
- skill-md tests assert literal SKILL.md strings — update them in the SAME task as the prose.
- No emojis; commit style `{Verb} {what} — {detail}`; stage specific files.

---

### Task 1: Widen `record.js` legacy fingerprint read + auto-mode-contract born-ready exemption note

**Files:**
- Modify: `bin/lib/issues/record.js` (FP_RE_LEGACY only)
- Modify: `bin/lib/issues/tests/record.test.js` (extend)
- Modify: `skills/_shared/auto-mode-contract.md` (one parenthetical)

**Interfaces:**
- Produces: `extractFingerprint` reads legacy markers from ALL THREE producers: `<!-- code-health-fingerprint: X -->`, `<!-- harness-health-fingerprint: X -->`, `<!-- journey-health-fingerprint: X -->` (plus `work-fingerprint`, which still wins). Tasks 2-4's suppression sections cite this.

- [ ] **Step 1 (RED):** add tests: `extractFingerprint('<!-- harness-health-fingerprint: hh:1 -->') === 'hh:1'`; same for `journey-health-fingerprint`; work-marker still wins over each; run focused, see the two new failures.
- [ ] **Step 2 (GREEN):** change `FP_RE_LEGACY` to `/<!--\s*(?:code-health|harness-health|journey-health)-fingerprint:\s*([^\s>]+)\s*-->/` (capture group stays group 1).
- [ ] **Step 3:** In `skills/_shared/auto-mode-contract.md`, the "What `auto` does NOT silence" row `| Work-record creation (new backlog records) | ... |` — append to its second cell: ` Scheduled health-skill filing is exempt — born-ready records are those skills' documented output (see \`_shared/work-record.md\`, born-ready rule).` (This resolves run-ledger item 2 / review finding M2.)
- [ ] **Step 4:** `node --test bin/lib/issues/tests/record.test.js` green; `grep -c "harness-health-fingerprint" bin/lib/issues/record.js` ≥ 1.
- [ ] **Step 5: Commit** — `Widen legacy fingerprint read to all three health producers — note born-ready filing exemption in auto-mode contract`

---

### Task 2: code-health onto recordPayload

**Files:**
- Modify: `bin/lib/code-health/issue-payload.js` (v2 builder), `bin/lib/code-health/validate-finding.js` (or wherever its label enum lives — locate by grep), `skills/code-health/SKILL.md` (filing/bootstrap/wontfix sections)
- Test: `bin/lib/code-health/tests/*.test.js` (update payload + skill-md assertions)

**Interfaces:**
- Consumes: `recordPayload`, `TYPE_LABELS`, `extractFingerprint` from `../issues/record.js`.
- Produces: `toIssuePayloadV2(finding)` → `{ title, body, labels, type: 'task' }` where labels = `['by:code-health', 'risk:{finding.risk}', 'effort:{finding.effort}', 'ready']` (exactly these four; per-criterion diagnostics were already retired in v2 — do not re-add).

**Implementation rules:**
- Compose the body EXACTLY as today minus the hand-built marker line (recordPayload appends the work-fingerprint marker from `fingerprint: finding.id`). The header/sections/footer lines are unchanged.
- Call `recordPayload({ title: finding.title, body: composedBody, type: 'task', origin: 'code-health', risk: finding.risk, effort: finding.effort, ready: true, fingerprint: finding.id })` and return its result (spread nothing after it; if extra fields are needed, pick them explicitly BEFORE the payload object).
- v1 `toIssuePayload` (legacy severity labels): leave untouched — it is the pre-v2 compat path; verify via grep who calls it and note in your report.
- `validate-finding.js`: update any emitted-label enum/regex from hyphen forms to colon forms; legacy hyphen READS may stay only with a `// legacy` comment.
- SKILL.md filing section: bootstrap only the labels about to be applied (`by:code-health`, the two scoring labels, `ready` — copy pairs from `_shared/label-bootstrap.md`'s canonical LABELS_JSON); reference `_shared/work-record.md` by path as the taxonomy home; state born-`ready` explicitly; state the mapping literally (risk/effort fields → colon labels, Type task); wontfix section: state suppression reads `wontfix` + dual fingerprint markers via `extractFingerprint` (work-fingerprint new, code-health-fingerprint legacy).

- [ ] **Step 1 (RED):** update payload tests to expect the new label set + `type` field + work-fingerprint marker in body (and NOT the legacy marker); run code-health suite, see failures.
- [ ] **Step 2 (GREEN):** implement builder + validator changes.
- [ ] **Step 3:** SKILL.md edits + skill-md test updates in the same task.
- [ ] **Step 4:** `node --test bin/lib/code-health/tests/*.test.js` green; `grep -n "risk-low\|risk-medium\|risk-high\|effort-low\|effort-medium\|effort-high" bin/lib/code-health/` → hits only on `// legacy`-commented read lines or their tests; `grep -c "work-record.md" skills/code-health/SKILL.md` ≥ 1.
- [ ] **Step 5: Commit** — `Move code-health filing onto recordPayload — by:code-health, colon scoring, born-ready, work-fingerprint`

---

### Task 3: harness-health onto recordPayload

**Files:**
- Modify: `bin/lib/harness-health/issue-payload.js`, its validate-finding/enum file, `skills/harness-health/SKILL.md`
- Test: `bin/lib/harness-health/tests/*.test.js`

**Interfaces:**
- Produces: `toIssuePayload(finding)` → same top-level field set as today (`id, kind, target, assetType, category, section, classification, confidence, reversibility, oldString, newString, title, body, labels`) PLUS `type: 'task'`; labels per the mapping table:
  - `additive`: `['by:harness-health', 'risk:low', 'effort:low', 'ready', 'harness-health:additive']`
  - `restructural`: `['by:harness-health', 'risk:medium', 'effort:high', 'ready', 'harness-health:restructural']`
  - `new-skill`: `['by:harness-health', 'ready', 'harness-health:new-skill']` (NO scoring — unscored by design; the gate flags "needs scoring")

**Implementation rules:**
- Build the record base via `recordPayload({title, body, type:'task', origin:'harness-health', risk, effort, ready:true, fingerprint: finding.id})` (risk/effort omitted for new-skill), then compose the final return by EXPLICIT field picks: `{ id: finding.id, kind: finding.kind, ..., title: payload.title, body: payload.body, labels: [...payload.labels, diagnosticLabel], type: payload.type }`. NEVER spread the parsed `finding` after derived fields.
- Diagnostic label appended AFTER recordPayload's labels (order: canonical labels first, diagnostic last).
- Body: unchanged except the hand-built `harness-health-fingerprint` marker line is removed (recordPayload appends work-fingerprint).
- SKILL.md: state the classification→scoring fold table LITERALLY (a markdown table: additive → risk:low + effort:low; restructural → risk:medium + effort:high; new-skill → unscored); born-ready statement; bootstrap-only-applied-labels; work-record.md reference; wontfix + dual-marker suppression sentence (legacy marker: `harness-health-fingerprint`, read via `extractFingerprint`); Step 7's consumers of the preserved fields are untouched — verify Step 7's field names still all exist in the payload (list them in your report).
- SKILL.md filing step must also document the **Type expression branch** (per `_shared/work-record.md`'s config-key table): when the project's `work-types` key reads `native`, apply the payload's `type` via GitHub's native Issue Type; when `labels`, add the matching `type:task` label (pair from `record.js`'s `TYPE_LABELS`). One short paragraph + the branch shown in the filing snippet.

- [ ] **Step 1 (RED)** → **Step 2 (GREEN)** → **Step 3 (SKILL.md + skill-md tests)** → **Step 4 (suite + greps as Task 2, harness-health paths)** — also `grep -n "not pulled by\|never pulled by" skills/harness-health/SKILL.md` → 0.
- [ ] **Step 5: Commit** — `Move harness-health filing onto recordPayload — classification folds into scoring axis, born-ready`

---

### Task 4: journey-health onto recordPayload + spec-shaped body

**Files:**
- Modify: `bin/lib/journey-health/issue-payload.js`, its validator, `skills/journey-health/SKILL.md`
- Test: `bin/lib/journey-health/tests/*.test.js`

**Interfaces:**
- Produces: `toIssuePayload(finding)` → today's top-level fields (`id, journey, category, section, severity, confidence`) + `title, body, labels, type`; labels: `['by:journey-health', 'risk:{map}', 'effort:medium', 'ready', 'journey-health:{category}']`; type `bug` iff `category === 'regression-suspected'` else `task`.

**Implementation rules — body recomposition (load-bearing):** the current sections (`## Description`, `## Evidence`, `## Recommended Action`) are NOT spec-shaped; born-`ready` asserts the gate's structural check (Current State / Deliverables / Acceptance Criteria present, non-empty). Recompose exactly:

```
{header line — unchanged}

## Current State

{finding.description}

{finding.reason}

## Deliverables

{finding.recommendation}

## Acceptance Criteria

The condition described above is resolved: a fresh `/claude-tweaks:journey-health` audit of journey '{finding.journey}' files no finding with this fingerprint.

{footer line — unchanged}
```

- recordPayload call: `{title, body, type, origin:'journey-health', risk: SEVERITY_TO_RISK[finding.severity], effort:'medium', ready:true, fingerprint: finding.id}` with `SEVERITY_TO_RISK = { high:'high', med:'medium', low:'low' }` (colon labels come from recordPayload — pass tier words only). Unknown severity → let recordPayload's validation throw (surfaces bad data early).
- Drop the `journey-health:{severity}` label; keep `journey-health:{category}` as the one diagnostic (appended after canonical labels).
- SKILL.md: DELETE every "not pulled by /triage" / "deliberately outside triage" carve-out; state pipeline membership ("records enter the same gate worklist as the other producers"); severity→risk + effort:medium + Type mapping tables literal; born-ready; bootstrap-only-applied; work-record.md reference; wontfix + dual-marker sentence (legacy `journey-health-fingerprint`); the Type expression branch paragraph (`work-types: native` → native Issue Type; `labels` → `type:bug`/`type:task` label from TYPE_LABELS) in the filing step.

- [ ] **Step 1 (RED)** → **Step 2 (GREEN)** → **Step 3 (SKILL.md + skill-md tests)** → **Step 4:** suite green + `grep -n "not pulled by /triage\|never pulled by" skills/journey-health/SKILL.md` → 0 + `grep -c "## Current State" bin/lib/journey-health/issue-payload.js` ≥ 1.
- [ ] **Step 5: Commit** — `Move journey-health filing onto recordPayload — spec-shaped body, severity folds to risk, joins the gate pipeline`

---

### Task 5: Spec-15 acceptance sweep

- [ ] **Step 1:** Run the full sweep:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23"
node --test bin/lib/code-health/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js   # AC 1
npm test 2>&1 | tail -5
# AC 3 — hyphen forms only on legacy-commented lines/tests:
grep -rn "risk-low\|risk-medium\|risk-high\|effort-low\|effort-medium\|effort-high" bin/lib/code-health/ bin/lib/harness-health/ bin/lib/journey-health/
# AC 4:
grep -n "not pulled by /triage\|never pulled by" skills/journey-health/SKILL.md   # expect 0
# AC 5 — emitted bodies carry work-fingerprint, not legacy (verify via the tests' expected bodies + this grep):
grep -rn "code-health-fingerprint\|harness-health-fingerprint\|journey-health-fingerprint" bin/lib/code-health/issue-payload.js bin/lib/harness-health/issue-payload.js bin/lib/journey-health/issue-payload.js   # expect 0 (emit paths clean)
# AC 6:
for f in skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md; do grep -q "work-record.md" "$f" || echo "MISSING work-record ref: $f"; done
# AC 2 spot-check (exactly one by:*, one risk:*, one effort:*, ready — new-skill excepted):
node -e "const ch=require('./bin/lib/code-health/issue-payload.js'); const p=ch.toIssuePayloadV2({id:'x',criterion:'c',risk:'low',severity:'medium',likelihood:'l',effort:'low',confidence:'high',areaId:'a',anchor:'f.js',title:'t',evidence:'e',suggestedApproach:'s',acceptance:'a'}); const L=p.labels; console.log(JSON.stringify(L)); if(L.filter(x=>x.startsWith('by:')).length!==1||!L.includes('ready')) throw new Error('AC2 fail')"
```

- [ ] **Step 2:** Fix findings (scope: spec-15 files only), re-run until clean. Additional sweep item: `for f in skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md; do grep -q "work-types" "$f" || echo "MISSING Type-branch doc: $f"; done` — every filing section documents the Type expression branch; add the paragraph to `skills/code-health/SKILL.md` (Task 2 predates this check) if missing.
- [ ] **Step 3:** Resolve run-ledger item 2: edit `docs/plans/2026-07-14-unified-work-record-ledger.md` row 2 status `open` → `fixed`, resolution `auto-mode-contract exemption note + SKILL.md born-ready statements — {commit}`.
- [ ] **Step 4: Commit** — `Fix spec-15 acceptance sweep findings — ledger item 2 resolved`
