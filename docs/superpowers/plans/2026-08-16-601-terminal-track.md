# Terminal track (#601) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give terminal UX a home in the design pipeline end to end: `Surface:` gains `terminal` (declared-only, never sniffed) at every enumeration site; the design wrapper resolves a `terminal` track whose downstream lives in a new sibling reference `skills/design-wrapper/terminal-routing.md` (honest Impeccable skips, `pre-build` runs on plugin-authored principles); a new plugin-authored principles file `skills/_shared/terminal-ux.md` serves as both writing context and the review-time terminal critic via `critics.md`'s filled `terminal` row.

**Architecture:** Expand-contract on a prose enum (pure expand). Two new files (`_shared/terminal-ux.md` authored ≤ 6 KB target / 8 KB gate; `design-wrapper/terminal-routing.md` outcomes table). Four one-line-scale additions to `design-wrapper/SKILL.md` (Layer 2 row, track row, disagreement sentence, Layer 3 row, pointer, sub-file bullet). One byte-freeing extraction in `modes/review.md` (Step 3.6's body → `modes/review-seed-capture.md`) required by parent promise F3 before any terminal clause can land there. Docs edges + a new conformance test.

**Tech Stack:** Markdown; `node --test`; byte ceilings (`modes/review.md` 40 898/40 960 at start — hence the extraction; `design-wrapper/SKILL.md` 39 787/40 960, additions budgeted ≤ 750 B).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T160107-spec-597-595-598-599-601/spec-601/work/601-spec.md`

## Global Constraints

- **Promise F3 (parent #592):** (1) never append net bytes to `modes/review.md` while it sits at 40 898/40 960 — Task 3's extraction runs BEFORE Task 5 touches it, and Task 5 re-checks `wc -c` < 40 900 after its edit; (2) the terminal track needs no remedy-table change — terminal critics emit `code` rows only (no decisions layer on this track), and Task 4/5 text states that where the spec says to.
- `terminal` is **declared-only**: no extension or path trigger is added to `frontend-detection.md`'s sniff tables — only the flow-diagram line. `Surface:` **wins** over `setup.platform` on this track (platform's value domain has no terminal value); the disagreement is still recorded in `surface_track_override` and `decisions.md`.
- No Impeccable dispatch on the terminal track — every Impeccable-backed mode skips honestly with the stated reason strings; the revisit condition (upstream-drift capability triage surfacing a terminal/CLI reference in Impeccable's `reference/` tree → file a record, never silently flip a row) is recorded in `terminal-routing.md`.
- No web/native behavior change: `native-routing.md` untouched; existing rows only gain, never lose or alter (AC 9's `git diff -U0 … | grep '^-[^-]'` check — the one allowed deletion set is Task 3's extraction from `review.md`, which is not one of AC 9's three files).
- The lever key is `design-critique`; the `Surface:` enum order everywhere is `web | mobile | desktop | backend | infra | terminal` (append at the end).
- `_shared/terminal-ux.md` is inlined whole into dispatch prompts: self-contained, no "see X" pointers an agent cannot follow, < 8192 bytes (test gate), ≤ ~6 KB target.
- Commit messages: `{Verb} {what} — {detail}` ending `refs #601`. Work from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-597-595-598-599-601`; verify `pwd` + `git rev-parse --show-toplevel` before any edit or commit. No full `npm test` inside a task — only the targeted files each task names.

---

### Task 1: Author `skills/_shared/terminal-ux.md`

**Files:**
- Create: `skills/_shared/terminal-ux.md`

**Interfaces:**
- Consumes: `skills/_shared/design-craft.md`'s "The two source classes" (this file is a **principles** source) — cite the file by name in the header, do not restate its classes.
- Produces: the principles file that Task 4's `terminal-routing.md`, Task 5's `critics.md` row / `pre-build.md` / `polish-execution.md`, and Task 6's docs rows all reference by path.

- [ ] **Step 1: Write the file**

Author `skills/_shared/terminal-ux.md` with this structure (content is yours to write well — the requirements below are binding, the wording is not):

1. Title: `# Terminal UX — plugin-authored craft principles`.
2. A 3–5 line header paragraph stating: this is a **principles** source under `skills/_shared/design-craft.md`'s source classes (project decisions win where they speak — though this track reads no `DESIGN.md`); it is plugin-authored and always available at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md` (no install, no two-path lookup); it is written to be inlined whole into a dispatch prompt, as writing context (`pre-build`, polish's craft assembly) and as the terminal critic (`critics.md`).
3. Six `##` sections, exactly these topics, each: one short principle paragraph per point (2–4 points), with a compact Before/After example where it earns its place (fenced, short):
   - `## Help and usage` — synopsis line first; group flags by task, not alphabet; examples before exhaustive flag lists; `-h` is a pager of intent, not a dump.
   - `## Output formatting` — align columns for scanning; one record per line for pipes; offer `--json` (stable keys, no ANSI) when output feeds tools; quiet by default, `--verbose` opt-in; never mix progress noise into parseable stdout — status goes to stderr.
   - `## TTY detection and colour` — honor `isatty`: colour/spinners only on a TTY; respect `NO_COLOR` and `FORCE_COLOR`; degrade to plain sequential lines when piped; never emit raw ANSI into redirected output.
   - `## Progress and long-running feedback` — under a second: silence; seconds: one status line; longer: streamed line logs over spinners in non-interactive contexts; always name what is happening and, where knowable, how much remains.
   - `## Error messages` — three parts, in order: what happened, why (the actual value/path/code that offended), what to do next (a runnable command where one exists); errors to stderr; never a bare stack trace as the primary message.
   - `## Exit codes` — 0 success only; distinct non-zero codes for distinct failure classes a caller could branch on; document them in help; a partial failure is non-zero, never a warning-then-0.
