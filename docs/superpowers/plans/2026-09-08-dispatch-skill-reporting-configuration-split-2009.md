# Split dispatch/SKILL.md's Reporting and Configuration sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore headroom under `dispatch/SKILL.md`'s 40,960-byte hard ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`'s central SKILL.md assertion, #2020) by extracting the file's `## Reporting` and `## Configuration` sections into two new sub-files, each replaced by a one-paragraph pointer — the same extraction pattern already used repeatedly in this same skill directory (`cross-pr-overlap-report.md`, `oversized-group-report.md`, `resume-confirmation.md`, `queue-pull-script.md`, `next-ranking.md`, `grant-maturation-gate.md`, `sequential-execution.md`, `sibling-session-check.md`, all "extracted to bring SKILL.md back under the 40 KB ceiling" per `docs/plugin-structure.md`'s dispatch row).

**Architecture:** Two new sub-files (`plugin/skills/dispatch/reporting.md`, `plugin/skills/dispatch/configuration.md`) each carry one section's content verbatim under an H1 title (`# Dispatch — Reporting` / `# Dispatch — Configuration`), mirroring `resume-confirmation.md`'s existing header shape. `SKILL.md` keeps the `## Reporting` / `## Configuration` headings but replaces their bodies with a one-paragraph pointer, following `flow/multi-spec.md`'s pointer-to-`multispec-run-dir-layout.md` shape. The two `tests/timing-prose-conformance.test.js` tests that pin the timing-line literal (currently inside `## Reporting`) move their content assertion to read `reporting.md`, while keeping a separate byte-ceiling assertion against `SKILL.md` itself (the value this project actually gates, per `[IL-153]`/#2020).

**Tech Stack:** Markdown skill files, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-08T134014-record-2009/work/2009-spec.md` (materialized from GitHub issue #2009).

## Global Constraints

- `plugin/skills/dispatch/SKILL.md` must stay ≤ 40,960 bytes (hard `npm test` gate, `tests/bin-lib/skill-audit/context-cost.test.js`'s "no shipped SKILL.md exceeds CEILING_BYTES" test, #2020) — target ≤ 36,864 bytes (10% headroom), per #2009's Acceptance Criteria 1.
- Every test that currently pins Reporting-section prose against `SKILL.md` must be repointed to the new file location rather than deleted (#2009 Acceptance Criteria 2).
- `docs/plugin-structure.md`'s dispatch row must list the two new sub-files (#2009 Acceptance Criteria 3).
- No behavioral change — this is a pure prose relocation; every cross-reference elsewhere in the repo that says "`SKILL.md`'s Reporting section" stays accurate, since the `## Reporting` heading itself is not removed, only its body is replaced by a pointer.

---

### Task 1: Extract `## Reporting` into `reporting.md`, repoint the two timing-line test pins

**Files:**
- Create: `plugin/skills/dispatch/reporting.md`
- Modify: `plugin/skills/dispatch/SKILL.md` (the `## Reporting` section body, currently lines 193-207)
- Modify: `tests/timing-prose-conformance.test.js` (the two `dispatch/SKILL.md` timing-line tests, currently lines 49-54 and 87-92)
- Test: `tests/timing-prose-conformance.test.js` (existing suite, no new test file)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `plugin/skills/dispatch/reporting.md` — read by Task 3's docs update, and by every other repo location that already says "`SKILL.md`'s Reporting section" (those stay valid as-is, since `SKILL.md` keeps the `## Reporting` heading as a pointer — no other file needs editing for this reason).

- [ ] **Step 1: Create `plugin/skills/dispatch/reporting.md` with the moved content**

Write the full file:

