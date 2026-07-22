export function toolCount(toolCalls, { max, min } = {}) {
  const n = (toolCalls || []).length;
  if (max !== undefined && n > max) return { pass: false, message: `tool count ${n} exceeds max ${max}` };
  if (min !== undefined && n < min) return { pass: false, message: `tool count ${n} below min ${min}` };
  return { pass: true, message: `tool count ${n} within bounds` };
}
