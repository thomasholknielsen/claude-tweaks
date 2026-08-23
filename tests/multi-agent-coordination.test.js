const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const c = require('../plugin/bin/lib/coordination');

const PRIMITIVE_DOC = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'multi-agent-coordination.md'),
  'utf8',
);
// Several of /review's decision-log templates live in sub-files lazy-loaded from SKILL.md rather
// than inlined in it: reproduction's in step3-lens-dispatch.md, Cross-Lens Debate's and
// Per-Candidate Refutation's in step3-debate-and-refutation.md. Concatenate all three so this
// still asserts against the real documented format wherever it currently lives.
const REVIEW_SKILL = ['SKILL.md', 'step3-lens-dispatch.md', 'step3-debate-and-refutation.md']
  .map((f) => fs.readFileSync(path.join(__dirname, '..', 'plugin', 'skills', 'review', f), 'utf8'))
  .join('\n');
const SPECIFY_RED_TEAM = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'specify', 'red-team.md'),
  'utf8',
);

// ---------- Dispatch recorder helper ----------
//
// Stub of the Task() interface for unit tests. Captures
// { tier, prompt, role } per call. Callers (Specs 02-04) will be
// test-driven against this recorder; Spec 01 only locks the shape.

function makeRecorder() {
  const calls = [];
  return {
    calls,
    record(call) {
      calls.push(call);
    },
  };
}

// ---------- Decision-log entry schema helper ----------
//
// The decision-log-entry tests below assert a constructed entry against the
// *documented* format (skills/_shared/multi-agent-coordination.md,
// skills/review/SKILL.md, skills/specify/red-team.md) instead of a regex
// hand-authored by the same test to match its own hand-authored string.
// Deriving the pattern live from the doc means a real rewording of the
// documented format (dropped period, changed phrasing, etc.) changes what
// these tests require, so they can actually fail on real drift — unlike a
// self-referential regex, which can never fail regardless of real behavior.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches a single {placeholder}, tolerating one level of nesting (a
// documented template may nest a placeholder inside a placeholder).
const PLACEHOLDER_RE = /\{(?:[^{}]|\{[^{}]*\})*\}/g;

function templateToRegex(templateLine) {
  // Decision-log entries are always markdown bullets ("- AUTO ..."); some
  // source docs show the template without the leading "- " (it's implied by
  // surrounding prose or a numbered-list bullet), so normalize it in.
  const normalized = templateLine.startsWith('- ') ? templateLine : `- ${templateLine}`;
  const segments = normalized.split(PLACEHOLDER_RE).map(escapeRegex);
  return new RegExp(`^${segments.join('.+?')}$`);
}

// Finds the single doc line containing every substring in `mustInclude`,
// then extracts its decision-log template: either the content of an inline
// backtick span containing "{HH:MM:SS}" (prose docs, e.g. review/SKILL.md),
// or the whole trimmed line (fenced-code templates, e.g.
// multi-agent-coordination.md / red-team.md).
function decisionLogPattern(docText, mustInclude) {
  const matches = docText.split('\n').filter((line) => mustInclude.every((s) => line.includes(s)));
  assert.strictEqual(
    matches.length,
    1,
    `expected exactly one doc line containing ${JSON.stringify(mustInclude)}, found ${matches.length}`,
  );
  const backtick = matches[0].match(/`([^`]*\{HH:MM:SS\}[^`]*)`/);
  return templateToRegex(backtick ? backtick[1] : matches[0].trim());
}

// ---------- Shared red-team write-back fixture ----------
//
// Applies write-back logic: precise-location findings become an inline
// `<!-- ambiguity: ... -->` comment; general-location findings accumulate
// into an `## Open Questions` table. Shared by both the populated-findings
// and zero-findings integration tests below — the zero-findings case
// exercises exactly this function's `findings.length === 0` short-circuit
// (the `for` loop never runs, `openQuestions` stays empty, so the body is
// returned unchanged), so a second, separately-written copy adds nothing.
function applyRedTeamFindings(specBody, findings) {
  let body = specBody;
  const openQuestions = [];
  for (const f of findings) {
    if (f.location === 'general') {
      openQuestions.push(f);
    } else {
      const comment = `<!-- ambiguity: ${f.persona} — ${f.finding}${f.resolution ? `; suggested: ${f.resolution}` : ''} -->`;
      // Insert comment after the line containing the location identifier.
      body = body.replace(/(1\. The API should be fast\.)/, `$1 ${comment}`);
    }
  }
  if (openQuestions.length > 0) {
    const rows = openQuestions
      .map((f) => `| ${f.persona} | ${f.finding} | ${f.resolution || '—'} |`)
      .join('\n');
    body +=
      '\n\n## Open Questions\n\n| Persona | Finding | Suggested Resolution |\n|---------|---------|---------------------|\n' +
      rows;
  }
  return body;
}

