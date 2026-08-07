# research verify source registry, dispatch, and verdict shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the source registry that answers the questions `verify` mode's consequence filter selects, plus the parallel dispatch that runs them and the verdict shape they return.

**Architecture:** A new lazy-load sub-file, `skills/research/source-registry.md`, kept separate from `verify-mode.md` because the registry is the unit that *grows* — adding a source is a registry edit, and the mode procedure should not be re-read to make one. The registry is keyed by **what a source can falsify**, not by which tool it uses: three entries all mechanically run `grep` and are separate because they answer different question types. Confidence is carried per-source on each verdict rather than per-report, which is what stops a grep-verified fact from lending its credibility to a blog post in the same result list.

**Tech Stack:** Markdown skill files. Tests are `node --test` CommonJS suites under `tests/research/` asserting file content with regexes.

## Global Constraints

- **Scope keywords:** `source-registry`, `falsifies`, `verdict`, `provenance`, `checked-at`
- All test regexes over markdown prose MUST be whitespace-flexible (`\s+`, never a literal space) — hard-wrapped text splits phrases across lines (`[IL-66]`).
- **An over-broad regex is a test that asserts nothing.** Four assertions were fixed for exactly this during record #176. For every new assertion ask: would it fail if the prose it guards were reworded to the *opposite* meaning? If not, anchor it.
- Inline every output template **literally** in the dispatch prompt. A reference to `_shared/subagent-output-contract.md` does not reach the agent — agents see only their prompt.
- Dispatched source agents are **read-only** and carry **no git access** — this removes the shared-index race rather than narrowing it (`[IL-51]`).
- **Absence is a finding.** A source returning nothing is reported as "no precedent exists", never omitted. Silence cannot be found by keyword search later (`[IL-15]`).
- `source-registry.md` is a lazy-load unit, not an overflow bucket (`[IL-70]`).
- Do not build a `sibling-repos` source. Cross-repo access is inconsistent enough that it would ship half-working, and `[IL-85]` forbids adding a path with no stated removal condition.
- Do not refactor `docs-health`'s own command-execution sweep — this work reuses its technique, it does not touch the original.
- Every commit message says `refs #177`, never a closing keyword — this branch carries seven records.

## Resolved contradiction in the record — read before Task 4

Record #177's acceptance criterion 5 requires the dispatch section to *"inline a literal Template A block from `_shared/subagent-output-contract.md`."* But Template A is a findings table (`| Severity | Path:Line | Finding | Evidence |`), and the record's own Data / API Surface defines a different return shape entirely — `outcome` / `source` / `confidence` / `provenance` / `checked-at`. A source agent returns a verdict, not findings. The two halves of the record disagree.

`skills/_shared/subagent-output-contract.md:151` settles it in the record's favour on substance: *"When a dispatch's output genuinely doesn't fit A/B/C, define the format explicitly in the dispatch prompt rather than forcing it into one of the three."*

**Resolution:** Task 4 inlines a **literal verdict template** in the dispatch prompt, and states in prose that this is a define-in-prompt format per `subagent-output-contract.md:151`, not Template A. This satisfies AC5's actual intent — its own parenthetical is `references won't reach the agent` — while honouring the verdict shape AC7 requires. Forcing verdicts into Template A's severity columns would satisfy AC5's letter and produce a template the agents cannot use.

This deviation is deliberate and must be reported at the final review, not discovered there.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `skills/research/source-registry.md` | Create | The registry table, routing rules, verdict shape, and dispatch procedure |
| `skills/research/verify-mode.md` | Modify | One stub naming the registry, in the Question shape section |
| `tests/research/skill-md.test.js` | Modify | Registry structural assertions |

Task order is driven by one constraint: the file must exist before `verify-mode.md`'s stub can name it, and the verdict shape must exist before the dispatch prompt can embed it.

---

### Task 1: Create `source-registry.md` with the registry table

**Files:**
- Create: `skills/research/source-registry.md`
- Modify: `skills/research/verify-mode.md`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: `verify-mode.md`'s `## Question shape: falsifiable vs. unfalsifiable` section (from record #176), which already says a falsifiable question routes to "the source registry" and names that registry as this record's deliverable. Your stub replaces that forward reference with a real pointer.
- Produces: the file `skills/research/source-registry.md` and its `## The registry` section, which Tasks 2-4 append to. Section headings established here: `## The registry`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/research/skill-md.test.js`, after the existing `readVerifyMode` helper:

```js
const SOURCE_REGISTRY_PATH = path.join(REPO_ROOT, 'skills', 'research', 'source-registry.md');

