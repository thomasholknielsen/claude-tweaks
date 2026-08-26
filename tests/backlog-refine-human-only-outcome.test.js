'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REFINE_MODE_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'backlog', 'refine-mode.md');
const REFINE_LANES_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'backlog', 'refine-lanes.md');
const WORK_RECORD_PATH = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'work-record.md');

const refineModeProse = fs.readFileSync(REFINE_MODE_PATH, 'utf8');
const refineLanesProse = fs.readFileSync(REFINE_LANES_PATH, 'utf8');
const workRecordProse = fs.readFileSync(WORK_RECORD_PATH, 'utf8');

// #1317: /claude-tweaks:backlog refine had no "ready but human-only" outcome — every
// RECOMMEND_BUILD: false from grant-check was treated as "needs scoring" and flag-backed, even on
// a record that was already scored and denied for content reasons. This is the pre-change text the
// new branch/lane replaced — used below to prove each regex actually goes red on the text it
// replaced, not just green on the new text [IL-105].
const PRE_CHANGE_STEP3_MAPPING = `- **\`RECOMMEND_BUILD: true\`** → \`auto:build\` (append \`+ auto:merge\` when \`RECOMMEND_MERGE\` is also
  \`true\`).
- **\`RECOMMEND_BUILD: false\`** → \`flag back (needs scoring)\`. The human may supply scoring inline as
  a free-text override instead of flagging back — the gate then stamps the supplied \`risk:*\`/
  \`size:*\` labels alongside the grant (Step 5).
`;

const PRE_CHANGE_STEP5_GRANT_TAIL = `Stripping \`bot:blocked\` in the same edit as the grant matters: without it, the record carries both \`bot:blocked\` and a fresh \`auto:build\`, and \`/claude-tweaks:dispatch\`'s skip rule ignores anything \`bot:blocked\` forever regardless of the new grant.

**Dependency-repair rows:**
`;

const PRE_CHANGE_LOG_TEMPLATES = `AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
AUTO {time} — Backlog refine: skipped #{n} — premise changed since confirmation ({what changed}); dropped without writing.
FAILED {time} — Backlog refine: {priority | Related | grant | dependency-repair | flag-back} write failed on #{n}: {error}.
`;

const PRE_CHANGE_LANES_PRECEDENCE = `One lane per record, precedence: Re-authorize → Grant → Flag-back (populated during the run by
Step 3.5 downgrades) → Priority (annotation-line when the record is already laned above) →
Dependency repair (annotation-line when the record is already laned) → Needs you (residual:
\`needs:definition\` records, then judgment-required rows; interactive launchers, no paste block).
`;

const PRE_CHANGE_LANES_GRANT_TO_FLAGBACK = `## Flag-back

Population: rows that reached this lane before Step 4 ever rendered — Step 3's
\`RECOMMEND_BUILD: false\` recommendation (\`flag back (needs scoring)\`; the human may instead supply
\`risk:*\`/\`size:*\` inline as a free-text override rather than accepting the flag-back — Step 5) and
Step 3.5's body-shape auto-downgrade (a row Step 3 recommended granting whose body failed the
spec-shape re-check immediately before Step 4).
`;

const PRE_CHANGE_WORK_RECORD_REFINE_ROW = `| **\`/backlog refine\`** (write mode, human present) | \`auto:build\`, \`auto:merge\` (human-confirmed), \`priority:*\` (human-confirmed via batch-apply), updates the \`**Related:**\` body line (human-confirmed), scoring supplied inline | \`ready\` (flag back), \`bot:blocked\` (re-grant strip) | granting on a headless path, adding any \`bot:*\`, \`risk:*\`/\`size:*\` beyond the inline-override case, body-shaping beyond the \`**Related:**\` line |
`;