4. No trailing "see also" section; no references to files an inlined prompt cannot reach.

- [ ] **Step 2: Verify**

```bash
wc -c skills/_shared/terminal-ux.md
grep -c "^## " skills/_shared/terminal-ux.md
grep -n "Help and usage\|Output formatting\|TTY\|Progress\|Error messages\|Exit codes" skills/_shared/terminal-ux.md | wc -l
grep -n "design-craft.md" skills/_shared/terminal-ux.md
grep -n "see .*\.md.*for\|see also" skills/_shared/terminal-ux.md
```

Expected: byte count ≤ ~6144 (hard: < 8192); exactly 6 `##` sections; the six topic greps ≥ 6 lines; the design-craft citation present; the "see also" grep returns nothing (the design-craft.md citation in the header names its role, it does not defer content).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/terminal-ux.md
git commit -m "Author _shared/terminal-ux.md — plugin-authored terminal-UX principles, inlinable whole as writing context and review-time critic — refs #601"
```

---

### Task 2: `Surface:` enum expand — the four specify/flow sites

**Files:**
- Modify: `skills/specify/spec-template.md:14` (+ the enum's defining paragraph), `skills/specify/SKILL.md:4` (argument-hint) and `:44` (`--surface` doc), `skills/specify/design-pre-steps.md:9` (override paragraph), `skills/flow/materialize.md:49` and `:96` (header + body enum lines).

**Interfaces:**
- Consumes: nothing new.
- Produces: the token `terminal` at every enum site Task 6's conformance test pins.

- [ ] **Step 1: spec-template.md**

Change line 14 `Surface: {web | mobile | desktop | backend | infra}` to `Surface: {web | mobile | desktop | backend | infra | terminal}`. In the paragraph below it that defines the values (the one defining `mobile`), append this sentence: `` `terminal` is a CLI/TUI surface — help text, output formatting, prompts, exit codes; it is declared only, never sniffed (no file extension implies it), and it takes the design pipeline's terminal track (`skills/design-wrapper/terminal-routing.md`). ``

- [ ] **Step 2: specify SKILL.md**

In the frontmatter `argument-hint` (line 4), change `--surface <web|mobile|desktop|backend|infra>` to `--surface <web|mobile|desktop|backend|infra|terminal>`. In the `--surface` flag doc (line ~44), change the same token list, and append this sentence to the bullet: `` `terminal` behaves like `backend`/`infra` for the design pre-steps (2.5b/2.5c skipped — no scaffold, no design-intent question) while still writing `Surface: terminal` so the design wrapper resolves the terminal track downstream. ``

- [ ] **Step 3: design-pre-steps.md**

In the `**\`--surface\` override.**` paragraph (line 9), change `skip them, as the no-signal case below does, when it's \`backend\`/\`infra\`.` to `skip them, as the no-signal case below does, when it's \`backend\`/\`infra\`/\`terminal\` (terminal still writes \`Surface: terminal\` — the skip is of the web-only pre-steps, not of the declaration).`

