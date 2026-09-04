---
record: 257
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 257: build: pre-dispatch verification pass over each task's own stated acceptance command

Surface: backend

## Current State

- `skills/build/SKILL.md`&#39;s **Common Step 1.5 (Plan Audit)** is the one plan-review step that runs after a plan is written and before execution begins (Common Step 2 hands off to `/superpowers:subagent-driven-development` or `/superpowers:executing-plans`). Its full procedure lives in `skills/build/plan-audit.md`.
- `skills/build/plan-audit.md` currently defines two checks, both structural: **Check A** (always runs) verifies every path in the plan&#39;s `Files:` sections exists (or its parent directory exists, for Create); **Check B** (conditional) greps the repo for declared `Scope keywords:` and flags matched files missing from the plan. Neither check executes any command the plan itself declares.
- `skills/build/SKILL.md`&#39;s Spec Step 3 / Design Step 3 already carry several individual authoring-time checks for specific plan-authoring risk classes (e.g. the &#34;Verbatim-command run-once check&#34; — run a plan-dictated command once against the live target before dispatch, and record the output) — but none of them executes *every task&#39;s own stated acceptance/verification command*, and none runs at the controller level immediately before dispatch.
- Plan task shape is defined by the superpowers `writing-plans` skill (external plugin, not this repo) — each task&#39;s `- [ ] **Step 2: Run test to verify it fails**` sub-step carries a literal `Run: {command}` line and an `Expected: {text}` line (e.g. `Expected: FAIL with &#34;function not defined&#34;`). Step 4 (&#34;Run test to verify it passes&#34;) carries the equivalent post-implementation pair, but that command structurally requires the task&#39;s own implementation to exist, so it cannot be meaningfully pre-run before dispatch.
- Origin incident: during the specs 216/217/218 build, several plan tasks&#39; stated verification commands would not have discriminated a correct fix from a no-op if pre-run against live repo state. This was caught only because 4 of 7 dispatched implementers happened to independently run their own ad hoc &#34;scratch copy, revert, re-run, confirm red&#34; probe before trusting a green result; the other 3 had no equivalent safety net.

## Deliverables

- [ ] Add a new **Check C — Verification-command pre-check** section to `skills/build/plan-audit.md`, matching the existing Check A/Check B heading style, that: (1) extracts every task&#39;s Step 2 `Run: {command}` / `Expected: {text}` pair from the plan file; (2) executes each extracted command once, read-only, against the current (pre-dispatch) repo state — i.e. before Common Step 2 hands off to any execution strategy; (3) flags a task only when its command&#39;s actual result already exhibits a passing/success signature (exit code 0 for a test runner, or output matching a success pattern) despite the task declaring `Expected: FAIL ...`.
- [ ] State explicitly in that section that a command erroring or cleanly failing pre-dispatch is **not** a Check C finding — only an already-passing result is (see Gotchas for why).
- [ ] State explicitly that tasks with no Step 2 `Run:`/`Expected:` pair (non-code tasks — pure config/doc/manual tasks) are skipped by Check C; there is nothing to pre-run.
- [ ] Update `skills/build/SKILL.md`&#39;s Common Step 1.5 stub to name Check C alongside Check A and Check B, so a reader of the stub alone knows the step performs three checks, not two.
- [ ] Document Check C&#39;s on-finding behavior as a hard stop, worded like Check A&#39;s existing &#34;Stop. Present the missing paths. The plan needs revision before execution starts.&#34; — not routed through Check B&#39;s auto-mode `scope-creep` policy table, since a non-discriminating verification command is a correctness gap the `_shared/auto-mode-contract.md` HARD-GATE exemption already covers (test failures), not a scope decision with a policy lever.
- [ ] Confirm Check C shares Check A/B&#39;s existing skip gate (fewer than 3 file references and no `Scope keywords:` field, or `ceremony-profile: fast-lane`) rather than introducing a new one.

## Acceptance Criteria

