'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, parseArgs, shellQuote, extractSection, firstSentence } = require('../../plugin/bin/lib/compose-subject.js');

const RECORDS = {
  2251: { number: 2251, title: 'Merge-time conventional subject', body: 'Surface: infra\n\n## Overview\n\nMakes the merge subject conventional. Second sentence.\n\n## Deliverables\n\n- x\n', labels: [{ name: 'type:feature' }, { name: 'ready' }], issueType: null },
  2252: { number: 2252, title: 'Reconcile under squash', body: '## Overview\n\nSquash-aware reconcile.\n', labels: [{ name: 'type:task' }], issueType: null },
  2260: { number: 2260, title: 'Drop the legacy flag', body: '## Overview\n\nRemoves --legacy.\n\n## Breaking Change\n\nPass --new instead of --legacy.\n\n## Gotchas\n\n- none\n', labels: [{ name: 'type:feature' }, { name: 'breaking' }], issueType: null },
  2261: { number: 2261, title: 'Native-typed', body: '## Overview\n\nNative.\n', labels: [{ name: 'type:task' }], issueType: { name: 'Bug' } },
  2262: { number: 2262, title: "It's quoted", body: '## Overview\n\nHas a quote.\n', labels: [{ name: 'type:bug' }], issueType: null },
  2263: { number: 2263, title: 'No type', body: '## Overview\n\nNo type label.\n', labels: [{ name: 'ready' }], issueType: null },
  2264: { number: 2264, title: 'Breaking, no section', body: '## Overview\n\nOops.\n', labels: [{ name: 'type:feature' }, { name: 'breaking' }], issueType: null },
};

function fakeDeps({ records = RECORDS, ghAvailable = () => true, remoteUrl = () => 'git@github.com:acme/repo.git', failView = false } = {}) {
  const out = { stdout: '', stderr: '', calls: [] };
  const deps = {
    ghAvailable,
    remoteUrl,
    runner: (args) => {
      out.calls.push(args);
      if (failView) throw new Error('boom: gh exploded');
      assert.equal(args[0], 'issue'); assert.equal(args[1], 'view');
      const n = Number(args[2]);
      if (!records[n]) throw new Error('unexpected ' + args.join(' '));
      return JSON.stringify(records[n]);
    },
    stdout: (s) => { out.stdout += s; },
    stderr: (s) => { out.stderr += s; },
  };
  return { deps, out };
}

test('parseArgs: comma-joined and space-separated numbers, --tag, --shell, --repo', () => {
  const o = parseArgs(['2251,2252', '2253', '--tag', 'auto-merge', '--shell', '--repo', 'a/b']);
  assert.deepEqual(o.numbers, [2251, 2252, 2253]);
  assert.equal(o.tag, 'auto-merge'); assert.equal(o.shell, true); assert.equal(o.repo, 'a/b');
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['0']).error);
  assert.ok(parseArgs(['2251', '--bogus']).error);
  assert.ok(parseArgs(['2251', '--tag']).error);
  assert.equal(parseArgs(['--help']).help, true);
});

test('single record: conventional subject from type label, summary from Overview first sentence, one Fixes line', () => {
  const { deps, out } = fakeDeps();
  const code = run(['2251'], deps);
  assert.equal(code, 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat: Merge-time conventional subject (#2251)');
  assert.equal(parsed.body, 'Makes the merge subject conventional.\n\nFixes #2251');
  assert.deepEqual(out.calls[0].slice(0, 3), ['issue', 'view', '2251']);
  assert.ok(out.calls[0].includes('--repo') && out.calls[0].includes('acme/repo'));
  assert.ok(out.calls[0].includes('number,title,body,labels,issueType'));
});

test('bundle: subject from the lowest number, one Fixes line per record ascending, tag paragraph', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2252,2251', '--tag', 'auto-merge'], deps), 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat: Merge-time conventional subject (#2251)');
  assert.equal(parsed.body, 'Makes the merge subject conventional.\n\n[auto-merge]\n\nFixes #2251\nFixes #2252');
});

test('breaking record: ! suffix and BREAKING CHANGE footer from its ## Breaking Change section', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2260'], deps), 0, out.stderr);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.title, 'feat!: Drop the legacy flag (#2260)');
  assert.ok(parsed.body.endsWith('\n\nBREAKING CHANGE: Pass --new instead of --legacy.'), parsed.body);
});

test('native issueType wins over a type:* label', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2261'], deps), 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).title, 'fix: Native-typed (#2261)');
});

test('--shell prints eval-able single-quoted assignments with embedded quotes escaped', () => {
  const { deps, out } = fakeDeps();
  assert.equal(run(['2262', '--shell'], deps), 0, out.stderr);
  const lines = out.stdout.trimEnd().split('\n');
  assert.equal(lines[0], "SUBJECT_TITLE='fix: It'\\''s quoted (#2262)'");
  assert.ok(lines[1].startsWith("SUBJECT_BODY='Has a quote."));
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});

test('exit 1: record with no resolvable type, or breaking without a ## Breaking Change section', () => {
  let r = fakeDeps();
  assert.equal(run(['2263'], r.deps), 1);
  assert.match(r.out.stderr, /type must be one of/);
  r = fakeDeps();
  assert.equal(run(['2264'], r.deps), 1);
  assert.match(r.out.stderr, /migrationNote|Breaking Change/);
});

test('exit 2: gh absent, or owner/repo unresolvable without --repo', () => {
  let r = fakeDeps({ ghAvailable: () => false });
  assert.equal(run(['2251'], r.deps), 2);
  r = fakeDeps({ remoteUrl: () => { throw new Error('not a git repo'); } });
  assert.equal(run(['2251'], r.deps), 2);
  r = fakeDeps({ remoteUrl: () => { throw new Error('not a git repo'); } });
  assert.equal(run(['2251', '--repo', 'acme/repo'], r.deps), 0, r.out.stderr);
});

test('exit 3: a gh issue view call fails', () => {
  const r = fakeDeps({ failView: true });
  assert.equal(run(['2251'], r.deps), 3);
  assert.match(r.out.stderr, /boom/);
});

test('helpers: extractSection and firstSentence', () => {
  const body = '## Overview\n\nOne. Two.\n\n## Breaking Change\n\nNote line 1.\nNote line 2.\n\n## Gotchas\n\n- g\n';
  assert.equal(extractSection(body, 'Breaking Change'), 'Note line 1.\nNote line 2.');
  assert.equal(extractSection(body, 'Missing'), '');
  assert.equal(firstSentence('One. Two.'), 'One.');
  assert.equal(firstSentence('No terminator here\n\nSecond para.'), 'No terminator here');
  assert.equal(firstSentence('Is this it? Yes. More.'), 'Is this it?');
  assert.equal(firstSentence('Line one\ncontinues here. Then more.'), 'Line one continues here.');
  assert.equal(firstSentence(''), '');
});
