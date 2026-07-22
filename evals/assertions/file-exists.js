import fs from 'node:fs';
import path from 'node:path';

export function fileExists(repoDir, { path: relPath, shouldExist = true }) {
  const exists = fs.existsSync(path.join(repoDir, relPath));
  if (exists === shouldExist) return { pass: true, message: `${relPath} exists=${exists} as expected` };
  return { pass: false, message: `${relPath} exists=${exists}, expected ${shouldExist}` };
}
