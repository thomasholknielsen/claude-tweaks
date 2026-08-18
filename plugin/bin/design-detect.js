#!/usr/bin/env node
// bin/design-detect.js
//
// Deterministic re-implementation of design-wrapper's Layers 1-3 + track
// resolution (skills/design-wrapper/SKILL.md's "Universal preconditions"
// Step 1, and frontend-detection.md's Layer 3 sniff). All decision logic
// lives in bin/lib/design-detect — this file is argument parsing plus two
// file reads, the same shell-vs-logic split resolve-policy.js follows.
//
// Usage: design-detect.js --mode <mode> [--surface <value>]
//          [--files <f1,f2,...>] [--signals <path|->]
//          [--design-integration <value>] [--claude-md <path>]
//          [--platform <web|ios|android|adaptive>]
//
// Output: one JSON object on stdout — { decision: "proceed"|"skip",
// track?, reason?, surface_track_override? }. Never throws for an
// ordinary skip; exits 1 with a stderr message only for a malformed
// invocation (unknown --mode, no --mode at all).
'use strict';
const fs = require('fs');
const path = require('path');
const {
  evaluate,
  readDesignIntegrationFlagFromFile,
  MODE_LAYERS,
} = require('./lib/design-detect');

function fail(msg) {
  process.stderr.write(`design-detect: ${msg}\n`);
  process.exit(1);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const out = { mode: null, surface: null, files: [], signalsPath: null, designIntegration: null, claudeMdPath: null, platform: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--mode': out.mode = next(); break;
      case '--surface': out.surface = next(); break;
      case '--files': out.files = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--signals': out.signalsPath = next(); break;
      case '--design-integration': out.designIntegration = next(); break;
      case '--claude-md': out.claudeMdPath = next(); break;
      case '--platform': out.platform = next(); break;
      default: fail(`unknown argument "${a}"`);
    }
  }
  return out;
}

function repoRoot() {
  try {
    return require('child_process')
      .execFileSync('git', ['rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .trim();
  } catch {
    return process.cwd();
  }
}

function resolvePlatform(args) {
  if (args.platform) return args.platform;
  if (!args.signalsPath) return null;
  let raw;
  try {
    raw = args.signalsPath === '-' ? readStdin() : fs.readFileSync(args.signalsPath, 'utf8');
    const signals = JSON.parse(raw);
    return (signals && signals.setup && signals.setup.platform) || null;
  } catch {
    return null; // absent/malformed signals degrade to "no signals" — never a hard failure
  }
}

function resolveDesignIntegration(args) {
  if (args.designIntegration) return args.designIntegration;
  const root = args.claudeMdPath ? path.dirname(args.claudeMdPath) : repoRoot();
  if (args.claudeMdPath) {
    try {
      const { readDesignIntegrationFlag } = require('./lib/design-detect');
      return readDesignIntegrationFlag(fs.readFileSync(args.claudeMdPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return readDesignIntegrationFlagFromFile(root);
}

function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (!args.mode) fail('--mode is required');
  if (!Object.prototype.hasOwnProperty.call(MODE_LAYERS, args.mode)) {
    fail(`unknown mode "${args.mode}" — must be one of: ${Object.keys(MODE_LAYERS).join(', ')}`);
  }

  const result = evaluate({
    mode: args.mode,
    designIntegrationValue: resolveDesignIntegration(args),
    surface: args.surface,
    platform: resolvePlatform(args),
    files: args.files,
  });

  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) main(process.argv);

module.exports = { main };
