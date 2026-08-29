---
name: skill-prose-conformance-tests
description: Use when adding or changing a `node --test` suite that pins the prose in `plugin/skills/**/*.md` — when reading live skill text is legitimate versus when to freeze a fixture, how to prove an assertion can actually go red, and how to byte-pin an executable snippet and run it. Keywords - prose test, conformance test, byte-pin, live corpus, fixture, skill markdown, live probe, IL-80.
---

# Skill-prose conformance tests

## Overview

This repo ships markdown as its product: `plugin/skills/**/*.md` is the payload, not documentation about it. So its correctness gets pinned the way code does — a large share of the suites under `tests/` read a skill file and assert on its text (count it live: `grep -l 'skills/' tests/*.test.js | wc -l`). That makes prose-reading tests a first-class house pattern here, and one with a failure mode ordinary unit tests do not have: the subject is a file somebody is *supposed* to edit.

## Key Patterns

### Read live prose only when the prose is the declared contract

`tests/wrap-up-registry-pin.test.js` binds `plugin/skills/wrap-up/SKILL.md`'s Phase 2 registry table to the code registry it documents (`plugin/bin/lib/wrap-up/registry.js`). Reading the live file is correct there because updating that table *is* the intended response to a registry change. `tests/hooks-gate-coverage.test.js` states the same carve-out for the same reason; the two cite each other as the house pattern.

Everywhere else, freeze the input. `[IL-80]`: a test opened `plugin/skills/review/SKILL.md`, deleted its `## Relationship to Other Skills` section in memory, and asserted the loss checker reported ≥95% of the section's identifiers lost. It passed at 100% — and then the migration it was gating deleted that section from all 32 skills, and the test failed on its own precondition. It was not broken by a regression; it was invalidated by its own subject matter succeeding. The fix was to commit the file verbatim at the last pre-deletion commit as a fixture under `tests/fixtures/`, so the experiment keeps running on exactly the bytes that produced the recorded numbers.

### Prove go-red with a frozen pre-change excerpt beside the live file

`[IL-105]` says prove the assertion can go red; the mechanism this repo converged on three times is to freeze the bytes the change *replaced* as a fixture constant inside the test, then assert every pattern twice — it matches the live file, and it does **not** match the frozen excerpt. `tests/backlog-refine-reverify-before-write.test.js` and `tests/backlog-refine-closing-render.test.js` both wrap the pair in a one-claim-per-call helper:

```js
// The pre-change Step 5 opening (#764) — narration-allowance line followed directly by the
// Priority/Related write block, no reverify subsection between them.
const PRE_CHANGE_STEP_5_HEAD = `## Step 5: Apply

*(Narration allowance: …)*

**Priority/Related rows:** For every record the priority decision resolved to apply:
`;

// One claim per call: the pattern must match the shipped prose AND fail against the
// pre-change text, so a green result proves the regex can actually go red [IL-105].
function assertClaimPinned(pattern, missingMessage) {
  assert.match(refineModeProse, pattern, missingMessage);
  assert.doesNotMatch(PRE_CHANGE_STEP_5_HEAD, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
}
```

The excerpt is a string literal in the test file, not a read of history, so it survives every later edit to the live file — the same reason `[IL-80]`'s fixture exists. `tests/backlog-narration-bounded-allowance.test.js` runs the identical fixture in the other direction for its retirement sweep: `assert.match(PRE_CHANGE_BANNER, pattern)` proves the sweep pattern is discriminating rather than vacuous, because it must catch the clause the change retired.

**The blind spot: `doesNotMatch` passes for free when the control lacks the tokens.** An adjacency claim — two tokens joined by a `[\s\S]{0,N}` window — only goes red against the control when the control contains *both* tokens and separates them by more than `N`. A control that contains neither token, or only one, satisfies `doesNotMatch` for the wrong reason, and the window (the whole adjacency claim) is never exercised. `tests/backlog-refine-reverify-before-write.test.js`'s cross-reference test is exactly this case: `/Step 6 auto-apply table already applies the identical rule[\s\S]{0,150}step-6-auto\.md/` is checked against a `PRE_CHANGE_STEP_5_HEAD` that mentions neither token, so nothing tests that `150` — the pattern would still be green at any window width. For an adjacency or ordering claim, build the control so it carries the anchor and lacks only the thing being pinned, and run the *same* extraction over both: `tests/backlog-narration-bounded-allowance.test.js` calls `textAfterHeader(PRE_CHANGE_BANNER, '## Step 1: Fetch')`, so the frozen text supplies the header and the miss is attributable to the reminder's absence rather than the header's.

