'use strict';

// tools/upstream-drift/manifest.js — a hand-rolled parser and schema
// validator for tools/upstream-drift/manifest.yml. No YAML dependency: the
// plugin ships zero runtime npm deps (same posture as bin/lib/policy.js),
// so only the small YAML subset this manifest actually uses is supported.
//
// Anything outside that subset throws, naming the 1-based line number.
// Silence or a misparse is the exact failure mode this tool exists to
// prevent, so every ambiguous or unrecognized construct errs toward
// throwing rather than guessing.

const fs = require('fs');

// ─── scalar helpers ─────────────────────────────────────────────────────

// YAML indicator characters this subset does not implement (block scalars,
// anchors/aliases, tags, directives, explicit keys). A bare scalar starting
// with one of these would otherwise silently parse as a literal string
// containing that character, which is exactly the silent-misparse failure
// mode this module exists to avoid. '-' is deliberately excluded: it is a
// legitimate leading character of a negative integer bare scalar.
const RESERVED_BARE_LEADERS = new Set(['|', '>', '&', '*', '!', '%', '@', '`', '?']);

const BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function parseDoubleQuoted(text, lineNo) {
  let out = '';
  let i = 1;
  let closed = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '"') {
        out += '"';
        i++;
        continue;
      }
      if (next === '\\') {
        out += '\\';
        i++;
        continue;
      }
      throw new Error(`Unsupported YAML at line ${lineNo}: unsupported escape sequence '\\${next}' in double-quoted scalar (only \\" and \\\\ are supported)`);
    }
    if (ch === '"') {
      closed = true;
      i++;
      break;
    }
    out += ch;
  }
  if (!closed) {
    throw new Error(`Unsupported YAML at line ${lineNo}: unterminated double-quoted scalar`);
  }
  const trailing = text.slice(i).trim();
  if (trailing !== '') {
    throw new Error(`Unsupported YAML at line ${lineNo}: unexpected content after quoted scalar: '${trailing}'`);
  }
  return out;
}

function parseSingleQuoted(text, lineNo) {
  let out = '';
  let i = 1;
  let closed = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      if (text[i + 1] === "'") {
        out += "'";
        i++;
        continue;
      }
      closed = true;
      i++;
      break;
    }
    out += ch;
  }
  if (!closed) {
    throw new Error(`Unsupported YAML at line ${lineNo}: unterminated single-quoted scalar`);
  }
  const trailing = text.slice(i).trim();
  if (trailing !== '') {
    throw new Error(`Unsupported YAML at line ${lineNo}: unexpected content after quoted scalar: '${trailing}'`);
  }
  return out;
}

