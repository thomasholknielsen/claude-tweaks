// plugin/bin/lib/verify/run.js — check execution with the fail-fast ordering
// policy (#892 AC1/AC9). spawnImpl is the injectable seam (tests inject fakes;
// same convention as bin/lib/issues/capabilities-probe.js's runner param).
// Each command is the caller's whole shell string by design — spawn(cmd,
// {shell: true}) — but the runner never composes a larger shell script
// around it (spec: Technical Approach).
'use strict';

const fs = require('fs');
const path = require('path');

const STAGE1 = ['types', 'lint'];

function runOne({ name, command, logDir, spawnImpl, now }) {
  const logPath = path.join(logDir, `${name}.log`);
  const stream = fs.createWriteStream(logPath);
  const started = now();
  return new Promise((resolve) => {
    let settled = false;
    // stream.end's callback fires after the log data is flushed — resolving
    // earlier lets a caller read a truncated log file.
    const finish = (result) => {
      if (settled) return;
      settled = true;
      stream.end(() => resolve(result));
    };
    let child;
    try {
      child = spawnImpl(command, { shell: true });
    } catch (err) {
      finish({
        name, command, exitCode: null,
        spawnError: String((err && err.message) || err),
        durationMs: now() - started, logPath,
      });
      return;
    }
    if (child.stdout) child.stdout.pipe(stream, { end: false });
    if (child.stderr) child.stderr.pipe(stream, { end: false });
    child.on('error', (err) => finish({
      name, command, exitCode: null,
      spawnError: String((err && err.message) || err),
      durationMs: now() - started, logPath,
    }));
    child.on('close', (code) => finish({
      name, command, exitCode: code, durationMs: now() - started, logPath,
    }));
  });
}

function failed(result) {
  return result.exitCode !== 0; // spawnError results carry exitCode null -> failed
}

// cmds: [{name, command}] in argv order. Returns results in stage order:
// stage 1 (types/lint, argv order), tests, then unknown names in argv order.
async function runChecks({ cmds, logDir, spawnImpl = require('child_process').spawn, now = Date.now }) {
  const results = [];
  const stage1 = cmds.filter((c) => STAGE1.includes(c.name));
  const testsCmd = cmds.find((c) => c.name === 'tests') || null;
  const unknown = cmds.filter((c) => !STAGE1.includes(c.name) && c.name !== 'tests');

  const stage1Results = await Promise.all(
    stage1.map((c) => runOne({ ...c, logDir, spawnImpl, now })));
  results.push(...stage1Results);
  let anyFailed = stage1Results.some(failed);

  if (testsCmd !== null) {
    if (anyFailed) {
      results.push({ name: 'tests', command: testsCmd.command, skipped: 'fail-fast' });
    } else {
      const r = await runOne({ ...testsCmd, logDir, spawnImpl, now });
      results.push(r);
      anyFailed = anyFailed || failed(r);
    }
  }

  for (const c of unknown) {
    if (anyFailed) {
      results.push({ name: c.name, command: c.command, skipped: 'fail-fast' });
      continue;
    }
    const r = await runOne({ ...c, logDir, spawnImpl, now });
    results.push(r);
    anyFailed = anyFailed || failed(r);
  }

  return results;
}

module.exports = { runChecks };
