import fs from 'node:fs';
import path from 'node:path';

function findLatestDecisionsLog(repoDir) {
  const pipelinesDir = path.join(repoDir, '.claude-tweaks', 'pipelines');
  if (!fs.existsSync(pipelinesDir)) return null;
  const dirs = fs.readdirSync(pipelinesDir, { withFileTypes: true })
    // 'archive' is wrap-up's closed-run parking lot (pipelines/archive/) — never the run under test.
    .filter((e) => e.isDirectory() && e.name !== 'archive')
    .map((e) => e.name)
    .sort();
  if (dirs.length === 0) return null;
  const logPath = path.join(pipelinesDir, dirs[dirs.length - 1], 'decisions.md');
  return fs.existsSync(logPath) ? logPath : null;
}

export function decisionsLogHas(repoDir, { contains }) {
  const logPath = findLatestDecisionsLog(repoDir);
  if (!logPath) return { pass: false, message: 'no decisions.md found under .claude-tweaks/pipelines/' };
  const content = fs.readFileSync(logPath, 'utf8');
  const needles = Array.isArray(contains) ? contains : [contains];
  const missing = needles.filter((n) => !content.includes(n));
  if (missing.length === 0) return { pass: true, message: 'decisions.md contains all expected substrings' };
  return { pass: false, message: `decisions.md missing: ${JSON.stringify(missing)}` };
}
