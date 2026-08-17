# Exhaust Producers File Spec-Shaped Born-Ready (#624) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the pipeline's exhaust producers onto `specShapedBody`: wrap-up leftover routing, ledger Phase 3's `Keep`/`Defer`/`Acknowledge` (+ the standalone direct-create path), reflect's tangential routing and Defer, the residue sweep's `remedy: record` items, and review Step 3's Defer compose their proposals via the composer (Origin + Defer-reason provenance, `via specShapedBody` footer), stamp `risk:*`/`size:*`/`ready` (or `parked`, or `needs:definition` via `openQuestion`), and log a landing state. After this record an exhaust record lands born-ready or needs-you, never as a prose stub.

**Architecture:** One composer, five call sites, no re-implementation. Task 0's census verdict (all four producers ESTABLISHED; openQuestion load-bearing) shapes one rule stated at every call site: **the openQuestion path triggers on the item's own decision-language** ("needs a design decision", "Decide:", "needs design judgment", an open choice named in the finding) — per-record, not per-producer. Two #623 carry-forwards are binding: (1) pass the reason via `provenance.deferReason` (never `recordPayload({deferReason})` alone when a `Trigger:` header exists — the recordPayload insert lands ABOVE the header); (2) delete `leftover-routing.md`'s no-scoring parenthetical. Parent promise **F2** is satisfied by the standalone direct-create path requiring a reason.

**Tech Stack:** Markdown skill files; Node 18+ conformance tests; one composition-probe script.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-624/work/624-spec.md`

## Global Constraints

- Retired sentence (must appear nowhere under `skills/` after this record): `Compose the body with a \`Trigger:\` line, origin spec, and affected files` (currently in `step3-routing.md` and `full-mode.md`). Also retired: `leftover-routing.md`'s parenthetical `no \`risk\`/\`size\`/\`ready\` (scoring and promotion to \`ready\` are \`/specify\`'s job, not wrap-up's — #624 rewrites this composition onto \`specShapedBody\`)`.
- Every producer's composed body layout: `[Trigger: …]\n\n[Origin: …]\n\n[Defer-reason: …]\n\n## Current State … ## Deliverables … (## Acceptance Criteria | ## Open Question) … _Filed by \`{producer}\` via specShapedBody._` — the composer emits this; producers pass `header` (Trigger line or `''`), `provenance: { origin, deferReason }`, and the producer-specific footer.
- Staged-file `Labels:` header emission: `risk:{tier}, size:{tier}, ready` (born-ready, incl. Acknowledge) | `needs:definition` (needs-you) | `risk:{tier}, size:{tier}, parked` (parked) — plus `type:{t}` under `work-types: labels`. Bootstrap labels per `_shared/label-bootstrap.md` at creation time.
- `parked`+`ready` never coexist (recordPayload throws); `needs:definition`+`ready` never coexist (openQuestion path drops `ready` AND scoring).
- Every producer's `AUTO`/`STAGED` log line gains `— landing: {born-ready|needs:definition|parked} (defer-reason: {value})`.
- Scoring cites `_shared/work-record.md`'s Scoring axis — never restates criteria. Composition prose ≤ one paragraph + one code block per producer.
- Review-Defer bodies cite the origin spec as `refs #{n}`, never `closes`.
- `hindsight-mode.md` unchanged (inherits by its existing indirection). `#625` owns capture's side; until it lands, Capture routes hand the shaped body via #621's `Defer-reason:`-line pass-through.
- Commits: imperative, `refs #624`, `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk` trailer. No version bump. Work from the worktree (`pwd`/`git rev-parse --show-toplevel` before commits); stage specific files only; policy hook may refuse compound Bash — run singly. Full `npm test` only in Task 5.
- AC 4/5's dry-run preview is verified by a **composition probe** (Task 5) — a node script composing the exact payloads the new prose specifies and checking body shape + the spec-shaped structural check; a live `--dry-run` wrap-up run needs an interactive agent and is out of a build's reach. State this deviation in the PR body.