- [ ] **Step 4: materialize.md**

Change line 49 `surface: {web|mobile|desktop|backend|infra}` to `surface: {web|mobile|desktop|backend|infra|terminal}` and line 96 `Surface: {web | mobile | desktop | backend | infra}` to `Surface: {web | mobile | desktop | backend | infra | terminal}`.

- [ ] **Step 5: Verify**

```bash
grep -rn "web | mobile | desktop | backend | infra}\|web|mobile|desktop|backend|infra>" skills/ | grep -v terminal
grep -rn "terminal" skills/specify/spec-template.md skills/specify/SKILL.md skills/specify/design-pre-steps.md skills/flow/materialize.md | wc -l
node --test tests/skill-conventions.test.js tests/skill-catalog-completeness.test.js 2>&1 | tail -3
```

Expected: the first grep prints nothing (no enum site left without `terminal`); the second ≥ 6 lines; `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/specify/spec-template.md skills/specify/SKILL.md skills/specify/design-pre-steps.md skills/flow/materialize.md
git commit -m "Expand the Surface enum with terminal at the four specify/flow sites — declared-only CLI/TUI surface, design pre-steps skip like backend/infra — refs #601"
```

---

### Task 3: Free bytes in `modes/review.md` — extract Step 3.6's body to `modes/review-seed-capture.md`

**Files:**
- Create: `skills/design-wrapper/modes/review-seed-capture.md`
- Modify: `skills/design-wrapper/modes/review.md` (Step 3.6 body replaced by a stub + pointer)

**Interfaces:**
- Consumes: Step 3.6's current text (from `### Step 3.6: Read the direction contract and record its seed key` down to, but not including, `### Step 3.7:`).
- Produces: headroom in `review.md` (~3.5 KB freed) that Task 5's terminal clause spends a fraction of; the sub-file Task 6 documents.

- [ ] **Step 1: Create the sub-file**

Create `skills/design-wrapper/modes/review-seed-capture.md` with: a title `# review mode — Step 3.6: Read the direction contract and record its seed key`, one framing line (`Loaded by \`review.md\` Step 3.6 — the full locate-parse-record procedure; the gate and the three-outcome summary stay in \`review.md\`.`), then Step 3.6's current body **moved verbatim** — everything from the paragraph beginning `This is the one point in the pipeline where a **built artifact**` through the paragraph ending `…can never change \`result\`, which stays \`advisory\`.` (inclusive), unchanged byte-for-byte apart from the heading level of any internal bold headers (keep them as-is; they are bold paragraphs, not headings).

- [ ] **Step 2: Stub the section in review.md**

Replace that same moved body (leave the `### Step 3.6:` heading in place) with exactly:

```markdown
The one point where a built artifact and its work record are both in hand — Impeccable's direction
contract (and its seed key, the only thing making a non-deterministic build reproducible) is read
here and recorded onto the record as `Design-seed:`. Read `review-seed-capture.md` in this
directory and follow it in full: the locate-and-parse procedure over Step 2's resolved file list,
the three outcomes (No contract / Malformed / Contract found), the record-resolution and
`Design-seed:` write rules, and the never-gate posture. Step 3.7's gate reads this step's parse
outcome — **Contract found** is the only outcome that reaches it.
```

- [ ] **Step 3: Verify**

```bash
wc -c skills/design-wrapper/modes/review.md skills/design-wrapper/modes/review-seed-capture.md
grep -n "^### Step 3.6\|^### Step 3.7\|^### Step 3.8" skills/design-wrapper/modes/review.md
grep -n "review-seed-capture.md" skills/design-wrapper/modes/review.md
grep -c "Never write the line empty" skills/design-wrapper/modes/review.md skills/design-wrapper/modes/review-seed-capture.md
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/anti-patterns.test.js 2>&1 | tail -3
```

Expected: `review.md` ≤ ~37 500 bytes and the sub-file ≤ ~5 000; headings 3.6/3.7/3.8 all present in order; the pointer found; "Never write the line empty" count = `review.md:0` and `review-seed-capture.md:1` (moved, not duplicated); `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add skills/design-wrapper/modes/review.md skills/design-wrapper/modes/review-seed-capture.md
git commit -m "Extract review Step 3.6's seed-capture body to modes/review-seed-capture.md — review.md was 62 B under its 40 KB ceiling and #601 needs terminal-track headroom (IL-70 split-by-unit) — refs #601"
```