```markdown
# Dispatch — Reporting

Per-firing output is one group's outcome (a drain firing with M ≤ `{budget}` groups: one report block per dispatched group) — there is **no consolidated multi-group console**. (See `SKILL.md`'s When to Use above.)

Each group's block ends with one timing line read from `{run-dir}/timing.json` (`bin/phase-timing.js --run "$PIPELINE_RUN_DIR" --markdown --transcript <call-1 transcript> --transcript <call-2 transcript>`, #1928) — never composed by hand: `timing: call-1 {m}m · call-2 {m}m · verify {n} run(s) ({modes}) · {k} tokens in / {m} out` — not `--auto-transcript`, which only sees the current session; omitted when the CLI printed a `tokens: transcript not found` note.

A headless (Routine-fired) firing's report has nobody live to read it — the durable trace is the label state change, the claim-comment trail, and `decisions.md`, not a rendered console. Over time, a human sees the aggregate picture via `/claude-tweaks:tidy`'s own periodic sweep (`tidy/SKILL.md`).

`pending-review` outcomes park the group's `/flow`-created run dir, not the branch — at `supervised`/`trusted`, an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it. (At `unattended`, `consoleAutoResolve` completes the console instead of resting on it — see `_shared/autonomy-ceiling.md` and `wrap-up/review-console.md`'s Auto-resolution short-circuit.) Under `integration-model: pr-first`, the branch itself never waited on parking to become public in the first place: `_shared/pr-early-run-lifecycle.md` opened its draft PR at run start, and every phase exit since has kept it current.

**Resuming a parked run.** "Resumes that session" above is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads this report, and there is no way to re-attach to it.

**Confirm before resuming.** Before running the re-invocation below — including when a human triggers the resume conversationally (e.g. replying "merge!" in chat) rather than by typing the command directly — read `resume-confirmation.md` in this skill's directory and follow it: the `AskUserQuestion` shape, the Recommended-derivation rule (shared with `review-console-interactive.md`'s merge confirmation, so the two can never disagree on the same PR state), why this stays a separate stop from the Review Console rather than folding the two together, why it carries no `autonomy`-ceiling carve-out (unconditional at every tier, including `unattended`), how the confirmation's values are sourced live, the resume-freshness probe, and the actual re-adoption mechanism.

`PushNotification` fires only at the retry ceiling and for auto-merge FYIs (Step 6's Settle procedure and Auto-merge gate, both in `settle-and-merge.md`) — never per-firing just because a firing happened, to avoid notification fatigue.
```

- [ ] **Step 2: Replace `SKILL.md`'s `## Reporting` body with a pointer paragraph**

In `plugin/skills/dispatch/SKILL.md`, replace the `## Reporting` section's entire body (everything between the `## Reporting` heading and the following `## Configuration` heading) with:

```markdown
## Reporting

Read `reporting.md` in this skill's directory for the per-firing output shape (one block per dispatched group, no consolidated console), the per-group timing line rendered from `timing.json`, headless self-report behavior, `pending-review` parking under `pr-first`/other integration models, resuming a parked run (the `AskUserQuestion` confirmation and re-adoption mechanism), and `PushNotification` firing rules.
```

- [ ] **Step 3: Run the two affected tests to see them fail against the new location**

Run: `node --test tests/timing-prose-conformance.test.js`
Expected: FAIL — the two tests named `'#1928 AC6: dispatch/SKILL.md prints the per-group timing line...'` and `'#1929 AC5: dispatch/SKILL.md carries the token clause...'` fail their content-match assertions (the literal timing-line text is no longer in `SKILL.md`).

- [ ] **Step 4: Repoint the two tests to read `reporting.md`, keep a separate SKILL.md ceiling assert**

In `tests/timing-prose-conformance.test.js`, replace the test starting at (originally) line 49:

