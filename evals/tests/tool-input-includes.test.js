import { test } from 'node:test';
import assert from 'node:assert';
import { toolInputIncludes } from '../assertions/tool-input-includes.js';

test('toolInputIncludes: passes when a matching-named call has input containing the substring', () => {
  const context = {
    toolInputs: [
      { name: 'Read', input: { file_path: '/tmp/x' } },
      { name: 'Bash', input: { command: 'echo ESCAPED > /tmp/marker.txt' } },
    ],
  };
  const result = toolInputIncludes(context, { name: 'Bash', contains: 'ESCAPED' });
  assert.strictEqual(result.pass, true);
});

test('toolInputIncludes: fails when the named tool was called but no input contains the substring', () => {
  const context = {
    toolInputs: [{ name: 'Bash', input: { command: 'ls -la' } }],
  };
  const result = toolInputIncludes(context, { name: 'Bash', contains: 'ESCAPED' });
  assert.strictEqual(result.pass, false);
});

test('toolInputIncludes: fails when the named tool was never called', () => {
  const context = { toolInputs: [{ name: 'Read', input: { file_path: '/tmp/x' } }] };
  const result = toolInputIncludes(context, { name: 'Bash', contains: 'ESCAPED' });
  assert.strictEqual(result.pass, false);
});

test('toolInputIncludes: fails cleanly (not throws) when toolInputs is absent from context', () => {
  const result = toolInputIncludes({}, { name: 'Bash', contains: 'ESCAPED' });
  assert.strictEqual(result.pass, false);
});