// ============================================================
// Reproduction
// ============================================================

test('reproduction: dispatches exactly 2 agents in one batch with identical prompts', () => {
  const dispatch = c.buildReproductionDispatch('Audit src/auth.ts for OWASP top 10.');
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.agents.length, 2);
  assert.strictEqual(dispatch.agents[0].prompt, dispatch.agents[1].prompt);
  assert.strictEqual(c.REPRODUCTION_AGENT_COUNT, 2);
});

test('reproduction: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
  const dispatch = c.buildReproductionDispatch('Audit src/auth.ts for OWASP top 10.', 'Capable');
  assert.strictEqual(dispatch.profile, 'Capable');
  assert.strictEqual(dispatch.tier, undefined);
  assert.ok(dispatch.agents[0].prompt.includes('[Use: Capable]'));
  assert.ok(!dispatch.agents[0].prompt.includes('model'));
});

test('reproduction: matching Path:Line + matching severity bucket → confirmed', () => {
  const a = [{ path: 'src/auth.ts', line: 42, severity: 'critical', text: 'missing check' }];
  const b = [{ path: 'src/auth.ts', line: 43, severity: 'high', text: 'missing check' }];
  const { confirmed, unconfirmed } = c.categoriseReproduction(a, b);
  assert.strictEqual(confirmed.length, 1);
  assert.strictEqual(unconfirmed.length, 0);
  assert.strictEqual(confirmed[0].path, 'src/auth.ts');
});

test('reproduction: one-side-only finding → unconfirmed with STAGED entry matching the documented schema', () => {
  const a = [{ path: 'src/auth.ts', line: 42, severity: 'critical', text: 'only-A' }];
  const b = [];
  const { confirmed, unconfirmed } = c.categoriseReproduction(a, b);
  assert.strictEqual(confirmed.length, 0);
  assert.strictEqual(unconfirmed.length, 1);
  assert.strictEqual(unconfirmed[0].source, 'A');

  const entry =
    `- STAGED 14:32:08 — /review reproduction: finding ${unconfirmed[0].path}:${unconfirmed[0].line} ` +
    `surfaced by one agent only. Stage path: staged/review-unconfirmed-1.patch.`;
  assert.match(entry, decisionLogPattern(PRIMITIVE_DOC, ['surfaced by one agent only']));
});

test('reproduction: line numbers within ±2 are treated as matching', () => {
  const a = { path: 'src/x.ts', line: 100, severity: 'low' };
  for (const delta of [-2, -1, 0, 1, 2]) {
    const b = { path: 'src/x.ts', line: 100 + delta, severity: 'low' };
    assert.strictEqual(c.findingsMatch(a, b), true, `delta ${delta} should match`);
  }
});

test('reproduction: line numbers ±3 or more are NOT matching', () => {
  const a = { path: 'src/x.ts', line: 100, severity: 'low' };
  for (const delta of [-5, -3, 3, 5, 10]) {
    const b = { path: 'src/x.ts', line: 100 + delta, severity: 'low' };
    assert.strictEqual(c.findingsMatch(a, b), false, `delta ${delta} should NOT match`);
  }
});

test('reproduction: severity buckets collapse correctly (critical+high vs medium+low+info)', () => {
  assert.strictEqual(c.severityBucket('critical'), 'high');
  assert.strictEqual(c.severityBucket('high'), 'high');
  assert.strictEqual(c.severityBucket('medium'), 'low');
  assert.strictEqual(c.severityBucket('low'), 'low');
  assert.strictEqual(c.severityBucket('info'), 'low');

  const a = { path: 'p', line: 10, severity: 'critical' };
  const sameBucket = { path: 'p', line: 10, severity: 'high' };
  const otherBucket = { path: 'p', line: 10, severity: 'medium' };
  assert.strictEqual(c.findingsMatch(a, sameBucket), true);
  assert.strictEqual(c.findingsMatch(a, otherBucket), false);
});

test('parsePathLine / normalizeFinding: bridges Template A\'s combined "Path:Line" column into separate path/line fields', () => {
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts:42'), { path: 'src/auth.ts', line: 42 });
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts'), { path: 'src/auth.ts', line: undefined });

  // Already-split findings pass through untouched.
  const alreadySplit = { path: 'src/x.ts', line: 10, severity: 'high' };
  assert.strictEqual(c.normalizeFinding(alreadySplit), alreadySplit);

  // Naive transcription: combined string kept under `.path`, no separate `.line`.
  const combinedUnderPath = c.normalizeFinding({ path: 'src/x.ts:10', severity: 'high' });
  assert.strictEqual(combinedUnderPath.path, 'src/x.ts');
  assert.strictEqual(combinedUnderPath.line, 10);
  assert.strictEqual(combinedUnderPath.severity, 'high');

  // Naive transcription: literal table-header key "Path:Line", capitalized "Severity".
  const headerKeyTranscription = c.normalizeFinding({
    Severity: 'critical',
    'Path:Line': 'src/x.ts:10',
    Finding: 'missing check',
  });
  assert.strictEqual(headerKeyTranscription.path, 'src/x.ts');
  assert.strictEqual(headerKeyTranscription.line, 10);
  assert.strictEqual(headerKeyTranscription.severity, 'critical');
});

