# Deferral Gate Consumers (#621) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every non-ledger exhaust channel run `_shared/deferral-gate.md`'s gate: review Step 3, reflect (full/hindsight/tangential), the wrap-up residue sweep, and wrap-up leftover routing replace their own defer wording with a citation, run fix-now before anything becomes a record proposal, and stamp a `Defer-reason:` (keyed header line on staged files; `recordPayload`'s `deferReason` on direct creates). One eval scenario pins the runtime behavior; the conformance test gains per-consumer assertions.

**Architecture:** Cite, don't copy — each consumer gets one sentence pointing at the contract plus its channel-specific mapping (which vocabulary value a given finding kind maps to). The `Defer-reason:` header line is mechanical template text added inside the same code block that already carries `Title:`/`Type:`/`Labels:` (fourth line, located by key). The eval scenario needs two small new assertion modules (`file-contains`, `dir-file-count`) because the harness has no generic file-content or directory-count check today. **Parent promise F1 (#619)** is satisfied in the `ledger-format.md` one-line edit in Task 3.

**Tech Stack:** Markdown skill files; Node 18+ (`node:test`); evals harness (ESM, YAML scenarios).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-621/work/621-spec.md`

## Global Constraints

- The six-value vocabulary is exactly `tangential`, `needs-human-decision`, `pre-existing-outside-diff`, `genuinely-larger`, `blocked-external`, `blocked-dependency` (verified unchanged in the merged `_shared/deferral-gate.md`). Never restate the fix-now criteria or bad-reasons list in a consumer — cite the file.
- Retired sentences (must appear NOWHERE under `skills/` after this record): `Has a clear trigger documented for when to revisit` and `starts exactly where a captured idea starts`.
- `grep -rn "≤5 files\|no spans across unrelated systems" skills/ --include=*.md` must match only `_shared/deferral-gate.md` when done (today `wrap-up/leftover-routing.md:8` also matches — Task 3 removes it).
- #624 edits these same files again (body composition) — keep every edit scoped to deferral text and header lines; do NOT touch step 2's `recordPayload` composition in `leftover-routing.md` beyond removing the false-premise clause named in Task 3.
- Commit messages: imperative, `refs #621`, never `closes`; every commit ends with `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk`. No version bump.
- Work from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-620-621-622-623-624-625`; verify `pwd`/`git rev-parse --show-toplevel` before each commit; stage specific files only. The policy hook may refuse compound Bash — run commands singly.
- Full `npm test` runs only in Task 5. Individual tasks run only their targeted checks.

---

### Task 1: `skills/review/step3-routing.md` — cite the gate, reasoned Defer/Capture

**Files:**
- Modify: `skills/review/step3-routing.md` (the "When \"Fix now\" isn't possible" block, its "Deferral gate:" block, and the "If any findings are \"Fix now\"" sentence)

**Interfaces:**
- Consumes: `_shared/deferral-gate.md` (cited by path), `recordPayload({ deferReason })` (#620).
- Produces: the retired sentence `Has a clear trigger documented for when to revisit` is gone; the file contains `_shared/deferral-gate.md` and a Defer-reason mapping (Task 5 asserts).

- [ ] **Step 1: Replace the routing + gate block.** In `skills/review/step3-routing.md`, replace this text:

```markdown
**When "Fix now" isn't possible**, route to the right destination:

- **Defer** (new work record, `parked`) — the fix is understood but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin spec, and affected files, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`).
- **Capture** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. This enters the full capture → `/superpowers:brainstorming` pipeline.

**Deferral gate:** An item may only be deferred if it meets ALL of these:

- Pre-existing (not introduced by this build), OR requires design discussion that can't be resolved in the current session
- Has a clear trigger documented for when to revisit

Items introduced by this build that are fixable now must be fixed now — even if the fix is imperfect, closing the gap is better than deferring.

If any findings are "Fix now", make the changes, re-run `/claude-tweaks:test`, and verify fixes didn't introduce new findings.
```

with:

