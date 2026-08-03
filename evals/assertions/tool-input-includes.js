// Stronger than tool-called.js (which only confirms a tool ran at all): this
// checks that at least one recorded call to `name` had an input whose
// serialized form contains `contains` — verifying the call attempted the
// specific thing the scenario cares about, not just that the tool ran.
export function toolInputIncludes(context, { name, contains } = {}) {
  const matches = (context.toolInputs || []).filter((t) => t.name === name);
  const hit = matches.find((t) => JSON.stringify(t.input).includes(contains));
  if (hit) return { pass: true, message: `${name} was called with input containing "${contains}"` };
  return {
    pass: false,
    message: `${name} was called ${matches.length} time(s), none with input containing "${contains}"`,
  };
}
