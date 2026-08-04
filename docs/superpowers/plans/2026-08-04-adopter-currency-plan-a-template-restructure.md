# Plan A — CLAUDE.md Template Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `skills/init/claude-md-template.md`'s Initial Mode Template into compliance with the adopter currency contract, cutting plugin-authored boilerplate from 6,834 B to a ≤3,620 B target while relocating live config levers to `.claude-tweaks/policy.yml`.

**Architecture:** The template keeps only content that must reach the model on a turn where no claude-tweaks skill was invoked. Pipeline mechanics are deleted (the skills that need them already carry them). The `## Project Defaults` block is deleted; two of its keys are dead and go away, the rest already have or gain a `policy.yml` path. `bin/lib/policy-schema.js` and `skills/_shared/policy-schema.md` are updated in lockstep because they are documented as one source of truth split across two files.

**Tech Stack:** Markdown skill files; Node 18+ CommonJS modules under `bin/lib/`; `node --test`.

## Global Constraints

- Work in the existing worktree at `.claude/worktrees/adopter-currency-contract` on branch `worktree-adopter-currency-contract`. `worktree.always: true` is set — do NOT create a second worktree, and do NOT `cd` to the main checkout.
- Design doc: `docs/superpowers/specs/2026-08-04-adopter-currency-contract-design.md` (commit `7078840b`).
- `bin/lib/policy-schema.js:1-3` states: "If the two disagree, one of them has a bug — fix, don't fork." Every key change touches BOTH that file and `skills/_shared/policy-schema.md`.
- `tests/policy-schema.test.js:21-23` pins `POLICY_KEYS.length`. Any key added or removed updates that assertion.
- Verification greps anchor to path position, never a bare content substring (`[IL-34]`, `[IL-39]`), and exclude `docs/superpowers/` — the design doc and this plan both quote every retired pattern verbatim (`[IL-28]`). **Every exclusion in this plan is written `^docs/superpowers/`, not `^./docs/superpowers/`** — `grep -rn PATTERN .` in this repository emits paths with no leading `./`, so a `^./`-anchored exclusion silently matches nothing (`[IL-39]`). This was verified by running it, not assumed.
- Never write a verification grep expecting "no output" where the new content legitimately contains the searched term (`[IL-55]`).
- Do NOT edit `CLAUDE.md` in this repository. It is the plugin's own maintenance harness, not an adopting project's file, and is explicitly out of scope per the design's Non-goals.
- Commit message style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End every commit body with `Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `skills/init/claude-md-template.md` | The adopter CLAUDE.md template | Pipeline section trimmed; `## Project Defaults` deleted |
| `bin/lib/policy-schema.js` | Canonical lever data + `auditPolicy()` | Two keys added; count changes |
| `skills/_shared/policy-schema.md` | Human-readable lever index | Two rows added; three rows re-homed; `execution.always` description corrected; counts de-literalized |
| `tests/policy-schema.test.js` | Pins key count and validator behavior | Count assertion updated; test name de-numbered |
| `skills/flow/SKILL.md` | `/flow` workflow | Two resolution-chain read sites repointed |
| `CHANGELOG.md`, `.claude-plugin/plugin.json` | Release record | Minor bump + entry |

---

### Task 1: Confirm `markdown-mode` and `directory` have no consumer

The design flags both as orphaned but explicitly refuses to assume it — a keyword grep proves a name is absent, not that a behavior is absent (`[IL-15]`). This task converts the negative result into a structural one before anything is deleted.

**Files:**
- Modify: none (verification only; result is recorded in the commit message of Task 4)

**Interfaces:**
- Consumes: nothing
- Produces: a go/no-go signal for Task 4's deletion of these two keys

- [ ] **Step 1: Search for any resolution site reading either key**

A resolution site is a place that reads a config value, not a place the word appears. Run all three:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "markdown-mode" --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
grep -rniE "markdown.mode|markdownMode" --include="*.js" bin/
grep -rn "streamlined" --include="*.md" skills/ | grep -v "^skills/init/claude-md-template.md:"
```

Expected: the first returns only `skills/init/claude-md-template.md:106`. The second returns nothing. The third returns nothing.

- [ ] **Step 2: Repeat for `directory`, using the structural signal**

The `directory:` key would be read as a worktree path override. `skills/init/bootstrap/step-06-worktree-configuration.md:5` states detection must use `git worktree list` or `GIT_DIR != GIT_COMMON` "rather than assume a fixed directory name," which predicts no reader exists.

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "^\s*directory:" --include="*.md" skills/ | grep -v "^skills/init/claude-md-template.md:"
grep -rn "\.worktrees" --include="*.js" bin/
```