test('reproduction: Template A contract gap — combined "path:line" field (no separate .line) is normalized before comparison, not silently treated as a universal match', () => {
  // Regression for the cross-file-contract bug: without normalizeFinding,
  // a.path/b.path/a.line/b.line end up undefined for every finding (since
  // the real field lives in a combined string), so findingsMatch's
  // `a.path !== b.path` (undefined !== undefined = false) and
  // `Math.abs(a.line - b.line) > tolerance` (NaN > tolerance = false) both
  // fail to short-circuit — every pair spuriously "matches" as confirmed
  // regardless of actual location.
  const a = [{ path: 'src/auth.ts:42', severity: 'critical', text: 'missing check' }];
  const b = [{ path: 'src/auth.ts:43', severity: 'high', text: 'missing check' }];
  const same = c.categoriseReproduction(a, b);
  assert.strictEqual(same.confirmed.length, 1, 'same file, line within tolerance, should reproduce');
  assert.strictEqual(same.unconfirmed.length, 0);
  assert.strictEqual(same.confirmed[0].path, 'src/auth.ts');
  assert.strictEqual(same.confirmed[0].line, 42);

  // Two genuinely different locations must NOT spuriously match once the
  // combined field is correctly split — this is what the pre-fix NaN
  // short-circuit failure would have gotten wrong.
  const c1 = [{ path: 'src/other.ts:100', severity: 'critical', text: 'x' }];
  const d1 = [{ path: 'src/different.ts:900', severity: 'critical', text: 'y' }];
  const different = c.categoriseReproduction(c1, d1);
  assert.strictEqual(different.confirmed.length, 0, 'different files/lines must not spuriously match');
  assert.strictEqual(different.unconfirmed.length, 2);

  // Header-key transcription shape also normalizes and compares correctly.
  const headerA = [{ Severity: 'high', 'Path:Line': 'src/auth.ts:100', Finding: 'x' }];
  const headerB = [{ Severity: 'high', 'Path:Line': 'src/auth.ts:101', Finding: 'x' }];
  const headerResult = c.categoriseReproduction(headerA, headerB);
  assert.strictEqual(headerResult.confirmed.length, 1);
  assert.strictEqual(headerResult.confirmed[0].path, 'src/auth.ts');
  assert.strictEqual(headerResult.confirmed[0].line, 100);
});

test('reproduction: two findings that both fail to parse a path:line must NOT spuriously match', () => {
  // Neither finding has any usable path field (no `.path`, no `Path:Line`,
  // and no parseable trailing line number) — normalizeFinding's early
  // return (parsed.line === undefined) leaves both path and line undefined
  // on each. Pre-fix, findingsMatch's `undefined !== undefined` (false) and
  // `NaN > tolerance` (false) both fail to short-circuit, so unrelated,
  // unlocated findings fall through to the severity-bucket check and
  // spuriously "match" — exactly the hole normalizeFinding's own header
  // comment (lines 48-60) claims it closes.
  const a = { text: 'unrelated finding A', severity: 'high' };
  const b = { text: 'unrelated finding B', severity: 'high' };
  assert.strictEqual(c.findingsMatch(a, b), false, 'two unlocated findings must not match by location');

  const same = c.categoriseReproduction([a], [b]);
  assert.strictEqual(same.confirmed.length, 0, 'unlocated findings must never be confirmed as reproduced');
  assert.strictEqual(same.unconfirmed.length, 2);

  // A finding with a real, parseable location must also not match one with
  // none — asymmetric undefined vs. defined must not slip through either.
  const located = { path: 'src/auth.ts', line: 42, severity: 'high' };
  const unlocated = { text: 'no location info', severity: 'high' };
  assert.strictEqual(c.findingsMatch(located, unlocated), false);
});

// ============================================================
// Regression: location-comparison guard hardening
// ============================================================

test('parsePathLine: an empty trailing line segment ("path:") parses to no line, not 0', () => {
  // Consistent with the existing "parse failed" contract elsewhere in this
  // function: when the trailing segment can't be read as a real line number,
  // the original combined string is returned unsplit as `.path` (not
  // stripped of its colon) — callers must not trust a split they can't
  // fully complete. What matters for this regression is that `.line` is
  // `undefined`, not the JS `Number("") === 0` coercion.
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts:'), { path: 'src/auth.ts:', line: undefined });
  assert.deepStrictEqual(c.parsePathLine('src/auth.ts: '), { path: 'src/auth.ts: ', line: undefined });
});

