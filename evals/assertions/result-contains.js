// Case-insensitive substring check over the run's accumulated assistant text
// (`resultText`). Unlike findings-include, this does not require a parseable
// markdown table with a Severity column — deepen's candidate table (and other
// skills' free-form report shapes) carry no Severity, so a generic needle
// check is the right level of coupling to a report the live skill composes as
// prose. `contains` is a string or array of strings; every needle must
// appear. Optional `within` first narrows the haystack to only the lines
// matching that (case-insensitive) substring — use it to pin two values to
// the same line (e.g. a module name and its classification in one table row)
// rather than anywhere in the transcript.
export function resultContains(resultText, { contains, within }) {
  const needles = (Array.isArray(contains) ? contains : [contains]).map((s) => String(s).toLowerCase());
  let haystack = (resultText || '').toLowerCase();
  if (within) {
    const w = String(within).toLowerCase();
    haystack = haystack
      .split('\n')
      .filter((l) => l.includes(w))
      .join('\n');
  }
  const missing = needles.filter((n) => !haystack.includes(n));
  const scope = within ? ` within lines matching "${within}"` : '';
  if (missing.length === 0) {
    return { pass: true, message: `resultText contains [${needles.join(', ')}]${scope}` };
  }
  return { pass: false, message: `resultText missing [${missing.join(', ')}]${scope}` };
}
