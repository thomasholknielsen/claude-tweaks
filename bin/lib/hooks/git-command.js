// bin/lib/hooks/git-command.js
'use strict';
const path = require('path');

// Quote-aware top-level split: a single pass tracks single/double-quote state
// and only cuts at separators (&&, ||, ;, |, newline) that are outside any
// quote span. Newline is a segment boundary because gitTargets only ever
// inspects t[0] of each segment to detect a `cd`/`git` command — a bare
// newline (not `&&`/`;`) between two statements otherwise merges them into
// one segment, silently hiding a `cd` that isn't the segment's first token
// (e.g. `VAR="x"\ncd "$VAR" && git commit` — the `cd` never gets seen, so
// the effective cwd used for the commit target stays whatever it was before
// this segment, not where the command will actually run).
// This protects the safety invariant — ambiguity resolves to allow — by
// preventing quoted text (e.g. a commit message containing "&& git -C /x push")
// from being misparsed as additional shell segments that fabricate a target.
function splitSegments(command) {
  const str = String(command || '');
  const segments = [];
  let current = '';
  let quote = null; // null | '"' | "'"
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote === "'") {
      // Inside single quotes, backslash has no special meaning in bash.
      current += ch;
      if (ch === "'") quote = null;
      continue;
    }
    // Not inside single quotes (unquoted or inside double quotes): a
    // backslash escapes the next character, so `\"` never toggles quote
    // state and `\\` is a literal backslash — matching bash semantics.
    if (ch === '\\' && i + 1 < str.length) {
      current += ch + str[i + 1];
      i += 1;
      continue;
    }
    if (quote === '"') {
      current += ch;
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '&' && str[i + 1] === '&') { segments.push(current); current = ''; i += 1; continue; }
    if (ch === '|' && str[i + 1] === '|') { segments.push(current); current = ''; i += 1; continue; }
    if (ch === ';' || ch === '|' || ch === '\n') { segments.push(current); current = ''; continue; }
    current += ch;
  }
  segments.push(current);
  return segments;
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

// A raw (unquote-stripped) cd/-C argument that is unresolvable to a concrete,
// literal path: no argument, "-", starts with "~", contains "$"/backtick, or
// contains a backslash/double-quote. The last two guard against token-level
// ambiguity: the regex tokenizer below is not escape-aware, so a value that
// still carries a backslash or stray quote (from an escaped-quote sequence
// upstream) cannot be trusted as a literal path — never claim an unprovable
// target.
function isUnresolvable(raw) {
  return (
    raw === undefined ||
    raw === '-' ||
    raw.startsWith('~') ||
    raw.includes('$') ||
    raw.includes('`') ||
    raw.includes('\\') ||
    raw.includes('"')
  );
}

function isAbsolutePlain(raw) {
  return !isUnresolvable(raw) && path.isAbsolute(raw);
}

// Shared cd-token resolution used by both gitTargets and fileWriteTargets: given
// the current effective cwd (string, or null meaning UNKNOWN) and a `cd`
// command's raw (unquote-stripped) argument, returns the new effective cwd (or
// null when the argument leaves it unprovable). Kept as one function so a
// future fix to cd-resolution edge cases (a new isUnresolvable pattern,
// pushd/popd support, etc.) can never land in one caller and not the other.
function resolveCd(effCwd, raw) {
  if (isUnresolvable(raw)) return null;
  if (effCwd === null) {
    // Unknown cwd: only a plain absolute path restores provability.
    return isAbsolutePlain(raw) ? path.resolve(raw) : null;
  }
  return path.resolve(effCwd, stripQuotes(raw));
}

function gitTargets(command, cwd) {
  const targets = [];
  let effCwd = cwd || '.'; // string, or null meaning UNKNOWN
  for (const seg of splitSegments(command)) {
    const t = tokenize(seg.trim());
    if (!t.length) continue;
    if (t[0] === 'cd') {
      effCwd = resolveCd(effCwd, t[1]);
      continue;
    }
    if (t[0] !== 'git') continue;
    let i = 1;
    let dir = effCwd; // may be null (UNKNOWN)
    let unprovable = false;
    while (i < t.length && t[i].startsWith('-')) {
      const flag = t[i];
      if (UNPROVABLE_FLAGS.some((u) => flag === u || flag.startsWith(u + '='))) { unprovable = true; i += flag.includes('=') ? 1 : 2; continue; }
      if (flag === '-C' && t[i + 1]) {
        const raw = t[i + 1];
        if (isUnresolvable(raw)) {
          unprovable = true;
        } else if (path.isAbsolute(raw)) {
          dir = path.resolve(raw);
        } else if (dir === null) {
          // Relative -C while cwd is UNKNOWN — cannot prove the target.
          unprovable = true;
        } else {
          dir = path.resolve(dir, raw);
        }
        i += 2;
        continue;
      }
      if (VALUE_FLAGS.has(flag) && t[i + 1]) { i += 2; continue; }
      i += 1;
    }
    if (unprovable) continue;
    if (dir === null) continue; // cwd UNKNOWN and no provable -C — no target
    const sub = t[i];
    if (sub === 'commit' || sub === 'push') targets.push({ action: sub, dir });
  }
  return targets;
}

// Best-effort detection of common non-git, non-Edit/Write direct file-write
// shapes in a Bash command: tee, cp, mv. Scoped to what hooks.json can also
// gate on structurally via its own if-matcher (Bash(cp *)/Bash(mv *)/
// Bash(tee *)) — output redirection (>, >>) is deliberately NOT covered here,
// since the if-matcher can't recognize a bare shell operator (only a named
// subcommand), and firing this on every Bash call to catch it unconditionally
// would add latency to every Bash invocation in every session using this
// plugin, not just ones exercising the gap. sed -i, python -c, perl -i, awk,
// and nested `sh -c "..."` invocations are also NOT covered — this catches
// representative common cases, not every possible one. Ambiguity resolves to
// "no target" (allow), matching gitTargets' own safety posture: never
// fabricate a target from a path this can't prove.
const DEVNULL_LIKE = new Set(['/dev/null', '/dev/stdout', '/dev/stderr']);

function resolveWriteTarget(effCwd, raw) {
  if (isUnresolvable(raw)) return null;
  const stripped = stripQuotes(raw);
  if (DEVNULL_LIKE.has(stripped)) return null;
  if (path.isAbsolute(stripped)) return path.resolve(stripped);
  if (effCwd === null) return null; // cwd UNKNOWN and a relative path — not provable
  return path.resolve(effCwd, stripped);
}

function fileWriteTargets(command, cwd) {
  const targets = [];
  let effCwd = cwd || '.';
  for (const seg of splitSegments(command)) {
    const t = tokenize(seg.trim());
    if (!t.length) continue;
    if (t[0] === 'cd') {
      effCwd = resolveCd(effCwd, t[1]);
      continue;
    }

    if (t[0] === 'tee') {
      const arg = t.slice(1).find((a) => !a.startsWith('-'));
      const file = resolveWriteTarget(effCwd, arg);
      if (file) targets.push({ action: 'write', file });
      continue;
    }

    if (t[0] === 'cp' || t[0] === 'mv') {
      const nonFlags = t.slice(1).filter((a) => !a.startsWith('-'));
      if (nonFlags.length >= 2) {
        const file = resolveWriteTarget(effCwd, nonFlags[nonFlags.length - 1]);
        if (file) targets.push({ action: t[0] === 'cp' ? 'copy' : 'move', file });
      }
      continue;
    }
  }
  return targets;
}

module.exports = { gitTargets, fileWriteTargets, splitSegments, tokenize };
