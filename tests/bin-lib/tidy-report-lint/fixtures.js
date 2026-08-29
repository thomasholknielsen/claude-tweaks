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

// A genuinely condensed report (step-6-auto.md's Condense rule, "about 20
// lines"): no `decisions.md` mention anywhere (the condensed footer points
// at `report.md` instead), **Applied automatically** collapsed to one line
// with no following fence, and **Clean:** collapsed to a summary line
// instead of the fenced-scan-list or bare-"nothing" shapes the full report
// uses. This is the shape that trips the pre-#1625 linter's Footer
// once/Clean shape/Fenced-no-box-art rows when linted whole (#1625's
// regression case) — those three rows are section-shape rules meant for
// `report.md`, never the condensed chat text.
function condensedReport() {
  return `## Tidy Report — 2026-08-28

**Applied automatically** (2 applied)

**Approve (1)**
\`\`\`text
1  [defer]  #201  Update onboarding copy
   staged action: apply local-files defer
   node bin/apply-defer.js --run "$RUN_DIR" --record 201
\`\`\`

**Yours (2)**
\`\`\`text
/claude-tweaks:specify (1)
   /claude-tweaks:specify #301
git (1)
   git log -1 archived-branch
\`\`\`

**Clean:** 2 scans clean

Full report: .claude-tweaks/pipelines/2026-08-28T120000-tidy-standalone/report.md
`;
}

// A full report.md render — same section shapes as conformantReport() (the
// `decisions.md` footer, fenced/aligned sections throughout) but padded with
// extra Applied-automatically rows so the whole text exceeds the Condense
// rule's 40-line threshold, with no `Full report: {run-dir}/report.md`
// self-reference (report.md never contains one — only the condensed chat
// render does). This is the shape that trips the pre-#1625 linter's Condense
// row when linted whole (#1625's other regression case): report.md was
// never meant to be checked against a rule that only applies to the
// condensed half.
function longFullReport() {
  const appliedRows = Array.from({ length: 15 }, (_, i) => ({
    verb: 'deleted',
    ref: `#${100 + i}`,
    title: `Stale backlog record number ${i}`,
    trail: `commit abc123${i}`,
  }));
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

module.exports = { conformantReport, condensedReport, longFullReport };
