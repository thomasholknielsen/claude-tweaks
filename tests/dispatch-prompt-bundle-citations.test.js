// tests/dispatch-prompt-bundle-citations.test.js — pins #1995: a dispatched Task agent must be
// pointed at the run's composed bundle (`{minted-run-dir}/context/{step}.md`), never at a raw
// `_shared/*.md` path, inside any text that actually reaches the agent (fenced Task-prompt
// blocks, and the Context pack table those blocks are substituted from) — except the agent-side
// fallback sentence itself, which is expected to name the source it falls back to, and two
// documented gaps with no compose step yet. Modeled on
// tests/skill-prose-plugin-root-invocations.test.js's walk/exemption shape.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugin');
const TASK_PROMPT = path.join(PLUGIN, 'skills', 'dispatch', 'task-prompt.md');
const LENS_DISPATCH = path.join(PLUGIN, 'skills', 'review', 'step3-lens-dispatch.md');

// Documented gaps: a `_shared/` citation with no compose step behind it yet. Each entry must
// still occur inside a fenced block below — a stale-exemption check (parse-signal-discipline):
// if a gap's file is ever composed and its citation moves to a bundle path, this list must
// shrink with it, or a rotted exemption starts silently covering something new.
const GAPS = ['_shared/pipeline-run-dir.md', '_shared/integration-model.md'];

// The agent-side fallback shape: a `_shared/` mention is allowed only when it is the source
// named by a "read directly" fallback clause on the same physical line.
const FALLBACK_RE = /is absent, read `_shared\/|if that bundle is absent, read it directly/;

function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('```')) continue;
    if (start === -1) { start = i + 1; } else { blocks.push(lines.slice(start, i)); start = -1; }
  }
  return blocks;
}

function section(text, heading) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.startsWith(heading));
  assert.ok(startIdx !== -1, `heading not found: ${heading}`);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx);
}

// The lines this file's `_shared/`-citation rule actually governs: every fenced code block in
// the whole file, plus the table rows (`| ` lines) of the `## Context pack` section specifically
// (prose in that section is out of scope — only the table row is substituted into the templates
// verbatim, per task-prompt.md's own "Substitute this whole block" instruction).
function governedLines(text) {
  const out = [];
  for (const block of fencedBlocks(text)) out.push(...block);
  for (const line of section(text, '## Context pack')) {
    if (line.trim().startsWith('|')) out.push(line);
  }
  return out;
}

function sharedOffenders(lines, { gaps = [] } = {}) {
  return lines.filter((line) => {
    if (!line.includes('_shared/')) return false;
    if (FALLBACK_RE.test(line)) return false;
    if (gaps.some((gap) => line.includes(gap))) return false;
    return true;
  });
}

test('task-prompt.md fenced blocks and Context-pack table rows cite composed bundles, not _shared/ paths', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const offenders = sharedOffenders(governedLines(text), { gaps: GAPS });
  assert.deepStrictEqual(offenders, [], `un-exempted _shared/ citation(s):\n${offenders.join('\n')}`);
});

test('the documented gap list is not stale — each gap still occurs inside a fenced block', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const fenced = fencedBlocks(text).flat();
  for (const gap of GAPS) {
    assert.ok(
      fenced.some((line) => line.includes(gap)),
      `documented gap no longer appears in a fenced block (fix the citation or shrink GAPS): ${gap}`,
    );
  }
});

test('review/step3-lens-dispatch.md fenced blocks never cite _shared/ at all', () => {
  const text = fs.readFileSync(LENS_DISPATCH, 'utf8');
  const offenders = fencedBlocks(text).flat().filter((line) => line.includes('_shared/'));
  assert.deepStrictEqual(offenders, [], `_shared/ citation inside a dispatched fenced block:\n${offenders.join('\n')}`);
});

test('task-prompt.md composes exactly one claims bundle and one merge bundle before dispatch', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const claimsLines = text.split('\n').filter((l) => l.includes('--step claims'));
  const mergeLines = text.split('\n').filter((l) => l.includes('--step merge'));
  assert.equal(claimsLines.length, 1, `expected exactly one --step claims line, found ${claimsLines.length}`);
  assert.equal(mergeLines.length, 1, `expected exactly one --step merge line, found ${mergeLines.length}`);
  for (const line of [...claimsLines, ...mergeLines]) {
    assert.match(line, /--run "\{minted-run-dir\}"/, `compose line missing --run "{minted-run-dir}": ${line}`);
  }
  assert.ok(
    text.includes('if the compose command is unavailable or exits non-zero, read the named source files directly.'),
    'Context pack section is missing the verbatim compose-fallback sentence',
  );
});

test('the second-call template still runs whole skills via /claude-tweaks:flow, and wrap-up composes its own merge bundle', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const secondCallBlock = fencedBlocks(text)[1];
  assert.ok(secondCallBlock, 'expected a second fenced block (the second-call template)');
  const joined = secondCallBlock.join('\n');
  assert.match(joined, /\/claude-tweaks:flow/);
  assert.match(joined, /review,polish,wrap-up/);

  // eslint-disable-next-line global-require
  const { findComposeCallSites } = require('../plugin/bin/lib/skill-audit/context-cost.js');
  const mergeRows = findComposeCallSites('plugin').filter((c) => c.step === 'merge' && !c.unparsed);
  assert.ok(mergeRows.length > 0, 'expected at least one real (non-placeholder) merge compose call site');
  assert.ok(
    mergeRows.some((c) => c.file.startsWith('wrap-up/')),
    `expected a merge compose call site under wrap-up/, got: ${mergeRows.map((c) => c.file).join(', ')}`,
  );
});

test('the _shared/ citation predicate can actually go red (discrimination proof)', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  // Doctor a copy: replace the first call's fenced block content with one that cites a raw
  // _shared/ path with no fallback clause on the line.
  const doctored = text.replace(
    'Do NOT tear the worktree down yourself',
    'See `_shared/pr-first-merge.md` for the merge procedure. Do NOT tear the worktree down yourself',
  );
  assert.notEqual(doctored, text, 'doctoring did not apply — anchor text not found');
  const before = sharedOffenders(governedLines(text), { gaps: GAPS });
  const after = sharedOffenders(governedLines(doctored), { gaps: GAPS });
  assert.deepStrictEqual(before, []);
  assert.ok(after.length > before.length, 'doctored _shared/ citation (no fallback) was not caught');
});