**When the assertion is a count, prove the counter — with a synthetic minimal pair, not a frozen excerpt.** A test that asserts "exactly N blocks still contain X" fails open in a way a match/`doesNotMatch` pair does not: a block-delimiting helper that silently returns zero blocks, or a label regex that never fires, makes every count come out at whatever the prose happens to be. `tests/fetch-sub-issues-prose-conformance.test.js` pins how many `Fallback`-labeled blocks in `_shared/trust-table.md` and `_shared/github-pr-scan-acceptance.md` still carry the verbatim per-parent `while read -r N` REST loop, and proves the helper itself by running it over two hand-built inputs: an intact synthetic block (counts 1) and the same block with the loop stripped (counts 0), plus a negative control — the loop present under a *non*-`Fallback` heading (counts 0). That is the blind spot above answered for counting assertions: each control carries the anchor and differs only in the pinned thing, so neither zero can pass for the wrong reason. Build the pair by hand in the test rather than freezing live bytes — the helper, not the prose, is the subject.

**An adjacency claim swept over every occurrence is a count — prove the helper *and* the anchor.** When "every occurrence of X must be followed by Y within N chars" is enforced by a helper that walks the anchor's matches and counts the misses — rather than by one windowed `assert.match` — it inherits both blind spots at once, and its two zeros mean different things: zero because every occurrence complies, and zero because the helper found no occurrence to check. `tests/console-autoresolve-needs-human-carveout.test.js` (#1179) closes both. It proves the helper over three hand-built inputs — the frozen pre-change excerpt, which carries the anchor and lacks only the carve-out, must count exactly **1**; an anchor-less string must count 0; a synthetic anchor-plus-carve-out pair must count 0 — and it asserts the anchor's presence in the live file in the same test as the count:

```js
test('single-spec console: no "defaults to merge" without the exception adjacent', () => {
  assert.ok(/defaults to merge/.test(WRAPUP_FLAT), 'anchor vanished — adjacency claim is vacuous');
  assert.strictEqual(occurrencesMissingCarveout(WRAPUP_FLAT, WINDOW), 0, '…');
});
```

The helper proof alone does not cover this: a rewording that drops the anchor from the shipped prose leaves a provably-discriminating helper reporting a vacuous zero over the live corpus.

### Sweep code regions, not the whole file, when prose may say what commands may not

Some conventions bind only the *commands* a skill file carries. `plugin/skills/flow/multispec-freshness.md` must parameterize its git commands as `origin/{integration-branch}`, while a paragraph explaining the ladder may legitimately name `origin/main` in passing. `tests/multispec-boundary-freshness.test.js` extracts the code regions first and sweeps only those — fences and inline spans as two passes, not one regex:

```js
function codeRegions(text) {
  const fences = text.match(/```[\s\S]*?```/g) ?? [];
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const spans = stripped.match(/`[^`\n]+`/g) ?? [];
  return [...fences, ...spans];
}
```

Stripping the fences before scanning for spans is the load-bearing half, and it fails in a way that hides offenders rather than adding noise: on `` ``` tail `origin/x` end ``, the unstripped span regex pairs the fence's closing backtick with the real span's opening one and yields `` ` tail ` `` — the `origin/x` span is never scanned at all. Contrast `tests/frontier-unattended-literal.test.js`, which sweeps whole files with an explicit allowlist: reach for that shape when the literal is banned everywhere, and for region-scoping only when prose and command text genuinely differ in what they may say.

**An empty extraction passes the sweep for free.** `assert.deepStrictEqual(offenders, [], …)` over a derived haystack is green when the extractor returns nothing — a fence style the regex misses (`~~~`, an indented block), a renamed target read as an empty string, or a typo. This is the `doesNotMatch` blind spot above one level up: there the *control* lacked the tokens, here the *haystack* does. It is live, not hypothetical: `multispec-freshness.md` today has 95 inline spans and **zero** fenced blocks, so the fence half of that helper is currently pinning nothing and a bug in it would not show. Assert the region count is non-empty, and run the same filter over a frozen string carrying the banned literal, so green proves the sweep can still see one.

### Bind an executable snippet to a test — extract-and-run first, byte-pin second

