# Visual Quality Boost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `claude-tweaks:design` to `claude-tweaks:design-wrapper`, then close the blandness gap in claude-tweaks' Impeccable integration: dispatch `audit`'s already-computed Anti-Pattern remediation suggestions automatically in `/flow`, give a Creative Opportunities recommendation a real one-click apply path, add a `live` mode to the wrapper for genuinely interactive variant exploration, and use it from two new call sites — a throwaway-scaffold step at `/specify` shape-time, and an opt-in "boost" gate on standalone `/visual-review`.

**Architecture:** One mechanical rename task first (everything downstream references the new name), then five content tasks that are markdown/skill-procedure edits only — no new `bin/` code, no new CLI. Each task is independently committable and independently testable via grep/read-through verification, matching this repo's own established convention for prose-only changes (see `docs/superpowers/plans/2026-07-18-health-filing-gate-fix.md`).

**Tech Stack:** Markdown skill files (`skills/**/*.md`), read directly by an LLM session — no build step, no runtime.

**Design doc:** `docs/superpowers/specs/2026-07-19-visual-quality-boost-design.md`

## Global Constraints

- Every skill/shared-fragment convention from CLAUDE.md applies verbatim: Anti-Patterns rows use `| Pattern | Why It Fails |`; Relationship rows use `| Skill | Relationship |`; every Relationship-table edit must be bidirectional (both sides updated).
- No unit tests are added or changed — these are prose-only edits. The full `node --test` suite must report the same pass/fail counts before and after (baseline confirmed at worktree setup: **1246 passed, 0 failed**).
- Commit after each task, never batch multiple tasks into one commit. Work happens on the current worktree branch (`worktree-design-wrapper-visual-boost`) — every `git` command in this plan assumes the working directory is already that worktree.
- This environment is macOS (Darwin) — every `sed -i` command in this plan uses the BSD form `sed -i ''` (empty string as the backup-suffix argument), not GNU `sed -i`.
- **Rename scope boundary:** only *live* documentation gets renamed — `skills/**/*.md`, `CLAUDE.md`, `README.md`. Historical records (`docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`, `CHANGELOG.md`) are frozen-in-time and must NOT be touched — they document what was true when written, using the names live at that time. Do not rename `design-intent`, `design-integration`, `design doc`, `DESIGN.md`, `design-pre-steps.md`, or the runtime storage path `.claude-tweaks/design/` (this last one is a data directory, independent of the skill name, and out of scope for this rename).
- The three manual-only Impeccable commands (`colorize`, `extract`, `overdrive`) never get auto-dispatched anywhere in this plan. Every new dispatch path either whitelist-filters them out (Task 2) or requires explicit per-item human consent via an `AskUserQuestion` apply-gate (Tasks 3, 6).
- Task ordering is load-bearing: Task 1 (rename) must run before every other task, since Tasks 2–6 all write "Find this exact text" anchors using the post-rename `design-wrapper` name. Task 4 (`live` mode) must run before Tasks 5 and 6, which both invoke it. Task 3 must run before Task 6, which anchors on text Task 3 leaves behind.

---

### Task 1: Rename `claude-tweaks:design` → `claude-tweaks:design-wrapper`

**Files:**
- Rename (git mv): `skills/design/` → `skills/design-wrapper/`
- Modify (blanket sed, word-boundary-safe `claude-tweaks:design\b` → `claude-tweaks:design-wrapper`): `README.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/design-wrapper-handling.md`, `skills/_shared/visual-html-output.md`, `skills/build/design-prebuild.md`, `skills/build/SKILL.md`, `skills/flow/materialize.md`, `skills/flow/SKILL.md`, `skills/flow/steps-and-gates.md`, `skills/flow/survey.md`, `skills/help/reference-card.md`, `skills/help/SKILL.md`, `skills/init/bootstrap-steps.md`, `skills/init/SKILL.md`, `skills/review/review-summary-template.md`, `skills/review/SKILL.md`, `skills/simplify/SKILL.md`, `skills/specify/design-pre-steps.md`, `skills/specify/SKILL.md`, `skills/test/SKILL.md`, `skills/visual-review/browser-review.md`, `skills/visual-review/SKILL.md`, `skills/visualize/d2-enhanced-path.md`, `skills/visualize/SKILL.md`, `skills/wrap-up/cleanup-procedures.md`, `skills/wrap-up/SKILL.md`, plus every `*.md` under the renamed `skills/design-wrapper/` tree
- Modify (manual, bare `/design` skill-reference and literal `skills/design/` path fixes): `skills/design-wrapper/SKILL.md`, `skills/flow/SKILL.md`, `skills/help/SKILL.md`, `skills/init/bootstrap-steps.md`, `skills/simplify/SKILL.md`, `skills/visualize/SKILL.md`, `skills/wrap-up/cleanup-procedures.md`, `CLAUDE.md`

**Interfaces:**
- Produces: the `claude-tweaks:design-wrapper` skill name and `skills/design-wrapper/` directory path that every subsequent task's "Find this exact text" anchors assume.

- [ ] **Step 1: Move the directory**

```bash
git mv skills/design skills/design-wrapper
```

- [ ] **Step 2: Blanket-rename the fully-qualified skill name everywhere it's safe**