test('findingsMatch: two findings that both transcribed a trailing-colon, no-line "Path:Line" cell must not spuriously match', () => {
  // Pre-fix: parsePathLine("src/auth.ts:") returned {path, line: 0} (JS's
  // Number("") === 0 quirk), so two independently-unlocated findings that
  // both happen to share a path would spuriously match on line 0.
  const a = { 'Path:Line': 'src/auth.ts:', severity: 'high' };
  const b = { 'Path:Line': 'src/auth.ts:', severity: 'high' };
  assert.strictEqual(c.findingsMatch(a, b), false);
});

test('severityBucket / findingsMatch: capitalized severity values bucket the same as lowercase', () => {
  assert.strictEqual(c.severityBucket('Critical'), c.severityBucket('critical'));
  assert.strictEqual(c.severityBucket('Critical'), 'high');
  assert.strictEqual(
    c.findingsMatch({ path: 'x.js', line: 10, severity: 'Critical' }, { path: 'x.js', line: 10, severity: 'critical' }),
    true,
  );
});

test('normalizeFinding / findingsMatch: a non-numeric `.line` (e.g. "n/a") is treated as unlocated, not a universal match', () => {
  const garbageLine = { path: 'auth.ts', line: 'n/a', severity: 'low' };
  const real = { path: 'auth.ts', line: 12, severity: 'low' };
  assert.strictEqual(c.findingsMatch(garbageLine, real), false);
  assert.strictEqual(c.normalizeFinding(garbageLine).line, undefined);
});

test('findingsMatch / detectCrossLensOverlap / categoriseReproduction: a null/undefined finding element does not crash', () => {
  assert.strictEqual(c.findingsMatch(null, { path: 'x.js', line: 1, severity: 'low' }), false);
  assert.strictEqual(c.findingsMatch(undefined, undefined), false);

  const { confirmed, unconfirmed } = c.categoriseReproduction([null], [{ path: 'x.js', line: 1, severity: 'low' }]);
  assert.strictEqual(confirmed.length, 0);
  assert.strictEqual(unconfirmed.length, 2);

  const overlaps = c.detectCrossLensOverlap({
    lensA: [null],
    lensB: [{ path: 'x.js', line: 1, severity: 'low' }],
  });
  assert.strictEqual(overlaps.length, 0);
});

test('detectCrossLensOverlap: two unlocated findings from different lenses do not spuriously overlap', () => {
  // Pre-fix: detectCrossLensOverlap hand-rolled its own comparison
  // (`fa.path === fb.path && Math.abs(fa.line - fb.line) <= tolerance`)
  // without the undefined/NaN guard findingsMatch has, so two findings each
  // missing a location (`fa.path`/`fb.path` both undefined, `NaN <= tolerance`
  // false) would still spuriously "overlap".
  const overlaps = c.detectCrossLensOverlap({
    security: [{ line: 42, severity: 'high', text: 'A' }],
    architecture: [{ line: 44, severity: 'low', text: 'B' }],
  });
  assert.strictEqual(overlaps.length, 0);
});

// ============================================================
// Debate
// ============================================================

test('debate: triggers only on cross-lens Path:Line overlap within ±5 lines with contradicting verdicts', () => {
  const findingsByLens = {
    security: [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'issue' }],
    architecture: [{ path: 'src/auth.ts', line: 45, severity: 'low', text: 'no issue' }],
    perf: [{ path: 'src/api.ts', line: 200, severity: 'low', text: 'unrelated' }],
  };
  const overlaps = c.detectCrossLensOverlap(findingsByLens);
  assert.strictEqual(overlaps.length, 1);
  assert.strictEqual(overlaps[0].findingA.path, 'src/auth.ts');
  assert.strictEqual(overlaps[0].findingB.path, 'src/auth.ts');

  // ±6 should NOT overlap
  const noOverlap = c.detectCrossLensOverlap({
    a: [{ path: 'src/x.ts', line: 10, severity: 'high' }],
    b: [{ path: 'src/x.ts', line: 17, severity: 'low' }],
  });
  assert.strictEqual(noOverlap.length, 0);
});

test('debate: runs exactly 1 round with 2 agents', () => {
  const dispatch = c.buildDebateDispatch({ path: 'src/x.ts', line: 10, severity: 'high' });
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.rounds, 1);
  assert.strictEqual(dispatch.agents.length, 2);
  assert.strictEqual(c.DEBATE_AGENT_COUNT, 2);
});

test('debate: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
  const dispatch = c.buildDebateDispatch({ path: 'src/x.ts', line: 10, severity: 'high' }, 'Standard');
  assert.strictEqual(dispatch.profile, 'Standard');
  assert.strictEqual(dispatch.tier, undefined);
  assert.ok(dispatch.agents[0].prompt.includes('[Use: Standard]'));
  assert.ok(!dispatch.agents[0].prompt.includes('model'));
});

