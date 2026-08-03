---
record: 46
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
surface: infra
---
# 46: Harden evals/ actor.js's scope guard beyond path-bearing tool inputs

Surface: infra

## Current State

`evals/actor.js`'s `canUseTool` scope guard denies any non-`AskUserQuestion` tool call whose `file_path`/`path`/`notebook_path` input resolves outside the fixture `repoDir`, but by design does not inspect `Bash` command text — there is no reliable way to parse arbitrary shell text into a target path (documented in `actor.js`'s own header comment, lines ~30-40).

Since this record was parked, two things changed:

1. **The original parking trigger fired.** `.github/workflows/eval-benchmark.yml` now runs eval scenarios via `workflow_dispatch` on `ubuntu-latest`, with `contents: write` permission and the `ANTHROPIC_API_KEY` secret, unsupervised once kicked off — exactly the "eval scenarios start running unattended" condition this record was parked to watch for.
2. **The underlying containment gap has already been substantially closed by a different mechanism**, independent of this record. Commit `3c07f4e9` ("Harden evals/runner.js with SDK managedSettings.sandbox after fixture-escape incidents") added real OS-level sandboxing to `runner.js`: `managedSettings.sandbox` with `enabled: true`, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, `network.allowedDomains: []`, and `filesystem.allowRead` scoped to the fixture's own `.git`. `evals/README.md`'s "Safety model" section now documents this OS-level sandbox as the **primary** containment layer specifically because it covers `Bash` execution, with the userland `actor.js` guard explicitly framed as defense-in-depth on top of it, not the primary mechanism.

The one gap the README itself still documents as open: `managedSettings.sandbox`'s own `autoAllowBashIfSandboxed` default lets many sandboxed `Bash` calls bypass `canUseTool` entirely once the sandbox is active. This means `runner.js`'s `toolCalls` array (and any `tool-count` assertion built on it) undercounts real tool use — a documented, accepted limitation, not a containment gap, since the OS sandbox still confines those calls regardless of whether they reached `canUseTool`. This is currently a documented assumption, not something verified by an executable test.

## Deliverables

