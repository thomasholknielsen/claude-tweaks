// plugin/bin/lib/verify/args.js — argv parsing for bin/verify.js (#892).
// Pure: no fs, no process access; the CLI entry owns stderr/exit codes.
'use strict';

class UsageError extends Error {}

const USAGE =
  'usage: verify.js --cmd <name>=<command> [--cmd <name>=<command> ...] [--json <path>] [--log-dir <dir>]';

// argv = process.argv.slice(2). Throws UsageError on any malformed input —
// the CLI prints message + USAGE to stderr and exits non-zero (AC6).
function parseArgs(argv) {
  const cmds = [];
  let json = null;
  let logDir = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--cmd' || flag === '--json' || flag === '--log-dir') {
      const value = argv[i + 1];
      i++;
      if (value === undefined) throw new UsageError(`${flag} requires a value`);
      if (flag === '--json') { json = value; continue; }
      if (flag === '--log-dir') { logDir = value; continue; }
      const eq = value.indexOf('=');
      if (eq === -1) throw new UsageError(`--cmd value must be <name>=<command>, got: ${value}`);
      if (eq === 0) throw new UsageError(`--cmd value has an empty name: ${value}`);
      const name = value.slice(0, eq);
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new UsageError(`--cmd name must match [A-Za-z0-9_-]+, got: ${name}`);
      }
      const command = value.slice(eq + 1);
      if (command === '') throw new UsageError(`--cmd ${name} has an empty command`);
      if (cmds.some((c) => c.name === name)) throw new UsageError(`duplicate --cmd name: ${name}`);
      cmds.push({ name, command });
      continue;
    }
    throw new UsageError(`unknown flag: ${flag}`);
  }
  if (cmds.length === 0) throw new UsageError('at least one --cmd <name>=<command> is required');
  return { cmds, json, logDir };
}

module.exports = { parseArgs, UsageError, USAGE };
