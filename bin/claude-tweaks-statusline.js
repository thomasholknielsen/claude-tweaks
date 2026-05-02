#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const paths = require('./lib/paths');
const jsonl = require('./lib/jsonl');
const color = require('./lib/color');

const SEPARATOR = '  ';
const STALE_USAGE_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 50);
  });
}

function formatK(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
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
  const name = input.model_display_name || input.model_id;
  return name ? String(name) : null;
}

function renderContext(input) {
  const used = input.context_used;
  const total = input.context_window_size;
  if (typeof used !== 'number' || typeof total !== 'number' || total === 0) return null;
  const pct = Math.round((used / total) * 100);
  return colorByPct(pct, `ctx: ${pct}%`);
}

function renderEffort(input) {
  const e = input.thinking_effort;
  if (!e || e === 'default' || e === 'unset') return null;
  return `eff: ${e}`;
}

function renderGit() {
  try {
    const branch = execSync('git symbolic-ref --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    if (!branch) return null;
    const dirty = status.length > 0;
    return dirty ? `${branch}${color.yellow('●')}` : branch;
  } catch {
    return null;
  }
}

function readUsageCache() {
  try {
    const data = JSON.parse(fs.readFileSync(paths.usageCachePath(), 'utf8'));
    if (!data.fetched_at) return null;
    const age = Date.now() - data.fetched_at;
    if (age > STALE_USAGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function renderUsage(label, data, now) {
  if (!data || typeof data.pct !== 'number') return null;
  const pct = data.pct;
  const remaining = data.reset_at ? Math.max(0, data.reset_at - Math.floor(now / 1000)) : null;
  const dur = remaining ? formatDuration(remaining) : null;
  const text = dur ? `${label}: ${pct}% (${dur})` : `${label}: ${pct}%`;
  return colorByPct(pct, text);
}

function renderSavings(sessionStartMs) {
  const events = jsonl.readTail(paths.filterEventsPath(), 65536);
  if (events.length === 0) return null;
  const sessionEvents = events.filter((e) => typeof e.ts === 'number' && e.ts >= sessionStartMs);
  if (sessionEvents.length === 0) return null;
  const blocked = sessionEvents.reduce((sum, e) => sum + (e.blocked || 0), 0);
  if (blocked <= 0) return null;
  return color.green(`saved: ↓${formatK(blocked)}`);
}

function findActiveSpec(cwd) {
  const candidates = [path.join(cwd, 'specs', 'INBOX'), path.join(cwd, 'specs')];
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
    const ledgers = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('-ledger.md'))
      .map((f) => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return { path: fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (ledgers.length === 0) return null;
    const content = fs.readFileSync(ledgers[0].path, 'utf8');
    const lines = content.split('\n');
    let openCount = 0;
    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length >= 5 && cells[4] === 'open') openCount += 1;
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

function maybeRefreshUsage(cache) {
  if (!cache || Date.now() - cache.fetched_at > REFRESH_INTERVAL_MS) {
    /* future: fork async refresh process here. v4.2 leaves cache static. */
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

  const cwd = input.cwd || process.cwd();
  const sessionStartMs = input.session_start_ms || Date.now() - 6 * 60 * 60 * 1000;
  const usage = readUsageCache();
  maybeRefreshUsage(usage);
  const now = Date.now();

  const segments = [
    renderModel(input),
    renderContext(input),
    renderEffort(input),
    renderGit(),
    renderUsage('sess', usage?.session, now),
    renderUsage('week', usage?.weekly, now),
    renderSavings(sessionStartMs),
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
  renderContext,
  renderEffort,
  renderUsage,
  renderSavings,
  findActiveSpec,
  findOpenLedger,
  formatK,
  formatDuration,
  colorByPct,
};