```markdown
**When "Fix now" isn't possible**, route to the right destination:

- **Defer** (new work record, `parked`) — the fix is understood but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin spec, and affected files, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`) — passing `deferReason` to `recordPayload` (`bin/lib/issues/record.js`), chosen by the mapping below.
- **Capture** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. This enters the full capture → `/superpowers:brainstorming` pipeline. Invoke `/claude-tweaks:capture` with the finding text carrying a `Defer-reason: {value}` line (a caller-side pass-through convention — capture's own `--defer-reason=` flag arrives with #625), and pass `--needs-definition` when the finding names an open choice.

**Deferral gate:** `_shared/deferral-gate.md` is the gate — run its fix-now criteria before any Defer or Capture, and never skip a fix for one of its bad reasons (the list now includes "minor / not load-bearing"; severity floors decide what blocks, not what gets fixed). A finding that fails fix-now carries exactly one `Defer-reason:` from that file's vocabulary, chosen by this mapping (one line of justification in the `AUTO`/`STAGED` log line):

- a defect in a file the diff does not touch → `pre-existing-outside-diff`
- a fix needing a product/design call → `needs-human-decision`
- a fix that expands scope past the fix-now criteria → `genuinely-larger`
- a fix waiting on unbuilt functionality → `blocked-dependency`
- a fix waiting on external state → `blocked-external`
- a new capability the finding suggests → `tangential` (Capture, not Defer)

A finding that fails fix-now with **no** valid reason stays `open` — in an interactive review it goes to the human drill; in `auto` it becomes an `open` ledger item for wrap-up's Phase 2 drill — and per the routing rule at the top of this file the review cannot pass with it `open`.

If any findings are "Fix now", make the changes, re-verify per `_shared/deferral-gate.md`'s Re-verification rule (`/claude-tweaks:test`), and verify fixes didn't introduce new findings.
```

- [ ] **Step 2: Verify**

```bash
grep -c "Has a clear trigger documented for when to revisit" skills/review/step3-routing.md
grep -c "_shared/deferral-gate.md" skills/review/step3-routing.md
grep -c "pre-existing-outside-diff" skills/review/step3-routing.md
```
Expected: `0`, `3`, `1`. (The citation count is 3: gate sentence, bad-reasons clause, vocabulary clause — count whatever the literal yields and confirm ≥1; the load-bearing checks are the `0` and the `1`.) If the count differs from 3, that is fine as long as it is ≥1 — record the actual number in your report.

- [ ] **Step 3: Commit**

```bash
git add skills/review/step3-routing.md
git commit -m "Cite _shared/deferral-gate.md from review Step 3 — fix-now before Defer/Capture, per-channel Defer-reason mapping, no-valid-reason stays open, refs #621

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 2: reflect — full-mode rows, hindsight pointer, tangential header

**Files:**
- Modify: `skills/reflect/full-mode.md` (Recommendation rules — the `Defer` and `Capture` bullets), `skills/reflect/hindsight-mode.md` (the "same as `full-mode.md`'s" sentence), `skills/reflect/SKILL.md` (Step 3 tangential staged header block + the tangential STAGED log line)

**Interfaces:**
- Consumes: `_shared/deferral-gate.md`; the staged-header convention (`Title:`/`Type:`/`Labels:` + now `Defer-reason:`).
- Produces: `reflect/SKILL.md`'s header code block carries `Defer-reason: tangential` (Task 5 asserts `^Defer-reason:` inside the block); all three files contain `_shared/deferral-gate.md`.

- [ ] **Step 1: `full-mode.md` Defer/Capture bullets.** Replace:

```markdown
- **Defer** (new work record, `parked`) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin, context, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`).
- **Capture** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on. Routes to `/claude-tweaks:capture`, which files it as a fresh backlog work record.
```

with:

```markdown
- **Defer** (new work record, `parked`) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Gated by `_shared/deferral-gate.md`: run its fix-now criteria first, and name the `Defer-reason:` in the batch table's Recommended column (e.g. `Defer — genuinely-larger`), chosen per that file's vocabulary — same mapping review Step 3 uses (`review/step3-routing.md`). Compose the body with a `Trigger:` line, origin, context, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`) — passing the same value as `recordPayload`'s `deferReason`. An insight with no valid reason cannot be recommended Defer.
- **Capture** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on. Routes to `/claude-tweaks:capture`, which files it as a fresh backlog work record — the recommendation names its reason the same way (`Capture — tangential`), and the handed-over text carries a `Defer-reason: {value}` line (#625's flag arrives later; this is the pass-through convention). An insight with no valid reason cannot be recommended Capture.
```

