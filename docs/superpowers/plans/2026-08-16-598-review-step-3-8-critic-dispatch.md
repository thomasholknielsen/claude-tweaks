# design-wrapper review Step 3.8 — critic dispatch (#598) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Step 3.8 — Dispatch project-local craft critics** to `skills/design-wrapper/modes/review.md`: resolve the `design-critique` lever, select triggered critics for the resolved `surface_track` from `../critics.md`, dispatch one contract subagent per critic in parallel, normalize each reply into the findings union (`source: "craft-critic"`, `target: code | decisions`), return a `craft_critics` field that tells unavailable / failed / unparseable / parsed apart, and emit the wrapper's absence-nudge under lever `auto`. Plus one clause and three Anti-Patterns rows in `skills/design-wrapper/SKILL.md`.

**Architecture:** Prose-procedure edits following Step 3.7's structure (gate → availability → dispatch → outcomes table) but under the *full* Subagent Contract (status line, Template A + `Target`, Standard profile) rather than the third-party exemption. Two files change. No downstream routing (that is #599): Step 5's `source === "audit"` filter stays; critic findings live in `findings` and the return only.

**Tech Stack:** Markdown; `node --test` conformance suites; `wc -c` byte budget (`skills/design-wrapper/SKILL.md` must stay under 40 960 bytes — `tests/bin-lib/skill-audit/context-cost.test.js`; it is 38 892 today, and #601 still needs room, so this record's SKILL.md additions must total ≤ 700 bytes).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T160107-spec-597-595-598-599-601/spec-598/work/598-spec.md`

## Global Constraints

- **The lever key is `design-critique`** (flat kebab-case, shipped by #595 in this branch), never `design.critique`. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values design-critique` (omit `--run "$PIPELINE_RUN_DIR"` when unset).
- **`Design-intent:` "set" means present with a value other than `none`** (parent #592 promise F1): `spec-template.md`'s value domain includes the literal `none`, which reads as *unset* for every trigger in this step.
- Only `skills/design-wrapper/modes/review.md` and `skills/design-wrapper/SKILL.md` change. Do NOT touch `critics.md`, `polish.md`, `flow/*`, `survey.md`, Step 5's cache filter (`source === "audit"` stays verbatim), or the declined-recommendations cache (the word `declined` must not appear in `review.md`).
- Step 3.7's existing text — including its citation `Exemption: third-party agents` — is not modified (a test pins it).
- Never model this dispatch on Step 3.7's exemption: full contract applies — status line first, Template A + `Target` literal in the prompt, `[Use: Standard model.]`, no `isolation: "worktree"`.
- New Step 3.8's sub-steps are lettered **(a)–(f)** so they never collide with the mode's Step numbers.
- Commit messages: `{Verb} {what} — {detail}` ending `refs #598` (never `closes`/`fixes`).
- Work from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-597-595-598-599-601`; verify `pwd` + `git rev-parse --show-toplevel` before any edit or commit.
- Do not run the full `npm test` inside a task — only the targeted files each task names.

---

### Task 1: Step 3.8 sub-steps (a)–(d) — lever, roster selection (with worked example), availability, decisions layer

**Files:**
- Modify: `skills/design-wrapper/modes/review.md` — insert a new `### Step 3.8: Dispatch project-local craft critics` section immediately after Step 3.7's final paragraph (the one ending `…the distinction lives in \`parsed\`, never in the finding count.`) and before `### Step 4: Normalize findings`.

**Interfaces:**
- Consumes: `../critics.md`'s roster (columns `Track | Critic | Trigger`), its Trigger signals (motion signal, decisions present, lever) and the `Design-intent:` line; the preconditions' Layer 0 signals object (`hasDesign`); `../../_shared/design-craft.md`'s Emil skill resolution and decisions-layer resolution; `../../_shared/visual-html-output.md`'s three-path `DESIGN.md` lookup; `bin/resolve-policy.js`.
- Produces: the section heading `### Step 3.8: Dispatch project-local craft critics`, sub-steps **(a)–(d)**, and — for Task 2 to continue under the same heading — the phrase `Sub-steps (e) and (f) follow.` as the section's last line (Task 2 replaces that line).

- [ ] **Step 1: Insert the section**

Insert exactly this text (blank line before and after) between Step 3.7's last paragraph and `### Step 4: Normalize findings`:

````markdown
### Step 3.8: Dispatch project-local craft critics

The finishing review above judges the render against Impeccable's own direction contract. This step
asks a different question of a different reviewer: do the changed files meet the *project-local craft
principles* the record's track has wired — the curated roster in `../critics.md` — and does the
project's decisions layer (`DESIGN.md` + `.impeccable/design.json`) hold up against those principles?
Each critic is an upstream skill dispatched as an ordinary contract subagent, **not** a third-party
agent: the full Subagent Contract applies (status line, Template A, Standard profile), and nothing
here is modelled on Step 3.7's exemption. Routing of what comes back — polish, `staged/`, the review
summary — is deliberately not this step's concern; it produces findings and a return field, and #599
routes them.

**(a) Lever.** Resolve the `design-critique` policy value —
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values design-critique`
(omit `--run "$PIPELINE_RUN_DIR"` when it is unset). Log one line per `../../_shared/auto-decision-log.md`:
`AUTO {time} — review Step 3.8: design-critique resolved to {value} (source: {source}). Reversibility: n/a (a policy read).`
`off` → skip the whole step: no roster read, no dispatch, no nudge, and `craft_critics` is **omitted**
from the return. `auto` and `full` continue.

**(b) Roster selection.** Read `../critics.md` and select every row whose `Track` equals the resolved
`surface_track` and whose `Trigger` holds given the four inputs that file defines and cites:

- **Lever** — the value from (a).
- **Motion signal** — consumer judgment per `../../_shared/design-craft.md`'s Relevance map, applied to
  the record's spec/description (does it name motion work, or is `Design-intent: delightful`?) — never
  inferred from file content.
- **Decisions present** — `hasDesign` from the preconditions' Layer 0 signals object; when Layer 0
  degraded (empty object), fall back to a direct `DESIGN.md` existence check via
  `../../_shared/visual-html-output.md`'s three-path lookup.
- **`Design-intent:` set** — the record body-metadata line is present with a value other than `none`
  (`none` is unset for this purpose).

The roster's `terminal` row is `*pending*` and its native row is `*none*` until their own records
land — a `*pending*`/`*none*` cell selects nothing, and this step never invents a critic for a track
the roster leaves empty. Worked example, web track:

| Lever | Decisions present | Motion signal | `Design-intent:` | Selected |
|---|---|---|---|---|
| `auto` | yes | no | unset | `emil-design-eng` |
| `auto` | no | no | unset | none — the absence-nudge (Step 4) fires instead |
| `auto` | no | yes | unset | `emil-design-eng` + `review-animations` |
| `full` | no | no | unset | `emil-design-eng` (`review-animations` needs the motion signal even under `full`) |

If the selection is empty, skip (c)–(f): no dispatch, and `craft_critics` is **omitted** from the return
(the nudge in Step 4 still applies on its own conditions). Otherwise continue with the selected rows.

**(c) Availability.** For each selected critic, resolve its `SKILL.md` per
`../../_shared/design-craft.md`'s **Emil skill resolution** — the per-skill-name two-path lookup
(`{project}/.claude/skills/{name}/SKILL.md`, then `~/.claude/skills/{name}/SKILL.md`; read through
symlinks). A name resolving at neither path is unavailable: record
`{provider: "<name>", ran: false, missed: "not installed at either path"}` in `craft_critics`, dispatch
nothing for it, and log
`SCANNED {time} — review Step 3.8: critic <name> unavailable (not installed at either path). Reversibility: n/a.`
Availability is per critic; one missing critic never skips the others.

**(d) Decisions layer.** Resolve `DESIGN.md` (three-path lookup, as in (b)) and the root sidecar
`.impeccable/design.json` per `../../_shared/design-craft.md`'s decisions-layer resolution. Read both
verbatim when present — they are inlined into every critic's prompt in (e). When neither exists, note
it: (e) sends the literal absence sentence instead, and Step 4's absence-nudge conditions read this
result.

Sub-steps (e) and (f) follow.
````

- [ ] **Step 2: Verify**

```bash
grep -n "^### Step 3.7\|^### Step 3.8\|^### Step 4" skills/design-wrapper/modes/review.md
grep -c "emil-design-eng" skills/design-wrapper/modes/review.md
grep -n "critics.md" skills/design-wrapper/modes/review.md | head -3
grep -n "design\.critique\|declined" skills/design-wrapper/modes/review.md
grep -n "\*\*(a) Lever\|\*\*(b) Roster\|\*\*(c) Availability\|\*\*(d) Decisions" skills/design-wrapper/modes/review.md
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js 2>&1 | tail -3
```

Expected: the three headings in order 3.7 → 3.8 → 4; `emil-design-eng` count ≥ 4; `critics.md` cited; the dotted/declined grep prints nothing; the four sub-step markers found; `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add skills/design-wrapper/modes/review.md
git commit -m "Add review Step 3.8 (a)-(d) — design-critique lever gate, roster selection with worked example, per-critic availability, decisions-layer resolution — refs #598"
```

---

### Task 2: Step 3.8 sub-steps (e)–(f) — contract dispatch with the literal prompt, and the four outcomes

**Files:**
- Modify: `skills/design-wrapper/modes/review.md` — replace the line `Sub-steps (e) and (f) follow.` (end of Task 1's section) with sub-steps (e) and (f) below.

**Interfaces:**
- Consumes: Task 1's selected/available critics, their `SKILL.md` contents, the Step 2 resolved file list, the decisions layer from (d).
- Produces: the dispatch prompt block (Template A + `Target`), the four-outcome encoding of `craft_critics` entries (`ran`, `parsed`, `reason`, `dropped_rows`), which Task 3's Step 4 normalization and Output block consume.

- [ ] **Step 1: Replace the placeholder line with (e) and (f)**

Replace `Sub-steps (e) and (f) follow.` with exactly:

````markdown
**(e) Dispatch.** One `Task()` per available critic.

> **Parallel execution:** Dispatch the available critics as parallel Task agents — each runs independently and returns findings in Template A format (with the extra `Target` column below). Assemble results after all agents complete.
> **Contract:** Each agent follows the Subagent Contract (`../../_shared/subagent-output-contract.md`) — minimal input (scope + paths + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line, then the table. Profile: Standard (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" standard`, contract §Model Selection) — a review-style fan-out, never Frontier. Inline the template literally; reject and re-prompt on format violations.

`subagent_type: general-purpose`. Do **not** pass `isolation: "worktree"` — this mode routinely runs
inside a worktree already set up for the task, and a second one orphans everything written into it
(Step 3.7's reason, and it holds here). Working-directory discipline: substitute the **resolved
absolute** repository path into the prompt; never an unexpanded placeholder.

The prompt body contains **only** the following, in this order — never conversation history, never
this mode's other findings, never a path *to* the critic skill in place of its text:

1. The critic's `SKILL.md` content, inlined verbatim (a path string reaches nothing — see
   `../../_shared/design-craft.md`'s Subagent Contract compliance).
2. Step 2's resolved file list, as absolute paths.
3. The decisions layer from (d), inlined verbatim (`DESIGN.md`, then `.impeccable/design.json`) — or,
   when absent, the literal sentence: "No DESIGN.md or sidecar exists for this project — emit no
   `decisions` rows".
4. The two questions, verbatim:
   "1. Conformance: for each file, where does the diff fall short of what DESIGN.md decided, or of your
   craft principles where DESIGN.md is silent? Report as `Target: code`. 2. Pushback: where is DESIGN.md
   silent on a sub-topic this diff exercised, or where does a decision it records fall below your
   principles? Report as `Target: decisions`, with `Path:Line` = `DESIGN.md` or `.impeccable/design.json`."
5. The status-line protocol and the findings template — this literal block:

```
Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Target | Path:Line | Finding | Evidence |
|---|---|---|---|---|
| high | code | src/routes/+page.svelte:42 | Body copy set at 13px, below DESIGN.md's 14px floor | `font-size: 13px` on `.lede` |
| medium | decisions | DESIGN.md:18 | Type scale records no small-text floor while this diff ships captions | `typography:` block has no `min` |

Target must be exactly `code` or `decisions`.
Severity scale: critical / high / medium / low / info
If no findings: return literal text "No findings."
Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
Do not add narration, headers, or summaries before or after the table.

[Use: Standard model.]
```

**(f) Parse and encode — four outcomes.** Every dispatched critic gets exactly one `craft_critics`
entry; the outcomes are distinct encodings, and none of them may be reported as a clean design review:

| Outcome | How it looks | `craft_critics` entry | Log |
|---|---|---|---|
| **Failed** | `Task()` errored, or returned nothing | `{provider, ran: true, parsed: false, reason: "dispatch failed: <error text or 'empty reply'>"}` | `SCANNED` naming provider + reason |
| **Refused** | First line `BLOCKED` or `NEEDS_CONTEXT` | `{provider, ran: true, parsed: false, reason: "<status>: <agent's own text>"}` | `SCANNED` naming provider + reason |
| **Unparseable** | `DONE`/`DONE_WITH_CONCERNS`, but no table with the header above and no literal "No findings." | `{provider, ran: true, parsed: false, reason: "unparseable"}` — do **not** mine prose for something finding-shaped | `SCANNED` naming provider + reason |
| **Parsed** | The table (or the literal "No findings.") | `{provider, ran: true, parsed: true}` — "No findings." is a real, clean result | — |

Row hygiene on a parsed reply: a row whose `Target` cell is not exactly `code` or `decisions` is
**dropped** and counted in `dropped_rows: <n>` on that critic's entry — never coerced, since a
mis-targeted row could otherwise reach polish. If every row was dropped, encode the entry as
`{provider, ran: true, parsed: false, reason: "unparseable"}` with the count still present. Surviving
rows go to Step 4. Absence of output is not absence of findings, and the distinction lives in
`parsed`, never in the finding count.

Log lines for this step follow `../../_shared/auto-decision-log.md`: the one `AUTO` line from (a),
and one `SCANNED` line for every non-`parsed` outcome in (c) and (f) —
`SCANNED {time} — review Step 3.8: critic <provider> <unavailable | dispatch failed | refused | unparseable>: <reason>. Reversibility: n/a.`
````

- [ ] **Step 2: Verify**

```bash
grep -n "| Severity | Target | Path:Line | Finding | Evidence |" skills/design-wrapper/modes/review.md
grep -n "No findings\.\|+N more" skills/design-wrapper/modes/review.md | head -4
grep -n "1. Conformance:" skills/design-wrapper/modes/review.md
grep -n "dispatch failed\|unparseable\|dropped_rows" skills/design-wrapper/modes/review.md | wc -l
grep -n "Sub-steps (e) and (f) follow" skills/design-wrapper/modes/review.md
grep -n "isolation: \"worktree\"" skills/design-wrapper/modes/review.md | wc -l
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js 2>&1 | tail -3
```

Expected: the header found once; `No findings.` and `+N more` present (each ≥ 1); `1. Conformance:` found; the three-token grep ≥ 3 lines; the placeholder line gone (no output); `isolation: "worktree"` appears 2 times (Step 3.7's + this step's); `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add skills/design-wrapper/modes/review.md
git commit -m "Add review Step 3.8 (e)-(f) — contract dispatch with the literal Target-column template and the four-outcome craft_critics encoding — refs #598"
```

---

### Task 3: Step 4 normalization, the absence-nudge, and the `craft_critics` return

**Files:**
- Modify: `skills/design-wrapper/modes/review.md` — Step 4 (the normalized shape JSON + a new adapting paragraph + the nudge), and `## Output to caller` (JSON block + a `craft_critics` paragraph).

**Interfaces:**
- Consumes: Task 2's parsed rows and `craft_critics` entries; (b)/(d)'s decisions-present result; the resolved `surface_track`; Step 2's file count.
- Produces: the findings-union shape with `source: "craft-critic"`, `provider`, `target`; the return field `craft_critics` documented in Output to caller.

- [ ] **Step 1: Widen the Step 4 shape**

In `### Step 4: Normalize findings`, replace the JSON block

```json
{
  "source": "critique" | "audit" | "finish-review",
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."
}
```

with

```json
{
  "source": "critique" | "audit" | "finish-review" | "craft-critic",
  "provider": "<critic name>" | "wrapper",   // craft-critic rows only; "wrapper" is reserved for the absence-nudge
  "target": "code" | "decisions",            // craft-critic rows only
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."
}
```

- [ ] **Step 2: Add the craft-critic adapting paragraph and the nudge**

Immediately after the paragraph that begins `\`result\` stays \`advisory\` whatever comes back.` (and before `Also extract each command's Total score…`), insert:

````markdown
**Adapting the craft critics (Step 3.8).** Each surviving table row from a parsed critic becomes one
finding:

```json
{ "source": "craft-critic", "provider": "<critic name>", "target": "code" | "decisions", "file": "<Path from Path:Line>", "category": "craft", "severity": "info" | "warning" | "error", "message": "<Finding> — <Evidence>", "suggestion": null }
```

- **`severity` is assigned at the boundary**, exactly as for the finishing review: the table's
  critical/high → `error`, medium → `warning`, low/info → `info` — the same three values `/review`
  already maps (`info` → low, `warning` → medium, `error` → high), so no `/review`-side change.
- **`target`** is copied verbatim (`code` | `decisions`); a `decisions` row keeps `DESIGN.md` or the
  sidecar path as `file`.
- **`suggestion` is `null`** (not omitted), per Step 5's rule — a critic names no Impeccable command.
- These findings join the same `findings` array as critique / audit / finish-review. Step 5's cache
  filter is unchanged (`source === "audit"`); where `code` and `decisions` findings go next is #599's.

**Absence-nudge (wrapper-emitted).** When **all** of: the lever from Step 3.8 (a) is `auto`;
`surface_track === "web"`; Step 2 resolved ≥ 1 file; and decisions are absent (Step 3.8 (b)/(d)) —
append exactly one finding:

```json
{ "source": "craft-critic", "provider": "wrapper", "target": "decisions", "file": "DESIGN.md", "category": "craft", "severity": "info", "message": "UI shipping without a locked direction — run /claude-tweaks:design-wrapper explore to lock one", "suggestion": null }
```

`provider: "wrapper"` is a reserved value — no skill of that name is ever dispatched, and the nudge
never gets a `craft_critics` entry (it is not a critic). It never fires on the native track (this
design expects no `DESIGN.md` there), never when Step 2 resolved zero files (no UI is shipping), and
never under `full` or `off`. De-duplication is by construction, not by cache: it is emitted once per
review invocation, #599 stages it under a fixed filename that is overwritten on re-review, and a
project that does not want it says so once with `design-critique: off`.
````

- [ ] **Step 3: Document `craft_critics` in Output to caller**

In the `## Output to caller` JSON block, add this line immediately after the `"finish_review": { … }` line (add a trailing comma to the `finish_review` line):

```json
  "craft_critics": [ { "provider": "emil-design-eng", "ran": true, "parsed": true }, { "provider": "review-animations", "ran": false, "missed": "not installed at either path" } ]
```

Then, immediately after the paragraph that begins `` `finish_review` is built from Step 3.7 `` (and before the `` `design_contract` is built from Step 3.6 `` paragraph), insert:

```markdown
`craft_critics` is built from Step 3.8 and is **omitted entirely** when that step did not dispatch —
lever `off`, or the roster selected zero critics for the resolved track — the same omission
convention `finish_review` uses. When it *did* select critics it is always present, with one entry
per selected critic (unavailable ones included: `ran: false, missed`), and on the Failed, Refused and
Unparseable outcomes `parsed: false` and a `reason` carry why; `dropped_rows` counts mis-targeted rows
on a parsed reply. That is the field a caller reads to learn that an absence of craft findings is an
absence of *evidence* rather than a clean bill; without it, the two are indistinguishable in
`findings`. The wrapper's absence-nudge is a finding, never an entry here.
```

- [ ] **Step 4: Verify**

```bash
grep -n '"source": "craft-critic"' skills/design-wrapper/modes/review.md | wc -l
grep -n "UI shipping without a locked direction" skills/design-wrapper/modes/review.md
grep -n "craft_critics" skills/design-wrapper/modes/review.md | wc -l
grep -n 'source === "audit"' skills/design-wrapper/modes/review.md
grep -n "declined\|design\.critique" skills/design-wrapper/modes/review.md
grep -n '"provider": "wrapper"' skills/design-wrapper/modes/review.md
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js 2>&1 | tail -3
```

Expected: `"source": "craft-critic"` ≥ 2 lines (adapting shape + nudge); the nudge sentence found once in the nudge JSON; `craft_critics` ≥ 6 lines across (a), (b), (c), (f) table, the Output JSON, and the new paragraph; the Step 5 filter line unchanged (one hit); the negative grep prints nothing; the wrapper provider found; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/modes/review.md
git commit -m "Normalize craft-critic findings in review Step 4, add the DESIGN.md absence-nudge, and document the craft_critics return field — refs #598"
```

---

### Task 4: `SKILL.md` — review row clause and three Anti-Patterns rows (byte-lean)

**Files:**
- Modify: `skills/design-wrapper/SKILL.md` — the `| \`review <spec>\` |` row of the Input table, and the `## Anti-Patterns` table (append three rows at the end).

**Interfaces:**
- Consumes: the shipped `critics.md` and the `design-critique` key.
- Produces: nothing downstream in this record.

- [ ] **Step 1: Measure before**

```bash
wc -c skills/design-wrapper/SKILL.md
```

Note the byte count (38 892 expected).

- [ ] **Step 2: Input-table clause**

In the `| \`review <spec>\` | Spec number or path | Invokes …` row, change `plus upstream's \`impeccable-finish-reviewer\` agent when the artifact carries a direction contract; returns advisory findings;` to `plus upstream's \`impeccable-finish-reviewer\` agent when the artifact carries a direction contract, plus project-local craft critics per \`critics.md\`, governed by \`design-critique\`; returns advisory findings;`.

- [ ] **Step 3: Anti-Patterns rows**

Append these three rows at the very end of the `## Anti-Patterns` table (after the row beginning `| The wrapper writing \`DESIGN.md\` itself after an \`explore\` pick |`):

```markdown
| Treating a craft critic as a third-party agent | It is a contract subagent — status line, Template A + `Target`, Standard profile all apply; Step 3.7's exemption covers `impeccable-finish-reviewer` only. |
| Dispatching a craft critic on the native track | Emil is web-only (`design-craft.md` Gating) and `critics.md` has no native row — nothing to dispatch. |
| Inferring the motion signal from file content | It comes from the spec/`Design-intent:` (consumer judgment) — inference from code removes user agency, same rule as intent-driven dispatch. |
```

- [ ] **Step 4: Verify**

```bash
wc -c skills/design-wrapper/SKILL.md
grep -c "craft critic\|craft-critic" skills/design-wrapper/SKILL.md
grep -n "design\.critique" skills/design-wrapper/SKILL.md
node --test tests/bin-lib/skill-audit/context-cost.test.js tests/skill-conventions.test.js tests/skill-catalog-completeness.test.js 2>&1 | tail -3
```

Expected: byte count ≤ 39 600 (growth ≤ 700 bytes) and < 40 960; count ≥ 3; the dotted grep prints nothing; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/SKILL.md
git commit -m "Name project-local craft critics in design-wrapper's review row and add three critic-dispatch Anti-Patterns — refs #598"
```
