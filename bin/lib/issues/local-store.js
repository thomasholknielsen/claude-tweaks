// bin/lib/issues/local-store.js
// The local-files work-record driver: read/write specs/{n}-{slug}.md records with
// frontmatter facets. Frontmatter is parsed with the same no-dependency line-regex
// style bin/lib/policy.js uses — the plugin ships zero runtime npm deps, so there
// is no YAML library here. `facets` is a superset of record.js's parseRecordFacets
// shape (same keys — origin, risk, effort, priority, stage, grants{build,merge},
// bot{inProgress,blocked}, acceptance — plus type, parent, blockedBy, unsynced); the
// github driver's callers get type/parent/blockedBy from the issue JSON itself, not
// from labels. No network calls.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const DEFAULT_DIR = 'specs';

// A record filename: a numeric id prefix, a dash, any slug, ending .md.
const ID_PREFIX_RE = /^(\d+)-.*\.md$/;
// Same shape, capturing id and slug separately for readRecord.
const FILENAME_RE = /^(\d+)-(.+)\.md$/;

const GRANT_KEYS = ['build', 'merge'];

// Explicit defaults first, only ever flipped/assigned by a matching frontmatter
// line elsewhere — never inferred from truthiness (parseRecordFacets style).
// `bot` is always this value: the local driver carries no bot state.
function defaultFacets() {
  return {
    type: null,
    origin: null,
    risk: null,
    effort: null,
    ceremony: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    parent: null,
    blockedBy: [],
    unsynced: false,
    acceptance: null,
    closed: false,
    closedAt: null,
  };
}

function trimLeadingBlank(lines) {
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i);
}

function trimTrailingBlank(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}

// raw file text -> { fmLines, afterLines }. fmLines is null when the file doesn't
// open with a '---' fence on its very first line, or the fence never closes —
// both treated as "no frontmatter" (the malformed-file case).
function splitFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0] !== '---') return { fmLines: null, afterLines: lines };
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return { fmLines: null, afterLines: lines };
  return { fmLines: lines.slice(1, closeIdx), afterLines: lines.slice(closeIdx + 1) };
}

// "a, b" -> ['a', 'b']; "" -> [].
function parseBracketList(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  return trimmed.split(',').map((s) => s.trim()).filter((s) => s !== '');
}

// fmLines -> facets. Unrecognized lines are silently skipped (permissive
// line-regex parser, matching bin/lib/policy.js's style).
function parseFrontmatterLines(fmLines) {
  const facets = defaultFacets();

  for (const rawLine of fmLines) {
    const line = rawLine.trim();
    if (line === '') continue;

    let m;
    if ((m = /^type:\s*(.+)$/.exec(line))) { facets.type = m[1].trim(); continue; }
    if ((m = /^origin:\s*(.+)$/.exec(line))) { facets.origin = m[1].trim(); continue; }
    if ((m = /^risk:\s*(.+)$/.exec(line))) { facets.risk = m[1].trim(); continue; }
    if ((m = /^effort:\s*(.+)$/.exec(line))) { facets.effort = m[1].trim(); continue; }
    if ((m = /^ceremony:\s*(.+)$/.exec(line))) { facets.ceremony = m[1].trim(); continue; }
    if ((m = /^priority:\s*(.+)$/.exec(line))) { facets.priority = m[1].trim(); continue; }
    if ((m = /^stage:\s*(.+)$/.exec(line))) { facets.stage = m[1].trim(); continue; }
    if ((m = /^closed:\s*(true|false)$/.exec(line))) { facets.closed = m[1] === 'true'; continue; }
    if ((m = /^closed-at:\s*(.+)$/.exec(line))) { facets.closedAt = m[1].trim(); continue; }
    if ((m = /^grants:\s*\[(.*)\]$/.exec(line))) {
      const names = parseBracketList(m[1]);
      facets.grants = { build: names.includes('build'), merge: names.includes('merge') };
      continue;
    }
    if ((m = /^parent:\s*(\d+)$/.exec(line))) { facets.parent = Number(m[1]); continue; }
    if ((m = /^blocked-by:\s*\[(.*)\]$/.exec(line))) {
      facets.blockedBy = parseBracketList(m[1]).map(Number);
      continue;
    }
    if ((m = /^unsynced:\s*(true|false)$/.exec(line))) { facets.unsynced = m[1] === 'true'; continue; }
    if ((m = /^acceptance:\s*(.+)$/.exec(line))) { facets.acceptance = m[1].trim(); continue; }
  }

  return facets;
}

