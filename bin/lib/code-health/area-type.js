'use strict';
const fs = require('fs');
const path = require('path');

const UI_FRAMEWORKS = new Set([
  'react', 'vue', 'svelte', '@angular/core', '@angular/platform-browser',
  'next', 'nuxt', '@sveltejs/kit', 'solid-js', 'preact',
]);
const SERVER_FRAMEWORKS = new Set([
  'express', 'fastify', '@nestjs/core', 'koa', 'hapi', '@hapi/hapi',
  'restify', 'polka', 'micro', 'flask', 'django', 'gin', 'fiber', 'echo',
]);
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

// Returns true when `name` is a subdir of absDir.
function hasSubdir(absDir, name) {
  try {
    return fs.statSync(path.join(absDir, name)).isDirectory();
  } catch {
    return false;
  }
}

// Returns true when at least one file at the top level of absDir matches the predicate.
function hasTopLevelFile(entries, pred) {
  return entries.some((e) => e.isFile() && pred(e.name));
}

function classifyArea(absDir, _root) {
  const pkg = readPackageJson(absDir);
  const deps = allDeps(pkg);
  const entries = dirEntries(absDir);
  const types = [];

  // --- frontend ---
  const hasFrontendDep = [...UI_FRAMEWORKS].some((f) => deps.has(f));
  const hasFrontendExt = hasTopLevelFile(entries, (n) => /\.(jsx|tsx|vue)$/.test(n));
  const hasComponents = hasSubdir(absDir, 'components');
  if (hasFrontendDep || hasFrontendExt || hasComponents) types.push('frontend');

  // --- backend --- (server framework present, no UI framework in deps)
  const hasServerDep = [...SERVER_FRAMEWORKS].some((f) => deps.has(f));
  if (hasServerDep && !hasFrontendDep) types.push('backend');

  // --- library ---
  if (pkg && (pkg.exports != null || pkg.publishConfig != null ||
      (pkg.main != null && pkg.types != null))) {
    types.push('library');
  }

  // --- infra ---
  const hasTfFile = hasTopLevelFile(entries, (n) => n.endsWith('.tf'));
  const hasBicep = hasTopLevelFile(entries, (n) => n.endsWith('.bicep'));
  const hasDockerfile = hasTopLevelFile(entries, (n) => n === 'Dockerfile' || n.startsWith('Dockerfile.'));
  const hasK8s = hasSubdir(absDir, 'k8s') || hasSubdir(absDir, 'helm');
  if (hasTfFile || hasBicep || hasDockerfile || hasK8s) types.push('infra');

  // --- data ---
  const hasMigrations = hasSubdir(absDir, 'migrations');
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
    try {
      const head = fs.readFileSync(path.join(absDir, n), 'utf8').slice(0, 30);
      return head.startsWith('#!/');
    } catch { return false; }
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
