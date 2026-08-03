# Mechanical vs. Substantive Merge Judgment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `merge-check` judge behavior delta rather than diff size or file path, so mechanical corrections to agent-instruction files and behavior-preserving code diffs stop being blocked by proxies that don't track risk.

**Architecture:** All behavior lives in one markdown skill file, `skills/assess-agent-autonomy/SKILL.md`. `merge-check` owns the real judgment because it holds the actual diff; `grant-check` recommends on the record's described content and explicitly defers the final call. The instruction-file floor survives but is defined by role rather than by path glob, and its escape is a refutation attempt rather than a classification question. Calibration cases are inlined in the skill, not the design doc.

**Tech Stack:** Markdown skill files. `node --test` for the repo suite (no test covers this skill — see Global Constraints). `gh` CLI for the follow-up record. `git` for the release steps.

## Global Constraints

- **Design doc:** `docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md`. Read it before starting; every task implements a named section.
- **Work in the existing worktree.** `worktree.always: true` is set in `.claude-tweaks/policy.yml`. This plan is executed from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/mechanical-vs-substantive-merge-judgment` on branch `worktree-mechanical-vs-substantive-merge-judgment`. Do not create a second worktree. Before any commit, verify location: `pwd && git rev-parse --show-toplevel && git branch --show-current`.
- **Single file for Tasks 1-3:** `skills/assess-agent-autonomy/SKILL.md`. Do not touch `bin/`, do not add config keys, do not edit producer skills (`harness-health`, `docs-health`).
- **No new module, no taxonomy, no per-change-type rules.** The design's Non-goals section is binding: this skill exists to replace mechanical gates.
- **Commit message style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Reference the record as `refs #78`, never `closes #78` — the release task closes it.
- **Every commit ends with:** `Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9`
- **Verify staged contents before every commit:** `git diff --cached --name-only`. `git commit` with no pathspec takes the entire staged index.
- **No test covers this skill.** `evals/` has no `assess-agent-autonomy` case and no `merge-check` fixture. `npm test` is run as a regression check that nothing structural broke, not as proof the change works. Do not claim the change is verified by the suite.

---

### Task 1: Redefine merge-check's instruction-file floor and blast-radius weighting

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md` — `## Mode: merge-check` → `### Step 2: Judge`, bullets 2 and 3 (currently lines 233-242)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the phrase **`agent-instruction file`** as this skill's name for the protected class, and a `#### Calibration` heading anchor under `merge-check`'s Step 2. Task 2 and Task 3 both reference the class by that exact phrase.

- [ ] **Step 1: Confirm the pre-state**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/mechanical-vs-substantive-merge-judgment"
grep -c "regardless of size" skills/assess-agent-autonomy/SKILL.md
grep -c "agent-instruction" skills/assess-agent-autonomy/SKILL.md
```

Expected: `1` then `0`. If the first is not `1`, the bullet has already been edited — stop and re-read the file before proceeding.

- [ ] **Step 2: Replace the skill-file floor bullet**

Find this bullet (it begins the line `- **A new or substantially-edited`):

```markdown
- **A new or substantially-edited `skills/**/*.md` or `agents/**/*.md` file is `needs-human`,
  regardless of size.** Generalizes the old `harness-health:new-skill` exclusion — both directories
  hold files that shape future agent behavior (skill procedures, subagent definitions like
  `agents/qa-agent.md`), which is high-leverage independent of how small the diff looks.
```

Replace it with:

```markdown
- **An agent-instruction file is `needs-human` unless a refutation attempt clears it.** An
  agent-instruction file is any file this project's harness loads as *instruction* rather than as
  *subject matter*: `CLAUDE.md`/`AGENTS.md`, `.claude/rules/*`, `.claude/skills/**`,
  `.claude/agents/**`, and — in a repository that *is* a plugin — its own `skills/**`/`agents/**`
  sources. Resolve the class by that role for the project at hand; do not match a fixed path list,
  which is wrong in every repository whose layout differs from the one it was written against.
  `_shared/harness-health-analysis.md` resolves the same set the same way. These files encode
  instructions future agents follow, which is high-leverage independent of how small the diff looks.

  **The escape is a refutation, not a classification.** Do not ask "is this change mechanical?" —
  that phrasing invites agreement. Instead, try to name a concrete behavior an agent could take
  differently after the edit: an instruction it would now follow, skip, or apply at a different
  threshold; a claim it would now reason from. Render `auto-merge` only when a genuine attempt to
  name one comes up empty. If you can name any candidate — including one you are unsure about —
  render `needs-human`. A correction can be factually true and independently verifiable and still
  change what agents infer; truth is not the test, behavior delta is.
