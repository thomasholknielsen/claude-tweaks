'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildWorkOrders, JUDGMENT_LENS_MAP, OUTPUT_FORMAT } = require('../judgment');

// Build a temp criteria dir with sentinel text per lens so we can assert the
// prompt embeds the right fragment.
function makeCriteriaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-criteria-'));
  fs.writeFileSync(path.join(dir, 'criteria-architecture-depth.md'), 'ARCH_CRITERIA_SENTINEL deep module rubric', 'utf8');
  fs.writeFileSync(path.join(dir, 'criteria-simplification.md'), 'SIMP_CRITERIA_SENTINEL dead code rubric', 'utf8');
  fs.writeFileSync(path.join(dir, 'criteria-review-quality.md'), 'REVIEW_CRITERIA_SENTINEL correctness rubric', 'utf8');
  return dir;
}

test('JUDGMENT_LENS_MAP maps the three lenses to their criteria filenames', () => {
  assert.strictEqual(JUDGMENT_LENS_MAP['architecture-depth'], 'criteria-architecture-depth.md');
  assert.strictEqual(JUDGMENT_LENS_MAP['simplification'], 'criteria-simplification.md');
  assert.strictEqual(JUDGMENT_LENS_MAP['review-quality'], 'criteria-review-quality.md');
});

test('buildWorkOrders: one order per (area, lens) pair', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a', 'src/b'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 6);
  for (const o of orders) {
    assert.ok(o.lensId, 'has lensId');
    assert.ok(o.area, 'has area');
    assert.ok(o.modelTier === 'haiku' || o.modelTier === 'sonnet', `tier was ${o.modelTier}`);
    assert.strictEqual(typeof o.prompt, 'string');
  }
});

test('buildWorkOrders: caps at maxSubagents (truncates the list)', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a', 'src/b', 'src/c'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 4,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 4);
});

test('buildWorkOrders: prompt embeds the matching criteria text verbatim', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  const byLens = Object.fromEntries(orders.map((o) => [o.lensId, o]));
  assert.ok(byLens['architecture-depth'].prompt.includes('ARCH_CRITERIA_SENTINEL'));
  assert.ok(byLens['simplification'].prompt.includes('SIMP_CRITERIA_SENTINEL'));
  assert.ok(byLens['review-quality'].prompt.includes('REVIEW_CRITERIA_SENTINEL'));
  // A lens must NOT leak another lens's criteria.
  assert.ok(!byLens['simplification'].prompt.includes('ARCH_CRITERIA_SENTINEL'));
});

test('buildWorkOrders: prompt embeds the contract status line and the Finding JSON shape', () => {
  const dir = makeCriteriaDir();
  const [order] = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  // Subagent-output-contract status line.
  assert.ok(order.prompt.includes('DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED'));
  // The required output JSON shape (a sample of Finding fields).
  assert.ok(order.prompt.includes('"severity"'));
  assert.ok(order.prompt.includes('"confidence"'));
  assert.ok(order.prompt.includes('"signature"'));
  assert.ok(order.prompt.includes('"acceptance"'));
  // The area is interpolated.
  assert.ok(order.prompt.includes('src/a'));
});

test('buildWorkOrders: unknown lens id is skipped, not crashed', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth', 'made-up-lens'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].lensId, 'architecture-depth');
});

test('OUTPUT_FORMAT names the lens enum values', () => {
  assert.ok(OUTPUT_FORMAT.includes('critical'));
  assert.ok(OUTPUT_FORMAT.includes('Architecture'));
});
