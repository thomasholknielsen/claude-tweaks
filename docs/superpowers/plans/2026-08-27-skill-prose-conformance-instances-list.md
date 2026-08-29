# Skill Drift: skill-prose-conformance-tests Instances List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tests/skill-prose-plugin-root-invocations.test.js` to the Reference > Instances list in `.claude/skills/skill-prose-conformance-tests/SKILL.md`, since it is a second live instance of the "whole-file sweep with allowlist" pattern that was never cited there.

**Architecture:** Pure documentation edit — one line in a maintainer-reference `SKILL.md` grows by one clause. No code, no tests, no behavioral surface.

**Tech Stack:** Markdown.

**Spec:** `.claude-tweaks/pipelines/2026-08-27T053259-record-1359/work/1359-spec.md`

## Global Constraints

- Edit only the Instances bullet at `.claude/skills/skill-prose-conformance-tests/SKILL.md:180` — no other content in that file changes.
- Preserve the existing citation order and structure (comma-separated, each entry a `` `path` `` with an optional parenthetical clause).
- No test suite pins this file's Instances list content (verified: `grep -rn "skill-prose-conformance-tests" tests/` finds only prose citations of the *convention*, never a mechanical check of this list's membership) — so no test file needs to change.

---

### Task 1: Add the missing Instances citation

**Files:**
- Modify: `.claude/skills/skill-prose-conformance-tests/SKILL.md:180`

**Interfaces:**
- Consumes: nothing — standalone prose edit.
- Produces: nothing consumed by a later task — this is the only task.

- [ ] **Step 1: Confirm current line content**

Run: `grep -n "tests/frontier-unattended-literal.test.js" ".claude/skills/skill-prose-conformance-tests/SKILL.md"`
Expected: one match on line 180, and the line does NOT contain `tests/skill-prose-plugin-root-invocations.test.js` (confirms the gap still exists before editing).

- [ ] **Step 2: Edit the Instances bullet**

In `.claude/skills/skill-prose-conformance-tests/SKILL.md` line 180, change:

```
..., `tests/frontier-unattended-literal.test.js` (whole-file sweep with allowlist), `tests/compare-shell-tweak-lever.test.js` (non-markdown payload — browser JS in `plugin/skills/design-wrapper/compare-shell/template.html`, pinned by structural regex over the live file because no DOM harness exists to run it in)
```

to:

```
..., `tests/frontier-unattended-literal.test.js` (whole-file sweep with allowlist), `tests/skill-prose-plugin-root-invocations.test.js` (a second whole-file-sweep-with-allowlist instance — #1170's ban on repo-relative `node plugin/bin/` invocations in skill prose), `tests/compare-shell-tweak-lever.test.js` (non-markdown payload — browser JS in `plugin/skills/design-wrapper/compare-shell/template.html`, pinned by structural regex over the live file because no DOM harness exists to run it in)
```

Insert the new clause between `tests/frontier-unattended-literal.test.js`'s entry and `tests/compare-shell-tweak-lever.test.js`'s entry — matches the record's own Proposed text verbatim.

- [ ] **Step 3: Verify the edit landed and the file still parses as prose (no stray markdown breakage)**

Run: `grep -n "tests/skill-prose-plugin-root-invocations.test.js" ".claude/skills/skill-prose-conformance-tests/SKILL.md"`
Expected: PASS — one match, on line 180, inside the Instances bullet.

Run: `wc -c ".claude/skills/skill-prose-conformance-tests/SKILL.md"`
Expected: PASS — well under any size ceiling (file was ~30.9KB before this one-clause addition; this file lives under `.claude/skills/`, not `plugin/skills/`, so the 40KB `plugin/skills/**` ceiling does not apply to it regardless).

- [ ] **Step 4: Commit**

```bash
git add ".claude/skills/skill-prose-conformance-tests/SKILL.md"
git commit -m "$(cat <<'EOF'
Cite tests/skill-prose-plugin-root-invocations.test.js in skill-prose-conformance-tests' Instances list

refs #1359
EOF
)"
```