```

- [ ] **Step 3: Replace the blast-radius bullet**

Find this bullet (it begins `- **Weigh \`blastRadiusSummary.implLines\``):

```markdown
- **Weigh `blastRadiusSummary.implLines`/`implFiles` against the project's configured
  `automerge-max-lines`/`automerge-max-files`** as one input, not a cutoff — a diff comfortably
  under the configured guideline (e.g. #18's 33 impl lines under a 40-line guideline) supports
  `auto-merge` when review is clean; a diff well past it is a reason to lean `needs-human` even
  with a clean review, but is not an automatic disqualifier the way the old mechanical gate was.
  `testLines`/`testFiles` are informational only — never weigh test-file bulk toward risk.
```

Replace it with:

```markdown
- **Weigh `blastRadiusSummary.implLines`/`implFiles` against the project's configured
  `automerge-max-lines`/`automerge-max-files` — but only over the diff's behavior-carrying
  portion.** Size proxies review burden, not risk: a large diff in which every hunk is the same
  behavior-preserving transformation (a rename, a corrected constant, a call site updated
  uniformly, dead code removed) is safer than a small one that changes a branch condition. So ask
  first whether the diff is behavior-preserving as a whole — a single hunk that is not an instance
  of the same transformation makes the whole diff behavior-carrying. When it is behavior-preserving
  and review is clean, exceeding the configured guideline is not by itself a reason to lean
  `needs-human`. When it carries behavior change, weigh the guideline as one input, not a cutoff —
  a diff comfortably under it (e.g. #18's 33 impl lines under a 40-line guideline) supports
  `auto-merge` when review is clean; well past it is a reason to lean `needs-human`, but not an
  automatic disqualifier the way the old mechanical gate was. `testLines`/`testFiles` are
  informational only — never weigh test-file bulk toward risk.
```

- [ ] **Step 4: Verify the edit landed and the old text is gone**

```bash
grep -c "regardless of size" skills/assess-agent-autonomy/SKILL.md
grep -c "agent-instruction file" skills/assess-agent-autonomy/SKILL.md
grep -c "behavior-carrying" skills/assess-agent-autonomy/SKILL.md
grep -c "high-leverage independent" skills/assess-agent-autonomy/SKILL.md
```

Expected in order: `0`, `3` or more, `2`, `2`.

The last one stays `2`: this task rewords `merge-check`'s copy but keeps the phrase, and `grant-check`'s copy is Task 2's job. If it drops to `1` here, Task 1 deleted something Task 2 needs to find.

- [ ] **Step 5: Run the suite as a regression check**

```bash
npm test > /tmp/task1-test.log 2>&1; echo "exit=$?"; tail -8 /tmp/task1-test.log
```

Expected: `exit=0`, `# fail 0`. This proves nothing about the judgment change — it proves no test that reads skill files broke.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel && git branch --show-current
git add skills/assess-agent-autonomy/SKILL.md
git diff --cached --name-only
git commit -m "Define merge-check's instruction floor by role, weigh size on behavior — refs #78

