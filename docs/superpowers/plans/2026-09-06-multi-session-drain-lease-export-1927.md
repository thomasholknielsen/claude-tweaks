# Multi-Session Drain + CLAUDE_TWEAKS_LEASE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the leased block's base port as `CLAUDE_TWEAKS_LEASE` (first managed line of `.env.local`/`.env`) so a project can key its test database on a stable per-checkout token, make `ensure()` complete a current region that predates the line in place, and document the supported N-session drain shape once in `dispatch/sequential-execution.md`.

**Architecture:** The token is the lease base, already unique per checkout by the registry's construction — exporting it is one more managed line emitted by a sibling helper `leaseVars(base)` that the registry's env write calls before `serviceVars`. `isRegionCurrent` is untouched; `ensure()` gains one observational completeness step (a pre-existing region that lacked the line and kept its base reports `leaseLineAdded: true`; the rewrite itself is the registry's existing idempotent env write, which skips byte-identical content). SessionStart keeps rendering only the port entries in its `claude-tweaks: ports …` line (#1792's pinned shape), so the lease pair travels in `vars` without changing that line. Prose states the N-session recommendation once and cites the five existing collision controls.

**Tech Stack:** Node 18+ (no deps), `node:test`; `plugin/bin/lib/ports/{env-file,registry,ensure}.js`, `plugin/bin/lib/hooks/session-start.js`.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1927/work/1927-spec.md` (record #1927)

## Global Constraints

- `isRegionCurrent` keeps exactly its current semantics (`PORT === base` and `sameServices`); the lease line's absence is detected by a separate step inside `ensure()`, never by making `isRegionCurrent` return false (its only consumer reallocates on false).
- `CLAUDE_TWEAKS_LEASE={base}` is the first line inside the managed region, before `PORT`; `readManagedRegion` returns it like any pair; CRLF files keep their EOL (existing `mergeManagedRegion` behaviour).
- `session-start.js`'s ports line stays `claude-tweaks: ports {base}-{base+9} (PORT=… {NAME}_PORT=…)` — `tests/hooks-session-start.test.js` pins `/^claude-tweaks: ports 20000-20009 \(PORT=20000 API_PORT=20001\)$/` (#1792 AC3); the lease pair is filtered out of that render.
- Never rewrite a project's database name automatically — the new `step-06-5` row is report-only.
- `plugin/skills/_shared/policy-schema.md` (38,596 B) ≤ 40,960; the `port-services` row stays one line. `dispatch/sequential-execution.md`'s existing sections stay byte-identical (`tests/dispatch-worktree-anchoring.test.js`, `tests/worktree-adopt-or-create-consolidation.test.js`, `tests/build-worktree-setup-dispatch-stamp.test.js` pin them); the new section is appended.
- Commit subjects end `(refs #1927)`.

### Design decisions locked here (deviations from the record's literal text, staged at Common Step 4.5)

1. **A sibling helper, not a changed `serviceVars`.** `serviceVars` keeps its `[PORT, {NAME}_PORT…]` contract (the existing AC9 test and SessionStart's line depend on it); `leaseVars(base)` → `[['CLAUDE_TWEAKS_LEASE', String(base)]]` is what the registry's env write prepends. AC1's "or the equivalent via a sibling helper the writer calls first" allows this.
2. **`ensure().vars` includes the lease pair; the SessionStart line does not render it.** The record wants the pair in `vars`; #1792's pinned line shape would break if the hook printed every pair, so the hook filters `CLAUDE_TWEAKS_LEASE` out of the parenthesised list.
3. **The in-place rewrite is the registry's existing idempotent env write.** `registry.allocate` already rewrites `.env.local` on its no-new-lease path (`ensure.js`'s own comment), and `writeEnvFiles` skips byte-identical content, so `ensure()` detects the missing line before the branch and reports `leaseLineAdded` after it — it does not need a second writer; it still calls `writeEnvFiles` once when the line is somehow still absent after the branch (belt and braces, same base).
4. **`leaseLineAdded` is true only for a pre-existing region that lacked the line and kept its base** (`reallocated === null`); a fresh checkout (no region before) and a reallocation report `false`.
5. **The `step-06-5` "rewrite table" row lands in §3 (report-only hard cases)** as a named bullet, not in §2's rewrite table — §2's rows are rewrites by definition and the record itself says never rewrite.
6. **The template sentence goes in `claude-md-template.md`'s `## Commands` paragraph** (the verification sentence at ~line 45 is the only place the template speaks about the pipeline's verification; there is no ports section in the template today).
7. **Three tasks, not four** — the prose edits and their conformance pins are one task (same review surface).