- [ ] **Step 2: `hindsight-mode.md` pointer.** Replace:

```markdown
**Recommendation rules:** **Defer** and **Capture** are the same as `full-mode.md`'s Recommendation rules (substitute "finding" for "insight" and "files" for "context") — see that section rather than repeating it here. What differs in hindsight mode:
```

with:

```markdown
**Recommendation rules:** **Defer** and **Capture** are the same as `full-mode.md`'s Recommendation rules (substitute "finding" for "insight" and "files" for "context") — see that section rather than repeating it here; both run `_shared/deferral-gate.md`'s gate and name a `Defer-reason:` exactly as stated there. What differs in hindsight mode:
```

- [ ] **Step 3: `SKILL.md` tangential header.** In the tangential staged-header code block, replace:

```markdown
Title: {short work-record title}
Type: {bug | feature | task}
Labels: {comma-separated labels or "none"}
```

with:

```markdown
Title: {short work-record title}
Type: {bug | feature | task}
Labels: {comma-separated labels or "none"}
Defer-reason: tangential
```

and change the sentence introducing it from `prepend a 3-line header above the` to `prepend a 4-line header above the`. Then, immediately after the paragraph ending `(those are never Queue writes).`, append this sentence to that same paragraph: ` The \`Defer-reason: tangential\` line is category-first by rule (\`_shared/deferral-gate.md\`): a tangential finding is by definition not a fix to the current work, so its reason is its category; the other five vocabulary values apply only to non-tangential findings.`

- [ ] **Step 4: `SKILL.md` STAGED log line.** In the Step 3 routing table, replace:

```markdown
`STAGED {time} — Step 3: tangential idea "{summary}" — backlog candidate. Surface at the Queue writes gate.`
```

with:

```markdown
`STAGED {time} — Step 3: tangential idea "{summary}" — backlog candidate (defer-reason: tangential). Surface at the Queue writes gate.`
```

- [ ] **Step 5: Verify**

```bash
grep -c "_shared/deferral-gate.md" skills/reflect/full-mode.md
grep -c "_shared/deferral-gate.md" skills/reflect/hindsight-mode.md
grep -c "_shared/deferral-gate.md" skills/reflect/SKILL.md
grep -n "^Defer-reason: tangential$" skills/reflect/SKILL.md
grep -c "(defer-reason: tangential)" skills/reflect/SKILL.md
```
Expected: ≥1 for each of the first three; one line-number hit inside the header code block; `1`.

- [ ] **Step 6: Commit**

```bash
git add skills/reflect/full-mode.md skills/reflect/hindsight-mode.md skills/reflect/SKILL.md
git commit -m "Cite _shared/deferral-gate.md from reflect — Defer/Capture recommendations name their Defer-reason, tangential staged header gains the category-first line, refs #621

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 3: wrap-up — residue-sweep mapping, leftover-routing gate + header (+ parent promise F1)

**Files:**
- Modify: `skills/wrap-up/residue-sweep.md` (the `## \`remedy: record\` findings` section), `skills/wrap-up/leftover-routing.md` (the `## Fix-exhaust first` section, step 2's parenthetical, step 3's header write, step 4's log line), `skills/_shared/ledger-format.md` (ONE sentence — parent promise F1)

**Interfaces:**
- Consumes: `_shared/deferral-gate.md`.
- Produces: retired sentence `starts exactly where a captured idea starts` gone; `≤5 files` no longer in `leftover-routing.md`; `leftover-{slug}.md` header carries `Defer-reason:`; ledger Phase 2 narrowing states its stamped value (promise F1).

