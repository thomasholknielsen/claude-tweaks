// Inverse of tool-input-includes.js: proves a specific invocation NEVER
// happened, rather than that one did. Deliberately NOT filtered by tool
// name (unlike tool-input-includes) — a future regression could add the
// named call under any tool the harness records a skill invocation as (a
// Bash command, a Skill-tool call, a Task-tool call), so this scans every
// recorded tool input regardless of which tool carried it.
export function toolInputExcludes(context, { contains, name } = {}) {
  const pool = name
    ? (context.toolInputs || []).filter((t) => t.name === name)
    : (context.toolInputs || []);
  const hit = pool.find((t) => JSON.stringify(t.input).includes(contains));
  if (hit) {
    return { pass: false, message: `found a tool call (${hit.name}) with input containing "${contains}"` };
  }
  return { pass: true, message: `no tool call's input contained "${contains}"` };
}
