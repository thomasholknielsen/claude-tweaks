// bin/lib/record-graph/render-d2.js
// Emits .d2 source text for the enhanced /visualize path. D2's own theme
// system doesn't bind live CSS variables (d2-enhanced-path.md Step 3), so
// this uses palette.js's fixed literal-hex palette; the existing generic
// re-theming step maps each distinct hex to the nearest project token after
// the d2 binary renders this to SVG. This function never shells out to d2.
'use strict';

const {
  COLUMN_ORDER, COLUMN_LABELS, ORIGIN_COLORS, BORDER_COLORS,
} = require('./palette');

function d2Escape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeId(number) {
  return `n${number}`;
}

function renderNode(encoded) {
  const label = [encoded.title, ...encoded.badges].map(d2Escape).join('\\n');
  const fill = ORIGIN_COLORS[encoded.fillKey] || ORIGIN_COLORS.human;
  const stroke = BORDER_COLORS[encoded.borderStyle] || BORDER_COLORS.default;
  const lines = [
    `  ${nodeId(encoded.number)}: "${label}" {`,
    `    style.fill: "${fill}"`,
    `    style.stroke: "${stroke}"`,
  ];
  if (encoded.borderStyle === 'blocked') lines.push('    style.stroke-dash: 3');
  lines.push('  }');
  return lines.join('\n');
}

function renderColumn(key, records, encoded) {
  const nodes = records.map((r) => renderNode(encoded.get(r.number))).join('\n');
  return [`${key}: "${COLUMN_LABELS[key]}" {`, nodes, '}'].filter(Boolean).join('\n');
}

function numberToColumnMap(columns) {
  const map = new Map();
  for (const key of COLUMN_ORDER) {
    for (const record of columns[key]) map.set(record.number, key);
  }
  return map;
}

function renderEdges(edges, columns) {
  const numberToColumn = numberToColumnMap(columns);
  return edges
    .map(({ from, to }) => `${numberToColumn.get(from)}.${nodeId(from)} -> ${numberToColumn.get(to)}.${nodeId(to)}`)
    .join('\n');
}

function legendId(prefix, key) {
  return `${prefix}_${String(key).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// Legend for the two color-channel axes only (Origin fill, Bot-state border) — the
// remaining four axes render as self-describing text badges on the nodes themselves.
// Entries are generated from palette.js's own objects, so a palette change can never
// leave the legend behind.
function renderLegend() {
  const origins = Object.entries(ORIGIN_COLORS).map(([key, hex]) => [
    `  ${legendId('origin', key)}: "${d2Escape(key)}" {`,
    `    style.fill: "${hex}"`,
    '  }',
  ].join('\n'));
  const botStates = Object.entries(BORDER_COLORS).map(([key, hex]) => {
    const lines = [
      `  ${legendId('bot', key)}: "${d2Escape(key)}" {`,
      `    style.stroke: "${hex}"`,
    ];
    if (key === 'blocked') lines.push('    style.stroke-dash: 3');
    lines.push('  }');
    return lines.join('\n');
  });
  return [
    'legend: "Legend — fill: Origin, border: Bot state" {',
    ...origins,
    ...botStates,
    '}',
  ].join('\n');
}

function renderD2(graph, { generatedAt }) {
  const header = [
    `# Generated ${generatedAt} — re-run /claude-tweaks:visualize record-graph to refresh`,
    graph.truncated ? '# Showing the fetch cap\'s worth of records — raise backlog-fetch-limit for more' : null,
    graph.edgesOmitted ? '# Dependency edges unavailable under work-links: native — requires a second query, out of scope' : null,
  ].filter(Boolean).join('\n');

  const columns = COLUMN_ORDER.map((key) => renderColumn(key, graph.columns[key], graph.encoded)).join('\n\n');
  const edges = renderEdges(graph.edges, graph.columns);

  return `${[header, columns, edges, renderLegend()].filter(Boolean).join('\n\n')}\n`;
}

module.exports = { renderD2 };
