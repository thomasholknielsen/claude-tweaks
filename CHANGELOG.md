# Changelog

Every version this plugin has shipped, newest first. "Shipped" means a value the
`version` field in `.claude-plugin/plugin.json` held at the tip of `main` — the
marketplace `source` is an unpinned git URL, so an install tracks that tip, and
every distinct value it reported is a build someone could be running.
`tests/changelog-coverage.test.js` fails the suite if any of them is missing here.

Two conventions follow from how this repo works, and both are visible below:

- **A `###` subsection labelled "branch-numbered vX.Y.Z"** is work that was
  developed and written up under one number but reached users under another,
  because a concurrent worktree session claimed the number first (`[IL-12]`).
  `main`'s tip never reported the branch number, so the entry lives under the
  build that actually carried it. The original write-up is kept verbatim.
- **Entries from v1.0.0 (2026-02-20) through v5.29.0 are reconstructed** from
  commit history rather than written at release time — the changelog step was
  not part of the release convention until v6.41.0, and 103 of the first 145
  releases went undocumented (`[IL-94]`). They are summaries of what each version
  contained, not contemporaneous release notes, and they are thinner than the
  entries written since.

## v6.44.0 — The Impeccable design gate can fail again

`/claude-tweaks:test`'s Impeccable gate had been unable to fail. The installed CLI was
2.1.8, which writes findings JSON to **stderr** and leaves stdout empty, while
`skills/design-wrapper/impeccable-cli.md` documented stdout and treated an empty one as
malformed output. Every real finding therefore fell through to a skip, and skips are not
failures. The gate returned `pass` on a clean file and `skipped` on a dirty one; the `fail`
branch was unreachable.

The document claimed verification against CLI **3.2.1** — a version the machine had never
run. Two deliberate re-verification passes both missed it, because nothing ever compared
the claim to what was installed (`[IL-89]`). Both the pin and the contract are now
machine-checked: `tests/impeccable-cli-contract.test.js` replays committed fixtures against
the installed binary, with stdout and stderr captured separately, and fails when the CLI is
present at the wrong version rather than skipping. The wrapper's own availability check does
the same comparison, which is the only pin enforcement a consumer of the published plugin
ever gets.

The gate also read the wrong field. It classified on `severity`, but upstream's blocking
decision rides on a separate `advisory` boolean stamped on each finding, and the two are
near-inverted: a finding can carry `severity: "warning"` with `advisory: true` (upstream
exits 0, non-blocking) or `severity: "advisory"` with no flag (upstream exits 2, blocking).
Classifying on `severity` was wrong for 12 of the 59 registry rules in both directions —
design-token violations on a project with a `DESIGN.md` would have been waved through, while
em-dash overuse, upstream's own worked example of something safe to ignore, would have
failed the build. Three independent verifications agreed the advisory path was impossible to
reproduce before a fourth found the fixture is three lines of HTML (`[IL-90]`).

Alongside: `--fast` is dropped from the invocation (deprecated and ignored at the pin, and it
writes a deprecation note into a stream the parser reads), the `category` field is documented,
the enumerated advisory rule-id list is deleted rather than corrected — enumerating upstream's
data is what drifted the file three times — and three files that restated the invocation now
point at the one that owns it.

## v6.42.0 — Routines and merges follow the branch you name, not the GitHub default (closes #132)

Four places independently resolved "which branch is this project's current state" — which tree a
routine audits, where a task forks from, where finished work merges, and what a change's blast
radius is measured against. All four asked GitHub for its default branch. On a `dev` → `staging` →
`main` model that is the one branch nobody develops on: on the reporting repo it was 102 commits
behind the active branch **and 51 ahead of it**, divergent rather than merely stale, because urgent
fixes are cherry-picked straight onto it.

They failed differently, and the worst one had never been reported. Auto-merge aborted, which is
visible. But `merge-check` sizes a record's change by diffing against the merge base with the
default branch — and against a branch that diverged long ago, that base is ancient, so the diff
spans every commit since the fork. Blast radius came back enormous, the verdict was `needs-human`,
and the stated reason was "too many files changed." Auto-merge could never fire on such a repo, and
the log looked like the gate working correctly.

One `integration-branch` key in `.claude-tweaks/policy.yml` now answers all four, resolved through
`skills/_shared/integration-branch.md`: an explicit argument, then the key, then a branching model
documented in CLAUDE.md prose, then git — where a current branch differing from the GitHub default
is surfaced rather than silently picked, and a linked worktree's throwaway branch is never proposed
at all. Unset reproduces the old behavior per consumer, so a project that sets nothing sees no
change. A conformance test now fails on any new site that resolves the default branch without
citing the fragment — the check that would have caught this originally.

`/claude-tweaks:init` now treats `worktree.baseRef: head` as required, not merely recommended,
whenever `integration-branch` is set and differs from the repo's GitHub default: under `fresh`,
every worktree would otherwise fork from the wrong branch by construction. The plugin cannot set
that value itself — it lives in the harness's `settings.json` — so init states the requirement
explicitly and asks.

Naming the branch was only half of it: the routine preamble previously told a container that
started on the wrong branch to fast-forward, never to switch. It now says to check the target
branch out.

Existing live routines hold a frozen copy of their creation-time prompt and do not pick this up on
their own. Every `template_version` is bumped, so `/claude-tweaks:routine status --all` reports
them as Drifted and `update <skill>` rewrites the live prompt in place;
`_shared/routine-template-schema.md` documents the case that recourse cannot reach — a routine
created outside this skill, with no record.

## v6.41.0 — Every shipped version has a changelog entry, and a gate that keeps it that way

This file documented 59 of the 145 versions that had shipped. The other 103 —
whole features, not only patches — had no entry, and 11 entries named versions
`main`'s tip never reported. It had been accumulating since v1.0.0 in February
2026, and nothing had gone wrong from the repo's point of view, because nothing
was checking.

The step was never written down. CLAUDE.md's "Releasing (two repos)" specified
the version bump and the marketplace mirror in detail and did not mention the
changelog once; its only occurrence of the word sat in a parenthetical about
where *not* to write a version number early. So entries were not being forgotten
against a procedure — there was no procedure, and whether a release got one
depended on whether someone happened to think of it.

Three changes, of which only the first is enforcement:

- **`tests/changelog-coverage.test.js`** reconstructs every version `main`'s tip
  ever reported and fails the suite on any that lacks an entry, on a heading the
  parser can't read or that appears twice, and on an entry naming a version that
  never shipped. The reconstruction walks the release branch's own first-parent
  chain and reads each commit's manifest blob (`bin/lib/changelog-git.js`);
  walking `git log --first-parent -- <manifest>` instead finds bump commits on
  side branches, which is a different set whenever two sessions bump
  concurrently — this repo's normal mode. The first version of the analysis used
  that wrong walk and disagreed with the right one about 11 versions. On a
  shallow clone the check skips and says so rather than passing silently.
- **`checkPluginVersionBump`** now names the changelog alongside the marketplace
  mirror. It had fired on exactly the right event since 6.12.1 — any commit
  touching `plugin.json` — while mentioning only half of what that event obliges,
  and its test asserted `/marketplace/i` and passed throughout. Both halves are
  asserted separately now.
- **CLAUDE.md's Releasing section** gained the step as step 2, including why the
  heading shape is load-bearing rather than cosmetic.

The backfill fills all 103 gaps, back to the initial scaffold on 2026-02-20.
Entries through v5.29.0 are reconstructed from commit history and are thinner
than those written since. Two second-order defects surfaced while doing it and
are also fixed. Six early headings (`## v4.1`, `## v4.2 — Token Saver`) matched
neither the parser's strict `X.Y.Z` nor its em-dash title, so
`/claude-tweaks:init`'s upgrade notice had been silently omitting those releases
from every range it reported; they are normalized. And the 11 orphans are the
residue of version collisions (`[IL-12]`) — the manifest got renumbered, the
heading kept the branch's number, and a user on 6.38.3 was reading about
"v6.39.0" under a number no install ever reported. Each is folded into the
version that carried it, verbatim, as a `###` subsection labelled with its
branch number.

Recorded as `[IL-94]`.

## v6.40.0 — One statement of what the worktree gate covers, pinned to the code (closes #138, #139)

The `worktree.always` gate was widened twice on 2026-07-20 — `c8f929e1` added `git push`
beside `git commit`, `cab6142b` added Bash `cp`/`mv`/`tee`. Both correct, both tested,
neither swept the prose. Five skill files went on describing the pre-widening gate, and three
of them prescribed procedures the widened gate denies:

- `wrap-up/cleanup-procedures.md` claimed a bare `cp` wasn't gated, so every
  `worktree.always` project silently lost `decisions.md` and `config.yml` at every wrap-up.
  Issue #32 had *closed* that same data-loss bug by adding the `cp` — its verification never
  ran under the policy.
- `wrap-up/review-console.md`'s headless fast-lane auto-merge pushed from the main checkout,
  where the push is denied and no human is present to see it.
- `flow/materialize.md` told the pipeline to commit the materialized record on the
  pre-worktree branch, which cannot execute under the policy at all (#139).
- `flow/worktree-merge.md` and `_shared/git-discipline.md` both stated flatly that
  `git push` is never gated.

All five corrected. The durable part is the binding: `pre-tool-use.js` exports a
`GATE_COVERAGE` constant it actually branches on, `_shared/policy-schema.md` carries the
single prose statement between marker comments, every other file cites it rather than
restating it, and `tests/hooks-gate-coverage.test.js` fails when the two diverge. Widening
the gate again now breaks a test until the canonical block is updated — and one edit
suffices, because nothing else holds a copy.

Also new: the gate's one path-prefix exemption. File writes under a repo's own
`.claude-tweaks/pipelines/` are allowed from anywhere, since that directory is plugin-owned,
gitignored bookkeeping rather than the project work the gate isolates. It applies to
file-write targets only — a `git commit`/`git push` target is the command's *working
directory*, so exempting those by prefix would permit any commit issued from inside a run
dir — and it fails closed on any path it cannot prove.

Found by grepping the *procedure shape* (`git push`, `cp`/`mv`/`tee`), not the keyword:
`materialize.md` and `review-console.md` never mention the gate, so their defect is silence.
That sweep turned up the fifth site after four were already known. Recorded as `[IL-93]`.

## v6.39.4 — The worktree gate stops failing open under load (closes #134)

`bin/lib/hooks/git-exec.js` ran every git query with a fixed 3000 ms budget and a bare
`catch { return null }`. That `null` reached `repoInfo()`, which returned `repoRoot: null`,
which `pre-tool-use.js` read as `// not a git repo at all -> allow`. The comment named one
cause. A `rev-parse` that timed out under load was a second, and it landed on the same
branch — so on a busy machine the `worktree.always` gate silently stopped denying.

This surfaced as `tests/hooks-*` flakiness and was originally filed as a test problem. It
was not. Four of the reproduced failures are precisely the tests asserting the gate *denies*;
they failed because it allowed.

Measurement drove the fix rather than intuition. The enforcement-critical `rev-parse`'s
maximum duration scales monotonically with load — 411 ms idle, 752 ms under one competing
suite, 1856 ms under three, 2492 ms under 24 workers plus two suites. That last figure is
83% of the old budget, on a repo whose normal working mode is several parallel worktree
sessions. Across 1000+ instrumented spawns at every load level there were zero `EAGAIN` and
zero `ENOMEM`: the OS never declined to fork, so this is latency against a fixed ceiling,
not resource exhaustion. The clinching datum was a test doing `mkdtemp` + `git init` +
`git commit` + one `repoInfo` call taking 5904 ms — fixture spawns peak at 2884 ms, and
2.9 s plus a fully consumed 3.0 s timeout is 5.9 s.

Three changes follow from that:

- **`execGit` became `runGit`**, returning `{ stdout, failure }` where `failure` distinguishes
  `timeout` / `spawn` / `no-git` from `git-error`. Only the last is an *answer*; the others
  mean the question went unasked. The rename is load-bearing: with a richer return, a call
  site left un-migrated would keep parsing and read an always-truthy object as success —
  failing silently in the dangerous direction (`[IL-31]`). A rename makes any miss a
  `ReferenceError`. The budget is now 10000 ms, ~4x the measured peak, and it is a ceiling
  rather than a cost (the normal case is ~45 ms).
- **`repoInfo` gained a third state.** `indeterminate: true` means `repoRoot: null` carries no
  information; `indeterminate: false` means git genuinely answered. Two independent routes to
  a null root — the git failure, and a `safeReal` that throws — now both report it honestly.
- **The gate still allows on indeterminate, deliberately** — CLAUDE.md's hooks contract is
  never-break-a-session, and denying on a transient load spike would freeze unattended runs.
  What changed is that it is no longer *silent*: it emits a `systemMessage` naming the paths it
  could not check. That warning is attached in a wrapper around `run()` rather than at its
  dozen return sites, because enumerating termination paths is how the omission in `[IL-14]`
  happened.

`tests/helpers/git-fixtures.js` also passed no `timeout` at all, making fixture setup
unbounded by construction; it now carries a 30 s ceiling whose only job is to turn a hang into
an error that names itself.

The hooks e2e suites stay in `npm test` rather than moving to `perf/` as v6.38.1 did for the
statusline render budget. That precedent does not transfer: v6.38.1 relocated a *performance*
assertion, which is what `perf/` is for, whereas these assert behavior. Applying its remedy
here reflexively would have silenced the flake and left the enforcement gap live and
undetectable — the tests were not misbehaving, they were correctly reporting a production
defect.

## v6.39.3 — Correct the gh-CLI dependency claim; record IL-91

Wrap-up findings from the #129 investigation. No behavior change.

- **The Stack table called `gh` "required" whenever `work-backend: github-issues` is active.**
  That has been overstated since 6.24.0: `_shared/github-write-transport.md` maps the whole
  work-record CRUD surface (list-by-label, create, edit/label, comment, close) onto GitHub MCP
  equivalents, and `_shared/issue-claims.md`'s file-blob claim lock stands in for the ref-level
  one. Narrowed to "default transport, not a hard requirement," naming the MCP path. The row
  mattered because it told a reader that a `gh`-less environment cannot do this work — which is
  precisely the cloud-sandbox shape #129 is about, and it had been wrong since the release whose
  absence caused #129's symptom.
- **`[IL-91]`** — in zsh, `"$ref:path"` applies the `:s` parameter-expansion modifier and
  silently mangles the ref; with `2>/dev/null` the command returns empty rather than erroring. A
  `git show` loop over three refs reported zero matches for a string that was plainly present,
  and nearly pinned #129's root cause on the wrong repository.

## v6.39.2 — One broken journey no longer pins journey-health's rotation (closes #131)

`journey-health`'s Phase 0 force-picks any journey declaring a `files:` path that no longer
exists — a certain, judgment-free drift signal, and the right thing to surface ahead of
staleness and churn. It consulted no cursor at all, by design, which meant a journey whose
declared file was *genuinely* deleted was re-picked on every firing indefinitely: the file
stays deleted until a human edits the frontmatter, so the condition that selected it never
clears. Its within-batch `alreadyPicked` guard only dedups inside one `--budget` call.

Measured on the reporting repo: 17 journeys, ~9 days of daily firings, and a persisted cursor
map containing exactly one journey plus `__coverageScan`. Sixteen were never audited. Fixing
the pinned journey's frontmatter only moved the pin to the next journey alphabetically, which
had three missing declared files behind it. The starvation was also invisible in the issue
stream — dedup swallowed the repeat finding every time, so nothing surfaced the repetition.

The force-pick now fires once per distinct missing set rather than once per firing. The
light-tier `validate-findings` call records the audited journey's missing set on its cursor
(`deletedFileSig`, recomputed from the tree as it stands when the audit finishes), and Phase 0
skips a journey whose live missing set already matches what's recorded. The signal is kept in
full: a *new* file going missing behind an already-reported one is a different set and still
force-picks immediately, a restored file clears the acknowledgement, and an unfixed journey
still comes back around on Phase 1's normal 30-day staleness floor. Deep-tier audits never
write the field — Phase 0 is light-tier only, so a deep audit must not suppress a light
force-pick that never happened.

This is distinct from #73, which fixed the adjacent *glob* false-positive (a `files:` entry
like `docs/**/*.md` reading as missing). That was a wrong signal; this was a correct signal
with no off switch. It is also distinct from #130 (v6.39.1, immediately below), which fixed the
shared rotation core's Phase 1: the two compose — Phase 0 now hands a journey off to the
rotation, and Phase 1 now actually rotates. Neither one alone gives the coverage both were meant
to provide; all 184 journey-health tests were verified green against #130's rewritten
`rotation.js` before either landed.