// content lines after the frontmatter fence (or the whole file, when there is
// none) -> { title, body }. title is the first line's '# ' heading text when
// present (null otherwise); body is everything after that heading, trimmed of
// blank lines at both edges — the inverse of writeRecord's
// '# {title}\n\n{body}' composition.
function extractTitleAndBody(afterLines) {
  let lines = trimLeadingBlank(afterLines);
  let title = null;

  const heading = lines.length > 0 ? /^#\s+(.+)$/.exec(lines[0]) : null;
  if (heading) {
    title = heading[1].trim();
    lines = trimLeadingBlank(lines.slice(1));
  }

  lines = trimTrailingBlank(lines);
  return { title, body: lines.join('\n') };
}

function readRecord(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const nameMatch = FILENAME_RE.exec(path.basename(filePath));
  const id = nameMatch ? Number(nameMatch[1]) : null;
  const slug = nameMatch ? nameMatch[2] : null;

  const { fmLines, afterLines } = splitFrontmatter(raw);
  const facets = fmLines ? parseFrontmatterLines(fmLines) : defaultFacets();
  const { title, body } = extractTitleAndBody(afterLines);

  return { path: filePath, id, slug, title, body, facets };
}

// facets -> frontmatter lines, omitting every key at its default/absent value:
// no 'stage: backlog', no empty 'grants: []', no 'unsynced: false', no 'parent'
// when null, no 'blocked-by' when empty. `bot` is never written — it isn't a
// file-backed facet for the local driver. Array syntax is exactly '[a, b]'.
function serializeFrontmatter(facets) {
  const lines = [];
  if (facets.type) lines.push(`type: ${facets.type}`);
  if (facets.origin) lines.push(`origin: ${facets.origin}`);
  if (facets.risk) lines.push(`risk: ${facets.risk}`);
  if (facets.effort) lines.push(`effort: ${facets.effort}`);
  if (facets.ceremony) lines.push(`ceremony: ${facets.ceremony}`);
  if (facets.priority) lines.push(`priority: ${facets.priority}`);
  if (facets.stage && facets.stage !== 'backlog') lines.push(`stage: ${facets.stage}`);
  if (facets.closed) lines.push('closed: true');
  if (facets.closedAt) lines.push(`closed-at: ${facets.closedAt}`);

  const grants = facets.grants || {};
  const grantNames = GRANT_KEYS.filter((key) => grants[key]);
  if (grantNames.length > 0) lines.push(`grants: [${grantNames.join(', ')}]`);

  if (facets.parent !== null && facets.parent !== undefined) lines.push(`parent: ${facets.parent}`);

  const blockedBy = facets.blockedBy || [];
  if (blockedBy.length > 0) lines.push(`blocked-by: [${blockedBy.join(', ')}]`);

  if (facets.unsynced) lines.push('unsynced: true');
  if (facets.acceptance) lines.push(`acceptance: ${facets.acceptance}`);

  return lines;
}

// { title, body, facets } -> full file text (frontmatter fence + '# {title}' +
// body). Pure composition, shared by writeRecord and createRecord so the two
// write paths (overwrite vs. exclusive-create) can't drift on file shape.
function composeRecordContent({ title, body, facets } = {}) {
  const fmLines = serializeFrontmatter(facets || {});
  const parts = ['---', ...fmLines, '---', ''];
  if (title) parts.push(`# ${title}`, '');
  if (body) parts.push(body);
  return parts.join('\n') + '\n';
}

