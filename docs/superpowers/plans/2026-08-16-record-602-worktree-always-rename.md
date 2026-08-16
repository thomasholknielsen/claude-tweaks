# Rename `worktree.always` → `worktree-always` (#602) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the last dotted policy key, `worktree.always`, to `worktree-always` — through the schema's `RENAMED_KEYS` alias like the #332 renames, plus the one thing #332 could not do generically: teach the hook's bespoke literal read (`bin/lib/policy.js`) the alias, so the gate keeps enforcing for every un-migrated `policy.yml`.

**Architecture:** The resolver path is generic (rename the `POLICY_KEYS` row, add an identity alias). The hook path is not: `isWorktreeAlwaysOn()` reads `parseFlatLines(...)['worktree.always'] === 'true'` and bypasses the resolver. Task 2 gives `policy.js` one small alias-aware raw-value picker that consults `RENAMED_KEYS` (the single source of *which* old name maps) and mirrors the resolver's new-name-wins rule, so a policy file with only the old line, only the new line, or both, reads the same way in the hook and in the resolver. Everything else is prose/test sweep. #332's `PENDING_RENAMES` allowance is deleted here.

**Tech Stack:** Node 18+ (`node --test`), zero runtime deps, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T122937-spec-332-602-334/spec-602/work/602-spec.md`

## Global Constraints

- Work from the run's shared worktree — verify with `pwd` + `git rev-parse --show-toplevel` before every commit; both must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-332-602-334`.
- Commit messages: `{Verb} {what} — {detail}`, imperative, ending with `refs #602` (never `closes`/`fixes`).
- One plain Bash command per tool call (no `&&`, `;`, `|`, heredocs, redirects, `sed -i`); Edit/Write tools for file changes; `git add <paths>` and `git commit -m "..."` as separate calls.
- Never touch `docs/incident-log.md`, `docs/shipped-versions.tsv`, `docs/decisions/*.md` (ADRs are dated records — leave `0003-worktree-always-init-rollout.md` as written), `docs/superpowers/plans/*` other than this plan, or anything under `.claude-tweaks/pipelines/**`.
- The old spelling `worktree.always` must keep *parsing and enforcing* through the alias — the hook must never read an un-migrated project as policy-OFF.
- Never write `TBD` / `TODO` tokens.
- Do not run the full `npm test` inside a task; run only the named suites. The controller runs the full suite once after the last task.

## Controller ruling carried into every task — the repo's own policy.yml keeps BOTH lines

The plugin build a session runs is the *installed* one (`~/.claude/plugins/cache/.../6.86.0` today), which reads this repo's main-checkout `.claude-tweaks/policy.yml` by the literal `worktree.always` and knows no alias. If this branch replaced the line with only `worktree-always: true`, the gate would silently switch off for this repo the moment the branch merged, until the release shipping #602 is installed. So `.claude-tweaks/policy.yml` here carries **both** lines during the transition:

```yaml
worktree-always: true
worktree.always: true   # transitional twin for the installed pre-#602 plugin build (bespoke literal read, no alias) — delete once the installed build's plugin.json version >= the release that shipped #602
```

The new resolver resolves `worktree-always` from the new line (new wins, no `renamed-from`); the installed old build still enforces from the old line; `auditPolicy` will list the old line under `renamedKeys` until it is removed — that nag is the intended reminder. Task 5 writes this; the spec's Deliverable 5 wording ("becomes `worktree-always: true`") is amended by this ruling.

---

### Task 1: Schema rename + alias + conformance allowance removal (test-first)

