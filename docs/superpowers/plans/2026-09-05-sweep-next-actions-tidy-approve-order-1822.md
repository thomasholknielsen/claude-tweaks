# Sweep Next Actions — tidy --approve ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder `plugin/skills/sweep/SKILL.md`'s `## Next Actions` block so `/claude-tweaks:tidy --approve` leads (bolded, recommended) whenever this run's tidy step staged anything, instead of being buried behind `/claude-tweaks:dispatch`/the needs-you pick.

**Architecture:** Prose-only change to one skill's `## Next Actions` section: split the render into a "tidy staged something" branch (tidy --approve leads) and a "nothing staged" branch (unchanged original order + needs-you precedence rule). No code, no new mechanics — the underlying tidy/dispatch/refine call sites are untouched. A one-line cross-reference note is added to `tidy/SKILL.md`'s own Next Actions section confirming it already implements the same "already-vetted leads" pattern, so a future reader isn't left to re-derive the parallel.

**Tech Stack:** Markdown skill files (`plugin/skills/sweep/SKILL.md`, `plugin/skills/tidy/SKILL.md`); `node --test` for the prose-conformance suite that pins this repo's skill text.

**Spec:** GitHub issue #1822 (materialized at `.claude-tweaks/pipelines/2026-09-05T221935-record-1822/work/1822-spec.md`)

## Global Constraints

- No change to underlying tidy/refine/dispatch mechanics — ordering/wording only (spec Acceptance Criteria).
- Keep the existing needs-you precedence rule intact for the "nothing staged" branch — only the staged branch introduces new behavior.
- Follow `docs/skill-authoring.md`'s Skill handoffs convention already used by both files (paste-ready fully-qualified `/claude-tweaks:{skill}` commands, recommended line bolded and suffixed `(recommended)`).

---

### Task 1: Confirm no test pins the exact Next Actions wording, then edit sweep/SKILL.md

**Files:**
- Modify: `plugin/skills/sweep/SKILL.md` (`## Next Actions` section, currently lines ~82-88)
- Read (no change expected): `tests/hooks-session-start.test.js`, `tests/backlog-attention-rows.test.js`, `tests/sweep-orchestrator.test.js`, `tests/batch-ref-argument.test.js`, `tests/tidy-report-rules.test.js`, `tests/bin-lib/skill-audit/anti-patterns.test.js` (these are the files under `tests/` that reference "sweep" AND ("Next Actions" or "tidy --approve" or "dispatch...recommended") per a repo grep — none currently pin the literal Next Actions prose of `sweep/SKILL.md`, confirmed by `grep -rn "drain the authorized queue this sweep just prepared\|apply this run's staged tidy items\|Precedence: when attention's render above names" tests/` returning no matches)

**Interfaces:**
- Consumes: nothing (pure doc edit)
- Produces: the new `## Next Actions` section text in `sweep/SKILL.md`, which Task 2 cross-references from `tidy/SKILL.md`

- [ ] **Step 1: Re-run the confirmation grep to verify it still returns nothing (repo may have changed since plan authoring)**

Run: `grep -rn "drain the authorized queue this sweep just prepared\|apply this run's staged tidy items\|Precedence: when attention's render above names" tests/`
Expected: no output (no test currently pins this exact prose — if this now returns a match, stop and read that test before editing, since the edit below would break it)

- [ ] **Step 2: Replace sweep/SKILL.md's `## Next Actions` section**

Locate the exact current text (verify with `grep -n "## Next Actions" -A 8 plugin/skills/sweep/SKILL.md` first — it must match this before you edit, since line numbers can drift):

```markdown
## Next Actions

**`/claude-tweaks:dispatch`** — drain the authorized queue this sweep just prepared (recommended)
`/claude-tweaks:tidy --approve` — apply this run's staged tidy items, if any
`/claude-tweaks:backlog attention` — re-check after acting

Precedence: when attention's render above names a "needs you" item (its Pick up next line or a `needs:*` row), that item's launcher leads this block instead of `/claude-tweaks:dispatch`, bolded, with `(recommended)` — mirroring `backlog/SKILL.md`'s own needs-you-first precedence.
```

Replace with:

```markdown
## Next Actions

When Step 1's tidy pass staged anything this run (a non-zero `staged` count in the counts it
reported back), `/claude-tweaks:tidy --approve` leads the block, bolded and recommended —
clearing an already-vetted, zero-judgment batch is cheaper than either heavier pick below it,
so it takes the top slot ahead of both `/claude-tweaks:dispatch` and the needs-you launcher
that would otherwise fill it. The dispatch/needs-you line still renders, one slot down,
unbolded. When nothing was staged this run, the original order applies unchanged, needs-you
precedence rule included.

**Tidy staged something this run:**
**`/claude-tweaks:tidy --approve`** — apply this run's staged tidy items (recommended)
`/claude-tweaks:dispatch` — drain the authorized queue this sweep just prepared
`/claude-tweaks:backlog attention` — re-check after acting

**Nothing staged this run (unchanged):**
**`/claude-tweaks:dispatch`** — drain the authorized queue this sweep just prepared (recommended)
`/claude-tweaks:tidy --approve` — apply this run's staged tidy items, if any
`/claude-tweaks:backlog attention` — re-check after acting

Precedence (nothing-staged case only — the staged case's top slot is always `tidy --approve`):
when attention's render above names a "needs you" item (its Pick up next line or a `needs:*`
row), that item's launcher leads this block instead of `/claude-tweaks:dispatch`, bolded, with
`(recommended)` — mirroring `backlog/SKILL.md`'s own needs-you-first precedence.
```

- [ ] **Step 3: Verify the edit landed and the file still parses as valid markdown headings**

Run: `grep -n "## Next Actions" -A 20 plugin/skills/sweep/SKILL.md`
Expected: shows the new text exactly as written above, immediately followed by the existing `## Component-Skill Contract` heading (i.e. no stray old lines left behind)

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/sweep/SKILL.md
git commit -m "Reorder sweep's Next Actions so tidy --approve leads when tidy staged anything

refs #1822"
```

---

### Task 2: Add cross-reference note to tidy/SKILL.md and run the full test suite

**Files:**
- Modify: `plugin/skills/tidy/SKILL.md` (`## Next Actions` section, currently lines ~207-222)
- Test: full `npm test` run (this is a docs-only change touching two `SKILL.md` files; the relevant check is the repo's skill-prose-conformance suite under `tests/`, run as part of the full suite)

**Interfaces:**
- Consumes: Task 1's completed edit to `sweep/SKILL.md` (this task only adds a note, does not depend on any new function/type from Task 1)
- Produces: nothing consumed by a later task — this is the last task in the plan

- [ ] **Step 1: Confirm tidy/SKILL.md's current Approve-leads behavior (read-only, no edit yet)**

Run: `grep -n "## Next Actions" -A 15 plugin/skills/tidy/SKILL.md`
Expected: shows the existing derivation-rule prose stating "when Approve ({N}) is non-empty, put an 'Approve ({N})' line first, bolded, suffixed (recommended)" — confirms tidy/SKILL.md already implements the same "already-vetted work leads" pattern sweep/SKILL.md's Next Actions now also implements (Task 1), so this task adds only a one-line cross-reference, never restates tidy's derivation logic

- [ ] **Step 2: Add a one-line cross-reference note**

Locate the exact current opening line of tidy/SKILL.md's Next Actions derivation paragraph (verify with the Step 1 grep output above before editing — this string must match verbatim):

```markdown
## Next Actions

Derive the lines from the report's **Approve ({N})** and **Yours ({N})** sections: when **Approve ({N})** is non-empty, put an "Approve ({N})" line first, bolded, suffixed `(recommended)` — not a slash command; it instructs executing Step 7 over the {N} staged items in the report's Approve ({N}) section, resolved directly in this session.
```

Replace with (inserting one new sentence after the existing first sentence, before "Then take Yours groups..."; do not otherwise alter this paragraph):

```markdown
## Next Actions

Derive the lines from the report's **Approve ({N})** and **Yours ({N})** sections: when **Approve ({N})** is non-empty, put an "Approve ({N})" line first, bolded, suffixed `(recommended)` — not a slash command; it instructs executing Step 7 over the {N} staged items in the report's Approve ({N}) section, resolved directly in this session. (`sweep/SKILL.md`'s own Next Actions applies the same already-vetted-work-leads rule to its `tidy --approve` line — the two are deliberately consistent; #1822.)
```

- [ ] **Step 3: Verify the edit landed correctly**

Run: `grep -n "already-vetted-work-leads rule" plugin/skills/tidy/SKILL.md`
Expected: one match, inside the `## Next Actions` section, on the sentence added in Step 2

- [ ] **Step 4: Run the full test suite**

Run: `npm test > /tmp/npm-test-1822.log 2>&1; tail -60 /tmp/npm-test-1822.log`
Expected: PASS (all suites green) — if any suite fails, read the failure, determine whether it's a pre-existing pinned-text assertion this plan's edits touched (fix the edit or the test per CLAUDE.md's expand-contract contract discipline) versus unrelated flake (re-run only the affected file per CLAUDE.md's flake-tolerance note), and do not proceed to Step 5 until green

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/tidy/SKILL.md
git commit -m "Cross-reference sweep's Next Actions reorder from tidy's own derivation rule

refs #1822"
```
