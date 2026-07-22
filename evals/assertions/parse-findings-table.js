// Shared by findings-include.js and findings-exclude-false-positive.js.
// Parses the real "### Code Review Findings (confirmed)" table shape from
// skills/review/review-summary-template.md:
//   | Category | Finding | Severity | Action |
// There is no file/line column — a file/line reference, when present, is
// embedded as text inside the Finding cell.
const TABLE_HEADING = '### Code Review Findings (confirmed)';

export function parseFindingsTable(resultText) {
  const headingIdx = (resultText || '').indexOf(TABLE_HEADING);
  if (headingIdx === -1) return [];
  const lines = resultText.slice(headingIdx + TABLE_HEADING.length).split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|-+\|/.test(trimmed)) { inTable = true; continue; }
    if (inTable) {
      if (!trimmed.startsWith('|')) break;
      const cells = trimmed.split('|').map((c) => c.trim()).filter((c) => c !== '');
      if (cells.length < 4) continue;
      const [category, finding, severity, action] = cells;
      rows.push({ category, finding, severity, action });
    }
  }
  return rows;
}
