import { execFileSync } from 'node:child_process';

export function testPasses(repoDir, { command = 'npm test' } = {}) {
  const [cmd, ...args] = command.split(' ');
  try {
    execFileSync(cmd, args, { cwd: repoDir, encoding: 'utf8' });
    return { pass: true, message: `${command} passed` };
  } catch (err) {
    return { pass: false, message: `${command} failed: ${err.stdout || err.message}` };
  }
}
