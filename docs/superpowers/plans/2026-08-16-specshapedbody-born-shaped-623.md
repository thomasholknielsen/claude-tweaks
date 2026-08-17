# specShapedBody Provenance/Footer/openQuestion + Born-Shaped Matrix Rows (#623) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `specShapedBody` (`bin/lib/issues/record.js`) with three optional, default-preserving parameters — `provenance: {origin?, deferReason?}`, `footer` (string | null), and `openQuestion` (renders `## Open Question` in place of Acceptance Criteria) — and write the governance text that lets exhaust producers file spec-shaped, scored, born-`ready` records: a rewritten `/wrap-up` row plus new `/reflect` and `/review` rows in `_shared/work-record.md`, a rewritten preamble sentence, a Born-ready paragraph naming the `side-effect:*` classes, and an `_shared/autonomy-ceiling.md` note that auto-filed exhaust is born-shaped by construction.

**Architecture:** Additive parameters with defaults equal to today's behavior — the four health-suite payload builders are the regression oracle (`tests/health-filing-parity.test.js` unchanged and green; a no-new-args call is byte-identical). One necessary relaxation: `header` becomes omissible (`''`/absent renders nothing) because the `openQuestion` variant's canonical call passes `header: ''` — no existing test pins the old throw-on-empty-header. Provenance lines render between `header` and `## Current State` so `provenance.js`'s line-anchored `Origin:` parse and refine-mode Step 3.5's structural check keep working. Matrix conditions go inside the cells (the file's own convention).

**Tech Stack:** Node 18+ (`node:test`), Markdown contracts.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-623/work/623-spec.md`

## Global Constraints

- **Post-#580/#575 tree:** the branch just merged origin/main. `_shared/autonomy-ceiling.md`'s trusted row now carries four items (a)–(d) with (d) = #580's `housekeeping-auto-merge`; `_shared/work-record.md`'s `/capture` row and Born-ready rule carry #575's chain-into-`/specify --chained` text. Anchors below are copied from the MERGED tree — verify each before editing; a mismatch is NEEDS_CONTEXT, not improvisation.
- Health builders pass none of the three new params and must produce byte-identical output; the default footer sentence stays byte-identical (`tests/health-filing-parity.test.js` pins it verbatim).
- The composer must never emit any of the three placeholder markers (`TBD`, `TODO`, `<!-- ambiguity:`) in any line it renders.
- Exhaust producers' footer form (contract text, not code): `_Filed by \`{producer}\` via specShapedBody._` — the machine-visible provenance marker the matrix rows key on.
- Exactly one of `acceptanceCriteria`/`openQuestion` — both, or neither, throws.
- `work-record.md` is ~30.9 KB — rows and one paragraph, tight; cite `_shared/deferral-gate.md`, never restate the vocabulary or the spec-shaped check. One `/wrap-up` row, not two.
- Do NOT implement #117 (verified-against commit line) — leave the header extension point open.
- Commit messages: imperative, `refs #623`, never `closes`; `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk` trailer on every commit. No version bump.
- Work from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-620-621-622-623-624-625`; verify `pwd`/`git rev-parse --show-toplevel` before commits; stage specific files only; policy hook may refuse compound Bash — run singly.
- Full `npm test` only in Task 4.

---

### Task 1: `specShapedBody` — provenance, footer, openQuestion (TDD)

**Files:**
- Modify: `bin/lib/issues/record.js` (the `specShapedBody` function, ~line 416)
- Test: `tests/bin-lib/issues/record.test.js`

**Interfaces:**
- Consumes: `DEFER_REASONS`, `oneOf` (both already in `record.js`).
- Produces: `specShapedBody({ header?, currentState, deliverables, acceptanceCriteria?, openQuestion?, filedBy, provenance?: {origin?, deferReason?}, footer?: string | null })`. Body layout: `[{header}\n\n][Origin: {origin}\n\n][Defer-reason: {deferReason}\n\n]## Current State\n\n{...}\n\n## Deliverables\n\n{...}\n\n(## Acceptance Criteria | ## Open Question)\n\n{...}[\n\n{footer}]` — each present element followed by one blank line; omitted elements leave no blank.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/issues/record.test.js`:

```js
// --- specShapedBody provenance / footer / openQuestion (#623) ---

const BASE = { currentState: 'c', deliverables: 'd', filedBy: 'x' };

test('specShapedBody: no new args is byte-identical to the pre-change composition (health parity)', () => {
  const body = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a' });
  assert.strictEqual(body, [
    'H', '## Current State', 'c', '## Deliverables', 'd', '## Acceptance Criteria', 'a',
    '_Filed by `x`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n\n'));
});

test('specShapedBody: provenance origin renders between header and Current State', () => {
  const body = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', provenance: { origin: 'wrap-up leftover from #42' } });
  assert.ok(body.startsWith('H\n\nOrigin: wrap-up leftover from #42\n\n## Current State'));
});

test('specShapedBody: provenance deferReason renders after origin, validated against DEFER_REASONS', () => {
  const body = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', provenance: { origin: 'o', deferReason: 'tangential' } });
  assert.ok(body.includes('Origin: o\n\nDefer-reason: tangential\n\n## Current State'));
  assert.throws(
    () => specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', provenance: { deferReason: 'minor' } }),
    /deferReason/,
  );
});

test('specShapedBody: deferReason alone renders with no Origin line and no stray blanks', () => {
  const body = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', provenance: { deferReason: 'genuinely-larger' } });
  assert.ok(body.startsWith('H\n\nDefer-reason: genuinely-larger\n\n## Current State'));
  assert.ok(!body.includes('Origin:'));
});

test('specShapedBody: custom footer replaces the default; null omits it entirely', () => {
  const custom = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', footer: '_Filed by `wrap-up leftover routing` via specShapedBody._' });
  assert.ok(custom.endsWith('via specShapedBody._'));
  assert.ok(!custom.includes('wontfix'));
  const none = specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', footer: null });
  assert.ok(none.endsWith('\n\na'));
});

test('specShapedBody: openQuestion renders in place of Acceptance Criteria; empty header renders nothing', () => {
  const body = specShapedBody({ header: '', ...BASE, openQuestion: 'which store?', footer: null });
  assert.ok(body.startsWith('## Current State'));
  assert.ok(body.includes('## Open Question\n\nwhich store?'));
  assert.ok(!body.includes('## Acceptance Criteria'));
});

test('specShapedBody: acceptanceCriteria and openQuestion are mutually exclusive — both or neither throws', () => {
  assert.throws(() => specShapedBody({ header: 'H', ...BASE, acceptanceCriteria: 'a', openQuestion: 'q' }), /exactly one/);
  assert.throws(() => specShapedBody({ header: 'H', ...BASE }), /exactly one/);
});

test('specShapedBody: the required sections still throw when empty, naming the section', () => {
  assert.throws(() => specShapedBody({ header: 'H', currentState: '', deliverables: 'd', acceptanceCriteria: 'a', filedBy: 'x' }), /currentState/);
  assert.throws(() => specShapedBody({ header: 'H', currentState: 'c', deliverables: 'd', acceptanceCriteria: 'a' }), /filedBy/);
  assert.throws(() => specShapedBody({ header: 'H', currentState: 'c', deliverables: 'd', openQuestion: '' , filedBy: 'x'}), /exactly one|openQuestion/);
});

test('specShapedBody: header plus Trigger line renders first, before provenance', () => {
  const body = specShapedBody({ header: 'Trigger: after #42 lands', ...BASE, acceptanceCriteria: 'a', provenance: { origin: 'wrap-up leftover from #42', deferReason: 'tangential' }, footer: '_Filed by `wrap-up leftover routing` via specShapedBody._' });
  assert.ok(body.startsWith('Trigger: after #42 lands\n\nOrigin: wrap-up leftover from #42\n\nDefer-reason: tangential\n\n## Current State'));
});
```

- [ ] **Step 2: Run to verify they fail** — `node --test tests/bin-lib/issues/record.test.js 2>&1 | grep -E "^# (pass|fail)"` → `# fail` ≥ 7 (new params ignored; empty header currently throws).

- [ ] **Step 3: Implement** — replace the whole `specShapedBody` function with:

```js
// { header?, currentState, deliverables, acceptanceCriteria?, openQuestion?, filedBy,
//   provenance?: { origin?, deferReason? }, footer?: string | null } -> body string.
// Additive over the original shape: a call passing none of provenance/footer/openQuestion
// (and a non-empty header) composes byte-identical output — the four health-suite
// builders are the regression oracle (tests/health-filing-parity.test.js). Exactly one
// of acceptanceCriteria/openQuestion must be supplied: openQuestion is the composer's
// needs:definition variant, rendering `## Open Question` in place of Acceptance
// Criteria so a needs-you record never carries placeholder AC. Provenance lines
// (Origin:, then Defer-reason: — validated against DEFER_REASONS) render between
// header and `## Current State`, where provenance.js's line-anchored Origin: parse
// reads them. footer: a string replaces the default health-suite sentence, null omits
// it; exhaust producers pass `_Filed by \`{producer}\` via specShapedBody._` — the
// machine-visible marker _shared/work-record.md's born-shaped matrix rows key on.
// header is the slot for producer-specific leading lines (e.g. `Trigger: {condition}`)
// and may be empty/omitted — the one relaxation from the original, needed because the
// openQuestion variant's canonical call carries no header.
function specShapedBody({ header, currentState, deliverables, acceptanceCriteria, openQuestion, filedBy, provenance, footer } = {}) {
  const isEmpty = (value) => value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
  const hasAC = !isEmpty(acceptanceCriteria);
  const hasOQ = !isEmpty(openQuestion);
  if (hasAC === hasOQ) {
    throw new Error('specShapedBody: exactly one of acceptanceCriteria/openQuestion is required');
  }
  const sections = [
    ['currentState', currentState],
    ['deliverables', deliverables],
    ['filedBy', filedBy],
  ];
  for (const [name, value] of sections) {
    if (isEmpty(value)) {
      throw new Error(`specShapedBody: ${name} is required and must be non-empty`);
    }
  }
  const { origin, deferReason } = provenance || {};
  if (deferReason !== undefined) oneOf('deferReason', deferReason, DEFER_REASONS);
  const block = (v) => (Array.isArray(v) ? v.join('\n\n') : v);
  const parts = [];
  if (!isEmpty(header)) parts.push(header);
  if (!isEmpty(origin)) parts.push(`Origin: ${origin}`);
  if (deferReason !== undefined) parts.push(`Defer-reason: ${deferReason}`);
  parts.push('## Current State', block(currentState), '## Deliverables', block(deliverables));
  if (hasOQ) parts.push('## Open Question', block(openQuestion));
  else parts.push('## Acceptance Criteria', block(acceptanceCriteria));
  if (footer === undefined) {
    parts.push(`_Filed by \`${filedBy}\`. Close to resolve; label \`wontfix\` to suppress future reports of this finding._`);
  } else if (footer !== null && !isEmpty(footer)) {
    parts.push(footer);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run to verify green + parity + AC 1 probe**

`node --test tests/bin-lib/issues/record.test.js tests/health-filing-parity.test.js 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`.

Then the spec's AC 1 probe verbatim:
```bash
node -e "const {specShapedBody}=require('./bin/lib/issues/record.js'); const a=specShapedBody({header:'H',currentState:'c',deliverables:'d',acceptanceCriteria:'a',filedBy:'x'}); const b=specShapedBody({header:'Trigger: after #42 lands',currentState:'c',deliverables:'d',acceptanceCriteria:'a',filedBy:'x',provenance:{origin:'wrap-up leftover from #42',deferReason:'tangential'},footer:'_Filed by \`wrap-up leftover routing\` via specShapedBody._'}); const c=specShapedBody({header:'',currentState:'c',deliverables:'d',openQuestion:'which store?',filedBy:'x',footer:null}); console.log(a.includes('wontfix'), b.startsWith('Trigger: after #42 lands'), b.includes('Origin: wrap-up leftover from #42'), b.includes('Defer-reason: tangential'), b.includes('via specShapedBody'), c.includes('## Open Question'), c.includes('## Acceptance Criteria'))"
```
Expected: `true true true true true true false`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/record.js tests/bin-lib/issues/record.test.js
git commit -m "Extend specShapedBody with provenance, footer, and openQuestion parameters — additive with byte-identical defaults, Origin/Defer-reason between header and Current State, Open Question as the needs:definition variant, refs #623

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 2: `_shared/work-record.md` — matrix rows, preamble, Born-ready paragraph

**Files:**
- Modify: `skills/_shared/work-record.md` (preamble ~lines 124-131, `/wrap-up` row ~line 145, new `/reflect`+`/review` rows, Born-ready rule ~lines 254-271)

- [ ] **Step 1: Rewrite the preamble sentence.** Replace:

```markdown
**Every row is exhaustive for its actor.** There is no general "agent path" row that widens the
specific ones — the `autonomy` ceiling's born-`ready` tier is documented on `/capture`'s row
directly — as the `/claude-tweaks:specify --chained` chain its Never column describes,
`/capture` being the only actor it currently covers. Extending it to another residue
producer (`/wrap-up` leftovers, `/reflect` routing, `/demo` follow-ups — the `side-effect:*`
classes) means editing that actor's own row, deliberately, and until then their `Never` columns
hold as written whatever the ceiling says.
```

with:

```markdown
**Every row is exhaustive for its actor.** There is no general "agent path" row that widens the
specific ones — each actor's born-`ready` conditions are documented on its own row directly:
`/capture`'s (the `/claude-tweaks:specify --chained` chain its Never column describes) and, since
#623, the `side-effect:*` residue producers' — `/wrap-up` (leftover, ledger, and residue-sweep
routing), `/reflect`, and `/review` — whose rows below state the `specShapedBody` composition
their `ready` is conditional on. Extending born-`ready` to any further actor (`/demo` follow-ups)
still means editing that actor's own row, deliberately, and until then its `Never` column holds
as written whatever the ceiling says.
```

- [ ] **Step 2: Rewrite the `/wrap-up` row.** Replace:

```markdown
| **`/wrap-up`** | `demo:pending`, `bot:blocked` (the same `_shared/pr-first-merge.md` Step 2.5 red path, reached through `wrap-up/review-console.md`'s fast-lane merge — same no-`auto:*`-revocation rule as the Executors row) | `bot:in-progress` (claim release) | `auto:*`, `ready`, `demo:approved`, `demo:changes-requested` |
```

with:

```markdown
| **`/wrap-up`** (all filing paths: leftover routing, ledger Phase 2/3 routing, residue-sweep records) | `demo:pending`; `bot:blocked` (the same `_shared/pr-first-merge.md` Step 2.5 red path, reached through `wrap-up/review-console.md`'s fast-lane merge — same no-`auto:*`-revocation rule as the Executors row); `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer; a `Trigger:` leftover carries `parked` instead of `ready`); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant) | `bot:in-progress` (claim release) | `auto:*`, `bot:*` (other than the release), `priority:*`, `demo:approved`, `demo:changes-requested`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
```

- [ ] **Step 3: Add the two new rows** immediately after the `/wrap-up` row:

```markdown
| **`/reflect`** (tangential routing, Defer) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
| **`/review`** (Step 3 Defer/Capture) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
```

- [ ] **Step 4: Born-ready paragraph.** In `## Born-ready rule`, replace the closing sentence block:

```markdown
`/specify`'s own authority, never `/capture`'s. `/capture` is the only actor this covers; every
other agent path keeps the `Never` column its own matrix row states. See
`_shared/autonomy-ceiling.md`. At `supervised`, the default, a human-invoked `/specify` remains
the only road to `ready` for a captured record.
```

with:

```markdown
`/specify`'s own authority, never `/capture`'s. See `_shared/autonomy-ceiling.md`. At
`supervised`, the default, a human-invoked `/specify` remains the only road to `ready` for a
captured record.

Records composed via `specShapedBody` by `/wrap-up`, `/reflect`, or `/review` — the
`side-effect:*` trust classes — are born-ready **by construction**, exactly as health-skill
records are: the composer emits the three sections with a `Defer-reason:` and a
`via specShapedBody` footer, and the producer scores per the Scoring axis. A producer that
cannot honestly write Acceptance Criteria uses the composer's `openQuestion` variant and files
`needs:definition` with no `ready` and no scoring — the two landing states, stated once here.
The `via specShapedBody` footer is prose-governed provenance, not a cryptographic proof — the
project's model is agent-read skills plus conformance tests plus `refine-mode.md` Step 3.5's
structural gate.
```

- [ ] **Step 5: Verify**

```bash
grep -c "is the only actor this covers" skills/_shared/work-record.md
grep -c "^| \*\*\`/wrap-up\`\*\*" skills/_shared/work-record.md
grep -n "^| \*\*\`/reflect\`\*\*\|^| \*\*\`/review\`\*\*" skills/_shared/work-record.md
grep -c "side-effect" skills/_shared/work-record.md
```
Expected: `0`; `1`; both new rows listed; ≥ 2.

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/work-record.md
git commit -m "Write the born-shaped permission-matrix rows — one exhaustive /wrap-up row plus /reflect and /review, preamble names them, Born-ready rule covers the side-effect classes by construction, refs #623

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 3: `_shared/autonomy-ceiling.md` — `queueWriteAutoFile` born-shaped note

**Files:**
- Modify: `skills/_shared/autonomy-ceiling.md` (the `queueWriteAutoFile` capability row, ~line 103)

- [ ] **Step 1: Replace the row:**

```markdown
| `queueWriteAutoFile` | `trusted`+ | `wrap-up/review-console.md` creates a proposed record (from the above, from leftover routing, or from `/reflect`'s tangential-idea routing) directly, instead of waiting for a live per-item approval at the Review Console. |
```

with:

```markdown
| `queueWriteAutoFile` | `trusted`+ | `wrap-up/review-console.md` creates a proposed record (from the above, from leftover routing, or from `/reflect`'s tangential-idea routing) directly, instead of waiting for a live per-item approval at the Review Console. Since #623, an auto-filed exhaust proposal is spec-shaped and born-ready **by construction** (`specShapedBody` composition, `_shared/work-record.md`'s born-shaped rows), so `refine-mode.md` Step 3.5's spec-shape gate never flags it back — prevented by construction rather than by chaining `/specify`. |
```

- [ ] **Step 2: Verify** — `grep -c "specShapedBody" skills/_shared/autonomy-ceiling.md` → ≥ 1 (in the `queueWriteAutoFile` row).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/autonomy-ceiling.md
git commit -m "Note in autonomy-ceiling that queueWriteAutoFile's exhaust proposals are born-shaped by construction — the #575 flag-back failure mode prevented structurally, refs #623

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 4: Conformance extensions + full suite

**Files:**
- Modify: `tests/deferral-gate-conformance.test.js` (append a `#623` section)

- [ ] **Step 1: Append:**

```js
// --- #623: born-shaped matrix rows + composer provenance ---

test('work-record.md carries the born-shaped rows for /wrap-up, /reflect, /review', () => {
  const wr = read('skills/_shared/work-record.md');
  for (const actor of ['/wrap-up', '/reflect', '/review']) {
    const row = wr.split('\n').find((l) => l.startsWith(`| **\`${actor}\`**`));
    assert.ok(row, `${actor} row`);
    assert.ok(row.includes('ready'), `${actor} Adds ready`);
    assert.ok(row.includes('specShapedBody'), `${actor} conditions on specShapedBody`);
  }
  assert.ok(!wr.includes('is the only actor this covers'));
  const bornReady = wr.slice(wr.indexOf('## Born-ready rule'));
  assert.ok(bornReady.includes('side-effect'));
});

