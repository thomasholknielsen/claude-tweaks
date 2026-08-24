# Capture Absorb-by-Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make absorb-into-existing the recommended default in `/capture` when similarity to an existing open record is high — interactively absorb becomes option 1 `(Recommended)` under a two-criteria bar; headless paths absorb only at a strict structural bar and file fresh on anything ambiguous.

**Architecture:** An ordering-and-mechanics change inside `plugin/skills/capture/SKILL.md`'s existing Immediate Routing section plus one widened candidate fetch. No new similarity engine — the judgment is two concrete criteria over data the existing lookup already (after widening) returns. One new conformance suite pins every rule.

**Tech Stack:** Markdown skill file (`plugin/skills/capture/SKILL.md`), `node --test` conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T084440-spec-1261-1262-1263-1264/spec-1264/work/1264-spec.md` (record #1264).

## Global Constraints

1. **Byte ceiling:** `plugin/skills/capture/SKILL.md` starts at 38,446 bytes against the hard 40,960 ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) — ~2.5KB total budget across Tasks 1-4. Prefer tightening the existing option-3/absorb prose over adding parallel sections; measure `wc -c` after every task's edit. Before trimming any existing sentence, grep `tests/` for a distinctive fragment — pinned prose cannot be cut.
2. **Never absorb on a similarity score.** Both criteria anchor on concrete shared artifacts (a file path, a `type:*` value, a named operation target) — the plan text must never introduce scoring/embedding language (spec Non-Goal).
3. **Label permission matrix** (`_shared/work-record.md`): absorb re-judges `size:` only (raise-only, never lowered); `priority:*` is never written — a higher-priority suggestion is surfaced in output for the human.
4. **Nothing silently merged interactively** — absorb is a recommended first option, new-issue stays one click away. Headless absorb happens only at the structural bar, and its always-present audit trail is the `## Absorbed:` heading on the target record.
5. **The three exclusions** (closed records, `parent-issue` carriers, `bot:in-progress` carriers) appear as ONE enumerable list citing `_shared/work-record.md` — AC3 requires this shape.
6. **AC grep phrases are load-bearing:** the inserted text MUST contain these literal strings — `same kind of change` (criteria definition), `most-recently-updated` (tie-break, hyphenated exactly like this), `files fresh` (headless default). Task 5's tests pin them; do not paraphrase them away.
7. **Born-ready chain untouched** (spec Non-Goal): an absorbed capture never enters the `/specify --chained` chain; the Shaped-body branch's own logic (SKILL.md's "Judging Definition first" numbered list) is not edited by any task.
8. Every write goes through `_shared/github-write-transport.md` and follows compose-then-write-once; every absorb invalidates the session record snapshot per `_shared/record-queue-fetch.md`'s existing convention — cite both, restate neither.

---

### Task 1: Widen the candidate fetch and define high similarity

**Files:** Modify: `plugin/skills/capture/SKILL.md` (the "Option 3 visibility" blockquote, currently at ~line 366)

- [ ] **Step 1:** `wc -c plugin/skills/capture/SKILL.md` (baseline).
- [ ] **Step 2:** Locate the anchor: `grep -n "Option 3 visibility" plugin/skills/capture/SKILL.md`.
- [ ] **Step 3:** Replace the blockquote's `github-issues` sentence — currently "…search open issues: `gh issue list --search "{keywords}" --state open --json number,title --limit 5`." — with a widened two-step fetch: `gh issue list --search "{keywords}" --state open --json number,title,labels,updatedAt --limit 5`, then for at most the **top 2** candidates one `gh issue view {n} --json body` follow-up read before judging (the same search-narrow-then-fetch-full two-step `/specify`'s case 5 uses; the cap keeps the interactive path fast). Keep the local-files sentence and the no-candidate-omission sentence intact.
- [ ] **Step 4:** Immediately after the widened-fetch text (still inside or directly after the blockquote), add the high-similarity definition as one tight paragraph:

```markdown
> **High similarity** means both criteria hold, each anchored on a concrete shared artifact, never a text-similarity score: **(a) same file/subsystem** — the candidate's body (its `### Key Files` section when spec-shaped, else its title subject) and the capture's `Context:`/`Scope:` text name at least one identical file path or the same named module/subsystem; **(b) same kind of change** — identical `type:{t}` value (the Type axis in `_shared/work-record.md`; `TYPE_LABELS` in `bin/lib/issues/record.js`) AND the same operation on that subject — matching verb-plus-target: both dedupe X, both fix the same named failure, both extend the same surface.
```

- [ ] **Step 5:** `wc -c` (≤ 40,960); `node --test tests/bin-lib/skill-audit/context-cost.test.js`.
- [ ] **Step 6:** Commit: `git add plugin/skills/capture/SKILL.md && git commit -m "Widen capture's candidate fetch and define the two-criteria high-similarity bar"`

---

### Task 2: Interactive routing — absorb as recommended option 1 at high similarity

**Files:** Modify: `plugin/skills/capture/SKILL.md` (the interactive `AskUserQuestion` option list at ~line 358-364, and the sentence after it)

- [ ] **Step 1:** Locate: `grep -n "Absorb into record {N}" plugin/skills/capture/SKILL.md`.
- [ ] **Step 2:** Rework the option-list prose so ordering is similarity-conditional. Replace the fixed "Option 3 (conditional)" structure with:

```markdown
- **At high similarity** (the two-criteria bar above, met by exactly one candidate): absorb renders as **option 1** — `label`: `"Absorb into record {N} (Recommended)"`, `description`: `"This belongs in an existing record"` — with Brainstorm and Keep following as options 2-3. When several candidates meet the bar, recommend the one sharing the **most file paths** with the capture, tie-broken by most-recently-updated (`updatedAt` from the widened fetch). Nothing is silently merged — the recommendation is one click to decline.
- **At low or ambiguous similarity** (a candidate exists but the bar is not met): today's ordering stands — Brainstorm, Keep, then absorb as conditional option 3 (`label`: `"Absorb into record {N}"`), exactly as before.
```

  Keep the existing "The call has 3 options only when Option 3 is visible…" sentence, adjusted so it reads correctly against both orderings (no placeholder options in either).
- [ ] **Step 3:** `wc -c`; ceiling suite; verify `grep -in "most-recently-updated" plugin/skills/capture/SKILL.md` matches (AC1).
- [ ] **Step 4:** Commit: `git add plugin/skills/capture/SKILL.md && git commit -m "Render absorb as recommended option 1 at high similarity, with the shared-path tie-break"`

---

### Task 3: Absorb mechanics — append heading, size re-judge, priority suggestion

**Files:** Modify: `plugin/skills/capture/SKILL.md` (the Route-execution table's `absorb:N` / `github-issues` cell, and a short mechanics paragraph after the table)

- [ ] **Step 1:** Locate: `grep -n "Integrate into record" plugin/skills/capture/SKILL.md`.
- [ ] **Step 2:** Replace the `github-issues` absorb cell's "Integrate into record `#N`'s body the same way" with a pointer to the mechanics paragraph below the table ("per the Absorb mechanics below"), keeping the close/comment sequence. Then add after the table:

```markdown
**Absorb mechanics** (`github-issues`): the capture's content lands on record `#N` as a body-append under `## Absorbed: {YYYY-MM-DD} — {captured title}`, placed under the record's existing sections — never rewriting the spec-shaped content above it — composed fully then written once via `_shared/github-write-transport.md` (`gh issue edit {N} --body-file`). When the post-append body would exceed **55,000 characters** (headroom against GitHub's 65,536 cap), post the same `## Absorbed:` content as a comment instead. In the same edit, re-judge the record's `size:` label by re-applying `_shared/work-record.md`'s size heuristic to the combined body — **raise it when the re-judgment says so, never lower it**; `priority:*` is never written (human//backlog-refine territory) — when the addition suggests higher priority, say so in the rendered output. Every absorb names the target record and what was appended in the skill's output, and invalidates the session record snapshot per `_shared/record-queue-fetch.md`'s existing convention.
```

  Mirror the `local-files` cell minimally (same heading + never-rewrite rule; no char threshold — local files have no such cap).
- [ ] **Step 3:** `wc -c`; ceiling suite.
- [ ] **Step 4:** Commit: `git add plugin/skills/capture/SKILL.md && git commit -m "Specify absorb mechanics: Absorbed-heading append, 55k comment fallback, raise-only size re-judge"`

---

### Task 4: Headless bar and the exclusions list

**Files:** Modify: `plugin/skills/capture/SKILL.md` (a new tight paragraph adjacent to the high-similarity definition or the auto-mode routing paragraph)

- [ ] **Step 1:** Insert the headless bar, adjacent to the auto-mode routing paragraph ("In auto mode, apply the silences-table row…") so both machine paths read together:

```markdown
**Headless bar** (any `--source`/`--defer-reason=` producer filing, `auto` mode, or a chained path): absorb only when criterion (a) is met by a shared **literal file path** named in both bodies AND criterion (b)'s `type:{t}` values are identical — the operation-match judgment is replaced by the structural path requirement headlessly, because a wrong auto-merge is invisible while a duplicate is visible and mergeable later. Anything short of that bar files fresh with a `**Related:** #N` line. The absorb's own `## Absorbed:` heading on the target record is the always-present audit trail; when a run directory resolves, additionally log `AUTO {time} — capture absorbed into #{N} (shared path + same type). Reversibility: medium (append is visible on #{N}).` per `_shared/auto-decision-log.md`.
```

- [ ] **Step 2:** Insert the exclusions as one enumerable list (one sentence, near the high-similarity definition so every absorb path inherits it):

```markdown
Absorb never targets, in any mode: (1) a closed record, (2) a `parent-issue` carrier, (3) a `bot:in-progress` carrier (label vocabulary per `_shared/work-record.md`) — filing fresh with a `**Related:** #N` line stays correct for all three.
```

- [ ] **Step 3:** Verify `grep -in "files fresh" plugin/skills/capture/SKILL.md` matches (AC2); `wc -c` (≤ 40,960 — this is the last prose task; if over, tighten Tasks 1-4's own additions first, per Constraint 1); ceiling suite.
- [ ] **Step 4:** Commit: `git add plugin/skills/capture/SKILL.md && git commit -m "Add the headless structural absorb bar and the three-exclusion list"`

---

### Task 5: `tests/capture-absorb-default.test.js` and full suite

**Files:** Create: `tests/capture-absorb-default.test.js`

- [ ] **Step 1:** Read `tests/specify-decomposition-collapse.test.js` for the established style (`REPO_ROOT`, `read(rel)`, `assert.match`/`doesNotMatch`). Read the current committed `plugin/skills/capture/SKILL.md` in full and anchor every regex on the ACTUAL committed wording — never on this plan's draft blocks if they drifted.
- [ ] **Step 2:** Write tests pinning, one content-anchored assertion each: the recommended-ordering rule (absorb as option 1 `(Recommended)` at high similarity) and the two-criteria definition (including the literal `same kind of change`); the multi-candidate tie-break (literal `most-recently-updated`); the headless structural bar and its fail-toward-filing default (literal `files fresh`); never-lower-size (`never lower`); never-write-priority; the three exclusions as one enumerable list; the 55,000-char body-vs-comment threshold; the `AUTO` log line format; the byte ceiling on `capture/SKILL.md` (fs.statSync ≤ 40960).
- [ ] **Step 3:** **Discrimination (AC4):** temporarily remove the recommended-ordering sentence — its test must go red; restore via `git checkout -- plugin/skills/capture/SKILL.md`, confirm clean tree + green. Repeat for the headless-bar sentence. Never use `git stash`.
- [ ] **Step 4:** `node --test tests/capture-absorb-default.test.js` and `node --test tests/bin-lib/skill-audit/context-cost.test.js` — green.
- [ ] **Step 5:** Full `npm test` redirected to a scratch file, read the tail. Tolerated: the documented `pr-state.test.js` event-loop flake and (if it fires) the pre-existing `store-concurrency.test.js` failure (#1192) — re-run any failing file in isolation before concluding; any OTHER failure is investigated, not waved away.
- [ ] **Step 6:** Commit: `git add tests/capture-absorb-default.test.js && git commit -m "Add conformance suite pinning capture's absorb-by-default rules"`

---

## Self-Review Notes

1. **Deliverable coverage:** D1 (definition) → Task 1; D2 (interactive ordering) → Task 2; D3 (mechanics) → Task 3; D4 (headless bar) → Task 4 Step 1; exclusions (Non-Goal 3 / AC3) → Task 4 Step 2; D5 (fetch widening) → Task 1; D6 (tests) → Task 5. All six ACs mapped: AC1 → Tasks 1-2 (+ grep checks in-task), AC2 → Task 4, AC3 → Task 4 Step 2, AC4 → Task 5 Step 3, AC5 → every task's `wc -c` gate, AC6 → Task 5 Step 5.
2. **Fact-check against the live file:** the option-3 anchor text, the narrow `--json number,title` fetch, the Route-execution absorb cells, the auto-mode routing paragraph, and the `--defer-reason=`/`--source` headless signals were all verified verbatim against `capture/SKILL.md` at plan-authoring time (worktree HEAD 980b639c).
3. **Byte risk:** the four prose blocks above total ~2.4KB raw; with the replaced/tightened existing prose the net should land under the ~2.5KB budget, but Task 4's Step 3 is the hard gate and names the escape (tighten own additions first, never cut pinned prose).
