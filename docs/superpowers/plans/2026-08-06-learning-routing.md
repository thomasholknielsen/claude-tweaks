# Learning-Routing Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give claude-tweaks one classifier that decides where a learning goes, plus the two destination writers it currently lacks — memory (D4) and upstream feedback (D5).

**Architecture:** A shared contract (`skills/_shared/learning-routing.md`) holds the destination table, an ordered 8-rule classifier, and the memory write procedure; every learning producer cites it rather than restating its own routing table. A new component skill (`skills/feedback/`) owns upstream filing. The three existing destination writers (CLAUDE.md, project skills/docs, work records) are untouched. No new `bin/lib/` module, no new durable state — dedup reuses CLAUDE.md already being resident, `MEMORY.md` as the harness-maintained index, and `bin/lib/health-core/fingerprint.js`.

**Tech Stack:** Markdown skill files with YAML frontmatter; `node --test` for the convention suite; the `evals/` harness (ESM, `js-yaml`, `@anthropic-ai/claude-agent-sdk`) for classifier judgment coverage; `gh` CLI for upstream filing.

## Global Constraints

Copied verbatim from the spec and CLAUDE.md. Every task's requirements implicitly include this section.

- **Upstream target is `thomasholknielsen/claude-tweaks` only.** A learning classified "upstream, but not claude-tweaks" is reported and stopped, leaving the user's personal `repo-feedback` skill as the manual path. Never file against `obra/superpowers` or `lab-holknielsen/claude-user-config`.
- **D4 and D5 are never auto.** Both stage and require explicit user approval. Neither is eligible for the `unattended-tier` opt-in.
- **One lesson, one destination.** The classifier is first-match-wins and routing stops at the first match.
- **The memory directory path is supplied, never derived.** Same rule as `skills/harness-health/SKILL.md:35`'s `--memory-dir`: "the invoking assistant's own memory directory path, exactly as stated in its own system prompt for this project. Never derive or guess this path."
- **No emojis in skill files.** Use `**(Recommended)**` bold text for emphasis.
- **Skill references inside actionable instruction text must be fully qualified** — `/claude-tweaks:feedback`, never bare `/feedback`. Bare short-form is reserved for descriptive prose.
- **40 KB soft ceiling** for any single `SKILL.md` or sub-file.
- **Commit message style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes.
- **Backfilling existing memories and Don'ts is out of scope.** Do not reclassify or move any existing memory file or CLAUDE.md bullet in this plan.

**Note on task shape.** Most of this feature is skill prose, not code. Only Task 2 and Task 7 have executable test cycles; the rest verify by targeted grep against the after-state. Every grep in this plan was authored to be case-insensitive and content-anchored, and to tolerate hard-wrapped markdown (`[IL-66]`).

---

### Task 1: The shared routing contract

**Files:**
- Create: `skills/_shared/learning-routing.md`

**Interfaces:**
- Produces: the canonical destination table (D1-D5), the ordered 8-rule classifier, the dedup tiers, and the D4 memory write procedure. Tasks 2-6 cite this file by path and MUST NOT restate its tables.

- [ ] **Step 1: Create the contract file**

Create `skills/_shared/learning-routing.md` with exactly this content:

````markdown
# Learning Routing — the destination contract

Canonical home for the decision "where does this learning go?". Read by
`/claude-tweaks:reflect` (all three modes), `/claude-tweaks:wrap-up` (Steps 6, 7,
7.10, 7.11), `/claude-tweaks:review` (lens 3a), `/claude-tweaks:build`
(Common Step 4.5), and the four health-sweep skills. Consumers cite this file;
they do not restate its tables.

## Destinations

Routing resolves on an **audience x durability** axis.

| | Destination | Audience | Context cost | Writer |
|---|---|---|---|---|
| **D1** | `CLAUDE.md` Don'ts / `.claude/rules/` | this project | highest — every dispatched agent | `wrap-up` Step 6.1 |
| **D2** | Project skill / doc / ADR / journey | this project | medium — lazy-loaded | `wrap-up` Steps 6.2, 7, 7.7, 7.8 |
| **D3** | Backlog work record | this project, deferred | none until claimed | `_shared/work-record.md` |
| **D4** | Memory file | this user, **all** projects | high — every session | this file, "Memory write procedure (D4)" |
| **D5** | Upstream issue to `claude-tweaks` | everyone using the plugin | none locally | `/claude-tweaks:feedback` |

## The classifier

An ordered decision procedure. **First match wins and routing stops.**

1. **Names a `/claude-tweaks:*` skill, a `skills/_shared/*` contract, or a
   `bin/*.js` behavior, and would hold in any project using the plugin**
   → **D5 defect report**
2. **About the user** — a preference, a working style, how they want decisions
   made or work presented → **D4 memory** (`type: user` or `feedback`)
3. **An environment or tooling fact with no owning artifact** in this project or
   the plugin — shell behavior, a harness quirk, a third-party tool's contract
   → **D4 memory** (`type: reference`)
4. **A rule about this codebase that must always be loaded** → **D1**
5. **Procedure knowledge for a bounded domain** → **D2**
6. **Work to do, not knowledge to keep** → **D3**
7. **Generic craft knowledge that rules 4-6 found no home for, and that no
   claude-tweaks artifact currently covers** → **D5 gap report**
8. Otherwise → do not capture, with a stated reason.

**Rules 2 and 3 are the whole of memory.** Everything else has an owner, and the
classifier's job is to find it.

**Rule 7 is what makes rule 2 affordable.** Without it, a strict memory rule
leaves useful craft knowledge homeless and the pressure to widen rule 2 returns
immediately. A lesson whose natural owner is a dependency outside D5's scope
(for example `superpowers:writing-plans`) is caught by rule 4 in a project that
already carries that convention, and by rule 7 everywhere else — surfacing as
"claude-tweaks should carry guidance on X".

A rule-7 gap report always asks claude-tweaks to carry guidance of its own. It
never asks claude-tweaks to fix a dependency, and it never forwards a complaint
about one. Filing against the dependency's own repository is a separate act,
forbidden below.

**Ordering is load-bearing.** D5 is evaluated before D4. When memory is the only
cross-project store available, every transferable lesson defaults into it; that
is the failure this ordering exists to prevent.

**One lesson, one destination.** A lesson that genuinely serves two audiences is
two lessons, stated separately, each routed on its own. Do not route a single
insight to two stores.

