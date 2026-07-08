const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const PATTERN = /\b(TODO|FIXME|HACK)\b[:\s]+(.+)/;
// SKIP_DIRS includes .claude-tweaks so a run never scans its own output
// (PORT.md delta #2 — the self-pollution guard).
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);

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

function run(area, root) {
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const file of walk(base)) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const rel = path.relative(root, file);
      content.split('\n').forEach((line, i) => {
        const m = line.match(PATTERN);
        if (!m) return;
        const tag = m[1];
        const text = m[2].trim();
        findings.push(makeFinding({
          lens: 'todo-comments',
          category: 'convention',
          severity: 'low',
          confidence: 'high',
          area: area.id,
          files: [`${rel}:${i + 1}`],
          signature: `${tag} ${text}`,
          title: `${tag} comment in ${path.basename(rel)}`,
          evidence: `${rel}:${i + 1} (${tag}: ${text})`,
          suggestion: `Resolve the ${tag} or convert it into a tracked task.`,
          acceptance: `The ${tag} is removed or linked to a tracked item.`,
        }));
      });
    }
  }
  return findings;
}

module.exports = { id: 'todo-comments', kind: 'mechanical', run };