- [ ] **Step 1: `residue-sweep.md` mapping.** Replace the section:

```markdown
## `remedy: record` findings

A finding the CLI marked `remedy: record` (an open PR outside this run's own blast radius, a red
suite, a locked worktree a live session still holds) is not Phase 1's to fix. Its `Item`
description should say so plainly, so Phase 1 correctly leaves it `open` for Phase 2's per-item
drill, where "Route to a record" or "Close out" is the natural landing choice — the CLI's `remedy`
field is a hint for that drill, not a rule the gate is bound to follow.
```

with:

```markdown
## `remedy: record` findings

A finding the CLI marked `remedy: record` (an open PR outside this run's own blast radius, a red
suite, a locked worktree a live session still holds) is not Phase 1's to fix. Its `Item`
description should say so plainly, so Phase 1 correctly leaves it `open` for Phase 2's per-item
drill, where "Route to a record" or "Close out" is the natural landing choice — the CLI's `remedy`
field is a hint for that drill, not a rule the gate is bound to follow. `_shared/deferral-gate.md`
governs the routing: a proposal routed from here carries a `Defer-reason:` per this mapping — a
locked worktree a live session holds → `blocked-external`; an open PR outside this run's blast
radius → `blocked-external`; a red suite this run cannot fix → `genuinely-larger`; anything else
stays `open` for Phase 2's drill, where the human picks the value.
```

- [ ] **Step 2: `leftover-routing.md` fix-exhaust citation.** Replace:

```markdown
## Fix-exhaust first

A section qualifies for "finish now" if **all** of these hold:
- Localized changes (typically ≤5 files)
- No dependency on functionality not yet built in this pipeline
- No required user product/design decisions
- No required external state
- Does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

Finish qualifying sections silently, commit, then present only the residue.
```

with:

```markdown
## Fix-exhaust first

Run `_shared/deferral-gate.md`'s fix-now criteria on every unfinished section, first — a section
that fails fix-now with no valid `Defer-reason:` from that file's vocabulary is not a leftover; it
becomes an `open` ledger item for Phase 2's drill instead of a routed proposal. A genuine
leftover's reason derives from *why* it cannot finish now, using the same mapping as review Step
3's (`review/step3-routing.md`) — most leftovers are `genuinely-larger` or `blocked-dependency`.

Finish qualifying sections silently, commit, then present only the residue.
```

- [ ] **Step 3: retire the false premise in step 2.** In step 2's parenthetical, replace:

```markdown
no `risk`/`size`/`ready` (scoring and promotion to `ready` are `/specify`'s job, not wrap-up's — a leftover record starts exactly where a captured idea starts):
```

with:

```markdown
no `risk`/`size`/`ready` (scoring and promotion to `ready` are `/specify`'s job, not wrap-up's — #624 rewrites this composition onto `specShapedBody`):
```

- [ ] **Step 4: step 3's staged header gains the reason line.** In the step-3 staging snippet, replace:

```markdown
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + (p.labels.join(', ') || 'none') + '\n\n' + p.body)" \
```

with:

```markdown
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + (p.labels.join(', ') || 'none') + '\nDefer-reason: ' + process.argv[2] + '\n\n' + p.body)" \
```

and on the line after it (the argument line ending `"${RUN_DIR}/staged/leftover-${SLUG}.md"`), append a second argument so it reads:

```markdown
     "${RUN_DIR}/staged/leftover-${SLUG}.md" "$DEFER_REASON"
```

then add one sentence immediately after that code block: `` `$DEFER_REASON` is the section's vocabulary value from the fix-exhaust gate above (`_shared/deferral-gate.md`'s "Where the reason lives" — a keyed header line, located by key, never by position). ``

- [ ] **Step 5: step 4's log line.** Replace:

```markdown
   STAGED 15:02:18 — Leftover routing: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog}. Stage path: staged/leftover-{slug}.md.
```

with:

