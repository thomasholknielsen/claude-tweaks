# Record #575 — Born-Ready Capture Chains Into Specify Shaping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile capture's born-ready ceiling capability with refine's spec-shape grant gate: when born-ready conditions fire, capture files plain and chains into `/claude-tweaks:specify #{n} --chained` (headless shaping) instead of stamping bare `ready` on a 5-line stub that can never pass Step 3.5.

**Architecture:** Four prose contracts change in lockstep: (1) `/claude-tweaks:specify` gains a `--chained` component-mode flag (shaping mode, headless, no Next Actions); (2) capture's ceiling-gated exception swaps stamp-`ready` for the chain; (3) `_shared/autonomy-ceiling.md`'s trusted-row capability (a) and AUTO example describe filed-then-shaped; (4) `_shared/work-record.md`'s `/capture` permission row and `refine-mode.md` Step 3.6 stop describing capture as stamping `ready` directly. No JS module changes: `permittedGrants`' `bornReady` stays the gate condition — only what capture does with `true` changes.

**Tech Stack:** Markdown skill prose; `node --test` conformance suites (module tests in `tests/bin-lib/issues/autonomy.test.js` pin `permittedGrants`, which is untouched).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T113600-spec-576-575/spec-575/work/575-spec.md`

## Global Constraints

- At `supervised` (the default): capture behavior is unchanged — no shaping, no `ready`, 5-line stub filed as today. The `needs:definition` early-exit (skip before the trust round-trip) is preserved verbatim.
- No code path may remain that stamps `ready` on an unshaped capture stub, and no prose may remain describing capture as filing with `ready` applied.
- The chained shaping path renders no interactive prompt — no `AskUserQuestion` may fire under `--chained`.
- Failure posture: if the chained shaping fails for any reason, the record stays a plain capture — fail toward the default, never toward the grant.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md Cross-references rule).
- The permission matrix stays honest: specify stamps scoring and `ready` under its own authority; capture's own stamp set gains nothing.

---

### Task 1: `--chained` component mode in specify

**Files:**
- Modify: `skills/specify/SKILL.md:4` (argument-hint frontmatter)
- Modify: `skills/specify/SKILL.md:38-45` (Input section — flag list)
- Modify: `skills/specify/SKILL.md:114-116` (Component-Skill Contract)
- Modify: `skills/specify/shaping-mode.md:133-135` (procedure-end return line)

**Interfaces:**
- Produces: the `--chained` invocation form `Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")` that Task 2's capture edit consumes. Semantics: shaping mode only, headless, no Next Actions, design-intent headless default `none`.

- [ ] **Step 1: Extend the argument-hint frontmatter**

In `skills/specify/SKILL.md` line 4, replace:

```yaml
argument-hint: "<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra>] [--granularity <fine|standard|coarse>]"
```

with:

```yaml
argument-hint: "<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra>] [--granularity <fine|standard|coarse>] [--chained]"
```

- [ ] **Step 2: Document the flag in the Input section**

In the same file, replace:

```markdown
`$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>]`
```

with:

```markdown
`$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`
```

Then replace the sentence:

```markdown
Two optional flags may appear anywhere after the first argument, in either mode:
```

with:

```markdown
Three optional flags may appear anywhere after the first argument (the first two in either mode; `--chained` in shaping mode only):
```

and append this third bullet immediately after the `--granularity` bullet:

```markdown
- `--chained` — component-mode invocation for this skill's one skill caller: `/claude-tweaks:capture`'s born-ready chain (see the Component-Skill Contract below). Shaping mode on a record reference only — on any other input shape (design doc, topic, decomposition), ignore the flag and surface a one-line notice rather than erroring. Headless: `## Next Actions` is not rendered, and the one decision shaping mode would otherwise raise interactively — Step 2.5c's design-intent question, when Step 2.5a's sniff detects a frontend surface — resolves to `Design-intent: none` without prompting, logged per `_shared/auto-decision-log.md` when a run directory resolves per `_shared/pipeline-run-dir.md`, otherwise noted in the returned output only.
```

- [ ] **Step 3: Rewrite the Component-Skill Contract**

In the same file, replace:

```markdown
`/specify` is always user-facing — it does not detect `$PIPELINE_RUN_DIR` because it dispatches `/superpowers:brainstorming` polymorphically rather than being invoked by a pipeline parent. Always renders Next Actions.
```

with:

```markdown
`/specify` is user-facing in every invocation except one: `/claude-tweaks:capture`'s born-ready chain (`_shared/autonomy-ceiling.md`, trusted row capability (a)) invokes shaping mode as `Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")`. The explicit `--chained` flag is the component-mode detection signal — `$PIPELINE_RUN_DIR` is still never consulted, because this skill dispatches `/superpowers:brainstorming` polymorphically rather than being invoked by a pipeline parent. Under `--chained`, `## Next Actions` is not rendered and no `AskUserQuestion` fires (see the flag's Input bullet for the design-intent headless default). Every other invocation renders Next Actions unchanged.
```

- [ ] **Step 4: Gate the Next Actions return line in shaping-mode.md**

In `skills/specify/shaping-mode.md`, replace:

```markdown
Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block (the "Shaping mode — one record shaped in place" row of its Situation table).
```

with:

```markdown
Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block (the "Shaping mode — one record shaped in place" row of its Situation table). Under `--chained` (see `SKILL.md`'s Input and Component-Skill Contract), skip Next Actions entirely and return control to the calling skill — the shaped, `ready` record is the whole deliverable.
```

- [ ] **Step 5: Verify**

```bash
grep -c "chained" skills/specify/SKILL.md
```
Expected: 5 or more (argument-hint, `$ARGUMENTS` line, flag-count sentence, flag bullet, Component-Skill Contract).

```bash
grep -c "chained" skills/specify/shaping-mode.md
```
Expected: 1 or more.

```bash
grep -n "always user-facing" skills/specify/SKILL.md
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add skills/specify/SKILL.md skills/specify/shaping-mode.md
git commit -m "Add --chained component mode to specify shaping — refs #575"
```

### Task 2: Capture chains born-ready filings into shaping

**Files:**
- Modify: `skills/capture/SKILL.md:54-57` (the exception paragraph)
- Modify: `skills/capture/SKILL.md:116-121` (the label-set instruction after the trust script)

**Interfaces:**
- Consumes: Task 1's `--chained` invocation form, exactly as written there.
- Produces: nothing later tasks consume; Task 3 rewrites sibling contracts to match this behavior.

- [ ] **Step 1: Rewrite the exception paragraph**

In `skills/capture/SKILL.md`, replace:

```markdown
**One exception, off by default.** Under `autonomy: trusted` or higher, and only when the
`producer:capture` class carries a `clean` trust verdict, a fresh capture files with `ready`
already applied — see `_shared/autonomy-ceiling.md`. At `supervised`, the default and the state of
any repo that has not opted in, this never fires and the paragraph above holds unchanged.
```

with:

```markdown
**One exception, off by default.** Under `autonomy: trusted` or higher, and only when the
`producer:capture` class carries a `clean` trust verdict, a fresh capture is chained straight into
`/claude-tweaks:specify` shaping immediately after filing (`Skill(skill: "claude-tweaks:specify",
args: "#{n} --chained")` — headless, no Next Actions), so the record lands spec-shaped, scored,
and `ready` under specify's own authority — able to pass `/claude-tweaks:backlog refine` Step
3.5's spec-shape gate, which a bare `ready` stamp on a 5-line stub never could (#575). See
`_shared/autonomy-ceiling.md`. At `supervised`, the default and the state of any repo that has not
opted in, this never fires and the paragraph above holds unchanged.
```

- [ ] **Step 2: Replace the stamp-`ready` instruction with the chain**

In the same file, replace:

```markdown
Add `ready` to the label set below **only** when `bornReady` is `true`, and log one
`decisions.md` line in `_shared/autonomy-ceiling.md`'s Logging shape when you do. Never infer the
answer from the policy value alone — the class verdict is half the condition, and on a repo with
no acceptance evidence `bornReady` is `false` at every ceiling. If the `gh` call or the node block
fails for any reason, file without `ready`: this path fails toward the default, never toward the
grant.
```

with:

```markdown
Never add `ready` to the label set below — a capture files plain at every ceiling. When
`bornReady` is `true`, complete the filing first, then invoke
`Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")` in the same turn — shaping mode
composes the spec-shaped body around the stub (preserved as its `## Original request`), stamps
scoring and `ready` in its single compose-then-write-once call, and renders no interactive prompt
— and log one `decisions.md` line in `_shared/autonomy-ceiling.md`'s Logging shape (the
filed-then-shaped form). Never infer the answer from the policy value alone — the class verdict is
half the condition, and on a repo with no acceptance evidence `bornReady` is `false` at every
ceiling. If the `gh` call, the node block, or the chained shaping itself fails for any reason, the
record simply stays a plain capture: this path fails toward the default, never toward the grant.
```

- [ ] **Step 3: Verify**

```bash
grep -n "files with \`ready\`" skills/capture/SKILL.md
```
Expected: no output.

```bash
grep -c "chained" skills/capture/SKILL.md
```
Expected: 2 or more.

```bash
grep -n "needs:definition" skills/capture/SKILL.md | head -3
```
Expected: the early-exit paragraph ("Skip entirely when this filing carries `needs:definition`") is untouched — confirm it still appears.

- [ ] **Step 4: Commit**

```bash
git add skills/capture/SKILL.md
git commit -m "Chain born-ready captures into specify shaping — refs #575"
```

### Task 3: Contract parity sweep — autonomy-ceiling, work-record, refine-mode

**Files:**
- Modify: `skills/_shared/autonomy-ceiling.md:248` (trusted-row capability (a)) and `:253` (AUTO example)
- Modify: `skills/_shared/work-record.md:135` (`/capture` permission-matrix row)
- Modify: `skills/backlog/refine-mode.md:229-235` (Step 3.6 first paragraph)

**Interfaces:**
- Consumes: Task 2's behavior (file plain, chain shaping) — every edit below describes that behavior; none introduces new behavior.

- [ ] **Step 1: Reword capability (a) in the ceiling table**

In `skills/_shared/autonomy-ceiling.md`'s `trusted` row, replace:

```markdown
**(a)** Born-`ready` for agent-filed work whose provenance class carries a `clean` verdict — skips `/claude-tweaks:specify`, never the human grant gate. Today that means `/claude-tweaks:capture` and no other actor.
```

with:

```markdown
**(a)** Born-`ready` for agent-filed work whose provenance class carries a `clean` verdict — the filing chains straight into `/claude-tweaks:specify --chained` shaping (headless), skipping the *human* shaping round-trip but never the shaping itself and never the human grant gate; the capture turn pays the shaping cost, only at this ceiling with a `clean` verdict. Today that means `/claude-tweaks:capture` and no other actor.
```

- [ ] **Step 2: Update the AUTO example line**

In the same file's Logging examples block, replace:

```markdown
AUTO 15:04:22 — Filed #212 born-ready (class producer:code-health/low, verdict clean, ceiling trusted). Reversibility: high.
```

with:

```markdown
AUTO 15:04:22 — Filed #212 and chained /claude-tweaks:specify --chained shaping — born-ready (class producer:capture/elevated, verdict clean, ceiling trusted). Reversibility: high.
```

- [ ] **Step 3: Rewrite the `/capture` permission-matrix row**

In `skills/_shared/work-record.md`, replace the row:

```markdown
| **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`), `needs:definition` (content judgment at filing time — see Judging Definition in `capture/SKILL.md`); `ready` **only** under `autonomy: trusted`+ when `producer:capture`'s trust verdict is `clean` (see `_shared/autonomy-ceiling.md`) | nothing | scoring, `parked`, `auto:*`, `bot:*`; `ready` whenever either half of that condition fails — at `supervised` (the default), or on any verdict but `clean`; `ready` is also never applied alongside `needs:definition` — an undecided record cannot be born-ready |
```

