// bin/lib/wrap-up/facts.js — deterministic gate inputs for the wrap-up
// curation registry (registry.js), read from git and the filesystem. Every
// fact is measured, never inferred: gatherFacts() never throws, even outside
// a repository or with a missing CLAUDE.md at the base revision — it returns
// degraded (false/empty) values instead, matching state.js's pattern of
// wrapping every `git` invocation in try/catch.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function makeGitRunner(cwd) {
  return (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function parseRenamedDeleted(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0][0]; // 'R100' -> 'R'; 'D' -> 'D'
      if (status === 'R') {
        return { status: 'R', oldPath: parts[1], newPath: parts[2] };
      }
      return { status: 'D', oldPath: parts[1], newPath: null };
    });
}

function dirNonEmpty(dirPath) {
  try {
    return fs.readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}

function listMarkdownFiles(dirPath, relativePrefix) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      results.push(...listMarkdownFiles(path.join(dirPath, entry.name), `${relativePrefix}/${entry.name}`));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(`${relativePrefix}/${entry.name}`);
    }
  }
  return results;
}

// Lines after a `## Commands` heading up to (not including) the next `## `
// heading, trimmed and with blanks dropped.
function extractCommandsSection(text) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((line) => line.trim() === '## Commands');
  if (startIdx === -1) return [];
  const section = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    const trimmed = lines[i].trim();
    if (trimmed) section.push(trimmed);
  }
  return section;
}

// True when a file that was MODIFIED in place (not renamed, not deleted) removed
// a markdown heading line. `--diff-filter=M` is what keeps a deleted file's
// headings out — a deletion is already `renamedOrDeleted`'s territory, and the
// two gates would otherwise be indistinguishable. `-U0` keeps context lines out
// of the scan, so a `-` line is always a real removal. `---` file markers cannot
// match: the pattern requires a `#` immediately after the leading `-`.
function computeHeadingRenamed(git, base) {
  const diff = git(['diff', '-U0', '--diff-filter=M', `${base}...HEAD`, '--', '*.md']);
  if (!diff) return false;
  return diff.split('\n').some((line) => /^-#{1,6} /.test(line));
}

function computeClaudeMdCommandRenamed(git, cwd, base) {
  const baseContent = git(['show', `${base}:CLAUDE.md`]);
  if (baseContent === null) return false; // no CLAUDE.md at base

  let worktreeContent = '';
  try {
    worktreeContent = fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8');
  } catch {
    worktreeContent = '';
  }

  const baseLines = extractCommandsSection(baseContent);
  const worktreeLines = new Set(extractCommandsSection(worktreeContent));
  return baseLines.some((line) => !worktreeLines.has(line));
}

function gatherFacts({ cwd, base } = {}) {
  const git = makeGitRunner(cwd);
  const isRepo = git(['rev-parse', '--is-inside-work-tree']) === 'true';

  let changedFiles = [];
  let renamedDeleted = [];
  let claudeMdCommandRenamed = false;
  let headingRenamed = false;

  if (isRepo) {
    const diffOut = git(['diff', '--name-only', `${base}...HEAD`]);
    changedFiles = diffOut ? diffOut.split('\n').filter(Boolean) : [];

    const rdOut = git(['diff', '--diff-filter=RD', '--name-status', `${base}...HEAD`]);
    renamedDeleted = parseRenamedDeleted(rdOut);

    claudeMdCommandRenamed = computeClaudeMdCommandRenamed(git, cwd, base);
    headingRenamed = computeHeadingRenamed(git, base);
  }

  const skillsLibraryExists = fs.existsSync(path.join(cwd, '.claude', 'skills'));
  const docsTreeNonEmpty = dirNonEmpty(path.join(cwd, 'docs'));
  const journeyFiles = listMarkdownFiles(path.join(cwd, 'docs', 'journeys'), 'docs/journeys');

  return {
    isRepo,
    changedFiles,
    renamedDeleted,
    skillsLibraryExists,
    multiFileDiff: changedFiles.length >= 2,
    docsTreeNonEmpty,
    journeysExist: journeyFiles.length > 0,
    journeyFiles,
    claudeMdCommandRenamed,
    renamedOrDeleted: renamedDeleted.length > 0,
    headingRenamed,
  };
}

module.exports = { gatherFacts };
