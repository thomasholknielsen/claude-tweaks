'use strict';
// tests/step3-routing-prose-exempt-conformance.test.js — pins that
// skills/review/step3-routing.md (#660) documents the
// review-auto-apply-prose-exempt bump: resolution, the exempt glob set, the
// one-tier-capped-at-medium bump rule, the all-paths-must-be-exempt
// requirement, and the distinguishing decision-log format.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'review', 'step3-routing.md');
const md = fs.readFileSync(MD_PATH, 'utf8');

test('resolves review-auto-apply-prose-exempt alongside review-auto-apply-ceiling', () => {
  assert.ok(md.includes('review-auto-apply-prose-exempt'), 'step3-routing.md must resolve review-auto-apply-prose-exempt');
});

test('names the exact exempt glob set', () => {
  for (const glob of ['skills/**/*.md', 'docs/**/*.md', 'tests/**']) {
    assert.ok(md.includes(glob), `step3-routing.md must name the exempt glob "${glob}"`);
  }
});

test('states the bump is one tier above the resolved ceiling, capped at medium', () => {
  assert.ok(/one severity tier above/.test(md), 'must state the bump direction (one tier above)');
  assert.ok(/capped/.test(md), 'must state the bump is capped');
  assert.ok(md.includes('never reaches `high`') || md.includes('never reach `high`') || md.includes("never reaches \`high\`"),
    'must state the bump never reaches high/critical');
});

test('a fix spanning an exempt and a non-exempt path gets no bump', () => {
  assert.ok(/not eligible for the bump|no bump|not.*eligible/i.test(md), 'must state a mixed-path fix does not receive the bump');
});

test('resolves off restores plain-ceiling behavior with no bump', () => {
  assert.ok(md.includes('resolves `off`'), 'must explicitly state the off case');
  assert.ok(/plain,? unbumped `review-auto-apply-ceiling`|routes on the plain ceiling/.test(md),
    'must state that off routes on the plain, unbumped ceiling');
});

test('the bumped AUTO log entry names the bump, distinguishing it from a plain ceiling-driven entry', () => {
  assert.ok(md.includes('prose-exempt bump applied'), 'must document the exact "prose-exempt bump applied" log suffix');
  assert.ok(md.includes('[lever: review-auto-apply-ceiling=low (default); prose-exempt bump applied]'),
    'must document the full bracketed log format from the spec');
});

test('Ledger-first citation and staged/review-{n}.patch pattern are still present (unmodified by #660)', () => {
  assert.ok(md.includes('staged/review-{n}.patch'), 'staged patch path pattern must survive the edit');
  assert.ok(/Ledger:/.test(md), 'Ledger: field citation must survive the edit');
});
