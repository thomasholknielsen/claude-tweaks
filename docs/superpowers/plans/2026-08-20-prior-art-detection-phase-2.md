# Prior-Art Detection Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `_shared/existing-convention-detection.md`'s prior-art procedure to the remaining doc-creating paths — D2's missing-doc scaffolding (four Diátaxis genres), the Journey genre gate in `journeys/SKILL.md`, and a read-only genre-collision audit in `init/docs-structure.md` — with one `doc-convention-{genre}` policy key per genre actually wired.

**Architecture:** `_shared/existing-convention-detection.md` already takes `genre` as a parameter and is reused as-is (per the spec's Technical Approach — no contract changes). This phase (a) flips the five non-ADR rows in `_shared/diataxis-genre-templates.md`'s declaration table from `Phase 2` to `active`, adding an "Aliases to glob" entry for each of the four Diátaxis genres; (b) registers `doc-convention-tutorial`, `doc-convention-how-to`, `doc-convention-reference`, `doc-convention-explanation`, `doc-convention-journey` in the policy schema, mirroring `doc-convention-adr`; (c) generalizes the Review Console's `[adr-convention]` row into a genre-parameterized `[{genre}-convention]` row across the five console-rendering files; (d) wires D2 (`wrap-up/docs-health-integration.md`) and the Journey gate (`journeys/SKILL.md` Step 2) to call detection before proposing/writing a path, following `adr-curation.md` Step 3's exact pattern (`resolve-policy.js` read, detect on unset); (e) adds a read-only genre-collision report to `init/docs-structure.md` Phase 8.5 and de-asserts the `0001-chose-postgres.md` example.

**Tech Stack:** Markdown skill files (prose contracts), one Node CommonJS schema file (`plugin/bin/lib/policy-schema.js`), `node --test` for the policy-schema suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T150247-record-194/work/194-spec.md`

## Global Constraints

- Reuse `_shared/existing-convention-detection.md`'s procedure, evidence-split rule, hard rules, and recording contract as-is — no contract changes.
- Never infer section shape from a corpus — only filename/location/numbering grammar is corpus-derived (existing-convention-detection.md's own split).
- A resolved path that already exists stops the write outright — no overwrite, no next-free-name (unchanged, inherited from the existing contract).
- `/init` remains an assessor, never a writer — it still creates only `docs/REGISTRY.md`; the new genre-collision report in `init/docs-structure.md` is read-only.
- Every `doc-convention-{genre}` key added must have a real, wired consumer landed in this same change — no dangling-promise keys.
- Each new genre's Review Console row reuses the `[adr-convention]` row shape (three-way prompt, not covered by "Approve all") — never invents a new shape.
- Out of scope: reconciling repos with two parallel ADR series; no change to `_shared/decision-records.md`'s ADR gate or existing ADR-genre behavior.

---

### Task 1: Register five new `doc-convention-{genre}` policy keys

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:131` (insert new rows immediately after the `doc-convention-adr` entry)
- Modify: `tests/policy-schema.test.js` (bump `POLICY_KEYS.length` assertion + comment, add one enum test per new key)
- Modify: `plugin/skills/_shared/policy-schema.md` (Documentation section — add five rows mirroring the `doc-convention-adr` row)

**Interfaces:**
- Produces: policy keys `doc-convention-tutorial`, `doc-convention-how-to`, `doc-convention-reference`, `doc-convention-explanation`, `doc-convention-journey` — each `{ key, type: 'enum', values: ['plugin', 'project'], summary, category: 'housekeeping', tier: 'advanced' }`, readable via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" doc-convention-{genre}` exactly like `doc-convention-adr`. Tasks 3 and 4 read these.

- [ ] **Step 1: Write the failing test**

Add to `tests/policy-schema.test.js`, immediately after the existing `doc-convention-adr is an enum with no default` test:

```javascript
test('doc-convention-{tutorial,how-to,reference,explanation,journey} are enums with no default, mirroring doc-convention-adr', () => {
  const genres = ['tutorial', 'how-to', 'reference', 'explanation', 'journey'];
  for (const genre of genres) {
    const key = POLICY_KEYS.find((k) => k.key === `doc-convention-${genre}`);
    assert.ok(key, `doc-convention-${genre} missing from POLICY_KEYS`);
    assert.strictEqual(key.type, 'enum');
    assert.deepStrictEqual(key.values, ['plugin', 'project']);
    assert.strictEqual(key.default, undefined, 'unset is a meaningful third state: the question has not been asked yet');
  }

  const repo = tmpRepo();
  writePolicy(repo, 'doc-convention-how-to: project\n');
  const ok = auditPolicy(repo);
  assert.deepStrictEqual(ok.invalidValues, []);
  assert.deepStrictEqual(ok.unrecognizedKeys, []);

  const bad = tmpRepo();
  writePolicy(bad, 'doc-convention-journey: whatever-the-repo-does\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, 'a value outside the enum must be flagged');
  assert.strictEqual(result.invalidValues[0].key, 'doc-convention-journey');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `doc-convention-tutorial missing from POLICY_KEYS` (assertion error on the first `assert.ok`).

- [ ] **Step 3: Register the five keys**

In `plugin/bin/lib/policy-schema.js`, immediately after the `doc-convention-adr` line (currently line 131), insert:

```javascript
  { key: 'doc-convention-tutorial', type: 'enum', values: ['plugin', 'project'], summary: "Records which side wins when this repo's existing Tutorial-genre placement/naming disagrees with the plugin's own.", category: 'housekeeping', tier: 'advanced' },
  { key: 'doc-convention-how-to', type: 'enum', values: ['plugin', 'project'], summary: "Records which side wins when this repo's existing How-To-genre placement/naming disagrees with the plugin's own.", category: 'housekeeping', tier: 'advanced' },
  { key: 'doc-convention-reference', type: 'enum', values: ['plugin', 'project'], summary: "Records which side wins when this repo's existing Reference-genre placement/naming disagrees with the plugin's own.", category: 'housekeeping', tier: 'advanced' },
  { key: 'doc-convention-explanation', type: 'enum', values: ['plugin', 'project'], summary: "Records which side wins when this repo's existing Explanation-genre placement/naming disagrees with the plugin's own.", category: 'housekeeping', tier: 'advanced' },
  { key: 'doc-convention-journey', type: 'enum', values: ['plugin', 'project'], summary: "Records which side wins when this repo's existing Journey-genre placement/naming disagrees with the plugin's own.", category: 'housekeeping', tier: 'advanced' },
```

Then in `tests/policy-schema.test.js`, bump the count test: change `assert.strictEqual(POLICY_KEYS.length, 53)` (both occurrences) to `58`, and append a new comment line documenting the bump:

```
  // 53 -> 58, #194 (Phase 2 doc-convention wiring): doc-convention-tutorial,
  // doc-convention-how-to, doc-convention-reference, doc-convention-explanation,
  // doc-convention-journey — one enum key per newly-wired Diátaxis/Journey genre,
  // mirroring doc-convention-adr.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/policy-schema.test.js`
Expected: PASS

- [ ] **Step 5: Document the five keys in `_shared/policy-schema.md`**

In `plugin/skills/_shared/policy-schema.md`'s Documentation section table, immediately after the `doc-convention-adr` row, add:

```markdown
| `doc-convention-tutorial` | `policy.yml` | `/claude-tweaks:wrap-up`'s Docs curation row (D2), via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins for the Tutorial genre — same semantics as `doc-convention-adr` |
| `doc-convention-how-to` | `policy.yml` | `/claude-tweaks:wrap-up`'s Docs curation row (D2), via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins for the How-To genre — same semantics as `doc-convention-adr` |
| `doc-convention-reference` | `policy.yml` | `/claude-tweaks:wrap-up`'s Docs curation row (D2), via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins for the Reference genre — same semantics as `doc-convention-adr` |
| `doc-convention-explanation` | `policy.yml` | `/claude-tweaks:wrap-up`'s Docs curation row (D2), via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins for the Explanation genre — same semantics as `doc-convention-adr` |
| `doc-convention-journey` | `policy.yml` | `/claude-tweaks:journeys` Step 2, via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins for the Journey genre — same semantics as `doc-convention-adr` |
```

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/policy-schema.js tests/policy-schema.test.js plugin/skills/_shared/policy-schema.md
git commit -m "Register doc-convention-{tutorial,how-to,reference,explanation,journey} policy keys — refs #194"
```

---

### Task 2: Flip the five genre rows to `active` and add glob aliases

**Files:**
- Modify: `plugin/skills/_shared/diataxis-genre-templates.md:11-20` (Genre declarations table)

**Interfaces:**
- Consumes: nothing new.
- Produces: the "Detection" column reading `active` for Tutorial/How-To/Reference/Explanation/Journey, and an "Aliases to glob" value for each of the four Diátaxis genres (Journey already has one) — Tasks 4 and 5 read these aliases when calling `_shared/existing-convention-detection.md`'s Step 1 glob.

- [ ] **Step 1: Edit the table**

Replace the Genre declarations table (current lines 11-20) with:

```markdown
| Genre | Owns filename | Detection | Aliases to glob | Project-skill keywords |
|---|---|---|---|---|
| Tutorial | no | **active** | `docs/tutorials/`, `docs/getting-started/` | `tutorial`, `getting started`, `walkthrough` |
| How-To | no | **active** | `docs/guides/`, `docs/how-to/` | `how-to`, `guide`, `runbook` |
| Reference | no | **active** | `docs/reference/`, `docs/api/` | `reference`, `api docs` |
| Explanation | no | **active** | `docs/explanation/`, `docs/concepts/` | `explanation`, `architecture`, `concept` |
| Journey | `docs/journeys/{journey-name}.md` | **active** | `docs/journeys/` | — |
| ADR | `docs/decisions/NNNN-{kebab-slug}.md` | **active** | `docs/decisions/`, `docs/adr/`, `docs/rfcs/` | `adr`, `architecture decision`, `decision record` |
```

Also update the row directly below the table (currently: "A row marked `Phase 2` declares intent only...") — since no row remains `Phase 2` after this edit, replace it with:

```markdown
Every row above is now wired to a real consumer — `existing-convention-detection.md`'s procedure runs before any doc-creating path in that row's genre writes a file. Wiring a *new* genre in the future still means adding its consumer and its `doc-convention-{genre}` key in the same change.
```

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/_shared/diataxis-genre-templates.md
git commit -m "Flip Diataxis genre declarations to active, add glob aliases — refs #194"
```

---

### Task 3: Generalize the `[adr-convention]` Review Console row to `[{genre}-convention]`

**Files:**
- Modify: `plugin/skills/wrap-up/console-template.md:78-92`
- Modify: `plugin/skills/wrap-up/execution-and-verification.md:19`
- Modify: `plugin/skills/wrap-up/review-console-interactive.md:14,94`
- Modify: `plugin/skills/flow/multispec-console-template.md:82`
- Modify: `plugin/skills/flow/multispec-review-console.md:76`

**Interfaces:**
- Consumes: nothing new (prose-only generalization).
- Produces: a genre-parameterized `[{genre}-convention]` row template that Task 4's D2 wiring and Task 5's journeys wiring cite instead of a new row shape.

- [ ] **Step 1: Generalize `console-template.md`'s row block**

In `plugin/skills/wrap-up/console-template.md`, replace lines 78-92 (the `[adr-convention]` prose + fenced example + trailing sentence) with:

```markdown
A `[{genre}-convention]` row — `adr-convention` for the Decision records curation row (`adr-curation.md`), or `{genre}-convention` for a D2/Journeys curation-row conflict on any other active genre from `_shared/diataxis-genre-templates.md` — renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below. Render it as:

```
#16  adr-convention  docs/decisions/  — this repo's decision records disagree with the plugin's convention

     plugin form  : 0017-slack-transport.md
     found (16)   : ADR-016-slack-integration-strategy.md
     project skill: .claude/skills/architecture-decision/SKILL.md

     1  Conform forward   — new files use the plugin's form   -> doc-convention-adr: plugin
     2  Migrate           — rename all 16, fix REGISTRY rows and inbound links
     3  Keep project form — resolve from this repo             -> doc-convention-adr: project
```

A non-ADR genre (e.g. a How-To conflict from D2) renders identically, substituting that genre's name, resolved directory, form examples, and `doc-convention-{genre}` key:

```
#17  how-to-convention  docs/guides/  — this repo's how-to docs disagree with the plugin's convention

     plugin form  : deploying-to-staging.md
     found (9)    : how-to-deploy-staging.md
     project skill: (none found)

     1  Conform forward   — new files use the plugin's form   -> doc-convention-how-to: plugin
     2  Migrate           — rename all 9, fix REGISTRY rows and inbound links
     3  Keep project form — resolve from this repo             -> doc-convention-how-to: project
```

Omit the `project skill` line when detection found none. "Approve all" leaves this row unanswered and blocks every same-genre proposal row from the same run, since their resolved paths depend on the answer — state that explicitly rather than applying a default.
```

- [ ] **Step 2: Generalize `execution-and-verification.md`'s execution bullet**

In `plugin/skills/wrap-up/execution-and-verification.md`, replace line 19 (`- **ADR convention resolution** — when an \`[adr-convention]\` row was answered...`) with:

```markdown
- **Genre convention resolution** — when a `[{genre}-convention]` row was answered (`adr-convention`, or a D2/Journeys genre from `_shared/diataxis-genre-templates.md`), first write the answer to `.claude-tweaks/policy.yml` as `doc-convention-{genre}: plugin` or `doc-convention-{genre}: project` (option 2 records `plugin`, since migration is how the repo conforms). For option 2 only, then execute the migration as one itemized batch: `git mv` each existing file to the plugin's grammar preserving its number/name, rewrite the matching `docs/REGISTRY.md` rows, and sweep the repo for inbound references to the old basenames (`grep -rl "{old-basename}" --include="*.md" .`) fixing each. Report the file count moved and the reference count rewritten. Never migrate without that row's explicit approval
```

- [ ] **Step 3: Generalize `review-console-interactive.md`'s two mentions**

In `plugin/skills/wrap-up/review-console-interactive.md` line 14, replace:

```markdown
- **One row type is per-item without being its own section:** an `[adr-convention]` row (from the Decision records curation row, `adr-curation.md`) renders inside Configuration updates and keeps its global number, but carries a three-way choice rather than approve/reject, so "Approve all" leaves it unanswered. It is the one exception to the otherwise-clean split between batch sections and per-item sections — see the Configuration updates section below for its render shape and for what it blocks while unanswered.
```

with:

```markdown
- **One row type is per-item without being its own section:** a `[{genre}-convention]` row (`adr-convention` from the Decision records curation row, `adr-curation.md`; or a D2/Journeys genre from `_shared/diataxis-genre-templates.md`) renders inside Configuration updates and keeps its global number, but carries a three-way choice rather than approve/reject, so "Approve all" leaves it unanswered. It is the one exception to the otherwise-clean split between batch sections and per-item sections — see the Configuration updates section below for its render shape and for what it blocks while unanswered.
```

And replace line 94:

```markdown
- **An `[adr-convention]` row is also per-item**, despite sitting inside Configuration updates. Never fold it into "Approve all" and never pick one of its three options as a default — an unanswered row blocks the `[adr]` rows from the same run rather than resolving them, because their paths depend on the answer.
```

with:

```markdown
- **A `[{genre}-convention]` row is also per-item**, despite sitting inside Configuration updates. Never fold it into "Approve all" and never pick one of its three options as a default — an unanswered row blocks the same-genre proposal rows from the same run rather than resolving them, because their paths depend on the answer.
```

- [ ] **Step 4: Generalize the two multi-spec console files**

In `plugin/skills/flow/multispec-console-template.md` line 82, replace:

```markdown
An `[adr-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below — the row's mechanics are unchanged from the single-spec console (`wrap-up/review-console.md`'s Configuration updates section), only its aggregation is per-spec here, the same way Queue writes already aggregates.
```

with:

```markdown
A `[{genre}-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below — the row's mechanics are unchanged from the single-spec console (`wrap-up/console-template.md`'s Configuration updates section), only its aggregation is per-spec here, the same way Queue writes already aggregates.
```

In `plugin/skills/flow/multispec-review-console.md` line 76, replace:

```markdown
Read `multispec-console-template.md` (this skill's directory) and render that exact shape — every section's column layout, the engine-vs-prose-fallback distinction, and the `[adr-convention]` row's three-way prompt. Worked example rows there are fictional; substitute this run's own per-spec `decisions.md`/`staged/` content, aggregated per "Numbering rules" above.
```

with:

```markdown
Read `multispec-console-template.md` (this skill's directory) and render that exact shape — every section's column layout, the engine-vs-prose-fallback distinction, and the `[{genre}-convention]` row's three-way prompt. Worked example rows there are fictional; substitute this run's own per-spec `decisions.md`/`staged/` content, aggregated per "Numbering rules" above.
```

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/wrap-up/console-template.md plugin/skills/wrap-up/execution-and-verification.md plugin/skills/wrap-up/review-console-interactive.md plugin/skills/flow/multispec-console-template.md plugin/skills/flow/multispec-review-console.md
git commit -m "Generalize [adr-convention] Review Console row to [{genre}-convention] — refs #194"
```

---

### Task 4: Wire D2 to run detection before proposing a missing-doc path

**Files:**
- Modify: `plugin/skills/wrap-up/docs-health-integration.md:58-72` (D2 section)

**Interfaces:**
- Consumes: `doc-convention-{genre}` keys from Task 1; the `active`-marked genre rows + aliases from Task 2; the `[{genre}-convention]` row template from Task 3.
- Produces: D2's `[doc] {new-file-path} — Create: {rationale}` proposal now carries a repo-convention-resolved path instead of the plugin's default path unconditionally, and — on a `conflict` outcome — an additional `[{genre}-convention]` row per Task 3's shape.

- [ ] **Step 1: Insert the detection call into D2's "On a hit" procedure**

In `plugin/skills/wrap-up/docs-health-integration.md`, D2's "On a hit" numbered list currently reads:

```markdown
1. Infer the matching genre from what the new subsystem actually is (see `_shared/criteria-docs-diataxis.md` Dimension 1's "what it actually does" table) — a new skill's user-facing guide is typically How-To-shaped; a new architectural pattern is typically Explanation-shaped; a new API surface is typically Reference-shaped.
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Documentation updates collection as D1's additive findings (see D1's routing above).
```

Replace it with:

```markdown
1. Infer the matching genre from what the new subsystem actually is (see `_shared/criteria-docs-diataxis.md` Dimension 1's "what it actually does" table) — a new skill's user-facing guide is typically How-To-shaped; a new architectural pattern is typically Explanation-shaped; a new API surface is typically Reference-shaped.
2. **Resolve the path before proposing it** — same pattern as `adr-curation.md` Step 3. Read `doc-convention-{genre}` via the canonical read path (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" doc-convention-{genre}` — `_shared/policy-schema.md`) and branch on the JSON envelope: `source: "policy"` means the key is set, so use the recorded `value` and skip detection entirely; `source: "default"` means it is unset, so read `_shared/existing-convention-detection.md` and run its procedure for the inferred genre against that genre's declared "Aliases to glob" directories (`_shared/diataxis-genre-templates.md`). The result is a resolved path plus one of three outcomes: `plugin`, `project`, or `conflict`.
3. Propose a `[doc] {resolved-path} — Create: {one-line rationale}` row, folded into the same Documentation updates collection as D1's additive findings (see D1's routing above).
4. On a `conflict` outcome, additionally collect one `[{genre}-convention]` row per `wrap-up/console-template.md`'s Configuration updates render shape (Task 3's generalized template) — `[{genre}-convention] {resolved-directory} — {plugin form} vs {found form} ({N} existing)`. Until it is answered, this D2 proposal's path stays unresolved.
```

Renumber the remainder of the D2 section (the "Never propose more than one new doc..." paragraph and the "Known narrowing" note) unchanged — they follow the new numbered list without needing edits.

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/wrap-up/docs-health-integration.md
git commit -m "Wire D2 missing-doc scaffolding to existing-convention-detection — refs #194"
```

---

### Task 5: Wire the Journey gate in `journeys/SKILL.md` Step 2

**Files:**
- Modify: `plugin/skills/journeys/SKILL.md:72-74` (Step 2)

**Interfaces:**
- Consumes: `doc-convention-journey` from Task 1; the Journey row (already `active`, aliases `docs/journeys/`) from Task 2; the `[{genre}-convention]` row template from Task 3.
- Produces: Step 2 now resolves the journey file's path via detection before writing, instead of hardcoding `docs/journeys/{journey-name}.md` unconditionally.

- [ ] **Step 1: Replace Step 2's body**

Current Step 2 body:

```markdown
For each new journey identified, create a file at `docs/journeys/{journey-name}.md` using the template + key principles in `journey-template.md` in this skill's directory. The template covers frontmatter, persona/goal/entry-point/success-state framing, the per-step structure (URL / Action / Should feel / Should understand / Red flags), and the Origin trailer.
```

Replace with:

```markdown
**Resolve the path before writing it.** Read `doc-convention-journey` via the canonical read path (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" doc-convention-journey` — `_shared/policy-schema.md`) and branch on the JSON envelope: `source: "policy"` means the key is set, so use the recorded `value` and skip detection entirely; `source: "default"` means it is unset, so read `_shared/existing-convention-detection.md` and run its procedure for the `journey` genre against `docs/journeys/` (`_shared/diataxis-genre-templates.md`'s declared alias). The result is a resolved path plus one of three outcomes: `plugin`, `project`, or `conflict`.

On `plugin` or `project`, create the resolved file using the template + key principles in `journey-template.md` in this skill's directory. The template covers frontmatter, persona/goal/entry-point/success-state framing, the per-step structure (URL / Action / Should feel / Should understand / Red flags), and the Origin trailer.

On `conflict`: in a pipeline run (`$PIPELINE_RUN_DIR` set), stage a `[journey-convention]` row per `wrap-up/console-template.md`'s generalized `[{genre}-convention]` shape (Task 3) to `staged/journeys-convention.md` and continue with the plugin's default path for this run, noting the staged conflict in the journey file's Origin section; the Wrap-Up Review Console surfaces it for the same three-way resolution `adr-curation.md` uses. Invoked standalone (no `$PIPELINE_RUN_DIR`), surface the same three-way choice inline via `AskUserQuestion` before writing.
```

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/journeys/SKILL.md
git commit -m "Add existing-convention-detection gate to journeys Step 2 — refs #194"
```

---

### Task 6: Read-only genre-collision report in `init/docs-structure.md`, de-assert the ADR example

**Files:**
- Modify: `plugin/skills/init/docs-structure.md:116` (de-assert `0001-chose-postgres.md`)
- Modify: `plugin/skills/init/docs-structure.md` (Registry Creation Procedure — insert a new read-only step)

**Interfaces:**
- Consumes: the `active`-marked genre rows + aliases from Task 2.
- Produces: a new backlog-free, write-free report step in Phase 8.5 that surfaces genre-convention collisions; `/init` still creates only `docs/REGISTRY.md`.

- [ ] **Step 1: De-assert the `0001-chose-postgres.md` example**

Line 116 currently reads:

```markdown
  decisions/               ← ADRs (0001-chose-postgres.md) — written by /wrap-up's Decision records curation row per the ADR gate in `_shared/decision-records.md`
```

Replace with:

```markdown
  decisions/               ← ADRs (e.g. 0001-{kebab-slug}.md, or this repo's own existing grammar — see the genre-convention collision check below) — written by /wrap-up's Decision records curation row per the ADR gate in `_shared/decision-records.md`
```

- [ ] **Step 2: Insert a read-only genre-collision report step**

In the "Registry Creation Procedure (Phase 8.5)" numbered list, insert a new step immediately after step 4 ("Quick-assess existing docs") and before the existing step 5 ("Identify missing docs"), renumbering steps 5-8 to 6-9:

```markdown
5. **Report genre-convention collisions (read-only)** — for each `active` genre in `_shared/diataxis-genre-templates.md` whose declared "Aliases to glob" directories exist in this repo, run `_shared/existing-convention-detection.md`'s Steps 1-4 (glob, parse grammar, look for a project skill) against that genre's corpus — read-only, exactly as the procedure already specifies; never write a policy key or a file. Collect any `conflict` outcome (the corpus disagrees with the plugin's form on 3+ agreeing files) as a finding: genre, plugin form, found form, sample filename, file count, project-skill path if found. **`/init` never resolves these** — it has no Review Console to answer a three-way prompt into, and no consumer has been reached yet whose own curation row would ask it. Fold each collision into the batch presented in step 7 (below) as an assessment note on the existing-docs row for that genre's directory, and into step 9's backlog capture as its own record so the first real consumer (`/wrap-up`'s D2 or Journeys curation row) sees the corpus finding baked in rather than re-deriving it from scratch.
```

Renumber the old step 5 ("Identify missing docs") to step 6, old step 6 ("Present batch") to step 7, old step 7 ("Create `docs/REGISTRY.md`") to step 8, old step 8 ("Capture doc work as backlog work records") to step 9. No content changes needed in the renumbered steps themselves — only their leading digit.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/init/docs-structure.md
git commit -m "Add read-only genre-collision report to /init Phase 8.5, de-assert postgres ADR example — refs #194"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass, including `tests/policy-schema.test.js`'s new/updated assertions.

- [ ] **Step 2: Spot-check the prose-conformance suite for any pinned `[adr-convention]`/`Phase 2` literals this change touched**

Run: `grep -rn "adr-convention\|Phase 2" tests/ | grep -i "diataxis\|console-template\|review-console\|policy-schema\|docs-health\|journeys"`

If any pinning test asserts the old `Phase 2` wording or an ADR-only `[adr-convention]` literal this plan changed, update that test's expected string to match the new prose (do not weaken the assertion — narrow it to the new literal text).

- [ ] **Step 3: Commit any test fixes**

```bash
git add -A
git commit -m "Fix pinned-prose tests for Phase 2 doc-convention wiring — refs #194"
```
