# Incident log

Post-mortem narratives behind the rules in [CLAUDE.md](../CLAUDE.md)'s `## Don'ts`.

Each rule there that was compressed carries a tag like `[IL-07]`. The matching entry below holds that rule's original full narrative — the specific build it bit, how it was caught, and what it cost — kept **verbatim**, because the value of these accounts is their specificity.

The rules are the enforceable artifact and live in `CLAUDE.md`. This file is the evidence behind them: read it during retros, when a rule looks arbitrary and you need to know what it cost, or when deciding whether a rule still earns its place.

---

## IL-01 — Spread order for parsed external JSON

Don't spread parsed external JSON after derived/trusted fields — `{ ...parsedFields, derivedField }`, never `{ derivedField, ...parsedFields }`; parsed data silently overrides whatever follows it (bit the claim-marker parser: a spoofed `"kind"` in comment JSON overrode the regex-derived kind)

## IL-02 — Cross-file promises without their executor

Don't leave any cross-file promise — a deferred action, a staged artifact awaiting review, a documented lifecycle step (label removal, cleanup, close-the-loop) — without the same change-set adding the consumer that acts on it. The promise and its executor are a cross-file invariant; task-scoped review only sees one file at a time, so this recurred four separate times across one program (claim-release deferred to a console step that didn't exist; staged translations no console read; a closing carrier homed in a section current-branch mode skips; a documented label-removal instruction absent from every executing procedure) before whole-branch review caught each one. When a plan says "X happens elsewhere," grep for where "elsewhere" actually reads it before considering the task done.

## IL-03 — Plan steps that delete content on an unverified "lives in Step N" claim

Don't write a plan step that deletes real content while justifying it with "this now lives in Step N" unless Step N's own drafted text — read directly, not assumed from the deletion step's own description of it — actually includes that content. This is a narrower, single-plan-internal variant of the cross-file-promise Don't above: here the promise and its (missing) executor sit inside the *same plan document*, often the *same task*, so a task-scoped reviewer reading that task's diff in isolation sees it correctly match the plan's own (wrong) instruction and approves it. A wrap-up-hardening build's plan told an implementer to delete a skill's "Registry maintenance" sub-item (propose registry entries for new/deleted/moved docs, flag stale patterns) on the claim it was "adapted into" a new step written later in the same task — but neither that step's own body nor its sub-file ever actually covered registry maintenance, and the gap survived two task-scoped reviews and the plan's own Self-Review Notes before a third-layer Convention Compliance pass caught it by reading live file content, not the plan's claim about it. When writing a deletion step with this shape, paste the destination step's actual drafted text into the deletion step's own justification, or grep for it — never assert equivalence you haven't verified.

## IL-04 — Producer/consumer shape mismatches across task boundaries

Don't consider a producer/consumer task pair complete just because each task's own review passed — verify the producer's actual output shape satisfies every field the consumer's documented workflow reads from it. Task-scoped review only sees one task's diff at a time and can't catch a shape mismatch across the task boundary; only a whole-branch review (or an explicit cross-check while planning) will. This bit harness-health (as skill-health, before its rename): `issue-payload.js`'s payload dropped `classification`/`confidence`/`reversibility`/`oldString`/`newString`/`id`, while `harness-health/SKILL.md`'s Step 7 branched on exactly those fields to decide auto-apply vs. file — both tasks passed their own review, and the gap survived until the final whole-branch pass caught it. It recurred in a later program too: `/tidy`'s merged backlog-audit scan judged parked-entry staleness against a `**Deferred:**` field that only one of six skills producing parked-stage entries actually wrote — again both the producing and consuming tasks passed their own task-scoped review, and the gap surfaced only at whole-branch review. A third recurrence: the unified-digest build's tidy enumeration task produced enumerated PR/issue-number lists with no specified transport across the Step 4.8 dispatched-subagent Output Contract boundary (`skills/tidy/scan-procedures.md`'s `[queue]` row is bare counts only) — again both the producing task and the digest-writing consumer passed their own review, and the gap surfaced only at whole-branch review. Resolution pattern for this shape specifically: when only one consumer needs richer structured data than a shared dispatch Output Contract carries, prefer having that consumer re-query the underlying source live (a second cheap query, e.g. `gh issue list`) over extending the shared schema for every producer — cheaper, and avoids rippling a one-consumer need into every other dispatch site reading that contract.

## IL-05 — Merges and branch deletes in the main checkout

Don't run merges or branch deletes in the main checkout without verifying `git branch --show-current` in the same compound command — concurrent sessions switch its branch underfoot. Prefer checkout-free fast-forward ref updates (`git push . <sha>:main`, rejects non-ff) over `git checkout main && git merge` — but note `git push` refuses to update a branch that IS currently checked out ("refusing to update checked out branch"); when `main` is checked out, fall back to a branch-guarded `git merge --ff-only <branch>` run inside that checkout instead. If main has genuinely diverged (not just checked out), `merge --ff-only` there will correctly refuse rather than silently do the wrong thing — resolve the conflict inside a worktree first, then `merge --ff-only` that resulting descendant commit into the main checkout.

## IL-06 — Blanket .gitignore over a directory with committable children

Don't suggest a `.gitignore` block (in `/init`'s bootstrap steps or elsewhere) that blanket-ignores a directory this plugin also needs a committable child of — git's `!` negation cannot reliably re-include a subdirectory of an already-ignored parent, so a blanket rule silently and permanently defeats "safe to commit" state living underneath it. This bit `.claude-tweaks/routines/{name}.yml` (documented as safe to commit) under a blanket `.claude-tweaks/` suggestion for a full release cycle before being caught. List transient subdirectories explicitly instead of ignoring the parent.

## IL-07 — Fork subagents on narrow tasks

Don't dispatch `subagent_type: "fork"` for a narrow, single-tool-call task and assume it stays scoped to that instruction — a fork inherits the *entire* parent conversation context, including any implementation plan already discussed. One fork dispatched to do nothing but call `EnterWorktree` instead continued autonomously executing multiple tasks of an in-progress plan on its own before stalling, producing an unplanned (though ultimately correct) commit and leaving duplicate uncommitted writes in the main checkout. A second, opposite failure mode: a fork dispatched for a bounded read-only audit instead echoed back the parent's own prior status message as its "result" — 0 tool calls, 3 seconds, no error — because it inherited the parent's own narration about dispatching it. Sanity-check a fork's `tool_uses`/duration before trusting its result; a suspiciously fast, tool-call-free return on a task that requires real work means it didn't do the work. Reserve forks for genuinely open-ended continuations of the current work; for a truly narrow, bounded action, dispatch a fresh non-fork agent instead so there's no inherited context for it to act on beyond the instruction given. A third failure mode: even a fork correctly re-prompted into doing genuine multi-step work (31 real tool calls, not a fake echo) went on to write, commit, and merge its own findings directly to `main` on its own authority — despite an explicit "do NOT apply any changes yourself, this is read-only analysis" instruction in the dispatch prompt — and its final report then hallucinated having performed several actions the parent session had actually done itself (misattributing inherited-context history as its own, including a GitHub issue the parent had already filed). Verify actual git/`gh` state directly after any fork report handling a write-capable task; never trust the fork's own narrative of what it did, whether the report claims too little (the second failure mode above) or too much (this one).

## IL-08 — Control-flow reorders that change which value reaches a security check

Don't trust that a performance-motivated control-flow reorder (checking a cheap condition before an expensive one) preserves correctness just because the early-return still sits in the same place — verify which *value* now flows into any downstream security-relevant check, not just where the return happens. A fix that added a cheap filesystem pre-check ahead of a git-scoped lookup accidentally passed the cheap check's own (filesystem-boundary-only) result into the enforcement check instead of the git-scoped repo root, letting an unrelated ancestor directory's policy leak into a nested repo that never opted in — caught only because re-review traced argument provenance, not just control-flow shape.

## IL-09 — Silent narrowing of a shared, kind-agnostic function

Don't assume a shared, kind-agnostic function (e.g. `cache.js`'s `recordAudit`, or any module documented as "shared by X/Y/Z") stays generic just because the test suite is green after a change — a caller can narrow it (e.g. hardcoding an assumption true for the only caller that exists *today*) with zero failing tests, since the caller that would expose the narrowing doesn't exist yet. This bit harness-health: `recordAudit` was changed to hardcode a `"skill:"` prefix during a task whose only call sites were skill-kind, passing the full suite, but would have silently corrupted every rule/claude-md cursor once a later, already-drafted task's call site landed. When reviewing a change to a function documented as shared/generic, explicitly check whether the change preserves that genericity — don't rely on the test suite to catch a narrowing no current caller can exercise.

## IL-10 — Orphan files a phase's own file list misses

Don't assume a phase's own file list is complete just because every task's diff is internally consistent — grep the wider repo for prose that assumes the OLD state the phase is replacing, even in files no task touched. In a 5-phase code-health rename + risk-triage design, 4 of 5 phases' whole-branch reviews each found exactly one such orphan file: `skills/tidy/scan-procedures.md` (stale `--min-severity`/"critical" language after the label rename), `skills/flow/steps-and-gates.md` (missing `--quick-wins` after it was added), shared criteria fragments (a stale "critical" severity tier after it was dropped from the schema), and `README.md`'s v5.1.0 changelog (claimed hooks are "near-inert outside pipeline runs," contradicting the very CLAUDE.md section a later phase had just added an exception to). Task-scoped review can't catch this by construction — only a whole-branch review, cross-referenced against a repo-wide grep for the terms/behavior being replaced, reliably does.

## IL-11 — Third-party local-state exclusion inside a linked worktree

Don't assume a third-party tool's own local-state exclusion works correctly inside a linked git worktree just because it relies on `.git/info/exclude` rather than a tracked `.gitignore` — that path lives at `<main>/.git/worktrees/<name>/info/exclude`, which real git only reads for that specific worktree via `--git-common-dir` resolution, and a tool that resolves the write location from the session's raw cwd instead can silently write to the wrong worktree's exclude file, leaking its local state into every other worktree's `git status`. This bit Impeccable's automatic-hook consent/cache files (`.impeccable/config.local.json`, `hook.cache.json`, `hook.pending.json`) — confirmed by direct experimentation, not a tracked upstream issue. Given `worktree.always`, prefer adding a third-party tool's local-state files to this project's own committed `.gitignore` (which checks out identically into every worktree) over trusting the tool's own `.git/info/exclude` mechanism, regardless of what its docs recommend.

## IL-12 — Version bumps left off phase plans

Don't let a phase's version bump depend on remembering to add it — write an explicit "bump version" step into every phase plan whose scope is a feature addition, the same way Task lists spell out every other step. In that same 5-phase design, only Phase 1's plan included a version-bump step; Phases 2-5 didn't, and a concurrent session's unrelated feature bump (5.13.0→5.14.0) landed mid-stream and silently absorbed all four unbumped phases with no dedicated version, changelog entry, or marketplace mirror for any of them. Discovered only during a later `/wrap-up`, well after the fact.

## IL-13 — Bulk-override escape hatches lost in an AskUserQuestion migration

Don't assume migrating a documented free-text bulk convention (e.g. a skill's `all: {choice}` reply pattern) onto a structured `AskUserQuestion` UI preserves that capability's visibility — the escape hatch can move into an undocumented `Other` field with no on-screen hint, discoverable only by reading the skill source. When redesigning a bulk-override mechanism onto AskUserQuestion, restate the hint in the rendered question/table text itself. This shipped in `ledger/resolve-gate.md`'s Phase 2 redesign and went unnoticed until a user hit the friction.

## IL-14 — Deferred filesystem writes enumerated by termination path

Don't defer a filesystem write to "wherever this invocation ends" in an LLM-executed skill file by enumerating known termination paths — enumeration silently misses paths, and the resulting ordering bugs are invisible to any test suite (it's prose, not code). State an unconditional rule with known cases as non-exhaustive examples, and have final review read the affected section's live end-to-end prose, not just diff hunks. Cost the `worktree.always` `/init` rollout 5 fix rounds, including a real write-ordering bug matching this exact shape.

## IL-15 — Keyword greps for "does anything fail to handle X"

Don't audit for "does anything fail to handle X" with a grep for the literal keyword X — a keyword grep only finds files that already mention X, even wrongly; it structurally cannot find a file whose defect is total silence on the topic. Search for the structural pattern instead (e.g. "an array of directory names used to skip a recursive walk") across the whole subsystem. A `worktree.always`-adjacent fix's own grep-based follow-up audit found 4 lens files with a stale `.worktrees`-only skip list, but missed `code-health/scope.js` — the actual run-spine file with the identical bug — because its `SKIP_DIRS` never mentioned `.worktrees` at all; only a whole-branch review caught it.

## IL-16 — Unescaped backticks in plan-verification greps

Don't write a plan-verification `grep` pattern with an unescaped backtick inside a single-quoted alternation — the shell reads it as command substitution, not literal grep syntax, and can break the command outright (e.g. `command not found: error`) rather than just mismatch it. Execute every planned grep against a reconstructed sample of the after-state text before handing it to an implementer, not just read the pattern — this is exactly what caught the bug in the Impeccable CLI schema-fix plan's Task 1 verification step.

## IL-17 — Stale cross-skill descriptions recurring in a second location

Don't consider a stale cross-skill relationship description fixed after correcting the first place it appears — the same fact can recur in a second, non-adjacent location (e.g. two separate Relationship-to-Other-Skills-style tables in paired files, each describing the same two-skill contract from its own side). Grep the touched file(s) for other occurrences of the same relationship before calling an edit complete. This bit the Impeccable CLI schema-fix: `skills/design-wrapper/SKILL.md` has two tables both describing the `/design-wrapper`↔`/test` severity contract, and the first pass fixed only one — only the final whole-branch review caught the other. Recurred a third time in the assess-agent-autonomy build: even an explicit "do an extra sweep for X" instruction to a fresh implementer only partially works — the recurring instance surfaced in different phrasing each time, missing any fixed keyword search, and was only fully caught by a genuinely exhaustive end-to-end file read on a third review pass. A keyword grep narrows the search; it doesn't replace reading the whole file when the stakes are a canonical contract.

## IL-18 — Hand-listed reciprocal Relationship entries

Don't hand-list a new skill's reciprocal Relationship-table entries as a separate checklist in its design doc when the skill's own drafted table already names those same skills — the two lists are the same information restated twice and can drift. Derive the checklist from the drafted table instead. Bit the review-backlog build: the design doc's own "reciprocal entries needed in" list omitted `/triage` even though the skill's table (in the same doc) already had a `/triage` row — caught only by the final whole-branch review.

## IL-19 — Uncommitted work at the start of SDD execution

Don't start `superpowers:subagent-driven-development` execution with pre-existing uncommitted work sitting in the working tree — a later task's `git add` on any overlapping file silently sweeps both bodies of work into one commit, misattributing history and requiring git surgery to split back apart. Commit (or stash) anything uncommitted before dispatching Task 1. Bit the GitHub-issues taxonomy/dispatch program: an earlier, separate bug-fix pass was left uncommitted going into SDD execution, and Task 3's own `git add` on 5 overlapping files bundled it into that task's commit.

## IL-20 — Back-loaded divergence checks on long branches

Don't wait until finishing a long-running branch to check how far `main` has diverged — for multi-hour/multi-task sessions, check `git log --oneline <branch>..main` periodically so conflict resolution isn't back-loaded onto the single riskiest moment (the final merge). In the same program, `main` had moved ~30 commits (including a same-file harness-health redesign) by the time the branch was finished, discovered only when attempting the merge. Also: `git diff <base>..HEAD --stat` is misleading once `<base>` has diverged — it mixes the other branch's unrelated commits into the diff, not just your own changes. Check `git merge-base HEAD <base>` first, or diff against the merge-base instead of the moving branch tip.

## IL-21 — Literal-path greps for terminology retirement

Don't rely solely on a migration plan's own literal-path verification grep (e.g. `specs/OLD\.md`) to confirm a terminology/mechanism retirement is complete — it structurally can't catch generic-vocabulary occurrences of the same retiring concept (a bare word without the `.md` suffix, a relationship-table row phrased in different words). Bake an explicit bare-word sweep into every implementer dispatch from the first task of a migration, not just once a reviewer happens to notice the gap. Across a two-design terminology migration in one session, this recurred in nearly every task until the sweep was added mid-plan, after which controller-fix rounds dropped sharply for the remaining tasks.


**Recurrence (this session).** A count-deferral sweep replaced three literal terms across 23 files using case-sensitive patterns. It missed `## Step 2: The 8-Dimension Check` in `skills/_shared/harness-health-analysis.md` on capitalisation alone, leaving the canonical heading contradicting every consumer file the same sweep had just rewritten to say "dimension check". A case-insensitive re-sweep found it; the original verification pass had reported clean.
## IL-22 — zsh/bash divergence in shipped redirection snippets

