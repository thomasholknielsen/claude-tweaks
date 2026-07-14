# Spec 16: /capture and /challenge on the Unified Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/capture` files raw work records (`by:capture` + Type only — the `backlog`/`backlog:category-*` label family dies); routing becomes `challenge / brainstorm / keep / absorb:N` (legacy `inbox`/`merge:N` accepted as aliases); `/challenge` posts findings as record comments; both skills cite `_shared/work-record.md`.

**Architecture:** Storage-layer swap only — capture's interaction flow (AskUserQuestion routing, `--route` args, 5-line cap) stays intact. GitHub driver: `recordPayload` → `gh issue create`. Local driver: `local-store.js` `writeRecord` + `allocateId` into `specs/` (records all live in one place; backlog = absence of stage labels — the `specs/backlog/` directory concept leaves this skill). Transient `gh` failure → local record with `unsynced: true`.

**Tech Stack:** Markdown skill files only. Verification = spec 16's AC greps.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel` before git commands.
- Preserve capture's Component-Skill Contract PARENTS and `$PIPELINE_RUN_DIR` detection logic exactly — only vocabulary inside it may change (spec 16 Gotcha).
- Do NOT edit CLAUDE.md's `## Backlog integration` section (live config; the skill reads both flag names).
- The words "inbox"/"INBOX" survive in the two files ONLY as (a) the single legacy-alias mention in the routing table (AC 4 requires listing it) and (b) nothing else. Same for `merge:N`. All other uses — headings, stage names, "INBOX entry/item", Anti-Patterns rows, Next Actions, Relationship rows — are rewritten to record vocabulary.
- No category re-introduction under any name (spec Non-Goal). The `**Category:**` field, `$CATEGORY` variable, and `backlog:category-*` labels disappear entirely.
- Labels on the happy path: exactly `by:capture` (plus `type:{t}` ONLY when the project's `work-types` key reads `labels`). No scoring, no stage labels — a fresh capture is a backlog record (no label asserts it).
- Type guess table (advisory, confirmed in the existing "Added:" presentation via free text — NO new AskUserQuestion): title/body matching `fix|broken|crash|error|bug|regression|wrong|fails` → `bug`; matching `add|support|enable|new|allow|feature` → `feature`; else → `task`.
- Vocabulary sweep rule: rename ALL retiring vocabulary in touched files; completion contract = the AC greps.
- No emojis; commit style `{Verb} {what} — {detail}`.

---

### Task 1: Rewrite `skills/capture/SKILL.md` onto the unified record

**Files:**
- Modify: `skills/capture/SKILL.md`

**Section-by-section requirements:**

1. **"Inbox vs parked" blockquote (line ~24)** → recast as "Backlog vs parked": capture files fresh backlog records (no stage label / no `stage:` frontmatter); deferral from active work goes through `/claude-tweaks:tidy`'s Defer action (adds `parked` + trigger). Reference `_shared/work-record.md` for the stage vocabulary.
2. **Input table:** `--route=<value>` enum becomes `challenge|brainstorm|keep|absorb:N` with one sentence: legacy values `inbox` (→ `keep`) and `merge:N` (→ `absorb:N`) are accepted as aliases.
3. **Workflow table Step 1:** "Add the record — GitHub issue via `recordPayload`, or a `specs/{id}-{slug}.md` record via `local-store.js`, per Backend Selection."
4. **Backend Selection:** read `work-backend` (same `## Work records` CLAUDE.md section `/init` will write); `backlog-backend` accepted as a read-only legacy alias; missing → `local-files`. Replace the whole github-issues snippet with:
   - No label bootstrap beyond `by:capture` (copy its pair from `_shared/label-bootstrap.md`'s canonical LABELS_JSON; bootstrap `type:{t}` from `record.js`'s `TYPE_LABELS` only when `work-types: labels`).
   - Payload via `node -e` calling `recordPayload({title, body, type, origin: 'capture'})` from `${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js`, written to a temp JSON, then `gh issue create --title ... --body-file ... --label by:capture` + the Type expression branch (`work-types: native` → apply the native Issue Type; `labels` → `--label "type:${TYPE}"`).
   - **Failure fallback (AC 5):** on `gh` failure, write the record via `local-store.js` (`allocateId` + `writeRecord` with facets `{type, origin:'capture', unsynced: true}`), tell the user, and cross-reference by name: "`/claude-tweaks:tidy`'s record scan surfaces `unsynced` local records as Sync findings".
   - Local driver: `writeRecord('specs/{id}-{slug}.md', {title, body, facets: {type, origin:'capture'}})` with `allocateId('specs')`; slug rules unchanged (lowercase, dashes, 60 chars, collision suffix).
5. **Entry Format:** one format, both drivers: body = `**Related:** {...}` + `Context:` + `Scope:` lines (category line/label GONE). GitHub: issue title/body. Local: H1 title + same body under the frontmatter. 5-line cap prose: "If it takes more than 5 lines, it's past the raw-capture stage" (record vocabulary).
6. **Adding an Entry:** collapse to the two driver paths above; add the Type guess table (from Global Constraints) with the sentence that the guess is advisory and rides in the existing "Added: '{title}' (Type: {t})" presentation — user overrides via free text, no new question.
7. **Immediate Routing:** rename routes: `challenge` / `brainstorm` / `keep` / `absorb:N`. Table rows updated: `keep` = "record stays in backlog state — explicitly, no label asserts this"; `absorb:N` (github) = integrate into record `#N`'s body, comment `Absorbed into #N.`, close as not-planned; (local) = integrate into record N's file, delete the absorbed record file. AUTO-log lines and auto-mode default change from `inbox` to `keep` (matches `_shared/auto-mode-contract.md`'s updated row). AskUserQuestion Option 3 label "Keep as backlog record"; Option 4 "Absorb into record {N}". Legacy alias sentence (the ONLY place the old words appear): "Legacy route values `inbox` and `merge:N` are accepted as aliases for `keep` and `absorb:N`."
8. **Review Workflow / Next Actions / Anti-Patterns / Relationship:** record vocabulary throughout ("backlog records" not "INBOX"); Next Actions Option 3's `{ref}` note: `#{n}` under github-issues, or the record id under local-files. Relationship rows for `/review`, `/wrap-up`, `/reflect`, `/visual-review`: reword their entry-writing descriptions to "file new backlog records" (their own skills are updated by later specs on this branch). Add a `_shared/work-record.md` row (taxonomy home). Keep bidirectionality intact.
9. **Component-Skill Contract:** vocabulary only (INBOX→record); parents/detection unchanged.

- [ ] **Step 1: Apply the rewrite** per requirements 1-9.
- [ ] **Step 2: Verify:**
```bash
grep -n "backlog:category\|inboxIssuePayload" skills/capture/SKILL.md          # 0 hits (AC 1)
grep -in "inbox" skills/capture/SKILL.md                                        # ONLY the legacy-alias sentence
grep -n "specs/backlog" skills/capture/SKILL.md                                 # 0 hits
grep -c "by:capture" skills/capture/SKILL.md                                    # ≥ 3
grep -c "work-record.md" skills/capture/SKILL.md                                # ≥ 1 (AC 6)
grep -n "work-backend" skills/capture/SKILL.md | head -3                        # present; backlog-backend only as legacy alias
grep -c "unsynced" skills/capture/SKILL.md                                      # ≥ 2 (AC 5)
grep -n "absorb:N\|Absorbed into" skills/capture/SKILL.md | head -5             # routing present
```
- [ ] **Step 3: Commit** — `git add skills/capture/SKILL.md && git commit -m "Rewrite capture onto the unified record — by:capture filing, keep/absorb routing, unsynced fallback"`

---

### Task 2: Update `skills/challenge/SKILL.md` to record vocabulary

**Files:**
- Modify: `skills/challenge/SKILL.md`

**Requirements:**
1. Where the skill resolves backlog references (find via `grep -n "backlog\|inbox\|INBOX" skills/challenge/SKILL.md`): input references become record references — `#{n}` fetched via `gh issue view {n} --json title,body` (github driver) or the record file via `local-store.js` (local driver).
2. Add one short paragraph (near the output/results handling): when the input is a record reference, the debias findings post as **issue comments** on the record (github driver) or are **appended to the record file** (local driver) — the record is the durable home; `/challenge` never edits the record body itself.
3. Vocabulary: INBOX/inbox → backlog record (0 remaining hits — challenge has no legacy-alias exception).
4. Add `_shared/work-record.md` reference (AC 6) + keep the `/capture` Relationship row bidirectional with capture's updated wording.

- [ ] **Step 1: Apply.** **Step 2: Verify:** `grep -in "inbox" skills/challenge/SKILL.md` → 0; `grep -c "work-record.md" skills/challenge/SKILL.md` ≥ 1; `grep -n "comment" skills/challenge/SKILL.md | head -3` shows the findings-as-comments paragraph.
- [ ] **Step 3: Commit** — `git add skills/challenge/SKILL.md && git commit -m "Point challenge at work records — findings post as record comments"`

---

### Task 3: Spec-16 acceptance sweep

- [ ] **Step 1:** Run all six ACs:
```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23"
grep -n "backlog:category\|inboxIssuePayload" skills/capture/SKILL.md            # AC 1: 0
grep -n "by:capture" skills/capture/SKILL.md | head -3                           # AC 2 evidence: single-label happy path
grep -in "inbox" skills/capture/SKILL.md skills/challenge/SKILL.md               # AC 3: only capture's legacy-alias sentence
grep -n "keep\|absorb:N" skills/capture/SKILL.md | head -8                       # AC 4: routes documented
grep -n "unsynced" skills/capture/SKILL.md                                       # AC 5: fallback documented + tidy Sync cross-ref
grep -c "work-record.md" skills/capture/SKILL.md skills/challenge/SKILL.md       # AC 6: ≥1 each
npm test 2>&1 | tail -3                                                          # no skill-md tests assert capture/challenge content today — confirm suite still green
```
- [ ] **Step 2:** Fix findings (these two files only), re-run until clean.
- [ ] **Step 3: Commit (only if fixes)** — `Fix spec-16 acceptance sweep findings`
