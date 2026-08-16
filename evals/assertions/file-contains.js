import fs from 'node:fs';
import path from 'node:path';

// Generic file-content pin: every `contains` substring present, every `absent`
// substring missing. `path` may include a single '*' segment, resolved to the
// LAST matching directory entry (sorted) — same latest-run-dir convention as
// decisions-log-has.js, for run dirs whose timestamp prefix is unknowable at
// scenario-authoring time.
function resolveStarPath(repoDir, relPath) {
  const parts = relPath.split('/');
  const starIdx = parts.indexOf('*');
  if (starIdx === -1) return path.join(repoDir, relPath);
  const baseDir = path.join(repoDir, ...parts.slice(0, starIdx));
  if (!fs.existsSync(baseDir)) return null;
  // 'archive' is wrap-up's closed-run parking lot (pipelines/archive/) — never the run under test.
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive')
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) return null;
  return path.join(baseDir, entries[entries.length - 1], ...parts.slice(starIdx + 1));
}

export function fileContains(repoDir, { path: relPath, contains = [], absent = [] }) {
  const target = resolveStarPath(repoDir, relPath);
  if (!target || !fs.existsSync(target)) return { pass: false, message: `${relPath} does not resolve to an existing file` };
  const content = fs.readFileSync(target, 'utf8');
  const missing = (Array.isArray(contains) ? contains : [contains]).filter((n) => !content.includes(n));
  const present = (Array.isArray(absent) ? absent : [absent]).filter((n) => content.includes(n));
  if (missing.length === 0 && present.length === 0) return { pass: true, message: `${relPath} content as expected` };
  return { pass: false, message: `${relPath}: missing ${JSON.stringify(missing)}, unexpectedly present ${JSON.stringify(present)}` };
}
