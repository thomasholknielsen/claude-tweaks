# Recon Signal Quality & Granularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four independent gaps in the shipped recon v2 engine — coarse monorepo slicing, a severity filter that's wired to always pass, no rule for bundling recurring root-cause findings, and rotation state that silently fails to persist — then reconcile the existing GitHub issue backlog to the new severity policy.

**Architecture:** All engine changes are additive/wiring fixes to existing `bin/lib/recon/*.js` modules and `bin/recon.js`'s CLI dispatch — no new modules, no new dependencies. `skills/recon/SKILL.md` gets new guidance sections documenting the same behavior for the LLM judge driving each run. `skills/tidy/scan-procedures.md` gets one new one-time subsection for backlog reconciliation.

**Tech Stack:** Node.js 18+ (zero external dependencies), `node --test` as the test runner.

**Design doc:** `docs/superpowers/specs/2026-07-06-recon-signal-quality-design.md` — read this first for the "why" behind each decision; this plan only covers the "how."

## Global Constraints

- Zero new npm dependencies — this project runs entirely on Node built-ins and `node --test` (per `CLAUDE.md`'s Stack table).
- Every new/changed engine function stays pure and network-free (`bin/lib/recon/*.js` never calls `gh` or the network — per this project's Anti-Patterns table).
- No line numbers in any anchor format anywhere in this codebase (recon's existing `normalizeAnchor` contract) — not touched by this plan, but do not introduce a new anchor-shaped string that includes one.
- Run `npm test` (which runs `node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/skill-health/tests/*.test.js`) after every task and confirm 0 failures before committing.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes), per `CLAUDE.md`.

---

### Task 1: Severity filter wiring — file only high/critical by default

**Files:**
- Modify: `bin/recon.js` (the `cmdValidateFindings` function and its usage string)
- Modify: `skills/recon/SKILL.md` (Input section, Step 8's `validate-findings` invocation)
- Modify: `bin/lib/recon/tests/skill-md.test.js` (add tokens to the existing required-token array)
- Modify: `bin/lib/recon/tests/cli-validate-findings.test.js` (new tests + 3 existing-test fixups)

**Interfaces:**
- Consumes: `decide(finding, issueIndex, cache, opts)` from `bin/lib/recon/dedup.js` — unchanged signature, `opts.threshold` accepts `'low'|'medium'|'high'|'critical'`.
- Produces: `--min-severity <level>` CLI flag on `validate-findings`, default `'high'`. Later tasks (and consumers like `/tidy`) treat `high` as the standing default filing threshold.

- [ ] **Step 1: Update the usage string and wire `--min-severity` into the filing decision**

In `bin/recon.js`, find:

```js
function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1]; // positional after the subcommand name
  if (!findingsPath) {
    process.stderr.write(
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--run-id <id>] [--slice <id>] [--dry-run]\n',
    );
    process.exit(2);
  }
```

Replace with:

```js
function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1]; // positional after the subcommand name
  if (!findingsPath) {
    process.stderr.write(
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-severity <level>] [--dry-run]\n',
    );
    process.exit(2);
  }
```

Then find:

```js
    const decision = decide(finding, issueIndex, cache, { threshold: 'low' });
```

Replace with:

```js
    const decision = decide(finding, issueIndex, cache, { threshold: args['min-severity'] || 'high' });
```

- [ ] **Step 2: Fix the 3 existing tests whose findings now fall below the new default threshold**

`validFinding()` in `bin/lib/recon/tests/cli-validate-findings.test.js` defaults to `severity: 'medium'`, which used to always file (old hardcoded `'low'` threshold passed everything) but now gets `remember`ed under the new default `'high'` threshold. These 3 tests aren't testing severity behavior — bump their finding(s) to `'high'` so they stay decoupled from the threshold default.

In `bin/lib/recon/tests/cli-validate-findings.test.js`, find:

```js
test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding();
```

Replace with:

```js
test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
```

Find:

```js
test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({ criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused' });
```

Replace with:

```js
test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({
    criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused', severity: 'high',
  });
```

Find:

```js
test('validate-findings: --dry-run emits payloads but does not write cache', () => {
  const root = tmp();
  const f = validFinding();
```

Replace with:

```js
test('validate-findings: --dry-run emits payloads but does not write cache', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
```

Find:

```js
test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding();
```

Replace with:

```js
test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
```

- [ ] **Step 3: Run the existing suite to confirm the fixups hold before adding new tests**

Run: `node --test bin/lib/recon/tests/cli-validate-findings.test.js`
Expected: all tests pass (0 failures). If any of the 4 tests above still fail, re-check the exact string replacement matched.

- [ ] **Step 4: Write the new failing tests for the severity threshold**

In `bin/lib/recon/tests/cli-validate-findings.test.js`, add at the end of the file:

```js

// ── Severity filter (min-severity) ───────────────────────────────────────────

test('validate-findings: default min-severity is high — a medium finding is remembered, not filed', () => {
  const root = tmp();
  const f = validFinding({ severity: 'medium' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-med']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 0, 'medium severity must not file under the default (high) threshold');

  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json'), 'utf8'));
  const entry = Object.values(cache)[0];
  assert.strictEqual(entry.status, 'remembered');
});

test('validate-findings: high severity still files under the default threshold', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-high']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'high severity must file under the default threshold');
});

test('validate-findings: critical severity files under the default threshold', () => {
  const root = tmp();
  const f = validFinding({ severity: 'critical' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-crit']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'critical severity must file under the default threshold');
});

test('validate-findings: --min-severity medium lowers the bar and files a medium finding', () => {
  const root = tmp();
  const f = validFinding({ severity: 'medium' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(
    root, findingsFile,
    ['--slice', 'src/api', '--run-id', 'r-min-med', '--min-severity', 'medium'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'medium finding must file when --min-severity medium is passed');
});
```

- [ ] **Step 5: Run the new tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/cli-validate-findings.test.js`
Expected: PASS, 0 failures, including the 4 new tests from Step 4.

- [ ] **Step 6: Document `--min-severity` in SKILL.md's Input section**

In `skills/recon/SKILL.md`, find:

```markdown
- `--budget <n>` — judge up to `n` slices in one run (default: 1). Use with `next-slice` when you want a deeper sweep in a single invocation.
```

Replace with:

```markdown
- `--budget <n>` — judge up to `n` slices in one run (default: 1). Use with `next-slice` when you want a deeper sweep in a single invocation.
- `--min-severity <level>` — minimum severity that gets filed as a GitHub issue (default: `high`; one of `low|medium|high|critical`). Findings below this are held in the local cache as `remembered` — not dropped, not filed — until they escalate or a deliberately deeper sweep lowers the bar. Pass `--min-severity medium` (or `low`) for an intentional deep-dive that surfaces more than the default high/critical-only trickle.
```

- [ ] **Step 7: Document `--min-severity` on the actual `validate-findings` invocation in Step 8**

In `skills/recon/SKILL.md`, find:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" validate-findings /tmp/recon-findings.json \
  --root "${ROOT:-$PWD}" \
  --slice "${SLICE_ID}" \
  --run-id "${RUN_ID}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/recon-payloads.json
```

Replace with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" validate-findings /tmp/recon-findings.json \
  --root "${ROOT:-$PWD}" \
  --slice "${SLICE_ID}" \
  --run-id "${RUN_ID}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${MIN_SEVERITY:+--min-severity "$MIN_SEVERITY"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/recon-payloads.json
```

- [ ] **Step 8: Add this task's token to skill-md.test.js's required-token check**

In `bin/lib/recon/tests/skill-md.test.js`, find:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol',
].forEach((token) => {
```

Replace with:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
].forEach((token) => {
```

(This array is shared across Tasks 1, 3, and 8 of this plan. Each task adds only the token(s) its own SKILL.md prose satisfies, in the same step that lands that prose, so the suite is green at the end of every task. Task 3 adds `'Multi-slice runs'` and `'Mandatory readback check'` to this same array later; Task 8 adds `'relatedAnchors'` and `'Bundling rule'`.)

- [ ] **Step 9: Run the full recon test suite**

Run: `node --test bin/lib/recon/tests/*.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add bin/recon.js skills/recon/SKILL.md bin/lib/recon/tests/skill-md.test.js bin/lib/recon/tests/cli-validate-findings.test.js
git commit -m "Wire recon's severity filter — file only high/critical by default"
```

---

### Task 2: `status` reports the remembered count

**Files:**
- Modify: `bin/recon.js` (`cmdStatus`)
- Modify: `bin/lib/recon/tests/status-v2.test.js`

**Interfaces:**
- Consumes: nothing new — reads the same `cache.json` shape (`{status: 'open'|'wontfix'|'closed'|'remembered'|'regressed'}`) documented in `bin/lib/recon/cache.js`.
- Produces: `status` command's stdout line now includes `remembered:<n>`.

- [ ] **Step 1: Write the failing test**

In `bin/lib/recon/tests/status-v2.test.js`, add after the first test:

```js

test('status prints the remembered count from v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'remembered', severity: 'medium' },
    { fp: 'recon-eeeeffff', status: 'remembered', severity: 'low' },
  ]);
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('remembered:2'), `expected remembered:2 in: ${out}`);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test bin/lib/recon/tests/status-v2.test.js`
Expected: FAIL — `out` does not include `'remembered:2'` (the summary line doesn't emit a `remembered` count yet).

- [ ] **Step 3: Implement the minimal change**

In `bin/recon.js`, find:

```js
function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    critical: findings.filter((f) => f.status === 'open' && f.severity === 'critical').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} wontfix:${counts.wontfix}\n`;
```

Replace with:

```js
function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    remembered: findings.filter((f) => f.status === 'remembered').length,
    critical: findings.filter((f) => f.status === 'open' && f.severity === 'critical').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} ` +
    `wontfix:${counts.wontfix} remembered:${counts.remembered}\n`;
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/status-v2.test.js`
Expected: PASS, 0 failures (including the pre-existing tests — they only check substrings like `'open:1'`, unaffected by the line's added suffix).

- [ ] **Step 5: Commit**

```bash
git add bin/recon.js bin/lib/recon/tests/status-v2.test.js
git commit -m "Add remembered count to recon status output"
```

---

### Task 3: Persistence hardening — hard-fail without `--slice`, document the readback check

**Files:**
- Modify: `bin/recon.js` (`cmdValidateFindings`)
- Modify: `skills/recon/SKILL.md` (Step 1, Step 9.5, Anti-Patterns table)
- Modify: `bin/lib/recon/tests/cli-validate-findings.test.js` (new tests + 4 existing-test fixups)
- Modify: `bin/lib/recon/tests/skill-md.test.js` (add this task's tokens to the required-token array)

**Interfaces:**
- Consumes: `args.dryRun` (boolean), `args.slice` (string|undefined) — both already parsed by `parseArgs` in `bin/recon.js`.
- Produces: `validate-findings` exits with code `2` when `--slice` is missing on a non-`--dry-run` call. (`--run-id` already defaults to an ISO timestamp in `parseArgs`, so it is never actually missing — no check needed for it; see Step 1's note.)

- [ ] **Step 1: Write the failing tests**

In `bin/lib/recon/tests/cli-validate-findings.test.js`, add at the end of the file:

```js

// ── Persistence hardening: --slice required for a real run ──────────────────

test('validate-findings: exits 2 when --slice is missing on a non-dry-run call', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--run-id', 'r-no-slice']);
  assert.strictEqual(result.status, 2, `expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('--slice'), `expected --slice mentioned in stderr: ${result.stderr}`);
});

test('validate-findings: --dry-run without --slice still succeeds (preview mode unaffected)', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `node --test bin/lib/recon/tests/cli-validate-findings.test.js`
Expected: the first new test FAILs (`validate-findings` currently exits 0 without `--slice`). The second new test already PASSes (dry-run already works without `--slice`) — that's fine, it's a regression guard for Step 3.

- [ ] **Step 3: Implement the hard-fail**

In `bin/recon.js`, find (this is the block Task 1's Step 1 already edited — match on the closing brace of the usage check):

```js
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-severity <level>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
```

Replace with:

```js
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-severity <level>] [--dry-run]\n',
    );
    process.exit(2);
  }

  if (!args.dryRun && !args.slice) {
    process.stderr.write(
      'validate-findings: --slice is required for a real (non-dry-run) run — without it, ' +
      'the round-robin cursor for this slice never persists and rotation state silently drifts. ' +
      'Pass --dry-run to preview without it.\n',
    );
    process.exit(2);
  }

  let raw;
```

- [ ] **Step 4: Run the new tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/cli-validate-findings.test.js`
Expected: several EXISTING tests now fail (they call `validate-findings` for real without `--slice`) — expected at this point; fixed in Step 5.

- [ ] **Step 5: Fix the 4 existing tests broken by the hard-fail**

In `bin/lib/recon/tests/cli-validate-findings.test.js`, find:

```js
test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
```

Replace with:

```js
test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-basic']);
```

Find:

```js
test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({
    criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused', severity: 'high',
  });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
```

Replace with:

```js
test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({
    criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused', severity: 'high',
  });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/util', '--run-id', 'r-malformed']);
```

Find:

```js
test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  // First run to learn the fingerprint.
  const firstResult = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(firstResult.stdout);
  assert.strictEqual(firstPayloads.length, 1);
  const fp = firstPayloads[0].body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/)[1];

  // Build an issue index pretending the fingerprint is already open.
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['recon'], fingerprint: fp }]));

  const secondResult = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
```

Replace with:

```js
test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  // First run to learn the fingerprint.
  const firstResult = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-dedup-1']);
  const firstPayloads = JSON.parse(firstResult.stdout);
  assert.strictEqual(firstPayloads.length, 1);
  const fp = firstPayloads[0].body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/)[1];

  // Build an issue index pretending the fingerprint is already open.
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['recon'], fingerprint: fp }]));

  const secondResult = runValidateFindings(
    root, findingsFile, ['--issues', issuesFile, '--slice', 'src/api', '--run-id', 'r-dedup-2'],
  );
```

Find:

```js
test('validate-findings: writes cache after a non-dry-run', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
```

Replace with:

```js
test('validate-findings: writes cache after a non-dry-run', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-cache']);
```

- [ ] **Step 6: Run the full file to confirm everything passes**

Run: `node --test bin/lib/recon/tests/cli-validate-findings.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 7: Update SKILL.md Step 1 — spell out the `--budget > 1` multi-slice loop**

In `skills/recon/SKILL.md`, find:

```markdown
When `--area <path>` is provided, skip `next-slice` and use that path directly as the slice (manual override).

Verify the resolved path exists:
```

Replace with:

```markdown
**Multi-slice runs (`--budget > 1`):** `next-slice` returns a JSON **array** of up to `n` slices instead of a single object when `--budget` is passed. Treat each array entry as its own full sweep: run Steps 2–9 in their entirety for slice 1 (including its own `validate-findings --slice <id> --run-id <id>` call), then repeat the full Steps 2–9 for slice 2, and so on. Never collect findings from multiple slices into one shared `validate-findings` call — each slice needs its own `--slice` value so its cursor persists independently. A run that judges 3 slices makes 3 separate `validate-findings` invocations, not 1.

When `--area <path>` is provided, skip `next-slice` and use that path directly as the slice (manual override).

Verify the resolved path exists:
```

- [ ] **Step 8: Update SKILL.md Step 9.5 — document the hard-fail and add the mandatory readback check**

In `skills/recon/SKILL.md`, find:

```markdown
**Step 9.5 — Confirm cursor + run-log persistence.**

When `validate-findings` is called with `--slice <id>` and `--run-id <id>` on a real (non-`--dry-run`) run, the engine:
- Writes the run's fingerprint set to `.claude-tweaks/recon/runs/<run-id>.json` (used by `churn-report`).
- Records the slice's content-hash (`lastHash`) and sweep timestamp (`lastSweptMs`) to `.claude-tweaks/recon/cursors.json`.

The next `next-slice` call will read these cursors and skip the slice unless its source files have changed since `lastHash` was recorded, or more than 30 days have passed (`stale` threshold). Without `--slice`, only the run-log is written and no cursor is updated (the slice remains eligible for re-selection).

In `--dry-run` mode, neither the run-log nor the cursors are written — the run is truly a no-op for all persistence.
```

Replace with:

```markdown
**Step 9.5 — Confirm cursor + run-log persistence.**

`validate-findings` requires `--slice <id>` on a real (non-`--dry-run`) run — it exits 2 without it (Step 8). Given `--slice` and `--run-id`, the engine:
- Writes the run's fingerprint set to `.claude-tweaks/recon/runs/<run-id>.json` (used by `churn-report`).
- Records the slice's content-hash (`lastHash`) and sweep timestamp (`lastSweptMs`) to `.claude-tweaks/recon/cursors.json`.

The next `next-slice` call will read these cursors and skip the slice unless its source files have changed since `lastHash` was recorded, or more than 30 days have passed (`stale` threshold).

**Mandatory readback check:** immediately after a real (non-`--dry-run`) `validate-findings` call, read `.claude-tweaks/recon/cursors.json` and confirm the just-swept slice id now has a `lastSweptMs` from this run (within the last few minutes). If it's missing or stale, **do not report the sweep as complete** — tell the user the persistence write appears to have failed (permissions, disk, or an unexpected error the engine logged to stderr as non-fatal) before proceeding. This is the safety net for the one failure mode no CLI flag can prevent: filing issues from a `--dry-run` preview without ever making the matching real call.

In `--dry-run` mode, neither the run-log nor the cursors are written — the run is truly a no-op for all persistence, and this readback check does not apply.
```

- [ ] **Step 9: Add a new Anti-Patterns row**

In `skills/recon/SKILL.md`, find the Anti-Patterns table row:

```markdown
| Skipping the verify gate before filing | Files plausible-but-wrong findings. Every surviving finding must pass all three verify questions — real, actionable, reproducible — before reaching dedup. |
```

Replace with:

```markdown
| Skipping the verify gate before filing | Files plausible-but-wrong findings. Every surviving finding must pass all three verify questions — real, actionable, reproducible — before reaching dedup. |
| Filing `gh issue create` directly off a `--dry-run` payload without a matching non-`--dry-run` `validate-findings` call | Breaks rotation state silently — cursors and the run-log never persist, so `next-slice` re-selects the same slice next time. Always follow a `--dry-run` preview with the real call before filing. |
```

- [ ] **Step 10: Add this task's tokens to skill-md.test.js's required-token check**

In `bin/lib/recon/tests/skill-md.test.js`, find:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
].forEach((token) => {
```

Replace with:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
 'Multi-slice runs', 'Mandatory readback check',
].forEach((token) => {
```

- [ ] **Step 11: Run the full recon test suite**

Run: `node --test bin/lib/recon/tests/*.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 12: Commit**

```bash
git add bin/recon.js skills/recon/SKILL.md bin/lib/recon/tests/cli-validate-findings.test.js bin/lib/recon/tests/skill-md.test.js
git commit -m "Hard-fail recon validate-findings without --slice on a real run; document the readback check"
```

---

### Task 4: Workspace-aware slicing — parse and expand workspace manifests

**Files:**
- Modify: `bin/lib/recon/scope.js`
- Modify: `bin/lib/recon/tests/scope.test.js`

**Interfaces:**
- Produces: `listWorkspaceSlices(root)` → `Array<{id: string, path: string}>`. Empty array when no `package.json#workspaces` field and no `pnpm-workspace.yaml` exist, or when neither declares any resolvable pattern. Exported alongside the existing `listSlices`, `contentHash`, `selectSlice`.
- Consumed by: Task 5 (`listSlices` wiring).

- [ ] **Step 1: Write the failing tests**

In `bin/lib/recon/tests/scope.test.js`, add after the existing `require` lines at the top:

```js
const { listSlices, contentHash, selectSlice, listWorkspaceSlices } = require('../scope');
```

(This replaces the existing import line — see Step 3 for the exact find/replace, since `listWorkspaceSlices` doesn't exist yet and this line will fail to destructure it as `undefined` otherwise; the test calls below would then throw `TypeError: listWorkspaceSlices is not a function`, which is the expected failing state for this step.)

Add at the end of the file:

```js

// ─── Workspace-aware slicing: listWorkspaceSlices ─────────────────────────────

test('listWorkspaceSlices: expands a package.json workspaces array with a trailing /* pattern', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages', 'b'), { recursive: true });
  const ids = listWorkspaceSlices(root).map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['packages/a', 'packages/b']);
});

test('listWorkspaceSlices: expands the package.json workspaces.packages object form', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: { packages: ['apps/*'] } }));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  const ids = listWorkspaceSlices(root).map((s) => s.id);
  assert.deepStrictEqual(ids, ['apps/web']);
});

test('listWorkspaceSlices: accepts a literal (non-glob) package path', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['tools/cli'] }));
  fs.mkdirSync(path.join(root, 'tools', 'cli'), { recursive: true });
  const ids = listWorkspaceSlices(root).map((s) => s.id);
  assert.deepStrictEqual(ids, ['tools/cli']);
});

test('listWorkspaceSlices: a literal pattern pointing at a non-existent path yields nothing', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['tools/missing'] }));
  assert.deepStrictEqual(listWorkspaceSlices(root), []);
});

test('listWorkspaceSlices: reads pnpm-workspace.yaml when package.json has no workspaces field', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }));
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "apps/*"\n');
  fs.mkdirSync(path.join(root, 'packages', 'db'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  const ids = listWorkspaceSlices(root).map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['apps/web', 'packages/db']);
});

test('listWorkspaceSlices: package.json workspaces field takes precedence over pnpm-workspace.yaml', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  fs.writeFileSync(root && path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
  fs.mkdirSync(path.join(root, 'packages', 'db'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  const ids = listWorkspaceSlices(root).map((s) => s.id);
  assert.deepStrictEqual(ids, ['packages/db'], 'package.json must win when both manifests exist');
});

test('listWorkspaceSlices: unsupported pattern (double-star) is skipped, not thrown', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/**'] }));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  assert.doesNotThrow(() => listWorkspaceSlices(root));
  assert.deepStrictEqual(listWorkspaceSlices(root), []);
});

test('listWorkspaceSlices: returns [] when neither package.json nor pnpm-workspace.yaml exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listWorkspaceSlices(root), []);
});

test('listWorkspaceSlices: returns [] when package.json has no workspaces field', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  assert.deepStrictEqual(listWorkspaceSlices(root), []);
});

test('listWorkspaceSlices: slice.path is the absolute path to the expanded package', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(root, 'packages', 'db'), { recursive: true });
  const slice = listWorkspaceSlices(root).find((s) => s.id === 'packages/db');
  assert.ok(slice, 'packages/db slice must exist');
  assert.strictEqual(slice.path, path.join(root, 'packages', 'db'));
});
```

- [ ] **Step 2: Fix the malformed `writeFileSync` call from Step 1**

The `pnpm-workspace.yaml` precedence test above has a typo (`root && path.join(...)` instead of `path.join(...)`). In `bin/lib/recon/tests/scope.test.js`, find:

```js
  fs.writeFileSync(root && path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
```

Replace with:

```js
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
```

- [ ] **Step 3: Update the import line, then run to confirm every new test fails**

In `bin/lib/recon/tests/scope.test.js`, find:

```js
const { listSlices, contentHash, selectSlice } = require('../scope');
```

Replace with:

```js
const { listSlices, contentHash, selectSlice, listWorkspaceSlices } = require('../scope');
```

Run: `node --test bin/lib/recon/tests/scope.test.js`
Expected: FAIL — every new `listWorkspaceSlices` test throws `TypeError: listWorkspaceSlices is not a function`. Pre-existing tests still pass.

- [ ] **Step 4: Implement `listWorkspaceSlices` and its helpers**

In `bin/lib/recon/scope.js`, find:

```js
// ─── selectSlice ─────────────────────────────────────────────────────────────
```

Insert immediately before it (keeping `selectSlice` and everything after untouched):

```js
// ─── Workspace-aware slicing ─────────────────────────────────────────────────
// Reads package.json#workspaces (array or {packages:[...]} form) or, failing
// that, pnpm-workspace.yaml's `packages:` list, and expands each pattern to its
// member packages. Minimal glob support by design — no new dependency:
//   "<dir>/*"   → every immediate subdirectory of <dir> becomes its own slice
//   "<literal>" → that exact path becomes one slice (existence-checked)
//   anything else (**, negation, multiple wildcards) → skipped, logged to stderr
function readWorkspacePatterns(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages;
  } catch { /* no package.json, or no usable workspaces field — fall through to pnpm */ }

  try {
    const yaml = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const patterns = [];
    let inPackages = false;
    for (const line of yaml.split('\n')) {
      if (/^packages:\s*$/.test(line.trim())) { inPackages = true; continue; }
      if (!inPackages) continue;
      const m = line.match(/^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/);
      if (m) { patterns.push(m[1]); continue; }
      if (line.trim() !== '' && !/^[\s-]/.test(line)) inPackages = false;
    }
    return patterns;
  } catch {
    return [];
  }
}

function expandWorkspacePattern(root, pattern) {
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  const hasOtherSpecial = /[!{}?]/.test(pattern);

  if (wildcardCount === 0 && !hasOtherSpecial) {
    const abs = path.join(root, pattern);
    try {
      if (fs.statSync(abs).isDirectory()) return [{ id: pattern, path: abs }];
    } catch { /* pattern names a path that doesn't exist */ }
    return [];
  }

  if (wildcardCount === 1 && !hasOtherSpecial && pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2); // strip trailing "/*"
    const absPrefix = path.join(root, prefix);
    let entries;
    try { entries = fs.readdirSync(absPrefix, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ id: `${prefix}/${e.name}`, path: path.join(absPrefix, e.name) }));
  }

  process.stderr.write(
    `[recon] scope: skipping unsupported workspace pattern "${pattern}" ` +
    '(only "<dir>/*" and literal paths are supported)\n',
  );
  return [];
}

// Returns [] when no workspace manifest exists or none of its patterns resolve.
function listWorkspaceSlices(root) {
  const patterns = readWorkspacePatterns(root);
  const slices = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const slice of expandWorkspacePattern(root, pattern)) {
      if (seen.has(slice.id)) continue;
      seen.add(slice.id);
      slices.push(slice);
    }
  }
  return slices;
}