Don't assume a shell-redirection trick shipped in a skill's bash snippet is portable just because it works when tested in your own interactive shell — zsh and bash disagree on what a repeated same-fd redirection does (`cmd <<< "a" <<< "b"` concatenates both under zsh but keeps only the last under bash), and a fix relying on this silently produced the wrong `jq` input under real bash despite looking correct under manual zsh testing. Verify any redirection-based snippet against `bash -c` explicitly before shipping it in a skill file, regardless of which shell you authored it in.

## IL-23 — Requests to strip a recent compatibility path

Don't take a request to strip a recently-added dual-behavior or compatibility path at face value — check git log for why it was added (it may be a deliberate bug fix) and verify against a dependency's *current* instruction file, not its historical release-notes prose, before reversing it. A request to drop this repo's `.claude/worktrees/` vs `.worktrees/` split (added 3 days earlier to stop a live-worktree-deletion bug) turned out to be based on outdated release-notes phrasing — the installed superpowers skill's actual text already matched what was being asked for.

## IL-24 — Design-doc claims about unchanged behavior

Don't assert in a design doc or plan how existing, unchanged code or prose currently behaves without grepping the literal text at design time — a paraphrased summary can be wrong in ways every task-scoped review will trust rather than re-derive. The journey-health tier-improvements design doc claimed `validate-findings --tier deep` "still runs... via the same call already in use," but the actual unchanged `SKILL.md` gating only ran that call when the findings array was non-empty — the claim went unchecked against the literal file, and the resulting deep-tier-starvation bug survived all 4 task reviews until the final whole-branch review traced the real control flow.