// (filePath, { title, body, facets }) -> void. Composes frontmatter + '# {title}'
// + body. Creates the parent directory when missing. Overwrites unconditionally —
// callers that need to allocate a fresh id and write it without racing another
// concurrent writer should use createRecord instead.
function writeRecord(filePath, { title, body, facets } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, composeRecordContent({ title, body, facets }), 'utf8');
}

// filePath -> void. Marks a record closed without deleting it — mirrors a GitHub
// issue's closed (not deleted) state, so a completed local-files record stops
// surfacing in default queryRecords results while remaining on disk as history.
// Preserves every other facet and the record's title/body unchanged.
function closeRecord(filePath) {
  const record = readRecord(filePath);
  writeRecord(filePath, {
    title: record.title,
    body: record.body,
    facets: { ...record.facets, closed: true, closedAt: new Date().toISOString() },
  });
}

// dir -> record filenames (NN-*.md, files only, non-recursive), or [] when dir
// is missing/unreadable.
function listRecordFilenames(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && ID_PREFIX_RE.test(e.name)).map((e) => e.name);
}

// dir -> max existing numeric filename prefix + 1; 1 when empty/missing.
//
// NOTE: this alone is NOT safe for concurrent record creation — it only reads a
// directory listing. Two near-simultaneous callers can both read the same
// listing, both compute the same next id, and both writeRecord() at that id.
// Because the two callers' filenames only match when they also pick the same
// slug, the likelier real-world outcome is actually the "shared id, different
// filename" case (two records that both claim, say, id 13, under different
// slugs — breaking any parent/blocked-by reference that assumes id uniqueness)
// rather than one writer silently overwriting the other's identically-named
// file. Callers creating a brand-new record should use createRecord (below),
// which allocates the id and writes the file as one atomic step regardless of
// what slug either side picks. allocateId remains exported/used as today for
// callers that only need to preview the next id (e.g. to reference it in text
// before the record is actually written) without creating anything.
function allocateId(dir = DEFAULT_DIR) {
  let max = 0;
  for (const name of listRecordFilenames(dir)) {
    const n = Number(ID_PREFIX_RE.exec(name)[1]);
    if (n > max) max = n;
  }
  return max + 1;
}

// Bounds the retry loop in createRecord. Real contention resolves in a handful
// of retries at most (one per concurrent writer that raced ahead of us); this is
// a runaway-loop guard for a persistently broken directory, not a realistic
// ceiling.
const MAX_CREATE_ATTEMPTS = 1000;

// dir, id -> the transient claim-file path used by createRecord to reserve `id`
// before it's known (or matters) what slug the eventual record will have.
// Deliberately does NOT match ID_PREFIX_RE (no '-' immediately after the digits,
// no '.md' suffix) — invisible to listRecordFilenames/allocateId/queryRecords,
// so a claim file that outlives its writer (crash between claim and rename)
// never surfaces as a phantom record; it just permanently retires that one id
// number, a safe degrade rather than a correctness problem.
function claimPathFor(dir, id) {
  return path.join(dir, `${id}.claim`);
}

