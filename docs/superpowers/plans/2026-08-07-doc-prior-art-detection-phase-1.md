# Prior-Art Detection — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:wrap-up` compare its proposed ADR path against what a repo already does, surface any conflict once at the Review Console, and record the answer — so the plugin's convention stays the default without ever leaving two grammars in one directory.

**Architecture:** A new shared contract (`_shared/prior-art-detection.md`) owns the detection procedure and its hard rules. `_shared/diataxis-genre-templates.md` gains a per-genre declaration table saying which genres run detection; only ADR is wired in this phase. `/wrap-up` Step 6.2 runs detection before proposing a path, the Review Console renders a three-way conflict row under its existing per-item-approval precedent, and Step 10 writes the resolved path or executes an approved migration. The answer is recorded in one flat `policy.yml` enum.

**Tech Stack:** Markdown skill files; Node 18+ `node --test` for `bin/lib/policy-schema.js`.

## Global Constraints

- No emojis in skill files — use `**(Recommended)**` bold for emphasis.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- Every relationship between skills is recorded once, in `docs/skill-graph.md` — never restated in a `SKILL.md`.
- Skills carry no Relationship to Other Skills table.
- `.claude-tweaks/policy.yml` parses **flat `key: value` lines only** — no nested values.
- `/claude-tweaks:init` creates only `docs/REGISTRY.md`; it is an assessor, not a writer. Nothing in this plan changes that.
- Detection **reads only**: it never writes a file and never writes the policy key.
- Work from the worktree at `.claude/worktrees/adr-convention-precedence-187`. Before any commit, run `pwd` and `git rev-parse --show-toplevel` and confirm both point there.
- Commit messages: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Use `refs #187`, never a closing keyword.

## File Structure

| File | Responsibility |
|---|---|
| `skills/_shared/prior-art-detection.md` | **New.** The detection procedure, the evidence-split rule, hard rules, recording contract, anti-patterns |
| `skills/_shared/diataxis-genre-templates.md` | Adds the genre declaration table; stays sole owner of the literal ADR skeleton |
| `skills/_shared/decision-records.md` | Owns the gate; states the plugin convention as the plugin's; cites the contract; drops prose that drifted from the skeleton |
| `skills/wrap-up/config-updates.md` | Step 6.2 runs detection and emits the resolved path plus any conflict row |
| `skills/wrap-up/review-console.md` | Renders the conflict row under per-item approval |
| `skills/wrap-up/execution-and-verification.md` | Writes the resolved path; executes an approved migration |
| `skills/wrap-up/SKILL.md` | Step 6 gate line names the new proposal shape |
| `skills/_shared/policy-schema.md`, `bin/lib/policy-schema.js` | `doc-convention.adr` |
| `tests/policy-schema.test.js` | Key coverage and the `POLICY_KEYS.length` pin |
| `docs/skill-graph.md` | Edges for the new shared contract |
| `docs/decisions/0013-*.md` | This decision, in this repo's own form |

---

### Task 1: The prior-art detection contract

**Files:**
- Create: `skills/_shared/prior-art-detection.md`

**Interfaces:**
- Produces: the `prior-art-detection` procedure, referenced by name from Tasks 2, 4, 5 and 7. Its conflict record carries `genre`, `plugin form`, `found form`, `sample filename`, `file count`, `project-skill path`. Its outcomes are `plugin`, `project`, `conflict`.

- [ ] **Step 1: Create the file with this exact content**

````markdown
# Prior-Art Detection for Documentation Genres

Canonical contract for the question no doc-creating path used to ask: **does this repo already have its own convention for the genre I am about to write?**

Read by `/claude-tweaks:wrap-up` Step 6.2 (`wrap-up/config-updates.md`) before it proposes an ADR path. The per-genre declarations it keys off live in `_shared/diataxis-genre-templates.md`.

## Why this exists

The plugin is opinionated about documentation, and should be — its genre conventions are the standard. What it cannot know from outside is whether a repo already had one.

