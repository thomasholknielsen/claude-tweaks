# Common Step 1.5 — Plan Audit

Audit the plan against the actual repo before dispatching execution work. The four deterministic checks below — Check A (paths exist), Check B (scope-keyword sweep), Check C (verification-command pre-check), and the headroom check — are mechanized in `plugin/bin/plan-audit.js` (#903); this file covers invocation, result interpretation, and policy handling only. Judgment checks (deictic re-resolution, degrade-clause convention, gate-over-producers) stay prose in `plan-authoring.md` — they are not mechanically checkable.

**Skip condition lives in `build/SKILL.md`'s Common Step 1.5 stub, not here** (the re-read cut: a caller deciding skip-vs-run must never need to load this file to make that decision). This file loads only once the step is confirmed to run.

## Invocation

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/plan-audit.js" {plan-file} [--repo-root {dir}] [--count-tasks]
```

`--repo-root` defaults to `git rev-parse --show-toplevel` of the cwd (or the cwd itself outside a repo) — pass it explicitly only when the plan's own worktree differs from cwd. Stdout is two lines: a compact JSON envelope (`{checkA, checkB, checkC, headroom}`, each `{ok, ...}`), then a one-line human summary. Exit code is `0` iff every check's `ok` is `true` (`headroom.nearCeiling` entries never fail `ok` — only `headroom.breaches` do). Parse the JSON via `JSON.parse(stdout.split('\n')[0])`.

## Result interpretation

- **`checkA.ok === false`** (`missing: [{path}, ...]`) — Stop. Present the missing paths. The plan needs revision before execution starts.
- **`checkC.ok === false`** (`findings: [{task, title, command, expected, actualExitCode, actualSummary}, ...]`) — Stop, unconditionally, the same shape as Check A above — never routed through Check B's auto-mode policy table, and with no `AskUserQuestion` branch. Present the flagged task(s), their commands, and `actualSummary` (the output that already looks like a pass). A non-discriminating verification command is a correctness gap the `_shared/auto-mode-contract.md` HARD-GATE exemption already covers (test failures), not a scope decision with a policy lever.
- **`headroom.breaches`** (non-empty) — treat as a Check A-shaped stop: present the breaching file(s) and their byte counts; the plan needs to shrink its target or split the insertion before execution starts.
- **`headroom.nearCeiling`** (non-empty, `ok` still `true`) — informational only. Surface it inline (file, current bytes, remaining headroom) so the plan author can judge whether the *planned* insertion (not estimated by this check — see Non-Goals below) will fit; never blocks.
- **`checkB.ok === false`** (`unplanned: [string, ...]`) — see "On Check B finding files outside the plan" below; this is the one check routed through the `scope-creep` policy, not a bare stop.

Resolve the `scope-keywords-required` setting — `SCOPE_KEYWORDS_REQUIRED=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values scope-keywords-required)`:
- `scope-keywords-required: false` — Check B is informational when the plan has no `Scope keywords:` field at all (the CLI reports `checkB.ok: true` trivially in that case — nothing to sweep).
- `scope-keywords-required: true` — gating: if the plan/design has no `Scope keywords:` field (the CLI's `checkB` ran zero sweep), refuse to start. Tell the user: "This project requires scope keywords. Add `Scope keywords: <pattern1, pattern2>` to the plan or design doc and re-run." This is a skill-layer policy check the CLI itself doesn't make — the CLI only reports whether a declared sweep found unplanned matches.

## On Check B finding files outside the plan

### Auto mode (resolved mode is `auto`, including a standalone `/claude-tweaks:build {N} auto` invocation with no `/flow` parent)

Resolve `scope-creep` with ONE resolver call — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" scope-creep` (resolve the run dir per `_shared/pipeline-run-dir.md` — spawned by `/flow`, or record-mode's own standalone run dir per its materialization exception) — which executes the standard precedence in `_shared/auto-mode-contract.md` (run `config.yml` → project `.claude-tweaks/policy.yml` → schema default) mechanically; apply the envelope's `value`, and carry the envelope's `source` into the row template's `[lever: …]` field (`_shared/auto-decision-log.md`'s Lever attribution section). Log the decision to whatever run dir resolves, per `_shared/pipeline-run-dir.md`'s resolution order — an explicit `auto` CLI arg always applies this branch, never the Interactive-mode prompt below, regardless of whether a Manifesto-computed `config.yml` exists. Apply:

| Policy | Action | Log entry |
|---|---|---|
| `add-to-plan` | Auto-add matched files to the plan as new tasks. Commit the plan update. | `AUTO {time} — Step 1.5: scope-creep — added {N} files to plan ({list}). Reversibility: high (commit {hash}). [lever: scope-creep=add-to-plan ({source})]` |
| `stop-and-ask` | Stop. Present the list inline. (Falls through to interactive prompt below.) | `KEPT-PROMPT {time} — Step 1.5: scope-creep matched {N} files, policy is stop-and-ask. Surfaced inline. [lever: scope-creep=stop-and-ask ({source})]` |
| `drop` | Note the matched files in `decisions.md` as `STAGED` for Review Console; proceed without adding to plan. | `STAGED {time} — Step 1.5: scope-creep matched {N} files, policy is drop. Files: {list}. Surface at Review Console. [lever: scope-creep=drop ({source})]` |

### Interactive mode (or `stop-and-ask` policy)

Present the list (`checkB.unplanned`):

```
Scope keywords match {N} file(s) not in the plan:
- {file 1}
- {file 2}
```

Then call `AskUserQuestion` with:

- `question`: `"Scope keywords match {N} file(s) not in the plan. What do you want to do?"`, `header`: `"Scope creep"`, `multiSelect`: `false`
- Option 1 — `label`: `"Add to plan (Recommended)"`, `description`: `"I'll add these as new tasks to the plan"`
- Option 2 — `label`: `"Continue without"`, `description`: `"I've checked, these are intentionally excluded"`
- Option 3 — `label`: `"Stop"`, `description`: `"Let me revise the plan manually"`

## What each check covers

- **Check A** — every path in the plan's `Files:` sections (`Create:`/`Modify:`/`Delete:`/`Test:` bullets) exists, or (for `Create:`/`Test:`, since a `Test:` bullet routinely names a brand-new test file the plan is about to write) its parent directory exists.
- **Check B** — when the plan declares `Scope keywords:`, an fs-walk (never a gitignore-honoring grep — a gitignored-but-plan-relevant file must not silently vanish from the sweep) flags any repo file containing a match that isn't itself one of the plan's declared paths.
- **Check C** — for each task's own `- [ ] **Step 2: …**` sub-step declaring `Run: {command}` / `Expected: FAIL …`, runs `{command}` once, read-only, against current repo state. The only finding: the command already exhibits a passing/success signature (exit code 0, or a success marker with no failure marker) despite the `Expected: FAIL` declaration. A command erroring or cleanly failing pre-dispatch is never a finding — a hard error on a later task in a plan whose tasks build on each other sequentially is common and expected.
- **Headroom** — for each existing file (`Modify:`/`Delete:`/`Test:`, never `Create:`) under the governed skill-corpus set (`plugin/skills/**/*.md` — the same set `context-cost.js` already measures every `SKILL.md` and sub-file against), its current byte count and headroom against the shared `CEILING_BYTES` constant. v1 reports current bytes + headroom only — it never estimates the size of the plan's own planned insertion (Non-Goals); the plan author judges borderline cases from the reported headroom.

Check A/B/C and the headroom check all share Check A/B's existing skip gate (fewer than 3 file references and no `Scope keywords:` field, or `ceremony-profile: fast-lane` — roster tag `plan-audit`, `_shared/ceremony-profile.md`) — none of them introduces a new skip condition of its own.
