# Spec 14: Record-Store Core Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node foundation of the unified work record: `record.js` (taxonomy literals, payload assembly, facet/fingerprint/dependency readers), `tier.js` rewritten to grant recommendations, `capabilities-probe.js`, and the `local-files` driver `local-store.js` — all with tests, no network in tests.

**Architecture:** Flat sibling modules in `bin/lib/issues/` (NOT a nested `_shared/`). `record.js` owns every label-string literal — other modules and later specs import from it. `local-store.js` parses frontmatter with the same no-dependency line-regex style as `bin/lib/policy.js`. Prose twin: `skills/_shared/work-record.md` (already on this branch) — if code and contract disagree, one has a bug.

**Tech Stack:** Node 18+ built-ins only (fs, path, child_process). Tests: `node:test` + `node:assert`, files in `bin/lib/issues/tests/*.test.js` (already covered by `npm test`).

## Global Constraints

- Work from the shared worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — every task: `cd` there first; verify `pwd` + `git rev-parse --show-toplevel`.
- TDD per task: write the named failing tests first (RED), run them to see the exact failure, implement, run again (GREEN). Record RED/GREEN evidence in your report.
- **No network in tests** — fake runners everywhere; fakes must be **lazily-invoked functions**, never eagerly-computed IIFEs (CLAUDE.md rule).
- **Never spread parsed external JSON after derived fields** — `{ ...parsed, derived }` forbidden when `derived` must win; always `{ ...parsed }` first or explicit field picks (CLAUDE.md spread-order rule).
- **Explicit flags over truthiness** for optional state slices (the `includeRemembered` lesson).
- Enum validation throws on **unknown values**, never on **absence** (omitted origin = human-filed record, valid).
- Canonical enums (from `skills/_shared/work-record.md`): type `bug|feature|task`; origin `code-health|harness-health|journey-health|capture`; risk/effort `low|medium|high`; priority `high|medium|low`.
- Label literals (exact): `by:{origin}`, `risk:{tier}`, `effort:{tier}`, `parked`, `ready`, `auto:build`, `auto:merge`, `bot:in-progress`, `bot:blocked`, `wontfix`, `priority:{p}`, `type:{t}`.
- Do NOT touch `ingest.js`, `backlog.js`, `claims.js`, `retry.js`, `grouping.js` code (AC 7: their tests pass unchanged) — except the two comment/fixture `status:*` mentions named in Task 3.
- Commit style: `{Verb} {what} — {detail}`; stage specific files only.

---

### Task 1: `record.js` — taxonomy literals + `recordPayload`

**Files:**
- Create: `bin/lib/issues/record.js`
- Test: `bin/lib/issues/tests/record.test.js`

**Interfaces (Produces):**
```js
// All label-string literals live HERE; every other module imports them.
ORIGINS = ['code-health', 'harness-health', 'journey-health', 'capture']
TYPES = ['bug', 'feature', 'task']
TIERS = ['low', 'medium', 'high']
PRIORITIES = ['high', 'medium', 'low']
LABELS = { READY:'ready', PARKED:'parked', AUTO_BUILD:'auto:build', AUTO_MERGE:'auto:merge',
           BOT_IN_PROGRESS:'bot:in-progress', BOT_BLOCKED:'bot:blocked', WONTFIX:'wontfix' }
// F8 from the program promise register — type:* label descriptions home (≤100 chars each):
TYPE_LABELS = [
  ['type:bug', 'Type: a defect in existing behavior'],
  ['type:feature', 'Type: new capability or enhancement'],
  ['type:task', 'Type: maintenance, refactor, docs, or chore work'],
]
recordPayload({ title, body, type, origin, risk, effort, ready, parked, priority, fingerprint })
  -> { title, body, labels: string[], type }
```

**Behavior:**
- `title` (required, non-empty string) and `body` (required string) — throw `Error` naming the field if missing/wrong type.
- `type` required, must be in `TYPES` → returned as the `type` field (caller decides native-vs-label expression; when the caller needs the label form it uses `TYPE_LABELS`). Unknown → throw listing allowed values.
- `origin` optional. Present → must be in `ORIGINS`, emits `by:{origin}` label. **Omitted → no `by:*` label, no throw.**
- `risk`/`effort` optional; present → validate against `TIERS`, emit `risk:{v}` / `effort:{v}`.
- `priority` optional; validate against `PRIORITIES`, emit `priority:{v}`.
- `ready` / `parked` optional booleans; both true → throw `'a record cannot be both ready and parked'`; emit `ready` / `parked` label respectively.
- `fingerprint` optional non-empty string → body returned as `body + '\n\n<!-- work-fingerprint: ' + fingerprint + ' -->'`; omitted → body unchanged.
- Label order (deterministic, for stable tests): `by:*`, `risk:*`, `effort:*`, `ready`, `parked`, `priority:*`.
- Export everything: `module.exports = { ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload, ... }` (later tasks extend this object — write exports so Task 2 can append).