The pattern `claude-tweaks:design\b` is safe to replace in one global pass — it only ever appears as the skill name today (never as a substring of an already-longer name, since `design-wrapper` doesn't exist pre-rename), so there is no double-application risk.

```bash
FILES="README.md skills/_shared/auto-mode-contract.md skills/_shared/design-wrapper-handling.md skills/_shared/visual-html-output.md skills/build/design-prebuild.md skills/build/SKILL.md skills/flow/materialize.md skills/flow/SKILL.md skills/flow/steps-and-gates.md skills/flow/survey.md skills/help/reference-card.md skills/help/SKILL.md skills/init/bootstrap-steps.md skills/init/SKILL.md skills/review/review-summary-template.md skills/review/SKILL.md skills/simplify/SKILL.md skills/specify/design-pre-steps.md skills/specify/SKILL.md skills/test/SKILL.md skills/visual-review/browser-review.md skills/visual-review/SKILL.md skills/visualize/d2-enhanced-path.md skills/visualize/SKILL.md skills/wrap-up/cleanup-procedures.md skills/wrap-up/SKILL.md"
for f in $FILES; do
  sed -i '' 's/claude-tweaks:design\b/claude-tweaks:design-wrapper/g' "$f"
done
find skills/design-wrapper -name '*.md' -exec sed -i '' 's/claude-tweaks:design\b/claude-tweaks:design-wrapper/g' {} +
```

- [ ] **Step 3: Verify the blanket sed**

```bash
grep -rl 'claude-tweaks:design\b' --include='*.md' skills/ CLAUDE.md README.md 2>/dev/null | grep -v 'claude-tweaks:design-wrapper'
```
Expected output: empty (every remaining `claude-tweaks:design` is now immediately followed by `-wrapper`).

```bash
grep -c 'claude-tweaks:design-wrapper' skills/design-wrapper/SKILL.md
```
Expected output: a number ≥ 1 (confirms the frontmatter `name:` line and internal self-references were both caught).

```bash
grep -rc 'design-intent\|design-integration\|DESIGN\.md\|design-pre-steps' skills/specify/design-pre-steps.md skills/specify/spec-template.md CLAUDE.md | grep ':0$'
```
Expected output: empty (confirms none of these adjacent terms were accidentally zeroed out by the sed — they should still all be present with non-zero counts).

- [ ] **Step 4: Fix the bare `/design` skill references the blanket sed can't safely reach**

These are hand-fixed individually because a word-boundary sed on bare `/design` would also match `/design-pre-steps.md`, `/design-intent`, etc. (confirmed by direct testing during planning) — enumerating each occurrence by hand avoids that collision entirely.

In `skills/design-wrapper/SKILL.md`, find this exact text:
```
| `/claude-tweaks:simplify` | Runs before `polish` mode in `/flow` (different phases — simplify is in build, polish is post-review) — `distill` is intent-only to avoid double-stripping with `/simplify`. /simplify reciprocally avoids the `distill` overlap by deferring distillation to /design polish when intent declares it. |
```
Replace with:
```
| `/claude-tweaks:simplify` | Runs before `polish` mode in `/flow` (different phases — simplify is in build, polish is post-review) — `distill` is intent-only to avoid double-stripping with `/simplify`. /simplify reciprocally avoids the `distill` overlap by deferring distillation to /design-wrapper polish when intent declares it. |
```

In `skills/flow/SKILL.md`, find this exact text:
```
- When `/design polish` returns a non-empty `commands_invoked` (and therefore a `decision_summary` field — see `skills/design/modes/polish.md` Step 7), append one entry to the auto-decision log at `{run-dir}/decisions.md`, under a `## /flow` heading (create the heading if absent, per the append-only protocol in `_shared/auto-decision-log.md`):
```
Replace with:
```
- When `/design-wrapper polish` returns a non-empty `commands_invoked` (and therefore a `decision_summary` field — see `skills/design-wrapper/modes/polish.md` Step 7), append one entry to the auto-decision log at `{run-dir}/decisions.md`, under a `## /flow` heading (create the heading if absent, per the append-only protocol in `_shared/auto-decision-log.md`):
```

In `skills/help/SKILL.md`, find this exact text:
```
| `/claude-tweaks:design-wrapper` | Utility wrapper — /help lists it in the utility skills table. /design is invoked by /build (Common Step 1.7 pre-build), /test (Step 1.5 CLI gate), /review (Step 6.5 advisory pass), /flow (polish phase), and /visual-review; standalone usage is rare. |
```
Replace with:
```
| `/claude-tweaks:design-wrapper` | Utility wrapper — /help lists it in the utility skills table. /design-wrapper is invoked by /build (Common Step 1.7 pre-build), /test (Step 1.5 CLI gate), /review (Step 6.5 advisory pass), /flow (polish phase), and /visual-review; standalone usage is rare. |
```

In `skills/init/bootstrap-steps.md`, find this exact text:
```
**Scope note:** this flag is currently write-only — no other claude-tweaks skill reads
it yet. Re-run idempotency for this step comes entirely from the filesystem checks above
(Case A/B/C), not from this flag. The flag is reserved for a future consumer (e.g. `/design`
preferring shadcn components when it reads `enabled`), the same role `design-integration`
plays for Step 10.
```
Replace with:
```
**Scope note:** this flag is currently write-only — no other claude-tweaks skill reads
it yet. Re-run idempotency for this step comes entirely from the filesystem checks above
(Case A/B/C), not from this flag. The flag is reserved for a future consumer (e.g. `/design-wrapper`
preferring shadcn components when it reads `enabled`), the same role `design-integration`
plays for Step 10.
```

In `skills/simplify/SKILL.md`, find this exact text:
```
| `/claude-tweaks:design-wrapper` | /design may invoke /simplify after design-quality fixes land. |
```
Replace with:
```
| `/claude-tweaks:design-wrapper` | /design-wrapper may invoke /simplify after design-quality fixes land. |
```

In `skills/visualize/SKILL.md`, find this exact text:
```
| `/claude-tweaks:design-wrapper` | Not invoked directly — this skill reads `DESIGN.md`/`DESIGN.json` (written by `/impeccable:impeccable document`, the same files `/design pre-build` mode lazy-loads) but does not go through the `/design` wrapper, since it needs the raw token data, not a critique/audit/polish action. |
```
Replace with:
```
| `/claude-tweaks:design-wrapper` | Not invoked directly — this skill reads `DESIGN.md`/`DESIGN.json` (written by `/impeccable:impeccable document`, the same files `/design-wrapper pre-build` mode lazy-loads) but does not go through `/design-wrapper`, since it needs the raw token data, not a critique/audit/polish action. |
```

In `skills/wrap-up/cleanup-procedures.md`, find this exact text:
```
Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.
```
Replace with:
```
Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design-wrapper/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.
```

Then, in the same file, find this exact text:
```
**Not included in this cleanup:** `.claude-tweaks/design/score-history.jsonl` — the persistent, cross-run design-score history log written by `/claude-tweaks:design review`'s score capture (`skills/design/modes/review.md` Step 4.5). Unlike the per-spec caches above, it is committed to git and accumulates across every spec's review run by design. Never delete, truncate, or reset it as part of wrap-up cleanup or any other skill's cleanup procedure — doing so destroys the trend this log exists to provide.
```
Replace with (note `.claude-tweaks/design/` itself is a runtime storage path, unrelated to the skill name, and intentionally NOT renamed):
```
**Not included in this cleanup:** `.claude-tweaks/design/score-history.jsonl` — the persistent, cross-run design-score history log written by `/claude-tweaks:design-wrapper review`'s score capture (`skills/design-wrapper/modes/review.md` Step 4.5). Unlike the per-spec caches above, it is committed to git and accumulates across every spec's review run by design. Never delete, truncate, or reset it as part of wrap-up cleanup or any other skill's cleanup procedure — doing so destroys the trend this log exists to provide.
```

In `CLAUDE.md`, find this exact text:
```
- **Component-skill contract** — Skills that are routinely invoked by other skills (e.g., `/simplify`, `/reflect`, `/deepen`, `/journeys`, `/visual-review`, `/design`, `/capture`, `/challenge`, `/stories`) MUST detect whether they were invoked by a parent skill or directly by a user.
```
Replace with:
```
- **Component-skill contract** — Skills that are routinely invoked by other skills (e.g., `/simplify`, `/reflect`, `/deepen`, `/journeys`, `/visual-review`, `/design-wrapper`, `/capture`, `/challenge`, `/stories`) MUST detect whether they were invoked by a parent skill or directly by a user.
```

Then, in the same file, find this exact text:
```
This bit the Impeccable CLI schema-fix: `skills/design/SKILL.md` has two tables both describing the `/design`↔`/test` severity contract, and the first pass fixed only one — only the final whole-branch review caught the other.
```
Replace with (path corrected so a reader today can still find the file; the narrative substance is left intact as an accurate historical account):
```
This bit the Impeccable CLI schema-fix: `skills/design-wrapper/SKILL.md` has two tables both describing the `/design-wrapper`↔`/test` severity contract, and the first pass fixed only one — only the final whole-branch review caught the other.
```

- [ ] **Step 5: Final verification sweep**

```bash
grep -rn '/design\b' --include='*.md' skills/ CLAUDE.md README.md 2>/dev/null | grep -v 'design-wrapper\|design-intent\|design-integration\|design-pre-steps\|DESIGN\.md\|design doc'
```
Expected output: empty (no remaining bare `/design` skill references outside the excluded adjacent terms).

```bash
test -d skills/design && echo "FAIL: old directory still exists" || echo "OK: old directory gone"
```
Expected output: `OK: old directory gone`

```bash
grep -c "^name: claude-tweaks:design-wrapper$" skills/design-wrapper/SKILL.md
```
Expected output: `1`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Rename claude-tweaks:design to claude-tweaks:design-wrapper

The skill's own first sentence already calls itself a "Wrapper skill,"
and _shared/design-wrapper-handling.md already uses "design-wrapper"
as the caller-side contract name — this rename matches existing
internal vocabulary rather than introducing a new term, and makes
room for the skill gaining real surface area beyond a thin dispatch
layer (see docs/superpowers/specs/2026-07-19-visual-quality-boost-design.md).

Scoped to live docs only (skills/**/*.md, CLAUDE.md, README.md) —
historical records under docs/superpowers/specs/, docs/superpowers/plans/,
and CHANGELOG.md are untouched by design.
EOF
)"
```

---

### Task 2: Anti-Pattern issue-driven dispatch

**Files:**
- Modify: `skills/design-wrapper/command-map.md`
- Modify: `skills/design-wrapper/modes/polish.md`

**Interfaces:**
- Consumes: Task 1's rename (this task's anchors use `skills/design-wrapper/`).
- Produces: a new `staged_suggestions` field on `polish` mode's output — consumed nowhere yet in this plan (no caller reads it; `/flow`'s own consumption of it is out of scope here, same as the design doc's Non-Goals).