**Self-reference.** Before returning a D5 verdict, check:

```bash
git remote get-url origin
```

When the remote resolves to the claude-tweaks repository itself, D5 collapses —
re-run the classifier from rule 4, so the lesson becomes an ordinary D1/D2/D3
outcome. The plugin never files issues against itself through this path.

**Non-claude-tweaks upstream.** Filing an issue *against* a third-party
dependency's own repository (superpowers, an MCP server, another plugin) is
**not** a D5 filing and is out of this contract's scope. Report it to the user,
name the owner, and stop.

This does not conflict with rule 7. The two describe different targets for the
same lesson: rule 7 files against **claude-tweaks**, asking it to carry guidance
it currently lacks — including guidance about using a dependency it already
wraps. This rule forbids filing against the **dependency itself**. The first is
in scope; the second never is.

## Dedup

Check before every write. Each tier uses an artifact that already exists; this
contract introduces no index.

| Store | Mechanism |
|---|---|
| **D1** | `CLAUDE.md` is loaded into every session as project instructions — its `Don't` bullets are already resident. Compare against them directly; no read needed. |
| **D2** | Not resident. Dedup against a read the routing step is already doing: `wrap-up` Step 7.2's domain-overlap skill scan, Step 7.7's doc scan, and Step 7.8's journey-frontmatter overlap each open the candidate target before writing. Compare there — never write a D2 learning without having read the file it lands in. |
| **D4** | Read `MEMORY.md` in the supplied memory directory — the harness maintains it as a one-line-per-memory index. |
| **D5** | Content fingerprint plus `gh issue list --search`. See `/claude-tweaks:feedback`. |