### Health rotation reaches past its alphabetical prefix (closes #130) — branch-numbered v6.39.1

`health-core/rotation.js`'s Phase 1 returned on the *first* candidate past `staleDays`
rather than the most overdue one. Since every engine's `scope.js` sorts candidates by id
and each run advances exactly one slice, coverage was a strict alphabetical march at one
slice per run — and by run number `staleDays` the head of the list had re-crossed the
threshold and was force-picked again, long before the march reached the tail.

Everything ranked past position ≈ `staleDays` was therefore permanently unreachable. Not
a slow rotation: an unreachable one. Measured on a real repo, docs-health could never
audit ~59% of its 146 docs (`staleDays` 60), and code-health >90% of its several hundred
slices (`MAX_STALE_DAYS` 30). One repo's docs-health had spent 19 days on `REGISTRY` plus
`decisions/ADR-001` through `ADR-004`, still inside the alphabetically-first directory.

Phase 1 now selects `max(daysSince)`, applying the existing `tieBreakKey` to equal
staleness — which matters more here than in Phase 2, since every never-audited candidate
sits at `Infinity` and a fresh repo's whole pool is one big tie. All four engines share
this module, so all four are fixed at once.

A consequence worth naming: each engine's explicit candidate sort is now a determinism
detail rather than the coverage mechanism. Selection no longer depends on the order
candidates arrive in. `code-health/scope.js`'s comment, which justified its sort on
first-qualifying-wins grounds, is corrected to match.

The regression test runs the starvation model forward — 90 candidates against a 30-day
threshold, one pick per simulated day — and asserts the full set is covered with no
repeats. It fails on the old implementation at 31 of 90.

### Routines report which build they resolved (closes #129) — branch-numbered v6.39.0

A scheduled `dispatch next` Routine hard-gated on `gh` being absent — the gate 6.24.0 had
already replaced with an MCP branch — and described `dispatch/SKILL.md` as having no MCP
claim path at all. Both statements are accurate about 6.23.7 and false about the build the
marketplace was serving. The sandbox had been running pre-fix code for days while its setup
script's `claude plugin update` reported success on every firing.

`claude plugin update` compares the installed version *string* against the *local* marketplace
catalog and inspects nothing else. Emptying a cached plugin directory of its files and
re-running it yields `already at the latest version (6.38.1)` and exit 0, repairing nothing;
pointing an installation record at an older directory yields the same line; so does a catalog
that failed to refresh, since the comparison then measures the sandbox against itself. Three
broken states and one healthy one produce identical logs — which is why the investigation
behind #129 first concluded `dispatch`'s gate was still wrong.

- **Every routine prompt now opens by printing the build it resolved**, read from
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — the directory the running skill files
  were loaded from, and the only source that cannot disagree with them. Added to the standard
  preamble in `_shared/routine-template-schema.md` and to all six `routine-template.yml`
  files, each with its `template_version` bumped so `/claude-tweaks:routine status` reports
  the drift. Live routines carry a frozen copy of their prompt and pick this up only via
  `/claude-tweaks:routine update {skill}`.
- **`dispatch`'s headless self-report records the resolved build** on the issue it files, and
  on a deduplicated re-file adds one comment per *distinct* build. The marker asks "has this
  check been reported," whose answer stays yes forever; the build line asks "has this build
  been seen failing it," whose answer changes when a sandbox is repaired or silently rolls
  back. #129's own self-report issue sat silent through three later firings without it.
- **The generated cloud setup script verifies instead of trusting.** Marketplace `update`
  failures are no longer silenced to `/dev/null` — a catalog that failed to refresh is the
  precondition that makes every version check downstream meaningless. After the install loop,
  each plugin's version is resolved from the directory a session would actually load,
  compared against the catalog, and reinstalled on drift. `claude plugin list`'s recorded
  `version` and `installed_plugins.json`'s `gitCommitSha` are deliberately not used: the
  former is metadata beside the directory rather than out of it, and the latter is not
  refreshed by `claude plugin update` at all.
- New regression test asserting all six templates' preambles still match the canonical block
  in `_shared/routine-template-schema.md`, and `[IL-89]` recording the general rule.

## v6.38.3 — journey-health's deleted-file pick fires once per missing set (2026-08-06)

The #131 fix reached `main` under this number and was then renumbered to 6.39.2
after a collision, so both versions shipped and both carry it. The write-up is
in the 6.39.2 entry above.

## v6.38.1 — Timing budgets leave the correctness suite (closes #107)

`tests/statusline.test.js`'s render-time assertion failed whenever another agent session ran
its own `npm test` in a sibling worktree — a routine occurrence in this repo, not an edge
case. Best-of-7 at a 1000 ms threshold was already a load mitigation and was not enough.

Measuring the problem rather than retuning the threshold showed the assertion was mostly not
about the renderer. A bare `node -e ""` spawn with the same temp-HOME setup costs ~34 ms
against a ~58 ms full statusline spawn, so ~59% of what it timed was Node process startup —
and startup is also the term that inflates under load. A competing `npm test` pushed that
control spawn from 34 ms to 566 ms, a 16x swing in something the renderer neither owns nor
can influence.

Subtracting a control spawn was tried first and rejected on evidence: under a real competing
suite the *difference* still reached 573 ms against a 250 ms budget, because contention
inflates both terms unequally. A ratio bound was rejected for the opposite reason — it is
stable under load (1.7x idle, 1.8-2.5x saturated) but a fixed-size regression becomes
proportionally invisible as the baseline grows, so it would miss under load exactly the
regression it catches when idle.

The assertion therefore moves to `perf/`, run via `npm run test:perf` and excluded from
`npm test`. Correctness runs are now deterministic under concurrent load; the performance
bound is kept, not deleted. It also got stricter in the move: the budget is now 250 ms of
render cost above a bare-Node control rather than 1000 ms absolute, and a 300 ms injected
stall fails it at 335 ms of render cost — while its 422 ms absolute would have passed the
threshold it replaces.

Removing it also takes ~21 s off every full run under load, and ~450 ms idle.

## v6.38.0 — The last two legacy families (closes #128)

v6.36.0 claimed nine legacy families removed and shipped seven. The two it missed
are gone now, with every consumer they reached, not just their defining sections.

**The retired Auto-mode-policy block.** `LEGACY_CLAUDE_MD_LEVER_KEYS` and the
`legacyClaudeMdLevers` field are gone from `bin/lib/policy-schema.js`, so
`auditPolicy` returns `{unrecognizedKeys, invalidValues}` and nothing else. That
field had reached further than the defining constant: `/claude-tweaks:harness-health`
filtered its policy-schema findings by the eight legacy lever names and explicitly
deferred to `/init`'s migration offer; `/tidy` and `/build` each resolved a lever
through a CLAUDE.md fallback; `/flow` documented two survey levers as living under
the retired section. All re-pointed. `/init` Update Mode's `### Auto-Mode-Policy
Migration` section is removed outright — with the block no longer generated and the
alias no longer read, a migration offer had nothing left to migrate.

**The legacy `auth.yml` split and v1 stories format.** `skills/stories/migration.md`
is deleted, along with `/stories`' v1 detection step, its `migrate` argument, and the
`auth.yml` detection branch in `auth-resolution.md`. `/test`'s legacy path went with
it — including the prompt template that passed plaintext credentials to the model,
which the vault-based path (`auth: { vault: "<name>" }`) has superseded since v3.

That file reached further than #128's own list: `_shared/dev-url-detection.md` still
described `auth.yml` as a credential home beside the vault and offered to gitignore
it, `/init`'s gitignore template seeded the entry, and `/demo` and `/help` both named
it as a live auth source. All re-pointed at the vault. The wider surface was found by
sweeping centrally after the listed sites were done, not from the issue body.

The plan's STOP condition was honoured rather than assumed: no tracked `auth.yml` or
story file exists, so nothing live depended on the removed form. The reverse
fixture obligation was checked too — no eval asserts on `legacyClaudeMdLevers`, so
removing it left no assertion to repair. `evals/fixtures/*/CLAUDE.md` still carry a
`## Auto-mode policy` block and are deliberately untouched: they are frozen test
inputs, and a fixture that tracks live content fails exactly when the next migration
makes it riskiest (`[IL-80]`).

The 19 `legacyClaudeMdLevers` tests in `tests/policy-schema.test.js` are removed
rather than skipped — three named blocks plus sixteen generated by an eight-lever
loop, taking the suite from 406 to 387. One survivor was rewritten to keep proving
that both config sources are audited, which was the only non-legacy thing it tested.

## v6.37.1 — Fix six dangling "check 10" references shipped in 6.37.0

Resolving the legacy-purge merge retired harness-health's old check 9 and
renumbered the new context-cost bloat scan from 10 to 9. The numbered list item was
renumbered; the prose references to it were not. `_shared/harness-health-analysis.md`
and `harness-health/judge-procedure.md` each shipped three sentences pointing a judge
agent at "check 10" in a list that now ends at 9.

Prose-only, so no test caught it — and `harness-health-analysis.md` is inlined into
every dispatched judge agent, so the dangling reference reached every one of them.

The renumbering discipline this violates (`[IL-55]`: verify topic-consistency after a
renumber rather than expecting a grep to return nothing) was applied to `/help`'s
Priority Order in the same release and skipped here.

## v6.37.0 — Skill-bloat reduction Phase 3: Anti-Pattern compression, extraction, and a detector

Closes the three-phase effort. The shipped `SKILL.md` payload — the context re-emitted on
every skill invocation and once per dispatched subagent — is down from **931.1 KB to
727.8 KB, a 203.3 KB (21.8%) reduction**, and **no file is over CLAUDE.md's 40 KB ceiling**
for the first time (the largest is now `init` at 39.2 KB, from 58 KB).

**Anti-Patterns compressed in place, never evicted.** All 32 tables tightened for 13.6 KB
(18.9%) with every row preserved and every backticked identifier intact — verified
mechanically, because an Anti-Pattern row is a negative instruction and deleting one
degrades silently: nothing observable happens when the model stops being told not to do
something. The guard was built and deliberately falsified *before* any rewriting.

This is short of the ~40% the design projected, and the projection was the thing that was
wrong. Six agents worked disjoint file sets, could not see each other, and all six landed
between 18% and 21% with the same finding: a Pattern cell names the forbidden thing, so
compressing it spends specificity rather than bytes, and the Why cells were already one
clause carrying identifiers and enumerations. The remaining lever — merging semantically
overlapping rows — needs a human deciding which guardrails may share a row, so nobody took
it silently.

**Five oversized files extracted** (#119, re-scoped). Its premise was a prose diet
estimated at ~150 KB; measuring first — the issue's own deliverable, never done — found the
four named species occur **26 times** in total. The size was structural: `review`'s Step 3
alone was 17.7 KB. Extraction followed the citation-shape rule, one sub-file per unit a stub
actually names, with every extracted heading left as a stub so external references still
resolve in one hop. Verified per file that every substantive original line survives
somewhere in that skill's file set.

**A detector so none of it regrows** (#120). A harness-health bloat criterion covering
over-ceiling files, over-long rows, provenance narration, and degenerate tables, calibrated
against the cleaned corpus rather than the old one — which is why it was sequenced last.
Plus an eval context-cost regression check that reports and skips rather than silently
passing when there is no baseline.

The house-structure check now runs corpus-wide, and migrating the three duplicate copies onto
the shared helper fixed a check that had been passing vacuously: every `SKILL.md`'s
interaction directive contains the backticked text `## Next Actions`, so the old
`body.indexOf()` matched that mention — position 906 in `code-health` — instead of the real
heading at 35835, making the ordering assertion trivially true. Proven by breaking three
skills so the order really was wrong: the old check passed on every one.

`/help` also gained the two behaviours it had documented but never implemented (#121, #122).

## v6.36.0 — Most backward-compatibility paths removed

Nine legacy families and no deprecation policy documented anywhere. The marketplace
source is an unpinned git URL tracking `main` HEAD, so there were never pinned
versions in the wild to support.

Removed: the legacy spec-file alias (a bare number resolving to `specs/{N}-*.md`
alongside `#N`), the `specs/` tracking files, the four `triage-*` policy aliases,
the `backlog-backend` flag alias, and the legacy-taxonomy scan.

**Correction (2026-08-05).** This entry as first published also claimed the retired
Auto-mode-policy block migration "and its supporting machinery" and the legacy
`auth.yml` split and v1 stories format were removed. Neither was — both families
are still live, and the heading said "Every" when it should have said "Most". The
entry was written from the plan's prewritten text rather than verified against the
tree, the exact failure `[IL-71]` describes. Both families were tracked in #128 and
removed in v6.38.0 — the heading here stays "Most", because it describes what this
release actually shipped.

`backlog-backend` was the one that had already crossed into wrong behavior: three
skills read it, every other consumer silently defaulted to `local-files`, and
`README.md` documented that rather than fixing it. Partial aliasing is worse than
either full aliasing or none.

Removing the spec-file alias took two changes past renaming. `/flow`'s pre-flight
2.4 (spec-committed check) was gated "legacy spec-file alias only" and lost its
last consumer, so the check and its `validation.md` section are gone. `/init`'s
Step 3 wrote `specs/INDEX.md`, its only starter file; the step keeps its number
(repurposed to the work-record-storage note) so surrounding references still
resolve. Bare ids under `work-backend: local-files` are untouched throughout —
that is a current input form, not the alias.

The `status:in-progress` label was deleted after resolving a contradiction — it is
retired vocabulary, but its GitHub label description pointed at
`_shared/issue-claims.md`, which uses `bot:in-progress` and never mentions it.
`[IL-85]` records the general lesson: a compatibility path with no stated removal
condition is never collected.

## v6.35.0 — Adopter CLAUDE.md carries only what always-loaded context needs

`/claude-tweaks:init` wrote byte-identical boilerplate into every adopting project's
CLAUDE.md, inherited by every dispatched subagent and competing against the
`harness-health.always-loaded-budget` before the project contributed a word. The
template now carries only content that must reach the model on a turn where no
claude-tweaks skill was invoked. `## Working Approach` (1,561 B) and `## Philosophy`
(200 B) are untouched — they govern ad-hoc work where no skill gate fires. The
Pipeline section keeps its four routing paragraphs and loses the bookend-architecture
detail, the run-dir mechanics, and the auto-mode flag explanation, all of which are
only consulted once `/flow` is already running, dropping from 2,468 B to 847 B.

`## Project Defaults` is deleted outright (1,287 B to 0 B). `markdown-mode` and
`directory` had no reader anywhere — confirmed structurally, not inferred from a
keyword search (the `directory` result is consistent with
`step-06-worktree-configuration.md` requiring worktree detection to use `git worktree
list` rather than a configured name). `execution-strategy` and `git-strategy` gained
`policy.yml` paths and `POLICY_KEYS` entries, which had never validated them.
`section-confirmation`, `merge-check`, and `scope-keywords-required` turned out to
already be in `POLICY_KEYS`, contradicting the schema doc's claim that they had no
`policy.yml` path.

`execution.always` is corrected. It was documented as locking the execution axis "to
`subagent` only" while typed as `enum ['subagent','batched']`. `build/SKILL.md`
confirms the lock generalizes to whichever value is set; both rows now state the
distinction from `execution-strategy` (a lock versus an overridable default).

Resolution chains are repointed. `/flow`'s `git-strategy` and `execution-strategy`
chains, and `/build`'s own default-resolution section they defer to, named CLAUDE.md
as the source for keys the template no longer writes. `auto-mode` keeps both sources
named — it is genuinely dual-homed.

Measured across the whole Initial Mode Template body — exiting at the first
subsequent `## ` heading rather than one section past it — the total drops from
6,462 B to 3,554 B, a 2,908 B (-45%) reduction that reconciles exactly against the
two changes above: 2,468 - 847 = 1,621, plus the 1,287 from Project Defaults, equals
2,908.

`/claude-tweaks:init` Update Mode detected CLAUDE.md drift with four hand-maintained
greps for contract-version markers. `Working Approach` and `Philosophy` appeared zero
times in `update-mode.md`, so a project adopting the plugin with an existing
CLAUDE.md reliably got the pipeline plumbing offered as patches and never the two
sections that shape how the model behaves. The replacement
(`bin/lib/init/claude-md-conformance.js`) is deterministic and reads the template
live, so a future template change needs no edit here. It reports *drift* as well as
absence — an edited plugin-authored section was previously invisible. A completeness
assertion fails if any template section belongs to neither the plugin-authored nor
project-authored list, so a newly added section cannot silently escape the check.

`/claude-tweaks:wrap-up` gains Step 7.9, a CLAUDE.md audit behind an applicability
gate, opening on a Don't candidate, a renamed command, a contradicted convention, or
a recorded incident, and reusing `_shared/harness-health-analysis.md` — the
procedure Step 7 already applies to skills. Its closed-gate summary reports "audit
not run" rather than "no findings", since a gate that never opened is otherwise
indistinguishable from a clean CLAUDE.md. Findings surface at the Review Console's
Configuration updates section and are always offered, never auto-applied.

## v6.34.0 — Skill-bloat reduction Phase 2: the Relationship table leaves the payload

Every `skills/*/SKILL.md` carried a `## Relationship to Other Skills` table describing
how that skill related to the others. All 32 are gone, removing **130,677 bytes —
127.6 KB, 13.8% of every SKILL.md byte in the plugin** — from the context re-emitted on
each invocation. Measured before and after across the 32 files, not projected; Phase 1's
figures went stale exactly by carrying a projection forward.

