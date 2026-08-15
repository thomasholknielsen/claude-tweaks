# Re-home IL-70 overflow-bucket evidence, trim docs/donts.md bullet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-home the sub-file-overflow-bucket evidence (currently only in git history and record #136's body) into `docs/incident-log.md` under `IL-70`, then trim `docs/donts.md` line 14's bullet to ~60 words now that the narrative has a durable home.

**Architecture:** Two sequential, single-file edits. Task 1 extends the existing `## IL-70` entry in `docs/incident-log.md` with a second paragraph (the `IL-27` "Recurrence" sub-note precedent — a bold lead-in label, not a new H2 heading, so the `[IL-70]` tag keeps resolving to one section). Task 2 trims `docs/donts.md`'s bullet, keeping both halves of the rule (40 KB soft ceiling; applies per sub-file too) plus the `[IL-70]` tag, and must land after Task 1 so the evidence is never mid-flight without a home.

**Tech Stack:** Plain markdown edits; verification via `grep`/`wc -w`, no build or test suite involved.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T102831-spec-136/work/136-spec.md`

## Global Constraints

- Land the incident-log write before the donts.md trim (spec's Technical Approach: "the evidence is never mid-flight without a home").
- Preserve `IL-70`'s existing content (the in-place-transform-script hazard) verbatim — this is an extension, not a rewrite.
- The trimmed `docs/donts.md` bullet must stay at or under ~60 words and keep the `[IL-70]` tag.

---

### Task 1: Re-home the overflow-bucket evidence into `docs/incident-log.md`

**Files:**
- Modify: `docs/incident-log.md:317` (append a second paragraph after the existing `IL-70` paragraph, before the `## IL-71` heading)

**Interfaces:**
- Consumes: none (first task)
- Produces: a `docs/incident-log.md` `## IL-70` entry containing both the transform-script hazard (existing) and the overflow-bucket hazard (new), which Task 2's trimmed `docs/donts.md` bullet will point to via its `[IL-70]` tag.

- [ ] **Step 1: Verify current state**

Run: `grep -n "86 KB\|18 section-naming\|#83\b" docs/incident-log.md`
Expected: no output (the evidence is not yet in the incident log — confirms the gap this task fixes).

- [ ] **Step 2: Append the overflow-bucket paragraph to the `IL-70` entry**

In `docs/incident-log.md`, find this exact line (line 317, the existing `IL-70` paragraph):

```
Don't point a destructive in-place transform script at the same file the transform replaces — the script stops being re-runnable the moment it succeeds once, and you will re-run it. Splitting `skills/init/bootstrap-steps.md` into 18 per-step files used a `split.js` whose `SRC` was `bootstrap-steps.md` itself; the same operation then replaced that file with a 4 KB index. Re-running the script for a one-line whitespace fix read the 4 KB index as its source, wrote a garbage `version-check.md` from the index's first lines, and only then crashed on the next segment (`body[0]` undefined, because the index has no line 88). The crash was the lucky part — it happened *after* a corrupt write, so a script that failed slightly later would have silently shipped corruption. Fix: snapshot the pristine input first (`git show HEAD:<path> > <path>.orig`) and point `SRC` at that, so the transform is idempotent and re-runnable. Caught because the byte-identity verifier was re-run afterward and would have failed; the corrupt intermediate never reached a commit.
```

Replace it with the same paragraph plus a new paragraph directly after it (still inside the `## IL-70` section, before the blank line and `## IL-71` heading):