// (dir, { slug, title, body, facets }) -> record (same shape as readRecord's
// return value: { path, id, slug, title, body, facets }).
//
// Atomically allocates an id and writes the record as one step, closing the
// allocateId-then-writeRecord race described above — for ANY combination of
// slugs the racing callers happen to pick, not just when they collide on the
// same one. Starts from allocateId(dir)'s candidate id; for each candidate,
// exclusively creates ({ flag: 'wx' }, which throws EEXIST if the target already
// exists) a claim file keyed ONLY on the numeric id (see claimPathFor) — never
// on the full `{id}-{slug}.md` name. Keying the claim on the id alone is what
// makes two racing callers that pick DIFFERENT slugs still correctly collide:
// an exclusive-create on the full slugged filename would let both of their
// (differently-named) writes succeed, silently reproducing the "two files
// sharing one numeric id" bug this function exists to close. Whichever caller
// wins the claim renames it (same-directory rename is atomic on POSIX, so the
// file is never visible half-written or under the wrong name) to the real
// `{id}-{slug}.md` and returns; the loser observes EEXIST on the claim and
// retries at id + 1.
//
// This is additive: allocateId/writeRecord/queryRecords are unchanged and still
// exported for callers that have a reason to call them individually (e.g. a
// single-writer script, or a caller previewing an id before deciding whether to
// write at all).
function createRecord(dir = DEFAULT_DIR, { slug, title, body, facets } = {}) {
  if (!slug) throw new Error('createRecord requires a slug');
  const content = composeRecordContent({ title, body, facets });
  fs.mkdirSync(dir, { recursive: true });

  let id = allocateId(dir);
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const claimPath = claimPathFor(dir, id);
    try {
      fs.writeFileSync(claimPath, content, { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      id += 1;
      continue;
    }
    const filePath = path.join(dir, `${id}-${slug}.md`);
    fs.renameSync(claimPath, filePath);
    return readRecord(filePath);
  }
  throw new Error(`createRecord: exhausted ${MAX_CREATE_ATTEMPTS} id attempts writing to ${dir}`);
}

// title, existingSlugs? -> slug. The single implementation of the slug rule
// for callers creating a brand-new local-files record (currently /capture;
// specify/SKILL.md's parent/leaf creation still derives slugs inline and is
// a candidate to adopt this too): lowercase, collapse runs of
// non-alphanumeric characters to a single '-', trim leading/trailing '-',
// truncate to 60 chars, then dedupe against existingSlugs (if given) by
// appending a numeric suffix ('-2', '-3', ...). Falls back to 'untitled'
// when the title has no alphanumeric characters at all, so callers never
// hand createRecord an empty slug (which would produce an unparseable
// '{id}-.md' filename).
function deriveSlug(title, existingSlugs = []) {
  let slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  if (!slug) slug = 'untitled';
  if (!existingSlugs.includes(slug)) return slug;

  let suffix = 2;
  while (existingSlugs.includes(`${slug}-${suffix}`)) suffix += 1;
  return `${slug}-${suffix}`;
}

// Every key in facetFilter must deep-equal the record's same-named facet
// (assert.deepStrictEqual semantics via util.isDeepStrictEqual): scalar keys
// compare like ===, object-valued keys like grants compare structurally —
// { build: true } does not match a record whose grants is { build: true,
// merge: true }.
function matchesFilter(facets, facetFilter) {
  return Object.keys(facetFilter).every((key) => util.isDeepStrictEqual(facets[key], facetFilter[key]));
}

// (dir, facetFilter) -> record[]. Scans NN-*.md files only, non-recursively.
// Object-valued filters (e.g. grants) require the exact full shape —
// {grants:{build:true}} matches nothing; pass the complete object.
// Mirrors `gh issue list --state open`'s default: a closed record is excluded
// unless the caller explicitly filters on `closed` (either true or false) —
// pass { closed: true } to see closed records, matching queryRecords(dir, {})'s
// existing "open, as today" meaning for every pre-existing call site.
function queryRecords(dir = DEFAULT_DIR, facetFilter = {}) {
  const filtersOnClosed = Object.prototype.hasOwnProperty.call(facetFilter, 'closed');
  const records = [];
  for (const name of listRecordFilenames(dir)) {
    const record = readRecord(path.join(dir, name));
    if (!filtersOnClosed && record.facets.closed) continue;
    if (matchesFilter(record.facets, facetFilter)) records.push(record);
  }
  return records;
}

module.exports = { DEFAULT_DIR, readRecord, writeRecord, allocateId, createRecord, queryRecords, closeRecord, deriveSlug };
