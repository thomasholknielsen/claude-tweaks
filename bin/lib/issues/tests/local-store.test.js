'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_DIR, readRecord, writeRecord, allocateId, queryRecords } = require('../local-store');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('DEFAULT_DIR is specs', () => {
  assert.strictEqual(DEFAULT_DIR, 'specs');
});

// --- round-trip (AC 5) ---

test('writeRecord then readRecord round-trips facets, id, slug, title, and body', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '14-bar.md');
  const facets = {
    type: 'feature', origin: 'capture', risk: 'medium', effort: 'low', priority: null,
    stage: 'parked', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: 12, blockedBy: [12, 7], unsynced: true,
  };

  writeRecord(filePath, { title: 'Bar', body: 'Current State…', facets });
  const record = readRecord(filePath);

  assert.deepStrictEqual(record.facets, facets);
  assert.strictEqual(record.id, 14);
  assert.strictEqual(record.slug, 'bar');
  assert.strictEqual(record.title, 'Bar');
  assert.strictEqual(record.body, 'Current State…');
  assert.strictEqual(record.path, filePath);
});

test('writeRecord omits default/absent frontmatter keys from the written file', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '1-min.md');
  writeRecord(filePath, {
    title: 'Min', body: 'b',
    facets: {
      type: 'task', origin: null, risk: null, effort: null, priority: null,
      stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
      parent: null, blockedBy: [], unsynced: false,
    },
  });
  const raw = fs.readFileSync(filePath, 'utf8');
  assert.ok(!/^stage:/m.test(raw), 'must not write default stage: backlog');
  assert.ok(!/^grants:/m.test(raw), 'must not write empty grants: []');
  assert.ok(!/^unsynced:/m.test(raw), 'must not write unsynced: false');
  assert.ok(!/^parent:/m.test(raw), 'must not write parent when null');
  assert.ok(!/^blocked-by:/m.test(raw), 'must not write blocked-by when empty');
  assert.ok(!/^origin:/m.test(raw), 'must not write origin when null');
  assert.ok(/^type: task$/m.test(raw), 'must still write the non-default type key');

  // and it still round-trips to the same facets (omission is lossless)
  const record = readRecord(filePath);
  assert.strictEqual(record.facets.stage, 'backlog');
  assert.deepStrictEqual(record.facets.grants, { build: false, merge: false });
  assert.strictEqual(record.facets.unsynced, false);
});

// --- allocateId (AC 5) ---

test('allocateId returns max numeric prefix + 1', (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, '13-foo.md'), 'x');
  assert.strictEqual(allocateId(dir), 14);
});

test('allocateId returns 1 for an empty dir', (t) => {
  const dir = tmp(t);
  assert.strictEqual(allocateId(dir), 1);
});

test('allocateId returns 1 for a missing dir', (t) => {
  const dir = tmp(t);
  assert.strictEqual(allocateId(path.join(dir, 'does-not-exist')), 1);
});

test('allocateId ignores non-matching filenames', (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, '13-foo.md'), 'x');
  fs.writeFileSync(path.join(dir, '2-a.md'), 'x');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(dir, 'x-9.md'), 'x');
  assert.strictEqual(allocateId(dir), 14);
});

// --- queryRecords (AC 5) ---

function baseFacets(overrides) {
  return Object.assign({
    type: 'task', origin: null, risk: null, effort: null, priority: null,
    stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: null, blockedBy: [], unsynced: false,
  }, overrides);
}

test('queryRecords: stage filter, unsynced filter, and empty filter (returns all)', (t) => {
  const dir = tmp(t);
  writeRecord(path.join(dir, '1-a.md'), { title: 'A', body: 'a', facets: baseFacets({ stage: 'parked' }) });
  writeRecord(path.join(dir, '2-b.md'), { title: 'B', body: 'b', facets: baseFacets({ stage: 'ready', unsynced: true }) });
  writeRecord(path.join(dir, '3-c.md'), { title: 'C', body: 'c', facets: baseFacets({ stage: 'backlog' }) });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored — not a record file');

  const parked = queryRecords(dir, { stage: 'parked' });
  assert.strictEqual(parked.length, 1);
  assert.strictEqual(parked[0].slug, 'a');

  const unsynced = queryRecords(dir, { unsynced: true });
  assert.strictEqual(unsynced.length, 1);
  assert.strictEqual(unsynced[0].slug, 'b');

  const all = queryRecords(dir, {});
  assert.strictEqual(all.length, 3);
});

test('queryRecords matches object-valued facets (grants) with deep equality, not partial match', (t) => {
  const dir = tmp(t);
  writeRecord(path.join(dir, '1-a.md'), { title: 'A', body: 'a', facets: baseFacets({ grants: { build: true, merge: true } }) });
  writeRecord(path.join(dir, '2-b.md'), { title: 'B', body: 'b', facets: baseFacets({ grants: { build: true, merge: false } }) });

  const bothGrants = queryRecords(dir, { grants: { build: true, merge: true } });
  assert.strictEqual(bothGrants.length, 1);
  assert.strictEqual(bothGrants[0].slug, 'a');
});

test('queryRecords returns an empty array for a missing dir', (t) => {
  const dir = tmp(t);
  assert.deepStrictEqual(queryRecords(path.join(dir, 'nope'), {}), []);
});

// --- malformed file (AC 5) ---

test('readRecord on a file with no frontmatter: type null, stage backlog, body is the whole content', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '5-broken.md');
  fs.writeFileSync(filePath, 'Just plain text, no frontmatter here.\n');

  const record = readRecord(filePath);
  assert.strictEqual(record.facets.type, null);
  assert.strictEqual(record.facets.stage, 'backlog');
  assert.strictEqual(record.body, 'Just plain text, no frontmatter here.');
  assert.strictEqual(record.title, null);
  assert.strictEqual(record.id, 5);
  assert.strictEqual(record.slug, 'broken');
  assert.deepStrictEqual(record.facets.grants, { build: false, merge: false });
  assert.deepStrictEqual(record.facets.bot, { inProgress: false, blocked: false });
  assert.deepStrictEqual(record.facets.blockedBy, []);
  assert.strictEqual(record.facets.unsynced, false);
});