// text is already trimmed. Quoted values are ALWAYS strings; bare true/false
// are booleans; bare integers are numbers; everything else bare is a string.
function parseScalar(text, lineNo) {
  if (text[0] === '"') return parseDoubleQuoted(text, lineNo);
  if (text[0] === "'") return parseSingleQuoted(text, lineNo);
  if (RESERVED_BARE_LEADERS.has(text[0])) {
    throw new Error(`Unsupported YAML at line ${lineNo}: unsupported construct starting with '${text[0]}' (not in the supported subset)`);
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

// ─── quote-aware scanning ───────────────────────────────────────────────
// Shared low-level scan pattern: walk a string tracking whether we're
// inside a single- or double-quoted run (respecting \" \\ in double quotes
// and '' as an escaped quote in single quotes), so callers can find
// structural characters (':', '#', ',', brackets) that are outside any
// quoted scalar without re-parsing the quotes themselves.

// Finds the first ':' outside any quoted scalar that is immediately
// followed by a space or end-of-string — the key/value separator shape
// this subset requires ("key: value" or "key:" with nothing after).
// Returns {key, valueText} or null if no such colon exists.
function splitKeyValue(content) {
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (quote === '"') {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === '"') quote = null;
      } else {
        if (ch === "'") {
          if (content[i + 1] === "'") {
            i++;
            continue;
          }
          quote = null;
        }
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':') {
      const next = content[i + 1];
      if (next === undefined || next === ' ') {
        return { key: content.slice(0, i).trim(), valueText: content.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

function stripCommentAndTrim(rest) {
  let quote = null;
  let cutAt = -1;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote) {
      if (quote === '"') {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === '"') quote = null;
      } else {
        if (ch === "'") {
          if (rest[i + 1] === "'") {
            i++;
            continue;
          }
          quote = null;
        }
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') {
      cutAt = i;
      break;
    }
  }
  const content = cutAt === -1 ? rest : rest.slice(0, cutAt);
  return content.replace(/\s+$/, '');
}

// Finds the index of the closing bracket matching the opening bracket at
// text[openIdx] ('{' or '['), tracking nested brackets and quoted scalars.
function findMatchingBracket(text, openIdx, lineNo) {
  const openChar = text[openIdx];
  const closeChar = openChar === '{' ? '}' : ']';
  const stack = [closeChar];
  let quote = null;
  for (let i = openIdx + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"') {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === '"') quote = null;
      } else {
        if (ch === "'") {
          if (text[i + 1] === "'") {
            i++;
            continue;
          }
          quote = null;
        }
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = stack.pop();
      if (expected !== ch) {
        throw new Error(`Unsupported YAML at line ${lineNo}: mismatched '${ch}' in flow collection`);
      }
      if (stack.length === 0) return i;
      continue;
    }
  }
  throw new Error(`Unsupported YAML at line ${lineNo}: unterminated flow collection (missing closing '${closeChar}')`);
}

// Splits str (the interior of a flow collection, brackets already
// stripped) on commas that sit outside any nested bracket and outside any
// quoted scalar. Returns an array of trimmed substrings.
function splitTopLevelCommas(str, lineNo) {
  const parts = [];
  const depthStack = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (quote === '"') {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === '"') quote = null;
      } else {
        if (ch === "'") {
          if (str[i + 1] === "'") {
            i++;
            continue;
          }
          quote = null;
        }
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depthStack.push('}');
      continue;
    }
    if (ch === '[') {
      depthStack.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = depthStack.pop();
      if (expected !== ch) {
        throw new Error(`Unsupported YAML at line ${lineNo}: mismatched '${ch}' in flow collection`);
      }
      continue;
    }
    if (ch === ',' && depthStack.length === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts.map((p) => p.trim());
}

function parseFlowElementValue(text, lineNo) {
  if (text[0] === '{' || text[0] === '[') return parseFlowCollection(text, lineNo);
  return parseScalar(text, lineNo);
}

// text is trimmed and starts with '{' or '['.
function parseFlowCollection(text, lineNo) {
  const closeIdx = findMatchingBracket(text, 0, lineNo);
  const trailing = text.slice(closeIdx + 1).trim();
  if (trailing !== '') {
    throw new Error(`Unsupported YAML at line ${lineNo}: unexpected content after flow collection: '${trailing}'`);
  }
  const inner = text.slice(1, closeIdx).trim();
  if (text[0] === '{') {
    if (inner === '') return {};
    const obj = {};
    for (const part of splitTopLevelCommas(inner, lineNo)) {
      if (part === '') {
        throw new Error(`Unsupported YAML at line ${lineNo}: empty entry in flow map`);
      }
      const split = splitKeyValue(part);
      if (!split || !BARE_KEY_PATTERN.test(split.key)) {
        throw new Error(`Unsupported YAML at line ${lineNo}: expected 'key: value' in flow map entry '${part}'`);
      }
      if (split.valueText === '') {
        throw new Error(`Unsupported YAML at line ${lineNo}: flow map key '${split.key}' has no value`);
      }
      obj[split.key] = parseFlowElementValue(split.valueText, lineNo);
    }
    return obj;
  }
  if (inner === '') return [];
  return splitTopLevelCommas(inner, lineNo).map((part) => {
    if (part === '') {
      throw new Error(`Unsupported YAML at line ${lineNo}: empty element in flow sequence`);
    }
    return parseFlowElementValue(part, lineNo);
  });
}

// ─── line preprocessing ─────────────────────────────────────────────────

// Returns {lineNo, indent, content} for a physical line, or null if the
// line is blank or a full-line comment (both are skipped anywhere). Throws
// if the line's indentation uses a tab.
function processLine(rawLine, lineNo) {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (line.trim() === '') return null;
  const leading = line.match(/^[ \t]*/)[0];
  if (leading.includes('\t')) {
    throw new Error(`Unsupported YAML at line ${lineNo}: tab character used for indentation`);
  }
  const indent = leading.length;
  const content = stripCommentAndTrim(line.slice(indent));
  if (content === '') return null;
  return { lineNo, indent, content };
}

// ─── block parsing (recursive descent over a shared cursor) ────────────

function isSequenceItem(content) {
  return content[0] === '-' && (content.length === 1 || content[1] === ' ');
}

// Dispatches a required value: '' (nothing after the key/dash on its own
// line) means the value is a nested block on more-indented following
// lines; a flow-bracket leader means a flow collection; anything else is a
// scalar. parentIndent is the indent level the nested block must exceed.
function parseValue(valueText, line, parentIndent, lines, pos) {
  if (valueText === '') {
    if (pos.i < lines.length && lines[pos.i].indent > parentIndent) {
      return parseBlock(lines, pos, lines[pos.i].indent);
    }
    throw new Error(`Unsupported YAML at line ${line.lineNo}: missing value with no nested block following`);
  }
  if (valueText[0] === '{' || valueText[0] === '[') {
    return parseFlowCollection(valueText, line.lineNo);
  }
  return parseScalar(valueText, line.lineNo);
}

function parseMapBody(lines, pos, indent) {
  const result = {};
  while (pos.i < lines.length && lines[pos.i].indent === indent) {
    const line = lines[pos.i];
    if (isSequenceItem(line.content)) break;
    const split = splitKeyValue(line.content);
    if (!split) {
      throw new Error(`Unsupported YAML at line ${line.lineNo}: expected 'key: value'`);
    }
    if (!BARE_KEY_PATTERN.test(split.key)) {
      throw new Error(`Unsupported YAML at line ${line.lineNo}: invalid key '${split.key}'`);
    }
    pos.i++;
    result[split.key] = parseValue(split.valueText, line, indent, lines, pos);
  }
  return result;
}

function parseSequence(lines, pos, indent) {
  const result = [];
  while (pos.i < lines.length && lines[pos.i].indent === indent) {
    const line = lines[pos.i];
    const content = line.content;
    if (!isSequenceItem(content)) break;

    let k = 1;
    while (k < content.length && content[k] === ' ') k++;
    const itemRest = content.slice(k);
    const itemIndentAbsolute = indent + k;
    pos.i++;

    let value;
    if (itemRest === '') {
      value = parseValue('', line, indent, lines, pos);
    } else if (itemRest[0] === '"' || itemRest[0] === "'" || itemRest[0] === '{' || itemRest[0] === '[') {
      value = parseValue(itemRest, line, indent, lines, pos);
    } else {
      const split = splitKeyValue(itemRest);
      if (split && BARE_KEY_PATTERN.test(split.key)) {
        const obj = {};
        obj[split.key] = parseValue(split.valueText, line, itemIndentAbsolute, lines, pos);
        Object.assign(obj, parseMapBody(lines, pos, itemIndentAbsolute));
        value = obj;
      } else {
        value = parseValue(itemRest, line, indent, lines, pos);
      }
    }
    result.push(value);
  }
  return result;
}

function parseBlock(lines, pos, indent) {
  const line = lines[pos.i];
  if (isSequenceItem(line.content)) {
    return parseSequence(lines, pos, indent);
  }
  const split = splitKeyValue(line.content);
  if (!split) {
    throw new Error(`Unsupported YAML at line ${line.lineNo}: expected a block sequence ('- item') or a mapping key ('key: value')`);
  }
  return parseMapBody(lines, pos, indent);
}

// ─── public API ──────────────────────────────────────────────────────────

function parseManifest(text) {
  const rawLines = text.split('\n');
  const lines = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const processed = processLine(rawLines[idx], idx + 1);
    if (processed) lines.push(processed);
  }
  if (lines.length === 0) return {};

  const pos = { i: 0 };
  const value = parseBlock(lines, pos, lines[0].indent);
  if (pos.i !== lines.length) {
    throw new Error(`Unsupported YAML at line ${lines[pos.i].lineNo}: unexpected indentation or structure`);
  }
  return value;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validateManifest(obj) {
  const errors = [];

  if (!isPlainObject(obj)) {
    errors.push("Manifest root must be a map with a 'dependencies' key");
    return errors;
  }
  if (!hasKey(obj, 'dependencies')) {
    errors.push("Missing required top-level key 'dependencies'");
    return errors;
  }
  if (!Array.isArray(obj.dependencies)) {
    errors.push("'dependencies' must be a list");
    return errors;
  }
  if (obj.dependencies.length === 0) {
    errors.push("'dependencies' must be a non-empty list");
    return errors;
  }

  const seenNames = new Set();

  obj.dependencies.forEach((dep, idx) => {
    const label = isPlainObject(dep) && isNonEmptyString(dep.name) ? dep.name : `dependencies[${idx}]`;

    if (!isPlainObject(dep)) {
      errors.push(`Dependency ${label}: entry must be a map`);
      return;
    }

    // name
    if (!isNonEmptyString(dep.name)) {
      errors.push(`Dependency ${label}: missing or empty required key 'name'`);
    } else if (seenNames.has(dep.name)) {
      errors.push(`Dependency ${label}: duplicate 'name' value '${dep.name}'`);
    } else {
      seenNames.add(dep.name);
    }

    // kind
    if (!isNonEmptyString(dep.kind)) {
      errors.push(`Dependency ${label}: missing or empty required key 'kind'`);
    }

    // installed-probe
    if (!isPlainObject(dep['installed-probe'])) {
      errors.push(`Dependency ${label}: missing or invalid required key 'installed-probe' (must be a map)`);
    } else {
      const probe = dep['installed-probe'];
      if (!isNonEmptyString(probe.type)) {
        errors.push(`Dependency ${label}: 'installed-probe.type' is required`);
      } else if (probe.type === 'command') {
        if (!isNonEmptyString(probe.run)) {
          errors.push(`Dependency ${label}: 'installed-probe.run' is required when type is 'command'`);
        }
      } else if (probe.type === 'plugin-cache-glob') {
        if (!isNonEmptyString(probe.glob)) {
          errors.push(`Dependency ${label}: 'installed-probe.glob' is required when type is 'plugin-cache-glob'`);
        }
      } else {
        errors.push(`Dependency ${label}: 'installed-probe.type' must be 'command' or 'plugin-cache-glob' (got '${probe.type}')`);
      }
    }

    // pinned
    if (!isNonEmptyString(dep.pinned)) {
      errors.push(`Dependency ${label}: missing or empty required key 'pinned'`);
    }

    // upstream
    if (!isPlainObject(dep.upstream)) {
      errors.push(`Dependency ${label}: missing or invalid required key 'upstream' (must be a map)`);
    } else {
      if (!isNonEmptyString(dep.upstream.repo)) {
        errors.push(`Dependency ${label}: 'upstream.repo' is required`);
      }
      if (!isNonEmptyString(dep.upstream['tag-prefix'])) {
        errors.push(`Dependency ${label}: 'upstream.tag-prefix' is required`);
      }
    }

    // contract-paths
    if (!hasKey(dep, 'contract-paths')) {
      errors.push(`Dependency ${label}: missing required key 'contract-paths'`);
    } else if (!Array.isArray(dep['contract-paths'])) {
      errors.push(`Dependency ${label}: 'contract-paths' must be a list`);
    } else {
      dep['contract-paths'].forEach((p, i) => {
        if (typeof p !== 'string') {
          errors.push(`Dependency ${label}: 'contract-paths[${i}]' must be a string`);
        }
      });
    }

    // assertions
    if (!hasKey(dep, 'assertions')) {
      errors.push(`Dependency ${label}: missing required key 'assertions'`);
    } else if (!Array.isArray(dep.assertions)) {
      errors.push(`Dependency ${label}: 'assertions' must be a list`);
    } else {
      dep.assertions.forEach((a, i) => {
        if (!isPlainObject(a)) {
          errors.push(`Dependency ${label}: 'assertions[${i}]' must be a map`);
          return;
        }
        ['file', 'claims', 'upstream-path', 'must-match'].forEach((key) => {
          if (!isNonEmptyString(a[key])) {
            errors.push(`Dependency ${label}: 'assertions[${i}].${key}' is required`);
          }
        });
      });
    }

    // fixtures
    if (!hasKey(dep, 'fixtures')) {
      errors.push(`Dependency ${label}: missing required key 'fixtures'`);
    } else if (!Array.isArray(dep.fixtures)) {
      errors.push(`Dependency ${label}: 'fixtures' must be a list`);
    } else {
      dep.fixtures.forEach((f, i) => {
        if (!isPlainObject(f)) {
          errors.push(`Dependency ${label}: 'fixtures[${i}]' must be a map`);
          return;
        }
        if (!isNonEmptyString(f.run)) {
          errors.push(`Dependency ${label}: 'fixtures[${i}].run' is required`);
        }
        if (!isPlainObject(f.expect)) {
          errors.push(`Dependency ${label}: 'fixtures[${i}].expect' is required and must be a map`);
        } else {
          if (typeof f.expect.exit !== 'number') {
            errors.push(`Dependency ${label}: 'fixtures[${i}].expect.exit' must be a number`);
          }
          if (f.expect.stream !== 'stdout' && f.expect.stream !== 'stderr') {
            errors.push(`Dependency ${label}: 'fixtures[${i}].expect.stream' must be exactly 'stdout' or 'stderr'`);
          }
          if (!hasKey(f.expect, 'keys')) {
            errors.push(`Dependency ${label}: 'fixtures[${i}].expect.keys' is required`);
          } else if (!Array.isArray(f.expect.keys)) {
            errors.push(`Dependency ${label}: 'fixtures[${i}].expect.keys' must be a list`);
          } else {
            f.expect.keys.forEach((k, ki) => {
              if (typeof k !== 'string') {
                errors.push(`Dependency ${label}: 'fixtures[${i}].expect.keys[${ki}]' must be a string`);
              }
            });
          }
        }
      });
    }
  });

  return errors;
}

function loadManifest(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const obj = parseManifest(text);
  const errors = validateManifest(obj);
  if (errors.length > 0) {
    throw new Error(`Invalid manifest at ${filePath}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  return obj;
}

module.exports = { parseManifest, validateManifest, loadManifest };