with:

```markdown
| **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`), `needs:definition` (content judgment at filing time — see Judging Definition in `capture/SKILL.md`) | nothing | scoring, `parked`, `auto:*`, `bot:*`, and `ready` — always, at every ceiling. Under `autonomy: trusted`+ with a `clean` `producer:capture` verdict the filing chains into `/claude-tweaks:specify --chained`, and *specify* stamps scoring and `ready` under its own row's authority (see `_shared/autonomy-ceiling.md`); the chain never fires alongside `needs:definition` — an undecided record cannot be born-ready |
```

- [ ] **Step 4: Reword refine-mode.md Step 3.6's first paragraph**

In `skills/backlog/refine-mode.md`, replace:

```markdown
The ceiling's only effect inside this skill is on **which records reach the worklist at all**, not
on what is recommended for them once here. At `trusted` or higher, a record `/claude-tweaks:capture`
filed while `producer:capture` carried a `clean` verdict arrives with `ready` already applied (see
`_shared/autonomy-ceiling.md`, which names `/claude-tweaks:capture` as the only actor this covers
today), so it appears in Step 1's fetch without having passed `/claude-tweaks:specify`.
```

with:

```markdown
The ceiling's only effect inside this skill is on **which records reach the worklist at all**, not
on what is recommended for them once here. At `trusted` or higher, a record `/claude-tweaks:capture`
filed while `producer:capture` carried a `clean` verdict arrives with `ready` already applied by
the `/claude-tweaks:specify --chained` shaping pass its filing triggered (see
`_shared/autonomy-ceiling.md`, which names `/claude-tweaks:capture` as the only actor this covers
today), so it appears in Step 1's fetch shaped by machinery rather than by a human-invoked
`/claude-tweaks:specify` session.
```

The second paragraph ("Those records are not exempt from anything here…") stays verbatim — Step 3.5 remains the backstop that re-derives shape rather than trusting the label.

- [ ] **Step 5: Cross-file sweep + module-test sanity**

```bash
grep -rn "skips \`/claude-tweaks:specify\`" skills/_shared/autonomy-ceiling.md
```
Expected: no output.

```bash
grep -n "without having passed" skills/backlog/refine-mode.md
```
Expected: no output.

```bash
grep -rn "files with \`ready\`" skills/
```
Expected: no output.

```bash
node --test tests/bin-lib/issues/autonomy.test.js
```
Expected: all tests pass (module untouched — sanity only).

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/autonomy-ceiling.md skills/_shared/work-record.md skills/backlog/refine-mode.md
git commit -m "Describe filed-then-shaped born-ready across ceiling, work-record, and refine contracts — refs #575"
```
