# Tidy Routing Flips + Moderate Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume #517's reconcile checks from tidy's routing table (reconcile-converged rows), flip the `tidy-aggressiveness` default to `moderate` in every encoding, land the missing-routing-rule principle, and fix the branch-delete anti-pattern row.

**Architecture:** Prose-plus-default-encodings pass. Routing rows point at the reconcile check modules — never restate evidence conditions. The principle lives once, in `step-6-auto.md`'s preamble.

**Tech Stack:** Markdown skill prose + one JS constant + one test assertion.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010137-spec-517-518-519/spec-519/work/519-spec.md`

## Global Constraints

- Rows must NOT restate reconcile's decision logic (evidence conditions, thresholds) — point at `bin/lib/reconcile/{release-merged,archive-branches,reap-merged}.js`; the module headers are authoritative.
- The `local-merge` caveat stated ONCE in the routing table's preamble; affected rows reference it.
- The principle's key phrase "recurring staged item" appears exactly once across `skills/` and `docs/`.
- `conservative` is not removed — documented opt-down.
- No report-template changes (the Applied/Approve/Yours/Clean template and `### Report rules` from #518 are untouched).
- Describe row sets by reference, never literal count.
- Commit style `{Verb} {what} — {detail}` ending `refs #519`, never a closing keyword.
- Worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-517-518-519` — verify `pwd` + `git rev-parse --show-toplevel` before commits.

## Verified current state (landed shapes — the freeze point resolved)

- #517 landed: check name `'archive-branches'` (`bin/lib/reconcile/index.js` dispatch order mirror → console → release → archive → archive-branches → reap); `result.branches` = `[{name, kind: 'branch'|'tag', action, reason}]`; release check releases on merged-PR OR issue-closed evidence (`release-merged.js`, reason `issue-closed: reconciled from #{n}`); archival = cherry-verified `-D` / annotated `archive/{branch}` tag then delete; worktree liveness via `worktree-reap.js` predicates (reap check).
- #518 landed: report sections `**Applied automatically**` / `**Approve ({N})**` / `**Yours ({N})**` / `**Clean:**`; `### Report rules` in step-6-auto.md; scan-procedures.md Collection routing re-pointed.
- `skills/tidy/step-6-auto.md:6` — "read `tidy-aggressiveness` from `config.yml` (default `conservative`)". Line 10 table header: `| Recommendation | \`conservative\` (default) | \`moderate\` | \`aggressive\` |`. Line 22: the "Unsettled run" row. No preamble principle statement.
- Every encoding of the default (grep-verified): `bin/lib/policy-schema.js:62` (`default: 'conservative'`), `tests/resolve-policy-cli.test.js:83` (asserts `{ value: 'conservative', source: 'default' }`), `skills/_shared/policy-schema.md:172` (table default cell), `skills/flow/manifesto.md:183` (example block) **and** its "Recommendation defaults" table row (`| Tidy aggressiveness | \`conservative\` | Keep + unambiguous Delete only |`), `skills/tidy/SKILL.md:221` ("auto-apply per the `conservative` aggressiveness default"), `skills/tidy/routine-template.yml:107` ("routing (conservative by default) stages judgment-requiring items"). `tests/policy-schema.test.js:193/196` use an EXPLICIT `conservative` value (not a default assertion) — leave them alone.
- `skills/tidy/SKILL.md:263` — the anti-pattern row: "Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing means only … Never destructive-delete autonomously either way."
- `docs/skill-graph.md` — tidy edges exist for many counterparts; NO tidy→reconcile consumption edge yet.

---

### Task 1: `step-6-auto.md` — preamble, default flip (this file), reconcile-converged rows

**Files:**
- Modify: `skills/tidy/step-6-auto.md`

- [ ] **Step 1: Default-read line**

Change line 6's `(default \`conservative\`)` to `(default \`moderate\`; \`conservative\` is the documented opt-down)`.

- [ ] **Step 2: Preamble — principle + local-merge caveat**

Insert between the default-read paragraph and the routing table:

```markdown
**A recurring staged item is a missing routing rule.** The Approve bucket should be empty in steady state: when the same class of finding stages run after run, the fix is a routing row — or a reconcile check — that disposes of it mechanically, not a faster approval habit. The durable exception is outward-facing GitHub writes, which the skill-side auto-mode contract forbids at every tier (`_shared/auto-mode-contract.md`); mechanical dispositions of outward state therefore ride on reconcile's background convergence (the reconcile-converged rows below), never on a tidy tier.

**`local-merge` caveat (stated once, referenced by the reconcile-converged rows):** reconcile's checks run under `integration-model: pr-first` only (`bin/lib/reconcile/index.js`'s guard). Under `local-merge`, nothing below converges — every such finding keeps today's staging behavior, unchanged.
```

- [ ] **Step 3: Table header flip**

`| Recommendation | \`conservative\` (default) | \`moderate\` | \`aggressive\` |` → `| Recommendation | \`conservative\` | \`moderate\` (default) | \`aggressive\` |`

