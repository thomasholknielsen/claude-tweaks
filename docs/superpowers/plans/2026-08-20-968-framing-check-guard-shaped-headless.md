# specify next: framing-check guard + shaped:headless provenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:specify next`'s headless shaping unit a quality gate (a `framing-check` verdict before shaping) and an honesty marker (`shaped:headless` provenance on records it shapes without human review).

**Architecture:** Insert one guard step into `next-mode.md` between Claim and Shape: invoke `challenge`'s `framing-check` mode inline (no subagent), parse its anchored two-line verdict, and either proceed to Shape (`FRAMING: open`) or route the record to `needs:definition` with a comment and a clean claim release (`FRAMING: solution-baked`). On a successful shape, stamp `ready` + `shaped:headless` in one label-edit call. Register the new label in the taxonomy/permission-matrix/bootstrap files and teach `parseRecordFacets` to read it back as a facet.

**Tech Stack:** Markdown skill prose (Claude Code plugin skill files); Node.js (`bin/lib/issues/record.js`); `node --test` for the conformance/unit suites.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044958-spec-967-968-969-970/spec-968/work/968-spec.md`

## Global Constraints

**Acceptance Criteria (verbatim):**

1. `next-mode.md` states the guard ordering (claim → framing-check → shape-or-route), the anchored verdict-parse contract with unparseable-output-as-failure, and the exact `solution-baked` handling (needs:definition + comment with paste-ready command + claim release + success exit).
2. `_shared/work-record.md` declares `shaped:headless` exactly once with writer and readers named; `_shared/label-bootstrap.md` carries it; no other file restates the definition.
3. `parseRecordFacets` returns `shapedHeadless: true` for a label set containing `shaped:headless` and leaves every existing facet unchanged — the test includes an unrelated third label family in the same set (orthogonal-category rule).
4. A guard-routed record ends with `needs:definition` present and `ready`/`shaped:headless` absent — pinned in prose and test; the `ready` + `shaped:headless` stamp is a single label-edit call — pinned in prose.
5. The conformance suite pins the `needs:definition` exclusion in the eligibility predicate, so a future edit to the selection form cannot silently reopen the reprocessing loop.
6. `npm test` passes; the new `record.js` test fails when the facet parsing is reverted (verify once during development).

**Gotchas (verbatim):**

- `framing-check`'s ambiguity direction is deliberately `open` (anti-manufactured-doubt, stated in `challenge/SKILL.md`'s own anti-patterns) — do not "harden" the guard by re-resolving ambiguity toward `solution-baked`; the guard inherits the mode's calibration as-is. Unparseable output is the one exception, and it resolves to the failure path, not to a verdict.
- #772 (open): framing-check doesn't read `## Gotchas` evidence — a record justified via `/challenge`'s evidence bullets may still be flagged and routed. Acceptable for v1 (the route is human-reversible); do not fix it here — it is #772's scope.
- The permission matrix in `_shared/work-record.md` currently says `/specify` never touches `auto:*`/`bot:*` — the new row must be added alongside that rule without weakening it.
- The routed-record comment must carry the runnable command on its own line (report-lines convention: every actionable line gets a paste-ready command).

**Non-Goals (verbatim):**