// ─── selectSlice ─────────────────────────────────────────────────────────────
```

- [ ] **Step 5: Export the new function**

In `bin/lib/recon/scope.js`, find:

```js
module.exports = { listSlices, contentHash, selectSlice };
```

Replace with:

```js
module.exports = { listSlices, contentHash, selectSlice, listWorkspaceSlices };
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/scope.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/recon/scope.js bin/lib/recon/tests/scope.test.js
git commit -m "Add workspace-manifest parsing to recon's scope engine"
```

---

### Task 5: Workspace-aware slicing — wire into `listSlices`

**Files:**
- Modify: `bin/lib/recon/scope.js` (`listSlices`)
- Modify: `bin/lib/recon/tests/scope.test.js`

**Interfaces:**
- Consumes: `listWorkspaceSlices(root)` from Task 4.
- Produces: `listSlices(root)` now returns workspace-expanded slices in place of any top-level directory covered by a workspace pattern, while still including uncovered top-level directories and `.` exactly as before.

- [ ] **Step 1: Write the failing tests**

In `bin/lib/recon/tests/scope.test.js`, add after the `listSlices` test block (right before the `// ─── contentHash ───` comment):

```js

test('listSlices: a workspace-covered top-level dir is replaced by its expanded children', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages', 'b'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true }); // not covered by any workspace pattern
  const ids = listSlices(root).map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['.', 'docs', 'packages/a', 'packages/b']);
  assert.ok(!ids.includes('packages'), 'the raw "packages" mega-slice must not also appear');
});

test('listSlices: falls back to one-level behavior when no workspace manifest exists', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'lib'));
  const ids = listSlices(root).map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['.', 'lib', 'src']);
});

test('listSlices: a workspace-expanded slice.path is the absolute path to the package', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(root, 'packages', 'db'), { recursive: true });
  const slice = listSlices(root).find((s) => s.id === 'packages/db');
  assert.ok(slice, 'packages/db slice must exist');
  assert.strictEqual(slice.path, path.join(root, 'packages', 'db'));
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test bin/lib/recon/tests/scope.test.js`
Expected: the first new test FAILs (currently `listSlices` returns `['.', 'docs', 'packages']`, not the expanded children). The second and third new tests already PASS against the current implementation — that's expected, they're regression guards confirmed green both before and after Step 3.