**Files:**
- Modify: `bin/lib/policy-schema.js` (the `worktree.always` `POLICY_KEYS` row — line 15 — and `RENAMED_KEYS`, append after the #332 block)
- Modify: `tests/policy-schema.test.js` (`RENAMED_KEYS names every alias and retirement` count 14→15 + a #602 assertion; new POLICY_KEYS-shape + resolve/audit test for the pair)
- Modify: `tests/policy-key-naming.test.js` (delete `PENDING_RENAMES` and its `.filter`, delete the "PENDING_RENAMES only names keys…" test, drop the comment block that explains the allowance)
- Modify: `tests/resolve-policy-lib.test.js:38,143-146` and `tests/resolve-policy-cli.test.js` + `tests/fixtures/resolve-policy/policy-basic.yml` (fixture spelling → new; keep ONE old-spelling case that pins the alias)
- Modify: `tests/bin-lib/model-profiles/policy-fragment.test.js` (if it names the key — grep; rename to the new spelling)
- Test: the files above

**Interfaces:**
- Produces: `POLICY_KEYS` row `{ key: 'worktree-always', type: 'boolean', default: false, summary: <unchanged>, category: 'pipeline-behavior', tier: 'core' }`; `RENAMED_KEYS` entry `{ key: 'worktree.always', replacedBy: 'worktree-always', migrate: (value) => value }`. Task 2 relies on that alias entry's `key`/`replacedBy`.

- [ ] **Step 1: Extend the alias-enumeration test and add the #602 tests**

In `tests/policy-schema.test.js`: change `assert.strictEqual(RENAMED_KEYS.length, 14);` to `15` and, after the `RENAMES_332` loop inside that test, add:

```js
  // 14 -> 15, #602: worktree.always -> worktree-always — the last dotted key,
  // carved out of #332 because the hook reads it by literal (bin/lib/policy.js).
  const wt = byKey.get('worktree.always');
  assert.ok(wt, 'worktree.always missing from RENAMED_KEYS');
  assert.strictEqual(wt.replacedBy, 'worktree-always');
  assert.strictEqual(wt.migrate('true'), 'true', 'identity migrate — boolean semantics unchanged');
```

Then append two tests (after the `#332 renames: a stray old-name line…` test):

```js
test('#602: worktree-always is the POLICY_KEYS row (boolean, default false); worktree.always lives only in RENAMED_KEYS', () => {
  const byKey = new Map(POLICY_KEYS.map((k) => [k.key, k]));
  assert.ok(!byKey.has('worktree.always'), 'worktree.always must not remain in POLICY_KEYS (renamed in #602)');
  const row = byKey.get('worktree-always');
  assert.ok(row, 'worktree-always missing from POLICY_KEYS');
  assert.strictEqual(row.type, 'boolean');
  assert.strictEqual(row.default, false);
  assert.strictEqual(row.tier, 'core');
  assert.strictEqual(typeof row.summary, 'string');
});

test('#602: a worktree.always line resolves under worktree-always with renamed-from; both set -> the new line wins; the stray line audits under renamedKeys', () => {
  const oldOnly = resolvePolicyKeys(['worktree-always'], { policyRaw: 'worktree.always: true\n' });
  assert.strictEqual(oldOnly['worktree-always'].value, true);
  assert.strictEqual(oldOnly['worktree-always']['renamed-from'], 'worktree.always');
  const newOnly = resolvePolicyKeys(['worktree-always'], { policyRaw: 'worktree-always: true\n' });
  assert.strictEqual(newOnly['worktree-always'].value, true);
  assert.strictEqual(newOnly['worktree-always']['renamed-from'], undefined);
  const both = resolvePolicyKeys(['worktree-always'], { policyRaw: 'worktree-always: false\nworktree.always: true\n' });
  assert.strictEqual(both['worktree-always'].value, false, 'new key wins even when the old line says true');
  const asked = resolvePolicyKeys(['worktree.always'], { policyRaw: 'worktree.always: true\n' });
  assert.strictEqual(asked['worktree.always'].value, true, 'requesting the old name resolves the replacement (alias contract)');
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  const audit = auditPolicy(repo);
  const hit = audit.renamedKeys.find((r) => r.key === 'worktree.always');
  assert.ok(hit, 'audit lists the stray line under renamedKeys');
  assert.strictEqual(hit.replacedBy, 'worktree-always');
  assert.deepStrictEqual(audit.unrecognizedKeys, []);
});
```

- [ ] **Step 2: Remove the conformance allowance**

In `tests/policy-key-naming.test.js`: delete the `PENDING_RENAMES` constant and the comment block above it (the "Keys still awaiting their rename record…" paragraph); in the first test, remove the `.filter((key) => !PENDING_RENAMES.includes(key))` line so the offenders list is `POLICY_KEYS.map((row) => row.key).filter((key) => !KEY_NAME.test(key))`; delete the whole `test('PENDING_RENAMES only names keys that actually exist in POLICY_KEYS …')` block. The file's header comment stays. Result: three tests, no allowance, nothing left as `[]`.

- [ ] **Step 3: Update fixtures that spell the key**

- `tests/fixtures/resolve-policy/policy-basic.yml`: change `worktree.always: true # trailing comment exercises comment tolerance` → `worktree-always: true # trailing comment exercises comment tolerance`.
- `tests/resolve-policy-lib.test.js:38` (`policyRaw: 'worktree.always: true\n'` inside the autonomy test) → new spelling. `:143-146` (`boolean coercion: worktree.always: true resolves to native boolean true`) → rename title + key to `worktree-always`, AND add directly below it one old-spelling case:
  ```js
  test('boolean coercion through the #602 alias: a worktree.always line resolves worktree-always to native boolean true with renamed-from', () => {
    const result = resolvePolicyKeys(['worktree-always'], { policyRaw: 'worktree.always: true\n' });
    assert.strictEqual(result['worktree-always'].value, true);
    assert.strictEqual(result['worktree-always'].source, 'policy');
    assert.strictEqual(result['worktree-always']['renamed-from'], 'worktree.always');
  });
  ```
- `tests/resolve-policy-cli.test.js`: grep for `worktree.always`; every request/expectation of the key becomes `worktree-always` (the fixture file above now spells it that way). If a CLI test asserts the exact JSON envelope for the fixture, update the key name in the expected object.
- `tests/bin-lib/model-profiles/policy-fragment.test.js`: grep; if it writes `worktree.always` into a fixture policy as incidental content, change to `worktree-always` (behavior unchanged either way).

- [ ] **Step 4: Run to see the new assertions fail**

Run: `node --test tests/policy-schema.test.js tests/policy-key-naming.test.js`
Expected: FAIL — `RENAMED_KEYS.length` 14 ≠ 15; `worktree-always missing from POLICY_KEYS`; kebab test now fails on `worktree.always` (allowance gone).

- [ ] **Step 5: Rename the row and add the alias**

`bin/lib/policy-schema.js` line 15: `key: 'worktree.always'` → `key: 'worktree-always'` (nothing else on the row). Then, immediately before the `];` that closes `RENAMED_KEYS`, append:

```js
  // Renamed in #602 — the last dotted key, carved out of #332 because the
  // hook reads it by literal (bin/lib/policy.js isWorktreeAlwaysOn), which
  // this alias alone does not reach; policy.js consults this entry to honor
  // the old spelling. Identity migrate; boolean semantics unchanged. Removal
  // condition in skills/_shared/policy-deprecations.md.
  { key: 'worktree.always', replacedBy: 'worktree-always', migrate: (value) => value },
```

- [ ] **Step 6: Run the resolver/schema suites**

Run: `node --test tests/policy-schema.test.js tests/policy-key-naming.test.js tests/policy-schema-metadata.test.js tests/resolve-policy-lib.test.js tests/resolve-policy-cli.test.js tests/bin-lib/model-profiles/policy-fragment.test.js`
Expected: PASS. (`tests/policy.test.js` and the `hooks-*` suites still pass here because `policy.js` reads the OLD literal and every hook fixture still writes the old spelling — Task 2 changes that.)

- [ ] **Step 7: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js tests/policy-key-naming.test.js tests/resolve-policy-lib.test.js tests/resolve-policy-cli.test.js tests/fixtures/resolve-policy/policy-basic.yml tests/bin-lib/model-profiles/policy-fragment.test.js
git commit -m "Rename worktree.always → worktree-always in the schema with a RENAMED_KEYS alias — the last dotted key; #332's PENDING_RENAMES allowance deleted, refs #602"
```

---

### Task 2: Hook read path honors both names, new wins (test-first)

**Files:**
- Modify: `bin/lib/policy.js` (`isWorktreeAlwaysOn`, plus the file's header comment)
- Modify: `tests/policy.test.js` (three new cases; existing fixtures that write `worktree.always: true` for the hook reader → keep them as the *old-spelling* alias cases, add new-spelling siblings)
- Test: `tests/policy.test.js`

**Interfaces:**
- Consumes: `RENAMED_KEYS` from `./policy-schema` (Task 1's entry `{ key: 'worktree.always', replacedBy: 'worktree-always' }`).
- Produces: `isWorktreeAlwaysOn(repoRoot)` — `true` iff the alias-aware raw value of `worktree-always` is the literal `'true'`; new line wins over old; old alone still counts. Exported name unchanged. Tasks 4-5 (hooks, prose) rely on this.

- [ ] **Step 1: Write the three tests**

In `tests/policy.test.js`, next to the existing `isWorktreeAlwaysOn` tests (grep `isWorktreeAlwaysOn`), add:

```js
test('isWorktreeAlwaysOn: the new spelling worktree-always: true reads as ON', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('isWorktreeAlwaysOn: the pre-#602 spelling worktree.always: true still reads as ON through the RENAMED_KEYS alias — an un-migrated project never silently loses the gate', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('isWorktreeAlwaysOn: when both spellings are set the new line wins — worktree-always: false beats worktree.always: true (same precedence as the resolver)', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: false\nworktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
  const repo2 = tmpRepo();
  writePolicy(repo2, 'worktree.always: false\nworktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo2), true, 'order in the file does not matter — the new NAME wins, not the last line');
});
```

Use the file's own `tmpRepo`/`writePolicy` helpers (grep for their definitions; they exist — the file already writes policy fixtures).

- [ ] **Step 2: Run to see the first and third fail**

Run: `node --test tests/policy.test.js`
Expected: FAIL on the new-spelling case (reads OFF today) and the both-set case; the old-spelling case passes already.

- [ ] **Step 3: Implement the alias-aware read**

In `bin/lib/policy.js`: change the require to `const { parseFlatLines, RENAMED_KEYS } = require('./policy-schema');` and replace `isWorktreeAlwaysOn` with:

```js
// Alias-aware raw read for the hook's hot path. `parseFlatLines` returns
// whatever the file literally says, keyed by literal name; a project whose
// policy.yml predates a rename still says the OLD name. RENAMED_KEYS is the
// one place that knows which old name maps to which new one, so consult it
// here rather than hard-coding the pair. Precedence mirrors bin/resolve-policy
// (resolvePolicyKeys' uniform alias rule): the new NAME wins whenever it is
// present, in any file order; the old name contributes only when the new one
// is absent. This is a raw-string read — no type coercion — so each reader
// below still applies its own literal interpretation, exactly as before.
function rawValue(parsed, key) {
  if (Object.prototype.hasOwnProperty.call(parsed, key)) return parsed[key];
  const alias = RENAMED_KEYS.find((entry) => entry.replacedBy === key);
  if (alias && Object.prototype.hasOwnProperty.call(parsed, alias.key)) return alias.migrate(parsed[alias.key]);
  return undefined;
}

// `worktree-always: true` — anything else (absent, `false`, trailing garbage
// that isn't a `# comment`) reads as policy-OFF. Trailing `# comment` after
// the value is stripped by parseFlatLines — policy.yml is documented as
// hand-editable (skills/_shared/git-discipline.md, skills/init/SKILL.md), and
// a user who hand-writes `worktree-always: true  # enabled after the incident
// on 2026-07-10` must not have that natural annotation silently read as
// policy-OFF. The pre-#602 spelling `worktree.always` reads through rawValue's
// alias path (skills/_shared/policy-deprecations.md holds its removal condition).
function isWorktreeAlwaysOn(repoRoot) {
  return rawValue(parsePolicy(repoRoot), 'worktree-always') === 'true';
}
```

Keep `readIntegrationBranch` and `readListKey` as they are (they read keys that have no alias; do not route them through `rawValue` — YAGNI — but it is fine if you do, since `rawValue` degrades to the plain lookup for un-aliased keys; if you do, say so in the report).

Also rewrite the file's header comment (lines 1-8) — it currently says "reads flat dotted-key project policy … the only supported shape is a top-level `key.path: value` line". Reword to: "reads flat kebab-case project policy from .claude-tweaks/policy.yml (skills/_shared/policy-schema.md `## Key naming`); dotted names still parse — they are the RENAMED_KEYS aliases. No YAML dependency: the plugin ships zero runtime deps, and the only supported shape is a top-level `key: value` line. Parsing is delegated to bin/lib/policy-schema.js's parseFlatLines…" (keep the rest of the paragraph's meaning).

- [ ] **Step 4: Run to green, then the hook suites (they still write the old spelling — they must still pass, proving the alias path)**

Run: `node --test tests/policy.test.js`
Expected: PASS.
Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-session-start.test.js tests/hooks-policy-exemption.test.js tests/hooks-worktree-detect.test.js tests/hooks-dispatcher.test.js tests/teardown-gate.test.js tests/pr-early-run-lifecycle.test.js tests/sweep-backstop.test.js`
Expected: PASS — every hook fixture still writes `worktree.always: true` and the gate still enforces through the alias. This is the load-bearing evidence for the spec's "an un-migrated policy.yml never loses the gate" — quote the pass counts in the report.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/policy.js tests/policy.test.js
git commit -m "Teach the hook's policy reader the worktree.always alias — rawValue consults RENAMED_KEYS, new name wins, old spelling still enforces, refs #602"
```

---

### Task 3: Schema doc, Key-naming pending note, deprecations entry

**Files:**
- Modify: `skills/_shared/policy-schema.md` — the `| \`worktree.always\` |` table row (line ~72 in the Worktree & execution section); the heading `### \`worktree.always\` coverage — canonical` → `### \`worktree-always\` coverage — canonical` and every `worktree.always` mention inside that block's prose (the block is delimited by `<!-- gate-coverage:begin -->`/`<!-- gate-coverage:end -->` HTML comments — keep the markers byte-identical); the `## Key naming` section's `**Pending:** worktree.always …` paragraph → delete it entirely, and in the "No dots" bullet the example `(\`worktree:\` / \`  always: true\`)` stays (it is exactly the hazard being described); any other `worktree.always` mention in the file (grep) → `worktree-always`
- Modify: `skills/_shared/policy-deprecations.md` — append an eighth entry
- Test: `tests/policy-key-naming.test.js` (doc-row assertion), `tests/hooks-gate-coverage.test.js` (coverage block by markers), `tests/policy-schema-metadata.test.js`

- [ ] **Step 1: Sweep policy-schema.md**

Run `grep -n "worktree.always" skills/_shared/policy-schema.md` first and edit every hit per the Files bullet. Delete the `**Pending:**` paragraph in `## Key naming`. Do NOT touch the `<!-- gate-coverage:begin/end -->` and `<!-- teardown-gate-coverage:begin/end -->` marker lines themselves.

- [ ] **Step 2: Append the deprecations entry**

At the end of `skills/_shared/policy-deprecations.md`:

```markdown
## `worktree.always` (renamed to `worktree-always`, #602)

Now: migrates at read — identity `migrate`, boolean semantics unchanged, `renamed-from` attribution in the resolver. The hook's own reader (`bin/lib/policy.js` `isWorktreeAlwaysOn`) consults the same `RENAMED_KEYS` entry, so an un-migrated project keeps the gate: old line alone → ON; new line present → the new line decides, in any file order. `auditPolicy` reports the stray old line under `renamedKeys` with the suggested replacement. This repo's own `.claude-tweaks/policy.yml` deliberately carries both lines during the transition — see the comment on the old line there — because the *installed* plugin build reads the old literal until it is upgraded to the release that shipped #602.

Removal condition: the shared predicate above, with `{key}` = `worktree.always` — clause (a) additionally waits for the transitional twin line to be deleted from this repo's `policy.yml`, which happens once the installed build's `plugin.json` version is at or above the release that shipped #602.
```

Also update the intro sentence "(five in #331, seven in #332)" if it still exists — it should not (Task 5 of #332 replaced it with "one `##` entry per key below"); if you find any count phrase, do not add a new one.

- [ ] **Step 3: Verify and commit**

Run: `grep -c "^## " skills/_shared/policy-deprecations.md` → `13`.
Run: `node --test tests/policy-key-naming.test.js tests/hooks-gate-coverage.test.js tests/policy-schema-metadata.test.js tests/sweep-backstop.test.js`
Expected: PASS.

```bash
git add skills/_shared/policy-schema.md skills/_shared/policy-deprecations.md
git commit -m "Document worktree-always — schema row and coverage block renamed, Key-naming pending note retired, removal condition recorded with the transitional-twin clause, refs #602"
```

---

### Task 4: Hook messages, hook comments, hook tests, own policy.yml

**Files:**
- Modify: `bin/lib/hooks/pre-tool-use.js` (comments at ~53, 72-73, 91, 320, 375, 627; user-facing message strings at ~519, 521, 633 — `worktree.always` → `worktree-always`; the phrase "worktree.always coverage block" → "worktree-always coverage block")
- Modify: `bin/lib/hooks/session-start.js:166` (message `(policy: worktree.always in .claude-tweaks/policy.yml)` → `worktree-always`)
- Modify: `bin/lib/hooks/worktree-detect.js:103` (comment)
- Modify: `tests/hooks-pre-tool-use.test.js`, `tests/hooks-session-start.test.js`, `tests/hooks-policy-exemption.test.js`, `tests/hooks-worktree-detect.test.js`, `tests/hooks-dispatcher.test.js`, `tests/teardown-gate.test.js`, `tests/pr-early-run-lifecycle.test.js`, `tests/sweep-backstop.test.js`, `tests/hooks-gate-coverage.test.js` — every fixture line `worktree.always: true` → `worktree-always: true`, EXCEPT: keep exactly ONE old-spelling gate test in `tests/hooks-pre-tool-use.test.js` (add it if none is a natural candidate): a project whose policy.yml says only `worktree.always: true` still gets a covered edit denied outside a worktree — title it so the alias intent is obvious (e.g. `…denies under the pre-#602 spelling worktree.always: true — the alias keeps un-migrated projects gated`). Any test asserting the message text (`policy: worktree.always in`) → new text.
- Modify: `.claude-tweaks/policy.yml` (this repo) — per the controller ruling above: first line becomes `worktree-always: true`, and the old line stays immediately below it with the transitional comment, verbatim from the ruling block.
- Test: the hook suites above

- [ ] **Step 1: Sweep bin/lib/hooks**

Grep `worktree.always` in `bin/lib/hooks/*.js` and replace every hit (comments and message strings) with `worktree-always`; where prose says "the worktree.always gate", it becomes "the worktree-always gate".

- [ ] **Step 2: Sweep the hook tests (keeping the one old-spelling case)**

For each listed test file: replace fixture spellings and expected message text. In `tests/hooks-pre-tool-use.test.js`, ensure one test writes ONLY `worktree.always: true` and asserts a deny outside a worktree (adapt the shape of a neighbouring deny test). Grep afterwards: `grep -n "worktree.always" tests/hooks-*.test.js tests/teardown-gate.test.js tests/pr-early-run-lifecycle.test.js tests/sweep-backstop.test.js` → the only hits are inside that one alias test (and its title).

- [ ] **Step 3: Update this repo's policy.yml**

Edit `.claude-tweaks/policy.yml`: replace the line `worktree.always: true` with the two-line block from the controller ruling (new line first, old line second with its comment). All other lines untouched.

- [ ] **Step 4: Run the hook suites and commit**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-session-start.test.js tests/hooks-policy-exemption.test.js tests/hooks-worktree-detect.test.js tests/hooks-dispatcher.test.js tests/teardown-gate.test.js tests/pr-early-run-lifecycle.test.js tests/sweep-backstop.test.js tests/hooks-gate-coverage.test.js tests/policy.test.js`
Expected: PASS.
Run: `node bin/resolve-policy.js worktree-always` (from the worktree root — reads the worktree's own policy.yml)
Expected: `{"worktree-always":{"value":true,"source":"policy"}}` — no `renamed-from`, because the new line is present.

```bash
git add bin/lib/hooks/pre-tool-use.js bin/lib/hooks/session-start.js bin/lib/hooks/worktree-detect.js tests/hooks-pre-tool-use.test.js tests/hooks-session-start.test.js tests/hooks-policy-exemption.test.js tests/hooks-worktree-detect.test.js tests/hooks-dispatcher.test.js tests/teardown-gate.test.js tests/pr-early-run-lifecycle.test.js tests/sweep-backstop.test.js tests/hooks-gate-coverage.test.js .claude-tweaks/policy.yml
git commit -m "Sweep the hooks and their tests onto worktree-always — messages, comments, fixtures (one pre-#602 alias case kept), and this repo's policy.yml carries both lines through the installed-build transition, refs #602"
```

---

### Task 5: Prose sweep — every remaining live citation

**Files:**
- Modify (derived at plan time — re-derive with the grep in Step 1; the grep is the truth): `README.md`, `docs/donts.md`, `docs/hooks.md`, `docs/journeys/resolve-a-policy-key.md`, `docs/journeys/review-project-policy.md`, `docs/plugin-structure.md`, `docs/skill-authoring.md`, `docs/skill-graph.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/console-execution.md`, `skills/_shared/dev-url-detection.md`, `skills/_shared/git-discipline.md`, `skills/_shared/github-pr-scan.md`, `skills/_shared/integration-branch.md`, `skills/_shared/integration-model.md`, `skills/_shared/pipeline-run-dir.md`, `skills/_shared/pr-early-run-lifecycle.md`, `skills/_shared/scratch-worktree.md`, `skills/build/SKILL.md`, `skills/build/build-options.md`, `skills/build/worktree-setup.md`, `skills/dispatch/SKILL.md`, `skills/dispatch/settle-and-merge.md`, `skills/flow/SKILL.md`, `skills/flow/manifesto.md`, `skills/flow/materialize.md`, `skills/flow/multispec-review-console.md`, `skills/flow/worktree-merge.md`, `skills/help/policy.md`, `skills/init/SKILL.md`, `skills/init/bootstrap-steps.md`, `skills/init/bootstrap/step-05-verify-git.md`, `skills/init/bootstrap/step-06-worktree-configuration.md`, `skills/init/bootstrap/version-check.md`, `skills/init/input-grammar.md`, `skills/init/isolated-write-step.md`, `skills/init/phase-3-classification.md`, `skills/init/scope-selection-gate.md`, `skills/init/summary-templates.md`, `skills/init/worktree-policy-finalization.md`, `skills/reflect/full-mode.md`, `skills/routine/create-and-update.md`, `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/wrap-up/console-template.md`, `skills/wrap-up/review-console.md`
- Tombstones (do NOT edit): `bin/lib/policy-schema.js` alias entry, `bin/lib/policy.js` alias comment, `skills/_shared/policy-deprecations.md`, the alias tests/fixtures kept in Tasks 1/2/4, `docs/incident-log.md`, `docs/shipped-versions.tsv`, `docs/decisions/0003-worktree-always-init-rollout.md` (dated ADR), `docs/plans/*-ledger.md`, `docs/superpowers/plans/**`, `.claude-tweaks/**`.

- [ ] **Step 1: Derive the live list**

Run: `node -e 'const {execSync}=require("child_process");let out="";try{out=execSync("grep -rlF -- worktree.always skills bin tests docs README.md CLAUDE.md agents hooks 2>/dev/null").toString();}catch(e){out=e.stdout?e.stdout.toString():"";}const files=out.split("\n").filter(Boolean).filter(f=>!/docs\/incident-log\.md|docs\/shipped-versions\.tsv|docs\/superpowers\/plans\/|docs\/decisions\/|docs\/plans\//.test(f)).sort();console.log(files.length);console.log(files.join("\n"));'`

- [ ] **Step 2: Sweep**

For every non-tombstone file: `worktree.always` → `worktree-always` everywhere it names the policy key. `skills/init/**` are WRITERS — the `policy.yml` templates init emits (`worktree-policy-finalization.md`, `isolated-write-step.md`, `bootstrap/step-06-worktree-configuration.md`, `bootstrap-steps.md`) must now write `worktree-always: true` (`[IL-97]`). Prose that names the gate ("the worktree.always gate", "worktree.always projects", "policy: worktree.always") follows the same rename. Where a doc quotes the SessionStart/PreToolUse message text, match Task 4's new wording. Judgment calls (history prose like "was `worktree.always` before #602") — leave and list in the report.

- [ ] **Step 3: Negative control**

Re-run the Step 1 command. Expected: only the tombstones remain: `bin/lib/policy-schema.js`, `bin/lib/policy.js`, `skills/_shared/policy-deprecations.md`, `skills/_shared/policy-schema.md` (only inside `## Key naming`'s nested-YAML example, if you kept `worktree:`/`always:` — that is not the dotted key; verify no other hit), `tests/policy-schema.test.js`, `tests/policy.test.js`, `tests/resolve-policy-lib.test.js` (the one alias case), `tests/hooks-pre-tool-use.test.js` (the one alias case), `.claude-tweaks/policy.yml` (the transitional twin), and the excluded history paths.

- [ ] **Step 4: Run the prose-pinning suites**

Run: `node --test tests/sweep-backstop.test.js tests/hooks-gate-coverage.test.js tests/policy-key-naming.test.js tests/policy-schema-metadata.test.js tests/teardown-gate.test.js`
Then `ls tests/*.test.js | grep -i "flow\|dispatch\|init\|help\|conform\|tidy\|wrap-up\|build\|manifesto"` and run any suite whose name matches a swept skill.
Expected: PASS.

- [ ] **Step 5: Commit**

Run `git status --short` and confirm every path is one you edited. Then:

```bash
git add -A skills docs README.md
git commit -m "Sweep live prose onto worktree-always — hook gate wording, init policy writers, flow/dispatch/tidy/wrap-up citations, docs, refs #602"
```

---

## Self-review notes

- Spec coverage: Deliverable 1 → Task 1; 2 → Task 2 (RENAMED_KEYS-consulting `rawValue`, new-name-wins, one place decides *which* alias; precedence mirrored with a comment); 3 → Task 1 Step 2; 4 → Tasks 3-5 (policy-schema.md coverage block, session-start message, policy.js header, fixture + alias tests, init writers); 5 → Task 4 Step 3 **as amended by the controller ruling** (both lines, transitional comment) — the spec text "line becomes `worktree-always: true`" is corrected at architecture alignment; 6 → Task 3 (`auditPolicy` generic; `skills/help/policy.md` and `skills/init/**` swept in Task 5).
- Acceptance criteria: resolver defaults/unknown-key → the spec's "`--values worktree.always` returns unknown-key" is the same misstatement #332 corrected — an alias's old name resolves the replacement (pinned by `tests/resolve-policy-lib.test.js`); Task 1's test asserts the real contract, and the controller amends the spec AC. Three hook cases → Task 2 Step 1 (both `policy.test.js` hook-reader cases and `resolve-policy-lib.test.js` resolver cases). Old-spelling gate deny → Task 4 Step 2's kept case + Task 2 Step 4's evidence run. Gate-coverage binding → Task 3 (markers untouched). `PENDING_RENAMES` gone → Task 1 Step 2. Grep negative control → Task 5 Step 3. `.claude-tweaks/policy.yml` reads `worktree-always: true` → Task 4 Step 3 (plus the transitional twin). SessionStart names `worktree-always` → Task 4 Step 1. `npm test` → controller after Task 5.
