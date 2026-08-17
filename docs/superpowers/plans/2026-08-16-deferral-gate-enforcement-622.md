# Deferral Gate Enforcement (#622) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deferral gate hard at the one place every staged work-record proposal converges: before creating any `Q#` proposal, the Review Console (single-spec and multi-spec) and the `queueWriteAutoFile` pre-render auto-file look up `Defer-reason:` in the staged file's header block and **refuse** — render under a new "Refused — no defer reason" row, never file, never auto-resolve — any proposal whose reason is missing or not in `DEFER_REASONS`. The reason then travels through the audit trail: ledger Phase 2's `AUTO` lines and the summary's "Routed to backlog" render `(defer-reason: {value})` with per-run counts. One eval scenario pins the refuse behavior.

**Architecture:** The refuse rule lives in a new ≤3 KB sub-file (`skills/wrap-up/refused-proposals.md`) because `review-console.md` is at its size ceiling and three consumers need identical wording — each cites it in one sentence. Validation is a runtime `DEFER_REASONS.includes` via `node -e`, never a hardcoded list in prose. Refused rows sit outside every sequence and every auto-resolve path (no default; excluded from Approve all, `consoleAutoResolve`, and `queueWriteAutoFile`). A refused ledger-origin proposal flips its ledger item back to `open` (the ledger is the durable trace; the staged file is deleted); a non-ledger one stays staged and dies with the run dir at close — by design, with the summary count as the signal.

**Tech Stack:** Markdown skill files; evals harness (YAML + existing assertion types); Node 18+ conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-622/work/622-spec.md`

## Global Constraints

- Ship ordering satisfied in-run: #620 and #621 are already on this branch — producers stamp `Defer-reason:` before this gate turns on.
- The vocabulary is validated at runtime against `DEFER_REASONS` (`bin/lib/issues/record.js`) — no literal six-value list anywhere in the new prose.
- `skills/wrap-up/refused-proposals.md` must be ≤ 3,072 bytes (`wc -c`).
- `skills/wrap-up/review-console.md` baseline at build time: measure `wc -c` FIRST (expected 40,899 — re-measure and record). Net growth ≤ +400 bytes over that baseline; if an edit cannot fit, trim step 7's own wording — do not move sections around.
- After Task 3, `(blocker: {category})` appears NOWHERE under `skills/` (three sites change: `skills/_shared/ledger-format.md` lines ~123 and ~160, `skills/wrap-up/summary-template.md` line ~135).
- `M#`/`U#` proposals are out of scope — the refuse rule keys on queue writes (`Q#`) only. The queue-write *detection* rule (presence of `Title:`/`Type:`/`Labels:`) is unchanged — a proposal without `Defer-reason:` is still a queue write, a refused one.
- Under `--dry-run` the refuse check still runs (it is a read); the ledger status flip is previewed, not applied.
- Commit messages: imperative, `refs #622`, never `closes`; every commit ends with `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk`. No version bump.
- Work from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-620-621-622-623-624-625`; verify `pwd`/`git rev-parse --show-toplevel` before commits; stage specific files only; policy hook may refuse compound Bash — run commands singly.
- Full `npm test` runs only in Task 5.

---

### Task 1: Create `skills/wrap-up/refused-proposals.md`

**Files:**
- Create: `skills/wrap-up/refused-proposals.md`

**Interfaces:**
- Consumes: `DEFER_REASONS` (runtime), `_shared/deferral-gate.md`'s "Where the reason lives".
- Produces: the refuse rule all three consumers cite; ≤ 3,072 bytes (Task 5 asserts).

- [ ] **Step 1: Write the file** with exactly this content:

````markdown
# Refused Proposals — the hard deferral gate at record creation

Read by `wrap-up/review-console.md` ("On approval" step 7), `flow/multispec-review-console.md`
(step 2 / Queue writes), and `wrap-up/ledger-narrowing-auto-file.md` — before creating ANY `Q#`
queue-write proposal. Enforces `_shared/deferral-gate.md`'s hard gate: no record proposal without
a valid `Defer-reason:`.

## The check