```markdown
   STAGED 15:02:18 — Leftover routing: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog} (defer-reason: {value}). Stage path: staged/leftover-{slug}.md.
```

- [ ] **Step 6: parent promise F1 — `ledger-format.md` one sentence.** In `skills/_shared/ledger-format.md`, in the Phase 2 `ledgerNarrowing` block, replace:

```markdown
compose the staged-proposal body exactly as Phase 3's `Keep` branch below already does,
```

with:

```markdown
compose the staged-proposal body exactly as Phase 3's `Keep` branch below already does — the staged header's `Defer-reason:` value is the structured twin of whichever regex group cleared the floor, per `_shared/deferral-gate.md`'s floor-mapping table —,
```

- [ ] **Step 7: Verify**

```bash
grep -rn "starts exactly where a captured idea starts" skills/
grep -rn "≤5 files\|no spans across unrelated systems" skills/ --include=*.md
grep -c "_shared/deferral-gate.md" skills/wrap-up/residue-sweep.md
grep -c "_shared/deferral-gate.md" skills/wrap-up/leftover-routing.md
grep -n "Defer-reason: " skills/wrap-up/leftover-routing.md
```
Expected: no matches; matches only in `skills/_shared/deferral-gate.md`; ≥1; ≥2; hits including the staging snippet line.

- [ ] **Step 8: Commit**

```bash
git add skills/wrap-up/residue-sweep.md skills/wrap-up/leftover-routing.md skills/_shared/ledger-format.md
git commit -m "Cite _shared/deferral-gate.md from wrap-up residue sweep and leftover routing — fix-now first, remedy:record mapping, Defer-reason staged header line, narrowing stamps the structured twin, refs #621

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 4: eval scenario `wrap-up-fix-now-not-file.yaml` + two assertion modules

**Files:**
- Create: `evals/assertions/file-contains.js`, `evals/assertions/dir-file-count.js`, `evals/scenarios/wrap-up-fix-now-not-file.yaml`
- Modify: `evals/assertions/index.js` (two imports + two registry rows)

**Interfaces:**
- Consumes: the harness registry shape (`(ctx, params) => fn(ctx.repoDir, params)`), `decisions-log-has.js`'s latest-run-dir resolution pattern.
- Produces: assertion types `file-contains` and `dir-file-count` usable by any scenario; the scenario itself.

- [ ] **Step 1: `evals/assertions/file-contains.js`:**

```js
import fs from 'node:fs';
import path from 'node:path';

// Generic file-content pin: every `contains` substring present, every `absent`
// substring missing. `path` may include a single '*' segment, resolved to the
// LAST matching directory entry (sorted) — same latest-run-dir convention as
// decisions-log-has.js, for run dirs whose timestamp prefix is unknowable at
// scenario-authoring time.
function resolveStarPath(repoDir, relPath) {
  const parts = relPath.split('/');
  const starIdx = parts.indexOf('*');
  if (starIdx === -1) return path.join(repoDir, relPath);
  const baseDir = path.join(repoDir, ...parts.slice(0, starIdx));
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir).sort();
  if (entries.length === 0) return null;
  return path.join(baseDir, entries[entries.length - 1], ...parts.slice(starIdx + 1));
}

export function fileContains(repoDir, { path: relPath, contains = [], absent = [] }) {
  const target = resolveStarPath(repoDir, relPath);
  if (!target || !fs.existsSync(target)) return { pass: false, message: `${relPath} does not resolve to an existing file` };
  const content = fs.readFileSync(target, 'utf8');
  const missing = (Array.isArray(contains) ? contains : [contains]).filter((n) => !content.includes(n));
  const present = (Array.isArray(absent) ? absent : [absent]).filter((n) => content.includes(n));
  if (missing.length === 0 && present.length === 0) return { pass: true, message: `${relPath} content as expected` };
  return { pass: false, message: `${relPath}: missing ${JSON.stringify(missing)}, unexpectedly present ${JSON.stringify(present)}` };
}
```

- [ ] **Step 2: `evals/assertions/dir-file-count.js`:**

```js
import fs from 'node:fs';
import path from 'node:path';

