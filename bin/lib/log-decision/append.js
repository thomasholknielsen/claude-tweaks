// Format one _shared/auto-decision-log.md entry and append it to a run's
// decisions.md — the decisions.md half of #637's "no CLI writes decisions.md
// or staged/" gap (the staged/ half is #637's remaining scope). Every AUTO /
// STAGED site that used to compose the line by hand (or via a scratch node -e)
// calls bin/log-decision.js, which is a thin wrapper over this module.
// The run dir must resolve under the main checkout ($RUN_ROOT — see
// _shared/pipeline-run-dir.md's Anchoring section): a worktree-local shadow
// copy is refused, never silently written ([IL-127]).
//
// Anchoring is a structural .git check, not a domain-name check: ADR-0004
// (docs/decisions/0004-worktree-two-domain-convention.md) documents
// `.claude/worktrees/` and `.worktrees/` as two permanently separate,
// equally live linked-worktree domains, so a substring match on one name
// misses the other. Instead we walk up from the run dir to the nearest
// ancestor holding a `.git` entry: a `.git` file (a linked worktree of
// either domain, or a submodule) is refused — never the main checkout; a
// DIRECTORY means a real checkout root, which must match the resolved
// mainRoot. No `.git` found anywhere above the run dir also refuses — this
// predicate fails CLOSED on the unknown case, same as
// bin/lib/hooks/worktree-reap.js.
'use strict';

const fs = require('fs');
const path = require('path');
const { mainCheckoutRoot, safeReal } = require('../hooks/worktree-detect');

const STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED', 'REFUSED'];

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
  const hasSpec = spec !== undefined && spec !== null && spec !== '';
  let location;
  if (step && hasSpec) location = `spec #${spec} — ${step}`;
  else if (step) location = String(step);
  else if (hasSpec) location = `spec #${spec}`;
  else location = 'log-decision';
  const action = /[.!?]$/.test(body) ? body : `${body}.`;
  let line = `- ${status} ${hms(now)} — ${location}: ${action} Reversibility: ${reversibility}.`;
  if (lever) line += ` [lever: ${lever}]`;
  return line;
}

// Walk up from `startDir` for the nearest ancestor containing a `.git` entry.
// Returns { dir, isFile } for the first hit, or null if none exists above the
// filesystem root.
function findGitRoot(startDir) {
  let dir = startDir;
  for (;;) {
    let st;
    try { st = fs.statSync(path.join(dir, '.git')); } catch { st = null; }
    if (st) return { dir, isFile: st.isFile() };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// { runDir, cwd?, mainRoot? } -> { ok, file } | { ok:false, reason:'missing'|'not-anchored' }
function resolveTarget({ runDir, cwd = process.cwd(), mainRoot }) {
  const real = safeReal(runDir);
  let isDir = false;
  try { isDir = !!real && fs.statSync(real).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { ok: false, reason: 'missing' };

  const found = findGitRoot(real);
  if (!found || found.isFile) return { ok: false, reason: 'not-anchored' };
  const gitRoot = found.dir;

  const root = mainRoot === undefined ? mainCheckoutRoot(cwd) : mainRoot;
  if (root) {
    const rootReal = safeReal(root) || root;
    if (rootReal !== gitRoot) return { ok: false, reason: 'not-anchored' };
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
