const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
const DEFAULT_THRESHOLD = 300;

function severity(lineCount, threshold) {
  if (lineCount > threshold * 3.33) return 'critical';
  if (lineCount > threshold * 2) return 'high';
  return 'medium';
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function run(area, root, config) {
  const threshold = (config && config.threshold) || DEFAULT_THRESHOLD;
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const file of walk(base)) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const lineCount = content.split('\n').length;
      if (lineCount <= threshold) continue;
      const rel = path.relative(root, file);
      findings.push(makeFinding({
        lens: 'oversized-file',
        category: 'architecture',
        severity: severity(lineCount, threshold),
        confidence: 'high',
        area: area.id,
        files: [rel],
        signature: `oversized ${rel}`,
        title: `Oversized file: ${path.basename(rel)} (${lineCount} lines)`,
        evidence: `${rel} has ${lineCount} lines, exceeding the ${threshold}-line threshold.`,
        suggestion: `Break ${path.basename(rel)} into smaller modules or extract cohesive subsets.`,
        acceptance: `${path.basename(rel)} is split so no module exceeds ${threshold} lines, or the threshold is documented as intentional.`,
      }));
    }
  }
  return findings;
}

module.exports = { id: 'oversized-file', kind: 'mechanical', run };