The floor named skills/** and agents/**, this repository's own layout, so it
never matched a consuming project's .claude/skills/ and never covered
.claude/rules/ at all. It now resolves by role. Its escape is a refutation
attempt rather than a mechanical/substantive classification, and the
blast-radius guideline binds only on the behavior-carrying portion of a diff.

Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9"
```

---

### Task 2: Relax grant-check's recommendation and fix the Anti-Patterns row

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md` — `## Mode: grant-check` → `### Step 2: Judge`, bullet 2 (currently lines 94-103); `## Anti-Patterns` table row (currently line 407)

**Interfaces:**
- Consumes: Task 1's phrase `agent-instruction file` and the class definition under `merge-check`'s Step 2.
- Produces: nothing later tasks depend on.

**Why the Anti-Patterns row is not cosmetic:** Step 2 already says "creating or **substantially** editing", but the row says "new-or-**changed** … regardless of how clean or small the change looks". The row is phrased as an absolute and is what a judging agent obeys. Editing the bullet without the row changes nothing.

- [ ] **Step 1: Confirm the pre-state**

```bash
grep -c "new-or-changed" skills/assess-agent-autonomy/SKILL.md
grep -c "high-leverage independent" skills/assess-agent-autonomy/SKILL.md
```

Expected: `1` then `2`.

- [ ] **Step 2: Replace grant-check's instruction-file bullet**

Find this bullet (it begins `- Does the record describe creating or substantially editing`):

```markdown
- Does the record describe creating or substantially editing a file under `skills/**/*.md` or
  `agents/**/*.md` (a new or changed skill, or a new or changed subagent definition)? This includes
  `harness-health:new-skill` findings — their body reads "**New skill candidate**" with a "Proposed
  new skill" deliverable (see `bin/lib/harness-health/issue-payload.js`). Recognize this from body
  content, not from a label — `new-skill` findings currently carry no `risk:*`/`effort:*` labels at
  all, by design, so labels alone tell you nothing here. A well-specified new-skill proposal can
  still reasonably recommend `RECOMMEND_BUILD: true` (drafting the content autonomously is fine — a
  human still confirms the grant, and reviews again before any merge), but recommend
  `RECOMMEND_MERGE: false` — new skill and agent-definition files encode instructions future agents
  follow, which is high-leverage independent of how small or clean the proposal looks.
```

Replace it with:

```markdown
- Does the record describe creating or editing an agent-instruction file (see `merge-check`'s Step
  2 for the class — a skill, a subagent definition, `CLAUDE.md`/`AGENTS.md`, or a rules file)? This
  includes `harness-health:new-skill` findings — their body reads "**New skill candidate**" with a
  "Proposed new skill" deliverable (see `bin/lib/harness-health/issue-payload.js`). Recognize this
  from body content, not from a label — `new-skill` findings currently carry no `risk:*`/`effort:*`
  labels at all, by design, so labels alone tell you nothing here. A well-specified new-skill
  proposal can still reasonably recommend `RECOMMEND_BUILD: true` — drafting content autonomously
  is fine, since a human confirms the grant and reviews again before any merge.

  For `RECOMMEND_MERGE`, judge what the record's own body describes. A record proposing content
  that adds or changes instructions agents follow is `false`; a **new** skill or subagent
  definition is always `false`, since a new instruction file is new instructions by definition. A
  record describing only repair to what the file points at — a moved path, a renamed anchor, a
  stale cross-reference — can be `true`. Whatever you recommend, state in the `RATIONALE` that
  `merge-check` re-judges the real diff at merge time and may still route to a human: the grant
  authorizes an attempt, it does not promise a merge. Recommending `true` on a body that reads
  clean is safe precisely because the diff is judged again against this class's floor.
```

- [ ] **Step 3: Replace the Anti-Patterns row**

Find this row (single line, begins `| Recommending \`RECOMMEND_MERGE: true\` for a new-or-changed`):

```markdown
| Recommending `RECOMMEND_MERGE: true` for a new-or-changed `skills/**/*.md` or `agents/**/*.md` file | Skill and agent-definition files shape future agent behavior — this is a hard `needs-human`/`false` case regardless of how clean or small the change looks. |
```

Replace it with these two rows:

```markdown
| Rendering `auto-merge` on an agent-instruction change without attempting to refute it | The escape from that floor is a refutation attempt, not a classification: name a behavior an agent could take differently, and pass only when the attempt genuinely comes up empty. Reading a diff as "looks small and tidy" and skipping the attempt is the failure this row exists to catch. |
| Treating a correction as safe because it is factually true and verifiable | Truth is not the test — behavior delta is. A claim corrected from wrong to right still changes what agents reason from, which is exactly the case a verifiable-therefore-safe heuristic waves through. |
```

