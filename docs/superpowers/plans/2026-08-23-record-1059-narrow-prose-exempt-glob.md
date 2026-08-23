# Record #1059: Narrow review-auto-apply-prose-exempt's glob set (drop tests/**) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve #660's own deferred reconsideration question — narrow `review-auto-apply-prose-exempt`'s exempt glob set from `skills/**/*.md`, `docs/**/*.md`, `tests/**` down to the two prose-only globs, dropping `tests/**` (executable code, in this repo and in every consumer project), since no evidence beyond #660's original evidentiary basis justifies including it.

**Architecture:** A three-site mechanical text edit (the routing prose, the lever-table summary, the conformance test) — no code logic changes, since the glob set is inline prose consumed by the finding's `Target:` path match in `step3-routing.md`, not a separate config value.

**Tech Stack:** Markdown skill prose + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1059/work/1059-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1059` (never closes/fixes).
- This record's scope is `tests/**` specifically — do NOT reconsider or touch `docs/**/*.md`'s inclusion; the spec's own Deliverables treat `skills/**/*.md` + `docs/**/*.md` as "the two prose-only globs" (the fallback narrowed set), leaving that pairing unquestioned.

### Evidence gathered (recorded at plan time, before writing any code — the record's own Deliverables require this precede the decision)

- #660's own evidentiary basis (its Current State, quoting run `2026-08-16T091924-spec-563-564-565-566`): all 4 confirmed findings that motivated the whole lever were `skills/**/*.md` fixes. Zero were `docs/**/*.md` or `tests/**` fixes — the sample never actually exercised either of those two globs, `tests/**` included.
- #660's issue body's own "Suggested shape" section (human-authored) proposed the three-glob set as a general policy design ("Encodes the judgment the pipeline already exercises, restoring the lever's descriptive truth"), not as a literal generalization from the 4-finding sample — but the AC that shipped enumerated `tests/**` explicitly, so the build implemented it as specced (per #1059's own Origin line) while filing this record to reconsider it.
- #660's own Gotchas section: "The observed 4-of-4 sample is real but small; the Acceptance Criteria above encode the observed carve-out's exact scope (prose-only fix, one tier) rather than generalizing further... without new evidence" — already cautions against exactly this kind of generalization.
- Searched (this session, before writing this plan): #660's issue comments, PR #1047's review comments, `docs/plans/2026-08-20-660-review-auto-apply-prose-exempt-ledger.md` (#660's own wrap-up ledger — 2 items, neither about `tests/**`), and `docs/incident-log.md` (`grep -n "prose-exempt" docs/incident-log.md` — zero hits). No additional evidence anywhere in the repo justifies `tests/**` specifically — no incident record of it being exercised, no confirmed-safe track record, no prior discussion beyond what #660's own body already states.
- **Decision: narrow.** No evidence found for keeping `tests/**`; the record's own default position (Gotchas) and #660's own caution both point the same direction absent evidence. `tests/**` — executable test code, in this repo and in every consumer project — is a materially different risk class from prose-only `.md` files; a confirmed medium-severity finding whose entire fix lands inside `tests/**` auto-applies one tier higher than the ceiling normally allows, with no human review, purely because the changed files happened to be `.js`/`.ts` test files rather than documentation.

### Confirmed occurrence sites (verified at plan time via `grep -rn "skills/\*\*/\*\.md" plugin/ docs/ tests/`, cross-checked against `grep -rn "tests/\*\*" plugin/ tests/`)

1. `plugin/skills/review/step3-routing.md` line 36 — the routing prose's `Target:` path match, the load-bearing site.
2. `plugin/skills/_shared/policy-schema.md` line 186 — the `review-auto-apply-prose-exempt` lever-table row's one-line semantics summary, which restates the glob set.
3. `tests/step3-routing-prose-exempt-conformance.test.js` line 20 — `for (const glob of ['skills/**/*.md', 'docs/**/*.md', 'tests/**'])`, the conformance test pinning the glob set (must lose the `tests/**` entry, or it asserts a glob no longer present).
4. NOT in scope: `docs/plans/2026-08-20-660-review-auto-apply-prose-exempt-ledger.md` (historical wrap-up artifact — never edited after the fact) and `docs/superpowers/plans/2026-08-20-qa-artifact-relocation.md` line 7 (references the *test file's pattern*, not the glob set's content — no `tests/**` string there to change).

### Task 1: Narrow the glob set at all three sites, add a Gotcha-mandated justification comment