`docs/incident-log.md` (or any project's equivalent narrative store) is **not**
read wholesale. Grep it only when the resident-CLAUDE.md check is ambiguous.
This is sound because a live `Don't` carries its incident tag: an incident entry
with no surviving rule is exactly the case where re-proposing the rule may be
correct.

When dedup finds an existing record that the new learning **improves** rather
than duplicates — a sharper condition, an additional trigger, a recurrence count
— route it as an update to that record, not as a new one. An improvement filed
as a duplicate leaves the shipped copy the less accurate of the two.

## Memory write procedure (D4)

**Path.** The memory directory comes from the invoking assistant's own system
prompt, exactly as stated there for this project. **Never derive, compute, or
guess it.** Same rule `skills/harness-health/SKILL.md` applies to `--memory-dir`.
If the invoking assistant has no memory directory in its system prompt, D4 is
unavailable: report that and re-run the classifier from rule 4.

**File.** One fact per file, at `<memory-dir>/<name>.md`:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
---

<the fact. For feedback, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

**Index.** Append one line to `MEMORY.md` in the same directory:

```
- [Title](<name>.md) — <hook>
```

The line must stay within **150 characters** — the budget
`_shared/harness-health-memory-checks.md` already enforces when auditing.

**Never auto.** A memory write is cross-project and always-loaded; a wrong one
silently degrades every future session in every project. Stage it and surface it
for explicit approval. See `_shared/auto-mode-contract.md`.

## Subject check (health sweeps)

Before filing a finding as a project issue, a health sweep asks whose code the
finding is actually about.

When the subject is a claude-tweaks skill, contract, or CLI rather than this
project's own code, the finding is a **D5** learning, not a project issue —
route it to `/claude-tweaks:feedback` instead of filing locally. Classify via
the classifier above.

This applies only where claude-tweaks is a dependency. When this project *is*
claude-tweaks, the self-reference check above collapses D5 and the finding files
locally as usual.

## Consumers

| Consumer | How it uses this file |
|---|---|
| `/claude-tweaks:reflect` | Routes each insight through the classifier instead of its own destination table |
| `/claude-tweaks:wrap-up` | Steps 6/7 classify before writing; Steps 7.10/7.11 own the D4/D5 stage-and-surface |
| `/claude-tweaks:review` lens 3a | Classifies skill-routed findings |
| `/claude-tweaks:build` Common Step 4.5 | Classifies architecture-alignment learnings |
| health sweeps | A finding whose subject is a claude-tweaks skill routes to D5 rather than a project issue |
````

- [ ] **Step 2: Verify the file lands under the size ceiling and states each rule once**

Run:
```bash
wc -c skills/_shared/learning-routing.md
grep -c "^[0-9]\. \*\*" skills/_shared/learning-routing.md
```
Expected: byte count well under 40960; classifier rule count of `7` (rule 8 is not bolded, by design — it is the fallthrough).

- [ ] **Step 3: Verify no consumer table was restated from another file**

Run:
```bash
grep -rniE "audience *x *durability" skills/ | grep -v "^skills/_shared/learning-routing.md"
```
Expected: no output. The axis is named once.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/learning-routing.md
git commit -m "Add the learning-routing contract — destinations, classifier, memory write procedure"
```

---

### Task 2: The `/claude-tweaks:feedback` skill

**Files:**
- Create: `skills/feedback/SKILL.md`
- Modify: `tests/skill-conventions.test.js:26`, and its `LINEAR_DIAGRAM_SKILLS` array

**Interfaces:**
- Consumes: `skills/_shared/learning-routing.md` (Task 1) — rules 1 and 7, the self-reference check, the D5 dedup tier.
- Produces: `/claude-tweaks:feedback [<learning text>] [--kind=defect|gap] [--dry-run]`. Task 7's eval invokes the `--dry-run` form. Tasks 4 and 6 reference this skill by its fully-qualified name.

**Why the count bump lands in this task.** `tests/skill-conventions.test.js` enumerates `skills/*/SKILL.md` and asserts an exact count. Creating the skill without the bump fails the suite; bumping without the skill also fails it. Both edits belong to the task whose own content satisfies them.

- [ ] **Step 1: Run the convention suite to confirm the current baseline**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS. Note the current count is 32.

- [ ] **Step 2: Create the skill file**

Create `skills/feedback/SKILL.md`:

````markdown
---
name: claude-tweaks:feedback
description: Use when a learning belongs upstream in the claude-tweaks plugin rather than in this project — a skill that behaves wrongly (defect) or has no opinion where it should (gap). Files it as a GitHub issue against thomasholknielsen/claude-tweaks after an explicit scrub and confirmation.
argument-hint: "[<learning text>] [--kind=defect|gap] [--dry-run]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Feedback — Route a learning upstream to the claude-tweaks plugin

The D5 writer of `_shared/learning-routing.md`. Files learnings that would help
every adopter of the plugin, not just this project.

Lifecycle: `/claude-tweaks:reflect` → **`/claude-tweaks:feedback`** → upstream issue

## When to Use

- The routing classifier returned **D5** for a learning (rule 1 or rule 7).
- A `/claude-tweaks:*` skill behaved wrongly, errored, or was missing a
  capability, and the lesson would hold in any project using the plugin.
- A health sweep surfaced a finding whose subject is a claude-tweaks skill
  rather than this project's own code.

Do **not** use this skill to file against any repository other than
`thomasholknielsen/claude-tweaks`. A learning owned by a third-party dependency
is reported to the user and stopped — see `_shared/learning-routing.md`,
"Non-claude-tweaks upstream".

## Input

`$ARGUMENTS` is parsed as `[<learning text>] [--kind=<value>] [--dry-run]`:

| Argument | Behavior |
|----------|----------|
| Free-text learning | The substance of the report. When absent, gather it from the conversation or ask. |
| `--kind=defect` | The plugin does something wrong. Skips Step 2's inference. |
| `--kind=gap` | The plugin has no opinion where it should. Skips Step 2's inference. |
| `--dry-run` | Run classification, self-reference, dedup, drafting, and scrub, then render the draft and **stop**. Makes no `gh` calls and files nothing. |

## Workflow

### Step 1: Gather

Determine the summary (one line), the affected component (the skill, contract,
or CLI involved, or "unclear / general"), and a title naming the component and
the symptom. For a defect, also gather repro steps and expected-vs-actual. For a
gap, gather the use case — what the user was trying to do and why the plugin's
current behavior does not support it.

### Step 2: Classify the kind

Read `_shared/learning-routing.md` and confirm the learning is D5 at all. Then:

- Classifier **rule 1** fired → `defect`
- Classifier **rule 7** fired → `gap`

The kind comes from which rule fired. Never guess it, and never infer it from
tone. If `--kind=` was passed, use that and skip the inference.

A defect and a gap differ in triage, urgency, and what a maintainer does with
them. They must not arrive looking identical.

### Step 3: Self-reference check

```bash
git remote get-url origin
```

If the remote resolves to the claude-tweaks repository itself, **stop**. Report
that the learning belongs in this project's own records and re-run the
classifier from rule 4 per `_shared/learning-routing.md`. Do not file.

### Step 4: Dedup

Derive a fingerprint basis from the affected component plus the core symptom,
then search:

```bash
gh issue list --repo thomasholknielsen/claude-tweaks --search '<keywords>' --state all --limit 10 --json number,title,state,url
```

Show any plausible matches and ask whether to file anyway, comment on the
existing issue instead (then stop), or cancel.

Reuse `bin/lib/health-core/fingerprint.js` (`createFingerprint`, `normalizeText`)
for the fingerprint marker embedded in the body, so a later run recognizes its
own prior filing.

### Step 5: Draft

Title: `<component>: <symptom>`

```
**Summary:** <one line>

**Kind:** Defect | Gap

**Affected component:** <skill, contract, or CLI — or "unclear / general">

**Repro steps:** (defect only)
1. ...

**Expected vs. actual:** (defect only)
Expected: ...
Actual: ...

**Use case:** (gap only)
<what you were trying to do and why current behavior does not support it>

**Plugin version:** <from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json>

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: <marker> -->
```

Resolve the plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`,
never from install metadata or `gitCommitSha` (`[IL-89]`).

### Step 6: Scrub — HARD GATE

The target repository is **public** and the learning was derived from a codebase
that may not be. Before showing the draft, remove:

- Credentials, tokens, and connection strings
- Absolute paths outside the plugin itself
- Code excerpts from the reporting project
- The reporting project's name, when that project is private — say "a private
  project" instead

Keep only what a maintainer needs to reproduce or understand the report.

This gate is unconditional. It runs on every invocation, including `--dry-run`
and including invocations that began inside a pipeline.

### Step 7: Confirm — HARD GATE

Show the full scrubbed draft and call `AskUserQuestion`:

- `question`: `"File this upstream against thomasholknielsen/claude-tweaks?"`,
  `header`: `"File upstream"`, `multiSelect`: `false`
- Option 1 — `label`: `"File it (Recommended)"`, `description`: `"Create the issue as drafted"`
- Option 2 — `label`: `"Edit first"`, `description`: `"Tell me what to change before filing"`
- Option 3 — `label`: `"Don't file"`, `description`: `"Discard — the learning stays local"`

Never file without this confirmation, in any mode. Publishing to a public
repository is outward-facing and effectively irreversible.

When `--dry-run` was passed, render the draft, state the classified destination
and kind, and **stop here** — do not call `AskUserQuestion` and do not file.

### Step 8: File

```bash
BODY_FILE=$(mktemp)
cat > "$BODY_FILE" <<'BODY'
<body>
BODY
gh issue create --repo thomasholknielsen/claude-tweaks \
  --title '<title>' \
  --body-file "$BODY_FILE"
```

Confirm a label exists before passing it:

```bash
gh label list --repo thomasholknielsen/claude-tweaks --limit 200
```

Pass `--label bug` for a defect or `--label enhancement` for a gap **only** when
that label is present in the output. Omit `--label` entirely otherwise and say
why — never substitute a guessed label, and never apply the repository's own
internal automation taxonomy (`by:*`, `type:*`, `risk:*`, `ready`, `effort:*`),
which belongs to records that moved through its in-repo pipeline.

On failure, enqueue the payload to the retry queue rather than dropping it, per
`_shared/health-filing-mechanics.md`'s retry-drain shape. An entry that stays
stuck escalates as a `feedback:filing-failed` issue.

### Step 9: Report

Give the user the created issue URL. If the flow stopped at Step 3, 4, 6, or 7,
report where it stopped and why — nothing further is needed.

## Next Actions

Render one `AskUserQuestion` with options drawn from context: continue the
parent workflow, file a second related learning, or open the created issue.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:feedback` is running inside a
pipeline (invoked by `/claude-tweaks:wrap-up`, `/claude-tweaks:reflect`, or
another pipeline orchestrator). In that case omit the `## Next Actions` block —
the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when
ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

Being inside a pipeline never relaxes Steps 6 and 7. `auto` mode does not
silence this skill — see `_shared/auto-mode-contract.md`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Filing without showing the scrubbed draft | Publishing to a public repo is outward-facing and irreversible; confirmation is the contract, not a formality |
| Filing against a repo other than `thomasholknielsen/claude-tweaks` | Out of scope by design — a third-party owner has different consent requirements |
| Inferring the kind from tone rather than from which classifier rule fired | Defect and gap differ in triage; a mislabelled report wastes a maintainer's time in both directions |
| Applying a label `gh label list` did not confirm | Guessing risks importing the repo's internal automation taxonomy from outside its pipeline |
| Skipping the scrub because the reporting project "looks fine" | The scrub is unconditional; the cost of one leak exceeds the cost of every scrub |
| Filing when `git remote` shows claude-tweaks itself | Self-filing duplicates a record the project should hold directly |
| Dropping a payload when `gh` fails | The retry queue exists so a transient failure does not silently lose the learning |
````

- [ ] **Step 3: Run the convention suite to see it fail on the count**

Run: `node --test tests/skill-conventions.test.js`
Expected: FAIL — `every skill directory with a SKILL.md is discovered` reports `Expected values to be strictly equal: 33 !== 32`.

- [ ] **Step 4: Update the two count assertions**

In `tests/skill-conventions.test.js`, change line 26 from:

```javascript
  assert.strictEqual(skillNames().length, 32);
```

to:

```javascript
  assert.strictEqual(skillNames().length, 33);
```

Then add `'feedback'` to `LINEAR_DIAGRAM_SKILLS` in alphabetical position:

```javascript
const LINEAR_DIAGRAM_SKILLS = [
  'capture', 'challenge', 'design-wrapper', 'feedback', 'init', 'review',
  'specify', 'stories', 'test', 'version', 'wrap-up',
];
```

Update the three test names that state the array's size, from `the 10 linear-diagram skills` / `the 10 rewritten skills` to `the 11 linear-diagram skills` / `the 11 rewritten skills`.

Leave `assert.strictEqual(untouched.length, 22)` **unchanged** — 33 total minus 11 linear equals 22, so that count is stable. Verify this rather than assuming it.

- [ ] **Step 5: Run the convention suite to verify it passes**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS, all assertions.

- [ ] **Step 6: Run the full suite for regressions**

Run: `npm test`
Expected: PASS. Read the TAP summary (`# fail 0`), not the wrapper's exit code.

- [ ] **Step 7: Commit**

```bash
git add skills/feedback/SKILL.md tests/skill-conventions.test.js
git commit -m "Add /claude-tweaks:feedback — the upstream D5 writer with an unconditional scrub gate"
```

---

### Task 3: Route reflect's insights through the contract

**Files:**
- Modify: `skills/reflect/full-mode.md` (routing guide at lines 57-67; lens table line 16)
- Modify: `skills/reflect/light-mode.md` (lens table line 12)
- Modify: `skills/reflect/hindsight-mode.md`

**Interfaces:**
- Consumes: `skills/_shared/learning-routing.md` classifier; `/claude-tweaks:feedback` for D5 outcomes.

- [ ] **Step 1: Replace full-mode's routing guide with a citation**

In `skills/reflect/full-mode.md`, replace the `**Routing guide:**` table (the seven-row table beginning `| Finding Type | Suggested Destination |`) with:

```markdown
**Routing guide.** Classify every insight through the ordered procedure in
`skills/_shared/learning-routing.md` — that file is the single source of truth
for destinations and their precedence. Do not restate its table here.

Two of its outcomes are newer than this skill's previous behavior and deserve
naming explicitly:

- **D4 (memory)** — the insight is about the user, or is an environment fact
  with no owning artifact. Written per the contract's memory write procedure,
  staged for approval, never auto-applied.
- **D5 (upstream)** — the insight is about a claude-tweaks skill or contract and
  would hold in any project using the plugin. Routed to
  `/claude-tweaks:feedback`.

The contract is first-match-wins: one insight yields one destination. An insight
that genuinely serves two audiences is two insights, stated separately.
```

**Why the old row must go.** The retired table's row `| "A fundamentally better approach exists" | Skill update + Memory file |` routed one lesson to two stores. That is the duplication mechanism this feature exists to close, written down as a rule.

- [ ] **Step 2: Update the lens-4 destination hint in both mode files**

In `skills/reflect/full-mode.md` line 16 and `skills/reflect/light-mode.md` line 12, replace the trailing `Architectural alternatives, memory files` cell with `Architectural alternatives; route via _shared/learning-routing.md`.

- [ ] **Step 3: Add the same citation to hindsight-mode**

In `skills/reflect/hindsight-mode.md`, wherever findings are routed to a destination, add the sentence: `Classify via skills/_shared/learning-routing.md — do not restate its destination table.`

- [ ] **Step 4: Verify no reflect file still carries its own destination table**

Run:
```bash
grep -rniE "suggested destination|recommended destination" skills/reflect/
```
Expected: only the interactive batch-table header in `full-mode.md` (`| # | Insight | Recommended Destination |`), which is a rendered output template, not a routing authority. Any `| Finding Type |` row is a failure.

Run:
```bash
grep -rn "Skill update + Memory file" skills/
```
Expected: no output.

- [ ] **Step 5: Verify the contract is actually cited**

Run:
```bash
grep -rlc "learning-routing" skills/reflect/
```
Expected: all three mode files listed.

- [ ] **Step 6: Commit**

```bash
git add skills/reflect/
git commit -m "Route reflect insights through the learning-routing contract — retire the two-store row"
```

---

### Task 4: Wrap-up stages D4 and D5

**Files:**
- Modify: `skills/wrap-up/SKILL.md` (Steps 6 and 7 gate prose; add Steps 7.10 and 7.11; the Step 8.6 console description at line 260 and its read-gate at line 266)
- Modify: `skills/wrap-up/review-console.md` (line 122's section enumeration; line 155's per-item sentence; two new sections after `#### Queue writes`)

**Interfaces:**
- Consumes: `skills/_shared/learning-routing.md`; `/claude-tweaks:feedback` (Task 2).
- Produces: `staged/wrap-up-memory-{N}.md` and `staged/wrap-up-upstream-{N}.md` stage paths, read by the Review Console.

**Placement decision.** The two new console sections are **per-item approval**, joining Queue writes — not the batch-approved group. The spec's own rationale requires it: D5 is the same category as work-record creation (outward-facing, effectively irreversible), and D4 has the largest blast radius of the five destinations. This keeps `up to nine named batch sections` and `the ninth of its named batch sections` accurate and unchanged; only line 155's wording, which currently names Queue writes as the single per-item section, needs generalizing.

- [ ] **Step 1: Add Step 7.10 to wrap-up**

In `skills/wrap-up/SKILL.md`, after Step 7.9, insert:

```markdown
### Step 7.10: Memory curation (D4)

Classify every reflection insight and ledger learning not already routed by
Steps 6-7.9 through `_shared/learning-routing.md`. For each that resolves to
**D4**, dedup against `MEMORY.md` per the contract, then stage — never write
directly:

```
STAGED {time} — Step 7.10: memory file proposed "{name}" ({type}). Reversibility: high (stage path: staged/wrap-up-memory-{N}.md).
```

The stage file holds the complete proposed memory file plus its `MEMORY.md`
index line, so the Review Console can show exactly what would be written.

**Skip entirely** when the invoking assistant's system prompt states no memory
directory for this project — D4 is unavailable, and the contract re-runs the
classifier from rule 4.

**Mandatory summary**, emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.10 memory curation: {N} insights classified, {M} resolved D4, {K} deduped against MEMORY.md. Reversibility: N/A.
```
```

- [ ] **Step 2: Add Step 7.11 to wrap-up**

Immediately after Step 7.10, insert:

```markdown
### Step 7.11: Upstream feedback (D5)

For every learning that `_shared/learning-routing.md` resolves to **D5**, run
the contract's self-reference check first. When it collapses D5, re-classify and
handle the result in the appropriate earlier step instead.

Otherwise stage one proposal per learning — never file during the run:

```
STAGED {time} — Step 7.11: upstream {defect|gap} report proposed for {component}. Reversibility: medium (public issue; stage path: staged/wrap-up-upstream-{N}.md).
```

The stage file holds the fully drafted **and already scrubbed** body, so the
Review Console shows exactly what would be published. Filing happens in Step 10
by invoking `/claude-tweaks:feedback` per approved row.

**Mandatory summary**, emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.11 upstream feedback: {N} learnings classified, {M} resolved D5 ({D} defect / {G} gap), self-reference: {collapsed|not applicable}. Reversibility: N/A.
```
```

- [ ] **Step 3: Add the two Review Console sections**

In `skills/wrap-up/review-console.md`, after the `#### Queue writes` section in the console template, add:

```markdown
#### Memory updates — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

| # | Name | Type | Fact | Index line | Patch |
|---|---|---|---|---|---|
| 13 | dispatch-prompt-conventions | feedback | Restate convention-governed actions in the dispatch prompt | `- [Dispatch prompt conventions](dispatch-prompt-conventions.md) — restate the convention` | `staged/wrap-up-memory-1.md` |

> A memory file is cross-project and always-loaded — a wrong one degrades every future session in every project. `_shared/auto-mode-contract.md` lists it as not silenced by `auto`.

#### Upstream feedback — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

| # | Kind | Component | Summary | Patch |
|---|---|---|---|---|
| 14 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `staged/wrap-up-upstream-1.md` |

> Filing publishes privately-derived content to a public repository. The body shown is already scrubbed; approving files it via `/claude-tweaks:feedback`.
```

- [ ] **Step 4: Generalize line 155's per-item sentence**

In `skills/wrap-up/review-console.md`, replace:

```
The named batch sections below resolve via one batch choice; Queue writes (a separate, tenth section) require per-item approval because `_shared/auto-mode-contract.md` lists work-record creation as not-silenced by `auto`.
```

with:

```
The named batch sections below resolve via one batch choice. The per-item sections that follow them — Queue writes, Memory updates, Upstream feedback — each require per-item approval, because `_shared/auto-mode-contract.md` lists work-record creation, memory writes, and upstream filing as not silenced by `auto`.
```

- [ ] **Step 5: Verify the batch-section counts did NOT change**

Run:
```bash
grep -rn "up to nine named batch sections" skills/wrap-up/review-console.md
grep -rn "ninth of its named batch sections" skills/wrap-up/cleanup-procedures.md
grep -rn "up to nine sections" skills/wrap-up/SKILL.md
```
Expected: each returns its one existing line, unchanged. The two new sections are per-item, so these counts stay correct. If any of them now reads wrong, the placement decision above was not followed.

- [ ] **Step 6: Verify no stale "tenth section" reference survives**

Run:
```bash
grep -rniE "a separate,? tenth section" skills/
```
Expected: no output.

- [ ] **Step 7: Verify both new steps are cited from the console**

Run:
```bash
grep -rn "Step 7.10\|Step 7.11" skills/wrap-up/
```
Expected: hits in both `SKILL.md` (the step definitions) and `review-console.md` is not required — the console sections name their own source in the stage-path column. At minimum `SKILL.md` must define both.

- [ ] **Step 8: Commit**

```bash
git add skills/wrap-up/
git commit -m "Stage memory and upstream learnings at wrap-up — two per-item Review Console sections"
```

---

### Task 5: Auto-mode contract rows

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md` (the "What `auto` does NOT silence" table)

**Interfaces:**
- Consumes: nothing. Produces the canonical statement Tasks 2 and 4 cite.

- [ ] **Step 1: Add two rows to the not-silenced table**

In `skills/_shared/auto-mode-contract.md`, append to the `## What `auto` does NOT silence` table, after the Ops-acknowledgment row:

```markdown
| Memory file writes (`/wrap-up` Step 7.10, `_shared/learning-routing.md` D4) | A memory file is cross-project and always-loaded — a wrong one silently degrades every future session in every project the user works in, which is the largest blast radius of any routing destination. Always staged, never auto-applied. **Not** exempt under `unattended-tier`. |
| Upstream feedback filing (`/wrap-up` Step 7.11, `/claude-tweaks:feedback`) | Publishes privately-derived content to a public repository — outward-facing and effectively irreversible, the same category as work-record creation. The scrub and confirm gates run in every mode. **Not** exempt under `unattended-tier`. |
```

- [ ] **Step 2: Follow the file's own change checklist**

That file's "adding a lever" checklist requires adding the lever name to the Bookend Architecture computed-levers list when it changes either table. Read the checklist (near the end of the file) and apply every step it names to these two rows.

- [ ] **Step 3: Confirm unattended-tier does not claim these**

Run:
```bash
grep -rniE "memory|upstream" skills/_shared/unattended-tier.md
```
Expected: no output — that file's carve-out must not name either destination. If it does, the carve-out contradicts the rows just added and must be narrowed.

- [ ] **Step 4: Verify both rows landed in the correct table**

Run:
```bash
awk '/^## What .auto. does NOT silence/,/^## /' skills/_shared/auto-mode-contract.md | grep -ciE "memory file writes|upstream feedback filing"
```
Expected: `2`.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/auto-mode-contract.md
git commit -m "Declare memory writes and upstream filing as never silenced by auto"
```

---

### Task 6: Producer hook-ups — health sweeps, build, review

**Files:**
- Modify: `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md`
- Modify: `skills/build/SKILL.md` (Common Step 4.5), `skills/review/SKILL.md` (lens 3a)

**Interfaces:**
- Consumes: `skills/_shared/learning-routing.md`; `/claude-tweaks:feedback`.

**Sequencing note.** These six edits are near-identical in shape. Apply them one at a time in the order listed and re-read each file's surrounding context before editing — a finding that one file's review surfaces about a sibling must be applied to that sibling in this same task, not deferred (`[IL-52]`, `[IL-53]`).

- [ ] **Step 1: Add the routing citation to each health sweep**

**Cite, do not restate.** `skills/code-health/SKILL.md` is already at the 40 KB Global Constraint (40,089 bytes measured before this plan ran), and the subject-check prose is identical across all four sweeps — restating it four times is the duplication `[IL-32]` forbids and the `_shared/` convention exists to prevent. The block itself lives in `_shared/learning-routing.md`'s "Subject check (health sweeps)" section, added in Task 1.

In each of the four health-sweep `SKILL.md` files, in the FILE step immediately before the filing gate, add exactly this one line and nothing more:

```markdown
**Subject check before filing.** Apply the "Subject check (health sweeps)" section of `skills/_shared/learning-routing.md` — a finding about a claude-tweaks skill is a D5 learning routed to `/claude-tweaks:feedback`, not a project issue.
```

Do not paste the section's body into any sweep. Do not paraphrase its self-reference caveat inline — the citation carries it.

- [ ] **Step 2: Add the contract citation to build Common Step 4.5**

In `skills/build/SKILL.md` Common Step 4.5, add: `Architecture-alignment learnings that outlive this project route via skills/_shared/learning-routing.md rather than defaulting to a ledger entry.`

- [ ] **Step 3: Add the contract citation to review lens 3a**

In `skills/review/SKILL.md` lens 3a, add: `Classify skill-routed findings via skills/_shared/learning-routing.md — a finding about a claude-tweaks skill is D5, not a project skill update.`

- [ ] **Step 4: Verify all six files cite the contract**

Run:
```bash
grep -rl "learning-routing" skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md skills/build/SKILL.md skills/review/SKILL.md
```
Expected: all six paths listed. A missing path means that consumer silently no-ops (`[IL-60]`).

- [ ] **Step 5: Verify the caveat lives once, and no sweep restated it**

The self-reference caveat must exist exactly once — in the contract — with the four sweeps citing it. A sweep that restated it would drift from the others.

Run:
```bash
grep -c "Subject check (health sweeps)" skills/_shared/learning-routing.md
```
Expected: `1`.

Run:
```bash
grep -rn "collapses D5" skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md
```
Expected: no output — the caveat's body must not appear in any sweep.

- [ ] **Step 5b: Verify no modified file breached the size ceiling**

Run:
```bash
wc -c skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md skills/build/SKILL.md skills/review/SKILL.md
```
Expected: every file under 40960 bytes. `code-health/SKILL.md` began this plan at 40,089 bytes and must grow by no more than the one citation line — if it grew by more, Step 1's "cite, do not restate" instruction was not followed.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — read `# fail 0` from the TAP summary.

- [ ] **Step 7: Commit**

```bash
git add skills/code-health/ skills/harness-health/ skills/journey-health/ skills/docs-health/ skills/build/ skills/review/
git commit -m "Route producer findings through the learning-routing contract — four health sweeps, build, review"
```

---

### Task 7: Classifier eval coverage

**Files:**
- Create: `evals/scenarios/learning-routing-classification.yaml`
- Create: `evals/fixtures/learning-routing-corpus/lessons.json`
- Create: `evals/assertions/routing-destination-matches.js`
- Modify: `evals/assertions/index.js`

**Interfaces:**
- Consumes: `/claude-tweaks:feedback --dry-run` (Task 2), which classifies and stops without any `gh` call.
- Produces: assertion type `routing-destination-matches`.

**Why `--dry-run` is required here.** `evals/runner.js` sandboxes network access, so no scenario can exercise `gh issue create`. The eval measures the *judgment* — which destination and which kind the classifier returns — not the filing.

**Why the corpus is frozen.** The lessons are drawn from a real memory store that this feature intends to change. A test reading that store live is a scheduled failure timed to the migration (`[IL-80]`). The fixture is a copy, scrubbed, with expected destinations recorded separately from the lesson text so the classifier cannot read the answer off its own input.

- [ ] **Step 1: Create the frozen corpus fixture**

Create `evals/fixtures/learning-routing-corpus/lessons.json`:

```json
{
  "lessons": [
    {
      "id": "subagent-dispatch-anchor",
      "text": "When dispatching implementer subagents against an isolated worktree, an executable cd/pwd/git-rev-parse check is needed before the first edit and again before commit — stating the working directory in prose is not enough.",
      "expected": { "destination": "D5", "kind": "defect" }
    },
    {
      "id": "brainstorm-style",
      "text": "I prefer substantive engagement and a breadth of options during brainstorming rather than being given a narrow menu early; I will steer and make the subjective calls myself.",
      "expected": { "destination": "D4", "kind": null }
    },
    {
      "id": "zsh-parameter-modifier",
      "text": "In zsh, a colon inside a quoted variable expansion is read as a parameter modifier and silently mangles the string, so a git ref built that way resolves to empty.",
      "expected": { "destination": "D4", "kind": null }
    },
    {
      "id": "adversarial-named-but-local",
      "text": "In this repository the flow skill must be run from the deploy branch, because our CI publishes only from that branch.",
      "expected": { "destination": "D1", "kind": null }
    },
    {
      "id": "adversarial-self-reference",
      "text": "The wrap-up skill's Review Console renders its sections out of order when two stage files share a number.",
      "expected": { "destination": "D1", "kind": null, "note": "self-reference collapses D5 when the repo under test IS claude-tweaks" }
    },
    {
      "id": "gap-no-opinion",
      "text": "There is no guidance anywhere in the plugin about how to verify that a new selection-logic test actually discriminates fixed from unfixed behavior.",
      "expected": { "destination": "D5", "kind": "gap" }
    }
  ]
}
```

The last two are the adversarial cases the spec requires: `adversarial-named-but-local` names a claude-tweaks skill but is project-specific, so rule 1 must **not** fire; `adversarial-self-reference` is a genuine plugin defect that must still collapse to a local record when the repo under test is claude-tweaks itself.

- [ ] **Step 2: Write the assertion**

Create `evals/assertions/routing-destination-matches.js`:

```javascript
// Compares the destination (and, for D5, the kind) the skill actually stated
// against the corpus's recorded expectation. The expectation lives in the
// fixture, never in the prompt, so the model cannot read the answer off its
// own input.
const DESTINATION_RE = /\b(D[1-5])\b/g;
const KIND_RE = /\b(defect|gap)\b/i;

export function routingDestinationMatches(resultText, { expectedDestination, expectedKind }) {
  const found = [...String(resultText).matchAll(DESTINATION_RE)].map((m) => m[1]);
  if (found.length === 0) {
    return { pass: false, message: `no destination (D1-D5) stated in result: ${String(resultText).slice(0, 400)}` };
  }
  const stated = found[found.length - 1];
  if (stated !== expectedDestination) {
    return { pass: false, message: `expected ${expectedDestination}, skill stated ${stated} (all mentions: ${found.join(', ')})` };
  }
  if (expectedKind) {
    const kindMatch = String(resultText).match(KIND_RE);
    const statedKind = kindMatch ? kindMatch[1].toLowerCase() : null;
    if (statedKind !== expectedKind) {
      return { pass: false, message: `expected kind ${expectedKind}, skill stated ${statedKind ?? 'none'}` };
    }
  }
  return { pass: true, message: `destination ${stated}${expectedKind ? ` kind ${expectedKind}` : ''} matched` };
}
```

- [ ] **Step 3: Register the assertion**

In `evals/assertions/index.js`, add the import beside the others:

```javascript
import { routingDestinationMatches } from './routing-destination-matches.js';
```

and the registry entry inside `ASSERTIONS`:

```javascript
  'routing-destination-matches': (ctx, params) => routingDestinationMatches(ctx.resultText, params),
```

- [ ] **Step 4: Write the scenario**

Create `evals/scenarios/learning-routing-classification.yaml`:

```yaml
name: learning-routing-classification
description: >
  Measures the judgment in skills/_shared/learning-routing.md's ordered
  classifier — not the filing, which cannot run here because runner.js
  sandboxes network access and every D5 outcome ends in a gh call.
  /claude-tweaks:feedback --dry-run classifies, drafts, scrubs, and stops,
  so the destination it states is observable offline.

  The corpus is frozen at evals/fixtures/learning-routing-corpus/lessons.json
  rather than read from a live memory store, because this feature intends to
  change that store and a test reading it live would fail exactly at the
  migration (IL-80). Expected destinations live in the fixture, never in the
  prompt.

  Two entries are adversarial by design: one names a claude-tweaks skill but
  is genuinely project-specific (rule 1 must not fire), and one is a real
  plugin defect that must still collapse to a local record because the repo
  under test is claude-tweaks itself. A corpus of only obvious cases would
  pass on any classifier (IL-78).
fixture:
  base: minimal-node-repo
skill_invocation:
  prompt: >
    /claude-tweaks:feedback --dry-run "When dispatching implementer subagents
    against an isolated worktree, an executable cd/pwd/git-rev-parse check is
    needed before the first edit and again before commit — stating the working
    directory in prose is not enough."
assertions:
  - type: routing-destination-matches
    expectedDestination: D5
    expectedKind: defect
  # --dry-run must not file. No gh call can succeed here anyway, but a run that
  # attempts one is a contract violation regardless of the sandbox.
  - type: tool-count
    max: 25
  - type: commit-count
    max: 2
```

- [ ] **Step 5: Verify the assertion registry loads**

Run:
```bash
cd evals && node -e "import('./assertions/index.js').then(m => console.log(typeof m.runAssertion))"
```
Expected: `function`. A syntax error or a missing export fails here rather than mid-eval.

- [ ] **Step 6: Verify the corpus parses and every entry has an expectation**

Run:
```bash
cd evals && node -e "const c=require('./fixtures/learning-routing-corpus/lessons.json'); const bad=c.lessons.filter(l=>!l.expected||!l.expected.destination); console.log('lessons:',c.lessons.length,'missing-expectation:',bad.length)"
```
Expected: `lessons: 6 missing-expectation: 0`.

- [ ] **Step 7: Run the evals unit suite**

Run:
```bash
cd evals && npm test
```
Expected: PASS. This exercises the harness's own tests, not a live eval run (which costs money and needs network).

- [ ] **Step 8: Commit**

```bash
git add evals/scenarios/learning-routing-classification.yaml evals/fixtures/learning-routing-corpus/ evals/assertions/routing-destination-matches.js evals/assertions/index.js
git commit -m "Add classifier eval coverage — frozen corpus with adversarial cases"
```

---

### Task 8: Documentation, graph edges, changelog, version

**Files:**
- Modify: `docs/skill-graph.md`, `docs/plugin-structure.md:32`, `README.md:110`, `skills/help/SKILL.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: everything above. Produces the shipped release.

- [ ] **Step 1: Add the feedback edges to the skill graph**

In `docs/skill-graph.md`, add a `## feedback` section in alphabetical position with one row per edge:

```markdown
## feedback

| Skill | Relationship |
|-------|--------------|
| `/reflect` | `/reflect` classifies insights via `_shared/learning-routing.md`; those resolving to D5 route here. |
| `/wrap-up` | Step 7.11 stages upstream proposals; Step 10 invokes this skill per approved Review Console row. |
| `/code-health` | A finding whose subject is a claude-tweaks skill routes here instead of filing a project issue. |
| `/harness-health` | Same subject check — plugin-owned findings route here rather than to the project's tracker. |
| `/journey-health` | Same subject check. |
| `/docs-health` | Same subject check. |
```

Then add the reciprocal `| /feedback | ... |` row to each of those six skills' own sections in the same file.

- [ ] **Step 2: Add the skill to the structure doc**

In `docs/plugin-structure.md` line 32's category listing, append `feedback` to the **Component** line.

- [ ] **Step 3: Update the README skill inventory**

In `README.md` line 110, add `feedback` to the standalone-component-skills parenthetical.

- [ ] **Step 4: Update /help**

In `skills/help/SKILL.md`, add `/claude-tweaks:feedback` to the command reference with the one-line description: `Route a learning upstream to the claude-tweaks plugin — defect or gap.`

- [ ] **Step 5: Verify every doc surface mentions the skill**

Run:
```bash
grep -rl "claude-tweaks:feedback\|^feedback\b\|, feedback" docs/skill-graph.md docs/plugin-structure.md README.md skills/help/SKILL.md
```
Expected: all four paths listed.

- [ ] **Step 6: Verify the graph edges are bidirectional**

Run:
```bash
grep -c "/feedback" docs/skill-graph.md
```
Expected: at least `12` — six rows in the `## feedback` section plus six reciprocal rows. A count of 6 means the reciprocals were not added.

- [ ] **Step 7: Claim the version number**

Run these as separate commands, in order:

```bash
git fetch origin main
```
```bash
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```
```bash
grep -rn "6\.4[0-9]\.[0-9]" docs/superpowers/plans/ | grep -v 2026-08-06-learning-routing
```
```bash
git worktree list
```

For each sibling worktree branch reported, run:
```bash
git log --oneline main..<branch> -- .claude-plugin/plugin.json
```

The current version is `6.39.2`, so the intended next is `6.40.0` (feature addition, minor bump). **If any of those four checks shows another session has claimed `6.40.0`, take the next free number instead.** Re-run `git fetch origin main` immediately before pushing — parallel sessions ship during long test runs.

- [ ] **Step 8: Bump the version**

In `.claude-plugin/plugin.json`, set `"version"` to the number claimed in Step 7.

- [ ] **Step 9: Add the changelog entry**

Prepend to `CHANGELOG.md`, below the `# Changelog` heading, using the claimed version:

```markdown
## v6.40.0 — One classifier decides where a learning goes

Learnings had five possible destinations, three writers, and nothing deciding
between them. Two of the five — a memory file, and the plugin's own issue
tracker — had no writer at all, so any lesson that outlived the current project
either landed in whichever store the producing skill happened to name, or
nowhere.

`skills/_shared/learning-routing.md` is now the single source of truth: an
ordered, first-match-wins classifier over D1 (CLAUDE.md Don'ts), D2 (project
skills and docs), D3 (work records), D4 (memory) and D5 (upstream). Producers
cite it instead of carrying their own destination tables — which retires
`reflect`'s row routing one lesson to both a skill update and a memory file, the
mechanism that put the same lesson in two stores in different words.

`/claude-tweaks:feedback` is the new D5 writer, filing defect and gap reports
against the plugin with an unconditional scrub gate and an explicit confirmation
in every mode. Wrap-up Steps 7.10 and 7.11 stage memory and upstream proposals
to two new per-item Review Console sections; `auto` silences neither.
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS. Read `# fail 0` from the TAP summary — the wrapper's exit code is not the command's.

- [ ] **Step 11: Verify the staged set before committing**

```bash
git add docs/ README.md skills/help/ CHANGELOG.md .claude-plugin/plugin.json
```
```bash
git diff --cached --name-only
```
Expected: only the six files named above. `git commit` with no pathspec takes the entire staged index (`[IL-42]`).

- [ ] **Step 12: Commit**

```bash
git commit -m "Document the learning-routing contract and release — graph edges, help, changelog, version"
```

---

## Post-plan: marketplace mirror

The release is not complete until the marketplace repo is updated. CLAUDE.md's "Releasing (two repos)" section **already authorizes both pushes as one action** — do not stop to ask between them (`[IL-59]`).

In `thomasholknielsen/claude-tweaks-marketplace`, edit `.claude-plugin/marketplace.json`: set `plugins[].version` to the claimed version, bump `metadata.version` on its own `2.x` scheme, and keep `plugins[].description` aligned with `plugin.json`. Commit and push `main`.

## Self-Review

Run before declaring the plan complete.

**Spec coverage.** Every spec section maps to a task: Architecture → Tasks 1-2; The classifier → Task 1; Dedup → Task 1; D4 writer → Task 1 (procedure) + Task 4 (staging); D5 writer → Task 2 + Task 4; Hook points → Tasks 3, 4, 6, 8; Auto-mode posture → Task 5; Testing → Task 2 (convention suite) + Task 7 (eval); Release → Task 8 + post-plan mirror. The spec's "Deferred" table is deliberately unimplemented.

**Known spec refinements made during planning**, each recorded here rather than silently applied:

1. **`--dry-run` added to `/claude-tweaks:feedback`.** The spec's Testing section assumed unit-testable classifier fixtures, but the classifier is prose read by a model — no `node --test` assertion can exercise it. `evals/runner.js` also sandboxes network, so no scenario can reach `gh`. `--dry-run` makes the judgment observable offline and matches wrap-up's existing flag convention.
2. **The two new Review Console sections are per-item, not batch.** The spec said only that they surface at the console. Per-item follows from its own rationale (D5 is the work-record-creation category; D4 has the largest blast radius) and has the side benefit of leaving the "nine named batch sections" counts accurate across three files.
3. **No new `bin/lib/` module.** The spec permitted one if implementation proved it necessary. It did not — dedup reuses `health-core/fingerprint.js`, and the self-reference check is a single `git remote get-url origin`.

**Placeholder scan.** No `TBD`, `TODO`, "implement later", "add appropriate error handling", or "similar to Task N" appears in any task. Every code and prose step carries its literal content.

**Type consistency.** `routingDestinationMatches(resultText, { expectedDestination, expectedKind })` is defined in Task 7 Step 2, registered under the type string `routing-destination-matches` in Step 3, and invoked with exactly `expectedDestination` / `expectedKind` in the Step 4 scenario. Stage paths `staged/wrap-up-memory-{N}.md` and `staged/wrap-up-upstream-{N}.md` are named identically in Task 4's Steps 1, 2 and 3.

**Count arithmetic, verified not assumed.** 33 skills total; `LINEAR_DIAGRAM_SKILLS` grows 10 → 11; `untouched.length` = 33 − 11 = 22, unchanged. The console's "nine named batch sections" is unchanged because both new sections are per-item.