test('debate: both agree → confirmed with AUTO entry matching the documented schema', () => {
  assert.strictEqual(c.resolveDebate('agree', 'agree'), 'confirmed');
  const entry = `- AUTO 14:41:02 — /review debate: src/auth.ts:42 confirmed (both agreed). Reversibility: high.`;
  assert.match(entry, decisionLogPattern(PRIMITIVE_DOC, ['confirmed (both agreed)']));
});

test('debate: both disagree → unconfirmed with AUTO entry matching the documented schema', () => {
  assert.strictEqual(c.resolveDebate('disagree', 'disagree'), 'unconfirmed');
  const entry = `- AUTO 14:41:05 — /review debate: src/auth.ts:42 unconfirmed (both disagreed). Reversibility: high.`;
  assert.match(entry, decisionLogPattern(PRIMITIVE_DOC, ['unconfirmed (both disagreed)']));
});

test('debate: mixed/partial verdicts → contested with STAGED entry matching the documented schema', () => {
  assert.strictEqual(c.resolveDebate('agree', 'disagree'), 'contested');
  assert.strictEqual(c.resolveDebate('agree', 'partial'), 'contested');
  assert.strictEqual(c.resolveDebate('disagree', 'partial'), 'contested');
  assert.strictEqual(c.resolveDebate('partial', 'partial'), 'contested');
  const entry = `- STAGED 14:41:08 — /review debate: src/auth.ts:42 contested (mixed verdicts). Stage path: staged/review-debate-1.md.`;
  assert.match(entry, decisionLogPattern(PRIMITIVE_DOC, ['contested (mixed verdicts)']));
});

// ============================================================
// Refutation (Per-Candidate Refutation Pass, /review Step 3.5)
// ============================================================

test('refutation: refuted verdict downgrades to unconfirmed', () => {
  assert.strictEqual(c.resolveRefutation('refuted'), 'unconfirmed');
  const entry =
    `- AUTO 14:52:10 — Refutation: src/auth.ts:42 refuted — cited evidence no longer matches current file. Downgraded to unconfirmed. Reversibility: high.`;
  assert.match(entry, decisionLogPattern(REVIEW_SKILL, ['refuted —', 'Downgraded to unconfirmed']));
});

test('refutation: not-refuted verdict leaves the finding confirmed', () => {
  assert.strictEqual(c.resolveRefutation('not-refuted'), 'confirmed');
  const entry = `- AUTO 14:52:15 — Refutation: src/auth.ts:42 not refuted — stands as confirmed. Reversibility: high.`;
  assert.match(entry, decisionLogPattern(REVIEW_SKILL, ['not refuted — stands as confirmed']));
});

test('refutation: is a sibling of resolveDebate, not an overload — single verdict in, two buckets out, no "contested" outcome', () => {
  // resolveDebate takes two verdicts and can produce 'contested'; resolveRefutation
  // takes exactly one and never does — every non-'not-refuted' string (including a
  // stray 'partial'-style value, which is meaningful for debate but not here)
  // falls through to 'unconfirmed', not a third bucket.
  assert.strictEqual(c.resolveRefutation('not-refuted'), 'confirmed');
  assert.strictEqual(c.resolveRefutation('partial'), 'unconfirmed');
  assert.notStrictEqual(c.resolveRefutation, c.resolveDebate);
});

test('refutation: fails toward scrutiny, not away from it — a missing, empty, or malformed verdict (e.g. from a BLOCKED or unparseable dispatch) downgrades to unconfirmed rather than silently standing as confirmed', () => {
  // This is the opposite fail-safety direction from a naive "anything but the
  // negative case defaults to the positive case" implementation. A failed
  // refutation attempt must never be indistinguishable from a genuine
  // "not-refuted" verdict — see resolveDebate's own conservative default,
  // which this mirrors.
  assert.strictEqual(c.resolveRefutation(undefined), 'unconfirmed');
  assert.strictEqual(c.resolveRefutation(''), 'unconfirmed');
  assert.strictEqual(c.resolveRefutation('refuted'), 'unconfirmed');
  assert.strictEqual(c.resolveRefutation('REFUTED'), 'unconfirmed'); // exact-match only, no case-folding
});