- No changes to `framing-check` itself — #772 tracks the `## Gotchas`-evidence improvement; this sub-issue consumes the verdict as-is.
- No grant-gate behavior (#969).
- No changes to interactive shaping — a human-driven `/specify #N` (and `--chained`) never stamps `shaped:headless` and runs no extra guard.

**Additional constraint found during planning (not in the spec body, load-bearing for Task 3):** `bin/lib/issues/facet-shape.js`'s `sharedFacetDefaults()` is the shared shape read by *both* the GitHub driver (`record.js`) and the local-files driver (`local-store.js`) — `tests/bin-lib/issues/facet-shape.test.js` asserts every key in `sharedFacetDefaults()` has a matching default in both drivers. `shaped:headless` is GitHub-only by design (#968's Non-Goals: `next` is `work-backend: github-issues` only — see #967's Gotchas, inherited). Therefore `shapedHeadless` must **not** be added to `facet-shape.js` — it is a `record.js`-only extra key, added directly inside `parseRecordFacets`, the same way `local-store.js` adds its own local-only extra keys on top of the shared shape. Adding it to the shared shape would force a matching (meaningless) default into the local-files driver and trip the parity test for no reason.

---

### Task 1: `next-mode.md` guard step (Claim → framing-check → Shape-or-Route) + Release-triggers table update

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` — insert the guard between the existing `## Claim` and `## Shape` sections
- Modify: `plugin/skills/_shared/issue-claims.md` — Release triggers table (the `specify/next-mode.md` row currently lists only two reason strings; add the third)
- Test: extend `tests/specify-next-mode.test.js` (new pins added in Task 5, not this task — this task's own steps only touch prose + the one table row)

**Interfaces:**
- Consumes: `next-mode.md`'s existing `## Claim` section (ends with a successful, uncontested claim and `$RUN_DIR` resolved — see the file as it stands after #967) and `## Shape` section (currently the very next heading). Consumes `challenge/SKILL.md`'s `framing-check` mode contract verbatim: inline `Skill(claude-tweaks:challenge, framing-check)` call, two-line output `FRAMING: open | solution-baked` / `RATIONALE: {paragraph}`.
- Produces: a new `## Framing Guard` section (heading name is this task's own choice — used by Task 5's tests, so keep it exactly `## Framing Guard`) between `## Claim` and `## Shape`, and the routing reason string `routed: needs:definition #{n}` — Task 5's tests assert this exact string appears in `next-mode.md`.

- [ ] **Step 1: Read the current file structure to find the exact insertion point**

```bash
grep -n "^## Claim\|^## Shape\|^## Release" plugin/skills/specify/next-mode.md
```

Expected: `## Claim` then `## Shape` then `## Release`, in that order (this is the structure #967 left behind). Confirm before editing — if the headings differ, stop and re-read the file before proceeding; this task's insertion point assumes exactly this structure.

- [ ] **Step 2: Write the guard section**

Insert a new `## Framing Guard` section immediately after `## Claim`'s existing content and before `## Shape`'s heading. Use this exact text (fill in the record number placeholder `{n}` consistently with the rest of the file's own convention — every other section in `next-mode.md` uses `{n}` the same way):

```markdown
## Framing Guard

Between Claim and Shape, every claimed record passes through one
`framing-check` call before shaping proceeds — a headless firing has no
human present to catch a solution-baked framing after the fact, so the
gate runs before, not after.

Fetch the record's full title + body first (the same fetch `## Shape`
below performs — do this fetch once, here, and hand the same result to
both this guard and `## Shape`, rather than fetching twice):

```bash
gh issue view {n} --json number,title,body,url,labels
```

Invoke inline via the `Skill` tool — never as a Task-agent dispatch
(`challenge/SKILL.md`'s own contract: the caller already holds the body,
so a subagent would only pay to re-derive it):

```
Skill(claude-tweaks:challenge, "framing-check #{n}")
```

Pass the fetched title + body as `framing-check`'s Step 1 "Gather" input.

**Verdict parsing.** The verdict is the line matching
`^FRAMING: (open|solution-baked)$` (anchored, first match). Everything
after that line is the RATIONALE. Output containing no such line is
**not a verdict — it is a shaping-stage failure**, handled exactly like
any other `## Shape`-stage failure below: Release still runs first
(`failed: shaping`), then Failure self-report files. Never coerce
unparseable output to either verdict.

- **`FRAMING: open`** — proceed to `## Shape` below, unchanged.
- **`FRAMING: solution-baked`** — do **not** shape. In order:
  1. Stamp `needs:definition` on the record: `gh issue edit {n}
     --add-label "needs:definition"`.
  2. Post one comment naming the verdict, the RATIONALE's assumptions,
     and the interactive route as a paste-ready command on its own line
     (transport per `_shared/github-write-transport.md`):

     ```
     gh issue comment {n} --body-file {tmp}
     ```

     where `{tmp}` holds:

     ```markdown
     framing-check routed this record to `needs:definition` before
     headless shaping: **{RATIONALE, verbatim}**

     Resolve interactively:

     /claude-tweaks:specify #{n}
     ```
  3. Release the claim with reason `routed: needs:definition #{n}` (see
     `## Release` below — this is the third reason string that section's
     table now documents) and `--remove-in-progress`.
  4. Log the decision (per `_shared/auto-decision-log.md`'s schema when a
     run dir resolves — see `## Release`'s existing note on the
     Routine-no-run-dir fallback, unchanged by this guard).
  5. **End the firing as a success.** This is not a failure — do **not**
     file a Failure self-report. The triage itself is the productive
     output of this firing.

This routing outcome mirrors `## Claim`'s own "clean no-op" postures
(ineligible re-read, contested write) in spirit — success without a
shape — but is a distinct, named path: it is the only one of the three
that writes a label and posts a comment, so it gets its own heading and
its own release reason string rather than folding into either existing
no-op.
```

- [ ] **Step 3: Fold the guard's own failure mode into the existing "shaping-stage failure" category**

The unparseable-verdict case above says it "is a shaping-stage failure,
handled exactly like any other `## Shape`-stage failure" — but the
existing `## Release` and `## Failure self-report` sections (both
written by #967, before this guard existed) name that category as
"Shape section above" specifically, not "Framing Guard or Shape." Update
both so the guard's failure is actually covered, not silently outside
both:

In `## Release`, find this sentence (part of the paragraph beginning
"Release the claim..."):

```
whatever happens during Shape (the only failure path that can
reach here — a Preflight failure, a Claim-step infra failure, or an
ineligible/contested Claim, never acquires a claim in the first place, so
there is nothing to release on any of those paths)
```

Replace `during Shape` with `during Framing Guard or Shape`, and replace
`the only failure path that can reach here` with `the only failure paths
that can reach here` (plural, since there are now two sections that can
produce this outcome, not one).

In `## Failure self-report`, find:

```
any post-claim shaping-stage failure (Shape section above throwing or
returning an error — reported here only after Release above has already
run)
```

Replace with:

```
any post-claim shaping-stage failure (the Framing Guard section's own
unparseable-verdict case, or the Shape section, throwing or returning an
error — reported here only after Release above has already run)
```

- [ ] **Step 4: Update the Release triggers table in `issue-claims.md`**

Find the existing row:

```markdown
| Headless `specify next` shapes the claimed record (success), or fails during shaping | `specify/next-mode.md` Release step (automatic, unconditional, always before that path's self-report) | `shaped: #{n}` / `failed: shaping` |
```

Replace it with (adds the third reason string; changes nothing else in the row):

```markdown
| Headless `specify next` shapes the claimed record (success), routes it to `needs:definition` (success), or fails during shaping | `specify/next-mode.md` Release step (automatic, unconditional, always before that path's self-report) | `shaped: #{n}` / `routed: needs:definition #{n}` / `failed: shaping` |
```

- [ ] **Step 5: Verify the insertion reads correctly end-to-end**

```bash
grep -n "^## Claim\|^## Framing Guard\|^## Shape\|^## Release\|^## Failure self-report" plugin/skills/specify/next-mode.md
```

Expected order: `## Claim`, `## Framing Guard`, `## Shape`, `## Release`, `## Failure self-report`.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/next-mode.md plugin/skills/_shared/issue-claims.md
git commit -m "specify next: add framing-check guard between Claim and Shape (#968)"
```

---

### Task 2: `shaped:headless` label registration (taxonomy, permission matrix, bootstrap)

**Files:**
- Modify: `plugin/skills/_shared/work-record.md` — Label taxonomy table (`## Label taxonomy`) and Permission matrix table (`## Permission matrix`, the `/specify` row)
- Modify: `plugin/skills/_shared/label-bootstrap.md` — canonical `LABELS_JSON` array

**Interfaces:**
- Consumes: nothing from Task 1 (independent, prose-only change).
- Produces: the label name `shaped:headless` as a registered, real taxonomy entry — Task 3 (code) and Task 5 (tests) both assert this registration exists.

- [ ] **Step 1: Add a new taxonomy row**

In `plugin/skills/_shared/work-record.md`, in the `## Label taxonomy` table (the table with rows like `| Origin (6) | ... | Origin |`), add one new row directly after the `Definition (1)` row (`needs:definition`):

```markdown
| Provenance (1) | `shaped:headless` | Marks a record shaped by `/specify`'s headless `next` unit with no human review of the resulting spec body — absent means either a human shaped it, or it predates this feature. Writer: `/specify` `next` mode only, applied in the same call as `ready` — never on an interactively-shaped record. Readers: the grant gate (`evaluateGrantGate`, #969) and `/backlog attention`. Never blocks an interactive human grant. |
```

- [ ] **Step 2: Update the `/specify` permission-matrix row**

Find the existing row (starts `| **`/specify`** (shaper) |`). Its current Adds column reads:

```
`ready`, `risk:*`/`size:*` when unstamped, `ceremony:*` (always — no unscored state), `solution:unjustified` (via `/claude-tweaks:challenge`'s `framing-check`), Type, `parent-issue` (decomposition parents only, never sub-issues)
```

Append `, `shaped:headless` (`next` mode only, stamped alongside `ready` in the same call — never on an interactively-shaped record)` to the end of that Adds cell — do not touch the Removes or Never columns, and do not touch any other row.

- [ ] **Step 3: Add the bootstrap entry**

In `plugin/skills/_shared/label-bootstrap.md`'s `LABELS_JSON` array, add one new pair directly after the `needs:definition` pair:

```js
  ["shaped:headless",   "Provenance: shaped by /specify's headless next unit — no human reviewed the spec body"],
```

(88 characters — under the 100-char cap the file's own header note requires.)

- [ ] **Step 4: Verify no other file restates the definition (AC 2's "no other file restates" clause)**

```bash
grep -rn "shaped:headless\|shapedHeadless" plugin/skills/ docs/ --include="*.md" | grep -v "next-mode.md\|work-record.md\|label-bootstrap.md"
```

Expected: no output (before Task 5 adds test-file references, which are pins, not restatements of the *definition* — this check is about prose definitions, not test assertions; re-run mentally against this rule once Task 5 lands, not literally re-run this exact grep then).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/work-record.md plugin/skills/_shared/label-bootstrap.md
git commit -m "Register shaped:headless label: taxonomy, permission matrix, bootstrap (#968)"
```

---

### Task 3: `parseRecordFacets` reads `shaped:headless` into `shapedHeadless`

**Files:**
- Modify: `plugin/bin/lib/issues/record.js`
- Test: `tests/bin-lib/issues/record.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent code change; the label *name* `shaped:headless` is a string literal shared with Task 2's prose, not an import).
- Produces: `parseRecordFacets(labels)` returns an object whose shape is `sharedFacetDefaults()`'s shape **plus** one extra key `shapedHeadless: boolean` (default `false`) — Task 5's `next-mode.md` conformance test does not consume this function directly, but any future consumer (the grant gate, #969) will read `facets.shapedHeadless`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/record.test.js` (near the other `parseRecordFacets` tests):

```javascript
test('parseRecordFacets: shaped:headless sets shapedHeadless: true', () => {
  const facets = parseRecordFacets(['shaped:headless']);
  assert.strictEqual(facets.shapedHeadless, true);
});

test('parseRecordFacets: shapedHeadless defaults to false when absent', () => {
  const facets = parseRecordFacets(['ready']);
  assert.strictEqual(facets.shapedHeadless, false);
});

test('parseRecordFacets: shaped:headless alongside an unrelated third label family leaves every other facet unchanged (orthogonal-category rule)', () => {
  const facets = parseRecordFacets(['shaped:headless', 'risk:high', 'bot:blocked']);
  assert.strictEqual(facets.shapedHeadless, true);
  assert.strictEqual(facets.risk, 'high');
  assert.strictEqual(facets.bot.blocked, true);
  assert.strictEqual(facets.bot.inProgress, false);
  assert.strictEqual(facets.stage, 'backlog');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/bin-lib/issues/record.test.js
```

Expected: the three new tests FAIL with `shapedHeadless` being `undefined` (not `true`/`false`) — `parseRecordFacets` doesn't set the key at all yet.

- [ ] **Step 3: Implement — add the label constant and the parse branch**

In `plugin/bin/lib/issues/record.js`:

Add to the `LABELS` object (after `PARENT_ISSUE: 'parent-issue',`):

```javascript
  SHAPED_HEADLESS: 'shaped:headless',
```

In `parseRecordFacets`, immediately after the existing `facets` initialization line (`const facets = sharedFacetDefaults();`), add the record.js-only extra key — **not** in `facet-shape.js`, per this plan's Global Constraints note:

```javascript
  const facets = sharedFacetDefaults();
  facets.shapedHeadless = false; // GitHub-only facet (headless `next` is github-issues only) — deliberately not in the shared facet-shape.js, so the local-files driver carries no meaningless default for it.
  let effortFallback = null;
```

Add a new branch inside the `for (const name of names)` loop, alongside the other direct-name-match branches (e.g. right after the `LABELS.PARENT_ISSUE` branch and before the `family:parent` legacy-fallback branch — order among these branches carries no meaning, but keep it near its sibling direct-match branches for readability):

```javascript
    if (name === LABELS.SHAPED_HEADLESS) {
      facets.shapedHeadless = true;
      continue;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/bin-lib/issues/record.test.js
```

Expected: all tests pass, including the three new ones.

- [ ] **Step 5: Verify existing exact-equality tests still pass (they will need updating — see Task 5, which owns the repo-wide test-file sweep). This step only confirms the *scope* of what broke, not fixing it.**

```bash
node --test tests/bin-lib/issues/record.test.js 2>&1 | grep -c "^not ok"
```

Expected: some number greater than 0 — every pre-existing `assert.deepStrictEqual(parseRecordFacets(...), {...})` call in this file that does not include a `shapedHeadless` key in its expected object now fails, because the actual return object has one more key than the literal it's compared against. This is expected and intentional at this point in the plan; Task 5, Step 1 is where every one of those literals gets `shapedHeadless: false` added. Do not fix them in this task — that scope belongs to Task 5, which also owns `facet-shape.test.js`'s cross-driver check (confirmed in this plan's Global Constraints to be unaffected, but Task 5 re-verifies it explicitly).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/record.js tests/bin-lib/issues/record.test.js
git commit -m "record.js: parse shaped:headless into shapedHeadless facet (#968)"
```

---

### Task 4: Stamping — `ready` + `shaped:headless` in one API call, and the Routine no-run-dir logging note

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` — the `## Shape` section's success path (this is a small, surgical addition to the section Task 1 left untouched; it does not touch the `## Framing Guard` section Task 1 wrote)

**Interfaces:**
- Consumes: Task 1's `## Framing Guard` section reaching the `FRAMING: open` branch (proceed to `## Shape`, unchanged from #967's behavior up to this point).
- Produces: the exact prose Task 5's tests pin — the single-call label-edit command, and the auto-decision-log Routine-firing fallback sentence.

- [ ] **Step 1: Read the current `## Shape` section's end (where shaping-mode.md hands back control)**

```bash
grep -n "^## Shape\|^## Release" plugin/skills/specify/next-mode.md
```

Confirm `shaping-mode.md`'s own `ready`-stamping call is what `## Shape` currently defers to (per #967's own note: "Shaping mode's own `ready` stamp is what removes the record from future `next` eligibility — no extra state change is needed here"). This task changes that: the `ready` stamp for a `next`-mode shape must now also carry `shaped:headless`, so `## Shape` needs to say so explicitly rather than silently deferring the whole label write to `shaping-mode.md`'s own (interactive-shaping) label call, which has no concept of `shaped:headless`.

- [ ] **Step 2: Add the stamping override to `## Shape`**

Append this paragraph to the end of the `## Shape` section (after the existing text, before `## Release`'s heading):

```markdown
**Stamping override for `next` mode.** `shaping-mode.md`'s own label-write
call (invoked above) stamps `ready` alone — that is correct for the
`--chained` and interactive postures it was written for, but a `next`-mode
shape carries the additional provenance marker. After `shaping-mode.md`
returns successfully, apply `ready` and `shaped:headless` together in one
label-edit call — never as two separate calls, so no reader ever observes
`ready` without `shaped:headless` alongside it on a `next`-shaped record:

```bash
gh issue edit {n} --add-label "ready,shaped:headless"
```

**Decision-log fallback.** Every auto-resolved decision this guard and
this stamp produce (the framing verdict, the design-intent resolution
already established by Flag rejection above, and this label write) logs
per `_shared/auto-decision-log.md`'s schema when a pipeline run dir
resolves. A Routine firing resolves no pipeline run dir — `$RUN_DIR`
above is this firing's *claim* run directory
(`_shared/pipeline-run-dir.md`'s standalone-auto fallback), not a
`/flow`-style pipeline run — so the documented fallback applies: these
decisions are noted in the firing's own returned output only, with no
alternate log target.
```

- [ ] **Step 3: Verify the section reads correctly**

```bash
grep -n "add-label \"ready,shaped:headless\"" plugin/skills/specify/next-mode.md
```

Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/specify/next-mode.md
git commit -m "specify next: stamp ready + shaped:headless in one call on a next-mode shape (#968)"
```

---

### Task 5: Conformance tests — guard ordering, verdict-parse contract, one-call stamp, label registration, eligibility re-pin; plus the Task 3 exact-equality sweep

**Files:**
- Modify: `tests/specify-next-mode.test.js` (extend — do not create a parallel file)
- Modify: `tests/bin-lib/issues/record.test.js` (repo-wide sweep for the new `shapedHeadless` key in every pre-existing exact-equality assertion — see Task 3 Step 5)
- Test: `tests/bin-lib/issues/facet-shape.test.js` (verify only — no edit expected; this step confirms the Global Constraints claim)

**Interfaces:**
- Consumes: the exact strings Tasks 1, 2, and 4 wrote — `## Framing Guard`, `^FRAMING: (open|solution-baked)$`, `routed: needs:definition #{n}`, the `shaped:headless` taxonomy row, the `add-label "ready,shaped:headless"` line, the still-present `needs:definition`, `parked` exclusion in the Eligibility query section (#967's own text, unmodified by this record — re-pinned here per AC 5).
- Produces: nothing further downstream — this is the terminal task.

- [ ] **Step 1: Sweep every pre-existing `parseRecordFacets` exact-equality assertion in `record.test.js` to add `shapedHeadless: false`**

```bash
grep -n "deepStrictEqual(parseRecordFacets\|deepStrictEqual(result," tests/bin-lib/issues/record.test.js
```

For each match, open the expected-object literal and add `shapedHeadless: false,` to it (unless the test is specifically about `shaped:headless`, in which case it already sets `shapedHeadless: true` from Task 3 Step 1 and needs no change). Example — the existing test at (approximately) line 218:

```javascript
test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, size: null, ceremony: null, solutionUnjustified: false, needsDefinition: false, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null, isParentIssue: false, notPlanned: false, shapedHeadless: false,
  });
});
```

(Field order inside the object literal does not matter for `deepStrictEqual` — append `shapedHeadless: false` wherever reads cleanest in each literal, consistent with that test's own existing style.)

- [ ] **Step 2: Run `record.test.js` to confirm the sweep is complete**

```bash
node --test tests/bin-lib/issues/record.test.js
```

Expected: 100% pass, zero `not ok` lines. If any remain, they are an exact-equality assertion Step 1 missed — fix and re-run.

- [ ] **Step 3: Confirm `facet-shape.test.js` needed no change (verification, not an edit)**

```bash
node --test tests/bin-lib/issues/facet-shape.test.js
```

Expected: passes unmodified — this test iterates only `sharedFacetDefaults()`'s own keys, and `shapedHeadless` was deliberately never added there (Global Constraints). If this test fails, `shapedHeadless` was added to `facet-shape.js` somewhere in Task 3 by mistake — go back and remove it from there, keeping it only in `record.js`.

- [ ] **Step 4: Write the new `next-mode.md` conformance tests**

Append to `tests/specify-next-mode.test.js` (reuse the file's existing `NEXT_MODE_FLAT` constant — do not re-read the file):

```javascript
test('next-mode.md states the guard ordering: Claim, then Framing Guard, then Shape', () => {
  const claimIdx = NEXT_MODE_FLAT.indexOf('## Claim');
  const guardIdx = NEXT_MODE_FLAT.indexOf('## Framing Guard');
  const shapeIdx = NEXT_MODE_FLAT.indexOf('## Shape');
  assert.ok(claimIdx !== -1 && guardIdx !== -1 && shapeIdx !== -1, 'all three sections must exist');
  assert.ok(claimIdx < guardIdx && guardIdx < shapeIdx, 'sections must appear in Claim, Framing Guard, Shape order');
});

test('next-mode.md states the anchored verdict-parse contract with unparseable-as-failure', () => {
  assert.ok(NEXT_MODE_FLAT.includes('FRAMING: (open|solution-baked)'), 'anchored verdict regex missing');
  assert.ok(NEXT_MODE_FLAT.includes('is a shaping-stage failure'), 'unparseable-output-as-failure handling missing');
});

test('next-mode.md states the solution-baked handling: needs:definition, comment, release, success exit', () => {
  assert.ok(NEXT_MODE_FLAT.includes('needs:definition'), 'needs:definition stamp missing from solution-baked handling');
  assert.ok(NEXT_MODE_FLAT.includes('/claude-tweaks:specify #{n}'), 'paste-ready interactive-route command missing');
  assert.ok(NEXT_MODE_FLAT.includes('routed: needs:definition #{n}'), 'routing release reason string missing');
  assert.ok(NEXT_MODE_FLAT.includes('do **not** file a Failure self-report') || NEXT_MODE_FLAT.includes('do not file a Failure self-report') || NEXT_MODE_FLAT.includes('do not\n     file a Failure self-report') || NEXT_MODE_FLAT.includes('End the firing as a success'), 'success-exit framing for the routed path missing');
});

test('next-mode.md stamps ready + shaped:headless in a single label-edit call', () => {
  assert.ok(NEXT_MODE_FLAT.includes('add-label "ready,shaped:headless"'), 'single-call ready+shaped:headless stamp missing');
});

test('next-mode.md notes the Routine no-run-dir decision-log fallback', () => {
  assert.ok(NEXT_MODE_FLAT.includes('resolves no pipeline run dir'), 'Routine-firing decision-log fallback note missing');
});

test('next-mode.md eligibility predicate still excludes needs:definition and parked (AC 5 re-pin)', () => {
  assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`'), 'eligibility predicate must still exclude needs:definition and parked — this is #967\'s own loop-guard invariant, re-asserted here since #968\'s guard depends on it staying true');
});

test('_shared/work-record.md declares shaped:headless exactly once, with writer and readers named', () => {
  const WORK_RECORD_FLAT = readFlat('plugin/skills/_shared/work-record.md');
  const occurrences = (WORK_RECORD_FLAT.match(/shaped:headless/g) || []).length;
  assert.ok(occurrences >= 1, 'shaped:headless must be declared in work-record.md');
  assert.ok(WORK_RECORD_FLAT.includes('Writer: `/specify` `next` mode only'), 'writer must be named');
  assert.ok(WORK_RECORD_FLAT.includes('grant gate'), 'grant-gate reader must be named');
  assert.ok(WORK_RECORD_FLAT.includes('/backlog attention'), '/backlog attention reader must be named');
});

test('_shared/label-bootstrap.md carries shaped:headless in the canonical LABELS_JSON list', () => {
  const BOOTSTRAP_FLAT = readFlat('plugin/skills/_shared/label-bootstrap.md');
  assert.ok(BOOTSTRAP_FLAT.includes('"shaped:headless"'), 'shaped:headless missing from LABELS_JSON');
});
```

(`readFlat` is the file's existing helper — already defined near the top of `tests/specify-next-mode.test.js`; no new import needed.)

- [ ] **Step 5: Run the new tests to verify they fail against pre-Task-1/2/4 state, then pass against current state**

This step is a sanity check on test discrimination, not a revert-and-reapply — Tasks 1, 2, and 4 are already committed by this point in the plan, so simply run:

```bash
node --test tests/specify-next-mode.test.js
```

Expected: all tests pass (the new ones alongside #967's original 14). If any new test fails, it means Task 1/2/4's prose doesn't literally contain the string this test checks for — go back to the relevant task and align the wording (do not weaken the test to match sloppy prose).

- [ ] **Step 6: Run the full targeted suite one more time**

```bash
node --test tests/specify-next-mode.test.js tests/bin-lib/issues/record.test.js tests/bin-lib/issues/facet-shape.test.js
```

Expected: 100% pass across all three files.

- [ ] **Step 7: Run `npm test` (AC 6)**

```bash
npm test
```

Expected: pass, modulo the 3 pre-existing, already-ledgered baseline failures from #967's build (CHANGELOG version-coverage gap ×2, manifesto/multi-spec.md byte-budget test — see `docs/plans/2026-08-20-967-968-969-970-ledger.md` item 2). Any *other* failure is a real regression — stop and fix before committing.

- [ ] **Step 8: Commit**

```bash
git add tests/specify-next-mode.test.js tests/bin-lib/issues/record.test.js
git commit -m "Tests: pin #968's framing-check guard, shaped:headless registration, and facet parsing"
```