- [ ] **Step 3: Implement the wiring**

In `bin/lib/recon/scope.js`, find:

```js
// ─── listSlices ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for . (root) plus each immediate non-SKIP subdir.
function listSlices(root) {
  const slices = [{ id: '.', path: root }];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return slices; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    slices.push({ id: entry.name, path: path.join(root, entry.name) });
  }
  return slices;
}
```

Replace with:

```js
// ─── listSlices ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for . (root), each immediate non-SKIP subdir NOT covered
// by a workspace manifest, plus every workspace-expanded package slice. A
// top-level dir covered by a workspace pattern (e.g. "packages" when
// "packages/*" is declared) is replaced by its expanded children rather than
// also appearing as its own mega-slice. Repos with no workspace manifest keep
// today's exact one-level-deep behavior.
function listSlices(root) {
  const slices = [{ id: '.', path: root }];
  const workspaceSlices = listWorkspaceSlices(root);
  const coveredTopLevel = new Set(workspaceSlices.map((s) => s.id.split('/')[0]));
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return slices; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (coveredTopLevel.has(entry.name)) continue;
    slices.push({ id: entry.name, path: path.join(root, entry.name) });
  }
  slices.push(...workspaceSlices);
  return slices;
}
```

Note: `listWorkspaceSlices` is defined later in this same file (Task 4 placed it between `listSlices` and `selectSlice`). JavaScript function declarations are hoisted, so `listSlices` calling `listWorkspaceSlices` above its own definition point in the file is valid — no reordering needed.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/scope.test.js`
Expected: PASS, 0 failures, including all pre-existing tests (they never write a `package.json`, so `listWorkspaceSlices` returns `[]` for them and `listSlices` behaves exactly as before).

- [ ] **Step 5: Run the full recon suite**

Run: `node --test bin/lib/recon/tests/*.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/recon/scope.js bin/lib/recon/tests/scope.test.js
git commit -m "Wire workspace-aware slicing into recon's listSlices"
```

---

### Task 6: Bundled findings — `relatedAnchors` schema field

**Files:**
- Modify: `bin/lib/recon/validate-finding.js` (`validateFindingV2`)
- Modify: `bin/lib/recon/tests/validate-finding.test.js`

**Interfaces:**
- Produces: `validateFindingV2(obj)` accepts an optional `obj.relatedAnchors: string[]` — when present, must be a non-empty-string array or the finding is dropped with a named error; when absent, unaffected (existing behavior).
- Consumed by: Task 7 (`toIssuePayloadV2` rendering).

- [ ] **Step 1: Write the failing tests**

In `bin/lib/recon/tests/validate-finding.test.js`, add at the end of the file:

```js

// ── relatedAnchors (bundled findings) ────────────────────────────────────────

test('validateFindingV2: relatedAnchors is optional — absent is valid', () => {
  const result = validateFindingV2(validV2Finding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedAnchors, undefined);
});

test('validateFindingV2: relatedAnchors accepted when present as an array of non-empty strings', () => {
  const result = validateFindingV2(validV2Finding({
    relatedAnchors: ['src/api/other.js#getOther', 'src/api/third.js#getThird'],
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedAnchors, ['src/api/other.js#getOther', 'src/api/third.js#getThird']);
});

test('validateFindingV2: relatedAnchors fails when not an array', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: 'src/api/other.js#getOther' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});

test('validateFindingV2: relatedAnchors fails when it contains an empty string', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: ['src/a.js#a', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});

test('validateFindingV2: relatedAnchors fails when it contains a non-string entry', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: ['src/a.js#a', 42] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test bin/lib/recon/tests/validate-finding.test.js`
Expected: the 3 failure-case tests FAIL (current `validateFindingV2` silently accepts any `relatedAnchors` shape via `{...obj}`, so `result.ok` is `true` when it should be `false`). The first 2 tests already PASS.

- [ ] **Step 3: Implement the field validation**

In `bin/lib/recon/validate-finding.js`, find:

```js
function validateFindingV2(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of V2_REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  // Criterion must be a known catalog id (only check when it passed the string check).
```

Replace with:

```js
function validateFindingV2(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of V2_REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  // relatedAnchors is optional: when present, every entry must be a non-empty string
  // (same shape as `anchor` — sibling occurrences of the same root cause).
  if (obj.relatedAnchors !== undefined) {
    const isValidArray = Array.isArray(obj.relatedAnchors) &&
      obj.relatedAnchors.every((a) => typeof a === 'string' && a.trim() !== '');
    if (!isValidArray) {
      errors.push(`relatedAnchors: when present, must be an array of non-empty strings (got ${JSON.stringify(obj.relatedAnchors)})`);
    }
  }

  // Criterion must be a known catalog id (only check when it passed the string check).
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/validate-finding.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/recon/validate-finding.js bin/lib/recon/tests/validate-finding.test.js
git commit -m "Accept an optional relatedAnchors field on v2 findings"
```

---

### Task 7: Bundled findings — render `relatedAnchors` in the issue body

**Files:**
- Modify: `bin/lib/recon/issue-payload.js` (`toIssuePayloadV2`)
- Modify: `bin/lib/recon/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: `finding.relatedAnchors` (optional `string[]`, from Task 6).
- Produces: `toIssuePayloadV2(finding).body` includes an `Also affects: ...` line under `## Current State` when `relatedAnchors` is a non-empty array; omits it otherwise. No change to `toIssuePayloadV2`'s return shape (`{title, body, labels}`).

- [ ] **Step 1: Write the failing tests**

In `bin/lib/recon/tests/issue-payload.test.js`, add at the end of the file:

```js

// ── relatedAnchors rendering (bundled findings) ──────────────────────────────

test('v2 body includes an "Also affects" line when relatedAnchors is present', () => {
  const finding = { ...V2_FINDING, relatedAnchors: ['src/api/other.js#getOther', 'src/api/third.js#getThird'] };
  const { body } = toIssuePayloadV2(finding);
  assert.ok(body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(body.includes('`src/api/other.js#getOther`'));
  assert.ok(body.includes('`src/api/third.js#getThird`'));
});

test('v2 body omits "Also affects" when relatedAnchors is absent', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(!body.includes('Also affects:'));
});

test('v2 body omits "Also affects" when relatedAnchors is an empty array', () => {
  const { body } = toIssuePayloadV2({ ...V2_FINDING, relatedAnchors: [] });
  assert.ok(!body.includes('Also affects:'));
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test bin/lib/recon/tests/issue-payload.test.js`
Expected: the first new test FAILs (`body` has no `Also affects:` text yet). The other two already PASS.

- [ ] **Step 3: Implement the rendering**

In `bin/lib/recon/issue-payload.js`, find:

```js
// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).
// Labels include the criterion.
function toIssuePayloadV2(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
    '',
    finding.evidence,
```

Replace with:

```js
// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).
// Labels include the criterion.
function toIssuePayloadV2(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
  const relatedLines = Array.isArray(finding.relatedAnchors) && finding.relatedAnchors.length > 0
    ? ['', `Also affects: ${finding.relatedAnchors.map((a) => `\`${a}\``).join(', ')}`]
    : [];
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
    ...relatedLines,
    '',
    finding.evidence,
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test bin/lib/recon/tests/issue-payload.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/recon/issue-payload.js bin/lib/recon/tests/issue-payload.test.js
git commit -m "Render relatedAnchors as an Also-affects list in v2 issue bodies"
```

---

### Task 8: Bundled findings — SKILL.md bundling rule

**Files:**
- Modify: `skills/recon/SKILL.md` (Step 6's finding shape, Anti-Patterns table)
- Modify: `bin/lib/recon/tests/skill-md.test.js` (add this task's tokens to the required-token array)

**Interfaces:**
- Consumes: `relatedAnchors` field from Task 6, rendering from Task 7.
- Produces: judge-facing instructions telling the LLM when to bundle vs. split recurring findings. No code interface — this task is documentation only.

- [ ] **Step 1: Add `relatedAnchors` to the Step 6 finding shape and the bundling rule**

In `skills/recon/SKILL.md`, find:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "severity": "<low|medium|high|critical>",
  "confidence": "<high|med|low>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Anchor rules (critical for dedup stability):**
```

Replace with:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "relatedAnchors": "<optional array of relfile#NearestNamedSymbol strings — sibling occurrences of the same root cause; omit if there's only one occurrence>",
  "severity": "<low|medium|high|critical>",
  "confidence": "<high|med|low>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Bundling rule (recurring root causes):** when the same criterion and the same suggested fix recur at multiple call sites within the slice being judged, file **one** finding, not one per call site. Pick the clearest/most representative occurrence as the primary `anchor`; list every other occurrence in `relatedAnchors`; make `evidence` enumerate all occurrences; make `acceptance` require all of them fixed, not just the primary. Only bundle occurrences that share both the criterion AND the fix — do not bundle unrelated findings under one anchor just because they're nearby in the same file or directory.

**Anchor rules (critical for dedup stability):**
```

- [ ] **Step 2: Add a new Anti-Patterns row**

In `skills/recon/SKILL.md`, find:

```markdown
| Filing `gh issue create` directly off a `--dry-run` payload without a matching non-`--dry-run` `validate-findings` call | Breaks rotation state silently — cursors and the run-log never persist, so `next-slice` re-selects the same slice next time. Always follow a `--dry-run` preview with the real call before filing. |
```

Replace with:

```markdown
| Filing `gh issue create` directly off a `--dry-run` payload without a matching non-`--dry-run` `validate-findings` call | Breaks rotation state silently — cursors and the run-log never persist, so `next-slice` re-selects the same slice next time. Always follow a `--dry-run` preview with the real call before filing. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied at N call sites. Use `relatedAnchors` to cover every occurrence in a single finding instead. |
```

- [ ] **Step 3: Add this task's tokens to skill-md.test.js's required-token check**

In `bin/lib/recon/tests/skill-md.test.js`, find:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
 'Multi-slice runs', 'Mandatory readback check',
].forEach((token) => {
```

Replace with:

```js
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
 'Multi-slice runs', 'Mandatory readback check', 'relatedAnchors', 'Bundling rule',
].forEach((token) => {
```

- [ ] **Step 4: Run the full recon test suite**

Run: `npm test`
Expected: PASS, 0 failures across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add skills/recon/SKILL.md bin/lib/recon/tests/skill-md.test.js
git commit -m "Document recon's bundling rule for recurring root-cause findings"
```

---

### Task 9: Backlog reconciliation — one-time `/tidy` pass

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: the `recon:low` / `recon:medium` / `recon:high` / `recon:critical` severity labels already filed on existing issues, and the `recon` label itself.
- Produces: judge-facing instructions for `/tidy` to relabel `recon:low`/`recon:medium` open issues to `recon:remembered` (with an explanatory comment) during its existing Step 4.8 sweep. No code interface — documentation only, and deliberately separate from the shared `_shared/github-pr-scan.md` file (which both `/tidy` and skill-health's audits consume) so this recon-severity-specific behavior doesn't leak into skill-health's issue walk.

- [ ] **Step 1: Read the current Step 4.8 section for exact insertion context**

In `skills/tidy/scan-procedures.md`, locate:

```markdown
## Step 4.8: Audit GitHub PRs and Issues

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope. The dispatcher inlines that file's Detection Ladder, `repo-wide` scope section (including its findings table), and Output Contract into this agent's prompt. The detection ladder makes this fail-open — skip with a single info row when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon or skill-health issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).

GitHub mutations recommended here (Close (GitHub), Resolve thread) execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
```

- [ ] **Step 2: Insert the one-time reconciliation subsection**

In `skills/tidy/scan-procedures.md`, find:

```markdown
→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

## Step 5: Spec Sizing Review
```

Replace with:

```markdown
→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

### Step 4.8a: Recon severity-policy reconciliation (one-time)

Recon's default filing threshold changed to high/critical only (`/claude-tweaks:recon`'s `--min-severity`, default `high`) — issues filed before that change may still carry `recon:low` or `recon:medium` from when everything filed regardless of severity. This is a one-time backstop, not a recurring behavior: once an issue is relabelled `recon:remembered`, it's excluded from this check on every future `/tidy` run (see the query below), so this step is self-limiting and naturally becomes a no-op once the existing backlog is caught up.

Scoped strictly to issues carrying the `recon` label — this does not touch skill-health-labelled issues or any other tracker content.

```bash
gh issue list --label recon --state open --json number,title,labels \
  --jq '.[] | select((.labels | map(.name) | any(. == "recon:low" or . == "recon:medium")) and (.labels | map(.name) | any(. == "recon:remembered") | not))'
```

For each issue this returns:
- Add the `recon:remembered` label.
- Comment: `Relabelled to recon:remembered — recon's default filing threshold is now high/critical only; this issue predates that change. Still valid work, just not held to the same urgency as a fresh high/critical finding.`

This mutation follows the same staged/batch-approval path as the rest of Step 4.8 — it is proposed here, not applied until Step 6 batch approval, and is staged at every aggressiveness level in auto mode.

→ Collect each as: `[gh-issue] #{n}: {title} — recon:remembered backfill — Relabel + comment (severity-policy reconciliation)`

## Step 5: Spec Sizing Review
```

- [ ] **Step 3: Verify the edit landed correctly**

Run: `grep -n "Step 4.8a" "skills/tidy/scan-procedures.md"`
Expected: one match, on the new `### Step 4.8a: Recon severity-policy reconciliation (one-time)` heading.

Run: `grep -c "recon:remembered" "skills/tidy/scan-procedures.md"`
Expected: `3` (the label add instruction, the `--jq` filter, and the comment body).

- [ ] **Step 4: Run the full test suite as a final regression check**

Run: `npm test`
Expected: PASS, 0 failures. (No test file covers `scan-procedures.md` content directly — this step confirms the doc-only edit didn't break anything else.)

- [ ] **Step 5: Commit**

```bash
git add skills/tidy/scan-procedures.md
git commit -m "Add one-time recon severity-policy backlog reconciliation to /tidy Step 4.8"
```

---

## Post-plan verification

After all 9 tasks are committed, run the full suite once more end to end:

```bash
npm test
```

Expected: PASS, 0 failures. Then spot-check the workspace-slicing change against a real monorepo shape (this plan's tests use synthetic tmp dirs only):

```bash
node -e "
const { listSlices } = require('./bin/lib/recon/scope');
const fs = require('fs'); const os = require('os'); const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-smoke-'));
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }));
for (const p of ['apps/web', 'apps/ingestion', 'packages/database', 'packages/ai']) fs.mkdirSync(path.join(root, p), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
console.log(listSlices(root).map(s => s.id).sort());
"
```

Expected output: `[ '.', 'apps/ingestion', 'apps/web', 'docs', 'packages/ai', 'packages/database' ]` — no `'apps'` or `'packages'` mega-slice.
