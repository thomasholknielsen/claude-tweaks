const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DECL_EXPORT = /^export\s+(?:const|let|var|function|class)\s+(\w+)/;
const NAMED_EXPORT = /export\s*\{([^}]+)\}/g;
const IMPORT_NAMES = /import\s+(?:type\s*)?\{([^}]+)\}/g;

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function collectExports(content) {
  const exports = [];
  content.split('\n').forEach((line, i) => {
    const m = line.match(DECL_EXPORT);
    if (m) { exports.push({ name: m[1], line: i + 1 }); return; }
    let nm;
    const re = new RegExp(NAMED_EXPORT.source, 'g');
    while ((nm = re.exec(line)) !== null) {
      nm[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        .forEach((name) => exports.push({ name, line: i + 1 }));
    }
  });
  return exports;
}

function run(area, root) {
  // Pass 1: all source files under root (corpus for import scanning).
  const corpus = [];
  for (const file of walk(root)) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    corpus.push({ rel: path.relative(root, file), content });
  }
  const imported = new Set();
  for (const { content } of corpus) {
    let m;
    const re = new RegExp(IMPORT_NAMES.source, 'g');
    while ((m = re.exec(content)) !== null) {
      m[1].split(',').forEach((s) => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
      });
    }
  }
  // Pass 2: only files under the area's globs emit findings.
  const bases = area.globs.map((g) => path.resolve(root, g));
  const findings = [];
  for (const { rel, content } of corpus) {
    const abs = path.resolve(root, rel);
    if (!bases.some((b) => abs === b || abs.startsWith(b + path.sep))) continue;
    for (const { name, line } of collectExports(content)) {
      if (imported.has(name)) continue;
      findings.push(makeFinding({
        lens: 'dead-export',
        category: 'architecture',
        severity: 'low',
        confidence: 'low',
        area: area.id,
        files: [`${rel}:${line}`],
        signature: `dead-export ${name}`,
        title: `Possibly dead export: ${name} in ${path.basename(rel)}`,
        evidence: `${rel}:${line}: "${name}" is exported but no import of that name was found under the scan root. Heuristic: dynamic imports, re-exports via *, multi-line \`export { … }\` blocks, and external consumers are not checked.`,
        suggestion: `Verify whether "${name}" is consumed outside this root. If genuinely unused, remove it to reduce the public surface.`,
        acceptance: `"${name}" is removed, unexported, or confirmed used by a consumer outside the scan root.`,
      }));
    }
  }
  return findings;
}

module.exports = { id: 'dead-export', kind: 'mechanical', run };