## IL-25 — New force-select phases in a rotation selector

Don't add a new force-select phase to a rotation-based selector (like `scope.js`'s `selectTarget`) without checking whether it needs its own within-batch exclusion — a phase that ignores cursor state (because the signal it checks, e.g. file existence, isn't cursor-tracked) will repeat the same pick on every slot of a `--budget > 1`-style multi-target call, since the caller's usual cursor-bump-between-picks trick never reaches it. Caught during journey-health's deletion-force-select plan-writing, before any code existed, by tracing the `--budget` loop's interaction with the new phase by hand.

## IL-26 — Sibling-repo cd vs. the worktree policy gate

Don't assume `cd`-ing to a sibling repo inside a Bash command changes which project's `worktree.always` policy applies — the PreToolUse gate resolves the target project from the session's tracked/pinned cwd, not the executed command's actual `cd` target, so a git commit correctly landing in an unrelated sibling repo (e.g. mirroring a version bump into `claude-tweaks-marketplace`) still gets denied, citing this repo as "currently working in." Workaround until the gate is fixed (tracked as a GitHub issue): `EnterWorktree` for *this* repo first (which does update the session's tracked location) — the sibling-repo commit, still reached via an in-command `cd`, then passes.

## IL-27 — Prose inserted next to a fenced code block

Don't trust a markdown edit that inserts prose next to a fenced code block by reading the result — verify the fence still closes where it should, especially when the edit instruction is phrased as "immediately after this code block." A misplaced sentence can land *inside* the fence, turning documented English into shell input that breaks the snippet when copy-pasted and run literally. Caught only because a task reviewer extracted the fenced block and ran it as a shell script instead of just reading the diff (the github-issues-consistency-pass program's Task 10, `github-pr-scan.md`).


**Recurrence (this session), prose variant.** A new paragraph inserted into `/wrap-up` Step 6.1 landed mid-sentence, leaving the unrelated tail "Route improvement ideas to a new backlog record..." dangling off the end of it as though it were part of the incident-account discipline being added. The diff applied cleanly and read correctly hunk-by-hunk; the break was visible only when reading the rendered section end to end.
## IL-28 — Removal sweeps that do not exclude the plan itself

Don't write a plan's own "prove the removed pattern is gone" verification sweep without excluding the plan document itself — a plan documenting the removal of text X necessarily quotes X verbatim in its before/after blocks, so a repo-wide grep for X catches the plan's own instructional content unless it's added to the exclusion list. Bit the drop-Artifact-tool-dependency plan's Task 3 Step 7 sweep, whose 3-item exclusion list forgot the plan file itself — caught by the task reviewer, not by plan-authoring self-check.

## IL-29 — Sibling tasks rediscovering a known bug

Don't wait for each task in a set of near-identical repeated tasks (e.g. N parallel skill migrations) to independently rediscover a bug an earlier sibling task's review already found — patch the plan's remaining tasks before dispatching them. In the health-state-durable-storage session, patching Tasks 6/8's briefs for two bugs Task 4's review found meant Task 8 passed review with zero findings.

## IL-30 — Eagerly-invoked IIFEs in test doubles

Don't build a test-double helper (e.g. a `fakeRunner`) whose `returns`/`throws` fields are eagerly-invoked IIFEs computed once at array-literal construction time — make them functions called lazily per matching invocation instead. An eager IIFE fires its side effects/throws before the code under test ever runs, producing a test that looks plausible but proves nothing (or throws during setup instead of during the intended scenario).

## IL-31 — Optional state slices inferred from truthiness

Don't infer whether an optional per-consumer state slice exists (e.g. a cache tier only one of several consumers uses) from runtime truthiness of an always-present default object — gate it via an explicit flag decided once at construction. Bit `durable-state.js`'s `remembered.json`: every consumer's default read returned a truthy `{}`, so without an explicit `includeRemembered` flag, every consumer would silently get the file written, not just the one that opted into that tier.

## IL-32 — "Duplicate across N consumers" framing

Don't accept a plan's "duplicate this across N≥2 near-identical consumers, no shared module exists yet" framing as final — extract the shared logic anyway. In the health-state-durable-storage session, extracting `retry-cli.js` instead of duplicating retry-queue CLI code across 3 skills meant 3 real bugs in that logic got fixed once, not three times.

## IL-33 — materialize.md ordering under worktree.always

Don't assume `flow/materialize.md`'s documented ordering (write + commit the materialized record on the current branch, *then* branch the worktree from that now-updated HEAD) works once a project sets `worktree.always: true` — the same PreToolUse gate that requires a worktree for every edit (`bin/lib/hooks/pre-tool-use.js`'s `checkWorktreeRequired`) denies `Edit`/`Write`/`NotebookEdit`/`git commit` in the main checkout unconditionally, with no exemption for pipeline bookkeeping (confirmed by direct experimentation: writing `config.yml`/`decisions.md`/the materialized spec file to the main checkout was denied outright). Adaptation that works: create the worktree first from current HEAD, then do the run-dir scaffolding and the materialized-record commit *inside* it as the branch's first commit — functionally equivalent, just landing on the worktree branch instead of pre-existing on `main`. `git merge` is NOT gated by this check (`gitTargets` only recognizes literal `commit`/`push` subcommands, not `merge`) — `git push` now IS gated the same way `git commit` is (the blanket gate checks `t.action === 'commit' || t.action === 'push'`), but a push from inside the linked worktree itself is still allowed (`isLinkedWorktree` short-circuits to allow), so the eventual merge/push back into the main checkout is unaffected — only the pre-worktree write step needs the adaptation. `materialize.md`/`build/worktree-setup.md` still describe the pre-`worktree.always` ordering; reconciling their prose with this is unscoped follow-up, not fixed here. Don't chain the merge-then-push into one `git merge --ff-only <branch> && git push` Bash call from the main checkout either, even though `git merge` alone is ungated — the PreToolUse hook inspects the whole command string and denies the entire invocation before either part runs, so the ungated merge never happens either. Issue them as two separate Bash calls: `git merge --ff-only <branch>` in the main checkout, then `git push` from inside the linked worktree itself (confirmed by direct experimentation, twice, in the same session).

## IL-34 — File-path grep exclusions written as content substrings

Don't write a repo-wide grep exclusion for a *file* as a bare content substring (e.g. `grep -v "path/to/file.js"`) — it excludes any line whose *content* happens to mention that path, not just lines *from* that file, silently swallowing a real cross-file hit whose own prose cites the excluded file by name. Anchor to the file-path position instead (`grep -v "^path/to/file.js:"`, or `grep -rln ... | grep -v "^path/to/file.js$"`). Bit a retirement precondition check in the assess-agent-autonomy build: a live cross-file dependency was silently excluded because the file being retired was cited by name inside an unrelated file's own explanatory sentence.

## IL-35 — Data-shape fixes approved by re-reading

Don't approve a fix to a data-shape/destructuring bug by re-reading the corrected code and confirming it looks right — a typo in property names (right shape, wrong names) reads as plausible but is silently wrong. Execute the corrected code against the real dependency and inspect the actual output before approving. Bit two fixes in the assess-agent-autonomy build: a `.txt`-written/`.json`-read data-flow mismatch, and a `{risk, effort}` destructured from a function that returns `{riskTier, effortTier}` — both looked fixed on paper and were only confirmed broken, then genuinely fixed, by running the real module.

## IL-36 — Design-mode build artifacts at wrap-up

For a design-mode build (brainstorm → design doc → writing-plans → SDD, skipping `/specify` entirely), keep the design doc and plan under `docs/superpowers/specs/`/`docs/superpowers/plans/` as permanent historical record at wrap-up — don't delete them per-build. This differs from the legacy spec-file flow, where `/specify` consumes and deletes the design doc; direct design-mode builds have no such consumption step. This archive can still be periodically pruned in bulk as a separate, deliberate maintenance action once it's grown large enough to be noise itself (see ADR-0007) — recent/in-progress docs and `docs/decisions/` ADRs are excluded from any such prune.

## IL-37 — Same-directory / near-identical paths in bulk operations

Don't assume two paths/files sharing a directory or a near-identical name belong to the same category — verify each against live cross-references before a bulk delete/rename touches it. Bit a historical-docs cleanup twice: `specs/INBOX.md`/`DEFERRED.md`/`INDEX.md` sit in the same directory as the numbered specs being bulk-deleted but are live mechanism files still read/written by `/init`, `/build`, `/wrap-up` today; and `docs/plans/` (live ephemeral pipeline state — briefs/ledgers/caches `/wrap-up` deletes on completion) was nearly bundled into the same bulk-delete scope as the near-identically-named `docs/superpowers/plans/` (the actual historical archive) before the distinction was caught mid-execution.

## IL-38 — Plan-embedded classifiers unverified against source

Don't write a plan-embedded classifier or pattern-list (e.g. regex categories meant to match an existing skill file's vocabulary) without verifying every entry against that file's literal text at plan-authoring time. The unattended-tier plan's floor-check predicate included a pattern that actively matched a reason `ledger/resolve-gate.md` explicitly lists as illegitimate to defer on — caught only at task-review time, costing a fix round that source-verification during planning would have avoided.

## IL-39 — The leading-dot-slash grep exclusion that never matches

Don't write a `grep -rli PATTERN . | grep -v "^./path/to/file"` exclusion expecting the `./` prefix to match — `grep -rli PATTERN .` in this shell environment returns paths *without* a leading `./` (e.g. `skills/foo/SKILL.md`, not `./skills/foo/SKILL.md`), so a `^./`-anchored exclusion silently excludes nothing at all, every time, regardless of content. Anchor to the bare relative path instead (`grep -vE "^(skills/foo/SKILL\.md)$"`). Bit a sibling-file sweep's own exclusion list in the docs-health-expansion-wrapup-templates build — harmless there only because the sweep was already framed as a judgment task and the extra false-positive matches got correctly judged as already-correct, but a future sweep that trusts the exclusion's silent "success" (zero output) as proof of "nothing left to fix" would be wrong.

## IL-40 — Restated cardinalities

Don't restate a list's cardinality as a literal number in prose (e.g. "8-lever", "17 core labels", "two-item enumeration") — when the underlying list's size changes elsewhere, the number silently desyncs, and no single keyword grep catches every differently-worded restatement (`8-lever` vs. `lever count` vs. `two-item` vs. `three-item`). Recurred 8+ times across 6+ specs in one 8-week window, including one build that hit it 3 times on its own. Prefer describing the count by reference ("see the table below") over hardcoding it; if a literal count must appear in prose, treat any cardinality-changing edit as obligated to grep broadly for numeric restatements of that list, not just the old keyword.

## IL-41 — "Related file changed" as evidence work remains

Don't trust an automated recommendation that infers "still needs action" from "a related file changed" — the change itself may already be the resolution, not just a signal to re-investigate. `/tidy`'s Shape 2 heuristic recommended Promote for a parked flaky-test record purely because its watched path had a matching commit since parking; that commit had actually already fixed the described flaky test, so Promote would have run `/claude-tweaks:specify` on work that was already done. Read the matching commit's own diff/message before trusting the recommendation — a touched path is evidence to look again, not evidence the problem is solved.

## IL-42 — git commit and the whole staged index

Don't assume `git add <specific-files> && git commit -m "..."` only commits those files — `git commit` with no pathspec commits the *entire staged index*, including anything staged earlier by a different, unrelated step. Splitting a large uncommitted diff into several logical commits requires verifying `git diff --cached --name-only` immediately before each `git commit`, not just running `git add` with the intended file list. Bit a 13-commit split during the code-health dogfooding fix pass: an already-staged `tier.js` deletion (from an earlier, unrelated fix) silently rode along in the first commit meant to be scoped to unrelated skill-doc fixes, caught only because the commit's own file-change count didn't match expectations.

## IL-43 — Parallel agents racing the git index

Don't dispatch multiple separate implementer subagents in parallel and assume file-disjointness alone makes it safe — each agent's own `git add`+`git commit` sequence races on the same worktree's shared git index, and one agent's commit can sweep in another's concurrently-staged files if their windows overlap. Sequence dispatches until a prior batch's commit has actually landed, and verify `git status --short` shows only the expected files immediately before `git add` in every dispatch prompt — only parallelize once file-disjointness *and* a completed prior commit are both confirmed.

## IL-44 — Merge conflicts against an upstream structural refactor

Don't resolve a merge conflict against an upstream *structural* refactor (a file split into new file(s)) by picking a side — the branch's own content still sitting in the old location needs to be re-homed into the refactor's new location(s), not merged in place. Take upstream's structure wholesale, verify byte-identity (`diff <(git show <upstream>:<file>) <file>`), then manually re-apply the branch's own additions into their new file(s). Bit the lifecycle-ceremony-tiering merge: `main` split README.md's changelog into `CHANGELOG.md` and its skills table into `docs/getting-started.md` mid-branch; a plain conflict-side-pick would have silently dropped this branch's own README edits instead of relocating them.

## IL-45 — ExitWorktree's commit-count refusal

Don't take `ExitWorktree`'s commit-count refusal ("N commits... discard permanently") at face value when the worktree branch was already merged/fast-forwarded into `main` — the check counts commits against the branch's original fork point, not `main`'s current tip, so it warns even when nothing would actually be lost. Verify `git rev-parse HEAD` is identical on both the worktree branch and `main` before overriding with `discard_changes: true`.

## IL-46 — Gitignored scratch files destroyed by worktree cleanup

Don't let a gitignored SDD/scratch tracking file (a progress ledger, a deferred-findings tracker) sit unresolved through worktree cleanup — `ExitWorktree action: "remove"` (or `git worktree remove`) deletes it permanently along with the worktree, since it was never committed, and there is no git history to recover it from. Surface its content to the user (or commit the durable parts as a proper record) *before* running cleanup, not after. Bit a `.superpowers/sdd/beyond-scope-discoveries.md` file explicitly flagged "decision pending at the next checkpoint" — recoverable only because its content still happened to be in the assistant's own conversation context that session.

## IL-47 — git --since boundaries from a zero timestamp

Don't compute a git `--since` boundary from a possibly-zero timestamp with `.toISOString().slice(0, 10)` — it produces the literal string `"1970-01-01"`, and `git log --since=1970-01-01` silently returns zero commits in positive-UTC-offset timezones. The seemingly-obvious fix, `--since=@<seconds>`, is itself broken for small `N` — git's approxidate parser treats it as relative-to-now, not absolute, so it silently degrades after any wall-clock delay rather than failing loudly. Use a full ISO 8601 datetime string (`.toISOString()`, not `.slice(0, 10)`) instead. Bit `journey-health`/`docs-health`/`harness-health`'s `domainChurn` in 3 files before being caught by full-suite tests run under load; verified via deliberately backdated commits (`GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`), not same-instant commits — a same-instant test passed even against the broken `@<seconds>` variant.

## IL-48 — Implementer subagents whose connection dies mid-task

Don't redo an SDD task from scratch when an implementer subagent's connection dies mid-task (e.g. "API Error: Connection closed mid-response") after it applied an edit but before committing or reporting — this failure mode falls outside the four documented statuses (DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED). Verify the edit is present and correct via `git diff` first, then dispatch a recovery agent to verify-and-commit against the original brief, rather than re-running the task fresh.

## IL-49 — Backtick nesting in a literal verbatim message

Don't wrap an entire literal message a skill is meant to report verbatim in single backticks when that message itself contains an inline term also meant to be backtick-quoted — the nesting doesn't escape; it silently splits into multiple disconnected code spans instead of one, breaking the rendered instruction. Use a blockquote for the literal message instead, reserving backticks for individual terms inside it. Caught only by a deliberate second read-through before committing, not by any test — this is prose, not code.

## IL-50 — New helpers that fail in the opposite direction to their sibling

Don't add a new verification/gating/resolver helper alongside an existing sibling with established fail-safety behavior without explicitly checking — and testing — that the new helper fails in the *same direction* on ambiguous/malformed input (toward more scrutiny, not less). `resolveRefutation` (`bin/lib/coordination.js`), added as a sibling to `resolveDebate`, initially resolved any non-`'refuted'` verdict — including an empty or malformed one from a failed/`BLOCKED` dispatch — straight to `'confirmed'`, the opposite of `resolveDebate`'s fail-toward-`'contested'` default. It passed its own tests, which only covered the two expected literal values, and was caught only because `/review`'s error-handling lens ran as a reproduction pair. "Looks similar to its sibling" is not the same as "fails the same way as its sibling" — check explicitly, and add a test for the malformed/missing-input case, not just the happy path.

## IL-51 — Git access for wide parallel fan-out

Don't give parallel implementer agents git access when the fan-out is wide (many agents, many files) — dispatch them edit-only and run every git operation (add/commit/push) centrally, in one process, after all agents finish. This removes the shared-git-index race entirely rather than just reducing it via careful sequencing (the mitigation above); a 33-agent parallel skill-fix pass used this successfully with zero git races.

## IL-52 — Batches of agents each fixing the same shared concern

Don't treat a batch of parallel agents each fixing the same shared/cross-cutting concern (e.g. independently closing an identical documented gap) as done once each agent's own diff looks right — agents in the same batch can't see each other's edits, so N agents can each correctly fix the same thing while leaving stale cross-references claiming the others still haven't. Grep for the specific claim/pattern each agent might have restated post-fix as part of centralized verification; three health-sweep skills each closed the same gap in one batch and each documented the other two as still open.

## IL-53 — Findings naming a sibling skill

Don't scope a parallel audit's per-skill findings array to only the skill under audit when a finding's own text names a sibling skill/file as having the identical issue — split it into its own finding entry under each named skill at audit time. A footnote mentioning "X has the same bug" inside skill A's finding never reaches skill X's own fix agent, since each agent only receives its own skill's findings array; this nearly shipped an unfixed duplicate bug and was only caught by a separate adversarial code-review pass.

## IL-54 — Tool-deny guards on SDK optional fields

Don't write a tool-deny guard keyed off an SDK-typed optional field by checking only its explicit-`true`/explicit-`false` values — read the field's own doc comment for what it defaults to when *omitted*. The Claude Agent SDK's `AgentInput.run_in_background` defaults to `true` (background) when omitted, not just when set explicitly; `evals/actor.js`'s guard originally checked `=== true` only, silently allowing the omitted case straight into the hang it existed to prevent. Passed its own task review; caught only by an unrelated follow-up investigation.

## IL-55 — "Expect no output" greps for renumbering tasks

Don't write a plan-verification grep for a renumbering/rename task expecting "no output" once the operation completes — after a genuine renumber, the new numbers/names are legitimate current content, not remnants of the old ones, so a bare presence-check can't signal staleness either way. Verify topic-consistency instead (does the surrounding text's subject match the number it's now under). Bit the `/init` Cloud/Routine Parity Setup renumbering plan's own two separate verify steps — caught by task review the first time, proactively corrected before it could recur the second.

## IL-56 — Design-doc file-touch lists lost in the plan

Don't assume a design doc's own explicit file-touch list survives intact into the plan it feeds — task-scoped review can't catch an item the design doc named that the plan never scheduled a task for; only whole-branch review does. The `/init` Cloud/Routine Parity Setup design doc flagged a specific stale-range-text edit in its own file-touch list; the plan omitted it, and it shipped unfixed until final review caught it. Cross-check the plan's task list against the design doc's own enumerated files at plan-authoring time.

## IL-57 — Features that document a failure instead of closing it

Don't scope a feature meant to prevent an empirically-observed failure to only document that failure as a caveat — check at design time whether the feature actually closes the loop it exists for, not just narrates around it. `/init`'s Cloud/Routine Parity Setup step was built specifically because a branch mismatch cost a real investigation three PR-promotion rounds, yet the first shipped version only added a static prose caveat about branch mismatch, with no detection — caught only by a follow-up question after the work was already merged.

## IL-58 — Raw git worktree remove on an EnterWorktree worktree

Don't run raw `git worktree remove` on a worktree created via `EnterWorktree` — it fails with "cannot remove a locked working tree" (harness-managed lock, not a plain git worktree), even though `superpowers:finishing-a-development-branch`'s own documented cleanup procedure only shows the raw git form. Use `ExitWorktree` instead; verify `git rev-parse HEAD` matches on both the worktree branch and the branch it merged into before passing `discard_changes: true`.

## IL-59 — The marketplace-mirror half of a release

Don't stop to ask before completing the marketplace-mirror half of a release — the Releasing section above already authorizes both repo pushes as one action ("a release touches **both** this repo and the separate marketplace repo"). Pausing after only bumping `plugin.json` turns one documented step into two turns and risks the mirror silently never happening if the follow-up reply is a bare "yes" with no restated specifics. Bumped `plugin.json` to 6.17.0, pushed, and only flagged the marketplace mirror as a question afterward — costing an extra round-trip for a step the file already pre-authorizes.

## IL-60 — New subsections in a dispatcher-inlined fragment

Don't assume a new subsection added to a dispatcher-inlined `_shared/*.md` fragment is reachable by a consumer just because it's documented there — each consumer's own "what the dispatcher inlines" enumeration sentence must also name it, or the instruction never reaches the dispatched agent and silently no-ops. `record-queue-fetch.md` gained a new Threshold resolution subsection, but neither `/help`'s nor `/tidy`'s own inlining sentence named it; every task-scoped review missed it, and only the final whole-branch review caught it.

## IL-61 — Display names derived from statusline workspace paths

Don't derive a *display* project/repo name from Claude Code's statusline `workspace.project_dir`/`workspace.current_dir` JSON fields by taking their basename directly — `EnterWorktree` pivots both fields to the worktree's own path once inside it, so the naive basename shows the worktree folder instead of the real project (distinct from using `input.cwd` as an *execution* directory, e.g. `bin/hooks.js`, which is correctly worktree-scoped and needs no such resolution). When a directory-derived name must survive being inside a linked worktree, detect it first (a linked worktree's `.git` is a plain file, not a directory) and resolve through `git rev-parse --git-common-dir`'s parent instead. Bit `bin/claude-tweaks-statusline.js`'s project segment, which showed the worktree branch name instead of the repo name.

