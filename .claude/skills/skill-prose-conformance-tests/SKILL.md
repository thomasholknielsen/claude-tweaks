---
name: skill-prose-conformance-tests
description: Use when adding or changing a `node --test` suite that pins the prose in `skills/**/*.md` — when reading live skill text is legitimate versus when to freeze a fixture, how to prove an assertion can actually go red, and how to byte-pin an executable snippet and run it. Keywords - prose test, conformance test, byte-pin, live corpus, fixture, skill markdown, live probe, IL-80.
---

# Skill-prose conformance tests

## Overview

This repo ships markdown as its product: `skills/**/*.md` is the payload, not documentation about it. So its correctness gets pinned the way code does — a third of the suites under `tests/` read a skill file and assert on its text (count it live: `grep -l 'skills/' tests/*.test.js | wc -l`). That makes prose-reading tests a first-class house pattern here, and one with a failure mode ordinary unit tests do not have: the subject is a file somebody is *supposed* to edit.

## Key Patterns

### Read live prose only when the prose is the declared contract

`tests/wrap-up-registry-pin.test.js` binds `skills/wrap-up/SKILL.md`'s Phase 2 registry table to the code registry it documents (`bin/lib/wrap-up/registry.js`). Reading the live file is correct there because updating that table *is* the intended response to a registry change. `tests/hooks-gate-coverage.test.js` states the same carve-out for the same reason; the two cite each other as the house pattern.

Everywhere else, freeze the input. `[IL-80]`: a test opened `skills/review/SKILL.md`, deleted its `## Relationship to Other Skills` section in memory, and asserted the loss checker reported ≥95% of the section's identifiers lost. It passed at 100% — and then the migration it was gating deleted that section from all 32 skills, and the test failed on its own precondition. It was not broken by a regression; it was invalidated by its own subject matter succeeding. The fix was to commit the file verbatim at the last pre-deletion commit as a fixture under `tests/fixtures/`, so the experiment keeps running on exactly the bytes that produced the recorded numbers.

### Byte-pin an executable snippet, then run that same string

When skill prose carries a shell snippet the reader is expected to execute, assert it byte-identical **and** execute it. `tests/curation-judge-stagepath.test.js` holds the shadow sweep as a `SWEEP_SNIPPET` array joined on `\n`, asserts the fence matches byte-for-byte:

```js
assert.ok(s4.includes('```bash\n' + SWEEP_SNIPPET + '\n```'), 'sweep snippet present byte-for-byte inside a bash fence');
```

then runs the identical string against a fixture main-checkout plus linked worktree:

```js
spawnSync('bash', ['-c', SWEEP_SNIPPET], { cwd: main, encoding: 'utf8', timeout: 30_000, env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt } });
```

Documented procedure and exercised procedure are then the same bytes by construction, rather than by a reviewer's eye. `tests/staged-patch-contract.test.js` covers the other half — it probes `git apply --check`'s real accept/reject discrimination on this machine instead of asserting that the contract's sentence about it is true.

### Fixture repos come from the shared helper

`tests/helpers/git-fixtures.js` exports `gitRepo`, `linkedWorktreeOf`, `harnessWorktreeOf`, `fixtureGit`, and `FIXTURE_TIMEOUT_MS`, and 11 suites consume it. Build throwaway repos from it rather than hand-rolling another `spawnSync('git', ['init'])` ladder, and take `FIXTURE_TIMEOUT_MS` from it too so one machine-speed knob governs the suite.

## Decision Framework

| The prose you want to assert on | Do this |
|---|---|
| A table or list that restates a data structure living in code | Read it live and pin it against that structure; say so in a header comment, citing `[IL-80]` and why this is the carve-out |
| Content a future migration is expected to delete or rewrite | Freeze the bytes as a fixture under `tests/fixtures/` |
| A shell or `node -e` snippet the reader is told to run | Byte-pin the fence, then execute the pinned string against a fixture |
| A behavioural claim about a third-party tool (`git apply --check`, `gh`, `mv -n`) | Probe the tool; asserting the sentence proves only that the sentence is present |

## Project Conventions

