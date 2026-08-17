# /challenge Bare-#N Evidence-or-Accept-Risk Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third, human-invoked bare-`#N` input form to `/claude-tweaks:challenge` — the evidence-or-accept-risk call on a `solution:unjustified` record — and flip every needs-you launcher site from the `--lens=1 #N` proxy back to `#N`.

**Architecture:** All-markdown change plus one conformance test. The new mode lives beside `framing-check` and `--lens` in `skills/challenge/SKILL.md`; five launcher sites and three doc surfaces flip/describe the form; one orphaned plan file is deleted so the retirement sweep passes.

**Tech Stack:** Markdown skill files, `node --test` conformance suites, `gh` CLI shapes documented in prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T074020-spec-726-727/spec-726/work/726-spec.md`

## Global Constraints

- Read `docs/skill-authoring.md` before editing any `skills/**/*.md` (CLAUDE.md convention).
- `skills/challenge/SKILL.md` must keep: the `> **Interaction style:**` directive, the `Lifecycle: ` one-line marker, no fenced block within 15 lines after the H1, no "YOU ARE HERE" (pinned by `tests/skill-conventions.test.js`).
- `skills/help/reference-card.md`'s Takes column is pinned byte-for-byte to each skill's `argument-hint` (`tests/reference-card-argument-hint.test.js`) — any argument-hint change lands with its card cell in the same commit.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- New prose must NOT contain the literal `challenge --lens=1 #` (the retirement sweep in Task 4 greps for it).
- `solution:unjustified` stays non-gating (#471) — the new mode is a remedy surface, never a gate.
- Commit messages end with `refs #726` (never `closes`/`fixes` — the PR body carries the closing keyword).

---

### Task 1: Add the bare-`#N` mode to `skills/challenge/SKILL.md` (+ card sync + conformance pin)

**Files:**
- Modify: `skills/challenge/SKILL.md`
- Modify: `skills/help/reference-card.md:23` (Takes cell, byte-pinned to argument-hint)
- Test: `tests/skill-conventions.test.js` (append one test)

**Interfaces:**
- Produces: `skills/challenge/SKILL.md` `## Input` names three mutually exclusive forms; a `## Mode: bare \`#N\` (evidence-or-accept-risk)` section exists. Tasks 2–3 describe this mode from launcher/doc sites — the vocabulary they use ("evidence-or-accept-risk mode", "either resolving choice clears the label") matches this section.

- [ ] **Step 1: Write the failing conformance test**

Append to `tests/skill-conventions.test.js` (file end, after the last existing test, using the file's existing `read(name)` helper — it reads `skills/{name}/SKILL.md`):

```js
test('challenge SKILL.md Input section names all three input forms', () => {
  const body = read('challenge');
  const input = body.split(/^## Input$/m)[1].split(/^## /m)[0];
  assert.ok(/framing-check/.test(input), 'Input section must name framing-check');
  assert.ok(/bare record reference/.test(input), 'Input section must name the bare record-reference form');
  assert.ok(/--lens=/.test(input), 'Input section must name --lens');
});
```

If the file's helper is named differently, match the file's own conventions exactly — the assertion content above is the contract, not the helper name.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/skill-conventions.test.js`
Expected: the new test FAILS ("Input section must name the bare record-reference form"); every pre-existing test passes.

- [ ] **Step 3: Edit `skills/challenge/SKILL.md`**

3a. Frontmatter — replace:

```yaml
description: Use when /specify needs a content-aware verdict on whether a record bakes in its own solution, or to stress-test a problem framing through a named debiasing lens. Keywords - framing, debias, assumptions, solution-baked, reframe, lens.
argument-hint: "framing-check | --lens=<n[,n...]> <#n|topic|problem statement>"
```

with:

```yaml
description: Use when /specify needs a content-aware verdict on whether a record bakes in its own solution, to run the evidence-or-accept-risk call on a solution:unjustified record, or to stress-test a problem framing through a named debiasing lens. Keywords - framing, debias, assumptions, solution-baked, evidence, accept risk, reframe, lens.
argument-hint: "framing-check | #<n> | --lens=<n[,n...]> <#n|topic|problem statement>"
```

3b. Intro paragraph (under the H1) — replace:

```markdown
Two-mode skill. `framing-check` is an inline component mode that judges whether a work record bakes in its own solution. `--lens` is a human-invoked escape hatch that applies a named debiasing lens to a problem you want stress-tested.
```

with:

```markdown
Three-mode skill. `framing-check` is an inline component mode that judges whether a work record bakes in its own solution. A bare `#N` record reference is the human-invoked evidence-or-accept-risk call on a record carrying `solution:unjustified`. `--lens` is a human-invoked escape hatch that applies a named debiasing lens to a problem you want stress-tested.
```

3c. `## When to Use` — after the `framing-check` bullet, insert:

```markdown
- **bare `#N`** — a record carries `solution:unjustified` and you want the one-step call: per-assumption evidence findings, then supply evidence or accept the risk. Invoked directly by a human (the backlog needs-you lane composes this launcher), never by a pipeline.
```

3d. `## Input` — replace the first two paragraphs:

```markdown
`$ARGUMENTS` is either the literal `framing-check`, or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The two forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory.
```

with:

```markdown
`$ARGUMENTS` is the literal `framing-check`, a bare record reference (`#42`), or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The three forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory. A bare record reference with no `--lens=` prefix selects the evidence-or-accept-risk mode below.
```

Then extend the existing `--lens` resolution paragraph's first sentence from `For --lens, resolve the target the same way ...` to `For --lens and the bare record-reference form, resolve the target the same way ...`, and inside it change the fetch shape `gh issue view {n} --json title,body` to `gh issue view {n} --json title,body,labels` with the trailing note `(the bare form needs `labels`; `--lens` ignores them)`.

3e. Insert a new mode section between `## Mode: framing-check`'s end and `## Mode: --lens`:

```markdown
## Mode: bare `#N` (evidence-or-accept-risk)

**Human-invoked** — the remedy surface for a `solution:unjustified` record. `skills/backlog/overview-mode.md`'s Needs-you lane and `skills/backlog/refine-lanes.md`'s Needs-you section compose this launcher; a human can also run it directly. Not a gate: `solution:unjustified` stays non-gating (#471's decision) — records build fine with the label on; this mode is how a human clears or accepts it.

### Step 1: Resolve and gate

Fetch the record per the Input section's resolution (labels included). If the labels carry neither `solution:unjustified` nor the pre-rename spelling `framing:baked`, report that the record has no unjustified-solution flag and stop — a general assumptions pass on an unflagged record is Lens 1's job, not this mode's.

### Step 2: Read the assumptions

Collect the assumption bullets `framing-check` wrote into the body's `## Gotchas` section — each a claim plus its validation status (e.g. "assumes read volume is the bottleneck (unvalidated — no profile cited)"). When `## Gotchas` is missing or carries no assumption-shaped bullets, derive the assumption list fresh from the body using `framing-check`'s own Step 2 signals, and say so in the rendering — the record was flagged before the Gotchas-writing behavior shipped, or the section was hand-edited away.

### Step 3: Bounded evidence search

One pass, in-repo only, in the main thread — no subagents. Caps, stated so the call stays one step: at most 3 `Grep` searches and 2 file reads per assumption, at most 12 search operations for the whole record. For each assumption, look for evidence that validates or contradicts it — measurements in docs, existing implementations, tests, incident-log entries. Classify each: `supported` (cite `file:line`), `contradicted` (cite `file:line`), or `no evidence found`; a cap exhausted mid-assumption reports `no evidence found (cap reached)`. This is a screening pass, not a verification subsystem — exhausting a cap is a normal outcome, never a reason to keep searching.

### Step 4: Render and decide

Render one table — assumption | classification | citation — then call `AskUserQuestion` once:

- `question`: `"Evidence findings are above — supply them to the record, accept the risk, or leave the label in place?"`, `header`: `"Evidence call"`, `multiSelect`: `false`
- Option 1 — `label`: `"Supply evidence (Recommended)"`, `description`: `"Append the findings under ## Gotchas and remove solution:unjustified."` (Recommended only when at least one assumption classified `supported` or `contradicted`; otherwise Option 2 takes the Recommended tag.)
- Option 2 — `label`: `"Accept the risk"`, `description`: `"Post an acceptance comment and remove the label — the assumptions stand unvalidated."`
- Option 3 — `label`: `"Leave it"`, `description`: `"No writes; the label stays."`

On **supply evidence**: append one bullet per assumption under `## Gotchas` — `- evidence ({YYYY-MM-DD}): {classification} — {citation, or "none found"}` — by composing the full updated body and writing it once (`gh issue edit {n} --body-file {tmp}` under `github-issues`; edit the record file under `local-files`). Then remove the label: `gh issue edit {n} --remove-label "solution:unjustified"`, adding `--remove-label "framing:baked"` when the pre-rename spelling is what the record carries — either spelling clears, the same promotion-time cleanup idiom as `skills/specify/shaping-mode.md`'s compose-then-write-once pass.

On **accept the risk**: post a comment naming each assumption accepted and stating the acceptance (`gh issue comment {n} --body-file {tmp}`), then the same label removal.

On **leave it**: no writes. Next Actions still renders.
```

3f. `## Next Actions` — replace its opening line:

```markdown
Rendered only for `--lens` invocations (see Component-Skill Contract). Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):
```

with:

```markdown
Rendered for `--lens` and bare-`#N` invocations (see Component-Skill Contract). Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention). After a bare-`#N` run, the first line below is the recommended move (re-shaping confirms the clean state after a resolving choice, and is the shaping route when the label was left in place); after `--lens`, the brainstorming line is:
```

and insert as the new first handoff line:

```markdown
**`/claude-tweaks:specify {ref}`** — re-shape the record; `framing-check` re-runs and confirms the clean state (recommended after a bare-`#N` run)
```

then drop the trailing existing line `` `/claude-tweaks:specify {ref}` — shape this record into spec shape; framing-check runs automatically as part of it `` (superseded by the line just added; keep the brainstorming and lens lines).

3g. `## Component-Skill Contract` — after the `--lens` paragraph, insert:

```markdown
Bare `#N` is likewise **always** human-invoked and always renders `## Next Actions`. No pipeline orchestrator calls it — a pipeline that wants a framing judgment calls `framing-check`.
```

3h. `## Anti-Patterns` — append rows:

```markdown
| Dispatching the bare-`#N` evidence search to subagents | The search is capped and in-repo; a fan-out pays dispatch overhead precisely to break the caps that keep this a one-step call. |
| Escalating the evidence search past its stated caps "to be thorough" | The caps are the contract — this is a screening pass; deep verification is a different tool's job. |
| Treating `solution:unjustified` as a gate in the bare-`#N` mode | #471's decision stands: non-gating. The mode is the remedy surface — records build fine with the label on. |
```

- [ ] **Step 4: Sync the reference card's Takes cell**

In `skills/help/reference-card.md` line 23, replace the Takes cell `framing-check \| --lens=<n[,n...]> <#n\|topic\|problem statement>` with `framing-check \| #<n> \| --lens=<n[,n...]> <#n\|topic\|problem statement>` — match the cell's existing pipe-escaping convention exactly (the pin test strips escapes before comparing byte-for-byte with the frontmatter).

- [ ] **Step 5: Run the pinned suites**

Run: `node --test tests/skill-conventions.test.js tests/reference-card-argument-hint.test.js tests/argument-hint-input.test.js`
Expected: PASS (including the new three-forms test).

- [ ] **Step 6: Commit**

```bash
git add skills/challenge/SKILL.md skills/help/reference-card.md tests/skill-conventions.test.js
git commit -m "Add bare-#N evidence-or-accept-risk mode to /challenge — refs #726"
```

---

### Task 2: Flip the five needs-you launcher sites to the bare form

**Files:**
- Modify: `skills/backlog/overview-mode.md:347,354`
- Modify: `skills/backlog/refine-lanes.md:242`
- Modify: `skills/backlog/SKILL.md:77`
- Modify: `docs/journeys/triage-backlog-via-funnel-overview.md:45`
- Modify: `docs/journeys/refine-the-backlog-through-decision-lanes.md:40`

**Interfaces:**
- Consumes: Task 1's mode vocabulary ("evidence-or-accept-risk mode", "either resolving choice clears the label").
- Produces: every needs-you launcher reads `/claude-tweaks:challenge #{N}` (or `#{n}` / `#N` per site convention).

- [ ] **Step 1: `skills/backlog/overview-mode.md` — flip the launcher bullet (line 347)**

Replace:

```markdown
- `kind: 'unjustified'` → `/claude-tweaks:challenge --lens=1 #{N}` (Lens 1, Surface Hidden Assumptions — the human's evidence pass; that mode's own Next Actions route to `/claude-tweaks:specify #{N}`, which re-runs `framing-check` and clears the label on an `open` verdict) with a `#`-comment naming the one-line call (e.g. `# solution:unjustified — one-line evidence-or-accept-risk call; re-run /claude-tweaks:specify #{N} to clear`)
```

with:

```markdown
- `kind: 'unjustified'` → `/claude-tweaks:challenge #{N}` (the evidence-or-accept-risk mode — reads the record's `## Gotchas` assumptions, runs a bounded in-repo evidence search, and offers supply-evidence / accept-risk / leave in one call; either resolving choice clears the label) with a `#`-comment naming the one-line call (e.g. `# solution:unjustified — one-line evidence-or-accept-risk call`)
```

- [ ] **Step 2: `skills/backlog/overview-mode.md` — retire the caveat paragraph (line 354)**

Delete this whole paragraph (the record's own deliverable retires it — the deferred mode now exists):

```markdown
The `kind: 'unjustified'` launcher carries no interim caveat: `/challenge` has no bare-`#{N}` mode, so the lane emits the `--lens=1 #{N}` form it accepts today (an input `/claude-tweaks:challenge` already resolves the same way `/claude-tweaks:capture` resolves a `#{n}` reference) rather than a command that fails at invocation. A dedicated evidence-or-accept-risk mode for `/challenge`, if ever wanted, is a separate record and would swap the form here.
```

Leave the surrounding blank-line structure intact (one blank line between the `**Cap + pointer:**` paragraph and the `Needs you stays the last **rendered** section` paragraph).

- [ ] **Step 3: `skills/backlog/refine-lanes.md` — flip the Needs-you launcher (line 242)**

Replace:

```markdown
- `solution:unjustified` confirmation → `/claude-tweaks:challenge --lens=1 #{n}` (the human-invoked form `/challenge` accepts; its own Next Actions route to `/claude-tweaks:specify #{n}`, which re-runs `framing-check` and clears the label on an `open` verdict), with a `#`-comment naming the
  one-line evidence call pending.
```

with:

```markdown
- `solution:unjustified` confirmation → `/claude-tweaks:challenge #{n}` (the evidence-or-accept-risk mode: per-assumption evidence findings, then supply-evidence / accept-risk / leave — either resolving choice clears the label), with a `#`-comment naming the
  one-line evidence call pending.
```

- [ ] **Step 4: `skills/backlog/SKILL.md` — flip the Next Actions launcher placeholder (line 77)**

Replace:

```markdown
`{the top item's launcher — /claude-tweaks:specify #N or /claude-tweaks:challenge --lens=1 #N}` — the one move only the human can make — omit this line when `needsYou` is empty
```

with:

```markdown
`{the top item's launcher — /claude-tweaks:specify #N or /claude-tweaks:challenge #N}` — the one move only the human can make — omit this line when `needsYou` is empty
```

- [ ] **Step 5: Flip both journeys**

`docs/journeys/triage-backlog-via-funnel-overview.md` line 45 — replace the fragment:

```markdown
`/claude-tweaks:challenge --lens=1 #N` for `solution:unjustified` evidence calls — a form `/challenge` accepts today, whose own Next Actions route back to `/claude-tweaks:specify #N` to clear the label on an `open` verdict)
```

with:

```markdown
`/claude-tweaks:challenge #N` for `solution:unjustified` evidence calls — the evidence-or-accept-risk mode that resolves the label in one step)
```

`docs/journeys/refine-the-backlog-through-decision-lanes.md` line 40 — replace the fragment:

```markdown
`/claude-tweaks:challenge --lens=1 #{n}` for a `solution:unjustified` confirmation
```

with:

```markdown
`/claude-tweaks:challenge #{n}` for a `solution:unjustified` confirmation
```

- [ ] **Step 6: Verify the flips landed (skills + journeys only)**

Run: `grep -rn -- 'challenge --lens=1 #' skills docs/journeys`
Expected: no output (exit 1).

- [ ] **Step 7: Commit**

```bash
git add skills/backlog/overview-mode.md skills/backlog/refine-lanes.md skills/backlog/SKILL.md docs/journeys/triage-backlog-via-funnel-overview.md docs/journeys/refine-the-backlog-through-decision-lanes.md
git commit -m "Flip needs-you launchers to bare /challenge #N form — refs #726"
```

---

### Task 3: Doc surfaces — skill-graph rows, getting-started, orphaned-plan deletion

**Files:**
- Modify: `docs/skill-graph.md:49,100`
- Modify: `docs/getting-started.md:62`
- Delete: `docs/superpowers/plans/2026-08-16-record-677-solution-unjustified-rename.md`

**Interfaces:**
- Consumes: Task 1's mode vocabulary.

- [ ] **Step 1: `docs/skill-graph.md` — update both reciprocal rows**

Line 49, replace:

```markdown
| `/challenge` | `overview`'s bare-mode Needs-you lane composes a `/claude-tweaks:challenge --lens=1 #{N}` launcher as a paste line for `kind: 'unjustified'` records (live since #677's rename; `--lens` is the human-invoked form `/challenge` accepts); `/backlog` never invokes `/challenge` itself, only writes the command for a human to run. Reciprocal of `/challenge`'s own `/backlog` row. |
```

with:

```markdown
| `/challenge` | `overview`'s bare-mode Needs-you lane composes a `/claude-tweaks:challenge #{N}` launcher as a paste line for `kind: 'unjustified'` records (the bare-`#N` evidence-or-accept-risk mode, live since #726); `/backlog` never invokes `/challenge` itself, only writes the command for a human to run. Reciprocal of `/challenge`'s own `/backlog` row. |
```

Line 100, replace:

```markdown
| `/backlog` | `overview`'s bare-mode Needs-you lane *composes* a `/claude-tweaks:challenge --lens=1 #{N}` launcher as a paste line for `kind: 'unjustified'` records (live since #677's rename) — this is text for a human to run, not an invocation; `/specify` above remains the only skill that actually calls `/challenge`. Reciprocal of `/backlog`'s own `/challenge` row. |
```

with:

```markdown
| `/backlog` | `overview`'s bare-mode Needs-you lane *composes* a `/claude-tweaks:challenge #{N}` launcher as a paste line for `kind: 'unjustified'` records (the bare-`#N` evidence-or-accept-risk mode, live since #726) — this is text for a human to run, not an invocation; `/specify` above remains the only skill that actually calls `/challenge`. Reciprocal of `/backlog`'s own `/challenge` row. |
```

- [ ] **Step 2: `docs/getting-started.md` — name the third form (line 62)**

Append to the `**/claude-tweaks:challenge**` paragraph (after its final sentence "— it writes no file."):

```markdown
A bare `#N` reference is the human-invoked evidence-or-accept-risk call on a record carrying `solution:unjustified` — it reads the record's `## Gotchas` assumptions, runs a bounded in-repo evidence search per assumption, and offers supply-evidence / accept-risk / leave; either resolving choice removes the label (accepting also posts the acceptance as a comment).
```

- [ ] **Step 3: Delete the orphaned #677 plan**

```bash
git rm docs/superpowers/plans/2026-08-16-record-677-solution-unjustified-rename.md
```

Rationale (verified before this plan was written): #677 is CLOSED and shipped; its plan file is an orphan `/wrap-up` should have removed, and it quotes the retired `--lens=1 #{N}` launcher form throughout — Task 4's retirement sweep (and the record's AC 2) cannot pass while it exists.

