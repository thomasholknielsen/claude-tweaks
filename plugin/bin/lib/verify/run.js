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
    // A write-stream failure (missing logDir, disk full, ...), a spawn-time
    // throw, and a child 'error' event are the same failure class: record
    // them, never let one crash the run as an unhandled 'error' event.
    let child;
    const finishError = (err) => {
      if (child) child.kill();
      finish({
        name, command, exitCode: null,
        spawnError: String((err && err.message) || err),
        durationMs: now() - started, logPath,
      });
    };
    stream.on('error', finishError);
    try {
      child = spawnImpl(command, { shell: true });
    } catch (err) {
      finishError(err);
      return;
    }
    if (child.stdout) { child.stdout.on('error', finishError); child.stdout.pipe(stream, { end: false }); }
    if (child.stderr) { child.stderr.on('error', finishError); child.stderr.pipe(stream, { end: false }); }
    child.on('error', finishError);
    child.on('close', (code) => finish({
      name, command, exitCode: code, durationMs: now() - started, logPath,
    }));
  });
}

function failed(result) {
  return result.exitCode !== 0; // spawnError results carry exitCode null -> failed
}

// Runs c unless skip is true, in which case it records a fail-fast skip
// without spawning. `anyFailed || failed(r)` short-circuits on a skip result
// (anyFailed is already true whenever skip is true), so anyFailed stays
// accurate either way.
async function runOrSkip(c, ctx, skip) {
  if (skip) return { name: c.name, command: c.command, skipped: 'fail-fast' };
  return runOne({ ...c, ...ctx });
}

// cmds: [{name, command}] in argv order. Returns results in stage order:
// stage 1 (types/lint, argv order), tests, then unknown names in argv order.
async function runChecks({ cmds, logDir, spawnImpl = require('child_process').spawn, now = Date.now }) {
  const ctx = { logDir, spawnImpl, now };
  const results = [];
  const stage1 = cmds.filter((c) => STAGE1.includes(c.name));
  const testsCmd = cmds.find((c) => c.name === 'tests') || null;
  const unknown = cmds.filter((c) => !STAGE1.includes(c.name) && c.name !== 'tests');

  const stage1Results = await Promise.all(stage1.map((c) => runOne({ ...c, ...ctx })));
  results.push(...stage1Results);
  let anyFailed = stage1Results.some(failed);

  if (testsCmd !== null) {
    const r = await runOrSkip(testsCmd, ctx, anyFailed);
    results.push(r);
    anyFailed = anyFailed || failed(r);
  }

  for (const c of unknown) {
    const r = await runOrSkip(c, ctx, anyFailed);
    results.push(r);
    anyFailed = anyFailed || failed(r);
  }

  return results;
}

module.exports = { runChecks };
