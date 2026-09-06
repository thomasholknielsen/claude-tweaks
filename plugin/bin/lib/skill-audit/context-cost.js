'use strict';

// Context-cost measurement for the shipped skill payload.
//
// A SKILL.md loads in full on every invocation, and once per dispatched subagent.
// Bloat here is invisible until someone measures it by hand — which is how the
// corpus reached 931 KB before anyone looked. Phases 1-3 removed ~150 KB; this
// module exists so the next 150 KB does not accumulate unnoticed.
//
// The ceiling is CLAUDE.md's own 40 KB soft ceiling per SKILL.md. After the
// Phase 3 extraction several files sit within a kilobyte of it, so a regression
// is one added paragraph away — which is precisely when an automated check earns
// its keep over periodic manual measurement.
//
// Since #1990, the per-file 40 KB ceiling is a warning tier, not a hard gate:
// the number a reader actually pays is the composed bundle at a compose call
// site (`composedBytesReport`, Task 4), not any one source file in isolation.
// Per-file bytes are CRLF-normalized and marker-stripped (`measuredBytes`) so
// a `core.autocrlf=true` checkout or an unrendered `<!-- when: ... -->` marker
// never inflates a count that nobody actually reads.

const fs = require('node:fs');
const path = require('node:path');
const { splitFrontmatterFence } = require('../health-core/frontmatter-list');
const { listSkillDirs } = require('./skill-catalog');
const {
  stripMarkers, MarkerError, parseMarkers, compose, KEYS, VOCAB, UNRESOLVED,
} = require('../compose-context/compose');

const CEILING_BYTES = 40 * 1024;

// Frontmatter `description:` budget (#394). Every description loads into every
// session of every project with the plugin enabled, regardless of whether that
// skill ever fires — unlike SKILL.md bytes above (paid once per invocation),
// this is paid every session. A #394 audit found the 33 descriptions totaling
// 10,455 chars, 13 of them carrying body content (procedure summaries,
// enumerations, negative-scope clauses) that belongs in the SKILL.md body
// instead. Per-description ceiling is a hard, mechanically-checked line: the
// corpus ceiling is deliberately looser, since trimming the last chars off an
// already-tight description means dropping a Keywords token — the one thing
// this ceiling must never cost (a lost keyword can stop a skill from firing).
const DESCRIPTION_CEILING_CHARS = 260;
// 7500 -> 7700, #1704 (new `/claude-tweaks:intake` skill, 116 chars). By the
// time this landed the corpus had already grown to 7497/7500 (recent
// unrelated merges — #1489/#1490/#1492/#1494's sweep orchestrator and
// friends), leaving 3 chars of headroom — not enough for a legitimate new
// skill's description, and every existing description was already near its
// own 260-char per-skill ceiling (per this file's own comment above: trimming
// an already-tight description costs a Keywords token, the one thing this
// looser corpus ceiling exists to avoid). Raising the ceiling, not shaving
// unrelated skills' tuned trigger phrases, is the correct fix here. Bumped
// to 7700 (not the bare 7613 minimum) to leave the next legitimate addition
// some room too.
const DESCRIPTION_TOTAL_CEILING_CHARS = 7700;

function skillsDir(repoRoot) {
  return path.join(repoRoot, 'skills');
}

// The corpus root every measurement here takes is the plugin payload root — the
// directory with `skills/` directly beneath it (this repo: `plugin/`; an
// installed consumer: `${CLAUDE_PLUGIN_ROOT}`), never the repo root. The one
// mistake a caller actually makes is passing the repo root, and a raw
// `ENOENT: scandir …/skills` out of the walk names neither the rule nor the
// fix — so the corpus entry points check once and say so (#1990, lens 3c).
function corpusDir(repoRoot) {
  const dir = skillsDir(repoRoot);
  try {
    if (fs.statSync(dir).isDirectory()) return dir;
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
  }
  throw new Error(`${repoRoot} is not a plugin root: no skills/ directory beneath it `
    + '(pass the directory that holds skills/ — this repo: plugin/; an install: ${CLAUDE_PLUGIN_ROOT} — never the repo root)');
}

