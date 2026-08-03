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
const GAP = 16;
const WIDTH = 900;

// Text metrics. A node's label is one title line plus one line per applicable badge
// (up to six lines for a fully-badged record), so node height is computed per node
// from its own line count rather than from one fixed constant — a fixed height
// overflows the rect as soon as a record carries more than a couple of badges.
const TEXT_SIZE = 11;
const COLUMN_LABEL_SIZE = 13;
const SMALL_TEXT_SIZE = 10;
const TEXT_FIRST_DY = 18;
const TEXT_LINE_DY = 15;
const NODE_PAD_BOTTOM = 10;
const NODE_MIN_HEIGHT = 40;

const COLUMN_LABEL_Y = 30;
const COLUMN_BG_TOP = 40;
const COLUMN_BG_PAD_X = 10;
const COLUMN_BG_PAD_BOTTOM = 10;
const COLUMN_TOP = 50;
const EMPTY_COLUMN_HEIGHT = 60;

const LEGEND_GAP = 28;
const LEGEND_HEIGHT = 66;
const LEGEND_SWATCH = 12;
const LEGEND_ORIGIN_STEP = 125;
const LEGEND_BOT_STEP = 160;
const NOTE_GAP = 22;

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

function nodeHeight(encoded) {
  const lineCount = 1 + encoded.badges.length;
  const needed = TEXT_FIRST_DY + (lineCount - 1) * TEXT_LINE_DY + NODE_PAD_BOTTOM;
  return Math.max(NODE_MIN_HEIGHT, needed);
}

// Returns each node's own {x, y, height} plus per-column background bounds. The
// y-cursor advances by each node's own computed height, never a shared constant, so
// a tall (many-badge) node can't overlap the one stacked below it.
function nodePositions(columns, encoded) {
  const positions = new Map();
  const columnBounds = {};
  let contentBottom = COLUMN_TOP + EMPTY_COLUMN_HEIGHT;
  for (const key of COLUMN_ORDER) {
    let y = COLUMN_TOP;
    for (const record of columns[key]) {
      const height = nodeHeight(encoded.get(record.number));
      positions.set(record.number, { x: COLUMN_X[key], y, height });
      y += height + GAP;
    }
    const bottom = Math.max(y - GAP, COLUMN_TOP + EMPTY_COLUMN_HEIGHT) + COLUMN_BG_PAD_BOTTOM;
    columnBounds[key] = { top: COLUMN_BG_TOP, bottom };
    contentBottom = Math.max(contentBottom, bottom);
  }
  return { positions, columnBounds, contentBottom };
}

// Drawn before the nodes so each column reads as a distinguishable region behind
// them. This is the only consumer of --vz-rg-column-bg.
function renderColumnBackgrounds(columnBounds) {
  return COLUMN_ORDER.map((key) => {
    const { top, bottom } = columnBounds[key];
    return `<rect class="vz-record-graph-column-bg" x="${COLUMN_X[key] - COLUMN_BG_PAD_X}" y="${top}" width="${NODE_WIDTH + COLUMN_BG_PAD_X * 2}" height="${bottom - top}" rx="8" fill="var(--vz-rg-column-bg)" />`;
  }).join('\n');
}

function renderNode(encoded, pos) {
  const lines = [encoded.title, ...encoded.badges];
  const tspans = lines
    .map((line, i) => `<tspan x="${pos.x + 8}" dy="${i === 0 ? TEXT_FIRST_DY : TEXT_LINE_DY}">${escapeXml(line)}</tspan>`)
    .join('');
  const fill = `var(--vz-rg-origin-${encoded.fillKey})`;
  const stroke = `var(--vz-rg-border-${encoded.borderStyle})`;
  const dash = encoded.borderStyle === 'blocked' ? ' stroke-dasharray="4 3"' : '';
  // The <text> anchor sits at the rect's own top edge; the first tspan's own dy
  // supplies the inset. Applying the inset to both would push the label out the bottom.
  return `<g class="vz-record-graph-node">
<rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${pos.height}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash} />
<text x="${pos.x + 8}" y="${pos.y}" font-size="${TEXT_SIZE}" fill="var(--vz-rg-text)">${tspans}</text>
</g>`;
}

