'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PENDING_WRITE_PREFIX, RETRY_INPUT_PREFIX } = require('../mcp-pending');

const BIN = path.resolve(__dirname, '..', '..', '..');

// REGRESSION: the pending-MCP-write signal used to be written to STDOUT, on
// top of the payloads array each validate-findings run also writes there
// unconditionally. The actual bytes a calling skill captured were therefore
// `{"needsMcpWrite":...}\n[...]\n` — not valid JSON, corrupting the
// /tmp/{skill}-payloads.json file every one of these skills redirects stdout
// into. The signal now goes to stderr, prefixed, and stdout carries the
// payloads array and nothing else.
//
// gh is forced "unavailable" by running each CLI with a PATH containing
// nothing at all, which is what durable-state.js's hasGh() probe (`gh
// --version` through execFileSync) actually keys off — no injection hook
// exists at the CLI process boundary. git disappears from PATH too, which is
// harmless: every git call in the durable-state read path already degrades to
// its empty default when git fails, exactly as it would on a first-ever run
// against a branch that doesn't exist yet.
function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pending-'));
}

function runWithoutGh(cli, cliArgs, root) {
  const emptyBin = path.join(root, 'empty-bin');
  fs.mkdirSync(emptyBin, { recursive: true });
  return spawnSync(
    // process.execPath, not 'node' — PATH is deliberately empty below, so the
    // interpreter itself has to be named by absolute path.
    process.execPath,
    [path.join(BIN, cli), ...cliArgs],
    { encoding: 'utf8', env: { ...process.env, PATH: emptyBin } },
  );
}

const ENGINES = [
  {
    name: 'code-health',
    cli: 'code-health.js',
    extraArgs: ['--slice', '.', '--run-id', 'r-mcp'],
    // areaId '.' resolves the slice path to root itself, which exists, so
    // contentHash has something real to hash.
    setup: (root) => fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n'),
    finding: {
      criterion: 'simplification',
      areaId: '.',
      anchor: 'index.js#getUser',
      severity: 'high',
      confidence: 'high',
      likelihood: 'medium',
      effort: 'medium',
      title: 'getUser is a passthrough',
      evidence: 'getUser delegates directly to UserRepository.find with no added logic.',
      suggestedApproach: 'Inline the call or add caching.',
      acceptance: 'getUser adds caching or is removed.',
    },
    retryInputKeys: ['areasSwept', 'hashes', 'rememberCandidates', 'runRecord'],
  },
  {
    name: 'harness-health',
    rerunLosesFindings: true,
    cli: 'harness-health.js',
    extraArgs: ['--target', 'auth', '--kind', 'skill', '--run-id', 'r-mcp'],
    finding: {
      kind: 'patch',
      target: 'auth',
      assetType: 'skill',
      category: 'drift',
      section: 'Key Patterns',
      classification: 'restructural',
      confidence: 'high',
      reversibility: 'med',
      description: 'Stale example path',
      oldString: 'See `src/auth/login.js`.',
      newString: 'See `src/auth/session.js`.',
      reason: 'login.js was renamed to session.js.',
    },
    retryInputKeys: ['target', 'kind', 'runRecord', 'rememberCandidates'],
  },
  {
    name: 'journey-health',
    rerunLosesFindings: true,
    cli: 'journey-health.js',
    extraArgs: ['--target', 'checkout-flow', '--tier', 'light', '--run-id', 'r-mcp'],
    finding: {
      journey: 'checkout-flow',
      category: 'drift',
      section: 'self-review',
      description: 'Persona is a placeholder',
      reason: 'Step 2 has no named persona',
      confidence: 'high',
      severity: 'high',
      recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    },
    retryInputKeys: ['target', 'tier', 'runRecord'],
  },
  {
    name: 'docs-health',
    rerunLosesFindings: true,
    cli: 'docs-health.js',
    extraArgs: ['--target', 'decisions/0007-foo', '--run-id', 'r-mcp'],
    finding: {
      target: 'decisions/0007-foo',
      assetType: 'doc',
      category: 'staleness',
      section: 'Freshness',
      misleads: 'agent',
      classification: 'restructural',
      confidence: 'high',
      reversibility: 'med',
      description: 'Stated skill count is stale',
      oldString: 'This project ships 12 skills.',
      newString: 'This project ships 14 skills.',
      reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    },
    retryInputKeys: ['target', 'runRecord', 'rememberCandidates'],
  },
];

