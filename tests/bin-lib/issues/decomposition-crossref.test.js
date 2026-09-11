'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crossReferenceKeyFiles } = require('../../../plugin/bin/lib/issues/decomposition-crossref');

// Reproduces the #473/#475 pattern: sub-issue A's Gotchas forward-references a
// facet rename ("soon `facets.solutionUnjustified`, per the companion rename
// sub-issue: Rename solutionUnjustified facet") that sub-issue B must make,
// but neither A's nor B's own scope-only Key Files list names the file the
// facet lives in. A repo-wide grep for the identifier is the mechanical step
// that closes the gap.
const UNIT_A_BODY = `
## Deliverables

Stamp \`solution:unjustified\` on the record.

## Gotchas

- The label will soon be exposed as \`facets.solutionUnjustified\`, per the companion rename sub-issue: Rename solutionUnjustified facet.

### Key Files

- \`plugin/skills/challenge/framing-check.md\` — stamps the label
`;

const UNIT_B_BODY = `
## Deliverables

Rename the facet reader.

### Key Files

- \`docs/superpowers/specs/example-design.md\` — background only
`;

test('reproduces the #473/#475 pattern: a facet identifier forward-referenced in a sibling\'s Gotchas resolves via grep into that sibling\'s own Key Files', () => {
  const units = [
    { title: 'Stamp solution:unjustified on framing-check verdicts', body: UNIT_A_BODY },
    { title: 'Rename solutionUnjustified facet', body: UNIT_B_BODY },
  ];
  const fakeGrep = (ident) => (ident === 'facets.solutionUnjustified' ? ['plugin/bin/lib/issues/local-store.js'] : []);

  const result = crossReferenceKeyFiles(units, fakeGrep);

  const renameUnit = result.find((r) => r.title === 'Rename solutionUnjustified facet');
  assert.ok(renameUnit, 'the renamed-facet sub-issue should gain a Key Files addition');
  assert.deepStrictEqual(
    renameUnit.addedFiles.map((f) => f.path),
    ['plugin/bin/lib/issues/local-store.js'],
  );
  assert.match(renameUnit.addedFiles[0].note, /cross-referenced from/);
  assert.match(renameUnit.addedFiles[0].note, /facets\.solutionUnjustified/);
});

test('a decomposition with no cross-sub-issue forward/backward references is unaffected', () => {
  const units = [
    { title: 'Add the login form', body: '## Deliverables\n\nBuild it.\n\n### Key Files\n\n- `src/login.tsx` — new component\n' },
    { title: 'Add the logout button', body: '## Deliverables\n\nBuild it.\n\n### Key Files\n\n- `src/logout.tsx` — new component\n' },
  ];
  const grepCalls = [];
  const grep = (ident) => { grepCalls.push(ident); return []; };

  const result = crossReferenceKeyFiles(units, grep);

  assert.deepStrictEqual(result, [], 'no additions should be made when nothing cross-references');
  assert.deepStrictEqual(grepCalls, [], 'grep should never be called when no sibling title is mentioned');
});

test('an already-listed file is not re-added', () => {
  const bodyA = '## Gotchas\n\n- See `helper()` for Sibling task.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nSibling task.\n\n### Key Files\n\n- `helper.js` — already listed\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Sibling task', body: bodyB },
  ];
  const grep = (ident) => (ident === 'helper()' ? ['helper.js'] : []);

  const result = crossReferenceKeyFiles(units, grep);

  assert.deepStrictEqual(result, [], 'a file already in the sibling\'s own Key Files must not be re-added');
});

test('a matched identifier whose grep hit is a test file is excluded', () => {
  const bodyA = '## Gotchas\n\n- Sibling task will need `widget()`.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nSibling task.\n\n### Key Files\n\n- `src/widget.js`\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Sibling task', body: bodyB },
  ];
  const grep = (ident) => (ident === 'widget()' ? ['src/widget.js', 'tests/widget.test.js'] : []);

  const result = crossReferenceKeyFiles(units, grep);

  const sibling = result.find((r) => r.title === 'Sibling task');
  assert.deepStrictEqual(sibling, undefined, 'src/widget.js is already listed, and the test-file hit must never surface as an addition');
});

test('a Prerequisites-section reference is scanned the same as a Gotchas one', () => {
  const bodyA = '## Prerequisites\n\n- Blocked by Sibling task, which owns `shared()`.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nSibling task.\n\n### Key Files\n\n- `unrelated.js`\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Sibling task', body: bodyB },
  ];
  const grep = (ident) => (ident === 'shared()' ? ['shared-module.js'] : []);

  const result = crossReferenceKeyFiles(units, grep);

  const sibling = result.find((r) => r.title === 'Sibling task');
  assert.ok(sibling, 'Prerequisites mentions must be scanned the same as Gotchas mentions');
  assert.deepStrictEqual(sibling.addedFiles.map((f) => f.path), ['shared-module.js']);
});

test('a backticked file path (not an identifier) is never mistaken for a symbol to grep', () => {
  const bodyA = '## Gotchas\n\n- Sibling task touches `src/config.json` directly.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nSibling task.\n\n### Key Files\n\n- `unrelated.js`\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Sibling task', body: bodyB },
  ];
  const grepCalls = [];
  const grep = (ident) => { grepCalls.push(ident); return ['should-not-appear.js']; };

  const result = crossReferenceKeyFiles(units, grep);

  assert.deepStrictEqual(grepCalls, [], 'a path-shaped token (contains "/") must never be treated as a grep-able identifier');
  assert.deepStrictEqual(result, []);
});

test('a short generic sibling title does not wrongly match as a substring of an unrelated word', () => {
  const bodyA = '## Gotchas\n\n- The word prefix here mentions `helper()` but not the sibling by name.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nBuild it.\n\n### Key Files\n\n- `unrelated.js`\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Fix', body: bodyB },
  ];
  const grepCalls = [];
  const grep = (ident) => { grepCalls.push(ident); return ['should-not-appear.js']; };

  const result = crossReferenceKeyFiles(units, grep);

  assert.deepStrictEqual(grepCalls, [], 'title "Fix" must not match as a substring inside "prefix"');
  assert.deepStrictEqual(result, [], 'no cross-reference should be produced from a substring-only match');
});