- [ ] **Step 1: Write failing tests** — exact cases (spec 14 AC 1 + validation):

```js
// born-ready health record
recordPayload({ title:'t', body:'b', type:'task', origin:'code-health', risk:'low', effort:'low', ready:true, fingerprint:'ch:abc' })
// → labels deepStrictEqual ['by:code-health','risk:low','effort:low','ready']; type 'task';
//   body === 'b\n\n<!-- work-fingerprint: ch:abc -->'
// plain capture record
recordPayload({ title:'t', body:'b', type:'feature', origin:'capture' })
// → labels ['by:capture']; body 'b' (no marker)
// origin-omitted (human-filed / side-effect)
recordPayload({ title:'t', body:'b', type:'bug' })
// → labels []; no throw
// unknown enum values throw; absence does not
assert.throws(() => recordPayload({ title:'t', body:'b', type:'epic' }), /bug|feature|task/);
assert.throws(() => recordPayload({ title:'t', body:'b', type:'task', origin:'wrap-up' }), /origin/);
assert.throws(() => recordPayload({ title:'t', body:'b', type:'task', risk:'critical' }), /risk/);
assert.throws(() => recordPayload({ title:'t', body:'b', type:'task', ready:true, parked:true }), /both ready and parked/);
// priority + parked emission
recordPayload({ title:'t', body:'b', type:'task', parked:true, priority:'high' })
// → labels ['parked','priority:high']
// TYPE_LABELS: exactly 3 pairs, names type:bug|feature|task, every description ≤ 100 chars
```

- [ ] **Step 2: Run tests, verify FAIL** (`node --test bin/lib/issues/tests/record.test.js` — module not found)
- [ ] **Step 3: Implement `record.js`** per Behavior above (validation helper: `function oneOf(name, value, allowed)` throwing `Error(\`${name} must be one of ${allowed.join('|')} (got "${value}")\`)`)
- [ ] **Step 4: Run tests, verify PASS**
- [ ] **Step 5: Commit** — `git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js && git commit -m "Add record.js — unified work-record payload assembly and taxonomy literals"`

---

### Task 2: `record.js` readers — fingerprints, facets, dependencies

**Files:**
- Modify: `bin/lib/issues/record.js` (extend exports)
- Test: extend `bin/lib/issues/tests/record.test.js`

**Interfaces (Produces):**
```js
FP_RE_WORK   // /<!--\s*work-fingerprint:\s*([^\s>]+)\s*-->/
FP_RE_LEGACY // /<!--\s*code-health-fingerprint:\s*([^\s>]+)\s*-->/
extractFingerprint(body) -> string|null   // work marker wins when both present
parseRecordFacets(labels) -> {
  origin: 'code-health'|'harness-health'|'journey-health'|'capture'|null,
  risk: 'low'|'medium'|'high'|null, effort: ..., priority: 'high'|'medium'|'low'|null,
  stage: 'backlog'|'parked'|'ready',            // ready > parked > backlog precedence
  grants: { build: boolean, merge: boolean },    // explicit booleans, never undefined
  bot: { inProgress: boolean, blocked: boolean } // explicit booleans
}
parseDependencies(body) -> number[]  // 'Blocked by #N' lines, order of appearance, deduped
```

**Behavior:**
- `labels` accepts strings or `{name}` objects (same normalization as `tier.js`/`ingest.js`: `(labels||[]).map(l => typeof l==='string' ? l : l.name).filter(Boolean)`).
- `parseDependencies` matches lines `/^Blocked by #(\d+)\b/` (multiline), returns numbers in order, dedupes repeats.
- `extractFingerprint(null/undefined/'')` → null.

- [ ] **Step 1: Write failing tests** — exact cases (ACs 2, 4, 5):