- [ ] **Step 1: Add the Anti-Pattern row and dispatch rule to `command-map.md`**

Find this exact text:
```
| Audit category keyword (substring match) | Command dispatched |
|------------------------------------------|---------------------|
| `typography`, `font`, `text-hierarchy`, `headings` | `/impeccable:impeccable typeset <files>` |
| `spacing`, `layout`, `grid`, `padding`, `margin`, `whitespace` | `/impeccable:impeccable layout <files>` |
| `responsive`, `breakpoint`, `mobile`, `tablet`, `viewport`, `adaptive` | `/impeccable:impeccable adapt <files>` |
| `performance`, `bundle`, `render`, `slow`, `lazy-load`, `lcp`, `cls` | `/impeccable:impeccable optimize <files>` |

When multiple findings match the same category, the wrapper dispatches the command **once** with the union of affected files (de-duplicated). When findings span multiple categories, dispatch each command separately.
```

Replace with:
```
| Audit category keyword (substring match) | Command dispatched |
|------------------------------------------|---------------------|
| `typography`, `font`, `text-hierarchy`, `headings` | `/impeccable:impeccable typeset <files>` |
| `spacing`, `layout`, `grid`, `padding`, `margin`, `whitespace` | `/impeccable:impeccable layout <files>` |
| `responsive`, `breakpoint`, `mobile`, `tablet`, `viewport`, `adaptive` | `/impeccable:impeccable adapt <files>` |
| `performance`, `bundle`, `render`, `slow`, `lazy-load`, `lcp`, `cls` | `/impeccable:impeccable optimize <files>` |
| `anti-pattern`, `ai slop`, `ai-generated`, `generic` | *suggestion-driven — see "Anti-Pattern dispatch" below, not a fixed command* |

When multiple findings match the same category, the wrapper dispatches the command **once** with the union of affected files (de-duplicated). When findings span multiple categories, dispatch each command separately.

### Anti-Pattern dispatch — suggestion-driven, not fixed

Unlike the four fixed-command rows above, an `anti-pattern`/`ai slop`/`ai-generated`/`generic` category match does not dispatch one hardcoded command. Impeccable's own `audit` command already tags every Anti-Patterns-dimension finding with a `suggestion` field naming its own best-fit remediation (see `audit.md`'s "Suggested command" convention — drawn from the full command palette, not limited to typeset/layout/adapt/optimize). Read that finding's `suggestion` field and dispatch the named command directly, subject to one filter: if the named command is one of the three manual-only commands (`colorize`, `extract`, `overdrive`), do not dispatch it — instead stage it (see `modes/polish.md` Step 5) so the user still sees it without the pipeline silently applying an aggressive creative change. Any other named command (most commonly `bolder`, sometimes `delight` or `typeset`) dispatches normally, exactly like the four fixed rows above.

When multiple Anti-Pattern findings in one run name the **same** suggested command, dispatch it once with the union of affected files — same rule as the fixed rows. When they name **different** commands (e.g. one finding suggests `bolder`, another suggests `delight`), dispatch each named command once, each scoped to the union of files whose findings named it.
```

- [ ] **Step 2: Extend `modes/polish.md` Step 5 to read the `suggestion` field and stage manual-only suggestions**

Find this exact text:
```
### Step 5: Issue-driven dispatch (only when audit flagged matching category)

Read the audit findings from Step 3. For each category match, invoke the corresponding command per `../command-map.md` Step 2 table. Match by checking the audit finding's `category` or `rule` field (case-insensitive substring match against the category keywords).

When the audit produces multiple matches for the same category, dispatch the command once with the union of affected files.
```

Replace with:
```
### Step 5: Issue-driven dispatch (only when audit flagged matching category)

Read the audit findings from Step 3. For each category match, invoke the corresponding command per `../command-map.md` Step 2 table. Match by checking the audit finding's `category` or `rule` field (case-insensitive substring match against the category keywords).

**Anti-Pattern category is suggestion-driven.** When a finding's category matches `anti-pattern`/`ai slop`/`ai-generated`/`generic` (per `../command-map.md`'s "Anti-Pattern dispatch" section), read that finding's `suggestion` field instead of using a fixed command. If the named command is `colorize`, `extract`, or `overdrive` (the manual-only set), do not dispatch it — instead append one entry to `staged_suggestions` (see Output to caller below) so the caller can surface it without the pipeline applying it silently. Otherwise dispatch the named command normally, same as the fixed-category rows.

When the audit produces multiple matches for the same category **and the same resolved command** (fixed rows: always the same command per category; Anti-Pattern row: same `suggestion` value across findings), dispatch the command once with the union of affected files. When Anti-Pattern findings within one run name different commands, dispatch each named command once, each with the union of files whose findings named it.
```

- [ ] **Step 3: Add `staged_suggestions` to the Output to caller contract**

Find this exact text:
```
## Output to caller

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
  ],
  "files_modified": [ "<path>", ... ],
  "decision_summary": "Dispatched 5 Impeccable commands on 3 files — auto-fit: polish; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold), delight (intent:delightful), animate (intent:delightful)."
}
```
```

Replace with:
```
## Output to caller

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "issue-driven", "trigger": "audit:anti-pattern" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
  ],
  "staged_suggestions": [
    { "command": "/impeccable:impeccable overdrive", "files": ["..."], "trigger": "audit:anti-pattern" }
  ],
  "files_modified": [ "<path>", ... ],
  "decision_summary": "Dispatched 6 Impeccable commands on 3 files — auto-fit: polish; issue-driven: typeset (audit:typography), bolder (audit:anti-pattern); intent-driven: bolder (intent:bold), delight (intent:delightful), animate (intent:delightful)."
}
```

`staged_suggestions` is an array with the same per-entry shape as `commands_invoked` minus `category` (staged entries never ran, so a dispatch category doesn't apply) — omit the field entirely when empty, same convention as `decision_summary`.
```

- [ ] **Step 4: Verify**