// The byte count a reader of `file` actually pays: CRLF-normalized (#1880 —
// a `core.autocrlf=true` checkout otherwise inflates every count by one byte
// per line) and with `<!-- when: ... -->` / `<!-- /when -->` marker lines
// stripped (they render to nothing; every branch's text is still counted). A
// malformed marker is reported on the entry as `markerError`, never thrown
// out of a measurement pass (parent #1987 promise F1) — the raw byte count is
// returned instead so the entry is still usable.
function measuredBytes(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = raw.replace(/\r\n/g, '\n');
  try {
    const stripped = stripMarkers(text);
    return { bytes: Buffer.byteLength(stripped, 'utf8') };
  } catch (err) {
    if (err instanceof MarkerError) {
      return { bytes: Buffer.byteLength(text, 'utf8'), markerError: `${file}:${err.line}: ${err.message}` };
    }
    throw err;
  }
}

// Every SKILL.md, with its size. This is the per-invocation payload: sub-files
// are lazy-loaded and deliberately excluded.
function measureSkills(repoRoot) {
  const dir = corpusDir(repoRoot);
  return listSkillDirs(repoRoot).map((name) => {
    const file = path.join(dir, name, 'SKILL.md');
    return { name, ...measuredBytes(file) };
  });
}

// Every `.md` file under `dir`, recursively — the shared walk shape behind
// both `measureSubFiles` (below) and `findComposeCallSites` (#1990 Task 2).
function* walkMarkdown(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walkMarkdown(p); continue; }
    if (e.name.endsWith('.md')) yield p;
  }
}