function prefixedLine(stderr, prefix) {
  const line = stderr.split('\n').find((l) => l.startsWith(`${prefix}: `));
  return line ? line.slice(prefix.length + 2) : null;
}

function runPendingValidateFindings(engine) {
  const root = tmp();
  if (engine.setup) engine.setup(root);
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([engine.finding]));
  const result = runWithoutGh(
    engine.cli,
    ['validate-findings', findingsFile, '--root', root, ...engine.extraArgs],
    root,
  );
  return { root, result };
}

for (const engine of ENGINES) {
  test(`${engine.name} validate-findings: a pending MCP write leaves stdout carrying the payloads array alone`, () => {
    const { result } = runPendingValidateFindings(engine);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    let payloads;
    assert.doesNotThrow(
      () => { payloads = JSON.parse(result.stdout); },
      `stdout must stay parseable as a single JSON document; got: ${result.stdout}`,
    );
    assert.ok(Array.isArray(payloads), 'stdout must be the payloads array');
    assert.strictEqual(payloads.length, 1, 'the finding must still be emitted as a payload');
    assert.ok(
      !result.stdout.includes('needsMcpWrite') && !result.stdout.includes(PENDING_WRITE_PREFIX),
      `the pending-write signal must never reach stdout; got: ${result.stdout}`,
    );
  });

  test(`${engine.name} validate-findings: a pending MCP write is signalled on stderr, prefixed and parseable`, () => {
    const { result } = runPendingValidateFindings(engine);
    const json = prefixedLine(result.stderr, PENDING_WRITE_PREFIX);
    assert.ok(json, `expected a ${PENDING_WRITE_PREFIX} line on stderr; got: ${result.stderr}`);
    const signal = JSON.parse(json);
    assert.strictEqual(signal.branch, 'health-state');
    assert.ok(Array.isArray(signal.files) && signal.files.length > 0, 'signal must carry the files to write');
    for (const f of signal.files) {
      assert.ok(f.path.startsWith(`${engine.name}/`), `file paths must be namespaced per skill; got ${f.path}`);
      assert.strictEqual(typeof f.content, 'string');
    }
  });
}

// --- C3: the retry input the calling skill feeds back to retry-durable-write ---

