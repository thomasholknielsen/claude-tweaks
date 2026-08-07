# research verify mode — grammar, input resolution, and the consequence filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `verify` mode to `/claude-tweaks:research` that grounds a design before it is written — delivering the entry grammar, input resolution, the consequence filter that selects what gets researched, and the auto-mode behavior.

**Architecture:** A new leading-positional mode token (`verify`) on `/claude-tweaks:research`, following `skills/assess-agent-autonomy/SKILL.md:4`'s precedent rather than overloading `--mode=` (which already means depth tier). The mode's procedure lives in a new lazy-load sub-file, `skills/research/verify-mode.md`, so the bare-topic path never pays for verification prose it does not use. `SKILL.md` is currently exactly 119 lines; inlining the procedure would roughly double it.

**Tech Stack:** Markdown skill files with YAML frontmatter. Tests are `node --test` CommonJS suites under `tests/research/` asserting file content with regexes.

## Global Constraints

- **Scope keywords:** `verify`, `verify-mode.md`, `consequence filter`, `falsifiable`, `research`
- All plan-verification and test regexes over markdown prose MUST be whitespace-flexible (`\s+`, not a literal space) — hard-wrapped text splits phrases across lines and a single-line literal returns zero while the phrase is present (`[IL-66]`).
- `verify-mode.md` is a lazy-load unit, not an overflow bucket. If a second stub ever needs to cite a *section* of it, split by the unit the stubs name rather than growing it (`[IL-70]`).
- `auto` mode must not gain a new mid-flow stop from this work. Depth resolution and filter drops are logged, never prompted (`skills/_shared/auto-mode-contract.md`).
- Do not write a test asserting the consequence filter's own judgment quality. It is an eval, not an assertion — a check that would pass on any input is no check (`[IL-78]`). Record #180 owns that coverage.
- Do not restate a literal count of the source registry's entries. The registry is record #177's deliverable and its size may move (`[IL-40]`).
- `skills/research/SKILL.md` must keep a fenced block within 15 lines of its H1 — `tests/skill-conventions.test.js` enforces this for skills outside the linear-diagram set.
- Existing behavior is untouched: bare `/claude-tweaks:research <topic>` keeps today's web-survey path, and `--engine=auto|inline` is neither removed nor rescoped.

## Deferred decision — resolved here

Record #176's Gotchas carry one open decision from the (now-deleted) design doc: *whether `verify` should be reachable from `/claude-tweaks:flow` at all.*

**Resolved: not reachable from `/flow`.** `/flow` consumes ready leaf records, which are post-design by construction — grounding a design there is structurally too late to change it. This matches the record's own stated default ("the default if unresolved is not reachable from `/flow`"). Task 1 writes this into `verify-mode.md` as an explicit statement rather than leaving it implicit, so a future reader finds a decision rather than a silence.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `skills/research/verify-mode.md` | Create | The whole verify-mode procedure: lifecycle position, input resolution, the consequence filter, question-shape split, auto-mode behavior |
| `skills/research/SKILL.md` | Modify | `argument-hint`, `## Input`, the `## Workflow` mode branch, and the one stub that names `verify-mode.md` |
| `tests/research/skill-md.test.js` | Modify | Grammar, stub, and `verify-mode.md` content assertions |

Task order is driven by one constraint: `SKILL.md`'s stub must not name a file that does not exist yet. So `verify-mode.md` is created first (Task 1), wired into `SKILL.md` second (Task 2), then filled out (Tasks 3-4).

---

### Task 1: Create `verify-mode.md` with input resolution

**Files:**
- Create: `skills/research/verify-mode.md`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the file `skills/research/verify-mode.md`, which Task 2's `SKILL.md` stub names and Tasks 3-4 append sections to. Section headings established here and relied on later: `## Lifecycle position`, `## Input resolution`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/research/skill-md.test.js`, after the existing `parseFrontmatter` helper and before the first `test(...)` call, add the path + reader:

```js
const VERIFY_MODE_PATH = path.join(REPO_ROOT, 'skills', 'research', 'verify-mode.md');

function readVerifyMode() {
  return fs.readFileSync(VERIFY_MODE_PATH, 'utf8');
}
```

Then append these tests at the end of the file:

```js
test('verify-mode.md exists', () => {
  assert.ok(fs.existsSync(VERIFY_MODE_PATH), `Expected ${VERIFY_MODE_PATH} to exist`);
});

test('verify-mode.md documents the no-brief path so skipping /challenge does not skip grounding', () => {
  const body = readVerifyMode();
  // [IL-66]: tolerate both the hyphenated "No-brief case" heading and the prose
  // "a record with no brief" — the phrase appears in both shapes in the file.
  assert.match(body, /no[\s-]brief/i, 'must name the no-brief case');
  // Anchored, not a bare /candidate/i: "candidate" appears 3 times in the finished
  // file, so the bare form survives this sentence being reworded to "from the record"
  // instead of "from the topic" ([IL-78]).
  assert.match(
    body,
    /generate\s+the\s+candidate\s+set\s+from\s+the\s+topic/i,
    'must say the candidate set is generated from the topic directly',
  );
});

test('verify-mode.md resolves the bare-verify ambiguity by presenting a choice', () => {
  const body = readVerifyMode();
  assert.match(body, /ambiguous|ambiguity/i, 'must name the bare-verify ambiguity');
  assert.match(body, /AskUserQuestion/, 'must resolve it by presenting a choice, not by assuming');
});

test('verify-mode.md states that verify is not reachable from /flow', () => {
  const body = readVerifyMode();
  assert.match(body, /\/claude-tweaks:flow|\/flow/, 'must name /flow');
  assert.match(body, /not\s+reachable/i, 'must state the resolved decision explicitly');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — four failures, the first being `verify-mode.md exists` with `ENOENT`.

- [ ] **Step 3: Create `skills/research/verify-mode.md`**

```markdown
# Research — Verify Mode

Loaded by `/claude-tweaks:research` when `$ARGUMENTS` opens with the positional token `verify`.
The bare-topic path (`/claude-tweaks:research <topic>`) never reads this file.

`verify` mode grounds a design *before* it is written. It is a different job from the bare-topic
web survey, not a fifth depth tier — which is why it is a leading positional mode token rather
than another `--mode=` value. Overloading `--mode=` would make `--mode=verify --mode=deep`
unexpressible.

## Lifecycle position

```
/claude-tweaks:challenge → [ /claude-tweaks:research verify ] → /superpowers:brainstorming
```

`/claude-tweaks:challenge` opens a loop: it surfaces assumptions and open questions, and then
nothing checks them. Verify mode closes it — the questions get answered against real sources
before brainstorming commits to a design.

### Not reachable from `/claude-tweaks:flow`

`/flow` consumes ready leaf records, which are post-design by construction. Grounding a design
there is structurally too late to change it, so `verify` is deliberately **not reachable** from
`/flow` and is not an allowed flow step. Run it before `/superpowers:brainstorming`, not after
`/claude-tweaks:specify`.

## Input resolution

`/claude-tweaks:research verify [brief-path|#N]`

| Input | Resolution |
|---|---|
| A brief path (`docs/plans/{YYYY-MM-DD}-{topic}-brief.md`) | Read `### Key Assumptions Surfaced` and `### Open Questions for Brainstorming`. Each entry becomes one candidate question. |
| A record reference (`#N`) | Resolve the record, then look for a brief for its topic. Found — read it as above. Not found — fall to the no-brief case below. |
| Neither (a bare topic, or a record with no brief) | **No-brief case.** Generate the candidate set from the topic directly: enumerate the claims the design would rest on if written today. Skipping `/claude-tweaks:challenge` must not skip grounding. |

The candidate set is the input to the consequence filter below. It is never researched as-is.

