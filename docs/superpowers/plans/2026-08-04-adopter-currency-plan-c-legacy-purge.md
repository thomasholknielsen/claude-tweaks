# Plan C — Legacy Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every backward-compatibility path in the plugin, in one sweep, with no deprecation window and no migration machinery.

**Architecture:** The marketplace `source` is an unpinned git URL, so every install tracks `main` HEAD — there are no pinned versions in the wild, and the plugin's only consumer is its author across projects they control. Compatibility here is a tax paid to oneself. Nine families are purged in three tiers, ordered by how much verification each needs before it is safe to cut.

**Tech Stack:** Markdown skill files; Node 18+ CommonJS under `bin/lib/`; `node --test`; `gh` CLI.

## Global Constraints

- **Independent of Plans A and B** except for one shared number — see the coupling note below. Can run before, after, or interleaved.
- Work in the existing worktree at `.claude/worktrees/adopter-currency-contract` on branch `worktree-adopter-currency-contract`. `worktree.always: true` — do NOT create a second worktree.
- **Purge by provenance, never by name.** At least one retired name was reused for something live. Verified during plan authoring: `status:in-progress` is genuinely retired, but the *claim system* uses `bot:in-progress` (`_shared/issue-claims.md:163`). Any name-matching sweep would have to distinguish them.
- Every `docs/superpowers/` grep exclusion is written `^docs/superpowers/`, never `^./docs/superpowers/` — `grep -rn PATTERN .` here emits paths with no leading `./`, so a `^./` anchor silently matches nothing (`[IL-39]`).
- Verification greps anchor to path position, never a bare content substring (`[IL-34]`). Exclude `docs/superpowers/` — the design doc and all three plans quote every retired pattern verbatim (`[IL-28]`).
- Never write a "prove it's gone" grep expecting no output where the replacement text legitimately contains the searched term (`[IL-55]`).
- **Coupling with Plan A.** Task 4 removes four keys from `POLICY_KEYS`; Plan A Task 2 adds two. `tests/policy-schema.test.js` pins the length. Whichever plan lands second must **recount `POLICY_KEYS` directly** rather than trusting either plan's stated literal.
- Commit style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End every commit body with `Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY`.

## File Structure

| File / area | Change |
|---|---|
| `skills/flow/`, `skills/wrap-up/`, `skills/build/`, `skills/specify/`, `skills/tidy/` | Legacy spec-file alias removed |
| `specs/INDEX.md`, `specs/DEFERRED.md`, `specs/INBOX.md` | Deleted |
| `bin/lib/policy-schema.js`, `skills/_shared/policy-schema.md`, `tests/policy-schema.test.js` | Four `triage-*` aliases removed |
| `skills/_shared/work-record-config.md`, `skills/capture/`, `skills/challenge/`, `skills/tidy/` | `backlog-backend` alias removed |
| `skills/stories/`, `skills/test/` | `auth.yml` + v1 stories format removed |
| `skills/init/update-mode.md` | Retired `## Auto-mode policy` migration block removed |
| `README.md`, `CLAUDE.md` | Tier 3 docs |
| `docs/incident-log.md`, `CLAUDE.md` | New Don't |

---

### Task 1: Delete the stale `status:in-progress` label

Resolved during plan authoring, but re-verify before acting — the repository's live label state may have changed.

**Files:**
- Modify: none in the repo (GitHub label state only)

**Interfaces:**
- Consumes: nothing
- Produces: a clean label namespace for Task 6's `/tidy` legacy-taxonomy removal

