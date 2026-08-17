'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const feedback = require('../../../bin/lib/feedback/file-feedback');
const { run, parseArgs, parseRepo, validateDraft } = require('../../../bin/file-feedback');

// Fake runners are lazy functions inspecting `args` only when called (CLAUDE.md's
// eager-IIFE ban) and throw on any unhandled args shape rather than silently
// returning something wrong — matching tests/bin-lib/issues/link.test.js's convention.
const isList = (args) => args[0] === 'issue' && args[1] === 'list';
const isCreate = (args) => args[0] === 'issue' && args[1] === 'create';
const isView = (args) => args[0] === 'issue' && args[1] === 'view';
const flagValue = (args, flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };

function makeDraft(overrides = {}) {
  return {
    title: 'Skill X ignores the --scope flag',
    body: 'When run with --scope narrow, the flag is silently ignored.\n<!-- fingerprint: placeholder -->',
    labels: ['bug'],
    fingerprintBasis: { component: 'skills/x', summary: 'ignores --scope flag' },
    ...overrides,
  };
}

// ---- computeFingerprint --------------------------------------------------

test('computeFingerprint: returns feedback-{8 hex}', () => {
  const fp = feedback.computeFingerprint(makeDraft());
  assert.match(fp, /^feedback-[0-9a-f]{8}$/);
});

test('computeFingerprint: summary differing only in whitespace/case yields the same fingerprint', () => {
  const a = feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/x', summary: 'Ignores   --scope Flag' } }));
  const b = feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/x', summary: 'ignores --scope flag' } }));
  assert.equal(a, b);
});

test('computeFingerprint: a component change (not normalized) still changes the fingerprint', () => {
  const a = feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/x', summary: 'ignores --scope flag' } }));
  const b = feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/y', summary: 'ignores --scope flag' } }));
  assert.notEqual(a, b);
});

test('computeFingerprint: throws when fingerprintBasis.component is missing or empty', () => {
  assert.throws(() => feedback.computeFingerprint(makeDraft({ fingerprintBasis: { summary: 'x' } })), /fingerprintBasis must include both component and summary/);
  assert.throws(() => feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: '', summary: 'x' } })), /fingerprintBasis must include both component and summary/);
});

test('computeFingerprint: throws when fingerprintBasis.summary is missing or empty', () => {
  assert.throws(() => feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/x' } })), /fingerprintBasis must include both component and summary/);
  assert.throws(() => feedback.computeFingerprint(makeDraft({ fingerprintBasis: { component: 'skills/x', summary: '' } })), /fingerprintBasis must include both component and summary/);
});

// ---- embedFingerprint -----------------------------------------------------

test('embedFingerprint: replaces the literal pre-fix [object Object] placeholder wholesale', () => {
  const body = 'Some description.\n<!-- fingerprint: [object Object] -->\nMore text.';
  const result = feedback.embedFingerprint(body, 'feedback-abc12345');
  assert.doesNotMatch(result, /\[object Object\]/);
  assert.match(result, /<!-- fingerprint: feedback-abc12345 -->/);
  assert.match(result, /Some description\./);
  assert.match(result, /More text\./);
});

test('embedFingerprint: replaces an existing well-formed fingerprint line', () => {
  const body = 'Body text.\n<!-- fingerprint: feedback-00000000 -->\n';
  const result = feedback.embedFingerprint(body, 'feedback-deadbeef');
  assert.doesNotMatch(result, /feedback-00000000/);
  assert.match(result, /<!-- fingerprint: feedback-deadbeef -->/);
});

test('embedFingerprint: appends the fingerprint line when none exists', () => {
  const body = 'Body text with no fingerprint comment.';
  const result = feedback.embedFingerprint(body, 'feedback-cafef00d');
  assert.match(result, /Body text with no fingerprint comment\.\n<!-- fingerprint: feedback-cafef00d -->\n$/);
});

// ---- fileDraft: argv-safe title -------------------------------------------

test('fileDraft: a title with backtick, $(...), and single quote round-trips as one argv element', () => {
  const dangerousTitle = "Bug: `whoami` $(rm -rf /) it's broken";
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (isCreate(args)) return 'https://github.com/acme/w/issues/123\n';
    throw new Error('unexpected ' + args.join(' '));
  };
  const writes = [];
  const writeFile = (path, content) => writes.push({ path, content });
  const number = feedback.fileDraft({
    repo: 'acme/w', title: dangerousTitle, body: 'body text', labels: ['bug'],
    runner, bodyFile: '/fake/tmp/body.md', writeFile,
  });
  assert.equal(number, 123);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(dangerousTitle), 'the exact dangerous title string must appear as one argv element');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/fake/tmp/body.md');
  assert.equal(writes[0].content, 'body text');
});