test('autonomy-ceiling.md notes queueWriteAutoFile proposals are born-shaped via specShapedBody', () => {
  const ac = read('skills/_shared/autonomy-ceiling.md');
  const row = ac.split('\n').find((l) => l.includes('`queueWriteAutoFile`') && l.startsWith('|'));
  assert.ok(row && row.includes('specShapedBody'));
});
```

- [ ] **Step 2: Run** — `node --test tests/deferral-gate-conformance.test.js` → `# fail 0`.

- [ ] **Step 3: Spec AC 3 greps**

```bash
grep -c "is the only actor this covers" skills/_shared/work-record.md
grep -n "^| \*\*\`/reflect\`\*\*\|^| \*\*\`/review\`\*\*" skills/_shared/work-record.md
grep -c "^| \*\*\`/wrap-up\`\*\*" skills/_shared/work-record.md
```
Expected: `0`; two rows; `1`.

- [ ] **Step 4: Full suite** — `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/623-npm-test.log 2>&1` then grep `^# (tests|pass|fail)` → `# fail 0` (isolate any failure before concluding; the post-merge baseline at 246517c7 is the comparison point).

- [ ] **Step 5: Commit**

```bash
git add tests/deferral-gate-conformance.test.js
git commit -m "Pin #623's born-shaped rows and ceiling note in the conformance suite, refs #623

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

## Self-review

- **Spec coverage:** D1 (three params, all defaults intact, exhaust footer form) → T1; D2 (test variants + parity) → T1 Steps 1+4; D3 (matrix rows, conditions in cells, preamble) → T2; D4 (ceiling note) → T3; D5 (conformance) → T4. AC 1 → T1 Step 4 (verbatim probe); AC 2 → T1 Step 4; AC 3 → T2 Step 5 + T4 Step 3; AC 4 → T4 Step 4.
- **Header relaxation is deliberate and named** (architecture note) — no existing test pins throw-on-empty-header (verified: `tests/bin-lib/issues/record.test.js:523-526` tests currentState/filedBy only).
- **Anchors verified against the merged (post-#580/#575) tree at plan time:** the preamble block, the `/wrap-up` row, the Born-ready closing block, and the `queueWriteAutoFile` row are copied verbatim from the current files.
- **Non-goals held:** health builders' output byte-identical (T1's parity test + health-filing-parity.test.js); no `ceremony:*` on exhaust records (rows never mention it); #117 not implemented; no runtime matrix validator.
- **Placeholders:** none. **Type consistency:** the exact footer string `via specShapedBody` identical across T1's test, T2's rows, T3's note, and T4's pins.