```js
// AC 2 — dual-marker extraction
extractFingerprint('x\n<!-- code-health-fingerprint: old:1 -->') === 'old:1'
extractFingerprint('x\n<!-- work-fingerprint: new:2 -->') === 'new:2'
extractFingerprint('<!-- code-health-fingerprint: old:1 -->\n<!-- work-fingerprint: new:2 -->') === 'new:2'  // new wins
extractFingerprint('no markers here') === null
// AC 4 — facets
parseRecordFacets(['by:capture','parked'])
// → { origin:'capture', risk:null, effort:null, priority:null, stage:'parked',
//     grants:{build:false,merge:false}, bot:{inProgress:false,blocked:false} }
parseRecordFacets(['ready','auto:build','bot:in-progress'])
// → stage 'ready', grants {build:true, merge:false}, bot {inProgress:true, blocked:false}, origin null
parseRecordFacets([])
// → stage 'backlog', everything null/false
parseRecordFacets([{name:'risk:high'},{name:'effort:low'},{name:'priority:medium'},{name:'wontfix'}])
// → risk 'high', effort 'low', priority 'medium', stage 'backlog'
parseRecordFacets(['ready','parked'])  // malformed but must be deterministic
// → stage 'ready' (ready > parked precedence, documented)
// AC 5 — dependencies
assert.deepStrictEqual(parseDependencies('intro\nBlocked by #12\nBlocked by #7\ntail'), [12, 7]);
assert.deepStrictEqual(parseDependencies('Blocked by #12\nBlocked by #12'), [12]);
assert.deepStrictEqual(parseDependencies('no deps'), []);
assert.deepStrictEqual(parseDependencies('see Blocked by #9 mid-line'), []);  // line-anchored only
```

- [ ] **Step 2: RED** — run, see failures
- [ ] **Step 3: Implement** (facet parsing iterates normalized names once; explicit `false` defaults FIRST, then set true/values as labels match — never rely on truthy defaults)
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Commit** — `Add record.js readers — dual fingerprint extraction, facet parsing, dependency lines`

---

### Task 3: `tier.js` rewrite — `recommendGrants` + colon-form scoring + legacy reads; bot:* comment touch-up

**Files:**
- Modify: `bin/lib/issues/tier.js` (rewrite)
- Modify: `bin/lib/issues/tests/tier.test.js` (extend; keep existing tests passing via the deprecated alias)
- Modify: `bin/lib/issues/labels.js` line 5 comment: `status:in-progress` → `bot:in-progress` (the referenced commit fixed the cap bug; the label has since been renamed — reword to `...fixed this exact bug once for the claim-mirror label (now bot:in-progress).`)
- Modify: `bin/lib/issues/tests/labels.test.js` line ~51 fixture pair `['status:in-progress', ...]` → `['bot:in-progress', 'Bot state: an agent currently holds the claim on this record']`; update the line-34 comment mention the same way.

**Interfaces (Produces):**
```js
extractRiskEffort(labels) -> { riskTier: 'low'|'medium'|'high'|undefined, effortTier: ... }
// Reads, in precedence order (first adapter that matches wins):
//   1. colon forms: 'risk:low' / 'effort:low'            (canonical, emitted by record.js consumers)
//   2. legacy prefixed hyphen forms: 'code-health:risk-low' / 'code-health:effort-low'
//   3. legacy bare hyphen forms: 'risk-low' / 'effort-low'
//   4. legacy harness-health classification: additive → low/low, restructural → high/high
//      ('harness-health:new-skill' stays unmatched — never grant-eligible)
recommendGrants({ risk, effort }) -> { build: boolean, merge: boolean }
// low+low → {build:true, merge:true}; any other KNOWN pair → {build:true, merge:false};
// missing or unknown tier on either axis → {build:false, merge:false}  (unscored = never recommended)
recommendTier({ riskTier, effortTier }) -> 'fast-track'|'approved'   // DEPRECATED alias:
// maps to recommendGrants({risk:riskTier, effort:effortTier}); merge→'fast-track' else 'approved'.
// Keep so pre-migration tests/callers stay green; carries a // legacy comment.
```

- [ ] **Step 1: Write failing tests** — exact new cases (AC 3):

