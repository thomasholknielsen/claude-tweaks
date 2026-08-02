import fs from 'node:fs';

// Unlike file-exists.js (which checks a path relative to repoDir), this
// checks an absolute path taken from the assertion context itself — for
// verifying filesystem state OUTSIDE the fixture repo, e.g. that a Bash
// escape attempt did not actually write anywhere.
export function absolutePathExists(context, { target, shouldExist = true } = {}) {
  const targetPath = context ? context[target] : undefined;
  const exists = targetPath ? fs.existsSync(targetPath) : false;
  if (exists === shouldExist) return { pass: true, message: `${targetPath}: exists=${exists} as expected` };
  return { pass: false, message: `${targetPath}: exists=${exists}, expected ${shouldExist}` };
}