1. `skills/build/plan-audit.md` contains a `## Check C` (or equivalently-headed) section documenting the extraction rule (Step 2&#39;s `Run:`/`Expected:` pair), the once-only pre-dispatch execution rule, and the passing-signature-only flagging rule described above.
2. That section states in plain prose that a command erroring or cleanly failing pre-dispatch is not a finding — only an already-passing result is.
3. `skills/build/SKILL.md`&#39;s Common Step 1.5 stub names &#34;Check C&#34; (not just Check A and Check B).
4. The section documents Check C&#39;s on-finding behavior as an unconditional stop — the same &#34;present findings, plan needs revision&#34; shape as Check A — with no auto-mode policy table or `AskUserQuestion` branch attached to it (contrast with Check B, which has both).
5. The section states that Check C shares Check A/B&#39;s existing skip condition, introducing no new one.
6. `grep -l &#34;Check C&#34; skills/build/plan-audit.md skills/build/SKILL.md` returns both file paths, confirming both files were updated.

## Technical Approach

- **Extraction:** parse each `### Task N: ...` block in the plan file for its `- [ ] **Step 2: Run test to verify it fails**` sub-step, then the `Run: {command}` and `Expected: {text}` lines immediately following it — the literal template shape defined by the superpowers `writing-plans` skill&#39;s Task Structure section (cite it; do not restate its template here, since it lives in a different plugin and can drift independently).
- **Execution:** run each extracted `{command}` once via Bash, against the plan&#39;s own worktree at its current HEAD, before Common Step 2 hands off to the execution strategy — i.e. before any task&#39;s implementation has landed. This reuses the &#34;run a plan-dictated command once, read-only, and record the output&#34; discipline `skills/build/SKILL.md`&#39;s Spec Step 3 &#34;Verbatim-command run-once check&#34; bullet already establishes; cite it rather than duplicating the discipline.
- **Pass/fail judgment:** the only finding Check C raises is &#34;the command already looks like it passed, despite the task declaring `Expected: FAIL`.&#34; Concretely: exit code 0 from a test runner invocation, or output containing the runner&#39;s own success marker (e.g. `PASS`, `0 failing`, `✓`) with no corresponding failure marker. A non-zero exit, an assertion failure, or a hard error (missing module, import error, file not found) are all **non-findings** — see Gotchas for why a hard error is expected and safe to ignore here, not a false negative.
- **Scope of this record:** the change is confined to `skills/build/plan-audit.md` and `skills/build/SKILL.md`&#39;s Common Step 1.5 stub. It does not modify `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, or any file outside this plugin&#39;s own `skills/build/` directory — those are external superpowers-plugin skills and out of scope here. The origin issue&#39;s alternative framing (&#34;or `/specify`&#39;s plan-authoring self-check&#34;) is not pursued: `/specify` runs before a plan exists at all (it produces the record `/superpowers:writing-plans` later consumes), so it has no plan file to extract Step 2 commands from — `/build`&#39;s Common Step 1.5 is the only point in the pipeline that holds both the finished plan and a pre-dispatch moment to run it in.

## Gotchas

- Do not literally re-run every task&#39;s Step 4 (&#34;Run test to verify it passes&#34;) command pre-dispatch — that command structurally requires the task&#39;s own implementation to exist yet, so pre-running it would trivially fail every time and add zero signal. Check C is scoped to Step 2 commands only.
- A command erroring (missing module, import error) rather than cleanly failing is common and expected for a later task in a plan whose tasks build on each other sequentially — running task 5&#39;s Step 2 command before any of tasks 1-4 have landed will often hard-error rather than assert-fail, and that&#39;s fine. The origin incident&#39;s actual failure mode was a command that returned an unconditional **pass** regardless of correctness (&#34;would pass regardless of whether the implementer&#39;s change was actually correct&#34;) — that&#39;s the one signature Check C exists to catch; do not widen it into flagging errors too, which would produce constant false positives on any plan with inter-task dependencies.
- Keep Check C&#39;s on-finding behavior distinct from Check B&#39;s scope-creep policy table on purpose — this is a correctness HARD-GATE per `_shared/auto-mode-contract.md` (explicitly not silenced by `auto` mode), not a decision-worthy lever with a resolvable policy.
- Do not expand this into a general &#34;run every command mentioned anywhere in the plan&#34; sweep. Scope is exactly each task&#39;s own declared Step 2 verification command, matching the issue&#39;s own proposed direction; broader static analysis of arbitrary plan-embedded commands is a different, larger record.

## Original request

build: pre-dispatch verification pass over each task's own stated acceptance command

**Summary:** `/build`&#39;s plan-review has no step that pre-runs a task&#39;s own stated acceptance/verification command against live repo state before dispatch — a gap only caught today because implementers happen to notice it themselves.

**Origin:** Reflection during the specs 216/217/218 build (`/superpowers:subagent-driven-development` dispatch). Originally drafted as an upstream superpowers gap-report; reclassified to claude-tweaks&#39; own scope on reconsideration, since claude-tweaks already holds the full plan — including every task&#39;s stated verification command — before any dispatch mechanism ever sees it.

**What happened:** Several plan tasks specified an acceptance/verification command that, if pre-run against live repo state, would have immediately shown the command didn&#39;t discriminate correctly (it would pass regardless of whether the implementer&#39;s change was actually correct). This was only caught because 4 of 7 dispatched implementers independently ran their own ad hoc &#34;scratch copy&#34; probe — copy the target file, revert the change, re-run the check, confirm it goes red — before trusting a green result. The other 3 had no equivalent safety net; a subtly broken plan task could have shipped unnoticed.

**Proposed direction:** Add a pre-dispatch verification pass to `/build`&#39;s plan-review (or `/specify`&#39;s plan-authoring self-check, alongside the existing &#34;run a plan&#39;s grep/expected-output self-checks against the actual planned text during authoring&#34; discipline) that runs each task&#39;s own stated acceptance/verification command against current repo state once, upfront, before any task is dispatched — regardless of which execution strategy (`/superpowers:subagent-driven-development`, solo-implementer, or a future strategy) actually does the dispatching. This generalizes the mutation-probe pattern observed here (currently redone ad hoc, per-implementer, only when one happens to think of it) into a single controller-level check that catches the same class of gap earlier, for every task.

**Type:** feature

---
Filed via conversation following up on the specs 216/217/218 wrap-up.
