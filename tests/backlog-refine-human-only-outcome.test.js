'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REFINE_MODE_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'backlog', 'refine-mode.md');
const REFINE_LANES_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'backlog', 'refine-lanes.md');
const HUMAN_ONLY_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'backlog', 'human-only-outcome.md');

const refineModeProse = fs.readFileSync(REFINE_MODE_PATH, 'utf8');
const refineLanesProse = fs.readFileSync(REFINE_LANES_PATH, 'utf8');
const humanOnlyProse = fs.readFileSync(HUMAN_ONLY_PATH, 'utf8');

// #1317: /claude-tweaks:backlog refine had no "ready but human-only" outcome — every
// RECOMMEND_BUILD: false from grant-check was treated as "needs scoring" and flag-backed, even on
// a record that was already scored and denied for content reasons. These are the pre-change texts
// the new branch/lane replaced — used below to prove each regex actually goes red on the text it
// replaced, not just green on the new text [IL-105]. (`human-only-outcome.md` is a brand-new file
// with no pre-change text of its own — an empty string stands in as its negative control, since a
// file that didn't exist yet trivially fails to match any of these patterns.)
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

// One claim per call: the pattern must match the shipped prose AND fail against the pre-change
// text, so a green result proves the regex can actually go red [IL-105].
function assertClaimPinned(prose, pattern, preChangeText, missingMessage) {
  assert.match(prose, pattern, missingMessage);
  assert.doesNotMatch(preChangeText, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
}

test('refine-mode.md Step 3 branches RECOMMEND_BUILD: false on scored vs unscored records', () => {
  assertClaimPinned(
    refineModeProse,
    /on a record already scored \(`risk:\*` \+ `size:\*` present\) →\n {2}\*\*human-only\*\*/,
    PRE_CHANGE_STEP3_MAPPING,
    'scored-vs-unscored RECOMMEND_BUILD: false branch missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 3 keeps ready and writes no grant for a scored human-only denial, and points at the shared write-mechanics file', () => {
  assertClaimPinned(
    refineModeProse,
    /\*\*human-only\*\* \(leave `ready`, no grant, marker comment\)\. Read `human-only-outcome\.md`/,
    PRE_CHANGE_STEP3_MAPPING,
    'human-only outcome (leave ready, no grant) + cross-reference missing from refine-mode.md Step 3',
  );
});

test('refine-mode.md Step 5 Human-only rows carries no label writes and points at the shared write-mechanics file', () => {
  assertClaimPinned(
    refineModeProse,
    /\*\*Human-only rows:\*\* read `human-only-outcome\.md` in this skill's directory[\s\S]{0,120}no label writes, `ready` stays, no `auto:\*` grant is added\./,
    PRE_CHANGE_STEP5_GRANT_TAIL,
    'Human-only rows cross-reference missing from refine-mode.md Step 5',
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

test('human-only-outcome.md runs the idempotence check for an existing marker comment before lanning', () => {
  assertClaimPinned(
    humanOnlyProse,
    /gh issue view "\$ISSUE" --json comments -q '\.comments\[\] \| select\(\.body \| startswith\("<!-- backlog-refine-human-only -->"\)\) \| \.id'/,
    '',
    'idempotence marker-comment check missing from human-only-outcome.md',
  );
});

test('human-only-outcome.md posts the human-only marker comment with no accompanying label edit', () => {
  assertClaimPinned(
    humanOnlyProse,
    /<!-- backlog-refine-human-only -->\nMarked human-only by \/claude-tweaks:backlog refine/,
    '',
    'marker comment template missing from human-only-outcome.md',
  );
  assertClaimPinned(
    humanOnlyProse,
    /No label\s+edit accompanies this write/,
    '',
    'no-label-edit guarantee missing from human-only-outcome.md',
  );
});

test('human-only-outcome.md documents zero writes on a repeat pass over an already-marked record', () => {
  assertClaimPinned(
    humanOnlyProse,
    /a repeat pass over an already-marked record produces zero\s+label\/comment writes/,
    '',
    'zero-writes-on-repeat-pass guarantee missing from human-only-outcome.md',
  );
});
