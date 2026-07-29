# /init Argument Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/init`'s all-or-nothing Optional Enhancements gate and silent unrecognized-argument fallthrough with per-step Enhancement filter tokens, a stop-and-ask rule for unrecognized scope words, and a bootstrap-state marker that skips redundant Core Bootstrap re-verification while surfacing a changelog notice on version gaps.

**Architecture:** A new `bin/lib/changelog.js` provides semver comparison and CHANGELOG.md range extraction as small, independently-tested pure functions. `skills/init/SKILL.md`'s `## Input` section is rewritten to classify `$ARGUMENTS` tokens into modifier flags / Phase scopes / Enhancement filter tokens, with an explicit stop-and-ask path for anything unrecognized. A new "Core Bootstrap Version Check" runs before Phase 0's Steps 1-8, reading/writing a local `.claude-tweaks/init-state.yml` marker and calling into `bin/lib/changelog.js` for the version comparison and notice synthesis.

**Tech Stack:** Node.js (`node:test`, `node:assert/strict` — matches this repo's existing `bin/lib/*.js` + `tests/*.test.js` convention), Markdown (SKILL.md files).

## Global Constraints

- Working directory for every task: the worktree at
  `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design`,
  branch `worktree-init-input-args-design`. Every git command in every task must start with
  `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design"`
  and verify with `pwd && git rev-parse --show-toplevel` before `git add`/`git commit` — CWD does
  not propagate reliably to a dispatched subagent.
- Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`'s `version` field as the sole source of
  truth for the installed plugin version — never hardcode a version string anywhere else.
- `argument-hint` in `skills/init/SKILL.md`'s frontmatter must stay in sync with the `## Input`
  section's actual content (this repo's own frontmatter convention).
- No emojis in skill files.
- Design doc: `docs/superpowers/specs/2026-07-29-init-argument-handling-design.md` — this is a
  design-mode build (brainstorm → design doc → writing-plans → SDD, skipping `/specify`); the
  design doc and this plan stay under `docs/superpowers/specs/`/`docs/superpowers/plans/`
  permanently, not deleted at wrap-up.
- Code style for new `bin/lib/*.js` files: `'use strict';` header, single quotes, semicolons,
  2-space indent, `module.exports = { ... }` — matches `bin/lib/routine-template-parser.js`.

---

### Task 1: `bin/lib/changelog.js` — semver comparison + changelog range extraction

**Files:**
- Create: `bin/lib/changelog.js`
- Create: `tests/changelog.test.js`

**Interfaces:**
- Produces: `compareVersions(a: string, b: string): -1|0|1` — throws `Error` on a non-`X.Y.Z`
  input. `parseChangelogVersions(changelogText: string): Array<{version, title, body}>` — one
  entry per `## v{X.Y.Z} — {title}` header found, in the order they appear in the text, `body`
  is the trimmed text between this header and the next (or end of string).
  `extractChangelogRange(changelogText: string, oldVersion: string, newVersion: string):
  Array<{version, title, body}>` — entries with `compareVersions(entry.version, oldVersion) > 0`
  AND `compareVersions(entry.version, newVersion) <= 0`, in the same order `parseChangelogVersions`
  returns them. Task 3 requires exactly these three exported names and this exact filter
  semantics (old exclusive, new inclusive).

- [ ] **Step 1: Write the failing tests**

Create `tests/changelog.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  parseChangelogVersions,
  extractChangelogRange,
} = require('../bin/lib/changelog.js');

const SAMPLE_CHANGELOG = `# Changelog

## v3.2.0 — Third entry

Third entry body line one.
Third entry body line two.

## v3.1.0 — Second entry

Second entry body.

## v3.0.0 — First entry