function readSourceRegistry() {
  return fs.readFileSync(SOURCE_REGISTRY_PATH, 'utf8');
}

const REGISTRY_SOURCES = [
  'runtime', 'codebase', 'repo-prose', 'tests',
  'history', 'telemetry', 'deps', 'web', 'human',
];
```

Then append these tests at the end of the file:

```js
test('source-registry.md exists', () => {
  assert.ok(fs.existsSync(SOURCE_REGISTRY_PATH), `Expected ${SOURCE_REGISTRY_PATH} to exist`);
});

for (const source of REGISTRY_SOURCES) {
  test(`source-registry.md has an entry for ${source}`, () => {
    const body = readSourceRegistry();
    assert.match(
      body,
      new RegExp(`\\|\\s*\`${source}\`\\s*\\|`),
      `registry must carry a table row for the ${source} source`,
    );
  });
}

test('source-registry.md keys every entry by what it falsifies, not by tool', () => {
  const body = readSourceRegistry();
  assert.match(body, /falsif/i, 'must speak in terms of falsification');
  // The header row must name all three required columns. Anchoring to the header
  // rather than to any one row's text is what makes this fail if a column is dropped.
  assert.match(
    body,
    /\|\s*Source\s*\|\s*What\s+it\s+can\s+falsify\s*\|\s*Confidence\s*\|\s*Read\s+mechanism\s*\|/i,
    'registry table must carry Source / What it can falsify / Confidence / Read mechanism columns',
  );
});

test('source-registry.md runtime entry cites the bounded-output form', () => {
  const body = readSourceRegistry();
  assert.match(body, /exit=/, 'must show the bounded-output exit-status capture');
  assert.match(body, /judge-procedure\.md/, 'must cite docs-health as the technique it reuses');
});

test('source-registry.md human entry is a terminator that dispatches no agent', () => {
  const body = readSourceRegistry();
  assert.match(
    body,
    /dispatches\s+no\s+agent/i,
    'the human entry must state it dispatches no agent',
  );
  // Gap-tolerant: the prose reads "stop researching **it** and ask", so an
  // adjacency-only /stop\s+researching\s+and\s+ask/ returns zero. Caught by running
  // this regex against the planned prose during plan authoring, not after ([IL-66]).
  assert.match(
    body,
    /stop\s+researching[\s\S]{0,20}and\s+ask/i,
    'routing to human must terminate research for that question',
  );
});

test('source-registry.md deps entry records the node_modules denial and its fallback', () => {
  const body = readSourceRegistry();
  assert.match(body, /node_modules/, 'must name node_modules');
  // Token-anchored, not a wide window. Measured: the real span is 45 chars, and a
  // {0,200} gap still matches prose inverted to "fully supported, nothing denied" —
  // i.e. it does not discriminate. `structurally denied` is the load-bearing claim ([IL-78]).
  assert.match(
    body,
    /node_modules[\s\S]{0,40}structurally\s+denied/i,
    'must state the denial is structural, not a transient permission prompt',
  );
  // Anchored to the deps entry (measured gap: 239 chars) rather than scanning the whole
  // file — an unrelated future mention of context7 would otherwise keep this green even
  // if the fallback text were deleted.
  assert.match(
    body,
    /node_modules[\s\S]{0,400}(?:context7|public\s+documentation)/i,
    'the reduced-confidence fallback must sit with the deps denial, not merely appear somewhere',
  );
});