```bash
grep -c "Anti-Pattern dispatch" skills/design-wrapper/command-map.md
```
Expected output: `1`

```bash
grep -c "staged_suggestions" skills/design-wrapper/modes/polish.md
```
Expected output: `3` (Step 5 prose, Output-to-caller JSON example, and the schema-note sentence)

```bash
grep -c "anti-pattern\`, \`ai slop\`, \`ai-generated\`, \`generic\`" skills/design-wrapper/command-map.md skills/design-wrapper/modes/polish.md
```
Expected: two lines, each with a count ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/command-map.md skills/design-wrapper/modes/polish.md
git commit -m "$(cat <<'EOF'
Dispatch audit's Anti-Pattern findings automatically in /flow polish

audit already scores an "Anti-Patterns (CRITICAL)" dimension — the
"does this look AI-generated" check — and already names a best-fit
remediation command per finding via its own `suggestion` field. The
issue-driven dispatch table never read that signal. Adds a
suggestion-driven category (not a fixed command, since audit already
picks bolder/delight/typeset/etc. per finding) with a whitelist
filter so the three manual-only commands (colorize/extract/overdrive)
stage instead of auto-dispatching. No new interactive surface — this
is a same-shape addition to a table /flow already dispatches
unconditionally under auto mode.
EOF
)"
```

---

### Task 3: Creative Opportunities apply-gate (cross-cutting)

**Files:**
- Modify: `skills/visual-review/SKILL.md`

**Interfaces:**
- Consumes: Task 1's rename.
- Produces: the "apply-gate" pattern and its ending sentence ("no further action — the report stands as rendered") that Task 6 anchors its own new Step 5 on.

- [ ] **Step 1: Rewrite Step 4's return-handling table and block template with the apply-gate**

Find this exact text:
```
Handle the wrapper's return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` with non-empty list | Render the Creative Opportunities block (template below) appended to the review report. |
| `{result: "ok", recommendations: []}` | Omit the block entirely — no opportunities surfaced is a valid outcome, not a failure. |
| `{skipped: ...}` | Omit the block. Note the skip reason inline only when it would surprise the user (e.g., "Creative survey skipped — Impeccable plugin not installed"). |

### Creative Opportunities block template

```markdown
### Creative Opportunities (from /visual-review)

| Page | Observation | Suggested command |
|------|------------|-------------------|
| /pricing | Hero feels generic — pure black on white, no personality | `/impeccable:impeccable bolder pricing` |
| /empty-cart | Empty state shows only "No items" text | `/impeccable:impeccable delight empty-cart` |

> These are recommendations only. Run any command manually if you want to apply it.
```

When the wrapper reports `suppressed > 0` in its return, append a small note below the table: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design-wrapper reset-recommendations <spec>.`
```

Replace with:
```
Handle the wrapper's return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` with non-empty list, `$PIPELINE_RUN_DIR` set | Render the Creative Opportunities block (template below) appended to the review report — recommendations-only, unchanged from prior behavior. The parent pipeline owns any further decision. |
| `{result: "ok", recommendations: [...]}` with non-empty list, no `$PIPELINE_RUN_DIR` (standalone) | Render the Creative Opportunities block (template below), then the apply-gate (see "Applying a recommendation" below). |
| `{result: "ok", recommendations: []}` | Omit the block entirely — no opportunities surfaced is a valid outcome, not a failure. |
| `{skipped: ...}` | Omit the block. Note the skip reason inline only when it would surprise the user (e.g., "Creative survey skipped — Impeccable plugin not installed"). |

### Creative Opportunities block template

```markdown
### Creative Opportunities (from /visual-review)

| # | Page | Observation | Suggested command |
|---|------|------------|-------------------|
| 1 | /pricing | Hero feels generic — pure black on white, no personality | `/impeccable:impeccable bolder pricing` |
| 2 | /empty-cart | Empty state shows only "No items" text | `/impeccable:impeccable delight empty-cart` |
```

When the wrapper reports `suppressed > 0` in its return, append a small note below the table: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design-wrapper reset-recommendations <spec>.`

### Applying a recommendation (standalone only)

When running standalone (no `$PIPELINE_RUN_DIR`), the block above is never the final word — follow it with the standard apply-all/override gate. Call `AskUserQuestion` with `question`: `"Apply any of these?"`, `header`: `"Creative Opportunities"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Run every suggested command above against its listed page"`
- Option 2 — `label`: `"Choose individually"`, `description`: `"Pick which suggestions to apply"`
- Option 3 — `label`: `"None — just the report"`, `description`: `"Leave the report as-is, apply nothing"`

If "Choose individually," ask which row numbers to apply as a follow-up free-text prompt (the table above is already numbered for this — no per-row `AskUserQuestion` needed).

For every accepted row, invoke its `Suggested command` directly via the Skill tool (e.g. `/impeccable:impeccable bolder pricing`) — the same low-level invocation `design-wrapper`'s own modes perform internally; no new wrapper mode is needed since `survey`'s own precondition check already confirmed Impeccable is available before producing this recommendation. After all accepted commands run, re-verify: invoke `/claude-tweaks:test skip-qa` and report the result. If re-verification fails, report the failure and name the most recently invoked command as the likely cause rather than reverting automatically — reverting is the user's call.

When "None," no further action — the report stands as rendered.
```

- [ ] **Step 2: Update the Anti-Patterns table row**

Find this exact text:
```
| Auto-running commands suggested by the Creative Opportunities block | The block is recommendations only. The user invokes any command manually. /visual-review never executes Impeccable creative commands directly. |
```

Replace with:
```
| Silently auto-applying a Creative Opportunities suggestion without the apply-gate | The block is recommendations only until the user explicitly accepts via the apply-gate (standalone mode) or takes it away to run manually (parent-invoked mode). /visual-review never executes an Impeccable creative command without that explicit accept. |
```

- [ ] **Step 3: Verify**

```bash
grep -c "Applying a recommendation" skills/visual-review/SKILL.md
```
Expected output: `1`

```bash
grep -c "the report stands as rendered" skills/visual-review/SKILL.md
```
Expected output: `1`

```bash
grep -c "Auto-running commands suggested by the Creative Opportunities block" skills/visual-review/SKILL.md
```
Expected output: `0`

- [ ] **Step 4: Commit**

```bash
git add skills/visual-review/SKILL.md
git commit -m "$(cat <<'EOF'
Give Creative Opportunities a real apply-gate in standalone /visual-review

The block previously rendered as inert markdown — a house-style gap,
since every other multi-item recommendation in this plugin ends in a
batch apply-all/override gate. Standalone (no $PIPELINE_RUN_DIR)
invocations now follow the block with the standard gate; accepting a
row invokes its suggested command directly and re-verifies.
Parent-invoked (/flow) behavior is unchanged — recommendations still
flow to the Wrap-Up Review Console.
EOF
)"
```

---

### Task 4: Add `live` mode to `design-wrapper`

**Files:**
- Create: `skills/design-wrapper/modes/live.md`
- Modify: `skills/design-wrapper/SKILL.md`
- Modify: `skills/_shared/design-wrapper-handling.md`

**Interfaces:**
- Consumes: Task 1's rename.
- Produces: `claude-tweaks:design-wrapper live <target>` — invoked by Task 5 (`/specify` shape-time) and Task 6 (`/visual-review` boost). Returns `{mode: "live", result: "ok", session: "completed"}` or `{mode: "live", skipped: {...}}`.

- [ ] **Step 1: Create `modes/live.md`**

```markdown
# Design Mode — live

