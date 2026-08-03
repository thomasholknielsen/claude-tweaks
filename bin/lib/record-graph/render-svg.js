// bin/lib/record-graph/render-svg.js
// Emits the baseline (no d2 binary) core SVG fragment, following
// visual-html-output.md Step 3's scoped-class + light/dark-:root shape.
// Fixed-width lane layout, not a graph-layout algorithm — mechanical, not
// freehand, per the design doc's baseline-path decision. CSS custom
// properties are generated from palette.js's ORIGIN_COLORS/BORDER_COLORS —
// the same hex values render-d2.js uses — so the two paths' palettes can
// never drift apart.
'use strict';

const {
  COLUMN_ORDER, COLUMN_LABELS, ORIGIN_COLORS, BORDER_COLORS,
} = require('./palette');

const COLUMN_X = { backlog: 20, parked: 300, ready: 580 };
const NODE_WIDTH = 240;
const NODE_HEIGHT = 90;
const GAP = 16;
const WIDTH = 900;

function paletteDeclarations() {
  const origin = Object.entries(ORIGIN_COLORS)
    .map(([key, hex]) => `  --vz-rg-origin-${key}: ${hex};`).join('\n');
  const border = Object.entries(BORDER_COLORS)
    .map(([key, hex]) => `  --vz-rg-border-${key}: ${hex};`).join('\n');
  return `${origin}\n${border}`;
}

function styleBlock() {
  return `.vz-record-graph {
${paletteDeclarations()}
  --vz-rg-column-bg: #f3f4f6;
  --vz-rg-text: #1a1d23;
}
:root[data-theme="dark"] .vz-record-graph {
  --vz-rg-column-bg: #1d2026;
  --vz-rg-text: #e7e9ed;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .vz-record-graph {
    --vz-rg-column-bg: #1d2026;
    --vz-rg-text: #e7e9ed;
  }
}`;
}

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nodePositions(columns) {
  const positions = new Map();
  let maxY = 140;
  for (const key of COLUMN_ORDER) {
    let y = 50;
    for (const record of columns[key]) {
      positions.set(record.number, { x: COLUMN_X[key], y });
      y += NODE_HEIGHT + GAP;
    }
    maxY = Math.max(maxY, y);
  }
  return { positions, maxY };
}

function renderNode(encoded, pos) {
  const lines = [encoded.title, ...encoded.badges];
  const tspans = lines
    .map((line, i) => `<tspan x="${pos.x + 8}" dy="${i === 0 ? 18 : 16}">${escapeXml(line)}</tspan>`)
    .join('');
  const fill = `var(--vz-rg-origin-${encoded.fillKey})`;
  const stroke = `var(--vz-rg-border-${encoded.borderStyle})`;
  const dash = encoded.borderStyle === 'blocked' ? ' stroke-dasharray="4 3"' : '';
  return `<g class="vz-record-graph-node">
<rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash} />
<text x="${pos.x + 8}" y="${pos.y + 18}" fill="var(--vz-rg-text)">${tspans}</text>
</g>`;
}

function renderColumns(columns, encoded, positions) {
  return COLUMN_ORDER.map((key) => {
    const label = `<text class="vz-record-graph-column-label" x="${COLUMN_X[key]}" y="30" fill="var(--vz-rg-text)">${COLUMN_LABELS[key]}</text>`;
    const nodes = columns[key].map((r) => renderNode(encoded.get(r.number), positions.get(r.number))).join('\n');
    return [label, nodes].filter(Boolean).join('\n');
  }).join('\n');
}

function renderEdges(edges, positions) {
  return edges.map(({ from, to }) => {
    const a = positions.get(from);
    const b = positions.get(to);
    const x1 = a.x + NODE_WIDTH;
    const y1 = a.y + NODE_HEIGHT / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_HEIGHT / 2;
    return `<line class="vz-record-graph-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--vz-rg-text)" />`;
  }).join('\n');
}

function renderSvg(graph, { generatedAt }) {
  const { positions, maxY } = nodePositions(graph.columns);
  const notes = [
    `Generated ${generatedAt} — re-run /claude-tweaks:visualize record-graph to refresh`,
    graph.truncated ? 'Showing the fetch cap\'s worth of records — raise backlog-fetch-limit for more' : null,
    graph.edgesOmitted ? 'Dependency edges unavailable under work-links: native' : null,
  ].filter(Boolean).join(' — ');

  return `<svg class="vz-record-graph" viewBox="0 0 ${WIDTH} ${maxY}" xmlns="http://www.w3.org/2000/svg">
<style>
${styleBlock()}
</style>
<text class="vz-record-graph-note" x="20" y="${maxY - 10}" fill="var(--vz-rg-text)">${escapeXml(notes)}</text>
${renderEdges(graph.edges, positions)}
${renderColumns(graph.columns, graph.encoded, positions)}
</svg>`;
}

module.exports = { renderSvg };
