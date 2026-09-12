'use strict';

// tests/release-skill-reference-form.test.js (#2256, Task 8) — pins that every
// skill reference inside `/claude-tweaks:release`'s actionable text (the body
// of every `## Step` section, plus the terminal `## Next Actions` block, in
// SKILL.md, console.md, execute.md and bookkeeping.md) uses the
// fully-qualified `/claude-tweaks:{skill}` form. `docs/skill-authoring.md`
// requires the qualified form in actionable instruction text — a bare
// `/{skill}` there fails the `Skill` tool with "Unknown skill" at invocation
// time — and reserves bare short-form references for descriptive prose
// (Lifecycle lines, `## When to Use`, Anti-Patterns tables), which this test
// does not scan.
//
// Two literals name a decisions-log section, not a skill invocation, and are
// never references: the `## /release` heading this skill's own log lines
// live under, and its `--section "/release"` argument. A `## /review` mention
// (SKILL.md's Step 3, reading `/claude-tweaks:review`'s decisions-log block)
// is the same exemption class. A `/` preceded by a path character (a letter,
// `.`, `}`, or another `/`) is a path segment, never a reference, e.g.
// `plugin/skills/release/SKILL.md`, `${CLAUDE_PLUGIN_ROOT}/bin/release-local.js`,
// `staged/release-held.md`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listSkillDirs } = require('../plugin/bin/lib/skill-audit/skill-catalog');

const ROOT = path.join(__dirname, '..');
const PLUGIN_ROOT = path.join(ROOT, 'plugin');
const RELEASE_DIR = path.join(PLUGIN_ROOT, 'skills', 'release');

const SKILL_NAMES = listSkillDirs(PLUGIN_ROOT);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Slices `text` into `{heading, body}` sections on line-start `## ` headings
// — the same anchoring pattern as
// tests/feedback-next-actions-plain-markdown-conformance.test.js's
// `section()`, generalized to return every section instead of one named
// heading. A `### ` sub-heading (execute.md's `### pr-first` / `### local-merge`)
// does not match `^## ` and so stays inside its parent `## Step N` body.
function splitSections(text) {
  const heads = [...text.matchAll(/^## (.+)$/gm)];
  return heads.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    return { heading: m[1].trim(), body: text.slice(start, end) };
  });
}

// Actionable = a `## Step ...` heading, or exactly `## Next Actions`.
// Everything else — `## When to Use`, `## Input`, `## --train semantics`,
// `## Component-Skill Contract`, `## Anti-Patterns`, and (in the sub-files)
// `## Inputs`, `## The table`, `## Gates`, `## Auto mode`, `## Log lines`,
// `## When this step runs`, the `` `work-backend: ...` `` headings,
// `## Failures never abort the loop`, `## Summary lines` — is descriptive
// prose per docs/skill-authoring.md and is exempt. console.md and
// bookkeeping.md carry no heading matching either rule, so they contribute
// no actionable sections at all; execute.md's `## Step 5: Execute` and
// `## Step 6: Verify` do.
function actionableSections(text) {
  return splitSections(text).filter(
    (s) => s.heading === 'Next Actions' || /^Step\b/.test(s.heading),
  );
}

// Finds bare `/{skillName}` references inside `body`: a `/` immediately
// followed by a shipped skill name at a word boundary, that is not part of
// `/claude-tweaks:{name}`, not one of the two log-section literal shapes
// (`## /release`/`## /review` or `--section "/release"`), and not a path
// segment (a `/` preceded by a letter, `.`, `}`, or another `/`).
function findBareReferences(body, skillNames) {
  const namesPattern = skillNames.map(escapeRegExp).join('|');
  const re = new RegExp(
    `(?<!claude-tweaks:)(?<!--section ")(?<!## )(?<![A-Za-z.}/])/(?:${namesPattern})\\b`,
    'g',
  );
  const violations = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    violations.push(m[0]);
  }
  return violations;
}

// The scanner under test: reads every `plugin/skills/release/*.md` file,
// slices its actionable sections, and returns every bare reference found,
// tagged with the file and heading it came from.
function scanReleaseSkillFiles(dir, skillNames) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const violations = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const section of actionableSections(text)) {
      for (const ref of findBareReferences(section.body, skillNames)) {
        violations.push(`${file} (## ${section.heading}): ${ref}`);
      }
    }
  }
  return violations;
}

test('release skill fixtures: scanner reports a bare reference (AC 7)', () => {
  const bare = findBareReferences('## Step 1\nRun /release now.\n', SKILL_NAMES);
  assert.deepEqual(bare, ['/release']);
});

test('release skill fixtures: scanner passes a fully-qualified reference (AC 7)', () => {
  const qualified = findBareReferences('## Step 1\nRun /claude-tweaks:release now.\n', SKILL_NAMES);
  assert.deepEqual(qualified, []);
});

test('release skill fixtures: a bare /review reference is also reported', () => {
  // Kept as a third, permanent fixture proving the scanner discriminates on a
  // second skill name, not just the one this skill happens to be named for.
  const bare = findBareReferences('## Step 1\nInvoke /review base:{base}.\n', SKILL_NAMES);
  assert.deepEqual(bare, ['/review']);
});

test('release skill fixtures: path segments and log-section literals are exempt', () => {
  const clean = findBareReferences(
    '## Step 1\nRead plugin/skills/release/console.md and staged/release-held.md; log with --section "/release".\n',
    SKILL_NAMES,
  );
  assert.deepEqual(clean, []);
});

test('release skill: actionable text uses only the fully-qualified reference form', () => {
  const violations = scanReleaseSkillFiles(RELEASE_DIR, SKILL_NAMES);
  assert.deepEqual(
    violations,
    [],
    `bare skill references found in actionable text:\n${violations.join('\n')}`,
  );
});
