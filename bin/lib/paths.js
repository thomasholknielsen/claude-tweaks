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

function cacheDir() {
  const dir = path.join(dataDir(), 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function bashLogPath(ts) {
  return path.join(logsDir(), `bash-${ts}.log`);
}

function filterEventsPath() {
  return path.join(logsDir(), 'filter.jsonl');
}

function usageCachePath() {
  return path.join(cacheDir(), 'usage.json');
}

module.exports = {
  dataDir,
  logsDir,
  cacheDir,
  bashLogPath,
  filterEventsPath,
  usageCachePath,
};
