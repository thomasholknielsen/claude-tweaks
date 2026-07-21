'use strict';
const fs = require('fs');
const path = require('path');

const UI_FRAMEWORKS = new Set([
  'react', 'vue', 'svelte', '@angular/core', '@angular/platform-browser',
  'next', 'nuxt', '@sveltejs/kit', 'solid-js', 'preact',
]);
// npm-only — matched against allDeps(), which reads exclusively from
// package.json. Non-npm framework names (Flask, Django, Gin, Fiber, Echo)
// deliberately do NOT belong here: they could never match this way, and a
// dead entry that looks like coverage is worse than no entry at all. Those
// ecosystems are detected separately via hasPythonServerFramework /
// hasGoServerFramework below, the same filesystem-signal pattern already
// used by the infra/data sections of classifyArea.
const SERVER_FRAMEWORKS = new Set([
  'express', 'fastify', '@nestjs/core', 'koa', 'hapi', '@hapi/hapi',
  'restify', 'polka', 'micro',
]);
const PYTHON_MANIFEST_FILES = ['requirements.txt', 'Pipfile', 'pyproject.toml'];
const PYTHON_SERVER_FRAMEWORK_RE = /\b(flask|django)\b/i;
const GO_SERVER_FRAMEWORK_RE = /\b(gin-gonic\/gin|gofiber\/fiber|labstack\/echo)\b/i;
const ORM_DEPS = new Set([
  'sequelize', 'typeorm', 'prisma', '@prisma/client', 'drizzle-orm',
  'knex', 'mongoose', 'pg', 'mysql2', 'better-sqlite3',
]);

function readPackageJson(absDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(absDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function allDeps(pkg) {
  if (!pkg) return new Set();
  const s = new Set();
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const k of Object.keys(pkg[section] || {})) s.add(k);
  }
  return s;
}

function dirEntries(absDir) {
  try {
    return fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Returns true when `name` is a subdir of absDir, checked against the
// already-fetched dirEntries() result — no fresh fs.statSync per call.
function hasSubdir(entries, name) {
  return entries.some((e) => e.isDirectory() && e.name === name);
}

// Returns true when at least one file at the top level of absDir matches the predicate.
function hasTopLevelFile(entries, pred) {
  return entries.some((e) => e.isFile() && pred(e.name));
}

// Reads at most maxBytes from the start of absPath — a bounded alternative
// to fs.readFileSync's whole-file read, for checks (like a shebang sniff)
// that only ever need the first few bytes. A multi-MB build artifact
// (bundle.js, vendor.cjs) sitting at the top level of a classified dir would
// otherwise be read into memory in full just to inspect its first 3 bytes.
function readHead(absPath, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.toString('utf8', 0, bytesRead);
  } catch {
    return '';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

function hasPythonServerFramework(absDir, entries) {
  for (const name of PYTHON_MANIFEST_FILES) {
    if (!hasTopLevelFile(entries, (n) => n === name)) continue;
    try {
      const content = fs.readFileSync(path.join(absDir, name), 'utf8');
      if (PYTHON_SERVER_FRAMEWORK_RE.test(content)) return true;
    } catch { /* unreadable manifest — try the next one */ }
  }
  return false;
}

function hasGoServerFramework(absDir, entries) {
  if (!hasTopLevelFile(entries, (n) => n === 'go.mod')) return false;
  try {
    return GO_SERVER_FRAMEWORK_RE.test(fs.readFileSync(path.join(absDir, 'go.mod'), 'utf8'));
  } catch {
    return false;
  }
}

function classifyArea(absDir, _root) {
  const pkg = readPackageJson(absDir);
  const deps = allDeps(pkg);
  const entries = dirEntries(absDir);
  const types = [];

  // --- frontend ---
  const hasFrontendDep = [...UI_FRAMEWORKS].some((f) => deps.has(f));
  const hasFrontendExt = hasTopLevelFile(entries, (n) => /\.(jsx|tsx|vue)$/.test(n));
  const hasComponents = hasSubdir(entries, 'components');
  const isFrontend = hasFrontendDep || hasFrontendExt || hasComponents;
  if (isFrontend) types.push('frontend');

  // --- backend --- (server framework present, no UI framework evidence at all —
  // dep-based, extension-based, or components/-based)
  const hasServerDep = [...SERVER_FRAMEWORKS].some((f) => deps.has(f)) ||
    hasPythonServerFramework(absDir, entries) || hasGoServerFramework(absDir, entries);
  if (hasServerDep && !isFrontend) types.push('backend');

  // --- library ---
  if (pkg && (pkg.exports != null || pkg.publishConfig != null ||
      (pkg.main != null && pkg.types != null))) {
    types.push('library');
  }

  // --- infra ---
  const hasTfFile = hasTopLevelFile(entries, (n) => n.endsWith('.tf'));
  const hasBicep = hasTopLevelFile(entries, (n) => n.endsWith('.bicep'));
  const hasDockerfile = hasTopLevelFile(entries, (n) => n === 'Dockerfile' || n.startsWith('Dockerfile.'));
  const hasK8s = hasSubdir(entries, 'k8s') || hasSubdir(entries, 'helm');
  if (hasTfFile || hasBicep || hasDockerfile || hasK8s) types.push('infra');

  // --- data ---
  const hasMigrations = hasSubdir(entries, 'migrations');
  const hasSqlFile = hasTopLevelFile(entries, (n) => n.endsWith('.sql'));
  const hasPrismaSchema = (() => {
    try {
      return fs.statSync(path.join(absDir, 'prisma', 'schema.prisma')).isFile();
    } catch { return false; }
  })();
  const hasDrizzle = hasTopLevelFile(entries, (n) => /^drizzle\.config\./.test(n));
  const hasOrmDep = [...ORM_DEPS].some((d) => deps.has(d));
  if (hasMigrations || hasSqlFile || hasPrismaSchema || hasDrizzle || hasOrmDep) types.push('data');

  // --- cli ---
  const hasBinField = pkg && pkg.bin != null;
  const hasShebang = hasTopLevelFile(entries, (n) => {
    if (!/\.(js|ts|mjs|cjs)$/.test(n)) return false;
    return readHead(path.join(absDir, n), 30).startsWith('#!/');
  });
  if (hasBinField || hasShebang) types.push('cli');

  // --- docs ---
  const fileEntries = entries.filter((e) => e.isFile());
  if (fileEntries.length > 0) {
    const mdCount = fileEntries.filter((e) => /\.mdx?$/.test(e.name)).length;
    if (mdCount / fileEntries.length >= 0.8) types.push('docs');
  }

  return { types };
}

module.exports = { classifyArea };