// ---- fileOne ---------------------------------------------------------------

test('fileOne: dedup hit skips filing entirely', () => {
  const draft = makeDraft();
  const fp = feedback.computeFingerprint(draft);
  const marker = `<!-- fingerprint: ${fp} -->`;
  const createCalls = [];
  const runner = (args) => {
    if (isList(args)) {
      assert.equal(flagValue(args, '--search'), marker);
      return JSON.stringify([{ number: 501, title: 'existing dup' }]);
    }
    if (isCreate(args)) { createCalls.push(args); throw new Error('must not call issue create on a dedup hit'); }
    throw new Error('unexpected ' + args.join(' '));
  };
  const result = feedback.fileOne({ repo: 'acme/w', draft, runner, bodyFile: '/fake/body.md', writeFile: () => {} });
  assert.deepEqual(result, { status: 'dedup-hit', number: 501 });
  assert.equal(createCalls.length, 0);
});

test('fileOne: read-back title mismatch surfaces filing-failure with a mismatch reason', () => {
  const draft = makeDraft();
  const fp = feedback.computeFingerprint(draft);
  const marker = `<!-- fingerprint: ${fp} -->`;
  const runner = (args) => {
    if (isList(args)) return JSON.stringify([]);
    if (isCreate(args)) return 'https://github.com/acme/w/issues/777\n';
    if (isView(args)) return JSON.stringify({ title: 'a completely different title', body: `filed body\n${marker}\n` });
    throw new Error('unexpected ' + args.join(' '));
  };
  const result = feedback.fileOne({ repo: 'acme/w', draft, runner, bodyFile: '/fake/body.md', writeFile: () => {} });
  assert.equal(result.status, 'filing-failure');
  assert.equal(result.number, 777);
  assert.match(result.reason, /title mismatch/);
});

test('fileOne: read-back body missing the fingerprint comment surfaces filing-failure', () => {
  const draft = makeDraft();
  const runner = (args) => {
    if (isList(args)) return JSON.stringify([]);
    if (isCreate(args)) return 'https://github.com/acme/w/issues/778\n';
    if (isView(args)) return JSON.stringify({ title: draft.title, body: 'filed body with no fingerprint comment at all' });
    throw new Error('unexpected ' + args.join(' '));
  };
  const result = feedback.fileOne({ repo: 'acme/w', draft, runner, bodyFile: '/fake/body.md', writeFile: () => {} });
  assert.equal(result.status, 'filing-failure');
  assert.match(result.reason, /fingerprint marker missing/);
});

test('fileOne: clean path (dedup miss, create succeeds, read-back matches) files the issue', () => {
  const draft = makeDraft();
  const fp = feedback.computeFingerprint(draft);
  const marker = `<!-- fingerprint: ${fp} -->`;
  const runner = (args) => {
    if (isList(args)) return JSON.stringify([]);
    if (isCreate(args)) return 'https://github.com/acme/w/issues/900\n';
    if (isView(args)) return JSON.stringify({ title: draft.title, body: `filed body\n${marker}\n` });
    throw new Error('unexpected ' + args.join(' '));
  };
  const result = feedback.fileOne({ repo: 'acme/w', draft, runner, bodyFile: '/fake/body.md', writeFile: () => {} });
  assert.deepEqual(result, { status: 'filed', number: 900 });
});

// ---- CLI: run(argv, deps) ---------------------------------------------------

