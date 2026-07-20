#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const color = require('./lib/color');

const SEPARATOR = '  ';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    const timer = setTimeout(() => resolve(data), 50);
    const finish = () => {
      clearTimeout(timer);
      resolve(data);
    };
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

function formatDuration(seconds) {
  if (seconds < 60) return null;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function colorByPct(pct, text) {
  if (pct >= 90) return color.red(text);
  if (pct >= 75) return color.yellow(text);
  return text;
}

function renderModel(input) {
  const m = input.model;
  if (!m) return null;
  if (typeof m === 'string') return m;
  return m.display_name || m.id || null;
}

function renderProject(input, fallbackCwd) {
  const ws = input.workspace || {};
  const dir = ws.project_dir || ws.current_dir || input.cwd || fallbackCwd;
  if (!dir || typeof dir !== 'string') return null;
  const name = path.basename(dir);
  return name || null;
}

function renderContext(input) {
  const cw = input.context_window;
  if (!cw) return null;
  let pct = cw.used_percentage;
  if (typeof pct !== 'number') {
    const used = cw.total_input_tokens;
    const total = cw.context_window_size;
    if (typeof used === 'number' && typeof total === 'number' && total > 0) {
      pct = (used / total) * 100;
    } else {
      return null;
    }
  }
  const rounded = Math.round(pct);
  return colorByPct(pct, `ctx: ${rounded}%`);
}

function renderEffort(input) {
  const level = input.effort && input.effort.level;
  if (!level || level === 'default' || level === 'unset') return null;
  return `eff: ${level}`;
}

// `git status --porcelain -b` returns the branch and dirty status in one
// call instead of two separate `symbolic-ref` + `status --porcelain` spawns.
// Header line shapes: "## main", "## main...origin/main [ahead 1]",
// "## No commits yet on main" (fresh repo, no commits), "## HEAD (no
// branch)" (detached HEAD — no branch to report, matching the old
// symbolic-ref failure behavior).
function parseStatusBranch(output) {
  const lines = output.split('\n').filter((l) => l.length > 0);
  if (!lines.length || !lines[0].startsWith('## ')) return { branch: null, dirty: false };
  const header = lines[0].slice(3);
  let branch;
  if (header.startsWith('HEAD (no branch)')) {
    branch = null;
  } else if (header.startsWith('No commits yet on ')) {
    branch = header.slice('No commits yet on '.length).split(' ')[0];
  } else {
    branch = header.split('...')[0].split(' ')[0];
  }
  return { branch: branch || null, dirty: lines.length > 1 };
}

function renderGit(cwd) {
  try {
    const output = execSync('git status --porcelain -b', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      cwd,
    });
    const { branch, dirty } = parseStatusBranch(output);
    if (!branch) return null;
    return dirty ? `${branch}${color.yellow('●')}` : branch;
  } catch {
    return null;
  }
}

function renderRateLimit(label, period, now) {
  if (!period) return null;
  const pct = period.used_percentage;
  if (typeof pct !== 'number') return null;
  const reset = period.resets_at;
  const remaining = reset ? Math.max(0, reset - Math.floor(now / 1000)) : null;
  const dur = remaining ? formatDuration(remaining) : null;
  const rounded = Math.round(pct);
  const text = dur ? `${label}: ${rounded}% (${dur})` : `${label}: ${rounded}%`;
  return colorByPct(pct, text);
}

function findActiveSpec(cwd) {
  const candidates = [path.join(cwd, 'specs')];
  for (const dir of candidates) {
    try {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => {
          const fullPath = path.join(dir, e.name);
          const stat = fs.statSync(fullPath);
          return { name: e.name, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      if (entries.length > 0) {
        const match = entries[0].name.match(/^(\d{3,})/);
        if (match) return `spec: ${match[1]}`;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

function findOpenLedger(cwd) {
  const dir = path.join(cwd, 'docs', 'plans');
  try {
    const ledgers = fs.readdirSync(dir).filter((f) => f.endsWith('-ledger.md'));
    if (ledgers.length === 0) return null;
    let openCount = 0;
    for (const f of ledgers) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of content.split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').map((c) => c.trim());
        if (cells.length >= 5 && cells[4] === 'open') openCount += 1;
      }
    }
    if (openCount === 0) return null;
    const text = `ledger: ${openCount} open`;
    if (openCount >= 10) return color.red(text);
    if (openCount >= 3) return color.yellow(text);
    return text;
  } catch {
    return null;
  }
}

async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    /* empty input is fine */
  }

  const cwd = (input.workspace && input.workspace.current_dir) || input.cwd || process.cwd();
  const now = Date.now();
  const rateLimits = input.rate_limits || {};

  const segments = [
    renderProject(input, cwd),
    renderModel(input),
    renderContext(input),
    renderEffort(input),
    renderGit(cwd),
    renderRateLimit('sess', rateLimits.five_hour, now),
    renderRateLimit('week', rateLimits.seven_day, now),
    findActiveSpec(cwd),
    findOpenLedger(cwd),
  ].filter((s) => s !== null && s !== undefined && s !== '');

  process.stdout.write(segments.join(SEPARATOR));
}

if (require.main === module) {
  main().catch(() => process.stdout.write(''));
}

module.exports = {
  renderModel,
  renderProject,
  renderContext,
  renderEffort,
  renderGit,
  renderRateLimit,
  findActiveSpec,
  findOpenLedger,
  formatDuration,
  colorByPct,
  parseStatusBranch,
  readStdin,
};