```javascript
test('#1928 AC6: reporting.md prints the per-group timing line from timing.json, and SKILL.md stays under the ceiling', () => {
  const t = read('plugin/skills/dispatch/reporting.md');
  assert.match(t, /`timing: call-1 \{m\}m · call-2 \{m\}m · verify \{n\} run\(s\) \(\{modes\}\)/, 'the #1929 token-clause extension keeps this literal as a prefix');
  assert.match(t, /timing\.json/);
  const skill = read('plugin/skills/dispatch/SKILL.md');
  assert.ok(Buffer.byteLength(skill, 'utf8') <= CEILING, `dispatch/SKILL.md is ${Buffer.byteLength(skill, 'utf8')} B`);
});
```

And the test starting at (originally) line 87:

```javascript
test('#1929 AC5: reporting.md carries the token clause on its timing line, and SKILL.md stays under the ceiling', () => {
  const t = read('plugin/skills/dispatch/reporting.md');
  assert.match(t, /`timing: call-1 \{m\}m · call-2 \{m\}m · verify \{n\} run\(s\) \(\{modes\}\) · \{k\} tokens in \/ \{m\} out`/);
  assert.match(t, /--transcript/, 'dispatch passes both agent transcripts explicitly');
  const skill = read('plugin/skills/dispatch/SKILL.md');
  assert.ok(Buffer.byteLength(skill, 'utf8') <= CEILING, `dispatch/SKILL.md is ${Buffer.byteLength(skill, 'utf8')} B`);
});
```

- [ ] **Step 5: Run the tests again to verify they pass**

Run: `node --test tests/timing-prose-conformance.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/dispatch/reporting.md plugin/skills/dispatch/SKILL.md tests/timing-prose-conformance.test.js
git commit -m "Extract dispatch/SKILL.md's Reporting section to reporting.md, repoint timing-line pins (refs #2009)"
```

---

### Task 2: Extract `## Configuration` into `configuration.md`

**Files:**
- Create: `plugin/skills/dispatch/configuration.md`
- Modify: `plugin/skills/dispatch/SKILL.md` (the `## Configuration` section body, currently lines 209-222)
- Test: none new — no test currently pins `SKILL.md`'s Configuration table content (verified: `tests/multi-spec-config-scaffold.test.js`, `tests/policy-schema.test.js`, `tests/resolve-policy-cli.test.js`, `tests/resolve-policy-lib.test.js` all test `resolve-policy.js`'s own `POLICY_KEYS` schema, never `SKILL.md`'s prose table).

**Interfaces:**
- Consumes: nothing from Task 1 (independent section).
- Produces: `plugin/skills/dispatch/configuration.md` — read by Task 3's docs update.

- [ ] **Step 1: Create `plugin/skills/dispatch/configuration.md` with the moved content**

Write the full file:

```markdown
# Dispatch — Configuration

These rows mirror `_shared/work-record-config.md`'s canonical key table (which every filing/shaping/dispatching skill is meant to cite rather than restate) — kept spelled out here too since this is the skill that actually reads and branches on them; check that file when a default or meaning changes to keep this copy in sync. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" <key> [<key>…]` (`_shared/policy-schema.md`):

| Flag | Default | Meaning |
|---|---|---|
| `dispatch-retry-ceiling` | `3` | Consecutive failures before a dispatched record gets `bot:blocked` and stops auto-retrying. |
| `auto-merge-max-lines` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to the `merge-check` verdict, not a hard cutoff. |
| `auto-merge-max-files` | `2` | Auto-merge blast-radius guideline on changed files — same weighted-not-cutoff treatment. |
| `dispatch-batch-size` | `3` | Default drain budget — maximum groups one bare firing attempts, per Step 3's ranking; remainder stays unclaimed. **Migration (refs #1492):** was the pick-menu cap; now caps unattended dispatch directly — a high value now auto-dispatches with zero confirmation. |
| `dispatch-group-size-guard` | `10` | Caps a file-overlap group's size before headless `next` excludes it (#1228); bare/`#N` still resolve it — a present human is the required surfacing. |
| `dispatch-pick-max-concurrent` (deprecated alias) | — | Deprecated alias for `dispatch-batch-size` — same effect, one warn-tier notice. Removal condition: `deprecated-aliases.md`. |