First entry body.
`;

test('compareVersions returns 0 for equal versions', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
});

test('compareVersions returns -1 when the first version is older', () => {
  assert.strictEqual(compareVersions('1.0.0', '2.0.0'), -1);
});

test('compareVersions returns 1 when the first version is newer', () => {
  assert.strictEqual(compareVersions('2.0.0', '1.0.0'), 1);
});

test('compareVersions compares numerically, not lexicographically', () => {
  // Lexicographic string comparison would say "1.10.0" < "1.2.0" (char '1' < '2' at the
  // first differing position) — numerically 1.10.0 > 1.2.0. This proves it isn't a string compare.
  assert.strictEqual(compareVersions('1.2.0', '1.10.0'), -1);
  assert.strictEqual(compareVersions('1.10.0', '1.2.0'), 1);
});

test('compareVersions throws a clear error on a non-semver input', () => {
  assert.throws(() => compareVersions('abc', '1.0.0'), /Invalid semver version/);
});

test('parseChangelogVersions extracts every entry in file order with trimmed bodies', () => {
  const entries = parseChangelogVersions(SAMPLE_CHANGELOG);
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(
    entries.map((e) => e.version),
    ['3.2.0', '3.1.0', '3.0.0'],
  );
  assert.strictEqual(entries[0].title, 'Third entry');
  assert.strictEqual(entries[0].body, 'Third entry body line one.\nThird entry body line two.');
  assert.strictEqual(entries[2].body, 'First entry body.');
});

test('extractChangelogRange excludes the old version and includes the new version', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '3.0.0', '3.2.0');
  assert.deepStrictEqual(
    range.map((e) => e.version),
    ['3.2.0', '3.1.0'],
  );
});

test('extractChangelogRange returns an empty array when old and new versions match', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '3.2.0', '3.2.0');
  assert.deepStrictEqual(range, []);
});

test('extractChangelogRange works by pure semver comparison even when the old version has no matching entry in the text', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '2.5.0', '3.0.0');
  assert.deepStrictEqual(
    range.map((e) => e.version),
    ['3.0.0'],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && node --test tests/changelog.test.js
```

Expected: FAIL — `Cannot find module '../bin/lib/changelog.js'`.

- [ ] **Step 3: Implement `bin/lib/changelog.js`**

```js
'use strict';

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) {
    throw new Error(`Invalid semver version: "${v}"`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a, b) {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

const HEADER_RE = /^## v(\d+\.\d+\.\d+) — (.+)$/gm;

function parseChangelogVersions(changelogText) {
  const matches = [...changelogText.matchAll(HEADER_RE)];
  return matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : changelogText.length;
    return {
      version: match[1],
      title: match[2].trim(),
      body: changelogText.slice(start, end).trim(),
    };
  });
}

function extractChangelogRange(changelogText, oldVersion, newVersion) {
  return parseChangelogVersions(changelogText).filter(
    (entry) =>
      compareVersions(entry.version, oldVersion) > 0 &&
      compareVersions(entry.version, newVersion) <= 0,
  );
}

module.exports = { compareVersions, parseChangelogVersions, extractChangelogRange };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && node --test tests/changelog.test.js
```

Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && pwd && git rev-parse --show-toplevel && git add bin/lib/changelog.js tests/changelog.test.js && git commit -m "Add bin/lib/changelog.js: semver comparison + changelog range extraction"
```

---

### Task 2: Restructure `/init`'s `## Input` section — Enhancement filter tokens, parsing, combinability, clarification

**Files:**
- Modify: `skills/init/SKILL.md` (frontmatter `argument-hint`, `## Input` section, Phase 0
  "Optional Enhancements" preamble line)
- Modify: `skills/help/reference-card.md` (line 9 — the `/init` argument-hint restatement)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the 8 recognized Enhancement filter token names (`issue-form`,
  `design-integration`, `diagram-suggestions`, `shadcn-integration`, `cloud-parity`, `routines`,
  `branch-tracking`, `work-backend`) that Task 3's new subsection references by name.

- [ ] **Step 1: Update the frontmatter `argument-hint`**

In `skills/init/SKILL.md`, replace:

```
argument-hint: "[<path>|<github-url>|<description>|--update|update|--full|--core-only|bootstrap|config|skills|journeys|docs]"
```