Writing `0017-foo.md` into a directory holding sixteen `ADR-016-...md` files does not make that repo match the plugin's convention. It makes it match neither, with `docs/REGISTRY.md` indexing two grammars. **The failure mode is mixing, not deference.**

Detection does not weaken the opinion. It decides whether the standard lands as a new file or as a migration, and makes the one bad outcome visible before it happens rather than after.

## When this runs

Before a doc-creating path proposes or writes a file in a genre whose declaration in `_shared/diataxis-genre-templates.md` marks detection **active**.

Skip entirely when that genre's answer is already recorded in `.claude-tweaks/policy.yml` — the question was asked and answered, and re-raising it is exactly the mid-flow stop `_shared/auto-mode-contract.md` forbids.

## Procedure

1. **Glob** the intended directory plus the genre's declared aliases.
2. **Fewer than 3 files — no prior art.** Use the plugin's form and emit nothing. An empty or near-empty directory cannot establish a convention, and a one-file sample is exactly where inference misleads.
3. **Parse** the filenames for a grammar: prefix, separator, numbering, zero-pad width. A conflict requires **at least 3 files agreeing** on a grammar that differs from the plugin's. Fewer agreeing, or no parseable grammar, is not a conflict — proceed with the plugin's form.
4. **Look for a project skill** covering the genre: glob `.claude/skills/*/SKILL.md` and read only each file's frontmatter `description` — the same cheap pass `harness-health/library-shape-analysis.md` specifies, not a full-body read. A description matching the genre's declared keywords means that skill states the project's convention for **shape**.
5. **Emit a conflict record** carrying: genre, the plugin's form, the found form, one sample filename, the file count, and the project-skill path when one was found.

Outcomes are `plugin` (no prior art, or prior art that agrees), `project` (a recorded answer says defer), or `conflict` (prior art disagrees and nothing is recorded yet).

## Resolving "project form"

Split by evidence quality, not convenience. These two dimensions do not have comparable support and must not be inferred the same way.

| Aspect | Source | Why |
|---|---|---|
| Filename, location, numbering | The existing corpus | A grammar is mechanically parseable, and a corpus that has one is near-uniform by nature |
| Section and metadata shape | The project skill; the plugin's skeleton when there is none | Section structure drifts within a corpus far faster than filenames do — never infer it from files |

The measured case behind that split: a 16-ADR corpus was 16/16 consistent on filename grammar and 9/5/2 on one heading's casing, with only 5 of 16 carrying a clause its own project skill requires. The same read that gets filenames right gets sections confidently wrong.

## Hard rules

- A computed path that **already exists stops the write**. Never overwrite, and never silently pick the next free name.
- Migration runs only as an **approved, itemized batch**: `git mv` each file, rewrite `docs/REGISTRY.md` rows, then sweep the repo for inbound links to the old basenames.
- Nothing is renamed or renumbered outside an approved migration.
- Section shape is never inferred from a corpus.
- Detection **reads only**. It never writes a file, and never writes the policy key — the approval surface does that.

## Recording the answer

One flat enum key per genre in `.claude-tweaks/policy.yml`, written by the plugin after the user answers once. Never something a project fills in up front. See `_shared/policy-schema.md`'s Documentation section for the key list.

| Value | Meaning |
|---|---|
| unset | Never asked — run detection. |
| `plugin` | Conform forward: the plugin's form for new files. Stop asking. |
| `project` | Resolve form from the project per the table above. Stop asking. |

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Inferring a convention from one or two files | A one-file sample is not a convention — the grammar extracted from it is as likely to be that file's accident |
| Inferring section shape from the corpus | Measured at 31-56% self-consistency where filenames were 100%; the same read produces a confident wrong answer |
| Writing the file and noting the conflict afterward | The point is to be asked before the directory holds two grammars, not after |
| Renaming existing files to match the plugin outside an approved migration | Inbound links, registry rows and portal URLs break silently |
| Re-raising a genre whose answer is already recorded | A set key means the user decided; re-asking every wrap-up is a forbidden mid-flow stop |
| Treating "the plugin has an opinion" as "detection is unnecessary" | The opinion is the default either way; detection only decides how it lands |
````