Invoked via `/claude-tweaks:design-wrapper live <target>`. Returns `{mode, result: "ok", session: "completed"}` or `{mode, skipped, ...}` to caller. **Interactive-only — has no auto-mode branch.**

## When this runs

Called by `/claude-tweaks:specify` (shape-time throwaway-scaffold exploration) and `/claude-tweaks:visual-review` (standalone Boost gate, "Explore alternatives"). Both callers are already gated to interactive, no-`$PIPELINE_RUN_DIR` contexts before reaching this mode — this mode performs no additional mode-gating of its own.

`<target>` is a URL: either an ephemeral scaffold server (`/specify`'s caller) or the already-running app under review (`/visual-review`'s caller).

## Preconditions

Run the universal preconditions from `../SKILL.md` (Layers 1+3 — Layer 2 does not apply, same as `shape` mode, since a `live` session isn't necessarily tied to one spec — and availability for the Impeccable plugin, extended per Step 2 below).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object.

### Step 2: Availability check (live-specific)

In addition to the standard `/impeccable:impeccable*` skill-resolution check, live mode depends on scripts under `.claude/skills/impeccable/scripts/` (`live.mjs` et al.) shipping with the installed Impeccable plugin version. If `/impeccable:impeccable*` resolves at all, treat these scripts as present — they ship together as one plugin release; there is no separate installation step to check.

### Step 3: Hand off to live mode

Invoke via the Skill tool: `/impeccable:impeccable live`, passing `<target>` as the page to open (per `live.md`'s own "Navigate to the URL that serves `pageFile`" contract). Follow `live.md`'s own procedure verbatim — boot, poll loop, generate/accept/discard/exit handling. This wrapper does not reimplement any of live mode's mechanics; it only gates whether the mode is reachable at all, matching every other mode's role in this skill.

### Step 4: Return

When the session ends (user says "stop"/"exit live", closes the tab, or the poll returns `exit` and cleanup completes): return `{mode: "live", result: "ok", session: "completed"}`. There is no "declined" return from this mode — the caller's own front-door-confirm gate is what decides whether to invoke this mode at all; once invoked, the mode always runs to a real session.

## Output to caller

```json
{
  "mode": "live",
  "result": "ok",
  "session": "completed"
}
```
```

- [ ] **Step 2: Register `live` as a seventh active mode in `SKILL.md`**

Find this exact text:
```
All six modes are active (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`) plus the `reset-recommendations` cache utility.
```

Replace with:
```
All seven modes are active (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`, `live`) plus the `reset-recommendations` cache utility.
```

- [ ] **Step 3: Add `live` to the When to Use list**

Find this exact text:
```
- A user runs `/claude-tweaks:design-wrapper <mode> <target>` directly to invoke a single mode without going through the lifecycle skill
- A user runs `/claude-tweaks:design-wrapper reset-recommendations <spec>` to clear declined-recommendation tracking for a spec
```

Replace with:
```
- `/claude-tweaks:specify` invokes `live` mode against a throwaway shape-time scaffold, for the user to compare real variants before a spec is decomposed
- `/claude-tweaks:visual-review` invokes `live` mode (standalone Boost gate only) against the already-running app, for open-ended alternative exploration
- A user runs `/claude-tweaks:design-wrapper <mode> <target>` directly to invoke a single mode without going through the lifecycle skill
- A user runs `/claude-tweaks:design-wrapper reset-recommendations <spec>` to clear declined-recommendation tracking for a spec
```

- [ ] **Step 4: Add `live` to the Input table**

Find this exact text:
```
| `reset-recommendations <spec>` | Spec number or path | Deletes the declined-recommendations cache for the spec; the next `survey` call surfaces all matching recommendations again |
```

Replace with:
```
| `reset-recommendations <spec>` | Spec number or path | Deletes the declined-recommendations cache for the spec; the next `survey` call surfaces all matching recommendations again |
| `live <target>` | URL — an ephemeral scaffold server or an already-running app | Invokes `/impeccable:impeccable live` against the target. Interactive-only, no auto-mode branch — a human must be present in a browser |
```

- [ ] **Step 5: Add `live` to Universal preconditions mode-specific notes**

Find this exact text:
```
- `shape` runs preconditions but skips Layer 2 — there is no spec yet (the caller is `/specify` working on a design doc, not a numbered spec). Layer 1 + availability still apply.
```

Replace with:
```
- `shape` runs preconditions but skips Layer 2 — there is no spec yet (the caller is `/specify` working on a design doc, not a numbered spec). Layer 1 + availability still apply.
- `live` runs preconditions but skips Layer 2, same as `shape` — a live session isn't necessarily tied to one spec. Layer 1 + Layer 3 (file-extension sniff against `<target>`, when resolvable — a bare URL with no visible extension is treated as frontend by default, since `live` is never invoked on a non-frontend target by either of its two callers) + availability still apply.
```

- [ ] **Step 6: Add `live` to the Availability check table**

Find this exact text:
```
| `polish` | Impeccable plugin (LLM commands) | Same as `review` — `polish`/`clarify`/`harden` and the issue-driven commands all live in the plugin. |
```

Replace with:
```
| `polish` | Impeccable plugin (LLM commands) | Same as `review` — `polish`/`clarify`/`harden` and the issue-driven commands all live in the plugin. |
| `live` | Impeccable plugin (LLM commands + bundled live-mode scripts) | Same as `review` — checks for `/impeccable:impeccable*` skill resolution. The live-mode scripts ship with the plugin itself, so no separate check is needed. |
```

- [ ] **Step 7: Add the `live` mode behavior section**

Find this exact text:
```
### Mode: `reset-recommendations <spec>` — Active utility
```

Replace with:
```
### Mode: `live <target>` — Active

Interactive-only. Invokes `/impeccable:impeccable live`, handing control to the user's own browser session (element picker, three-variant generation with live parameter tuning, accept-to-source). Has no auto-mode branch — callers must only reach this mode when a human is present; both current callers (`/specify` and standalone `/visual-review`) already gate to interactive-only before invoking it. Read `modes/live.md` in this skill's directory for the full procedure.

### Mode: `reset-recommendations <spec>` — Active utility
```

- [ ] **Step 8: Add `live` to the Reference sub-files list**

Find this exact text:
```
- `modes/{name}.md` — One file per mode (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`), plus a procedure file for the `reset-recommendations` cache utility. Per-mode full procedure (steps, decision rules, output format).
```

Replace with:
```
- `modes/{name}.md` — One file per mode (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`, `live`), plus a procedure file for the `reset-recommendations` cache utility. Per-mode full procedure (steps, decision rules, output format).
```

- [ ] **Step 9: Add `live` to the Next Actions return-shape table**

Find this exact text:
```
| `reset-recommendations` ok | Re-run `/claude-tweaks:flow {spec}` or `/claude-tweaks:visual-review` — survey will re-surface |
```

Replace with:
```
| `reset-recommendations` ok | Re-run `/claude-tweaks:flow {spec}` or `/claude-tweaks:visual-review` — survey will re-surface |
| `live` ok (`session: "completed"`) | If a variant was accepted, `/claude-tweaks:test` — re-verify the change |
```

- [ ] **Step 10: Note the interactive-only exception in Anti-Patterns**

Find this exact text:
```
| Reading `pre-build` context as a hard gate | Lazy-loaded references are *enrichment* for the build subagent. Skipping (no Impeccable installed, non-frontend) must not block the build. |
```

Replace with:
```
| Reading `pre-build` context as a hard gate | Lazy-loaded references are *enrichment* for the build subagent. Skipping (no Impeccable installed, non-frontend) must not block the build. |
| Invoking `live` mode from an auto-mode or `$PIPELINE_RUN_DIR`-set context | `live` requires a human physically in a browser — it has no non-interactive path. Both current callers already restrict themselves to interactive, standalone invocation before reaching this mode; a future caller must do the same. |
```

- [ ] **Step 11: Note `live`'s interactive-only nature in `_shared/design-wrapper-handling.md`**

Find this exact text:
```
## Why only `survey` mode is ever deferred

`survey` is the one mode that can stage a creative-opportunities decision rather than acting immediately. Other modes (`pre-build`, `test`, `review`, `polish`, `shape`, `reset-recommendations`) either run or skip — they do not defer. If a caller receives `{deferred: ...}` from a non-survey mode, that is a wrapper bug; treat as skip and proceed (the wrapper will log it for follow-up).
```

Replace with:
```
## Why only `survey` mode is ever deferred

`survey` is the one mode that can stage a creative-opportunities decision rather than acting immediately. Other modes (`pre-build`, `test`, `review`, `polish`, `shape`, `live`, `reset-recommendations`) either run or skip — they do not defer. If a caller receives `{deferred: ...}` from a non-survey mode, that is a wrapper bug; treat as skip and proceed (the wrapper will log it for follow-up).

## Why `live` mode has no auto-mode branch

Every other mode either runs deterministically or degrades to a skip under `auto`. `live` cannot — it hands control to a human clicking in their own browser, which structurally requires a human to be present. Callers must gate invocation to interactive, standalone contexts themselves; the wrapper's own preconditions do not (and cannot) enforce this, since "is a human present" isn't a signal the wrapper can check.
```

- [ ] **Step 12: Verify**

```bash
grep -c "^### Mode: \`live <target>\`" skills/design-wrapper/SKILL.md
```
Expected output: `1`

```bash
test -f skills/design-wrapper/modes/live.md && echo OK
```
Expected output: `OK`

```bash
grep -c "All seven modes are active" skills/design-wrapper/SKILL.md
```
Expected output: `1`

- [ ] **Step 13: Commit**

```bash
git add skills/design-wrapper/modes/live.md skills/design-wrapper/SKILL.md skills/_shared/design-wrapper-handling.md
git commit -m "$(cat <<'EOF'
Add live mode to design-wrapper

Thin availability-checked dispatcher to /impeccable:impeccable live —
Impeccable's existing non-image-gen variant tool (element picker,
three real HTML/CSS variants with live parameter tuning, accept to
source). Has no auto-mode branch by construction: live mode requires
a human physically clicking in a browser. Not yet called by anything —
Tasks 5 and 6 wire up its two callers.
EOF
)"
```

---

### Task 5: `/specify` shape-time throwaway scaffold + `live`-mode handoff

**Files:**
- Modify: `skills/specify/design-pre-steps.md`
- Modify: `skills/specify/spec-template.md`
- Modify: `skills/build/design-prebuild.md`
- Modify: `skills/design-wrapper/SKILL.md`

**Interfaces:**
- Consumes: Task 4's `live` mode (`claude-tweaks:design-wrapper live <target>`); `_shared/dev-url-detection.md`'s "Ephemeral server start" and "Cleanup — Standalone" procedures (unmodified, read-only reference).
- Produces: the updated `/claude-tweaks:specify` row in `design-wrapper/SKILL.md`'s Relationship table — the bidirectional counterpart Task 6 Step 4 already adds for `/claude-tweaks:visual-review`.
- Produces: the `Visual-reference:` body-metadata line, written onto generated leaf records, consumed by `skills/build/design-prebuild.md`.

- [ ] **Step 1: Add Step 2.5b-ii (variant exploration) to `design-pre-steps.md`**

Find this exact text:
```
On `{skipped}` (Impeccable not installed, design integration disabled): note the skip and proceed to Step 2.5c.

