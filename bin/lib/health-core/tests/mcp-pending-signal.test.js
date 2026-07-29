'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PENDING_WRITE_PREFIX } = require('../mcp-pending');

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
  },
  {
    name: 'harness-health',
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
  },
  {
    name: 'journey-health',
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
  },
  {
    name: 'docs-health',
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