// Sub-files are not free either: a stub that cites one costs the whole file when
// read, so a sub-file over the ceiling is the same defect one level down. This is
// the shape that let init/bootstrap-steps.md reach 86 KB behind 18 stubs (IL-70).
function measureSubFiles(repoRoot) {
  const dir = corpusDir(repoRoot);
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const sd = path.join(dir, name);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const p of walkMarkdown(sd)) {
      if (path.basename(p) === 'SKILL.md') continue;
      out.push({ skill: name, file: path.relative(dir, p), ...measuredBytes(p) });
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

function overCeiling(entries) {
  return entries.filter((e) => e.bytes > CEILING_BYTES);
}

// The per-file 40 KB ceiling is a warning tier since #1990 — the hard gate is
// composed bytes per compose call site (`overComposedCeiling`, Task 4).
function overCeilingWarnings(entries) {
  return overCeiling(entries).map((e) => `${e.name || e.file} ${(e.bytes / 1024).toFixed(1)} KB`);
}

// The `when:` keys a set of sources actually branch on, in `KEYS` canonical
// order — a marker-free key can't change the composed output, so pinning it
// to a combination would only add noise. Throws `MarkerError` on a malformed
// marker in any source (the caller reports it on the row, never lets it
// escape — parent #1987 promise F1).
function usedConditionKeys(sources) {
  const used = new Set();
  for (const source of sources) {
    for (const token of parseMarkers(source.content, source.path)) {
      if (token.type === 'open') used.add(token.key);
    }
  }
  return KEYS.filter((key) => used.has(key));
}

// Cartesian product of `VOCAB[key]` over `keys`, as partial condition objects
// keyed only by the keys given — `[{}]` when `keys` is empty (marker-free
// sources: exactly one, unconditional combination).
function conditionCombinations(keys) {
  return keys.reduce((acc, key) => {
    const out = [];
    for (const partial of acc) {
      for (const value of VOCAB[key]) out.push({ ...partial, [key]: value });
    }
    return out;
  }, [{}]);
}

// Composed bytes for one compose call site, under every combination of the
// keys its sources branch on. A missing source, an unreadable source, a
// malformed marker, or an unparsed call site is an error row
// (`{ error, combinations: [] }`), never a thrown exception — parent #1987
// promise F1.
function measureComposed(repoRoot, callSite) {
  if (callSite.unparsed) return { ...callSite, error: callSite.reason, combinations: [] };
  const { step, file, line, sources: sourcePaths } = callSite;
  let sources;
  try {
    sources = sourcePaths.map((p) => ({ path: path.relative(repoRoot, p), content: fs.readFileSync(p, 'utf8') }));
  } catch (err) {
    if (err.code === 'ENOENT') return { step, file, line, error: `missing source: ${err.path}`, combinations: [] };
    return { step, file, line, error: `unreadable source ${err.path}: ${err.code || err.message}`, combinations: [] };
  }
  let keys;
  try {
    keys = usedConditionKeys(sources);
  } catch (err) {
    if (err instanceof MarkerError) {
      return { step, file, line, error: `${err.file}:${err.line}: ${err.message}`, combinations: [] };
    }
    throw err;
  }
  // A row's `conditions` are partial — only the keys the sources branch on —
  // but compose() wants all of KEYS, so the rest are pinned to VOCAB[key][0].
  // The pin cannot change the output: those keys are marker-free here.
  // compose() cannot throw in this function either: usedConditionKeys just
  // parsed these identical sources successfully, and every conditions object
  // comes from KEYS/VOCAB (plus UNRESOLVED for the row below), so no condition
  // key or value can be one compose()'s own validation rejects.
  const measureRow = (partial) => {
    const conditions = {};
    for (const key of KEYS) {
      conditions[key] = Object.prototype.hasOwnProperty.call(partial, key) ? partial[key] : VOCAB[key][0];
    }
    return { conditions: partial, bytes: Buffer.byteLength(compose(sources, conditions), 'utf8') };
  };
  const combinations = conditionCombinations(keys).map(measureRow);
  // The standalone-run reading (no config.yml to resolve `when:` keys):
  // compose() renders both branches of every used key. Strictly >= every
  // resolved combination above, since each of those keeps only one branch
  // per key. Marker-free sources (`keys` empty) get no such row — an
  // unconditional source can't have an "unresolved" reading distinct from
  // its single combination.
  if (keys.length > 0) {
    combinations.push(measureRow(Object.fromEntries(keys.map((key) => [key, UNRESOLVED]))));
  }
  const max = combinations.reduce((m, c) => Math.max(m, c.bytes), 0);
  return {
    step, file, line, sources: sourcePaths, keys, combinations, max,
  };
}

function totalBytes(entries) {
  return entries.reduce((sum, e) => sum + e.bytes, 0);
}

const PLUGIN_ROOT_PREFIX = '${CLAUDE_PLUGIN_ROOT}/';

function unquoteToken(tok) {
  if (tok.length >= 2 && tok.startsWith('"') && tok.endsWith('"')) return tok.slice(1, -1);
  return tok;
}

// One line of skill prose -> `{ step, sources }` (a real call site),
// `{ unparsed: true, reason }` (has the invocation form and a `--step`
// token but doesn't parse), or `null` (documentation: a placeholder
// `{...}`/`<...>` source, or no `compose-context.js` invocation form at
// all). Grammar: an optional `--run <value>` may precede `--step`; sources
// are ONLY the tokens after `--step`'s own value; any other `--flag`
// anywhere makes the line unparsed rather than silently miscounted.
function parseComposeCallLine(line, repoRoot) {
  const m = line.match(/compose-context\.js"?\s+([^`\n]*)/);
  if (!m) return null;
  const tokens = (m[1].match(/"[^"]*"|\S+/g) || []).map(unquoteToken);

  let i = 0;
  while (i < tokens.length && tokens[i] !== '--step') {
    if (tokens[i] === '--run') { i += 2; continue; }
    if (tokens[i].startsWith('--')) return { unparsed: true, reason: `unknown flag ${tokens[i]}` };
    return { unparsed: true, reason: `unexpected token before --step: ${tokens[i]}` };
  }
  if (i >= tokens.length) return { unparsed: true, reason: 'no step value' };
  const step = tokens[i + 1];
  if (step === undefined || step.startsWith('--')) return { unparsed: true, reason: 'no step value' };
  const rawSources = tokens.slice(i + 2);
  if (rawSources.length === 0) return { unparsed: true, reason: 'no sources' };
  const unknownFlag = rawSources.find((tok) => tok.startsWith('--'));
  if (unknownFlag) return { unparsed: true, reason: `unknown flag ${unknownFlag}` };

  // A documentation line quoting the call form with a placeholder (`{step}`,
  // `{files}`) is not a call site — checked *after* stripping a leading
  // `${CLAUDE_PLUGIN_ROOT}/` (which itself contains `{`/`}` and must not
  // trip this check).
  const isPlaceholder = (src) => {
    const afterPrefix = src.startsWith(PLUGIN_ROOT_PREFIX) ? src.slice(PLUGIN_ROOT_PREFIX.length) : src;
    return /[{}<>]/.test(afterPrefix);
  };
  if (rawSources.some(isPlaceholder)) return null;

  // A bare source token (neither `${CLAUDE_PLUGIN_ROOT}/...` nor a
  // placeholder) is a repo-relative path — install-dead, since a shipped
  // plugin install has no repo root to resolve it against.
  const bare = rawSources.find((src) => !src.startsWith(PLUGIN_ROOT_PREFIX));
  if (bare) return { unparsed: true, reason: `repo-relative source path (install-dead): ${bare}` };

  // Every surviving source is `${CLAUDE_PLUGIN_ROOT}/x`, which resolves
  // against `repoRoot` itself — the plugin payload root. The token is prose
  // that becomes a filesystem path, so it must stay inside that root: a
  // `..`-laden token (`${CLAUDE_PLUGIN_ROOT}/../x`) is an unparsed row, never
  // a read outside the corpus (docs/donts.md's path-decision rule, #1678).
  const root = path.resolve(repoRoot);
  const sources = rawSources.map((src) => path.resolve(root, src.slice(PLUGIN_ROOT_PREFIX.length)));
  const escaped = sources.find((p) => { const rel = path.relative(root, p); return rel === '' || rel.startsWith('..') || path.isAbsolute(rel); });
  if (escaped) return { unparsed: true, reason: `source path escapes the plugin root: ${escaped}` };
  return { step, sources };
}

// Every compose call site in the shipped skill prose — the producer set the
// composed-bytes hard gate (Task 4) runs over. Single-line call form only,
// by construction of this decomposition's call sites: every call site this
// decomposition produces sits on one line; a wrapped call is not found. A
// line that has the invocation form but doesn't parse is emitted as an
// `unparsed` row rather than silently dropped (parse-signal discipline).
function findComposeCallSites(repoRoot) {
  const dir = corpusDir(repoRoot);
  const out = [];
  for (const p of walkMarkdown(dir)) {
    const file = path.relative(dir, p);
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const [i, line] of lines.entries()) {
      if (!line.includes('compose-context.js')) continue;
      const parsed = parseComposeCallLine(line, repoRoot);
      if (!parsed) continue;
      if (parsed.unparsed) {
        out.push({
          step: null, file, line: i + 1, unparsed: true, reason: parsed.reason,
        });
        continue;
      }
      out.push({ step: parsed.step, file, line: i + 1, sources: parsed.sources });
    }
  }
  return out;
}

// #1989's PR-time measurement (parent #1987 promise F4) reported 55,995 B
// under pr-first+gh — but that was one combination, not the worst case: the
// real corpus's actual max across all four integration-model x transport
// combinations is 58,755 B, at local-merge+mcp, and the `unresolved`
// both-branches row a standalone run reads is 58,761 B (measured here at
// #1990's authoring time; run the informational test to reconfirm). Either way it's
// over CEILING_BYTES before this record exists. This record's Non-Goals say
// it only measures, so the gate cannot demand a restructure it forbids;
// restructuring the merge bundle is a follow-up record filed at this
// record's wrap-up. The stale-exception test below removes this entry's
// reason to exist the moment `merge` fits under CEILING_BYTES on its own.
const COMPOSED_STEP_EXCEPTIONS = { merge: 59 * 1024 };

// One row per compose call site in the shipped skill prose — the producer
// set the composed-bytes hard gate (`overComposedCeiling`) runs over.
function composedBytesReport(repoRoot) {
  return findComposeCallSites(repoRoot).map((c) => measureComposed(repoRoot, c));
}

// The hard gate: every combination (or error) over its step's ceiling.
// `COMPOSED_STEP_EXCEPTIONS` raises one step's ceiling above `CEILING_BYTES`
// where the real corpus already exceeds it; every other step uses
// `CEILING_BYTES` unchanged. This replaces the former per-file hard
// assertions — the number a reader actually pays is the composed bundle at a
// call site, not any one source file in isolation (`overCeilingWarnings`,
// the per-file warning tier, above).
function overComposedCeiling(rows, { exceptions = COMPOSED_STEP_EXCEPTIONS } = {}) {
  const out = [];
  for (const row of rows) {
    if (row.error) {
      out.push({
        step: row.step, file: row.file, line: row.line, error: row.error,
      });
      continue;
    }
    const ceiling = Object.prototype.hasOwnProperty.call(exceptions, row.step) ? exceptions[row.step] : CEILING_BYTES;
    for (const combo of row.combinations) {
      if (combo.bytes > ceiling) {
        out.push({
          step: row.step, file: row.file, line: row.line, conditions: combo.conditions, bytes: combo.bytes, ceiling,
        });
      }
    }
  }
  return out;
}

// Headroom is the story the raw size does not tell: a file at 39.9 KB is one
// paragraph from breaching, and reporting it as "under the ceiling" hides that.
function headroom(entry) {
  return CEILING_BYTES - entry.bytes;
}

// Early-warning tier (#336): the ceiling above is a binary pass/fail exactly at
// the limit, with no signal as a file approaches it. WARN_RATIO marks the
// half-open band [90%, 100%) of CEILING_BYTES — a file already at or over the
// ceiling is the hard-fail tests' job, never also flagged here.
const WARN_RATIO = 0.9;

function nearCeiling(entries) {
  const threshold = CEILING_BYTES * WARN_RATIO;
  return entries.filter((e) => e.bytes >= threshold && e.bytes < CEILING_BYTES);
}

// Pulls the single-line `description:` frontmatter value out of a SKILL.md,
// handling both the plain-scalar form (most skills) and the double-quoted
// form (needed whenever the value contains a bare `#` — an unquoted `#`
// preceded by whitespace starts a YAML comment and silently truncates the
// rest of the line, exactly the failure #393 named against dispatch's own
// description). Every description in this corpus is a single physical line
// (verified against the full skill set at #394's authoring time — none use
// YAML block-scalar folding), so no multi-line handling is needed here.
function extractDescription(content) {
  const split = splitFrontmatterFence(content);
  if (!split) return null;
  const line = split.frontmatter.find((l) => /^description:\s*/.test(l));
  if (!line) return null;
  let value = line.replace(/^description:\s*/, '');
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

// True when a raw `description:` frontmatter line (as it sits on disk) would
// have a YAML parser silently truncate it — #393. Operates on the RAW line,
// not extractDescription's output: the file on disk always holds the full
// pre-truncation text (nothing here runs a YAML parser), so checking the
// already-extracted value can't detect what a real parser would have dropped.
// A quoted scalar (`description: "..."`) is immune — everything inside the
// quotes is literal. An unquoted (plain) scalar starts a YAML comment at a
// `#` that is either the first character of the value or preceded by
// whitespace; a `#` glued to a non-space character (`issue#5`) is not a
// comment marker and is not a hazard.
function descriptionHashHazard(line) {
  const value = line.replace(/^description:/, '').replace(/^\s+/, '');
  if (value.startsWith('"')) return false;
  return /(^|\s)#/.test(value);
}

// Every shipped skill whose description: line carries the #393 hazard.
// [] means the corpus is currently clean — the historical instance
// (skills/dispatch/SKILL.md) was independently fixed by #394's trim.
function findDescriptionHashHazards(repoRoot) {
  const dir = skillsDir(repoRoot);
  return listSkillDirs(repoRoot).filter((name) => {
    const content = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    const split = splitFrontmatterFence(content);
    if (!split) return false;
    const line = split.frontmatter.find((l) => /^description:\s*/.test(l));
    return line ? descriptionHashHazard(line) : false;
  });
}

// Every SKILL.md's description length, in characters (not bytes — an em dash
// or accented letter is one character but multiple UTF-8 bytes, and this
// ceiling is about how much a human/LLM reads, not disk usage).
function measureDescriptions(repoRoot) {
  const dir = skillsDir(repoRoot);
  return listSkillDirs(repoRoot).map((name) => {
    const file = path.join(dir, name, 'SKILL.md');
    const content = fs.readFileSync(file, 'utf8');
    const description = extractDescription(content);
    return { name, chars: description === null ? 0 : [...description].length, description };
  });
}

function overDescriptionCeiling(entries) {
  return entries.filter((e) => e.chars > DESCRIPTION_CEILING_CHARS);
}

function totalDescriptionChars(entries) {
  return entries.reduce((sum, e) => sum + e.chars, 0);
}

module.exports = {
  CEILING_BYTES,
  DESCRIPTION_CEILING_CHARS,
  DESCRIPTION_TOTAL_CEILING_CHARS,
  measuredBytes,
  measureSkills,
  measureSubFiles,
  overCeiling,
  overCeilingWarnings,
  parseComposeCallLine,
  findComposeCallSites,
  usedConditionKeys,
  conditionCombinations,
  measureComposed,
  COMPOSED_STEP_EXCEPTIONS,
  composedBytesReport,
  overComposedCeiling,
  totalBytes,
  headroom,
  nearCeiling,
  WARN_RATIO,
  extractDescription,
  descriptionHashHazard,
  findDescriptionHashHazards,
  measureDescriptions,
  overDescriptionCeiling,
  totalDescriptionChars,
};