When skill prose carries a shell snippet the reader is expected to execute, bind it to a `node --test` file that both pins it and runs it. `docs/skill-authoring.md`'s "Executable snippets in skill prose" names two forms and **prefers extract-and-run**: the test pulls the fence out of the doc with an anchored regex and executes exactly that string, so the doc is the only source of the executed text and the two cannot drift; the test fails loudly — *"extraction pattern is out of sync"* — when the anchor moves. Shipped instances: `tests/pipeline-run-dir-adoption-anchoring.test.js` and `tests/blast-radius-snippet.test.js`, the latter extracting `plugin/skills/assess-agent-autonomy/merge-check.md`'s Step 1 fence and running it against a fixture git repo.

**Anchor the extraction on structure, not on a sentence.** `tests/blast-radius-snippet.test.js` anchors on the prose phrase "is one CLI call", which any rewording of that paragraph breaks — and the failure then reads as a test defect rather than as the procedure changing. A heading, a fence delimiter, or a table-row prefix survives ordinary editing; this is the extraction-side statement of the Project Conventions bullet below.

Reach for **byte-pinning** when the probe has to wrap the snippet in fixture-specific surroundings — then assert it byte-identical **and** execute it. `tests/curation-judge-stagepath.test.js` holds the shadow sweep as a `SWEEP_SNIPPET` array joined on `\n`, asserts the fence matches byte-for-byte:

```js
assert.ok(s4.includes('```bash\n' + SWEEP_SNIPPET + '\n```'), 'sweep snippet present byte-for-byte inside a bash fence');
```

then runs the identical string against a fixture main-checkout plus linked worktree:

```js
spawnSync('bash', ['-c', SWEEP_SNIPPET], { cwd: main, encoding: 'utf8', timeout: 30_000, env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt } });
```

Documented procedure and exercised procedure are then the same bytes by construction, rather than by a reviewer's eye. `tests/staged-patch-contract.test.js` covers the other half — it probes `git apply --check`'s real accept/reject discrimination on this machine instead of asserting that the contract's sentence about it is true.

**Lighter variant: pin only the flags, not the side effects.** When the goal is proving a documented snippet's *flags* parse cleanly against the CLI's real arg parser — not exercising the command's full side effects — tokenize the live snippet and feed the resulting argv straight through the parser directly, with no subprocess and no fixture repo. `tests/bin-lib/verify/snippet-conformance.test.js` is the instance: it extracts `verification.md`'s pinned `verify.js` invocation, tokenizes the argv after the script path, and calls `parseArgs` on it. Its go-red proof exercises the extractor itself, not just the assertion — it appends a bogus flag to the *extracted* snippet and asserts the whole extract-plus-parse pipeline throws, catching a broken tokenizer as well as a broken doc.

### Fixture repos come from the shared helper

`tests/helpers/git-fixtures.js` exports `gitRepo`, `linkedWorktreeOf`, `harnessWorktreeOf`, `fixtureGit`, and `FIXTURE_TIMEOUT_MS`, consumed by every suite that needs a throwaway repo. Build throwaway repos from it rather than hand-rolling another `spawnSync('git', ['init'])` ladder, and take `FIXTURE_TIMEOUT_MS` from it too so one machine-speed knob governs the suite.

### Negative-exclusion tests for a resolver's source-exclusion special case