---

## File Structure

| File | Responsibility |
|---|---|
| `plugin/bin/lib/ports/env-file.js` (modify) | `leaseVars`, `LEASE_KEY` |
| `plugin/bin/lib/ports/registry.js` (modify, ~line 130) | env write prepends `leaseVars` |
| `plugin/bin/lib/ports/ensure.js` (modify) | completeness step, `leaseLineAdded` |
| `plugin/bin/lib/hooks/session-start.js` (modify, ~line 412) | filter the lease pair from the rendered line |
| `plugin/skills/dispatch/sequential-execution.md` (append) | "Running more than one session" |
| `plugin/skills/_shared/policy-schema.md:218` (modify) | one clause |
| `plugin/skills/init/claude-md-template.md:~45` (modify) | one sentence |
| `plugin/skills/init/bootstrap/step-06-5-port-isolation.md` §3 (modify) | report-only bullet |
| `docs/hooks.md:18` (modify) | one sentence |
| `tests/bin-lib/ports/env-file.test.js`, `tests/bin-lib/ports/ensure.test.js`, `tests/hooks-session-start.test.js` (modify) | AC1, AC2, the stable line |
| `tests/dispatch-sequential-execution-conformance.test.js` (create) | AC3, AC4 |

---

### Task 1: The lease line — `leaseVars` and the registry's env write

**Files:**
- Modify: `plugin/bin/lib/ports/env-file.js`
- Modify: `plugin/bin/lib/ports/registry.js` (~line 130, the shared finish that computes `vars` and calls `writeEnvFiles`)
- Test: `tests/bin-lib/ports/env-file.test.js` (append), `tests/bin-lib/ports/registry.test.js` (append one case)

**Interfaces:**
- Produces: `LEASE_KEY = 'CLAUDE_TWEAKS_LEASE'`; `leaseVars(base) → [['CLAUDE_TWEAKS_LEASE', String(base)]]`; `registry.allocate`/`reallocate` results' `vars` = `[...leaseVars(base), ...serviceVars(services, base)]` and the env files' managed region carries the lease line first.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/ports/env-file.test.js` (add `leaseVars`, `LEASE_KEY`, `readManagedRegion` to the destructured require):

```js
// #1927 AC1: the lease token is the first managed line, before PORT.
test('leaseVars + serviceVars: CLAUDE_TWEAKS_LEASE first, then PORT and {NAME}_PORT; round-trips through the managed region', () => {
  assert.deepEqual(leaseVars(43120), [['CLAUDE_TWEAKS_LEASE', '43120']]);
  assert.equal(LEASE_KEY, 'CLAUDE_TWEAKS_LEASE');
  const vars = [...leaseVars(43120), ...serviceVars(['api', 'web'], 43120)];
  assert.deepEqual(vars, [['CLAUDE_TWEAKS_LEASE', '43120'], ['PORT', '43120'], ['WEB_PORT', '43121']]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ports-lease-'));
  writeEnvFiles(dir, vars);
  const text = fs.readFileSync(path.join(dir, '.env.local'), 'utf8');
  const region = readManagedRegion(text);
  assert.deepEqual(region, vars, 'the region round-trips every pair in order');
  assert.equal(region[0][0], 'CLAUDE_TWEAKS_LEASE', 'the lease line is first');
  const lines = text.split('\n');
  assert.equal(lines.indexOf('CLAUDE_TWEAKS_LEASE=43120'), lines.indexOf(BEGIN_MARKER) + 1);
});

test('leaseVars: a CRLF file keeps its EOL with the new first line (#1927, #1787 precedent)', () => {
  const crlf = `TOP=1\r\n${BEGIN_MARKER}\r\nPORT=1\r\n${END_MARKER}\r\n`;
  const merged = mergeManagedRegion(crlf, [...leaseVars(20005), ...serviceVars(['web'], 20005)]);
  assert.ok(merged.includes(`${BEGIN_MARKER}\r\nCLAUDE_TWEAKS_LEASE=20005\r\nPORT=20005\r\n${END_MARKER}`));
  assert.ok(!/[^\r]\n/.test(merged), 'no bare LF introduced');
});
```

Append to `tests/bin-lib/ports/registry.test.js` (read its top for the fixture helpers it already has — a tmp `home` and a checkout path — and reuse them):

```js
// #1927: the registry's env write carries the lease line first.
test('allocate: the written managed region starts with CLAUDE_TWEAKS_LEASE={base} and vars carries the pair first', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ports-registry-lease-'));
  const checkout = path.join(home, 'co'); fs.mkdirSync(checkout, { recursive: true });
  const result = await allocate(checkout, { services: ['web', 'api'], home, probe: async () => true });
  assert.deepEqual(result.vars[0], ['CLAUDE_TWEAKS_LEASE', String(result.base)]);
  assert.deepEqual(result.vars[1], ['PORT', String(result.base)]);
  const text = fs.readFileSync(path.join(checkout, '.env.local'), 'utf8');
  assert.match(text, new RegExp(`${BEGIN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\nCLAUDE_TWEAKS_LEASE=${result.base}\\nPORT=${result.base}\\n`));
});
```

(Import `allocate` and `BEGIN_MARKER` the way the file's existing tests do — read them first.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/ports/env-file"); process.exit(typeof m.leaseVars === "function" ? 0 : 1)'`
Expected: FAIL (exit 1). Then `node --test tests/bin-lib/ports/env-file.test.js` — Expected: FAIL (`leaseVars is not a function`).