- [ ] **Step 1: Re-verify the provenance split**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n "bot:in-progress" skills/_shared/issue-claims.md | head -3
grep -rn "status:in-progress" skills/ --include="*.md"
gh label list --limit 100 | grep -E "^(status:|bot:)"
```

Expected: `bot:in-progress` is the label `issue-claims.md` documents. `status:in-progress` appears in **no** skill file. The `gh label list` output shows `status:in-progress` defined with a description referencing `_shared/issue-claims.md` — a file that does not use it.

If `status:in-progress` DOES appear in a skill file, STOP: the resolution recorded here is wrong and the label is live. Do not delete it.

- [ ] **Step 2: Confirm no open issue carries it**

```bash
cd "$(git rev-parse --show-toplevel)"
gh issue list --state open --limit 200 --json number,labels \
  -q '.[] | select(.labels[].name | startswith("status:")) | .number'
```

Expected: no output. If any issue is returned, relabel it to the `bot:` equivalent before deleting the label — deleting a label removes it from every issue silently.

- [ ] **Step 3: Delete the label**

```bash
cd "$(git rev-parse --show-toplevel)"
gh label delete "status:in-progress" --yes
gh label list --limit 100 | grep -E "^status:" || echo "no status:* labels remain"
```

Expected: the label is gone and no other `status:*` label exists.

- [ ] **Step 4: Commit (documentation only — no repo change yet)**

No repo files changed in this task. Record the outcome in the next task's commit body instead. Do not create an empty commit.

---

### Task 2: Purge the legacy spec-file alias

The largest family. `[IL-51]` and `[IL-43]`: parallel agents editing shared files race on one git index, so agents are dispatched **edit-only** and every git operation runs centrally afterwards.

**Surface shrank since authoring.** The skill-bloat Relationship-table removal (landed on `main` as `7ed9edb5`) took out some of these mentions as a side effect. Measured at `c001b676`: `flow/SKILL.md` 4, `wrap-up/SKILL.md` 2, `build/SKILL.md` 3, and `specify/SKILL.md` / `tidy/SKILL.md` now **0**. Sub-files are unaffected. Re-run Step 1's enumeration rather than trusting either figure — this is exactly the `[IL-41]` case where a related change was already part of the resolution.

**Files:**
- Modify: `skills/flow/SKILL.md`, `skills/flow/multi-spec.md`, `skills/flow/materialize.md`, `skills/wrap-up/SKILL.md`, `skills/build/SKILL.md`, `skills/build/build-options.md`, `skills/specify/SKILL.md`, `skills/specify/spec-template.md`, `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: nothing
- Produces: a record-reference-only input grammar across the lifecycle skills

- [ ] **Step 1: Enumerate the real surface before dispatching**

The per-file counts in the design are `grep -c -i legacy` totals covering *all* families, not this one. Get this family's actual sites:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "spec number (legacy alias)\|legacy spec-file\|Spec mode (legacy alias)\|legacy numeric spec\|legacy alias" \
  --include="*.md" skills/ | grep -v "^docs/superpowers/" | tee /tmp/spec-alias-sites.txt
wc -l /tmp/spec-alias-sites.txt
```

Record the count. Every dispatched agent's brief names only its own files, drawn from this list.

- [ ] **Step 2: Dispatch edit-only agents, one per skill directory**

Per `_shared/subagent-output-contract.md`, inline the output template verbatim — a reference does not reach the agent. Each brief must state:

> Work in `<absolute worktree path>`. Before editing, run `pwd` and `git rev-parse --show-toplevel` and confirm both print that path. **Do not run any git command that stages, commits, or pushes.** Edit files only.
>
> Remove the legacy spec-file alias from these files: `<files>`. The alias lets a bare number (`42`) resolve to `specs/42-*.md` alongside the primary `#N` record reference. Delete the alias from input grammars, resolution ladders, mode tables, and prose. Where a sentence contrasts "record mode" with "spec mode", keep the record half and drop the contrast rather than leaving a dangling comparison.
>
> Do not touch `work-backend: local-files` handling — a bare id under `local-files` is a *current* input form, not the legacy alias. Confusing the two is the main hazard in this task.
>
> Reply with the status line (`DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`) as your first line, then Template A.

Model tier: **Standard** — mechanical removal with one real discrimination (legacy alias vs `local-files` bare id), not synthesis.