### The bare-`verify` ambiguity

`/claude-tweaks:research verify` with nothing after it is ambiguous: `verify` could be the mode
token with a missing argument, or it could be the research topic (a user researching the word
"verify"). Resolve it by presenting a choice — never by silently assuming either reading. Call
`AskUserQuestion` with `question`: `"'verify' could be the verify-mode token or the research
topic. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Verify mode (Recommended)"`, `description`: `"Run verify mode; I'll ask which brief, record, or topic to ground."`
- Option 2 — `label`: `"Topic named 'verify'"`, `description`: `"Run the bare-topic web survey on the literal topic \"verify\"."`

This mirrors the numbered-choice disambiguation `/claude-tweaks:specify`'s `## Input` already
establishes for its own topic-vs-path collision.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS — all four new tests green, all pre-existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add skills/research/verify-mode.md tests/research/skill-md.test.js
git commit -m "Add verify-mode.md with input resolution and the bare-verify disambiguation — refs #176"
```

---

### Task 2: Wire the `verify` grammar into `SKILL.md`

**Files:**
- Modify: `skills/research/SKILL.md` — frontmatter `argument-hint` (`:4`), `## Input` (`:33-40`), `## Workflow` (`:55-73`)
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: `skills/research/verify-mode.md` from Task 1 — the stub added here names that exact path.
- Produces: the `verify` entry grammar. No later task depends on it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/research/skill-md.test.js`:

```js
test('SKILL.md argument-hint accepts the verify mode', () => {
  const fm = parseFrontmatter(readSkill());
  assert.ok(fm, 'frontmatter block missing');
  assert.match(fm['argument-hint'], /verify/, 'argument-hint must document the verify form');
});

test('SKILL.md ## Input documents both the bare-topic and verify forms', () => {
  const body = readSkill();
  const start = body.indexOf('## Input');
  const end = body.indexOf('## Mode Picker');
  assert.ok(start !== -1 && end > start, 'expected ## Input to precede ## Mode Picker');
  const input = body.slice(start, end);
  assert.match(input, /verify/, '## Input must document the verify form');
  assert.match(input, /topic/i, '## Input must still document the bare-topic form');
});