- [ ] **Step 2: Verify the file carries every required section**

Run:
```bash
grep -c "^## " skills/_shared/prior-art-detection.md
```
Expected: `7`

Run:
```bash
grep -n "at least 3 files agreeing\|already exists stops the write\|never writes the policy key" skills/_shared/prior-art-detection.md
```
Expected: three matching lines.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/prior-art-detection.md
git diff --cached --name-only
git commit -m "Add the prior-art detection contract for documentation genres — refs #187"
```

---

### Task 2: Genre declarations

**Files:**
- Modify: `skills/_shared/diataxis-genre-templates.md` (insert after the second paragraph, before `## Tutorial`)

**Interfaces:**
- Consumes: the contract name from Task 1.
- Produces: the declaration table Task 5 reads to learn ADR's aliases and project-skill keywords.

- [ ] **Step 1: Insert this section immediately before the `## Tutorial` heading**

````markdown
## Genre declarations

What each genre claims about placement and naming, and whether a doc-creating path runs `_shared/prior-art-detection.md` before writing one. "Owns filename" means the plugin prescribes a filename grammar, not merely content.

| Genre | Owns filename | Detection | Aliases to glob | Project-skill keywords |
|---|---|---|---|---|
| Tutorial | no | Phase 2 | — | — |
| How-To | no | Phase 2 | — | — |
| Reference | no | Phase 2 | — | — |
| Explanation | no | Phase 2 | — | — |
| Journey | `docs/journeys/{journey-name}.md` | Phase 2 | `docs/journeys/` | — |
| ADR | `docs/decisions/NNNN-{kebab-slug}.md` | **active** | `docs/decisions/`, `docs/adr/`, `docs/rfcs/` | `adr`, `architecture decision`, `decision record` |

A row marked `Phase 2` declares intent only — **no consumer reads it yet**, and nothing should behave as though one does. Wiring a row means adding its consumer and its `doc-convention.{genre}` key in the same change.
````

- [ ] **Step 2: Verify placement and the no-dangling-promise note**

Run:
```bash
grep -n "^## Genre declarations\|^## Tutorial" skills/_shared/diataxis-genre-templates.md
```
Expected: `Genre declarations` appears on a lower line number than `Tutorial`.

