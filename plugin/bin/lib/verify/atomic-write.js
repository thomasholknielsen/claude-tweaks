// plugin/bin/lib/verify/atomic-write.js — the one temp-file-then-rename JSON
// write behind both of bin/verify.js's outputs: report.json (#892 AC3) and
// the suite-count stamp (#881). Extracted from a duplicated 4-line pattern
// (review hindsight finding, evaluation 3: missing consolidation) — report.js
// and count-stamp.js each wrote the same shape before this existed.
'use strict';

const fs = require('fs');

function writeJsonAtomic(filePath, data, fsImpl = fs) {
  const tmpPath = `${filePath}.tmp`;
  fsImpl.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  fsImpl.renameSync(tmpPath, filePath);
}

module.exports = { writeJsonAtomic };
