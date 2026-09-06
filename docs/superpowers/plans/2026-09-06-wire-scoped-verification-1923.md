# Wire Scoped Verification Into the Pipeline (#1923) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every in-pipeline re-verification site runs `verify.js --scope` against the last full pass; `/claude-tweaks:test affected` and the QA story `affected` filter read one shared changed-file set via a new read-only `verify.js --changed-files` mode; multi-spec bookkeeping deltas resolve to `none` with a logged `still-verified: bookkeeping-only delta` line. Behavior-neutral on a project with no declaration.

**Architecture:** One new read-only runner mode (`--changed-files`, composed from #1922's `changed-files.js` + `stamp.js` — no new git logic) plus prose: `test/verification.md` owns the scoping table every site cites; `test/SKILL.md` redefines `affected` and adds the QA story filter to the pipeline branch; `flow/steps-and-gates.md`, `review/code-mode-steps.md`, `flow/multi-spec.md`, and `docs/skill-graph.md` each state their edge once. A new prose-pin conformance test and a CLI test pin the contract.

**Tech Stack:** Node 18+ built-ins; `node --test`; markdown skill prose under the 40 KB ceiling.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1923/work/1923-spec.md` (materialized from GitHub issue #1923)

## Global Constraints

- The runner never reads `policy.yml` or CLAUDE.md; `--changed-files` reuses `resolveBase`/`usableAnchor`/`changedFiles` from `plugin/bin/lib/verify/changed-files.js` unchanged.
- `--changed-files` exits **1** (not 2) with a stderr message when no base resolves — the spec's AC2 wording; never an empty list.
- Every relationship is stated once: the scoping table lives in `verification.md`; every other site cites it in one sentence/paragraph and never restates the rows.
- `review/code-mode-steps.md` is 33,952 bytes: add exactly one sentence. `flow/steps-and-gates.md` (26,075) and `flow/multi-spec.md` (20,291) get one short paragraph each. `test/SKILL.md` (17,086) and `test/verification.md` (13,711) have room.
- `flow/multi-spec.md` must contain the literal `still-verified: bookkeeping-only delta` exactly once (AC6).
- `test/SKILL.md` must no longer contain `uncommitted changes (uses git diff)` and must mention `--changed-files` at least twice (AC3); its Pipeline behavior list must contain the literal `QA: skipped — no affected stories` (AC4).
- Skill references inside instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- `skip-qa` stays reserved for the polish re-verify gate; the QA story filter is a selection rule inside the existing auto-run branch, not a new `skip-qa` variant.
- Commits use `refs #1923` (plus `refs #1801` / `refs #1836` where the change is that issue's fix) — never `closes`/`fixes` — and end with the trailer `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`.
- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony`, branch `worktree-design-1904-pipeline-ceremony`; anchor every git/test command with `git -C "<worktree>"` or an absolute path. Every CLI test runs in a fresh temp repo, never this checkout.

---

### Task 1: `verify.js --changed-files` read-only mode

**Files:**
- Modify: `plugin/bin/lib/verify/args.js` (new boolean flag `--changed-files`; `USAGE`; combination rules)
- Modify: `plugin/bin/verify.js` (new `changedFilesMode(parsed)` dispatched right after the `--stamp-status` branch)
- Modify: `docs/plugin-structure.md` (line 125 verify CLI row)
- Test: `tests/bin-lib/verify/args.test.js`, `tests/bin-lib/verify/cli.test.js`

**Interfaces:**
- Produces: `parseArgs` returns `changedFiles: boolean`. Rules: `--changed-files` takes no `--cmd` and no `--scope`, may not combine with `--stamp-status`; `--base`/`--integration-branch` are allowed with it (they already require `--scope` today — widen that guard to "require `--scope` or `--changed-files`"); `--git-dir` is accepted (it redirects nothing here and is ignored for the anchor, same rule as `--scope`).
- Produces: `node verify.js --changed-files [--base <ref>] [--integration-branch <name>]` prints one JSON line `{"base": "<sha>", "files": [...]}` and exits 0; when `resolveBase` throws `ChangedFilesError`, prints `--changed-files: {message}` to stderr and exits 1. The prior stamp is read from the checkout's own git dir (`resolveGitDir()`), exactly as the `--scope` block does; `usableAnchor` decides whether the stamp anchors the base.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/verify/args.test.js`:

```js
test('--changed-files is a read-only mode: no --cmd, no --scope, not with --stamp-status; --base/--integration-branch allowed (#1923)', () => {
  const p = parseArgs(['--changed-files', '--integration-branch', 'main']);
  assert.strictEqual(p.changedFiles, true);
  assert.strictEqual(p.integrationBranch, 'main');
  assert.deepStrictEqual(p.cmds, []);
  assert.strictEqual(parseArgs(['--cmd', 'tests=x']).changedFiles, false);
  assert.throws(() => parseArgs(['--changed-files', '--cmd', 'tests=x']), UsageError);
  assert.throws(() => parseArgs(['--changed-files', '--scope', 's.json']), UsageError);
  assert.throws(() => parseArgs(['--changed-files', '--stamp-status']), UsageError);
  assert.ok(USAGE.includes('--changed-files'));
});
```

Also widen the pre-existing exact-shape `deepStrictEqual` assertion on `parseArgs`'s return with `changedFiles: false`.

Append to `tests/bin-lib/verify/cli.test.js` (reuse `tmpGitRepo`, `runCli`, `commitFile`, `stampOf`):

```js
test('--changed-files prints {base, files} = committed-since-anchor ∪ working tree, anchored on the stamp fullSha (#1923 AC2)', async () => {
  const r = tmpGitRepo();
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const full = await runCli(['--cmd', 'tests=node -e 0'], { cwd: r.repo });
  assert.strictEqual(full.code, 0, full.stderr);
  const anchor = stampOf(r.gitDir).fullSha;
  commitFile(r, 'src/a.js', '1');
  fs.writeFileSync(path.join(r.repo, 'notes.txt'), 'uncommitted');
  const run = await runCli(['--changed-files', '--integration-branch', branch], { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  const out = JSON.parse(run.stdout.trim());
  assert.strictEqual(out.base, anchor);
  assert.deepStrictEqual(out.files, ['notes.txt', 'src/a.js']);
});

test('--changed-files with no stamp and no resolvable integration branch exits 1 with a message — never an empty list (#1923 AC2)', async () => {
  const r = tmpGitRepo();
  const run = await runCli(['--changed-files'], { cwd: r.repo });
  assert.strictEqual(run.code, 1);
  assert.match(run.stderr, /could not resolve a base/);
  assert.strictEqual(run.stdout.trim(), '');
});

test('--changed-files honors --base and never writes a stamp or report (#1923)', async () => {
  const r = tmpGitRepo();
  const first = r.git('rev-parse', 'HEAD').trim();
  commitFile(r, 'docs/a.md', 'x');
  const run = await runCli(['--changed-files', '--base', first], { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.deepStrictEqual(JSON.parse(run.stdout.trim()), { base: first, files: ['docs/a.md'] });
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json')));
});
```

- [ ] **Step 2: Run the probe to verify it fails**

Run: `node -e "const a=require('/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/verify/args.js'); a.parseArgs(['--changed-files'])"`
Expected: FAIL — throws `UsageError: unknown flag: --changed-files`.

- [ ] **Step 3: Implement**

`args.js`: add `let changedFiles = false;` and `if (flag === '--changed-files') { changedFiles = true; continue; }`; guards (replace the existing `--scope`-only ones where they overlap):
```js
if (cmds.length === 0 && !stampStatus && !changedFiles) throw new UsageError('at least one --cmd <name>=<command> is required');
if (stampStatus && cmds.length) throw new UsageError('--stamp-status takes no --cmd');
if (changedFiles && cmds.length) throw new UsageError('--changed-files takes no --cmd');
if (changedFiles && scope !== null) throw new UsageError('--changed-files takes no --scope');
if (changedFiles && stampStatus) throw new UsageError('--changed-files and --stamp-status are separate modes');
if (!scope && !changedFiles && (base !== null || integrationBranch !== null)) throw new UsageError('--base and --integration-branch require --scope or --changed-files');
```
(keep the existing `--stamp-status` + `--scope/--base/--integration-branch` guard). Return `changedFiles` in the object. `USAGE`: append a third form ` | verify.js --changed-files [--base <ref>] [--integration-branch <name>]`.

`verify.js`: after `if (parsed.stampStatus) { stampStatus(parsed); return; }` add `if (parsed.changedFiles) { changedFilesMode(parsed); return; }` and:
```js
// --changed-files (#1923): the read-only "what changed in this run" set the
// skills consume — /claude-tweaks:test affected and the QA story filter read
// this instead of hand-rolling `git diff --name-only` (empty for every
// committed pipeline diff). Same base resolution as --scope: the checkout's
// own stamp anchor when usable, else --base / --integration-branch; an
// unresolvable base is exit 1 with a message, never an empty list.
function changedFilesMode(parsed) {
  const ownGitDir = resolveGitDir();
  const priorStamp = ownGitDir ? readVerifyStamp(ownGitDir) : null;
  let base;
  try {
    base = resolveBase({ stamp: priorStamp, integrationBranch: parsed.integrationBranch, base: parsed.base });
  } catch (err) {
    if (!(err instanceof ChangedFilesError)) throw err;
    process.stderr.write(`--changed-files: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const { files } = changedFiles({ base });
  process.stdout.write(`${JSON.stringify({ base, files })}\n`);
  process.exitCode = 0;
}
```

`docs/plugin-structure.md` line 125: add `| --changed-files [--base <ref>] [--integration-branch <name>]` to the flag list and append `; --changed-files prints {base, files} (committed changes since the stamp anchor or the given base ∪ the working tree, untracked included) and exits 0, or exits 1 with a message when no base resolves — the one changed-file set /claude-tweaks:test affected and the QA story filter read (#1923)`. Keep the row one line.

- [ ] **Step 4: Run the suites**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/args.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/cli.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/args.js plugin/bin/verify.js docs/plugin-structure.md tests/bin-lib/verify/args.test.js tests/bin-lib/verify/cli.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "verify.js --changed-files: the one read-only changed-file set for /test affected and the QA story filter (refs #1923, refs #1836)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 2: `verification.md` — the scoping table, the scoped invocation, and the report lines

**Files:**
- Modify: `plugin/skills/test/verification.md` (Skip-if-recent section at lines 40-55; Step 3 report at lines 89-104)

- [ ] **Step 1: Edit Skip-if-recent**

Replace the sentence in the `--stamp-status` paragraph that begins `Any other state — absent, mismatched, dirty, non-\`full\` scope — → run the full procedure below and note why` (through its closing parenthesis) with:

`Any other state → consult the scoping table below: with a declaration and a usable anchor the re-verify sites run scoped; otherwise run the full procedure and note why (\`Verification re-run — runner stamp {absent | {sha} ≠ HEAD {head} | dirty tree | scope {scope}}\`).`

Then, after the existing `**Note:** Skipping verification does not skip QA…` paragraph, insert this new sub-section:

```markdown
### Re-verify scoping (#1923)

The runner owns execution and scope (`verify.js --scope`, #1922); this table owns *when* a site asks for scope. Every site below cites this table — none restates it.

| Site | Mode |
|------|------|
| Build Common Step 5 (`/claude-tweaks:build`) | always full |
| Second call's auto-inserted `test` (`/claude-tweaks:flow`) | scoped against `fullSha` |
| Polish re-verify (`/claude-tweaks:test skip-qa`, `/claude-tweaks:flow`) | scoped |
| Review-fix re-verify (`/claude-tweaks:review` Step 3 Routing) | scoped |
| Multi-spec spec-N `test` step (`/claude-tweaks:flow` multi-spec) | scoped (`none` on a bookkeeping-only delta) |
| Standalone `/claude-tweaks:test` | full |
| `/claude-tweaks:test affected` | the shared changed-file set (`verify.js --changed-files`) |

**Scoped invocation.** A "scoped" site runs Step 2's command with the declaration and the integration branch added — one plain command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --scope .claude-tweaks/verify-scope.json --integration-branch {ref} --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

`{ref}` resolves via `_shared/integration-branch.md`'s ladder (the runner has no `origin/HEAD` fallback and exits 2 without it when no usable stamp anchor exists). The `--cmd` set is the same full set Step 1 resolved — pass every declared suite (`--cmd api=…`, `--cmd web=…` when the declaration maps suites); the runner filters it to what the selected mode needs and refuses a set missing a required check (exit 2 naming it). No declaration file → the runner reports `Scope: full — no declaration at …` and the run is today's full run; a stamp whose anchor is no longer an ancestor of HEAD (rebase, force-push) → the runner forces `full` — the same fail-closed posture unmatched paths get. A scoped stamp never satisfies Skip-if-recent or `/claude-tweaks:review` Step 1.5 (`--stamp-status` matches only `scope: full`) — that is by design: the cheap re-run is the scoped run itself.

**Standalone is always full.** Any invocation without `$PIPELINE_RUN_DIR` *or* without `--source` is standalone — a human asked for the suite and gets the suite; never pass `--scope` there.

**Report and log.** Step 3 renders the runner's `Scope:` line, and any `still-verified: bookkeeping-only delta (…)` / `still-verified: no changes since …` line, verbatim above the results table, and logs one `AUTO` decision per `_shared/auto-decision-log.md`: `AUTO {time} — Verification scoped: {mode} — {n} changed file(s) since {base-short}: {path → rule, …}; suites: {list|none}. Reversibility: high.` (the `{path → rule}` pairs come from `report.json`'s `scope` object: `changedFiles` against the declaration's rule order, `unmatched` paths as `→ unmatched (fail-closed)`).
```

- [ ] **Step 2: Edit Step 3's report**

In the `## Step 3: Report` section, immediately before the fenced `## Verification Results` template, add one sentence: `Under a scoped run (the table above), render the runner's \`Scope:\` line — and any \`still-verified:\` line — verbatim as the first line(s) above this table.`

- [ ] **Step 3: Verify**

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/verification.md"` — Expected: under 20000.

Run: `grep -n "Re-verify scoping\|Standalone is always full\|scoped (\`none\` on a bookkeeping-only delta)" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/verification.md"` — Expected: three hits.

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/snippet-conformance.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/skill-invocation.test.js"` — Expected: PASS (fully-qualified skill refs; the Step 2 snippet still conforms).

- [ ] **Step 4: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/skills/test/verification.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "verification.md: re-verify scoping table, scoped invocation, standalone-full rule, Scope: line in the report (refs #1923)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 3: `test/SKILL.md` — `affected` on the shared changed-file set; QA story filter in the pipeline branch

**Files:**
- Modify: `plugin/skills/test/SKILL.md`

- [ ] **Step 1: Edit the argument table** (lines 41 and 46)

Row `affected` → `| \`affected\` | Run tests affected by this run's changed-file set — \`verify.js --changed-files\` (committed changes since the last full pass ∪ the working tree; see \`verification.md\`'s scoping table) |`

Row `qa affected` → `| \`qa affected\` | QA — run only stories whose \`source_files\` overlap the same \`--changed-files\` set |`

- [ ] **Step 2: Edit the Step 1 `affected` bullet** (line 91)

`- **\`affected\`** — read the changed-file set with one plain command, \`node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --changed-files --integration-branch {ref}\` (\`{ref}\` via \`_shared/integration-branch.md\`; in a pipeline the base is the stamp's \`fullSha\`, else the integration-branch merge-base; standalone with no stamp, the working tree alone), then scope tests to those files and their dependents. Never hand-roll \`git diff --name-only\` — it is empty for every committed pipeline diff.`

- [ ] **Step 3: Edit the Pipeline behavior list** (lines 71-76)

Replace the second bullet (`VERIFICATION_PASSED=true` + stories exist → …) with:

`- \`VERIFICATION_PASSED=true\` (or a matching runner stamp) + stories exist → skip verification, then **select stories by \`source_files\` ∩ the changed-file set** (\`verify.js --changed-files\`, exact repo-relative path match; a story with no \`source_files\` field is always included): one or more matches → run only those; zero matches on a non-frontend surface (materialized \`surface:\` not \`web\`/\`mobile\`/\`desktop\`, or zero UI trigger files per \`design-wrapper/frontend-detection.md\` Layers 2/3) → report \`QA: skipped — no affected stories ({n} stories considered, {m} changed files)\`, set \`TEST_PASSED=true\`, and log \`AUTO {time} — QA scoped: 0/{n} stories affected by {m} changed file(s); skipped — non-frontend surface. Reversibility: high.\`; zero matches on a frontend surface → run the full story set (a new UI story may not carry \`source_files\` yet — never skip QA there, #808). Every selection logs \`AUTO {time} — QA scoped: {k}/{n} stories affected by {m} changed file(s). Reversibility: high.\` The Design CLI gate (Step 1.5) still runs on a skip.`

- [ ] **Step 4: Edit "Affected filtering (`qa affected`)"** (lines 108-118)

Replace item 1 with: `1. Read the changed-file set: \`node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --changed-files --integration-branch {ref}\` — the same \`{base, files}\` the \`affected\` argument and the pipeline story filter read, so the three never disagree.` Replace the intro sentence's `overlap with uncommitted changes` with `overlap with the changed-file set`. Leave items 2-5 and the stop message `"No QA stories affected by current changes."` unchanged.

- [ ] **Step 5: Verify**

Run: `grep -n 'uncommitted changes (uses git diff)' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/SKILL.md"` — Expected: no output.

Run: `grep -c -- '--changed-files' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/SKILL.md"` — Expected: 4 or more.

Run: `grep -n 'QA: skipped — no affected stories' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/SKILL.md"` — Expected: one line.

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/SKILL.md"` — Expected: under 20000.

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/skill-invocation.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/skill-audit/context-cost.test.js"` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/skills/test/SKILL.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "test/SKILL.md: affected and qa affected read verify.js --changed-files; pipeline QA selects stories by source_files overlap with an explicit non-frontend skip (refs #1923, refs #1836)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 4: One-sentence citations at every other site

**Files:**
- Modify: `plugin/skills/flow/steps-and-gates.md` (line 20 polish/re-verify sentence; a new paragraph after the "Polish bundled with re-verify" paragraph at line 118)
- Modify: `plugin/skills/review/code-mode-steps.md` (the `### Step 3 Routing — Code Review Findings` paragraph, line 231)
- Modify: `plugin/skills/flow/multi-spec.md` (a new paragraph after `Run each spec's full pipeline in order …` at line 124)
- Modify: `docs/skill-graph.md` (`## test` rows for `/flow` (line 492) and `/review` (line 496))

- [ ] **Step 1: Edits**

`steps-and-gates.md` line 20: append to the sentence ending `(\`/test skip-qa\`, one-cycle cap).` the clause ` — scoped per \`test/verification.md\`'s re-verify scoping table`. After the "Polish bundled with re-verify" paragraph add:

`**Re-verify scoping:** every in-pipeline re-verify — the auto-inserted \`test\`, the polish re-verify, the review-fix re-verify, and a multi-spec spec-N \`test\` step — runs scoped against the last full pass per \`test/verification.md\`'s "Re-verify scoping" table (build Common Step 5 stays full; standalone \`/claude-tweaks:test\` stays full). \`/flow\` states this once here and does not restate the rule.`

`code-mode-steps.md` line 231: append one sentence to the paragraph: ` The fix-now re-verify runs scoped per \`test/verification.md\`'s "Re-verify scoping" table (review-fix row).`

`multi-spec.md`: after the line `Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). …` add:

`**Spec-N verification scopes against the batch's last full pass** (\`test/verification.md\`'s re-verify scoping table, #1923): spec N's auto-inserted \`test\` step runs \`verify.js --scope\` anchored on the stamp's \`fullSha\`, so a delta consisting only of bookkeeping — the ledger rows spec N-1's wrap-up committed to \`docs/plans/*-ledger.md\`, or \`work/*-spec.md\` — resolves to \`none\` and is logged \`still-verified: bookkeeping-only delta ({paths})\` with no suite spawned. This is #1801's resolution; the ledger stays in the tree (moving it out was rejected in the parent's Decision Rationale). A project without a declaration sees today's full run.`

`docs/skill-graph.md` line 492 (`/flow` row under `## test`): append ` Every in-pipeline re-verify (the auto-inserted \`test\`, the polish re-verify, a multi-spec spec-N \`test\` step) runs scoped per \`test/verification.md\`'s re-verify scoping table (#1923).` Line 496 (`/review` row): append ` The review-fix re-verify (Step 3 Routing) is a scoped site in that same table.`

- [ ] **Step 2: Verify**

Run: `grep -c 'still-verified: bookkeeping-only delta' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/flow/multi-spec.md"` — Expected: `1`.

Run: `grep -n 'Re-verify scoping' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/flow/steps-and-gates.md" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/review/code-mode-steps.md"` — Expected: at least one hit per file.

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/review/code-mode-steps.md" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/flow/steps-and-gates.md" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/flow/multi-spec.md"` — Expected: each under 40960 (code-mode-steps under 34300).

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/skill-graph-table-structure.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/skill-invocation.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/skill-audit/context-cost.test.js"` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/skills/flow/steps-and-gates.md plugin/skills/review/code-mode-steps.md plugin/skills/flow/multi-spec.md docs/skill-graph.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Cite the re-verify scoping table from /flow, /review Step 3 Routing, multi-spec spec-N test, and the skill graph (refs #1923, refs #1801)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 5: Conformance pins and the #1801-shape CLI repro

**Files:**
- Create: `tests/test-skill-affected-conformance.test.js`
- Test: `tests/bin-lib/verify/cli.test.js` (AC5 repro)

- [ ] **Step 1: Write the conformance test**

```js
// tests/test-skill-affected-conformance.test.js
//
// Pins #1923's re-verify scoping contract in the prose that states it: the
// scoping table in test/verification.md (every site row named), the
// --changed-files redefinition of `affected` in test/SKILL.md, the QA skip
// literal, and multi-spec's single bookkeeping-only-delta statement. Reads
// live prose deliberately — the enumeration IS the declared contract whose
// update is the intended action (same house pattern as
// tests/manifesto-lever-conformance.test.js); do not generalize.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('test/SKILL.md redefines `affected` onto verify.js --changed-files and drops the git-diff wording (#1923 AC3)', () => {
  const skill = read('plugin/skills/test/SKILL.md');
  assert.ok(!skill.includes('uncommitted changes (uses git diff)'));
  const hits = skill.split('--changed-files').length - 1;
  assert.ok(hits >= 2, `expected --changed-files at least twice, got ${hits}`);
});

test('test/SKILL.md pipeline behavior carries the QA skip literal and the frontend-surface exception (#1923 AC4)', () => {
  const skill = read('plugin/skills/test/SKILL.md');
  const list = skill.slice(skill.indexOf('**Pipeline behavior:**'), skill.indexOf('## Step 1: Resolve Scope and Execute'));
  assert.ok(list.includes('QA: skipped — no affected stories'));
  assert.match(list, /zero matches on a frontend surface → run the full story set/);
});

test('verification.md holds the re-verify scoping table with every site row (#1923 AC1)', () => {
  const v = read('plugin/skills/test/verification.md');
  const table = v.slice(v.indexOf('### Re-verify scoping'));
  for (const row of [
    ['Build Common Step 5', 'always full'],
    ["auto-inserted `test`", 'scoped against `fullSha`'],
    ['Polish re-verify', 'scoped'],
    ['Review-fix re-verify', 'scoped'],
    ['Multi-spec spec-N `test` step', 'scoped (`none` on a bookkeeping-only delta)'],
    ['Standalone `/claude-tweaks:test`', 'full'],
    ['`/claude-tweaks:test affected`', 'the shared changed-file set'],
  ]) {
    const line = table.split('\n').find((l) => l.startsWith('|') && l.includes(row[0]));
    assert.ok(line, `missing table row for ${row[0]}`);
    assert.ok(line.includes(row[1]), `row ${row[0]} must state mode ${row[1]}: ${line}`);
  }
  assert.ok(table.includes('Standalone is always full'));
});

test('flow/multi-spec.md states the bookkeeping-only delta exactly once; steps-and-gates cites the table (#1923 AC6)', () => {
  const ms = read('plugin/skills/flow/multi-spec.md');
  assert.strictEqual(ms.split('still-verified: bookkeeping-only delta').length - 1, 1);
  const sg = read('plugin/skills/flow/steps-and-gates.md');
  assert.ok(sg.includes('**Re-verify scoping:**'));
  assert.ok(sg.includes('test/verification.md'));
});
```

- [ ] **Step 2: Write the AC5 repro in `cli.test.js`**

```js
test('#1801 shape: a ledger-row commit after a full pass resolves to none — still-verified line, no tests spawned (#1923 AC5)', async () => {
  const r = tmpGitRepo();
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const marker = path.join(r.repo, 'tests-ran.marker');
  const decl = {
    checks: { tests: 'placeholder' },
    rules: [
      { match: 'docs/plans/*-ledger.md', suites: [], static: false },
      { match: 'src/**', suites: ['tests'], static: true },
    ],
  };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.claude-tweaks/verify-scope.json');
  r.git('commit', '-q', '-m', 'declare verify scope');
  const testsCmd = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`;
  const args = ['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', branch, '--cmd', `tests=${testsCmd}`];
  const full = await runCli(args, { cwd: r.repo });
  assert.strictEqual(full.code, 0, full.stderr);
  assert.ok(fs.existsSync(marker));
  fs.unlinkSync(marker);
  commitFile(r, 'docs/plans/2026-09-06-spec-1-ledger.md', '| 1 | test | row | open | — |\n');
  const run = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^Scope: none/m);
  assert.ok(run.stdout.includes('still-verified: bookkeeping-only delta (docs/plans/2026-09-06-spec-1-ledger.md)'));
  assert.ok(!fs.existsSync(marker), 'no tests check may spawn on a bookkeeping-only delta');
  assert.strictEqual(stampOf(r.gitDir).scope, 'none');
});
```

- [ ] **Step 3: Run**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/test-skill-affected-conformance.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/cli.test.js"`
Expected: PASS (the conformance test passes only once Tasks 2-4 have landed; run it after them).