- [ ] **Step 4: Commit**

```bash
git add docs/skill-graph.md docs/getting-started.md
git commit -m "Describe /challenge bare-#N form in skill graph and getting-started; drop orphaned #677 plan — refs #726"
```

---

### Task 4: Retirement sweep + full verification

**Files:**
- Test: whole repo (read-only sweep + full suite)

- [ ] **Step 1: Retirement sweep (AC 2)**

Run: `grep -rni -- 'challenge --lens=1 #' skills docs --exclude=2026-08-17-record-726-challenge-bare-ref-mode.md`
Expected: no output, exit 1. The one exclusion is THIS plan file, whose Task 1–3 replacing-blocks quote the retired form verbatim; it is deleted at `/wrap-up`'s plan cleanup, after which the record's literal AC-2 grep (no exclusions) passes — state this in the build handoff so wrap-up verifies it post-deletion.

Control scan for wrapped literals (whitespace-spanning): `grep -rzc -- 'challenge --lens=1[[:space:]]*#' skills docs/journeys docs/skill-graph.md docs/getting-started.md`
Expected: every count is 0.

Positive control (the pattern still matches something it should): `grep -rn -- 'challenge --lens=1' skills/help/reference-card.md`
Expected: exactly one hit (line 69, `--lens=1 meal planning` — a legitimate lens example, deliberately untouched).

- [ ] **Step 2: Full suite**

Run: `npm test > /tmp/726-suite.log 2>&1; grep -E '^# (tests|pass|fail|cancelled)' /tmp/726-suite.log`
Expected: `# fail 0`, `# cancelled 0`.

- [ ] **Step 3: Commit (only if the sweep or suite forced a fix)**

```bash
git add -A
git commit -m "Sweep fixes for bare-#N launcher retirement — refs #726"
```

Skip the commit when Steps 1–2 pass with nothing changed.