Expected: the first returns nothing. The second returns nothing, or only comments — `bin/lib/hooks/worktree-detect.js` must not resolve a configured directory name.

- [ ] **Step 3: Record the outcome**

If both confirm zero readers, proceed — Task 4 deletes both keys.

If either search returns a real resolution site, STOP and do not delete that key in Task 4. Instead add it to `POLICY_KEYS` alongside `git-strategy` in Task 2 (same row shape, `type` matching the values the reader accepts), and note the deviation in Task 4's commit body. Do not silently drop it and do not silently keep it — this is a HARD GATE on Task 4's key list.

---

### Task 2: Add `execution-strategy` and `git-strategy` to the policy schema

Both have live CLAUDE.md read sites. They move to `policy.yml`, which means they must exist in the validator before the template stops writing them.

**Files:**
- Modify: `bin/lib/policy-schema.js` (POLICY_KEYS array)
- Modify: `skills/_shared/policy-schema.md` (`## Worktree & execution` table; header lines 3 and 5)
- Modify: `tests/policy-schema.test.js:21-23`

**Interfaces:**
- Consumes: nothing
- Produces: `POLICY_KEYS` entries for `execution-strategy` and `git-strategy`, readable by `auditPolicy(repoRoot)`; Task 5 repoints `flow/SKILL.md` at them

- [ ] **Step 1: Write the failing test**

Add to `tests/policy-schema.test.js`:

```javascript
test('execution-strategy and git-strategy are recognized policy keys', () => {
  const byKey = new Map(POLICY_KEYS.map((k) => [k.key, k]));

  const exec = byKey.get('execution-strategy');
  assert.ok(exec, 'execution-strategy missing from POLICY_KEYS');
  assert.strictEqual(exec.type, 'enum');
  assert.deepStrictEqual(exec.values, ['subagent', 'batched']);
  assert.strictEqual(exec.default, 'subagent');

  const git = byKey.get('git-strategy');
  assert.ok(git, 'git-strategy missing from POLICY_KEYS');
  assert.strictEqual(git.type, 'enum');
  assert.deepStrictEqual(git.values, ['current-branch', 'worktree']);
  assert.strictEqual(git.default, 'current-branch');
});

test('execution.always locks the axis and execution-strategy sets the default — they are distinct keys', () => {
  const keys = POLICY_KEYS.map((k) => k.key);
  assert.ok(keys.includes('execution.always'), 'execution.always must survive as the lock');
  assert.ok(keys.includes('execution-strategy'), 'execution-strategy must exist as the default');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test tests/policy-schema.test.js
```

Expected: FAIL — "execution-strategy missing from POLICY_KEYS".

- [ ] **Step 3: Add the two keys to `POLICY_KEYS`**

In `bin/lib/policy-schema.js`, insert immediately after the `execution.always` entry:

```javascript
  { key: 'execution-strategy', type: 'enum', values: ['subagent', 'batched'], default: 'subagent' },
  { key: 'git-strategy', type: 'enum', values: ['current-branch', 'worktree'], default: 'current-branch' },
```

- [ ] **Step 4: Update the key-count assertion**

`tests/policy-schema.test.js:21-23` currently reads:

```javascript
test('POLICY_KEYS has exactly 33 entries with unique keys', () => {
  assert.strictEqual(POLICY_KEYS.length, 33);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 33);
```

Replace with a form that keeps the uniqueness guarantee without a hand-maintained literal in the test *name* (the assertion keeps its literal — it is the enforcement):

```javascript
test('POLICY_KEYS entries are unique', () => {
  assert.strictEqual(POLICY_KEYS.length, 35);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 35);
```

Note for the implementer: 35 = 33 + 2. If Task 1 Step 3 required keeping `directory` or `markdown-mode`, this number is 36 or 37 instead — count `POLICY_KEYS` directly rather than trusting this line.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test tests/policy-schema.test.js
```

Expected: PASS, all tests.

- [ ] **Step 6: Add the two rows to the schema doc**

In `skills/_shared/policy-schema.md`, in the `## Worktree & execution` table, add after the `execution.always` row:

```markdown
| `execution-strategy` | `policy.yml` | `/claude-tweaks:build` | `subagent` | Default value of `/claude-tweaks:build`'s execution axis when no argument is passed. Distinct from `execution.always`: this sets a default an explicit argument still overrides, while `execution.always` locks the axis and rejects the other value |
| `git-strategy` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `current-branch` | Default value of the Git axis when no argument is passed. `/claude-tweaks:flow` overrides this to `worktree` in its own context |
```

- [ ] **Step 7: Correct `execution.always`'s description**

Its current Meaning cell says it locks the axis "to `subagent` only," which contradicts its own `enum ['subagent','batched']`. `skills/build/SKILL.md:38` confirms the lock semantics. Replace the Meaning cell text:

`Locks /claude-tweaks:build's execution-strategy axis to subagent only, when set`

with:

`Locks /claude-tweaks:build's execution axis to the set value, when set — the other value is not offered and is substituted with an inline notice if passed explicitly (see build/SKILL.md's Execution axis paragraph). Distinct from execution-strategy, which sets an overridable default rather than a lock`

- [ ] **Step 8: De-literalize the restated counts**

`skills/_shared/policy-schema.md` restates the key count twice, and both go stale the moment a key is added or removed — which this plan and Plan C both do (`[IL-40]`).

Line 3: replace `owns the same 33 keys as data` with `owns the same keys as data`.

Line 5: replace `is the canonical home for all 33 levers below` with `is the canonical home for every lever below`.

- [ ] **Step 9: Verify no other file restates the count**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "33 keys\|33 levers\|all 33" --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Expected: no output. If a hit appears outside `docs/superpowers/`, de-literalize it the same way.