with:

```
argument-hint: "[<path>|<github-url>|<description>|--update|update|--full|--core-only|bootstrap|config|skills|journeys|docs|issue-form|design-integration|diagram-suggestions|shadcn-integration|cloud-parity|routines|branch-tracking|work-backend]"
```

- [ ] **Step 2: Rewrite the `## Input` section**

In `skills/init/SKILL.md`, replace this entire block:

```
## Input

If `$ARGUMENTS` is provided, treat it as:
- A path to a repository (e.g., `~/projects/their-app`) — `cd` there first
- A GitHub URL — clone it first, then analyze
- A description of the project context (e.g., "Ruby on Rails monolith, team of 5")
- `--update` or `update` — force Update mode even if the config looks minimal
- `--full` — force the complete reconnaissance pass (Phases 2-8.5) even when Update Mode's Phase 1u.6 early-exit gate would otherwise skip straight to Phase 9; composes with `--update`/`update` (e.g. `update --full`)
- `--core-only` — within Phase 0, skip the Optional Enhancements (Steps 9-16) entirely, equivalent to auto-declining every optional-enhancement offer, then continue into whatever scope this invocation would otherwise run; composes with any goal-based scope below (e.g. `bootstrap --core-only` for a fully non-interactive, structure-only bootstrap)
- `bootstrap` — run Phase 0 only (structure + deps), then stop
- `config` — run Phases 0 + 2 + 3 + 5 (bootstrap + recon + CLAUDE.md)
- `skills` — run Phases 0 + 2 + 3 + 4 + 6 (bootstrap + recon + skills)
- `journeys` — run Phases 0 + 8 (bootstrap + journey discovery)
- `docs` — run Phases 0 + 2 + 3 + 8.5 (bootstrap + doc registry)

Every scope above still runs Phase 9 as its terminal summary/confirm/write step, except `bootstrap` (which stops the invocation after Phase 0) — this includes the goal-based scopes (`config`, `skills`, `journeys`, `docs`) even though none of them list Phase 9 explicitly in their phase subset above. The interactive Scope Selection Gate's own early-stop choices (Option 4 "Done," and Option 2 Interactive's per-phase "Done") are the other paths that stop before Phase 9; see "Finalizing the worktree.always Decision" for why this distinction matters.

If no arguments, analyze the current working directory. Phase 0 runs first, then a scope selection gate determines which remaining phases to run (see "Scope Selection Gate" below).
```

with:

```
## Input

If `$ARGUMENTS` resolves to a path to a repository (e.g., `~/projects/their-app`) or a GitHub URL, `cd`/clone there first, then analyze — evaluated before any token classification below.

Otherwise, `$ARGUMENTS` splits on whitespace into tokens. Each token classifies as one of:

**Modifier flags** — compose with anything else present:
- `--update` or `update` — force Update mode even if the config looks minimal
- `--full` — force the complete reconnaissance pass (Phases 2-8.5) even when Update Mode's Phase 1u.6 early-exit gate would otherwise skip straight to Phase 9; composes with `--update`/`update` (e.g. `update --full`)
- `--core-only` — within Phase 0, skip the Optional Enhancements (Steps 9-16) entirely, equivalent to auto-declining every optional-enhancement offer. Contradicts any Enhancement filter token below present in the same invocation — see "Unrecognized and conflicting tokens."

**Phase scopes** — determine which of Phases 2-8.5 run after Phase 0. The union of every Phase scope present runs (e.g. `skills journeys` runs the phases for both). No Phase scope present means: stop after Phase 0, same as `bootstrap` alone.
- `bootstrap` — run Phase 0 only (structure + deps), then stop
- `config` — run Phases 0 + 2 + 3 + 5 (bootstrap + recon + CLAUDE.md)
- `skills` — run Phases 0 + 2 + 3 + 4 + 6 (bootstrap + recon + skills)
- `journeys` — run Phases 0 + 8 (bootstrap + journey discovery)
- `docs` — run Phases 0 + 2 + 3 + 8.5 (bootstrap + doc registry)

**Enhancement filter tokens** — narrow which of Phase 0's Optional Enhancements (Steps 9-16) get offered. With none present, Phase 0 offers all 8 (or none, under `--core-only`). With one or more present, Phase 0 offers *only* the named step(s), regardless of which (if any) Phase scope is also present:

| Token | Runs |
|---|---|
| `issue-form` | Step 9 — GitHub issue form template |
| `design-integration` | Step 10 — Impeccable design integration |
| `diagram-suggestions` | Step 11 — Diagram suggestions |
| `shadcn-integration` | Step 12 — shadcn bootstrap |
| `cloud-parity` | Step 13 — Cloud/Routine parity setup, alone |
| `routines` | Step 14 — Routine installation. Hard-depends on Step 13 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 13 first anyway, matching the unfiltered flow's existing 13-before-14 ordering |
| `branch-tracking` | Step 15 — Non-default-branch issue tracking |
| `work-backend` | Step 16 — Work-record backend |

Examples: `routines` alone runs Steps 1-8, then only Steps 13+14, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8, then only Steps 13+14, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8, then only Steps 12 and 15, then stops.

A description of the project context (e.g., "Ruby on Rails monolith, team of 5") is still accepted as free text — see "Unrecognized and conflicting tokens" for how this is distinguished from an attempted-but-unmatched keyword.

Every Phase scope above still runs Phase 9 as its terminal summary/confirm/write step, except `bootstrap` (which stops the invocation after Phase 0) — this includes the goal-based scopes (`config`, `skills`, `journeys`, `docs`) even though none of them list Phase 9 explicitly in their phase subset above. An invocation with one or more Enhancement filter tokens and no Phase scope also stops after Phase 0, same as `bootstrap` — Enhancement filter tokens narrow *what Phase 0 does*, they don't add phases after it. The interactive Scope Selection Gate's own early-stop choices (Option 4 "Done," and Option 2 Interactive's per-phase "Done") are the other paths that stop before Phase 9; see "Finalizing the worktree.always Decision" for why this distinction matters.

If no arguments, analyze the current working directory. Phase 0 runs first, then a scope selection gate determines which remaining phases to run (see "Scope Selection Gate" below).

### Unrecognized and conflicting tokens

If every token classifies into one of the three categories above (or the whole string is a path/URL), proceed as described. If a token matches none of them:

- If the overall string reads as prose (contains a comma, or multiple natural-language words forming a sentence, e.g. "Ruby on Rails monolith, team of 5") — treat the whole string as a project-context description, no interruption. Unchanged from before.
- Otherwise (a single unmatched token, or a short sequence of tokens that looks like an attempted scope rather than prose) — stop before running anything. Call `AskUserQuestion`: name the unrecognized token(s), list the valid tokens grouped by category (modifier flags / Phase scopes / Enhancement filter tokens), and include an explicit "No — treat this literally as a project-context description" option, so a genuine single-word description (e.g. "monorepo") still works, at the cost of one confirmation. Do not silently guess either interpretation — this matches `/claude-tweaks:tidy`'s "Unknown scope name" handling, `/claude-tweaks:capture`'s "Unknown or invalid `N`" handling, and `/claude-tweaks:version`'s "not silently treated as any of the documented modes" rule.

An explicit Enhancement filter token given together with `--core-only` is a contradiction (one asks for exactly that step, the other asks for none) — report it the same way: state plainly that the two conflict and ask which was meant, rather than silently letting one win.
```

- [ ] **Step 3: Update the Phase 0 "Optional Enhancements" preamble**

In `skills/init/SKILL.md`, replace:

```
**Optional Enhancements (Steps 9–16):** Skipped entirely when `$ARGUMENTS` contains `--core-only` — treat every offer below as declined with no prompt shown, and proceed straight to whatever this invocation runs after Phase 0 (the Scope Selection Gate, or a composed goal-based scope).
```