function cliDeps({ runner, ghAvailable = true, remoteUrl = 'https://github.com/acme/w.git', readDraftsFile }) {
  const out = []; const err = []; const writes = [];
  return {
    deps: {
      runner,
      ghAvailable: () => ghAvailable,
      remoteUrl: () => remoteUrl,
      readDraftsFile: readDraftsFile || (() => { throw new Error('must not read a drafts file'); }),
      tmpFile: () => '/fake/tmp/body.md',
      writeFile: (path, content) => writes.push({ path, content }),
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
    },
    out, err, writes,
  };
}

test('CLI: 2-draft batch with a dedup-hit and a clean file exits 0, one line per draft in order', () => {
  const draftA = makeDraft({ title: 'Draft A: dup already filed', fingerprintBasis: { component: 'skills/a', summary: 'dup finding' } });
  const draftB = makeDraft({ title: 'Draft B: files cleanly', fingerprintBasis: { component: 'skills/b', summary: 'fresh finding' } });
  const fpA = feedback.computeFingerprint(draftA);
  const fpB = feedback.computeFingerprint(draftB);
  const markerA = `<!-- fingerprint: ${fpA} -->`;
  const markerB = `<!-- fingerprint: ${fpB} -->`;
  const runner = (args) => {
    if (isList(args)) {
      const search = flagValue(args, '--search');
      if (search === markerA) return JSON.stringify([{ number: 601, title: 'existing' }]);
      if (search === markerB) return JSON.stringify([]);
      throw new Error('unexpected search ' + search);
    }
    if (isCreate(args)) {
      assert.equal(flagValue(args, '--title'), draftB.title);
      return 'https://github.com/acme/w/issues/602\n';
    }
    if (isView(args)) return JSON.stringify({ title: draftB.title, body: `body\n${markerB}\n` });
    throw new Error('unexpected ' + args.join(' '));
  };
  const { deps, out } = cliDeps({ runner, readDraftsFile: () => [draftA, draftB] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w'], deps);
  assert.equal(code, 0);
  const lines = out.join('').trim().split('\n');
  assert.deepEqual(lines, ['dedup-hit #601', 'filed #602']);
});

test('CLI: a read-back mismatch in one draft exits 1 but still reports the sibling clean draft', () => {
  const draftA = makeDraft({ title: 'Draft A: will mismatch', fingerprintBasis: { component: 'skills/a', summary: 'mismatch finding' } });
  const draftB = makeDraft({ title: 'Draft B: files cleanly', fingerprintBasis: { component: 'skills/b', summary: 'clean finding' } });
  const fpB = feedback.computeFingerprint(draftB);
  const markerB = `<!-- fingerprint: ${fpB} -->`;
  const runner = (args) => {
    if (isList(args)) return JSON.stringify([]);
    if (isCreate(args)) {
      const title = flagValue(args, '--title');
      if (title === draftA.title) return 'https://github.com/acme/w/issues/701\n';
      if (title === draftB.title) return 'https://github.com/acme/w/issues/702\n';
      throw new Error('unexpected title ' + title);
    }
    if (isView(args)) {
      const number = args[2];
      if (number === '701') return JSON.stringify({ title: 'a totally different title', body: 'irrelevant body' });
      if (number === '702') return JSON.stringify({ title: draftB.title, body: `body\n${markerB}\n` });
      throw new Error('unexpected view number ' + number);
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  const { deps, out } = cliDeps({ runner, readDraftsFile: () => [draftA, draftB] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w'], deps);
  assert.equal(code, 1);
  const lines = out.join('').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^filing-failure: .*title mismatch/);
  assert.equal(lines[1], 'filed #702');
});

test('CLI --dry-run: zero create calls across a multi-draft batch; reports would-file / dedup-hit', () => {
  const draftA = makeDraft({ title: 'Draft A', fingerprintBasis: { component: 'skills/a', summary: 'dup finding' } });
  const draftB = makeDraft({ title: 'Draft B', fingerprintBasis: { component: 'skills/b', summary: 'fresh finding' } });
  const fpA = feedback.computeFingerprint(draftA);
  const fpB = feedback.computeFingerprint(draftB);
  const markerA = `<!-- fingerprint: ${fpA} -->`;
  const markerB = `<!-- fingerprint: ${fpB} -->`;
  const createCalls = [];
  const runner = (args) => {
    if (isList(args)) {
      const search = flagValue(args, '--search');
      if (search === markerA) return JSON.stringify([{ number: 801, title: 'existing' }]);
      if (search === markerB) return JSON.stringify([]);
      throw new Error('unexpected search ' + search);
    }
    if (isCreate(args)) { createCalls.push(args); throw new Error('must not call issue create under --dry-run'); }
    throw new Error('unexpected ' + args.join(' '));
  };
  const { deps, out } = cliDeps({ runner, readDraftsFile: () => [draftA, draftB] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w', '--dry-run'], deps);
  assert.equal(code, 0);
  assert.equal(createCalls.length, 0);
  const lines = out.join('').trim().split('\n');
  assert.equal(lines[0], 'dedup-hit #801');
  assert.match(lines[1], new RegExp(`would-file \\(fingerprint ${fpB}\\)`));
});

test('CLI --dry-run: a runner failure in the dedup search reports the real gh error text, not a swallowed undefined', () => {
  // Regression: the dry-run loop's dedup-search catch used to read `err.message`
  // directly instead of `errorText(err)` — for a runner failure carrying its
  // diagnostic in .stderr (or a thrown non-Error), that silently produced
  // "filing-failure: undefined". Mirrors link.test.js's errorText-fallback coverage.
  const draft = makeDraft();
  const runner = (args) => {
    if (isList(args)) { const e = new Error(); e.stderr = 'gh: rate limited (403)'; throw e; }
    throw new Error('unexpected ' + args.join(' '));
  };
  const { deps, out } = cliDeps({ runner, readDraftsFile: () => [draft] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w', '--dry-run'], deps);
  assert.equal(code, 1);
  const line = out.join('').trim();
  assert.match(line, /filing-failure:/);
  assert.match(line, /rate limited \(403\)/);
  assert.doesNotMatch(line, /filing-failure: undefined/);
});

test('CLI: missing --drafts exits 2 with zero runner calls', () => {
  const runner = () => { throw new Error('must not call gh'); };
  const { deps, err } = cliDeps({ runner });
  const code = run([], deps);
  assert.equal(code, 2);
  assert.match(err.join(''), /--drafts is required/);
});

test('CLI: a drafts entry missing fingerprintBasis exits 2 with zero runner calls', () => {
  const runner = () => { throw new Error('must not call gh'); };
  const badDraft = { title: 'x', body: 'y', labels: [] };
  const { deps, err } = cliDeps({ runner, readDraftsFile: () => [badDraft] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w'], deps);
  assert.equal(code, 2);
  assert.match(err.join(''), /missing fingerprintBasis/);
});

test('CLI: gh unavailable exits 2, stderr names the fallback, zero runner calls', () => {
  const runner = () => { throw new Error('must not call gh'); };
  const { deps, err } = cliDeps({ runner, ghAvailable: false, readDraftsFile: () => [makeDraft()] });
  const code = run(['--drafts', 'drafts.json', '--repo', 'acme/w'], deps);
  assert.equal(code, 2);
  const stderr = err.join('');
  assert.match(stderr, /Step 8|github-write-transport/);
});

// ---- parseArgs / validateDraft / parseRepo ---------------------------------

test('parseArgs: --help short-circuits, unknown flags and missing values are errors', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.match(parseArgs(['--bogus']).error, /unknown argument/);
  assert.match(parseArgs(['--drafts']).error, /missing value for --drafts/);
});

test('validateDraft: flags a missing title, body, and fingerprintBasis fields individually', () => {
  assert.match(validateDraft({ body: 'b', fingerprintBasis: { component: 'c', summary: 's' } }, 0), /missing title/);
  assert.match(validateDraft({ title: 't', fingerprintBasis: { component: 'c', summary: 's' } }, 0), /missing body/);
  assert.match(validateDraft({ title: 't', body: 'b' }, 0), /missing fingerprintBasis/);
  assert.equal(validateDraft({ title: 't', body: 'b', fingerprintBasis: { component: 'c', summary: 's' } }, 0), null);
});

test('parseRepo: extracts owner/repo from github.com/owner/repo and github.com:owner/repo.git forms', () => {
  assert.deepEqual(parseRepo('github.com/owner/repo'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepo('github.com:owner/repo.git'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepo('https://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
  assert.equal(parseRepo('https://gitlab.com/owner/repo'), null);
});