## Step 2.5c: Design-intent question (frontend only)
```

Replace with:
```
On `{skipped}` (Impeccable not installed, design integration disabled): note the skip and proceed to Step 2.5c.

## Step 2.5b-ii: Variant exploration (interactive only, shape confirmed)

Runs only when Step 2.5b's shape pre-step actually produced a confirmed brief (option 1 was taken and Impeccable's own brief-confirmation exchange completed) — skip entirely if Step 2.5b was skipped, auto-ran, or returned `{skipped}`. **No auto-mode branch** — this step requires a human in a browser by construction (same reason `/impeccable:impeccable live` itself has no non-interactive mode); auto-mode design docs proceed straight from the text brief.

Offer once, as its own message:

> Want to compare a few real variants of {primary surface, from the brief's "Primary User Action"} before I build it for real? I'll put together a quick throwaway version and let you pick a direction in the browser.
>
> 1. Yes — build a scaffold and open live mode **(Recommended)**
> 2. Skip — proceed to decomposition from the text brief only

On option 2, or if the user doesn't respond affirmatively: proceed to Step 2.5c with no further action.

On option 1:

1. **Generate the scaffold.** Write a minimal, disposable static HTML file implementing the brief's primary surface — realistic placeholder content per the brief's "Key States" and "Content Requirements" sections, no real data wiring, no routing, no framework integration, no test coverage. Save it to `docs/plans/YYYY-MM-DD-{feature}-shape-scaffold.html` (same co-location convention as the audit/recommendations/declined caches).
2. **Serve it.** Follow `_shared/dev-url-detection.md`'s "Ephemeral server start" procedure to serve the scaffold's containing directory on a free port. Set `SCAFFOLD_URL = http://localhost:{free-port}/{scaffold-filename}`.
3. **Hand off to live mode.** Invoke `/claude-tweaks:design-wrapper live <SCAFFOLD_URL>` via the Skill tool. The human explores variants, tunes parameters, and accepts a direction — or exits without accepting, which is treated as a skip: proceed to Step 2.5c with no `Visual-reference:` line.
4. **Stop the ephemeral server** per `_shared/dev-url-detection.md`'s "Cleanup" — Standalone rule (no pipeline run dir exists yet at this point in `/specify`'s flow).
5. **Record the reference.** If a variant was accepted, note the scaffold's path for Step 3 (decomposition mode's own compose-then-write-once step) to write as a new `Visual-reference: docs/plans/YYYY-MM-DD-{feature}-shape-scaffold.html` body-metadata line, alongside `Surface:` and `Design-intent:`, on every generated leaf record covering this surface. Step 2.5b-ii never runs in Shaping mode — Step 2.5b itself is decomposition-mode only, per this file's opening note — so there is no Shaping-mode counterpart to wire up here.