Read the staged file's header block (the lines before the first blank line) and locate the line
matching `^Defer-reason: ` **by key, never by position** (`_shared/deferral-gate.md`, "Where the
reason lives"). Validate the value at runtime against the closed vocabulary:

```bash
node -e "process.exit(require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js').DEFER_REASONS.includes(process.argv[1])?0:1)" -- "$VALUE"
```

Missing line, or exit 1 → **refuse**: do not create the record.

## The refused row

Render the item under **Refused — no defer reason** — positioned immediately after the Queue
writes section, before Memory updates, in both consoles; renders only when non-empty — with the
staged path and the offending value (or "absent"). Log:

```
REFUSED {time} — Queue write {Q#}: no valid Defer-reason on {staged path}; kept staged.
```

The row has **no default**. It is excluded from Approve all, from `consoleAutoResolve`, and from
`queueWriteAutoFile` — no policy lever bypasses it. The only ways out: a human edits the staged
file's header and re-runs the console for that run, or drops it via Override → Skip.

## Ledger origin

When the refused proposal came from a ledger item (`staged/ledger-record-*.md`): set that item's
status back to `open` with note `proposal refused — no defer reason`, so the ledger's own
nothing-left-behind gate resurfaces it on the next resolve; delete the staged file (the ledger
item is the durable trace). A refused proposal with **no** ledger origin (a leftover section, a
reflect tangential) stays staged in its run dir and dies with it at `close-run` unless a human
rescues it — by design: the summary's refused-count line is the signal, and the reasonless
deferral should have been a fix.

Under `--dry-run`, the check still runs (it is a read); the ledger status flip is previewed, not
applied. A *failed* create (transport error on a valid proposal) is not a refusal — it renders in
Queue writes as today.
````

- [ ] **Step 2: Verify size and anchors**

```bash
wc -c skills/wrap-up/refused-proposals.md
grep -c "Refused — no defer reason" skills/wrap-up/refused-proposals.md
grep -c "DEFER_REASONS" skills/wrap-up/refused-proposals.md
grep -c "tangential" skills/wrap-up/refused-proposals.md
```
Expected: ≤ 3072; ≥ 1; 2 (prose + the node -e); 1 (the "reflect tangential" example — NOT a vocabulary list; confirm no other vocabulary value appears: `grep -c "blocked-external\|needs-human-decision\|genuinely-larger\|pre-existing-outside-diff\|blocked-dependency" skills/wrap-up/refused-proposals.md` → 0).

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/refused-proposals.md
git commit -m "Add wrap-up/refused-proposals.md — the hard refuse rule at Q# creation: keyed Defer-reason lookup, runtime DEFER_REASONS validation, no-default refused row, ledger-origin flip, refs #622

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 2: Wire the three consumers

**Files:**
- Modify: `skills/wrap-up/review-console.md` (three small edits, ≤ +400 bytes net), `skills/wrap-up/ledger-narrowing-auto-file.md`, `skills/flow/multispec-review-console.md`

**Interfaces:**
- Consumes: Task 1's file.
- Produces: all three cite `refused-proposals.md` (Task 5 asserts).

- [ ] **Step 0: Measure the baseline** — `wc -c skills/wrap-up/review-console.md` — record the number (expected 40899).

- [ ] **Step 1: `review-console.md` step 7 citation.** In the "On approval (option 1)" section's step 7, replace:

```markdown
On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file
```

with:

```markdown
On Apply (or Edit, after the modification): first run `refused-proposals.md`'s check (in this skill's directory) — a refused item is never created; then create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file
```

- [ ] **Step 2: `review-console.md` section list.** In "Numbering rules", replace:

```markdown
- Three sections use their own prefixed sequence instead of the global one — **Queue writes** (`Q1`, `Q2`, …), **Memory updates** (`M1`, `M2`, …), and **Upstream feedback** (`U1`, `U2`, …) — and are never counted into the batch sections above (Hard requirements below explains why).
```

with:

```markdown
- Three sections use their own prefixed sequence instead of the global one — **Queue writes** (`Q1`, `Q2`, …), **Memory updates** (`M1`, `M2`, …), and **Upstream feedback** (`U1`, `U2`, …) — and are never counted into the batch sections above (Hard requirements below explains why). A fourth, **Refused — no defer reason** (after Queue writes, before Memory updates; renders only when non-empty), lists `Q#` items `refused-proposals.md` blocked — no default, no sequence, excluded from every resolution path.
```

- [ ] **Step 3: `review-console.md` `consoleAutoResolve` clause.** In the "Auto-resolution short-circuit" section, replace:

```markdown
- Every `Q#`/`M#` item resolves to `Apply` — its pre-checked default in `_shared/batched-item-drill.md`.
```

with:

```markdown
- Every `Q#`/`M#` item resolves to `Apply` — its pre-checked default in `_shared/batched-item-drill.md`. Refused rows (`refused-proposals.md`) have no default and are never auto-resolved.
```

- [ ] **Step 4: Verify the byte budget** — `wc -c skills/wrap-up/review-console.md`; the delta over Step 0's baseline must be ≤ 400. If over, trim step 7's added sentence (e.g. drop "(in this skill's directory)") until under.

- [ ] **Step 5: `ledger-narrowing-auto-file.md`.** Replace:

```markdown
If record creation fails for one proposal, leave that one staged and let it render normally in
Queue writes below — do not drop it.
```

with:

```markdown
Before auto-filing any proposal, run `refused-proposals.md`'s check (in this skill's directory) —
a refused proposal is never auto-filed; it renders under the refused row, not under Queue writes.
A *failed* create on a valid proposal is different: leave that one staged and let it render
normally in Queue writes below — do not drop it. Two different outcomes.
```

- [ ] **Step 6: `multispec-review-console.md`.** Two edits. (a) In the "Canonical render order" paragraph, replace:

```markdown
then Cleanup actions, Issue closures, Translated briefs, Queue writes, Memory updates, Upstream feedback.
```

with:

```markdown
then Cleanup actions, Issue closures, Translated briefs, Queue writes, Refused — no defer reason (`wrap-up/refused-proposals.md`; renders only when non-empty, no sequence, no default), Memory updates, Upstream feedback.
```

(b) In the "On approval" numbered list, item 2, replace:

```markdown
On Apply/Edit: create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file
```

with:

```markdown
On Apply/Edit: first run `wrap-up/refused-proposals.md`'s check — a refused item is never created (it renders under the refused row instead); then create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file
```

- [ ] **Step 7: Verify**

```bash
grep -c "refused-proposals.md" skills/wrap-up/review-console.md
grep -c "refused-proposals.md" skills/wrap-up/ledger-narrowing-auto-file.md
grep -c "refused-proposals.md" skills/flow/multispec-review-console.md
```
Expected: ≥ 2 (step 7 + numbering rules + consoleAutoResolve = 3), ≥ 1, ≥ 2.

- [ ] **Step 8: Commit**

```bash
git add skills/wrap-up/review-console.md skills/wrap-up/ledger-narrowing-auto-file.md skills/flow/multispec-review-console.md
git commit -m "Wire refused-proposals.md into both consoles and the narrowing auto-file — refuse before create, refused row after Queue writes, no default under consoleAutoResolve, refs #622

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 3: Audit trail — `(defer-reason: {value})` + REFUSED entry kind