- [ ] **Step 4: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add tests/test-skill-affected-conformance.test.js tests/bin-lib/verify/cli.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Pin the re-verify scoping contract in prose and reproduce #1801's bookkeeping-only delta end to end (refs #1923, refs #1801)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 6: Full suite (AC7)

- [ ] **Step 1:** Run: `node "/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.116.0/bin/verify.js" --log-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-verify" --count-stamp "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-test-count.json" --cmd tests="npm test"`
Expected: exit 1 with only the pre-existing baseline failures (`tests/bin-lib/reconcile/reap-merged.test.js` ×3, and `tests/impeccable-cli-contract.test.js:35` when the environment pin drifts) — no other `not ok`; every edited `plugin/skills/**` file under 40 KB (`tests/bin-lib/skill-audit/context-cost.test.js` green).

---

## Self-review

- **Spec coverage:** Deliverable 1 (table + scoped invocation + Scope: line + AUTO decision + no-declaration/standalone rules) → Task 2; Deliverable 2 (`affected` on `--changed-files`; `qa affected` reads the same list) → Tasks 1, 3; Deliverable 3 (pipeline QA story filter, skip line, frontend exception, AUTO line) → Task 3; Deliverable 4 (`steps-and-gates.md` paragraph + polish row) → Task 4; Deliverable 5 (review one sentence) → Task 4; Deliverable 6 (multi-spec paragraph, literal once) → Task 4; Deliverable 7 (conformance test + `--changed-files` CLI test) → Tasks 1, 5; Deliverable 8 (skill-graph rows, plugin-structure row) → Tasks 1, 4. AC1-AC7 each pinned: AC1/AC3/AC4/AC6 by the conformance test, AC2 by the cli tests, AC5 by the repro, AC7 by Task 6.
- **Gotchas honored:** stale anchor → full (runner behavior, stated in Task 2); standalone = no run dir OR no `--source`; a story without `source_files` is always included; exact path match; `skip-qa` untouched; skip never silent (AUTO lines); Design CLI gate still runs on a skip; `refs` not `closes`.
- **Placeholders:** none.