- [ ] **Step 3: Grep centrally after all agents return**

Each agent is blind to the others, so each may leave a cross-reference asserting the alias still exists (`[IL-52]`). Central sweep:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "spec number (legacy alias)\|legacy spec-file\|Spec mode (legacy alias)\|legacy numeric spec" \
  --include="*.md" skills/ | grep -v "^docs/superpowers/"
```

Expected: no output. Fix any survivor centrally rather than re-dispatching.

- [ ] **Step 4: Verify `local-files` handling survived**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "local-files" --include="*.md" skills/flow/ skills/build/ | head -5
```

Expected: hits remain. A zero result means an agent over-deleted — restore from `git diff` before committing.

- [ ] **Step 5: Run the suite and commit centrally**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -20
git add skills/
git diff --cached --name-only
git commit -F - <<'EOF'
Remove the legacy spec-file alias across the lifecycle skills

A bare number resolved to specs/{N}-*.md alongside the primary #N record
reference. Verified dead before removal: specs/ holds only tracking files
with no numbered specs, the last commit touching it was itself a legacy
cleanup, and this repo runs work-backend: github-issues with recent commits
using refs #N throughout.

Bare ids under work-backend: local-files are untouched — that is a current
input form, not this alias.

Agents were dispatched edit-only with every git operation run centrally, per
IL-51 and IL-43, then swept centrally for surviving cross-references per
IL-52.

Also verified and deleted: the status:in-progress GitHub label, retired in
the pre-6.0 status:* to bot:* rename. Its label description pointed at
_shared/issue-claims.md, which uses bot:in-progress and never mentions it.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 3: Delete the `specs/` tracking files

**Files:**
- Delete: `specs/INDEX.md`, `specs/DEFERRED.md`, `specs/INBOX.md`

**Interfaces:**
- Consumes: Task 2's alias removal
- Produces: nothing

- [ ] **Step 1: Confirm nothing still reads them**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "specs/INDEX\|specs/INBOX\|specs/DEFERRED" --include="*.md" --include="*.js" . \
  | grep -v "^docs/superpowers/"
