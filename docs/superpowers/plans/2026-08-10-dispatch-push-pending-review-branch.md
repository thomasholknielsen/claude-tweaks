# Dispatch: push pending-review branches and open a draft PR for durability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a dispatch-originated `/flow` run resolves to `pending-review`, push its branch to origin and open one draft PR carrying the run's Verification Brief, so the work survives the ephemeral session that built it.

**Architecture:** One new canonical `skills/_shared/` fragment holds the whole procedure (scope guard, worktree-safe push, existing-PR check, draft-PR creation, failure fallbacks, outcome record). Two consoles cite it as a gated read **immediately before they render** — `wrap-up/review-console.md` for a single-record run and `flow/multispec-review-console.md` for a dispatched bundle — because both consoles end in a blocking `AskUserQuestion` that a headless firing never returns from, so anything scheduled after the console does not run on the path this feature exists to protect. The procedure writes a three-line outcome record into the run directory, and `wrap-up/verification-brief.md` renders a `### Branch` section from it so a push or PR failure reaches the human in the same comment that carries the brief.

**Tech Stack:** Markdown skill files (`skills/**/*.md`), `node --test` prose-guard suites under `tests/`, `git` + `gh` CLI in the documented procedures.

## Global Constraints

Copied from the spec (`.claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-297/work/297-spec.md`) and this repo's CLAUDE.md. Every task's requirements implicitly include this section.

- **Commit messages must contain `refs #297`.** Never `closes #297` / `fixes #297` — the controller owns closure.
- **Work from** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297` on branch `flow/spec-295-296-297`. Before **every** commit run, in one compound command: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current`. Abort if any of the three disagrees with the values above.
- **Hard 40960-byte ceiling** per `SKILL.md` and per lazy-loaded sub-file (`bin/lib/skill-audit/tests/context-cost.test.js` fails the build past it). Never raise the ceiling; extract to a sub-file instead. Current sizes of files this plan touches, measured 2026-08-10:
  | File | Bytes | Headroom |
  |---|---|---|
  | `skills/wrap-up/review-console.md` | 39030 | 1930 |
  | `skills/dispatch/SKILL.md` | 40025 | 935 |
  | `skills/wrap-up/verification-brief.md` | 33068 | 7892 |
  | `skills/flow/multispec-review-console.md` | 26353 | 14607 |
  | `skills/dispatch/task-prompt.md` | 9449 | 31511 |
  | `skills/flow/SKILL.md` | 40903 | **57 — do not touch this file** |
- **Never run a full foreground `npm test` between an implementer's last edit and its commit** (`[IL-108]`). Run only the focused suite named in the task, commit, and leave the full suite to the controller.
- **Every regex in this plan that matches skill-file PROSE is whitespace-flexible — literal spaces are written `\s+`.** Skill markdown is hard-wrapped, so a single-line literal match returns zero while the phrase is plainly present (`[IL-66]`). Regexes matching a single line inside a fenced code block keep their literal spaces; a fenced line does not wrap. Preserve this distinction exactly as each task's test code gives it.
- Do not use emojis in skill files. Do not add "What's Next?" navigation menus.
- Every relationship between skills is stated once, in `docs/skill-graph.md` — never restated in a `SKILL.md`.
- A skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form; bare `/{skill}` is for descriptive prose only.

## File Structure

| File | Responsibility |
|---|---|
| `skills/_shared/pending-review-durability.md` (**new**) | The canonical procedure. Sole home of the scope guard, the push, the existing-PR check, the draft-PR creation, the failure taxonomy, and the outcome-record format. Both consoles cite it rather than restating it. |
| `skills/wrap-up/review-console.md` (modify) | Single-record caller. A gated-read stub placed immediately before `## Present the console`, plus one `--dry-run` bullet. |
| `skills/flow/multispec-review-console.md` (modify) | Bundle caller. The same gated-read stub placed immediately before `## Present the consolidated console`, plus one clause in the "When to run" list. |
| `skills/wrap-up/verification-brief.md` (modify) | The consumer of the outcome record — renders a `### Branch` section in the brief so failures are visible to a human. |
| `skills/dispatch/SKILL.md` (modify) | Retire the stale "the branch sits waiting for a human" claim in the Reporting section. |
| `skills/dispatch/task-prompt.md` (modify) | Tell the reporting agent, inside its own prompt, that a durability PR still reports `pending-review`, never `pr-opened`. |
| `tests/pending-review-durability.test.js` (**new**) | Prose guards pinning every acceptance criterion that is a statement about the procedure or its wiring. |

## Acceptance-criteria traceability

| AC | Where it is satisfied |
|---|---|
| 1 — branch reachable on origin | Task 1 Step 2 (push), Task 2 / Task 3 (the callers that make it run) |
| 2 — real open draft PR, titled `{record title} (#{n})`, brief as body, against the resolved integration branch | Task 1 Step 4 |
| 3 — interactive human-run `/flow` triggers neither | Task 1 scope guard (`CLAIM_RUN_ID`), pinned by Task 1's test |
| 4 — `failed`/`blocked` triggers neither | Task 1 scope guard, pinned by Task 1's test |
| 5 — retried run detects the existing open PR and skips | Task 1 Step 3, pinned by Task 1's test |
| 6 — push failure: branch local, label/comment still post, comment notes the failure | Task 1 Step 2 + Step 5 record; Task 4 renders it into the brief |
| 7 — PR failure after push: branch on origin, comment notes the PR-open failure | Task 1 Step 4 retry-once + Step 5 record; Task 4 renders it into the brief |
| 8 — `npm test` green | Task 6 |