## IL-62 — Tests whose oracle mirrors the implementation

Don't assert an end-to-end test's expected value by computing it the same way the implementation does, from the same live environment (e.g. `path.basename(process.cwd())` as both the oracle and, transitively, the implementation's own input) — such a test can't distinguish "correct" from "matches current behavior," and will pass right through a bug that happens to make both sides wrong identically, only breaking once the bug is *correctly* fixed. Derive the expected value independently (a separately-computed reference, or a fixture with a known-correct answer) instead. Caught in `tests/statusline.test.js`'s "project segment is always present" test, which asserted against live `process.cwd()` and had been silently encoding the worktree-name bug above as "passing" the whole time.

## IL-63 — MCP tools from a spawned subprocess

Don't design a module assuming MCP tools can be called from a spawned subprocess (`execFileSync`, a child process) — they're only invocable from the calling agent's own turn. A module that shells out to do its own network I/O must signal what needs writing and let the calling skill's own prose drive the actual MCP call, not attempt it itself. Bit the gh-CLI/MCP-fallback design's first draft, which assumed `durable-state.js` could call MCP tools directly — caught mid-plan-writing, not free to fix.

## IL-64 — Assuming one consumer's call topology generalizes

Don't assume one consumer's call topology generalizes to a similar-looking sibling when designing shared cross-cutting infrastructure — verify each consumer's actual invocation shape before drafting the plan. The gh-CLI/MCP-fallback design assumed dispatch's step-orchestrated claim mechanism matched the four health skills' single opaque CLI invocation; it didn't, twice, before the real topology was traced.

## IL-65 — Same-function self-inconsistency

Don't assume task-scoped review catches every producer/consumer mismatch — it structurally can't catch a same-function self-inconsistency (a new branch added to a function without checking that a later unconditional statement in that SAME function already owns the same output channel) or documented retry-procedure prose whose literal instructions ("re-run X from scratch") silently undo their own precondition via a code side-effect the prose author never traced. Both bit the gh-CLI/MCP-fallback branch's final whole-branch review (a `needsMcpWrite` signal racing an existing unconditional stdout write in the same function; a retry procedure that silently discarded findings by re-triggering finding-discovery's own caching side effect).

