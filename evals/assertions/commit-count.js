import { execFileSync } from 'node:child_process';

export function commitCount(repoDir, { max, min, since } = {}) {
  const args = ['log', '--oneline'];
  if (since) args.push(`${since}..HEAD`);
  const out = execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
  const n = out.trim() === '' ? 0 : out.trim().split('\n').length;
  if (max !== undefined && n > max) return { pass: false, message: `commit count ${n} exceeds max ${max}` };
  if (min !== undefined && n < min) return { pass: false, message: `commit count ${n} below min ${min}` };
  return { pass: true, message: `commit count ${n} within bounds` };
}
