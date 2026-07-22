// Fixture setup helpers for eval scenarios. Extends the mkdtemp+git-init+seed-
// commit pattern already used by tests/helpers/git-fixtures.js at the repo
// root, scoped to evals/ so a scenario's fixture repo never touches the real
// working tree. seedLocalWorkRecord writes through the real local-files
// driver (bin/lib/issues/local-store.js) directly, so fixture records can
// never drift from the format claude-tweaks skills actually read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRecord, defaultFacets } from '../../bin/lib/issues/local-store.js';

export function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-eval-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'eval@claude-tweaks.local']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'claude-tweaks-eval']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

export function seedFiles(dir, files, message = 'seed fixture files') {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

export function applyPatch(dir, patchText, message = 'apply planted patch') {
  const patchPath = path.join(dir, '.eval-patch.diff');
  fs.writeFileSync(patchPath, patchText, 'utf8');
  execFileSync('git', ['-C', dir, 'apply', patchPath]);
  fs.unlinkSync(patchPath);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

export function seedLocalWorkRecord(dir, { slug, title, body = '', facets = {} }) {
  const specsDir = path.join(dir, 'specs');
  const record = createRecord(specsDir, { slug, title, body, facets: { ...defaultFacets(), ...facets } });
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', `seed local work record: ${title}`, '-q']);
  return record;
}

// Manual recursive walk (not fs.readdirSync's `recursive` option, which needs
// Node 20.1+ — this repo targets Node 18+) -> flat {relPath: content} map.
export function walkFiles(dir, baseDir = dir) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath);
      result[relPath] = fs.readFileSync(fullPath, 'utf8');
    }
  }
  return result;
}
