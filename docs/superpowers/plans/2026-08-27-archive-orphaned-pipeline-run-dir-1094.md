# Archive orphaned pipeline run dir for #1094 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the orphaned pipeline run directory `.claude-tweaks/pipelines/2026-08-24T183144-record-1094` into `.claude-tweaks/pipelines/archive/`, per #1438.

**Architecture:** This is a pure filesystem operation on gitignored pipeline-bookkeeping content living in the repo's main checkout — no source code, no tests, no git-tracked files are touched. `.claude-tweaks/pipelines/` is an explicit gate exemption (`_shared/policy-schema-coverage.md`'s `worktree-always` coverage block: "File writes targeting a path under the repo's own `.claude-tweaks/pipelines/` are allowed from anywhere"), and empirically confirmed writable directly from this worktree-isolated session (probed with a harmless `touch`/`rm` before any real mutation) — the scratch-worktree provisioning the record's body anticipated was not actually required for this session.

**Tech Stack:** Plain filesystem operations (Node `fs`) — no application code involved.

**Spec:** `work/1438-spec.md` (materialized from GitHub issue #1438)

## Global Constraints

- Never touch anything outside `.claude-tweaks/pipelines/` for this task — the deliverable is scoped to one directory move.
- Preserve content: the archived directory must carry the same content the orphaned run directory held, not a lossy or partial copy.

---

### Task 1: Archive the orphaned run directory

**Files:**
- Move (filesystem, not git): `.claude-tweaks/pipelines/2026-08-24T183144-record-1094/` (main checkout) → `.claude-tweaks/pipelines/archive/2026-08-24T183144-record-1094/` (main checkout)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the only task).
- Produces: nothing consumed by a later task.

- [x] **Step 1: Confirm current state**

Read both paths in the main checkout to establish ground truth before moving anything:

```bash
ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-24T183144-record-1094"
ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-24T183144-record-1094"
```

Found: the source path still existed at the time #1438 was filed; by the time this build started, a **prior, incomplete** archival attempt had already partially run — the archive path existed but with a bug: its content was double-nested (`archive/2026-08-24T183144-record-1094/2026-08-24T183144-record-1094/…`) alongside a stray, stale `run-state.json`/`work/` pair at the outer level (status `"archiving"`, no `pr`/`sessionId` — an intermediate state from the botched attempt, not the authentic run state). The authentic run content (status `"clean"`, `pr: #1416`, full `decisions.md`/`config.yml`/`engine-state.json`/`staged/`/`tmp/`/`events.jsonl`/`work/1094-spec.md`) was one level too deep.

- [x] **Step 2: Flatten the archive directory**

Remove the stale outer duplicates and move every entry from the nested nested directory up one level, then remove the now-empty nested directory:

```javascript
const fs = require('fs');
const path = require('path');
const outer = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-24T183144-record-1094';
const inner = path.join(outer, '2026-08-24T183144-record-1094');
for (const name of ['run-state.json', 'work']) {
  const p = path.join(outer, name);
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
for (const name of fs.readdirSync(inner)) {
  fs.renameSync(path.join(inner, name), path.join(outer, name));
}
fs.rmdirSync(inner);
```

- [x] **Step 3: Verify acceptance criteria**

```bash
ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-24T183144-record-1094"
# Expected: No such file or directory

ls -la "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/2026-08-24T183144-record-1094"
# Expected: config.yml, decisions.md, engine-state.json, events.jsonl, run-state.json, staged/, tmp/, verify-expectations.json, work/
```

Confirmed both. No commit needed for this step — the moved content lives outside git entirely (`.claude-tweaks/pipelines/` is gitignored).

- [x] **Step 4: Commit the materialized spec + this plan**

```bash
git add work/1438-spec.md docs/superpowers/plans/2026-08-27-archive-orphaned-pipeline-run-dir-1094.md
git commit -m "Materialize spec + plan for #1438 — archive orphaned pipeline run dir for #1094"
```

(The materialize commit already landed earlier in this build as its own commit; this plan file is added in the verification commit below.)
