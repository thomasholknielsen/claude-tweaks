# Decisions pushback routing (#599) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the two kinds of craft-critic findings #598's Step 3.8 produces: `target: code` findings enter the polish cache (`source: "craft-critic"`) and are inlined into polish's refinement-set dispatch prompts as "Known craft issues" context; `target: decisions` findings never enter the cache — in a pipeline run they are staged to `{run-dir}/staged/design-decision-*.md` with a provider-keyed `Remedy:` line, and in standalone `/review` they render under a **Decisions** sub-heading in the Design Quality section. The wrapper never writes `DESIGN.md`.

**Architecture:** Prose-procedure edits across six files: `modes/review.md` (Step 5 filter widened + cached entry shape; new Step 5.5 staging; `decisions_staged` in the return), `modes/polish.md` (Step 3 widened-cache note; a three-way consumption table; the "Known craft issues" block in Step 4's refinement dispatch; `decision_summary`'s `craft-context` clause; one Anti-Patterns row in a new small section), `flow/polish-execution.md` (one sentence), `review/SKILL.md` (Step 6.5 table note), `review/review-summary-template.md` (Source `critic:{provider}` + Decisions sub-heading), `design-wrapper/SKILL.md` (one Anti-Patterns row).

**Tech Stack:** Markdown; `node --test` conformance suites; SKILL.md byte ceiling 40 960 (now 39 535 — this record's SKILL.md addition must be ≤ 250 bytes so #601 keeps ~1 KB).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T160107-spec-597-595-598-599-601/spec-599/work/599-spec.md`

## Global Constraints

- Only these six files change: `skills/design-wrapper/modes/review.md`, `skills/design-wrapper/modes/polish.md`, `skills/design-wrapper/SKILL.md`, `skills/flow/polish-execution.md`, `skills/review/SKILL.md`, `skills/review/review-summary-template.md`.
- Step 3.8, the findings template, and `craft_critics` (#598) are untouched. No new command mapping. No `/tidy` `doctor` change. No write to `DESIGN.md`/sidecar anywhere; the only `document` mention in `review.md`/`polish.md` is inside the `Remedy:` string.
- The Step 5 filter line becomes exactly `source === "audit" || (source === "craft-critic" && target === "code")` and the sentence "never by \"everything that isn't critique.\"" stays.
- Remedy is provider-keyed only: `provider: wrapper` → `Remedy: /claude-tweaks:design-wrapper explore`; every other provider → `Remedy: /impeccable:impeccable document`. No message-text classification (the phrase `layout/composition` must not appear in `review.md`).
- Filenames: `design-decision-nudge.md` (fixed, overwritten) for `provider: wrapper`; `design-decision-{n}.md` otherwise (1-based per Step 5.5 invocation, content-deduped by `provider` + `file` + `message`).
- Polish: `craft-critic` findings never select a command, are never staged, never counted in `commands_invoked`; the "Known craft issues" block is a sibling of the assembled design-craft principles (authority rule intact); per-dispatch file filter; ≤ 15 rows highest severity first + `+N more`.
- Commit messages end `refs #599` (never `closes`/`fixes`). Work from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-597-595-598-599-601`; verify `pwd` + `git rev-parse --show-toplevel` before any edit or commit. No full `npm test` inside a task.

---

### Task 1: `modes/review.md` — Step 5 filter + cached shape, Step 5.5 staging, `decisions_staged` return

**Files:**
- Modify: `skills/design-wrapper/modes/review.md` — `### Step 5: Write audit findings cache for polish mode` (its opening paragraph, cache-shape JSON, and the `id`/`suggestion` bullets), a new `### Step 5.5: Stage decisions findings` section inserted immediately before `## Output to caller`, and the Output block (`"craft_critics"` line gains a trailing comma; new `"decisions_staged": 2` line; new paragraph after the `craft_critics` paragraph).

**Interfaces:**
- Consumes: Step 4's normalized `craft-critic` findings (`provider`, `target`, `file`, `severity`, `message`, `suggestion: null`) from #598.
- Produces: cache entries `{id: "craft-{provider}-{n}", source: "craft-critic", provider, target: "code", file, category: "craft", severity, message, suggestion: null}` (Task 2 consumes); staged files `design-decision-nudge.md` / `design-decision-{n}.md` (Task 3's console/summary text refers to them); return field `decisions_staged`.

- [ ] **Step 1: Widen Step 5's filter and cache shape**

In `### Step 5: Write audit findings cache for polish mode`, replace the opening paragraph

`Persist the **audit findings only** (not critique, not the finishing review) to a JSON file alongside the ledger. The widened \`source\` union from Step 4 deliberately stops here: \`polish\` mode dispatches a cached finding by the command its \`suggestion\` names, and a \`finish-review\` finding names none, so admitting one would only add an unclassified observation to the cache. Filter by \`source === "audit"\`, never by "everything that isn't critique."`

with

`Persist the **audit findings and the craft critics' \`code\` findings** (not critique, not the finishing review, not \`decisions\` findings) to a JSON file alongside the ledger. Filter by \`source === "audit" || (source === "craft-critic" && target === "code")\`, never by "everything that isn't critique." A \`finish-review\` finding names no command, so admitting one would only add an unclassified observation. A \`craft-critic\` \`code\` finding names no command either — it enters the cache as **context** for polish's refinement dispatch (\`modes/polish.md\`'s three-way consumption table), never as a dispatch key. A \`target: "decisions"\` finding is **excluded** on purpose: it challenges \`DESIGN.md\`, which is upstream-owned and which polish must never act on; Step 5.5 routes it to a human instead.`

Then replace the cache-shape JSON block

```json
{
  "spec": "<spec id or path>",
  "written_at": "<ISO timestamp>",
  "findings": [ { "id": "...", "source": "audit", "file": "...", "category": "...", "severity": "...", "message": "...", "suggestion": "..." }, ... ]
}
```

with

```json
{
  "spec": "<spec id or path>",
  "written_at": "<ISO timestamp>",
  "findings": [
    { "id": "audit-1", "source": "audit", "file": "...", "category": "...", "severity": "...", "message": "...", "suggestion": "..." },
    { "id": "craft-emil-design-eng-1", "source": "craft-critic", "provider": "emil-design-eng", "target": "code", "file": "...", "category": "craft", "severity": "...", "message": "...", "suggestion": null }
  ]
}
```

Then, in the `- **\`id\`** —` bullet, change `otherwise assign \`audit-{n}\` by position, 1-based.` to `otherwise assign \`audit-{n}\` by position, 1-based; a \`craft-critic\` entry gets \`craft-{provider}-{n}\`, 1-based per provider and **reset on every cache write** (the file is overwritten per invocation, so numbers never accumulate).`

- [ ] **Step 2: Insert Step 5.5**

Immediately before the line `## Output to caller`, insert (blank line before and after):

````markdown
### Step 5.5: Stage decisions findings (pipeline runs only)

Runs only when `$PIPELINE_RUN_DIR` is set. When it is unset (standalone `/claude-tweaks:review`), stage
nothing — the `decisions` findings render in the review summary's **Decisions** sub-heading instead
(`skills/review/review-summary-template.md`), and there is no run dir to stage into and no backlog
record auto-filed: a human reading a standalone review acts on the `Remedy:` line or not. Never
invent a mid-flow prompt for it.

For each `target: "decisions"` finding from Step 4 (never a `code` finding, never a critique/audit
finding), write one file to `{run-dir}/staged/` carrying: `Provider:`, `File:`, `Severity:`,
`Message:`, `Evidence:` (the table row's Evidence cell), and a `Remedy:` line.

**Filename and idempotency.**

- The wrapper's absence-nudge (`provider: wrapper`, Step 4) always writes
  `design-decision-nudge.md` — a fixed name, overwritten on every write. That is the nudge's whole
  de-duplication mechanism (per Step 4: once per review invocation, never accumulating; a project
  that does not want it says so once with `design-critique: off`).
- Every other `decisions` finding writes `design-decision-{n}.md`, `n` 1-based per Step 5.5
  invocation. Before allocating a number, look for an existing `design-decision-*.md` in this run
  dir with identical `Provider:` + `File:` + `Message:` — if one exists, overwrite it in place rather
  than allocating a new number (dedupe by content, so a re-review after polish's re-verify cycle never
  duplicates a finding).
- The `design-decision-` prefix is distinct from `polish-suggestion-{n}.md` by design; the Review
  Console reads every file under `staged/` generically.

**Remedy is mechanical, keyed on `provider` — never on message text:**

| `provider` | `Remedy:` line |
|---|---|
| `wrapper` | `Remedy: /claude-tweaks:design-wrapper explore` — no scope argument; the nudge means no direction is locked at all |
| any critic | `Remedy: /impeccable:impeccable document` — upstream's own `DESIGN.md` editor, the one command that can address silence or a weak decision on any sub-topic |

No classification of the finding's prose into a command. The remedy names an *upstream* (or wrapper)
command for a **human** to run; this mode never invokes either — the wrapper writes nothing outside
`docs/plans/`, and `DESIGN.md` stays upstream-owned under every condition.

Log one line per file written to `decisions.md`, per `../../_shared/auto-decision-log.md`:
`STAGED {time} — review Step 5.5: decisions finding from {provider} on {file} staged at staged/{filename}. Remedy: {remedy}. Surface at Review Console.`

The return gains `decisions_staged: <int>` — the number of files written this invocation — omitted
entirely when zero (see Output to caller).
````

- [ ] **Step 3: Output to caller**

In the Output JSON block, add a trailing comma to the `"craft_critics": [ … ]` line and add immediately after it:

```json
  "decisions_staged": 2
```

Then, immediately after the paragraph that begins `` `craft_critics` is built from Step 3.8 `` (and before the `` `design_contract` is built from Step 3.6 `` paragraph), insert:

```markdown
`decisions_staged` is built from Step 5.5 and is **omitted entirely** when that step wrote nothing —
standalone `/claude-tweaks:review` (no run dir), lever `off`, or no `target: "decisions"` finding
this invocation. When present it is the count of `staged/design-decision-*.md` files written (the
fixed-name nudge counts once); `/claude-tweaks:review` Step 6.5 reads it to say "staged for the
Review Console" versus "rendered below" in the Design Quality section.
```

- [ ] **Step 4: Verify**

```bash
grep -n 'source === "audit" || (source === "craft-critic" && target === "code")' skills/design-wrapper/modes/review.md
grep -n "everything that isn't critique" skills/design-wrapper/modes/review.md
grep -n "design-decision-nudge.md\|design-decision-{n}" skills/design-wrapper/modes/review.md | wc -l
grep -n "decisions_staged" skills/design-wrapper/modes/review.md | wc -l
grep -n "Remedy:" skills/design-wrapper/modes/review.md | wc -l
grep -n "layout/composition\|design\.critique\|declined" skills/design-wrapper/modes/review.md
grep -n "^### Step 5.5\|^## Output to caller" skills/design-wrapper/modes/review.md
grep -n "gh issue edit\|writeFileSync.*DESIGN.md" skills/design-wrapper/modes/review.md
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js 2>&1 | tail -3
```

Expected: filter line found once; the "everything that isn't critique" sentence still present; ≥ 3 lines mention the two filenames; `decisions_staged` ≥ 3 lines (5.5 text, JSON, paragraph); `Remedy:` ≥ 4 lines (intro, two table rows, log line) — none classifying by message text; the negative grep prints nothing; Step 5.5 heading precedes `## Output to caller`; no DESIGN.md write; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/modes/review.md
git commit -m "Route craft-critic findings in review mode — code findings enter the polish cache, decisions findings stage to design-decision-*.md with provider-keyed remedies, decisions_staged in the return — refs #599"
```

---

### Task 2: `modes/polish.md` — widened cache, three-way consumption table, "Known craft issues" block, `craft-context` clause, Anti-Patterns

**Files:**
- Modify: `skills/design-wrapper/modes/polish.md` — Step 3 (one paragraph appended), a new `#### Three-way consumption` block at the end of Step 3, Step 4 (the "Known craft issues" block paragraph), Step 7 (`decision_summary` clause), the Output JSON `decision_summary` example, and a new `## Anti-Patterns` section at the end of the file.

**Interfaces:**
- Consumes: Task 1's cache entries (`source: "craft-critic"`, `target: "code"`, `provider`, `file`, `severity`, `message`).
- Produces: `decision_summary`'s optional trailing `; craft-context: {N} critic findings inlined` (Task 3's `polish-execution.md` sentence refers to the block; `/flow` logs the summary unchanged).

- [ ] **Step 1: Step 3 — widened cache + three-way table**

At the end of `### Step 3: Read prior audit findings cache` (after the last bullet `- If the cache exists but is older than … skip suggestion-driven dispatch (the audit no longer reflects current code).`), append:

````markdown

Since #599 the cache also carries `source: "craft-critic"` entries with `target: "code"` (review-time
craft-critic findings normalized by `review.md` Step 4 and filtered by its Step 5; `decisions`
findings never reach this cache). The staleness rule above covers both kinds identically — a stale
`craft-critic` entry is skipped along with stale audit entries; there is no separate staleness path.

#### Three-way consumption

Every cached finding is consumed one of exactly three ways, keyed on `source` and `suggestion`:

| Cached finding | Consumed as | Where |
|---|---|---|
| `source: "audit"` with a usable `suggestion` | **Command** — suggestion-driven dispatch, unchanged | Step 5 |
| `source: "audit"` with `suggestion: null` / unresolvable | **Staged observation** — `kind: "unclassified"`, unchanged | Step 5 |
| `source: "craft-critic"` (`target: "code"` only) | **Context** — inlined into each refinement-set dispatch prompt as a "Known craft issues" block; never selects a command, never staged, never counted in `commands_invoked` | Step 4 |

A `craft-critic` finding has no `suggestion` by construction (`review.md` Step 4 writes `null`) and is
never fed to Step 5's resolution — it is not an unclassified observation either; it is context.
````

- [ ] **Step 2: Step 4 — the "Known craft issues" block**

In `### Step 4: Refinement-set dispatch (always invoked when frontend)`, immediately after the `**Job-statement suffix.**` paragraph and before `**File-target convention:**`, insert:

````markdown
**Known craft issues (from review-time critics).** The refinement dispatch already receives the
assembled design-craft principles per `_shared/design-craft.md` (the assembly `skills/flow/polish-execution.md`
carries). When the cache from Step 3 holds `source: "craft-critic"` entries, add a **sibling** block
beside those principles in each refinement-set dispatch — never a replacement, and never above them:
`design-craft.md`'s authority rule (decisions win over principles) stays exactly as the executing
agent receives it. Per dispatch, filter the cached `craft-critic` findings to those whose `file` is
in that dispatch's target file list; render at most 15 rows, highest severity first, each row the
finding's `file`, `severity`, and `message` verbatim; when more than 15 match, append a final line
`+N more` with the count. Head the block literally:

```
Known craft issues (from review-time critics) — context, not commands:
| File | Severity | Finding |
```

The block informs the refinement commands; it never selects one, is never staged, and is never
counted in `commands_invoked`. A dispatch whose file list matches no cached `craft-critic` finding
carries no block.
````

- [ ] **Step 3: Step 7 — `decision_summary` clause**

In `### Step 7: Build \`decision_summary\``, immediately after the paragraph beginning `Staged entries are **not** counted in \`N\`` and before `When \`commands_invoked\` is empty, do not build \`decision_summary\``, insert:

```markdown
When at least one cached `craft-critic` finding was inlined into a refinement dispatch (Step 4's
"Known craft issues" block), append the trailing clause `; craft-context: {N} critic findings inlined`
to the sentence, where `{N}` is the **run-total of distinct cached `craft-critic` findings inlined
into at least one refinement dispatch** this polish invocation (a finding inlined into two dispatches
counts once). Emit the clause once per polish invocation, exactly as `decision_summary` itself is;
omit it when `N` is zero. Example: `Dispatched 3 Impeccable commands on 2 files — refinement-set:
polish, clarify, harden; craft-context: 4 critic findings inlined.`
```

- [ ] **Step 4: Output example**

In the Output-to-caller JSON, change the `"decision_summary"` value to end `…animate (intent:delightful); craft-context: 2 critic findings inlined."` (i.e. append `; craft-context: 2 critic findings inlined` before the closing quote).

- [ ] **Step 5: Anti-Patterns section**

Append at the very end of `skills/design-wrapper/modes/polish.md` (blank line before):

```markdown
## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deriving a command from a `craft-critic` finding | It has no `suggestion` by construction — it is refinement **context**, never a dispatch key; keyword-mapping a finding onto a command is the mechanism Step 5 retired. |
```

- [ ] **Step 6: Verify**

```bash
grep -n "Known craft issues" skills/design-wrapper/modes/polish.md | wc -l
grep -n "Three-way consumption" skills/design-wrapper/modes/polish.md
grep -n "at most 15 rows\|+N more" skills/design-wrapper/modes/polish.md
grep -n "craft-context" skills/design-wrapper/modes/polish.md | wc -l
grep -n "run-total" skills/design-wrapper/modes/polish.md
grep -n "^## Anti-Patterns" skills/design-wrapper/modes/polish.md
grep -n "gh issue edit\|writeFileSync.*DESIGN.md\|impeccable document" skills/design-wrapper/modes/polish.md
node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/anti-patterns.test.js 2>&1 | tail -3
```

Expected: "Known craft issues" ≥ 3 lines (table row, block paragraph, block heading); table heading found; cap phrases found; `craft-context` ≥ 2 lines (Step 7 + Output example); `run-total` found; the Anti-Patterns heading found; the DESIGN.md/document grep prints nothing; `# fail 0` (the anti-patterns row count pin scans SKILL.md files only, so a mode-file table does not move it — if the test disagrees, STOP and report DONE_WITH_CONCERNS with the output rather than editing the pin).

- [ ] **Step 7: Commit**

```bash
git add skills/design-wrapper/modes/polish.md
git commit -m "Consume craft-critic code findings in polish as refinement context — three-way cache consumption, Known craft issues block, craft-context clause in decision_summary — refs #599"
```

---

### Task 3: Consumers — `flow/polish-execution.md`, `review/SKILL.md`, `review/review-summary-template.md`, `design-wrapper/SKILL.md`

**Files:**
- Modify: `skills/flow/polish-execution.md` (one sentence appended to the craft-context bullet)
- Modify: `skills/review/SKILL.md` (Step 6.5 result-handling table: one clause in the advisory row)
- Modify: `skills/review/review-summary-template.md` (Design Quality section: Source values + Decisions sub-heading)
- Modify: `skills/design-wrapper/SKILL.md` (one Anti-Patterns row, ≤ 250 bytes)

**Interfaces:**
- Consumes: Task 1's `decisions_staged` and staged filenames; Task 2's block name.
- Produces: nothing downstream in this record.

- [ ] **Step 1: `polish-execution.md`**

In the bullet beginning `- Before the polish dispatch, assemble craft context per \`_shared/design-craft.md\` at runtime`, append this sentence at the end of the bullet (same line, after `the ambient baseline still applies.`): ` The refinement dispatch's assembled context now also carries the cached \`craft-critic\` \`code\` findings as a sibling "Known craft issues" block, per \`skills/design-wrapper/modes/polish.md\`'s three-way consumption table — no new staging kind and no new file writes; \`decision_summary\` may carry a trailing \`craft-context\` clause, logged unchanged.`

- [ ] **Step 2: `review/SKILL.md` Step 6.5 table**

In the row `| \`{result: "advisory", findings: [...], score_trend?: {...}}\` | Include findings in the summary …`, append before the closing ` |`: ` A \`decisions_staged\` field (present when the wrapper staged \`target: "decisions"\` findings to \`{run-dir}/staged/design-decision-*.md\`) means those findings await the Review Console — render them under the section's **Decisions** sub-heading only when the field is absent (standalone review, nothing staged).`

- [ ] **Step 3: `review-summary-template.md` Design Quality section**

Change the table's example row `| {file} | {critique/audit} | {info/warning/error} | {category} | {message} | {suggestion if present} |` to `| {file} | {critique/audit/finish-review/critic:{provider}} | {info/warning/error} | {category} | {message} | {suggestion if present} |` — `craft-critic` `code` findings render in this same table with `Source` = `critic:{provider}`.

Then, immediately after the blockquote line beginning `> Findings are advisory — they inform the verdict but were not auto-applied.` (and before the `(or, when skipped: …)` line), insert:

```markdown

#### Decisions

{Include only when the wrapper returned `target: "decisions"` findings that were **not** staged (`decisions_staged` absent — standalone review). Omit this sub-heading entirely when there are none, or when they were staged for the Review Console.}

These challenge the project's DESIGN.md, not the diff — the wrapper never edits DESIGN.md; act on the remedy or decline.

| Provider | File | Severity | Finding | Remedy |
|----------|------|----------|---------|--------|
| {provider} | {DESIGN.md or .impeccable/design.json} | {info/warning/error} | {message} | {`/claude-tweaks:design-wrapper explore` for `wrapper`; `/impeccable:impeccable document` for any critic} |
```

- [ ] **Step 4: `design-wrapper/SKILL.md` Anti-Patterns row**

Append at the very end of the `## Anti-Patterns` table (after the row beginning `| Inferring the motion signal from file content |`):

```markdown
| Writing a `decisions` finding into the polish cache, or letting polish act on one | `DESIGN.md` is upstream-owned — a `decisions` finding stages for a human at the Console (`review.md` Step 5.5); polish consumes `code` findings only, as context. |
```

- [ ] **Step 5: Verify**

```bash
wc -c skills/design-wrapper/SKILL.md
grep -n "Known craft issues" skills/flow/polish-execution.md
grep -n "decisions_staged" skills/review/SKILL.md
grep -n "^#### Decisions\|never edits DESIGN.md\|Omit this sub-heading entirely" skills/review/review-summary-template.md
grep -n "critic:{provider}" skills/review/review-summary-template.md
grep -c "decisions\` finding into the polish cache" skills/design-wrapper/SKILL.md
node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/anti-patterns.test.js tests/skill-conventions.test.js 2>&1 | tail -3
```

Expected: SKILL.md ≤ 39 800 bytes and < 40 960; each grep ≥ 1; the anti-patterns row pin (368) will now read 369 — **that pin must be bumped in this task**: edit `tests/bin-lib/skill-audit/anti-patterns.test.js`, change `assert.strictEqual(total, 368);` to `369` and add, immediately above it, the comment block:

```js
  //
  //   368 -> 369, decisions pushback routing (#599). One row appended to
  //   design-wrapper/SKILL.md's Anti-Patterns table (writing a decisions
  //   finding into the polish cache). Measured by running this test's parser
  //   against the working tree (actual 369), not by adding 1 to 368.
```

then re-run the three test files: expect `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/flow/polish-execution.md skills/review/SKILL.md skills/review/review-summary-template.md skills/design-wrapper/SKILL.md tests/bin-lib/skill-audit/anti-patterns.test.js
git commit -m "Surface craft-critic routing to consumers — polish-execution context note, review Step 6.5 decisions_staged handling, Design Quality Decisions sub-heading, design-wrapper Anti-Pattern, row pin 368 -> 369 — refs #599"
```
