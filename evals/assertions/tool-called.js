export function toolCalled(toolCalls, { name, atLeast = 1 }) {
  const count = (toolCalls || []).filter((t) => t === name).length;
  if (count >= atLeast) return { pass: true, message: `${name} called ${count} times` };
  return { pass: false, message: `${name} called ${count} times, expected at least ${atLeast}` };
}