- [ ] **Step 4: Add the issue-closed claim-release row**

Insert after the "Unsettled run" row:

```markdown
| **Issue-closed claim release** (a `live`/`stale` claim whose issue is already CLOSED — reconcile's `release` check, `bin/lib/reconcile/release-merged.js`, reason `issue-closed: reconciled from #{n}`) | Reconcile-converged — reported in **Applied automatically**, never staged | Reconcile-converged (same) | Reconcile-converged (same) — see the preamble's `local-merge` caveat. Releasing a claim IS an outward GitHub write (a claims-blob conditional overwrite plus `bot:in-progress` removal); it is permitted because it is reconcile's own background-convergence write — shipped behavior for merged-PR evidence since the reconcile layer landed — governed by reconcile's posture, outside the skill-side auto-mode contract. This row only reports the result; evidence conditions live in the module header, never here. Claims on still-open issues are untouched by this row — see the Unsettled-run row above. |
```

- [ ] **Step 5: Amend the "Unsettled run" row's text**

In row `| **Unsettled run** (item 10 — …)`, replace the aggressive-column note

`resuming re-enters a pipeline mid-flight and releasing drops a claim another session may still hold; both are judgment calls this sweep only ever surfaces, never one it decides or executes`

with

`resuming re-enters a pipeline mid-flight — always a judgment call this sweep only surfaces. Releasing a claim on a still-open issue drops a claim another session may still hold — that stays surface-only here; the issue-closed case never reaches this row, because reconcile's release check already disposes of it mechanically (see the Issue-closed claim release row below)`

- [ ] **Step 6: Add the branch-archival / locked-worktree row**

Insert after the issue-closed row:

```markdown
| **Abandoned-branch archival + locked-worktree resolution** (unmerged/aged plugin-owned branches and merged-but-stuck worktrees — reconcile's `archive-branches` and `reap` checks, `bin/lib/reconcile/archive-branches.js` + `reap-merged.js`, with worktree liveness via `worktree-reap.js`'s predicates) | Reconcile-converged — reported in **Applied automatically**, never staged | Reconcile-converged (same) | Reconcile-converged (same) — see the preamble's `local-merge` caveat. Evidence conditions and thresholds (cherry equivalence, tag-then-delete, age windows, liveness) live in the module headers, never here. A candidate the checks skip — open PR, too young, live-owner lock, transport failure — surfaces as a one-line skip alongside the converged outcomes; a live-owner lock in particular is reported, never broken. The cleanly-merged Delete row above is unaffected — it predates these checks and stays tier-routed for `local-merge` parity. |
```

- [ ] **Step 7: Verify**

`grep -in 'conservative' skills/tidy/step-6-auto.md` — every hit is the tier column name or the opt-down mention, none says default. `grep -c 'recurring staged item' skills/tidy/step-6-auto.md` = 1. Both new rows name `release-merged.js` / `archive-branches.js` and reference the preamble caveat.

- [ ] **Step 8: Commit**

```bash
git add skills/tidy/step-6-auto.md
git commit -m "Add reconcile-converged routing rows and missing-routing-rule principle to tidy — moderate default in step-6-auto, refs #519"
```

---

### Task 2: Default flip — every remaining encoding

**Files:**
- Modify: `bin/lib/policy-schema.js`, `tests/resolve-policy-cli.test.js`, `skills/_shared/policy-schema.md`, `skills/flow/manifesto.md`, `skills/tidy/SKILL.md`, `skills/tidy/routine-template.yml`

- [ ] **Step 1: Negative control (AC2)**

Run and record: `grep -rn "tidy-aggressiveness.*conservative\|conservative.*aggressiveness\|default: 'conservative'" bin/ tests/ skills/_shared/policy-schema.md skills/flow/manifesto.md skills/tidy/SKILL.md skills/tidy/routine-template.yml` — confirm it matches the pre-change encodings listed in "Verified current state" before editing.

- [ ] **Step 2: Apply the flips**

1. `bin/lib/policy-schema.js:62` — `default: 'conservative'` → `default: 'moderate'`.
2. `tests/resolve-policy-cli.test.js:83` — expected `{ value: 'conservative', source: 'default' }` → `{ value: 'moderate', source: 'default' }`.
3. `skills/_shared/policy-schema.md:172` — default cell `conservative` → `moderate` (leave the values enum).
4. `skills/flow/manifesto.md:183` — `tidy-aggressiveness: conservative` → `tidy-aggressiveness: moderate`; and the Recommendation-defaults table row → `| Tidy aggressiveness | \`moderate\` | Reversible git-tracked cleanups auto-apply; outward-facing GitHub writes still stage (\`conservative\` is the opt-down) |`.
5. `skills/tidy/SKILL.md:221` — reword the unattended-execution sentence: "safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply per the `conservative` aggressiveness default" → "safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply — and per the `moderate` aggressiveness default, so do the reversible git-tracked judgment cleanups (`local-files` deletes/absorbs/defers); outward-facing GitHub writes still stage". Read the sentence in place and keep the rest intact.
6. `skills/tidy/routine-template.yml:107` — read the surrounding lines first; change "(conservative by default) stages judgment-requiring items" to "(moderate by default) auto-applies reversible git-tracked cleanups and stages outward-facing GitHub writes" — adjust to fit the yml prose's grammar.
7. `tests/policy-schema.test.js:193/196` — explicit-value fixtures: LEAVE UNCHANGED.

