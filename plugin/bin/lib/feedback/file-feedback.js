// bin/lib/feedback/file-feedback.js
// Argv-safe upstream-feedback filing (#681). Replaces skills/feedback/SKILL.md
// Step 8's shell recipe, which interpolated a model-authored title into
// `gh issue create --title '<title>'` — a title containing backticks got
// command-substituted by /bin/sh before `gh` ever saw it. Here the title
// travels through the injectable runner's argv array, never a shell string.
// Also replaces Step 4's `createFingerprint` misuse: that function is a
// factory returning { fingerprint, normalizeDescription } for a
// named-fields-off-an-object caller shape (docs-health, harness-health,
// journey-health); calling it directly on a string basis produced
// `[object Object]`. This module calls fingerprintFromBasis directly instead.
//
// Same two-file shape as bin/lib/issues/link.js + bin/link-records.js:
// defaultRunner, errorText, per-item try/catch into a status envelope, every
// side effect (runner, filesystem) injectable so tests never touch real `gh`
// or disk. Module never calls process.exit, never reads argv, never touches
// real `gh` unless the caller's runner does.
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Same shape as bin/lib/issues/link.js's errorText — a runner may throw a
// non-Error (string, object, undefined); never let the failure reason come
// back empty.
function errorText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.length ? parts.join(' ') : String(err);
}

// draft.fingerprintBasis: { component, summary } -> 'feedback-{8 hex}'. Throws
// if either field is missing — a caller bug (the CLI must validate every
// draft's shape before calling this), not a runtime condition to paper over.
function computeFingerprint(draft) {
  const basis = draft && draft.fingerprintBasis;
  const hasComponent = basis && basis.component !== undefined && basis.component !== null && basis.component !== '';
  const hasSummary = basis && basis.summary !== undefined && basis.summary !== null && basis.summary !== '';
  if (!hasComponent || !hasSummary) {
    throw new Error('computeFingerprint: draft.fingerprintBasis must include both component and summary');
  }
  return fingerprintFromBasis('feedback', [basis.component, normalizeText(basis.summary)]);
}

// The sole source of truth for what fingerprint marker actually gets filed.
// Step 5's draft template already renders a `<!-- fingerprint: <marker> -->`
// placeholder line as part of the human-readable preview — possibly the
// literal `[object Object]` bug text if drafted before this fix. Never trust
// that incoming value: replace the line wholesale if present, else append it.
function embedFingerprint(body, fingerprint) {
  const line = `<!-- fingerprint: ${fingerprint} -->`;
  const marker = /<!-- fingerprint:[^\n]*-->/;
  if (marker.test(String(body))) return String(body).replace(marker, line);
  const sep = String(body).endsWith('\n') ? '' : '\n';
  return `${body}${sep}${line}\n`;
}

// { repo, marker, runner } -> first matching issue { number, title, ... } or
// null. `gh issue list --search` matches substrings in the body, so the
// fingerprint HTML comment text itself is a sufficient dedup marker. One call
// per draft: dedup is cheap and per-item fail-safe matters more here than
// batching — unlike link.js's databaseId resolution, there's no shared batch
// call to make.
function findDuplicate({ repo, marker, runner = defaultRunner }) {
  const out = runner(['issue', 'list', '--repo', repo, '--search', marker, '--state', 'all', '--json', 'number,title']);
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
}

// Writes body to bodyFile (caller supplies the path — keeps this function
// testable without touching the real filesystem's tmp dir), then files the
// issue. Title goes through the runner's argv array — never string-
// interpolated. `gh` has no `--title-file`; body still goes via `--body-file`.
// Parses the created issue's number from gh's printed URL.
function fileDraft({ repo, title, body, labels = [], runner = defaultRunner, bodyFile, writeFile = fs.writeFileSync }) {
  writeFile(bodyFile, body, 'utf8');
  const labelArgs = labels.flatMap((l) => ['--label', l]);
  const out = runner(['issue', 'create', '--repo', repo, '--title', title, '--body-file', bodyFile, ...labelArgs]);
  const m = /\/issues\/(\d+)/.exec(String(out));
  if (!m) throw new Error(`fileDraft: could not parse issue number from gh output: ${JSON.stringify(String(out))}`);
  return Number(m[1]);
}

function readBack({ repo, number, runner = defaultRunner }) {
  const out = runner(['issue', 'view', String(number), '--repo', repo, '--json', 'title,body']);
  const parsed = JSON.parse(out);
  return { title: parsed.title, body: parsed.body };
}

// { draft, fingerprint, readBack } -> { ok: true } | { ok: false, reason }.
function verifyReadBack({ draft, fingerprint, readBack }) {
  if (readBack.title !== draft.title) {
    return { ok: false, reason: `title mismatch: expected ${JSON.stringify(draft.title)}, got ${JSON.stringify(readBack.title)}` };
  }
  const marker = `<!-- fingerprint: ${fingerprint} -->`;
  if (!String(readBack.body || '').includes(marker)) {
    return { ok: false, reason: `fingerprint marker missing from read-back body (expected "${marker}")` };
  }
  return { ok: true };
}

// Orchestrates one draft end-to-end: compute fingerprint -> embed -> dedup
// search -> if hit, dedup-hit -> else file -> read back -> verify. Every step
// from dedup onward is try/caught into a filing-failure result — one draft's
// `gh` failure never aborts the batch (same posture as link.js's per-edge
// try/catch). computeFingerprint's own throw (missing fingerprintBasis
// fields) is a caller bug and is deliberately NOT caught here — the CLI
// validates every draft's shape before calling fileOne.
function fileOne({ repo, draft, runner = defaultRunner, bodyFile, writeFile = fs.writeFileSync }) {
  const fingerprint = computeFingerprint(draft);
  const body = embedFingerprint(draft.body, fingerprint);
  const marker = `<!-- fingerprint: ${fingerprint} -->`;
  let number;
  try {
    const hit = findDuplicate({ repo, marker, runner });
    if (hit) return { status: 'dedup-hit', number: hit.number };
    number = fileDraft({ repo, title: draft.title, body, labels: draft.labels || [], runner, bodyFile, writeFile });
    const rb = readBack({ repo, number, runner });
    const verify = verifyReadBack({ draft, fingerprint, readBack: rb });
    if (!verify.ok) return { status: 'filing-failure', number, reason: verify.reason };
    return { status: 'filed', number };
  } catch (err) {
    return { status: 'filing-failure', number, reason: errorText(err) };
  }
}

module.exports = {
  defaultRunner,
  errorText,
  computeFingerprint,
  embedFingerprint,
  findDuplicate,
  fileDraft,
  readBack,
  verifyReadBack,
  fileOne,
};
