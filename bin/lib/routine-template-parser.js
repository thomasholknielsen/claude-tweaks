'use strict';

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
    const rest = m[2].trim();

    if (rest === '') {
      const nested = {};
      let j = i + 1;
      let sawNested = false;
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') {
          j++;
          continue;
        }
        if (indentOf(nl) === 0) break;
        sawNested = true;
        const nm = nl.match(/^\s*([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/);
        if (nm) nested[nm[1]] = coerceScalar(nm[2]);
        j++;
      }
      result[key] = sawNested ? nested : '';
      i = j;
    } else if (rest === '>') {
      let j = i + 1;
      const parts = [];
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') {
          j++;
          continue;
        }
        if (indentOf(nl) === 0) break;
        parts.push(nl.trim());
        j++;
      }
      result[key] = parts.join(' ');
      i = j;
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

module.exports = { parseRoutineTemplate };