---

### Task 1: The canonical procedure + its guards

**Files:**
- Create: `skills/_shared/pending-review-durability.md`
- Create: `tests/pending-review-durability.test.js`

**Interfaces:**
- Produces: the file path `skills/_shared/pending-review-durability.md` (both consoles cite this exact path in Tasks 2 and 3); the run-directory outcome-record path `{run-dir}/pending-review-durability.md` and its exact three-line format `push:` / `pr:` / `branch:` (Task 4 reads it); the anchor phrases the test file matches on, which later tasks must not reword.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/pending-review-durability.test.js` with exactly this content. Each `test()` carries **one** assertion — a multi-assertion test short-circuits and hides which claim actually went missing.

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #297: a `pending-review` outcome used to leave its branch only inside the sandbox that
// built it (observed live 2026-08-09 — bundle #264,#223,#221,#220,#179 built clean, landed
// pending-review, and `git ls-remote` found nothing on origin). These guards pin the parts
// of the procedure that are statements rather than code: the scope guard that keeps it off
// interactive and failed/blocked runs, the deliberate non-reuse of the merge path's
// close-run, and the three failure fallbacks. Prose is the implementation here, so prose is
// what has to be pinned.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const DURABILITY = read('skills', '_shared', 'pending-review-durability.md');

test('the scope guard gates on CLAIM_RUN_ID as the headless signal', () => {
  assert.match(
    DURABILITY,
    /`CLAIM_RUN_ID`\s+is\s+set\s+and\s+non-empty/,
    'without an explicit CLAIM_RUN_ID gate this pushes and opens PRs for interactive human-run /flow sessions too, where the human already has the branch in their own terminal',
  );
});

test('the scope guard excludes failed and blocked outcomes', () => {
  assert.match(
    DURABILITY,
    /Never\s+push\s+or\s+open\s+a\s+PR\s+for\s+a\s+`failed`\s+or\s+`blocked`\s+outcome/,
    'pushing an incomplete or broken branch is noise, not signal — the exclusion has to be stated, not inferred from the pending-review wording',
  );
});

test('the procedure states it never calls close-run', () => {
  assert.match(
    DURABILITY,
    /never\s+calls\s+`close-run`/,
    "close-run exists in the merge path to clear the run's worktree assignment for a main-checkout merge; reusing it here would end the run's worktree enforcement for a run that is still active",
  );
});

test("the procedure states it never clears the run's worktree assignment", () => {
  assert.match(
    DURABILITY,
    /never\s+clears\s+the\s+run's\s+worktree\s+assignment/,
    'the run must stay active with its worktree assigned — the only difference after this procedure is that the branch also exists on origin',
  );
});

test('the push is issued as its own Bash call from inside the worktree', () => {
  assert.match(
    DURABILITY,
    /git -C "\{worktree-path\}" push origin \{branch\}/,
    'the worktree.always gate inspects the whole command string up front, so a chained push is denied entirely and neither half runs (IL-33)',
  );
});

test('an existing open PR on the branch is detected before creating one', () => {
  assert.match(
    DURABILITY,
    /gh pr list --repo \{owner\}\/\{repo\} --head \{branch\} --state open/,
    'a retried run reaching pending-review a second time must skip creation rather than erroring or opening a duplicate',
  );
});

test('a push failure falls back to today behavior instead of attempting the PR', () => {
  assert.match(
    DURABILITY,
    /the\s+branch\s+stays\s+local,\s+the\s+console\s+renders\s+unchanged/,
    'a failed push must degrade to exactly the pre-#297 behavior, not to a half-state that also tries to open a PR for a branch origin does not have',
  );
});

test('a PR-creation failure is retried exactly once', () => {
  assert.match(
    DURABILITY,
    /retry\s+it\s+once/,
    'the durability goal is already met once the push landed, so the PR gets one retry and then a recorded failure — never an unbounded loop and never a silent drop',
  );
});

test('the PR base ref resolves through the shared integration-branch ladder', () => {
  assert.match(
    DURABILITY,
    /`skills\/_shared\/integration-branch\.md`/,
    'four sites once answered "which branch do we target" four different ways; a fifth inline resolver is what integration-branch.md exists to prevent',
  );
});

test('the outcome record is written to the run-dir root, never staged/', () => {
  assert.match(
    DURABILITY,
    /\*\*Root,\s+never\s+`staged\/`\.\*\*/,
    "both consoles classify a staged file carrying a Title:/Type:/Labels: header as a queue write needing its own per-item approval — a status note is neither a proposal nor a work record",
  );
});

test('the outcome record carries a pr: line for the brief to render', () => {
  assert.match(
    DURABILITY,
    /^pr: \{url\} \| existing \{url\} \| failed — \{reason\} \| skipped — \{reason\}$/m,
    'verification-brief.md renders its ### Branch section from these exact fields; changing the shape here silently empties that section (IL-04)',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: the whole file errors before any test runs — `ENOENT: no such file or directory, open '.../skills/_shared/pending-review-durability.md'`.

- [ ] **Step 3: Write the procedure**

Create `skills/_shared/pending-review-durability.md` with exactly this content:

````markdown
# Pending-Review Branch Durability — push + draft PR

Canonical procedure for making a **dispatch-originated** run's branch survive the session that
built it. A `pending-review` outcome parks: the Review Console renders, nobody answers it, and in
a headless firing the container holding the branch is eventually recycled. Observed live
2026-08-09 — bundle #264,#223,#221,#220,#179 built cleanly, landed `pending-review`, and
`git ls-remote` found no branch on origin, recoverable only by resuming that exact session. This
procedure replaces "resume that exact session" with an ordinary GitHub review surface: the branch
on origin, plus one open draft PR carrying the run's Verification Brief.

Two callers, both invoking it immediately **before** their console renders:

| Caller | Invokes from |
|---|---|
| `/claude-tweaks:wrap-up`'s Review Console (`wrap-up/review-console.md`) | a single-record run — just before its `## Present the console` |
| `/claude-tweaks:flow`'s consolidated multi-spec console (`flow/multispec-review-console.md`) | a dispatched **bundle**'s run, whose per-spec consoles deferred — just before its `## Present the consolidated console` |