- [ ] **Step 4: Verify**

```bash
grep -c "new-or-changed" skills/assess-agent-autonomy/SKILL.md
grep -c "high-leverage independent" skills/assess-agent-autonomy/SKILL.md
grep -c "re-judges the real diff" skills/assess-agent-autonomy/SKILL.md
grep -c "Truth is not the test" skills/assess-agent-autonomy/SKILL.md
```

Expected in order: `0`, `1`, `1`, `1`.

The second dropping from `2` to `1` is the point: `grant-check`'s copy is gone, `merge-check`'s remains.

- [ ] **Step 5: Run the suite**

```bash
npm test > /tmp/task2-test.log 2>&1; echo "exit=$?"; tail -8 /tmp/task2-test.log
```

Expected: `exit=0`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel && git branch --show-current
git add skills/assess-agent-autonomy/SKILL.md
git diff --cached --name-only
git commit -m "Let grant-check recommend on content and defer to merge-check — refs #78

Step 2 already said 'substantially editing' while the Anti-Patterns row said
'new-or-changed ... regardless of how clean or small', phrased as an absolute.
The row is what a judging agent obeyed, so every skill-file record drew
RECOMMEND_MERGE: false. The row is replaced, and grant-check now states that
merge-check re-judges the real diff so a grant cannot promise a merge.

Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9"
```

---

### Task 3: Inline the calibration cases

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md` — insert a `#### Calibration` subsection at the end of `## Mode: merge-check` → `### Step 2: Judge`, immediately before `### Step 3: Render`

**Interfaces:**
- Consumes: Task 1's `agent-instruction file` class and behavior-carrying language.
- Produces: nothing later tasks depend on.

**Why inline rather than in the design doc:** the skill's Relationship table currently cites a design doc for "calibration examples this skill's judgment procedures are anchored against" — and that file was deleted by commit `652a97c4` under ADR-0007. Calibration that routine cleanup can delete is not durable. Cases are stated as shapes, not issue references, for the same reason: an issue closes and its defect gets fixed, and calibration anchored to one then describes a state that no longer exists.

- [ ] **Step 1: Confirm the insertion point**

```bash
grep -n "^### Step 3: Render" skills/assess-agent-autonomy/SKILL.md | head -2
```

Expected: two or more line numbers. The insertion goes immediately before the **second** one (the one inside `## Mode: merge-check`). Confirm which by checking the nearest preceding mode heading:

```bash
awk '/^## Mode:|^### Step 3: Render/ {print NR": "$0}' skills/assess-agent-autonomy/SKILL.md
```

Insert before the `### Step 3: Render` that follows `## Mode: merge-check`.

- [ ] **Step 2: Insert the Calibration subsection**

```markdown
#### Calibration

Boundary cases are stated as shapes, not as issue references — an issue closes and its defect gets
fixed, and calibration anchored to one then describes a state that no longer exists.

| Change | Verdict | Why |
|--------|---------|-----|
| A skill's factual claim corrected — e.g. state described as independent, corrected to a shared singleton | `needs-human` | True, verifiable, and still changes how agents reason about concurrency. The case that kills "verifiable therefore safe". |
| A threshold, budget, or cap literal changed | `needs-human` | Reads as a number correction; directly changes what agents do at the limit. "Small and numeric" is not a safety signal. |
| A section reworded so an existing instruction reads more strongly or more weakly | `needs-human` | No instruction added or removed, yet the threshold for following it moved. |
| A stale cross-reference repaired after a file split — `above`/`below` pointers, a moved path, a renamed anchor | `auto-merge` eligible | Pointer repair. The refutation attempt comes up empty: no agent acts differently, it just finds the target. |
| A dead pointer deleted, nothing replacing it | `auto-merge` eligible | Removes an instruction that could not be followed. Confirm nothing else cited the removed target. |
| A behavior-preserving rename spanning many files, review clean | `auto-merge` eligible | Uniformly one transformation. Exceeding `automerge-max-lines` is review burden, not risk. |
| A rename spanning many files where one hunk also changes a default | `needs-human` | One non-conforming hunk makes the whole diff behavior-carrying — the guideline binds again. |
```