with:

```
**Optional Enhancements (Steps 9–16):** Skipped entirely when `$ARGUMENTS` contains `--core-only` — treat every offer below as declined with no prompt shown, and proceed straight to whatever this invocation runs after Phase 0 (the Scope Selection Gate, or a composed goal-based scope). Narrowed to a subset when `$ARGUMENTS` contains one or more Enhancement filter tokens — see the `## Input` section's Enhancement filter tokens table for the full list and the `routines`/`cloud-parity` ordering note.
```

- [ ] **Step 4: Sync the stale cross-reference in `skills/help/reference-card.md`**

In `skills/help/reference-card.md`, replace:

```
| `/claude-tweaks:init` | Bootstrap structure, generate CLAUDE.md, skills, rules | `[<path>\|<github-url>\|<description>\|--update\|update\|--full\|--core-only\|bootstrap\|config\|skills\|journeys\|docs]` |
```

with:

```
| `/claude-tweaks:init` | Bootstrap structure, generate CLAUDE.md, skills, rules | `[<path>\|<github-url>\|<description>\|--update\|update\|--full\|--core-only\|bootstrap\|config\|skills\|journeys\|docs\|issue-form\|design-integration\|diagram-suggestions\|shadcn-integration\|cloud-parity\|routines\|branch-tracking\|work-backend]` |
```

- [ ] **Step 5: Verify — read back and cross-check**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && grep -n "argument-hint" skills/init/SKILL.md && grep -c "issue-form\|design-integration\|diagram-suggestions\|shadcn-integration\|cloud-parity\|routines\|branch-tracking\|work-backend" skills/init/SKILL.md skills/help/reference-card.md
```

Expected: the `argument-hint` line prints with all 8 new tokens present; the grep count is
non-zero in both files (confirms the table and the reference-card sync both landed).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && pwd && git rev-parse --show-toplevel && git add skills/init/SKILL.md skills/help/reference-card.md && git commit -m "Restructure /init's Input section: Enhancement filter tokens, combinability, unknown-token clarification"
```

---

### Task 3: Core Bootstrap Version Check — bootstrap-state marker + changelog notice

**Files:**
- Modify: `skills/init/SKILL.md` (new "Core Bootstrap Version Check" subsection, inserted
  between the "## Phase 0: Bootstrap Structure" intro paragraph and the "**Core Bootstrap
  (Steps 1–8):**" line)
- Modify: `skills/init/bootstrap-steps.md` (new "Core Bootstrap Version Check (detailed
  procedure)" section; Step 4's `.gitignore` suggestion block gains one entry)

**Interfaces:**
- Consumes: Task 1's `bin/lib/changelog.js` — `compareVersions`, `extractChangelogRange`
  (exact names, exact signatures from Task 1).
- Produces: the `.claude-tweaks/init-state.yml` marker file shape
  (`core-bootstrap.plugin-version`, `core-bootstrap.verified`) — no other task reads this.

- [ ] **Step 1: Insert the "Core Bootstrap Version Check" subsection in `skills/init/SKILL.md`**

Replace:

```
## Phase 0: Bootstrap Structure

Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

**Core Bootstrap (Steps 1–8):**
```

with:

```
## Phase 0: Bootstrap Structure

Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

### Core Bootstrap Version Check (runs before Step 1)

Before running Steps 1-8, read `.claude-tweaks/init-state.yml` (treat as absent if missing or malformed) and compare its `core-bootstrap.plugin-version` against `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`'s `version` field (the same field `/claude-tweaks:version` treats as the sole source of truth) via `bin/lib/changelog.js`'s `compareVersions`. Read `bootstrap-steps.md` ("Core Bootstrap Version Check") for the exact commands.

| Marker state | Action |
|---|---|
| Missing | Run Steps 1-8 fully. No changelog notice — nothing to diff against yet. |
| Present, versions match (or marker is somehow newer — treat identically) | Skip Steps 1-8 entirely; print a one-line confirmation instead. |
| Present, marker version older than installed | Run Steps 1-8 fully, then surface the changelog notice below. |

