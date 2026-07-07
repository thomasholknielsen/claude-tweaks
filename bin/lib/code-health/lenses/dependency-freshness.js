const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function classify(range) {
  if (range === '*') return { kind: 'wildcard', severity: 'high' };
  if (range === 'latest') return { kind: 'latest', severity: 'high' };
  if (/^x$/i.test(range.trim())) return { kind: 'x-range', severity: 'medium' };
  return null;
}

function* walkPkg(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkPkg(full);
    } else if (entry.isFile() && entry.name === 'package.json') {
      yield full;
    }
  }
}

function run(area, root) {
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const pkgFile of walkPkg(base)) {
      let pkg;
      try { pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); } catch { continue; }
      const pkgRel = path.relative(root, pkgFile);
      for (const section of DEP_SECTIONS) {
        const deps = pkg[section];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, range] of Object.entries(deps)) {
          const c = classify(String(range));
          if (!c) continue;
          findings.push(makeFinding({
            lens: 'dependency-freshness',
            category: c.severity === 'high' ? 'security' : 'convention',
            severity: c.severity,
            confidence: 'high',
            area: area.id,
            files: [pkgRel],
            signature: `dep-range ${name} ${c.kind}`,
            title: `Loose version range for "${name}" in ${pkgRel}`,
            evidence: `${pkgRel}: "${name}": "${range}" is a ${c.kind} range and installs whatever is current at install time.`,
            suggestion: `Pin "${name}" to a specific semver range (e.g. "^X.Y.Z") or an exact version.`,
            acceptance: `"${name}" specifies a semver range or exact pin and the lockfile is committed.`,
          }));
        }
      }
    }
  }
  return findings;
}

module.exports = { id: 'dependency-freshness', kind: 'mechanical', run };