```js
recommendGrants({risk:'low', effort:'low'})    // → {build:true,  merge:true}
recommendGrants({risk:'low', effort:'medium'}) // → {build:true,  merge:false}
recommendGrants({risk:'high', effort:'low'})   // → {build:true,  merge:false}
recommendGrants({risk:'medium', effort:'medium'}) // → {build:true, merge:false}
recommendGrants({risk:'low'})                  // → {build:false, merge:false}
recommendGrants({})                            // → {build:false, merge:false}
recommendGrants({risk:'critical', effort:'low'}) // → {build:false, merge:false}  (unknown ≠ known)
// colon-form extraction (canonical):
extractRiskEffort(['risk:low','effort:medium'])          // → {riskTier:'low', effortTier:'medium'}
extractRiskEffort([{name:'risk:high'},{name:'effort:high'}])
// colon form wins over legacy when both present:
extractRiskEffort(['risk:low','code-health:risk-high'])  // → riskTier 'low'
// legacy forms still read:
extractRiskEffort(['code-health:risk-low','code-health:effort-low'])  // → low/low (existing tests keep this)
extractRiskEffort(['risk-medium','effort-high'])         // → {riskTier:'medium', effortTier:'high'}
extractRiskEffort(['harness-health:additive'])           // → low/low (existing)
// ALL existing tier.test.js tests must still pass unchanged (recommendTier alias intact).
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement rewrite** (adapter list order = colon, code-health-prefixed, bare-hyphen, harness-health; each adapter may return partial `{riskTier}` or `{effortTier}` — resolve per-axis independently: for each axis take the first adapter in precedence order that yields that axis, so `['risk:low','code-health:effort-medium']` → low/medium)
- [ ] **Step 4: GREEN — run the ENTIRE issues suite** `node --test bin/lib/issues/tests/*.test.js` (labels + tier + untouched suites all green)
- [ ] **Step 5: Commit** — `Rewrite tier.js to grant recommendations — colon-form scoring with legacy reads, deprecated recommendTier alias`

---

### Task 4: `capabilities-probe.js` — native-feature detection

**Files:**
- Create: `bin/lib/issues/capabilities-probe.js`
- Test: `bin/lib/issues/tests/capabilities-probe.test.js`

**Interfaces (Produces):**
```js
probeCapabilities({ owner, repo, runner }) -> { types: boolean, subIssues: boolean, dependencies: boolean }
// runner: (args: string[]) => string   — invoked as if `gh ${args.join(' ')}`, returns stdout.
// Default runner: child_process.execFileSync('gh', args, {encoding:'utf8'}) — never called in tests.
```

**Behavior:**
- Probe 1 (schema introspection, one call): `gh api graphql -f query={ __type(name: "Issue") { fields { name } } }` → parse JSON; `fields[].name` list:
  - `subIssues` present → `subIssues: true`
  - `blockedBy` OR `issueDependenciesSummary` present → `dependencies: true`
- Probe 2 (org enablement, one call): `gh api graphql -f query=query($o:String!,$n:String!){ repository(owner:$o, name:$n) { issueTypes(first:1) { totalCount } } } -f o={owner} -f n={repo}` → `types: true` iff the call succeeds AND `data.repository.issueTypes` is non-null.
- ANY runner throw or unparseable JSON on a probe → that probe's capabilities are `false` (fail-safe to `labels` / `body-text` fallback expressions). One probe failing must not mask the other probe's result.
- No caching in the module — `/init` (spec 22) persists results as `work-types` / `work-links` config keys.

- [ ] **Step 1: Write failing tests** — fakes are LAZY functions:

```js
// GOOD (lazy): const runner = (args) => JSON.stringify({data:{__type:{fields:[{name:'subIssues'}]}}});
// FORBIDDEN (eager IIFE): const runner = ((out) => out)(computeNow());
// cases:
// 1. fields include subIssues + blockedBy; issueTypes non-null → {types:true, subIssues:true, dependencies:true}
// 2. fields lack subIssues/blockedBy/issueDependenciesSummary; issueTypes null → all false
// 3. runner throws on the introspection call but succeeds on issueTypes → {types:true, subIssues:false, dependencies:false}
// 4. runner returns garbage JSON on issueTypes, valid introspection with issueDependenciesSummary only
//    → {types:false, subIssues:false, dependencies:true}
// 5. runner records invocations (closure array) → assert exactly 2 calls, and NEITHER happens at test-definition time
//    (assert the recorder array is empty before probeCapabilities is invoked — proves laziness)
```

- [ ] **Step 2: RED**  → **Step 3: Implement** → **Step 4: GREEN**
- [ ] **Step 5: Commit** — `Add capabilities-probe.js — GitHub Issue Types, sub-issue, and dependency detection with injectable runner`

---

### Task 5: `local-store.js` — the local-files driver

**Files:**
- Create: `bin/lib/issues/local-store.js`
- Test: `bin/lib/issues/tests/local-store.test.js` (uses `fs.mkdtempSync(os.tmpdir())` fixtures; clean up in `t.after`)

**Interfaces (Produces):**
```js
DEFAULT_DIR = 'specs'
readRecord(filePath) -> { path, id, slug, title, body, facets }
writeRecord(filePath, { title, body, facets }) -> void   // composes frontmatter + '# {title}' + body
allocateId(dir = DEFAULT_DIR) -> number                  // max numeric filename prefix + 1; 1 when empty/missing
queryRecords(dir = DEFAULT_DIR, facetFilter = {}) -> record[]  // every filter key must deepStrictEqual the record's facet
```

**Behavior:**
- File shape (frontmatter keys all optional except type; parser is line-regex in `bin/lib/policy.js` style, NO YAML lib):

```markdown
---
type: task
origin: capture
risk: low
effort: medium
priority: high
stage: parked
grants: [build, merge]
parent: 12
blocked-by: [12, 7]
unsynced: true
---

# {title}

{body…}
```

- `facets` returned is a **superset** of `parseRecordFacets`'s shape: same keys (`origin, risk, effort, priority, stage, grants{build,merge}, bot{inProgress,blocked}`) **plus** `type`, `parent` (number|null), `blockedBy` (number[]), `unsynced` (boolean). `stage` defaults `'backlog'` when the key is absent; `bot` is always `{inProgress:false, blocked:false}` (local driver carries no bot state). All booleans explicit.
- `writeRecord` omits absent/default keys (no `stage: backlog` line, no empty `grants: []` line, no `unsynced: false`); array syntax exactly `[a, b]`; writes `# {title}` as the first body line when `title` given.
- `readRecord` derives `id`/`slug` from the filename `NN-slug.md`; `title` = first `# ` heading's text (null if none); `body` = everything after frontmatter (or whole file when no frontmatter), trimmed of leading blank lines.
- `queryRecords` scans `NN-*.md` files only; compares filter keys against facets with `assert`-style deep equality (`grants: {build:true, merge:true}` filter matches only exact object; scalar keys compare `===`).

- [ ] **Step 1: Write failing tests** — exact cases (AC 5):

```js
// round-trip: writeRecord(tmp/14-bar.md, {title:'Bar', body:'Current State…', facets:{
//   type:'feature', origin:'capture', risk:'medium', effort:'low', priority:null,
//   stage:'parked', grants:{build:false,merge:false}, bot:{inProgress:false,blocked:false},
//   parent:12, blockedBy:[12,7], unsynced:true }})
// then readRecord(same path) → facets deepStrictEqual the input facets; id 14; slug 'bar'; title 'Bar'
// allocateId: dir containing only '13-foo.md' → 14 ; empty dir → 1 ; missing dir → 1
//   dir with '13-foo.md','2-a.md','notes.txt','x-9.md' → 14 (non-matching names ignored)
// queryRecords: 3 records staged parked/ready/none → filter {stage:'parked'} returns exactly the parked one;
//   filter {unsynced:true} returns exactly the unsynced one; filter {} returns all 3
// malformed file (no frontmatter) → readRecord returns type null, stage 'backlog', body = whole content
```

- [ ] **Step 2: RED** → **Step 3: Implement** → **Step 4: GREEN**
- [ ] **Step 5: Commit** — `Add local-store.js — local-files work-record driver with frontmatter facets`

---

### Task 6: Spec-14 acceptance sweep + full suite

**Files:**
- Modify (only if a check fails): files from Tasks 1-5

- [ ] **Step 1: Run the full AC sweep:**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23"
node --test bin/lib/issues/tests/*.test.js                      # AC 1 (+ all new tests)
npm test 2>&1 | tail -5                                          # whole suite incl. AC 7 (ingest/backlog untouched)
grep -rn "status:in-progress\|status:blocked" bin/lib/           # AC 6: expect ZERO hits (comments/fixtures were re-worded in Task 3)
grep -c "work-fingerprint" bin/lib/issues/record.js              # ≥ 2 (regex + docs)
node -e "const r=require('./bin/lib/issues/record.js'); const {TYPE_LABELS}=r; if(TYPE_LABELS.length!==3||TYPE_LABELS.some(([n,d])=>d.length>100)) throw new Error('TYPE_LABELS bad'); console.log('TYPE_LABELS OK')"
node -e "const t=require('./bin/lib/issues/tier.js'); const g=t.recommendGrants({risk:'low',effort:'low'}); if(!(g.build&&g.merge)) throw new Error('grants bad'); console.log('grants OK')"
```

- [ ] **Step 2: Fix anything failing; re-run until clean**
- [ ] **Step 3: Commit (only if fixes were made)** — `Fix spec-14 acceptance sweep findings`