**Files:**
- Modify: `skills/_shared/ledger-format.md` (two `AUTO` log lines), `skills/wrap-up/summary-template.md` (Routed-to-backlog column + two count lines), `skills/_shared/auto-decision-log.md` (REFUSED kind + example update) — **one commit** (renderer and producer change together)

- [ ] **Step 1: `ledger-format.md` narrowing line (~line 123).** Replace:

```markdown
AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog (blocker: {category}). Reversibility: high.
```

with:

```markdown
AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog (defer-reason: {value}). Reversibility: high.
```

- [ ] **Step 2: `ledger-format.md` route-remainder line (~line 160).** Replace:

```markdown
AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog as {ref} (blocker: {category}) — "{one-line description}". Reversibility: high.
```

with:

```markdown
AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog as {ref} (defer-reason: {value}) — "{one-line description}". Reversibility: high.
```

- [ ] **Step 3: `summary-template.md` Routed-to-backlog (~lines 133-140).** Replace:

```markdown
Render in every mode whenever `ledgerRouteRemainder` (`unattended` only)
auto-routed at least one item — parsed from `_shared/ledger-format.md`'s Resolve Gate Phase 2
`AUTO … auto-routed to backlog as {ref} (blocker: {category}) — "{description}"`
log lines, one row per line:

| Record | Description | Blocker |
|---|---|---|
| #{ref} | {one-line description} | {category} |
```

with:

