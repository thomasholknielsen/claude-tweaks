'use strict';

// Builds a conformant tidy-report render (step-6-auto.md's template) with
// guaranteed column alignment, for tidy-report-lint tests. Column widths are
// computed rather than hand-typed so the fixture can't silently drift out of
// alignment as rows are added.

function pad(s, width) {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function conformantReport() {
  const appliedRows = [
    { verb: 'deleted', ref: '#101', title: 'Stale backlog record', trail: 'commit abc1234' },
    { verb: 'archived', ref: '#102', title: 'Merged worktree cleanup', trail: 'reconcile-converged' },
  ];
  const verbW = Math.max(...appliedRows.map((r) => r.verb.length)) + 2;
  const titleW = Math.max(50, ...appliedRows.map((r) => r.title.length));
  const appliedLines = appliedRows.map(
    (r) => `${pad(r.verb, verbW)}${pad(r.ref, 6)}${pad(r.title, titleW)}${r.trail}`,
  );

  const approveLines = [
    '1  [defer]  #201  Update onboarding copy',
    '   staged action: apply local-files defer',
    '   node bin/apply-defer.js --run "$RUN_DIR" --record 201',
  ];

  function renderYoursGroup(head, rows, closing) {
    const titleW2 = Math.max(50, ...rows.map((r) => r.title.length));
    const out = [head];
    for (const r of rows) out.push(`   ${pad(r.ref, 6)}${pad(r.title, titleW2)}${r.why}`);
    out.push(`   ${closing}`);
    return out;
  }
  const yoursLines = [
    ...renderYoursGroup(
      '/claude-tweaks:specify (1)',
      [{ ref: '#301', title: 'Needs scoring before build', why: 'missing risk/size' }],
      '/claude-tweaks:specify #301',
    ),
    ...renderYoursGroup(
      'git (1)',
      [{ ref: '#302', title: 'Archived branch to review', why: 'requires human judgment' }],
      'git log -1 archived-branch',
    ),
  ];

  const cleanLines = [
    'residue             12 checked',
    'orphaned-plans       — checked',
  ];

  return `## Tidy Report — 2026-08-28

**Applied automatically**
\`\`\`text
${appliedLines.join('\n')}
\`\`\`

**Approve (1)**
\`\`\`text
${approveLines.join('\n')}
\`\`\`

**Yours (2)**
\`\`\`text
${yoursLines.join('\n')}
\`\`\`

**Clean:**
\`\`\`text
${cleanLines.join('\n')}
\`\`\`

Full decision log: .claude-tweaks/pipelines/2026-08-28T120000-tidy-standalone/decisions.md
`;
}

module.exports = { conformantReport };