- [ ] **Step 3: Verify placement and content**

```bash
grep -n "^#### Calibration" skills/assess-agent-autonomy/SKILL.md
awk '/^## Mode: merge-check/,/^## Mode: failure-check/' skills/assess-agent-autonomy/SKILL.md | grep -c "^#### Calibration"
grep -c "auto-merge. eligible" skills/assess-agent-autonomy/SKILL.md
```

Expected: one line number; then `1` — proving the subsection landed inside `merge-check` and not another mode; then `3` (the table's three `auto-merge` eligible rows; the other four are `needs-human`).

- [ ] **Step 4: Verify the table renders as a table**

Markdown tables break silently when a cell contains an unescaped `|`. Confirm every row has the same column count:

```bash
awk '/^\| A skill.s factual claim/,/^\| A rename spanning/ {n=gsub(/\|/,"|"); print n": "substr($0,1,60)}' skills/assess-agent-autonomy/SKILL.md
```

Expected: every line reports `4`. Any row reporting a different count has a stray pipe — fix it before committing.

- [ ] **Step 5: Run the suite**

```bash
npm test > /tmp/task3-test.log 2>&1; echo "exit=$?"; tail -8 /tmp/task3-test.log
```

Expected: `exit=0`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel && git branch --show-current
git add skills/assess-agent-autonomy/SKILL.md
git diff --cached --name-only
git commit -m "Inline merge-check's calibration cases as shapes, not issue refs — refs #78

The skill cited a design doc for its calibration examples; that doc was deleted
under ADR-0007, so the anchor dangled. Cases now live in the skill, and are
stated as shapes rather than issue references so they do not rot when the
issue they describe gets fixed.

Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9"
```

---

### Task 4: Repoint the dangling assess-agent-autonomy design-doc references

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md:422` (Relationship table row)
- Modify: `skills/wrap-up/review-console.md:33`
- Modify: `skills/dispatch/settle-and-merge.md:75`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Scope note — read before starting.** Three live skill files cite `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`, which does not exist. A *different* missing doc, `2026-07-15-fast-lane-pipeline-profile-design.md`, is cited from a wider set: `skills/assess-agent-autonomy/SKILL.md`, `skills/build/architecture-alignment.md`, `skills/flow/manifesto.md`, `skills/flow/materialize.md`, `skills/reflect/light-mode.md` (twice), `skills/wrap-up/SKILL.md`, `skills/wrap-up/skill-curation.md`. **Those are deliberately out of scope** — they concern `ceremony-profile`, not merge judgment, and fixing the one row that happens to sit in this skill's table while leaving the rest would be worse than leaving the whole set consistent. Task 6 files them as their own record. Do not touch them. References inside `CHANGELOG.md` and `docs/superpowers/plans/` are historical record and stay as they are.

- [ ] **Step 1: Confirm exactly which sites are in scope**

```bash
grep -rn "2026-07-15-assess-agent-autonomy-design" --include="*.md" skills/
```

Expected: exactly three hits — `skills/assess-agent-autonomy/SKILL.md`, `skills/wrap-up/review-console.md`, `skills/dispatch/settle-and-merge.md`. If there are more, they are in scope too; if fewer, someone already fixed one.

- [ ] **Step 2: Replace the Relationship table row**

In `skills/assess-agent-autonomy/SKILL.md`, find:

```markdown
| `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` | The full design rationale, motivation (the #18/#19 evidence), and calibration examples this skill's judgment procedures are anchored against. |
```

Replace with:

```markdown
| `docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md` | Design rationale for `merge-check`'s behavior-delta criterion: why the instruction-file floor is defined by role rather than by path, why its escape is framed as a refutation rather than a classification, and why the blast-radius guideline binds only on behavior-carrying diffs. Calibration cases live in this skill (`merge-check` Step 2), deliberately not in the design doc — the previous anchor was a design doc, and it was pruned. |
```

- [ ] **Step 3: Fix the two consumer references**

In `skills/wrap-up/review-console.md`, on the line containing `replacing the old three independent mechanical checks`, replace:

```markdown
 — see `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`
```

with:

```markdown
 — see `docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md`
```

Apply the identical replacement in `skills/dispatch/settle-and-merge.md`, which carries the same clause.

- [ ] **Step 4: Verify no dangling reference remains, and the new target exists**

```bash
grep -rn "2026-07-15-assess-agent-autonomy-design" --include="*.md" skills/ ; echo "exit=$?"
ls docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md
grep -rl "2026-08-03-mechanical-vs-substantive-merge-judgment-design" --include="*.md" skills/ | sort
```

Expected: no output from the first grep and `exit=1`; the `ls` succeeds; the third lists exactly `skills/assess-agent-autonomy/SKILL.md`, `skills/dispatch/settle-and-merge.md`, `skills/wrap-up/review-console.md`.

- [ ] **Step 5: Confirm the out-of-scope set is untouched**

```bash
grep -rc "2026-07-15-fast-lane-pipeline-profile-design" --include="*.md" skills/ | grep -v ":0$" | sort
```

Expected: exactly these seven lines, unchanged by this task —

```
skills/assess-agent-autonomy/SKILL.md:1
skills/build/architecture-alignment.md:1
skills/flow/manifesto.md:1
skills/flow/materialize.md:1
skills/reflect/light-mode.md:2
skills/wrap-up/skill-curation.md:1
skills/wrap-up/SKILL.md:1
```

Any difference means this task strayed outside its scope. Note `grep -rl` piped to `wc -l` would also "pass" here while hiding which files moved — compare the listing itself, not a count.

- [ ] **Step 6: Run the suite and commit**

```bash
npm test > /tmp/task4-test.log 2>&1; echo "exit=$?"; tail -8 /tmp/task4-test.log
pwd && git rev-parse --show-toplevel && git branch --show-current
git add skills/assess-agent-autonomy/SKILL.md skills/wrap-up/review-console.md skills/dispatch/settle-and-merge.md
git diff --cached --name-only
git commit -m "Repoint merge-check's design-doc citations at the live design — refs #78

Three live skill files cited a design doc deleted by 652a97c4. That commit
described itself as fixing stale references and missed these. The fast-lane
doc's five dangling citations are a separate concern and are left consistent.

Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9"
```

---

### Task 5: Version bump, changelog, and marketplace mirror

**Files:**
- Modify: `.claude-plugin/plugin.json` (`version`)
- Modify: `CHANGELOG.md` (new entry at top, below the `# Changelog` heading)
- Modify (separate repo): `thomasholknielsen/claude-tweaks-marketplace` → `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: Tasks 1-4 committed.
- Produces: the released version.

**This is one action, not two.** CLAUDE.md's Releasing section authorizes both repository pushes together. Do not stop to ask between the plugin push and the marketplace mirror.

- [ ] **Step 1: Check for a concurrent bump before choosing a number**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
node -e "console.log(require('./.claude-plugin/plugin.json').version)"
git show origin/main:.claude-plugin/plugin.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('origin:',JSON.parse(s).version))"
```

Local reads `6.28.0` at plan time. **Use whichever of local/origin is higher as the base, and bump the minor from there** — a feature addition. If origin is already at or past your intended number, another session bumped it; renumber rather than colliding. Two sessions picking the same number merge without textual conflict, so this check is the only thing that catches it.

- [ ] **Step 2: Bump the version**

Set `version` in `.claude-plugin/plugin.json` to the chosen number (minor bump from the higher base).

- [ ] **Step 3: Add the CHANGELOG entry**

Insert directly below the `# Changelog` heading, matching the existing `## vX.Y.Z — Title (closes #N)` format. Replace `X.Y.Z` with the chosen version:

```markdown
## vX.Y.Z — merge-check judges behavior delta, not diff size or file path (closes #78)

`merge-check`'s instruction-file floor named `skills/**` and `agents/**` — this
repository's own layout. In any project where the plugin is the harness it never
matched `.claude/skills/`, missed `.claude/agents/`, and never covered
`.claude/rules/` at all, leaving `CLAUDE.md` — the highest-leverage instruction
file a project has — with weaker merge protection than a single skill file. The
floor now resolves by role: any file the harness loads as instruction rather than
as subject matter.

The floor also gained an escape. Previously every instruction-file change was
`needs-human` regardless of content, so a backlog refine run over harness-health
drift fixes returned a uniform withhold — a caution that fires on everything stops
carrying information. The escape is a refutation attempt rather than a
mechanical-or-substantive classification: name a behavior an agent could take
differently after the edit, and pass only when the attempt comes up empty.

Blast radius stopped being a proxy for risk. `automerge-max-lines`/
`automerge-max-files` now weigh only the behavior-carrying portion of a diff, so a
large uniform rename with a clean review is no longer leaned against while a small
change to a branch condition sails through.

`grant-check` recommends on content and states plainly that `merge-check` re-judges
the real diff, so a grant authorizes an attempt rather than promising a merge. Its
Anti-Patterns row — which said "new-or-changed … regardless of how clean or small"
and silently overrode Step 2's own "substantially editing" qualifier — is replaced.
Calibration cases now live in the skill rather than in a design doc, since the
previous anchor was a design doc and it was pruned.
```

- [ ] **Step 4: Verify and commit the bump**

```bash
node -e "console.log(require('./.claude-plugin/plugin.json').version)"
head -3 CHANGELOG.md
npm test > /tmp/task5-test.log 2>&1; echo "exit=$?"; tail -8 /tmp/task5-test.log
```

Expected: the version matches the CHANGELOG heading; `exit=0`, `# fail 0`.

```bash
pwd && git rev-parse --show-toplevel && git branch --show-current
git add .claude-plugin/plugin.json CHANGELOG.md
git diff --cached --name-only
git commit -m "Release vX.Y.Z — behavior-delta merge judgment (closes #78)

Claude-Session: https://claude.ai/code/session_012Dk6PyURMvjazHQ8fZ5VN9"
```

- [ ] **Step 5: Merge to main and push**

Do not run `git merge` and `git push` as one compound command from the main checkout — the worktree policy hook denies the whole invocation, so the merge silently does not happen either. Push the branch ref directly instead:

```bash
git push . HEAD:main
git push origin main
```

If `git push . HEAD:main` is refused because `main` is checked out elsewhere, verify that checkout's branch first and use a branch-guarded fast-forward there, as separate calls.

- [ ] **Step 6: Mirror to the marketplace repo**

In `thomasholknielsen/claude-tweaks-marketplace`, edit `.claude-plugin/marketplace.json`:

- Set `plugins[].version` to the version just released — it mirrors the plugin exactly.
- Bump `metadata.version` on its own `2.x` scheme — this is the catalog's independent number, not a mirror.
- Confirm `plugins[].description` still matches `plugin.json`'s description; update it if the release changed it (this one does not).

Commit and push `main` in that repo.

---

### Task 6: File the out-of-scope findings as records

**Files:** none — `gh` only.

**Interfaces:**
- Consumes: Task 4's scope note.
- Produces: nothing.

- [ ] **Step 1: Verify #98 really is already resolved before closing it**

The record says `code-health` SKILL.md names three calibration fragments while the catalog loads up to fourteen. Check the live file rather than trusting the body:

```bash
grep -n "calibration" skills/code-health/SKILL.md | head -10
```

If no fragment count is stated — the file having adopted the count-deferral idiom from #102 — close it:

```bash
gh issue close 98 --comment "Already resolved: code-health/SKILL.md no longer states a fragment count, having adopted the count-deferral idiom that closed #102. Verified against the live file, not the issue body."
```

If a count *is* still stated, leave the record open and say so in the handoff.

- [ ] **Step 2: File the fast-lane dangling-reference record**

```bash
gh issue create --title "Live skill files across seven paths cite the pruned fast-lane design doc" --label "type:task,priority:low,risk:low,effort:low" --body "**Current State:** \`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md\` was deleted by commit 652a97c4 under ADR-0007, but is still cited as live rationale from \`skills/assess-agent-autonomy/SKILL.md\`, \`skills/build/architecture-alignment.md\`, \`skills/flow/manifesto.md\`, \`skills/flow/materialize.md\`, \`skills/reflect/light-mode.md\` (twice), \`skills/wrap-up/SKILL.md\`, and \`skills/wrap-up/skill-curation.md\`. Agents reading those skills are pointed at a file that does not exist. References in CHANGELOG.md and docs/superpowers/plans/ are historical record and are fine.

**Deliverables:** Decide per site whether the rationale should be restated inline, repointed at \`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md\` (which amends it and does exist), or dropped. Apply consistently across all five.

**Acceptance Criteria:** \`grep -rn '2026-07-15-fast-lane-pipeline-profile-design' --include='*.md' skills/\` returns nothing.

Found while implementing #78, which fixed the sibling dangling reference to the assess-agent-autonomy design doc and deliberately left this set consistent rather than fixing one of five."
```

- [ ] **Step 3: File the evals-coverage record**

```bash
gh issue create --title "assess-agent-autonomy has no eval coverage for any of its four judgments" --label "type:task,priority:medium,risk:low,effort:medium" --body "**Current State:** \`evals/\` has no \`assess-agent-autonomy\` case and no fixture carrying a diff, so none of grant-check, merge-check, failure-check, or ceremony-check has automated coverage. Every change to these judgments ships verified only by reading the prose. #78 made merge-check's criterion materially more permissive for behavior-preserving diffs, which raises what a regression costs.

**Deliverables:** A fixture repository under \`evals/fixtures/\` with a git history and planted diffs spanning the boundary cases in merge-check's Calibration table, plus eval cases asserting the verdict for each.

**Acceptance Criteria:** \`npm test\` in \`evals/\` exercises merge-check against at least one behavior-preserving diff expected to clear and one behavior-carrying diff expected to render needs-human.

Filed from #78's design, which scoped this out deliberately rather than smuggling a fixture build into a markdown change."
```

- [ ] **Step 4: Report the record numbers in the handoff.**

---

## Self-Review

**Spec coverage.** Every design section maps to a task: the behavior-delta thesis and the three merge-check changes → Task 1; grant-check plus the Anti-Patterns row → Task 2; calibration inline as shapes → Task 3; the dangling-anchor fix → Task 4; version bump and marketplace mirror from the Surface section → Task 5; the deferred evals gap from the Verification section → Task 6. The design's Non-goals are carried into Global Constraints as binding.

**Placeholder scan.** No TBD/TODO. Every edit gives literal before-and-after text. `X.Y.Z` in Task 5 is a computed value with its derivation stated in Step 1, not an unfilled blank.

**Consistency.** `agent-instruction file` is introduced in Task 1 and used by Tasks 2 and 3 under that exact phrase. Task 1 Step 4 expects `high-leverage independent` to stay at `2`; Task 2 Step 1 expects `2` and Step 4 expects `1` — the counts chain correctly across tasks.

**Verification greps were run against the live file during authoring**, not estimated: `regardless of size` is `1` in the target and also appears in two other skills, so every grep is scoped to the file; `high-leverage independent` is `2`, which is what makes it a usable cross-task discriminator; `agent-instruction` is `0`, so the post-state check cannot pass accidentally.

Running them caught three plan bugs that reading would not have:

- Task 4's scope note said the fast-lane doc was cited from five sites. It is cited from seven files, eight times. The undercount came from a `| head -20` on the authoring grep, which silently cut the tail — the same failure the plan is meant to prevent. Corrected, and the check now compares the file listing rather than a count, so a moved citation cannot pass as a matching total.
- Task 3's post-state check expected four `auto-merge` eligible rows; the table has three. Corrected.
- `grep -rlc` was used in two places on the assumption it prints counts. It does not — `-l` wins, and piping to `wc -l` yields a file count that would mask which files changed. Both replaced with listing comparisons.
