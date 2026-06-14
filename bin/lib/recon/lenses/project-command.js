const { execSync } = require('child_process');
const { makeFinding } = require('../finding');

const DEFAULT_TIMEOUT_MS = 30000;

function run(area, root, config) {
  if (!config || !config.command) return [];
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const lensId = config.lensId || 'project-command';
  const category = config.category || 'convention';
  const severity = config.severity || 'medium';
  const parse = config.parse;

  let stdout = '';
  try {
    stdout = execSync(config.command, { cwd: root, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT' || (err.killed && err.signal)) {
      return [makeFinding({
        lens: lensId,
        category,
        severity: 'low',
        confidence: 'high',
        area: area.id,
        files: [],
        signature: `${lensId} timeout`,
        title: `Project command timed out after ${timeoutMs}ms`,
        evidence: `Command "${config.command}" was killed after ${timeoutMs}ms.`,
        suggestion: 'Increase config.timeoutMs or investigate why the command is slow.',
        acceptance: 'The command completes within the configured timeout.',
      })];
    }
    stdout = String(err.stdout || '');
  }

  if (!parse || !stdout.trim()) return [];
  return parse(stdout, { area, root }).map((p) => makeFinding({
    lens: lensId,
    category,
    severity,
    confidence: 'med',
    area: area.id,
    files: p.files || [],
    signature: p.signature || `${lensId} unknown`,
    title: p.title || `${lensId} violation`,
    evidence: p.evidence || stdout.trim(),
    suggestion: p.suggestion || 'Fix the violation reported by the configured command.',
    acceptance: p.acceptance || 'The configured command exits without reporting this violation.',
  }));
}

module.exports = { id: 'project-command', kind: 'mechanical', run };
