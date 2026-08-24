# Specify — Decomposition Mode, Steps 5-9 (red-team through completion)

Continues `decomposition-mode.md` in this same directory — that file's Steps 1-4 create the
parent and sub-issue records and wire their relationships; this file picks up from there: the
multi-persona red-team pass, self-review, deletion of the consumed design doc, and the Step 9
summary/commit. Step numbering matches `decomposition-mode.md`'s own numbering exactly (Steps
1-9 together, unchanged across the split — #611), so a cross-reference naming a step by number
still resolves regardless of which of the two files it lands in.

---

## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch persona-instantiated agents in one parallel batch per sub-issue record — not the parent, which is never built directly — to surface ambiguities, gaps, and unstated assumptions. **Persona count depends on the sub-issue's own `ceremony:*` label** (stamped in Step 3): `ceremony:fast-lane` dispatches **one** persona (Skeptical Reviewer only); `ceremony:standard` dispatches all **three** (Implementer / Maintainer / Skeptical Reviewer), unchanged from before. See `red-team.md` for which persona(s) to dispatch for each tier.

**Freshly-created sub-issues only.** Skip this dispatch for a sub-issue resumed via Step 3's Idempotency map whose fetched body already shows zero unresolved `<!-- ambiguity: -->` markers and no `## Open Questions` section — that sub-issue completed red-team and self-review in a prior run, and re-dispatching would duplicate findings against content already resolved. Dispatch normally for every sub-issue actually created in this run, and for any resumed sub-issue that still carries unresolved markers or an open `## Open Questions` table from an interrupted prior run.

Each agent's input is a record reference, never inlined content: `work-backend: github-issues` — the sub-issue's number plus a `gh issue view` read instruction; `work-backend: local-files` — the sub-issue's record file path. Never both in the same dispatch. Findings are written **back into the record body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table — via compose-then-write-once, the same discipline every write in this skill uses. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the persona lens questions, and the write-back procedure.

---

## Step 6: Record Self-Review

Before deleting the design doc, look at every record you wrote with fresh eyes — including the red-team findings just written in Step 5. Fix issues inline — no subagent, no separate review pass. This is also the last chance to catch content the design doc captured but no sub-issue implements.

"Wrote" means created or edited in this run. A sub-issue resumed via Step 3's Idempotency map that Step 5 skipped (already clean — no unresolved findings) and that this run made no further edits to does not need a fresh self-review pass; its prior run already completed one. Scope checks 1-5 below to sub-issues this run actually created, plus any resumed sub-issue Step 5 dispatched against (because it still carried unresolved findings) or that Step 4's linking pass edited.

> **Parallel execution (conditional):** When N ≥ 3 sub-issue records are produced, run scope and ambiguity checks across all sub-issues concurrently — `gh issue view` per sub-issue under `work-backend: github-issues`, `Read` per record file under `work-backend: local-files` — plus `Grep` over the fetched bodies for placeholder patterns.

1. **Placeholder scan** — search for the failure patterns in `spec-template.md`'s "No Placeholders" section, over every record body (parent and sub-issues). Any `TBD`, vague acceptance criteria, undefined types, "standard error handling", or "similar to sub-issue N" — fix them now. Also confirm every `<!-- ambiguity: ... -->` marker Step 5's red-team wrote has been resolved and **deleted** — zero may remain: a `ready` sub-issue still carrying one fails `_shared/work-record.md`'s spec-shaped structural check, which treats `<!-- ambiguity:` as an unresolved placeholder marker exactly like `TBD`/`TODO`.
2. **Internal consistency** — across the sub-issues in this decomposition, do referenced types, model names, and endpoint signatures match? A function called `clearLayers()` in sub-issue 42 but `clearFullLayers()` in sub-issue 43 is a bug.
3. **Scope check** — is each sub-issue genuinely a single work unit (3-8 tasks)? If one is doing two things, split it now. If two are doing the same thing, merge them.
4. **Ambiguity check** — could any acceptance criterion be interpreted two different ways? Pick one and make it explicit.
5. **Design-doc coverage** — re-read the design doc with each sub-issue open. If you find a requirement the doc captured but no sub-issue implements, add it to the right sub-issue now — the doc is about to be deleted in Step 7.

When all five checks come back clean, proceed to Step 7. No need to re-review after fixing.

---

## Step 7: Delete Consumed Artifacts (only when fully decomposed)

The design doc has served its purpose **once every phase has been decomposed into sub-issue records and Step 6 Self-Review has confirmed coverage**. Behavior depends on the phase target:

| Decomposition mode | Delete design doc? |
|---|---|
| No `phase-N` argument; doc has 0 phase sections (single-phase) | Yes — fully consumed |
| No `phase-N` argument; doc has N phase sections; all decomposed in this run | Yes — fully consumed |
| `phase-N` argument; only that phase decomposed | **No** — design doc retained for remaining phases. Add a `## Phase N: Specified` marker after the phase heading instead, listing the record numbers it produced. |
| `phase-N` argument; this was the last un-specified phase | Yes — fully consumed (run delete after marker bookkeeping confirms all phases marked) |

```bash
# Full decomposition (all phases or single-phase):
git rm docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md

# Partial decomposition (phase-N only): commit the marker, keep the doc
git add docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git commit -m "Mark phase-{N} specified in design doc"
```

When fully consumed, do NOT keep these around. They create dangling references and stale artifacts. The sub-issue records are the durable artifact.

(Step 8 — the old backlog-entry deletion — is retired: a captured record is shaped in place, so there is nothing to delete.)

---

## Step 9: Summary and Commit

Present a summary:

```markdown
## Specification: {design doc topic}

### Work Units Created
| Record | Title | Type | Blocked by | Est. tasks |
|--------|-------|------|------------|------------|
| {ref} | {title} | {type} | {refs or —} | {count} |

### Existing Records Modified
- {ref} "{title}" — {what was added/changed}

### Artifacts Removed
- Design doc: `docs/superpowers/specs/{filename}` (absorbed into the parent + sub-issue records)

### Diagram suggestions (optional — render only when Step 2.5d emitted any)
- {one or two `**Diagram suggestion:** …` blocks emitted by Step 2.5d}
```

`{ref}` is `#{N}` under `work-backend: github-issues`, the bare record id under `local-files` — same convention as Step 1's Overlap Analysis.

**`needs:definition` origin closure.** When `$ORIGIN_RECORD_NUM` is set (this run was reached via the `needs:definition` redirect — `specify/SKILL.md`'s Resolve-the-input case 1), close that origin record now that the parent and every sub-issue this run produced exist, using the same number list the Work Units Created table above already assembled: post a comment on `$ORIGIN_RECORD_NUM` in that table's own list format, e.g. "Superseded by decomposition: #{parent}, #{sub1}, #{sub2}, ..." (`work-backend: github-issues`: `gh issue comment "$ORIGIN_RECORD_NUM" --body "..."` then `gh issue close "$ORIGIN_RECORD_NUM"`; `local-files`: append the note to the record body and mark it closed via `local-store.js`). When `$ORIGIN_RECORD_NUM` is unset (every other entry path — cases 2-5), this is a no-op: decomposition mode unconditionally produces exactly one parent record every run, so there is never a produced-sub-issues-with-no-parent case this needs to special-case.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Created parent record {parent-ref} + {N} sub-issue records | `{hash}` (local-files) / `—` (github-issues — creates already landed via API, no commit) |
| Operational | Deleted design doc | `{hash}` |

**Commit whatever this run wrote to disk — the skill's terminal action, run whether or not anything ends up staged.** This covers only artifacts that are files: the design-doc deletion/marker from Step 7, and — under `work-backend: local-files` — the parent and sub-issue record files plus Step 4's linking edits, composed and written across Steps 3-4 but not yet committed. A clean `github-issues` run has nothing to commit for the records themselves — every parent/sub-issue create and edit already landed via the API in Steps 3-5, the same no-commit case Shaping mode documents — **except** any sub-issue (or the whole batch, if the parent itself fell back) that Step 3's write-path resilience wrote to `local-store.js` after a `gh` failure; that file needs this commit exactly like a `local-files` record does. A full (non-`phase-N`) decomposition may therefore have nothing staged beyond the design doc's `git rm`; a `phase-N` run already committed its own marker back in Step 7, so it may have nothing staged at all. None of this affects durability — a sub-issue is durable the moment its create/write call lands, not when this step commits it. What used to be true of spec files no longer applies: sub-issues don't need to exist in committed history before a pipeline can run them; `/claude-tweaks:flow #N` (or a local record id) materializes a sub-issue into a build-time file only when a pipeline actually runs it (spec 20's contract), independent of this commit.

```bash
git add specs/ docs/   # local-files driver: parent/sub-issue record files + link edits; docs/: design-doc removal/marker
git status --porcelain   # empty is a valid outcome (github-issues, or a phase-N run) — commit only if something is staged
git commit -m "{message describing the sub-issues created}"   # skip when nothing is staged
git log --oneline -1   # verify it landed when a commit was made (see _shared/git-discipline.md)
```

By the time Next Actions renders, any commit from this step has already happened.

When Step 9 completes, return to `SKILL.md`'s `## Next Actions` block.