test('/review refutation integration: confirmed findings surviving reproduction each get exactly one refutation dispatch; refuted ones join the unconfirmed bucket', () => {
  // Two lenses' findings survive Step 3 reproduction as confirmed.
  const confirmedBucket = [
    { path: 'src/auth.ts', line: 42, severity: 'high', text: 'stale evidence' },
    { path: 'src/api.ts', line: 100, severity: 'medium', text: 'real issue' },
  ];

  // Simulate one refutation agent per candidate: the first is refuted (its
  // cited evidence no longer matches current file content, e.g. already
  // fixed by a later commit); the second is not.
  const verdicts = ['refuted', 'not-refuted'];
  const results = confirmedBucket.map((finding, i) => ({
    finding,
    bucket: c.resolveRefutation(verdicts[i]),
  }));

  const stillConfirmed = results.filter((r) => r.bucket === 'confirmed').map((r) => r.finding);
  const downgraded = results.filter((r) => r.bucket === 'unconfirmed').map((r) => r.finding);

  assert.strictEqual(stillConfirmed.length, 1);
  assert.strictEqual(stillConfirmed[0].path, 'src/api.ts');
  assert.strictEqual(downgraded.length, 1);
  assert.strictEqual(downgraded[0].path, 'src/auth.ts');

  // No silent drops — every candidate lands in exactly one bucket.
  assert.strictEqual(stillConfirmed.length + downgraded.length, confirmedBucket.length);

  // Both the Cross-Lens Debate and Per-Candidate Refutation Pass sections
  // must exist as documented, sibling subsections of the same Step 3.5.
  assert.ok(REVIEW_SKILL.includes('Per-Candidate Refutation Pass'), 'SKILL.md must document the refutation pass');
  assert.ok(REVIEW_SKILL.includes('Cross-Lens Debate'), 'SKILL.md must still document cross-lens debate');
});

// ============================================================
// Multi-persona red-team
// ============================================================

test('red-team: dispatches exactly 3 personas in one batch', () => {
  const dispatch = c.buildRedTeamDispatch('Spec content here.');
  assert.strictEqual(dispatch.agentCount, 3);
  assert.strictEqual(dispatch.agents.length, 3);
  assert.strictEqual(c.RED_TEAM_PERSONAS.length, 3);
  const roles = dispatch.agents.map((a) => a.role);
  assert.deepStrictEqual(roles.sort(), ['Implementer', 'Maintainer', 'Skeptical Reviewer']);
});

test('red-team: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
  const dispatch = c.buildRedTeamDispatch('Spec content here.', 'Fast');
  assert.strictEqual(dispatch.profile, 'Fast');
  assert.strictEqual(dispatch.tier, undefined);
  for (const agent of dispatch.agents) {
    assert.ok(agent.prompt.includes('[Use: Fast]'));
    assert.ok(!agent.prompt.includes('model'));
  }
});

test('red-team: each persona prompt inlines its lens question verbatim', () => {
  const dispatch = c.buildRedTeamDispatch('Spec content here.');
  for (const persona of c.RED_TEAM_PERSONAS) {
    const agent = dispatch.agents.find((a) => a.role === persona.name);
    assert.ok(agent, `agent for ${persona.name} should exist`);
    assert.ok(
      agent.prompt.includes(persona.lens),
      `${persona.name}'s prompt must contain its lens question verbatim`,
    );
  }
});

test('red-team: findings emitted in the documented Open Questions / HTML comment shape', () => {
  assert.ok(
    PRIMITIVE_DOC.includes('## Open Questions'),
    'primitive doc must document the Open Questions section shape',
  );
  assert.ok(
    PRIMITIVE_DOC.includes('<!-- ambiguity:'),
    'primitive doc must document the inline HTML comment shape',
  );
});

// ============================================================
// /review integration tests (Spec 02)
// ============================================================

test('/review reproduction integration: per-lens reproduction → confirmed/unconfirmed categorisation on fixture lens outputs', () => {
  // Fixture: 2 agents for the "security" lens. Both flag finding X at src/auth.ts:42.
  // Agent A also flags finding Y at src/api.ts:100; agent B does not.
  const agentA = [
    { path: 'src/auth.ts', line: 42, severity: 'high', text: 'missing expiry check' },
    { path: 'src/api.ts', line: 100, severity: 'medium', text: 'unhandled rejection' },
  ];
  const agentB = [{ path: 'src/auth.ts', line: 43, severity: 'critical', text: 'missing expiry check' }];
  const { confirmed, unconfirmed } = c.categoriseReproduction(agentA, agentB);

  // Reproduction match: src/auth.ts:42 (A) and src/auth.ts:43 (B) — line ±2, critical+high share bucket
  assert.strictEqual(confirmed.length, 1);
  assert.strictEqual(confirmed[0].path, 'src/auth.ts');

  // One-side-only: src/api.ts:100 in A only
  assert.strictEqual(unconfirmed.length, 1);
  assert.strictEqual(unconfirmed[0].path, 'src/api.ts');
  assert.strictEqual(unconfirmed[0].source, 'A');

  // Decision-log entry schema
  const lensName = 'security';
  const confirmedEntry =
    `- AUTO 14:32:08 — Reproduction: lens "${lensName}" finding ${confirmed[0].path}:${confirmed[0].line} reproduced. Confirmed. Reversibility: high.`;
  assert.match(confirmedEntry, decisionLogPattern(REVIEW_SKILL, ['Findings present in both agents']));
  const unconfirmedEntry =
    `- STAGED 14:32:11 — Reproduction: lens "${lensName}" finding ${unconfirmed[0].path}:${unconfirmed[0].line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.`;
  assert.match(unconfirmedEntry, decisionLogPattern(REVIEW_SKILL, ['Findings present in only one']));
});

