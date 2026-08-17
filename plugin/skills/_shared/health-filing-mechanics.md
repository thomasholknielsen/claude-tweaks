# Health Filing Mechanics — Canonical Retry-Drain and Regressed-Reopen Shape

`code-health`, `harness-health`, `journey-health`, and `docs-health` each run two unconditional mechanics inside their own FILE step, before the interactive ask-before-file gate (`_shared/health-filing-gate.md`) ever runs: draining the durable retry queue from a prior firing's filing failures, and reopening an issue whose finding has regressed. This file is the one place the *shape* of both mechanics is defined, so a correctness fix made to one skill's copy can be checked against the same canonical shape in the other three. Unlike a dispatched Task agent's prompt, each consumer's FILE step runs in the main session, which *can* `Read` this file directly — the self-contained-inline convention that governs dispatched-agent prompts elsewhere in this project does not apply here. Each consumer still writes out the actual bash commands in full inline anyway, to match how the rest of that skill's FILE step is written (procedural, literal bash the session executes step by step, with no mid-step file switch); this file is the reference the four copies are checked against, not a mechanically enforced single source — a maintainer fixing one copy must still manually port the fix to the other three (see "Keeping the four copies in sync" below).

Each consumer substitutes its own `{BINARY}` (its `bin/*.js` CLI name) and `{PREFIX}` (its label/temp-file prefix, identical to `{BINARY}` minus `.js`) into the shapes below.

## Retry-queue drain

Runs before this firing's own new findings are considered, so a `gh` failure from a prior firing gets one more chance before this firing's own filing loop adds to the queue:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/{BINARY}" retry-queue drain --root . > /tmp/{PREFIX}-retry-payloads.json
```

For each payload in `/tmp/{PREFIX}-retry-payloads.json`, attempt `gh issue create` exactly as this consumer's own **Type expression branch** describes — the `work-types: native` vs. `work-types: labels` branch each of the four consuming skills' own FILE step documents inline (e.g. `skills/code-health/SKILL.md`'s "Type expression branch" paragraph); this shared file has no copy of that branch itself, for the same reason the intro paragraph above gives for why each consumer writes the retry-drain/reopen bash inline rather than referencing this file. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/{PREFIX}-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/{BINARY}" retry-queue update /tmp/{PREFIX}-retry-results.json --root . > /tmp/{PREFIX}-escalated.json
```

If `/tmp/{PREFIX}-escalated.json` is non-empty, file (or update) a `{PREFIX}:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the run's other labels.

## Regressed reopen

For a payload whose fingerprint marker (embedded in `payload.body`, read via `extractFingerprint`) matches a `status: "regressed"` entry in `.claude-tweaks/{PREFIX}/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field.

## Both mechanics execute unconditionally with respect to the filing gate — but are still subject to `--dry-run`

Neither mechanic is gated by the interactive ask-before-file decision (`_shared/health-filing-gate.md`'s own Scope section states this explicitly) — a retry-queue drain was already approved in the firing that first produced it, and reopening isn't creating anything new. Both happen before the gate ever runs. They are *not*, however, exempt from `--dry-run`: each consuming skill's own `--dry-run` mode description ("print the payloads and the `gh` commands that would run, but do not call `gh`") covers the whole FILE step, including the retry-drain and regressed-reopen `gh` calls above — in `--dry-run` mode, print what would be filed or reopened and skip the actual `gh issue create`/`gh issue reopen`/`gh issue comment` calls, exactly like the new-findings filing loop.

## Keeping the four copies in sync

Every one of the four skills' own FILE steps must carry both mechanics using the substitution above. When one skill's copy changes (a bug fix, a robustness improvement, a message wording change), check the other three against this file's canonical shape rather than assuming the change was skill-specific — the retry-drain/reopen logic itself has no per-skill behavioral variation, only the `{BINARY}`/`{PREFIX}` substitution does.