- [ ] **Step 10: Run the full suite**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -25
```

Expected: all suites pass. Redirect to a file first if the output is long enough to truncate.

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add bin/lib/policy-schema.js skills/_shared/policy-schema.md tests/policy-schema.test.js
git diff --cached --name-only
git commit -F - <<'EOF'
Give execution-strategy and git-strategy a policy.yml path

Both had live CLAUDE.md read sites and no entry in POLICY_KEYS, so
auditPolicy could not validate either. They are added as policy.yml levers
ahead of the template dropping them.

execution.always's description claimed it locks the axis to subagent only,
contradicting its own enum of subagent|batched. build/SKILL.md:38 confirms
the lock semantics generalize to whichever value is set. Description
corrected, and the distinction from execution-strategy (lock vs overridable
default) stated on both rows.

The two restated key counts in policy-schema.md are replaced with
by-reference phrasing; the test assertion keeps its literal since it is the
enforcement.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 3: Trim the Pipeline section in the template

Four paragraphs survive because each fires before a skill is chosen. Three are deleted, one is trimmed. They are enumerated literally here rather than by rule (`[IL-38]`).

**Files:**
- Modify: `skills/init/claude-md-template.md:69-83`

**Interfaces:**
- Consumes: nothing
- Produces: the trimmed template that Plan B's conformance module compares against

- [ ] **Step 1: Delete the `auto-mode` paragraph**

Delete this line in full (currently line 77), and the blank line following it:

```
**`auto-mode`:** `/claude-tweaks:flow` defaults to `auto` on its own. The optional `auto-mode:` flag (Project Defaults below) sets `/claude-tweaks:build`'s default and can lower `/claude-tweaks:flow` to `interactive` project-wide (`default-off`) for anyone who wants it. Under auto, do NOT insert mid-pipeline reality-checks, path-selection prompts, or context concerns. Surface failures via ledger/failure card. See `_shared/auto-mode-contract.md` in the claude-tweaks plugin.
```

It references "Project Defaults below", which Task 4 deletes, so leaving it would create a dangling reference.

- [ ] **Step 2: Delete the Bookend architecture paragraph**

Delete this line in full (currently line 79) and the blank line following it:

```
**Bookend architecture (v4.6+):** in default `auto` mode the pipeline has **one user-facing stop** — the Wrap-Up Review Console at the end (`/claude-tweaks:wrap-up` Step 8.6 — one consolidated batch). The Pipeline Config Manifesto (`/claude-tweaks:flow` Step 3) computes the policy levers, writes `config.yml`, and displays as a **read-only FYI** rather than stopping — pass `/claude-tweaks:flow … confirm` to turn it back into an "Approve all / Override / Cancel" gate. Mid-flow decisions are looked up from `.claude-tweaks/pipelines/{run-id}/config.yml` and logged to `decisions.md` in the same directory. Skills MUST NOT invent new mid-flow stops in auto. See `_shared/auto-mode-contract.md` and `_shared/auto-decision-log.md`.
```

- [ ] **Step 3: Delete the Project policy defaults paragraph**

Delete this line in full (currently line 81) and the blank line following it:

```
**Project policy defaults** (set in `.claude-tweaks/policy.yml`, not in this CLAUDE.md file) pre-fill the Manifesto — shown in the FYI display (default `auto`) and used as the pre-filled recommendations when the gate runs (`confirm` / `hybrid`).
```

- [ ] **Step 4: Trim the `/flow` paragraph to its routing half**

Replace line 75 in full:

```
**`/claude-tweaks:flow`:** specs only (rejects design docs). Size is not a stop signal — gate blocks on structural coupling (cross-task deps, scope leak). **Defaults to `auto` mode** (hands-off); pass `confirm` to gate the Manifesto, `interactive` for per-skill prompts, or `hybrid` for floor-gated prompts.
```

with:

```
**`/claude-tweaks:flow`:** specs only — it rejects design docs. Defaults to `auto` (hands-off); pass `confirm`, `interactive`, or `hybrid` to change that.
```

The gate-criteria sentence is deleted: it describes what `/flow` does once running, and `/flow` carries it. The mode names are kept because they are invocation grammar a user types before any skill runs.

- [ ] **Step 5: Verify the three surviving paragraphs are untouched**

```bash
cd "$(git rev-parse --show-toplevel)"
sed -n '/^## claude-tweaks Pipeline/,/^## Project Defaults/p' skills/init/claude-md-template.md
```

Expected: exactly four bolded paragraphs, in this order — `**Artifacts:**`, `**Entry point:**`, `**`/claude-tweaks:flow`:**`, `**Superpowers overrides:**`. The Artifacts, Entry point, and Superpowers overrides paragraphs must be byte-identical to their pre-change text.

- [ ] **Step 6: Read the rendered result around every edit**

Reading the diff is not sufficient — a deletion adjacent to a fenced block can leave the fence unbalanced (`[IL-27]`). Confirm the `## claude-tweaks Pipeline` section still sits inside the outer ```markdown fence that wraps the whole Initial Mode Template, and that no stray blank-line run was left behind:

```bash
cd "$(git rev-parse --show-toplevel)"
awk '/^## Initial Mode Template/,/^## Update Mode/' skills/init/claude-md-template.md | grep -c '^```'
```

Expected: **4**, and unchanged from before this task. The Initial Mode Template contains two fence pairs at this point — the outer ```markdown wrapping the whole template, and an inner pair around the `## Project Defaults` block that Task 4 has not yet deleted. Measured against the live file during plan authoring, not estimated. Any number other than 4 means a fence was broken by this task's edits.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/init/claude-md-template.md
git diff --cached --name-only
git commit -F - <<'EOF'
Trim the template's Pipeline section to its routing paragraphs

Artifacts, Entry point, and Superpowers overrides survive because each fires
before a skill is chosen — a model that never invokes claude-tweaks still
needs them true. The /flow paragraph keeps its specs-only routing and mode
grammar and loses its gate-criteria sentence.

Deleted: the auto-mode flag explanation, the bookend-architecture paragraph,
and the project-policy-defaults pointer. All three are consulted only once
/flow is already running, and /flow carries them via flow/SKILL.md,
_shared/auto-mode-contract.md, and _shared/auto-decision-log.md.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 4: Delete the `## Project Defaults` block from the template

**Files:**
- Modify: `skills/init/claude-md-template.md` (the `## Project Defaults (optional)` section, currently lines 85-122)

**Interfaces:**
- Consumes: Task 1's go/no-go on `markdown-mode` and `directory`; Task 2's `POLICY_KEYS` entries
- Produces: the final template shape Plan B's conformance module reads

