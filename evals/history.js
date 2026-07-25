// Durable cross-run tracking for the eval harness: appends one line per real
// scenario run to evals/history.jsonl (git-tracked, unlike the gitignored
// results/*.json files), correlated to the plugin repo's own commit sha, so
// "did commit X regress this scenario" and "is this scenario's cost trending
// up" are answerable without re-deriving anything. See
// docs/superpowers/specs/2026-07-25-eval-benchmark-tracking-design.md.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Real git implementation. Injectable via runScenarioWith's resolveGitStateFn
// opt so tests never shell out to git — see evals/tests/history.test.js and
// evals/tests/runner.test.js.
export function resolveGitState(pluginRoot) {
  try {
    const gitSha = execFileSync('git', ['-C', pluginRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['-C', pluginRoot, 'status', '--porcelain'], { encoding: 'utf8' });
    return { gitSha, gitDirty: status.trim().length > 0 };
  } catch {
    return { gitSha: null, gitDirty: null };
  }
}

export function appendHistoryEntry(historyPath, entry) {
  fs.appendFileSync(historyPath, JSON.stringify(entry) + '\n');
}

export function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip a malformed line (e.g. a partial write from an interrupted
      // process) rather than let one bad line break every other entry.
    }
  }
  return entries;
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '(none)';
}

function failedAssertionTypes(entry) {
  return entry.assertions.filter((a) => !a.pass).map((a) => a.type).join(', ');
}

function formatDate(startedAt) {
  return startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function rowLine(row) {
  const date = formatDate(row.startedAt);
  const cost = row.costUsd != null ? `$${row.costUsd.toFixed(3)}` : '(n/a)';
  const passLabel = row.allPassed ? 'PASS' : `FAIL (${failedAssertionTypes(row)})`;
  return `${date}  ${shortSha(row.gitSha).padEnd(8)}  ${cost.padEnd(8)}  ${String(row.toolCallCount).padEnd(5)}  ${passLabel}`;
}

export function formatHistoryTable(entries, scenario) {
  if (scenario) {
    const rows = entries
      .filter((e) => e.scenario === scenario)
      .slice()
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    if (rows.length === 0) return `No history for scenario "${scenario}".`;
    const lines = [`scenario: ${scenario}`, 'date                  sha       cost      tools  pass'];
    for (const row of rows) lines.push(rowLine(row));
    return lines.join('\n');
  }

  const latestByScenario = new Map();
  for (const entry of entries) {
    const existing = latestByScenario.get(entry.scenario);
    if (!existing || new Date(entry.startedAt) > new Date(existing.startedAt)) {
      latestByScenario.set(entry.scenario, entry);
    }
  }
  const scenarioNames = [...latestByScenario.keys()].sort();
  if (scenarioNames.length === 0) return 'No history recorded yet.';
  const lines = ['scenario                                   date                  sha       cost      tools  pass'];
  for (const name of scenarioNames) {
    lines.push(`${name.padEnd(42)}  ${rowLine(latestByScenario.get(name))}`);
  }
  return lines.join('\n');
}
