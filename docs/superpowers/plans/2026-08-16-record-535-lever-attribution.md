# Lever Attribution Field (record #535) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `[lever: {key}={value} ({source})]` trailing field to the auto-decision log's line grammar, adopt it at the Review Console renderer and two high-traffic logging sites, so lever-governed pipeline decisions name their governing lever where they're logged.

**Architecture:** Expand-only contract change in the canonical home (`skills/_shared/auto-decision-log.md`) first, then three consumers cite/adopt it. Pure prose/contract work — no runtime code, no schema change, no new tests. Existing `decisions.md` files stay valid; no reader may require the field.

**Tech Stack:** Markdown skill files; `node --test` suite as regression gate.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T062809-spec-535/work/535-spec.md`

## Global Constraints

- Lever names in templates are literal policy keys copied from `POLICY_KEYS` in `bin/lib/policy-schema.js` — verified at plan time: `automerge-max-lines` (integer, default 40), `automerge-max-files` (integer, default 2), `merge-sensitive-paths` (list, default []), `scope-creep` (enum, default add-to-plan).
- Source vocabulary: `run-config | policy | default` (matching `resolve-policy.js` envelopes) plus `arg` — no other source words anywhere.
- The field is optional, always last in the line grammar, and never required by any reader or gate.
- State the format once, in `_shared/auto-decision-log.md`; consumers cite it — never restate the grammar in dispatch/build prose.
- `skills/wrap-up/console-template.md` must NOT be modified.
- **Verified plan-time deviation from the spec's file list:** the dispatch auto-merge gate's logged decision-line template lives at `skills/dispatch/settle-and-merge.md:228` (the `AUTO {time} — Auto-merge: group […]` line), not in `skills/dispatch/SKILL.md` (which holds only a policy-key reference table, no log-line template). The spec's own instruction — "confirm each edited log line is the one that actually reads the levers being cited" — resolves this: Task 3 edits `settle-and-merge.md`. Record this as a spec deviation in the architecture-alignment step and the PR description.
- Lever set for the auto-merge gate line (verified): the gate's procedure (settle-and-merge.md:133) invokes `assess-agent-autonomy` merge-check, which reads `merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files` (merge-check.md:78). `housekeeping-auto-merge` is NOT read anywhere in the gate's procedure (grep-verified: zero hits in settle-and-merge.md and dispatch/SKILL.md) — do not cite it.
- Expand-only safety (verified at plan time, restate in PR description): no programmatic parser of `decisions.md` line grammar exists — `bin/lib/wrap-up/engine-record.js` appends lines, `bin/lib/reconcile/archive-merged.js` moves the file, `bin/wrap-up-engine.js:207` echoes the last line verbatim; hooks reference the path only in comments/messages.

---

### Task 1: Contract — the lever field in `_shared/auto-decision-log.md`

**Files:**
- Modify: `skills/_shared/auto-decision-log.md` (insert a new `## Lever attribution (optional trailing field)` section between the Entry schema table, which ends at the `Commit ref / stage path` row ~line 73, and `## Status semantics`)

**Interfaces:**
- Produces: the canonical field definition Tasks 2–4 cite. Grammar: `[lever: {key}={value} ({source})]`, always last, semicolon-separated for multiple levers.

- [ ] **Step 1: Insert the new section**

Insert this exact content after the Entry schema field table (after the `| Commit ref / stage path | when reversible | ... |` row and before `## Status semantics`):

````markdown
## Lever attribution (optional trailing field)

