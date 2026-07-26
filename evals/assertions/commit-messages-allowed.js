import { execFileSync } from 'node:child_process';

export function commitMessagesAllowed(repoDir, { allow = [], since } = {}) {
  const args = ['log', '--format=%s'];
  if (since) args.push(`${since}..HEAD`);
  const out = execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
  const messages = out.trim() === '' ? [] : out.trim().split('\n');
  const patterns = allow.map((p) => new RegExp(p));
  const disallowed = messages.filter((m) => !patterns.some((re) => re.test(m)));
  if (disallowed.length > 0) {
    return {
      pass: false,
      message: `${disallowed.length} commit(s) matched no allowed pattern: ${disallowed.map((m) => `"${m}"`).join(', ')}`,
    };
  }
  return { pass: true, message: `all ${messages.length} commit message(s) match an allowed pattern` };
}