## Step 2.5c: Design-intent question (frontend only)
```

- [ ] **Step 2: Update the file's opening description**

Find this exact text:
```
These pre-steps capture design context (`shape`) and creative direction (`Design-intent:`) so the resulting records carry both forward to `/build` and `/flow`'s polish phase as body-metadata lines.
```

Replace with:
```
These pre-steps capture design context (`shape`), an optional accepted visual direction (`Visual-reference:`), and creative direction (`Design-intent:`) so the resulting records carry all three forward to `/build` and `/flow`'s polish phase as body-metadata lines.
```

- [ ] **Step 3: Add `Visual-reference:` to the body-metadata block in `spec-template.md`**

Find this exact text:
```
Surface: {web | mobile | desktop | backend | infra}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Parent: {#N — decomposition-mode leaves under work-links: body-text only; omitted otherwise (native links, work-backend: local-files, and Shaping mode)}
```

Replace with:
```
Surface: {web | mobile | desktop | backend | infra}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Visual-reference: {path to an accepted shape-time scaffold file — omitted when /specify's Step 2.5b-ii variant-exploration step was skipped, declined, or not offered (non-frontend records)}
Parent: {#N — decomposition-mode leaves under work-links: body-text only; omitted otherwise (native links, work-backend: local-files, and Shaping mode)}
```

- [ ] **Step 4: Update the explanatory paragraph above the metadata block**

Find this exact text:
```
Every record body opens with a short metadata block — plain body-metadata lines, never YAML frontmatter. `Surface:` and `Design-intent:` are lifted verbatim into the materialized header by `/flow`/`/build` at build time (spec 20's contract).
```

Replace with:
```
Every record body opens with a short metadata block — plain body-metadata lines, never YAML frontmatter. `Surface:`, `Design-intent:`, and `Visual-reference:` (when present) are lifted verbatim into the materialized header by `/flow`/`/build` at build time (spec 20's contract).
```

- [ ] **Step 5: Load the scaffold in `design-prebuild.md`**

Find this exact text:
```
## Result handling
```

Replace with:
```
## Visual-reference scaffold (when present)

When the resolved record/spec carries a `Visual-reference:` body-metadata line (written by `/specify` Step 2.5b-ii — see `specify/design-pre-steps.md`), read that scaffold file directly (it is a small, already-committed static HTML file) and include its full contents in the implementer subagent's prompt as the concrete, already-selected visual direction — in addition to, not instead of, the loaded Impeccable references and the text brief. Frame it explicitly: "This is the accepted visual direction from shape-time exploration — port its structure, hierarchy, and visual treatment into the real component architecture; it is a north star, not a screenshot to trace verbatim (real data wiring, routing, accessibility semantics, and framework conventions still need to be built properly)." Absence of `Visual-reference:` is normal (most records won't have one) — proceed exactly as today.

## Result handling
```

- [ ] **Step 6: Update the `/claude-tweaks:specify` Relationship row in `design-wrapper/SKILL.md`**

Task 6 (later in this plan) adds `live` mode to the `/claude-tweaks:visual-review` Relationship row for its own new caller relationship — this step is the same update for `/claude-tweaks:specify`, which this task just gave the equivalent capability.

Find this exact text:
```
| `/claude-tweaks:specify` | Invokes `shape` mode as a pre-decomposition step on frontend design docs. Also asks the design-intent question and writes `Surface:` + `Design-intent:` body-metadata lines on every generated leaf record — lifted into the materialized header (spec 20) that `polish` mode reads for intent-driven dispatch. The full pre-step procedure lives in `specify/design-pre-steps.md`. |
```

Replace with:
```
| `/claude-tweaks:specify` | Invokes `shape` mode as a pre-decomposition step on frontend design docs. Also asks the design-intent question and writes `Surface:` + `Design-intent:` body-metadata lines on every generated leaf record — lifted into the materialized header (spec 20) that `polish` mode reads for intent-driven dispatch. When the shape brief is confirmed, may also invoke `live` mode (Step 2.5b-ii) against a throwaway scaffold and write an accepted direction's path as a `Visual-reference:` body-metadata line. The full pre-step procedure lives in `specify/design-pre-steps.md`. |
```

- [ ] **Step 7: Verify**

```bash
grep -c "^## Step 2.5b-ii: Variant exploration" skills/specify/design-pre-steps.md
```
Expected output: `1`

```bash
grep -c "Visual-reference:" skills/specify/spec-template.md skills/specify/design-pre-steps.md skills/build/design-prebuild.md
```
Expected: each file's count ≥ 1.

```bash
grep -c "Step 2.5b-ii" skills/design-wrapper/SKILL.md
```
Expected output: `1`

- [ ] **Step 8: Commit**

```bash
git add skills/specify/design-pre-steps.md skills/specify/spec-template.md skills/build/design-prebuild.md skills/design-wrapper/SKILL.md
git commit -m "$(cat <<'EOF'
Add shape-time throwaway-scaffold + live-mode variant exploration

Between shape's confirmed text brief and decomposition, /specify can
now build a cheap disposable scaffold of the primary surface, serve
it on an ephemeral port, and hand off to design-wrapper's new live
mode for the user to compare real axis-based variants and accept a
direction — before the real /build ever starts. The accepted scaffold
carries forward as a new Visual-reference: body-metadata line, which
/build's pre-build step now loads into the implementer subagent
alongside the text brief. Interactive-only, front-door-confirmed,
no auto-mode branch. Also updates design-wrapper/SKILL.md's
/claude-tweaks:specify Relationship row — the bidirectional
counterpart of the /claude-tweaks:visual-review row Task 6 updates
for its own new live-mode caller relationship.
EOF
)"
```

---

### Task 6: Standalone `/visual-review` boost gate

**Files:**
- Modify: `skills/visual-review/SKILL.md`

**Interfaces:**
- Consumes: Task 3's apply-gate text (anchor: "no further action — the report stands as rendered"); Task 4's `live` mode; the existing `review` mode (unmodified, already exists).

- [ ] **Step 1: Add Step 5 (Boost) after Step 4's apply-gate**

Find this exact text:
```
When "None," no further action — the report stands as rendered.

## Next Actions
```

Replace with:
```
When "None," no further action — the report stands as rendered.

## Step 5: Boost (standalone only)

Runs only when `/visual-review` is standalone and interactive — no `$PIPELINE_RUN_DIR` set (same signal Step 4 and the Component-Skill Contract already use). When parent-invoked, this step does not apply; behavior is unchanged.

After Step 4's Creative Opportunities block (and any apply-gate action from it) completes, offer once, as its own message:

> Want me to go further?
>
> 1. Fix flagged issues **(Recommended)**
> 2. Explore alternatives
> 3. Both
> 4. No thanks, just the report

**Option 1 or 3 — Fix flagged issues:**

1. Invoke `/claude-tweaks:design-wrapper review` via the Skill tool with no explicit target — the wrapper's `review` mode documents its target as a spec number or path, not a file list, and always resolves scope itself: an active spec's file list intersected with `git diff --name-only`, or a full-diff fallback filtered to frontend paths (see `design-wrapper/modes/review.md` Step 2). This means Fix path's scope tracks the current uncommitted diff, not necessarily every page walked in this browser session — if the two differ noticeably, note that in the report.
2. The wrapper runs `critique` + `audit` and returns `{result: "advisory", findings: [...], score_trend: {...}}`. Render the findings as a batch table:

   ```
   | # | Source | File | Category | Severity | Message | Recommended |
   |---|--------|------|----------|----------|---------|-------------|
   | 1 | {source} | {file} | {category} | {severity} | {message} | {Fix\|Skip} |
   ```

   Pre-fill Recommended: `severity: error` or `severity: warning` → `"Fix"`; `severity: info` → `"Skip"`.
3. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Fix each finding marked Fix above"`
   - Option 2 — `label`: `"Choose individually"`, `description`: `"Pick which findings to fix"`
   - Option 3 — `label`: `"Skip fixes"`, `description`: `"Leave the code as-is"`
4. For each accepted finding, invoke its `suggestion`-named Impeccable command directly via the Skill tool against the finding's `file` (same direct-invocation approach as Step 4's apply-gate). Group findings that share the same file and suggested command into one invocation.
5. If any command ran, re-verify: invoke `/claude-tweaks:test skip-qa` and report the result inline. A re-verify failure is reported, not silently swallowed — name the most recently applied command as the likely cause; do not auto-revert.

**Option 2 or 3 — Explore alternatives:**

Invoke `/claude-tweaks:design-wrapper live <APP_URL>` via the Skill tool, targeting the already-running app (the `APP_URL` resolved back in Step 2). The human explores alternatives directly in their browser; this skill does not process the outcome further — `live` mode's own accept flow already writes any accepted change to source. After the live session ends, note in the report that a live-mode session ran and mention re-running `/claude-tweaks:test` if changes were accepted.

**Option 4:** No further action.

## Next Actions
```

- [ ] **Step 2: Document the code-modifying exception in the Component-Skill Contract**

Find this exact text:
```
This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 6) in `full` mode and by `/claude-tweaks:init` (Phase 8) for brownfield journey discovery. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.
```

Replace with:
```
This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 6) in `full` mode and by `/claude-tweaks:init` (Phase 8) for brownfield journey discovery. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.

