const fs = require('fs');

function appendEvent(filePath, obj) {
  try {
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
  } catch (err) {
    process.stderr.write(`claude-tweaks: failed to append telemetry: ${err.message}\n`);
  }
}

function readTail(filePath, maxBytes = 65536) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    if (start > 0 && lines.length > 0) lines.shift();
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((x) => x !== null);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

module.exports = { appendEvent, readTail };
