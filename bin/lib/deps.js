#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os');

function has(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectPackageManager() {
  const platform = os.platform();
  if (platform === 'darwin') {
    if (has('brew')) return { name: 'brew', needsSudo: false };
  }
  if (platform === 'win32') {
    if (has('winget')) return { name: 'winget', needsSudo: false };
    if (has('scoop')) return { name: 'scoop', needsSudo: false };
  }
  if (platform === 'linux') {
    if (has('apt')) return { name: 'apt', needsSudo: true };
    if (has('dnf')) return { name: 'dnf', needsSudo: true };
    if (has('pacman')) return { name: 'pacman', needsSudo: true };
  }
  return null;
}

function installCommand(pm, dep) {
  const map = {
    brew: { node: 'brew install node', git: 'brew install git' },
    winget: { node: 'winget install OpenJS.NodeJS', git: 'winget install Git.Git' },
    scoop: { node: 'scoop install nodejs', git: 'scoop install git' },
    apt: { node: 'sudo apt install -y nodejs', git: 'sudo apt install -y git' },
    dnf: { node: 'sudo dnf install -y nodejs', git: 'sudo dnf install -y git' },
    pacman: { node: 'sudo pacman -S --noconfirm nodejs', git: 'sudo pacman -S --noconfirm git' },
  };
  return map[pm.name]?.[dep];
}

function detectVersionManager() {
  try {
    const path = execSync('which node', { encoding: 'utf8' }).trim();
    if (path.includes('/.nvm/') || path.includes('/.fnm/') || path.includes('/.volta/') || path.includes('/.n/')) {
      return path.includes('.nvm') ? 'nvm' : path.includes('.fnm') ? 'fnm' : path.includes('.volta') ? 'volta' : 'n';
    }
  } catch {
    /* no node */
  }
  return null;
}

function checkAgentBrowser() {
  if (!has('agent-browser')) {
    process.stdout.write(
      'claude-tweaks: Browser features require agent-browser. Install: npm install -g agent-browser. Browser features are optional.\n',
    );
  }
}

function reportMissing(dep, pm, vm) {
  const platform = os.platform();
  if (dep === 'node' && vm) {
    process.stdout.write(`claude-tweaks: Node not found, but ${vm} is on PATH. Install Node via your version manager.\n`);
    return;
  }
  if (pm) {
    const cmd = installCommand(pm, dep);
    const sudoNote = pm.needsSudo ? ' (requires sudo)' : '';
    process.stdout.write(`claude-tweaks: ${dep} not found. Install via ${pm.name}: ${cmd}${sudoNote}\n`);
    return;
  }
  const fallback = {
    darwin: { node: 'https://nodejs.org/ or `xcode-select --install` then install brew', git: 'https://git-scm.com/ or `xcode-select --install`' },
    win32: { node: 'https://nodejs.org/ or install winget/scoop first', git: 'https://git-scm.com/' },
    linux: { node: 'use your distro package manager', git: 'use your distro package manager' },
  };
  const url = fallback[platform]?.[dep] || `install ${dep}`;
  process.stdout.write(`claude-tweaks: ${dep} not found. Install: ${url}\n`);
}

function main() {
  const pm = detectPackageManager();
  const vm = detectVersionManager();
  if (!has('node')) reportMissing('node', pm, vm);
  if (!has('git')) reportMissing('git', pm, null);
  checkAgentBrowser();
}

if (require.main === module) main();

module.exports = { has, detectPackageManager, detectVersionManager, installCommand, reportMissing };