test('/review debate integration: cross-lens overlap with contradicting verdicts → debate dispatched → confirmed/unconfirmed/contested resolution per verdict combination', () => {
  // Two lenses both touch src/auth.ts near line 42 with contradicting verdicts.
  const findingsByLens = {
    security: [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'token issue' }],
    architecture: [{ path: 'src/auth.ts', line: 45, severity: 'low', text: 'minor concern' }],
  };
  const overlaps = c.detectCrossLensOverlap(findingsByLens);
  assert.strictEqual(overlaps.length, 1, 'one overlap pair expected');
  assert.strictEqual(overlaps[0].lensA, 'security');
  assert.strictEqual(overlaps[0].lensB, 'architecture');

  // Debate dispatched as a 2-agent, 1-round pair
  const dispatch = c.buildDebateDispatch(overlaps[0].findingA);
  assert.strictEqual(dispatch.agentCount, 2);
  assert.strictEqual(dispatch.rounds, 1);

  // Verdict resolution across all three outcomes
  assert.strictEqual(c.resolveDebate('agree', 'agree'), 'confirmed');
  assert.strictEqual(c.resolveDebate('disagree', 'disagree'), 'unconfirmed');
  assert.strictEqual(c.resolveDebate('agree', 'partial'), 'contested');

  const confirmedEntry = `- AUTO 14:41:02 — Debate: cross-lens disagreement on src/auth.ts:42 converged positive after 1 round. Reversibility: high.`;
  assert.match(confirmedEntry, decisionLogPattern(REVIEW_SKILL, ['Both `agree`']));
  const unconfirmedEntry = `- AUTO 14:41:05 — Debate: cross-lens disagreement on src/auth.ts:42 converged negative after 1 round. Reversibility: high.`;
  assert.match(unconfirmedEntry, decisionLogPattern(REVIEW_SKILL, ['Both `disagree`']));
  const contestedEntry = `- STAGED 14:41:08 — Debate: cross-lens disagreement on src/auth.ts:42 inconclusive (agree, partial). Both verdicts staged. Reversibility: high.`;
  assert.match(contestedEntry, decisionLogPattern(REVIEW_SKILL, ['Mixed / partial']));
});

test('/review summary assembly: confirmed flow to summary; unconfirmed + contested flow to Wrap-Up Console subsections', () => {
  // Per-lens reproduction outcomes
  const lensSecurity = c.categoriseReproduction(
    [{ path: 'src/auth.ts', line: 42, severity: 'high', text: 'X' }],
    [{ path: 'src/auth.ts', line: 43, severity: 'critical', text: 'X' }],
  );
  const lensArchitecture = c.categoriseReproduction(
    [{ path: 'src/api.ts', line: 200, severity: 'medium', text: 'Y' }],
    [],
  );

  // Cross-lens overlap on a third file with contested debate outcome
  const overlapVerdict = c.resolveDebate('agree', 'partial');

  // Three-bucket assembly
  const buckets = {
    confirmed: [...lensSecurity.confirmed, ...lensArchitecture.confirmed],
    unconfirmed: [...lensSecurity.unconfirmed, ...lensArchitecture.unconfirmed],
    contested: overlapVerdict === 'contested' ? [{ path: 'src/storage.ts', line: 10 }] : [],
  };

  // Confirmed flows into the review summary's severity table
  assert.strictEqual(buckets.confirmed.length, 1);
  assert.strictEqual(buckets.confirmed[0].path, 'src/auth.ts');

  // Unconfirmed flows into the Low-confidence Console subsection
  assert.strictEqual(buckets.unconfirmed.length, 1);
  assert.strictEqual(buckets.unconfirmed[0].path, 'src/api.ts');

  // Contested flows into the Contested Console subsection
  assert.strictEqual(buckets.contested.length, 1);

  // No silent drops: total in equals total out
  const totalIn = 1 /* security reproduced */ + 1 /* architecture A only */ + 1 /* contested overlap */;
  const totalOut = buckets.confirmed.length + buckets.unconfirmed.length + buckets.contested.length;
  assert.strictEqual(totalOut, totalIn, 'no silent drops — every finding ends up in exactly one bucket');

  // Verify the wrap-up Review Console template documents the two new subsections.
  // The template itself lives in console-template.md — review-console.md's "Present
  // the console" section points readers there rather than inlining it (40 KB ceiling).
  const REVIEW_CONSOLE = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'console-template.md'),
    'utf8',
  );
  assert.ok(
    REVIEW_CONSOLE.includes('Low-confidence findings (not reproduced)'),
    'console-template.md must document the Low-confidence subsection',
  );
  assert.ok(
    REVIEW_CONSOLE.includes('Contested findings (debate inconclusive)'),
    'console-template.md must document the Contested subsection',
  );
});