**Per-firing CLI overrides:** `--budget <n|all>` (with `--batch-size`/`--concurrent` as deprecated aliases, `SKILL.md`'s Input table) overrides `dispatch-batch-size` for this invocation only, and `--priority <band>` filters the drain/`next` candidate pool before ranking — neither writes back to `.claude-tweaks/policy.yml`. CLI arg beats project policy, per `_shared/auto-mode-card.md`'s precedence order.
```

- [ ] **Step 2: Replace `SKILL.md`'s `## Configuration` body with a pointer paragraph**

In `plugin/skills/dispatch/SKILL.md`, replace the `## Configuration` section's entire body (everything between the `## Configuration` heading and the following `## Routine Configuration` heading) with:

```markdown
## Configuration

Read `configuration.md` in this skill's directory for the policy-key table (`dispatch-retry-ceiling`, `auto-merge-max-lines`, `auto-merge-max-files`, `dispatch-batch-size`, `dispatch-group-size-guard`, and the deprecated `dispatch-pick-max-concurrent` alias — mirroring `_shared/work-record-config.md`'s canonical table), how to read them (`resolve-policy.js`), and per-firing CLI override precedence.
```

- [ ] **Step 3: Verify no test regressed**

Run: `node --test tests/multi-spec-config-scaffold.test.js tests/policy-schema.test.js tests/resolve-policy-cli.test.js tests/resolve-policy-lib.test.js`
Expected: PASS — all green (these test `resolve-policy.js`'s schema, unaffected by the `SKILL.md` prose move).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/dispatch/configuration.md plugin/skills/dispatch/SKILL.md
git commit -m "Extract dispatch/SKILL.md's Configuration section to configuration.md (refs #2009)"
```

---

### Task 3: Update docs/plugin-structure.md, verify the byte ceiling, run the full targeted test sweep

**Files:**
- Modify: `docs/plugin-structure.md` (the `| dispatch | ... |` row)
- Test: none new

**Interfaces:**
- Consumes: `plugin/skills/dispatch/reporting.md` and `plugin/skills/dispatch/configuration.md` from Tasks 1-2 (file paths only, named in the docs row).
- Produces: nothing further downstream — terminal task.

- [ ] **Step 1: Add the two new files to `docs/plugin-structure.md`'s dispatch row**

In `docs/plugin-structure.md`, find the line starting `| dispatch | queue-pull-script.md, next-ranking.md, ...`. Add `reporting.md, configuration.md` to the comma-separated file list (second column), and append one sentence to the prose column (third column) naming what each holds: `reporting.md holds Step 5's Reporting section (per-firing output shape, the timing line rendered from timing.json, headless self-report behavior, pending-review parking, and the resume/PushNotification rules) and configuration.md holds the policy-key table (dispatch-retry-ceiling, auto-merge-max-lines/-files, dispatch-batch-size, dispatch-group-size-guard) — both extracted from SKILL.md to keep it under the 40 KB ceiling (#2009).`

- [ ] **Step 2: Measure the final byte size of SKILL.md**

Run: `wc -c plugin/skills/dispatch/SKILL.md`
Expected: a number ≤ 36864 (10% headroom under the 40,960 ceiling, per #2009's Acceptance Criteria 1). If still over, trim `SKILL.md`'s pointer paragraphs further (they are prose, not pinned by any test beyond the citations already in this plan) before proceeding.

- [ ] **Step 3: Run the full dispatch-related test sweep**

Run (as one or more batches, per this project's documented Windows test-runner workaround):
```
node --test tests/timing-prose-conformance.test.js tests/dispatch-budget-drain.test.js tests/batch-ref-argument.test.js tests/console-execution.test.js tests/dispatch-flow-rundir-handoff.test.js tests/dispatch-worktree-anchoring.test.js tests/flow-claim-preflight.test.js tests/hooks-dispatcher.test.js tests/hooks-run-dir-resolve.test.js tests/pr-first-merge.test.js tests/run-dir-timestamp-utc.test.js tests/session-tmp-root-migration.test.js tests/specify-next-mode.test.js tests/bin-lib/skill-audit/context-cost.test.js
```
Expected: PASS — every test green, including `context-cost.test.js`'s central "no shipped SKILL.md exceeds CEILING_BYTES" hard gate.

- [ ] **Step 4: Commit**

```bash
git add docs/plugin-structure.md
git commit -m "Document dispatch/reporting.md and dispatch/configuration.md in docs/plugin-structure.md (refs #2009)"
```