**Changelog notice (version-mismatch case only).** Read the project's `CHANGELOG.md` and call `bin/lib/changelog.js`'s `extractChangelogRange` for the range between the marker's old version (exclusive) and the installed version (inclusive). Synthesize a short summary limited to entries that change what `/init` offers, writes to CLAUDE.md, or exposes as a scope/config key — omit internal-only entries (bug fixes, refactors with no `/init`-visible behavior change). Present as an informational note, not a gate, ending with a pointer to `/init update --full` (or a narrower scope) if the user wants to act on anything it surfaces. No cap on how large the range is — if it spans an unusually large number of releases, say so explicitly.

**Write the marker** immediately after this check concludes, regardless of which branch ran — unlike the `worktree.always` decision (see "Finalizing the worktree.always Decision" below), this write creates no new gate that could deny this same invocation's own remaining steps, so there is no need to defer it. Create `.claude-tweaks/` if it doesn't exist yet.

**Core Bootstrap (Steps 1–8):**
```

- [ ] **Step 2: Add the detailed procedure to `skills/init/bootstrap-steps.md`**

Insert this new section immediately before the `## Core Bootstrap Steps` heading:

```
## Core Bootstrap Version Check (detailed procedure)

Runs before Step 1, on every `/init` invocation regardless of scope.

**Read the marker:**

```bash
cat .claude-tweaks/init-state.yml 2>/dev/null || echo "MISSING"
```

`init-state.yml` only ever has one top-level key (`core-bootstrap`) with two flat children
(`plugin-version`, `verified`) — read `plugin-version` directly, no general YAML parser needed.

**Read the installed version:**

```bash
node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/.claude-plugin/plugin.json').version)"
```

**Compare (only when the marker is present):**

```bash
node -e "
  const { compareVersions } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  console.log(compareVersions(process.argv[1], process.argv[2]));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Prints `-1` (marker older than installed), `0` (match), or `1` (marker newer — shouldn't happen
in practice, treat identically to a match).

- Marker missing → run Steps 1-8 fully, skip the changelog notice.
- Result `0` or `1` → skip Steps 1-8; print `"Core bootstrap already verified at v{installed} on {verified date} — skipping Steps 1-8."`
- Result `-1` → run Steps 1-8 fully, then run the changelog notice below.

**Changelog notice:**

```bash
node -e "
  const fs = require('fs');
  const { extractChangelogRange } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  const changelog = fs.readFileSync(process.env.CLAUDE_PLUGIN_ROOT + '/CHANGELOG.md', 'utf8');
  console.log(JSON.stringify(extractChangelogRange(changelog, process.argv[1], process.argv[2])));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Read the returned `{version, title, body}` entries and synthesize the filtered summary
described in `SKILL.md`'s "Core Bootstrap Version Check" section.

**Write the marker:**

```bash
mkdir -p .claude-tweaks
cat > .claude-tweaks/init-state.yml <<EOF
core-bootstrap:
  plugin-version: "$INSTALLED_VERSION"
  verified: "$(date -u +%Y-%m-%d)"
EOF
```

`init-state.yml` only ever has this one key today — a full overwrite is safe. If a future
change adds other top-level keys to this file, switch to a merge instead of an overwrite.

---

```

(The trailing `---` matches this file's existing section-separator convention — verify the
following line is still the pre-existing `## Core Bootstrap Steps` heading after this insert.)

- [ ] **Step 3: Add the gitignore entry in `skills/init/bootstrap-steps.md`'s Step 4**

Find this line inside Step 4's gitignore code block:

```
.claude-tweaks/routine-environment-cache.yml
```

Add immediately after it, inside the same code block:

```
.claude-tweaks/init-state.yml
```