---

### Task 1: `skills/wrap-up/leftover-routing.md` — steps 1–3 onto the composer

**Files:** Modify `skills/wrap-up/leftover-routing.md` (steps 1–4 of Staging)

- [ ] **Step 1: Replace step 1 (Compose the body).** Replace the paragraph beginning `1. **Compose the body.** Start with a provenance line` (through `there is no fourth "inbox" state).`) with:

```markdown
1. **Compose the body** via `specShapedBody` (`bin/lib/issues/record.js`): `header` = `'Trigger: {condition}'` when a concrete trigger exists (a date, a watched path, another spec landing — the `parked` case), else `''`; `currentState` = what exists now (the section's finished part, files touched); `deliverables` = what is left, as checkbox items; `acceptanceCriteria` = how a builder verifies it is done (a test name, a grep, an observable behavior); `provenance: { origin: 'wrap-up leftover from #{n}' (when this run's materialized header exists — `{n}` = its `record:` field), deferReason }` — the reason from the fix-exhaust gate above, passed HERE, never via `recordPayload`'s own `deferReason` (which would insert the line above the `Trigger:` header); `filedBy: 'wrap-up leftover routing'`; `footer: '_Filed by \`wrap-up leftover routing\` via specShapedBody._'`. When Acceptance Criteria cannot be honestly written — the section's own text names an open choice or missing evidence ("needs a design decision", "Decide:", insufficient evidence to state done) — use `openQuestion: '<the open choice, or "insufficient evidence: {what is missing}">'` instead of `acceptanceCriteria`; the text must say which of the two cases it is, because the human resolving it needs to know. `Defer-reason:` is present in every landing state, including `needs:definition` — it names why the item was not fixed, independent of whether it is decidable.
```

- [ ] **Step 2: Replace step 2 (Build the payload).** Replace the paragraph + code block beginning `2. **Build the payload** via \`recordPayload\`` (through the line `` `$HAS_TRIGGER` — `'true'` when step 1 appended a `Trigger:` line, else `'false'`. ``) with:

```markdown
2. **Build the payload** via `recordPayload` (`bin/lib/issues/record.js`) — no `origin` param (a wrap-up leftover carries no `by:*` label; `_shared/work-record.md`'s origin axis records this case as the body's `Origin:` line). Landing states, per `_shared/work-record.md`'s born-shaped `/wrap-up` row: **born-ready** — `risk`/`size` judged per that file's Scoring axis from the section's own content, `ready: true`; **parked** (a real `Trigger:` in the header) — scored, `parked: true`, `ready: false` (`recordPayload` rejects both together); **needs-you** (the `openQuestion` body) — `needs:definition` in `Labels:`, no `ready`, no scoring. Do not pass `deferReason` to `recordPayload` — the composed body already carries the line (a matching value would be a no-op, but the body is the source of truth here):

   ```bash
   node -e "const {recordPayload,specShapedBody}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const args=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
     const body=specShapedBody(args.compose);
     const p=recordPayload({ ...args.payload, body });
     require('fs').writeFileSync('/tmp/wrap-up-leftover-payload.json', JSON.stringify(p))" /tmp/wrap-up-leftover-args.json
   ```

   `/tmp/wrap-up-leftover-args.json` carries `{ compose: {header, currentState, deliverables, acceptanceCriteria|openQuestion, filedBy, provenance, footer}, payload: {title, type, risk?, size?, ready?, parked?} }` — `type`: `task` by default, `bug` for a defect, `feature` for a distinct new capability. The `needs:definition` label is appended at the staging step below (it is a label with no `recordPayload` parameter).
```

- [ ] **Step 3: Step 3 (Stage it) — Labels line.** In step 3's code block, the `Labels:` write currently emits `p.labels.join(', ') || 'none'`. After it, the composed labels already carry risk/size/ready/parked from `recordPayload`; add the needs-you case: replace the snippet's writer line

```markdown
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + (p.labels.join(', ') || 'none') + '\nDefer-reason: ' + process.argv[2] + '\n\n' + p.body)" \
```

with:

```markdown
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + ((p.labels.concat(process.argv[3]==='true'?['needs:definition']:[]).join(', ')) || 'none') + '\nDefer-reason: ' + process.argv[2] + '\n\n' + p.body)" \
```

and the argument line below it gains a third argument: `"${RUN_DIR}/staged/leftover-${SLUG}.md" "$DEFER_REASON" "$NEEDS_DEFINITION"` — with one sentence after the block: `` `$NEEDS_DEFINITION` is `'true'` on the `openQuestion` landing state, else `'false'`. Bootstrap any `risk:*`/`size:*`/`ready`/`needs:definition` labels per `_shared/label-bootstrap.md` at creation time (the console does this today for `parked`). ``

- [ ] **Step 4: Step 4 log line.** Replace:

```markdown
   STAGED 15:02:18 — Leftover routing: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog} (defer-reason: {value}). Stage path: staged/leftover-{slug}.md.
```

with:

```markdown
   STAGED 15:02:18 — Leftover routing: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog} — landing: {born-ready|needs:definition|parked} (defer-reason: {value}). Stage path: staged/leftover-{slug}.md.
```

- [ ] **Step 5: Verify** — `grep -c "specShapedBody" skills/wrap-up/leftover-routing.md` ≥ 2; `grep -c "no \`risk\`/\`size\`/\`ready\`" skills/wrap-up/leftover-routing.md` → 0; `grep -c "landing:" skills/wrap-up/leftover-routing.md` ≥ 1. Sanity-compose: run the args-file snippet with a real temp file (born-ready case) and confirm the payload's body contains the three sections + `Origin:` + `Defer-reason:` + `via specShapedBody`, labels `risk:…, size:…, ready`.

- [ ] **Step 6: Commit** — `git add skills/wrap-up/leftover-routing.md`; message: `Compose wrap-up leftovers via specShapedBody — three landing states, provenance-borne Defer-reason, scored born-ready labels, retired no-scoring parenthetical, refs #624` + trailer.

---

### Task 2: `skills/_shared/ledger-format.md` — Phase 3 branches + standalone path (satisfies parent promise F2)

**Files:** Modify `skills/_shared/ledger-format.md` (Phase 3 bullets)

- [ ] **Step 1: `Defer` bullet.** Replace the whole `- \`Defer\` → …` bullet with:

```markdown
- `Defer` → stage a record proposal at `{run-dir}/staged/ledger-record-{slug}.md` (`Title:`/`Type:`/`Labels:`/`Defer-reason:` header + body, same staging shape as `leftover-{slug}.md` — see `wrap-up/leftover-routing.md` step 3). The body is composed via `specShapedBody` exactly as `leftover-routing.md` step 1 does, mapped from the ledger's own evidence: `header` = `'Trigger: {user-stated trigger}'`; `currentState` = the ledger item's evidence and affected files; `deliverables` = the fix as stated; `acceptanceCriteria` = the item's own verification (a test name, a grep, an observable behavior); `provenance: { origin: 'ledger resolve gate', deferReason }` (the item's vocabulary value, per `_shared/deferral-gate.md`); footer `_Filed by \`ledger resolve gate\` via specShapedBody._`. Labels: scored (`risk:*`/`size:*` per `_shared/work-record.md`'s Scoring axis) + `parked` — spec-shaped and scored but not `ready`. An item whose own text names an open choice takes the `openQuestion` path (`needs:definition`, no `ready`, no scoring) — the escape hatch is not withheld from any branch. Update ledger status to `deferred`. Resolves at the Review Console's Queue writes section (which creates the record); log line carries `— landing: parked (defer-reason: {value})`
- `Keep` → same composition, backlog landing: no `Trigger:` header, `ready: true` + scoring (born-ready per `_shared/work-record.md`'s born-shaped `/wrap-up` row), `Origin: ledger resolve gate`. Update ledger status to `deferred` (note `→ backlog`). Same two-surface resolution as `Defer` above; log line carries `— landing: born-ready (defer-reason: {value})`
```

(This replaces BOTH the current `Defer` and `Keep` bullets — match each old bullet exactly and replace pairwise.)

- [ ] **Step 2: standalone bullet.** Replace the `- **No pipeline run directory resolves** …` bullet with:

```markdown
- **No pipeline run directory resolves** (truly standalone `/claude-tweaks:ledger resolve`, outside any `/flow` or `/wrap-up` run — see `_shared/pipeline-run-dir.md`): no Review Console will ever read a staged file, so create the record directly instead, using the same dual-driver contract the console would have used — composing via `specShapedBody` exactly as the branches above, with the reason **required**: a direct create without a valid `Defer-reason:` in the composed body is the same hard-gate violation `wrap-up/refused-proposals.md` refuses at the console (`_shared/deferral-gate.md`, "staged in a run directory or created directly"). When `bookkeepingPermissions(ceiling).ledgerNarrowing === true`, apply Phase 2's narrowing check inline here too (no wrap-up runs on this path, so there is no Review Console to centralize the auto-file decision through).
```

- [ ] **Step 3: `Acknowledge` bullet.** Replace it with:

```markdown
- `Acknowledge` (ops items only) → **stages a record proposal**, composed via `specShapedBody` with the born-ready label shape (`risk:*`, `size:*`, `ready`), `Type: task`, `provenance: { origin: 'ledger resolve gate (acknowledged)', deferReason: 'blocked-external' }` — `deliverables` = the human action ("do X in the dashboard"), `acceptanceCriteria` = the observable outcome; there is no separate Manual Steps section (`/build` Step 2.5 triages the deliverable at execution time). An ops action that itself names an open choice takes the `openQuestion` path like any other item. An ops item is action still outstanding, just not something the agent can perform, so unlike `Accept`/`Drop` it must not disappear once the ledger file is deleted at cleanup. Update ledger status to `acknowledged`. Same two-surface resolution as `Defer`/`Keep`; log line carries `— landing: born-ready (defer-reason: blocked-external)`
```

- [ ] **Step 4: Verify** — `grep -c "specShapedBody" skills/_shared/ledger-format.md` ≥ 3; `node --test tests/deferral-gate-conformance.test.js` → `# fail 0` (Phase headings and existing pins untouched).

- [ ] **Step 5: Commit** — `git add skills/_shared/ledger-format.md`; message: `Compose ledger Phase 3 routings via specShapedBody — Keep born-ready, Defer parked, Acknowledge born-ready ops, standalone direct-create requires the reason (parent promise F2), refs #624` + trailer.

---

### Task 3: reflect + review + residue-sweep onto the composer

**Files:** Modify `skills/reflect/SKILL.md` (Step 3 tangential), `skills/reflect/full-mode.md` (Defer/Capture bullets), `skills/review/step3-routing.md` (Defer/Capture bullets), `skills/wrap-up/residue-sweep.md` (one sentence)

- [ ] **Step 1: `reflect/SKILL.md` tangential composition.** Locate the sentence introducing the tangential staged file (`prepend a 4-line header above the \`# Reflect —\` line, the same shape \`wrap-up/leftover-routing.md\` step 3 writes for \`leftover-{slug}.md\`:`) and, in the paragraph ABOVE the header code block, append: ` The body below the header is composed via \`specShapedBody\` (the finding → Current State, the proposed change → Deliverables, the observable outcome → Acceptance Criteria; \`header: ''\`; \`provenance: { origin: 'reflect {mode} from #{n}', deferReason: 'tangential' }\`; footer \`_Filed by \`reflect\` via specShapedBody._\`) — with the \`# Reflect — staged finding {n}\` title line and \`**Category:**\` line kept above it; a finding whose own text names an open choice uses the composer's \`openQuestion\` variant and lands \`needs:definition\` (no \`ready\`, no scoring). Labels: scored + \`ready\` (born-ready) on the AC path, per \`_shared/work-record.md\`'s \`/reflect\` row.` Then update the tangential STAGED log line from `(defer-reason: tangential)` to `— landing: {born-ready|needs:definition} (defer-reason: tangential)`.

- [ ] **Step 2: `full-mode.md` Defer bullet.** In the Defer bullet (currently ending `An insight with no valid reason cannot be recommended Defer.`), replace the middle clause `Compose the body with a \`Trigger:\` line, origin, context, then create it directly via the unified record contract (\`_shared/work-record.md\`) — \`gh issue create\` (\`work-backend: github-issues\`) or \`local-store.js\`'s \`writeRecord\` (\`work-backend: local-files\`) — passing the same value as \`recordPayload\`'s \`deferReason\`.` with `Compose the body via \`specShapedBody\` (the insight → Current State, the known improvement → Deliverables, the observable outcome → Acceptance Criteria; \`header: 'Trigger: {condition}'\`; \`provenance: { origin: 'reflect {mode} from #{n}', deferReason }\`; footer \`_Filed by \`reflect\` via specShapedBody._\`), then create it directly via the unified record contract (\`_shared/work-record.md\`) — \`gh issue create\` (\`work-backend: github-issues\`) or \`local-store.js\`'s \`writeRecord\` (\`work-backend: local-files\`) — with \`recordPayload({ …, risk, size, parked: true })\` (scored per the Scoring axis; \`parked\`, never \`ready\` alongside a Trigger). An insight naming an open choice takes the \`openQuestion\` variant (\`needs:definition\`, no scoring).`

- [ ] **Step 3: `step3-routing.md` Defer bullet.** Replace the Defer bullet's composition clause `Compose the body with a \`Trigger:\` line, origin spec, and affected files, then create it directly via the unified record contract (\`_shared/work-record.md\`) — \`gh issue create\` (\`work-backend: github-issues\`) or \`local-store.js\`'s \`writeRecord\` (\`work-backend: local-files\`) — passing \`deferReason\` to \`recordPayload\` (\`bin/lib/issues/record.js\`), chosen by the mapping below.` with `Compose the body via \`specShapedBody\` (finding + evidence → Current State, citing the origin spec as \`refs #{n}\`; the fix → Deliverables; the review lens's own check → Acceptance Criteria; \`provenance: { origin: 'spec #{n} review ({lens})', deferReason }\` — the reason chosen by the mapping below; footer \`_Filed by \`review\` via specShapedBody._\`), then create it directly via the unified record contract (\`_shared/work-record.md\`) — \`gh issue create\` (\`work-backend: github-issues\`) or \`local-store.js\`'s \`writeRecord\` (\`work-backend: local-files\`) — with \`recordPayload({ …, risk, size, ready: true })\` scored per the Scoring axis (born-ready per \`_shared/work-record.md\`'s \`/review\` row), or \`header: 'Trigger: {wake condition}'\` + \`parked: true\` instead of \`ready\` when the reason is \`blocked-dependency\`/\`blocked-external\` with a concrete wake condition. A finding naming an open product choice already routes to Capture (\`needs-human-decision\` fixes stay findings; \`tangential\` captures).`

- [ ] **Step 4: `residue-sweep.md` citation.** At the end of the `## \`remedy: record\` findings` section (after `…where the human picks the value.`), append one sentence: ` A \`remedy: record\` item Phase 2 routes to a record composes exactly as ledger Phase 3's branches do (\`_shared/ledger-format.md\`) — \`specShapedBody\`, the #621 mapping above supplying its \`Defer-reason:\`, landing born-ready, parked, or \`needs:definition\` by the same rules.`

- [ ] **Step 5: Verify** — `grep -rn "Compose the body with a \`Trigger:\` line" skills/` → no matches; `grep -c "specShapedBody" skills/reflect/SKILL.md skills/reflect/full-mode.md skills/review/step3-routing.md skills/wrap-up/residue-sweep.md` each ≥ 1; `grep -rn "landing:" skills/reflect/SKILL.md` ≥ 1.

- [ ] **Step 6: Commit** — `git add skills/reflect/SKILL.md skills/reflect/full-mode.md skills/review/step3-routing.md skills/wrap-up/residue-sweep.md`; message: `Compose reflect and review routings via specShapedBody and cite it from the residue sweep — born-ready or parked or needs:definition, landing-state log lines, refs #624` + trailer.

---

### Task 4: `_shared/work-record.md` — #623 carry-forwards

**Files:** Modify `skills/_shared/work-record.md` (`/wrap-up` and `/review` rows)

- [ ] **Step 1:** In the `/wrap-up` row's Adds cell, after `demo:pending\`;` insert ` \`parked\` (a \`Trigger:\` leftover or Defer — never alongside \`ready\`);` (making `parked` a named Adds item, not only parenthetical).
- [ ] **Step 2:** Narrow the `/review` row's header cell from `(Step 3 Defer/Capture)` to `(Step 3 Defer — Capture routes file under \`/capture\`'s own row)`.
- [ ] **Step 3: Verify** — `node --test tests/deferral-gate-conformance.test.js` → `# fail 0`.
- [ ] **Step 4: Commit** — `git add skills/_shared/work-record.md`; message: `Name parked in /wrap-up's Adds cell and narrow /review's row scope to Defer — #623 review carry-forwards, refs #624` + trailer.

---

### Task 5: Conformance extensions + composition probe + full suite

**Files:** Modify `tests/deferral-gate-conformance.test.js`

- [ ] **Step 1: Append:**

```js
// --- #624: producers compose via specShapedBody, both landing states named ---

const PRODUCER_FILES_624 = [
  'skills/wrap-up/leftover-routing.md',
  'skills/_shared/ledger-format.md',
  'skills/reflect/SKILL.md',
  'skills/wrap-up/residue-sweep.md',
  'skills/review/step3-routing.md',
];

for (const rel of PRODUCER_FILES_624) {
  test(`${rel} names specShapedBody and both landing states`, () => {
    const c = read(rel);
    assert.ok(c.includes('specShapedBody'), 'specShapedBody');
    assert.ok(c.includes('born-ready'), 'born-ready');
    assert.ok(c.includes('needs:definition'), 'needs:definition');
  });
}

test('the retired stub-composition wordings appear nowhere under skills/', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('Compose the body with a `Trigger:` line')) offenders.push(path.relative(REPO_ROOT, p));
        if (c.includes("no `risk`/`size`/`ready` (scoring and promotion")) offenders.push(path.relative(REPO_ROOT, p));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'skills'));
  assert.deepEqual(offenders, []);
});

// Composition probe — the mechanical stand-in for the spec's dry-run-preview AC:
// compose the exact payloads the producer prose specifies and validate the
// artifact against the staged-file contract and the spec-shaped structural check.
test('a born-ready leftover payload composes with all contract elements and passes the structural check', () => {
  const { specShapedBody: ssb, recordPayload: rp } = require('../bin/lib/issues/record.js');
  const body = ssb({
    header: '', currentState: 'The retry helper exists; cleanup path unfinished (src/retry.js).',
    deliverables: '- [ ] finish the cleanup path', acceptanceCriteria: 'node --test test/retry.test.js passes',
    filedBy: 'wrap-up leftover routing',
    provenance: { origin: 'wrap-up leftover from #42', deferReason: 'genuinely-larger' },
    footer: '_Filed by `wrap-up leftover routing` via specShapedBody._',
  });
  const p = rp({ title: 't', body, type: 'task', risk: 'low', size: 'low', ready: true });
  for (const needle of ['## Current State', '## Deliverables', '## Acceptance Criteria', 'Origin: wrap-up leftover from #42', 'Defer-reason: genuinely-larger', 'via specShapedBody']) {
    assert.ok(p.body.includes(needle), needle);
  }
  assert.deepEqual(p.labels, ['risk:low', 'size:low', 'ready']);
  for (const marker of ['TBD', 'TODO', '<!-- ambiguity:']) assert.ok(!p.body.includes(marker), marker);
  assert.strictEqual((p.body.match(/^Defer-reason: /gm) || []).length, 1);
});

test('a needs-you leftover payload composes Open Question with no ready and no scoring', () => {
  const { specShapedBody: ssb, recordPayload: rp } = require('../bin/lib/issues/record.js');
  const body = ssb({
    header: '', currentState: 'Two mutually exclusive designs are on the table.',
    deliverables: '- [ ] settle the choice', openQuestion: 'open choice: project-local skill vs docs subsection',
    filedBy: 'wrap-up leftover routing',
    provenance: { origin: 'wrap-up leftover from #42', deferReason: 'needs-human-decision' },
    footer: '_Filed by `wrap-up leftover routing` via specShapedBody._',
  });
  const p = rp({ title: 't', body, type: 'task' });
  assert.ok(p.body.includes('## Open Question'));
  assert.ok(!p.body.includes('## Acceptance Criteria'));
  assert.deepEqual(p.labels, []);
});
```

- [ ] **Step 2: Run** — `node --test tests/deferral-gate-conformance.test.js` → `# fail 0`.
- [ ] **Step 3: Prove discrimination** — swap `leftover-routing.md` to its pre-Task-1 state (`git show {pre-task1-sha}:… > …`, test, `git checkout --`), expect ≥ 1 failure (the specShapedBody/landing-states test for that file, plus the retired-wording sweep), then clean restore.
- [ ] **Step 4: Full suite** — `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/624-npm-test.log 2>&1`; grep `^# (tests|pass|fail)` → `# fail 0` (baseline 3931; isolate any failure). Run spec AC 3's greps: `grep -rn "specShapedBody" <the five producer files>` all match; `grep -rn "Compose the body with a \`Trigger:\` line, origin spec, and affected files" skills/` → none.
- [ ] **Step 5: Commit** — `git add tests/deferral-gate-conformance.test.js`; message: `Pin #624's producer migration — specShapedBody + landing states per producer, retired stub wordings swept, composition probes for both landing states, refs #624` + trailer.

---

## Self-review

- **Spec coverage:** Task 0 (done pre-plan, verdict in the PR body + decisions.md); D-leftover → T1; D-ledger (+F2) → T2; D-reflect/D-review/D-residue → T3; D-log-lines → folded into T1–T3; D-conformance → T5; post-ship live check → recorded for the consolidated console (not a build artifact). #623 carry-forwards: provenance-vs-recordPayload (T1/T2/T3 all pass the reason via `provenance`), parenthetical deletion (T1), dead-governance rows made live (T1–T3 create the filing paths), `/review` row narrowing + `parked` Adds (T4).
- **AC mapping:** AC 1 → PR body carries Task 0's table; AC 2 → T5 Steps 2–3; AC 3 → T5 Step 4; AC 4/5 → T5's composition probes (deviation from the literal dry-run stated in the PR body); AC 5's structural check → the probe's needle assertions + marker sweep.
- **Anchors verified against the live post-#623 tree**: leftover-routing steps 1–4, ledger Phase 3's four bullets, step3-routing's Defer bullet (post-#622-fix text), full-mode's Defer bullet (post-#621), reflect SKILL.md's 4-line-header intro, residue-sweep's section end.
- **Placeholders:** none. The retired-wording sweep's needles checked against all replacement text (no incidental matches — replacements say "Compose the body via `specShapedBody`", never the retired phrase).