- Add a scenario (or a harness-level test, if the SDK's `query()` can be driven without a real model call) that has the model attempt a `Bash`-based escape from the fixture `repoDir` — e.g. writing a file outside `repoDir`, or reaching out over the network — and asserts the OS sandbox denies it. This closes the gap between "we believe `managedSettings.sandbox` blocks this" and "we have executable evidence it does."
- Confirm, against the installed `@anthropic-ai/claude-agent-sdk` version's own `sdk.d.ts`/`sdk-tools.d.ts` (the same verification method `actor.js`'s own header comment already uses — read the type definitions directly, don't infer from behavior alone), whether `autoAllowBashIfSandboxed` can be explicitly set to `false` in `managedSettings.sandbox`, and what it actually defaults to.
- Decide whether to disable `autoAllowBashIfSandboxed` (trading a startup/perf cost for every Bash call routing through `canUseTool`, giving accurate `toolCalls`/`tool-count` assertions) or keep the current default and instead tighten the `tool-count` assertion's own documentation so scenario authors don't mistake it for an exact count in security-sensitive scenarios.
- Update `evals/actor.js`'s scope-guard comment and `evals/README.md`'s "Safety model" section to reflect verified behavior (backed by the new escape-attempt test) rather than a documented assumption.

## Acceptance Criteria

- A new scenario or test exists under `evals/` that has the model attempt a `Bash`-executed write outside the fixture `repoDir` (or a network call), and asserts the OS sandbox denies it — run at least once for real (`node runner.js run <scenario>`, or the harness's own `node --test tests/`) with the result inspected, not just asserted in code.
- Either (a) `autoAllowBashIfSandboxed` is explicitly set to `false` with the tradeoff documented in `evals/README.md`, or (b) the `tool-count` assertion's documentation in `evals/README.md` is updated to explicitly warn it undercounts real tool use when the sandbox auto-allows Bash calls.
- `evals/actor.js`'s existing "Known, accepted limitation" comment (Bash text not inspected) is updated to cross-reference the OS-sandbox mitigation and the new escape-attempt test, so a future reader sees the full containment picture in one place, not just the userland guard's own limitation.
- `evals/`'s own test suite (`cd evals && node --test tests/`) passes with no regressions from this change.

## Technical Approach

### Key Files

- `evals/actor.js` — scope-guard comment (lines ~30-40) documenting the Bash-inspection limitation; update to reference the OS-sandbox mitigation
- `evals/runner.js` — `managedSettings.sandbox` config (lines ~95-108) and its own "Known undercount" comment; candidate site for an explicit `autoAllowBashIfSandboxed: false` if that direction is chosen
- `evals/README.md` — "Safety model" section (documents all three containment layers) and "Known limitation — tool-count undercount" note
- `evals/scenarios/` — new escape-attempt scenario, if that's the chosen verification mechanism
- `evals/tests/` — harness-level unit test, if the SDK allows scripting sandbox behavior without a real model call

Check the installed `@anthropic-ai/claude-agent-sdk` package's own `sdk.d.ts`/`sdk-tools.d.ts` for `autoAllowBashIfSandboxed`'s documented default and whether it accepts an explicit override — do not assume based on observed behavior alone, since a single sample run can't distinguish "always true" from "true under these specific conditions."

A live verification (a real `node runner.js run <scenario>` invocation with the crafted escape-attempt scenario) is stronger evidence than a purely static/code-reading check — prefer running it for real and inspecting the actual result.

## Gotchas

- The record's original "Suggested direction" (run each scenario inside an OS-level sandbox or ephemeral container) has **already been implemented** by commit `3c07f4e9` — don't re-propose building a new sandbox layer; this record is narrowly about verifying and hardening the residual gap in the existing implementation.
- This is security-adjacent work on a harness that runs real LLM agents with real tool access — validate any change against a real run before trusting it, per `evals/README.md`'s own "None of this is a substitute for review" caveat.
- `evals/` is a separate Node project with its own `package.json`/`node_modules`/tests, not part of the root `npm test` (per this project's own CLAUDE.md) — any new test/scenario belongs under `evals/`'s own `node --test tests/` run, and a real scenario run costs actual tokens/dollars (see `evals/README.md`'s Usage section).

## Original request

Harden evals/ actor.js's scope guard beyond path-bearing tool inputs

## Context

During `/claude-tweaks:review` of the new `evals/` eval-harness package, `evals/actor.js`'s `canUseTool` was found to auto-allow every non-`AskUserQuestion` tool call unconditionally, wired into a real Claude Agent SDK `query()` run against the developer's actual machine. A scope guard was added (deny any tool call whose `file_path`/`path`/`notebook_path` input resolves outside the fixture `repoDir`), but it is deliberately narrow: it does not inspect `Bash` command text, since there's no reliable way to parse arbitrary shell text into a target path.

This means a `Bash` tool call issued by a reviewed skill running inside a scenario is currently unconstrained beyond the fixture repo, relying on the fixture/scenario content being trusted (repo-committed YAML, not external input).

## Origin

- Spec/design: `docs/superpowers/specs/2026-07-22-claude-tweaks-eval-harness-design.md`, `docs/superpowers/plans/2026-07-22-claude-tweaks-eval-harness.md`
- Surfaced during: `/claude-tweaks:review` (Step 3, Security lens) and `/claude-tweaks:reflect` (full mode, Tradeoff Review), on branch `worktree-eval-harness-design`
- Files: `evals/actor.js`, `evals/runner.js`

## Trigger

Revisit when either becomes true:
- Eval scenarios start running unattended (e.g. in CI or a scheduled routine) rather than only interactively on a developer's machine, or
- The harness starts accepting scenario/fixture content from an untrusted or external source (not just repo-committed YAML)

## Suggested direction (not scoped yet)

Consider running each scenario's fixture repo + query() call inside an OS-level sandbox or ephemeral container, rather than relying solely on in-process path-checking in `canUseTool`.
