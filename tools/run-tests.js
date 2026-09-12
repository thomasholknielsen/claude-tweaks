#!/usr/bin/env node
'use strict';

// Portable replacement for the shell-only test invocation this repo used to run via
// `package.json`'s "test" script: `CT_HOOKS_GIT_TIMEOUT_MS=60000 node --test $(find tests
// tools/upstream-drift/tests -name '*.test.js' | sort)`. That form relies on a POSIX env-prefix
// and `$(...)` command substitution, neither of which `npm` on Windows can run under `cmd.exe`.
// This script reproduces the same file selection and env default in pure Node, then runs
// `node --test` the same way, so `npm test` works identically on POSIX and Windows.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOTS = ['tests', path.join('tools', 'upstream-drift', 'tests')];

// Reads `dir` directly and treats a missing directory as "no files here" — never
// `fs.existsSync(dir)` first: that shape is a check-then-act race (the directory can vanish
// between the check and the read) and, more to the point here, both `dir` values are static
// repo-relative roots, so the only realistic way this ever throws ENOENT is a genuine absence,
// which is exactly the case this function already needs to treat as empty.
function collectTestFiles(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
}

// Walks ROOTS (relative to `cwd`, defaulting to this repo's root) and returns every `*.test.js`
// file, sorted — the same file set `find tests tools/upstream-drift/tests -name '*.test.js' |
// sort` used to produce. Exported so tests can exercise the selection logic directly instead of
// shelling out.
function listTestFiles(cwd) {
  const base = cwd || path.join(__dirname, '..');
  const files = [];
  for (const root of ROOTS) {
    collectTestFiles(path.join(base, root), files);
  }
  files.sort();
  return files;
}

module.exports = { listTestFiles };

if (require.main === module) {
  const files = listTestFiles().map((f) => path.relative(process.cwd(), f));

  // `node --test` with zero file arguments falls back to its own default-pattern
  // auto-discovery and can exit 0 having run nothing — "the suite gets quieter, not
  // redder" (docs/incident-log.md:421). A rename/typo of either ROOTS entry must fail
  // loudly here, not degrade into a silently-green `npm test`.
  if (files.length === 0) {
    console.error(
      `run-tests.js: found zero *.test.js files under ${ROOTS.join(', ')} — refusing to run ` +
        "`node --test` with no explicit files (it would silently discover its own defaults " +
        'and exit 0 having run nothing). Check that these directories exist and are non-empty.',
    );
    process.exit(1);
  }

  process.env.CT_HOOKS_GIT_TIMEOUT_MS = process.env.CT_HOOKS_GIT_TIMEOUT_MS || '60000';

  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}