// ============================================================
// /specify integration tests (Spec 03)
// ============================================================

test('/specify red-team integration: ambiguous draft spec → red-team flags it → spec body contains Open Questions row OR inline ambiguity comment', () => {
  // Fixture: a draft spec containing a deliberate ambiguity.
  const draftSpec = [
    '# Spec 99: Fast API',
    '',
    '## Acceptance Criteria',
    '1. The API should be fast.',
    '2. Returns paginated results.',
  ].join('\n');

  // Build the red-team dispatch — 3 personas, batched.
  const dispatch = c.buildRedTeamDispatch(draftSpec);
  assert.strictEqual(dispatch.agentCount, 3);
  assert.deepStrictEqual(
    dispatch.agents.map((a) => a.role).sort(),
    ['Implementer', 'Maintainer', 'Skeptical Reviewer'],
  );

  // Each persona prompt contains the draft spec verbatim AND the lens question verbatim.
  for (const agent of dispatch.agents) {
    assert.ok(agent.prompt.includes(draftSpec), `${agent.role}'s prompt must include the draft spec`);
    const persona = c.RED_TEAM_PERSONAS.find((p) => p.name === agent.role);
    assert.ok(agent.prompt.includes(persona.lens), `${agent.role}'s prompt must include its lens question`);
  }

  // Simulate persona output: Skeptical Reviewer flags "fast" with a precise location;
  // Implementer flags missing pagination shape with general location.
  const personaFindings = [
    {
      persona: 'Skeptical Reviewer',
      severity: 'medium',
      location: 'Acceptance Criteria 1',
      finding: '"fast" has no metric — load-bearing assumption',
      resolution: 'define p95 latency target',
    },
    {
      persona: 'Implementer',
      severity: 'medium',
      location: 'general',
      finding: 'pagination shape not defined — page size? cursor or offset?',
    },
  ];

  // Apply write-back logic: precise-location → inline comment; general → Open Questions row.
  // (applyRedTeamFindings is the module-level shared fixture defined above.)
  const updated = applyRedTeamFindings(draftSpec, personaFindings);

  // Precise-location finding → inline ambiguity comment
  assert.ok(
    updated.includes('<!-- ambiguity: Skeptical Reviewer'),
    'spec body must contain inline ambiguity comment for precise-location finding',
  );
  assert.ok(
    updated.includes('"fast" has no metric'),
    'inline comment must include the finding text',
  );
  assert.ok(
    updated.includes('suggested: define p95 latency target'),
    'inline comment must include the suggested resolution',
  );

  // General-location finding → Open Questions row
  assert.ok(updated.includes('## Open Questions'), 'spec body must contain Open Questions section');
  assert.ok(
    updated.includes('pagination shape not defined'),
    'Open Questions table must contain the general-location finding',
  );

  // Decision-log entry schemas, derived live from skills/specify/red-team.md's
  // write-back step 7: one AUTO summary per record (never one entry per
  // finding), plus one STAGED entry per decision-worthy finding staged for the
  // Review Console. Deriving both patterns from the doc means a real rewording
  // of either documented template fails here — the same anti-self-reference
  // rationale decisionLogPattern's own comment explains.
  const summaryEntry =
    `- AUTO 11:22:33 — Red-team #517: Implementer 1 / Skeptical Reviewer 1 (2 medium; 0 merged, 0 info dropped). ` +
    `Written back as 1 inline <!-- ambiguity: --> markers + 1 Open Questions rows in one recomposed-body write. Reversibility: high.`;
  assert.match(summaryEntry, decisionLogPattern(SPECIFY_RED_TEAM, ['Red-team', 'Written back as']));
  const stagedEntry =
    `- STAGED 11:22:33 — Red-team #517: decision-worthy finding "retry storage undefined" ` +
    `staged for Review Console at staged/red-team-517-retry-storage.md; ready cleared pending resolution.`;
  assert.match(stagedEntry, decisionLogPattern(SPECIFY_RED_TEAM, ['Red-team', 'staged for Review Console']));
});

test('/specify red-team integration: zero findings → Open Questions section is omitted entirely (no empty placeholder)', () => {
  const draftSpec = '# Spec 100\n\nNo issues here.';
  // Exercises applyRedTeamFindings' own findings.length === 0 short-circuit
  // (the module-level shared fixture defined above): the `for` loop never
  // runs, `openQuestions` stays empty, so its `if (openQuestions.length > 0)`
  // guard is false and it returns specBody unchanged — the same behavior a
  // second, separately-written `if (findings.length === 0) return specBody;`
  // copy would provide, so there is no need for one.
  const result = applyRedTeamFindings(draftSpec, []);
  assert.ok(!result.includes('## Open Questions'), 'empty findings must not emit a placeholder header');
  assert.strictEqual(result, draftSpec, 'spec body unchanged when there are no findings');
});
