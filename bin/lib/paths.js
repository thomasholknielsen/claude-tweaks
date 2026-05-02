const os = require('os');
const path = require('path');
const fs = require('fs');

function dataDir() {
  const dir = path.join(os.homedir(), '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logsDir() {
  const dir = path.join(dataDir(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function bashLogPath(ts) {
  return path.join(logsDir(), `bash-${ts}.log`);
}

function filterEventsPath() {
  return path.join(logsDir(), 'filter.jsonl');
}

module.exports = {
  dataDir,
  logsDir,
  bashLogPath,
  filterEventsPath,
};
