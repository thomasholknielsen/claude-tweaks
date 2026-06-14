const fs = require('fs');
const path = require('path');

const WORKSPACE_MARKERS = ['package.json', 'project.json', 'turbo.json'];

// Expand a "prefix/*" (single star, one level) glob against the real FS under
// root. Returns relative dir paths that contain a workspace manifest.
function expandGlob(root, pattern) {
  const results = [];
  const starIdx = pattern.indexOf('*');
  if (starIdx === -1) {
    try { fs.statSync(path.join(root, pattern)); results.push(pattern); } catch { /* skip */ }
    return results;
  }
  const prefix = pattern.slice(0, starIdx);
  const suffix = pattern.slice(starIdx + 1);
  let entries;
  try { entries = fs.readdirSync(path.join(root, prefix), { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = prefix + entry.name + suffix;
    const abs = path.join(root, candidate);
    if (WORKSPACE_MARKERS.some((m) => { try { fs.statSync(path.join(abs, m)); return true; } catch { return false; } })) {
      results.push(candidate);
    }
  }
  return results;
}

function parsePackageJsonWorkspaces(root) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { return null; }
  const ws = parsed.workspaces;
  if (!Array.isArray(ws) || !ws.length) return null;
  const paths = [];
  for (const g of ws) paths.push(...expandGlob(root, g));
  return paths.length ? paths : null;
}

function parsePnpmWorkspace(root) {
  let raw;
  try { raw = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'); } catch { return null; }
  const globs = [];
  let inPackages = false;
  for (const line of raw.split('\n')) {
    if (/^packages:/.test(line)) { inPackages = true; continue; }
    if (inPackages && /^\s+-\s+/.test(line)) globs.push(line.replace(/^\s+-\s+["']?/, '').replace(/["']?\s*$/, ''));
    else if (inPackages && /^\S/.test(line)) inPackages = false;
  }
  const paths = [];
  for (const g of globs) paths.push(...expandGlob(root, g));
  return paths.length ? paths : null;
}

// Returns Area[] = [{ id, globs, flags }]. id === globs[0] (relative from root).
// Tries signal files in priority order; falls back to a single "." area.
function detectAreas(root) {
  const rel = parsePnpmWorkspace(root) || parsePackageJsonWorkspaces(root);
  if (!rel) return [{ id: '.', globs: ['.'], flags: {} }];
  return rel.map((p) => ({ id: p, globs: [p], flags: {} }));
}

module.exports = { detectAreas };
