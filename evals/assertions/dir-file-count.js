import fs from 'node:fs';
import path from 'node:path';

// Counts regular files in a directory (non-recursive). A missing directory
// counts as 0 — "no records were filed" and "no specs/ dir was ever created"
// are the same outcome for a max-style pin. Supports the same single-'*'
// segment as file-contains.js (latest entry wins).
function resolveStarDir(repoDir, relPath) {
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

export function dirFileCount(repoDir, { path: relPath, max }) {
  const dir = resolveStarDir(repoDir, relPath);
  const count = dir && fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length
    : 0;
  if (count <= max) return { pass: true, message: `${relPath} holds ${count} file(s) (max ${max})` };
  return { pass: false, message: `${relPath} holds ${count} file(s), expected at most ${max}` };
}