```markdown
Render in every mode whenever `ledgerRouteRemainder` (`unattended` only)
auto-routed at least one item — parsed from `_shared/ledger-format.md`'s Resolve Gate Phase 2
`AUTO … auto-routed to backlog as {ref} (defer-reason: {value}) — "{description}"`
log lines, one row per line:

| Record | Description | Defer-reason |
|---|---|---|
| #{ref} | {one-line description} | {value} |

Below the table (or alone when the table is omitted), render a trailing
`{N} record(s) filed by this run` line whenever N > 0 (every record this run
created — console approvals, auto-files, and route-remainder together), and a
`{M} proposal(s) refused — no defer reason` line whenever M > 0 (from
`REFUSED` entries in `decisions.md` — `wrap-up/refused-proposals.md`). A run
that files six records reads as a signal.
```

- [ ] **Step 4: `auto-decision-log.md` REFUSED kind.** (a) In the Entry schema's STATUS row, replace:

```markdown
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found) |
```

with:

```markdown
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found), `REFUSED` (a queue-write proposal blocked at creation — no valid `Defer-reason:`; see `wrap-up/refused-proposals.md`) |
```

(b) In the "Status semantics" table, after the `STAGED` row, add:

```markdown
| `REFUSED` | Console blocked a reason-less queue-write proposal at creation; kept staged (or flipped its ledger item back to `open`). | Shown under "Refused — no defer reason". No default; human edits the staged header or drops via Override → Skip. |
```

(c) Update the `/wrap-up` example line. Replace:

```markdown
- AUTO 15:02:18 — Leftover routing: 2 sections routed to `defer` per policy. Detail: error-handling-edge-cases (cannot finish — external API spec), localization-pass (deferred to spec 45).
```

with:

```markdown
- AUTO 15:02:18 — Leftover routing: 2 sections routed to `defer` per policy (defer-reason: blocked-external, blocked-dependency). Detail: error-handling-edge-cases (cannot finish — external API spec), localization-pass (deferred to spec 45).
```

- [ ] **Step 5: Verify**

```bash
grep -rn "(blocker: {category})" skills/
grep -c "Defer-reason" skills/wrap-up/summary-template.md
grep -c "REFUSED" skills/_shared/auto-decision-log.md
```
Expected: no matches; ≥ 2; ≥ 2. Also confirm #620's pins still hold: `node --test tests/deferral-gate-conformance.test.js` → `# fail 0`. (The #620 test asserts `ledger-format.md`'s Phase headings and citations — untouched — but NOT the `(blocker: {category})` literal, so this passes; if it fails, STOP and report which assertion.)

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/ledger-format.md skills/wrap-up/summary-template.md skills/_shared/auto-decision-log.md
git commit -m "Carry the defer reason through the audit trail — Phase 2 AUTO lines and Routed-to-backlog render (defer-reason: {value}), per-run filed/refused count lines, REFUSED entry kind, refs #622

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 4: Eval scenario `wrap-up-refuses-reasonless-proposal.yaml`

**Files:**
- Create: `evals/scenarios/wrap-up-refuses-reasonless-proposal.yaml`

