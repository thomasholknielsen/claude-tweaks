'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyArea } = require('../area-type');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-at-')); }

test('unknown dir with no signals returns empty types', () => {
  const d = tmp();
  assert.deepStrictEqual(classifyArea(d, d), { types: [] });
});

test('detects frontend from react in package.json dependencies', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects frontend from .tsx files at top level', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'App.tsx'), '');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects frontend from components/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'components'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects backend from express in deps (no UI dep)', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { express: '^4.18.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('backend'), `types: ${types}`);
  assert.ok(!types.includes('frontend'), `should not be frontend: ${types}`);
});

test('detects library from exports key in package.json', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ exports: { '.': './index.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('library'), `types: ${types}`);
});

test('detects library from main+types keys', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ main: './index.js', types: './index.d.ts' }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('library'), `types: ${types}`);
});

test('detects infra from Dockerfile', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'Dockerfile'), 'FROM node:18\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects infra from .tf file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'main.tf'), 'resource "aws_s3_bucket" "b" {}\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects infra from k8s/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'k8s'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects data from migrations/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'migrations'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects data from prisma schema', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'prisma'));
  fs.writeFileSync(path.join(d, 'prisma', 'schema.prisma'), 'generator client {}\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects data from sequelize in deps', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { sequelize: '^6.0.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects cli from bin field in package.json', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ bin: { mytool: './cli.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('cli'), `types: ${types}`);
});

test('detects cli from shebang in .js file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'cli.js'), '#!/usr/bin/env node\nconsole.log("hi");\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('cli'), `types: ${types}`);
});

test('detects docs when >=80% of top-level files are .md', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'README.md'), '');
  fs.writeFileSync(path.join(d, 'GUIDE.md'), '');
  fs.writeFileSync(path.join(d, 'CONTRIBUTING.md'), '');
  fs.writeFileSync(path.join(d, 'one.js'), '');
  // 3 md / 4 total = 75% — NOT docs
  const { types: below } = classifyArea(d, d);
  assert.ok(!below.includes('docs'), `should not be docs at 75%: ${below}`);
  fs.writeFileSync(path.join(d, 'EXTRA.md'), '');
  // 4 md / 5 total = 80% — IS docs
  const { types: at } = classifyArea(d, d);
  assert.ok(at.includes('docs'), `should be docs at 80%: ${at}`);
});

test('types are additive: frontend+library from react+exports', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' }, exports: { '.': './index.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
  assert.ok(types.includes('library'), `types: ${types}`);
});

test('classify CLI command prints { areaId, types } JSON for a frontend dir', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const out = execFileSync(
    process.execPath,
    [
      CLI,
      'classify',
      '--root', d,
      '--area', '.',
    ],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(out);
  assert.strictEqual(result.areaId, '.');
  assert.ok(Array.isArray(result.types));
  assert.ok(result.types.includes('frontend'), `types: ${result.types}`);
});
