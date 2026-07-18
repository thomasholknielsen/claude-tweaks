'use strict';
const fs = require('fs');
const path = require('path');

// Recursively collects .md files under `dir` into `results`. No dotfile
// skip needed here (unlike scope.js's listDocs) — findability only ever
// walks docs/, which has no dotfile subdirectories in practice, and a
// stray one would just be harmlessly searched too.
function walkMarkdownFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// Counts how many files under docs/**, README.md, or CLAUDE.md — the
// actual places a human or agent would navigate from — mention this
// doc's filename. A mechanical, repo-scoped signal; the JUDGE step in
// docs-health/SKILL.md decides whether a near-zero count means a genuine
// orphan or an intentionally standalone doc.
function computeInboundReferences(docId, root) {
  const docPath = path.join(root, 'docs', `${docId}.md`);
  const basename = path.basename(docPath);

  const candidates = [];
  const docsDir = path.join(root, 'docs');
  if (fs.existsSync(docsDir)) walkMarkdownFiles(docsDir, candidates);
  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) candidates.push(readme);
  const claudeMd = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) candidates.push(claudeMd);

  const referencedBy = [];
  for (const file of candidates) {
    if (path.resolve(file) === path.resolve(docPath)) continue;
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (content.includes(basename)) {
      referencedBy.push(path.relative(root, file));
    }
  }
  return { count: referencedBy.length, referencedBy };
}

module.exports = { computeInboundReferences };
