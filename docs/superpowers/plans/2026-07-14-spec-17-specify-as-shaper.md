# Spec 17: /specify as the Shaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/specify` stops writing spec files and becomes the shaper of work records: record refs are shaped in place (spec-shaped body, `ready`, scoring, `## Original request` preserved); design docs decompose into a parent record + `ready` leaf records with native/body-text linking, deterministic fingerprints, and write-path resilience. `spec-template.md` becomes the record body template.

**Architecture:** All storage goes through the unified record: github driver = `gh issue view/create/edit --body-file` + `recordPayload`; local driver = `local-store.js`. Two explicit modes replace the single file-writing path: **shaping** (single record in → same record out, enriched) and **decomposition** (design doc in → parent + leaves out). INDEX.md writes stop. Red-team/self-review/sizing/groupByFileOverlap all survive, retargeted at record bodies.

**Tech Stack:** Markdown skill files + existing Node modules (record.js, local-store.js, grouping.js — consumers only, unchanged).

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel` before git commands.
- **Permission boundary (AC 7, state it literally in the SKILL.md):** `/specify` adds `ready` and `risk:*`/`effort:*` (when unstamped), removes `parked` on promotion, and NEVER touches `auto:*` or `bot:*`.
- **Parent/leaf rules (AC 3, state literally):** parent body = design summary (problem, chosen approach, key decisions, why alternatives lost); Type `feature`; parents never get `ready`. Only leaves get `ready` + scoring. Tasks never become records — a leaf's internal breakdown is a checklist inside its body.
- **Wire format (committed here, consumed by spec 20):** every leaf body starts with a short metadata block containing `Surface: {web|mobile|desktop|backend|infra}` and (frontend only) `Design-intent: {value}` as plain body-metadata lines — never labels, never YAML.
- **Body edits are compose-then-write-once:** build the full body locally, write with one `gh issue edit {n} --body-file` (or one `writeRecord`) — never incremental API edits mid-composition.
- **Idempotency (AC 4):** leaf fingerprints are deterministic `{design-doc-slug}:{unit-slug}`; before creating leaves, list existing markers via `gh issue list --state all --json number,body --limit 200` (REST list, NOT the search index) + local marker grep, and re-check immediately before each individual create.
- **Write-path resilience:** a `gh` create/edit failure mid-decomposition writes that leaf via `local-store.js` with `unsynced: true` (fingerprint preserved) and CONTINUES; `/tidy`'s Sync finding reconciles later.
- **65KB cap gotcha:** a leaf body exceeding ~50KB is a decomposition smell — split it.
- Retiring vocabulary: `recon-issue`, `recon-fingerprint`, `recon-was-parked`, `code-health-effort`, `specs/NN`, `INDEX.md` — zero occurrences in `skills/specify/SKILL.md` after the rewrite except (AC 2 allowance) at most ONE legacy/migration note. Sweep rule: rename ALL occurrences in touched files.
- Driver split: every step states both branches (github: labels/sub-issues/gh; local: frontmatter facets via `local-store.js`, `parent:`/`blocked-by:` frontmatter instead of sub-issue APIs, `allocateId`).
- Preserve intact: the interaction directive, ambiguous-input disambiguation, overlap policy machinery (vocabulary retargeted to records), Step 2 sizing tables, Step 2.5/2.5d gating, Step 7's phase-marker table and design-doc deletion semantics, red-team dispatch discipline, adaptive structure (Next Actions before CSC before Anti-Patterns).
- No emojis; commit style `{Verb} {what} — {detail}`.

---

### Task 1: SKILL.md — input resolution + shaping mode

**Files:** Modify `skills/specify/SKILL.md` (title/lifecycle intro, When to Use, Granularity Contract, Input + Resolve-the-input, NEW `## Shaping mode` section placed after input resolution)

**Requirements:**
1. Title/intro: "/specify — shape work records and decompose designs into ready leaf records". Lifecycle diagram line stays structurally identical (skill names unchanged).
2. Granularity Contract table: two tiers — Strategic: design doc (unchanged) → Executional: **ready leaf records** (producer /specify; consumers /flow, /build, /dispatch). Replace "spec (one file per…)" vocabulary.
3. Resolve-the-input rewrite:
   - **Case 1 (record reference)** — `#N` / issue URL / bare local record id: fetch via `gh issue view {n} --json number,title,body,url,labels` (github) or `specs/{n}-*.md` glob + `readRecord` (local). Enter **shaping mode**. NO recon-* extraction — the record IS the target; scoring is read from labels via `parseRecordFacets` (github) or facets (local) only to decide whether to stamp.
   - Cases 2-4 (design-doc path / topic / topic-without-doc → invoke brainstorming) unchanged in mechanics; on completion they enter **decomposition mode**.
   - **Case 5** (backlog reference) → record queries: search open records by title keywords (`gh issue list --search` / `queryRecords`), then shaping mode on the match; no design doc involved unless one exists for the topic.