for (const engine of ENGINES) {
  test(`${engine.name} validate-findings: a pending MCP write also emits the retry input on stderr`, () => {
    const { result } = runPendingValidateFindings(engine);
    const json = prefixedLine(result.stderr, RETRY_INPUT_PREFIX);
    assert.ok(json, `expected a ${RETRY_INPUT_PREFIX} line on stderr; got: ${result.stderr}`);
    const input = JSON.parse(json);
    for (const key of engine.retryInputKeys) {
      assert.ok(key in input, `retry input must carry ${key} so a retry needs no recomputation; got ${json}`);
    }
    assert.ok(
      !result.stdout.includes(RETRY_INPUT_PREFIX),
      'the retry input must never reach stdout either',
    );
  });

  test(`${engine.name} retry-durable-write: re-applies the captured mutator input without re-running finding discovery`, () => {
    const { root, result } = runPendingValidateFindings(engine);
    const inputPath = path.join(root, 'retry-input.json');
    fs.writeFileSync(inputPath, prefixedLine(result.stderr, RETRY_INPUT_PREFIX));

    // Delete the local dedup cache validate-findings just wrote, so its
    // re-creation would be visible if retry-durable-write touched it.
    const cachePath = path.join(root, '.claude-tweaks', engine.name, 'cache.json');
    assert.ok(fs.existsSync(cachePath), 'sanity check: validate-findings wrote the local cache');
    fs.rmSync(cachePath);

    const retry = runWithoutGh(engine.cli, ['retry-durable-write', inputPath, '--root', root], root);
    assert.strictEqual(retry.status, 0, `stderr: ${retry.stderr}`);
    assert.strictEqual(retry.stdout, '', 'retry-durable-write must emit no payloads (it never discovers findings)');

    const json = prefixedLine(retry.stderr, PENDING_WRITE_PREFIX);
    assert.ok(json, `expected the same ${PENDING_WRITE_PREFIX} signal from the retry; got: ${retry.stderr}`);
    const signal = JSON.parse(json);
    assert.strictEqual(signal.branch, 'health-state');
    // Proving the captured input was actually re-applied, not merely that a
    // write of some shape was attempted: every engine's mutator input carries
    // this firing's runRecord, so the rebuilt runs.json must name its run id.
    const runsFile = signal.files.find((f) => f.path === `${engine.name}/runs.json`);
    assert.ok(runsFile, `expected ${engine.name}/runs.json in the retry's pending write`);
    const runs = JSON.parse(runsFile.content);
    assert.ok(
      runs.some((r) => r.runId === 'r-mcp'),
      `the retry must re-apply the captured mutator input, run record included; got ${runsFile.content}`,
    );

    assert.strictEqual(
      fs.existsSync(cachePath), false,
      'retry-durable-write must not touch cache.json — re-marking findings staged is exactly the bug it exists to avoid',
    );
    assert.ok(
      !retry.stderr.includes(RETRY_INPUT_PREFIX),
      'the retry command has nothing new to capture, so it must not re-emit a retry-input line',
    );
  });

  // The premise of the whole retry-durable-write split, asserted directly:
  // validate-findings marks its survivors `staged` in cache.json on the FIRST
  // invocation, so re-invoking it (the retry the procedure used to prescribe)
  // dedups them away and emits []. A retry loop redirecting each attempt into
  // the same payloads file overwrites real findings with that [].
  //
  // Only the three engines sharing health-core/dedup.js behave this way.
  // code-health forks that module (see bin/lib/code-health/dedup.js's header)
  // and consults the local cache only for `wontfix`, deduping everything else
  // against the gh-derived issue index instead — so its own re-run re-emits
  // the finding rather than losing it. Re-running it is still not a valid
  // retry (it re-appends this firing's run record and re-emits payloads the
  // caller may already have filed), just not via silent finding loss.
  if (engine.rerunLosesFindings) {
    test(`${engine.name} validate-findings: re-running it is NOT a valid retry — the second run emits []`, () => {
      const { root, result } = runPendingValidateFindings(engine);
      assert.strictEqual(JSON.parse(result.stdout).length, 1, 'sanity check: run 1 found something to file');

      const second = runWithoutGh(
        engine.cli,
        ['validate-findings', path.join(root, 'findings.json'), '--root', root, ...engine.extraArgs],
        root,
      );
      assert.deepStrictEqual(
        JSON.parse(second.stdout), [],
        're-running validate-findings must be shown to lose the findings — this is why retry-durable-write exists',
      );
    });
  }

  test(`${engine.name} retry-durable-write: exits 2 with a usage message when the input file is omitted`, () => {
    const root = tmp();
    const result = runWithoutGh(engine.cli, ['retry-durable-write', '--root', root], root);
    assert.strictEqual(result.status, 2, `expected exit 2; stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes('retry-durable-write'), `expected a usage message; got: ${result.stderr}`);
  });

  test(`${engine.name} retry-durable-write: exits 1 when the input file is missing or unparseable`, () => {
    const root = tmp();
    const result = runWithoutGh(engine.cli, ['retry-durable-write', path.join(root, 'nope.json'), '--root', root], root);
    assert.strictEqual(result.status, 1, `expected exit 1; stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes('could not read or parse'), `expected a parse error; got: ${result.stderr}`);
  });
}