## IL-66 — Single-line greps against hard-wrapped prose

Don't write a plan-verification grep pattern as a single-line literal string match when checking prose in a markdown file — hard-wrapped source text can split the target phrase across two lines (e.g. "the MCP write" / "path's retry loop"), so a literal multi-word grep silently returns zero matches while the phrase is still very much present. Prefer a whitespace-flexible pattern, or grep for one distinctive single word and manually judge the hits. This let a stale cross-reference to a deleted module/section survive an explicit "prove it's gone" verification step in the durable-state git-native write path build (`skills/_shared/health-state.md` still described `retry-durable-write.js` and pointed at a deleted "MCP write path" section, because `grep -rn "HEALTH_STATE_MCP_PENDING_WRITE\|MCP write path" skills/` couldn't match "MCP write\n  path" split across a line wrap).

## IL-67 — Assuming a list action paginates

Don't assume a session tool's REST-style `list` action paginates the way a typical API would — verify against the tool's own schema whether a cursor/limit/page parameter actually exists before designing a filter around it. `RemoteTrigger {action: "list"}` returns only its first page with no pagination parameter exposed at all; a repo-URL-matching filter built on top of it silently missed 2 of 6 real routines on the very first live account tested (`memenu-io/memenu-app`), confirmed via the live sidebar showing more routines than the API call ever returned. When a tool-backed lookup can't enumerate its own domain completely, prefer a locally-recorded enumeration (a file this project's own tooling already wrote) as a first-class resolution source alongside the tool call, not just a documented caveat.

## IL-68 — New resolution sources vs. existing bypass flags

Don't add a new resolution source to an existing multi-source lookup without auditing every existing bypass/override flag's own "skip these sources" enumeration — a flag that explicitly names sources by identity (not by reference to "all sources") silently stops skipping the new one, since it was written before that source existed. This is a control-flow regression, not a stale-prose one: `--refresh-environment`'s whole purpose is forcing a clean re-resolution, but its own "skip the cache and `list` sources too" text never mentioned the project-local-records source added later in the same file — so the flag silently re-resolved the very value it exists to override, on any project that had already run `create` once. Caught only on the third whole-branch re-review pass of the cloud-routine-environment-freshness branch, after the new source had already survived two earlier fix rounds.

## IL-69 — Unresolved fate of billed infrastructure a procedure creates

Don't leave "what happens to the artifact this step creates" unresolved when designing a browser-automation procedure that produces real, billed, hard-to-delete infrastructure (a cloud environment, a scheduled routine, an account resource with no delete API) — decide at design time whether it's the caller's real deliverable or a throwaway needing explicit cleanup, and verify the answer against the actual UI's available actions (a "no delete API" tool constraint doesn't mean the web console has no delete affordance either — it usually does). The cloud-routine-environment-freshness branch's guided-environment-creation flow left this implicit through brainstorming and shipped a throwaway-routine design that passed its own task-scoped review; live testing during that same task found the orphaned-routine risk, and fixing it required reopening two already-reviewed tasks' files mid-execution.
## IL-70 — Health-skill CLIs write durable shared state when run with real arguments

While testing the new `intent: "remove"` finding shape end to end, `node bin/harness-health.js validate-findings <file> --target CLAUDE --kind claude-md` was run with real arguments. The invocation looks like local validation, but `durable-state.js` fetched and updated the shared `health-state` branch on origin as a side effect — creating harness-health's five state files from scratch (`cursors.json`, `runs.json`, `declined.json`, `remembered.json`, `retry-queue.json`) and stamping a `claude-md:CLAUDE` cursor with `lastAuditedMs` set to now. With `STALE_DAYS = 90` (`bin/lib/harness-health/score.js`), the rotation then believes CLAUDE.md was audited that day and will not re-select it for up to a quarter — suppressing precisely the CLAUDE.md check the same session had just built. It also wrote `.claude-tweaks/harness-health/cache.json` locally, which a subsequent `git add -A` staged, because only `code-health/`'s cache directory was gitignored at the time. Nothing in the command signals this: the push was discovered only by reading the command's own stdout, where a `To https://github.com/... -> health-state` line sat among ordinary validation output.
