// bin/lib/harness-health/override-bypass.js — detection half of #809: a
// declared CLAUDE.md pipeline override ("route to `/X`, never `/Y`" — this
// project's own "Superpowers overrides:" convention, `claude-md-template.md`)
// is prose with no enforcement. This module answers "was it followed?" by
// comparing the declared override against the `skill_invoked` event ledger
// (bin/lib/hooks/skill-invocation.js) already recorded for every model-
// initiated Skill-tool call in a run's events.jsonl.
//
// Scope, deliberately narrow (see the record's own Gotchas — a mis-parsed
// override is worse than a missed one): this only recognizes the single
// prose shape this repo's own CLAUDE.md already uses ("route(s) to `/X`
// ... never `/Y`" in the same clause, no new declaration format). A
// differently-worded override is silently not recognized, not misread.
'use strict';

const fs = require('fs');
const path = require('path');

// "route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`" ->
// { substitute: '/claude-tweaks:specify', forbidden: '/superpowers:writing-plans' }.
// `[^.;]*?` bounds the substitute/forbidden pair to the same clause (stops at
// the next sentence/clause boundary) so an unrelated later "never `/…`" in
// the same paragraph is never paired with an earlier "route to `/…`".
const OVERRIDE_RE = /\broutes?\s+to\s+`(\/[A-Za-z0-9:_-]+)`[^.;]*?\bnever\s+`(\/[A-Za-z0-9:_-]+)`/g;

function parseDeclaredOverrides(claudeMdText) {
  const text = String(claudeMdText || '');
  // matchAll clones the regex internally, so OVERRIDE_RE's own lastIndex
  // never carries between calls.
  return [...text.matchAll(OVERRIDE_RE)].map((m) => ({ substitute: m[1], forbidden: m[2] }));
}

// Bare vs. qualified invocation compare equal on base name — a bare Skill
// call (e.g. "specify") logs verbatim per skill-invocation.js's own header
// comment (b), never resolved to its qualified form in the event itself.
function baseSkillName(name) {
  const s = String(name || '').replace(/^\//, '');
  const idx = s.indexOf(':');
  return idx === -1 ? s : s.slice(idx + 1);
}

// List every pipeline run directory under root's .claude-tweaks/pipelines/ —
// active runs and archived ones (archive/{run-id}/), since most of the
// evidence a bypass needs to be detected against lives in already-completed,
// already-archived runs by the time this check runs.
function subdirNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function listPipelineRunDirs(root) {
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  const dirs = [];
  for (const name of subdirNames(base)) {
    if (name === 'archive') {
      const archiveBase = path.join(base, 'archive');
      for (const archived of subdirNames(archiveBase)) dirs.push(path.join(archiveBase, archived));
      continue;
    }
    dirs.push(path.join(base, name));
  }
  return dirs;
}

// [runDir, ...] -> [{ skill, ts, runDir }, ...] — every skill_invoked event
// across every given run dir, oldest-file-order (callers needing chronology
// within one run dir get it for free: events.jsonl is append-only).
function collectSkillInvocations(runDirs) {
  const invocations = [];
  for (const dir of runDirs) {
    let raw;
    try { raw = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (!ev || ev.type !== 'skill_invoked' || !ev.skill) continue;
      invocations.push({ skill: ev.skill, ts: ev.ts, runDir: dir });
    }
  }
  return invocations;
}

// { overrides, invocations } -> [{ forbidden, substitute, forbiddenCount, evidence }]
// A bypass: the forbidden skill was invoked at least once across the given
// evidence, and the declared substitute was never invoked anywhere in it —
// the exact shape of the incident the record describes ("the substitute
// skill never invoked at all"). A run that invokes both (e.g. the substitute
// legitimately delegating to the forbidden skill internally, or a prior
// violation later corrected) is not flagged — this check only recognizes
// the substitute's total absence, not sequencing between the two.
function detectBypasses({ overrides, invocations }) {
  const bypasses = [];
  for (const { forbidden, substitute } of overrides) {
    const fBase = baseSkillName(forbidden);
    const sBase = baseSkillName(substitute);
    const forbiddenHits = invocations.filter((inv) => baseSkillName(inv.skill) === fBase);
    const substituteInvoked = invocations.some((inv) => baseSkillName(inv.skill) === sBase);
    if (forbiddenHits.length > 0 && !substituteInvoked) {
      bypasses.push({
        forbidden,
        substitute,
        forbiddenCount: forbiddenHits.length,
        evidence: forbiddenHits.map((h) => ({ ts: h.ts, runDir: h.runDir })),
      });
    }
  }
  return bypasses;
}

module.exports = {
  parseDeclaredOverrides, baseSkillName, listPipelineRunDirs, collectSkillInvocations, detectBypasses,
};
