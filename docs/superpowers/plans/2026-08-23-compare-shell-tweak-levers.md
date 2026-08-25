# Compare-Shell Tweak Levers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human nudge a single design token (hue, spacing scale, corner radius) in the compare-shell's live focus view without triggering a full reroll, by adding a fifth `tweak` event shape and a levers panel wired to it.

**Architecture:** Extend the existing four-shape event vocabulary (`_shared/visual-decision.md`) with a fifth `tweak` shape, reusing the exact JSONL/`serializeEvent`/`/events` machinery `pick`/`reroll`/`steer`/`exit` already use — no server-side change, since `bin/lib/visual-decide/server.js`'s `/events` handler is already type-agnostic (it appends any JSON object, unvalidated). Add a levers panel to `template.html`'s focus view, gated by the exact `MODE !== 'live'` disable pattern the verdict bar already uses. Extend `seed-compare.mjs`'s durable path to bake a chosen tweak set into the recorded `decision.html`, mirroring how `steerHistory`/`rerollCount` already round-trip into `data.outcome`.

**Tech Stack:** Plain Node.js (`node --test`, no external deps), vanilla browser JS (no framework — matches `template.html`'s existing style), Markdown contract docs.

**Spec:** `.claude-tweaks/pipelines/2026-08-23T192445-spec-1207/work/1207-spec.md`

## Global Constraints

- No external test framework — every test uses `node:test` + `node:assert/strict`, matching every existing file under `tests/`.
- No comments unless the WHY is non-obvious (CLAUDE.md) — the existing files already follow this; new code matches.
- `_shared/visual-decision.md` is a cited cross-skill contract — the event vocabulary must be restated in exactly one place (the contract file); `modes/explore.md` must keep citing it, never restating shapes (already pinned by `tests/visual-decision-contract-conformance.test.js`'s AC5 test, which loops over an `EVENT_SHAPES` array this plan extends).
- Every JSON event line carries a `ts: <epoch-ms>` field (existing convention for all four shapes) — the new `tweak` shape follows it too.

---

### Task 1: Extend the event vocabulary to five shapes (contract + serializer)

**Files:**
- Modify: `plugin/skills/_shared/visual-decision.md` (Event vocabulary section)
- Modify: `plugin/skills/design-wrapper/compare-shell/template.html:255-264` (`serializeEvent`)
- Modify: `tests/visual-decision-contract-conformance.test.js:11` (`EVENT_SHAPES`)

**Interfaces:**
- Produces: a `tweak` event shape `{"type":"tweak","token":"<name>","value":"<value>","ts":<epoch-ms>}`, and a `serializeEvent('tweak', { token, value })` branch returning `{ type: 'tweak', token, value, ts }` — Task 2's lever-panel handlers call this by name.

- [ ] **Step 1: Extend `EVENT_SHAPES` to include `tweak` (failing test), and update the two stale "four shapes" test names**

In `tests/visual-decision-contract-conformance.test.js`, change:

```js
const EVENT_SHAPES = ['pick', 'reroll', 'steer', 'exit'];
```

to:

```js
const EVENT_SHAPES = ['pick', 'reroll', 'steer', 'tweak', 'exit'];
```

Also update the two test descriptions that hardcode "four" as a cardinal count (a broader repo grep for `"four event"`/`"Exactly four"` during plan authoring found these — `tests/reflect-friction-lens-vocab.test.js`'s own "four event types" is a same-word coincidence for an unrelated hook-event vocabulary and needs no change):

```js
test('AC1: the contract file states each of the four event shapes exactly once', () => {
```

to:

```js
test('AC1: the contract file states each of the five event shapes exactly once', () => {
```

and:

```js
test('AC1: the template serializer constructs exactly the same four shapes, one branch each', () => {
```

to:

```js
test('AC1: the template serializer constructs exactly the same five shapes, one branch each', () => {
```

- [ ] **Step 2: Run the conformance suite to confirm it fails**

Run: `node --test tests/visual-decision-contract-conformance.test.js`
Expected: FAIL — the AC1 "contract states each shape exactly once" and "template serializer constructs the same shapes" tests both report a `"type":"tweak"` / `type: 'tweak'` count of 0.

- [ ] **Step 3: Add the `tweak` shape to the contract**

In `plugin/skills/_shared/visual-decision.md`, replace the Event vocabulary section:

```markdown
## Event vocabulary

Exactly four event shapes, each a single JSON object, one per line in `{state}/events` (JSONL —
matches compare-shell's `serializeEvent` serializer, `plugin/skills/design-wrapper/compare-shell/template.html`):

```
{"type":"pick","variant":"<id>","ts":<epoch-ms>}
{"type":"reroll","ts":<epoch-ms>}
{"type":"steer","text":"<free text>","ts":<epoch-ms>}
{"type":"exit","ts":<epoch-ms>}
```

No other `type` value is valid. A consumer that needs to recognize an event checks `type` against
exactly this set.
```

with:

```markdown
## Event vocabulary

Exactly five event shapes, each a single JSON object, one per line in `{state}/events` (JSONL —
matches compare-shell's `serializeEvent` serializer, `plugin/skills/design-wrapper/compare-shell/template.html`):

```
{"type":"pick","variant":"<id>","ts":<epoch-ms>}
{"type":"reroll","ts":<epoch-ms>}
{"type":"steer","text":"<free text>","ts":<epoch-ms>}
{"type":"tweak","token":"<name>","value":"<value>","ts":<epoch-ms>}
{"type":"exit","ts":<epoch-ms>}
```

No other `type` value is valid. A consumer that needs to recognize an event checks `type` against
exactly this set. `tweak` nudges a single design token in the live focus view — a hue, a spacing
scale, a corner radius — without triggering a full reroll; it never changes which variant is
selected, only how the currently-focused one renders.
```

- [ ] **Step 4: Add the `tweak` branch to `serializeEvent` in `template.html`**

In `plugin/skills/design-wrapper/compare-shell/template.html`, change:

```js
  function serializeEvent(kind, extra) {
    var ts = Date.now();
    switch (kind) {
      case 'pick': return { type: 'pick', variant: extra.variant, ts: ts };
      case 'reroll': return { type: 'reroll', ts: ts };
      case 'steer': return { type: 'steer', text: extra.text, ts: ts };
      case 'exit': return { type: 'exit', ts: ts };
      default: throw new Error('unknown event kind: ' + kind);
    }
  }
```

to:

```js
  function serializeEvent(kind, extra) {
    var ts = Date.now();
    switch (kind) {
      case 'pick': return { type: 'pick', variant: extra.variant, ts: ts };
      case 'reroll': return { type: 'reroll', ts: ts };
      case 'steer': return { type: 'steer', text: extra.text, ts: ts };
      case 'tweak': return { type: 'tweak', token: extra.token, value: extra.value, ts: ts };
      case 'exit': return { type: 'exit', ts: ts };
      default: throw new Error('unknown event kind: ' + kind);
    }
  }
```

- [ ] **Step 5: Run the conformance suite to confirm it passes**

Run: `node --test tests/visual-decision-contract-conformance.test.js`
Expected: PASS — all tests green, including the reversion-check test (unaffected by this change).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/_shared/visual-decision.md plugin/skills/design-wrapper/compare-shell/template.html tests/visual-decision-contract-conformance.test.js
git commit -m "Add tweak event shape to the compare-shell vocabulary"
```

---

### Task 2: Add the tweak-levers panel to the compare-shell focus view

**Files:**
- Modify: `plugin/skills/design-wrapper/compare-shell/template.html` (CSS, HTML, JS)
- Create: `tests/compare-shell-tweak-lever.test.js`

**Interfaces:**
- Consumes: `serializeEvent('tweak', { token, value })` and `postEvent(payload)` from Task 1 / the existing template (same functions, same signatures — no change to either).
- Produces: `applyTweak(token, value)` — sets a `--tweak-{token}` CSS custom property on `document.documentElement`. No other task consumes this by name; it is exercised only via the lever `input` handlers below.

- [ ] **Step 1: Write the failing structural tests**

Create `tests/compare-shell-tweak-lever.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = path.join(__dirname, '..', 'plugin', 'skills', 'design-wrapper', 'compare-shell', 'template.html');

function readTemplate() {
  return fs.readFileSync(TEMPLATE, 'utf8');
}

test('AC1 (#1207): the tweak panel declares hue/spacing-scale/corner-radius levers with data-token attributes', () => {
  const text = readTemplate();
  for (const token of ['hue', 'spacing-scale', 'corner-radius']) {
    assert.match(text, new RegExp(`data-token="${token}"`), `expected a lever with data-token="${token}"`);
  }
});

test('AC1 (#1207): the tweak panel lives inside #focus, so it renders only in the focus view', () => {
  const text = readTemplate();
  const focusMatch = text.match(/<div id="focus">([\s\S]*?)<\/div>\s*<div id="verdict-error"/);
  assert.ok(focusMatch, 'expected #focus to be the element immediately before #verdict-error');
  assert.match(focusMatch[1], /<div id="tweaks">/);
});

test('AC1 (#1207): tweak handlers attach only inside the MODE === \'live\' branch, alongside attachVerdictHandlers', () => {
  const text = readTemplate();
  assert.ok(
    text.includes("attachVerdictHandlers();\n    connectStream();\n    attachTweakHandlers();"),
    "expected attachTweakHandlers() wired directly after attachVerdictHandlers()/connectStream() inside the MODE === 'live' branch",
  );
});

test('AC1 (#1207): durable mode disables every tweak lever, matching the existing verdict-bar disable pattern', () => {
  const text = readTemplate();
  assert.ok(
    text.includes("steerInput.disabled = true;\n    tweakInputs.forEach(function (input) { input.disabled = true; });"),
    'expected the durable-mode branch to disable every tweak lever right after steerInput, matching the existing verdict-bar disable pattern',
  );
});

test('AC2 (#1207): a tweak lever applies a --tweak-{token} CSS custom property and posts a tweak event, without a full reroll', () => {
  const text = readTemplate();
  assert.match(text, /function applyTweak\(token, value\) \{/);
  assert.match(text, /document\.documentElement\.style\.setProperty\('--tweak-' \+ token, value\)/);
  assert.match(text, /applyTweak\(token, value\);\s*\n\s*postEvent\(serializeEvent\('tweak', \{ token: token, value: value \}\)\)/);
});
```

- [ ] **Step 2: Run the new test file to confirm it fails**

Run: `node --test tests/compare-shell-tweak-lever.test.js`
Expected: FAIL — no `#tweaks` panel, no `applyTweak`, no `attachTweakHandlers` exist yet.

- [ ] **Step 3: Add the panel CSS**

In `plugin/skills/design-wrapper/compare-shell/template.html`, immediately after the existing `#focus-indicator` rule:

```css
  #focus-indicator {
    padding: 6px 12px; font-size: 12px; color: var(--muted);
    border-top: 1px solid var(--border);
  }
```

add:

```css
  #tweaks {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    padding: 6px 12px; font-size: 12px; color: var(--muted);
    border-top: 1px solid var(--border);
  }
  #tweaks label { display: flex; align-items: center; gap: 4px; }
  #tweaks input[type="range"] { width: 96px; }
```

- [ ] **Step 4: Add the panel markup**

Change:

```html
  <div id="focus">
    <div id="focus-stage"></div>
    <div id="focus-indicator"></div>
  </div>
```

to:

```html
  <div id="focus">
    <div id="focus-stage"></div>
    <div id="focus-indicator"></div>
    <div id="tweaks">
      <label>Hue <input id="tweak-hue" type="range" min="0" max="360" step="1" value="0" data-token="hue"></label>
      <label>Spacing <input id="tweak-spacing" type="range" min="0.75" max="1.5" step="0.05" value="1" data-token="spacing-scale"></label>
      <label>Radius <input id="tweak-radius" type="range" min="0" max="24" step="1" value="8" data-token="corner-radius"></label>
    </div>
  </div>
```

- [ ] **Step 5: Add the JS — element lookup, `applyTweak`, `attachTweakHandlers`**

Change:

```js
  var steerInput = document.getElementById('steer-input');

  var gridSelectedId = null;
```

to:

```js
  var steerInput = document.getElementById('steer-input');
  var tweakInputs = Array.prototype.slice.call(document.querySelectorAll('#tweaks input[data-token]'));

  var gridSelectedId = null;
```

Then, immediately after the existing `attachVerdictHandlers` function's closing brace:

```js
  function attachVerdictHandlers() {
    // Only reachable when MODE === 'live' — durable pages never call this,
    // so no listener-attachment code path runs under the durable flag.
    btnPick.addEventListener('click', function () {
      var target = app.classList.contains('mode-focus') ? variants[focusIndex] : variants.filter(function (v) { return v.id === gridSelectedId; })[0];
      if (!target || target.degraded) return;
      postEvent(serializeEvent('pick', { variant: target.id }));
    });
    btnReroll.addEventListener('click', function () {
      postEvent(serializeEvent('reroll', {}));
    });
    btnSteer.addEventListener('click', function () {
      postEvent(serializeEvent('steer', { text: steerInput.value }));
    });
    btnExit.addEventListener('click', function () {
      postEvent(serializeEvent('exit', {}));
    });
  }
```

add:

```js
  function applyTweak(token, value) {
    document.documentElement.style.setProperty('--tweak-' + token, value);
  }

  function attachTweakHandlers() {
    // Only reachable when MODE === 'live' — mirrors attachVerdictHandlers'
    // own live-only gating above.
    tweakInputs.forEach(function (input) {
      input.addEventListener('input', function () {
        var token = input.dataset.token;
        var value = input.value;
        applyTweak(token, value);
        postEvent(serializeEvent('tweak', { token: token, value: value }));
      });
    });
  }
```

- [ ] **Step 6: Wire live-mode attach / durable-mode disable**

Change:

```js
  if (MODE === 'live') {
    attachVerdictHandlers();
    connectStream();
  } else {
    btnPick.disabled = true;
    btnReroll.disabled = true;
    btnSteer.disabled = true;
    btnExit.disabled = true;
    steerInput.disabled = true;
    if (DATA.outcome) {
```

to:

```js
  if (MODE === 'live') {
    attachVerdictHandlers();
    connectStream();
    attachTweakHandlers();
  } else {
    btnPick.disabled = true;
    btnReroll.disabled = true;
    btnSteer.disabled = true;
    btnExit.disabled = true;
    steerInput.disabled = true;
    tweakInputs.forEach(function (input) { input.disabled = true; });
    if (DATA.outcome) {
```

- [ ] **Step 7: Run the new test file to confirm it passes**

Run: `node --test tests/compare-shell-tweak-lever.test.js`
Expected: PASS.

- [ ] **Step 8: Run the Task 1 suite too, to confirm no regression**

Run: `node --test tests/visual-decision-contract-conformance.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/design-wrapper/compare-shell/template.html tests/compare-shell-tweak-lever.test.js
git commit -m "Add tweak-levers panel to the compare-shell focus view"
```

---

### Task 3: Bake a chosen tweak set into durable-mode `decision.html`

**Files:**
- Modify: `plugin/skills/design-wrapper/compare-shell/seed-compare.mjs`
- Modify: `plugin/skills/design-wrapper/compare-shell/template.html` (durable-mode `meta` dataset)
- Modify: `tests/compare-shell-seeder.test.js`

**Interfaces:**
- Consumes: nothing from Task 1/2 — this task's `manifest.tweaks` input is independent of the live-mode lever panel (a human/agent composing a durable manifest by hand, or a future caller that records the panel's final lever values into a manifest before durable-seeding — that wiring is out of this record's scope, matching the Gotchas' explicit "left undetermined" note re: the token set itself).
- Produces: `data.outcome.tweaks` in the seeded JSON island (an array of `{ token, value }`, defaulting to `[]`) — the durable-mode `meta.dataset.tweaks` in `template.html` reads this by name.

- [ ] **Step 1: Write the failing tests**

Append to `tests/compare-shell-seeder.test.js` (after the existing `AC6` test, before the closing of the file):

```js
test('AC1207-D3: durable mode bakes manifest.tweaks into outcome.tweaks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-shell-tweaks-'));
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(path.join(dir, 'a.html'), '<p>A</p>');
  fs.writeFileSync(manifestPath, JSON.stringify({
    scope: 'layout',
    seedKey: 'seed-tweaks-1',
    variants: [{ id: 'a', name: 'A', files: ['a.html'] }],
    outcome: { winner: 'a', date: '2026-08-21T00:00:00.000Z' },
    tweaks: [{ token: 'hue', value: '210' }, { token: 'corner-radius', value: '4' }],
  }));
  const out = mkOut('durable-tweaks.html');
  const res = seedCli(['--manifest', manifestPath, '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const html = fs.readFileSync(out, 'utf8');
  const data = loadIsland(html);
  assert.deepEqual(data.outcome.tweaks, [{ token: 'hue', value: '210' }, { token: 'corner-radius', value: '4' }]);
  assert.match(html, /dataset\.tweaks = JSON\.stringify\(DATA\.outcome\.tweaks \|\| \[\]\)/);
});

test('AC1207-D3: durable mode with no manifest.tweaks defaults outcome.tweaks to []', () => {
  const out = mkOut('durable-no-tweaks.html');
  const res = seedCli(['--manifest', path.join(FIXTURES, 'layout', 'manifest.json'), '--mode', 'durable', '--out', out]);
  assert.equal(res.code, 0, res.err);
  const data = loadIsland(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(data.outcome.tweaks, []);
});

test('AC1207-D3: a non-array manifest.tweaks is a refusal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-shell-bad-tweaks-'));
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(path.join(dir, 'a.html'), '<p>A</p>');
  fs.writeFileSync(manifestPath, JSON.stringify({
    scope: 'layout',
    seedKey: 'seed-bad-tweaks',
    variants: [{ id: 'a', name: 'A', files: ['a.html'] }],
    outcome: { winner: 'a', date: '2026-08-21T00:00:00.000Z' },
    tweaks: { token: 'hue', value: '210' },
  }));
  const res = seedCli(['--manifest', manifestPath, '--mode', 'durable', '--out', mkOut('x.html')]);
  assert.notEqual(res.code, 0);
  assert.match(res.err, /manifest\.tweaks must be an array/);
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `node --test tests/compare-shell-seeder.test.js`
Expected: FAIL on all three new tests — `outcome.tweaks` is `undefined`, and the non-array manifest is accepted rather than refused.

- [ ] **Step 3: Implement `validateManifest`'s tweaks check**

In `plugin/skills/design-wrapper/compare-shell/seed-compare.mjs`, change:

```js
  if (mode === 'durable') {
    if (!manifest.outcome) {
      throw new SeedError('durable mode requires manifest.outcome');
    }
    if (!seen.has(manifest.outcome.winner)) {
      throw new SeedError(`outcome.winner "${manifest.outcome.winner}" not found among variants[].id`);
    }
  }
}
```

to:

```js
  if (manifest.tweaks !== undefined && !Array.isArray(manifest.tweaks)) {
    throw new SeedError('manifest.tweaks must be an array of { token, value } entries');
  }

  if (mode === 'durable') {
    if (!manifest.outcome) {
      throw new SeedError('durable mode requires manifest.outcome');
    }
    if (!seen.has(manifest.outcome.winner)) {
      throw new SeedError(`outcome.winner "${manifest.outcome.winner}" not found among variants[].id`);
    }
  }
}
```

- [ ] **Step 4: Bake `tweaks` into `data.outcome` in `seed()`**

Change:

```js
  if (mode === 'durable') {
    data.outcome = {
      winner: manifest.outcome.winner,
      date: manifest.outcome.date || new Date(0).toISOString(),
      seedKey: manifest.seedKey,
      rerollCount: manifest.rerollCount || 0,
      steerHistory: manifest.steerHistory || [],
    };
  }
```

to:

```js
  if (mode === 'durable') {
    data.outcome = {
      winner: manifest.outcome.winner,
      date: manifest.outcome.date || new Date(0).toISOString(),
      seedKey: manifest.seedKey,
      rerollCount: manifest.rerollCount || 0,
      steerHistory: manifest.steerHistory || [],
      tweaks: manifest.tweaks || [],
    };
  }
```

- [ ] **Step 5: Document the new manifest field**

In `plugin/skills/design-wrapper/compare-shell/seed-compare.mjs`'s header comment, change:

```js
//     variants: [{ id, name, files: [path...], degraded?, reason? }],
//     outcome?: { winner, date }        // required in durable mode
//   }
```

to:

```js
//     variants: [{ id, name, files: [path...], degraded?, reason? }],
//     outcome?: { winner, date }        // required in durable mode
//     tweaks?: [{ token, value }]       // durable mode only — baked into
//                                       // outcome.tweaks; see
//                                       // plugin/skills/_shared/visual-decision.md's
//                                       // tweak event
//   }
```

- [ ] **Step 6: Expose `outcome.tweaks` in `template.html`'s durable-mode `meta` dataset**

Change:

```js
      meta.dataset.rerollCount = String(DATA.outcome.rerollCount || 0);
      meta.dataset.steerHistory = JSON.stringify(DATA.outcome.steerHistory || []);
      meta.dataset.date = DATA.outcome.date || '';
```

to:

```js
      meta.dataset.rerollCount = String(DATA.outcome.rerollCount || 0);
      meta.dataset.steerHistory = JSON.stringify(DATA.outcome.steerHistory || []);
      meta.dataset.tweaks = JSON.stringify(DATA.outcome.tweaks || []);
      meta.dataset.date = DATA.outcome.date || '';
```

- [ ] **Step 7: Run the new tests to confirm they pass**

Run: `node --test tests/compare-shell-seeder.test.js`
Expected: PASS — all tests in the file, including the pre-existing ones (the new `tweaks` field is additive and defaults to `[]`, so no prior assertion changes shape).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — this is Acceptance Criterion 3 in full (every test file, not just the three touched by this plan).

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/design-wrapper/compare-shell/seed-compare.mjs plugin/skills/design-wrapper/compare-shell/template.html tests/compare-shell-seeder.test.js
git commit -m "Bake a chosen tweak set into durable compare-shell decision.html"
```