**Files:**
- Modify: `plugin/skills/review/step3-routing.md` (line 36)
- Modify: `plugin/skills/_shared/policy-schema.md` (line 186)
- Modify: `tests/step3-routing-prose-exempt-conformance.test.js` (line 20)

**Interfaces:** none — self-contained prose + test edit, no code.

- [ ] **Step 1: Edit the routing prose**

In `plugin/skills/review/step3-routing.md`, in the paragraph at line 36 (starts "Also resolve `review-auto-apply-prose-exempt` the same way —"), change:

```
matches `skills/**/*.md`, `docs/**/*.md`, or `tests/**`, look up this finding's row
```

to:

```
matches `skills/**/*.md` or `docs/**/*.md` — prose-only files; `tests/**` was narrowed out of this set by #1059, since it is executable code in this repo and in every consumer project, and #660's own evidentiary basis never exercised it — look up this finding's row
```

Change nothing else in that paragraph or the surrounding prose.

- [ ] **Step 2: Edit the lever-table row summary**

In `plugin/skills/_shared/policy-schema.md` line 186, change:

```
a finding whose fix touches only `skills/**/*.md`/`docs/**/*.md`/`tests/**` auto-applies
```

to:

```
a finding whose fix touches only `skills/**/*.md`/`docs/**/*.md` auto-applies
```

Change nothing else on that row.

- [ ] **Step 3: Update the conformance test**

In `tests/step3-routing-prose-exempt-conformance.test.js`, change the `'names the exact exempt glob set'` test (currently lines 19-23):

```js
test('names the exact exempt glob set', () => {
  for (const glob of ['skills/**/*.md', 'docs/**/*.md', 'tests/**']) {
    assert.ok(md.includes(glob), `step3-routing.md must name the exempt glob "${glob}"`);
  }
});
```

to:

```js
test('names the exact exempt glob set', () => {
  for (const glob of ['skills/**/*.md', 'docs/**/*.md']) {
    assert.ok(md.includes(glob), `step3-routing.md must name the exempt glob "${glob}"`);
  }
});

test('tests/** is explicitly excluded from the exempt glob set, with a documented reason (#1059)', () => {
  assert.ok(!md.includes('`skills/**/*.md`, `docs/**/*.md`, or `tests/**`'),
    'the old three-glob set (including tests/**) must no longer appear verbatim');
  assert.ok(md.includes('narrowed out of this set by #1059'), 'step3-routing.md must document why tests/** was narrowed out');
});
```

- [ ] **Step 4: Run the target test file to verify**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/step3-routing-prose-exempt-conformance.test.js tests/resolve-policy-lib.test.js tests/policy-schema.test.js 2>&1 | tail -20`
Expected: all pass — the new negative-pin test in Step 3 confirms the narrowing landed and is documented; `resolve-policy-lib.test.js`/`policy-schema.test.js` are unaffected (they test the boolean lever's resolution precedence, not the glob set's content) and must still pass unmodified.

- [ ] **Step 5: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1059-full.txt 2>&1; tail -8 /tmp/1059-full.txt; grep "^not ok" /tmp/1059-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test and the already-tracked `recordDecline` concurrency test, GitHub issue #1192, are known unrelated flakes this session — re-run any failing file in isolation via `node --test <file>` before treating it as real).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/skills/review/step3-routing.md plugin/skills/_shared/policy-schema.md tests/step3-routing-prose-exempt-conformance.test.js && git commit -m "Narrow review-auto-apply-prose-exempt's glob set: drop tests/**

#660's evidentiary basis (4 findings, run 2026-08-16T091924) was entirely
skills/**/*.md fixes — it never exercised tests/** or docs/**/*.md. No
evidence anywhere in this repo (issue history, PR review, incident log)
justifies auto-applying a bumped-severity fix to executable test code
with no human review. Narrowed to the two prose-only globs; the routing
prose documents why, and a new conformance test pins the exclusion.

refs #1059"
```

## Verification against Acceptance Criteria

- **AC1** (a recorded decision on `tests/**`'s inclusion, backed by evidence): the Global Constraints' "Evidence gathered" section above records the search performed and its result (no justifying evidence found); Step 1's routing-prose edit records the decision and its reasoning inline, where a future reader will actually see it.
- **AC2** (if narrowed: lands with `npm test` passing): Steps 4-5.
- **AC3** (if kept: justification documented at the definition site) — N/A, this record narrows.

## Scope keywords:

review-auto-apply-prose-exempt, tests/**, step3-routing.md, prose-exempt bump, #660