A decision that consulted a policy/config lever may name it at the end of its entry:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}. [lever: {key}={value} ({source})]
```

The bracketed field is **always last** — after the existing optional `{; commit ref or stage path}` element when that is present. Multiple levers are semicolon-separated inside one bracket pair. The lever field is optional; absence is valid and no reader may require its presence. Absence means "not lever-governed or not yet adopted" — never an error.

**"Consulted" means every lever whose value the logging site's own procedure read to make this decision** — a weighted or advisory input counts; a lever the procedure never read does not. The field cites levers consulted, not which one alone decided.

- **Source words:** `run-config | policy | default` (matching `resolve-policy.js`'s envelope `source`), plus `arg` for a value set by an explicit CLI/skill argument override. No other source words.
- **Statuses:** any status (`AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`) whose decision consulted a lever carries the field; HARD-GATE stops and other non-policy decisions never carry it — attribution on a non-policy decision is noise that erodes the signal.
- **Keys are literal:** copy lever names from `POLICY_KEYS` (`bin/lib/policy-schema.js`) verbatim; never paraphrase.
- **List-valued levers** render the configured comma-joined string truncated at 60 chars with `…`; an unset list renders `[]`.
- **Table-cell rendering:** inside any markdown table cell the field renders as an inline code span (backticks), which neutralizes `|` and brackets — e.g. `` `[lever: scope-creep=add-to-plan (policy)]` `` as a suffix in the cell that carries the entry's detail.

Worked examples:

```
- AUTO 14:32:14 — Step 1.5: scope-creep — added 2 files to plan (src/utils/cache.ts, src/utils/keys.ts). Reversibility: high (commit abc1234). [lever: scope-creep=add-to-plan (policy)]
- AUTO 15:41:09 — Auto-merge: group [42], assess-agent-autonomy verdict auto-merge for every member. Merge commit: def5678. Reversibility: high (git revert). [lever: automerge-max-lines=40 (default); automerge-max-files=2 (policy)]
- STAGED 14:41:15 — Step 3 Routing: 2 severity:medium findings staged. Surface at Review Console. [lever: review-severity-floor=low (default)]
- KEPT-PROMPT 14:12:40 — Step 2.6 shape check: cross-task dependency chain > 3 deep. Surfaced inline.
```

The third example is a decision whose outcome was driven by the findings' own severity, not by the floor alone — the floor was still consulted, so it is still cited. The fourth is a non-policy decision (a HARD-GATE surface): no field.

**Adoption:** sites not yet writing the field adopt it when next touched — no compatibility shim, no deadline.
````

- [ ] **Step 2: Verify the literal optionality sentence and placement**

Run: `grep -Fc "The lever field is optional; absence is valid and no reader may require its presence." skills/_shared/auto-decision-log.md`
Expected: `1`

Run: `grep -c "run-config | policy | default" skills/_shared/auto-decision-log.md`
Expected: `1` (source vocabulary stated once in the new section)

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/auto-decision-log.md
git commit -m "Add optional lever attribution field to the auto-decision log contract — refs #535"
```

---

### Task 2: Review Console rendering adoption in `review-console.md`

**Files:**
- Modify: `skills/wrap-up/review-console.md` (add one short paragraph immediately after the `console-template.md` reference paragraph in `## Present the console`, ~line 307)
- NOT modified: `skills/wrap-up/console-template.md` (verify untouched)

**Interfaces:**
- Consumes: Task 1's table-cell rendering rule (cited, not restated).

- [ ] **Step 1: Insert the rendering paragraph**

After the paragraph beginning `Read \`console-template.md\` in this skill's directory and render that exact shape` (and before the `**Hard gate (restated)**` line), insert:

```markdown
**Lever attribution suffix.** When a `decisions.md` entry carries the optional `[lever: …]` field (`_shared/auto-decision-log.md`'s Lever attribution section), append it to that row's existing detail-bearing cell (`What`/`Detail` in the prose-fallback shapes, `Change` in the engine's uniform table) as an inline code span — no new column; `console-template.md`'s section shapes are unchanged. With the field: `Auto-fixed 4 lint failures` becomes `Auto-fixed 4 lint failures — ` `` `[lever: auto-fix-threshold=lint+type (default)]` ``. Without the field, the cell renders exactly as today — absence is valid and never annotated.
```

- [ ] **Step 2: Verify both renderings present and console-template untouched**

Run: `grep -c "Lever attribution suffix" skills/wrap-up/review-console.md`
Expected: `1`

