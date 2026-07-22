import { parseFindingsTable } from './parse-findings-table.js';

export function findingsExcludeFalsePositive(resultText, { files }) {
  const rows = parseFindingsTable(resultText);
  const offenders = rows.filter((row) => files.some((f) => row.finding.toLowerCase().includes(f.toLowerCase())));
  if (offenders.length === 0) return { pass: true, message: 'no false-positive rows found' };
  return { pass: false, message: `false positives found: ${JSON.stringify(offenders)}` };
}