4. NEW `## Shaping mode (single record)` section: edit the body into spec shape (Current State / Deliverables / Acceptance Criteria / Technical Approach / Gotchas); PRESERVE the human's original text verbatim under an `## Original request` section (state this as a rule with the literal section name — AC 6); insert the `Surface:` (+ `Design-intent:` when frontend, after running Step 2.5 detection on the record content) metadata block at the top of the body; stamp `risk:*`/`effort:*` labels if absent (github: `--add-label`; local: facets); remove `parked` if present; add `ready`. Compose-then-write-once. End with the permission-boundary sentence (Global Constraints).
5. The old case-1 prose about `recon-*`, `code-health:effort-` labels, `/flow #{issue}` routing through specify, and triage-dispatch hand-off is deleted (spec 20 gives /flow direct materialization; say nothing about flow calling specify).

- [ ] Step 1: Apply. Step 2: Verify: `grep -n "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/specify/SKILL.md` → 0; `grep -c "Original request" skills/specify/SKILL.md` ≥ 2; `grep -c "Shaping mode" skills/specify/SKILL.md` ≥ 1; `grep -n "never touches \`auto:\|never touch \`auto:" skills/specify/SKILL.md` ≥ 1 hit.
- [ ] Step 3: Commit — `Rewrite specify input resolution and add shaping mode — records in, records out`

---

### Task 2: SKILL.md — decomposition mode (Steps 2-4 replacement)

**Files:** Modify `skills/specify/SKILL.md` (Step 1 landscape, Step 2 decompose, Step 2.5* pointers, Step 3 "Write the Spec Files" → "Create the records", Step 4 INDEX → linking)

**Requirements:**
1. Step 1 Landscape: INDEX read replaced by record queries (`gh issue list --state open --json number,title,labels,body --limit 200` + `parseRecordFacets` / `queryRecords`); File Reference Map extracts Key Files from open records' bodies (and non-completed local records); Overlap Analysis targets open records (companion = new leaf `Blocked by #N`; extend/replace stage exactly as today — never auto-modify an existing record body).
2. Step 2 sizing/heuristics/good-bad tables unchanged; Implicit Dependency Detection: input set = new work units + open in-flight records `{id, keyFiles}`; same `groupByFileOverlap` snippet; classification table rows reworded to records.
3. Step 3 becomes `## Step 3: Create the records`:
   - **Parent first**: Type `feature`, body = design summary + `Surface:` metadata line; via `recordPayload` (no ready, no scoring) → `gh issue create` (or `writeRecord`); capture the new number.
   - **Leaves**: per unit, body per `spec-template.md` (record body template) with the metadata block; `recordPayload({title, body, type: parentType-or-override, risk, effort, ready: true, fingerprint: '{design-doc-slug}:{unit-slug}'})`; Type override rule: a clearly defect-fix unit → `bug`.
   - **Idempotency block** (Global Constraints wording): list-markers-then-recheck-before-each-create; a matching fingerprint → skip that leaf (resume path).
   - **Linking** branches on `work-links`: `native` → sub-issue endpoints (`gh api repos/{owner}/{repo}/issues/{parent}/sub_issues -f sub_issue_id={leafId}`) + blocked-by dependency API between leaves; `body-text` → `Blocked by #N` body lines on dependent leaves + a parent task-list (`- [ ] #N`) appended to the parent body; readers use `record.js`'s `parseDependencies`.
   - **Write-path resilience** paragraph (Global Constraints wording) + `unsynced: true` fallback.
   - Absorb-decisions rules (self-contained records, brief absorption, manual-steps triage pointer) survive with record vocabulary.
4. Step 4 (Update INDEX.md) is REPLACED by `## Step 4: Link and order` — the linking above + Decision Rationale / Assumptions absorption (parent body carries Decision Rationale; leaves carry relevant Assumptions in Gotchas). Tier tables die; note that `priority:*` labels are optional and human-applied (permission matrix).