test('SKILL.md references verify-mode.md by a stub naming the file', () => {
  const body = readSkill();
  assert.match(
    body,
    /read\s+`?verify-mode\.md`?\s+in\s+this\s+skill's\s+directory/i,
    'must use the canonical sub-file stub wording',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — three failures; `argument-hint` has no `verify`, `## Input` has no `verify`, no stub exists.

- [ ] **Step 3: Edit `skills/research/SKILL.md`**

Replace the `argument-hint` line (`:4`) with:

```yaml
argument-hint: "verify [brief-path|#N] | <topic> [--mode=quick|standard|deep|ultradeep] [--engine=auto|inline] [--output=<path>]"
```

In `## Input`, replace the first bullet (`- $ARGUMENTS is the research topic. If empty, ask the user for it before proceeding.`) with:

```markdown
- `$ARGUMENTS` takes one of two forms, distinguished by its **first token**:
  - **`verify [brief-path|#N]`** — verification mode. Grounds a design before it is written by
    answering the questions a brief surfaced. Read `verify-mode.md` in this skill's directory for
    the full procedure: input resolution, the consequence filter, question-shape routing, and
    auto-mode behavior. The flags below apply, but `--mode=` bounds survey breadth only — see that
    file.
  - **`<topic>`** — the default web-survey mode, unchanged. If empty, ask the user for the topic
    before proceeding.
```

In `## Workflow`, fold the mode branch into Step 1 — replace `1. **Resolve** topic + depth tier from `$ARGUMENTS` (or the Mode Picker).` with:

```markdown
1. **Resolve the input.** When the first token of `$ARGUMENTS` is `verify`, read `verify-mode.md`
   in this skill's directory and follow it instead of Steps 2-7 below — it owns its own output
   contract. Otherwise resolve topic + depth tier from `$ARGUMENTS` (or the Mode Picker) and
   continue at Step 2 with today's behavior.
```

**Do not add a `1a.` sub-step and do not renumber.** `1a.` is not a valid CommonMark ordered-list marker — it renders as lazy-continuation text merged into Step 1's paragraph rather than as its own step. Renumbering Steps 2-7 to make room is also wrong: `SKILL.md` self-references its own step numbers at `:46`, `:69`, `:79`, `:80`, and `:127`, and a renumber would silently invalidate all five (`[IL-86]`). Folding the branch into Step 1 avoids both — and reads better, since resolving the input is what deciding the mode is.

Note the stub sentence wraps across a line break between `verify-mode.md` and `in this skill's directory`. That is exactly why the guarding regex is whitespace-flexible.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS.

Then confirm the diagram invariant still holds:

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS — the fenced block is still within 15 lines of the H1 (this task edits frontmatter, `## Input`, and `## Workflow`, none of which sit between the H1 and the diagram).

- [ ] **Step 5: Commit**

```bash
git add skills/research/SKILL.md tests/research/skill-md.test.js
git commit -m "Accept a leading positional verify mode on /research — refs #176"
```

---

### Task 3: Add the consequence filter

**Files:**
- Modify: `skills/research/verify-mode.md` — append `## The consequence filter`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: `verify-mode.md`'s `## Input resolution` section from Task 1 — the filter's input is the candidate set that section produces.
- Produces: the ranked, filtered question list that Task 4's question-shape routing consumes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/research/skill-md.test.js`:

```js
test('verify-mode.md states the consequence filter as a two-outcome question', () => {
  const body = readVerifyMode();
  assert.match(body, /would\s+the\s+design\s+change/i, 'must state the filter question verbatim');
  // Anchored, not a bare /drop/i: "drop" appears ~11 times in the finished file, so the
  // bare form survives this row being reworded to "Drop it silently." — the exact opposite
  // of the requirement. Verified to discriminate during plan authoring ([IL-78]).
  assert.match(
    body,
    /drop\s+it,?\s+and\s+log\s+the\s+drop/i,
    'must state that the drop outcome is logged, not silent',
  );
});

test('verify-mode.md logs every filter drop to decisions.md in the shared entry format', () => {
  const body = readVerifyMode();
  assert.match(body, /decisions\.md/, 'must name decisions.md');
  assert.match(body, /auto-decision-log\.md/, 'must cite the canonical line format');
  assert.match(body, /Reversibility:/, 'must quote the entry schema');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — two failures; `verify-mode.md` has no filter section yet.

- [ ] **Step 3: Append `## The consequence filter` to `skills/research/verify-mode.md`**

```markdown
## The consequence filter

The filter is the entire cost-control mechanism. There is no budget knob and no per-source
authorization: a topic where nothing diverges correctly costs nothing, and a topic on new ground —
where you have no priors, so almost everything diverges — automatically authorizes more work. The
filter self-calibrates, which is why no separate green-field mode exists.

Apply it to every candidate question, one at a time:

> **If the answer surprised me, would the design change?**

The question has exactly two outcomes. It is not a severity scale and not a scoring rubric —
do not rank candidates by importance, confidence, or cost, and do not assign points.

| Outcome | Action |
|---|---|
| **Yes** — at least one answer leads to a different design | Keep it. It goes to routing (below). |
| **No** — both branches lead to the same design | Drop it, and log the drop. |

Both branches converging is the *only* reason to drop a question. A question is never dropped for
being expensive, broad, or unlikely to resolve.

Order the surviving questions by **divergence** — how different the two designs are — highest
first. That ordering is the output; it is what makes a partial run useful when one is cut short.

### Logging a drop

Every drop writes one line to the run's `decisions.md`, in the entry schema
`skills/_shared/auto-decision-log.md` defines:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

Concretely, under a `## /research` heading:

```
- AUTO 14:22:07 — verify filter: dropped "does the cache need a TTL?" — both answers lead to the same design (the module is rebuilt per-run either way). Reversibility: high.
```

A drop is `AUTO`, never `STAGED` or `KEPT-PROMPT`: the filter acted, and the log is how that action
stays auditable. Dropping silently is forbidden — an unlogged drop is indistinguishable from a
question nobody thought of.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/research/verify-mode.md tests/research/skill-md.test.js
git commit -m "State the consequence filter as a two-outcome test with logged drops — refs #176"
```

---

### Task 4: Question-shape routing, depth-tier rescoping, and auto-mode behavior

**Files:**
- Modify: `skills/research/verify-mode.md` — append `## Question shape` and `## Auto-mode behavior`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: the divergence-ranked question list Task 3's filter produces.
- Produces: the routing contract record #177 attaches its source registry to — a falsifiable question routes to the registry (that record's deliverable), an unfalsifiable one routes to survey. This task must not name registry entries; #177 owns them.

- [ ] **Step 1: Write the failing tests**

Append to `tests/research/skill-md.test.js`:

```js
test('verify-mode.md routes unfalsifiable questions to survey and bounds tiers to survey breadth', () => {
  const body = readVerifyMode();
  assert.match(body, /unfalsifiable/i, 'must name the unfalsifiable shape');
  assert.match(body, /ultradeep/, 'must name the existing depth tiers');
  assert.match(body, /bounds?\s+survey\s+breadth\s+only/i, 'tiers must bound survey breadth only');
  // The three assertions above all pass on an INVERTED routing table (Falsifiable -> Survey,
  // Unfalsifiable -> registry) because each only checks a word's presence. This one ties the
  // two terms together. Gap is 160, not 120: the real table row is 118 chars wide, so 120
  // leaves no margin for a prose tweak ([IL-78]).
  assert.match(
    body,
    /unfalsifiable[\s\S]{0,160}(?:survey|landscape)/i,
    'must route unfalsifiable questions to survey, not merely mention both words',
  );
});

test('verify-mode.md states that absence is a finding', () => {
  const body = readVerifyMode();
  assert.match(body, /no\s+precedent\s+exists/i, 'absence must be reported, not omitted');
});

test('verify-mode.md resolves survey depth through the documented precedence chain', () => {
  const body = readVerifyMode();
  assert.match(body, /auto-mode-contract\.md/, 'must cite the contract');
  assert.match(
    body,
    /CLI[\s-]?arg[\s\S]{0,160}pipeline[\s-]?config[\s\S]{0,160}project[\s-]?policy[\s\S]{0,160}skill[\s-]?default/i,
    'must state the full four-step precedence chain (whitespace-flexible across line wraps)',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — three failures; no question-shape or auto-mode section exists yet.

- [ ] **Step 3: Append two sections to `skills/research/verify-mode.md`**

```markdown
## Question shape: falsifiable vs. unfalsifiable

Every surviving question is classified by shape before it is researched, because the two shapes
return different things.

| Shape | Meaning | Routes to | Returns |
|---|---|---|---|
| **Falsifiable** | A specific source could show the claim is wrong — "does `X` already handle `Y`?", "is this file loaded at startup?" | The source registry | A **verdict** |
| **Unfalsifiable** | No single source settles it — "how do other tools approach this?", "what are the tradeoffs here?" | Survey | A **landscape** |

The source registry, its routing rules, and the verdict's exact shape are record #177's
deliverable. This file establishes only that the split exists and which way each shape goes.

### Depth tiers bound survey breadth only

`--mode=quick|standard|deep|ultradeep` **bounds survey breadth only** — how wide the landscape
sweep goes for unfalsifiable questions. The tiers do not govern falsifiable questions at all: a
verdict is settled by whether a source falsifies the claim, and no depth setting makes that answer
more or less true. A falsifiable question is researched until a source settles it or the sources
are exhausted, regardless of the tier in effect.

### Absence is a finding

A source that returns nothing has answered the question. Report it as such — "no precedent exists"
— never omit it. A silently-absent result is indistinguishable from a lookup that failed, and
silence cannot be found by keyword search later. This binds hardest on history- and
telemetry-shaped sources, where "we have never done this before" is frequently the single most
design-changing thing the run surfaces.

## Auto-mode behavior

Survey depth resolves through the standard chain in `skills/_shared/auto-mode-contract.md` —
**CLI arg > pipeline config > project policy > skill default** — never by prompting:

1. **CLI arg** — an explicit `--mode=` on this invocation always wins.
2. **Pipeline config** — the run directory's `config.yml`, when one resolves.
3. **Project policy** — `.claude-tweaks/policy.yml`.
4. **Skill default** — `standard`.

Verify mode introduces **no new mid-flow stop**. The Mode Picker's interactive prompt is skipped
whenever `auto` is active or `$PIPELINE_RUN_DIR` is set, exactly as the bare-topic path already
does; the resolved tier is logged rather than asked.

The bare-`verify` ambiguity above is not an exception to this. Verify mode is not reachable from
`/claude-tweaks:flow` (see Lifecycle position), so no orchestrator invokes it and there is
normally no run to stop mid-flow — the ambiguity arises only in a direct human invocation, where
presenting the choice is the correct behavior. In the residual case where a run directory resolves
anyway (`auto` active, or `$PIPELINE_RUN_DIR` exported by hand), do not prompt: take the
Recommended option — verify mode — and log it as `AUTO`, per `skills/_shared/auto-mode-contract.md`'s
"if the skill defines a default, take it". A logged, reversible default surfaced at the Review
Console is not a silent assumption.

Every verdict writes one `decisions.md` line, in the same entry schema a filter drop uses.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 2305+ tests, 0 failures. (The pre-change baseline for this branch was exactly 2305 passing, 0 failing.)

- [ ] **Step 6: Commit**

```bash
git add skills/research/verify-mode.md tests/research/skill-md.test.js
git commit -m "Split falsifiable from unfalsifiable questions and rescope the depth tiers — refs #176"
```

---

## Acceptance criteria coverage

| AC | Task | How it is verified |
|---|---|---|
| 1 — `argument-hint` contains `verify`; `## Input` documents both forms | 2 | `SKILL.md argument-hint accepts the verify mode`, `SKILL.md ## Input documents both the bare-topic and verify forms` |
| 2 — `verify-mode.md` exists and is referenced by a naming stub | 1, 2 | `verify-mode.md exists`, `SKILL.md references verify-mode.md by a stub naming the file` |
| 3 — filter stated as a two-outcome question, not a rubric | 3 | `verify-mode.md states the consequence filter as a two-outcome question` |
| 4 — unfalsifiable → survey; tiers bound survey breadth only; `ultradeep` present | 4 | `verify-mode.md routes unfalsifiable questions to survey and bounds tiers to survey breadth` |
| 5 — no-brief path documented | 1 | `verify-mode.md documents the no-brief path so skipping /challenge does not skip grounding` |
| 6 — absence is a finding | 4 | `verify-mode.md states that absence is a finding` |
| 7 — filter drop writes a `decisions.md` line quoting the shared format | 3 | `verify-mode.md logs every filter drop to decisions.md in the shared entry format` |
| 8 — bare-`verify` ambiguity resolved by presenting a choice | 1 | `verify-mode.md resolves the bare-verify ambiguity by presenting a choice` |
| 9 — survey depth resolves through the precedence chain, citing the contract | 4 | `verify-mode.md resolves survey depth through the documented precedence chain` |
| 10 — `node --test tests/research/` passes | 1-4 | Every task's Step 4 |

Deferred decision (flow reachability) is resolved in this plan's own section above and written into `verify-mode.md` by Task 1, asserted by `verify-mode.md states that verify is not reachable from /flow`.
