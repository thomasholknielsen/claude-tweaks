// bin/lib/hooks/git-command.js
'use strict';
const path = require('path');

// Naive top-level split: separators inside quotes also split. Acceptable — a
// misparsed segment produces no git target, and no target means allow.
function splitSegments(command) {
  return String(command || '').split(/&&|\|\||;|\|/);
}

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

// Tokenizer that keeps quoted spans (with spaces) as one token.
function tokenize(seg) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(seg)) !== null) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return out;
}

// Global git flags that consume the NEXT token as a value.
const VALUE_FLAGS = new Set(['-C', '-c', '--exec-path', '--namespace']);
// Flags that make the target unprovable from the command text alone.
const UNPROVABLE_FLAGS = ['--git-dir', '--work-tree'];

function gitTargets(command, cwd) {
  const targets = [];
  let effCwd = cwd || '.';
  for (const seg of splitSegments(command)) {
    const t = tokenize(seg.trim());
    if (!t.length) continue;
    if (t[0] === 'cd' && t[1]) {
      effCwd = path.resolve(effCwd, stripQuotes(t[1]));
      continue;
    }
    if (t[0] !== 'git') continue;
    let i = 1;
    let dir = effCwd;
    let unprovable = false;
    while (i < t.length && t[i].startsWith('-')) {
      const flag = t[i];
      if (UNPROVABLE_FLAGS.some((u) => flag === u || flag.startsWith(u + '='))) { unprovable = true; i += flag.includes('=') ? 1 : 2; continue; }
      if (flag === '-C' && t[i + 1]) { dir = path.resolve(effCwd, stripQuotes(t[i + 1])); i += 2; continue; }
      if (VALUE_FLAGS.has(flag) && t[i + 1]) { i += 2; continue; }
      i += 1;
    }
    if (unprovable) continue;
    const sub = t[i];
    if (sub === 'commit' || sub === 'push') targets.push({ action: sub, dir });
  }
  return targets;
}

module.exports = { gitTargets, splitSegments, tokenize };