**Code-modifying exception.** `/visual-review` is otherwise read-only with respect to code. Two specific, standalone-only, always-consent-gated paths modify code: Step 4's Creative Opportunities apply-gate, and Step 5's Boost gate (Fix option). Both re-verify afterward via `/claude-tweaks:test skip-qa`. Parent-invoked `/visual-review` (`$PIPELINE_RUN_DIR` set) never modifies code — Steps 4 and 5's apply/boost paths do not run in that context.
```

- [ ] **Step 3: Extend the design-wrapper Relationship row in `visual-review/SKILL.md`**

Find this exact text:
```
| `/claude-tweaks:design-wrapper` | After the review report is assembled, /visual-review invokes `/claude-tweaks:design-wrapper survey` with the captured screenshot paths and renders the resulting Creative Opportunities block in the report (anchor 2 of v4.5.0's creative surfacing system). The wrapper handles its own detection (non-frontend skips); the block is omitted when the wrapper returns no recommendations. |
```

Replace with:
```
| `/claude-tweaks:design-wrapper` | After the review report is assembled, /visual-review invokes `/claude-tweaks:design-wrapper survey` with the captured screenshot paths and renders the resulting Creative Opportunities block in the report (anchor 2 of v4.5.0's creative surfacing system). The wrapper handles its own detection (non-frontend skips); the block is omitted when the wrapper returns no recommendations. Standalone-only, the Step 5 Boost gate additionally invokes `review` mode (Fix flagged issues, which re-verifies via `/claude-tweaks:test skip-qa` after applying) and `live` mode (Explore alternatives, which notes in the report that re-running `/claude-tweaks:test` may be worth it if changes were accepted, rather than re-verifying itself) — both consent-gated. |
```

- [ ] **Step 4: Add the reciprocal row in `design-wrapper/SKILL.md`**

Find this exact text:
```
| `/claude-tweaks:visual-review` | Invokes `survey` mode after browser review steps complete, passing screenshot paths via `--screenshots`. Renders the Creative Opportunities block in the visual review report. |
```

Replace with:
```
| `/claude-tweaks:visual-review` | Invokes `survey` mode after browser review steps complete, passing screenshot paths via `--screenshots`. Renders the Creative Opportunities block in the visual review report. Standalone-only (no `$PIPELINE_RUN_DIR`), its Step 5 Boost gate also invokes `review` mode (Fix flagged issues) and `live` mode (Explore alternatives). |
```

- [ ] **Step 5: Verify**

```bash
grep -c "^## Step 5: Boost (standalone only)" skills/visual-review/SKILL.md
```
Expected output: `1`

```bash
grep -c "Code-modifying exception" skills/visual-review/SKILL.md
```
Expected output: `1`

```bash
grep -c "Step 5 Boost gate" skills/visual-review/SKILL.md skills/design-wrapper/SKILL.md
```
Expected: both files' counts ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add skills/visual-review/SKILL.md skills/design-wrapper/SKILL.md
git commit -m "$(cat <<'EOF'
Add opt-in Boost gate to standalone /visual-review

New Step 5, standalone-only (no $PIPELINE_RUN_DIR): offers to run
critique+audit and apply flagged fixes with consent (Fix flagged
issues), and/or hand off to design-wrapper's live mode against the
already-running app (Explore alternatives). Documents the resulting
code-modifying exception to /visual-review's otherwise read-only
contract, and updates the bidirectional Relationship rows with
design-wrapper.
EOF
)"
```

---

### Task 7: Final verification sweep

**Files:**
- None (read-only verification across all files touched by Tasks 1–6)

**Interfaces:**
- Consumes: the final state of all files modified in Tasks 1–6.

- [ ] **Step 1: Confirm no stale skill name survives anywhere live**

```bash
grep -rn 'claude-tweaks:design\b' --include='*.md' skills/ CLAUDE.md README.md 2>/dev/null | grep -v 'design-wrapper'
```
Expected output: empty.

```bash
grep -rn '/design\b' --include='*.md' skills/ CLAUDE.md README.md 2>/dev/null | grep -v 'design-wrapper\|design-intent\|design-integration\|design-pre-steps\|DESIGN\.md\|design doc'
```
Expected output: empty.

- [ ] **Step 2: Confirm the manual-only commands never appear as an auto-dispatched target**

```bash
grep -n 'colorize\|extract\|overdrive' skills/design-wrapper/modes/polish.md
```
Expected output: only lines describing the whitelist filter / staging behavior (no line dispatching one of these three directly without a staging qualifier nearby).

- [ ] **Step 3: Confirm `live` mode is referenced by exactly its two intended callers, not from any auto-mode-only path**

```bash
grep -rln 'design-wrapper live' --include='*.md' skills/ 2>/dev/null | sort
```
Expected output exactly:
```
skills/design-wrapper/SKILL.md
skills/specify/design-pre-steps.md
skills/visual-review/SKILL.md
```

- [ ] **Step 4: Confirm the full test suite is unaffected**

```bash
npm test 2>&1 | tail -10
```
Expected output: `# pass 1246` and `# fail 0` — identical to the worktree baseline captured before any task ran.

- [ ] **Step 5: Confirm every Relationship-table edit is bidirectional**

```bash
grep -c "design-wrapper" skills/visual-review/SKILL.md
grep -c "visual-review" skills/design-wrapper/SKILL.md
```
Expected output: both counts non-zero (exact numbers not asserted — both files reference the other from multiple places by this point in the plan).

- [ ] **Step 6: Final commit-count sanity check**

```bash
git log --oneline worktree-design-wrapper-visual-boost -10
```
Expected output: 6 commits from Tasks 1–6 (rename, Anti-Pattern dispatch, apply-gate, live mode, shape-scaffold, boost gate) plus the two design-doc commits from the brainstorming phase, in that order (newest first).

No commit needed for this task — it's read-only verification. If any check in Steps 1–5 fails, stop and fix the specific file before considering the plan complete.
