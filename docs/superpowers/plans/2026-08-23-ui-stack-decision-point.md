# UI-Stack Decision Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Ui-stack:` body-metadata line (paired with a project-level `ui-stack` policy default) so a frontend record surfaces — or auto-resolves from policy — a UI component-library/styling-approach decision before `/claude-tweaks:build` scaffolds new frontend code, mirroring the existing `Design-intent:` mechanism exactly.

**Architecture:** `Ui-stack:` is a body-metadata line, sibling to `Surface:`/`Design-intent:`, written by a new `/claude-tweaks:specify` pre-step (Step 2.5c2, immediately after Step 2.5c's Design-intent question) and lifted verbatim into the materialized build-time header by `bin/lib/issues/materialize-format.js`. A new `ui-stack` policy key (type `string`, no default — mirrors `integration-branch`) lets a project set this once; Step 2.5c2 reads it via `resolve-policy.js` and applies it automatically, falling back to an inline `AskUserQuestion` (KEPT-PROMPT) only when neither the policy nor a prior answer exists. `/claude-tweaks:build`'s Design Pre-Build step (Common Step 1.7) forwards the resolved value into the implementer subagent's prompt as an explicit UI-stack mandate.

**Tech Stack:** Node.js (`node --test`), Markdown skill files (no new files — every change extends an existing module/skill file).

**Spec:** GitHub issue #357 (materialized at `.claude-tweaks/pipelines/2026-08-23T181549-record-357/work/357-spec.md`)

## Global Constraints

- `Ui-stack:` is omitted entirely for backend/infra/terminal records — same omission rule `Design-intent:` already follows (`spec-template.md`).
- No new universal default may be picked on the record's behalf — an explicit `"none — no preference, defer to reference codebase"` answer is a first-class, deliberate choice, never silently assumed.
- The `ui-stack` policy key carries **no schema default** (mirrors `integration-branch`) — unset must resolve to `null`/empty, not a false-comfort literal, so Step 2.5c2's KEPT-PROMPT branch is genuinely reachable.
- Follow the exact auto/KEPT-PROMPT precedence Step 2.5c already uses for `design-intent` — never invent a new resolution mechanism.
- Existing specs/records with no `Ui-stack:` line must keep materializing and building unchanged (field absence is a valid, non-error state).
- `tests/policy-schema.test.js`'s pinned `POLICY_KEYS.length` count must be updated in the same commit that adds the key, or that test goes red.

---

### Task 1: Register the `ui-stack` policy key

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:84` (insert new `POLICY_KEYS` row immediately after the `design-intent` row)
- Modify: `plugin/skills/_shared/policy-schema.md` (insert a new row into the `## Auto-mode levers` table, immediately after the `design-intent` row currently at line 181)
- Modify: `tests/policy-schema.test.js:89-90` (bump the pinned `POLICY_KEYS.length` assertions from 59 to 60)
- Test: `tests/policy-schema-metadata.test.js` (existing generic tests — no new test needed, they iterate `POLICY_KEYS` automatically)
- Test: `tests/policy-schema.test.js` (existing generic tests — add one targeted assertion, see Step 1 below)

**Interfaces:**
- Consumes: nothing new — `POLICY_KEYS` array shape is unchanged (`{ key, type, values?, default?, summary, category, tier }`).
- Produces: a `ui-stack` entry in `POLICY_KEYS`, resolvable via `node plugin/bin/resolve-policy.js --values ui-stack` (empty output when unset — no schema default) and `node plugin/bin/resolve-policy.js ui-stack` (`{"ui-stack":{"value":null,"source":"default"}}` when unset). Read by Task 6 (Step 2.5c2).

- [x] **Step 1: Write the failing test**

Add to `tests/policy-schema.test.js`, immediately after the existing `integration-branch` test (the block starting at line 115):

```js
test('ui-stack is registered with no static default (mirrors integration-branch)', () => {
  const uiStack = POLICY_KEYS.find((k) => k.key === 'ui-stack');
  assert.ok(uiStack, 'ui-stack missing from POLICY_KEYS');
  assert.equal(uiStack.type, 'string');
  assert.equal('default' in uiStack, false, 'ui-stack must carry no static default — KEPT-PROMPT depends on unset resolving to null');
});
```

Also bump the two pinned-count assertions at `tests/policy-schema.test.js:89-90`:

```js
  assert.strictEqual(POLICY_KEYS.length, 60);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 60);
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `ui-stack missing from POLICY_KEYS` and the two count assertions (`59` vs `60` actual/expected reversed — array is still length 59).

- [x] **Step 3: Add the POLICY_KEYS row**

In `plugin/bin/lib/policy-schema.js`, insert immediately after the `design-intent` row (currently line 84):

```js
  { key: 'ui-stack', type: 'string', summary: "Names the UI component library / styling approach a frontend build should use (e.g. \"shadcn/ui + Tailwind\", or an explicit no-preference answer).", category: 'pipeline-behavior', tier: 'advanced' },
```

No `default` field, no `values` field (free-form string) — matches `integration-branch`'s shape.

- [x] **Step 4: Add the policy-schema.md row**

In `plugin/skills/_shared/policy-schema.md`, in the `## Auto-mode levers` table, insert immediately after the `design-intent` row (currently line 181):

```
| `ui-stack` | `policy.yml` (via `/claude-tweaks:specify` Step 2.5c2; a standalone invocation with no policy value asks the user inline instead) | `/claude-tweaks:specify` → `/claude-tweaks:build`/`design-wrapper` | unset (no schema default) | Free-form string — the component library/styling approach a frontend build should use (e.g. `shadcn/ui + Tailwind`), or an explicit no-preference answer. Never a fixed enum: unlike `design-intent`, there is no closed set of UI stacks to enumerate |
```

(The no-duplication test forbids reusing the `summary` string verbatim here — the Meaning cell above is intentionally worded differently from Task 1's `summary` field.)

- [x] **Step 5: Run tests to verify they pass**

Run: `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add plugin/bin/lib/policy-schema.js plugin/skills/_shared/policy-schema.md tests/policy-schema.test.js
git commit -m "Register ui-stack policy key"
```

---

### Task 2: Lift and compose `Ui-stack:` in materialize-format.js

**Files:**
- Modify: `plugin/bin/lib/issues/materialize-format.js` (`liftMetadata`, `composeHeader`)
- Test: `tests/bin-lib/issues/materialize-format.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `liftMetadata(body)` now includes `uiStack` in its return object when a `Ui-stack:` line is present in the body's leading metadata block. `composeHeader({ ..., uiStack })` now emits a `ui-stack: {value}` line (positioned immediately after `design-intent:`, before `design-seed:`) when `uiStack` is truthy. Both consumed by Task 3.

- [x] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/materialize-format.test.js`, immediately after the existing `liftMetadata: reads Surface/Design-intent/Design-seed...` test (line 70-73):

```js
test('liftMetadata: reads Ui-stack alongside Surface/Design-intent/Design-seed', () => {
  const body = 'Surface: web\nDesign-intent: quiet\nUi-stack: shadcn/ui + Tailwind\nDesign-seed: abc123\n\n## Current State\nx';
  assert.deepEqual(liftMetadata(body), {
    surface: 'web', designIntent: 'quiet', uiStack: 'shadcn/ui + Tailwind', designSeed: 'abc123',
  });
});

test('liftMetadata: Ui-stack omitted when the line is absent', () => {
  const lifted = liftMetadata('Surface: web\nDesign-intent: none\n\n## Current State\nx');
  assert.equal('uiStack' in lifted, false);
});
```

Update the existing `composeHeader: risk/size/fingerprint/blocked-by/surface/design-intent/design-seed/parked-at-shaping omitted when absent` test (line 97-103) to also cover `ui-stack:`:

```js
test('composeHeader: risk/size/fingerprint/blocked-by/surface/design-intent/ui-stack/design-seed/parked-at-shaping omitted when absent', () => {
  const header = composeHeader({ record: 5, origin: 'human', ceremony: 'standard', grants: { build: true, merge: false } });
  for (const key of ['risk:', 'size:', 'fingerprint:', 'blocked-by:', 'surface:', 'design-intent:', 'ui-stack:', 'design-seed:', 'parked-at-shaping:']) {
    assert.doesNotMatch(header, new RegExp('^' + key, 'm'), `${key} should be omitted when its value is absent`);
  }
  assert.match(header, /^grants: \[build\]$/m);
});
```

Update the existing `composeHeader: every optional field present renders in the documented order` test (line 105-117) to include `uiStack`:

```js
test('composeHeader: every optional field present renders in the documented order', () => {
  const header = composeHeader({
    record: 711, origin: 'capture', risk: 'low', size: 'high', ceremony: 'standard',
    grants: { build: true, merge: true }, fingerprint: 'fp123', blockedBy: [1, 2],
    surface: 'backend', designIntent: 'none', uiStack: 'none — defer to reference codebase', designSeed: 'seedabc', parkedAtShaping: true,
  });
  const lines = header.split('\n');
  assert.deepEqual(lines, [
    '---', 'record: 711', 'origin: capture', 'risk: low', 'size: high', 'ceremony: standard',
    'grants: [build, merge]', 'fingerprint: fp123', 'blocked-by: [1, 2]', 'surface: backend',
    'design-intent: none', 'ui-stack: none — defer to reference codebase', 'design-seed: seedabc', 'parked-at-shaping: true', '---',
  ]);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: FAIL — the two new tests fail (`uiStack` never set by `liftMetadata`), and the two updated tests fail (no `ui-stack:` line emitted, and the documented-order test's line array won't match since `uiStack` is silently dropped by the current `composeHeader` signature).

- [x] **Step 3: Implement the lift**

In `plugin/bin/lib/issues/materialize-format.js`, in `liftMetadata`, immediately after the `designIntent` block:

```js
  const uiStackMatch = /^Ui-stack:\s*(.+)$/m.exec(block);
  if (uiStackMatch) out.uiStack = uiStackMatch[1].trim();
```

(Uses `(.+)` rather than `(\S+)` — unlike `Surface:`/`Design-intent:`, `Ui-stack:` values are free-form and may contain spaces, e.g. `shadcn/ui + Tailwind`.)

- [x] **Step 4: Implement the compose**

In `plugin/bin/lib/issues/materialize-format.js`, update `composeHeader`'s destructured parameter list to add `uiStack` immediately after `designIntent`:

```js
function composeHeader({ record, origin, risk, size, ceremony, grants, fingerprint, blockedBy, surface, designIntent, uiStack, designSeed, parkedAtShaping }) {
```

And immediately after the existing `if (designIntent) lines.push(...)` line:

```js
  if (uiStack) lines.push(`ui-stack: ${uiStack}`);
```

- [x] **Step 5: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/materialize-format.js tests/bin-lib/issues/materialize-format.test.js
git commit -m "Lift and compose Ui-stack in materialize-format.js"
```

---

### Task 3: Wire `bin/materialize.js`'s CLI to pass `uiStack` through

**Files:**
- Modify: `plugin/bin/materialize.js` (the `composeHeader(...)` call and the JSON envelope)
- Test: `tests/bin-lib/issues/materialize-format.test.js` (CLI section)

**Interfaces:**
- Consumes: `liftMetadata`/`composeHeader` from Task 2 (`meta.uiStack`).
- Produces: the CLI's JSON envelope now also carries `uiStack` (mirrors the existing `surface` field) so a caller (`/flow`/`/build`) can log/inspect the resolved value without re-reading the written file.

- [x] **Step 1: Write the failing test**

Add to `tests/bin-lib/issues/materialize-format.test.js`, immediately after the existing `materialize CLI: happy path...` test (line 185-196):

```js
test('materialize CLI: happy path lifts a Ui-stack: line into the header and JSON envelope', () => {
  const runDir = mkRunDir('run-ui-stack');
  const body = SHAPED_BODY.replace('Surface: backend', 'Surface: web\nUi-stack: shadcn/ui + Tailwind');
  const { deps, out, written } = cliDeps({ ghView: () => ghJson({ body }) });
  const code = withCwd(repoRoot, () => cliRun(['1', '--run-dir', runDir], deps));
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  assert.equal(env.uiStack, 'shadcn/ui + Tailwind');
  const content = written[path.join(runDir, 'work', '1-spec.md')];
  assert.match(content, /^ui-stack: shadcn\/ui \+ Tailwind$/m);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: FAIL — `env.uiStack` is `undefined`, and no `ui-stack:` line appears in the written content.

- [x] **Step 3: Wire the CLI**

In `plugin/bin/materialize.js`, in the `composeHeader({...})` call, add `uiStack: meta.uiStack,` immediately after `designIntent: meta.designIntent,`.

In the `deps.stdout(JSON.stringify({...}))` call, add `uiStack: meta.uiStack || null,` immediately after `surface: meta.surface || null,`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: PASS

- [x] **Step 5: Run the full CLI test file to confirm no regression**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: PASS (all tests, including the pre-existing ones)

- [x] **Step 6: Commit**

```bash
git add plugin/bin/materialize.js tests/bin-lib/issues/materialize-format.test.js
git commit -m "Wire Ui-stack through materialize.js CLI"
```

---

### Task 4: Document the header/lift-rule changes in `skills/flow/materialize.md`

**Files:**
- Modify: `plugin/skills/flow/materialize.md`

**Interfaces:**
- Consumes: Tasks 1-3's implementation (this task documents it — no code).
- Produces: the canonical prose definition every other skill file cites for the `ui-stack:` header field, so later tasks (5-8) can point here instead of restating the format.

- [x] **Step 1: Update the pinned header format block**

In `plugin/skills/flow/materialize.md`, in "The pinned header format" section (around line 55-56), change:

```markdown
surface: {web|mobile|desktop|backend|infra|terminal}
design-intent: {value}             # omitted for backend/infra
design-seed: {opaque token}        # omitted unless the body already carries Design-seed:
```

to:

```markdown
surface: {web|mobile|desktop|backend|infra|terminal}
design-intent: {value}             # omitted for backend/infra
ui-stack: {value}                  # omitted for backend/infra, and whenever the body carries no Ui-stack: line
design-seed: {opaque token}        # omitted unless the body already carries Design-seed:
```

- [x] **Step 2: Add a reader-table row**

In the reader table immediately below (around line 63-77), insert a new row immediately after the `design-intent` row:

```markdown
| `ui-stack` | `/claude-tweaks:build` Common Step 1.7 (`design-prebuild.md`) forwards it into the implementer subagent's prompt; `/claude-tweaks:design-wrapper` documents the read side in `frontend-detection.md` |
```

- [x] **Step 3: Update the Surface/Design-intent/Design-seed lift-rule section**

Rename the section heading (currently `## The Surface / Design-intent / Design-seed lift rule`, around line 97) to:

```markdown
## The Surface / Design-intent / Ui-stack / Design-seed lift rule
```

In the body-metadata block example immediately below it, add a `Ui-stack:` line after `Design-intent:`:

```
Surface: {web | mobile | desktop | backend | infra | terminal}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Ui-stack: {free-form component-library/styling-approach string, or an explicit no-preference answer}
Design-seed: {opaque token — never written by /specify; see below}
```

In the paragraph that follows (the one starting "Lift them verbatim by reading the fetched body's leading metadata block..."), add one clause covering `ui-stack:` alongside the existing `design-intent:` clause — after the sentence ending "...`design-intent:` copies `Design-intent:` value when that line is present in the body, omitted from the header otherwise", insert:

"; `ui-stack:` copies `Ui-stack:` on the same present-or-omitted rule"

- [x] **Step 4: Verify prose conformance**

Run: `npm test`
Expected: PASS — no `node --test` suite pins this file's exact byte content (confirmed by grepping `tests/` for `materialize.md` fixture reads before editing); the file is prose-only documentation with no automated pin at this location.

- [x] **Step 5: Commit**

```bash
git add plugin/skills/flow/materialize.md
git commit -m "Document Ui-stack in materialize.md's header format and lift rule"
```

---

### Task 5: Document `Ui-stack:` in `spec-template.md`

**Files:**
- Modify: `plugin/skills/specify/spec-template.md`

**Interfaces:**
- Consumes: Task 4's canonical field definition (cites it rather than restating).
- Produces: the record-authoring-facing definition of the `Ui-stack:` field, the same altitude as the existing `Surface:`/`Design-intent:`/`Design-seed:` paragraphs.

- [x] **Step 1: Add the field to the metadata block example**

In `plugin/skills/specify/spec-template.md`, in the fenced metadata block (lines 13-18), insert a `Ui-stack:` line immediately after `Design-intent:`:

```markdown
Surface: {web | mobile | desktop | backend | infra | terminal}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Ui-stack: {free-form component-library/styling-approach string (e.g. "shadcn/ui + Tailwind"), or an explicit no-preference answer — omitted for backend/infra/terminal, same as Design-intent:}
Design-seed: {the seed key from the built artifact's Impeccable direction contract, copied verbatim — NOT written by /specify; see below}
Visual-reference: {path to an accepted shape-time scaffold file — omitted when /specify's Step 2.5b-ii variant-exploration step was skipped, declined, or not offered (non-frontend records)}
Parent: {#N — decomposition-mode sub-issues under work-links: body-text only; omitted otherwise (native links, work-backend: local-files, and Shaping mode)}
```

- [x] **Step 2: Add explanatory prose**

Immediately after the existing paragraph beginning "`Design-seed:` is the one metadata line `/specify` never writes..." (line 11), insert a new paragraph:

```markdown
`Ui-stack:` names the UI component library / styling approach a frontend build should use — e.g. `shadcn/ui + Tailwind`, or an explicit `none — no preference, defer to reference codebase` when the record's author genuinely has no opinion. `/claude-tweaks:specify`'s Step 2.5c2 (`design-pre-steps.md`, immediately after the Design-intent question) writes it, following the same auto-mode/`ui-stack` policy-key precedence Step 2.5c already uses for `Design-intent:`. Omitted for backend/infra/terminal records — the same frontend-only gate that already governs `Design-intent:`.
```

- [x] **Step 3: Update the opening paragraph's field list**

In the paragraph starting "Every record body opens with a short metadata block..." (line 7), change:

```markdown
`Surface:`, `Design-intent:`, and `Design-seed:` are lifted verbatim into the materialized header
```

to:

```markdown
`Surface:`, `Design-intent:`, `Ui-stack:`, and `Design-seed:` are lifted verbatim into the materialized header
```

- [x] **Step 4: Verify prose conformance**

Run: `npm test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugin/skills/specify/spec-template.md
git commit -m "Document Ui-stack field in spec-template.md"
```

---

### Task 6: Add Step 2.5c2 (UI-stack question) to `design-pre-steps.md`

**Files:**
- Modify: `plugin/skills/specify/design-pre-steps.md`

**Interfaces:**
- Consumes: the `ui-stack` policy key (Task 1), `resolve-policy.js`'s existing `--values --run <dir>` contract (already used by Step 2.5c, unchanged).
- Produces: the `Ui-stack:` value that Task 7's compose-then-write-once step writes into the record body.

- [x] **Step 1: Insert Step 2.5c2 immediately after Step 2.5c**

In `plugin/skills/specify/design-pre-steps.md`, immediately after Step 2.5c's final paragraph (currently ending at line 154, "For the canonical enumeration of `Design-intent:` values, read the body-metadata block description near the top of `spec-template.md` in this skill's directory."), insert:

```markdown

## Step 2.5c2: UI-stack question (frontend only)

Sets the `Ui-stack:` body-metadata line that `/claude-tweaks:build`'s Design Pre-Build step (Common Step 1.7) forwards into the implementer subagent's prompt as an explicit component-library/styling-approach mandate — see `design-prebuild.md` in the `/claude-tweaks:build` skill's directory.

**`--chained` (shaping mode's headless component invocation):** never ask. Write `Ui-stack: none — no preference, defer to reference codebase` and skip both branches below entirely, the same rule Step 2.5c's own `--chained` branch applies to `Design-intent:`. Log per `_shared/auto-decision-log.md` when a run directory resolves (`AUTO {time} — Step 2.5c2: ui-stack=none (--chained headless default). Reversibility: high.`), otherwise note it in the returned output only.

**The `next` form never reaches this step**, for the same reason Step 2.5c's own note states: `next-mode.md`'s Flag rejection step pre-resolves `Design-intent: none` before `shaping-mode.md` is ever entered, and this step never runs on that path either.

**Auto mode:** resolve `ui-stack` — `UI_STACK=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values --run "$PIPELINE_RUN_DIR" ui-stack)`. Apply per the resolved value:

- Value is non-empty → write the `Ui-stack:` body-metadata line directly, using the policy value verbatim. Log:
  ```
  AUTO {time} — Step 2.5c2: applied ui-stack="{value}" from pipeline config. Reversibility: high.
  ```
- Value is empty (no pipeline run dir, or `ui-stack` unset in `policy.yml` — the key carries no schema default) → fall back to KEPT-PROMPT (ask the user inline). This is in the "not silenced" list when explicitly left open, the same reasoning Step 2.5c's own unset case documents. Log:
  ```
  KEPT-PROMPT {time} — Step 2.5c2: ui-stack not set in policy; surfaced inline.
  ```

**Interactive mode (or KEPT-PROMPT fallback):** ask the user:

**Call `AskUserQuestion`:**

- `question`: `"UI stack for this build? (sets the Ui-stack body-metadata line — pick a preset, or use Other to name something specific)"`, `header`: `"UI stack"`, `multiSelect`: `false`
- Option 1 — `label`: `"shadcn/ui + Tailwind (Recommended)"`, `description`: `"Composable primitives, Tailwind utility classes."`
- Option 2 — `label`: `"Plain CSS / no library"`, `description`: `"Hand-written styles, no component library."`
- Option 3 — `label`: `"No preference — defer to reference codebase"`, `description`: `"Let the build match whatever the reference codebase already uses."`

The tool's built-in `Other` field covers any UI stack not listed above (e.g. `Material UI`, `Chakra UI`, a project-specific design system) — the same escape hatch `step-09-establish-github-remote.md` documents for its own org-selection question. Map the answer to the `Ui-stack:` value verbatim: a preset option writes that option's label text (`shadcn/ui + Tailwind`, `Plain CSS / no library`); Option 3 writes `none — no preference, defer to reference codebase`; an `Other` answer writes the user's typed text verbatim.

Record the chosen value — the calling mode's compose-then-write-once step (decomposition mode's Step 3 in `decomposition-mode.md`; Shaping mode's own Metadata block / Compose-then-write-once subsections in `shaping-mode.md`) writes it into the record's body-metadata block, immediately after `Design-intent:`.

**For multi-record decompositions:** ask the question once per design doc and apply the same UI stack across all generated sub-issue records covering a frontend surface — the same batching rule Step 2.5c already applies to `Design-intent:`.
```

- [x] **Step 2: Verify prose conformance**

Run: `npm test`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add plugin/skills/specify/design-pre-steps.md
git commit -m "Add Step 2.5c2 UI-stack question to design-pre-steps.md"
```

---

### Task 7: Wire the write side — `shaping-mode.md` and `record-creation.md`

**Files:**
- Modify: `plugin/skills/specify/shaping-mode.md`
- Modify: `plugin/skills/specify/record-creation.md`

**Interfaces:**
- Consumes: Task 6's `Ui-stack:` value.
- Produces: the record body's `Ui-stack:` line, present at the point `bin/materialize.js` (Task 2/3) later lifts it.

- [ ] **Step 1: Update shaping-mode.md's Metadata block subsection**

In `plugin/skills/specify/shaping-mode.md`, in the "### Metadata block" section's opening paragraph (line 90), extend the sentence "When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:`" to also cover Step 2.5c2:

Change:
```markdown
When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:` — under `--chained`, or under the `next` form's headless posture, that step never asks and resolves to `Design-intent: none`
```

to:

```markdown
When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:` and Step 2.5c2's UI-stack question to decide `Ui-stack:` — under `--chained`, or under the `next` form's headless posture, neither step asks and they resolve to `Design-intent: none` / `Ui-stack: none — no preference, defer to reference codebase`
```

In the same paragraph, extend the batch-table sentence ("render one batch table (record, sniffed surface, recommended intent pre-filled)...") to also mention the UI-stack column:

Change `recommended intent pre-filled` to `recommended intent and UI stack pre-filled`.

- [ ] **Step 2: Update the frontend metadata block example**

Change (lines 92-95):

```
Surface: web
Design-intent: {value}
```

to:

```
Surface: web
Design-intent: {value}
Ui-stack: {value}
```

- [ ] **Step 3: Update the backend/infra example's surrounding sentence**

Change (line 97):

```markdown
Backend/infra records omit the `Design-intent:` line entirely — it only applies when Step 2.5a detected a frontend surface:
```

to:

```markdown
Backend/infra records omit the `Design-intent:` and `Ui-stack:` lines entirely — both only apply when Step 2.5a detected a frontend surface:
```

- [ ] **Step 4: Add a Ui-stack reference table**

Immediately after the existing `| Design-intent: | Meaning |` table (lines 114-121), insert:

```markdown
`Ui-stack:` has no fixed enumeration — it's a free-form string (component library name, styling approach, or an explicit no-preference answer). See `design-pre-steps.md`'s Step 2.5c2 for the preset options offered interactively.
```

- [ ] **Step 5: Update the cross-reference sentence**

Change (line 123):

```markdown
`spec-template.md` stays canonical for the full metadata-block field set these two tables slice — including `Design-seed:`/`Visual-reference:`/`Parent:`, which shaping mode never writes. The `Design-intent:` one-liners above restate `design-pre-steps.md`'s Step 2.5c `AskUserQuestion` descriptions; keep both tables in sync by hand if either enum ever changes.
```

to:

```markdown
`spec-template.md` stays canonical for the full metadata-block field set these two tables slice — including `Design-seed:`/`Visual-reference:`/`Parent:`, which shaping mode never writes. The `Design-intent:` one-liners above restate `design-pre-steps.md`'s Step 2.5c `AskUserQuestion` descriptions; keep both tables in sync by hand if either enum ever changes. `Ui-stack:` has no enum to restate — Step 2.5c2's preset options are documentation, not a closed value set.
```

- [ ] **Step 6: Update Compose-then-write-once**

Change (lines 155-157):

```markdown
Assemble the full new body locally before making any write call — never edit the body incrementally against a live record. Final assembly order (`Design-intent:` omitted for non-frontend records):

```
Surface: {value}
Design-intent: {value}
```
```

to:

```markdown
Assemble the full new body locally before making any write call — never edit the body incrementally against a live record. Final assembly order (`Design-intent:`/`Ui-stack:` omitted for non-frontend records):

```
Surface: {value}
Design-intent: {value}
Ui-stack: {value}
```
```

- [ ] **Step 7: Update record-creation.md's Sub-issues body composition**

In `plugin/skills/specify/record-creation.md:164`, change:

```markdown
**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents
```

to:

```markdown
**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}` and `Ui-stack: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents
```

- [ ] **Step 8: Verify prose conformance**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/specify/shaping-mode.md plugin/skills/specify/record-creation.md
git commit -m "Wire Ui-stack into shaping-mode.md and record-creation.md's write paths"
```

---

### Task 8: Wire the read side — `design-prebuild.md` and `frontend-detection.md`

**Files:**
- Modify: `plugin/skills/build/design-prebuild.md`
- Modify: `plugin/skills/design-wrapper/frontend-detection.md`

**Interfaces:**
- Consumes: the materialized header's `ui-stack:` field (Task 2/3/4).
- Produces: the implementer subagent's prompt carries an explicit UI-stack mandate whenever the record declares one — closing the loop the spec's "Observed failure" describes.

- [ ] **Step 1: Add a Ui-stack section to design-prebuild.md**

In `plugin/skills/build/design-prebuild.md`, immediately after the existing "## Visual-reference scaffold (when present)" section (ending at line 19), insert a new section:

```markdown

## Ui-stack mandate (when present)

When the resolved record/spec's materialized header carries a `ui-stack:` field (lifted from the record body's `Ui-stack:` metadata line per `skills/flow/materialize.md`'s Surface / Design-intent / Ui-stack / Design-seed lift rule), include it verbatim in the implementer subagent's prompt as an explicit, non-negotiable constraint — not a suggestion the implementer may override with whatever a copied reference codebase happens to use. Frame it explicitly: "UI stack for this build: {ui-stack value}. Use this component library / styling approach for all new frontend code in this task — do not default to plain inline styles or a different library, even if a reference codebase nearby uses one." An `ui-stack` value of `none — no preference, defer to reference codebase` (or any of its variant phrasings) is itself a signal — omit the mandate line entirely in that case and let the implementer infer from the reference codebase as it does today, since that is the explicit answer the record's author gave.

Absence of `ui-stack:` (a pre-#357 record, or a record whose specify pass predates this field) is normal — proceed exactly as today, with no UI-stack guidance in the prompt.
```

- [ ] **Step 2: Update frontend-detection.md's field-count paragraph**

In `plugin/skills/design-wrapper/frontend-detection.md:69`, change:

```markdown
Every sub-issue record may declare two design-related body-metadata lines: `Surface:` and `Design-intent:`. `/specify` writes both on every new sub-issue record. The wrapper reads `Surface:` for Layer 2 detection and `Design-intent:` for `polish` mode's intent-driven dispatch — both lifted into the materialized header at build time (spec 20's contract).
```

to:

```markdown
Every sub-issue record may declare three design-related body-metadata lines: `Surface:`, `Design-intent:`, and `Ui-stack:`. `/specify` writes all three on every new frontend sub-issue record (`Design-intent:`/`Ui-stack:` omitted for backend/infra). The wrapper reads `Surface:` for Layer 2 detection and `Design-intent:` for `polish` mode's intent-driven dispatch; `Ui-stack:` is read by `/claude-tweaks:build`'s Design Pre-Build step (`build/design-prebuild.md`), not by the wrapper itself — all three lifted into the materialized header at build time (spec 20's contract for the first two; #357 for `Ui-stack:`).
```

- [ ] **Step 3: Update the Design-intent cross-reference line**

In `plugin/skills/design-wrapper/frontend-detection.md:75`, change:

```markdown
`Design-intent:` is not read in Layer 2 — it gates intent-driven command dispatch in `polish` mode. See the spec template's body-metadata block description for its enumeration.
```

to:

```markdown
`Design-intent:` is not read in Layer 2 — it gates intent-driven command dispatch in `polish` mode. `Ui-stack:` is not read in Layer 2 either — it has no enumeration to route on, only a free-form value forwarded verbatim into the implementer's prompt (`build/design-prebuild.md`'s Ui-stack mandate section). See the spec template's body-metadata block description for `Design-intent:`'s enumeration and `Ui-stack:`'s field description.
```

- [ ] **Step 4: Verify prose conformance**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/build/design-prebuild.md plugin/skills/design-wrapper/frontend-detection.md
git commit -m "Wire Ui-stack into build's Design Pre-Build implementer prompt"
```

---

### Task 9: Close the enumeration gaps Task 6's review surfaced outside `design-pre-steps.md`

**Added mid-execution.** Task 6's task reviewer independently verified 5 real under-enumeration gaps in 3 files no task in the original 8-task list touches, after Step 2.5c2 (Task 6) added a genuinely new decision point. Per this project's "no implicit deferrals" convention (CLAUDE.md's Philosophy section) — the controller holds full context on the exact citations right now, the fix is small and cheap, and one of the 4 sites carries flagged functional risk (a `next`-mode frontend record could end up with a genuinely missing `Ui-stack:` line, contradicting the spec's Acceptance Criteria) — this is fixed now rather than deferred to a backlog record.

**Files:**
- Modify: `plugin/skills/specify/SKILL.md` (2 sites)
- Modify: `plugin/skills/specify/next-mode.md` (2 sites)
- Modify: `plugin/skills/_shared/auto-mode-contract.md` (1 table)

**Interfaces:**
- Consumes: Task 6's new Step 2.5c2 section (the thing these citations were describing incompletely).
- Produces: no new behavior — pure documentation-consistency fixes closing citations that now under-count Step 2.5c2's existence.

- [x] **Step 1: Fix `specify/SKILL.md`'s two under-enumerations**

At the line describing terminal's design-pre-steps skip (currently reads, approximately): `"...terminal behaves like backend/infra for the design pre-steps (2.5b/2.5c skipped — no scaffold, no design-intent question)..."` — extend to: `"...terminal behaves like backend/infra for the design pre-steps (2.5b/2.5c/2.5c2 skipped — no scaffold, no design-intent question, no UI-stack question)..."`.

At the `--chained` description (currently reads, approximately): `"...the one decision shaping mode would otherwise raise interactively — Step 2.5c's design-intent question..."` — this is now factually wrong (there are two headless-resolved decisions, not one). Change to: `"...the two decisions shaping mode would otherwise raise interactively — Step 2.5c's design-intent question and Step 2.5c2's UI-stack question..."`.

Locate both by grepping the live file for `2.5c` and `the one decision` — do not assume the line numbers above are still exact.

- [x] **Step 2: Fix `specify/next-mode.md`'s two under-enumerations**

Both sites describe the `next` form's Flag rejection step pre-resolving `Design-intent: none` before `shaping-mode.md` is ever entered, with no mention that `Ui-stack:` is pre-empted the identical way (per Task 6's own Step 2.5c2 text: "The `next` form never reaches this step at all... `next-mode.md`'s Flag rejection step pre-resolves `Design-intent: none` before `shaping-mode.md` is ever entered"). Extend both sites to also name `Ui-stack: none — no preference, defer to reference codebase` as pre-resolved the same way, by the same step, for the same reason. Locate both by grepping the live file for `Design-intent: none` and `Step 2.5c`.

- [x] **Step 3: Add a `Ui-stack` row to `_shared/auto-mode-contract.md`'s "not silenced" table**

The table currently has a row `Design intent (\`/specify\` Step 2.5c)`. Add an adjacent row `Ui-stack (\`/specify\` Step 2.5c2)` with the same "asked inline when unset" semantics the Design-intent row already states — Step 2.5c2's KEPT-PROMPT fallback cites this table's authority, so the table must actually list it. Locate the exact row wording by reading the live file — match its existing cell style rather than inventing new phrasing.

- [x] **Step 4: Verify prose conformance**

Run: `npm test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugin/skills/specify/SKILL.md plugin/skills/specify/next-mode.md plugin/skills/_shared/auto-mode-contract.md
git commit -m "Close Step 2.5c2 enumeration gaps in SKILL.md, next-mode.md, auto-mode-contract.md"
```

---

## Final verification (after all 9 tasks)

Run the full suite once, sequentially, after every task has committed:

```bash
npm test
```

Expected: PASS, zero failures. This is `/claude-tweaks:build`'s own Common Step 5 (Final Verification) — the plan's own per-task runs are the TDD red/green cycle; this final run is the whole-branch gate.
