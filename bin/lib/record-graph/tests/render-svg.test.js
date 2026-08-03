// bin/lib/record-graph/tests/render-svg.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderSvg } = require('../render-svg');
const { buildGraph } = require('../layout');
const { FIXTURE_RECORDS } = require('./fixtures');

const GENERATED_AT = '2026-08-03T12:00:00.000Z';

test('renderSvg emits a scoped root svg with the vz-record-graph class', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /<svg class="vz-record-graph"/);
});

test('renderSvg defines scoped light+dark custom properties for every origin and border state', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /--vz-rg-origin-code-health:/);
  assert.match(output, /--vz-rg-origin-human:/);
  assert.match(output, /--vz-rg-border-blocked:/);
  assert.match(output, /:root\[data-theme="dark"\] \.vz-record-graph \{/);
  assert.match(output, /@media \(prefers-color-scheme: dark\)/);
});

test('renderSvg draws one rect+text group per record, using var()-bound fill/stroke keyed by fillKey/borderStyle', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /fill="var\(--vz-rg-origin-code-health\)"/);
  assert.match(output, /stroke="var\(--vz-rg-border-blocked\)"/);
  assert.match(output, /stroke-dasharray="4 3"/);
  assert.match(output, /<tspan[^>]*>Ready record blocked by #10<\/tspan>/);
  assert.match(output, /<tspan[^>]*>R:low E:medium<\/tspan>/);
});

test('renderSvg draws one line per edge between the two node rects', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /<line class="vz-record-graph-edge"/);
});

test('renderSvg draws no edge lines and includes the omitted note under work-links: native', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'native' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.ok(!output.includes('vz-record-graph-edge'));
  assert.match(output, /Dependency edges unavailable under work-links: native/);
});

test('renderSvg XML-escapes a title containing angle brackets and ampersands', () => {
  const record = { ...FIXTURE_RECORDS[0], title: 'A <weird> & tricky title' };
  const graph = buildGraph([record], { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /A &lt;weird&gt; &amp; tricky title/);
  assert.ok(!output.includes('A <weird>'));
});

test('renderSvg includes the generated-at + refresh-hint note text', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /Generated 2026-08-03T12:00:00\.000Z/);
  assert.match(output, /re-run \/claude-tweaks:visualize record-graph to refresh/);
});