The removal rests on reading all 510 rows against the files they described and asking one
question of each: does this bind what the model does while executing *this* skill? Twenty
rows did — 3.9%, with 24 of the 32 skills at zero. Those moved into the step bodies that
use them, rewritten as instructions rather than third-person description. The rest
documented relationships a running model never acts on, and they now live once in
`docs/skill-graph.md`, which ships to nobody: `PLUGIN_SNAPSHOT_DIRS` covers
`.claude-plugin`, `skills`, `agents`, `hooks`, `bin`, and `commands`, not `docs/`.

Collapsing 212 navigational rows into 173 graph entries merged 39 reciprocal pairs — the
direct cost of the bidirectional cross-reference convention this replaces, which required
every edge in two places. That convention is retired; `CLAUDE.md` now requires each edge
stated once in the graph, and `bin/lib/skill-audit`'s parser, written to perform the
migration, stays on as the guard against the tables creeping back one skill at a time.

Stating each edge once immediately exposed drift the two copies had been hiding. `/tidy`
queried `--label by:code-health` while its own table claimed the bare form. `/backlog`
credited `overview` mode's recommendations to `groupByFileOverlap`, which it never calls.
`/tidy` credited `extractFingerprint` to its Sync payload; it is a dedup helper.
`/design-wrapper` and `/ledger` appeared to contradict each other about ledger writes —
neither was wrong, `/flow` does the writing. And `DESIGN.json` turned out to be a phantom:
three files promised token extraction from it while the one procedure they all delegate to
reads `DESIGN.md` only. Two behaviours `/help` documented but never implemented are filed
as #121 and #122 rather than quietly deleted with their rows.

## v6.33.0 — Skill-bloat reduction Phase 1: directive compression + one-line lifecycle markers

Two independent levers against the same 32 `skills/*/SKILL.md` files, both re-emitted
verbatim on every invocation. The interaction-style directive was byte-identical
across all 32 skills; compressing it from 570 B to 327 B initially dropped its
"resolve each before showing the next" sequencing clause — a rule that now lives
only in the shipped skill files, since CLAUDE.md does not ship with the plugin. A
final review caught the drop and restored the clause, landing the directive at
357 B and saving 6,816 B in total. Ten of the skills — `capture`, `challenge`,
`design-wrapper`, `init`, `review`, `specify`, `stories`, `test`, `version`,
`wrap-up` — carried a linear ASCII lifecycle diagram whose only informational
content was that skill's position in the pipeline; each is now a one-line
`Lifecycle:` marker, saving a further 2,685 B. The same review widened `/help`'s
own diagram to list all ten pipeline skills instead of seven (+467 B) and removed
a self-contradicting sentence from `version` and `design-wrapper`'s subtitles
(−82 B). Net across the 32 files: 9,116 bytes (8.9 KB) removed from
per-invocation context, measured directly rather than estimated.

The directive stays inline in each skill rather than moving to a single
CLAUDE.md-hosted copy. CLAUDE.md is a repo file, not a shipped plugin asset — the
plugin distributes only `.claude-plugin`, `skills`, `agents`, `hooks`, `bin`, and
`commands` — so a pointer there would resolve to nothing for an installed user.

## v6.32.0 — Token-audit batch: bounded tool output, split fragments, corrected cardinalities (closes #90, #91, #100; refs #96)

Four records from the token/context optimization audit. The through-line is that
every one of their issue bodies was factually wrong, and re-deriving each claim
against the live files — rather than implementing what the record asked for —
changed the deliverable in all four.

External tool output is now bounded at the point of invocation. `/code-health`'s
tool-assist commands carry `jq` projections or `head`/`tail` caps instead of
emitting raw JSON that routinely runs past 200 KB; `/docs-health`'s executed
command blocks redirect to a temp file and inspect exit status plus `tail -20`,
since the check is whether a documented command still works, not what it prints.
The `gh` list calls that inherited `gh`'s implicit default of 30 now carry an
explicit `--limit` — that default silently truncated rather than erroring, making
it a correctness bug as much as a cost one. The unbounded-execution instruction
turned out to live in `docs-health/judge-procedure.md`, the file inlined verbatim
into each judge agent's prompt, not in `SKILL.md` where the record placed it.

Two `_shared/` fragments were read whole by consumers needing one section. The
config-key table and the memory-specific checks now live in their own fragments,
so a config-key-only consumer loads 4.8 KB instead of 22.7 KB and a memory audit
loads 5.2 KB instead of 34.3 KB. Both parents keep the original heading as a stub
naming the child, so citations still resolve in one hop. Two further splits the
record proposed were measured and skipped: every citation of the permission matrix
and of the new-skill-gap steps reads them alongside their parent, so both would
have been net-negative on every path.

Template A gained a 15-row cap with a mandatory `+N more` overflow row — ordering
by severity is what makes truncation safe, and the marker is non-optional so no
finding is silently dropped. Two dispatch sites that omitted a model tier now
declare one.

Roughly thirty restated cardinalities were corrected, most by replacing the number
with a by-reference deferral rather than a new literal. Three files contradicted
themselves and now state each fact once. `IL-77` records the case that shaped the
approach: the lifecycle diagram's title said "18 core labels" against a true count
of 24, but its own table lists 18 rows, so writing the correct number would have
contradicted the data printed directly beneath it.

## v6.31.0 — merge-check judges behavior delta, not diff size or file path (closes #78)

`merge-check`'s instruction-file floor named `skills/**` and `agents/**` — this
repository's own layout. In any project where the plugin is the harness it never
matched `.claude/skills/`, missed `.claude/agents/`, and never covered
`.claude/rules/` at all, leaving `CLAUDE.md` — the highest-leverage instruction
file a project has — with weaker merge protection than a single skill file. The
floor now resolves by role: any file the harness loads as instruction rather than
as subject matter.

The floor also gained an escape. Previously every instruction-file change was
`needs-human` regardless of content, so a backlog refine run over harness-health
drift fixes returned a uniform withhold — a caution that fires on everything stops
carrying information. The escape is a refutation attempt rather than a
mechanical-or-substantive classification: name a behavior an agent could take
differently after the edit, and pass only when the attempt comes up empty.

Blast radius stopped being a proxy for risk on its own. `automerge-max-lines`/
`automerge-max-files` now bind only once a diff is judged to carry behavior change
at all. `blastRadiusSummary` reports whole-diff totals with no per-hunk breakdown,
so that judgment is deliberately a binary on the whole diff rather than an attempt
to size some fraction of it. A large diff in which every hunk is the same
behavior-preserving transformation, with a clean review, is no longer leaned
against for its size alone.

`grant-check` recommends on content and states plainly that `merge-check` re-judges
the real diff, so a grant authorizes an attempt rather than promising a merge. Its
Anti-Patterns row — which said "new-or-changed … regardless of how clean or small"
and silently overrode Step 2's own "substantially editing" qualifier — is replaced.
Calibration cases now live in the skill rather than in a design doc, since the
previous anchor was a design doc and it was pruned.

### Mode-conditional and headless-path content stops loading unconditionally (closes #89, #82; refs #93) — branch-numbered v6.30.0

Three independent passes at the same defect: procedure that only one branch of a
run will ever execute, loaded on every run.

`/claude-tweaks:routine`, `/specify`, `/tidy` and `/dispatch` inlined
mutually-exclusive mode bodies. Each now resolves its mode first and reads only
that branch, across 11 new sub-files. Every step number and section heading stays
in place as a stub, so the ~15 external references that name them
(`CREATE Step 4`, `STATUS Step 2`, `SKILL.md`'s Shaping mode, the Action
Vocabulary) still resolve in one hop. Measured per-mode: `/routine status --all`
-26.8 KB, `/specify` shaping -26.0 KB, `/dispatch`'s common gh-present path
-6.7 KB, `/tidy` -0.9 to -7.3 KB depending on mode and backend.

Two deliberate deviations from #89's plan. `/routine`'s CREATE and UPDATE share
one file rather than the proposed two, because UPDATE reuses five of CREATE's
nine steps by name and splitting them would make an `update` run read CREATE's
file anyway. `/dispatch`'s local-files Preflight stop stays inline — it is a
safety gate and must be seen before any action.

`/code-health`'s `next-slice` went exactly one level deep, so with no workspace
manifest this repo's `bin` was a single 1,181,325 B slice across 208 files, which
Step 3 told the judge to read in full. Slices are now capped at 30 KB by bytes,
splitting recursively; every file still lands in exactly one slice and total bytes
are conserved (12 -> 35 slices here, worst case down to 210,202 B).

The four health skills each inlined the whole ask-before-file gate, which is
interactive-only by its own rule — so every scheduled Routine firing, their
primary path, carried 2.1-2.4 KB it would never execute. Each consumer now
carries a short interactive-only pointer instead.

## v6.29.0 — Behavior-delta merge judgment, in progress (2026-08-03)

