# Merge Authorization Lever — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human, present at `/flow` run start, pre-authorize "merge automatically once every HARD-GATE is green and the suite is proven" via a new Pipeline Config Manifesto lever — so an `unattended` run no longer has to wait, unclicked, for a human to show up at the terminal Review Console before it can close.

**Architecture:** Add `merge-authorization` (`ask` default | `merge-when-green`) as Manifesto lever 13. It resolves only from an explicit per-run source (this run's `config.yml`, written by a live Manifesto `confirm`/`hybrid` override answer) or a hardcoded default — **never** from `.claude-tweaks/policy.yml` — so it can never become a standing, un-live project default; that's the deliberate scope boundary that keeps it inside the interactive-human-only `auto:*` invariant. When resolved `merge-when-green`, `wrap-up/review-console.md`'s existing Auto-merge short-circuit (today gated on the live `auto:merge` label) gets a second, independent trigger condition — same merge execution path (`_shared/pr-first-merge.md` / the short-circuit's local-merge branch), distinct tag (`manifesto-authorized`) and log line. When the run instead reaches the terminal Review Console unmerged (declined, or the console's other items still need a decision), the Pipeline Summary's Next Actions block gets a new resume-command row so the recommended next step is a paste-ready command, not silent prose — resolving the citation `_shared/auto-mode-contract.md` already carries at the Terminal `## Next Actions` block row ("the surface for that offer is #715's open decision").

**Tech Stack:** Markdown skill prose (this plugin's entire "implementation" surface) + one small addition to `bin/lib/policy-schema.js` (a resolver special-case, mirroring the existing `housekeeping-auto-merge` derived-default precedent) + `node --test` unit tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T162147-spec-715/work/715-spec.md` (materialized from record #715) — the plan argues from that spec; read both.

**Non-goal, stated explicitly (keeps this agent-sized):** multi-spec bundle runs (`flow/multispec-review-console.md`) are **not** touched by this plan. That file already has its own `consoleAutoResolve`-equivalent wiring and its own wholesale AskUserQuestion exemption (`tests/auto-mode-flow-two-stop-budget.test.js`); extending the new lever there is a natural follow-up but doubles the file surface this plan would need to touch and isn't required by record #715's Acceptance Criteria (which only describe a single-record run). Note this in the ledger as a `build/*` observation if it isn't already captured.

## Global Constraints

- Never write the literal placeholder tokens `TBD`/`TODO`/`<!-- ambiguity:` in any prose this plan produces (spec-shaped-body convention, applies to skill prose edits too).
- `docs/skill-authoring.md`'s Skill handoffs convention: paste-ready fully-qualified commands, one per line, never an `AskUserQuestion` for a terminal `## Next Actions` block.
- `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist (already read in full during planning) is the authoritative list of files a new lever touches — every task below maps to one row of it.
- Every markdown edit must keep its file under whatever byte ceiling already applies to it (SKILL.md-class files: 40,960 bytes) — check `wc -c` before and after touching `flow/manifesto.md`, `wrap-up/review-console.md`, and `_shared/auto-mode-contract.md`, all three of which other commits have had to trim to stay under this ceiling.

---

### Task 1: Register the `merge-authorization` policy key with the policy.yml-exclusion special case

**Files:**
- Modify: `bin/lib/policy-schema.js` (add `POLICY_KEYS` entry; add the resolver special case)
- Test: `tests/resolve-policy-lib.test.js`
- Test: `tests/policy-schema.test.js` (generic per-row assertions already iterate `POLICY_KEYS` — verify the new row satisfies them, no new assertions needed there)

**Interfaces:**
- Consumes: `resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw })` — existing exported function, unchanged signature.
- Produces: `POLICY_KEYS` gains one row `{ key: 'merge-authorization', type: 'enum', values: ['ask', 'merge-when-green'], default: 'ask', summary: "...", category: 'merge-safety', tier: 'advanced' }`, consumed by `flow/manifesto.md` (Task 2) and `wrap-up/review-console.md` (Task 5) via `node bin/resolve-policy.js --run "$PIPELINE_RUN_DIR" --values merge-authorization`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/resolve-policy-lib.test.js` (mirror the file's existing `housekeeping-auto-merge` derived-default tests immediately above/below them — same `resolvePolicyKeys` import already at the top of the file):

```javascript
// --- merge-authorization: run-config-or-arg only, never policy.yml (#715) ---

test('merge-authorization: unset everywhere resolves to the ask default', () => {
  const result = resolvePolicyKeys(['merge-authorization'], { policyRaw: null, runConfigRaw: null });
  assert.deepStrictEqual(result['merge-authorization'], { value: 'ask', source: 'default' });
});

test('merge-authorization: a run-config value (a live Manifesto override) wins', () => {
  const result = resolvePolicyKeys(['merge-authorization'], {
    policyRaw: null,
    runConfigRaw: 'merge-authorization: merge-when-green\n',
  });
  assert.deepStrictEqual(result['merge-authorization'], { value: 'merge-when-green', source: 'run-config' });
});

test('merge-authorization: a policy.yml value is ignored — falls back to the default, not "policy"', () => {
  const result = resolvePolicyKeys(['merge-authorization'], {
    policyRaw: 'merge-authorization: merge-when-green\n',
    runConfigRaw: null,
  });
  assert.deepStrictEqual(result['merge-authorization'], { value: 'ask', source: 'default' });
});

test('merge-authorization: run-config still wins even when policy.yml also sets it (policy ignored, not merely lower-precedence)', () => {
  const result = resolvePolicyKeys(['merge-authorization'], {
    policyRaw: 'merge-authorization: merge-when-green\n',
    runConfigRaw: 'merge-authorization: ask\n',
  });
  assert.deepStrictEqual(result['merge-authorization'], { value: 'ask', source: 'run-config' });
});

test('merge-authorization: an invalid run-config value falls back to the default, tagged invalid', () => {
  const result = resolvePolicyKeys(['merge-authorization'], {
    policyRaw: null,
    runConfigRaw: 'merge-authorization: sometimes\n',
  });
  assert.deepStrictEqual(result['merge-authorization'], { value: 'ask', source: 'default', invalid: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: FAIL — `merge-authorization` is not yet a recognized key, every assertion above sees `{ error: 'unknown-key' }` instead of the expected shape.

- [ ] **Step 3: Add the POLICY_KEYS row**

In `bin/lib/policy-schema.js`, immediately after the existing `merge-verification` row (around line 39), add:

```javascript
  // merge-authorization (#715): lets a human present at Manifesto time
  // pre-authorize "merge once every HARD-GATE is green" for this run only.
  // Deliberately excluded from the policy.yml source below (see the
  // resolvePolicyKeys special case) — a project-wide standing default here
  // would remove the "a human decided, live, for this run" property the
  // interactive-human-only auto:* invariant depends on; see
  // _shared/auto-mode-contract.md's Bookend Architecture section.
  { key: 'merge-authorization', type: 'enum', values: ['ask', 'merge-when-green'], default: 'ask', summary: "Lets a human pre-authorize, at Manifesto time, that this run should merge itself once every HARD-GATE is green — never a standing project default.", category: 'merge-safety', tier: 'advanced' },
```

- [ ] **Step 4: Add the resolver special case**

In `resolvePolicyKeys` (same file), immediately after the existing `housekeeping-auto-merge` derived-default special case (the `if (canonical === 'housekeeping-auto-merge' && resolved.source === 'default') { ... }` block, around line 430), add:

```javascript
    // merge-authorization (#715): policy.yml is never a valid source for this
    // key — a standing project default would silently pre-authorize every
    // future run's merge with no live human decision for that run. Only an
    // explicit run-config value (a live Manifesto confirm/hybrid override
    // answer) may set it; a policy.yml value is discarded, falling back to
    // the schema default exactly as if nothing had set it at all.
    if (canonical === 'merge-authorization' && resolved.source === 'policy') {
      resolved = { value: defaultValue, source: 'default' };
    }
```

Place this check after the source-resolution loop and before the `result[requested] = resolved;` assignment, at the same nesting level as the `housekeeping-auto-merge` block it mirrors.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/resolve-policy-lib.test.js tests/policy-schema.test.js tests/policy-schema-metadata.test.js`
Expected: PASS — all five new assertions plus the pre-existing generic per-row tests (summary length, tier validity, core-tier cap) green.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/policy-schema.js tests/resolve-policy-lib.test.js
git commit -m "Register merge-authorization policy key, excluded from policy.yml (refs #715)"
```

---

### Task 2: Add the doc-side policy-schema.md row

**Files:**
- Modify: `skills/_shared/policy-schema.md`

**Interfaces:**
- Consumes: nothing new — mirrors the existing `merge-verification` row's table shape (read during planning, line ~136).
- Produces: the doc table row `/claude-tweaks:help`'s policy-mode listing and any future reader of this file rely on to describe the key.

- [ ] **Step 1: Add the table row**

In `skills/_shared/policy-schema.md`'s lever table, immediately after the `merge-verification` row, add:

```markdown
| `merge-authorization` | `config.yml` only — a live Manifesto `confirm`/`hybrid` override answer (lever 13); **never** `.claude-tweaks/policy.yml` (deliberate exclusion, see `_shared/auto-mode-contract.md`'s Bookend Architecture section) | `/claude-tweaks:flow` Manifesto (lever row); `wrap-up/review-console.md`'s Auto-merge short-circuit | `ask` | `ask`/`merge-when-green` — pre-authorizes, for this run only, that the run should merge itself once every HARD-GATE is green and the suite is proven. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-authorization`; a `policy.yml` value is silently discarded by the resolver (falls back to `ask`, `source: default`) rather than winning as it would for every other lever — the one deliberate exception to the standard 4-level precedence chain. |
```

- [ ] **Step 2: Verify the file's own conformance tests still pass**

Run: `grep -rl "policy-schema.md" tests/*.test.js` to find any test parsing this file's table structure (e.g. a row-count or column-shape pin), then run whichever match. If none match, this step is a no-op — most of this file's rows are prose-only, unpinned.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/policy-schema.md
git commit -m "Document merge-authorization in the policy-schema.md lever table (refs #715)"
```

---

### Task 3: Add the lever to the Pipeline Config Manifesto

**Files:**
- Modify: `skills/flow/manifesto.md`
- Modify: `skills/flow/manifesto-overrides.md`

**Interfaces:**
- Consumes: `merge-authorization`'s resolved envelope from Task 1 (`node bin/resolve-policy.js --run "$PIPELINE_RUN_DIR" --values merge-authorization`).
- Produces: `config.yml`'s `merge-authorization:` line, read by Task 5's review-console.md wiring.

- [ ] **Step 1: Add the lever to the canonical numbering line**

In `skills/flow/manifesto.md`'s "Canonical lever numbering" sentence (in the `#### Policy levers` section), change:

```
1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review auto-apply ceiling, 8=Tidy aggressiveness, 9=Ceremony profile, 10=Model stance, 11=Merge verification, 12=Design critique.
```

to:

```
1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review auto-apply ceiling, 8=Tidy aggressiveness, 9=Ceremony profile, 10=Model stance, 11=Merge verification, 12=Design critique, 13=Merge authorization.
```

- [ ] **Step 2: Add the lever's table row**

In the same section's illustrative Policy Levers table, immediately after the row `| 12 | Design critique | ... |`, add:

```markdown
| 13 | Merge authorization | **ask** | **ask** / merge-when-green | Pre-authorizes, for this run only, that the run should merge itself once every HARD-GATE is green and the suite is proven — zero further clicks at the terminal Review Console. Never a standing project default; see Recommendation defaults below. |
```

- [ ] **Step 3: Add the suppression rule**

In the "Determine lever suppressions" table, add a row after the `Merge verification (11)` row:

```markdown
| **Merge authorization** (13) | `/wrap-up` not in the step list (nothing left to authorize a merge for — same condition as lever 11) |
```

- [ ] **Step 4: Add the Recommendation defaults row**

In the "Recommendation defaults (when no arg and no policy)" table, add after the `Merge verification` row:

```markdown
| Merge authorization | `ask` | Safest: a human must live-answer via a Manifesto `confirm`/`hybrid` override to unlock zero-click merge — see the dedicated note below the table |
```

Immediately below that table (mirroring the existing standalone paragraph explaining `ceremony-profile`'s exception to the normal 4-source chain), add:

```markdown
`merge-authorization` (lever 13) never reads `.claude-tweaks/policy.yml` — its resolver special case
(`bin/lib/policy-schema.js`) discards a `policy.yml` value and falls back to the `ask` default as
if nothing had set it. This is deliberate: every other lever's project-policy source is a standing
default a human sets once, in the repo, on behalf of every future run. This lever specifically
authorizes an irreversible action (a merge) with zero further human interaction once the run
reaches its terminal step — collapsing that into a project-wide, no-longer-live default would
recreate the exact non-interactive auto-grant `_shared/auto-mode-contract.md`'s `auto:*` invariant
forbids. The only way to set it is a live answer: an explicit Manifesto override reply
(`confirm`/`hybrid` mode, `13=merge-when-green`) — the default `auto` mode's read-only-FYI
Manifesto never asks, so under plain `auto` this lever always resolves `ask` unless a prior step
in *this same run* already wrote `merge-when-green` into `config.yml`.
```

- [ ] **Step 5: Add the config.yml schema example line**

In the "On approval (option 1)" section's `config.yml` example block, add a new line after `design-critique: auto`:

```yaml
merge-authorization: ask
```

- [ ] **Step 6: Add the Suppressed/Valid-overrides footer update**

The example footer line (`**Suppressed (not applicable to this run):** ... **Valid overrides for this run:** 1, 2, 5, 6, 7, 9, 10, 11, 12.`) is illustrative, not literal — leave its specific numbers as-is (they describe one worked example's suppressions), but verify no other prose in this file asserts a fixed lever count (e.g. "12 levers total") that would now be stale. Search: `grep -n "12 lever\|twelve lever" skills/flow/manifesto.md` — fix any hit found.

- [ ] **Step 7: Add the override semantics entry**

In `skills/flow/manifesto-overrides.md`, add an entry for lever 13 following that file's existing per-lever entry shape (read the file first to match its exact heading/table convention used for lever 11's `merge-when-green`/`wait`/`off` options):

```markdown
| Merge authorization | `merge-when-green` | Pre-authorizes this run's own terminal merge — see `wrap-up/review-console.md`'s Auto-merge short-circuit. A live, explicit override answer; never a standing default. |
```

- [ ] **Step 8: Check the byte ceiling**

Run: `wc -c skills/flow/manifesto.md skills/flow/manifesto-overrides.md`
If either exceeds 40,960 bytes, trim adjacent prose in the same file before committing (do not defer — a later task touching a still-over-ceiling file compounds the problem).

- [ ] **Step 9: Commit**

```bash
git add skills/flow/manifesto.md skills/flow/manifesto-overrides.md
git commit -m "Add Merge authorization as Pipeline Config Manifesto lever 13 (refs #715)"
```

---

### Task 4: Update auto-mode-contract.md and autonomy-ceiling.md

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md`
- Modify: `skills/_shared/autonomy-ceiling.md`

**Interfaces:**
- Consumes: nothing new — pure documentation of Task 1-3's behavior.
- Produces: the AC-required explicit statement that both merge-offer paths preserve the interactive-human-only `auto:*` invariant (record #715 Acceptance Criteria item 4).

- [ ] **Step 1: Add the lever to the Bookend Architecture computed-levers list**

In `skills/_shared/auto-mode-contract.md`'s "Begin stop" bullet (Bookend Architecture section), change:

```
(mode, scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-auto-apply-ceiling, tidy-aggressiveness, ceremony-profile, model-stance, merge-verification, design-critique — `flow/manifesto.md`'s canonical lever numbering)
```

to:

```
(mode, scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-auto-apply-ceiling, tidy-aggressiveness, ceremony-profile, model-stance, merge-verification, design-critique, merge-authorization — `flow/manifesto.md`'s canonical lever numbering)
```

- [ ] **Step 2: Resolve the dangling #715 citation**

Find the "Terminal `## Next Actions` block" row in the "What `auto` does NOT silence" table (search: `grep -n "715's open decision" skills/_shared/auto-mode-contract.md`). Replace the parenthetical `(the surface for that offer is #715's open decision)` with the actual decision, keeping the rest of the row's sentence intact:

```
(when this run ends without merging under `integration-model: pr-first` — the terminal Review Console's own `AskUserQuestion` already covers the live-session case; this row covers the case where the run parks anyway — the recommended line is the resume command `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up`, per `flow/summary-template.md`'s Next Actions section, task-refs #715)
```

- [ ] **Step 3: Add the invariant-preservation statement**

Immediately after the "What `auto` silences" table's `PR title/description refresh before merge` and `CI wait before merge` rows (same table, add a new row directly after `CI wait before merge`), add:

```markdown
| Merge authorization lever (`integration-model: pr-first` and `local-merge` — `wrap-up/review-console.md`'s Auto-merge short-circuit) | N/A — a Manifesto-time human decision, not a mid-flow prompt | When `merge-authorization` resolves `merge-when-green` (Manifesto lever 13 — always a live answer: an explicit Manifesto `confirm`/`hybrid` override, never a `policy.yml` default, per `flow/manifesto.md`'s Recommendation defaults note), the run's terminal merge auto-resolves the same way an `auto:merge`-labeled record's does — zero further `AskUserQuestion` calls, full merge machinery reused (`_shared/pr-first-merge.md` / the short-circuit's local-merge branch), logged distinctly (`tag: manifesto-authorized`). This is the second, independent trigger for the existing Auto-merge short-circuit; content judgment (`assess-agent-autonomy` `merge-check`) still applies regardless of which trigger fired. Both this path and the standing `auto:merge` label path satisfy the same invariant: an agent never originates its own merge authorization — a human always granted it, live, either per-record (the label, via `/backlog refine`) or per-run (this lever, via a live Manifesto override). |
```

- [ ] **Step 4: Note the lever in autonomy-ceiling.md**

In `skills/_shared/autonomy-ceiling.md`, immediately after the "Bookkeeping capabilities" table (before the "### Floor rule (ledger narrowing)" subsection), add:

```markdown
### Orthogonal to the ceiling: the Manifesto's `merge-authorization` lever

`flow/manifesto.md`'s `merge-authorization` lever (#715) is **not** one of the bookkeeping
capabilities above and is **not** gated by the `autonomy` ceiling at all — it is available at
every ceiling tier, including `supervised`. The two mechanisms solve different problems:
`consoleAutoResolve` (above) is a **standing, ceiling-gated** capability that, once the project
opts into `unattended`, applies to every future run without further per-run action. This lever is
the opposite shape: **per-run, always requiring a live answer** (an explicit Manifesto
`confirm`/`hybrid` override — never a `policy.yml` default, per `flow/manifesto.md`'s
Recommendation defaults note), regardless of the project's ceiling setting. A `supervised`-ceiling
project can still pre-authorize one specific run's merge this way; an `unattended`-ceiling project
still needs `consoleAutoResolve` (or this lever) to actually skip the terminal click — raising the
ceiling alone does not, by itself, answer this lever.
```

- [ ] **Step 5: Check byte ceilings**

Run: `wc -c skills/_shared/auto-mode-contract.md skills/_shared/autonomy-ceiling.md`
Both files have needed trimming for prior additions (see `docs/incident-log.md` context read during planning) — if either exceeds 40,960 bytes, trim adjacent redundant prose in the same file before committing.

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/auto-mode-contract.md skills/_shared/autonomy-ceiling.md
git commit -m "Document merge-authorization's interactive-human-only invariant and ceiling-independence (refs #715)"
```

---

### Task 5: Wire the lever into the Auto-merge short-circuit

**`wrap-up/review-console.md` is at 40,193/40,960 bytes — 767 bytes of headroom** (measured during
planning: `wc -c skills/wrap-up/review-console.md`). The inline edit this task needs is larger than
that headroom, and this file has already been trimmed for the same ceiling before (see its own
`git log`, read during planning — e.g. `6626896c`'s "trimmed historical rationale ... to stay under
the ... ceiling"). Extract instead of inlining, mirroring the exact pattern `6626896c` already used
for `multispec-console-template.md`: a new small sub-file carries the lever-triggered delta, cited
from one short sentence in `review-console.md` itself.

**Files:**
- Create: `skills/wrap-up/manifesto-authorized-merge.md`
- Modify: `skills/wrap-up/review-console.md` (one cited sentence, not an inline rewrite)

**Interfaces:**
- Consumes: `merge-authorization`'s resolved value (Task 1/3) via `node bin/resolve-policy.js --run "$PIPELINE_RUN_DIR" --values merge-authorization`.
- Produces: a second, independent trigger condition for the existing Auto-merge short-circuit; a distinct `tag: manifesto-authorized` merge; a distinct `decisions.md` log line carrying the `[lever: merge-authorization=merge-when-green (run-config)]` attribution per `_shared/auto-decision-log.md`'s Lever attribution section.

- [ ] **Step 1: Create the sub-file**

Write `skills/wrap-up/manifesto-authorized-merge.md`:

```markdown
# Manifesto-Authorized Merge — the `merge-authorization` lever's Auto-merge short-circuit branch

Cited from `wrap-up/review-console.md`'s "Auto-merge short-circuit" section — read this file only
when that section's applicability check reaches its `merge-authorization` branch (below); the
existing `auto:merge`-label branch is unchanged and does not need this file.

## Applicability (second, independent trigger)

In addition to the existing condition (issue's live labels carry `auto:merge`), this short-circuit
also applies when this run's `config.yml` resolves `merge-authorization` to `merge-when-green`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-authorization
```

`flow/manifesto.md`'s lever 13 — always a live Manifesto `confirm`/`hybrid` override answer, never
a `.claude-tweaks/policy.yml` default (`bin/lib/policy-schema.js`'s resolver special case discards
a `policy.yml` value for this key). When this condition is true, Layer 1 (Authorization) of the
short-circuit's two-layer gate is satisfied by the lever alone — no `auto:merge` label is required.
Layer 2 (Content judgment, `assess-agent-autonomy merge-check`) is unchanged and still applies:
the lever authorizes the merge decision, not a skip of the content-judgment safety net.

## Tag selection

`_shared/pr-first-merge.md` Step 3's `{tag}`: `fast-lane` when the live `auto:merge` label is
present (the standing, pre-existing signal wins when both conditions hold); `manifesto-authorized`
when only the `merge-authorization` lever triggered this branch (no `auto:merge` label).

## Log line (lever-triggered case only)

Both the `pr-first` and `local-merge` subsections of the Auto-merge short-circuit already log an
`AUTO {time} — Fast-lane auto-merge: issue #{n}, ...` line on the `auto:merge`-label path. On the
`merge-authorization`-lever path (no `auto:merge` label present), log instead:

`AUTO {time} — Manifesto-authorized auto-merge: issue #{n}, assess-agent-autonomy verdict
auto-merge (see RATIONALE), pr-first-merge outcome {merged|armed|pending-review}. {Merge commit:
{sha}. Reversibility: high (git revert). | Reversibility: n/a (nothing merged yet).} [lever:
merge-authorization=merge-when-green (run-config)]`

Same shape, same placement, in both the `pr-first` and `local-merge` subsections — only the tag and
the trailing `[lever: ...]` attribution differ from the `auto:merge`-label path's existing line.
```

- [ ] **Step 2: Cite it from review-console.md**

In `skills/wrap-up/review-console.md`'s "Auto-merge short-circuit" section, change only the opening
sentence's condition clause — from:

```
When this run's spec has a materialized header (`record:` field present in
`${RUN_DIR}/work/*-spec.md` — see `skills/flow/materialize.md`) AND the issue's **live** labels
carry `auto:merge` (re-fetch via `gh issue view --json labels` — the header's `grants:` field is
a snapshot for audit only), check the two-layer gate below
```

to:

```
When this run's spec has a materialized header (`record:` field present in
`${RUN_DIR}/work/*-spec.md` — see `skills/flow/materialize.md`) AND EITHER the issue's **live**
labels carry `auto:merge` (re-fetch via `gh issue view --json labels` — the header's `grants:`
field is a snapshot for audit only) OR `manifesto-authorized-merge.md`'s applicability check
passes (the `merge-authorization` lever, #715), check the two-layer gate below
```

Then update the existing `1. **Authorization**` bullet from `` `auto:merge` is present on the
live-fetched labels (true by construction once this branch is reached) `` to `` `auto:merge` is
present on the live-fetched labels, OR `manifesto-authorized-merge.md`'s applicability check passed
(true by construction once this branch is reached under either condition) ``.

Finally, in both the `pr-first` and `local-merge` subsections, at the point each already names its
tag (`` `tag: fast-lane` ``) and log line, append one clause: `` — or, on the
`manifesto-authorized-merge.md` path, its own tag and log line instead ``. This is the entire diff
to this file: two sentence-level edits plus two short appended clauses, well inside the 767-byte
headroom.

- [ ] **Step 3: Verify the two-stop budget test still passes**

Run: `node --test tests/auto-mode-flow-two-stop-budget.test.js`
Expected: PASS unchanged — this task adds no new `AskUserQuestion` call in either file;
`wrap-up/review-console.md` is already wholesale-exempt in that test regardless, and the new
sub-file is not one of the test's four scanned files (it contains no `AskUserQuestion` call at all).

- [ ] **Step 4: Check both byte ceilings**

Run: `wc -c skills/wrap-up/review-console.md skills/wrap-up/manifesto-authorized-merge.md`
Confirm `review-console.md` stays under 40,960 bytes (it should — the diff there is a few hundred
bytes, well inside the measured 767-byte headroom) and the new sub-file is a normal-sized skill
sub-file (no ceiling concern for a freshly created file this small).

- [ ] **Step 5: Register the new file's edge in docs/skill-graph.md**

Per CLAUDE.md's Cross-references rule ("Every relationship between skills is stated once, in
`docs/skill-graph.md`"), add one row for the new file (single citing relationship — no
alphabetically-first ownership split needed, since only `review-console.md` cites it):

```markdown
| `wrap-up/manifesto-authorized-merge.md` | Cited from `review-console.md`'s Auto-merge short-circuit — the `merge-authorization` lever's applicability check, tag selection, and log line, kept in a separate file to stay inside `review-console.md`'s own byte ceiling headroom (#715). |
```

Insert it alphabetically among the other `wrap-up/*` / `_shared/*` rows in whichever section the
file's neighbors (`wrap-up/review-console.md`'s own existing row, `_shared/pr-first-merge.md`'s
row) already live in.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/manifesto-authorized-merge.md skills/wrap-up/review-console.md docs/skill-graph.md
git commit -m "Wire merge-authorization lever into the Auto-merge short-circuit (refs #715)"
```

---

### Task 6: Add the resume-command Next Actions row

**Files:**
- Modify: `skills/flow/summary-template.md`

**Interfaces:**
- Consumes: `integration-model` (already resolved earlier in the run) and the merge outcome (`merged`/`armed`/`pending-review` — already threaded into the Pipeline Summary's `**Release status:**` line per Task 4's dangling-citation fix).
- Produces: a new Next Actions row, rendered per that section's existing "assemble the applicable lines" convention.

- [ ] **Step 1: Add the conditional row**

In `skills/flow/summary-template.md`'s "### Next Actions" section, after the line assembling the release row (`- \`already carried by vX.Y.Z ...\` → nothing to do; omit the release row entirely.` etc.), add a new bullet describing this row's trigger and the reused template's line:

```markdown
**Resume-to-merge row.** Render only under `integration-model: pr-first`, only when this run's own
merge outcome is `armed` or `pending-review` (the run ended without a confirmed `merged` result —
whether because the Auto-merge short-circuit never triggered, its content judgment declined, or the
terminal Review Console's own merge option was answered "leave PR open" / the console was stopped).
Never render this row when the outcome is `merged` (nothing left to resume) or under `local-merge`
(no PR, no resume-to-merge shape — the branch-finish handoff already ran inline). The row:

`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up` — resume to re-offer the merge
decision, PR #{n} is ready

This is the recommended slot only when no next spec exists in this run (same precedence rule the
release row's own "Recommended slot" note above already states — resume-to-merge and the release
row never both claim `(recommended)`; resume-to-merge wins when both would otherwise apply, since a
run that hasn't merged yet has nothing to release into a version bump).
```

- [ ] **Step 2: Update the base Next Actions line list**

The section's existing worked example (the fenced `**\`/claude-tweaks:flow {next spec}\`** — ...` block) lists the base 2 + conditional lines. Add the new conditional line to that list:

```
{apply the staged staged/release-backfill-vX.Y.Z.md content} — already shipped in vX.Y.Z, backfill the CHANGELOG (when applicable)
`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up` — resume to re-offer the merge decision, PR #{n} is ready (when this run's own outcome is armed/pending-review under pr-first)
```

- [ ] **Step 3: Commit**

```bash
git add skills/flow/summary-template.md
git commit -m "Add resume-to-merge Next Actions row for a run that ends without merging (refs #715)"
```

---

### Task 7: Update help's lever enumeration

**Files:**
- Modify: `skills/help/reference-card.md`
- Modify: `skills/help/context-flow.md`

**Interfaces:**
- Consumes: nothing new — both files independently enumerate the full lever list per `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist item 4.
- Produces: `/claude-tweaks:help`'s policy/lever listing stays complete.

- [ ] **Step 1: Find and update both enumerations**

```bash
grep -n "design-critique\|merge-verification" skills/help/reference-card.md skills/help/context-flow.md
```

Add `merge-authorization` to whichever list(s) the grep surfaces, in the same position/format as the other eleven levers already listed (mirror `merge-verification`'s exact phrasing shape in each file, substituting this lever's own name/values/default).

- [ ] **Step 2: Verify with the checklist's own grep**

```bash
grep -rln "merge-authorization" skills/ | sort
```

Expected files: `bin/lib/policy-schema.js`, `skills/_shared/policy-schema.md`, `skills/flow/manifesto.md`, `skills/flow/manifesto-overrides.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/autonomy-ceiling.md`, `skills/wrap-up/review-console.md`, `skills/flow/summary-template.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`. A zero-hit expected file at this point means an earlier task's edit didn't land — go back and fix it before proceeding.

- [ ] **Step 3: Commit**

```bash
git add skills/help/reference-card.md skills/help/context-flow.md
git commit -m "Add merge-authorization to help's lever enumeration (refs #715)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Deliverable 1 (Manifesto lever) → Tasks 1-3. Deliverable 2 (auto-execute on pre-authorization) → Task 5. Deliverable 3 (terminal one-click when not pre-authorized) → already shipped by commit `6626896c` (refs #688) before this plan was written; Task 6 adds the complementary always-rendered Next Actions affordance for the case where that click didn't happen. Deliverable 4 (auto-mode-contract.md / autonomy-ceiling.md document both paths) → Task 4.
- **Placeholder scan:** none of the above steps contain `TBD`/`TODO`/unresolved markers.
- **Type consistency:** the lever's two values (`ask` / `merge-when-green`) are used identically across every task; the tag values (`fast-lane` / `auto-merge` / `manifesto-authorized`) match the existing two plus one new addition, never renamed mid-plan.
