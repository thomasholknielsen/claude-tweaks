'use strict';

const fs = require('fs');
const path = require('path');

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function coerceScalar(raw) {
  const v = stripQuotes(raw);
  return /^-?\d+$/.test(v) ? Number(v) : v;
}

function parseInlineArray(s) {
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  return inner.split(',').map((item) => stripQuotes(item.trim()));
}

function indentOf(line) {
  return line.match(/^(\s*)/)[1].length;
}

// Strips a trailing ` # comment` from a YAML scalar/value string, honoring
// simple single/double quoting (a `#` inside a matched '...'/"..." span is
// literal text, not a comment start). Per the YAML spec, a `#` only starts a
// comment when preceded by whitespace or at the start of the string.
function stripTrailingComment(s) {
  let inSingle = false;
  let inDouble = false;
  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble && (idx === 0 || /\s/.test(s[idx - 1]))) {
      return s.slice(0, idx).trimEnd();
    }
  }
  return s;
}

// Collects the indented continuation block belonging to a top-level `key:`
// line, starting at `startIndex`. Returns each line verbatim (blank lines
// represented as `null` markers so callers can tell a paragraph/entry break
// apart from real content) plus the index of the first line past the block
// (either EOF or the next indentOf === 0 line). Shared by the nested-map
// branch and the folded block-scalar branch below, which otherwise hand-
// implement the identical "skip blank lines, stop at the next top-level
// line" loop as two separately-maintained copies.
function collectIndentedContinuation(lines, startIndex) {
  const collected = [];
  let j = startIndex;
  while (j < lines.length) {
    const nl = lines[j];
    if (nl.trim() === '') {
      collected.push(null);
      j++;
      continue;
    }
    if (indentOf(nl) === 0) break;
    collected.push(nl);
    j++;
  }
  return { collected, next: j };
}

// Parses the narrow YAML subset every routine-template.yml uses: top-level
// scalars, inline flow arrays, one level of nested map, and a single folded
// block scalar (`>`). Not a general-purpose YAML parser by design — see
// Global Constraints in docs/superpowers/plans/2026-07-05-routine-improvements.md.
function parseRoutineTemplate(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (indentOf(line) !== 0) {
      i++;
      continue;
    }

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = stripTrailingComment(m[2].trim());

    if (rest === '') {
      const nested = {};
      let sawNested = false;
      const { collected, next } = collectIndentedContinuation(lines, i + 1);
      for (const nl of collected) {
        if (nl === null) continue;
        const nm = nl.match(/^\s*([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/);
        if (nm) {
          sawNested = true;
          nested[nm[1]] = coerceScalar(stripTrailingComment(nm[2]));
        } else if (/^\s*-\s/.test(nl)) {
          // A YAML block-style list ('- item') under a top-level key is not
          // part of the narrow subset this parser supports (see the function
          // docstring) — fail loudly instead of silently dropping every list
          // entry and resolving the key to an empty object.
          throw new Error(
            `parseRoutineTemplate: "${key}:" has a YAML block-style list (- item), which this narrow parser does not support — use an inline [a, b] array instead`
          );
        }
      }
      result[key] = sawNested ? nested : '';
      i = next;
    } else if (rest === '>') {
      const { collected, next } = collectIndentedContinuation(lines, i + 1);
      // Fold each run of consecutive content lines into one space-joined
      // line (real YAML folding); a blank line inside the block is a
      // paragraph break, preserved as `\n\n` between paragraphs rather than
      // silently discarded (which would run every paragraph together with
      // only a single space between them).
      const paragraphs = [];
      let current = [];
      for (const nl of collected) {
        if (nl === null) {
          if (current.length > 0) {
            paragraphs.push(current.join(' '));
            current = [];
          }
          continue;
        }
        current.push(nl.trim());
      }
      if (current.length > 0) paragraphs.push(current.join(' '));
      result[key] = paragraphs.join('\n\n');
      i = next;
    } else if (rest.startsWith('[')) {
      result[key] = parseInlineArray(rest);
      i++;
    } else {
      result[key] = coerceScalar(rest);
      i++;
    }
  }

  return result;
}

function listRoutineRecords(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((name) => name.endsWith('.yml'))
    .sort()
    .map((filename) => {
      const text = fs.readFileSync(path.join(dir, filename), 'utf8');
      return { ...parseRoutineTemplate(text), filename };
    });
}

module.exports = { parseRoutineTemplate, listRoutineRecords };