- [ ] **Step 3: Verify**

`node --test tests/resolve-policy-cli.test.js tests/policy-schema.test.js` — pass. Re-run Step 1's grep — the only remaining `conservative` hits are opt-down mentions/enum values, not defaults.

- [ ] **Step 4: Commit**

```bash
git add bin/lib/policy-schema.js tests/resolve-policy-cli.test.js skills/_shared/policy-schema.md skills/flow/manifesto.md skills/tidy/SKILL.md skills/tidy/routine-template.yml
git commit -m "Flip tidy-aggressiveness default to moderate across every encoding — schema, resolver test, prose, manifesto example, routine template, refs #519"
```

---

### Task 3: Anti-pattern row + skill-graph edge

**Files:**
- Modify: `skills/tidy/SKILL.md` (anti-pattern row, ~line 263), `docs/skill-graph.md`

- [ ] **Step 1: Replace the anti-pattern row**

Replace the full row at `skills/tidy/SKILL.md:263` with:

```markdown
| Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing means only "not contained in HEAD/upstream" — not unmerged work, since a branch merged into a *different* configured base refuses identically. Two narrow carve-outs exist, both `pr-first`-only and both executed exclusively by reconcile's `archive-branches` check (`bin/lib/reconcile/archive-branches.js` — the checks don't run under `local-merge`): `-D` on proven `git cherry` patch-equivalence is not a destructive delete (the cherry evidence, not `-d`'s verdict, is the safety), and the genuinely-unmerged aged case is covered by the archive-tag path (annotated `archive/{branch}` tag at the tip first, then delete — recoverable). Manual `-D` without that evidence remains forbidden on both integration models — check the branch against every configured base before concluding; surface `merged into {other-base} — needs -D, manual review required` vs. genuinely `unmerged — manual review required`. |
```

- [ ] **Step 2: Add the tidy→reconcile edge in `docs/skill-graph.md`**

Locate `/tidy`'s own edges table (the section where `/tidy` is the subject skill) and add one row:

```markdown
| `bin/lib/reconcile/` | `/tidy`'s scan procedures run `reconcile()` at their own trigger points (Step 4.5's call per `_shared/console-execution.md`) and the report's **Applied automatically** section renders its outcomes (`result.claims` / `result.worktrees` / `result.branches`) — tidy consumes convergence results, never re-implements the checks; `step-6-auto.md`'s reconcile-converged rows point at the check modules for evidence conditions. |
```

Match the surrounding table's column shape exactly (read the section first — if the table is keyed by skill names, place this under the closest convention the file already uses for non-skill counterparts, e.g. the `_shared/*` rows).

- [ ] **Step 3: Verify**

`grep -c 'archive-branches' skills/tidy/SKILL.md` ≥ 1; `grep -c 'reconcile' docs/skill-graph.md` increased by the new row; `grep -in 'never destructive-delete autonomously' skills/tidy/SKILL.md` = 0 (the old absolutist clause is gone, replaced by the evidence-scoped prohibition).

- [ ] **Step 4: Commit**

```bash
git add skills/tidy/SKILL.md docs/skill-graph.md
git commit -m "Amend tidy branch-delete anti-pattern with cherry-evidence carve-outs and add tidy→reconcile edge — refs #519"
```

---

### Task 4 (controller-owned): release-note obligation

Recorded by the controller, not dispatched: a ledger item (phase `wrap-up`, status `open`) stating the release that ships this must announce the `tidy-aggressiveness` default change (expand-contract discipline), so the obligation surfaces at the run's resolve gate and consolidated console rather than being buried.

---

### Task 5: Acceptance verification

- [ ] AC1: `grep -in 'conservative' skills/tidy/step-6-auto.md` — no hit states it as default.
- [ ] AC2: repo-wide grep for the default finds `moderate` in every encoding (schema JS, resolver test, policy-schema.md, manifesto ×2, SKILL.md prose, routine-template.yml, step-6-auto.md) — negative control was Task 2 Step 1.
- [ ] AC3: `grep -rl 'recurring staged item' skills/ docs/ --exclude-dir=plans` (excluding `docs/superpowers/plans/` too) names exactly one file — `skills/tidy/step-6-auto.md`. The exclusions cover this run's own transient artifacts (the execution plan and ledger are consumed/deleted at wrap-up; the durable statement lives once).
- [ ] AC4: anti-pattern row names cherry/patch-equivalence, marks carve-outs `pr-first`-only, keeps the no-evidence prohibition.
- [ ] AC5: new rows name `release-merged.js`/`archive-branches.js` (landed check names) and reference the preamble caveat.
- [ ] Full `npm test` (redirected to a file, read the tail) — 0 failures.