---

### Task 4: The terminal track — `terminal-routing.md` + wrapper tables + trust-rule clause + diagram line

**Files:**
- Create: `skills/design-wrapper/terminal-routing.md`
- Modify: `skills/design-wrapper/SKILL.md` (Layer 2 table, track-resolution table, disagreement paragraph, Layer 3 track table, one pointer sentence, Reference sub-files bullet)
- Modify: `skills/design-wrapper/impeccable-plugin.md:209` (`setup.platform` trust-rule clause)
- Modify: `skills/design-wrapper/frontend-detection.md:98` region (flow-diagram line)

**Interfaces:**
- Consumes: Task 1's `_shared/terminal-ux.md` path.
- Produces: track value `terminal` (Task 5's critics row and mode clauses key on it); the outcomes table Task 6 documents.

- [ ] **Step 1: Create `skills/design-wrapper/terminal-routing.md`**

Content, exactly:

````markdown
# Terminal Routing — everything downstream of a `terminal` track result

Sibling of `native-routing.md`, loaded only when track resolution returns `terminal` (see
`SKILL.md`'s track table) — a web or native run never needs it. The track exists for this
repository's own kind of surface: CLI/TUI help text, output formatting, colour/TTY degradation,
progress feedback, error-message craft, exit codes. It is **declared-only** (`Surface: terminal`
on the record) — Layer 3's sniff has no terminal trigger by design: a repo full of `.js` files
with a CLI entry point would otherwise be sniffed as terminal on every diff.

## Why `Surface:` wins on this track

`setup.platform` describes Impeccable's rendered-product platform, and its closed value domain
(`web`/`ios`/`android`/`adaptive`/`null` — `impeccable-plugin.md`) has no terminal value: a
non-null `platform` against `Surface: terminal` is a category mismatch, not a contradiction to
arbitrate. `Surface:` wins; the disagreement is still recorded in `surface_track_override` and,
when `$PIPELINE_RUN_DIR` is set, in `decisions.md` — a stale `PRODUCT.md` never silently redirects
a record's declared surface.

## Terminal-track outcomes

| Mode / step | Outcome |
|---|---|
| `test` | `{skipped: "terminal surface — CLI detector is web-only"}` |
| `live` | `{skipped: "terminal surface — CLI detector is web-only"}` |
| `review` — Impeccable `critique`/`audit` (Step 3) | `{skipped: "terminal surface — upstream has no terminal track"}`; Steps 3.5–3.7 have nothing to read and do not run. **Step 3.8 critics still run** — the terminal critic is `_shared/terminal-ux.md` per `critics.md`'s terminal row, resolved at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md` (plugin-authored — no two-path lookup, never absent). No decisions layer is inlined on this track — (e) item 3 carries the literal absence sentence, and terminal critics emit `code` rows only, so Step 5.5 never sees a terminal `decisions` finding and the remedy table is unreachable here. |
| `polish` — refinement set, suggestion-driven, intent-driven | Skipped — `"terminal surface — upstream has no terminal track"`. The craft-context assembly still carries `_shared/terminal-ux.md` (see `skills/flow/polish-execution.md`), so a future terminal-capable dispatch inherits it. |
| `survey` | Skipped — same reason. |
| `pre-build` | **Runs.** The always-load set is `_shared/terminal-ux.md` plus `_shared/design-craft.md` (the contract file) only — no Impeccable references, no Emil skills, no `DESIGN.md`/sidecar read; `missed` stays empty (nothing on this track has an install to miss). |
| `shape`, `explore` | **N/A — never read `Surface:`** (structurally inapplicable per `SKILL.md`'s mode notes; unaffected by this track). |
| `doctor` | **Unchanged** — track-independent by `SKILL.md`'s own note; no `doctor` outcome depends on which track resolved. |

## Revisit condition

The Impeccable skips above are honest, not permanent. When `tools/upstream-drift`'s capability
triage surfaces a terminal/CLI reference or track in Impeccable's `reference/` tree, re-open this
table — file a record; never silently flip a row.
````

- [ ] **Step 2: SKILL.md — six small additions**

1. Layer 2 table: after the `| \`backend\`, \`infra\` | Return …` row, add: `| \`terminal\` | Continue to track resolution (declared-only — Layer 3 never implies it) |`
2. Track-resolution table: after the `| \`null\` | \`mobile\` | **native** | \`adaptive\`, **inferred** |` row, add: `| any | \`terminal\` | **terminal** | — |`
3. Disagreement paragraph: append this sentence to the `**Disagreement is recorded, never silent.**` paragraph: `On the \`terminal\` row \`Surface:\` wins — \`setup.platform\` describes Impeccable's rendered-product platform, whose value domain has no terminal value; a non-null \`platform\` against \`Surface: terminal\` is still recorded in \`surface_track_override\` and \`decisions.md\`, with \`Surface:\` named as the winner.`
4. Immediately after that paragraph, add on its own line: `When the track resolves \`terminal\`, read \`terminal-routing.md\` — every terminal-track outcome (honest Impeccable skips, \`pre-build\`'s principles-only load) lives there.`
5. Layer 3 track table: after the `| native | *(missing)* | Runs. …` row, add: `| terminal | declared | **Skipped** — declared-only; no terminal trigger exists in the sniff table by design |`
6. Reference sub-files list: after the `native-routing.md` bullet, add: `- \`terminal-routing.md\` — Everything downstream of a **terminal** track result: the outcomes table (Impeccable skips with reasons, \`pre-build\`'s principles-only load), the \`Surface:\`-wins reasoning, the revisit condition. Loaded only when track resolution returns \`terminal\`.`

- [ ] **Step 3: impeccable-plugin.md trust-rule clause**

In the `| \`setup.platform\` |` row (line ~209), change `**Authoritative when non-null**, including against a record's own \`Surface:\` line — but never silently:` to `**Authoritative when non-null**, including against a record's own \`Surface:\` line — except on the \`terminal\` track, where \`Surface:\` wins (\`SKILL.md\`'s track table; the disagreement is still named in \`surface_track_override\`) — but never silently:`

- [ ] **Step 4: frontend-detection.md diagram line**

In the flow diagram, after the line `    ├─ web / mobile / desktop → continue`, add: `    ├─ terminal               → track terminal (declared only; no sniff)`

- [ ] **Step 5: Verify**

```bash
wc -c skills/design-wrapper/SKILL.md
grep -n "| any | \`terminal\` | \*\*terminal\*\* | — |" skills/design-wrapper/SKILL.md
grep -n "terminal-routing.md" skills/design-wrapper/SKILL.md | wc -l
grep -n "except on the \`terminal\` track" skills/design-wrapper/impeccable-plugin.md
grep -n "track terminal (declared only" skills/design-wrapper/frontend-detection.md
grep -n "revisit\|re-open" skills/design-wrapper/terminal-routing.md
grep -n "CLI detector is web-only\|upstream has no terminal track" skills/design-wrapper/terminal-routing.md | wc -l
git diff -U0 skills/design-wrapper/native-routing.md | wc -l
node --test tests/bin-lib/skill-audit/context-cost.test.js tests/skill-catalog-completeness.test.js tests/skill-conventions.test.js 2>&1 | tail -3
```

Expected: SKILL.md ≤ 40 850 and < 40 960 (additions budgeted ≈ 950 B on a 39 787 B base — if over 40 850, tighten the disagreement sentence and bullet, never drop a row); the track row found; `terminal-routing.md` ≥ 2 lines in SKILL.md (pointer + bullet); the trust clause found; the diagram line found; the revisit grep ≥ 1; the reason strings ≥ 4 lines; `native-routing.md` diff empty (0 lines); `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/design-wrapper/terminal-routing.md skills/design-wrapper/SKILL.md skills/design-wrapper/impeccable-plugin.md skills/design-wrapper/frontend-detection.md
git commit -m "Add the terminal track — terminal-routing.md outcomes table, SKILL.md Layer-2/track/Layer-3 rows with Surface-wins disagreement sentence, setup.platform carve-out, diagram line — refs #601"
```

---

### Task 5: Wire the consumers — `critics.md` row, `review.md` Step 3.8 clause, `pre-build.md`, `polish-execution.md`

**Files:**
- Modify: `skills/design-wrapper/critics.md` (fill the `terminal` row; one Resolution-section clause)
- Modify: `skills/design-wrapper/modes/review.md` (one clause in Step 3.8 (d))
- Modify: `skills/design-wrapper/modes/pre-build.md` (terminal-track paragraph in Step 3)
- Modify: `skills/flow/polish-execution.md` (one sentence in the craft-context bullet)

**Interfaces:**
- Consumes: Task 1's principles file, Task 4's track value + routing file.
- Produces: the filled critic row #598's Step 3.8 (b) selects from.

- [ ] **Step 1: critics.md — fill the terminal row**

Replace the row `| \`terminal\` | *pending* | Filled by #601 (edits this row in place) |` with:

```markdown
| `terminal` | `_shared/terminal-ux.md` | Lever `full` → every terminal-track diff; `auto` → the record's spec/description names CLI/TTY UX work — help/usage text, CLI output formatting or `--json`/quiet/verbose modes, progress/spinner output, error messages or exit codes, interactive prompts — or carries a `Design-intent:` line (value other than `none`); consumer judgment, the same posture as `design-craft.md`'s motion signal; `off` → never. No decisions layer on this track — the critic emits `code` rows only |
```

Then, in the `## Resolution` section, append this sentence: `The one exception is the \`terminal\` row: \`_shared/terminal-ux.md\` is plugin-authored and resolves at \`${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md\` — no two-path lookup, never absent.`

- [ ] **Step 2: review.md Step 3.8 (d) clause**

In sub-step `**(d) Decisions layer.**`, after the sentence ending `they are inlined into every critic's prompt in (e).`, insert: `On \`surface_track === "terminal"\`, skip this resolution — no decisions layer is inlined; (e) item 3 sends the literal absence sentence, and the critic resolves at the plugin path per \`../terminal-routing.md\`.` Then run `wc -c skills/design-wrapper/modes/review.md` — MUST be < 40 900 (Task 3 freed the room; if this fails, STOP and report BLOCKED).

- [ ] **Step 3: pre-build.md terminal paragraph**

In `### Step 3: Decide which Impeccable references to load`, immediately after the `> **Parallel execution:**` blockquote, insert:

```markdown
**Terminal track (`surface_track === "terminal"` — see `../terminal-routing.md`):** the always-load
set is `_shared/terminal-ux.md` plus `_shared/design-craft.md` only — no Impeccable references, no
Emil skills, no `PRODUCT.md`/`DESIGN.md`/sidecar read; `missed` stays empty (nothing on this track
has an install to miss). Skip the keyword rules and Steps 4–5 below for this track.
```

- [ ] **Step 4: polish-execution.md sentence**

In the craft-context bullet (the one this run already extended for #599), append: ` On the terminal track the assembly is \`_shared/terminal-ux.md\` + \`_shared/design-craft.md\` only — no Emil skills, no motion add-on (see \`skills/design-wrapper/terminal-routing.md\`).`

- [ ] **Step 5: Verify**

```bash
grep -n "| \`terminal\` | \`_shared/terminal-ux.md\` |" skills/design-wrapper/critics.md
grep -n "\*pending\*" skills/design-wrapper/critics.md
grep -n "never absent" skills/design-wrapper/critics.md
grep -n "surface_track === \"terminal\"" skills/design-wrapper/modes/review.md skills/design-wrapper/modes/pre-build.md | wc -l
wc -c skills/design-wrapper/modes/review.md
grep -n "terminal-ux.md" skills/flow/polish-execution.md
node --test tests/subagent-contract-clauses.test.js tests/bin-lib/skill-audit/context-cost.test.js 2>&1 | tail -3
```

Expected: the filled row found; `*pending*` gone (no output); the Resolution clause found; the track guard ≥ 2 lines; review.md < 40 900; polish-execution mentions the file; `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/design-wrapper/critics.md skills/design-wrapper/modes/review.md skills/design-wrapper/modes/pre-build.md skills/flow/polish-execution.md
git commit -m "Wire the terminal critic and writing-context consumers — critics.md row filled with plugin-path resolution, review Step 3.8 terminal clause, pre-build principles-only load, polish-execution assembly note — refs #601"
```

---

### Task 6: Docs edges + the terminal-track conformance test

**Files:**
- Modify: `docs/skill-graph.md` (rows under `## design-wrapper` and `## flow`), `docs/plugin-structure.md` (`_shared` row + design-wrapper row)
- Create: `tests/terminal-track.test.js`

**Interfaces:**
- Consumes: everything Tasks 1–5 shipped.
- Produces: the durable pins.

- [ ] **Step 1: skill-graph rows**

Under `## design-wrapper`, add a row (alphabetical by Target — `_shared/terminal-ux.md` sorts first): `| \`_shared/terminal-ux.md\` | \`pre-build\` mode's terminal-track always-load set and \`review\` mode Step 3.8's terminal critic both inline it whole (plugin-authored principles source; resolution and outcomes in \`terminal-routing.md\`). |`

Under `## flow`, add: `| \`_shared/terminal-ux.md\` | \`polish-execution.md\`'s craft-context assembly carries it (with \`_shared/design-craft.md\`) on the terminal track — no Emil skills, no motion add-on. |`

- [ ] **Step 2: plugin-structure rows**

In the `_shared` row's file list, add `terminal-ux.md` (alphabetical position) and append to its description: `; plugin-authored terminal-UX principles (\`terminal-ux.md\`), inlined whole as writing context and the terminal critic`. In the design-wrapper row's file list, add `terminal-routing.md` after `native-routing.md`, and append to the description: `; the terminal track's outcomes table and Surface-wins reasoning (\`terminal-routing.md\`), loaded only when that track resolves`.

- [ ] **Step 3: Create `tests/terminal-track.test.js`**

```js
'use strict';
// Pins #601's terminal track: the Surface enum lists `terminal` at every
// enumeration site, and the two new files exist within their stated budgets.
// The enum sites are prose, so these are content-anchored greps, not parsers —
// case-sensitive on the literal token lists the sites actually carry.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('every Surface enumeration site lists terminal', () => {
  const sites = [
    ['skills/specify/spec-template.md', 'Surface: {web | mobile | desktop | backend | infra | terminal}'],
    ['skills/specify/SKILL.md', '--surface <web|mobile|desktop|backend|infra|terminal>'],
    ['skills/flow/materialize.md', 'surface: {web|mobile|desktop|backend|infra|terminal}'],
    ['skills/flow/materialize.md', 'Surface: {web | mobile | desktop | backend | infra | terminal}'],
  ];
  for (const [file, literal] of sites) {
    assert.ok(read(file).includes(literal), `${file} is missing the terminal-inclusive enum literal: ${literal}`);
  }
  // The retired five-value spellings must be gone everywhere under skills/.
  const fiveValue = /web \| mobile \| desktop \| backend \| infra}|web\|mobile\|desktop\|backend\|infra>/;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md') && fiveValue.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'skills'));
  assert.deepStrictEqual(offenders, [], `enum sites still carrying the five-value spelling: ${offenders.join(', ')}`);
});

test('terminal-ux.md exists, stays under its 8 KB inline budget, and carries the six sections', () => {
  const p = path.join(ROOT, 'skills', '_shared', 'terminal-ux.md');
  assert.ok(fs.existsSync(p), 'skills/_shared/terminal-ux.md is missing');
  const bytes = fs.statSync(p).size;
  assert.ok(bytes < 8192, `terminal-ux.md is ${bytes} B — it is inlined whole into dispatch prompts; 8192 is the gate`);
  const md = fs.readFileSync(p, 'utf8');
  assert.strictEqual((md.match(/^## /gm) || []).length, 6, 'terminal-ux.md must carry exactly its six principle sections');
});

test('terminal-routing.md exists and names the honest-skip outcomes', () => {
  const md = read('skills/design-wrapper/terminal-routing.md');
  assert.match(md, /CLI detector is web-only/);
  assert.match(md, /upstream has no terminal track/);
  assert.match(md, /re-open this\ntable|re-open this table/, 'the revisit condition must be recorded');
});
```

- [ ] **Step 4: Verify**

```bash
node --test tests/terminal-track.test.js 2>&1 | tail -3
grep -c "terminal-ux" docs/skill-graph.md
grep -n "terminal-ux\|terminal-routing" docs/plugin-structure.md | wc -l
node --test tests/skill-catalog-completeness.test.js tests/claude-md-budget.test.js 2>&1 | tail -3
```

Expected: new test `# fail 0`; skill-graph count ≥ 2; plugin-structure ≥ 2 lines; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add docs/skill-graph.md docs/plugin-structure.md tests/terminal-track.test.js
git commit -m "Document the terminal track's edges and pin it — skill-graph rows for terminal-ux.md, plugin-structure roster, terminal-track conformance test — refs #601"
```