**Before, not after, is the whole point.** Both consoles end in a blocking `AskUserQuestion`, and a
headless firing never returns from it — `dispatch/SKILL.md`'s Reporting section calls that the
expected resting state, not an error. Anything scheduled after the console, `/claude-tweaks:wrap-up`
Phase 4's execution step included, does not run on the path this procedure exists to protect.

## Scope guard

Run this only when **all** of the following hold. Otherwise skip it entirely, log the skip line
below, and continue to the console unchanged — never an error.

1. **`CLAIM_RUN_ID` is set and non-empty.** Exactly one site in this codebase sets it — both of
   `dispatch/task-prompt.md`'s two Task-call templates, inline on the `/claude-tweaks:flow` command
   line — and no interactive, human-run `/flow` invocation ever does. A human already has the
   branch in their own terminal; there is nothing to protect.
2. **This run resolved to `pending-review`** — the console is about to render for a human. A
   `failed` or `blocked` outcome never reaches a console at all (`/claude-tweaks:flow` stops at the
   HARD-GATE, and `dispatch/settle-and-merge.md`'s Settle procedure handles it there), and the
   auto-merge short-circuit's merge path returns before this point, so an `auto:merge`'d group
   never lands here either. Never push or open a PR for a `failed` or `blocked` outcome — an
   incomplete or broken branch on origin is noise, not signal.
3. **A worktree strategy was used** — there is a feature branch distinct from the integration
   branch to push. `current-branch` mode has none; skip.

Log a skip to `decisions.md` as:
`SCANNED {time} — Pending-review durability: skipped ({reason}).`

## What this deliberately does not do

It reuses `dispatch/settle-and-merge.md`'s Auto-merge gate **push mechanics only** — the
worktree-anchored `git push` and the branch / integration-branch resolution. It does not reuse that
gate's merge-adjacent state transitions:

- It **never calls `close-run`.** That call exists there so a merge landing in the *main checkout*
  isn't denied as a wrong-checkout commit (E1), by clearing the run's worktree assignment. This
  procedure's push runs from inside the worktree, where the `worktree.always` gate permits it, so
  there is nothing to relieve.
- It **never clears the run's worktree assignment.** The run stays `active` with its worktree still
  assigned, exactly as an ordinary un-pushed `pending-review` outcome does today. The only
  difference afterwards is that the branch also exists on origin, with an open draft PR.

It also opens no auto-merge path: this is an ordinary, human-reviewed, human-merged PR. Do not add
`auto:merge`, do not enable GitHub auto-merge, and do not treat #71 (`/claude-tweaks:tidy`'s own PRs
having no merge path) as related — different skill, different provenance, and these PRs are
deliberately meant to stay human-merged.

## Step 1: Read the three values, from inside the worktree