- Anchor on a literal token the skill already uses — a filename pattern, a fenced heading, a table-row prefix — never a paraphrase. Hard-wrapped markdown splits phrases across lines, so a single-line literal match returns zero while the phrase is right there `[IL-66]`.
- When the assertion and the prose it pins are authored in the same change — a plan that inserts both, a build that writes the test before the edit lands — copy the pinned literal out of the edit's own replacement text, never from memory of what that edit says. The file does not contain the token yet, so the "anchor on a literal the skill already uses" check above has nothing to grep against, and the two literals can diverge before either ships. #708's plan self-review caught exactly this: a mutual-consistency assertion cited a different string than the plan's own edit instructions inserted.
- Apply the whitespace-collapsed control scan to **both** directions of a migration suite — absence assertions need it more than presence ones. A single-line `includes()` that asserts a retired clause is *gone* fails open when the clause survives a line wrap: the test goes green and certifies a deletion that never happened, where the same wrap on a citation-presence check at least fails loud. `tests/github-rate-limit-conformance.test.js` pairs `collapseWhitespace(s) => s.replace(/\s+/g, ' ')` with its citation-presence checks **and** its `assert.ok(!collapsed.includes(collapsedRetired))` absence checks — collapse both haystack and needle, one control test per assertion `[IL-66]`.
- Prove the assertion can go red before trusting its green: negate the prose and assert the regex *fails*, one claim per test. A multi-assertion test short-circuits, and bare tokens plus wide `[\s\S]{0,N}` windows routinely survive inversion `[IL-105]`.
- A pinned constant must be load-bearing. An exported list that nothing else reads pins prose against a dead value and stays green forever `[IL-78]`.
- These suites go red at the *merge combination*, not on the branch — two green branches each editing the pinned prose merge into a red `main`. Re-merge `main` and run the full `npm test` immediately before merging, then check `main`'s CI at the merge commit right after.
- `npm test` resolves its file list with `find tests tools/upstream-drift/tests -name '*.test.js'` — a new file under `tests/**` is picked up with no registration step.

## Common Operations

```bash
node --test tests/curation-judge-stagepath.test.js   # one suite, in isolation
npm test                                             # full suite — required before merging any prose-pinning change
```

A varying failure count across runs on byte-identical code tracks machine load from sibling agents, not a regression — re-run the affected file alone before concluding anything broke.

## Anti-Patterns

| Pattern | Why It Fails in This Project |
|---------|------------------------------|
| Reading live skill prose you intend to change | The test becomes a scheduled failure timed to the migration, so it is gone exactly when the change is riskiest `[IL-80]` |
| Excluding a directory from a dangling-reference sweep by its role ("that one is the parser, skip it") | That reasoning is precisely how `[IL-80]`'s live-corpus dependency survived the sweep that had already surfaced the file |
| Asserting a fenced snippet reads correctly without running it | The snippet is instruction to a shell, not to a reader; only execution separates correct from merely plausible |
| Retyping the pinned literal from memory of the edit that introduces it | The obvious failure — a red test — is the benign one; the likely "fix" is to reword the *prose* to match the misremembered assertion, silently shipping the remembered wording instead of the designed wording |
| Paraphrasing the pinned snippet inside the test | The fence and the probe then drift apart, and the probe stops describing the shipped procedure while both stay green |
| Adding another hand-rolled git-init ladder | `tests/helpers/git-fixtures.js` already owns it, and two builders are two things to keep correct |
| Running the whitespace-collapsed control scan on only the presence half of a migration suite | The absence half is the half that fails open, so the untested direction is exactly the one that silently certifies a retired clause as deleted `[IL-66]` |
| Merging on a green branch without re-running the full suite post-merge | Byte-pinning suites are the class that goes red only at the merge combination |

## Reference

- Instances: `tests/curation-judge-stagepath.test.js`, `tests/staged-patch-contract.test.js`, `tests/wrap-up-registry-pin.test.js`, `tests/hooks-gate-coverage.test.js`, `tests/skill-conventions.test.js`
- Shared helper: `tests/helpers/git-fixtures.js`
- Rules: `docs/donts.md` `[IL-66]`, `[IL-78]`, `[IL-80]`, `[IL-105]`; full accounts in `docs/incident-log.md`
- Conventions for authoring the prose itself: `docs/skill-authoring.md`