test('verify-mode.md points at source-registry.md by name', () => {
  const body = readVerifyMode();
  assert.match(body, /source-registry\.md/, 'verify-mode.md must name the registry sub-file');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — 15 failures (the existence test, nine per-source entry tests, four content tests, and the verify-mode stub test).

- [ ] **Step 3: Create `skills/research/source-registry.md`**

```markdown
# Research — Verify Mode Source Registry

Loaded by `verify-mode.md` when a question is classified **falsifiable** and needs a verdict.
`verify-mode.md` owns the mode's procedure; this file owns the sources, and it is separate
precisely because it is the part that grows — adding a source is an edit here, and the mode
procedure should not have to be re-read to make one.

## The registry

Entries are keyed by **what a source can falsify**, not by which tool they use. Three entries below
mechanically run `grep`; they are separate because they answer different kinds of question, and
collapsing them by tool would lose exactly the distinction the routing rules depend on.

| Source | What it can falsify | Confidence | Read mechanism |
|---|---|---|---|
| `runtime` | "this command works", "this produces X" — any claim about observable behavior when actually run | high | Execute it, bounded. See Bounded execution below. |
| `codebase` | "this symbol / branch / behavior exists in the source" | high | `Grep` / `Read` over source files. Provenance is `file:line`. |
| `repo-prose` | "this project already documents, decides, or forbids X" | high | `Grep` / `Read` over `CLAUDE.md`, `docs/**`, `skills/**`. Provenance is `file:line`. |
| `tests` | "this behavior is covered", "this invariant is enforced" | high | Read the suite; run one focused test when reading leaves real doubt. |
| `history` | "we have tried this before", "this failed before", "this was deliberate" | high | `docs/incident-log.md`, `git log`, closed work records. |
| `telemetry` | "this actually happens in practice", "at this rate" | high | `.claude-tweaks/pipelines/*/events.jsonl` and each run's `decisions.md`. |
| `deps` | "the dependency does / does not support X at the version we pin" | medium | `tools/upstream-drift/`'s checks and `manifest.yml`. See Dependency reads below. |
| `web` | "the outside world does X", "the state of the art is Y" | medium | `WebSearch` / `WebFetch` — the same tools the bare-topic survey path uses. |
| `human` | Anything only the human knows — intent, priority, an unstated constraint | n/a — terminator | **Dispatches no agent.** See The human terminator below. |

Confidence is a property of the **source**, carried on each verdict — never a document-level
disclaimer. A single run routinely mixes `file:line` evidence with web evidence, and a flat list
renders them identically.

### Bounded execution (`runtime`)

Reuse the technique `skills/docs-health/judge-procedure.md` already established for executing
command blocks — do not invent a second one:

```bash
cmd > /tmp/rv-$$.out 2>&1; echo "exit=$?"
```

Inspect the exit status plus `tail -20` of the temp file. The check is whether the command behaves
as claimed, not what it prints; an unbounded capture of something like `npm test` runs to hundreds
of KB and none of it changes the verdict. Widen to the full file only when the command fails, or
when its tail contradicts the claim and the detail is needed to describe the contradiction.

### Dependency reads (`deps`)

`node_modules` reads are **structurally denied in this project**, even after a grant attempt — this
is a standing environment fact, not a transient permission prompt to retry. When a `deps` question
needs the installed source, fall back to context7 or the dependency's public documentation and
record the verdict at **medium** confidence, noting the fallback in its provenance. Do not report a
`deps` verdict at high confidence on the strength of documentation alone: docs describe intent,
installed source describes behavior.

### The human terminator

`human` **dispatches no agent.** Routing a question here means stop researching it and ask — there
is no source that can settle intent, and a research pass that guesses at it produces a confident
answer to a question nobody asked. A question routed to `human` yields no verdict; it yields a
question for the caller to put to the user.
```

Then in `skills/research/verify-mode.md`, in the `## Question shape: falsifiable vs. unfalsifiable` section, replace:

```
The source registry, its routing rules, and the verdict's exact shape are record #177's
deliverable. This file establishes only that the split exists and which way each shape goes.
```

with:

```
The registry itself — every source, what each can falsify, its confidence tier, and how it is
read — lives in `source-registry.md` in this skill's directory, along with the routing rules, the
dispatch procedure, and the verdict shape. Read it when a question routes to the registry.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS — 42/42 (27 existing plus 15 new), all pre-existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add skills/research/source-registry.md skills/research/verify-mode.md tests/research/skill-md.test.js
git commit -m "Add the verify-mode source registry keyed by what each source falsifies — refs #177"
```

---

### Task 2: Routing rules

**Files:**
- Modify: `skills/research/source-registry.md` — append `## Routing`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: Task 1's `## The registry` table — routing selects rows from it.
- Produces: the multi-source question list Task 4's dispatch fans out over.

- [ ] **Step 1: Write the failing test**

```js
test('source-registry.md routes a question to every source that could falsify it', () => {
  const body = readSourceRegistry();
  assert.match(
    body,
    /every\s+source\s+that\s+could\s+falsify/i,
    'must state the route-to-all rule, not a pick-one rule',
  );
  // Anchored: "multiple" and "default" both appear elsewhere in the file, so a bare
  // presence check would pass on prose saying the opposite ([IL-78]).
  assert.match(
    body,
    /multiple\s+sources\s+per\s+question\s+is\s+the\s+(?:normal|default)\s+case/i,
    'multiplicity must be stated as the default, not the exception',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/research/`
Expected: FAIL — one failure; no `## Routing` section exists yet.

- [ ] **Step 3: Append `## Routing` to `skills/research/source-registry.md`**

```markdown
## Routing

A question goes to **every source that could falsify it** — not to the single best one. Multiple
sources per question is the normal case, not an exception, and a question that reaches only one
source is usually a question that was scoped too narrowly.

Route by reading the "What it can falsify" column against the question, and take every row that
could return a contradicting answer. Two consequences follow:

- **Agreement across sources is itself evidence.** Three sources that independently fail to falsify
  a claim support it far more than one that fails to falsify it once.
- **Disagreement is the most valuable outcome.** When `repo-prose` says one thing and `codebase`
  says another, the design question is settled less by which is right than by the fact that the two
  have drifted — that is a finding in its own right, and it is reported as one rather than resolved
  silently in favour of whichever source is easier to trust.

`human` is the exception to the fan-out: routing there **terminates** the question (see The human
terminator). When a question routes to `human` and to other sources, run the others — their
verdicts are what the human will need in order to answer.

### Absence is a finding

A source that returns nothing has answered. Report it — "no precedent exists" — never omit it. This
binds hardest on `history` and `telemetry`, where "we have never done this before" is frequently the
single most design-changing thing a run surfaces. A silently-absent result is indistinguishable from
a lookup that failed, and silence cannot be found by keyword search later.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS — 43/43.

- [ ] **Step 5: Commit**

```bash
git add skills/research/source-registry.md tests/research/skill-md.test.js
git commit -m "State the route-to-every-falsifying-source rule and its consequences — refs #177"
```

---

### Task 3: The verdict shape

**Files:**
- Modify: `skills/research/source-registry.md` — append `## The verdict`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: the registry's `Source` and `Confidence` columns from Task 1 — the verdict's `source` and `confidence` fields draw their vocabularies from them.
- Produces: the verdict template Task 4's dispatch prompt embeds verbatim. Task 4 must not restate the shape; it inlines this one.

- [ ] **Step 1: Write the failing test**

```js
test('source-registry.md verdict carries per-source confidence and the checked-against sha', () => {
  const body = readSourceRegistry();
  assert.match(body, /checked-at/, 'verdict must carry the sha it was checked against');
  assert.match(body, /outcome:\s*verified\s*\|\s*falsified\s*\|\s*unverified/i, 'must define the three outcomes');
  // Anchored to the claim, not to the word "confidence" (which appears in the
  // registry table header and several rows) ([IL-78]).
  assert.match(
    body,
    /confidence\s+is\s+per-source,?\s+not\s+per-report/i,
    'must state that confidence is carried per source, not per report',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/research/`
Expected: FAIL — one failure; no `## The verdict` section exists yet.

- [ ] **Step 3: Append `## The verdict` to `skills/research/source-registry.md`**

```markdown
## The verdict

Each dispatched source agent returns exactly one verdict:

```
outcome:    verified | falsified | unverified
source:     runtime | codebase | repo-prose | tests | history | telemetry | deps | web
confidence: high | medium
provenance: {file:line, command + exit status, URL, or record ref}
checked-at: {sha}
```

- **`outcome`** — `falsified` is the valuable one. It is not a failure of the research; it is the
  research working. `unverified` means the source ran and could not settle the claim either way,
  which is distinct from the source finding nothing (see Absence is a finding — that is a
  `verified` outcome for the claim "no precedent exists").
- **`source`** — the registry row that produced it. `human` never appears here: it dispatches no
  agent and therefore returns no verdict.
- **`confidence`** — the tier from that source's registry row, not a per-run judgment. **Confidence
  is per-source, not per-report.** A run that mixes a `file:line` verdict with a `web` verdict must
  render them at their own tiers; a single document-level disclaimer lets the grep-verified fact
  lend its credibility to the blog post beside it.
- **`provenance`** — what a reader would have to open to check the verdict themselves. A verdict
  with no provenance is an assertion, and is treated as `unverified` regardless of what it claims.
- **`checked-at`** — the commit sha the check ran against, from `git rev-parse HEAD`. Verdicts rot:
  a claim verified against one tree says nothing about another, and without the sha there is no way
  to know which tree it was.

Related: #117 ("Stamp health-sweep issues with the commit they were verified against") applies the
same sha-stamping to a different producer. If it lands a shared helper, use it rather than
duplicating the mechanism.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS — 44/44.

- [ ] **Step 5: Commit**

```bash
git add skills/research/source-registry.md tests/research/skill-md.test.js
git commit -m "Define the verdict shape with per-source confidence and a checked-against sha — refs #177"
```

---

### Task 4: Form B parallel dispatch

**Files:**
- Modify: `skills/research/source-registry.md` — append `## Dispatch`
- Test: `tests/research/skill-md.test.js`

**Interfaces:**
- Consumes: Task 2's routing (which produces question×source pairs) and Task 3's verdict shape (which the dispatch prompt embeds verbatim).
- Produces: nothing downstream in this record.

**Read the "Resolved contradiction in the record" section at the top of this plan before starting.** It explains why this task inlines a literal *verdict* template rather than Template A, and cites the contract clause that authorizes it. That deviation is deliberate.

- [ ] **Step 1: Write the failing tests**

```js
test('source-registry.md dispatch inlines a literal output template', () => {
  const body = readSourceRegistry();
  assert.match(body, /OUTPUT FORMAT \(required\)/, 'must inline a literal output template block');
  // The point of inlining is that a reference does not reach the agent. Assert the
  // template's own field names are present in the dispatch block, not merely that
  // the contract file is cited somewhere.
  assert.match(
    body,
    /OUTPUT FORMAT \(required\)[\s\S]{0,600}checked-at/,
    'the inlined template must carry the verdict fields, not just name the contract',
  );
});

test('source-registry.md dispatch uses Form B and the four-value status line', () => {
  const body = readSourceRegistry();
  assert.match(body, /Parallel execution:/, 'must carry the Form B parallel-execution directive');
  assert.match(body, /DONE_WITH_CONCERNS/, 'must inline the four-value status line');
  assert.match(body, /NEEDS_CONTEXT/);
  assert.match(body, /BLOCKED/);
});

test('source-registry.md dispatch states the agents are read-only with no git access', () => {
  const body = readSourceRegistry();
  assert.match(body, /read-only/i, 'must state the agents are read-only');
  assert.match(
    body,
    /no\s+git\s+access|never\s+given\s+git|without\s+git\s+access/i,
    'must state the agents carry no git access',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/research/`
Expected: FAIL — three failures; no `## Dispatch` section exists yet.

- [ ] **Step 3: Append `## Dispatch` to `skills/research/source-registry.md`**

```markdown
## Dispatch

> **Parallel execution:** Dispatch each question×source pair as parallel Task agents — each runs
> independently and returns one verdict. Assemble results after all agents complete.

One agent per question×source pair. A question routed to four sources fans out to four agents, and
they run concurrently — the pairs share no state, and a source that is slow to read must not hold
up the three that are fast.

**The agents are read-only and carry no git access.** They read files, run bounded read-only
commands, and fetch URLs; they never stage, commit, or branch. This removes the shared-index race
rather than narrowing it — parallel agents with git access race on one index no matter how
file-disjoint their reads look.

Model tier: `Fast` for `codebase`, `repo-prose`, `tests`, and `history` — these are grep-and-read
lookups against a named target. `Standard` for `runtime`, `telemetry`, `deps`, and `web`, where the
agent has to judge whether what it found actually settles the claim.

Inline this block verbatim in every dispatch prompt. It is a define-in-prompt format rather than
Template A, per `skills/_shared/subagent-output-contract.md`'s "Not every consumer uses A/B/C" — a
source agent returns a verdict, and Template A's severity/path/finding columns cannot express one.
The contract's input discipline, four-value status line, and model-tier selection all still apply.

```
Report one of these as your FIRST line, alone:
DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

OUTPUT FORMAT (required):
Then return ONLY these five lines, no preamble and no narration:

outcome:    verified | falsified | unverified
source:     {the one source you were assigned}
confidence: high | medium
provenance: {file:line, or command + exit status, or URL, or record ref}
checked-at: {output of `git rev-parse HEAD`}

If your source returns nothing, that is an answer, not a failure: report
outcome: verified with provenance naming what you searched and the literal
finding "no precedent exists". Never omit an empty result.

If you cannot reach your source at all, report BLOCKED and say what you tried.
Do not guess, and do not substitute a different source.
```

A verdict that arrives without provenance is treated as `unverified` whatever its `outcome` says —
re-dispatch once with the missing field named, then drop the pair and report it as unverified.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/research/`
Expected: PASS — 47/47.

- [ ] **Step 5: Run the full suite**

Run: `npm test`, redirected to a file then grepped — the suite is long and a direct pipe can truncate the real failure.
Expected: 0 failing. The count immediately before this record was 2341 passing.

- [ ] **Step 6: Commit**

```bash
git add skills/research/source-registry.md tests/research/skill-md.test.js
git commit -m "Fan out one read-only agent per question×source pair with an inlined verdict template — refs #177"
```

---

## Acceptance criteria coverage

| AC | Task | How it is verified |
|---|---|---|
| 1 — every entry names what it falsifies, a confidence tier, and a read mechanism | 1 | `source-registry.md keys every entry by what it falsifies, not by tool` (anchors the four-column header) |
| 2 — runtime cites the bounded-output form; grep for `exit=` returns ≥1 | 1 | `source-registry.md runtime entry cites the bounded-output form` |
| 3 — human dispatches no agent and terminates research | 1 | `source-registry.md human entry is a terminator that dispatches no agent` |
| 4 — routes to every falsifying source; multiple is the default | 2 | `source-registry.md routes a question to every source that could falsify it` |
| 5 — dispatch inlines a literal template, not a reference | 4 | `source-registry.md dispatch inlines a literal output template` — **see the Resolved-contradiction section: a verdict template, not Template A** |
| 6 — agents are read-only, no git access | 4 | `source-registry.md dispatch states the agents are read-only with no git access` |
| 7 — verdict includes the sha; confidence is per-source | 3 | `source-registry.md verdict carries per-source confidence and the checked-against sha` |
| 8 — deps records the node_modules denial and its fallback | 1 | `source-registry.md deps entry records the node_modules denial and its fallback` |
| 9 — an entry for each of the nine sources | 1 | Nine generated `source-registry.md has an entry for {source}` tests |
| 10 — `node --test tests/research/` passes | 1-4 | Every task's Step 4 |
