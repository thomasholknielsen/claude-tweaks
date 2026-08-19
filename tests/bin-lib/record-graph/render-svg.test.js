// bin/lib/record-graph/tests/render-svg.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderSvg } = require('../../../plugin/bin/lib/record-graph/render-svg');
const { ORIGIN_COLORS, BORDER_COLORS } = require('../../../plugin/bin/lib/record-graph/palette');
const { buildGraph } = require('../../../plugin/bin/lib/record-graph/layout');
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
  assert.match(output, /<tspan[^>]*>#20 Ready record blocked by #10<\/tspan>/);
  assert.match(output, /<tspan[^>]*>R:low S:medium<\/tspan>/);
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

test('renderSvg includes the truncation note when graph.truncated is set', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text', truncated: true });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /Showing the fetch cap.s worth of records — raise backlog-fetch-limit for more/);
});

test('renderSvg omits the truncation note when graph.truncated is false', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.ok(!output.includes('Showing the fetch cap'));
});

// Node rects are the only 240-wide rects in the output (column backgrounds are
// NODE_WIDTH + 20, legend swatches are 12), so this locates them unambiguously.
function nodeRectHeight(output, x) {
  const match = output.match(new RegExp(`<rect x="${x}" y="(\\d+)" width="240" height="(\\d+)"`));
  assert.ok(match, `no node rect found at x=${x}`);
  return { y: Number(match[1]), height: Number(match[2]) };
}

test('renderSvg sizes each node from its own label line count, not one fixed height', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  // #10 (backlog, x=20) has zero badges — one label line.
  const bare = nodeRectHeight(output, 20);
  // #30 (parked, x=300) has four badges — five label lines.
  const fullyBadged = nodeRectHeight(output, 300);
  assert.ok(
    fullyBadged.height > bare.height,
    `a four-badge node (${fullyBadged.height}) should be taller than a bare one (${bare.height})`,
  );
  // Every label line must fit inside the rect: first line at +18, each further at +15.
  const lineCount = 5;
  assert.ok(18 + (lineCount - 1) * 15 <= fullyBadged.height, 'five label lines overflow the node rect');
});

test('renderSvg stacks nodes by each node\'s own height so a tall node never overlaps the next', () => {
  // Two same-column records: a fully-badged one first, then a bare one.
  const tall = { ...FIXTURE_RECORDS[2], number: 31, facets: { ...FIXTURE_RECORDS[2].facets, stage: 'backlog' } };
  const short = { ...FIXTURE_RECORDS[0], number: 32 };
  const graph = buildGraph([tall, short], { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  const rects = [...output.matchAll(/<rect x="20" y="(\d+)" width="240" height="(\d+)"/g)]
    .map((m) => ({ y: Number(m[1]), height: Number(m[2]) }));
  assert.strictEqual(rects.length, 2);
  assert.ok(
    rects[1].y >= rects[0].y + rects[0].height,
    `node 2 (y=${rects[1].y}) starts before node 1 ends (y=${rects[0].y}+${rects[0].height})`,
  );
});

test('renderSvg declares an explicit font-size on node label text', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /<text x="28" y="\d+" font-size="11" fill="var\(--vz-rg-text\)">/);
  assert.match(output, /class="vz-record-graph-column-label"[^>]*font-size="13"/);
  assert.match(output, /class="vz-record-graph-note"[^>]*font-size="10"/);
});

test('renderSvg draws a background region rect per column, bound to --vz-rg-column-bg', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  const backgrounds = output.match(/class="vz-record-graph-column-bg"/g);
  assert.strictEqual(backgrounds.length, 3);
  assert.match(output, /class="vz-record-graph-column-bg"[^>]*fill="var\(--vz-rg-column-bg\)"/);
  // Drawn before any node so it sits underneath rather than covering the nodes.
  assert.ok(output.indexOf('vz-record-graph-column-bg') < output.indexOf('vz-record-graph-node'));
});

test('renderSvg renders a legend entry for every origin fill and bot-state border in the palette', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  const legend = output.slice(output.indexOf('<g class="vz-record-graph-legend">'));
  assert.ok(legend.startsWith('<g class="vz-record-graph-legend">'), 'no legend group in the output');
  for (const key of Object.keys(ORIGIN_COLORS)) {
    assert.ok(legend.includes(`fill="var(--vz-rg-origin-${key})"`), `legend is missing the ${key} swatch`);
    assert.ok(legend.includes(`>${key}</text>`), `legend is missing the ${key} label`);
  }
  for (const key of Object.keys(BORDER_COLORS)) {
    assert.ok(legend.includes(`stroke="var(--vz-rg-border-${key})"`), `legend is missing the ${key} border swatch`);
    assert.ok(legend.includes(`>${key}</text>`), `legend is missing the ${key} label`);
  }
});

test('renderSvg legend and note stay inside the viewBox height', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  const viewBoxHeight = Number(output.match(/viewBox="0 0 900 (\d+)"/)[1]);
  const noteY = Number(output.match(/class="vz-record-graph-note" x="20" y="(\d+)"/)[1]);
  assert.ok(noteY < viewBoxHeight, `note (y=${noteY}) falls outside the viewBox (${viewBoxHeight})`);
  const legendYs = [...output.matchAll(/<g class="vz-record-graph-legend">([\s\S]*?)<\/g>/g)][0][1]
    .matchAll(/y="(\d+)"/g);
  for (const [, y] of legendYs) assert.ok(Number(y) < viewBoxHeight);
});

test('renderSvg renders columns, legend and note for an empty record set', () => {
  const graph = buildGraph([], { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.strictEqual(output.match(/class="vz-record-graph-column-bg"/g).length, 3);
  assert.ok(!output.includes('vz-record-graph-node'));
  assert.match(output, /class="vz-record-graph-legend"/);
  assert.match(output, /Generated 2026-08-03T12:00:00\.000Z/);
});
