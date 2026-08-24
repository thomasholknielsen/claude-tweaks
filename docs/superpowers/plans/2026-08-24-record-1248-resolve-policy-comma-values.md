# resolve-policy.js comma-joined --values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin/bin/resolve-policy.js` accept a comma-joined lever list (`--values a,b,c` and the default JSON-envelope mode's `a,b,c`) so it resolves identically to the already-working space-separated multi-argv-token form.

**Architecture:** `main()`'s argument-parsing loop collects every non-flag argv token into a flat `keys` array via `keys.push(arg)`. Every downstream consumer (`resolvePolicyConfig`, the `--values` line-per-key mapper, the default JSON-envelope `JSON.stringify(result)`) already treats `keys` as a flat array of independent lever names — so splitting each token on `,` at collection time, before anything downstream ever sees it, is the only change needed.

**Tech Stack:** Node.js (no runtime deps), `node --test` spawn tests.

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/record-1248/.claude-tweaks/pipelines/2026-08-24T062135-record-1248/work/1248-spec.md`

## Global Constraints

- Do not special-case the split to `--values` mode only — the default JSON-envelope mode shares the exact same `keys.push(arg)` loop and must split too.
- `--all` must keep rejecting key arguments outright (comma-joined or not) — it takes no key arguments, so the split must never let `--all a,b` resolve into `--all` plus two keys.
- The `model-profiles` key's existing `--values` rejection (no scalar form) must still trip when `model-profiles` appears inside a comma-joined list.
- Splitting must not change per-key error semantics — an unknown key, comma-joined or not, still resolves to `{"error": "unknown-key"}` for that key specifically.

---

### Task 1: Split comma-joined argv tokens into individual lever keys

**Files:**
- Modify: `plugin/bin/resolve-policy.js:78` (the `else { keys.push(arg); }` branch inside `main()`'s argument-parsing `while` loop)
- Test: `tests/resolve-policy-cli.test.js` (existing spawn-test suite for this CLI — append new tests at the end of the file, after the last existing `test(...)` block)

**Interfaces:**
- Consumes: `plugin/bin/lib/policy-schema.js`'s `POLICY_KEYS`/`resolvePolicyConfig` (unchanged — already imported at the top of both files); `tests/resolve-policy-cli.test.js`'s existing `makeFixtureRepo({ policy })`, `runCli(args, cwd, env)`, and `runOk(args, cwd, env)` helpers (already defined earlier in that file — reuse them verbatim, do not redefine).
- Produces: no new exports — this task changes `main()`'s internal `keys` collection only. The observable contract is CLI stdout/stderr/exit-code behavior, asserted by the new tests below.

- [ ] **Step 1: Write the failing tests**

Append these four tests to the end of `tests/resolve-policy-cli.test.js` (after the last existing `test(...)` block, before end of file):

```javascript
test('comma-joined --values resolves identically to the space-separated multi-key form', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const commaJoined = runCli(['--values', 'autonomy,dispatch-retry-ceiling,worktree-always'], tmp);
  const spaceSeparated = runCli(['--values', 'autonomy', 'dispatch-retry-ceiling', 'worktree-always'], tmp);
  assert.strictEqual(commaJoined.status, 0);
  assert.strictEqual(commaJoined.stderr, '');
  assert.strictEqual(commaJoined.stdout, spaceSeparated.stdout);
  assert.strictEqual(commaJoined.stdout, 'unattended\n5\ntrue\n');
});

test('comma-joined default JSON-envelope mode resolves identically to the space-separated multi-key form', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const commaJoined = runOk(['autonomy,worktree-always'], tmp);
  const spaceSeparated = runOk(['autonomy', 'worktree-always'], tmp);
  assert.deepStrictEqual(commaJoined, spaceSeparated);
  assert.deepStrictEqual(commaJoined, {
    autonomy: { value: 'unattended', source: 'policy' },
    'worktree-always': { value: true, source: 'policy' },
  });
});

test('comma-joined list with one unknown key: that key still errors, siblings still resolve', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const out = runOk(['made-up-lever,autonomy'], tmp);
  assert.deepStrictEqual(out['made-up-lever'], { error: 'unknown-key' });
  assert.deepStrictEqual(out.autonomy, { value: 'unattended', source: 'policy' });
});

test('--all rejects a comma-joined key argument the same as a plain one', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const res = runCli(['--all', 'autonomy,worktree-always'], tmp);
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /resolve-policy:/);
  assert.strictEqual(res.stdout, '');
});

test('--values with a comma-joined list containing model-profiles still trips the no-scalar-form rejection', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const res = runCli(['--values', 'autonomy,model-profiles'], tmp);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /no scalar form/);
  assert.strictEqual(res.stdout, '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/resolve-policy-cli.test.js`

Expected: the first four new tests FAIL:
- The `--values` test: the comma-joined token resolves as one unknown key, so `commaJoined.stdout` is `'\n'` (one empty line) instead of `'unattended\n5\ntrue\n'`, and it does not match `spaceSeparated.stdout`.
- The default-mode test: `commaJoined` is `{ "autonomy,worktree-always": { error: 'unknown-key' } }` instead of two separate resolved keys.
- The unknown-key test: `out['made-up-lever']` is `undefined` (the actual unknown key is the combined string `'made-up-lever,autonomy'`, not `'made-up-lever'`), and `out.autonomy` is also `undefined`.
- The `model-profiles` test: the combined token `'autonomy,model-profiles'` is looked up as one unknown key rather than triggering the `--values`-mode `model-profiles` no-scalar-form guard (that guard checks `keys.includes('model-profiles')`, which is false for an unsplit token) — so the CLI exits 0 with stdout `'\n'` instead of exiting 1 with the `/no scalar form/` stderr message.

The `--all` test PASSES already pre-fix: `allMode && keys.length > 0` fires for the single unsplit `'autonomy,worktree-always'` token exactly as it does for two split tokens, since the check is on array length, not per-token content — this test is regression coverage for behavior the change must not disturb, not new-behavior proof.

- [ ] **Step 3: Implement the fix**

In `plugin/bin/resolve-policy.js`, change line 78 from:

```javascript
      keys.push(arg);
```

to:

```javascript
      keys.push(...arg.split(',').filter(Boolean));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/resolve-policy-cli.test.js`

Expected: all tests PASS, including the four new ones and every pre-existing test in the file (the `--all`-with-key-argument path and per-key error semantics are unchanged by this edit — `--all`'s own rejection at line 85-88 runs before any key is ever looked up in `POLICY_KEYS`, so a comma-joined `--all` argument is still rejected outright, just now as multiple split keys landing in `keys` before the `allMode && keys.length > 0` check fires instead of one unsplit token).

- [ ] **Step 5: Run the full existing resolve-policy suites to confirm no regression**

Run: `node --test tests/resolve-policy-cli.test.js tests/resolve-policy-lib.test.js tests/resolve-policy-run-dir-anchoring.test.js`

Expected: all PASS — this change touches only the argv-collection loop, not `resolvePolicyConfig` or the `--run` anchoring logic, so the sibling suites should be unaffected; running them here confirms it rather than assuming it.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/resolve-policy.js tests/resolve-policy-cli.test.js
git commit -m "Split comma-joined key arguments in resolve-policy.js's argv parser

refs #1248"
```