- [ ] **Step 3: Implement**

In `plugin/bin/lib/ports/env-file.js`, after `serviceVars`:

```js
// #1927: the leased block's base, exported as a stable per-checkout token a
// project can key non-port resources on (a test database name, a schema) —
// always the FIRST managed line, before PORT. Unique per checkout by the
// registry's construction; the plugin creates no databases, it hands the
// project the token.
const LEASE_KEY = 'CLAUDE_TWEAKS_LEASE';

function leaseVars(base) {
  return [[LEASE_KEY, String(base)]];
}
```

and export `LEASE_KEY, leaseVars`. In `plugin/bin/lib/ports/registry.js`, at the one place `vars` is computed (~line 130, `const vars = serviceVars(result.lease.services, result.base);`), change it to `const vars = [...leaseVars(result.base), ...serviceVars(result.lease.services, result.base)];` and add `leaseVars` to the `require('./env-file')` destructure. Confirm with `grep -n "serviceVars(" plugin/bin/lib/ports/registry.js` that this is the only composition site (both `allocate` and `reallocate` funnel through it); if there are two, change both identically.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/ports/env-file.test.js tests/bin-lib/ports/registry.test.js tests/bin-lib/ports/cli.test.js`
Expected: all pass. If `cli.test.js` pins the rendered `vars` of `ports.js allocate` (read it), extend its expectation to include the lease pair first — that CLI prints what the registry returns and there is no pinned line shape for it; say so in the report.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/ports/env-file.js plugin/bin/lib/ports/registry.js tests/bin-lib/ports/env-file.test.js tests/bin-lib/ports/registry.test.js
git commit -m "Export CLAUDE_TWEAKS_LEASE as the first managed env line (refs #1927)"
```

---

### Task 2: `ensure()`'s completeness step, `leaseLineAdded`, and the stable SessionStart line

**Files:**
- Modify: `plugin/bin/lib/ports/ensure.js`
- Modify: `plugin/bin/lib/hooks/session-start.js` (the ports line render, ~line 412)
- Test: `tests/bin-lib/ports/ensure.test.js` (append), `tests/hooks-session-start.test.js` (append one case)

