// Format one _shared/auto-decision-log.md entry and append it to a run's
// decisions.md — the decisions.md half of #637's "no CLI writes decisions.md
// or staged/" gap (the staged/ half is #637's remaining scope). Every AUTO /
// STAGED site that used to compose the line by hand (or via a scratch node -e)
// calls bin/log-decision.js, which is a thin wrapper over this module.
// The run dir must resolve under the main checkout ($RUN_ROOT — see
// _shared/pipeline-run-dir.md's Anchoring section): a worktree-local shadow
// copy is refused, never silently written ([IL-127]).
'use strict';

const fs = require('fs');
const path = require('path');
const { mainCheckoutRoot } = require('../hooks/worktree-detect');

const STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED'];
const WORKTREE_ADMIN = `${path.sep}.claude${path.sep}worktrees${path.sep}`;

function pad2(n) { return String(n).padStart(2, '0'); }

function hms(now) {
  const d = new Date(now);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// { status, now, step?, spec?, text, reversibility?, lever? } -> one schema line (no newline).
function formatEntry({ status, now, step, spec, text, reversibility = 'n/a', lever }) {
  if (!STATUSES.includes(status)) throw new Error(`invalid status: ${status} (expected ${STATUSES.join('|')})`);
  const body = String(text || '').trim();
  if (!body) throw new Error('text is required');
  let location;
  if (step && spec !== undefined && spec !== null && spec !== '') location = `spec #${spec} — ${step}`;
  else if (step) location = String(step);
  else if (spec !== undefined && spec !== null && spec !== '') location = `spec #${spec}`;
  else location = 'log-decision';
  const action = /[.!?]$/.test(body) ? body : `${body}.`;
  let line = `- ${status} ${hms(now)} — ${location}: ${action} Reversibility: ${reversibility}.`;
  if (lever) line += ` [lever: ${lever}]`;
  return line;
}

function realpathOrNull(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

// { runDir, cwd?, mainRoot? } -> { ok, file } | { ok:false, reason:'missing'|'not-anchored' }
function resolveTarget({ runDir, cwd = process.cwd(), mainRoot }) {
  const real = realpathOrNull(runDir);
  let isDir = false;
  try { isDir = !!real && fs.statSync(real).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { ok: false, reason: 'missing' };
  const root = mainRoot === undefined ? mainCheckoutRoot(cwd) : mainRoot;
  if (root) {
    const rootReal = realpathOrNull(root) || root;
    const inRoot = real === rootReal || real.startsWith(rootReal + path.sep);
    if (!inRoot || real.includes(WORKTREE_ADMIN)) return { ok: false, reason: 'not-anchored' };
  }
  return { ok: true, file: path.join(real, 'decisions.md') };
}

// { runDir, section?, entry } -> { file, created }. Append-only; never rewrites prior lines.
function appendEntry({ runDir, section, entry }) {
  const file = path.join(runDir, 'decisions.md');
  const created = !fs.existsSync(file);
  let text = created ? '' : fs.readFileSync(file, 'utf8');
  if (text && !text.endsWith('\n')) text += '\n';
  if (!section) {
    fs.writeFileSync(file, text + entry + '\n');
    return { file, created };
  }
  const heading = `## ${section}`;
  const lines = text ? text.split('\n') : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const start = lines.indexOf(heading);
  if (start === -1) {
    lines.push(heading, entry);
  } else {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { if (/^## /.test(lines[i])) { end = i; break; } }
    lines.splice(end, 0, entry);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { file, created };
}

module.exports = { STATUSES, formatEntry, resolveTarget, appendEntry, hms };