// Counts regular files in a directory (non-recursive). A missing directory
// counts as 0 — "no records were filed" and "no specs/ dir was ever created"
// are the same outcome for a max-style pin. Supports the same single-'*'
// segment as file-contains.js (latest entry wins).
function resolveStarDir(repoDir, relPath) {
  const parts = relPath.split('/');
  const starIdx = parts.indexOf('*');
  if (starIdx === -1) return path.join(repoDir, relPath);
  const baseDir = path.join(repoDir, ...parts.slice(0, starIdx));
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir).sort();
  if (entries.length === 0) return null;
  return path.join(baseDir, entries[entries.length - 1], ...parts.slice(starIdx + 1));
}

export function dirFileCount(repoDir, { path: relPath, max }) {
  const dir = resolveStarDir(repoDir, relPath);
  const count = dir && fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length
    : 0;
  if (count <= max) return { pass: true, message: `${relPath} holds ${count} file(s) (max ${max})` };
  return { pass: false, message: `${relPath} holds ${count} file(s), expected at most ${max}` };
}
```

- [ ] **Step 3: register both in `evals/assertions/index.js`** — add imports:

```js
import { fileContains } from './file-contains.js';
import { dirFileCount } from './dir-file-count.js';
```

and registry rows (after the `'file-exists'` row):

```js
  'file-contains': (ctx, params) => fileContains(ctx.repoDir, params),
  'dir-file-count': (ctx, params) => dirFileCount(ctx.repoDir, params),