When a resolver has a deliberate special case that excludes one source from precedence entirely (a config layer that must never win even though it normally would — `merge-authorization`'s exclusion of `.claude-tweaks/policy.yml`, `bin/lib/policy-schema.js`), assert the excluded source is actually ignored, not just what the resolver ultimately returns. `tests/resolve-policy-lib.test.js`'s four `merge-authorization` tests are the instance: unset resolves to default, run-config wins over an unset policy value, a set policy.yml value is discarded (falls to default, not `source: 'policy'`), and run-config still wins even when policy.yml is also set. The third case is the one a same-final-value assertion alone would miss — a resolver that merely deprioritized policy.yml instead of excluding it could pass every other assertion while silently letting policy.yml win whenever run-config is absent.

## Decision Framework

| The prose you want to assert on | Do this |
|---|---|
| A table or list that restates a data structure living in code | Read it live and pin it against that structure; say so in a header comment, citing `[IL-80]` and why this is the carve-out |
| Content a future migration is expected to delete or rewrite | Freeze the bytes as a fixture under `tests/fixtures/` |
| A shell or `node -e` snippet the reader is told to run, where the full command matters | Extract the fence from the doc with a structurally-anchored regex and execute exactly that string; byte-pin the fence instead only when the probe needs fixture-specific surroundings |
| A shell snippet the reader is told to run, where only the flags matter | Byte-pin the fence, tokenize it, feed the argv straight through the CLI's own arg parser |
| A literal banned in a file's command text but legitimate in its prose | Extract the code regions first — fences, then inline spans over the fence-stripped remainder — and sweep only those; assert the extraction is non-empty, or the sweep passes on an empty haystack |
| A behavioural claim about a third-party tool (`git apply --check`, `gh`, `mv -n`) | Probe the tool; asserting the sentence proves only that the sentence is present |
| How many places still carry a clause, block, or snippet | Assert the count over the live corpus, then run the counting helper over a hand-built intact/stripped pair plus an anchor-less negative control — a green count over prose alone never shows the helper can find anything |
| A repo-wide cardinality of one structure across every shipped skill — how many Anti-Patterns rows exist in total | One pin, in one suite, bumped by re-running the parser on the working tree and never by arithmetic; quote a diff that actually contains the row as the delta's evidence — see "Bumping the repo-wide Anti-Patterns row-count pin" below (`tests/bin-lib/skill-audit/anti-patterns.test.js`, `[IL-99]`) |
| A documented convention this project wants enforced against every future addition — no fixed code structure to pin against, no bytes a migration will rewrite | Read the live corpus and pin the convention itself (a regex over `plugin/skills/**/*.md`, or wherever the convention applies); never freeze it — freezing would stop the suite from catching a new violation, which is the whole point (`tests/resolve-profile-invocation-conformance.test.js`, #670) |
| Executable payload under `plugin/skills/**` that is **not** markdown, with no harness that can run it — browser JS inside `compare-shell/template.html` | Pin its structure with structurally-anchored regexes over the live file. Extract-and-run does not apply (there is no DOM to execute it in), so pinning *is* the whole mechanism. Anchor on code structure (`function name(`, `id="…"`, `data-token="…"`), and prove an exclusivity claim by counting the **call-site** literal (`fn();`) rather than the bare identifier prefix — the prefix also matches the declaration, so the count comes out one higher and the claim is never actually tested (`tests/compare-shell-tweak-lever.test.js`, #1207) |

## Project Conventions

- Anchor on a literal token the skill already uses — a filename pattern, a fenced heading, a table-row prefix — never a paraphrase. Hard-wrapped markdown splits phrases across lines, so a single-line literal match returns zero while the phrase is right there `[IL-66]`.
- When the assertion and the prose it pins are authored in the same change — a plan that inserts both, a build that writes the test before the edit lands — copy the pinned literal out of the edit's own replacement text, never from memory of what that edit says. The file does not contain the token yet, so the "anchor on a literal the skill already uses" check above has nothing to grep against, and the two literals can diverge before either ships. #708's plan self-review caught exactly this: a mutual-consistency assertion cited a different string than the plan's own edit instructions inserted.
- **Retargeting existing pins: diff the assertion inventory, not the plan's prose anchor list.** When a migration moves pinned prose from one file to another, enumerate every assertion literal in the *replaced* tests and give each one an explicit verdict — moved, retargeted (naming the new literal), or retired (with its own stated reason). A prose-level anchor list drops pins silently, and a dropped pin leaves the suite green, so nothing downstream fails. #1275's plan listed the anchors as prose and omitted the #1041 anti-echo pin — `tests/specify-next-mode.test.js`'s `assert.ok(section.includes('is data for Step 2'), …)`; the implementer, the task review, and the spec all worked from that list and none noticed. Only the whole-branch review's independent grep over the retired vocabulary caught it, and it was restored as `'data for the callee to characterize'` against the new contract in `5616e0d6`.
- Apply the whitespace-collapsed control scan to **both** directions of a migration suite — absence assertions need it more than presence ones. A single-line `includes()` that asserts a retired clause is *gone* fails open when the clause survives a line wrap: the test goes green and certifies a deletion that never happened, where the same wrap on a citation-presence check at least fails loud. `tests/github-rate-limit-conformance.test.js` pairs `collapseWhitespace(s) => s.replace(/\s+/g, ' ')` with its citation-presence checks **and** its `assert.ok(!collapsed.includes(collapsedRetired))` absence checks — collapse both haystack and needle, one control test per assertion `[IL-66]`.
- Prove the assertion can go red before trusting its green: negate the prose and assert the regex *fails*, one claim per test. A multi-assertion test short-circuits, and bare tokens plus wide `[\s\S]{0,N}` windows routinely survive inversion `[IL-105]`.
- A pinned constant must be load-bearing. An exported list that nothing else reads pins prose against a dead value and stays green forever `[IL-78]`.
- These suites go red at the *merge combination*, not on the branch — two green branches each editing the pinned prose merge into a red `main`. Re-merge `main` and run the full `npm test` immediately before merging, then check `main`'s CI at the merge commit right after.
- `npm test` resolves its file list with `find tests tools/upstream-drift/tests -name '*.test.js'` — a new file under `tests/**` is picked up with no registration step.
- **The payload under `plugin/skills/` is not only markdown, and this pattern covers all of it.** `plugin/skills/design-wrapper/compare-shell/template.html` and its sibling `seed-compare.mjs` ship to users exactly as a `SKILL.md` does, and get pinned the same way: `tests/visual-decision-contract-conformance.test.js` and `tests/compare-shell-tweak-lever.test.js` (#1207) both read `template.html` live. The Overview's `**/*.md` framing names the common case, not the boundary — when the shipped artifact is code with no runnable harness, use the non-markdown row of the Decision Framework above.

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
| Sweeping a derived region set for a banned literal without asserting the set is non-empty | The extractor becomes part of the assertion, silently: a regex matching no region reports zero offenders and certifies a convention it never checked |
| Adding another hand-rolled git-init ladder | `tests/helpers/git-fixtures.js` already owns it, and two builders are two things to keep correct |
| Running the whitespace-collapsed control scan on only the presence half of a migration suite | The absence half is the half that fails open, so the untested direction is exactly the one that silently certifies a retired clause as deleted `[IL-66]` |
| Asserting a count over live prose without exercising the counting helper | A helper that finds no blocks at all reports the number the prose happens to have, so the suite certifies a cardinality it never measured |
| Merging on a green branch without re-running the full suite post-merge | Byte-pinning suites are the class that goes red only at the merge combination |
| Anchoring a snippet-extraction regex on a prose sentence | The sentence is the part of the doc most likely to be reworded, so the suite goes red on its own anchor instead of on the procedure — and the tempting fix is to loosen the regex, which quietly stops pinning the fence at all |
| Proving a prose pin discriminates by mutating the tree (revert the fix, delete the pinned sentence) and re-running | The mutation is live working-tree state with no owner but the running agent: an agent killed mid-cycle — a usage limit, a platform stall, a manual stop — leaves it sitting in the tree, and it reads as ordinary work in progress to whoever looks next (near-miss, spec #1263, 2026-08-22). `git show {base}:{file}` proves the same thing with zero mutation — see "Proving discrimination without editing the tree" below. Where a real mutation is unavoidable, commit first and drive the whole cycle from one script, and `git status` after any agent death |

## Proving discrimination without editing the tree

A pin's red state can be proven after the fact, with zero tree mutation: `git show {base}:{file} | grep -c -F '{pinned literal}'` must print 0 where the same grep at HEAD prints 1 (or N). This is the check to reach for when a red-run step was skipped (it retroactively proves the assertion could have failed), when reviewing someone else's pin, or when a revert-and-rerun would risk leaving the tree dirty — `git show` mutates nothing. Run it per pinned literal, not per file: one literal that pre-exists at base is a vacuous pin even when its siblings discriminate. (First applied across record #1071's four prose pins; the whole-branch review ran the same table independently.)

**`{base}` must be a fixed, independently-verified ancestor SHA — never a moving ref like `HEAD`.** A moving ref is self-defeating once the change lands: `HEAD` at that point already carries the post-change content, so the "red" side of the comparison silently becomes the same as the "green" side. Pair the pin with its own ancestor-precondition test (`git merge-base --is-ancestor {base-sha} HEAD`) so a rebase or history rewrite that invalidates the fixed SHA fails loudly instead of passing vacuously. Record #1488 shipped both the mistake and the fix in one build: one pin used a fixed SHA with only a rationale comment, no precondition test; a sibling pin landed the correct fixed-SHA-plus-precondition-test form.

## Bumping the repo-wide Anti-Patterns row-count pin

`tests/bin-lib/skill-audit/anti-patterns.test.js` closes with one cardinality pin over the whole payload — `assert.strictEqual(total, N)`, the total Anti-Patterns table rows across every `plugin/skills/*/SKILL.md`. So *any* change that adds or removes an Anti-Patterns row goes red there rather than in the edited skill's own suite, and the pin is bumped by whoever landed the row. Two rules, both `[IL-99]`, and the running comment above the assertion is the only place the bump history lives — extend it, don't replace it:

- **Measure by running the parser on the working tree; never add the delta to the old number.** The arithmetic agreeing is a check on the measurement, not the evidence for it — a parser change, or a sibling branch's own row arriving in an upstream merge, moves the total independently of your diff. Get the number from a real run, then reconcile it against your expected delta.
- **Quote a diff that actually contains the row.** `git diff -- 'plugin/skills/*/SKILL.md' | grep -E '^[-+]\|'` must return exactly the rows you claim and no others — but it returns *nothing* once the row is already committed, which is the ordinary case whenever the pin is bumped in a later commit than the row it counts. Quote the row's own commit instead (`git show {sha} -- 'plugin/skills/*/SKILL.md' | grep -E '^[-+]\|'`) or the branch range (`git diff {base}...HEAD -- 'plugin/skills/*/SKILL.md' | grep -E '^[-+]\|'`), and say in the comment which form you used. A grep that returns nothing is not evidence of a clean delta; it is evidence you ran the wrong grep.

Rows *reworded in place* change no count and need no bump — but they still belong in the comment, because the next bumper reconciling a delta against the diff will otherwise have to re-derive why the numbers moved by less than the `+`/`-` lines suggest.

## Choosing a pin/sniff signal empirically

When a test or a skill procedure must *detect* a document class (a heading, a marker, a body shape), run a corpus scan over the live population before committing to the signal: count exactly which documents each candidate signal matches, and reject any candidate that matches a document it must not. Record #1071's scan of all 234 open records proved the line-anchored `## Leaves` heading matched exactly the four real legacy parents — while the plausible alternatives ("decomposition parent" phrase, "(parent)" title/body match) false-positived on the very bug report describing the defect. The scan result belongs in the record/spec as evidence, so the accepted residual risk is grounded rather than guessed.

## Reference

- Instances: `tests/curation-judge-stagepath.test.js`, `tests/staged-patch-contract.test.js`, `tests/wrap-up-registry-pin.test.js`, `tests/hooks-gate-coverage.test.js`, `tests/skill-conventions.test.js`, `tests/blast-radius-snippet.test.js`, `tests/pipeline-run-dir-adoption-anchoring.test.js`, `tests/bin-lib/verify/snippet-conformance.test.js` (lighter argv-tokenize-direct variant), `tests/resolve-profile-invocation-conformance.test.js` (live-corpus convention enforcement, no fixture), `tests/manifesto-lever-conformance.test.js` (declared-contract pattern — one file's canonical enumeration pinned against four files that restate it by hand), `tests/fetch-sub-issues-prose-conformance.test.js` (counting assertion over `_shared/*.md`, with the counting helper proved by a synthetic intact/stripped pair and an anchor-less negative control), `tests/node-e-snippet-syntax.test.js` (live-corpus embedded-snippet sweep — generalizes `tests/sweep-backstop.test.js`'s narrow single-file `node -e` extractor to a corpus-wide sweep over `plugin/skills/**/*.md`, both quote styles, with a planted-then-reverted go-red discrimination check), `tests/console-autoresolve-needs-human-carveout.test.js` (adjacency claim as a counting helper — three-input helper proof plus a live-corpus anchor-presence assertion), `tests/multispec-boundary-freshness.test.js` (code-region-scoped literal sweep), `tests/frontier-unattended-literal.test.js` (whole-file sweep with allowlist), `tests/skill-prose-plugin-root-invocations.test.js` (a second whole-file-sweep-with-allowlist instance — #1170's ban on repo-relative `node plugin/bin/` invocations in skill prose), `tests/compare-shell-tweak-lever.test.js` (non-markdown payload — browser JS in `plugin/skills/design-wrapper/compare-shell/template.html`, pinned by structural regex over the live file because no DOM harness exists to run it in)
- Shared helper: `tests/helpers/git-fixtures.js`
- Rules: `docs/donts.md` `[IL-66]`, `[IL-78]`, `[IL-80]`, `[IL-105]`; full accounts in `docs/incident-log.md`
- Conventions for authoring the prose itself: `docs/skill-authoring.md`
