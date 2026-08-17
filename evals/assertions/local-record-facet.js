// Reads a local-files work-record's frontmatter facets directly (via
// plugin/bin/lib/issues/local-store.js's readRecord) and checks one facet's value.
// Used for asserting /claude-tweaks:backlog refine's grant/withhold decisions, which
// under work-backend: local-files are recorded as frontmatter but not acted
// on by any headless consumer (see plugin/skills/_shared/work-record.md's
// Permission matrix "Driver-conditional note") — so the only thing to check
// is the record's own resulting facet state, not any downstream effect.
import path from 'node:path';
import { readRecord } from '../../plugin/bin/lib/issues/local-store.js';

export function localRecordFacet(repoDir, { recordPath, facet, equals }) {
  const record = readRecord(path.join(repoDir, recordPath));
  const actual = facet.split('.').reduce((v, k) => (v == null ? v : v[k]), record.facets);
  if (JSON.stringify(actual) === JSON.stringify(equals)) {
    return { pass: true, message: `${recordPath} facets.${facet} = ${JSON.stringify(actual)} as expected` };
  }
  return { pass: false, message: `${recordPath} facets.${facet} = ${JSON.stringify(actual)}, expected ${JSON.stringify(equals)}` };
}
