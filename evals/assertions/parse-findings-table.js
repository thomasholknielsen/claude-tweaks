// Shared by findings-include.js and findings-exclude-false-positive.js.
//
// Parses ANY markdown table in resultText whose header row includes a
// "Severity" column — the one signal that's stayed stable across every
// live /claude-tweaks:review output shape observed so far, despite
// significant drift elsewhere. Three real runs produced three different
// heading/column shapes: `### Code Review Findings (confirmed)` with
// `Category | Finding | Severity | Action` (4 columns); a later run's
// `## Step 3 — Code Review Findings` with `# | Finding | Severity |
// Category | Location | Recommended` (6 columns); another's `### Code
// Review Findings` (no "(confirmed)" suffix) with `# | File:Line |
// Severity | Category | Issue | Resolution` (6 columns, different names
// and order again). The live skill composes this summary as free-form
// markdown for a bare invocation, not a byte-stable template — anchoring
// on heading text or a fixed column position broke three scenario
// recalibrations in a row. Anchoring on the "Severity" header instead of
// position means `finding` can be the concatenation of every OTHER column,
// so a `contains` check matches regardless of which column carries the
// matching text on a given run.
//
// Known, accepted limitation: this also parses any other table that
// happens to have a Severity column (e.g. a Design Quality findings
// table) — not observed to produce a false result in practice, since the
// content these assertions check (a specific vulnerability class, or a
// clean file's name) is specific enough that cross-table collision is a
// low-probability edge case, not worth scoping further right now.

// Known, accepted limitation: the leading/trailing empty cells produced by a
// well-formed `| a | b |`-style row are intentionally filtered out here, but
// so is any GENUINELY empty cell mid-row (e.g. `| a | | c |`) — this would
// silently shift every cell after it left by one index, including against
// severityIdx below. Not observed in practice across any real captured
// output; would need a positional (not content) filter to handle correctly.
function splitRow(line) {
  return line
    .trim()
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c !== '');
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// Strips markdown emphasis/code markers (**bold**, _italic_, `code`) that
// the model sometimes wraps a severity cell in (e.g. "**Critical**") —
// without this, an exact severity match would silently fail.
function cleanSeverity(cell) {
  return cell.replace(/[*_`]/g, '').trim();
}

export function parseFindingsTable(resultText) {
  const lines = (resultText || '').split('\n');
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) {
      i++;
      continue;
    }
    const header = splitRow(lines[i]);
    const separatorLine = lines[i + 1];
    if (!separatorLine || !separatorLine.trim().startsWith('|') || !isSeparatorRow(splitRow(separatorLine))) {
      i++;
      continue;
    }
    const severityIdx = header.findIndex((h) => h.toLowerCase() === 'severity');
    i += 2;
    if (severityIdx === -1) continue;
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      const cells = splitRow(lines[i]);
      if (cells.length > severityIdx) {
        const severity = cleanSeverity(cells[severityIdx]);
        const finding = cells.filter((_, idx) => idx !== severityIdx).join(' ');
        rows.push({ severity, finding });
      }
      i++;
    }
  }
  return rows;
}
