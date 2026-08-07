// bin/lib/wrap-up/render.js — render the wrap-up State block.
//
// Every line is emitted even when its value is unknown. Omitting a line makes an
// unknown fact indistinguishable from an absent one, which is the failure this
// block exists to prevent.
'use strict';

const UNKNOWN = 'unknown';
const PAD = 10;

function field(label, value) {
  return `${label.padEnd(PAD)}${value}`;
}

function branchValue(s) {
  if (!s || !s.isRepo) return UNKNOWN;
  if (!s.branch && s.detachedAt) return `detached at ${s.detachedAt}`;
  if (!s.branch) return UNKNOWN;
  const n = s.commitsInScope;
  const commits = n === null || n === undefined ? `${UNKNOWN} commits` : `${n} commit${n === 1 ? '' : 's'}`;
  if (!s.upstream) return `${s.branch} — ${commits}, UNPUSHED (no upstream)`;
  return s.pushed
    ? `${s.branch} — ${commits}, pushed to ${s.upstream}`
    : `${s.branch} — ${commits}, UNPUSHED (${s.upstream})`;
}

function renderState({ state, ops, since, sinceDate } = {}) {
  const lines = [
    field('Branch', branchValue(state)),
    field('Worktree', state && state.isRepo ? (state.linkedWorktree ? 'linked worktree' : 'main checkout') : UNKNOWN),
    field('Scope', since ? `since ${since} (${sinceDate || UNKNOWN})` : UNKNOWN),
  ];
  const list = Array.isArray(ops) ? ops : [];
  if (list.length) {
    lines.push('');
    lines.push(`History ops in window (${list.length})`);
    for (const o of list) lines.push(`  ${String(o.op).padEnd(12)}${o.sha}  ${o.date}`);
  }
  return lines.join('\n');
}

module.exports = { renderState };