- [ ] Step 1: Apply. Step 2: Verify: `grep -n "specs/NN\|specs/{N}\|INDEX.md" skills/specify/SKILL.md` → 0 outside ≤1 legacy note (AC 2); `grep -c "work-fingerprint\|{design-doc-slug}:{unit-slug}" skills/specify/SKILL.md` ≥ 2 (AC 4 evidence); `grep -c "Blocked by #N" skills/specify/SKILL.md` ≥ 1; `grep -c "parseDependencies" skills/specify/SKILL.md` ≥ 1; `grep -c "unsynced" skills/specify/SKILL.md` ≥ 1; `grep -in "parents never\|never gets \`ready\`\|never get \`ready\`" skills/specify/SKILL.md` ≥ 1 (AC 3).
- [ ] Step 3: Commit — `Rewrite specify decomposition onto records — parent summary record, ready leaves, native or body-text linking`

---

### Task 3: SKILL.md — Steps 5-9, Next Actions, contract sections

**Files:** Modify `skills/specify/SKILL.md` (Steps 5-9, Next Actions, CSC, Anti-Patterns, Relationship, Background); Modify `skills/specify/red-team.md` (dispatch-input wording only)

**Requirements:**
1. Step 5 red-team: agents receive **record numbers + `gh issue view` read instructions** (github) or record file paths (local) — never both; findings write back into record bodies (inline `<!-- ambiguity: ... -->` comments / `## Open Questions` table) via compose-then-write-once. Update `red-team.md`'s input/dispatch wording to match (Template A discipline unchanged).
2. Step 6 self-review: same five checks retargeted (placeholder scan over record bodies; internal consistency across leaves; scope; ambiguity; design-doc coverage against the leaf set).
3. Step 7 (delete consumed artifacts): mechanics + phase-marker table unchanged (design docs are still files); wording "specs" → "records" where it refers to outputs.
4. Step 8 (backlog-entry deletion) RETIRED — replace with one line: "Retired: a captured record is shaped in place (Shaping mode); there is no separate backlog entry to delete."
5. Step 9 Summary: table columns `Record | Title | Type | Blocked by | Est. tasks`; Artifacts Removed keeps design doc/brief; **the commit block shrinks to committing only artifacts that are files** (design-doc deletion/marker, any local-driver records) — github-driver runs may have nothing to commit; state that explicitly. Records ARE the durable input now — drop the "spec must exist in committed history" rationale, replace with: leaves are already durable on the tracker; `/flow #N` materializes at build time (spec 20's contract).
6. Next Actions: emit `#N` references — `/claude-tweaks:flow #{N}` (single), `/claude-tweaks:flow #{N1},#{N2},...` (multi/phase), `/claude-tweaks:specify {doc} phase-{N+1}` unchanged; local-driver runs emit bare record ids. Situation table + AskUserQuestion rendering preserved.
7. Granularity-contract section + Anti-Patterns: "specs that touch every layer" → "records/leaves…"; delete the "Producing a phase plan file" row's spec-file vocabulary but keep its rule; add anti-pattern rows: "Granting or touching `auto:*`/`bot:*` from /specify" and "Marking a parent record `ready`". Relationship table: update /flow (accepts `#N` — records pre-shaped; no /specify call inside /flow), /build (materializes records), /capture (files the raw records /specify shapes), /tidy (Promote recommends `/specify #{n}`), code-health row (born-ready records skip shaping; /specify shapes captured/human records), add `_shared/work-record.md` row + `bin/lib/issues/record.js`/`local-store.js` consumer rows. Keep bidirectionality with files already migrated on this branch.
8. CSC: keep "always user-facing, always renders Next Actions" (unchanged rationale).
9. Background section: update the two-tier sentence to record vocabulary.

- [ ] Step 1: Apply. Step 2: Verify: `grep -n "specs/backlog" skills/specify/SKILL.md` → 0; `grep -c "flow #{N}\|flow #{N1}\|#\\{N\\}" skills/specify/SKILL.md` ≥ 1; `grep -in "step 8" skills/specify/SKILL.md | head -2` shows the retirement; `grep -c "work-record.md" skills/specify/SKILL.md` ≥ 1; `grep -n "gh issue view" skills/specify/red-team.md` ≥ 1.
- [ ] Step 3: Commit — `Retarget specify steps 5-9 and contracts at records — retire backlog cleanup, #N next actions`

---

### Task 4: spec-template.md → record body template; design-pre-steps.md facet lines

**Files:** Modify `skills/specify/spec-template.md`, `skills/specify/design-pre-steps.md`

**Requirements:**
1. `spec-template.md`: retitle "Record Body Template". DELETE the YAML frontmatter block + "Frontmatter reference (canonical spec)" section entirely (AC 5); replace with a `## Facets` reference section: Type + labels (`ready`, `risk:*`, `effort:*`) + parent/dependency links are RECORD facets governed by `_shared/work-record.md` (cite by path) — github: labels/Type/sub-issues; local: frontmatter per `local-store.js`. Add the body-metadata block (`Surface:` / `Design-intent:` lines) at the top of the template with one sentence: lifted into the materialized header by `/flow`/`/build` (spec 20's contract). Body sections (Overview/Current State/Deliverables/Acceptance Criteria/Technical Approach/Gotchas/Key Files) unchanged; KEEP the "No Placeholders" section verbatim; Manual-steps triage note survives.
2. `design-pre-steps.md`: output target changes from spec frontmatter to the leaf body-metadata lines (`Surface:` / `Design-intent:`); detection rules unchanged; any `surface:` frontmatter wording → body-metadata wording.

- [ ] Step 1: Apply. Step 2: Verify: `python3 -c "import re,sys; s=open('skills/specify/spec-template.md').read(); import sys; sys.exit(1 if re.search(r'^---$', s, re.M) and 'tier:' in s else 0)"` (no spec-era YAML block); `grep -n "tier:\|status:\|progress:\|blocked-by:" skills/specify/spec-template.md` → 0 hits outside the local-files facet reference (which names `local-store.js`'s documented set); `grep -c "work-record.md" skills/specify/spec-template.md` ≥ 1 (AC 5); `grep -c "No Placeholders" skills/specify/spec-template.md` ≥ 1; `grep -c "Surface:" skills/specify/design-pre-steps.md` ≥ 1.
- [ ] Step 3: Commit — `Turn spec-template into the record body template — facets reference, body-metadata lines`

---

### Task 5: Spec-17 acceptance sweep

- [ ] Step 1: Run ACs 1-7:
```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23"
grep -n "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/specify/SKILL.md            # AC 1: 0
grep -n "specs/NN\|specs/{N}\|INDEX.md" skills/specify/SKILL.md                                                    # AC 2: ≤1 legacy note
grep -in "parent body = design summary\|parents never\|only leaves\|tasks never become" skills/specify/SKILL.md   # AC 3: rules literal
grep -in "before each individual create\|re-check immediately\|resume.*without duplicates\|fingerprint" skills/specify/SKILL.md | head -5   # AC 4
grep -n "tier: 1\|^tier:\|status: not-started" skills/specify/spec-template.md                                     # AC 5: 0 (no YAML spec block)
grep -c "work-record.md" skills/specify/spec-template.md                                                           # AC 5: ≥1
grep -in "Original request" skills/specify/SKILL.md | head -3                                                      # AC 6: rule + literal section name
grep -in "adds \`ready\`\|removes \`parked\`\|never touches \`auto:" skills/specify/SKILL.md | head -5             # AC 7
npm test 2>&1 | tail -3
```
- [ ] Step 2: Fix findings, re-run until clean. **Scope grant (explicit):** spec-17's four files PLUS these queued cross-file pointer fixes accumulated from task reviews:
  1. `skills/specify/SKILL.md` Step 3: add one clause — unit slugs must not be the literal `parent` (reserved for the parent record's fingerprint).
  2. `skills/specify/SKILL.md` Step 2.5d: bare-word "specs" heading/prose → record vocabulary ("(all surfaces)" / "record titles").
  3. `skills/specify/red-team.md:~57`: lowercase `surface:` casing → `Surface:` (body-metadata line spelling).
  4. `skills/challenge/SKILL.md:~298`: the `/specify` Relationship row "converts brainstorming output into specs" → "shapes records / decomposes designs into ready leaf records" (bidirectionality maintenance).
  5. `skills/design/SKILL.md`, `skills/design/frontend-detection.md`, `skills/design/command-map.md`, `skills/design/modes/test.md` — POINTER-LEVEL ONLY: retired `frontend|mixed` enum citations → the canonical `web|mobile|desktop|backend|infra` (legacy `frontend` reads as `web`); quotes of the deleted "Frontmatter reference (canonical spec)" section → the new "Facets"/metadata-block section names; "spec frontmatter" as the Layer-2 source → "the record's `Surface:`/`Design-intent:` body-metadata lines (lifted into the materialized build header — spec 20)". Do NOT restructure the wrapper's detection logic — that read-path prose move is spec 20's.
  (`skills/flow/manifesto.md` is explicitly NOT in this grant — registered as F10 for spec 20's plan.)
- [ ] Step 3: Commit (only if fixes) — `Fix spec-17 acceptance sweep findings — queued pointer fixes across specify/challenge/design`
