// bin/lib/model-profiles/tests/resolve.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { resolve } = require('../profiles');

test('table default resolves with source default', () => {
  assert.deepStrictEqual(resolve('standard', {}), {
    model: 'sonnet', effort: 'high', source: 'default',
    effortLine: '[Effort: high — apply high-level reasoning depth to this task.]',
  });
});

test('policy row overrides the table; partial rows merge field-wise', () => {
  const policy = { 'model-profiles': { standard: { model: 'opus', effort: 'low' } } };
  const r = resolve('standard', { policy });
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.effort, 'low');
  assert.strictEqual(r.source, 'policy');
  const partial = resolve('standard', { policy: { 'model-profiles': { standard: { effort: 'low' } } } });
  assert.strictEqual(partial.model, 'sonnet'); // default model kept
  assert.strictEqual(partial.effort, 'low');
});

test('cliOverride beats policy', () => {
  const policy = { 'model-profiles': { standard: { model: 'opus' } } };
  const r = resolve('standard', { policy, cliOverride: { model: 'haiku' } });
  assert.strictEqual(r.model, 'haiku');
  assert.strictEqual(r.source, 'cli');
});

test('economy stance drops effort one notch; max-rigor raises capped at max; fast is stance-invariant', () => {
  assert.strictEqual(resolve('standard', { stance: 'economy' }).effort, 'medium');
  assert.strictEqual(resolve('standard', { stance: 'max-rigor' }).effort, 'xhigh');
  assert.strictEqual(resolve('standard', {
    policy: { 'model-profiles': { standard: { effort: 'max' } } }, stance: 'max-rigor',
  }).effort, 'max'); // clamped
  assert.deepStrictEqual(resolve('fast', { stance: 'economy' }),
    resolve('fast', {}));
});

test('stance comes from policy model-stance when opts.stance is absent, and opts.stance wins', () => {
  const policy = { 'model-stance': 'economy' };
  assert.strictEqual(resolve('standard', { policy }).effort, 'medium');
  assert.strictEqual(resolve('standard', { policy, stance: 'default' }).effort, 'high');
});

test('economy resolves frontier as capable with degraded:stance', () => {
  const r = resolve('frontier', { stance: 'economy' });
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.source, 'degraded:stance');
});

test('model-ceiling clamps non-cli resolutions and never a cliOverride', () => {
  const policy = { 'model-ceiling': 'standard' };
  const clamped = resolve('capable', { policy });
  assert.strictEqual(clamped.model, 'sonnet');
  assert.strictEqual(clamped.source, 'ceiling');
  const cli = resolve('capable', { policy, cliOverride: { model: 'opus' } });
  assert.strictEqual(cli.model, 'opus');
  assert.strictEqual(cli.source, 'cli');
});

test('frontier gates: unattended and cap degrade to capable with named sources', () => {
  const un = resolve('frontier', { unattended: true });
  assert.strictEqual(un.model, 'opus');
  assert.strictEqual(un.source, 'degraded:unattended');
  const cap = resolve('frontier', { frontierUsed: 3 });
  assert.strictEqual(cap.source, 'degraded:cap');
  const under = resolve('frontier', { frontierUsed: 2 });
  assert.strictEqual(under.model, 'fable');
  const raised = resolve('frontier', { frontierUsed: 3, policy: { 'frontier-run-cap': 5 } });
  assert.strictEqual(raised.model, 'fable');
  const disabled = resolve('frontier', { frontierUsed: 0, policy: { 'frontier-run-cap': 0 } });
  assert.strictEqual(disabled.source, 'degraded:cap');
});

test('stance never promotes a model upward', () => {
  assert.strictEqual(resolve('capable', { stance: 'max-rigor' }).model, 'opus');
});

// Beyond the plan's ten: the ten leave the stage-3 -> stage-4 ordering unpinned.
// A build with stance applied before cliOverride passes all ten, yet lets a
// cli-requested frontier survive economy stance — the guard's whole purpose.
test('stance applies after cliOverride, not before', () => {
  const cliFrontier = resolve('standard', { cliOverride: { model: 'fable' }, stance: 'economy' });
  assert.strictEqual(cliFrontier.model, 'opus');
  assert.strictEqual(cliFrontier.source, 'degraded:stance');
  const cliEffort = resolve('standard', { cliOverride: { effort: 'high' }, stance: 'max-rigor' });
  assert.strictEqual(cliEffort.effort, 'xhigh');
  assert.strictEqual(cliEffort.source, 'stance');
});

test('unknown profile and unknown stance throw with the name in the message', () => {
  assert.throws(() => resolve('turbo', {}), /turbo/);
  assert.throws(() => resolve('standard', { stance: 'frugal' }), /frugal/);
});