- [ ] **Step 1: Confirm Task 1's gate passed**

Do not start this task until Task 1 Step 3 recorded zero readers for both `markdown-mode` and `directory`. If either had a reader, that key is NOT deleted here — it was added to `POLICY_KEYS` in Task 2 instead, and this task still deletes the block (the key now lives in `policy.yml`).

- [ ] **Step 2: Delete the whole section**

Remove everything from `## Project Defaults (optional)` through the closing ``` of its fenced block, plus the blank line after it — i.e. currently lines 85 through 123 inclusive, leaving `## Don'ts` as the next section after `## claude-tweaks Pipeline`'s last paragraph.

- [ ] **Step 3: Verify the template's section order**

```bash
cd "$(git rev-parse --show-toplevel)"
awk '/^## Initial Mode Template/,/^## Update Mode/' skills/init/claude-md-template.md | grep -nE '^## |^# \{'
```

Expected order, with no `## Project Defaults` and no stray `## Build` / `## Flow` / `## Worktree` / `## Subagent` / `## Brainstorm` / `## Pre-flight` / `## Plan audit` / `## Auto-mode` headings (those were inside the deleted fenced block):

```
# {project name}
## Stack
## Structure
## Commands
## Conventions
## Philosophy
## Working Approach
## Testing
## Environment
## Git
## claude-tweaks Pipeline
## Don'ts
```

Note: `## Work records` is written by `skills/init/bootstrap/step-17-work-record-backend.md`, not by this template block — its absence here is correct and expected.

- [ ] **Step 4: Verify the fence count is still balanced**

```bash
cd "$(git rev-parse --show-toplevel)"
awk '/^## Initial Mode Template/,/^## Update Mode/' skills/init/claude-md-template.md | grep -c '^```'
```

Expected: 2.

- [ ] **Step 5: Check for dangling references to the deleted block**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "Project Defaults" --include="*.md" skills/
```

Expected: **exactly two hits**, both in harness-health, both handled by Task 6:

```
skills/harness-health/judge-procedure.md:13
skills/_shared/harness-health-analysis.md:185
```

A third hit at `skills/init/update-mode.md:51` is expected **only if Plan B has not yet run** — that row is in the contract-drift table Plan B replaces wholesale. Record it in this commit's body so Plan B's implementer sees it; do not edit `update-mode.md` here.

Any hit in `skills/init/claude-md-template.md` means this task's deletion was incomplete — go back to Step 2.

- [ ] **Step 6: Measure the result per resolved path**

Measure what the template now produces, not what moved out of it (`[IL-76]`):

```bash
cd "$(git rev-parse --show-toplevel)"
T=$(mktemp)
awk '/^## Initial Mode Template/,/^## Update Mode/' skills/init/claude-md-template.md > "$T"
for s in "Working Approach" "claude-tweaks Pipeline"; do
  printf "%-26s " "$s"
  awk -v s="## $s" 'index($0,s)==1{f=1} f&&/^## /&&index($0,s)!=1&&c++{exit} f{print}' "$T" | wc -c
done
rm "$T"
```

Expected: `Working Approach` unchanged at 1634. `claude-tweaks Pipeline` at or below 700. Record both numbers in the commit body — Task 6's CHANGELOG entry cites them.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/init/claude-md-template.md
git diff --cached --name-only
git commit -F - <<'EOF'
Delete the template's Project Defaults block

markdown-mode had no reader anywhere in the repository; directory had none
either, consistent with step-06-worktree-configuration.md:5 stating that
worktree detection must use git worktree list or GIT_DIR != GIT_COMMON
rather than a configured directory name. Both verified structurally before
deletion, not assumed from a keyword grep.

The remaining levers are policy.yml keys: section-confirmation, merge-check,
and scope-keywords-required were already in POLICY_KEYS despite the schema
doc claiming they had no policy.yml path; execution-strategy and
git-strategy were added in the preceding commit.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 5: Repoint `/flow`'s resolution chains

Two sites name CLAUDE.md as a config source. With the template no longer writing those keys, the chains must name `policy.yml`.

**Files:**
- Modify: `skills/flow/SKILL.md:114`, `:119`, `:122`

**Interfaces:**
- Consumes: Task 2's `POLICY_KEYS` entries
- Produces: nothing downstream

- [ ] **Step 1: Audit every bypass flag before editing**

