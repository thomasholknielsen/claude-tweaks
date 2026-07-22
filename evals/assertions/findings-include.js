import { parseFindingsTable } from './parse-findings-table.js';

export function findingsInclude(resultText, { severity, contains }) {
  const needles = (Array.isArray(contains) ? contains : [contains]).map((s) => s.toLowerCase());
  const rows = parseFindingsTable(resultText);
  const matched = rows.find((row) => {
    if (severity && row.severity.toLowerCase() !== severity.toLowerCase()) return false;
    const haystack = row.finding.toLowerCase();
    return needles.every((n) => haystack.includes(n));
  });
  if (matched) return { pass: true, message: `found matching row: ${JSON.stringify(matched)}` };
  return { pass: false, message: `no row with severity=${severity} containing [${needles.join(', ')}] in: ${JSON.stringify(rows)}` };
}
