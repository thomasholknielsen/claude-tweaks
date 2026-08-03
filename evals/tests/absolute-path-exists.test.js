import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { absolutePathExists } from '../assertions/absolute-path-exists.js';

test('absolutePathExists: throws when the target field is absent from context (fails closed, not open)', () => {
  assert.throws(() => absolutePathExists({}, { target: 'escapeTargetPath', shouldExist: false }));
});

test('absolutePathExists: fails when shouldExist:false but the file actually exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-abs-test-'));
  const filePath = path.join(tmp, 'marker.txt');
  fs.writeFileSync(filePath, 'x');
  const result = absolutePathExists({ escapeTargetPath: filePath }, { target: 'escapeTargetPath', shouldExist: false });
  assert.strictEqual(result.pass, false);
});

test('absolutePathExists: passes when shouldExist:true and the file exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-abs-test-'));
  const filePath = path.join(tmp, 'marker.txt');
  fs.writeFileSync(filePath, 'x');
  const result = absolutePathExists({ escapeTargetPath: filePath }, { target: 'escapeTargetPath', shouldExist: true });
  assert.strictEqual(result.pass, true);
});

test('absolutePathExists: fails when shouldExist:true but the file does not exist', () => {
  const result = absolutePathExists({ escapeTargetPath: '/nonexistent/ct-eval-marker.txt' }, { target: 'escapeTargetPath', shouldExist: true });
  assert.strictEqual(result.pass, false);
});