```
Don't point a destructive in-place transform script at the same file the transform replaces — the script stops being re-runnable the moment it succeeds once, and you will re-run it. Splitting `skills/init/bootstrap-steps.md` into 18 per-step files used a `split.js` whose `SRC` was `bootstrap-steps.md` itself; the same operation then replaced that file with a 4 KB index. Re-running the script for a one-line whitespace fix read the 4 KB index as its source, wrote a garbage `version-check.md` from the index's first lines, and only then crashed on the next segment (`body[0]` undefined, because the index has no line 88). The crash was the lucky part — it happened *after* a corrupt write, so a script that failed slightly later would have silently shipped corruption. Fix: snapshot the pristine input first (`git show HEAD:<path> > <path>.orig`) and point `SRC` at that, so the transform is idempotent and re-runnable. Caught because the byte-identity verifier was re-run afterward and would have failed; the corrupt intermediate never reached a commit.

**A distinct failure mode under the same tag — the overflow bucket.** A sub-file is a lazy-load unit, not an overflow bucket: `Read` has no section granularity, so once two or more stubs cite *sections* of one sub-file, every stub pays for the whole file — shape, not size alone, is the defect. `skills/init/bootstrap-steps.md` reached 86 KB behind 18 section-naming stubs while `docs/donts.md`'s own extraction rule was followed to the letter (#83). Fix: split by the stubs' own unit rather than reorganizing in place, leave the original heading behind as a stub so external section/step references still resolve, and confirm every substantive original line survives somewhere in the new file set before treating the split as complete. Distinct from this entry's transform-script account above — both surfaced from the same `bootstrap-steps.md` split but are separate hazards, filed under one `[IL-70]` number.
```

- [ ] **Step 3: Verify the evidence landed**

Run: `grep -n "86 KB\|18 section-naming\|#83\b" docs/incident-log.md`
Expected: at least one match, inside the `## IL-70` section (confirm with `grep -n "^## IL-7[01]" docs/incident-log.md` that the match falls between the `IL-70` and `IL-71` headings).

- [ ] **Step 4: Commit**

```bash
git add docs/incident-log.md
git commit -m "Re-home the sub-file-overflow-bucket evidence into IL-70 (#136)"
```

---

### Task 2: Trim the `docs/donts.md` `[IL-70]` bullet to ~60 words

**Files:**
- Modify: `docs/donts.md:14`

**Interfaces:**
- Consumes: Task 1's extended `IL-70` entry (the trimmed bullet's `[IL-70]` tag now resolves to an entry documenting both hazards).
- Produces: a `docs/donts.md` bullet at or under ~60 words, in family with the section's ~38-word average, still stating both halves of the rule.

- [ ] **Step 1: Verify current state**

Run: `sed -n '14p' docs/donts.md | wc -w`
Expected: a count around 89 (the current, already-once-compressed bullet — confirms the starting point this task trims further).

- [ ] **Step 2: Trim the bullet**

In `docs/donts.md`, find this exact line (line 14):

```
- Don't put detailed reference content inline in a SKILL.md — extract to a sub-file, cited as "read `{filename}` in this skill's directory." **40 KB soft ceiling per SKILL.md and per sub-file**: `Read` has no section granularity, so once two stubs cite *sections* of one sub-file, every stub pays for the whole file. Split by the stubs' own unit, extract don't reorganize in place, leave the old heading as a stub so external refs still resolve, and confirm every substantive line survives somewhere — no test reads skill prose `[IL-70]`
```

Replace it with:

```
- Don't put detailed reference content inline in a SKILL.md — extract to a sub-file, cited as "read `{filename}` in this skill's directory." **40 KB soft ceiling per SKILL.md and per sub-file**: the ceiling applies one level down too — a sub-file cited by 2+ stubs is the same overflow-bucket defect, since `Read` has no section granularity `[IL-70]`
```

- [ ] **Step 3: Verify the trim**

Run: `sed -n '14p' docs/donts.md | wc -w`
Expected: a count at or under ~60.

Run: `sed -n '14p' docs/donts.md | grep -o "40 KB soft ceiling per SKILL.md and per sub-file"`
Expected: one match (the 40 KB half of the rule survived).

Run: `sed -n '14p' docs/donts.md | grep -o "sub-file cited by 2+ stubs is the same overflow-bucket defect"`
Expected: one match (the per-sub-file half of the rule survived).

Run: `sed -n '14p' docs/donts.md | grep -o "\[IL-70\]"`
Expected: one match (the tag survived).

- [ ] **Step 4: Commit**

```bash
git add docs/donts.md
git commit -m "Trim the docs/donts.md [IL-70] bullet to ~60 words, now that its evidence has a home in the incident log (#136)"
```