- [ ] **Step 4: Smoke-test the wiring against this repo's real files**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && node -e "
  const fs = require('fs');
  const { compareVersions, extractChangelogRange } = require('./bin/lib/changelog.js');
  console.log('compare 6.0.0 vs installed:', compareVersions('6.0.0', require('./.claude-plugin/plugin.json').version));
  const changelog = fs.readFileSync('./CHANGELOG.md', 'utf8');
  const range = extractChangelogRange(changelog, '6.19.0', require('./.claude-plugin/plugin.json').version);
  console.log('entries in range:', range.length, range.map(e => e.version));
"
```

Expected: the compare prints `-1` or `0`; the range lists at least the real `v6.19.0`
through the current installed version's changelog entries with non-empty version strings —
confirms the `require` paths and function signatures work against real project content, not
just Task 1's isolated fixture.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && pwd && git rev-parse --show-toplevel && git add skills/init/SKILL.md skills/init/bootstrap-steps.md && git commit -m "Add Core Bootstrap Version Check: bootstrap-state marker + changelog notice"
```

---

### Task 4: Version bump + CHANGELOG.md entry

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing new — this is release bookkeeping for Tasks 1-3's combined change.

- [ ] **Step 1: Check for a concurrent version bump before choosing the new version**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && git fetch origin main && git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

Read the current `version` in `.claude-plugin/plugin.json` (as of writing this plan: `6.21.0`).
This is a minor-version bump (feature addition, per this repo's versioning convention). If the
log above shows a bump already landed on `origin/main` at or above the next minor
(`6.22.0`), use the next free minor version instead (e.g. `6.23.0`); otherwise use `6.22.0`.

- [ ] **Step 2: Bump `.claude-plugin/plugin.json`**

Update the `version` field to the version chosen in Step 1.

- [ ] **Step 3: Add the CHANGELOG.md entry**

Insert this new section immediately after the `# Changelog` heading, before the existing most
recent entry (substitute the actual version chosen in Step 1 for `6.22.0` below if it differs):

```markdown
## v6.22.0 — /init argument-handling: enhancement filter tokens + bootstrap-state versioning

`/claude-tweaks:init --routines` previously fell silently through to the free-text
"project description" branch, since `--routines` wasn't a recognized scope keyword — Phase 0's
Optional Enhancements (Steps 9-16) were all-or-nothing (`--core-only` or everything), so there
was no way to ask for just one. `/init`'s `## Input` section now recognizes eight Enhancement
filter tokens (one per Optional Enhancement step; `cloud-parity`/`routines` split Steps 13/14
since wanting cloud parity without ever scheduling a Routine is a real, separate case), narrows
Phase 0 to only the named step(s) when present, and composes freely with goal-based Phase
scopes and modifier flags. An unrecognized token now stops and asks instead of silently
guessing (matching the existing `/tidy`/`/capture`/`/version` precedent) rather than being
misread as descriptive text. Separately, a new local `.claude-tweaks/init-state.yml` marker
records the plugin version that last verified Steps 1-8 (Core Bootstrap), letting an
unchanged-version re-run skip that re-verification entirely; a version mismatch instead
re-runs Steps 1-8 and surfaces a filtered summary of `CHANGELOG.md` entries relevant to
`/init`'s own behavior since the recorded version. New `bin/lib/changelog.js` provides the
semver comparison and range-extraction the version check needs.
```

- [ ] **Step 4: Run the full test suite**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && npm test
```

Expected: PASS — all suites, including the new `tests/changelog.test.js`, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/init-input-args-design" && pwd && git rev-parse --show-toplevel && git add .claude-plugin/plugin.json CHANGELOG.md && git commit -m "Bump to 6.22.0 for /init argument-handling redesign"
```

**Note for the human:** this bumps the local plugin version on this feature branch only. The
marketplace-mirror repo (`thomasholknielsen/claude-tweaks-marketplace`) update and any
merge/push to `main` are separate, explicit actions for after this branch is reviewed and
finished (`/superpowers:finishing-a-development-branch`) — not part of this plan.
