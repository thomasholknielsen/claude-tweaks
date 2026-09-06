#!/usr/bin/env node
// plugin/bin/init-verify-scope.js — thin CLI over the verify-scope starter
// module (plugin/bin/lib/init/verify-scope-starter.js, #1924). Resolves the
// project's root package.json scripts, detects its workspace, and composes
// the proposed .claude-tweaks/verify-scope.json — printing it, and with
// --write creating it only when the file is absent (never overwriting an
// existing one). Consumed standalone and by /claude-tweaks:init Step 6.6.
// Shells out to nothing — pure fs reads/writes rooted at --root.
// Exit 0 on any valid invocation, including "nothing detected" (still
// prints the bookkeeping-only starter — deciding whether to *offer* it is
// the sub-file's job, not this CLI's); 2 malformed invocation (unknown
// flag, missing --root value, --root not a directory).
'use strict';

const fs = require('fs');
const path = require('path');
const { detectWorkspace, composeStarter } = require('./lib/init/verify-scope-starter');

class UsageError extends Error {}

const USAGE = 'usage: init-verify-scope.js --root <dir> [--write] [--json]';

function parseArgs(argv) {
  let root = null;
  let write = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--write') { write = true; continue; }
    if (flag === '--json') { json = true; continue; }
    if (flag === '--root') {
      const value = argv[i + 1];
      i++;
      if (value === undefined) throw new UsageError('--root requires a value');
      root = value;
      continue;
    }
    throw new UsageError(`unknown flag: ${flag}`);
  }
  if (!root) throw new UsageError('--root <dir> is required');
  return { root, write, json };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`init-verify-scope.js: ${err.message}\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  const root = path.resolve(parsed.root);
  let rootStat;
  try { rootStat = fs.statSync(root); } catch { rootStat = null; }
  if (!rootStat || !rootStat.isDirectory()) {
    process.stderr.write(`init-verify-scope.js: --root is not a directory: ${parsed.root}\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  let rootPkg = null;
  try { rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { rootPkg = null; }
  const rootScripts = (rootPkg && rootPkg.scripts) || {};
  const workspace = detectWorkspace({ root });
  const decl = composeStarter({ workspace, rootScripts });

  const targetPath = path.join(root, '.claude-tweaks', 'verify-scope.json');
  let existed = false;
  try { existed = fs.existsSync(targetPath); } catch { existed = false; }
  let written = false;
  if (parsed.write && !existed) {
    fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
    try {
      // wx: create-only. A concurrent creator winning the race between the
      // existsSync check above and this write surfaces as EEXIST, which we
      // fold into "already existed" rather than clobbering it.
      fs.writeFileSync(targetPath, `${JSON.stringify(decl, null, 2)}\n`, { flag: 'wx' });
      written = true;
    } catch (err) {
      if (err && err.code === 'EEXIST') existed = true;
      else throw err;
    }
  }

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify({
      declaration: decl, written, existed, path: targetPath,
    })}\n`);
  } else {
    process.stdout.write('Proposed .claude-tweaks/verify-scope.json:\n');
    process.stdout.write(`${JSON.stringify(decl, null, 2)}\n`);
    if (existed) process.stdout.write(`exists: ${targetPath} (left unchanged)\n`);
    else if (written) process.stdout.write(`written: ${targetPath}\n`);
    else process.stdout.write('not written (pass --write)\n');
  }
  process.exitCode = 0;
}

module.exports = { parseArgs, UsageError };

if (require.main === module) main();