function renderColumns(columns, encoded, positions) {
  return COLUMN_ORDER.map((key) => {
    const label = `<text class="vz-record-graph-column-label" x="${COLUMN_X[key]}" y="${COLUMN_LABEL_Y}" font-size="${COLUMN_LABEL_SIZE}" font-weight="600" fill="var(--vz-rg-text)">${COLUMN_LABELS[key]}</text>`;
    const nodes = columns[key].map((r) => renderNode(encoded.get(r.number), positions.get(r.number))).join('\n');
    return [label, nodes].filter(Boolean).join('\n');
  }).join('\n');
}

function renderEdges(edges, positions) {
  return edges.map(({ from, to }) => {
    const a = positions.get(from);
    const b = positions.get(to);
    const x1 = a.x + NODE_WIDTH;
    const y1 = a.y + a.height / 2;
    const x2 = b.x;
    const y2 = b.y + b.height / 2;
    return `<line class="vz-record-graph-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--vz-rg-text)" />`;
  }).join('\n');
}

// Legend for the two color-channel axes only (Origin fill, Bot-state border) — the
// remaining four axes render as self-describing text badges on the nodes themselves.
// Entries are generated from palette.js's own objects, so a palette change can never
// leave the legend behind.
function renderLegend(top) {
  const heading = `<text class="vz-record-graph-legend-heading" x="20" y="${top + 12}" font-size="${TEXT_SIZE}" font-weight="600" fill="var(--vz-rg-text)">Legend — fill: Origin, border: Bot state</text>`;
  const originRowY = top + 22;
  const origins = Object.keys(ORIGIN_COLORS).map((key, i) => {
    const x = 20 + i * LEGEND_ORIGIN_STEP;
    return `<rect x="${x}" y="${originRowY}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" rx="2" fill="var(--vz-rg-origin-${key})" />`
      + `<text x="${x + LEGEND_SWATCH + 6}" y="${originRowY + 10}" font-size="${SMALL_TEXT_SIZE}" fill="var(--vz-rg-text)">${escapeXml(key)}</text>`;
  });
  const botRowY = top + 46;
  const botStates = Object.keys(BORDER_COLORS).map((key, i) => {
    const x = 20 + i * LEGEND_BOT_STEP;
    const dash = key === 'blocked' ? ' stroke-dasharray="4 3"' : '';
    return `<rect x="${x}" y="${botRowY}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" rx="2" fill="none" stroke="var(--vz-rg-border-${key})" stroke-width="2"${dash} />`
      + `<text x="${x + LEGEND_SWATCH + 6}" y="${botRowY + 10}" font-size="${SMALL_TEXT_SIZE}" fill="var(--vz-rg-text)">${escapeXml(key)}</text>`;
  });
  return `<g class="vz-record-graph-legend">
${[heading, ...origins, ...botStates].join('\n')}
</g>`;
}

function renderSvg(graph, { generatedAt }) {
  const { positions, columnBounds, contentBottom } = nodePositions(graph.columns, graph.encoded);
  const legendTop = contentBottom + LEGEND_GAP;
  const noteY = legendTop + LEGEND_HEIGHT + NOTE_GAP;
  const height = noteY + 12;
  const notes = [
    `Generated ${generatedAt} — re-run /claude-tweaks:visualize record-graph to refresh`,
    graph.truncated ? 'Showing the fetch cap\'s worth of records — raise backlog-fetch-limit for more' : null,
    graph.edgesOmitted ? 'Dependency edges unavailable under work-links: native' : null,
  ].filter(Boolean).join(' — ');

  return `<svg class="vz-record-graph" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
<style>
${styleBlock()}
</style>
${renderColumnBackgrounds(columnBounds)}
${renderEdges(graph.edges, positions)}
${renderColumns(graph.columns, graph.encoded, positions)}
${renderLegend(legendTop)}
<text class="vz-record-graph-note" x="20" y="${noteY}" font-size="${SMALL_TEXT_SIZE}" fill="var(--vz-rg-text)">${escapeXml(notes)}</text>
</svg>`;
}

module.exports = { renderSvg };