```

- [ ] **Step 4: the scenario** — create `evals/scenarios/wrap-up-fix-now-not-file.yaml`:

```yaml
name: wrap-up-fix-now-not-file
description: >
  Deferral-gate runtime pin (#621): a wrap-up run whose ledger holds four
  small in-diff items ("a few lines each") must FIX all four in-branch per
  _shared/deferral-gate.md's fix-now criteria — not file them as records.
  Expected, mechanically checkable: all four ledger items reach status
  `fixed`, zero new local records under specs/ (the fixture's local-files
  equivalent of zero `gh issue create` calls — the sandbox has no network,
  so any filing attempt lands there or nowhere), and zero staged queue-write
  proposals in the run dir's staged/. The four seeded defects are each a
  one-line fix in a file the seeded diff already touches, so every one
  passes the fix-now criteria and none has a legitimate Defer-reason.
fixture:
  base: minimal-node-repo
  seed:
    - files:
        src/greet.js: |
          'use strict';
          // Defect 1 (ledger #1): greet() drops the exclamation mark the test expects.
          function greet(name) {
            return 'Hello, ' + name;
          }
          // Defect 2 (ledger #2): shout() lower-cases instead of upper-casing.
          function shout(name) {
            return ('Hello, ' + name).toLowerCase();
          }
          module.exports = { greet, shout };
        test/greet.test.js: |
          'use strict';
          const { test } = require('node:test');
          const assert = require('node:assert');
          const { greet, shout } = require('../src/greet.js');
          // These four tests encode the CORRECT behavior; the seeded defects fail them.
          test('greet appends an exclamation mark', () => {
            assert.strictEqual(greet('Ada'), 'Hello, Ada!');
          });
          test('shout upper-cases', () => {
            assert.strictEqual(shout('Ada'), 'HELLO, ADA!');
          });
          test('greet handles empty name', () => {
            assert.strictEqual(greet(''), 'Hello, !');
          });
          test('shout handles empty name', () => {
            assert.strictEqual(shout(''), 'HELLO, !');
          });
        docs/plans/2026-08-16-greet-ledger.md: |
          # Open Items — greet module hardening

          | # | Phase | Item | Status | Resolution |
          |---|-------|------|--------|------------|
          | 1 | build | greet() drops the trailing exclamation mark ('Hello, Ada' vs expected 'Hello, Ada!') — src/greet.js, a few lines | open | — |
          | 2 | build | shout() lower-cases instead of upper-casing — src/greet.js, a few lines | open | — |
          | 3 | review | greet.js is missing 'use strict' on the test file's helper import path — trivial, in-diff | open | — |
          | 4 | review | test/greet.test.js name says 'helpers' in one describe label — cosmetic in-diff rename, a few lines | open | — |
skill_invocation:
  prompt: "/claude-tweaks:wrap-up"
assertions:
  # All four items fixed — none left open, none deferred/filed.
  - type: file-contains
    path: "docs/plans/2026-08-16-greet-ledger.md"
    contains: ["fixed"]
    absent: ["| open |", "deferred"]
  # Zero records filed: under this fixture's local-files-shaped repo, a filed
  # record would land as specs/N-*.md (no network for gh in the sandbox).
  - type: dir-file-count
    path: "specs"
    max: 0
  # Zero staged queue-write proposals in the run dir wrap-up creates.
  - type: dir-file-count
    path: ".claude-tweaks/pipelines/*/staged"
    max: 0
  # The fixes must actually satisfy the seeded tests.
  - type: test-passes
    command: "node --test test/"
  - type: tool-count
    max: 80
```

- [ ] **Step 5: Validate against the harness.** If `evals/node_modules` is absent, run `npm install` inside `evals/` first (it is a separate Node project). Then:

```bash
cd evals
npm test
```
Expected: all tests pass — `assertions.test.js`/`runner.test.js` exercise the registry, so a mis-registered module fails here. (Do NOT run `node runner.js run wrap-up-fix-now-not-file` — live scenario runs cost real API dollars and are not part of this task's verification.) Note: run `cd` as its own command if the policy hook refuses the compound form; return to the worktree root afterwards (`cd ..`).

- [ ] **Step 6: Commit**

```bash
git add evals/assertions/file-contains.js evals/assertions/dir-file-count.js evals/assertions/index.js evals/scenarios/wrap-up-fix-now-not-file.yaml
git commit -m "Add wrap-up-fix-now-not-file eval scenario — four in-diff ledger items must be fixed, never filed; new file-contains and dir-file-count assertion types back it, refs #621

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 5: conformance-test extensions, discrimination check, full suite

**Files:**
- Modify: `tests/deferral-gate-conformance.test.js` (append a `#621 consumers` section)

**Interfaces:**
- Consumes: Tasks 1–3's edits.
- Produces: per-consumer pins #622+ build on.

- [ ] **Step 1: Append to `tests/deferral-gate-conformance.test.js`** (after the ledger-format tests):

```js
// --- #621: consumers cite the gate and stamp Defer-reason ---

const CONSUMER_FILES = [
  'skills/review/step3-routing.md',
  'skills/reflect/full-mode.md',
  'skills/reflect/hindsight-mode.md',
  'skills/reflect/SKILL.md',
  'skills/wrap-up/residue-sweep.md',
  'skills/wrap-up/leftover-routing.md',
];

for (const rel of CONSUMER_FILES) {
  test(`${rel} cites _shared/deferral-gate.md`, () => {
    assert.ok(read(rel).includes('_shared/deferral-gate.md'));
  });
}

test('the retired defer wordings appear nowhere in the consumer files', () => {
  for (const rel of CONSUMER_FILES) {
    const content = read(rel);
    assert.ok(!content.includes('Has a clear trigger documented for when to revisit'), rel);
    assert.ok(!content.includes('starts exactly where a captured idea starts'), rel);
  }
});

test('reflect SKILL.md and leftover-routing.md carry Defer-reason in their staged-header blocks', () => {
  assert.match(read('skills/reflect/SKILL.md'), /^Defer-reason: tangential$/m);
  assert.ok(read('skills/wrap-up/leftover-routing.md').includes("'\\nDefer-reason: ' + process.argv[2]"));
});

test('no file outside deferral-gate.md restates the fix-now criteria', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const rel = path.relative(REPO_ROOT, p);
        if (rel === path.join('skills', '_shared', 'deferral-gate.md')) continue;
        const c = fs.readFileSync(p, 'utf8');
        if (c.includes('≤5 files') || c.includes('no spans across unrelated systems')) offenders.push(rel);
      }
    }
  };
  walk(skillsDir);
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: Run it**

```bash
node --test tests/deferral-gate-conformance.test.js
```
Expected: `# fail 0`.

- [ ] **Step 3: Prove it discriminates** — swap `leftover-routing.md` back to its pre-Task-3 state and restore, back-to-back commands with nothing in between (use the commit SHA of Task 2's commit — the last commit before Task 3's — found via `git log --oneline -8`):

```bash
git show {task2-sha}:skills/wrap-up/leftover-routing.md > skills/wrap-up/leftover-routing.md
node --test tests/deferral-gate-conformance.test.js 2>&1 | grep -E "^# (pass|fail)"
git checkout -- skills/wrap-up/leftover-routing.md
git status --short skills/wrap-up/leftover-routing.md
```
Expected: at least `# fail 2` on the swapped file (the citation test and the fix-now-restatement sweep; the Defer-reason header test also fails → possibly `# fail 3`), then a clean status. A harness "modified externally" reminder after the checkout is the checkout's own side effect.

- [ ] **Step 4: Full suite**

```bash
npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/621-npm-test.log 2>&1
grep -E "^# (tests|pass|fail)" /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/621-npm-test.log
```
Expected: `# fail 0`. On any failure, re-run only the failing file in isolation before concluding anything.

Also run AC 2's exact greps:

```bash
grep -rn "Has a clear trigger documented for when to revisit" skills/
grep -rn "starts exactly where a captured idea starts" skills/
grep -rln "_shared/deferral-gate.md" skills/review/step3-routing.md skills/reflect/full-mode.md skills/reflect/hindsight-mode.md skills/reflect/SKILL.md skills/wrap-up/residue-sweep.md skills/wrap-up/leftover-routing.md
```
Expected: no matches, no matches, all six paths listed.

- [ ] **Step 5: Commit**

```bash
git add tests/deferral-gate-conformance.test.js
git commit -m "Extend deferral-gate conformance with per-consumer assertions — citations, retired wordings, staged-header Defer-reason lines, fix-now-restatement sweep, refs #621

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

## Self-review

- **Spec coverage:** deliverable 1 (step3-routing) → T1; 2 (full-mode/hindsight) → T2 Steps 1–2; 3 (SKILL.md tangential header + log line) → T2 Steps 3–4; 4 (residue-sweep mapping) → T3 Step 1; 5 (leftover-routing: fix-now first, header line, retired sentence, log line) → T3 Steps 2–5; 6 (eval scenario) → T4; 7 (conformance extensions) → T5. ACs: 1 → T5 Steps 2–3; 2 → T5 Step 4; 3 → T5 Step 1's header test + T2/T3 verifies; 4 → T5 Step 1's sweep test + T3 Step 2; 5 → T4 Step 5 + T5 Step 4. Parent promise F1 → T3 Step 6.
- **Anchors verified against live files at plan time:** step3-routing's two-bullet gate block, full-mode's two bullets, hindsight's pointer sentence, SKILL.md's 3-line header + STAGED line, residue-sweep's `remedy: record` section, leftover-routing's Fix-exhaust list / step-2 parenthetical / step-3 snippet / step-4 STAGED line, ledger-format's `compose the staged-proposal body exactly as` clause — all copied verbatim from the current worktree state (post-#620).
- **Incidental-match check:** the new step3-routing text contains `Has a clear trigger` nowhere; T3's replacement text contains neither retired sentence; the conformance sweep excludes only `deferral-gate.md` and the fix now criteria phrases appear in no replacement text ("fix-now criteria" as a NAME is fine — the sweep greps `≤5 files` and `no spans across unrelated systems` only).
- **Placeholder scan:** none. **Type consistency:** `CONSUMER_FILES` used only in T5; `$DEFER_REASON` argv wiring in T3 Step 4 matches the test pin in T5 Step 1 (`'\\nDefer-reason: ' + process.argv[2]`).