**Interfaces:**
- Consumes: Task 1's `LEASE_KEY`, `leaseVars`; `registry.allocate`'s write now carries the line.
- Produces: `ensure()` returns `{…, leaseLineAdded: boolean}`; `session-start.js`'s ports line renders only pairs whose key is `PORT` or ends with `_PORT`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/ports/ensure.test.js` (add `LEASE_KEY`, `readManagedRegion`, `mergeManagedRegion` to the env-file require):

```js
// #1927 AC2: a region that is current (PORT === base) but predates the lease
// line is completed in place — same base, no reallocation.
test('ensure: a current region without CLAUDE_TWEAKS_LEASE is rewritten in place with the same base and reports leaseLineAdded', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'pre-lease');
  const first = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  // Strip the lease line to fake a region written before #1927.
  const envPath = path.join(checkout, '.env.local');
  const stripped = mergeManagedRegion(fs.readFileSync(envPath, 'utf8'), [['PORT', String(first.base)]]);
  fs.writeFileSync(envPath, stripped);
  assert.equal(isRegionCurrent(checkout, first.base, ['web'], ['web']), true, 'currency semantics are unchanged by the missing line');
  assert.ok(!readManagedRegion(stripped).some(([k]) => k === LEASE_KEY));

  const second = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  assert.equal(second.reallocated, null);
  assert.equal(second.base, first.base);
  assert.equal(second.leaseLineAdded, true);
  const region = readManagedRegion(fs.readFileSync(envPath, 'utf8'));
  assert.deepEqual(region[0], [LEASE_KEY, String(first.base)], 'the lease line is first');
  assert.deepEqual(region.find(([k]) => k === 'PORT'), ['PORT', String(first.base)]);

  const mtime = fs.statSync(envPath).mtimeMs;
  const third = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  assert.equal(third.leaseLineAdded, false);
  assert.equal(fs.statSync(envPath).mtimeMs, mtime, 'a second run rewrites nothing');
});

test('ensure: a fresh checkout reports leaseLineAdded false (the line was written with the lease, not added to a prior region)', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'fresh-lease');
  const result = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  assert.equal(result.leaseLineAdded, false);
  assert.deepEqual(result.vars[0], [LEASE_KEY, String(result.base)]);
});

test('ensure: a non-current region still takes the reallocation path (leaseLineAdded false, reallocated set)', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'stale-lease');
  const first = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  fs.unlinkSync(path.join(checkout, '.env.local'));
  const server = await listenOn(first.base);
  try {
    const second = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout });
    assert.ok(second.reallocated && second.reallocated.from === first.base);
    assert.equal(second.leaseLineAdded, false);
  } finally { server.close(); }
});
```

Append to `tests/hooks-session-start.test.js`, next to its existing `#1792` cases (read them — they stub `portsEnsure.ensure` as a property and assert the rendered line):

```js
// #1927: the lease pair travels in vars but never in the rendered ports line (#1792 AC3's shape stays).
test('#1927: the SessionStart ports line omits CLAUDE_TWEAKS_LEASE from the parenthesised list (#1792 AC3 shape stays)', async () => {
  const project = gitProject();
  withPolicy(project, 'port-services: web,api\n');
  const original = portsEnsureMod.ensure;
  portsEnsureMod.ensure = async () => ({
    active: true, base: 20000, ports: [20000, 20001, 20002, 20003, 20004, 20005, 20006, 20007, 20008, 20009],
    vars: [['CLAUDE_TWEAKS_LEASE', '20000'], ['PORT', '20000'], ['API_PORT', '20001']], reallocated: null, envWriteError: null, leaseLineAdded: false,
  });
  try {
    const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    const lines = out.json.hookSpecificOutput.additionalContext.split('\n\n');
    const portsLine = lines.find((l) => l.startsWith('claude-tweaks: ports '));
    assert.match(portsLine, /^claude-tweaks: ports 20000-20009 \(PORT=20000 API_PORT=20001\)$/);
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /CLAUDE_TWEAKS_LEASE/);
  } finally {
    portsEnsureMod.ensure = original;
  }
});
```