// One claim per call: the pattern must match the shipped prose AND fail against the pre-change
// text, so a green result proves the regex can actually go red [IL-105].
function assertClaimPinned(prose, pattern, preChangeText, missingMessage) {
  assert.match(prose, pattern, missingMessage);
  assert.doesNotMatch(preChangeText, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
}

test('refine-mode.md Step 3 branches RECOMMEND_BUILD: false on scored vs unscored records', () => {
  assertClaimPinned(
    refineModeProse,
    /a record that already carries \*\*both\*\* `risk:\*` and `size:\*`/,
    PRE_CHANGE_STEP3_MAPPING,
    'scored-vs-unscored RECOMMEND_BUILD: false branch missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 3 keeps ready and writes no auto:* grant for a scored human-only denial', () => {
  assertClaimPinned(
    refineModeProse,
    /\*\*human-only\*\*: leave `ready` in place, write no `auto:\*` grant/,
    PRE_CHANGE_STEP3_MAPPING,
    'human-only outcome (leave ready, no grant) missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 3 runs an idempotence check for an existing human-only marker comment before lanning', () => {
  assertClaimPinned(
    refineModeProse,
    /<!-- backlog-refine-human-only -->/,
    PRE_CHANGE_STEP3_MAPPING,
    'human-only marker comment idempotence check missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 3 skips every Step 5 write for an already-marked record', () => {
  assertClaimPinned(
    refineModeProse,
    /zero label\/comment writes on the repeat pass/,
    PRE_CHANGE_STEP3_MAPPING,
    'zero-writes-on-repeat-pass idempotence guarantee missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 5 posts a marker-only comment for Human-only rows, no label writes', () => {
  assertClaimPinned(
    refineModeProse,
    /\*\*Human-only rows:\*\* For every row lanned Human-only in Step 4[\s\S]{0,200}no label writes at all: `ready` stays, no `auto:\*` grant is added\./,
    PRE_CHANGE_STEP5_GRANT_TAIL,
    'Human-only rows write mechanics missing from refine-mode.md Step 5',
  );
});

test('refine-mode.md Step 5 decisions.md log templates cover the human-only write and its failure', () => {
  assertClaimPinned(
    refineModeProse,
    /AUTO \{time\} — Backlog refine: marked #\{n\} human-only — kept ready, no grant\. Rationale: \{grant-check RATIONALE\}\./,
    PRE_CHANGE_LOG_TEMPLATES,
    'human-only AUTO log template missing from refine-mode.md Step 5',
  );
  assertClaimPinned(
    refineModeProse,
    /\{priority \| Related \| grant \| dependency-repair \| flag-back \| human-only\} write failed/,
    PRE_CHANGE_LOG_TEMPLATES,
    'human-only write type missing from refine-mode.md Step 5 FAILED log template',
  );
});

test('refine-lanes.md precedence order places Human-only between Grant and Flag-back', () => {
  assertClaimPinned(
    refineLanesProse,
    /Re-authorize → Grant → Human-only \(Step 3's scored\n`RECOMMEND_BUILD: false` branch\) → Flag-back/,
    PRE_CHANGE_LANES_PRECEDENCE,
    'Human-only lane missing from refine-lanes.md precedence order',
  );
});

test('refine-lanes.md renders a Human-only lane section with a comment-only apply block', () => {
  assertClaimPinned(
    refineLanesProse,
    /## Human-only\n\nPopulation: rows that reached this lane before Step 4 ever rendered — Step 3's scored\n`RECOMMEND_BUILD: false` branch/,
    PRE_CHANGE_LANES_GRANT_TO_FLAGBACK,
    'Human-only lane section missing from refine-lanes.md',
  );
  assertClaimPinned(
    refineLanesProse,
    /no `addLabels`\/`removeLabels`, since this lane never touches labels/,
    PRE_CHANGE_LANES_GRANT_TO_FLAGBACK,
    'comment-only (no label writes) rule missing from refine-lanes.md Human-only lane',
  );
});

test('refine-lanes.md Human-only lane documents the idempotence annotation for an already-marked record', () => {
  assertClaimPinned(
    refineLanesProse,
    /a second refine run over an already-marked record produces zero\nlabel\/comment writes/,
    PRE_CHANGE_LANES_GRANT_TO_FLAGBACK,
    'already-marked idempotence annotation missing from refine-lanes.md Human-only lane',
  );
});

test('work-record.md permission matrix documents the human-only marker comment on the /backlog refine row', () => {
  assertClaimPinned(
    workRecordProse,
    /posts a `<!-- backlog-refine-human-only -->`-marked audit comment \(no label\) on a scored `RECOMMEND_BUILD: false` record/,
    PRE_CHANGE_WORK_RECORD_REFINE_ROW,
    'human-only marker comment write missing from work-record.md permission matrix /backlog refine row',
  );
});

test('work-record.md permission matrix forbids /backlog refine from stripping ready off a human-only-marked record', () => {
  assertClaimPinned(
    workRecordProse,
    /removing `ready` from a human-only-marked record/,
    PRE_CHANGE_WORK_RECORD_REFINE_ROW,
    '"never removes ready from a human-only record" constraint missing from work-record.md permission matrix',
  );
});