```

Expected: no output after Task 2. Any hit is a reader Task 2 missed — fix it there first.

- [ ] **Step 2: Confirm no numbered spec files exist**

```bash
cd "$(git rev-parse --show-toplevel)"
ls specs/
find specs -name "[0-9]*-*.md"
```

Expected: only the three tracking files; the `find` returns nothing. If a numbered spec exists, STOP — it is live work, not residue.

- [ ] **Step 3: Delete and commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git rm specs/INDEX.md specs/DEFERRED.md specs/INBOX.md
git diff --cached --name-only
git commit -F - <<'EOF'
Delete the specs/ tracking files

INDEX.md, DEFERRED.md, and INBOX.md tracked the retired spec-file work-record
mode. With the alias gone and work-backend: github-issues the only backend,
nothing reads them.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 4: Remove the four `triage-*` policy aliases

**Files:**
- Modify: `bin/lib/policy-schema.js`, `skills/_shared/policy-schema.md`, `tests/policy-schema.test.js`
- Modify: `skills/dispatch/SKILL.md:397`, `skills/dispatch/settle-and-merge.md:25`, `skills/dispatch/settle-and-merge.md:28-30`

**Interfaces:**
- Consumes: nothing
- Produces: a `POLICY_KEYS` array whose length both this plan and Plan A change — recount, do not trust a literal

**Note:** unlike the other families, this one has a **live resolution site**, not just schema entries. `settle-and-merge.md` contains executable bash that falls back to `triage-retry-ceiling`. Removing the schema rows without removing that fallback would leave a shell block reading a key the validator no longer knows.

- [ ] **Step 1: Enumerate every site, including consumers**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "triage-retry-ceiling\|triage-fast-track-max-lines\|triage-fast-track-max-files\|triage-dispatch-max-concurrent" \
  --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Expected at plan-authoring time — verified, not assumed — hits in four files: `bin/lib/policy-schema.js`, `skills/_shared/policy-schema.md`, `skills/dispatch/SKILL.md`, and `skills/dispatch/settle-and-merge.md`. The last two are real consumers and are handled in Steps 2-3 below. If the sweep returns a *fifth* file, handle it the same way before proceeding.

- [ ] **Step 2: Remove the executable fallback in `settle-and-merge.md`**

Lines 27-31 currently read:

```bash
   DISPATCH_RETRY_CEILING=$(grep -E "^dispatch-retry-ceiling:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*dispatch-retry-ceiling:[[:space:]]*//')
   if [ -z "$DISPATCH_RETRY_CEILING" ]; then
     DISPATCH_RETRY_CEILING=$(grep -E "^triage-retry-ceiling:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*triage-retry-ceiling:[[:space:]]*//')
   fi
```

Replace with just the primary lookup:

```bash
   DISPATCH_RETRY_CEILING=$(grep -E "^dispatch-retry-ceiling:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*dispatch-retry-ceiling:[[:space:]]*//')
```

Then in the prose at line 25, delete the parenthetical clause `, falling back to the legacy \`triage-retry-ceiling\` alias per \`SKILL.md\`'s Configuration table when the new key is absent` so the sentence reads `(read \`dispatch-retry-ceiling\` from CLAUDE.md/\`policy.yml\`, default 3)`.

- [ ] **Step 3: Delete the Legacy aliases paragraph in `dispatch/SKILL.md`**

Remove line 397 in full:

```
**Legacy aliases:** the pre-grants keys `triage-retry-ceiling`, `triage-fast-track-max-lines`, `triage-fast-track-max-files`, and `triage-dispatch-max-concurrent` are still read as aliases for the four rows above, in that order, when the new key is absent — no project should have to rename its policy file just because this skill was renamed.
```

- [ ] **Step 4: Delete the four entries from `POLICY_KEYS`**

Remove these lines from `bin/lib/policy-schema.js`:

```javascript
  { key: 'triage-retry-ceiling', type: 'integer', default: 3 },
  { key: 'triage-fast-track-max-lines', type: 'integer', default: 40 },
  { key: 'triage-fast-track-max-files', type: 'integer', default: 2 },
  { key: 'triage-dispatch-max-concurrent', type: 'integer', default: 3 },
```

- [ ] **Step 5: Delete the `## Legacy dispatch aliases` section**

Remove that whole section from `skills/_shared/policy-schema.md`, heading and table together.

- [ ] **Step 6: Verify every site is gone**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "triage-retry-ceiling\|triage-fast-track-max-lines\|triage-fast-track-max-files\|triage-dispatch-max-concurrent" \
  --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Expected: no output.

Then confirm the primary key still resolves — the point is removing the fallback, not the lookup:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n "dispatch-retry-ceiling" skills/dispatch/settle-and-merge.md
```

Expected: at least one hit, in the surviving bash lookup.

- [ ] **Step 7: Recount and update the length assertion**

Do NOT trust any literal stated in this plan or Plan A. Count directly:

```bash
cd "$(git rev-parse --show-toplevel)"
node -e "console.log(require('./bin/lib/policy-schema').POLICY_KEYS.length)"
```

Set both assertions in `tests/policy-schema.test.js` to the printed number.

- [ ] **Step 8: Run the suite**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -20
```

Expected: all suites pass. `tests/` includes coverage for `bin/lib/issues/retry.js`, which `settle-and-merge.md`'s block calls — a failure there means Step 2's edit broke the surrounding shell block.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add bin/lib/policy-schema.js skills/_shared/policy-schema.md tests/policy-schema.test.js skills/dispatch/
git diff --cached --name-only
git commit -F - <<'EOF'
Remove the four triage-* legacy policy aliases

They aliased dispatch-retry-ceiling, automerge-max-lines,
automerge-max-files, and dispatch-pick-max-concurrent.

Unlike the other purged families this one had a live resolution site, not
just schema rows: settle-and-merge.md carried executable bash falling back to
triage-retry-ceiling when the primary key was absent. Removing the schema
rows alone would have left a shell block reading a key the validator no
longer knows. The fallback branch is deleted and the primary lookup kept.

POLICY_KEYS length was recounted from the module rather than derived from
either plan's stated literal — Plan A adds two keys and this task removes
four, so a hand-carried number would be wrong whichever landed second.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 5: Remove the `backlog-backend` alias

This one is not merely cost — `README.md:164` documents it producing wrong behavior: a project with only `backlog-backend:` set gets three skills reading it correctly while every other consumer silently defaults to `local-files`.

**Files:**
- Modify: `skills/_shared/work-record-config.md`, `skills/capture/SKILL.md`, `skills/challenge/SKILL.md`, `skills/tidy/SKILL.md` (and any other reader Step 1 finds)
- Modify: `CLAUDE.md` (this repo's own doubled flag)

**Interfaces:**
- Consumes: nothing
- Produces: `work-backend` as the single config key

- [ ] **Step 1: Enumerate every reader**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "backlog-backend" --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Record every hit. The design named `/capture`, `/challenge`, and `/tidy`; confirm rather than assume.

- [ ] **Step 2: Remove the alias fallback from each reader**

In each file found, delete the fallback branch so only `work-backend` is read. Delete the "Legacy alias exception" subsection from `skills/_shared/work-record-config.md` entirely.

- [ ] **Step 3: Fix this repository's own doubled flag**

`CLAUDE.md` currently carries both, at lines 166-167:

```
work-backend: github-issues
backlog-backend: github-issues
```

Delete the `backlog-backend:` line. This is the one CLAUDE.md edit this plan makes — the flag is repo state, not template content, so it is in scope where the rest of `CLAUDE.md` is not.

- [ ] **Step 4: Verify**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "backlog-backend" --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -A
git diff --cached --name-only
git commit -F - <<'EOF'
Remove the backlog-backend legacy alias

Partial aliasing was worse than either full aliasing or none: only /capture,
/challenge, and /tidy read it, so a project setting only backlog-backend had
every other consumer silently default to local-files — documented in
README.md as a live defect, not just doc staleness.

This repository's own CLAUDE.md carried both flags set to the same value as
a workaround; the legacy line is dropped.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 6: Remove the remaining Tier 1 and Tier 2 families

Four smaller families, grouped because each is a self-contained deletion with the same verification shape.

**Files:**
- Modify: `skills/init/update-mode.md` (Auto-Mode-Policy Migration section)
- Modify: `skills/stories/`, `skills/test/` (`auth.yml`, v1 stories)
- Modify: `skills/tidy/step-6-interactive.md`, `skills/backlog/` (legacy taxonomy)

**Interfaces:**
- Consumes: Task 1's label deletion
- Produces: nothing

- [ ] **Step 1: Delete the Auto-Mode-Policy Migration section**

Remove `### Auto-Mode-Policy Migration` from `skills/init/update-mode.md` in full, along with `legacyClaudeMdLevers` handling in `bin/lib/policy-schema.js` and the `LEGACY_CLAUDE_MD_LEVER_KEYS` constant, plus any test covering them. Verify:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "legacyClaudeMdLevers\|LEGACY_CLAUDE_MD_LEVER_KEYS\|Auto-mode policy" \
  --include="*.md" --include="*.js" . | grep -v "^docs/superpowers/"
```

Expected: no output.

- [ ] **Step 2: Check whether any live story file uses the legacy `auth.yml` form**

```bash
cd "$(git rev-parse --show-toplevel)"
find . -name "auth.yml" -not -path "./node_modules/*"
grep -rln "setup.auth" --include="*.yml" . 2>/dev/null | head
```

If any live story uses it, STOP and migrate that story first. If none, remove the `## Legacy auth.yml detection` and `## Legacy auth.yml -> split` sections from `skills/stories/migration.md`, the legacy-auth prompt block from `skills/test/qa-prompts.md`, and the v1-stories detection rows.

- [ ] **Step 3: Remove the legacy-taxonomy scan**

Delete row 9 ("Legacy") from `skills/tidy/step-6-interactive.md`'s table and the corresponding Shape 7 handling in `skills/tidy/scan-procedures.md` and `skills/backlog/refine-mode.md`. Verify:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "tier:approved\|tier:fast-track\|tier:needs-review\|Legacy taxonomy\|Shape 7" \
  --include="*.md" skills/ | grep -v "^docs/superpowers/"
```

Expected: no output.

- [ ] **Step 4: Run the suite and commit**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -20
git add -A
git diff --cached --name-only
git commit -F - <<'EOF'
Remove the remaining legacy families

The retired Auto-mode policy block migration in init Update Mode, its
supporting legacyClaudeMdLevers machinery, the legacy auth.yml split and v1
stories format in /stories and /test, and the legacy-taxonomy scan in /tidy
and /backlog.

Every family was confirmed to have no live state before deletion. No
tier:*/status:* labels are applied to any open issue, and no live story file
uses the legacy auth form.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 7: Tier 3 documentation, the new Don't, and the bump

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/incident-log.md`, `.claude-plugin/plugin.json`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-6
- Produces: the release record

- [ ] **Step 1: Delete README's "Migrating from 5.x" section**

Remove the `## Migrating from 5.x` heading and its paragraph in full. Everything it describes is now gone.

- [ ] **Step 2: Rename `## Backlog integration` in CLAUDE.md**

Replace the heading `## Backlog integration` with `## Work records`, delete the legacy-alias paragraph beneath it, and leave only:

```markdown
## Work records

work-backend: github-issues
```

This matches what `skills/init/bootstrap/step-17-work-record-backend.md` generates for a new project.

- [ ] **Step 3: Write the incident-log entry first, then the rule**

Per `CLAUDE.md`'s own instruction — writing the rule first pads it. Add to `docs/incident-log.md`, allocating the next free `IL-nn` (never renumber; gaps are fine):

```markdown
## IL-85 — Compatibility paths with no removal condition accumulate silently

Nine distinct legacy families across 195 mentions in `skills/`, and a grep for
"deprecation policy", "breaking change", "support window", and "sunset" across
`README.md`, `CLAUDE.md`, and `docs/` returned zero. Every path was added ad hoc
and none had a stated end date, so none was ever collected.

One had crossed from cost into wrong behavior. `backlog-backend` was read as an
alias by three skills and ignored by every other consumer, so a project setting
only that flag had most of the system silently default to `local-files` — a
defect `README.md` documented rather than fixed, because nothing owned removing it.

Distribution is an unpinned git URL tracking `main` HEAD and the only consumer is
the author, so none of the nine needed a window: the entire surface was deleted in
one sweep. The cost was the accumulation, not the removal.
```

Then add the compressed rule to `CLAUDE.md`'s `## Don'ts`:

```markdown
- Don't add a compatibility path without recording the condition under which it gets removed — with no stated end date nothing ever collects it, and a half-maintained alias silently produces wrong behavior rather than an error `[IL-85]`
```

- [ ] **Step 4: Verify the whole purge**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn -i "legacy" --include="*.md" skills/ | grep -v "^docs/superpowers/" | wc -l
```

Expected: substantially below the 195 baseline. This is **not** expected to reach zero — "legacy" appears in prose unrelated to these nine families. Read the survivors and confirm each belongs to no purged family, rather than treating a non-zero count as failure (`[IL-55]`).

- [ ] **Step 5: Bump and add the CHANGELOG entry**

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git show origin/main:.claude-plugin/plugin.json | grep '"version"'
```

Set the next free minor above both `origin/main` and any bump Plans A and B landed. Add:

```markdown
## v6.36.0 — Every backward-compatibility path removed

Nine legacy families, 195 mentions across `skills/`, and no deprecation policy
documented anywhere. The marketplace source is an unpinned git URL tracking `main`
HEAD, so there were never pinned versions in the wild to support.

Removed: the legacy spec-file alias (a bare number resolving to `specs/{N}-*.md`
alongside `#N`), the `specs/` tracking files, the four `triage-*` policy aliases,
the `backlog-backend` flag alias, the retired Auto-mode-policy block migration and
its supporting machinery, the legacy `auth.yml` split and v1 stories format, and
the legacy-taxonomy scan.

`backlog-backend` was the one that had already crossed into wrong behavior: three
skills read it, every other consumer silently defaulted to `local-files`, and
`README.md` documented that rather than fixing it. Partial aliasing is worse than
either full aliasing or none.

The `status:in-progress` label was deleted after resolving a contradiction — it is
retired vocabulary, but its GitHub label description pointed at
`_shared/issue-claims.md`, which uses `bot:in-progress` and never mentions it.
`[IL-85]` records the general lesson: a compatibility path with no stated removal
condition is never collected.
```

- [ ] **Step 6: Run the suite and commit**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -25
git add -A
git diff --cached --name-only
git commit -F - <<'EOF'
Retire the 5.x migration docs, add IL-85, bump for the legacy purge

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

## Self-Review

**Spec coverage.** All nine families from the design's Plan C are scheduled: spec-file alias (Task 2), `specs/` tracking files (Task 3), `triage-*` aliases (Task 4), `backlog-backend` (Task 5), Auto-mode-policy migration + `auth.yml`/v1 stories + legacy taxonomy (Task 6), the `v4.x` contract gates (removed by Plan B Task 4, cross-referenced rather than duplicated here), and Tier 3 docs + the new Don't (Task 7).

**Provenance question resolved during authoring, not deferred.** The design flagged `status:in-progress` as contradictory — retired per `README.md:164`, live per its GitHub label description. Resolved by reading `_shared/issue-claims.md:163`: the claim system uses `bot:in-progress`, and `status:in-progress` appears in no skill file. The label description is the stale artifact. Task 1 still re-verifies before deleting, since live label state can change.

**Deliberate non-duplication.** The `v4.0+`/`v4.5+`/`v4.6+` contract gates live inside Phase 1u.5's marker table, which Plan B Task 4 replaces wholesale. Scheduling their deletion here too would have two plans editing the same lines.

**Placeholder scan.** No TBD/TODO. Task 1 Step 4 explicitly says "no commit" rather than leaving the step ambiguous. Task 6's three sub-purges each carry their own verification grep.

**Verification realism.** Task 7 Step 4 deliberately does not expect zero — "legacy" appears in prose unrelated to these families, and a plan demanding zero would either fail or push an implementer into over-deleting (`[IL-55]`).

**A wrong expectation caught by running the grep.** Task 4's first draft asserted the `triage-*` aliases existed only in the schema files and told the implementer to stop if a consumer appeared. Running the sweep returned two consumers — and `settle-and-merge.md:28-30` holds *executable bash* falling back to `triage-retry-ceiling`, not merely prose about it. Deleting the schema rows alone would have left a shell block reading a key `auditPolicy` no longer recognizes. Task 4 now removes the fallback branch, the prose clause describing it, and `dispatch/SKILL.md`'s Legacy aliases paragraph, before touching the schema. Every other task's expectations were likewise executed against the live tree during authoring: Task 2's enumeration returns 56 sites, and Task 7's baseline is the measured 195.

**Numbers measured, not estimated.** 195 total `legacy` mentions and 56 spec-file-alias sites were both counted by running the plan's own greps. `IL-85` was confirmed as the next free number from `docs/incident-log.md`.

**Known coupling.** Task 4 and Plan A Task 2 both change `POLICY_KEYS.length`. Both plans instruct recounting from the module rather than trusting a literal.