The design and first implementation of merge-check judging behavior delta rather
than diff size or file path (refs #78). `main` briefly reported 6.29.0 before a
concurrent bump moved the release to 6.31.0, where the finished feature is
written up.

## v6.28.0 — Dispatched agents get their procedure inlined, not a pointer (closes #94, #101, #110)

Both `/claude-tweaks:docs-health` and `/claude-tweaks:harness-health` told parallel
Task agents to apply a procedure they were handed only a *path* to. Agents see
nothing but their own prompt, so a path reaches nothing — docs-health's references
(`"Step 3 above"`, its SKILL.md by path) were unresolvable outright, making agents
emit malformed output rather than merely expensive output; harness-health's
resolved, but made every agent in a `--budget` batch independently read a 34,314 B
fragment.

Each skill now owns a self-contained `judge-procedure.md` that its dispatch inlines
verbatim, with a meta lead above a horizontal rule and the agent-facing body below.
Neither shared criteria fragment changed — `_shared/criteria-docs-diataxis.md` keeps
all 7 of its consumers and `_shared/harness-health-analysis.md` all 13, none touched.
A test in each skill enforces the self-containment invariant the extraction rests on,
and both were verified to discriminate by injecting the exact regression.

Also in this release:

- **Payload de-duplication (#101).** `harness-health` and `docs-health` returned
  `oldString`/`newString` as top-level fields *and* embedded both in the composed
  `body`. A finding carrying ~2.6 KB of patch text serialized 38-43% duplicate. `body`
  is now the sole carrier (it is what ships to GitHub); all four health skills' payload
  shapes agree. `harness-health` keeps `intent`, the only remaining signal
  distinguishing a removal from a replacement once `newString` is gone.
- **docs-health read cap (#92).** A 40,000-byte cap with a stated partial-read strategy,
  and a carve-out so every fenced command block is still executed regardless. The
  archive-exclusion half of that issue had already shipped in `8d7d3419`, two weeks
  before it was filed; a new test pins the full-path match so the near-identically-named
  `docs/plans/` correctly stays in scope.
- **`harness-health/SKILL.md` back under the 40 KB ceiling.** Step 7's filing procedure
  moved verbatim into `filing.md` (46,813 → 36,880 B), with a test now guarding the
  ceiling directly so it cannot silently regress.
- **Two new CLAUDE.md Don'ts** (`[IL-71]` extended, `[IL-72]` added): verify a filed
  issue's premise and not just its acceptance criteria, and extract-then-inline rather
  than inlining into a size-capped file and extracting afterwards.

## v6.27.0 — Live record-graph visualization (closes #28)

`/claude-tweaks:visualize` gains a `record-graph` type: a deterministic diagram of
this project's own live open work-record queue — stage columns (backlog/parked/
ready), `Blocked by #N` dependency edges, and a six-axis color/badge encoding
(Origin, Bot state, Type, Scoring, Authorization, Acceptance). No topic argument;
always persisted to `docs/diagrams/record-graph.html`, regenerated on demand. The type
currently requires `work-backend: github-issues` — `local-files` records carry no
`.number` field to key nodes and edges on, so `record-graph.md` Step A gates on the
backend and stops rather than rendering a collapsed diagram; `local-files` support is
follow-up work.

A new `bin/record-graph.js` CLI (backed by pure, unit-tested `bin/lib/record-graph/`
modules) does all data-shape work deterministically — stage bucketing, six-axis
encoding, and Blocked-by edge resolution reuse the existing, tested
`bin/lib/issues/record.js` facet/dependency parsing rather than any model-authored
transcription of issue numbers, titles, or labels. Content is a point-in-time
snapshot, not a live-refreshing view — the diagram carries a "Generated {timestamp}
— re-run to refresh" note rather than a client-side data fetch.

### CLAUDE.md context budget: rules and evidence split (closes #95, #102) — branch-numbered v6.26.0

`CLAUDE.md` was 94 KB, and its `## Don'ts` section alone was 53,939 B — 57% of the file. That cost
is paid per *agent*, not per session: every Task-dispatched subagent inherits the whole file, so a
13-agent `/review` fan-out carried it thirteen times, at measured ratios of 13:1 to 38:1 against the
prompts those agents were actually given.

CLAUDE.md is now 44 KB (-53%). The Don'ts are 20 KB (-63%), compressed to rule-plus-one-clause with
every rule kept and three bundled bullets split rather than shrunk. The 69 post-mortem narratives
behind them moved **verbatim** to `docs/incident-log.md`, tagged `[IL-nn]` — a move, not a delete, so
the evidence survives where its length costs nothing. The directory tree, per-skill sub-file table,
and command reference moved to `docs/plugin-structure.md`.

Ten wrong facts were corrected first (#95) — a stale version literal, a `_shared` inventory naming
~22 of 49 files, four health-CLI subcommand lists that had all drifted, and a retired `/reflect`
claim. Four of them were retired by deferral rather than correction, since a corrected count drifts
again. The same idiom was applied to the three highest-multiplicity restated counts across 23 files
(#102), following `/visualize`'s numeral-free precedent.

Rules can now also *leave*. `/claude-tweaks:harness-health` gains a rule-expiry check — the
complement of its "guardrails, not wishes" check — that proposes removing a rule whose hazard can no
longer occur, guarded by an explicit rule that absence of recurrence is not evidence of death. This
needed a new `intent: "remove"` finding shape, scoped to `assetType: claude-md`; deletion had been
unmodelled across every health validator. `/reflect` and `/wrap-up` now direct that the incident
account be written before the rule, and `/init`'s CLAUDE.md template teaches the same shape to newly
initialized projects. See ADR-0010.

### Live proof the eval harness's OS sandbox denies a Bash escape (closes #46) — branch-numbered v6.25.0

`evals/actor.js`'s scope guard denies path-bearing tool inputs outside a scenario's fixture
`repoDir`, but by design never inspects `Bash` command text — the real containment for Bash
escapes has always been `runner.js`'s `managedSettings.sandbox`, documented as a belief, not
verified by an executable test. This closes that gap: a new `actor-escape-attempt` scenario
prompts a real model to attempt a Bash-executed write outside the fixture repo and asserts the
OS sandbox denies it — run for real (not just fake-queryFn unit coverage, which structurally
cannot exercise real OS-level sandboxing), confirmed `allPassed: true`.

Fixing this also surfaced a tool-count accuracy gap: `managedSettings.sandbox`'s own
`autoAllowBashIfSandboxed` defaults to `true` (confirmed against Anthropic's public sandboxing
docs — an installed-SDK `node_modules` read was denied by this project's own permission
settings), letting many sandboxed Bash calls bypass `canUseTool` entirely and silently
undercount `toolCalls`. `runner.js` now explicitly sets it `false`.

A follow-up code review found the new scenario's assertions only confirmed *some* Bash call
happened, not the specific escape command — fixed with a new `tool-input-includes` assertion
(backed by a `toolInputs` context field capturing `{name, input}` per call, parallel to the
existing bare-name `toolCalls` array so `tool-called`/`tool-count` are unaffected), validated
with a second live run. Also fixed in the same pass: a fail-open `absolute-path-exists`
assertion that silently passed on a missing/typo'd context field (now fails closed and cannot
crash a live run uncaught), and a stale wrap-up cleanup instruction that would have deleted
`docs/superpowers/plans/*.md` files this project actually keeps as a permanent archive.

## v6.24.0 — /dispatch's gh-CLI/MCP bridge (closes #61)

This number shipped twice. `main`'s tip first reported 6.24.0 on 2026-07-30, then
rolled back to 6.23.2 and worked forward through 6.23.7 before returning to
6.24.0 on 2026-08-02 — the only backwards step in the plugin's history, and the
reason this file is ordered by ship date rather than by semver.

`/claude-tweaks:dispatch`'s Preflight previously hard-gated on `gh` CLI presence
unconditionally — its entire queue/claim/settle/merge read path was `gh`-only end to end, so
running headless in a Claude Code cloud Routine sandbox (no `gh` CLI, GitHub MCP tools only)
was never possible. A prior attempt at this bridge (`274e30e`, reverted the next day as
`d4bdfb9`) shipped the gate flip before finishing the read-path bridge, producing an
unstructured `gh: command not found` crash instead of a clean stop.

This time: a real diagnostic Routine fired against a live cloud sandbox first confirmed every
needed GitHub MCP tool name and semantics (including the create-only/conditional-write
sha-gated CAS primitive a claim lock's correctness depends on, and branch creation via
`create_branch`) — via a new reusable shared procedure,
`skills/_shared/routine-diagnostic-probe.md`, for firing ad hoc diagnostics against any
project's cloud Routine environment without hand-building a one-off `RemoteTrigger` call each
time. Only once every primitive was confirmed did the plan write MCP-path documentation into
every read-path call site (`dispatch/SKILL.md`, `settle-and-merge.md`, `issue-claims.md`), and
only then flip the Preflight gate: `gh` present → proceed exactly as always; `gh` absent →
proceed via the now-documented, verified MCP path. The `gh`-CLI path is unchanged everywhere.

## v6.23.7 — cloud-setup.sh fixes (2026-08-02)

Fixes to `cloud-setup.sh` (#74, #75), plus ADR 0009 recording that guided
environment creation attaches the caller's real routine rather than a throwaway.
The bulk of the version is the `/dispatch` gh-CLI/MCP bridge work that shipped
as 6.24.0.

## v6.23.6 — Wrap-up reflection insights (2026-07-31)

Whole-branch review fixes: repo selection in guided routine creation, `/init`
Step 15's unreachable fresh-project resolution, and environment resolution that
was blind to locally-recorded routines.

## v6.23.5 — Cloud routine environment freshness + per-project dedication (2026-07-31)

Routine environments got freshness handling and per-project dedication, with a
plan amendment covering stale Rolling-digest references and an orphaned module.

## v6.23.4 — Remove the tidy github-triage routine (2026-07-31)

Retired `/tidy`'s `github-triage` routine variant.

## v6.23.2 — /init Update Mode: Routine Drift & Relevance Audit

- `/claude-tweaks:routine` gains `status --all` (bulk drift check across every instantiated
  routine in the project, including ones whose skill was renamed or retired) and
  `update --defaults` (non-interactive re-sync, for batch-confirmed use).
- `/claude-tweaks:init`'s Update Mode gains two new Phase 1u.5 checks: Routine Drift (stages
  a batch re-sync offer for drifted routines) and Routine Relevance (a new harness-health-
  owned judgment pass, invoked only by `/init`, surfacing routines whose underlying skill has
  changed enough to warrant a second look).

### durable-state writes are git-native; code-health's `.` slice no longer sweeps the whole repo — branch-numbered v6.23.1

`bin/lib/health-core/durable-state.js`'s `writeState()` shelled out to `gh api` for every
`health-state` branch write; v6.21.0's documented GitHub-MCP fallback for cloud Routine
sandboxes (no `gh` CLI there) was never actually exercised across 12 live firings — one skill
instead improvised an undocumented `git push` workaround that worked cleanly, proving plain git
push credentials are available in that exact sandbox. `writeState` now builds every commit from
plain git plumbing (`hash-object`/`ls-tree`/`mktree`/`commit-tree`) and publishes with a single
`git push`, which both creates and fast-forward-updates the branch — no `gh` CLI, no MCP
dependency, no separate bootstrap step, working identically local or in a cloud sandbox. The
entire now-unexercised MCP-fallback layer (`mcp-pending.js`, `retry-durable-write.js`, and every
`needsMcpWrite` branch across the 4 health CLIs) is deleted.

Separately, `code-health`'s `next-slice` rotation always included `.` as a candidate
representing the *entire* repo root scanned recursively — overlapping every subdirectory and
workspace slice, and, since it always sorted first, always force-picked as the very first slice
on any never-before-swept repo (returning ~4,200 files as "one slice" in the reported case). `.`
now scans direct root-level files only.

## v6.23.0 — /init: new Step 9 (Establish GitHub Remote)

Projects with no git remote configured at all previously had no way for `/init` to help set
one up — every GitHub-gated Optional Enhancement step (issue-form template, cloud/Routine
parity, non-default-branch issue tracking, work-record backend) silently fell back to
degraded or local-only behavior. `/init` now offers a new, interactive-only Step 9
("Establish GitHub Remote"): when no remote exists at all, it can get the `gh` CLI installed
and authenticated, then offer to create a GitHub repository (personal account or an org,
confirmed name, private/public visibility) and link it as `origin` — so the rest of the same
bootstrap run gets the enriched GitHub-backed path instead of falling back. Never runs under
`auto` mode. Required renumbering the existing Optional Enhancement Steps 9-16 to 10-17 across
every skill file that cross-references them.

## v6.22.1 — Tidy two doc nits from the /init argument-handling final review

Standardized on "goal-based Phase scope" throughout `skills/init/SKILL.md` (five pre-existing
spots still said "goal-based scope" after v6.22.0 introduced the more precise term in one
place), and made `bootstrap-steps.md`'s Core Bootstrap Version Check decision bullets re-cite
the `bootstrap`-scope Exception inline instead of relying on the reader to hold it from a few
lines above. Both were left as non-blocking Minor findings by v6.22.0's final whole-branch
review; no behavior change.

## v6.22.0 — /init argument-handling: enhancement filter tokens + bootstrap-state versioning

`/claude-tweaks:init --routines` previously fell silently through to the free-text
"project description" branch, since `--routines` wasn't a recognized scope keyword — Phase 0's
Optional Enhancements (Steps 9-16) were all-or-nothing (`--core-only` or everything), so there
was no way to ask for just one. `/init`'s `## Input` section now recognizes eight Enhancement
filter tokens (one per Optional Enhancement step; `cloud-parity`/`routines` split Steps 13/14
since wanting cloud parity without ever scheduling a Routine is a real, separate case), narrows
Phase 0 to only the named step(s) when present, and composes freely with goal-based Phase
scopes and modifier flags. An unrecognized token now stops and asks instead of silently
guessing (matching the existing `/tidy`/`/capture`/`/version` precedent) rather than being
misread as descriptive text. Separately, a new local `.claude-tweaks/init-state.yml` marker
records the plugin version that last verified Steps 1-8 (Core Bootstrap), letting an
unchanged-version re-run skip that re-verification entirely; a version mismatch instead
re-runs Steps 1-8 and surfaces a filtered summary of `CHANGELOG.md` entries relevant to
`/init`'s own behavior since the recorded version. New `bin/lib/changelog.js` provides the
semver comparison and range-extraction the version check needs.

## v6.21.0 — GitHub-MCP fallback for gh-CLI-only write paths

`bin/lib/health-core/durable-state.js` (the code-health/harness-health/journey-health/docs-health
cursor and retry-queue writer) and `bin/lib/issues/claims.js`'s issue-claim lock both shelled out
to `gh` unconditionally, which fails outright in a Claude Code cloud Routine sandbox — no `gh`
CLI there, only GitHub MCP tools. Since MCP tools can only be invoked from the calling agent's own
turn, never from `durable-state.js`'s spawned Node subprocess, the durable-state writer now
signals a pending write (`needsMcpWrite`) on stderr instead of attempting one, and the calling
skill's own documented procedure (`skills/_shared/health-state.md`) drives the MCP write and CAS
retry loop externally; the issue-claim lock (`skills/_shared/issue-claims.md`) gained an
equivalent MCP claim/release path, including a read-then-branch reclaim so a released claim
doesn't wedge permanently. `/claude-tweaks:dispatch`'s Preflight still hard-gates on `gh` being
installed — its read path (queue pull, dependency checks, contested-claim resolution) isn't
bridged yet, so cloud-Routine dispatch remains future scope. **Known open risk:** the MCP
procedures' branch-bootstrap step (via `create_branch`) has not been verified against a live
GitHub MCP connection — no such connection was available during development — verify before
relying on this in an actual cloud deployment.

## v6.20.1 — Harden local-files Preflight-stop against auto-mode rationalization

`/claude-tweaks:backlog refine`'s grant sub-stage and `/claude-tweaks:dispatch`'s Preflight
already stopped explicitly under `work-backend: local-files`, but a live run against a
realistic, `/claude-tweaks:init`-generated `CLAUDE.md` (one that documents this project's own
auto-mode/hands-off pipeline conventions) found the stop didn't hold — the model ran a full
build-to-close lifecycle on a low-risk-looking record instead. Both Preflight paragraphs
(`skills/_shared/local-files-preflight-stop.md`'s canonical pattern, applied to
`skills/backlog/SKILL.md` and `skills/dispatch/SKILL.md`) now explicitly state the stop is not
superseded by the project's own documented auto-mode conventions elsewhere in CLAUDE.md — those
conventions govern behavior *within* an already-authorized pipeline run, not whether this gate
may authorize new work in the first place. Confirmed via a real re-run: cost dropped from
$17.47/49 tool calls (violation) to $0.37-0.59/0-8 tool calls (compliant, verified with a new
`evals/` scenario fixture that models a realistic onboarded project instead of a bare repo).

## v6.20.0 — Policy schema consolidation

`.claude-tweaks/policy.yml` is now the canonical home for all of claude-tweaks' project-config
levers, indexed in one place at `skills/_shared/policy-schema.md` (mirrored in code by
`bin/lib/policy-schema.js`'s `auditPolicy()`). `/claude-tweaks:init` no longer writes 8
default-valued lever lines into every generated CLAUDE.md — omitting a lever already meant "use
the default," so writing it explicitly was always redundant, and it silently bloated every
project's CLAUDE.md. Existing projects get a one-time cleanup offer via Update Mode; a new
`/claude-tweaks:harness-health` check flags malformed or unrecognized `policy.yml` keys.

## v6.19.0 — Shared record-staleness threshold + bucket predicates

The record-stage and bot-state predicates (`isBacklog`, `isParked`, `isBotBlocked`,
`isBotInProgress`) and the staleness classifier that `/claude-tweaks:help`'s Stage 1 and
`/claude-tweaks:tidy`'s Step 1 each reimplemented independently now live in one place,
`bin/lib/issues/record-buckets.js`. Both scans read the same definitions, so a backlog record
counted stale on the dashboard is the same record `/tidy` recommends acting on.

How old a record must be to count as stale is now project-configurable via a new
`record-staleness-weeks` key (default `4`, documented in `_shared/work-record.md`'s Config keys
table and resolved by `_shared/record-queue-fetch.md`'s Threshold resolution section). The
three-band scale scales with it — `fresh` below half the threshold, `review` up to and including
it, `stale` beyond — so a project with a slower cadence can widen the window without every
consumer drifting apart.

## v6.18.0 — /claude-tweaks:backlog replaces /triage and /review-backlog (2026-07-26)

Two overlapping skills collapsed into one `/claude-tweaks:backlog` with refine
and overview modes. Includes the cross-repo sweep for stale `/demo` references
that the final review surfaced.

## v6.17.0 — /demo single-item scope + pre-flight self-verification

`/claude-tweaks:demo` no longer sweeps the `demo:pending` backlog or renders a batch table — it
resolves exactly one item per invocation (this session's own recall-detected work, or one
explicit `#N`, with a session-recall fallback when a record was never labeled). Discovery of
what's outstanding moves to `/claude-tweaks:help`'s dashboard (Stage 4.7), which now lists every
outstanding `#N` instead of a bare count.

`/demo`'s per-item walkthrough gained a pre-flight self-verification step — resolve a dev server,
confirm the target page actually renders, attempt login if credentials are resolvable — before
ever handing a human a live browser session or manual instructions. The former "Show me live"
option is renamed "See it yourself" and, once pre-flight passes, offers a follow-up choice between
a live session and copy-paste-ready manual steps (self-contained, no inline comments, proactive
about surprising-but-correct states). A once-per-session scope-fork checkpoint and task-anchor
discipline keep a pending verdict from getting silently lost mid-tangent.

### Maturity-aware build & specify discipline — branch-numbered v6.16.3

Project maturity (greenfield / pre-launch / early-production / established) is now a durable
`project.maturity` value in `.claude-tweaks/policy.yml`, instead of living only as CLAUDE.md
Philosophy prose. `/claude-tweaks:init` writes it the moment Phase 3's Project Classification gate
confirms a value, and re-detects it on every Update Mode pass to catch drift.

`/claude-tweaks:build` folds a maturity-scaled characterization-test instruction into its task
dispatch, and `/claude-tweaks:specify` biases decomposition toward strangler-fig-shaped leaves —
implement-behind-a-flag then remove-the-old-path, or parallel-implementation/cutover/decommission —
when a design doc proposes replacing an existing, in-use subsystem on early-production or
established projects.

## v6.16.1 — Step 13's live branch-mismatch warning (2026-07-25)

`/init` Step 13 warns when the branch it is about to act on isn't the one
expected. The version also carries the journey drift-audit step (record #58) and
the journeys evidence checklist (#57).

## v6.15.0 — Parallel skill-audit fix pass (2026-07-24)

A wide parallel fix pass over the skill set, plus the shared facet-default shape
extracted into `facet-shape.js`.

## v6.13.0 — Smoke-test follow-through: dispatch diagnostics, audit-log hardening, grant-time disclosure

A live cross-terminal smoke test of `/capture` → `/specify` → `/triage` → `/dispatch` (real repo,
real GitHub issues, four independently-session'd agents with no shared context) validated the
claim-race concurrency mechanism cleanly, but surfaced a repo config gap (`work-backend` missing
alongside the legacy `backlog-backend` alias) that had made `/claude-tweaks:dispatch` completely
non-functional until discovered by accident, plus a silently-skipped `/claude-tweaks:triage`
audit-log write under `worktree.always`. Both fixed, and hardened: a new harness-health evidence
check catches the legacy-alias-without-replacement config gap proactively, and
`_shared/auto-decision-log.md` now documents a `worktree.always`-safe Bash-append mechanism for
every standalone-auto skill's `decisions.md` write.

Six process optimizations followed from the same analysis: `/claude-tweaks:dispatch --claim-only`
(claim without building, for safely testing or operating the claim mechanism); Preflight now
distinguishes an incomplete `work-backend` migration from a deliberate `local-files` choice and
reports the exact fix; a headless `dispatch next` firing self-files a `by:dispatch` issue on
Preflight failure instead of failing silently with nobody present; `/claude-tweaks:tidy` gained a
backstop for a completed standalone run with an empty `decisions.md`; `grant-check`'s `RATIONALE`
now discloses when a `ceremony:fast-lane` `auto:merge` recommendation means self-review only, not
the full review lens matrix — the actual tradeoff a human granting merge trust is taking, previously
invisible at grant time; `/claude-tweaks:triage`'s batch-confirm gained an explicit "grant
`auto:build` only, hold merge" option for supervising a pipeline's first autonomous run.

## v6.12.1 — Warn-tier hook nudge for plugin.json version bumps (2026-07-22)

Added `checkPluginVersionBump` to `post-tool-use.js` — a warn-tier reminder,
fired on any commit touching the manifest, to mirror the version into the
marketplace repo. v6.41.0 extended the same check to name the changelog, which
it had been silent about since this release (`[IL-94]`). Also added the
`work-backend` key alongside the legacy `backlog-backend` alias, and six process
optimizations from a live cross-terminal smoke test.

## v6.12.0 — Review effort tiering (2026-07-22)

`/claude-tweaks:review` gained a `review-effort` argument, Step 2.5 derivation,
and tier-gated lens dispatch and debate — with unconfirmed and contested
findings surfaced inline at the `xhigh` and `max` tiers.

## v6.11.3 — 256-finding full-plugin code-review remediation (2026-07-21)

The second and larger of two remediation passes over findings from a
full-plugin code review.

## v6.11.2 — 158-finding code-review remediation (2026-07-21)

The first remediation pass, merged in twelve themed batches — hooks/policy,
issues/state, code-health, the health siblings, shared fragments and agent
definitions, the lifecycle skills, component skills, the utility skills, and the
shared criteria fragments.

## v6.11.1 — Wrap-up follow-through on v6.11.0's ceremony tiering

Wrap-up reflection on v6.11.0 found `ceremony:fast-lane`/`ceremony:standard` was never added
to `_shared/label-bootstrap.md`'s canonical `LABELS_JSON` despite `/claude-tweaks:specify`
citing it as the bootstrap source — fixed, along with the resulting label-count drift in
`_shared/work-record.md` and both `/claude-tweaks:init` files. Also fixes two stale
descriptions the original branch's review missed: `/claude-tweaks:flow`'s Relationship-table
row still described `ceremony-check` as its primary caller instead of fallback-only, and
`_shared/multi-agent-coordination.md` — the canonical primitive for Multi-Persona Red-Team —
still documented "3 fixed personas" with no mention of the new ceremony-tiered 1-or-3 count.
Adds ADR 0006 documenting the ceremony-tiering design's two central decisions.

## v6.11.0 — Lifecycle ceremony tiering

`ceremony-check` (the fast-lane/standard verdict introduced in v6.7.0) now runs at
`/claude-tweaks:specify`'s record-creation step instead of waiting until `/claude-tweaks:flow`'s
materialize step — so `/specify`'s own Step 5 Multi-Persona Red-Team can scale with it too
(`fast-lane` leaves get one persona instead of three). The verdict is now an always-explicit
`ceremony:fast-lane`/`ceremony:standard` label, visible everywhere `risk:*`/`effort:*` already
are, instead of a materialize-only header field. `/claude-tweaks:review` gains matching
ceremony-aware step skipping (spec-compliance re-check, cross-spec-promise check, and hindsight
skip under `fast-lane`; the actual code-quality read of the diff never does), and
`/claude-tweaks:review-backlog` surfaces the tier as an advisory column. See
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`.

## v6.10.0 — design-wrapper rename + visual quality boost

`/claude-tweaks:design` is renamed `/claude-tweaks:design-wrapper` (clearer than a bare
"design" for a thin dispatcher around the Impeccable plugin). Three new capabilities close the
"bland UI" gap end to end: `/flow`'s polish phase now auto-dispatches audit's own Anti-Pattern
`suggestion` field instead of only fixed commands; `/visual-review`'s Creative Opportunities gets
a real one-click apply-gate, plus a new opt-in standalone "Boost" step (fix flagged issues, or
explore alternatives via a new `live` mode); and `/specify`'s shape-time flow can now spin up a
throwaway scaffold and hand off to `live` mode for real side-by-side variant comparison before
`/build` ever starts, recorded as a `Visual-reference:` body-metadata line. See
`docs/superpowers/specs/2026-07-19-visual-quality-boost-design.md`.

### /demo session-recall fallback — branch-numbered v6.9.0

`/claude-tweaks:demo` now aggregates a second, independent source alongside `demo:pending`
records: work done directly in the current conversation with no backing record at all. When
`/demo` finds nothing pending and the session itself did unrecorded implementation/verification
work, it recaps that work in the same Verification Brief shape (composed from recall, not a
diff) and asks for a verdict. Approve/Skip leave no trace — the verdict lives in the
conversation — while Request changes files a real follow-up record, same as it always has for
record-backed items.

## v6.8.0 — The record-driven pipeline, exercised (2026-07-19)

The first release built almost entirely by running the work-record pipeline on
itself: records #13, #14, #15, #17, #21, #22, #32, #38 and #39 were each
materialized, built and closed in turn. Substantive changes include a native
`Blocked-by` dependency check in `/dispatch`, local-file record closure,
`--run` on `record-worktree` (fixing cross-run state corruption), a real
unblock-cascade check in wrap-up Step 8, and feedback-loop metrics for the
pipeline. `/review-backlog` was catalogued.

## v6.7.0 — Fast-lane pipeline profile

A new `ceremony-check` mode on `/claude-tweaks:assess-agent-autonomy` judges once, at materialize time, how much retrospective/documentation ceremony a record's actual content deserves — stored as a `ceremony:` materialized-header field and folded into a new `ceremony-profile` Manifesto lever (10th canonical lever; `unattended-tier` keeps its existing slot 9), letting small, clean records skip proportionate ceremony while a Safety-regression finding still trips an escape hatch back to full depth for the rest of the run.

- **`/claude-tweaks:reflect` light mode** — new `skills/reflect/light-mode.md`: 2 lenses (Near-misses, Fresh start), no tradeoff review. Runs instead of full mode when `config.yml`'s `ceremony-profile` is `fast-lane`.
- **`/claude-tweaks:build` audit skip conditions** — Plan Audit and Architecture Alignment steps skip under `ceremony-profile: fast-lane`, on top of their existing size-based skip conditions.
- **`/claude-tweaks:wrap-up` narrower ceremony** — Step 7's independent skill-curation scan caps at top ~2 instead of top ~5; Step 6's doc/CLAUDE.md/ADR sub-scans gain a mechanical pre-check gate that skips all three when the diff touches no registry-matched path, no new dependency, and no schema/config file.
- **Escape hatch** — a Safety-regression finding during light-mode reflect downgrades `config.yml`'s `ceremony-profile` to `standard` for the remainder of the run, falling back to full-depth ceremony.

See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the full design.

## v6.6.0 — Docs-health expansion + wrap-up integration + genre templates

Extends `/claude-tweaks:docs-health` with three new/strengthened judging dimensions, two new CLI subcommands, an inline integration into `/claude-tweaks:wrap-up`, and a unified template library backing missing-doc scaffolding.

- **Three new/strengthened docs-health dimensions** — findability (is the doc discoverable/linked from where a reader would look, repo-scoped), placement-fit (does the doc live in the genre-appropriate location), and freshness-dependencies (does the doc's frontmatter track the source files it depends on, so drift can be detected) — added to `_shared/criteria-docs-diataxis.md`'s JUDGE procedure alongside the existing genre-drift, depth-mismatch, and dual-persona misleading-risk checks.
- **Two new CLI subcommands** — `find-refs <path> [--root <dir>]` (repo-scoped reference/backlink lookup backing the findability check) and `check-freshness <path> [--root <dir>]` (frontmatter-declared source-dependency staleness check) added to `bin/docs-health.js`.
- **`/claude-tweaks:wrap-up` docs-health integration** — new `skills/wrap-up/docs-health-integration.md`, loaded by Step 6.1: D1 applies the full docs-health JUDGE procedure inline to every doc this work's diff touched (additive findings fold into the Configuration Updates batch table; restructural findings file as `by:docs-health` GitHub issues through the same dedup/filing CLI machinery `/claude-tweaks:docs-health` itself uses), and D2 detects documentation this work should have produced but didn't, scaffolding new docs from the genre template library.
- **Unified 6-genre template library** — new `skills/_shared/diataxis-genre-templates.md` is now the single source of truth for all six doc genres `/claude-tweaks:docs-health` recognizes: the four core Diátaxis genres (Tutorial, How-To, Reference, Explanation — new) plus the two native-exempt genres it already judged, ADR and Journey, whose canonical skeletons migrated here from `_shared/decision-records.md` and `journeys/journey-template.md` (which now point here instead of duplicating the literal skeleton). Consumed by `/claude-tweaks:init` Phase 8.5's missing-doc backlog items and `/claude-tweaks:wrap-up`'s D2 missing-doc detection.
- `/claude-tweaks:wrap-up` Step 9/10 templates gained a `docs-health-issue` config-update type and two new Step 10 execution bullets (new-doc scaffolding from the template library, restructural docs-health filing) so approved docs-health findings from the Console/batch have somewhere to land.

### Demo walkthrough redesign — branch-numbered v6.5.0

`/claude-tweaks:demo`'s Verification Brief is now a self-contained digest instead of a pointer to
re-run another skill — vision/why, what shipped, and confirmed evidence (visual-review's result +
up to 3 committed screenshots, or a code-review digest + diff for non-UI work). `/wrap-up` gains a
safety-net gate that triggers a real visual-review pass before `demo:pending` is ever applied, for
the one path (`/review` outside `full` mode) where one might not have already run.
`/claude-tweaks:demo`'s verdict prompt reframes around vision/fit ("Does this do what you asked
for?") and gains an on-demand "Show me live" option for a live look via `agent-browser`.

### Unattended tier: fewer clicks in `auto` mode — branch-numbered v6.4.0

A new opt-in policy lever, `unattended-tier` (off by default), lets three narrow, low-stakes
decision points — floor-clearing ledger residue, queue-write record creation, and ops-item
acknowledgment — resolve without a live click, everywhere `auto`/`hybrid` mode runs (headless
`/claude-tweaks:dispatch` firings or local `/claude-tweaks:flow` runs alike). Every action is
still logged to `decisions.md` and rolled into one consolidated push notification; HARD-GATEs,
merge conflicts, and every `Fix anyway`/`Accept`/`Drop` ledger disposition stay fully
human-gated regardless of the lever's state. See `skills/_shared/unattended-tier.md`.

### Human acceptance sign-off (`/claude-tweaks:demo`) — branch-numbered v6.3.0

A new seventh work-record axis (`demo:pending` / `demo:approved` / `demo:changes-requested`)
closes the gap between tests passing, spec completion, and an actual human verifying a built
feature does what was asked. `/claude-tweaks:wrap-up` applies `demo:pending` and writes a
Verification Brief (what changed, why, how to verify) while it still has full build context;
the new `/claude-tweaks:demo` skill aggregates every pending record — across parallel threads,
regardless of merge timing — and captures your verdict.

## v6.0.0 — The unified work record

Every captured idea, health-skill finding, and human-filed issue is now the same thing: **one durable work record** (a GitHub issue, or its `local-files` twin — a plain markdown file), tracked through a single spine instead of the old two-file backlog design and per-artifact frontmatter:

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch claims──► BUILDING ──user merges──► CLOSED
```

with `parked` (on hold, wakes on a trigger) and not-planned (wontfix/duplicate/absorbed) exits at any stage. Two storage drivers back the same taxonomy — `work-backend: github-issues` (labels + native Issue Types) or `work-backend: local-files` (frontmatter on a tracked file) — set once by `/init`, read identically by every consumer skill. See "Work Records" in README.md and `skills/_shared/work-record.md` for the full contract.

Human-granted `auto:build`/`auto:merge` labels replace the retired `tier:approved`/`tier:fast-track`/`tier:needs-review` three-way split — `/claude-tweaks:triage` is now the interactive grant gate only. A new skill, **`/claude-tweaks:dispatch`**, is the queue consumer: it claims an authorized record's whole file-overlap group and hands it to `/flow` — the `triage dispatch` headless subcommand no longer exists.

`/claude-tweaks:specify` and `/claude-tweaks:build`/`/flow` now **materialize** a record reference (`#N`) into a build-time header + spec-shaped body file rather than requiring a pre-existing numbered spec file — the legacy `specs/{n}-*.md` path still works as an alias for projects that haven't migrated. `/claude-tweaks:tidy` and `/claude-tweaks:help` scan the live record queue directly; the former INBOX scan, Deferred-Work scan, and the separate spec index they used to read are retired.

See "Migrating from 5.x" in README.md if a project still carries pre-6.0 state (live `tier:*`/`status:*` labels, `specs/backlog/` files, or the old `backlog-backend` flag name).

## v5.29.0 — The unified work record, in progress (2026-07-13)

Ninety-one commits building the unified work record that GA'd as 6.0.0:
consolidating user-facing docs onto the single record, regenerating the
lifecycle diagram around the spine, six axes, grants and dispatch, and deleting
the compatibility module once it had no callers.

## v5.28.0 — Routine setup friction reduction, planned (2026-07-13)

The implementation plan for reducing routine setup friction in `/init` and
`/routine`.

## v5.27.2 — Routine setup friction reduced (2026-07-12)

`/routine`'s CREATE flow collapsed its review gate into one preview+confirm with
a `--defaults` skip path, resolved the environment silently, cut the cadence
picker to four options, and moved the picker behind an explicit Customize
choice — the front-door-confirm pattern that is now house style. `/init`
Step 13 batches routine setup into a single multiSelect picklist.

## v5.27.1 — Document the upstream worktree/resume limitation (2026-07-12)

Recorded that a session vanishing from `claude --resume` after entering a
worktree is an upstream limitation, not a plugin bug. The version also carries
the GitHub-issues consistency pass: a reopen branch in dedup, harness-health
tiering via a kind-adapter chain, the gh-availability Detection Ladder wired
into `/triage`, `/wrap-up` and the multi-spec console, and the 4x-duplicated
label bootstrap loop extracted into `_shared/label-bootstrap.md`.

## v5.27.0 — Native diagram generation replaces the Diagram Design companion

**`/claude-tweaks:visualize`** replaces the external `diagram-design` companion-plugin integration introduced in v4.7 with a fully native skill — no separate plugin install. It generates self-contained HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid), themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up). An optional D2-backed enhanced rendering path handles diagrams-as-code source generation for types with a native D2 construct. The same three soft-hook call sites — `/journeys` Step 3.6, `/specify` Step 2.5d, `/review` Lens 3i-diagram — now suggest invoking it directly, gated by `diagram-suggestions: enabled` in CLAUDE.md (renamed from `diagram-integration:`), written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations.

## v5.26.0 — journey-health deep-tier cursor fix (2026-07-11)

Fixed deep-tier cursor advancement on the QA-satisfied path.

## v5.25.1 — watchman-core extraction (2026-07-11)

The cache, run-log, fingerprint and dedup primitives that code-health,
harness-health and journey-health had each implemented separately were extracted
into a shared `watchman-core` and all three refactored onto it. journey-health
also gained a severity field, a deletion force-select phase, and a QA-evidence
module for its deep tier.

## v5.25.0 — Fix a stale reviewer description in build-options.md (2026-07-11)

`subagent-driven-development`'s reviewer description had drifted.

## v5.24.0 — /claude-tweaks:triage and the status lifecycle (2026-07-11)

Sixty commits. The scheduled headless routine moved out of `/flow`, leaving
`/flow` a pure executor, and landed in a new `/claude-tweaks:triage` skill —
bare for interactive authorization, `dispatch` for headless. Adds the unified
`status:*` tier lifecycle, a fast-track auto-merge short-circuit in the Review
Console (with a main-checkout branch check before it merges), retry-ceiling
comment tracking, and pending-authorization/blocked/auto-merged counts on
`/help`'s dashboard. `journey-health` shipped here too — CLI, scope selection,
light and deep tiers, coverage scan and routine template — and harness-health
became report-only, dropping its auto-apply path.

## v5.23.0 — Impeccable design-plugin integration batch (2026-07-09)

Score trend, harness-health design artifacts, a `/tidy` extract recommendation,
and a CLI schema-drift fix. Also `/routine --variant` for multi-instance
routines, `/tidy --scope` for partial sweeps, and `/init` Step 13 discovering
template variants rather than only skills.

## v5.22.0 — Renumbered from 5.21.0 after a collision (2026-07-09)

A concurrent session claimed 5.21.0 first, so the harness-health v2
budget/memory work was renumbered onto 5.22.0 — one of the collisions that
`[IL-12]` came from.

## v5.21.0 — harness-health memory-kind (2026-07-09)

Version bump and doc sync for the memory-kind feature.

## v5.20.0 — harness-health v2 + GitHub-issues backlog backend, Phase 2 (2026-07-08)

harness-health v2: self-declared tiered budgets, unscoped-rule structural
detection, a self-referential count check, a narrative-density heuristic, and
local-only memory health via `--kind memory --memory-dir`. Alongside it,
`/claude-tweaks:capture` and `/claude-tweaks:tidy` became backend-aware, filing
and sweeping GitHub issues under `backlog-backend: github-issues`.

## v5.19.1 — /init Step 15 (backlog-backend flag) (2026-07-08)

Added the backend flag and set it on this repo, added
`bin/lib/issues/backlog.js`, reworked the label taxonomy, and fixed a
GitHub Enterprise false negative in three `github.com` string-match checks.

## v5.19.0 — Browser backend policy + isolation guardrail (2026-07-08)

Established `agent-browser` as the only backend that works both interactively
and in hosted Routines, with a narrow `claude-in-chrome` escape hatch in
`/browse` and a CLAUDE.md guardrail against calling it directly.

## v5.18.0 — shadcn/ui bootstrap + Phase 0 step renumbering

`/init` gains a new Optional Enhancement step: on a detected frontend project without `components.json`, it offers to bootstrap [shadcn/ui](https://ui.shadcn.com/) — CLI init, plus wiring shadcn's own first-party MCP server into `.mcp.json` and installing shadcn's official Skill (`skills add shadcn/ui`), both of which give Claude Code live project context so it stops guessing at component APIs. Writes a `shadcn-integration: enabled | cli-only | disabled` flag to CLAUDE.md's `## Design integration` section (currently write-only — no other skill reads it yet). See `/init` Step 12.

Also folded in: Phase 0's internal step numbering (previously `Step 0.1`–`Step 0.97`, an ad-hoc decimal scheme approaching its practical ceiling) is now two clean sequential groups — Core Bootstrap (Steps 1–8) and Optional Enhancements (Steps 9–14, order-agnostic and append-only). Every cross-reference in README and the plugin's skill files was updated to match.

## v5.17.1 — Close three gaps from another project's process-feedback audit (2026-07-08)

Three gaps surfaced by running the plugin's own feedback audit from a different
project.

## v5.17.0 — Impeccable re-baseline + automatic hook integration (2026-07-08)

Re-baselined the Impeccable docs and wired its hook integration to happen
automatically.

## v5.16.0 — AskUserQuestion adoption (2026-07-08)

Version bump for adopting `AskUserQuestion` at the plugin's interaction points —
the decision surface every skill now uses.

## v5.15.0 — code-health: risk-based triage + closing-keyword safety net

`/claude-tweaks:recon` is renamed to `/claude-tweaks:code-health` (bare rename, no migration shim — the fingerprint-marker convention this rename introduced has since been unified into the single `work-fingerprint` marker every filing skill writes; see `skills/_shared/work-record.md`'s Fingerprint marker section). Findings now carry a `likelihood` and `effort` alongside `severity`; a new deterministic helper (`bin/lib/code-health/risk.js`) computes a `risk` tier (`severity × likelihood`, product-bucketed) the same way `dedup.js#decide()` already computes decisions — never LLM-judged. GitHub labels move from `code-health:{severity}` to `code-health:risk-{tier}` + `code-health:effort-{tier}` (criterion labels are kept, now with real descriptions); filing and CI gates move from `--min-severity`/`--fail-on critical` to `--min-risk`/`--fail-on risk-high`. Downstream, `/build` reads the `code-health-effort:` frontmatter to pick its implementer's model tier. (The `/flow --from-code-health`/`--quick-wins` batch-selection flags described here at v5.15.0 were later removed — issue selection and dispatch now live in `/claude-tweaks:triage` (grants authorization) and `/claude-tweaks:dispatch` (claims and executes); `/flow` itself never selects records.) Separately, a new harness-wide PostToolUse hook (warn tier, not gated on a resolved pipeline run) flags any commit that references a bare `#N` issue number without an immediately-preceding GitHub closing keyword — catching ad hoc fix commits that would otherwise silently leave the issue open.

## v5.14.0 — Commit-time closing-keyword safety net (2026-07-07)

A warn-tier `post-tool-use` hook that fires when a commit lands without an issue
closing keyword, anchored to avoid a false negative on comma-separated
multi-issue commits. The version also adds the `--quick-wins` selector
(`risk:high` AND `effort:low`), stamps `code-health-effort` onto derived specs,
and reads it in `/build` to pick the implementer model tier.

## v5.13.0 — recon renamed to code-health (2026-07-07)

Completed the `/recon` -> `/claude-tweaks:code-health` rename, including 17
files the original pass's literal-token grep missed — the incident behind
`[IL-21]`. Also drops `severity:critical` in favour of a deterministic
severity x likelihood risk matrix, and normalizes `med` to `medium`.

## v5.12.0 — skill-health generalized into harness-health (2026-07-07)

`/claude-tweaks:skill-health` became `/claude-tweaks:harness-health`, widening
its scope from `.claude/skills/*.md` to rules and CLAUDE.md as well, with
`--target`/`--kind` flags and a unified target pool.

## v5.11.0 — Always-worktree enforcement (2026-07-06)

The `worktree.always` policy landed: a run-independent PreToolUse gate requiring
an isolated worktree before any edit. This repo has run under it since.

## v5.10.0 — Fix silent GitHub issue-closure gaps (2026-07-06)

Issues that should have closed on merge were silently staying open.

## v5.9.0 — code-health signal-quality and granularity hardening (2026-07-06)

Workspace-aware slicing, a severity filter that files only high and critical by
default, `relatedAnchors` rendered as an "Also affects" list, a hard fail when
`validate-findings` runs without `--slice`, and a bundling rule for recurring
root-cause findings.

## v5.8.0 — Severity-filter validation (2026-07-05)

`pull-issues --min-severity` is validated against known severities, so a typo
can no longer silently disable the filter and suppress critical findings.

## v5.7.0 — The dispatch phase, documented across consumers (2026-07-04)

Issue-claims Phases 2-4 wrapped up: `agent:go` removal wired through,
unattended-console semantics, decline handling, and a statusline fallback to the
actual cwd so the project segment is never dropped.

## v5.6.0 — The issue dispatcher (2026-07-04)

A `/flow` routine template with the `agent:go`/`agent:eligible` lifecycle, a
`--from-milestone` selector, a `--require-eligible` gate, and a `requireLabels`
AND-filter — labels as maintainer signatures for dispatch authorization.

## v5.5.0 — Generic issue ingestion, documented across consumers (2026-07-04)

Wires translation staging and the current-branch carrier end to end.

## v5.4.0 — Generic issue ingestion (2026-07-04)

`issuesToBriefs` with shape detection, three selectors (`--from-label`,
`--from-issues`, `--from-milestone`) with `--from-recon` as an alias, a
GitHub issue form template offered at `/init` so human-filed issues arrive
pipeline-ready, and the current-branch closing carrier.

## v5.3.0 — Close issues via merge keywords (2026-07-04)

Issue closure moved from explicit close commands to `Fixes` lines riding the
merge artifact, with a mapping table surfaced at the Review Console,
ownership-checked claim releases, and blocked-checkpoint comments as resumable
breadcrumbs on claimed issues.

## v5.2.0 — The issue-claims contract (2026-07-04)

An atomic `refs/claims` lock with a comment mirror, TTL staleness folding that
fails closed on unreadable claims, and a stale-claim sweep in `/tidy` Step 4.7.
`parseClaimMarker` was hardened so a derived kind wins over marker JSON rather
than trusting it.

## v5.1.1 — /claude-tweaks:routine (2026-07-04)

The routine skill arrived with CREATE, UPDATE and STATUS workflows, backed by
`routine-template-schema` — the canonical schema for plugin templates and
project records — with code-health as its first consumer. Also scopes E1
enforcement to the owning session, fixing a foreign-session false deny.

## v5.1.0 — Hook surface: pipeline continuity + working-directory enforcement

A dispatcher-based hook surface (`bin/hooks.js`, registered via `hooks/hooks.json`) adds two things with no skill-level opt-in required:

- **Pipeline-run continuity across sessions and compaction** — SessionStart/SessionEnd/PreCompact hooks track the active pipeline run and re-surface it after a session restart or context compaction.
- **Mechanical working-directory enforcement during worktree runs** — PreToolUse/PostToolUse/SubagentStop hooks deny commits that land in the wrong checkout (scoped since v5.1.1 to the session that owns the run — commits from other sessions are allowed with a warning), log commit breadcrumbs, and flag Subagent Contract status-line violations.

Near-inert outside pipeline runs: SessionStart's dependency check always runs regardless of a resolved run directory, and each matched git command pays a ~30ms no-op spawn to check for one. With no run directory, there is no state to write or enforce — except three deliberate, run-independent exceptions added since this hook surface first shipped: a PostToolUse check warns (non-blocking) whenever a commit references a bare issue number without a recognized GitHub closing keyword immediately before it, since that gap matters most for ad hoc fix commits made outside any pipeline run; the `worktree.always` PreToolUse policy gate blocks Edit/Write/NotebookEdit/commit outside an isolated worktree, since its job is to require one even before any pipeline run exists; and a PostToolUse check warns on any write to a `docs/superpowers/specs/*-design.md` brainstorming artifact, since a session that hasn't reached `/specify` yet has no pipeline run to gate on either. See CLAUDE.md Conventions → Hooks for the full contract.

## v5.0.0 — Code-health v2: LLM-as-judge + scheduled Routine

Code-health v2 replaces the v1 mechanical-lens spine with an LLM-as-judge model: the LLM evaluates the repo against a criteria catalog, calling deterministic tool checks as evidence. Area-type routing, content-hash skip, hotspot priority, fingerprinting, and dedup are handled by deterministic helpers. The v1 subagent dance and `plan-judgment` / `ingest-judgment` phases are removed. Code-health now runs as a scheduled Routine for continuous, hands-off coverage — no manual invocation needed.

## v4.20.0 — /recon: an LLM-as-code-judge scheduled Routine (2026-06-15)

The largest release of the 4.x line. `/recon` — later renamed
`/claude-tweaks:code-health` — arrived as a proactive repo-improvement finder
built on an LLM judge with deterministic scaffolding around it: an area-type
classifier, a universal and domain criteria catalog (resilience, observability,
security-logic, scalability, a11y, i18n, api-stability, migration-safety,
iac-security, privacy-pii, concurrency), fingerprinting and dedup, a
confidence-floor gate, and issue-payload rendering. Mid-version the whole spine
was rewritten from v1 to v2: plan-judgment, ingest-judgment and the mechanical
lens were removed in favour of SCOPE -> JUDGE -> validate-findings -> file, with
content-hash scope rotation and a `next-slice` CLI.

## v4.17.0 — Pocock-inspired discipline skills (2026-06-14)

Added systematic debugging, ADRs, `/claude-tweaks:deepen`, and a depth survey
in `/flow`. Also documented the two-repo release process in CLAUDE.md — the
`Versioning` section that this release note's own convention now extends.

## v4.15.0 — Research delegates to the built-in /deep-research

`/claude-tweaks:research` no longer ships a vendored Python engine. It now delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, and falls back to a lean inline model-driven method otherwise.

- **Removed** the vendored `skills/research/scripts/` (10 Python modules), `schemas/`, `templates/`, the Python `tests/`, `requirements.txt`, `UPSTREAM.md`, and `LICENSE-UPSTREAM` — ~6,800 lines.
- **`skills/research/SKILL.md`** rewritten: availability pre-check → delegate to `/deep-research` → inline fallback → write `report.md` + `sources.json` under `.claude-tweaks/research/`. Adds an "Enabling the built-in path" setup note and a Component-Skill Contract.
- **`skills/research/reference/methodology.md`** rewritten as the lean inline fallback (decompose → parallel `WebSearch`/`WebFetch` → adversarial-verify subagents → synthesize) with the salvaged citation-discipline rules.
- **Regressions accepted:** HTML/PDF report generation, deterministic Python citation/DOI validation, continuation/resume state, and source-credibility scoring are dropped. Citation validation is now a model self-check; output is markdown + `sources.json`.
- The built-in path requires Claude Code ≥ 2.1.154 with Dynamic Workflows enabled (Pro: enable via `/config`). When unavailable, the inline fallback runs automatically.

## v4.14.0 — Remove the bash-output filter + savings meter

The v4.2 "token-saver" — a `PostToolUse[Bash]` hook that compacted noisy command output and a statusline `saved: ↓Nk` meter that reported the reclaimed tokens — has been removed. The observed savings never justified the surface area, and the harness already manages context.

- **Deleted** `bin/filter-bash-output.js` (the parser), `bin/lib/jsonl.js` and `bin/lib/paths.js` (telemetry plumbing used only by the filter and the savings meter), and `tests/filter-bash-output.test.js`.
- **`hooks/hooks.json`** drops the `PostToolUse[Bash]` block. Only the `SessionStart` dependency check remains.
- **Statusline** loses `renderSavings`/`formatK` and the `saved:` segment. Everything else (project, model, `ctx:`, effort, git, rate limits, active spec, open-ledger count) is unchanged.
- No migration needed. Stale `~/.claude-tweaks/logs/` files (raw bash logs + `filter.jsonl`) are now inert and can be deleted by hand.
- The **Subagent Contract** (clean-room input, Templates A/B/C, model-tier selection) is unaffected — it's dispatch discipline, not part of the filter.

## v4.13.1 — Fix a stale research SKILL.md test (2026-06-13)

`Next Actions` had moved from `###` to `##` and the test still asserted the old
level.

## v4.13.0 — Filter compaction + universal Working Approach

Two additions, both folded in together: smarter bash-output compaction, and a standard task-execution guardrail block in every generated CLAUDE.md.

- **Bash filter now groups, not just clips.** `compactExcerpt` gained three shape-aware modes ahead of the old head/tail clip: file listings (git status / ls / find) collapse into a **by-directory histogram**, lint findings (ruff / flake8 / pylint / clippy / eslint stylish) collapse into a **by-rule histogram**, and identical adjacent runs **dedupe** into `line  (×N)`. Grouping only triggers when a clear majority of lines match the expected shape (ratio gates: 0.6 for paths, 0.5 for rules, min 8 lines) — otherwise it falls back to dedupe + clip, so prose output is never mangled. A new `Test summary:` section surfaces aggregate test-runner result lines (cargo `test result:`, jest `Tests:`/`Test Suites:`, pytest `N passed … in`, mocha `N passing`) that dedupe/clip would otherwise bury under per-test noise. New unit coverage for `dedupeLines`, `testSummaryLines`, `groupByDirectory`, `groupByRule`, and the `summarize` integration paths.
- **`/init` emits a `## Working Approach` block.** Every generated CLAUDE.md now carries a standard, non-adaptive block of universal task-execution guardrails — think-before-coding, simplicity-first, surgical-changes, goal-driven, read-before-write, checkpoint-multi-step, fail-loud — so ad-hoc work outside the pipeline (where no skill gate fires) gets the same discipline the lifecycle skills enforce. It complements the maturity-adaptive Philosophy section rather than repeating it, and **deliberately omits a token-budget rule** (context management is the harness's job; `_shared/auto-mode-contract.md` forbids the model from inserting context-window stop prompts).

## v4.12.0 — wrap-up generates skill candidates (2026-06-04)

`/claude-tweaks:wrap-up` began proposing skill candidates rather than only
filtering ones already tagged.

## v4.11.0 — Ephemeral worktree dev server for visual review (2026-05-25)

In `auto` mode, visual review starts its own throwaway dev server in the
worktree instead of requiring one to be running.

## v4.10.0 — Worktree base ref fix; one worktree per multi-spec flow (2026-05-25)

Corrected which ref a worktree branches from, and made a multi-spec `/flow`
share a single worktree across its specs instead of one each.

## v4.9.0 — Spec-committed pre-flight gate (2026-05-24)

`/flow` gained a pre-flight gate requiring the spec to be committed, and
`/claude-tweaks:specify` became terminal at its commit.

## v4.8.0 — /flow defaults to auto with an FYI Manifesto (2026-05-24)

`/flow` defaulted to `auto`, showing the Pipeline Config Manifesto as
information rather than a prompt, with a confirm gate ahead of it.

## v4.7.1 — Statusline ledger fix

- **Statusline `ledger` segment now sums open rows across *all* `-ledger.md` files in the current checkout's `docs/plans`**, instead of reading only the most-recently-modified file. The old "newest file wins" logic both undercounted (open items in older ledgers were invisible) and relied on mtimes that are unreliable right after a worktree checkout. Worktree isolation is preserved — the scan is relative to the session's `cwd`, so side-by-side worktrees never see each other's uncommitted ledgers. Added `findOpenLedger` test coverage (previously none).

## v4.7.0 — Deep web research + Diagram Design companion

`/claude-tweaks:research` was built by vendoring
`199-biotechnologies/claude-deep-research-skill` at `f2f2c0f`, kept with its
`UPSTREAM.md` and upstream licence, with output paths repatched to
`.claude-tweaks/research/`.

**`/claude-tweaks:research`** adds citation-audited deep web research to the plugin. Four runtime modes trade depth for time:

- **quick** (~2-5 min, 5+ sources) — fast scan
- **standard** (~5-10 min, 10+ sources) — balanced default
- **deep** (~10-20 min, 15+ sources) — comprehensive synthesis with broader source pool
- **ultradeep** (~20-45 min) — multi-persona red-team with adversarial review

As of v4.15.0 this delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, with a lean inline fallback otherwise. Reports land under `.claude-tweaks/research/`.

**`/claude-tweaks:visualize`** — native diagram generation, replacing the former `diagram-design` companion-plugin integration. Generates self-contained HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid), themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up), with an optional D2-backed enhanced rendering path. Soft-hook nudges in `/journeys` Step 3.6, `/specify` Step 2.5d, and `/review` Lens 3i-diagram suggest invoking it — gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations.

## v4.6.4 — Multi-spec ordering, conflict detection, keep-going (2026-05-16)

Multi-spec runs gained ordering, conflict detection between specs, and a
keep-going posture on failure.

## v4.6.3 — Consolidated multi-spec Review Console (2026-05-16)

One Review Console for a whole multi-spec run rather than one per spec.

## v4.6.2 — Manifesto UX: pipeline preview + inline options (2026-05-15)

The Pipeline Config Manifesto gained a preview of what would run, with options
inline.

## v4.6.1 — Lazy-load entry points + /init contract-drift check (2026-05-15)

Entry points became lazy-loaded, and `/init` gained a check for drift against
the pipeline contract.

## v4.6.0 — Bookend Architecture + Auto-Mode Contract

The pipeline now has at most **two user-facing stops in `auto` mode**, regardless of how many decisions it makes:

- **Pipeline Config Manifesto** at the start (`/flow` Step 3) — one structured table pre-fills every policy lever (scope-creep, overlap, design-intent, leftover-routing, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) with recommended defaults. Hit "Approve all recommendations" or override specific items.
- **Wrap-Up Review Console** at the end (`/wrap-up` Step 8.6) — one consolidated batch surfacing every auto-decided item, every staged item, skill updates, and config changes. Hit "Approve all" or override specific items.
- **Mid-flow** — pure automation. Every decision is logged to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (AUTO / STAGED / KEPT-PROMPT), rationale, and reversibility. The Review Console reads this log.

New shared files:
- `skills/_shared/auto-mode-contract.md` — single source of truth for what `auto` silences AND what it does not (ledger resolve Phase 2, INBOX/DEFERRED writes, `/challenge` lenses, governance gates, HARD-GATEs). Defines reversibility/confidence/severity floors and decision precedence.
- `skills/_shared/auto-decision-log.md` — audit-trail spec. Every auto-resolution logs a one-liner. The user reviews the log at wrap-up rather than upfront.

Per-pipeline state lives in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` (config.yml + decisions.md + staged/) — collision-safe for parallel agents in the same checkout.

Per-skill rewrites: `/review` Step 3g (severity-based routing), `/tidy` (aggressiveness-based routing), `/init` Phase 3 (confidence-gated), `/build` Common Step 1.5 (scope-creep policy), `/specify` Step 1 + 2.5b + 2.5c (overlap + shape + design-intent policies), `/stories` Step 1 + 6 (legacy + journey-link auto), `/test` Step 3 (auto-fix-threshold), `/visual-review` Step 1 + 2 (auto-skip + log), `/capture` (`--route` arg), `/reflect` Step 3 (auto-route safety findings + stage rest), `/wrap-up` Step 4 + 7.5 (policy lookup + stage).

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto`. Mid-flow stops are reserved for HARD-GATEs and the explicit "not silenced" list.

## v4.5.2 — Pipeline contract: 2-tier taxonomy, shape gate, auto-mode (2026-05-03)

The pipeline contract took its two-tier taxonomy, a shape gate, and auto-mode
handling.

## v4.5.1 — Fix Impeccable install instructions; namespace slash commands (2026-05-03)

Corrected the Impeccable install instructions and namespaced every slash-command
reference.

## v4.5.0 — Impeccable Integration

Phases 1 and 2 were published as their own builds — `4.5.0-phase1` and
`4.5.0-phase2` — before Phase 3 and GA landed under 4.5.0 itself. Those are the
only two versions this plugin has ever shipped that are not plain `X.Y.Z`, and
they cannot carry their own heading here: the changelog parser requires a strict
three-component version, so `bin/lib/changelog.js` treats a prerelease build as
covered by its base version's entry.

Three-phase rollout of the `/claude-tweaks:design` wrapper for the [Impeccable](https://github.com/pbakaus/impeccable) frontend-design plugin:

- **Phase 1** — wrapper skeleton + read-only integration. The `/claude-tweaks:design` skill exposes 6 mode signatures; `test` (CLI gate) and `review` (advisory critique + audit) are active. `/init` Step 0.9 walks the user through Impeccable plugin install, CLI install, and `/impeccable teach` setup. `/test` Step 1.5 is the deterministic CLI gate; `/review` Step 6.5 surfaces "Design Quality" findings advisorily.
- **Phase 2** — code-modifying integration. `/build` Common Step 1.7 lazy-loads Impeccable reference files into the implementer subagent's context (`pre-build` mode). `/specify` accepts polymorphic input (topic name → invokes `/superpowers:brainstorming`; design doc path → existing behavior), runs the Impeccable `shape` pre-step on frontend design docs, asks the design-intent question, and writes `surface:` + `design-intent:` frontmatter on every generated spec. `/flow` adds a `polish` phase between review and wrap-up that dispatches Impeccable's auto-fit + issue-driven commands; a re-verify gate (`/test skip-qa`, one-cycle cap) catches polish-broke-verification cases. New `no-polish` flag on `/flow` and `skip-qa` flag on `/test` are the user-facing controls.
- **Phase 3** — creative surfacing system. Intent-driven dispatch lights up in `polish` mode (reads `design-intent:` frontmatter and dispatches `bolder`, `quieter`, `distill`, `delight`+`animate`, `onboard` per the value). The `survey` mode goes active and produces ranked Creative Opportunities recommendations rendered as **three independent anchors** so creative commands cannot get buried:
  - **Anchor 1 — `polish` mode intent dispatch.** Auto-runs the matching creative command(s) when intent is declared (no decline tracking — explicit frontmatter is consent).
  - **Anchor 2 — `/visual-review` Creative Opportunities block.** Survey runs against captured screenshots; recommendations rendered after the findings table. Read-only.
  - **Anchor 3 — `/flow` pipeline summary Creative Opportunities block.** Survey runs against the full diff; recommendations rendered before Next Actions. Read-only. Decline tracking suppresses recommendations the user repeatedly ignored (2-decline threshold; reset via `/claude-tweaks:design reset-recommendations <spec>`).

The manual-only commands (`colorize`, `extract`, `overdrive`) are surfaced via `survey` recommendations only — they remain user-invoked to avoid creative drift. All v4.5 changes are gated by Phase 1's 3-layer detection — non-frontend specs and projects without Impeccable installed skip cleanly. The integration is opt-in via `/init` Step 0.9.

**Caches written by the wrapper** live alongside the open items ledger at `docs/plans/YYYY-MM-DD-{feature}-{audit|recommendations|declined}.json`. All three are cleaned up by `/wrap-up` Step 5 alongside the ledger.

## v4.4.0 — Per-item consent for INBOX/DEFERRED writes (2026-05-03)

Writing an item to INBOX or DEFERRED required explicit per-item user consent.
Carries the Impeccable integration design spec and its decomposition into three
phase documents.

## v4.3.2 — Statusline survives plugin upgrades (2026-05-03)

The statusline is invoked through a stable wrapper at `~/.claude-tweaks/bin/`,
so a plugin upgrade no longer breaks a configured `statusLine.command`.

## v4.3.1 — /init Step 0.8 writes a literal `${CLAUDE_PLUGIN_ROOT}` (2026-05-03)

Step 0.8 had been expanding the variable at write time, baking one machine's
path into the config; it now writes the literal and migrates old paths.

## v4.3.0 — Statusline schema fix + /version skill (2026-05-03)

Fixed the statusline schema and added `/claude-tweaks:version`.

## v4.2.0 — Token Saver

Three additions that reduce token consumption with no behavior change to skills:

- **Bash output filter** — a `PostToolUse[Bash]` hook compacts noisy test/build/CI output (>16KB) while preserving failure lines. Matches governor's logic: head + tail clipping, failure-marker regex, threshold-based decision. Filtered output ends with `[full output: ~/.claude-tweaks/logs/bash-{ts}.log]` — `Read` that path for unfiltered detail. No bypass command; the saved log is the escape hatch.
- **Statusline** — a self-sufficient 9-segment line: `model · ctx% · effort · git · session · weekly · saved · spec · ledger`. Auto-hides empty segments. Semantic ANSI 8-color (red/yellow/green) with `NO_COLOR` respect. Wired up by `/claude-tweaks:init` Step 0.8 — never overwrites an existing `statusLine.command`. Cross-platform (macOS, Windows, Linux best-effort).
- **Subagent output contract** — `skills/_shared/subagent-output-contract.md` defines Templates A/B/C for parallel-dispatched Task agents. Used today by `/browse`, `/help`, `/review` (review-lens dispatch + parallel-fix dispatch), and `/tidy`.

**New dependency:** Node 18+ (used by the bash filter hook and statusline). `/claude-tweaks:init` Step 0.8 detects missing Node and offers to install via the platform's package manager (brew / winget / scoop on macOS+Windows; manual sudo command printed for Linux). Git CLI is optional; the `git` statusline segment hides when absent.

To disable color: `export NO_COLOR=1`. To inspect raw bash output: `cat ~/.claude-tweaks/logs/bash-{ts}.log` (path appears in the filter footer).

## v4.1.0 — Quality-of-life follow-through on the v4.0 migration

Quality-of-life improvements that emerged from doing the v4.0 migration. Non-breaking; opt in by adding the relevant settings to your project's `CLAUDE.md`.

- **Project-level defaults** — new `Worktree`, `Subagent`, `Brainstorm`, `Pre-flight`, and `Plan audit` sections in CLAUDE.md let you set defaults that claude-tweaks reads before invoking sub-skills (worktree directory, subagent pattern for markdown projects, section-batching behavior, merge-check toggle, scope-keyword enforcement).
- **`/build` Plan Audit step** — verifies plan-referenced paths exist; when the plan declares `Scope keywords:`, greps the repo and lists files outside the plan that match. Catches "remove X" plans that miss a file.
- **Pre-flight merge check** — `/build worktree` and `/flow` fetch `origin/main` before creating a worktree and warn on divergence. Surfaces "main shipped while you were working in a worktree" early instead of at branch finish.
- **Scope-aware `/flow` routing** — when a design doc / plan touches 10+ files, ships a major version bump, or runs 300+ lines, `/flow` surfaces a warning suggesting `/specify` decomposition first. Bypassed in `auto` mode.
- **`/flow auto` keyword** — symmetrical with `/build auto`. Silences the merge-check and scope-check prompts (each auto-acknowledged in the ledger), making `/flow … auto` a single-decision invocation.
- **Adaptive section batching** — when a multi-section approval flow gets 2 consecutive yeses, remaining sections are batched into one approval. Configurable via `Brainstorm / section-confirmation` (`adaptive` | `per-section` | `batch`).

### Breaking changes — branch-numbered v4.0

`main`'s tip went 3.23.0 straight to 4.1.0: the agent-browser migration and the
follow-up fixes merged together, so no install ever reported 4.0.0.

Two changes affect users upgrading from v3:

1. **Browser tooling switched to agent-browser.** Install: `npm install -g agent-browser`. Uninstall is optional but recommended: `npm uninstall -g @playwright/cli`. Chrome MCP support is removed entirely.
2. **`/stories` schema bumped to v2.** Existing v1 story files (with CSS selectors) are detected on first run and you'll be prompted to regenerate — `/stories <url>` reuses your existing story names, descriptions, and journey assignments while replacing CSS selectors with semantic locators (role / text / testid). No silent breakage.

Run `/claude-tweaks:init` against your existing project to refresh the configuration after upgrading.

## v3.23.0 — /build defaults to worktree mode (2026-05-01)

Worktree isolation became the default for `/claude-tweaks:build` rather than an
opt-in argument.

## v3.22.0 — Worktree cleanup hard-stop and visual-review skip bias (2026-03-09)

Fixed a hard-stop in worktree cleanup and a bias that let visual review skip
itself. Carries the design spec and implementation plan for the agent-browser
migration that became v4.0, and a `.gitignore` for `.worktrees` and `.DS_Store`.

## v3.21.0 — Superpowers transition friction, flow worktree default, init scope (2026-03-07)

Reduced friction in the handoffs to Superpowers skills, defaulted `/flow` to
worktree mode, and added scope selection to `/init`.

## v3.20.1 — Automatic worktree cleanup in wrap-up (2026-03-07)

`/claude-tweaks:wrap-up` began cleaning up its worktree without being asked.

## v3.20.0 — visual-review becomes a standalone component skill (2026-03-07)

Extracted `/claude-tweaks:visual-review` out of its callers, following the
same split v3.19.0 applied to reflect, simplify and journeys.

## v3.19.0 — reflect, simplify and journeys become standalone component skills (2026-03-07)

Three behaviors that had been inlined in larger skills became separately
invocable skills, callable both directly and as pipeline steps.

## v3.18.0 — Cross-reference drift, contradictions, missing error paths (2026-03-06)

A consistency pass across the skill set: fixed drifted cross-references,
resolved contradictions between skills, and added error paths that were
documented nowhere.

## v3.16.0 — Visual review optimization + reconnaissance pre-step (2026-03-04)

Added a reconnaissance pre-step to visual review and optimized the rest of it.
The bulk of the version is a README rewrite that cycled through ASCII and
Mermaid diagram layouts before settling, plus a switch to full
plugin-prefixed skill names throughout the README and reference card.

## v3.14.0 — Version bump and manifest fix (2026-03-01)

A version bump and a manifest correction, with no other content.

## v3.13.0 — Ledger skill, dev-URL persistence, flow resume (2026-03-01)

Added `/claude-tweaks:ledger`, persisted the dev URL between runs, and made
`/flow` resumable. Also a general interaction-efficiency pass.

## v3.12.0 — Journeys integrated into stories (2026-02-28)

Story generation became journey-aware: coverage tracking against documented
journeys, and detection of stories orphaned from any journey.

## v3.11.0 — Auth profiles for QA stories (2026-02-27)

QA stories gained credential discovery and named auth profiles, replacing
guesswork about how to log a persona in.

## v3.10.0 — Contextual Next Actions + Actions Performed table (2026-02-27)

Every skill gained a context-derived `Next Actions` block and an
`Actions Performed` table — the interaction conventions that still govern the
plugin.

## v3.9.0 — Skill updates redesigned across the lifecycle (2026-02-26)

Reworked how skill files get updated at each lifecycle stage.

## v3.8.0 — /test splits from /review; QA pipeline overhaul (2026-02-26)

Separated the mechanical "does it work" gate (`/claude-tweaks:test`) from the
judgment gate (`/claude-tweaks:review`), overhauled the QA pipeline, and fed QA
results into visual review inside `/flow`.

## v3.5.0 — QA story execution automated (2026-02-25)

Dev-URL detection, auto-trigger in `/flow`, and auto-validation in `/review`,
so stories ran without being invoked by hand.

## v3.4.0 — Drop the /superpowers: prefix from skill references (2026-02-25)

Skill references lost the `/superpowers:` prefix, and `/flow`'s worktree
default was corrected. Also standardized the worktree directory on
`.claude/worktrees/`.

## v3.3.0 — Windows compatibility (2026-02-25)

Fixed Windows incompatibilities across skills, hooks and agents.

## v3.2.0 — Tidy action vocabulary, verification step, help handoff gate (2026-02-25)

`/claude-tweaks:tidy` gained its action vocabulary and a verification step, and
`/help` gained a handoff gate.

## v3.1.1 — Build option prompts (2026-02-25)

Version bump for the build-option prompting added in 3.1.0.

## v3.1.0 — All Superpowers skills integrated via a 2x2 build matrix (2026-02-24)

`/claude-tweaks:build` routed to the full Superpowers skill set through a 2x2
matrix, prompted for build options when they weren't passed as arguments, and
renumbered its steps 1-7.

## v3.0.1 — Fix duplicate hooks error on install (2026-02-24)

Installing hit a duplicate-hooks error; the redundant manifest field causing it
was removed.

## v3.0.0 — browser-pilot merges into claude-tweaks (2026-02-24)

Absorbed the separate browser-pilot plugin. Also enforced one batch decision
table per message across all skills, fixed the agents manifest field to take an
array of paths, and dropped the redundant `hooks` field now that
`hooks/hooks.json` loads by convention.

## v2.9.0 — Correct Superpowers command names; /capture promote options split (2026-02-22)

Fixed wrong Superpowers command names and split `/capture`'s promote options.

## v2.8.0 — Parallel execution directives + multi-spec flow (2026-02-22)

Added the parallel-execution directives that skills still use to signal
concurrent work, and multi-spec support in `/flow`. Journey capture widened
from end users to all personas.

## v2.7.0 — Cross-spec intelligence (2026-02-22)

Pattern detection, journey regression checks and dependency awareness across
specs. Routing was biased toward fixing now — close small gaps early rather
than deferring them — with the hierarchy stated as fix now -> defer -> INBOX.

## v2.6.0 — Workflow friction reduction (2026-02-22)

Batched decisions, removed navigation menus, and fixed cross-references — the
first pass at the interaction conventions that became house style. Added design
mode to `/flow` (brainstorming straight to pipeline, skipping `/specify`) and
gave the plugin repo its own CLAUDE.md.

## v2.5.0 — Journey discovery mode for brownfield projects (2026-02-22)

Journeys could be discovered from an existing codebase rather than only written
for new work.

## v2.4.0 — Explicit routing gates (2026-02-21)

Every skill got explicit routing gates so nothing could be silently dropped —
the ancestor of the current "every surfaced item must be explicitly resolved"
rule.

## v2.3.0 — browser-review skill, user journeys, browser setup (2026-02-21)

Added the browser-review skill, user journey documentation, and browser setup.

## v2.2.0 — Build modes, help and flow skills (2026-02-21)

Added build modes (autonomous by default, plus guided and branched), the
`/help` and `/flow` skills, and lazy-loaded codebase onboarding. Also an audit
follow-up removing dead references and resolving contradictions.

## v2.0.0 — The workflow system replaces the hello skill (2026-02-21)

The placeholder skill gave way to the full workflow system: design mode in
`/build` (build straight from a design doc, skipping `/specify`), numbered
options for choices and skill transitions, and the `claude-tweaks:` prefix on
every skill name and cross-reference.

## v1.0.0 — Initial scaffold (2026-02-20)

The first commit: plugin scaffold.