Run:
```bash
grep -c "no consumer reads it yet" skills/_shared/diataxis-genre-templates.md
```
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/diataxis-genre-templates.md
git diff --cached --name-only
git commit -m "Declare per-genre filename ownership and detection status — refs #187"
```

---

### Task 3: The `doc-convention.adr` policy key

**Files:**
- Modify: `bin/lib/policy-schema.js:41` (append after the `autonomy` entry)
- Modify: `tests/policy-schema.test.js:22-23`
- Modify: `skills/_shared/policy-schema.md` (new section)

**Interfaces:**
- Produces: `doc-convention.adr`, an enum of `plugin | project` with **no default**, read by Task 5 and written by Task 7.

- [ ] **Step 1: Write the failing test**

Append to `tests/policy-schema.test.js`:

```javascript
test('doc-convention.adr is an enum with no default — unset means "detect and ask"', () => {
  const key = POLICY_KEYS.find((k) => k.key === 'doc-convention.adr');
  assert.ok(key, 'doc-convention.adr missing from POLICY_KEYS');
  assert.strictEqual(key.type, 'enum');
  assert.deepStrictEqual(key.values, ['plugin', 'project']);
  assert.strictEqual(key.default, undefined, 'unset is a meaningful third state: the question has not been asked yet');

  const repo = tmpRepo();
  writePolicy(repo, 'doc-convention.adr: project\n');
  const ok = auditPolicy(repo);
  assert.deepStrictEqual(ok.invalidValues, []);
  assert.deepStrictEqual(ok.unrecognizedKeys, []);

  const bad = tmpRepo();
  writePolicy(bad, 'doc-convention.adr: whatever-the-repo-does\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, 'a value outside the enum must be flagged');
  assert.strictEqual(result.invalidValues[0].key, 'doc-convention.adr');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `doc-convention.adr missing from POLICY_KEYS`, plus the two pre-existing count assertions still passing at 33.

- [ ] **Step 3: Add the key**

In `bin/lib/policy-schema.js`, after the `autonomy` line (currently line 41), add:

```javascript
  { key: 'doc-convention.adr', type: 'enum', values: ['plugin', 'project'] },
```

- [ ] **Step 4: Update the count pin**

In `tests/policy-schema.test.js`, change both assertions in the `POLICY_KEYS entries are unique` test from `33` to `34`:

```javascript
test('POLICY_KEYS entries are unique', () => {
  assert.strictEqual(POLICY_KEYS.length, 34);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 34);
});
```

- [ ] **Step 5: Run the suite and confirm it passes**

Run: `node --test tests/policy-schema.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Document the key**

In `skills/_shared/policy-schema.md`, add a new section immediately before `## Harness-health budgets`:

```markdown
## Documentation

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `doc-convention.adr` | `policy.yml` | `/claude-tweaks:wrap-up` Step 6.2, via `_shared/prior-art-detection.md` | unset (detect and ask on conflict) | Which convention wins when this repo's existing decision records disagree with the plugin's. `plugin` conforms forward, `project` resolves form from the corpus and any project skill. Written *by* the plugin after the user answers once at the Review Console — never a key a project fills in up front. Records **which source wins**, not a grammar, which is what keeps it flat-encodable |
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js skills/_shared/policy-schema.md
git diff --cached --name-only
git commit -m "Add doc-convention.adr as an unset-by-default enum — refs #187"
```

---

### Task 4: `decision-records.md` stops stating what it cannot know

**Files:**
- Modify: `skills/_shared/decision-records.md:23-29` (the `## Location and filename` section)
- Modify: `skills/_shared/decision-records.md:35` (the duplicated Status prose)

**Interfaces:**
- Consumes: the contract from Task 1.

- [ ] **Step 1: Replace the `## Location and filename` section**

Replace lines 23-29 (from `## Location and filename` through the `Slug describes…` paragraph) with:

````markdown
## Location and filename

```
docs/decisions/NNNN-{kebab-slug}.md
```

`NNNN` is a zero-padded sequence (`0001`, `0002`, …) — find the highest existing number under `docs/decisions/` and increment. Slug describes the decision, not the feature (`0007-soft-delete-accounts`, not `0007-accounts-feature`).

**This is the plugin's convention and the default everywhere.** It is not a claim about what any given repo already does. Before proposing a path, `/claude-tweaks:wrap-up` Step 6.2 runs `_shared/prior-art-detection.md` against `docs/decisions/`: a repo whose existing decision records follow a different grammar gets the conflict surfaced once at the Review Console and the answer recorded in `doc-convention.adr`, rather than a seventeenth file in a seventeenth style. A repo with no decision records, or one already following this convention, never sees a prompt.
````

- [ ] **Step 2: Delete the duplicated Status prose**

Delete this line entirely (currently line 35 — it duplicates the closing lines of `_shared/diataxis-genre-templates.md`'s ADR section, and the two copies have already drifted: "this file's status" vs "its status"):

```
`Status` is `accepted` for a decision being recorded after the fact. If a later ADR overturns this one, change this file's status to `superseded by NNNN` rather than deleting it — the trail is the value.
```

Then extend the preceding `## Template` paragraph's final sentence so the pointer stays explicit — append to it:

```
That skeleton also owns the `Status` value and the supersede form; this file does not restate them.
```

- [ ] **Step 3: Verify the de-assertion landed and the duplicate is gone**

Run:
```bash
grep -n "plugin's convention and the default everywhere" skills/_shared/decision-records.md
```
Expected: one match.

Run:
```bash
grep -c "the trail is the value" skills/_shared/decision-records.md
```
Expected: `0`

Run:
```bash
grep -c "the trail is the value" skills/_shared/diataxis-genre-templates.md
```
Expected: `0` — confirming the surviving copy in the skeleton is the shorter variant, so nothing was deleted from the wrong file.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/decision-records.md
git diff --cached --name-only
git commit -m "State the ADR path as the plugin's convention, not as a fact about the repo — refs #187"
```

---

### Task 5: Step 6.2 runs detection

**Files:**
- Modify: `skills/wrap-up/config-updates.md:35-37`

**Interfaces:**
- Consumes: `_shared/prior-art-detection.md` (Task 1), the ADR row of the declaration table (Task 2), `doc-convention.adr` (Task 3).
- Produces: the `[adr]` row with a resolved path, and the `[adr-convention]` conflict row Task 6 renders and Task 7 executes.

- [ ] **Step 1: Replace numbered item 3 and the collection line**

Replace line 35 (`3. For each decision that passes…`) and line 37 (`→ Collect each as: …`) with:

````markdown
3. **Resolve the path before proposing it.** If `doc-convention.adr` is set in `.claude-tweaks/policy.yml`, use the recorded answer and skip detection entirely. Otherwise read `_shared/prior-art-detection.md` and run its procedure for the `adr` genre against `docs/decisions/` and that genre's declared aliases. The result is a resolved path plus one of three outcomes: `plugin`, `project`, or `conflict`.
4. For each decision that passes the gate, propose creating the resolved path, using the ADR skeleton in `_shared/diataxis-genre-templates.md`.

→ Collect each as: `[adr] {resolved-path} — {decision title}`

→ On a `conflict` outcome, additionally collect exactly one row per run: `[adr-convention] docs/decisions/ — {plugin form} vs {found form} ({N} existing)`. This row requires per-item approval and is **not** covered by "Approve all" (see `review-console.md`). Until it is answered, no ADR row from this run may be written — the resolved path depends on the answer.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "adr-convention\] docs/decisions/" skills/wrap-up/config-updates.md
```
Expected: one match.

Run:
```bash
grep -n "prior-art-detection" skills/wrap-up/config-updates.md
```
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/config-updates.md
git diff --cached --name-only
git commit -m "Run prior-art detection before Step 6.2 proposes an ADR path — refs #187"
```

---

### Task 6: The Console renders the conflict as a three-way choice

**Files:**
- Modify: `skills/wrap-up/review-console.md:304-308` (the Configuration updates section)

**Interfaces:**
- Consumes: the `[adr-convention]` row from Task 5.
- Produces: the approved outcome Task 7 executes.

- [ ] **Step 1: Append this block immediately after the Configuration updates example table (after line 308, before `#### Cleanup actions` at line 310)**

````markdown
An `[adr-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below. Render it as:

```
#15  adr-convention  docs/decisions/  — this repo's decision records disagree with the plugin's convention

     plugin form  : 0017-slack-transport.md
     found (16)   : ADR-016-slack-integration-strategy.md
     project skill: .claude/skills/architecture-decision/SKILL.md

     1  Conform forward   — new files use the plugin's form   -> doc-convention.adr: plugin
     2  Migrate           — rename all 16, fix REGISTRY rows and inbound links
     3  Keep project form — resolve from this repo             -> doc-convention.adr: project
```

Omit the `project skill` line when detection found none. "Approve all" leaves this row unanswered and blocks every `[adr]` row from the same run, since their resolved paths depend on the answer — state that explicitly rather than applying a default.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "adr-convention" skills/wrap-up/review-console.md
```
Expected: matches inside the Configuration updates section only.

Run:
```bash
grep -c "Conform forward" skills/wrap-up/review-console.md
```
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/review-console.md
git diff --cached --name-only
git commit -m "Render the ADR convention conflict as a three-way Console choice — refs #187"
```

---

### Task 7: Step 10 writes the resolved path, or migrates

**Files:**
- Modify: `skills/wrap-up/execution-and-verification.md:18`

**Interfaces:**
- Consumes: the approved outcome from Task 6.
- Produces: the written ADR file, or a migrated corpus, plus the `doc-convention.adr` write.

- [ ] **Step 1: Replace the Decision records bullet**

Replace line 18 in full with:

````markdown
- **Decision records (ADRs)** — write the approved ADR files at the path Step 6.2 resolved (never a path recomputed here), using the ADR skeleton in `_shared/diataxis-genre-templates.md`, and add them to `docs/REGISTRY.md` if a registry exists. **A resolved path that already exists stops that row** — report it and leave the file untouched; never overwrite and never silently take the next free number.
- **ADR convention resolution** — when an `[adr-convention]` row was answered, first write the answer to `.claude-tweaks/policy.yml` as `doc-convention.adr: plugin` or `doc-convention.adr: project` (option 2 records `plugin`, since migration is how the repo conforms). For option 2 only, then execute the migration as one itemized batch: `git mv` each existing file to the plugin's grammar preserving its number, rewrite the matching `docs/REGISTRY.md` rows, and sweep the repo for inbound references to the old basenames (`grep -rl "{old-basename}" --include="*.md" .`) fixing each. Report the file count moved and the reference count rewritten. Never migrate without that row's explicit approval.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "stops that row\|doc-convention.adr: plugin" skills/wrap-up/execution-and-verification.md
```
Expected: two matching lines.

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/execution-and-verification.md
git diff --cached --name-only
git commit -m "Write the resolved ADR path and execute an approved migration — refs #187"
```

---

### Task 8: Step 6 gate line and the skill graph

**Files:**
- Modify: `skills/wrap-up/SKILL.md:139`
- Modify: `docs/skill-graph.md`

- [ ] **Step 1: Update the Step 6 gate line**

In `skills/wrap-up/SKILL.md` line 139, replace the fragment:

```
and the `docs/decisions/NNNN-{slug}.md` proposal
```

with:

```
and the ADR path proposal, which Step 6.2 resolves via `_shared/prior-art-detection.md` rather than asserting
```

- [ ] **Step 2: Record the edge**

In `docs/skill-graph.md`, add to the `/wrap-up` section:

```markdown
| `/wrap-up` | Step 6.2 resolves an ADR's path through `_shared/prior-art-detection.md` before proposing it, so a repo with its own decision-record convention gets one Review Console choice instead of a second grammar in `docs/decisions/` (answer recorded in `doc-convention.adr`). |
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -c "docs/decisions/NNNN-{slug}.md" skills/wrap-up/SKILL.md
```
Expected: `0`

Run:
```bash
grep -c "prior-art-detection" docs/skill-graph.md
```
Expected: `1`

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/wrap-up/SKILL.md docs/skill-graph.md
git diff --cached --name-only
git commit -m "Point wrap-up's Step 6 gate at resolved ADR paths and record the graph edge — refs #187"
```

---

### Task 9: Record the decision as an ADR

**Files:**
- Create: `docs/decisions/0013-plugin-conventions-detect-prior-art-before-writing.md`

- [ ] **Step 1: Confirm 0013 is the next free number**

Run:
```bash
ls docs/decisions/
```
Expected: `0001` through `0012` present, no `0013`. If `0013` exists (a concurrent session landed one), take the next free number and use it consistently below.

- [ ] **Step 2: Write the ADR**

````markdown
# 0013. Plugin doc conventions detect prior art before writing

- **Status:** accepted
- **Date:** 2026-08-07
- **Context:** #187 — an ADR filename convention conflicting silently with a consuming repo's own

## Context

`_shared/decision-records.md` stated `docs/decisions/NNNN-{kebab-slug}.md` as a fact. A consuming repo had sixteen ADRs named `ADR-{n}-{kebab-title}.md`, its own committed `architecture-decision` skill, and a `docs/REGISTRY.md` indexing them. The first passing ADR gate there would have produced a seventeenth file in a grammar matching neither the other sixteen nor the registry.

Two things were measured rather than assumed. The gate's rarity protected only the filename dimension: two of the sixteen files already carry the plugin's exact metadata block, so the template reaches a repo through humans reading it, not only through the write path. And corpus consistency differs sharply by dimension — 16/16 on filename grammar against 9/5/2 on one heading's casing — so a mechanism inferring both the same way is confidently wrong on the dimension already drifting.

The plugin had no representation anywhere of "this repo already has its own standard for this genre." ADRs surfaced it first because decision records are the genre with the most prior art.

## Decision

The plugin stays opinionated: its genre conventions remain the default, stated confidently. Before a doc-creating path writes into a genre that declares detection, it compares its intended form against what the repo already does, and surfaces any conflict once at the Review Console — conform forward, migrate, or keep the project's form — recording the answer in `doc-convention.{genre}`.

## Alternatives considered

- **Assert and write anyway** — the most opinionated reading and the cheapest, but it is the reported bug: the two-grammar directory still happens on the first passing gate.
- **Defer wherever a project has a convention** — a plugin that defers on every artifact it did not invent has no opinions left, and the native-versus-adopted axis it rested on described where conflicts are *possible*, not who should win.
- **Infer the convention silently** — works for filenames, fails for sections, and gives the user no moment to notice.
- **A `policy.yml` grammar knob** — `policy.yml` parses flat lines only; a grammar plus a section shape has no flat encoding, the same hole `review-diff-heuristic-thresholds` already sits in.
- **Migrate by default** — guarantees one convention, but a sixteen-file rename breaks registry rows, cross-doc references and portal URLs. Kept as an explicit choice, rejected as a default.
- **Have `/init` scaffold the directory** — contradicts a thrice-stated invariant that `/init` creates only `docs/REGISTRY.md`. `/init` is an assessor, not a writer.

## Consequences

The plugin's conventions stay the default and get stated more confidently than before, because they no longer have to double as a guess about the repo. A repo with no decision records, or one already matching, never sees a prompt. A repo that disagrees is asked once, and the answer persists.

The cost is one comparison on a rare path, and a genre declaration table that must stay honest: a row claiming detection without a consumer is a promise nothing keeps, so wiring a genre means adding its consumer and its policy key in the same change.

Revisit this decision if: a second genre needs detection and the corpus-versus-project-skill split proves wrong for it; if the three-way Console choice turns out to be answered inconsistently across repos; or if `policy.yml` gains nested values, at which point recording a form directly becomes possible and the which-source-wins indirection may no longer earn its keep.
````

- [ ] **Step 3: Verify the form matches this repo's own convention**

Run:
```bash
head -6 docs/decisions/0012-autonomy-ceiling-top-tier-ships-shut.md
head -6 docs/decisions/0013-plugin-conventions-detect-prior-art-before-writing.md
```
Expected: identical metadata-block shape — `# NNNN. Title`, then `- **Status:**`, `- **Date:**`, `- **Context:**`.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/0013-plugin-conventions-detect-prior-art-before-writing.md
git diff --cached --name-only
git commit -m "Record ADR 0013 — plugin doc conventions detect prior art before writing — refs #187"
```

---

### Task 10: Whole-branch review, then release

The whole-branch review runs **before** the bump, not after it. Per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers sitting in different files — the exact defect class this change is full of, since Tasks 1, 5, 6 and 7 form one producer/consumer chain across four files.

- [ ] **Step 1: Review the whole branch**

Run:
```bash
git diff origin/main...HEAD
```

Check specifically, since no test covers prose:
- Every outcome name (`plugin`, `project`, `conflict`) means the same thing in Tasks 1, 5, 6 and 7.
- The conflict record's fields (Task 1 step 5) are all actually rendered by Task 6 and consumed by Task 7.
- `doc-convention.adr` is spelled identically in the schema, the contract, Step 6.2, the Console block and the execution bullet.
- No file still asserts `docs/decisions/NNNN-{slug}.md` as a fact about a consuming repo.

Run:
```bash
grep -rn "docs/decisions/NNNN" skills/ | grep -v "prior-art-detection\|decision-records\|diataxis-genre-templates"
```
Expected: no output — the three files above are the only legitimate homes for the literal form.

- [ ] **Step 2: Re-check the version immediately before bumping**

Concurrent sessions ship during a long task. Run all four checks — local history alone is blind to three of them:

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git show main:.claude-plugin/plugin.json | grep version
git worktree list
grep -rn "6\.6[0-9]\.\|6\.7[0-9]\." docs/superpowers/plans/ || true
```

Take the next free version above whatever the highest of those reports. **This number has already collided once.** The plan was first authored against `origin/main` at `6.57.1` and named `6.58.0`; by the time the base was re-merged, `6.58.0` and `6.59.0` had both shipped from other sessions, making `6.60.0` the current expectation — a feature addition, so minor. Treat `6.60.0` as a guess with a short shelf life, not a reservation: re-run these four checks at the moment of bumping and renumber if anything moved again. If you renumber, renumber the CHANGELOG heading, the `shipped-versions.tsv` line and the commit message together.

- [ ] **Step 3: Bump, changelog and shipped-versions in ONE commit**

Edit `.claude-plugin/plugin.json` `version` to the resolved number.

Add to `CHANGELOG.md` directly under the `# Changelog` header block, as `## v{version} — {summary}`:

```markdown
## v6.60.0 — the plugin's doc conventions notice when a repo already has its own

- **Prior-art detection for documentation genres** — new `skills/_shared/prior-art-detection.md` is the canonical contract for the question no doc-creating path used to ask: does this repo already have its own convention for the genre about to be written? `/claude-tweaks:wrap-up` Step 6.2 now resolves an ADR's path through it instead of asserting `docs/decisions/NNNN-{kebab-slug}.md`, so a repo whose decision records follow a different grammar gets one three-way Review Console choice — conform forward, migrate, or keep the project's form — rather than a second grammar in the same directory. A repo with no decision records, or one already matching, never sees a prompt. The answer records in the new `doc-convention.adr` policy key, which stores which source wins rather than a grammar, keeping it flat-encodable. `_shared/diataxis-genre-templates.md` gains a per-genre declaration table; only ADR is wired, and rows marked Phase 2 say so explicitly. Recorded as ADR 0013.
```

Append to `docs/shipped-versions.tsv`:

```
6.60.0	2026-08-07	release
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass, including `changelog-coverage` — which fails if the heading is unparseable, duplicated, or names a version that never shipped.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
git diff --cached --name-only
git commit -m "Release 6.60.0 — doc conventions detect prior art before writing — refs #187"
```

- [ ] **Step 6: Mirror to the marketplace repo**

This is authorized as part of the same release action — do not stop to ask. In `../claude-tweaks-marketplace/.claude-plugin/marketplace.json`, set `plugins[].version` to the resolved number, bump `metadata.version` per its own `2.x` scheme, keep `plugins[].description` aligned with `plugin.json`, then commit and push `main`.

---

## Self-Review

**Spec coverage.** Phase 1's file table maps to tasks: contract (1), genre declarations (2), policy key + schema doc + test (3), `decision-records.md` (4), `config-updates.md` (5), `review-console.md` (6), `execution-and-verification.md` (7), `SKILL.md` + `skill-graph.md` (8), ADR (9), release (10). Phase 2's three files are deliberately absent.

**Placeholder scan.** No TBD/TODO. Every markdown edit carries literal replacement text; the one code change carries the literal test and the literal key.

**Type consistency.** The three outcome names `plugin` / `project` / `conflict` are used identically in Tasks 1, 5, 6, 7. The key `doc-convention.adr` is spelled identically in Tasks 3, 5, 6, 7. The row tags `[adr]` and `[adr-convention]` are introduced in Task 5 and consumed unchanged in Tasks 6 and 7.

**Known gap, deliberate.** Nothing here is covered by an automated test except the policy key — this is a prose plugin, and no test reads skill content. Task 10 Step 1's cross-file consistency check is the compensating control, which is why it must run before the bump rather than after.