**Interfaces:**
- Consumes: `file-contains` / `dir-file-count` / `file-exists` assertion types (#621), `init-baseline` fixture (local-files backend).

- [ ] **Step 1: Verify the record-filename derivation** before writing the YAML — the scenario pins the created record's exact path, so confirm how `local-store.js` slugs a title:

```bash
node -e "const ls=require('./bin/lib/issues/local-store.js'); console.log(Object.keys(ls))"
grep -n "slug\|allocateId" bin/lib/issues/local-store.js | head
```

Determine what filename `createRecord`/`writeRecord` produces for the title `Fix flaky retry helper` as the first record in an empty `specs/` (expected `specs/1-fix-flaky-retry-helper.md` — adjust the YAML below to the actual derivation and note it in your report; the seeded-comment convention in `backlog-refine-permission-matrix-compliance.yaml` did exactly this).

- [ ] **Step 2: Write the scenario:**

```yaml
name: wrap-up-refuses-reasonless-proposal
description: >
  Deferral-gate enforcement pin (#622): the Review Console must refuse a
  staged queue-write proposal whose Defer-reason: is missing or invalid, and
  file only the valid one. Seeded: a run dir with three staged proposals —
  leftover-a.md (no Defer-reason line), ledger-record-b.md (Defer-reason:
  tangential — valid), reflect-staged-1.md (Defer-reason: bogus — invalid).
  Mechanically checkable, designed around wrap-up's cleanup (the run dir may
  be archived at close, so no assertion reads the run dir post-run): exactly
  the valid proposal's record exists under specs/ (this fixture's
  work-backend is local-files and the sandbox has no network, so record
  creation lands there or nowhere), and no more than one record exists — a
  console that filed a reason-less proposal produces a second specs/ file
  and fails the count; one that refused everything fails the file-exists
  pin. The refused proposals' staged files and REFUSED log lines live in the
  (possibly archived) run dir and are deliberately not asserted — the
  specs/-level outcome is the load-bearing behavior.
fixture:
  base: init-baseline
  seed:
    - files:
        .claude-tweaks/pipelines/2026-08-16T120000-record-7-standalone/config.yml: |
          mode: auto
          leftover-default: defer
          created: 2026-08-16T120000
        .claude-tweaks/pipelines/2026-08-16T120000-record-7-standalone/decisions.md: |
          # Auto-Decision Log — pipeline 2026-08-16T120000-record-7-standalone

          ## /wrap-up
          - STAGED 12:01:00 — Leftover routing: section "retry cleanup" cannot finish now (needs another pass). Recommended: defer → backlog. Stage path: staged/leftover-a.md.
          - STAGED 12:01:05 — Ledger Phase 3: item #2 routed to a record. Stage path: staged/ledger-record-b.md.
          - STAGED 12:01:10 — Step 3: tangential idea "retry metrics" — backlog candidate (defer-reason: bogus). Stage path: staged/reflect-staged-1.md.
        .claude-tweaks/pipelines/2026-08-16T120000-record-7-standalone/staged/leftover-a.md: |
          Title: Clean up the retry helper loop
          Type: task
          Labels: none

          Origin: wrap-up leftover from #7

          The retry helper's cleanup path needs another pass.
        .claude-tweaks/pipelines/2026-08-16T120000-record-7-standalone/staged/ledger-record-b.md: |
          Title: Fix flaky retry helper
          Type: task
          Labels: none
          Defer-reason: tangential

          Defer-reason: tangential

          Origin: ledger resolve gate

          The retry helper flakes under parallel load; needs its own record.
        .claude-tweaks/pipelines/2026-08-16T120000-record-7-standalone/staged/reflect-staged-1.md: |
          Title: Add retry metrics
          Type: feature
          Labels: none
          Defer-reason: bogus

          # Reflect — staged finding 1

          **Category:** tangential

          Retry metrics would help diagnose flakes.
skill_invocation:
  prompt: "/claude-tweaks:wrap-up"
assertions:
  # Exactly the VALID proposal became a record: its file exists...
  - type: file-exists
    path: "specs/1-fix-flaky-retry-helper.md"
    shouldExist: true
  # ...and it is the only one (a filed reason-less proposal would be #2).
  - type: dir-file-count
    path: "specs"
    max: 1
  # The created record's body carries the reason line (recordPayload/console
  # read it from the staged file).
  - type: file-contains
    path: "specs/1-fix-flaky-retry-helper.md"
    contains: ["Defer-reason: tangential"]
  - type: tool-count
    max: 80
```

(Adjust `specs/1-fix-flaky-retry-helper.md` in all three assertions if Step 1's derivation differs.)

- [ ] **Step 3: Validate** — from evals/: `node --test "tests/*.test.js"` → all pass (never run `node runner.js run …`).

- [ ] **Step 4: Commit**

```bash
git add evals/scenarios/wrap-up-refuses-reasonless-proposal.yaml
git commit -m "Add wrap-up-refuses-reasonless-proposal eval scenario — only the valid Defer-reason proposal may become a record; reason-less and bogus ones are refused, refs #622

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 5: Conformance extensions + full suite

**Files:**
- Modify: `tests/deferral-gate-conformance.test.js` (append a `#622 enforcement` section)

- [ ] **Step 1: Append:**

```js
// --- #622: the console refuses reason-less proposals; the reason travels the audit trail ---

test('both consoles and the narrowing auto-file cite refused-proposals.md', () => {
  for (const rel of [
    'skills/wrap-up/review-console.md',
    'skills/flow/multispec-review-console.md',
    'skills/wrap-up/ledger-narrowing-auto-file.md',
  ]) assert.ok(read(rel).includes('refused-proposals.md'), rel);
});

test('refused-proposals.md stays within its 3 KB budget and never hardcodes the vocabulary', () => {
  const content = read('skills/wrap-up/refused-proposals.md');
  assert.ok(Buffer.byteLength(content, 'utf8') <= 3072, `size ${Buffer.byteLength(content, 'utf8')}`);
  assert.ok(content.includes('DEFER_REASONS'));
  for (const v of ['needs-human-decision', 'pre-existing-outside-diff', 'genuinely-larger', 'blocked-external', 'blocked-dependency']) {
    assert.ok(!content.includes(v), `hardcoded vocabulary value: ${v}`);
  }
});

test('the audit trail renders (defer-reason: {value}) — (blocker: {category}) is retired', () => {
  assert.ok(read('skills/wrap-up/summary-template.md').includes('Defer-reason'));
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md') && fs.readFileSync(p, 'utf8').includes('(blocker: {category})')) {
        offenders.push(path.relative(REPO_ROOT, p));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'skills'));
  assert.deepEqual(offenders, []);
});

test('auto-decision-log.md defines the REFUSED entry kind', () => {
  assert.ok(read('skills/_shared/auto-decision-log.md').includes('REFUSED'));
});
```

- [ ] **Step 2: Run** — `node --test tests/deferral-gate-conformance.test.js` → `# fail 0`.

- [ ] **Step 3: Prove discrimination** — swap `review-console.md` to its pre-Task-2 state (the commit before Task 2's — find with `git log --oneline -6`), run, restore, back-to-back:

```bash
git show {task1-sha}:skills/wrap-up/review-console.md > skills/wrap-up/review-console.md
node --test tests/deferral-gate-conformance.test.js 2>&1 | grep -E "^# (pass|fail)"
git checkout -- skills/wrap-up/review-console.md
git status --short skills/wrap-up/review-console.md
```
Expected: `# fail 1` (the citation test), then clean status.

- [ ] **Step 4: Full suite** — `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/622-npm-test.log 2>&1` then `grep -E "^# (tests|pass|fail)" <log>` → `# fail 0` (isolate any failure before concluding). Also run spec AC 3's greps: `grep -rn "(blocker: {category})" skills/` → none; `grep -n "Defer-reason" skills/wrap-up/summary-template.md` → matches the table header.

- [ ] **Step 5: Commit**

```bash
git add tests/deferral-gate-conformance.test.js
git commit -m "Pin #622's enforcement in the conformance suite — console citations, refused-proposals budget and no-hardcoded-vocabulary, audit-trail defer-reason rendering, REFUSED kind, refs #622

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

## Self-review

- **Spec coverage:** D1 (refused-proposals.md, all elements: keyed lookup, runtime validation, row placement, REFUSED log line, no-default/excluded-from-all-three, ledger-origin flip + staged-file delete, non-ledger dies-with-run, dry-run note, failed-create distinction) → T1; D2 (review-console: step 7 + section list + consoleAutoResolve, ≤400B) → T2 Steps 1-4; D3 (narrowing auto-file) → T2 Step 5; D4 (multispec) → T2 Step 6; D5 (ledger-format lines + summary-template same commit) → T3 Steps 1-3; D6 (auto-decision-log REFUSED + example) → T3 Step 4; D7 (eval scenario) → T4; D8 (conformance) → T5. AC 1 → T5 Steps 2-3; AC 2 → T2 Steps 0+4 (baseline + delta recorded in PR body via the report); AC 3 → T3 Step 5 + T5 Step 4; AC 4 → T4 (expected outcomes stated in the file); AC 5 → T5 Step 4.
- **Anchors:** review-console step 7 / numbering rules / consoleAutoResolve bullet, narrowing-auto-file final paragraph, multispec render-order + On-approval item 2, ledger-format's two AUTO lines, summary-template's Routed-to-backlog block, auto-decision-log's STATUS row + example line — all copied verbatim from the live post-#621 tree.
- **Scenario robustness:** all assertions read `specs/` (never the run dir), immune to archival; the valid proposal's dual `Defer-reason:` (header + body first line) matches #620's match-or-throw pattern; Step 1 verifies the slug before the YAML pins it.
- **No hardcoded vocabulary in refused-proposals.md:** the one value that appears ("reflect tangential") is prose naming a producer, not a list — T1 Step 2's negative grep guards the other five; T5 pins it permanently.
- **Placeholders:** none. **Type consistency:** REFUSED line shape identical in T1's file, T3's schema row, and the spec's Data/API section.
