// bin/lib/atomic-write.js — write-then-rename so a reader never observes a
// partially-written file. rename() is atomic on the same volume on both
// POSIX and Windows; the temp file's name embeds the pid and a per-process
// counter so two writers targeting the same path never collide on the temp
// file itself.
'use strict';

const fs = require('fs');
const path = require('path');

let counter = 0;

function atomicWriteFileSync(targetPath, data) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(targetPath)}.${process.pid}.${counter++}.tmp`);
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, targetPath);
}

module.exports = { atomicWriteFileSync };