Run: `git diff --name-only HEAD -- skills/wrap-up/console-template.md`
Expected: empty output (file untouched)

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/review-console.md
git commit -m "Render the lever attribution suffix in Review Console detail cells — refs #535"
```

---

### Task 3: Dispatch auto-merge gate adoption in `settle-and-merge.md`

**Files:**
- Modify: `skills/dispatch/settle-and-merge.md:228` (the auto-merge gate's logged decision-line template — the verified actual location; see Global Constraints for the spec-deviation note)

**Interfaces:**
- Consumes: Task 1's grammar. Lever keys (verified set): `automerge-max-lines`, `automerge-max-files`, `merge-sensitive-paths`.

- [ ] **Step 1: Edit the log-line template**

At `skills/dispatch/settle-and-merge.md:228`, change:

```
`AUTO {time} — Auto-merge: group [{issues}], assess-agent-autonomy verdict auto-merge for every member (see each member's RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).`
```

to:

```
`AUTO {time} — Auto-merge: group [{issues}], assess-agent-autonomy verdict auto-merge for every member (see each member's RATIONALE). Merge commit: {sha}. Reversibility: high (git revert). [lever: automerge-max-lines={value} ({source}); automerge-max-files={value} ({source}); merge-sensitive-paths={value} ({source})]`
```

Then, on the line after the template, add this one-sentence citation (no grammar restatement):

```
The trailing `[lever: …]` field follows `_shared/auto-decision-log.md`'s Lever attribution section — these are the levers the gate's `merge-check` invocation reads (`skills/assess-agent-autonomy/merge-check.md`); `{value}`/`{source}` come from that invocation's own resolver call.
```

- [ ] **Step 2: Verify the field cites exactly the consulted levers**

Run: `grep -c "housekeeping-auto-merge" skills/dispatch/settle-and-merge.md`
Expected: `0` (lever not read by this procedure — must not be cited)

Run: `grep -c "lever: automerge-max-lines" skills/dispatch/settle-and-merge.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/dispatch/settle-and-merge.md
git commit -m "Adopt lever attribution on the dispatch auto-merge gate log line — refs #535"
```

---

### Task 4: Build plan-audit scope-creep adoption in `plan-audit.md`

**Files:**
- Modify: `skills/build/plan-audit.md:34-36` (the three scope-creep policy row templates)

**Interfaces:**
- Consumes: Task 1's grammar. Lever key: `scope-creep`.

- [ ] **Step 1: Edit the three row templates**

In the policy table at `skills/build/plan-audit.md:34-36`, append the field to each template (all three statuses consulted the lever — the spec's any-status rule):

- Line 34 (`add-to-plan` row): `AUTO {time} — Step 1.5: scope-creep — added {N} files to plan ({list}). Reversibility: high (commit {hash}). [lever: scope-creep=add-to-plan ({source})]`
- Line 35 (`stop-and-ask` row): `KEPT-PROMPT {time} — Step 1.5: scope-creep matched {N} files, policy is stop-and-ask. Surfaced inline. [lever: scope-creep=stop-and-ask ({source})]`
- Line 36 (`drop` row): `STAGED {time} — Step 1.5: scope-creep matched {N} files, policy is drop. Files: {list}. Surface at Review Console. [lever: scope-creep=drop ({source})]`

`{source}` is the envelope's `source` from the single resolver call this step already makes (line 30) — add one clause to that paragraph's final sentence so it reads "...apply the envelope's `value`, and carry the envelope's `source` into the row template's `[lever: …]` field (`_shared/auto-decision-log.md`'s Lever attribution section)."

- [ ] **Step 2: Verify**

Run: `grep -c "lever: scope-creep" skills/build/plan-audit.md`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add skills/build/plan-audit.md
git commit -m "Adopt lever attribution on plan-audit scope-creep row templates — refs #535"
```

---

### Task 5: Regression gate and skill-graph check

**Files:**
- Read-only check: `docs/skill-graph.md` (expected: no new edge — all four edits are within existing relationships)

- [ ] **Step 1: Confirm no new skill-graph edge**

The four edits create no new cross-skill relationship: review-console already reads decisions.md per the existing wrap-up↔ledger/log edges; dispatch and build already write it. Run: `grep -c "auto-decision-log" docs/skill-graph.md` and eyeball existing edges — if (unexpectedly) none covers "writes/reads the auto-decision log", add exactly one edge; otherwise change nothing.

- [ ] **Step 2: Run the full suite**

Run: `npm test > /tmp/npm-test-535.log 2>&1; tail -20 /tmp/npm-test-535.log`
Expected: pass (docs-only change). If failure counts vary run-to-run, re-run the affected file in isolation before concluding breakage (CLAUDE.md).

- [ ] **Step 3: Commit (only if skill-graph changed)**

```bash
git add docs/skill-graph.md
git commit -m "Record skill-graph edge for lever attribution adoption — refs #535"
```