(`gitProject`, `withPolicy`, `portsEnsureMod`, and `sessionStart` are the helpers and module handles the file's existing `#1792 AC3` test already uses at ~line 812 — reuse them verbatim.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const src=require("fs").readFileSync("plugin/bin/lib/ports/ensure.js","utf8"); process.exit(src.includes("leaseLineAdded") ? 0 : 1)'`
Expected: FAIL (exit 1 — `ensure.js` does not know `leaseLineAdded` yet). Then `node --test tests/bin-lib/ports/ensure.test.js tests/hooks-session-start.test.js` — Expected: FAIL on the new cases (`undefined !== true`; the ports line currently renders every pair).

- [ ] **Step 3: Implement**

In `plugin/bin/lib/ports/ensure.js`: import `LEASE_KEY` and `writeEnvFiles` from `./env-file`; before the branch that reads `existing`/`existingEntry`, capture the pre-call region state:

```js
  // #1927: read the managed region BEFORE the registry touches the file, so
  // "did a pre-existing region lack the lease line" is judged on the same
  // untouched evidence as staleness. registry.allocate's own env write
  // (idempotent, skips byte-identical content) is what puts the line in.
  let regionBefore = null;
  try { regionBefore = readManagedRegion(fs.readFileSync(path.join(checkoutRoot, '.env.local'), 'utf8')); } catch { regionBefore = null; }
  const hadLeaseLine = Array.isArray(regionBefore) && regionBefore.some(([k]) => k === LEASE_KEY);
```

After the branch (once `result` and `reallocated` are known), add the completeness step:

```js
  // Completeness (#1927): a region that existed before this call, lacked the
  // lease line, and kept its base (no reallocation) has just been completed
  // in place by the registry's write — report it. Belt and braces: if the
  // line is still absent (an env write error left the old region), write the
  // same-base vars once more; never the reallocation path.
  let leaseLineAdded = false;
  if (regionBefore !== null && !hadLeaseLine && reallocated === null) {
    let regionAfter = null;
    try { regionAfter = readManagedRegion(fs.readFileSync(path.join(checkoutRoot, '.env.local'), 'utf8')); } catch { regionAfter = null; }
    if (!(Array.isArray(regionAfter) && regionAfter.some(([k]) => k === LEASE_KEY))) {
      try { writeEnvFiles(checkoutRoot, result.vars); } catch { /* envWriteError already reports the registry's own failure */ }
    }
    leaseLineAdded = true;
  }
```

and include `leaseLineAdded` in the returned object. Update the header comment's return-shape line.

In `plugin/bin/lib/hooks/session-start.js`, at the ports line render (~line 412, the `(${…})` list built from `result.vars`), render only port pairs: `result.vars.filter(([k]) => k === 'PORT' || k.endsWith('_PORT'))` — with a one-line comment: `// #1927: CLAUDE_TWEAKS_LEASE rides in vars for the env file, not in this line (#1792 AC3's shape).`

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/ports/ensure.test.js tests/hooks-session-start.test.js tests/hooks-dispatcher.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/ports/ensure.js plugin/bin/lib/hooks/session-start.js tests/bin-lib/ports/ensure.test.js tests/hooks-session-start.test.js
git commit -m "Complete a pre-lease managed region in place; keep the SessionStart ports line stable (refs #1927)"
```

---

### Task 3: The N-session section, the three doc clauses, and the conformance pins

**Files:**
- Modify: `plugin/skills/dispatch/sequential-execution.md` (append a section)
- Modify: `plugin/skills/_shared/policy-schema.md:218` (one clause in the `port-services` row)
- Modify: `plugin/skills/init/claude-md-template.md` (~line 45, one sentence)
- Modify: `plugin/skills/init/bootstrap/step-06-5-port-isolation.md` §3 (one bullet)
- Modify: `docs/hooks.md:18` (one sentence)
- Test: `tests/dispatch-sequential-execution-conformance.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/dispatch-sequential-execution-conformance.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('sequential-execution.md documents the N-session drain shape once, naming the five controls, the same-worktree prohibition, and the load caveat (#1927 AC3)', () => {
  const t = read('plugin/skills/dispatch/sequential-execution.md');
  assert.strictEqual((t.match(/^## Running more than one session$/gm) || []).length, 1);
  const section = t.slice(t.indexOf('## Running more than one session'));
  for (const control of ['_shared/issue-claims.md', 'sibling-session-check.md', 'worktree-reap.js', 'port', 'github-rate-limit.md']) {
    assert.ok(section.includes(control), `names ${control}`);
  }
  assert.match(section, /same worktree/);
  assert.match(section, /CLAUDE\.md.*Commands/);
  assert.match(section, /not a concurrency mechanism/);
  assert.match(section, /CLAUDE_TWEAKS_LEASE/);
});

test('the lease token is documented where port-services is (#1927 AC4)', () => {
  assert.match(read('plugin/skills/_shared/policy-schema.md'), /CLAUDE_TWEAKS_LEASE/);
  assert.match(read('plugin/skills/init/claude-md-template.md'), /CLAUDE_TWEAKS_LEASE/);
  const step = read('plugin/skills/init/bootstrap/step-06-5-port-isolation.md');
  assert.match(step, /test_\$\{CLAUDE_TWEAKS_LEASE\}/);
  assert.match(step, /test_db/);
  assert.match(read('docs/hooks.md'), /CLAUDE_TWEAKS_LEASE/);
  assert.ok(Buffer.byteLength(read('plugin/skills/_shared/policy-schema.md'), 'utf8') <= 40960);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/dispatch-sequential-execution-conformance.test.js`
Expected: FAIL (no section; no `CLAUDE_TWEAKS_LEASE` mentions).

- [ ] **Step 3: `sequential-execution.md` — append the section** (after the last existing paragraph; touch nothing above it):

```markdown
## Running more than one session

The supported way to drain more than one group at a time is **N top-level sessions**, each running `/claude-tweaks:dispatch #N` (or a bare drain) — the shape every existing invariant already assumes: one session, one worktree, one owned run. Nothing structural changes for N > 1, because collision is already prevented by five controls this file cites rather than restates: claims (`_shared/issue-claims.md` — CAS on the claims registry, so two sessions cannot take the same record), the sibling-session check (`dispatch/sibling-session-check.md`, `[IL-107]`), fail-closed worktree reaping (`bin/lib/hooks/worktree-reap.js` never removes a locked worktree or one with a live pid), per-checkout port leases (`bin/lib/ports/registry.js` — every session's checkout gets its own block, and the block's base is exported as `CLAUDE_TWEAKS_LEASE` so a project can key its test database on it, `DATABASE_URL=…test_${CLAUDE_TWEAKS_LEASE}`), and GitHub rate-limit backoff (`_shared/github-rate-limit.md`). The one thing a human must not do is run two sessions from the **same worktree**: `record-worktree` stamps one `{worktree, sessionId}` per run, and every hook gate resolves its target from that binding. Load is the cost: N sessions share one machine, and a `npm test` failure count that varies run-to-run under that load is the signal CLAUDE.md's Commands note describes — re-run the affected file in isolation before concluding anything, and let the flaky allowlist (`test/verification.md`'s Flake handling) absorb the known offenders.

The `cd {worktree} &&` prefix shape (#447 above) is **not a concurrency mechanism** inside one session, and must not be read as one: it breaks the one-session-one-worktree binding the hook gates depend on (`record-worktree`'s stamp, `wd-deny`/`checkWorktreeRequired` resolving the target from the session's tracked cwd rather than a command's `cd`, SubagentStop and every `events.jsonl` append attributing to the session's single owned run), the worktree Bash-shape guard refuses most compound commands, and it puts N groups' outcomes in one orchestrator's context (`[IL-130]`). #447's own scope is a cwd-pinned session running groups *sequentially*, confirmed only on the failure path — never two groups at once.
```

- [ ] **Step 4: The three doc clauses and the hooks sentence**

- `plugin/skills/_shared/policy-schema.md:218` — append to the `port-services` row's description cell, before its closing ` |`: ` The managed region's first line is `CLAUDE_TWEAKS_LEASE={base}` (#1927) — a stable per-checkout token a project may key non-port resources on, e.g. a test database name.` Keep the row on one line; `wc -c` ≤ 40,960.
- `plugin/skills/init/claude-md-template.md` — after the sentence beginning `When `.claude-tweaks/verify-scope.json` exists,` add: `On a `port-services` checkout, `.env.local`'s managed region also exports `CLAUDE_TWEAKS_LEASE` (the leased block's base) — key a per-checkout test database on it the way ports are keyed: `DATABASE_URL=postgres://localhost:5432/app_test_${CLAUDE_TWEAKS_LEASE}`.`
- `plugin/skills/init/bootstrap/step-06-5-port-isolation.md` §3 — add a bullet before the **Catch-all** bullet: `- **A literal test-database name** (`test_db`, `testdb`, `test.db`) as a value in `.env`/`.env.local` or `vitest.config.*` — report it with the suggestion `test_${CLAUDE_TWEAKS_LEASE}` (the managed region's lease token, #1927); never rewritten, since a wrong rewrite points tests at a database that does not exist. False negatives for an unlisted literal are accepted — this row is report-only.`
- `docs/hooks.md:18` — append to that bullet: ` The managed region's first line is `CLAUDE_TWEAKS_LEASE={base}` (#1927), the lease token a project can key a test database on; the rendered line lists only the port pairs.`

- [ ] **Step 5: Verify**

Run: `node --test tests/dispatch-sequential-execution-conformance.test.js tests/dispatch-worktree-anchoring.test.js tests/worktree-adopt-or-create-consolidation.test.js tests/build-worktree-setup-dispatch-stamp.test.js tests/policy-key-naming.test.js tests/policy-schema-metadata.test.js tests/policy-schema.test.js tests/skill-prose-plugin-root-invocations.test.js tests/ceremony-profile-roster.test.js` and every suite from `grep -rl "sequential-execution\|step-06-5\|claude-md-template\|policy-schema.md" tests/ | head -30`; `wc -c` on the four skill files.
Expected: all pass; `policy-schema.md` ≤ 40,960.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/dispatch/sequential-execution.md plugin/skills/_shared/policy-schema.md plugin/skills/init/claude-md-template.md plugin/skills/init/bootstrap/step-06-5-port-isolation.md docs/hooks.md tests/dispatch-sequential-execution-conformance.test.js
git commit -m "Document the N-session drain shape and the CLAUDE_TWEAKS_LEASE token (refs #1927)"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 → Tasks 1-2 (`leaseVars` first line, `readManagedRegion` round-trip, `isRegionCurrent` unchanged, the completeness step with `leaseLineAdded`); 2 → Task 3's section; 3 → Task 3's three clauses; 4 → Task 1/2 tests + the conformance pin + the `docs/hooks.md` sentence. AC1 → Task 1's env-file test (via the sibling helper the writer calls first, as AC1 allows); AC2 → Task 2's pre-lease test (current, in-place, `reallocated === null`, `leaseLineAdded` true then false, nothing rewritten — mtime pinned); AC3 → the conformance test's five controls, prohibition, load caveat; AC4 → the four-file `CLAUDE_TWEAKS_LEASE` pins + the `test_db` row; AC5 → byte assertion + Common Step 5's suite.
- **Placeholder scan:** the session-start test names two helper placeholders and says to reuse the file's own `#1792` helpers — the implementer reads that file; every other step carries literal content.
- **Type consistency:** `leaseVars(base) → [[LEASE_KEY, String(base)]]` in Tasks 1-2; `vars` pairs are `[string, string]` everywhere (the registry already stringifies); `leaseLineAdded: boolean` in Task 2's return and tests; section heading `## Running more than one session` identical in Task 3's prose and test.
- **Plan-authoring checks:** Return-shape widening — `ensure()` gains a field; `tests/hooks-session-start.test.js` stubs the return object (additive, no `deepStrictEqual` on the whole object — verified by reading its `#1792` cases); `registry` results gain a leading pair — `tests/bin-lib/ports/registry.test.js`/`cli.test.js` may `deepEqual` `vars` (Task 1 Step 4 names the fix). Byte-pin — `policy-schema.md` 38,596 B, one clause; `sequential-execution.md` pinned only by content assertions on its existing sections (append-only edit). Consumer-timing — the lease line is written at the same point the port lines are; no later consumer. Gate-over-producers — the only producer of `vars` is the registry's one composition site (Task 1 Step 3 verifies by grep).