A flag whose "skip these sources" list names sources by identity silently stops skipping a source that moves (`[IL-68]`). Before changing any chain, list them:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "CLAUDE.md" --include="*.md" skills/flow/ skills/build/ | grep -iE "git-strategy|execution-strategy|auto-mode|resolution|precedence|skip|bypass"
```

Read every hit. Any that enumerates sources to skip must gain `policy.yml` if it named CLAUDE.md for these keys.

- [ ] **Step 2: Repoint the `git-strategy` chain**

`skills/flow/SKILL.md:119` currently reads:

```
   2. CLAUDE.md `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
```

Replace with:

```
   2. `.claude-tweaks/policy.yml` `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
```

- [ ] **Step 3: Repoint the `auto-mode` chain**

`skills/flow/SKILL.md:114` currently reads:

```
   2. CLAUDE.md `auto-mode:` setting — `default-off` → `interactive`; `default-on` → `auto`.
```

`auto-mode` is documented in `policy-schema.md` as dual-homed (`policy.yml` or CLAUDE.md), and the template ships it commented out — so this line must name both rather than swapping one for the other. Replace with:

```
   2. `.claude-tweaks/policy.yml` `auto-mode:` setting (CLAUDE.md is also honored for this key) — `default-off` → `interactive`; `default-on` → `auto`.
```

- [ ] **Step 4: Repoint the execution-strategy prose**

`skills/flow/SKILL.md:122` ends with:

```
this keeps flow's execution-strategy guarantee independent of whatever CLAUDE.md or `.claude-tweaks/policy.yml` might otherwise resolve to for a standalone `/build` call.
```

This already names both sources and stays correct after the move, but CLAUDE.md is no longer a source for this key. Replace that clause with:

```
this keeps flow's execution-strategy guarantee independent of whatever `.claude-tweaks/policy.yml` might otherwise resolve to for a standalone `/build` call.
```

- [ ] **Step 5: Verify no resolution chain still names CLAUDE.md for a moved key**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "CLAUDE\.md[^.]{0,40}(git-strategy|execution-strategy)" --include="*.md" skills/
```

Expected: no output.

Then confirm the inverse — that the moved keys now resolve somewhere:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "git-strategy" --include="*.md" skills/build/ skills/flow/ | grep -i "policy.yml"
```

Expected: at least one hit.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/flow/SKILL.md
git diff --cached --name-only
git commit -F - <<'EOF'
Repoint flow's git-strategy and execution-strategy resolution at policy.yml

The template no longer writes either key into an adopting project's
CLAUDE.md, so a chain naming CLAUDE.md as their source would resolve
nothing. auto-mode keeps both sources named — policy-schema.md documents it
as dual-homed and the template ships it commented out.

Bypass flags naming sources by identity were audited before the edit per
IL-68.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 6: Repoint harness-health's Project Defaults sub-check

Two sites audit a CLAUDE.md section this plan deletes. Left alone, the check
references a section that no longer exists in any newly generated project —
while remaining genuinely useful against projects that predate the restructure.
It is repointed, not removed.

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md:185`
- Modify: `skills/harness-health/judge-procedure.md:13`

**Interfaces:**
- Consumes: Task 3's and Task 4's template shape
- Produces: nothing downstream

- [ ] **Step 1: Repoint the sub-check in the shared fragment**

`skills/_shared/harness-health-analysis.md:185` currently reads:

```
- **Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version** — does the documented auto-mode-policy lever list match what the currently installed claude-tweaks plugin version actually supports? This one is checked against the plugin's own evolving contract (its bundled `_shared/auto-mode-contract.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file.
```

Replace with:

```
- **`## claude-tweaks Pipeline` section in sync with the installed plugin version** — do the section's routing paragraphs match what the currently installed claude-tweaks plugin version actually routes? This one is checked against the plugin's own evolving contract (its bundled `skills/init/claude-md-template.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file. **A surviving `## Project Defaults` section is itself a finding**: the plugin stopped generating it, and its levers now live in `.claude-tweaks/policy.yml`, so its presence means the project predates that change and its values are being read from a file no consumer resolves any more.
```

- [ ] **Step 2: Update the name in the dispatched judge procedure**

`skills/harness-health/judge-procedure.md:13` currently reads:

```
- The "Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version" CLAUDE.md sub-check is retained below; it is the one check that reads the installed plugin's own contract rather than the target project's source.
```

Replace with:

```
- The "`## claude-tweaks Pipeline` section in sync with the installed plugin version" CLAUDE.md sub-check is retained below; it is the one check that reads the installed plugin's own contract rather than the target project's source.
```

This file is inlined verbatim into each dispatched agent's prompt, so the name must match the fragment's exactly or an agent reading one and citing the other produces an unresolvable reference (`[IL-60]`).

- [ ] **Step 3: Verify both names now agree**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "claude-tweaks Pipeline\` section in sync" --include="*.md" skills/
```

Expected: exactly two hits — one in `_shared/harness-health-analysis.md`, one in `skills/harness-health/judge-procedure.md`.

Then confirm the old name is fully gone:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "Project Defaults / claude-tweaks Pipeline" --include="*.md" . | grep -v "^docs/superpowers/"
```

Expected: no output.

- [ ] **Step 4: Confirm the self-containment test still passes**

`judge-procedure.md` is guarded by a test asserting it is self-contained, since it is inlined into agent prompts:

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/harness-health/tests/skill-md.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/_shared/harness-health-analysis.md skills/harness-health/judge-procedure.md
git diff --cached --name-only
git commit -F - <<'EOF'
Repoint harness-health's Project Defaults sub-check at the Pipeline section

The check audited a CLAUDE.md section this branch deletes from the template.
Rather than drop it, it now audits the surviving claude-tweaks Pipeline
section against the installed plugin's contract, and treats a surviving
Project Defaults block as a finding in its own right — that block's levers
now live in policy.yml, so a project still carrying it is reading config no
consumer resolves.

Both sites renamed together: judge-procedure.md is inlined verbatim into
each dispatched agent's prompt, so a name matching only one of the two would
give agents an unresolvable citation.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 7: Version bump and CHANGELOG

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 4 Step 6's measured byte counts
- Produces: the release record

- [ ] **Step 1: Check for a concurrent bump before choosing a number**

Local `git log` alone is blind to a bump that landed upstream (`[IL-12]`):

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git show origin/main:.claude-plugin/plugin.json | grep '"version"'
```

If `origin/main` already carries a version at or above the one you intended, renumber to the next free minor.

- [ ] **Step 2: Bump the minor version**

This is a feature addition. Set `version` in `.claude-plugin/plugin.json` to the next free minor above whatever Step 1 found (`6.34.0` if `origin/main` is still at `6.33.0`).

- [ ] **Step 3: Add the CHANGELOG entry**

Prepend below the `# Changelog` heading, substituting the real measured numbers from Task 4 Step 6:

```markdown
## v6.34.0 — Adopter CLAUDE.md carries only what always-loaded context needs

`/claude-tweaks:init` wrote 6,834 bytes of byte-identical boilerplate into every
adopting project's CLAUDE.md — inherited by every dispatched subagent, competing
against the 150-line `harness-health.always-loaded-budget` before the project
contributed a word, and stale in every project whenever the plugin changed it.

The template now carries only content that must reach the model on a turn where
no claude-tweaks skill was invoked. `## Working Approach` and `## Philosophy` are
untouched — they govern ad-hoc work where no skill gate fires. The Pipeline
section keeps its four routing paragraphs and loses the bookend-architecture
detail, the run-dir mechanics, and the auto-mode flag explanation, all of which
are only consulted once `/flow` is already running and are carried by `/flow`.

`## Project Defaults` is deleted outright. Two of its keys had no reader
anywhere: `markdown-mode`, and `directory` — the latter consistent with
`step-06-worktree-configuration.md` requiring worktree detection to use
`git worktree list` rather than a configured name. Both were confirmed
structurally, not inferred from a keyword search. `execution-strategy` and
`git-strategy` gained `policy.yml` paths and entries in `POLICY_KEYS`, which had
never validated them; `section-confirmation`, `merge-check`, and
`scope-keywords-required` turned out to be in `POLICY_KEYS` already, contradicting
the schema doc's claim that they had no `policy.yml` path.

`execution.always` was documented as locking the execution axis "to `subagent`
only" while typed as `enum ['subagent','batched']`. `build/SKILL.md` confirms the
lock generalizes to whichever value is set; the description now says so, and both
rows state the distinction from `execution-strategy` (a lock versus an overridable
default).

`/claude-tweaks:harness-health`'s "Project Defaults / claude-tweaks Pipeline
sections in sync with the installed plugin version" sub-check audited a section
that no longer exists. It now audits the surviving Pipeline section, and treats a
surviving `## Project Defaults` block as a finding in its own right — a project
still carrying one is reading config from a file no consumer resolves.
```

- [ ] **Step 4: Verify the CHANGELOG's own claims**

Every number in that entry must match reality (`[IL-77]` — a provably-right number contradicting adjacent data is the worse failure):

```bash
cd "$(git rev-parse --show-toplevel)"
node --test tests/changelog.test.js
grep -n '"version"' .claude-plugin/plugin.json
```

Expected: changelog test passes; the version literal in the entry heading matches `plugin.json`.

- [ ] **Step 5: Run the full suite**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -25
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .claude-plugin/plugin.json CHANGELOG.md
git diff --cached --name-only
git commit -F - <<'EOF'
Bump the plugin version, add the CHANGELOG entry for the template restructure

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

Note: the marketplace mirror (`thomasholknielsen/claude-tweaks-marketplace`) is updated as part of the release, not this plan — see `CLAUDE.md`'s Releasing section. Do not stop to ask before doing it when the release happens (`[IL-59]`).

---

## Self-Review

**Spec coverage.** Design's Plan A scope: split the Initial Mode Template per the invariant (Tasks 3, 4); delete `markdown-mode` and `directory` with structural confirmation first (Tasks 1, 4); rehome five keys to `policy.yml` (Task 2, plus the discovery that three were already there); resolve `execution.always` vs `execution-strategy` explicitly (Task 2 Steps 6-7 — resolved as *distinct*, lock versus default, evidenced by `build/SKILL.md:38`); repoint `flow/SKILL.md:119` and `:122` (Task 5, which also caught `:114`); version bump (Task 7). No gap against the design found.

**Scope the design missed, added here.** Running Task 4 Step 5's grep against the live tree during authoring returned two hits the design never accounted for: `_shared/harness-health-analysis.md:185` and `harness-health/judge-procedure.md:13` both audit a "Project Defaults / claude-tweaks Pipeline sections in sync" sub-check. Deleting `## Project Defaults` would leave that check auditing a section that no longer exists. Task 6 was added to repoint it — and to make a surviving Project Defaults block a finding in its own right, which gives projects predating the restructure a detection path the design's manual one-off pass otherwise lacked.

**Two plan bugs caught by executing the greps rather than estimating them.**
- Every `docs/superpowers/` exclusion was originally written `^./docs/superpowers/`. Running it showed `grep -rn PATTERN .` emits paths with no `./` prefix here, so the exclusion matched nothing — `[IL-39]`, in a plan that cites `[IL-39]`. All instances corrected and the constraint restated in Global Constraints with the reason.
- Task 3 Step 6's fence-count expectation was 2; the live file has 4 at that point (an outer ```markdown pair plus an inner pair around Project Defaults, which Task 3 does not delete). Corrected to 4, with the post-deletion 2 kept only in Task 4 Step 4.

**Deviation from the design, recorded.** The design assumed all five keys needed a `policy.yml` path created. Reading `bin/lib/policy-schema.js` showed `section-confirmation`, `merge-check`, and `scope-keywords-required` already have one — the schema *doc* is what was wrong. Task 2 therefore adds two keys, not five, and Task 4's commit body records the doc/code disagreement.

**Placeholder scan.** No TBD/TODO. Task 1 Step 3 is a conditional with both arms specified, not a deferred decision. Task 4 Step 5's "record any hit for Plan B" is an explicit handoff, not an unfinished step.

**Type consistency.** `POLICY_KEYS` entry shape (`{key, type, values, default}`) matches the existing array's shape exactly, verified against `bin/lib/policy-schema.js:9-11`. `auditPolicy(repoRoot)` is referenced by the name the module exports. The count literal 35 is stated with an explicit instruction to recount rather than trust it.

**Known cross-plan coupling.** Plan C deletes the four `triage-*` aliases from `POLICY_KEYS`, changing the same count assertion this plan sets to 35. Whichever lands second must recount. This is noted in Plan C as well.
