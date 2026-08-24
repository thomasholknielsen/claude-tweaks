// bin/lib/set-config/write.js — validate and write one config.yml policy
// lever into a pipeline run directory. The config.yml half of the
// sanctioned-write family (#637/#686 precedent: bin/lib/stage-item/write.js
// for staged/, bin/lib/log-decision/append.js for decisions.md) — closes
// #1376's gap: a worktree-isolated session has no Edit/Write path to the
// run dir, so the ceremony escape hatch's "downgrade ceremony-profile in
// place" needs a CLI.
//
// Anchoring reuses bin/lib/stage-item/write.js's exported resolveTarget
// verbatim (the caller, bin/set-config.js, invokes it) — that predicate's
// header documents why it is duplicated across the two SMALL siblings and
// not a third time; importing is the record's own Technical Approach
// ("directly reusable").
//
// Lever names validate against the canonical 13-lever Manifesto set
// (plugin/skills/flow/manifesto.md's config.yml example block —
// tests/bin-lib/set-config/write.test.js pins parity). Values validate
// against POLICY_KEYS enums where a schema row exists; `mode` and
// `ceremony-profile` are config.yml-only levers with no POLICY_KEYS row
// (flow/manifesto.md computes them per run), so their enums live here.
'use strict';

const fs = require('fs');
const path = require('path');
const { POLICY_KEYS } = require('../policy-schema');

// Ordered per manifesto.md's canonical lever numbering (1=Mode ... 13=Merge
// authorization). spec:/created: are run bookkeeping, not levers — excluded.
const MANIFESTO_LEVERS = Object.freeze([
  'mode', 'scope-creep', 'overlap', 'design-intent', 'leftover-default',
  'auto-fix-threshold', 'review-auto-apply-ceiling', 'tidy-aggressiveness',
  'ceremony-profile', 'model-stance', 'merge-verification', 'design-critique',
  'merge-authorization',
]);

// The two levers with no POLICY_KEYS row: their value sets are defined by
// flow/manifesto.md (mode table; ceremony fold), stated here as data.
const CONFIG_ONLY_VALUES = Object.freeze({
  mode: Object.freeze(['auto', 'hybrid', 'interactive']),
  'ceremony-profile': Object.freeze(['fast-lane', 'standard']),
});

// key -> allowed values array, or null when key is not a config.yml lever.
function leverValues(key) {
  if (!MANIFESTO_LEVERS.includes(key)) return null;
  if (CONFIG_ONLY_VALUES[key]) return [...CONFIG_ONLY_VALUES[key]];
  const row = POLICY_KEYS.find((r) => r.key === key);
  if (row && row.type === 'enum') return [...row.values];
  return null; // a lever with no known enum would validate name-only; none exists today
}

// (key, value) -> { ok } | { ok:false, reason:'unknown-key' } |
// { ok:false, reason:'invalid-value', allowed }
function validateLever(key, value) {
  const allowed = leverValues(key);
  if (allowed === null) return { ok: false, reason: 'unknown-key' };
  if (!allowed.includes(value)) return { ok: false, reason: 'invalid-value', allowed };
  return { ok: true };
}

// { runDir, key, value } -> { file, previous }. Idempotent set: replace the
// first column-0 `key:` line in place (dropping any trailing comment on that
// line — the value change is the point), append when absent, create the file
// when missing. Every other line is preserved byte-for-byte. Throws on fs
// errors — the CLI maps those to exit 3.
function setConfigLever({ runDir, key, value }) {
  const file = path.join(runDir, 'config.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { text = ''; }
  const lines = text ? text.split('\n') : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const re = new RegExp(`^${key}:\\s*([^#]*)`);
  let previous = null;
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    previous = m[1].trim() || null;
    lines[i] = `${key}: ${value}`;
    replaced = true;
    break;
  }
  if (!replaced) lines.push(`${key}: ${value}`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { file, previous };
}

module.exports = { MANIFESTO_LEVERS, leverValues, validateLever, setConfigLever };