**Shell state does not survive between Bash calls** — each invocation gets a fresh shell, so a
variable assigned in one is empty in the next. Read these first and substitute them **literally**
into every command below; never carry them in shell variables. (Same rule and same reason as
`dispatch/settle-and-merge.md`'s Auto-merge gate.)

```bash
git rev-parse --show-toplevel                       # -> {worktree-path}
git branch --show-current                           # -> {branch}
grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//'
git remote show origin | sed -n '/HEAD branch/s/.*: //p'   # only when the line above came back empty
```

The last two together resolve `{integration-branch}` — take the `grep`'s output when non-empty,
otherwise the `git remote show origin` fallback. That is this family's rank-3-then-rank-6 behavior
per `skills/_shared/integration-branch.md`; see that file for the full precedence, including the
explicit-argument and CLAUDE.md ranks this two-command shorthand collapses. It deliberately skips
that ladder's git-inference rank, which would consider whatever branch the main checkout currently
has checked out — a concurrent session switches that underfoot.

**Resolve the worktree with a bare `git rev-parse`, never `git -C "$RUN_DIR"`.** Run directories are
anchored to the **main checkout** (`_shared/pipeline-run-dir.md`'s Anchoring section), so a
run-dir-relative resolution returns the main checkout — and a push from there is exactly what the
`worktree.always` gate denies. `/claude-tweaks:wrap-up` runs inside the worktree, so its own `pwd`
is already the right answer.

## Step 2: Push the branch — its own Bash call, from inside the worktree

```bash
git -C "{worktree-path}" push origin {branch}
```

Never chain this onto anything else. The `worktree.always` policy gate inspects the whole command
string up front, so a compound invocation is denied entirely and neither half runs (CLAUDE.md's
Don'ts, `[IL-33]`).

**If the push fails** — any non-zero exit: network, auth, a rejected non-fast-forward, no `origin`
remote — stop here and do not attempt the PR. Fall back to today's behavior exactly: the branch
stays local, the console renders unchanged, and this run's acceptance labeling still applies
`demo:pending` and posts its Verification Brief whenever it runs. Record the failure per Step 5 so
it is never silently indistinguishable from success, log, and continue to the console:

`AUTO {time} — Pending-review durability: push of {branch} to origin FAILED ({reason}); branch stays local, no PR opened. Reversibility: n/a.`

## Step 3: Skip if an open PR already exists for this branch

A retried run reaching `pending-review` a second time for the same branch must not error and must
not open a duplicate. Resolve `{owner}/{repo}` once with
`gh repo view --json nameWithOwner -q .nameWithOwner`, then:

```bash
gh pr list --repo {owner}/{repo} --head {branch} --state open --json number,url
```

A non-empty result: the PR already exists. Skip creation entirely, record it per Step 5 as an
existing PR (not a failure), log, and continue to the console:

`AUTO {time} — Pending-review durability: pushed {branch}; open PR {url} already exists for it, creation skipped. Reversibility: high.`

**No forge transport available** — `_shared/forge-detection.md`'s check 1 or check 3 fails, or `gh`
is absent and `_shared/github-write-transport.md`'s CRUD mapping has no pull-request row, so there
is no MCP fallback for this operation. The push already succeeded and the durability goal is met:
skip the PR, record it per Step 5 as `pr: skipped — no forge transport`, and continue.

## Step 4: Open the draft PR

Compose the body first. It is this run's **Verification Brief**, rendered from
`wrap-up/verification-brief.md`'s Step 4 template using that file's Step 3
**"Non-testable, or testable-with-browser-unavailable"** sourcing branch — the
`/claude-tweaks:review` spec-compliance verdict and key quality notes, plus
`git diff --stat {base}...HEAD`. Composition only: do **not** run that file's Step 2.5
visual-review safety-net gate, do not post any comment, and do not apply `demo:pending`. Those
belong to acceptance labeling, which this procedure neither performs nor replaces — a draft PR is a
review surface, not a sign-off. Append this section to the composed body:

```markdown
### Branch

`{branch}` — pushed to origin and opened as a draft against `{integration-branch}` by
`/claude-tweaks:dispatch` so this work outlives the session that built it. Acceptance is still
resolved on the record with `/claude-tweaks:demo`, never here.
```

Write it to `/tmp/pending-review-pr-body-{n}.md`, then:

```bash
gh pr create --repo {owner}/{repo} --draft --base {integration-branch} --head {branch} \
  --title "{record title} (#{n})" --body-file /tmp/pending-review-pr-body-{n}.md
```

`{n}` is the record number, read from the materialized header's `record:` field
(`${RUN_DIR}/work/{n}-spec.md`); `{record title}` comes from `gh issue view {n} --json title -q .title`.

**A bundle's run holds more than one record and still gets exactly one PR** — one branch, one push,
one review surface. Use the **lowest-numbered** record for both `{n}` and `{record title}`, and list
every record in the body as one `Refs #{m}` line each. Never `Fixes`/`Closes` there. The branch's
own closing-keyword carrier commit is stamped later — at `/claude-tweaks:wrap-up` Phase 4's
execution step, via `wrap-up/cleanup-procedures.md` Section C step 2 — which is after the console
is answered, so on this path it has not run and the branch carries no closing keyword at all yet.
That makes the omission more important, not less: a `Fixes` line here would be the only closing
keyword in play, and it would close every listed record the moment someone merged a PR nobody had
reviewed.

**Leave the PR unassigned.** No convention for who reviews dispatch-originated PRs exists in this
repo; inventing one here would be a guess with a person's name on it.

**If `gh pr create` fails, retry it once.** If the retry also fails, stop — the branch is already on
origin, so the durability goal is met. Record the failure per Step 5, log, and continue to the
console:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR creation FAILED twice ({reason}); open one by hand. Reversibility: high.`

On success:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR {url} opened against {integration-branch} for #{n}. Reversibility: high (close the PR; the branch on origin is additive).`

## Step 5: Record the outcome where the Verification Brief will find it

Every branch above — success, existing PR, skipped PR, push failure, PR failure — writes one file at
the run directory's **root**:

```
{run-dir}/pending-review-durability.md
```

**Root, never `staged/`.** Both consoles classify any file in `staged/` carrying a
`Title:`/`Type:`/`Labels:` header as a queue write (`Q#`) needing its own per-item approval; a
status note is neither a proposal nor a work record.

The file is exactly these three lines, with no heading:

```
push: ok | failed — {reason}
pr: {url} | existing {url} | failed — {reason} | skipped — {reason}
branch: {branch} -> {integration-branch}
```

`wrap-up/verification-brief.md`'s Step 4 reads this file and renders a `### Branch` section from it,
so a push or PR-open failure reaches the human in the same comment that carries the brief — never
only in a log nobody opens.
````

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: 11 tests pass, 0 fail.

- [ ] **Step 5: Prove each guard discriminates (inversion check)**

A prose guard that would pass on any input is worthless, and it is most seductive when it agrees
with what you just wrote (`[IL-105]`). Pick **three** guards — `never calls close-run`,
`retry it once`, and the `pr:` line-shape guard — and for each one: delete the matched phrase from
`skills/_shared/pending-review-durability.md`, re-run the suite, confirm **that specific test**
fails, then restore the phrase and re-run to confirm green again.

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected after each deletion: exactly one failing test, naming the deleted claim. Expected after
each restore: 11 pass.

- [ ] **Step 6: Verify the byte ceiling**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && wc -c skills/_shared/pending-review-durability.md
```

Expected: under 40960. Report the number in your task output.

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add skills/_shared/pending-review-durability.md tests/pending-review-durability.test.js && git diff --cached --name-only
```

Expected: exactly those two paths, nothing else (`git commit` with no pathspec takes the whole
staged index — `[IL-42]`).

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Add the pending-review branch-durability procedure (refs #297)"
```

---

### Task 2: Wire the single-record Review Console

**Files:**
- Modify: `skills/wrap-up/review-console.md` — two insertions
- Modify: `tests/pending-review-durability.test.js` — add two guards

**Interfaces:**
- Consumes: the path `skills/_shared/pending-review-durability.md` from Task 1.
- Produces: nothing later tasks read.

**Byte budget — read this before writing.** `skills/wrap-up/review-console.md` is 39030 bytes
against a hard 40960 ceiling: **1930 bytes of headroom**. The two insertions below total roughly
1150 bytes. If your edit takes the file past 40960, do not raise the ceiling and do not trim the new
text into uselessness — stop and report `BLOCKED`, and the plan will be revised to extract an
existing section first.

- [ ] **Step 1: Write the failing guards**

Append these two tests to `tests/pending-review-durability.test.js`, and add the file read beside
the existing `DURABILITY` const:

```js
const WRAP_CONSOLE = read('skills', 'wrap-up', 'review-console.md');

test('the wrap-up console cites the durability procedure before it renders', () => {
  const cite = WRAP_CONSOLE.indexOf('_shared/pending-review-durability.md');
  const render = WRAP_CONSOLE.indexOf('## Present the console');
  assert.ok(
    cite !== -1 && cite < render,
    'the console ends in a blocking AskUserQuestion a headless firing never returns from, so a durability step cited after it never runs — the citation has to sit above "## Present the console"',
  );
});

test("the wrap-up console's dry-run mode suppresses the push and the PR", () => {
  const start = WRAP_CONSOLE.indexOf('## Dry-run mode');
  const end = WRAP_CONSOLE.indexOf('## Auto-merge short-circuit', start);
  assert.match(
    WRAP_CONSOLE.slice(start, end),
    /pending-review\s+durability/i,
    '--dry-run is preview-only for every write on this page; a push to origin and a live PR are writes, and omitting them from that list is how a "preview" run publishes a branch',
  );
});
```

- [ ] **Step 2: Run the guards to verify they fail**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: the two new tests FAIL (`cite !== -1` is false; the dry-run slice does not match). The
11 from Task 1 still pass.

- [ ] **Step 3: Insert the dry-run bullet**

In `skills/wrap-up/review-console.md`'s `## Dry-run mode` section, insert this bullet immediately
after the existing bullet that begins `- Skip that same branch's acceptance labeling`:

```markdown
- Skip the pending-review durability push and draft-PR creation (see the section of that name below) — print what would have been pushed and which PR would have been opened as preview lines instead. Both are writes to origin and to a live PR surface, preview-only for the same reason the merge is.
```

- [ ] **Step 4: Insert the caller stub**

In the same file, insert this section immediately **before** the `## Present the console` heading:

```markdown
## Pending-review branch durability (dispatch-originated runs)

Run this before rendering the console below, never after — the console ends in a blocking `AskUserQuestion` that a headless firing never returns from, so a step scheduled after it does not run on the very path it exists to protect.

**Gate the read.** Read `_shared/pending-review-durability.md` — the scope guard, the worktree-safe push, the existing-open-PR check, the draft-PR creation, and the push/PR failure fallbacks — only when `CLAIM_RUN_ID` is set and non-empty (dispatch-originated; an interactive human-run `/flow` never sets it) **and** this run used a worktree strategy. Otherwise skip this section entirely and do not read the file.

That file owns the whole procedure and the reasons behind it, including why it never calls `close-run` and never clears the run's worktree assignment: this run stays `active`, exactly as an un-pushed `pending-review` outcome does today, and only gains a branch on origin plus one open draft PR.
```

- [ ] **Step 5: Run the guards to verify they pass**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: 13 tests pass, 0 fail.

- [ ] **Step 6: Verify the byte ceiling and read the rendered result**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && wc -c skills/wrap-up/review-console.md && node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: the byte count is under 40960 — report the exact number — and the context-cost suite
passes. Then **read the file around both insertion points** (not the diff): a stray line next to a
fenced block lands inside the fence, and next to prose it can split an existing sentence
(`[IL-27]`). Confirm the new bullet sits inside the dry-run list and the new section sits between
the Unattended-tier section and `## Present the console`.

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add skills/wrap-up/review-console.md tests/pending-review-durability.test.js && git diff --cached --name-only
```

Expected: exactly those two paths.

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Run the durability push before the wrap-up Review Console renders (refs #297)"
```

---

### Task 3: Wire the multi-spec consolidated console (dispatched bundles)

**Files:**
- Modify: `skills/flow/multispec-review-console.md` — two insertions
- Modify: `tests/pending-review-durability.test.js` — add one guard

**Interfaces:**
- Consumes: the path `skills/_shared/pending-review-durability.md` from Task 1.
- Produces: nothing later tasks read.

**Why this file too.** A dispatched **bundle** group runs `/claude-tweaks:flow "#A,#B" review,polish,wrap-up`,
which is multi-spec mode: every per-spec `/claude-tweaks:wrap-up` sets `MULTISPEC_REVIEW_DEFER=1`
and **skips** its own Review Console entirely, so Task 2's wiring never fires for a bundle. This
file's consolidated console is the bundle's equivalent render point. Without this task the feature
covers singleton groups only, and the live incident that motivated #297 was a five-record bundle.
`skills/flow/multispec-review-console.md` is 26353 bytes — ample headroom.

- [ ] **Step 1: Write the failing guard**

Append to `tests/pending-review-durability.test.js`, adding the read beside the others:

```js
const MULTI_CONSOLE = read('skills', 'flow', 'multispec-review-console.md');

test('the multi-spec console cites the durability procedure before it renders', () => {
  const cite = MULTI_CONSOLE.indexOf('_shared/pending-review-durability.md');
  const render = MULTI_CONSOLE.indexOf('## Present the consolidated console');
  assert.ok(
    cite !== -1 && cite < render,
    'a dispatched bundle defers every per-spec console (MULTISPEC_REVIEW_DEFER=1), so this consolidated console is the only render point a bundle reaches — wiring only the single-record console leaves bundles exactly as unprotected as they were',
  );
});
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: the new test FAILS; the 13 from Tasks 1-2 pass.

- [ ] **Step 3: Amend the "When to run" list**

In `skills/flow/multispec-review-console.md`'s `## When to run the consolidated console` section,
replace numbered item 3 — currently the single line `3. Render the consolidated console (template below)` —
with:

```markdown
3. Run the pending-review branch durability step below, then render the consolidated console (template below)
```

Do **not** renumber items 1-2 or 4-5; only item 3's text changes.

- [ ] **Step 4: Insert the caller stub**

Insert this section immediately **before** the `## Present the consolidated console` heading:

```markdown
## Pending-review branch durability (dispatch-originated runs)

Run this before rendering the consolidated console below, never after — it ends in a blocking `AskUserQuestion` that a headless firing never returns from, so a step scheduled after it does not run on the very path it exists to protect. A dispatched **bundle** reaches this console and no other: every per-spec `/claude-tweaks:wrap-up` deferred its own under `MULTISPEC_REVIEW_DEFER=1`.

**Gate the read.** Read `_shared/pending-review-durability.md` — the scope guard, the worktree-safe push, the existing-open-PR check, the draft-PR creation, and the push/PR failure fallbacks — only when `CLAIM_RUN_ID` is set and non-empty (dispatch-originated; an interactive human-run `/claude-tweaks:flow` never sets it) **and** this run used a worktree strategy. Otherwise skip this section entirely and do not read the file.

One branch is shared across every spec in the run, so this is one push and one draft PR for the whole bundle — that file's own bundle rule fixes which record supplies the PR title and how the rest are referenced. It never calls `close-run` and never clears the run's worktree assignment; the parent run dir stays intact for the console below and for "Shared teardown" afterwards.
```

- [ ] **Step 5: Run the guard to verify it passes**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: 14 tests pass, 0 fail.

- [ ] **Step 6: Verify the byte ceiling and read the rendered result**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && wc -c skills/flow/multispec-review-console.md && node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: under 40960, suite passes. Report the number. Then read the file around both insertion
points and confirm item 3 still reads as a single list item and the new section did not land inside
the large fenced console template that precedes it (`[IL-27]`).

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add skills/flow/multispec-review-console.md tests/pending-review-durability.test.js && git diff --cached --name-only
```

Expected: exactly those two paths.

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Cover dispatched bundles with the durability push in the multi-spec console (refs #297)"
```

---

### Task 4: Render the outcome record into the Verification Brief

**Files:**
- Modify: `skills/wrap-up/verification-brief.md` — two insertions
- Modify: `tests/pending-review-durability.test.js` — add one guard

**Interfaces:**
- Consumes: from Task 1, the run-dir outcome-record path `{run-dir}/pending-review-durability.md`
  and its three-line format (`push:` / `pr:` / `branch:`).
- Produces: nothing later tasks read.

**Why this task exists.** Task 1's Steps 2-4 promise that a push or PR-open failure "is never
silently indistinguishable from success" and that the human is told "in the same comment". That
promise has no consumer until this task adds one — a cross-file promise with no consumer in the same
change-set is exactly what task-scoped review cannot see (`[IL-02]`), and a value whose reader never
moves with its writer is `[IL-97]`. `skills/wrap-up/verification-brief.md` is 33068 bytes; these
insertions add roughly 1.2 KB.

- [ ] **Step 1: Write the failing guard**

Append to `tests/pending-review-durability.test.js`, adding the read beside the others:

```js
const BRIEF = read('skills', 'wrap-up', 'verification-brief.md');

test('the brief renders a Branch section from the durability record', () => {
  assert.match(
    BRIEF,
    /pending-review-durability\.md/,
    'the durability step promises a push or PR-open failure reaches the human in the same comment as the brief; without a reader here that promise resolves to a log line nobody opens (IL-02)',
  );
});
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: the new test FAILS; the 14 from Tasks 1-3 pass.

- [ ] **Step 3: Add the sourcing paragraph to Step 4**

In `skills/wrap-up/verification-brief.md`'s `## Step 4: Compose and post the brief`, insert this
paragraph immediately **before** the line `Render this exact template:`:

```markdown
**Branch durability (dispatch-originated runs only).** If `{run-dir}/pending-review-durability.md` exists, read its three lines (`push:`, `pr:`, `branch:` — written by `_shared/pending-review-durability.md` Step 5) and render the `### Branch` section of the template below from them: where the branch was pushed, the draft PR's link, and any push or PR-open failure stated plainly rather than paraphrased, so a human knows the branch is local-only or that a PR still needs opening by hand. Omit that section entirely when the file is absent — an interactive run never produces one, and an empty heading would imply a durability step that never ran.
```

- [ ] **Step 4: Add the section to the template**

In the same `## Step 4` fenced markdown template, insert these lines immediately **before** the
template's closing `---` separator line (the one directly above `_Posted by {poster}...`):

```markdown
### Branch
{dispatch-originated runs only, sourced from {run-dir}/pending-review-durability.md above:
where the branch was pushed and the draft PR link — or, plainly, that the push failed and the
branch is local only, or that the push landed but the PR still needs opening by hand}
{omit this section entirely when that file does not exist}
```

- [ ] **Step 5: Add the parent-brief clause**

In the `### Compose the parent brief` subsection, append this sentence to the paragraph that begins
`Render the same `## Verification Brief` template Step 4 below renders, with:`:

```markdown
A parent brief carries the `### Branch` section on the same condition Step 4 states — the durability record belongs to the run in hand, not to the family, so it is present exactly when that run produced one.
```

- [ ] **Step 6: Run the guard to verify it passes**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: 15 tests pass, 0 fail.

- [ ] **Step 7: Verify the byte ceiling and read the rendered result**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && wc -c skills/wrap-up/verification-brief.md && node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: under 40960, suite passes. Report the number. Then **read the rendered file** around all
three insertion points: Step 4's template is a fenced block, and a line inserted one position off
lands either inside the wrong fence or outside the template it belongs to (`[IL-27]`). Confirm the
`### Branch` block sits inside the fence, above the `---`, and that the sourcing paragraph sits
outside it.

- [ ] **Step 8: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add skills/wrap-up/verification-brief.md tests/pending-review-durability.test.js && git diff --cached --name-only
```

Expected: exactly those two paths.

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Surface push and PR-open failures in the Verification Brief (refs #297)"
```

---

### Task 5: Retire the stale "the branch waits for a human" prose

**Files:**
- Modify: `skills/dispatch/SKILL.md` — the Reporting section's `pending-review` paragraph
- Modify: `skills/dispatch/task-prompt.md` — one line inside the second call's template
- Modify: `tests/pending-review-durability.test.js` — add one guard

**Interfaces:**
- Consumes: nothing from earlier tasks except the fact that the durability step now exists.
- Produces: nothing later tasks read.

**Why this task exists.** Widening an enforcement or durability mechanism without sweeping the prose
that described its old reach leaves claims that were true when written and are now false, and no
keyword search finds a procedure whose defect is silence (`[IL-93]`). Two such claims exist:
`skills/dispatch/SKILL.md`'s Reporting section says the *branch* sits waiting for a human, and
`skills/dispatch/task-prompt.md`'s reporting template offers both `pending-review` and `pr-opened`
with nothing to tell an agent which one a durability PR is.

**Byte budget.** `skills/dispatch/SKILL.md` is 40025 bytes: **935 of headroom**. The replacement
below is a net increase of roughly 280 bytes because it rewrites the existing sentence rather than
adding beside it, leaving about 650 bytes of headroom. Verify with `wc -c` and report the number. Do not touch `skills/flow/SKILL.md` —
it has 57 bytes of headroom.

- [ ] **Step 1: Write the failing guard**

Append to `tests/pending-review-durability.test.js`, adding the read beside the others:

```js
const TASK_PROMPT = read('skills', 'dispatch', 'task-prompt.md');

test('the reporting template tells the agent a durability PR is still pending-review', () => {
  assert.match(
    TASK_PROMPT,
    /not\s+`pr-opened`/,
    'the agent picks its OUTCOME from this template and never reads dispatch/SKILL.md; with a draft PR now open on the pending-review path, nothing in its own prompt distinguishes the two values',
  );
});
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: the new test FAILS; the 15 from Tasks 1-4 pass.

- [ ] **Step 3: Rewrite the Reporting paragraph in dispatch/SKILL.md**

Replace this exact paragraph in `skills/dispatch/SKILL.md`'s `## Reporting` section:

```markdown
`pending-review` outcomes park: the branch (and, for the group's `/flow`-created run dir) sit waiting for a human — an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it.
```

with:

```markdown
`pending-review` outcomes park the group's `/flow`-created run dir, not the branch — an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it. The branch itself no longer waits with it: before either console renders, `_shared/pending-review-durability.md` pushes it to origin and opens one draft PR carrying its Verification Brief, so the work outlives the container that built it.
```

- [ ] **Step 4: Add the OUTCOME disambiguation to task-prompt.md**

In `skills/dispatch/task-prompt.md`, find the line inside the second call's reporting template that
reads:

```
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
```

That line sits inside a block headed `OUTPUT FORMAT (required) … return ONLY these lines, no
preamble:`, so the note must **not** go directly under it — a line placed there reads as one of the
lines the agent is told to emit, and this template is inlined verbatim into a real dispatched agent.
Insert it instead **after the whole enumeration ends** — below the
`ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}` line and its trailing blank line, immediately
before the `[Use: Standard model …]` line — still inside the same fenced template, as its own
paragraph:

```
Choosing between two OUTCOME values: report pending-review -- not `pr-opened` -- when the run
reached the Review Console with nobody answering it, even though a draft PR was opened for branch
durability. `pr-opened` means the branch reached its finish decision; a durability PR is an
unanswered human gate wearing a review surface.
```

- [ ] **Step 5: Run the guard to verify it passes**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/pending-review-durability.test.js
```

Expected: 16 tests pass, 0 fail.

- [ ] **Step 6: Run the two suites that read these files, and check the ceiling**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && node --test tests/dispatch-worktree-anchoring.test.js tests/dispatch-flow-rundir-handoff.test.js && wc -c skills/dispatch/SKILL.md skills/dispatch/task-prompt.md && node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: both dispatch suites pass (they extract regions of `task-prompt.md` — an insertion inside
the template must not break their anchors), `skills/dispatch/SKILL.md` is under 40960, and the
context-cost suite passes. Report both byte counts.

- [ ] **Step 7: Sweep for any other prose still claiming the branch stays local**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && grep -rni "pending-review" --include="*.md" skills docs/skill-graph.md README.md
```

Read every hit. Any sentence asserting the branch is unpushed, local-only, or recoverable only by
resuming the session is now false and must be corrected in this task. Hits that merely name the
`pending-review` *path* (`settle-and-merge.md`'s fallback sentences, `help/reference-card.md`'s
console row) are unaffected — do not edit them. State in your task output which hits you read and
which you judged unaffected, one line each; a silent "nothing else to fix" is not a result
(`[IL-17]`, `[IL-21]`).

- [ ] **Step 8: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add -A skills tests && git diff --cached --name-only
```

Expected: only the files this task actually edited. If anything else appears, unstage it before
committing.

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Retire the branch-waits-for-a-human claim now the branch is pushed (refs #297)"
```

---

### Task 6: Whole-feature verification

**Files:**
- Modify: any file a check below proves wrong (expected: none)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: the verification evidence the controller's whole-branch review starts from.

- [ ] **Step 1: Run the full suite**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && npm test > /tmp/297-npm-test.txt 2>&1; echo "exit=$?"; tail -40 /tmp/297-npm-test.txt
```

Expected: `exit=0`. Redirect first and read the file — piping a long run directly can hide the real
failure or trigger a silent re-run. If it fails, fix the cause here and re-run; do not report green
on a partial run.

- [ ] **Step 2: Confirm every touched file is under the ceiling**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && wc -c skills/_shared/pending-review-durability.md skills/wrap-up/review-console.md skills/wrap-up/verification-brief.md skills/flow/multispec-review-console.md skills/dispatch/SKILL.md skills/dispatch/task-prompt.md | sort -n
```

Expected: every number under 40960. Report the table verbatim in your task output.

- [ ] **Step 3: Confirm this branch did not touch flow/SKILL.md**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git diff --stat $(git merge-base HEAD main)..HEAD -- skills/flow/SKILL.md
```

Expected: empty output. That file has 57 bytes of headroom; any change to it is a build failure
waiting to happen.

- [ ] **Step 4: Walk the acceptance criteria against the tree, not against this plan**

Read `skills/_shared/pending-review-durability.md` and both caller stubs directly, and confirm each
of the spec's eight acceptance criteria has a home. A plan's own completion claim was written before
the work and in the plan's voice, which is exactly what makes re-verifying it feel redundant
(`[IL-88]`). Write one line per criterion naming the file and section that satisfies it. AC8 is
Step 1's `exit=0`.

- [ ] **Step 5: Check whether docs need an edge or a row**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && grep -n "_shared/" docs/skill-graph.md | head -5; grep -c "verification-brief.md" docs/plugin-structure.md
```

`docs/skill-graph.md` records edges between **skills**; a `_shared/` fragment is not a node, so a new
fragment needs no edge — confirm that from the grep's output rather than assuming, and state the
conclusion. `docs/plugin-structure.md` lists per-skill sub-files but only a single generic line for
`skills/_shared/*.md`, so a new `_shared` fragment needs no row either — confirm the same way. If
either grep contradicts this, add the missing entry in this task.

- [ ] **Step 6: Commit any fixes**

If Steps 1-5 changed nothing, skip this step and report that no commit was needed. Otherwise:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && pwd && git rev-parse --show-toplevel && git branch --show-current
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git add -A && git diff --cached --name-only
```

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-295-296-297" && git commit -m "Fix verification gaps found in the #297 whole-feature check (refs #297)"
```

---

## Out of scope, deliberately

Recorded here so a reviewer does not read the omission as an oversight:

- **`review-console.md`'s auto-merge short-circuit resolves the worktree with `git -C "$RUN_DIR" rev-parse --show-toplevel`** (around line 89 of that file). Run directories are anchored to the main checkout, so that form appears to resolve the main checkout rather than the worktree — which would make its "push from inside the worktree" call push from the wrong place. This plan's new procedure deliberately uses a bare `git rev-parse` and states why, but it does **not** change the existing auto-merge snippet: that is `auto:merge` behavior, a different code path from this leaf's, and changing it here would be an unrequested edit to a merge path with no test covering it. Report it to the controller as a candidate follow-up record.
- **#71** (`/claude-tweaks:tidy`'s own PRs having no merge path) — the spec's Gotchas forbid folding it in.
- **Reviewer assignment on the opened PR** — left unassigned by Task 1's explicit instruction, per the spec's build-time-judgment Gotcha; no convention exists in this repo to follow.
- **A policy lever to disable the push** — the spec asks for none, and `_shared/policy-schema.md` gains no key.
